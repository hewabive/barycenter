import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorld, NEUTRAL, outlineOf, step, UNSEEN, viewFor } from "../src/index.ts";
import { fresh, neutralNeighbor } from "./support.ts";

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

test("the outline carries geometry and topology but no natural data", () => {
  const outline = outlineOf(createWorld({ seed: 1 }).map);
  assert.deepEqual(Object.keys(outline.cells[0]).sort(), ["position", "region"]);
  assert.deepEqual(Object.keys(outline.joints[0]).sort(), ["a", "b", "edge"]);
  assert.deepEqual(Object.keys(outline.edges[0]).sort(), ["a", "b", "id", "joints"]);
});
