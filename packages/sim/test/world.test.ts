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

test("every node can be reached from every other node", () => {
  for (const seed of SEEDS) {
    const { map } = createWorld({ seed });
    const reached = new Set([0]);
    const queue = [0];
    for (let head = 0; head < queue.length; head++) {
      for (const link of map.links[queue[head]]) {
        if (!reached.has(link.node)) {
          reached.add(link.node);
          queue.push(link.node);
        }
      }
    }
    assert.equal(reached.size, map.nodes.length, `seed ${seed}`);
  }
});

test("a world has about twenty regions and both wide and narrow edges", () => {
  for (const seed of SEEDS) {
    const { map } = createWorld({ seed });
    assert.ok(map.nodes.length >= 18 && map.nodes.length <= 24, `seed ${seed}`);
    assert.ok(
      map.edges.some((edge) => edge.kind === "land"),
      `seed ${seed}`,
    );
    assert.ok(
      map.edges.some((edge) => edge.kind !== "land"),
      `seed ${seed}`,
    );
  }
});

test("each power starts with one distinct capital and sees its surroundings", () => {
  for (const seed of SEEDS) {
    const state = createWorld({ seed, powers: 3 });
    const capitals = state.powers.map((power) => power.capital);
    assert.equal(new Set(capitals).size, 3, `seed ${seed}`);
    state.powers.forEach((power, id) => {
      assert.equal(state.nodes[power.capital].owner, id);
      assert.ok(power.explored[power.capital]);
      for (const link of state.map.links[power.capital]) {
        assert.ok(power.explored[link.node]);
      }
    });
    assert.equal(state.nodes.filter((node) => node.owner !== null).length, 3);
  }
});
