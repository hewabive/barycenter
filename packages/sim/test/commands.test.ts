import assert from "node:assert/strict";
import { test } from "node:test";
import { type Command, type State, step, viewFor } from "../src/index.ts";
import { cellsHeld, fresh, neutralNeighbor, run } from "./support.ts";

function rejected(state: State, command: Command): string | undefined {
  return step(state, [command]).rejections[0]?.reason;
}

function rivalNextDoor(state: State): { from: number; to: number; region: number } {
  const { from, to } = neutralNeighbor(state, 0);
  state.cells[to].owner = 1;
  return { from, to, region: state.map.cells[to].region };
}

test("orders for regions the power does not hold are rejected", () => {
  const { state } = fresh();
  const foreign = state.map.cells[state.powers[1].capital].region;
  assert.ok(rejected(state, { kind: "dial", power: 0, region: foreign, value: 1 }));
  assert.ok(rejected(state, { kind: "garrison", power: 0, region: foreign, value: 5 }));
  assert.ok(
    rejected(state, { kind: "pressure", power: 0, region: foreign, target: 1, active: true }),
  );
});

test("malformed values are rejected", () => {
  const { state, home } = fresh();
  assert.ok(rejected(state, { kind: "dial", power: 0, region: home, value: 1.5 }));
  assert.ok(rejected(state, { kind: "dial", power: 0, region: home, value: Number.NaN }));
  assert.ok(rejected(state, { kind: "dial", power: 0, region: 9999, value: 1 }));
  assert.ok(rejected(state, { kind: "garrison", power: 0, region: home, value: -1 }));
  assert.ok(rejected(state, { kind: "dial", power: 9, region: home, value: 1 }));
  assert.ok(rejected(state, { kind: "expand", power: 0, edge: 9999, active: true }));
  assert.ok(rejected(state, { kind: "lean", power: 0, branch: "power", value: 2 }));
  assert.ok(rejected(state, { kind: "lean", power: 0, branch: "science" as never, value: 0.5 }));
  assert.ok(rejected(state, { kind: "pressure", power: 0, region: home, target: 0, active: true }));
  assert.ok(rejected(state, { kind: "pressure", power: 0, region: home, target: 7, active: true }));
  assert.equal(
    rejected(state, { kind: "pressure", power: 0, region: home, target: null, active: true }),
    undefined,
  );
});

test("pressure settles a neutral region cell by cell and lapses when none are left", () => {
  const { state, home } = fresh();
  const size = state.map.regions[home].cells.length;
  let current = state;
  let commands: Command[] = [
    { kind: "pressure", power: 0, region: home, target: null, active: true },
  ];
  const counts = new Set<number>();
  let secured = false;
  for (let tick = 0; tick < 4000 && !secured; tick++) {
    const result = step(current, commands);
    commands = [];
    current = result.state;
    counts.add(cellsHeld(current, 0, home));
    secured = result.events.some((event) => event.kind === "secured" && event.region === home);
  }
  assert.ok(secured);
  assert.equal(cellsHeld(current, 0, home), size);
  assert.ok(counts.size >= Math.min(4, size - state.constants.startCells));
  assert.equal(current.pressures.length, 0);
});

test("powers that enter a neutral region from two sides share it", () => {
  const { state } = fresh();
  const taken = new Set(state.powers.map((power) => state.map.cells[power.capital].region));
  const region = state.map.regions.find((candidate) => {
    return candidate.cells.length >= 8 && !taken.has(candidate.id);
  });
  assert.ok(region);
  const first = region.cells[0];
  const far = region.cells.findLast(
    (cell) => !state.map.links[cell].some((link) => link.cell === first),
  );
  assert.ok(far !== undefined);
  for (const [cell, power] of [
    [first, 0],
    [far, 1],
  ]) {
    state.cells[cell].owner = power;
    state.cells[cell].force = 60;
  }

  let current = step(state, [
    { kind: "pressure", power: 0, region: region.id, target: null, active: true },
    { kind: "pressure", power: 1, region: region.id, target: null, active: true },
  ]).state;
  for (let tick = 0; tick < 1500 && current.pressures.length > 0; tick++) {
    current = step(current, []).state;
  }
  const mine = cellsHeld(current, 0, region.id);
  const theirs = cellsHeld(current, 1, region.id);
  assert.ok(mine >= 2 && theirs >= 2);
  assert.equal(mine + theirs, region.cells.length);
});

