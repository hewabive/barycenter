import assert from "node:assert/strict";
import { test } from "node:test";
import { forceReportFor, issue, step, viewFor } from "../src/index.ts";
import { fresh, neutralNeighbor, ownNeighbor, run } from "./support.ts";

test("force that no front asks for rests in its base", () => {
  const { state, home } = fresh();
  const report = forceReportFor(state, 0);
  const muster = report.musters[home];
  assert.ok(muster);
  assert.equal(report.arming, true);
  assert.equal(muster.garrison, state.constants.startForce);
  assert.equal(muster.front, 0);
  assert.equal(muster.reserve, 0);
  assert.deepEqual(muster.routes, []);
  assert.deepEqual(muster.duties, []);
  assert.deepEqual(report.battles, []);
});

test("a report covers only the regions and battles of its power", () => {
  const { state, home } = fresh();
  const report = forceReportFor(state, 0);
  report.musters.forEach((muster, region) => {
    const held = state.map.regions[region].cells.some((cell) => state.cells[cell].owner === 0);
    assert.equal(muster !== null, held);
  });
  assert.equal(forceReportFor(state, 1).musters[home], null);
});

test("force away from home is a reserve routed to a base with room", () => {
  const { state, capital, home } = fresh();
  const away = ownNeighbor(state, capital);
  state.cells[capital].force = 0;
  state.cells[away].force = 3;
  const report = forceReportFor(state, 0);
  const muster = report.musters[home];
  assert.ok(muster);
  assert.equal(muster.garrison, 0);
  assert.equal(muster.reserve, 3);
  assert.deepEqual(muster.routes, [{ region: home, amount: 3 }]);
});

test("a muster names the orders its front force serves", () => {
  const { state, home } = fresh();
  const { from, to } = neutralNeighbor(state, 0);
  const pressed = state.map.cells[to].region;
  const staging = state.map.cells[from].region;
  const attacking = forceReportFor(
    step(state, [{ kind: "pressure", power: 0, region: pressed, target: null, active: true }])
      .state,
    0,
  );
  const duties = attacking.musters[staging]?.duties ?? [];
  const attack = duties.find((duty) => duty.power === 0 && duty.region === pressed);
  assert.ok(attack);
  assert.equal(attack.target, null);
  assert.ok(attack.need > 0);

  state.cells[to].owner = 1;
  state.cells[to].force = 4;
  const defending = forceReportFor(
    step(state, [{ kind: "pressure", power: 1, region: home, target: 0, active: true }]).state,
    0,
  );
  const muster = defending.musters[home];
  assert.ok(muster);
  const defense = muster.duties.find((duty) => duty.power === 1 && duty.target === 0);
  assert.ok(defense);
  assert.equal(defense.region, home);
  assert.ok(defense.need > 0);
  assert.ok(muster.need >= defense.need - 1e-9);
});

test("a muster accounts for all the force of a holding", () => {
  const { state, home } = fresh();
  const { to } = neutralNeighbor(state, 0);
  const pressed = state.map.cells[to].region;
  const after = run(state, 80, [
    { kind: "garrison", power: 0, region: home, value: 4 },
    { kind: "pressure", power: 0, region: pressed, target: null, active: true },
  ]);
  const view = viewFor(after, 0);
  const report = forceReportFor(after, 0);
  let seen = 0;
  for (const region of view.regions) {
    const muster = report.musters[region.id];
    assert.equal(muster !== null, region.estate !== null);
    if (region.estate === null || muster === null) {
      continue;
    }
    const mine = region.holdings?.find((holding) => holding.owner === 0);
    assert.ok(mine);
    assert.ok(Math.abs(muster.garrison + muster.front + muster.reserve - mine.force) < 1e-9);
    assert.ok(muster.garrison <= region.estate.quarters + 1e-9);
    assert.ok(muster.front <= muster.need + 1e-9);
    seen += mine.force;
  }
  assert.ok(seen > 0);
});

