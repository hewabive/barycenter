import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bowlOf,
  createRandom,
  elevationAt,
  GROUND_GRAIN,
  groundAt,
  normalize,
  PIT_SHAPE,
  pitsAt,
  pitsOf,
  seaCover,
  surveySystem,
  wrapped,
} from "../src/index.ts";
import { scatter } from "../src/sphere.ts";

const bodies = [1, 2, 4, 6, 7].flatMap(
  (seed) => surveySystem(seed, { settled: true, star: null }).bodies,
);
const pocked = bodies.filter((body) => body.relief.craters > 0.5);

test("a bare old body keeps its craters and air, a sea and gas leave none", () => {
  assert.ok(pocked.length >= 10);
  for (const body of bodies) {
    const { physics, relief } = body;
    assert.ok(relief.craters >= 0 && relief.craters <= 1);
    if (wrapped(physics)) {
      assert.equal(relief.craters, 0);
      assert.equal(relief.height, 0);
      continue;
    }
    assert.ok(relief.height > 0 && relief.height <= 0.05 * physics.radius + 1);
    if (physics.life > 0 || seaCover(physics) > 0 || physics.air > 1e5) {
      assert.equal(relief.craters, 0);
    }
    if (physics.air === 0 && physics.heat < 600 && physics.mass < 1e23 && physics.ice === 0) {
      assert.ok(relief.craters > 0.4, `${body.name} has ${relief.craters}`);
    }
  }
});

test("craters are fixed by the seed and the place and are absent where none are kept", () => {
  const body = pocked[0];
  const { cover, bowl } = pitsOf(body);
  const grain = GROUND_GRAIN / body.physics.radius;
  const points = scatter(600, createRandom(9));
  const depths = points.map((at) => pitsAt(body.seed, cover, bowl, at, grain));
  assert.deepEqual(
    points.map((at) => pitsAt(body.seed, cover, bowl, { ...at }, grain)),
    depths,
  );
  assert.ok(points.every((at) => pitsAt(body.seed, 0, bowl, at, grain) === 0));
  const other = points.map((at) => pitsAt(body.seed + 1, cover, bowl, at, grain));
  assert.ok(other.filter((depth, index) => depth !== depths[index]).length > 500);
  assert.ok(depths.filter((depth) => depth < 0).length > 100);
  assert.ok(depths.filter((depth) => depth > 0).length > 100);
});

test("the ground has no step where the lattice of craters changes cell", () => {
  const random = createRandom(21);
  for (const body of pocked.slice(0, 4)) {
    const radius = body.physics.radius;
    const points = scatter(400, random);
    for (const at of points) {
      const nudge = 0.02 / radius;
      const beside = normalize({
        x: at.x + nudge * (random.next() - 0.5),
        y: at.y + nudge * (random.next() - 0.5),
        z: at.z + nudge * (random.next() - 0.5),
      });
      const change = Math.abs(groundAt(body, beside) - groundAt(body, at));
      assert.ok(change < 0.2, `${body.name} steps by ${change} m`);
    }
  }
});

test("a coarser grain drops small craters and keeps large ones", () => {
  const body = pocked[1];
  const { cover, bowl } = pitsOf(body);
  const points = scatter(500, createRandom(33));
  const fine = 1e-6;
  const coarse = 1e-3;
  const least = PIT_SHAPE.blurTo * coarse;
  let moved = 0;
  for (const at of points) {
    const change = Math.abs(
      pitsAt(body.seed, cover, bowl, at, fine) - pitsAt(body.seed, cover, bowl, at, coarse),
    );
    assert.ok(change < 4 * least);
    moved += change > 0 ? 1 : 0;
  }
  assert.ok(moved > 100);
});

test("ground without craters follows the relief within its fine detail", () => {
  const system = surveySystem(3, { settled: true, star: null });
  const home = system.bodies[system.home ?? 0];
  assert.equal(home.relief.craters, 0);
  for (const at of scatter(300, createRandom(4))) {
    const coarse = home.relief.height * elevationAt(home.seed, home.relief, at);
    assert.ok(Math.abs(groundAt(home, at) - coarse) < 0.08 * home.relief.height);
    assert.equal(groundAt(home, at, 0.1), coarse);
  }
});

test("a small body digs bowls and a heavy one flat floors", () => {
  const small = pocked.find((body) => body.physics.radius < 5e4);
  const large = pocked.find((body) => body.physics.radius > 1e6);
  assert.ok(small !== undefined && large !== undefined);
  assert.ok(bowlOf(small.physics) > PIT_SHAPE.most);
  assert.ok(bowlOf(large.physics) < 0.02);
});
