import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ASTRONOMICAL_UNIT,
  clearedBy,
  type Disk,
  EARTH_MASS,
  SUN_MASS,
  TIME_POWER,
} from "@barycenter/sim";
import { Color, DataUtils, type ShaderMaterial } from "three";
import { createBelt, createHaze, createJet, createSwarm } from "../src/belts.ts";
import { HAZE_COLUMNS } from "../src/haze.ts";

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
  since: 0,
  lasts: 0,
  wreck: null,
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

test("the streaks of a layer turn once in the year of their distance and are new each turn", () => {
  const disk = belt({ inner: AU, outer: 9 * AU, depth: 50, gas: EARTH_MASS, height: 0.03 });
  const haze = createHaze(
    [{ lane: { inner: 30, outer: 70, year: 400 }, disk, thinned: 0 }],
    [],
    { girth: 5, shine: new Color(1, 1, 1), level: () => 1, ember: () => 0 },
    false,
  );
  assert.ok(haze !== null);
  const spins = (haze.mesh.material as ShaderMaterial).uniforms.spins.value;
  const read = (column: number) =>
    [0, 1, 2, 3].map((part) => DataUtils.fromHalfFloat(spins.image.data[4 * column + part]));
  const column = Math.round(
    ((HAZE_COLUMNS - 1) * Math.log(Math.sqrt(30 * 70) / 30)) / Math.log(70 / 30),
  );
  const real = AU * 9 ** (Math.log(Math.sqrt(30 * 70) / 30) / Math.log(70 / 30));
  const year = 400 * (real / (5 * AU)) ** (1.5 * TIME_POWER);
  haze.turn(0.25 * year, 0.001);
  const quarter = read(column);
  assert.ok(Math.abs(quarter[0]) < 0.1 && quarter[1] > 0.95, `${quarter}`);
  assert.deepEqual(quarter.slice(2), [0, 0]);
  haze.turn(1.75 * year, 0.001);
  const later = read(column);
  assert.ok(Math.abs(later[0]) < 0.1 && later[1] < -0.95, `${later}`);
  assert.deepEqual(later.slice(2), [1, 2]);
  const near = read(column - 60);
  const far = read(column + 60);
  assert.ok(near[2] > later[2] && far[2] <= later[2]);
});

test("a planet in a lane of a disk has a swarm, and a heavy one holds two camps on its orbit", () => {
  const lane = { inner: 80, outer: 130, year: 900 };
  const light = createSwarm(lane, 100, 0, 0.01, 0.1, 5, new Color(1, 1, 1), false);
  const heavy = createSwarm(lane, 100, 1, 0.01, 0.1, 5, new Color(1, 1, 1), false);
  const read = (swarm: typeof light) => {
    const spots = swarm.points.geometry.getAttribute("position");
    const camps = swarm.points.geometry.getAttribute("camp");
    return Array.from({ length: spots.count }, (_, index) => ({
      reach: spots.getX(index),
      aside: spots.getY(index),
      lean: spots.getZ(index),
      camp: camps.getX(index),
    }));
  };
  const free = read(light);
  assert.ok(free.length > 100 && free.every(({ camp }) => camp === 0));
  assert.ok(free.every(({ reach }) => reach >= 80 && reach <= 130));
  assert.ok(free.every(({ lean }) => Math.abs(lean) <= 0.03));
  const held = read(heavy).filter(({ camp }) => camp !== 0);
  assert.equal(held.length, 200);
  assert.equal(held.filter(({ camp }) => camp > 0).length, 100);
  assert.ok(held.every(({ reach }) => Math.abs(reach / 100 - 1) <= 0.02));
  assert.ok(held.every(({ aside }) => aside > -0.46 && aside < 0.91));
  assert.equal(read(heavy).length - held.length, free.length);
  const sparse = createSwarm(lane, 100, 1, 0.01, 0.1, 5, new Color(1, 1, 1), true);
  const count = sparse.points.geometry.getAttribute("camp").count;
  assert.ok(Math.abs(count - 0.5 * read(heavy).length) <= 1, `${count}`);
});

test("a jet shows its foot from near, grows whole outside its disk, and its knots come round", () => {
  const disk = belt({ inner: AU, outer: 9 * AU, depth: 50, gas: EARTH_MASS, height: 0.03 });
  const haze = createHaze(
    [{ lane: { inner: 30, outer: 70, year: 400 }, disk, thinned: 0 }],
    [],
    { girth: 5, shine: new Color(1, 1, 1), level: () => 1, ember: () => 0 },
    false,
  );
  assert.ok(haze !== null);
  const jet = createJet(210, 1.2, 400, 0.6, haze.shroud);
  const uniforms = (jet.mesh.material as ShaderMaterial).uniforms;
  assert.ok(uniforms.lanes.value === haze.shroud.lanes && uniforms.veiled.value === 1);
  const span = haze.shroud.span.y;
  jet.turn(0, 0.2 * span);
  assert.ok(jet.mesh.visible && Math.abs(uniforms.top.value - (0.1 * span) / 210) < 1e-9);
  jet.turn(0, span);
  assert.ok(Math.abs(uniforms.top.value - (0.5 * span) / 210) < 1e-9);
  jet.turn(0, 1.85 * span);
  const foot = (0.925 * span) / 210;
  assert.ok(Math.abs(uniforms.top.value - (foot + 0.5 * (1 - foot))) < 1e-9);
  jet.turn(36 * 400 * 2.25, 3 * span);
  assert.ok(uniforms.top.value === 1 && Math.abs(uniforms.flow.value - 0.25) < 1e-9);
  assert.equal(jet.mesh.geometry.getAttribute("position").count, 2 * 2 * 49);
});
