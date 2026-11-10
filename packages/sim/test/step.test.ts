import assert from "node:assert/strict";
import { test } from "node:test";
import { type Command, cloneState, createWorld, type State, step } from "../src/index.ts";

function run(state: State, ticks: number, commands: Command[] = []): State {
  let current = step(state, commands).state;
  for (let tick = 1; tick < ticks; tick++) {
    current = step(current, []).state;
  }
  return current;
}

function neighborOf(state: State, node: number): number {
  return state.map.links[node][0].node;
}

test("a step leaves the previous state untouched", () => {
  const state = createWorld({ seed: 1 });
  const before = JSON.stringify(state);
  const capital = state.powers[0].capital;
  step(state, [{ kind: "dial", power: 0, node: capital, value: 1 }]);
  assert.equal(JSON.stringify(state), before);
});

test("the same commands produce the same history", () => {
  const capital = createWorld({ seed: 3 }).powers[0].capital;
  const commands: Command[] = [
    { kind: "dial", power: 0, node: capital, value: 1 },
    { kind: "garrison", power: 0, node: capital, value: 20 },
  ];
  const first = run(createWorld({ seed: 3 }), 300, commands);
  const second = run(createWorld({ seed: 3 }), 300, commands);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test("quantities stay finite and never go negative", () => {
  const state = run(createWorld({ seed: 2 }), 500);
  for (const node of state.nodes) {
    for (const value of [node.matter, node.force, node.progress, node.level]) {
      assert.ok(Number.isFinite(value) && value >= 0);
    }
    assert.ok(node.supply >= 0 && node.supply <= 1);
  }
});

test("an owned node accumulates matter and a neutral one does not", () => {
  const start = createWorld({ seed: 1 });
  const capital = start.powers[0].capital;
  const state = cloneState(start);
  state.nodes[capital].dial = 0;
  const after = run(state, 10);
  assert.ok(after.nodes[capital].matter > state.nodes[capital].matter);
  const neutral = after.nodes.findIndex((node) => node.owner === null);
  assert.equal(after.nodes[neutral].matter, 0);
});

test("matter flows toward a neighbor that pulls it", () => {
  const state = cloneState(createWorld({ seed: 1 }));
  const capital = state.powers[0].capital;
  const donor = neighborOf(state, capital);
  state.nodes[capital].dial = 1;
  state.nodes[capital].matter = 0;
  state.nodes[donor].owner = 0;
  state.nodes[donor].dial = 0;
  state.nodes[donor].matter = 50;

  const after = step(state, []).state;
  assert.ok(after.nodes[donor].matter < 50);
  assert.ok(after.nodes[capital].matter + after.nodes[capital].progress > 0);
  const edge = state.map.links[capital][0].edge;
  assert.notEqual(after.edges[edge].matterFlow, 0);
});

test("a node short of energy is undersupplied and stops growing", () => {
  const state = cloneState(createWorld({ seed: 1 }));
  const capital = state.powers[0].capital;
  state.nodes[capital].level = 7;
  state.nodes[capital].force = 0;
  state.nodes[capital].matter = 1000;
  state.nodes[capital].dial = 1;

  const after = run(state, 200);
  assert.ok(after.nodes[capital].supply < 1);
  assert.equal(after.nodes[capital].level, 7);
});

test("a power node supplies its neighbor with energy", () => {
  const state = cloneState(createWorld({ seed: 1 }));
  const capital = state.powers[0].capital;
  const plant = neighborOf(state, capital);
  state.nodes[capital].level = 7;
  const alone = step(state, []).state.nodes[capital].supply;

  state.nodes[plant].owner = 0;
  state.nodes[plant].role = "power";
  state.nodes[plant].level = 4;
  const supplied = step(state, []).state.nodes[capital].supply;
  assert.ok(supplied > alone);
});

test("force decays where energy is short", () => {
  const state = cloneState(createWorld({ seed: 1 }));
  const capital = state.powers[0].capital;
  state.nodes[capital].level = 7;
  state.nodes[capital].force = 40;
  state.nodes[capital].dial = 0;
  const after = run(state, 50);
  assert.ok(after.nodes[capital].force < 40);
});

test("force moves to a node whose garrison is unmet", () => {
  const state = cloneState(createWorld({ seed: 1 }));
  const capital = state.powers[0].capital;
  const outpost = neighborOf(state, capital);
  state.nodes[outpost].owner = 0;
  state.nodes[capital].force = 10;

  const after = run(state, 20, [{ kind: "garrison", power: 0, node: outpost, value: 4 }]);
  assert.ok(after.nodes[outpost].force >= 3.9);
});
