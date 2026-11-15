import assert from "node:assert/strict";
import { test } from "node:test";
import {
  angleBetween,
  createWorld,
  elevationAt,
  positionOf,
  slerp,
  type Vector,
} from "../src/index.ts";
import { sidesOf } from "../src/sphere.ts";

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

test("land is where the relief of the home body rises above its sea", () => {
  for (const seed of SEEDS) {
    const { map } = createWorld({ seed });
    const home = map.system.bodies[map.system.home];
    assert.equal(home.kind, "terran");
    const sea = home.relief.sea;
    assert.ok(sea !== null);
    for (const cell of map.cells) {
      const height = elevationAt(home.seed, home.relief, cell.position);
      assert.ok(height > sea, `seed ${seed}, cell ${cell.id}`);
      assert.equal(cell.terrain === "mountain", height > home.relief.peak);
    }
    const land = map.cells.length / 400;
    assert.ok(Math.abs(land - 0.62) < 0.01, `seed ${seed}`);
  }
});

test("cells joined by land meet on dry ground and a strait crosses water", () => {
  for (const seed of SEEDS) {
    const { map } = createWorld({ seed });
    const home = map.system.bodies[map.system.home];
    const dry = (at: Vector) => elevationAt(home.seed, home.relief, at) > (home.relief.sea ?? 0);
    const sides = new Map(
      sidesOf(map.cells.map((cell) => cell.position)).map((side) => [`${side.a}:${side.b}`, side]),
    );
    assert.ok(sides.size >= map.joints.length);
    for (const joint of map.joints) {
      const side = sides.get(`${Math.min(joint.a, joint.b)}:${Math.max(joint.a, joint.b)}`);
      assert.ok(side, `seed ${seed}, joint ${joint.id}`);
      const shore = Array.from({ length: 201 }, (_, step) => slerp(side.from, side.to, step / 200));
      const near = shore.filter((at) => angleBetween(at, map.cells[joint.a].position) <= map.reach);
      assert.equal(near.some(dry), joint.kind !== "strait", `seed ${seed}, joint ${joint.id}`);
    }
  }
});

test("a system has one star, a home body and others around them", () => {
  for (const seed of SEEDS) {
    const { system } = createWorld({ seed }).map;
    assert.deepEqual(
      system.bodies.map((body) => body.id),
      system.bodies.map((_, index) => index),
    );
    assert.equal(system.bodies.filter((body) => body.kind === "star").length, 1);
    assert.equal(new Set(system.bodies.map((body) => body.name)).size, system.bodies.length);
    assert.ok(system.bodies.length >= 6);
    for (const body of system.bodies) {
      const at = positionOf(system, body.id, 1234);
      if (body.parent === null) {
        assert.deepEqual(at, { x: 0, y: 0, z: 0 });
        continue;
      }
      const center = positionOf(system, body.parent, 1234);
      const away = Math.hypot(at.x - center.x, at.y - center.y, at.z - center.z);
      assert.ok(Math.abs(away - body.orbit) < 1e-9);
      assert.ok(body.orbit > body.radius + system.bodies[body.parent].radius);
      const later = positionOf(system, body.id, 1234 + body.year);
      const moved = positionOf(system, body.parent, 1234 + body.year);
      const drift = Math.hypot(
        later.x - moved.x - at.x + center.x,
        later.z - moved.z - at.z + center.z,
      );
      assert.ok(drift < 1e-6 * body.orbit);
    }
  }
});

test("relief is the same at the same place and smooth between places", () => {
  const { system } = createWorld({ seed: 3 }).map;
  const home = system.bodies[system.home];
  const at = { x: 0.36, y: 0.48, z: 0.8 };
  const height = elevationAt(home.seed, home.relief, at);
  assert.equal(elevationAt(home.seed, home.relief, { ...at }), height);
  assert.notEqual(elevationAt(home.seed + 1, home.relief, at), height);
  const beside = elevationAt(home.seed, home.relief, { x: 0.36, y: 0.4801, z: 0.8 });
  assert.ok(Math.abs(beside - height) < 0.01);
});
