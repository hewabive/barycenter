import assert from "node:assert/strict";
import { test } from "node:test";
import { type Cloud, diskOf, GROWN_MOST, holeOf, nebulaOf, type Station } from "../src/disks.ts";
import { ASTRONOMICAL_UNIT, EARTH_MASS, SUN_MASS, YEAR } from "../src/physics.ts";

const AU = ASTRONOMICAL_UNIT;
const MYR = 1e6 * YEAR;

const cloud = (age: number, stations: Station[] = []): Cloud => ({
  inner: 0.05 * AU,
  outer: 60 * AU,
  reach: 60 * AU,
  centre: SUN_MASS,
  frost: 2.7 * AU,
  age: age * MYR,
  airy: 4 * MYR,
  stations,
});

const planet = (orbit: number, share: number, earths: number): Station => ({
  orbit: orbit * AU,
  share,
  mass: share * earths * EARTH_MASS,
  belt: null,
});

test("a young disk is one sheet of dust and gas, as heavy as the nebula of the Sun", () => {
  const [disk, ...rest] = nebulaOf(cloud(0.3));
  assert.equal(rest.length, 0);
  assert.equal(disk.inner, 0.05 * AU);
  assert.equal(disk.outer, 60 * AU);
  assert.ok(disk.mass > 40 * EARTH_MASS && disk.mass < 150 * EARTH_MASS, `${disk.mass}`);
  assert.ok(disk.gas > 0.01 * SUN_MASS && disk.gas < 0.02 * SUN_MASS);
  assert.ok(disk.depth > 0.3 && disk.depth < 3);
  assert.ok(disk.ice > 0.4 && disk.ice < 0.6);
});

test("a growing body clears a lane as wide as its reach and takes the dust beside it", () => {
  const widths = [0.1, 0.5, 1].map((share) => {
    const disks = nebulaOf(cloud(1, [planet(1, 0.02, 1), planet(5, share, 300)]));
    const inside = disks.findLast((disk) => disk.outer < 5 * AU);
    const outside = disks.find((disk) => disk.inner > 5 * AU);
    assert.ok(inside !== undefined && outside !== undefined);
    assert.ok(disks.every((disk) => disk.outer <= 5 * AU || disk.inner >= 5 * AU));
    return { lane: outside.inner - inside.outer, left: outside.mass };
  });
  assert.ok(widths[0].lane < widths[1].lane && widths[1].lane < widths[2].lane);
  assert.ok(Math.abs(widths[2].lane / (8 * 5 * AU * Math.cbrt((300 * 3e-6) / 3)) - 1) < 0.02);
  assert.ok(widths[0].left > widths[1].left && widths[1].left > widths[2].left);
  const whole = nebulaOf(cloud(1, [planet(1, 1, 1), planet(5, 1, 300)]));
  assert.ok(whole.every((disk) => disk.depth === 0 && disk.gas > 0));
});

test("the gas thins, then goes from the inside out, and the dust goes with it", () => {
  const gas = (age: number) => nebulaOf(cloud(age)).reduce((sum, disk) => sum + disk.gas, 0);
  assert.ok(gas(0.3) > gas(2) && gas(2) > gas(3.1) && gas(3.1) > gas(3.6) && gas(3.6) > 0);
  assert.equal(gas(4), 0);
  assert.equal(holeOf(cloud(3)), 0.05 * AU);
  assert.equal(holeOf(cloud(4)), 60 * AU);
  const half = cloud(3.6);
  const hole = holeOf(half);
  assert.ok(hole > 0.05 * AU && hole < 60 * AU);
  const [cleared, dusty, ...more] = nebulaOf(half);
  assert.equal(more.length, 0);
  assert.equal(cleared.outer, hole);
  assert.equal(dusty.inner, hole);
  assert.ok(cleared.gas === 0 && dusty.gas > 0);
  assert.ok(cleared.depth < 0.1 && dusty.depth > 0.3);
});

test("what is left in the end is the belt the system keeps", () => {
  const belt = diskOf(2.1 * AU, 3.3 * AU, 0.05, { mass: 3e-4 * EARTH_MASS });
  const here: Station = { orbit: Math.sqrt(2.1 * 3.3) * AU, share: 0, mass: 0, belt };
  const stations = [planet(1, 1, 1), here, planet(5.2, 1, 318)];
  const at = (age: number) => nebulaOf(cloud(age, stations));
  const young = at(10).find((disk) => disk.outer > 2.2 * AU && disk.inner < 3.2 * AU);
  assert.ok(young !== undefined);
  assert.ok(young.inner < belt.inner && young.outer > belt.outer && young.mass > 100 * belt.mass);
  assert.ok(young.depth > 1e4 * belt.depth && young.depth < 0.1);
  const [last, ...others] = at(99.999);
  assert.equal(others.length, 0);
  for (const key of ["inner", "outer", "mass", "depth", "ice"] as const) {
    assert.ok(Math.abs(last[key] / belt[key] - 1) < 1e-3, `${key} ${last[key]} ${belt[key]}`);
  }
  assert.equal(last.gas, 0);
  assert.ok(GROWN_MOST === 100 * MYR);
});
