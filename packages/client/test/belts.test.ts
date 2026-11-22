import assert from "node:assert/strict";
import { test } from "node:test";
import { ASTRONOMICAL_UNIT, clearedBy, type Disk, EARTH_MASS, SUN_MASS } from "@barycenter/sim";
import { Color } from "three";
import { createBelt } from "../src/belts.ts";

const AU = ASTRONOMICAL_UNIT;
const belt = (given: Partial<Disk>): Disk => ({
  inner: 2.1 * AU,
  outer: 3.3 * AU,
  mass: 4e-4 * EARTH_MASS,
  depth: 1e-7,
  ice: 0.05,
  gas: 0,
  grain: 50,
  height: 0.137,
  flare: 0,
  fade: 0,
  ...given,
});
const lane = { inner: 40, outer: 52, year: 1 };
const reaches = (points: ReturnType<typeof createBelt>["points"]) => {
  const spots = points.geometry.getAttribute("position");
  return Array.from({ length: spots.count }, (_, index) => ({
    real: 2.1 * (spots.getX(index) / lane.inner) ** (Math.log(3.3 / 2.1) / Math.log(52 / 40)),
    lean: spots.getZ(index),
  }));
};

test("a belt keeps no bodies where they would keep time with a giant outside it", () => {
  const disk = belt({});
  const cleared = clearedBy(disk, [{ mass: 318 * EARTH_MASS, orbit: 5.2 * AU }], SUN_MASS);
  const plain = reaches(createBelt(lane, disk, 7, new Color(1, 1, 1), false).points);
  const swept = reaches(createBelt(lane, disk, 7, new Color(1, 1, 1), false, cleared).points);
  const inside = (list: typeof plain) =>
    list.filter(({ real }) =>
      cleared.some(({ at, wide }) => Math.abs((real * AU) / at - 1) < wide),
    );
  assert.equal(plain.length, swept.length);
  assert.ok(inside(plain).length > 20, `${inside(plain).length}`);
  assert.equal(inside(swept).length, 0);
  assert.ok(swept.every(({ real }) => real >= 2.1 - 1e-6 && real <= 3.3 + 1e-6));
});

test("the bodies of a belt lean as its disk is thick, and show once its dust is thin", () => {
  const leans = reaches(createBelt(lane, belt({}), 3, new Color(1, 1, 1), false).points);
  const mean = Math.sqrt(leans.reduce((sum, { lean }) => sum + lean ** 2, 0) / leans.length);
  assert.ok(Math.abs(mean / (Math.SQRT2 * 0.137) - 1) < 0.1, `${mean}`);
  const shown = (given: Partial<Disk>) =>
    createBelt(lane, belt(given), 3, new Color(1, 1, 1), false).points.visible;
  assert.equal(shown({ depth: 1e-7 }), true);
  assert.equal(shown({ depth: 3e-4 }), true);
  assert.equal(shown({ depth: 5e-3 }), false);
  assert.equal(shown({ depth: 1e-7, gas: 1e20 }), false);
});