test("a battle lists the pressed cells with their defense and the pressure on them", () => {
  const { state } = fresh();
  const { from, to } = neutralNeighbor(state, 0);
  const pressed = state.map.cells[to].region;
  state.cells[from].force = 20;
  const after = step(state, [
    { kind: "pressure", power: 0, region: pressed, target: null, active: true },
  ]).state;
  const battles = forceReportFor(after, 0).battles;
  assert.equal(battles.length, 1);
  const [battle] = battles;
  assert.deepEqual([battle.power, battle.region, battle.target], [0, pressed, null]);
  const siege = battle.sieges.find((known) => known.cell === to);
  assert.ok(siege);
  assert.equal(siege.defense, state.constants.neutralDefense);
  assert.equal(siege.bare, siege.defense);
  assert.ok(siege.contacts >= 1 && siege.limit > siege.defense);
  assert.ok(siege.pressure > siege.defense);
  assert.ok(siege.facing >= siege.pressure - 1e-9);
  assert.ok(siege.progress > 0 && siege.rate > 0);
  assert.ok(battle.attackerLoss > 0);
  assert.equal(battle.defenderLoss, 0);
  for (const known of battle.sieges) {
    assert.equal(after.cells[known.cell].owner, null);
    assert.equal(state.map.cells[known.cell].region, pressed);
  }
});

test("force too weak for a neutral cell faces it without pressing", () => {
  const { state } = fresh();
  const { from, to } = neutralNeighbor(state, 0);
  const pressed = state.map.cells[to].region;
  for (const cell of state.cells) {
    if (cell.owner === 0) {
      cell.force = 0;
    }
  }
  state.cells[from].force = 1;
  const ordered = issue(state, [
    { kind: "pressure", power: 0, region: pressed, target: null, active: true },
  ]).state;
  const [battle] = forceReportFor(ordered, 0).battles;
  const faced = battle.sieges.filter((siege) => siege.facing > 0);
  assert.equal(faced.length, 1);
  assert.equal(faced[0].facing, 1);
  assert.ok(faced[0].facing < faced[0].defense);
  assert.ok(ordered.map.links[faced[0].cell].some((link) => link.cell === from));
  assert.ok(battle.sieges.every((siege) => siege.pressure === 0));
  assert.ok(battle.sieges.some((siege) => siege.cell === to));
});

test("force that touches several pressed cells is counted once", () => {
  const { state } = fresh();
  const { to } = neutralNeighbor(state, 0);
  const pressed = state.map.cells[to].region;
  const after = run(state, 30, [
    { kind: "pressure", power: 0, region: pressed, target: null, active: true },
  ]);
  const [battle] = forceReportFor(after, 0).battles;
  assert.ok(battle);
  const origins = new Set<number>();
  let contacts = 0;
  let facing = 0;
  for (const siege of battle.sieges) {
    assert.ok(siege.facing >= siege.pressure - 1e-9);
    contacts += siege.contacts;
    facing += siege.facing;
    for (const link of after.map.links[siege.cell]) {
      if (after.cells[link.cell].owner === 0) {
        origins.add(link.cell);
      }
    }
  }
  const standing = [...origins].reduce((sum, cell) => sum + after.cells[cell].force, 0);
  assert.ok(contacts > origins.size);
  assert.ok(standing > 0);
  assert.ok(Math.abs(facing - standing) < 1e-9);
});

test("a battle against a power is reported to it from the announcement on", () => {
  const { state } = fresh();
  const { from, to } = neutralNeighbor(state, 0);
  const attacked = state.map.cells[from].region;
  state.cells[to].owner = 1;
  state.cells[to].force = 30;
  const order = { kind: "pressure", power: 1, region: attacked, target: 0, active: true } as const;

  const announced = step(state, [order]).state;
  const waiting = forceReportFor(announced, 0).battles;
  assert.equal(waiting.length, 1);
  assert.ok(waiting[0].sieges.length > 0);
  for (const siege of waiting[0].sieges) {
    assert.equal(siege.pressure, 0);
    assert.equal(siege.rate, 0);
  }
  assert.deepEqual(forceReportFor(announced, 2).battles, []);

  const fought = run(state, state.constants.announceTicks + 2, [order]);
  const [battle] = forceReportFor(fought, 0).battles;
  assert.ok(battle);
  assert.deepEqual([battle.power, battle.region, battle.target], [1, attacked, 0]);
  assert.ok(battle.sieges.some((siege) => siege.pressure > 0));
  assert.ok(battle.attackerLoss > 0);
  for (const siege of battle.sieges) {
    assert.equal(fought.cells[siege.cell].owner, 0);
    assert.ok(siege.contacts >= 1 && siege.limit > 0);
    assert.ok(siege.bare <= siege.defense);
  }
});
