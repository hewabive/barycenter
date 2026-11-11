import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorld } from "../src/index.ts";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

test("the same seed produces the same world", () => {
  assert.deepEqual(createWorld({ seed: 7 }), createWorld({ seed: 7 }));
});

test("different seeds produce different worlds", () => {
  assert.notDeepEqual(createWorld({ seed: 7 }).map, createWorld({ seed: 8 }).map);
});

test("every cell can be reached from every other cell", () => {
  for (const seed of SEEDS) {
    const { map } = createWorld({ seed });
    const reached = new Set([0]);
    const queue = [0];
    for (let head = 0; head < queue.length; head++) {
      for (const link of map.links[queue[head]]) {
        if (!reached.has(link.cell)) {
          reached.add(link.cell);
          queue.push(link.cell);
        }
      }
    }
    assert.equal(reached.size, map.cells.length, `seed ${seed}`);
  }
});

test("a world has about twenty regions of uneven size", () => {
  for (const seed of SEEDS) {
    const { map } = createWorld({ seed });
    const sizes = map.regions.map((region) => region.cells.length);
    assert.ok(sizes.length >= 18 && sizes.length <= 30, `seed ${seed}`);
    assert.ok(Math.min(...sizes) <= 5, `seed ${seed}`);
    assert.ok(Math.max(...sizes) >= 15, `seed ${seed}`);
    assert.equal(
      sizes.reduce((sum, size) => sum + size, 0),
      map.cells.length,
    );
  }
});

test("every region is one piece of land", () => {
  for (const seed of SEEDS) {
    const { map } = createWorld({ seed });
    for (const region of map.regions) {
      const reached = new Set([region.cells[0]]);
      const queue = [region.cells[0]];
      for (let head = 0; head < queue.length; head++) {
        for (const link of map.links[queue[head]]) {
          if (map.joints[link.joint].edge === null && !reached.has(link.cell)) {
            reached.add(link.cell);
            queue.push(link.cell);
          }
        }
      }
      assert.equal(reached.size, region.cells.length, `seed ${seed}, region ${region.id}`);
      assert.ok(region.cells.includes(region.center));
    }
  }
});

test("an edge gathers the joints between two regions, wide and narrow", () => {
  for (const seed of SEEDS) {
    const { map } = createWorld({ seed });
    for (const joint of map.joints) {
      const from = map.cells[joint.a].region;
      const to = map.cells[joint.b].region;
      if (from === to) {
        assert.equal(joint.edge, null);
        assert.equal(joint.kind, "land");
        continue;
      }
      assert.notEqual(joint.edge, null);
      const edge = map.edges[joint.edge ?? 0];
      assert.deepEqual([edge.a, edge.b], [Math.min(from, to), Math.max(from, to)]);
      assert.ok(edge.joints.includes(joint.id));
    }
    const crossing = map.joints.filter((joint) => joint.edge !== null);
    assert.ok(crossing.some((joint) => joint.kind === "land"));
    assert.ok(crossing.some((joint) => joint.kind !== "land"));
  }
});

test("each power starts with the same few cells around its capital and sees its surroundings", () => {
  for (const seed of SEEDS) {
    const state = createWorld({ seed, powers: 3 });
    const homes = state.powers.map((power) => state.map.cells[power.capital].region);
    assert.equal(new Set(homes).size, 3, `seed ${seed}`);
    state.powers.forEach((power, id) => {
      const own = state.cells.filter((cell) => cell.owner === id);
      assert.equal(own.length, state.constants.startCells, `seed ${seed}`);
      assert.equal(state.cells[power.capital].owner, id);
      assert.equal(state.cells[power.capital].level, state.constants.startLevel);
      assert.ok(power.explored[homes[id]]);
      for (const neighbor of state.map.neighbors[homes[id]]) {
        assert.ok(power.explored[neighbor.region]);
      }
    });
  }
});
