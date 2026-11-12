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

test("a front tells where it advances, where it is stalled and where it rests", () => {
  const { state } = fresh();
  const { from, to } = neutralNeighbor(state, 0);
  const region = state.map.cells[to].region;
  const joint = state.map.links[from].find((link) => link.cell === to)?.joint;
  state.cells[from].force = 8;
  state.pressures.push({ power: 0, region, target: null, activeAt: 0 });

  const open = viewFor(state, 0).pressures[0];
  assert.ok(open.commit > state.constants.neutralDefense);
  assert.ok(open.advancing.includes(joint ?? -1));
  assert.deepEqual(open.stalled, []);
  for (const pushed of open.advancing) {
    const { a, b } = state.map.joints[pushed];
    assert.deepEqual([state.cells[a].owner, state.cells[b].owner].sort(), [0, null]);
  }

  state.cells[to].owner = 1;
  state.cells[to].force = 100;
  state.pressures[0].target = 1;
  const walled = viewFor(state, 0).pressures[0];
  assert.ok(walled.stalled.includes(joint ?? -1));
  assert.deepEqual(walled.advancing, []);

  state.pressures[0].activeAt = state.tick + 1;
  const announced = viewFor(state, 0).pressures[0];
  assert.equal(announced.commit, 0);
  assert.deepEqual([announced.stalled, announced.advancing], [[], []]);

  state.pressures[0].activeAt = 0;
  for (const cell of state.cells) {
    cell.force = cell.owner === 0 ? 0 : cell.force;
  }
  const spent = viewFor(state, 0).pressures[0];
  assert.deepEqual([spent.stalled, spent.advancing], [[], []]);
});

test("a front seen from afar hides the contacts that start out of sight", () => {
  const { state, home } = fresh();
  const near = state.map.neighbors[home].map((neighbor) => neighbor.region);
  const seen = new Set([home, ...near]);
  const edge = state.map.edges.find(
    (candidate) =>
      (near.includes(candidate.a) && !seen.has(candidate.b)) ||
      (near.includes(candidate.b) && !seen.has(candidate.a)),
  );
  assert.ok(edge);
  const { a, b } = state.map.joints[edge.joints[0]];
  const [inside, outside] = seen.has(state.map.cells[a].region) ? [a, b] : [b, a];
  const region = state.map.cells[inside].region;
  state.cells[inside].owner = null;
  state.cells[outside].owner = 1;
  state.cells[outside].force = 8;
  state.pressures.push({ power: 1, region, target: null, activeAt: 0 });

  const attacker = viewFor(state, 1).pressures.find((pressure) => pressure.region === region);
  assert.ok(attacker);
  assert.ok(attacker.advancing.includes(edge.joints[0]));
  const watcher = viewFor(state, 0).pressures.find((pressure) => pressure.region === region);
  assert.ok(watcher);
  assert.equal(watcher.commit, attacker.commit);
  assert.deepEqual([watcher.stalled, watcher.advancing], [[], []]);
});

test("the outline carries geometry and topology but no natural data", () => {
  const outline = outlineOf(createWorld({ seed: 1 }).map);
  assert.deepEqual(Object.keys(outline.cells[0]).sort(), ["position", "region"]);
  assert.deepEqual(Object.keys(outline.joints[0]).sort(), ["a", "b", "edge"]);
  assert.deepEqual(Object.keys(outline.edges[0]).sort(), ["a", "b", "id", "joints"]);
});
