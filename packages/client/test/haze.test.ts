import assert from "node:assert/strict";
import { test } from "node:test";
import type { Disk } from "@barycenter/sim";
import {
  above,
  between,
  HAZE_COLUMNS,
  type Layer,
  profileOf,
  SHADE_COLUMNS,
  SHADE_REACH,
  SHADE_ROWS,
  shadeOf,
  shadowAt,
  strip,
} from "../src/haze.ts";

const disk = (inner: number, outer: number, given: Partial<Disk>): Disk => ({
  inner,
  outer,
  mass: 1,
  depth: 1,
  ice: 0,
  gas: 1,
  grain: 1e-5,
  height: 0.05,
  flare: 0.25,
  fade: 0,
  since: 0,
  lasts: 0,
  wreck: null,
  ...given,
});

const layer = (inner: number, outer: number, given: Partial<Disk>, thinned = 0): Layer => ({
  lane: { inner, outer, year: 1 },
  disk: disk(inner, outer, given),
  thinned,
});

const columnAt = (profile: { inner: number; outer: number }, reach: number) =>
  Math.round(
    ((HAZE_COLUMNS - 1) * Math.log(reach / profile.inner)) /
      Math.log(profile.outer / profile.inner),
  );

test("the share of a layer above a height follows the bell curve out to its far tail", () => {
  const exact = [0.5, 0.158655, 0.0227501, 1.3499e-3, 3.1671e-5, 2.8665e-7];
  exact.forEach((share, height) => {
    assert.ok(Math.abs(above(height) / share - 1) < 0.005, `${height}: ${above(height)}`);
    assert.ok(Math.abs(above(-height) + above(height) - 1) < 1e-6);
  });
  assert.ok(Math.abs(between(-9, 9) - 1) < 1e-9);
  assert.ok(Math.abs(between(-1, 1) - 0.6827) < 0.01);
  assert.equal(between(2, 5), between(-5, -2));
  assert.equal(between(1, 3), between(3, 1));
});

test("one stretch of a ray gives the classic brightness of a lit layer", () => {
  const depth = 0.7;
  const sun = 0.2;
  const eye = 0.6;
  const lit = strip(0, depth / sun, depth / eye);
  const exact = (sun / (sun + eye)) * (1 - Math.exp(-depth * (1 / sun + 1 / eye)));
  assert.ok(Math.abs(lit / exact - 1) < 1e-12, `${lit} ${exact}`);
  const dark = strip(depth / sun, 0, depth / eye);
  const through = (sun / (sun - eye)) * (Math.exp(-depth / sun) - Math.exp(-depth / eye));
  assert.ok(Math.abs(dark / through - 1) < 1e-12, `${dark} ${through}`);
  assert.ok(Math.abs(strip(0, 1e6, 1e5) - 1 / 11) < 1e-6);
  assert.ok(Math.abs(strip(0, 1e-9 / sun, 1e-9 / eye) / (1e-9 / eye) - 1) < 1e-6);
  const even = strip(depth / sun, 0, depth / sun);
  assert.ok(Math.abs(even / ((depth / sun) * Math.exp(-depth / sun)) - 1) < 1e-3);
  const dense = [0.05, 0.3, 1, 3].map((thick) => strip(thick / sun, 0, thick / eye));
  assert.ok(dense[1] > dense[0] && dense[1] > dense[2] && dense[2] > dense[3]);
});

test("a planet thins the dust along its orbit and leaves soft walls beside it", () => {
  const open = (thinned: number) =>
    profileOf([
      layer(10, 20, { depth: 100, height: 0.04 }, thinned),
      layer(26, 60, { depth: 30, height: 0.05 }),
    ]);
  const empty = open(0);
  const thin = open(0.05);
  const full = open(1);
  const lane = columnAt(empty, 23);
  const before = columnAt(empty, 18);
  const after = columnAt(empty, 30);
  assert.ok(empty.dense[lane] < 0.01 * empty.dense[before], `${empty.dense[lane]}`);
  assert.ok(thin.dense[lane] > 0.02 * thin.dense[before] && thin.dense[lane] < thin.dense[after]);
  assert.ok(full.dense[lane] < full.dense[before] && full.dense[lane] > full.dense[after]);
  const wall = columnAt(empty, 20);
  assert.ok(empty.dense[wall] > 0.3 * empty.dense[before]);
  assert.ok(empty.dense[wall] < 0.7 * empty.dense[before]);
  assert.ok(empty.dense[0] < 1e-3 * empty.dense[before]);
  assert.ok(empty.dense[HAZE_COLUMNS - 1] < 1e-3 * empty.dense[after]);
  assert.ok(empty.tall.every((stand) => stand > 0.02 && stand < 0.08));
  assert.ok(empty.far.every((far, column) => column === 0 || far > empty.far[column - 1]));
});

