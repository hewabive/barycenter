import assert from "node:assert/strict";
import { test } from "node:test";
import { depthsOf, wantedQuartersOf } from "../src/bases.ts";
import { forceReportFor, issue, retune, type State, viewFor } from "../src/index.ts";
import { hubOf } from "../src/rules.ts";
import { fresh, neutralNeighbor, run } from "./support.ts";

const REACH = 4;

function stretched(): { state: State; capital: number; home: number; far: number } {
  const { state, capital, home } = fresh();
  const { cells, map } = state;
  const hops = new Array<number>(cells.length).fill(-1);
  const via = new Array<number>(cells.length).fill(-1);
  hops[capital] = 0;
  const queue = [capital];
  let end = -1;
  for (let head = 0; head < queue.length && end < 0; head++) {
    for (const link of map.links[queue[head]]) {
      const owner = cells[link.cell].owner;
      if (hops[link.cell] >= 0 || (owner !== null && owner !== 0)) {
        continue;
      }
      hops[link.cell] = hops[queue[head]] + 1;
      via[link.cell] = queue[head];
      queue.push(link.cell);
      const beyond = map.links[link.cell].some((next) => cells[next.cell].owner === null);
      if (hops[link.cell] === REACH && map.cells[link.cell].region !== home && beyond) {
        end = link.cell;
        break;
      }
    }
  }
  assert.ok(end >= 0);
  for (let cell = end; cell !== capital; cell = via[cell]) {
    cells[cell].owner = 0;
  }
  const rival = map.links[end].find(
    (link) => cells[link.cell].owner === null && hops[link.cell] < 0,
  );
  assert.ok(rival);
  cells[rival.cell].owner = 1;
  return { state, capital, home, far: map.cells[end].region };
}

function hubsOf(state: State, power: number): number[] {
  return state.map.regions.flatMap((region) => hubOf(state, power, region.id) ?? []);
}

function roomWanted(state: State, power: number): number {
  const wanted = wantedQuartersOf(state);
  return hubsOf(state, power).reduce((sum, hub) => sum + wanted[hub], 0);
}

function fund(state: State, power: number): void {
  for (const cell of state.cells) {
    if (cell.owner === power) {
      cell.stock[0] = 300;
    }
  }
}

test("the army order places room in the hubs of every holding", () => {
  const { state, capital, far } = stretched();
  fund(state, 0);
  const ordered = issue(state, [{ kind: "army", power: 0, value: 30 }]).state;
  const view = viewFor(ordered, 0);
  assert.equal(view.army, 30);
  assert.ok(view.housing > 30);
  const wanted = wantedQuartersOf(ordered);
  const hubs = hubsOf(ordered, 0);
  assert.ok(hubs.length >= 2);
  assert.ok(Math.abs(roomWanted(ordered, 0) - 30) < 1e-9);
  for (const hub of hubs) {
    assert.ok(wanted[hub] > 0);
  }
  assert.ok(wanted[capital] > state.constants.startQuarters);
  assert.equal(view.regions[far].estate?.garrison, null);
  assert.ok((view.regions[far].estate?.quartersWanted ?? 0) > 0);

  const after = run(ordered, 40);
  const outpost = hubOf(after, 0, far);
  assert.ok(outpost !== null);
  assert.ok(after.cells[outpost].quarters > 0);
  assert.ok(after.cells[capital].quarters > state.constants.startQuarters);
});

test("an army larger than the hubs can house fills them and no more", () => {
  const { state } = stretched();
  const ordered = issue(state, [{ kind: "army", power: 0, value: 5000 }]).state;
  const view = viewFor(ordered, 0);
  assert.ok(Math.abs(roomWanted(ordered, 0) - view.housing) < 1e-9);
  for (const region of view.regions) {
    if (region.estate !== null) {
      assert.equal(region.estate.quartersWanted, region.estate.quartersLimit);
    }
  }
});

test("a garrison fixed by hand keeps its size and the army fills the rest", () => {
  const { state, capital, home, far } = stretched();
  const placed = issue(state, [{ kind: "army", power: 0, value: 30 }]).state;
  const free = viewFor(placed, 0).regions[far].estate?.quartersWanted ?? 0;

  const fixed = issue(placed, [{ kind: "garrison", power: 0, region: far, value: 1 }]).state;
  const estate = viewFor(fixed, 0).regions[far].estate;
  assert.equal(estate?.garrison, 1);
  assert.equal(estate?.quartersWanted, 1);
  assert.ok(Math.abs(roomWanted(fixed, 0) - 30) < 1e-9);
  assert.ok(wantedQuartersOf(fixed)[capital] > wantedQuartersOf(placed)[capital]);

  const greedy = issue(fixed, [{ kind: "garrison", power: 0, region: home, value: 1000 }]).state;
  const seat = viewFor(greedy, 0).regions[home].estate;
  assert.equal(seat?.quartersWanted, seat?.quartersLimit);
  assert.ok(roomWanted(greedy, 0) > 30);

  const released = issue(fixed, [{ kind: "garrison", power: 0, region: far, value: null }]).state;
  assert.equal(viewFor(released, 0).regions[far].estate?.garrison, null);
  assert.equal(viewFor(released, 0).regions[far].estate?.quartersWanted, free);
});

