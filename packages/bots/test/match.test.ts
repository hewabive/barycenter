import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorld, outlineOf, viewFor } from "@barycenter/sim";
import { decide, doctrines, runMatch } from "../src/index.ts";

const lineup = [doctrines.aggressor, doctrines.builder, doctrines.opportunist];

test("a match is reproducible", () => {
  const first = runMatch({ seed: 5, doctrines: lineup, ticks: 800 });
  const second = runMatch({ seed: 5, doctrines: lineup, ticks: 800 });
  assert.deepEqual(first, second);
});

test("every doctrine settles neutral land and issues only valid commands", () => {
  for (const seed of [1, 2, 3]) {
    const summary = runMatch({ seed, doctrines: lineup, ticks: 1500 });
    assert.equal(summary.rejections, 0, `seed ${seed}`);
    summary.landTaken.forEach((taken, power) => {
      assert.ok(taken > 0, `seed ${seed}, ${summary.doctrines[power]}`);
    });
  }
});

test("all land is claimed in the course of a match", () => {
  const summary = runMatch({ seed: 4, doctrines: lineup, ticks: 3000 });
  const world = createWorld({ seed: 4 });
  const held = summary.standings.reduce((sum, standing) => sum + standing.nodes, 0);
  assert.equal(held, world.map.nodes.length);
});

test("a bot decides from its own view only", () => {
  const state = createWorld({ seed: 2 });
  const view = viewFor(state, 1);
  const commands = decide(outlineOf(state.map), state.constants, view, doctrines.builder);
  assert.ok(commands.length > 0);
  for (const command of commands) {
    assert.equal(command.power, 1);
  }
});
