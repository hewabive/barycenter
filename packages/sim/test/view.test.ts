import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorld, NEUTRAL, outlineOf, step, UNSEEN, viewFor } from "../src/index.ts";
import { fresh, neutralNeighbor, ownNeighbor, run } from "./support.ts";

test("a view hides what the power has not explored", () => {
  const state = createWorld({ seed: 1 });
  const view = viewFor(state, 0);
  const home = state.map.cells[state.powers[0].capital].region;
  const near = new Set([home, ...state.map.neighbors[home].map((neighbor) => neighbor.region)]);

  for (const region of view.regions) {
    assert.equal(region.nature !== null, near.has(region.id));
    assert.equal(region.holdings !== null, near.has(region.id));
    assert.equal(region.estate !== null, region.id === home);
  }
  state.map.cells.forEach((cell, id) => {
    const seen = near.has(cell.region);
    assert.equal(view.cells.owner[id] !== UNSEEN, seen);
    assert.equal(view.cells.ground[id] !== 0, seen);
  });
});

test("a shared region lists every holder with its part", () => {
  const { state } = fresh();
  const { to } = neutralNeighbor(state, 0);
  state.cells[to].owner = 1;
  state.cells[to].force = 4;
  const region = state.map.cells[to].region;
  const seen = viewFor(state, 0).regions[region];
  assert.ok(seen.holdings);
  const total = seen.holdings.reduce((sum, holding) => sum + holding.cells, 0);
  assert.equal(total, state.map.regions[region].cells.length);
  const rival = seen.holdings.find((holding) => holding.owner === 1);
  assert.ok(rival);
  assert.equal(rival.cells, 1);
  assert.equal(rival.force, 4);
  assert.ok(rival.contact >= 1 && rival.reach > 0);
});

test("a view never exposes the stockpile and orders of another power", () => {
  const { state } = fresh();
  const foreign = state.map.cells[state.powers[1].capital].region;
  state.powers[0].explored[foreign] = true;
  const { to } = neutralNeighbor(state, 0);
  state.cells[to].owner = 1;
  const view = viewFor(step(state, []).state, 0);
  assert.equal(view.regions[foreign].estate, null);
  for (const flow of view.flows) {
    const joint = state.map.joints[flow.joint];
    assert.equal(state.cells[joint.a].owner, 0);
    assert.equal(state.cells[joint.b].owner, 0);
  }
  assert.equal(view.cells.owner[to], 1);
  assert.ok(view.cells.owner.includes(NEUTRAL));
});

test("natural data stays known after the region is lost from sight", () => {
  const { state, home } = fresh();
  const far = state.powers[0].explored.findIndex((explored) => !explored);
  state.powers[0].explored[far] = true;
  const view = viewFor(step(state, []).state, 0);
  assert.notEqual(view.regions[far].nature, null);
  assert.equal(view.regions[far].holdings, null);
  assert.notEqual(view.regions[home].estate, null);
});

test("an announced attack is visible to its target", () => {
  const { state, home } = fresh();
  const { to } = neutralNeighbor(state, 0);
  state.cells[to].owner = 1;
  const after = step(state, [
    { kind: "pressure", power: 1, region: home, target: 0, active: true },
  ]).state;
  const pressures = viewFor(after, 0).pressures;
  assert.equal(pressures.length, 1);
  assert.equal(pressures[0].region, home);
  assert.equal(pressures[0].activeAt, state.constants.announceTicks);
});

test("force that no order asks for is a reserve with nowhere to go", () => {
  const { state, home } = fresh();
  const view = viewFor(state, 0);
  const muster = view.regions[home].estate?.muster;
  assert.ok(muster);
  assert.equal(view.arming, false);
  assert.equal(muster.garrison, 0);
  assert.equal(muster.front, 0);
  assert.equal(muster.reserve, state.constants.startForce);
  assert.deepEqual(muster.routes, []);
  assert.deepEqual(muster.duties, []);
});