test("the forward dial moves room toward the frontier or away from it", () => {
  const { state: base, capital } = stretched();
  const state = retune(base, { quartersBase: 1000, quartersPerLevel: 0 }) ?? base;
  const depths = depthsOf(state);
  const hubs = hubsOf(state, 0);
  const nearest = hubs.reduce((best, hub) => (depths[hub] < depths[best] ? hub : best));
  assert.ok(depths[capital] >= REACH);
  assert.ok(depths[nearest] < depths[capital]);

  const wantedAt = (forward: number) =>
    wantedQuartersOf(issue(state, [{ kind: "forward", power: 0, value: forward }]).state);
  const rear = wantedAt(0);
  const even = wantedAt(0.5);
  const front = wantedAt(1);
  assert.ok(Math.abs(even[nearest] - even[capital]) < 1e-9);
  assert.ok(front[nearest] > even[nearest]);
  assert.ok(rear[nearest] < even[nearest]);
  assert.ok(front[capital] < even[capital]);
  assert.ok(rear[capital] > even[capital]);
  for (const wanted of [rear, even, front]) {
    const sum = hubs.reduce((total, hub) => total + wanted[hub], 0);
    assert.ok(Math.abs(sum - state.powers[0].army) < 1e-9);
  }
});

test("until a power meets a rival its frontier is the edge of free land", () => {
  const { state } = fresh();
  const { from, to } = neutralNeighbor(state, 0);
  assert.equal(depthsOf(state)[from], 0);
  state.cells[to].owner = 1;
  const depths = depthsOf(state);
  assert.equal(depths[from], 0);
  const sheltered = state.cells.findIndex(
    (cell, id) =>
      cell.owner === 0 && !state.map.links[id].some((link) => state.cells[link.cell].owner === 1),
  );
  assert.ok(sheltered >= 0);
  assert.ok(depths[sheltered] > 0);
});

test("a reinforcement keeps force in the field on the cells that face another power", () => {
  const { state } = fresh();
  const { from, to } = neutralNeighbor(state, 0);
  const region = state.map.cells[from].region;
  state.cells[to].owner = 1;
  const facing = state.map.regions[region].cells.filter(
    (cell) =>
      state.cells[cell].owner === 0 &&
      state.map.links[cell].some((link) => state.cells[link.cell].owner === 1),
  );
  const standing = (from: State) => facing.reduce((sum, cell) => sum + from.cells[cell].force, 0);
  assert.ok(facing.length > 0);
  assert.equal(standing(state), 0);

  const order = { kind: "reinforce", power: 0, region } as const;
  const held = run(state, 30, [{ ...order, value: 4 }]);
  assert.equal(viewFor(held, 0).regions[region].estate?.reinforcement, 4);
  assert.ok(Math.abs(standing(held) - 4) < 0.05);
  const muster = forceReportFor(held, 0).musters[region];
  assert.ok(muster);
  assert.ok(Math.abs(muster.need - 4) < 1e-9);
  assert.ok(muster.front > 3.9);
  assert.ok(viewFor(held, 0).forceCap <= state.constants.startQuarters + 1e-9);

  const back = run(held, 30, [{ ...order, value: 0 }]);
  assert.ok(standing(back) < 0.05);
  const resting = forceReportFor(back, 0).musters.reduce(
    (sum, entry) => sum + (entry?.garrison ?? 0),
    0,
  );
  assert.ok(resting > 4);
});

test("where no other power is near, a reinforcement stands in the hub beyond its garrison", () => {
  const { state, home } = fresh();
  const before = forceReportFor(state, 0).musters[home];
  assert.ok(before);
  assert.equal(before.front, 0);
  const ordered = issue(state, [{ kind: "reinforce", power: 0, region: home, value: 2 }]).state;
  const muster = forceReportFor(ordered, 0).musters[home];
  assert.ok(muster);
  assert.equal(muster.front, 2);
  assert.equal(muster.garrison, state.constants.startForce - 2);
});