test("a drawn lane keeps the true distances of the disk it stands for", () => {
  const drawn = { lane: { inner: 10, outer: 20, year: 1 }, disk: disk(1e11, 16e11, {}) };
  const profile = profileOf([{ ...drawn, thinned: 0 }]);
  assert.ok(Math.abs(profile.far[columnAt(profile, 10)] / 1e11 - 1) < 0.02);
  assert.ok(Math.abs(profile.far[columnAt(profile, 20)] / 16e11 - 1) < 0.02);
  assert.ok(Math.abs(profile.far[columnAt(profile, Math.sqrt(200))] / 4e11 - 1) < 0.02);
  const inside = profile.dense[columnAt(profile, 11)] / profile.dense[columnAt(profile, 18)];
  assert.ok(inside > 20, `${inside}`);
});

test("starlight skims a flat ring and is stopped in the skin of a thick flared disk", () => {
  const lamp = 0.4;
  const ring = profileOf([layer(8, 12, { depth: 0.2, height: 1e-7, flare: -1, gas: 0 })]);
  const flat = shadeOf(ring, lamp);
  const at = Math.round(
    ((SHADE_COLUMNS - 1) * Math.log(10 / ring.inner)) / Math.log(ring.outer / ring.inner),
  );
  const reach = ring.inner * (ring.outer / ring.inner) ** (at / (SHADE_COLUMNS - 1));
  const skimmed = Math.exp(flat.depth[at]);
  const thick = ring.dense[columnAt(ring, reach)];
  assert.ok(Math.abs(skimmed / ((0.5 * thick * reach) / lamp) - 1) < 0.05, `${skimmed}`);
  assert.ok(flat.deepest > 1 && flat.brims.every((brim) => brim === 4.5));

  const cloud = profileOf([layer(2, 200, { depth: 300, height: 0.05, flare: 0.25 })]);
  const shade = shadeOf(cloud, lamp);
  const skin = (share: number) => {
    const column = Math.round(share * (SHADE_COLUMNS - 1));
    let row = SHADE_ROWS - 1;
    while (row > 0 && shade.depth[row * SHADE_COLUMNS + column] < 0) {
      row--;
    }
    return (SHADE_REACH * row) / (SHADE_ROWS - 1);
  };
  assert.ok(skin(0.3) > 3 && skin(0.3) < 6, `${skin(0.3)}`);
  assert.ok(skin(0.8) > 2 && skin(0.8) < skin(0.3), `${skin(0.8)}`);
  assert.ok(shade.deepest > 1e4 && shade.top > 60 && shade.top < 140, `${shade.top}`);
  assert.ok(shade.steep > 0.2 && shade.steep < 0.5);
  assert.ok(shade.depth[Math.round(0.5 * SHADE_COLUMNS)] > Math.log(1e3));
});

test("dust heaped beyond a lane stands out of the disk around it", () => {
  const layers = [layer(10, 20, { depth: 100 }, 0.01), layer(26, 60, { depth: 30 })];
  const plain = profileOf(layers);
  const heaped = profileOf(layers, [{ at: 30, rise: 2 }]);
  const crest = columnAt(plain, 30);
  assert.ok(Math.abs(heaped.dense[crest] / plain.dense[crest] - 3) < 0.05);
  const away = columnAt(plain, 45);
  assert.ok(Math.abs(heaped.dense[away] / plain.dense[away] - 1) < 0.01);
  assert.ok(heaped.dense[columnAt(plain, 15)] === plain.dense[columnAt(plain, 15)]);
});

test("a body deep in a thick disk gets no light of its star, and one above it or in its hole does", () => {
  const cloud = profileOf([layer(2, 200, { depth: 300, height: 0.05, flare: 0.25 })]);
  const shade = shadeOf(cloud, 0.4);
  const stand = (reach: number) => cloud.tall[columnAt(cloud, reach)] * reach;
  assert.ok(shadowAt(cloud, shade, 50, 0) > 100);
  assert.ok(shadowAt(cloud, shade, 50, 0.5 * stand(50)) > 30);
  assert.ok(shadowAt(cloud, shade, 50, -6.5 * stand(50)) < 0.05);
  assert.equal(shadowAt(cloud, shade, 1, 0), 0);
  assert.ok(shadowAt(cloud, shade, 400, 0) > 100);
  assert.ok(shadowAt(cloud, shade, 400, 13 * stand(200)) < 0.05);
  const thin = profileOf([layer(20, 30, { depth: 1e-4, height: 0.05, flare: 0, gas: 0 })]);
  assert.ok(shadowAt(thin, shadeOf(thin, 0.4), 28, 0) < 0.01);
});
