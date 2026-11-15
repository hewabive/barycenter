import assert from "node:assert/strict";
import { test } from "node:test";
import { type Command, createWorld, step } from "../src/index.ts";
import { fill, fresh, ownNeighbor, run } from "./support.ts";

const EXTRACTION = 0;
const POWER = 1;
const SHIPYARD = 2;

test("a step leaves the previous state untouched", () => {
  const state = createWorld({ seed: 1 });
  const before = JSON.stringify(state);
  const home = state.map.cells[state.powers[0].capital].region;
  step(state, [{ kind: "dial", power: 0, region: home, value: 1 }]);
  assert.equal(JSON.stringify(state), before);
});

test("the same commands produce the same history", () => {
  const home = fresh(3).home;
  const commands: Command[] = [
    { kind: "dial", power: 0, region: home, value: 1 },
    { kind: "garrison", power: 0, region: home, value: 20 },
    { kind: "pressure", power: 0, region: home, target: null, active: true },
  ];
  const first = run(createWorld({ seed: 3 }), 300, commands);
  const second = run(createWorld({ seed: 3 }), 300, commands);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test("quantities stay finite and a cell's branches add up to its level", () => {
  const { state, home } = fresh(2);
  const after = run(state, 500, [
    { kind: "pressure", power: 0, region: home, target: null, active: true },
  ]);
  for (const cell of after.cells) {
    for (const value of [cell.force, cell.progress, cell.level, ...cell.stock, ...cell.branches]) {
      assert.ok(Number.isFinite(value) && value >= 0);
    }
    assert.ok(cell.supply >= 0 && cell.supply <= 1);
    const built = cell.branches.reduce((sum, branch) => sum + branch, 0);
    assert.ok(Math.abs(built - cell.level) < 1e-6);
  }
});

test("an owned cell accumulates matter and a neutral one does not", () => {
  const { state, capital, home } = fresh();
  state.powers[0].holdings[home].dial = 0;
  const after = run(state, 10);
  assert.ok(after.cells[capital].stock[0] > state.cells[capital].stock[0]);
  const neutral = after.cells.findIndex((cell) => cell.owner === null);
  assert.equal(after.cells[neutral].stock[0], 0);
});

test("matter flows from a cell with nothing to build to neighbors that build", () => {
  const { state, capital, home } = fresh();
  const donor = ownNeighbor(state, capital);
  state.powers[0].holdings[home].dial = 1;
  state.cells[capital].stock[0] = 0;
  fill(state, donor, EXTRACTION);
  state.cells[donor].stock[0] = 50;

  const after = step(state, []).state;
  assert.ok(after.cells[donor].stock[0] < 50);
  const carried = state.map.links[donor].some((link) => after.joints[link.joint].matterFlow !== 0);
  assert.ok(carried);
});

test("a cell short of energy is undersupplied and grows only its power branch", () => {
  const { state, capital, home } = fresh();
  for (let cell = 0; cell < state.cells.length; cell++) {
    if (state.cells[cell].owner === 0 && cell !== capital) {
      fill(state, cell, EXTRACTION);
    }
  }
  state.powers[0].holdings[home].dial = 1;
  state.powers[0].holdings[home].garrison = 0;
  state.cells[capital].quarters = 0;
  state.cells[capital].force = 0;
  state.cells[capital].stock[0] = 1000;
  state.cells[capital].branches = [state.cells[capital].level, 0, 0];
  const before = state.cells[capital];

  let current = step(state, []).state;
  assert.ok(current.cells[capital].supply < 1);
  for (let tick = 0; tick < 600 && current.cells[capital].level === before.level; tick++) {
    current = step(current, []).state;
  }
  const after = current.cells[capital];
  assert.equal(after.level, before.level + 1);
  assert.ok(after.branches[POWER] > before.branches[POWER] + 0.9);
  assert.ok(after.branches[EXTRACTION] < before.branches[EXTRACTION] + 0.05);
  assert.ok(after.branches[SHIPYARD] < before.branches[SHIPYARD] + 0.05);
});

test("power built nearby supplies a cell with energy", () => {
  const { state, capital } = fresh(4);
  fill(state, capital, EXTRACTION);
  for (let cell = 0; cell < state.cells.length; cell++) {
    if (state.cells[cell].owner === 0 && cell !== capital) {
      fill(state, cell, EXTRACTION);
    }
  }
  const alone = step(state, []).state.cells[capital].supply;
  assert.ok(alone < 1);

  fill(state, ownNeighbor(state, capital), POWER);
  const supplied = step(state, []).state.cells[capital].supply;
  assert.ok(supplied > alone);
});

test("force decays where energy is short", () => {
  const { state, capital, home } = fresh();
  fill(state, capital, EXTRACTION);
  state.cells[capital].force = 60;
  state.powers[0].holdings[home].dial = 0;
  const after = run(state, 50);
  const held = after.cells.reduce((sum, cell) => sum + (cell.owner === 0 ? cell.force : 0), 0);
  assert.ok(held < 60);
});

test("a raised leaning shifts what new levels become", () => {
  const shipyardsAfter = (value: number): number => {
    const { state, home } = fresh();
    for (const cell of state.cells) {
      if (cell.owner === 0) {
        cell.stock[0] = 200;
      }
    }
    const after = run(state, 250, [
      { kind: "dial", power: 0, region: home, value: 1 },
      { kind: "lean", power: 0, branch: "shipyard", value },
    ]);
    return after.cells.reduce(
      (sum, cell) => sum + (cell.owner === 0 ? cell.branches[SHIPYARD] : 0),
      0,
    );
  };
  assert.ok(shipyardsAfter(1) > shipyardsAfter(0) * 2);
});

test("levels already built change branch only slowly", () => {
  const { state, capital } = fresh();
  fill(state, capital, EXTRACTION);
  const level = state.cells[capital].level;
  const after = run(state, 100, [{ kind: "lean", power: 0, branch: "shipyard", value: 1 }]);
  assert.ok(after.cells[capital].branches[EXTRACTION] > 0.7 * level);
  assert.ok(after.cells[capital].branches[EXTRACTION] < level);
});
