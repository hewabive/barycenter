import assert from "node:assert/strict";
import { test } from "node:test";
import { cloneState, createWorld, outlineOf, step, viewFor } from "../src/index.ts";

test("a view hides what the power has not explored", () => {
  const state = createWorld({ seed: 1 });
  const view = viewFor(state, 0);
  const capital = state.powers[0].capital;
  const near = new Set([capital, ...state.map.links[capital].map((link) => link.node)]);

  for (const node of view.nodes) {
    if (near.has(node.id)) {
      assert.notEqual(node.nature, null);
      assert.notEqual(node.status, null);
    } else {
      assert.equal(node.nature, null);
      assert.equal(node.status, null);
    }
    assert.equal(node.holding !== null, node.id === capital);
  }
});

test("a view never exposes the stockpile and orders of another power", () => {
  const state = cloneState(createWorld({ seed: 1 }));
  const capital = state.powers[0].capital;
  const neighbor = state.map.links[capital][0].node;
  state.nodes[neighbor].owner = 1;
  const seen = viewFor(state, 0).nodes[neighbor];
  assert.equal(seen.status?.owner, 1);
  assert.equal(seen.holding, null);
});

test("natural data stays known after the node is lost from sight", () => {
  const state = cloneState(createWorld({ seed: 1 }));
  const capital = state.powers[0].capital;
  const far = state.nodes.findIndex((_, id) => !state.powers[0].explored[id]);
  state.powers[0].explored[far] = true;
  const view = viewFor(step(state, []).state, 0);
  assert.notEqual(view.nodes[far].nature, null);
  assert.equal(view.nodes[far].status, null);
  assert.notEqual(view.nodes[capital].holding, null);
});

test("an announced attack is visible to its target", () => {
  const state = cloneState(createWorld({ seed: 1 }));
  const capital = state.powers[0].capital;
  const neighbor = state.map.links[capital][0].node;
  state.nodes[neighbor].owner = 1;
  const after = step(state, [
    { kind: "pressure", power: 1, from: neighbor, to: capital, active: true },
  ]).state;
  const pressures = viewFor(after, 0).pressures;
  assert.equal(pressures.length, 1);
  assert.equal(pressures[0].to, capital);
  assert.equal(pressures[0].activeAt, state.constants.announceTicks);
});

test("the outline carries geometry and topology but no natural data", () => {
  const outline = outlineOf(createWorld({ seed: 1 }).map);
  assert.deepEqual(Object.keys(outline.nodes[0]).sort(), ["id", "position"]);
  assert.deepEqual(Object.keys(outline.edges[0]).sort(), ["a", "b", "id"]);
});
