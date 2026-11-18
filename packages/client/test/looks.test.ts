import assert from "node:assert/strict";
import { test } from "node:test";
import { createRandom, GIGAYEAR, kindled, SUN_MASS } from "@barycenter/sim";
import { cellsOf, livelyOf } from "../src/looks.ts";

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
