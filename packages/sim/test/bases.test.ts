import assert from "node:assert/strict";
import { test } from "node:test";
import { forceReportFor, type State, step, viewFor } from "../src/index.ts";
import { fresh, neutralNeighbor, ownNeighbor, run } from "./support.ts";

function forceOf(state: State, power: number): number {
  return state.cells.reduce((sum, cell) => sum + (cell.owner === power ? cell.force : 0), 0);
}

function fund(state: State, power: number): void {
  for (const cell of state.cells) {
    if (cell.owner === power) {
      cell.stock[0] = 300;
    }
  }
}

test("a power starts with a base in its capital that holds its force", () => {
  const { state, capital, home } = fresh();
  const view = viewFor(state, 0);
  assert.equal(state.cells[capital].quarters, state.constants.startQuarters);
  assert.equal(view.forceCap, state.constants.startQuarters);
  assert.equal(view.regions[home].estate?.quarters, state.constants.startQuarters);
  assert.equal(view.cells.quarters[capital], state.constants.startQuarters);
});

test("a garrison order builds a base in the hub, up to what the hub can house", () => {
  const { state, capital, home } = fresh();
  fund(state, 0);
  const limit = viewFor(state, 0).regions[home].estate?.quartersLimit ?? 0;
  assert.ok(limit > state.constants.startQuarters);
  const soon = run(state, 5, [{ kind: "garrison", power: 0, region: home, value: 1000 }]);
  assert.ok(soon.cells[capital].quarters > state.constants.startQuarters);
  assert.ok(soon.cells[capital].quarters < limit);
  const after = run(soon, 400);
  const hub = after.cells[capital];
  const housed = after.constants.quartersBase + after.constants.quartersPerLevel * hub.level;
  assert.ok(Math.abs(hub.quarters - housed) < 1e-6);
  assert.equal(after.cells.filter((cell) => cell.quarters > 0).length, 3);
});

test("shipyards build force only up to the room in the bases", () => {
  const { state, home } = fresh();
  fund(state, 0);
  const after = run(state, 600, [{ kind: "dial", power: 0, region: home, value: 1 }]);
  const cap = viewFor(after, 0).forceCap;
  assert.ok(forceOf(after, 0) > state.constants.startForce + 1);
  assert.ok(forceOf(after, 0) <= cap + 1e-6);
});

test("a base that no order keeps is run down and the force above the room melts", () => {
  const { state, capital, home } = fresh();
  state.cells[capital].force = state.constants.startQuarters;
  const after = run(state, 600, [{ kind: "garrison", power: 0, region: home, value: 2 }]);
  assert.ok(Math.abs(after.cells[capital].quarters - 2) < 1e-6);
  assert.ok(forceOf(after, 0) < 4);
  assert.ok(forceOf(after, 0) > 1);
});

test("force goes to a front from its base and comes back when the order is withdrawn", () => {
  const { state, capital, home } = fresh();
  const { to } = neutralNeighbor(state, 0);
  const region = state.map.cells[to].region;
  state.map.regions[region].cells.forEach((cell) => {
    if (state.cells[cell].owner === null) {
      state.cells[cell].level = 30;
    }
  });
  const order = { kind: "pressure", power: 0, region, target: null } as const;
  const pressing = run(state, 15, [{ ...order, active: true }]);
  const called = forceReportFor(pressing, 0).musters[home];
  assert.ok(called);
  assert.ok(called.front > 1);
  assert.ok(called.garrison < state.constants.startForce - 1);

  const back = run(pressing, 60, [{ ...order, active: false }]);
  const rested = forceReportFor(back, 0).musters[home];
  assert.ok(rested);
  assert.ok(forceOf(back, 0) > 0);
  assert.ok(Math.abs(rested.garrison - forceOf(back, 0)) < 1e-6);
  assert.ok(Math.abs(back.cells[capital].force - forceOf(back, 0)) < 1e-6);
});

test("force in the field needs more energy than force at rest", () => {
  const supplyWith = (resting: boolean): number => {
    const { state, capital, home } = fresh();
    const post = resting ? capital : ownNeighbor(state, capital);
    state.cells[capital].quarters = 200;
    state.powers[0].holdings[home].garrison = 200;
    state.cells[capital].force = 0;
    state.cells[post].force = 200;
    return step(state, []).state.cells[post].supply;
  };
  assert.ok(supplyWith(true) > supplyWith(false));
});

test("force cut off from the capital melts away", () => {
  const { state, capital } = fresh();
  const far = state.cells.findIndex(
    (cell, id) =>
      cell.owner === null &&
      !state.map.links[id].some((link) => state.cells[link.cell].owner === 0),
  );
  state.cells[far].owner = 0;
  state.cells[far].force = 5;
  state.cells[capital].force = 5;
  const after = run(state, 60);
  assert.ok(after.cells[far].force < 1);
  assert.ok(after.cells[capital].force > 4);
});

test("a captured base loses part of its room", () => {
  const { state } = fresh();
  const { from, to } = neutralNeighbor(state, 0);
  const region = state.map.cells[to].region;
  state.cells[to].owner = 1;
  state.cells[to].quarters = 9;
  state.cells[from].force = 80;
  state.cells[from].quarters = 80;
  let current = step(state, [
    { kind: "pressure", power: 0, region, target: 1, active: true },
  ]).state;
  for (let tick = 0; tick < 300 && current.cells[to].owner === 1; tick++) {
    current = step(current, []).state;
  }
  assert.equal(current.cells[to].owner, 0);
  assert.ok(current.cells[to].quarters < 9);
});
