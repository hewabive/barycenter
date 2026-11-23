import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type Body,
  createRandom,
  GIGAYEAR,
  JUPITER_MASS,
  kindled,
  type Physics,
  SUN_MASS,
  surveySystem,
} from "@barycenter/sim";
import { cellsOf, flameOf, flatnessOf, fringeOf, holeOf, hoopOf, livelyOf } from "../src/looks.ts";

const star = (suns: number, age: number) =>
  kindled(suns * SUN_MASS, age * GIGAYEAR, { next: () => 0.5 });

test("granules are as wide as the Sun's and narrower against the radius on a cooler star", () => {
  assert.ok(Math.abs(cellsOf(star(1, 4.57)) - 500) < 1);
  assert.ok(cellsOf(star(0.2, 4.57)) > 800 && cellsOf(star(0.2, 4.57)) < 1000);
  assert.ok(cellsOf(star(0.7, 4.57)) > cellsOf(star(1, 4.57)));
  assert.ok(cellsOf(star(1.2, 4.57)) < cellsOf(star(1, 4.57)));
});

test("a star is as lively as its age and its kind make it", () => {
  const sun = livelyOf(star(1, 4.57));
  assert.ok(sun > 0.1 && sun < 0.16, `the Sun at ${sun}`);
  assert.ok(livelyOf(star(1, 0.3)) > 0.4);
  assert.ok(livelyOf(star(0.2, 0.3)) > 0.95);
  assert.ok(livelyOf(star(1, 9)) < sun);
  assert.equal(livelyOf(star(2, 1)), 0);
  const drawn = kindled(SUN_MASS, 4.57 * GIGAYEAR, createRandom(7));
  assert.ok(livelyOf(drawn) >= 0 && livelyOf(drawn) < 0.25);
});

test("a star is drawn by what its life has made of it", () => {
  const flame = (suns: number, age: number) =>
    flameOf({ physics: star(suns, age) } as unknown as Body);
  const sun = flame(1, 4.57);
  assert.equal(sun.coarse, 0);
  assert.ok(sun.regions > 0 && sun.poles === 0);
  const giant = flame(1, 11.395);
  assert.ok(giant.cells < 20 && giant.coarse > 0.7, `a red giant has ${giant.cells} cells`);
  assert.ok(giant.grain > 2 * flame(0.3, 4.57).grain);
  assert.ok(giant.lively < sun.lively);
  const clump = flame(2, 1.9);
  assert.ok(clump.lively < 0.2, `a giant born hot has slowed to ${clump.lively}`);
  const hot = flame(20, 0.004);
  assert.ok(hot.kelvin > 30000 && hot.grain === 0 && hot.regions === 0 && hot.poles > 0);
  assert.ok(flame(5, 0.1).kelvin > flame(2, 1).kelvin);
  assert.equal(flame(15, 0.0155).poles, 0);
  for (const left of [flame(1, 12.5), flame(3, 10), flame(15, 0.0175)]) {
    assert.deepEqual(
      [left.grain, left.regions, left.poles, left.lively, left.coarse],
      [0, 0, 0, 0, 0],
    );
  }
  assert.ok(flame(3, 10).kelvin < 6000 && flame(1, 11.6).kelvin > 20000);
  assert.equal(holeOf(star(30, 0.01)), true);
  assert.equal(flatnessOf(star(30, 0.01)), 0);
  assert.equal(holeOf(star(15, 0.0175)) || holeOf(star(1, 12.5)) || holeOf(star(1, 4.57)), false);
});

test("a ring breaks into narrower and fainter bands as it thins", () => {
  const ringed = surveySystem(1, { settled: true, star: null }).bodies.find(
    (body) => body.parent !== null && body.physics.disks.some((disk) => disk.lasts > 0),
  );
  assert.ok(ringed !== undefined);
  const [ring] = ringed.physics.disks;
  const thinned = (depth: number): Body => ({
    ...ringed,
    physics: { ...ringed.physics, disks: [{ ...ring, depth }] },
  });
  const looks = [2, 0.5, 0.05, 0.005].map((depth) => hoopOf(thinned(depth)));
  const [heavy, broad, thin, faint] = looks.map((hoop) => hoop?.parts ?? []);
  assert.ok(broad.length >= 3 && looks.every((hoop) => hoop?.parts.length === broad.length));
  const laden = (parts: typeof broad) =>
    parts.reduce((sum, [from, to, dense]) => sum + (to - from) * dense, 0);
  const wide = (parts: typeof broad) => parts.reduce((sum, [from, to]) => sum + to - from, 0);
  assert.ok(Math.abs(laden(heavy) / laden(broad) - 4) < 1e-9);
  assert.ok(Math.abs(laden(thin) / laden(broad) - 0.1) < 1e-9);
  assert.ok(Math.abs(laden(faint) / laden(broad) - 0.01) < 1e-9);
  assert.equal(wide(heavy), wide(broad));
  assert.ok(wide(thin) < 0.4 * wide(broad) && wide(faint) < 0.5 * wide(thin));
  broad.forEach(([from, to, dense], at) => {
    assert.ok(thin[at][0] >= from - 1e-12 && thin[at][1] <= to + 1e-12);
    assert.ok(thin[at][2] < dense && faint[at][2] < thin[at][2]);
  });
  const gassy = { ...ring, gas: 1, lasts: 0 };
  assert.equal(hoopOf({ ...ringed, physics: { ...ringed.physics, disks: [gassy] } }), null);
});

test("the fringe of a gas giant is as deep as its air is high, and hides its clouds at the limb", () => {
  const wrap = (mass: number, radius: number, heat: number) =>
    ({ mass: mass * JUPITER_MASS, radius, heat }) as Physics;
  const cold = fringeOf(wrap(1, 6.9911e7, 125), 0.07);
  const hot = fringeOf(wrap(0.3, 8.4e7, 1500), 0.1);
  assert.ok(cold.top > 0.001 && cold.top < 0.004, `a Jupiter at ${cold.top}`);
  assert.ok(hot.top > 0.05 && hot.top < 0.12, `a hot light giant at ${hot.top}`);
  for (const fringe of [cold, hot, fringeOf(wrap(0.05, 2.5e7, 60), 0.4)]) {
    assert.ok(Math.exp(-fringe.depth) < 0.01);
    const faint = 1 - Math.exp(-fringe.depth * Math.exp(-fringe.top / fringe.thin));
    assert.ok(faint > 0.005 && faint < 0.011, `ends at ${faint}`);
  }
  assert.ok(fringeOf(wrap(1e-6, 8.4e7, 1500), 0.1).top < 0.25);
});
