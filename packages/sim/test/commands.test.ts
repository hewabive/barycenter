import assert from "node:assert/strict";
import { test } from "node:test";
import { type Command, cloneState, createWorld, type State, step } from "../src/index.ts";

function world(): { state: State; capital: number; neighbor: number; edge: number } {
  const state = cloneState(createWorld({ seed: 1 }));
  const capital = state.powers[0].capital;
  const link = state.map.links[capital][0];
  return { state, capital, neighbor: link.node, edge: link.edge };
}

function rejected(state: State, command: Command): string | undefined {
  return step(state, [command]).rejections[0]?.reason;
}

test("orders for nodes the power does not own are rejected", () => {
  const { state, neighbor } = world();
  const foreign = state.powers[1].capital;
  assert.ok(rejected(state, { kind: "dial", power: 0, node: neighbor, value: 1 }));
  assert.ok(rejected(state, { kind: "garrison", power: 0, node: foreign, value: 5 }));
  assert.ok(rejected(state, { kind: "role", power: 0, node: foreign, role: "power" }));
  assert.ok(
    rejected(state, { kind: "pressure", power: 0, from: foreign, to: neighbor, active: true }),
  );
});

test("malformed values are rejected", () => {
  const { state, capital, neighbor } = world();
  assert.ok(rejected(state, { kind: "dial", power: 0, node: capital, value: 1.5 }));
  assert.ok(rejected(state, { kind: "dial", power: 0, node: capital, value: Number.NaN }));
  assert.ok(rejected(state, { kind: "garrison", power: 0, node: capital, value: -1 }));
  assert.ok(rejected(state, { kind: "dial", power: 9, node: capital, value: 1 }));
  assert.ok(rejected(state, { kind: "expand", power: 0, edge: 9999, active: true }));
  const far = state.powers[1].capital;
  assert.ok(rejected(state, { kind: "pressure", power: 0, from: capital, to: far, active: true }));
  assert.equal(
    rejected(state, { kind: "pressure", power: 0, from: capital, to: neighbor, active: true }),
    undefined,
  );
});

test("pressure captures a neutral neighbor and is reported", () => {
  const { state, capital, neighbor } = world();
  let current = state;
  let commands: Command[] = [
    { kind: "pressure", power: 0, from: capital, to: neighbor, active: true },
  ];
  let captured = false;
  for (let tick = 0; tick < 200 && !captured; tick++) {
    const result = step(current, commands);
    commands = [];
    current = result.state;
    captured = result.events.some((event) => event.kind === "captured" && event.node === neighbor);
  }
  assert.ok(captured);
  assert.equal(current.nodes[neighbor].owner, 0);
  assert.equal(current.pressures.length, 0);
  assert.ok(current.nodes[capital].force < state.nodes[capital].force + 20);
});

test("an attack on an owned node is announced and waits", () => {
  const { state, capital, neighbor } = world();
  state.nodes[neighbor].owner = 1;
  const delay = state.constants.announceTicks;

  const first = step(state, [
    { kind: "pressure", power: 0, from: capital, to: neighbor, active: true },
  ]);
  const announced = first.events.find((event) => event.kind === "announced");
  assert.deepEqual(announced, {
    kind: "announced",
    power: 0,
    from: capital,
    to: neighbor,
    target: 1,
    activeAt: delay,
  });

  let current = first.state;
  while (current.tick < delay) {
    assert.equal(current.pressures[0].commit, 0);
    current = step(current, []).state;
  }
  current = step(current, []).state;
  assert.ok(current.pressures[0].commit > 0);
});

test("withdrawing pressure removes the order", () => {
  const { state, capital, neighbor } = world();
  const ordered = step(state, [
    { kind: "pressure", power: 0, from: capital, to: neighbor, active: true },
  ]).state;
  const withdrawn = step(ordered, [
    { kind: "pressure", power: 0, from: capital, to: neighbor, active: false },
  ]).state;
  assert.equal(withdrawn.pressures.length, 0);
});

test("changing an established role costs levels", () => {
  const { state, capital } = world();
  state.nodes[capital].level = 4;
  const after = step(state, [{ kind: "role", power: 0, node: capital, role: "extraction" }]).state;
  assert.equal(after.nodes[capital].role, "extraction");
  assert.equal(after.nodes[capital].level, 2);
});

test("one expansion order raises capacity by one step", () => {
  const { state, capital, edge } = world();
  state.nodes[capital].matter = 1000;
  state.nodes[capital].dial = 1;
  let current = step(state, [{ kind: "expand", power: 0, edge, active: true }]).state;
  assert.equal(current.edges[edge].expanding, 0);
  for (let tick = 0; tick < 300 && current.edges[edge].expansions === 0; tick++) {
    current = step(current, []).state;
  }
  assert.equal(current.edges[edge].expansions, 1);
  assert.equal(current.edges[edge].expanding, null);
});