test("an attack on a holding is announced and waits", () => {
  const { state } = fresh();
  const { region } = rivalNextDoor(state);
  const delay = state.constants.announceTicks;

  const first = step(state, [{ kind: "pressure", power: 0, region, target: 1, active: true }]);
  const announced = first.events.find((event) => event.kind === "announced");
  assert.deepEqual(announced, { kind: "announced", power: 0, region, target: 1, activeAt: delay });

  let current = first.state;
  while (current.tick < delay) {
    assert.equal(viewFor(current, 0).pressures[0].commit, 0);
    current = step(current, []).state;
  }
  assert.ok(viewFor(current, 0).pressures[0].commit > 0);
});

test("a captured cell changes owner and loses part of its level", () => {
  const { state } = fresh();
  const { from, to, region } = rivalNextDoor(state);
  state.cells[to].level = 3;
  state.cells[to].branches = [3, 0, 0];
  state.cells[from].force = 80;
  state.powers[1].holdings[region].garrison = 5;

  let current = step(state, [{ kind: "pressure", power: 0, region, target: 1, active: true }]);
  for (let tick = 0; tick < 300 && current.state.cells[to].owner === 1; tick++) {
    current = step(current.state, []);
  }
  const fallen = current.state.cells[to];
  assert.equal(fallen.owner, 0);
  assert.equal(fallen.level, 2);
  assert.ok(fallen.branches[0] > 1.5);
  assert.ok(Math.abs(fallen.branches.reduce((sum, branch) => sum + branch, 0) - 2) < 1e-6);
  if (state.map.cells[to].region !== state.map.cells[state.powers[1].capital].region) {
    const expelled = current.events.find((event) => event.kind === "expelled");
    assert.deepEqual(expelled, { kind: "expelled", power: 1, region, by: 0 });
    assert.equal(current.state.powers[1].holdings[region].garrison, 0);
  }
  assert.equal(current.state.pressures.length, 0);
});

test("withdrawing pressure removes the order", () => {
  const { state, home } = fresh();
  const order = { kind: "pressure", power: 0, region: home, target: null } as const;
  const ordered = step(state, [{ ...order, active: true }]).state;
  assert.equal(ordered.pressures.length, 1);
  const withdrawn = step(ordered, [{ ...order, active: false }]).state;
  assert.equal(withdrawn.pressures.length, 0);
});

test("one expansion order raises the capacity of an edge by one step", () => {
  const { state } = fresh();
  const joint = state.map.joints.find((candidate) => candidate.edge !== null);
  assert.ok(joint && joint.edge !== null);
  const edge = joint.edge;
  const region = state.map.cells[joint.a].region;
  state.cells[joint.a].owner = 0;
  state.cells[joint.a].stock[0] = 1000;
  state.powers[0].holdings[region].dial = 1;
  const before = viewFor(state, 0).edges[edge].capacity ?? 0;

  let current = step(state, [{ kind: "expand", power: 0, edge, active: true }]).state;
  assert.equal(current.edges[edge].expanding, 0);
  for (let tick = 0; tick < 300 && current.edges[edge].expansions === 0; tick++) {
    current = step(current, []).state;
  }
  assert.equal(current.edges[edge].expansions, 1);
  assert.equal(current.edges[edge].expanding, null);
  assert.ok((viewFor(current, 0).edges[edge].capacity ?? 0) > before);
});

test("the leaning is an order for the whole power", () => {
  const { state } = fresh();
  const after = run(state, 1, [{ kind: "lean", power: 0, branch: "power", value: 0.9 }]);
  assert.deepEqual(viewFor(after, 0).lean, [0.5, 0.9, 0.5]);
  assert.deepEqual(viewFor(after, 1).lean, [0.5, 0.5, 0.5]);
});
