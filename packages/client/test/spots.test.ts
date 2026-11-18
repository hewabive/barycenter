import assert from "node:assert/strict";
import { test } from "node:test";
import type { Flame } from "../src/looks.ts";
import { MEMBER_ROOM, REGION_ROOM } from "../src/shaders.ts";
import { createActivity, tangentsOf } from "../src/spots.ts";

const flame: Flame = {
  kelvin: 5800,
  tint: 0xffb663,
  grain: 0.07,
  chill: 0.58,
  poles: 0,
  regions: 16,
  girth: 0.0085,
  belt: 0.55,
};

test("a spot stays inside the circle of its region", () => {
  let seen = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const activity = createActivity(seed * 7717, flame);
    for (let tick = 0; tick < 6000; tick += 131) {
      activity.turn(tick);
      for (let region = 0; region < REGION_ROOM; region++) {
        const reach = activity.regions[4 * region + 3];
        for (let part = 0; part < MEMBER_ROOM; part++) {
          const slot = 4 * (region * MEMBER_ROOM + part);
          const girth = activity.spots[slot + 2];
          if (girth === 0) {
            continue;
          }
          seen += 1;
          const away = Math.hypot(activity.spots[slot], activity.spots[slot + 1]);
          assert.ok(reach > 0 && reach < 0.6, `region of ${reach}`);
          assert.ok(away + 3 * girth <= reach, `spot ${away} + ${girth} in ${reach}`);
          assert.ok(activity.spots[slot + 3] >= 0 && activity.spots[slot + 3] <= 1);
        }
      }
    }
  }
  assert.ok(seen > 10000);
});

test("the spots of a tick do not depend on the ticks looked at before", () => {
  const one = createActivity(4242, flame);
  const other = createActivity(4242, flame);
  for (const tick of [0, 5000, 90, 2600, 2601, 40000]) {
    one.turn(tick);
  }
  one.turn(1234);
  other.turn(1234);
  assert.deepEqual(one.regions, other.regions);
  assert.deepEqual(one.plages, other.plages);
  assert.deepEqual(one.spots, other.spots);
});

test("a star with no regions has no spots", () => {
  const activity = createActivity(7, { ...flame, regions: 0 });
  activity.turn(500);
  assert.ok(activity.regions.every((value) => value === 0));
  assert.ok(activity.spots.every((value) => value === 0));
});

test("the two tangents of a place are square to it and to each other", () => {
  for (const middle of [
    [1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0.6, 0.64, 0.48],
  ] as [number, number, number][]) {
    const [first, second] = tangentsOf(middle);
    const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    assert.ok(Math.abs(dot(first, middle)) < 1e-12);
    assert.ok(Math.abs(dot(second, middle)) < 1e-12);
    assert.ok(Math.abs(dot(first, second)) < 1e-12);
    assert.ok(Math.abs(dot(first, first) - 1) < 1e-12);
    assert.ok(Math.abs(dot(second, second) - 1) < 1e-12);
  }
});