test("a reserve is routed to the cells that are short of their garrison", () => {
  const { state, capital, home } = fresh();
  const spare = ownNeighbor(state, capital);
  state.cells[capital].force = 0;
  state.cells[spare].force = 3;
  state.powers[0].holdings[home].garrison = 1;
  const view = viewFor(state, 0);
  const muster = view.regions[home].estate?.muster;
  assert.ok(muster);
  assert.equal(view.arming, true);
  assert.ok(muster.reserve > 2);
  assert.ok(Math.abs(muster.garrison + muster.reserve - 3) < 1e-9);
  const routed = muster.routes.reduce((sum, route) => sum + route.amount, 0);
  assert.ok(Math.abs(routed - muster.reserve) < 1e-9);
  for (const route of muster.routes) {
    assert.notEqual(view.regions[route.region].estate, null);
  }
});

test("a muster names the orders its front force serves", () => {
  const { state, home } = fresh();
  const { from, to } = neutralNeighbor(state, 0);
  const pressed = state.map.cells[to].region;
  const staging = state.map.cells[from].region;
  const attacking = viewFor(
    step(state, [{ kind: "pressure", power: 0, region: pressed, target: null, active: true }])
      .state,
    0,
  );
  const duties = attacking.regions[staging].estate?.muster.duties ?? [];
  const attack = duties.find((duty) => duty.power === 0 && duty.region === pressed);
  assert.ok(attack);
  assert.equal(attack.target, null);
  assert.ok(attack.need > 0);

  state.cells[to].owner = 1;
  state.cells[to].force = 4;
  const defending = viewFor(
    step(state, [{ kind: "pressure", power: 1, region: home, target: 0, active: true }]).state,
    0,
  );
  const muster = defending.regions[home].estate?.muster;
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
  let seen = 0;
  for (const region of view.regions) {
    if (region.estate === null) {
      continue;
    }
    const mine = region.holdings?.find((holding) => holding.owner === 0);
    assert.ok(mine);
    const { garrison, front, need, reserve } = region.estate.muster;
    assert.ok(Math.abs(garrison + front + reserve - mine.force) < 1e-9);
    assert.ok(garrison <= region.estate.garrison + 1e-9);
    assert.ok(front <= need + 1e-9);
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
  const battles = viewFor(after, 0).battles;
  assert.equal(battles.length, 1);
  const [battle] = battles;
  assert.deepEqual([battle.power, battle.region, battle.target], [0, pressed, null]);
  const siege = battle.sieges.find((known) => known.cell === to);
  assert.ok(siege);
  assert.equal(siege.defense, state.constants.neutralDefense);
  assert.equal(siege.bare, siege.defense);
  assert.ok(siege.contacts >= 1 && siege.limit > siege.defense);
  assert.ok(siege.pressure > siege.defense);
  assert.ok(siege.progress > 0 && siege.rate > 0);
  assert.ok(battle.attackerLoss > 0);
  assert.equal(battle.defenderLoss, 0);
  for (const known of battle.sieges) {
    assert.equal(after.cells[known.cell].owner, null);
    assert.equal(state.map.cells[known.cell].region, pressed);
  }
});

test("a battle against the viewer is shown from the announcement on", () => {
  const { state } = fresh();
  const { from, to } = neutralNeighbor(state, 0);
  const attacked = state.map.cells[from].region;
  state.cells[to].owner = 1;
  state.cells[to].force = 30;
  const order = { kind: "pressure", power: 1, region: attacked, target: 0, active: true } as const;

  const announced = step(state, [order]).state;
  const waiting = viewFor(announced, 0).battles;
  assert.equal(waiting.length, 1);
  assert.ok(waiting[0].sieges.length > 0);
  for (const siege of waiting[0].sieges) {
    assert.equal(siege.pressure, 0);
    assert.equal(siege.rate, 0);
  }
  assert.deepEqual(viewFor(announced, 2).battles, []);

  const fought = run(state, state.constants.announceTicks + 2, [order]);
  const [battle] = viewFor(fought, 0).battles;
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

test("the outline carries geometry and topology but no natural data", () => {
  const outline = outlineOf(createWorld({ seed: 1 }).map);
  assert.deepEqual(Object.keys(outline.cells[0]).sort(), ["position", "region"]);
  assert.deepEqual(Object.keys(outline.joints[0]).sort(), ["a", "b", "edge"]);
  assert.deepEqual(Object.keys(outline.edges[0]).sort(), ["a", "b", "id", "joints"]);
});
