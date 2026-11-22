import assert from "node:assert/strict";
import { test } from "node:test";
import type { Flame } from "../src/looks.ts";
import { createProminences } from "../src/prominences.ts";
import { PROMINENCE_ROOM } from "../src/shaders.ts";

const flame: Flame = {
  kelvin: 5800,
  tint: 0xffb663,
  grain: 0.07,
  chill: 0.58,
  poles: 0,
  regions: 16,
  girth: 0.0085,
  belt: 0.55,
  lively: 0.134,
  vigor: 0.5,
  cells: 500,
  coarse: 0,
};

test("a prominence stands on the surface along an arc of a sane size", () => {
  let seen = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const given = seed % 2 === 0 ? flame : { ...flame, lively: 1 };
    const prominences = createProminences(seed * 7717, given);
    for (let tick = 0; tick < 12000; tick += 173) {
      prominences.turn(tick);
      for (let index = 0; index < PROMINENCE_ROOM; index++) {
        const slot = 4 * index;
        const strength = prominences.forms[slot];
        if (strength === 0) {
          continue;
        }
        seen += 1;
        const seat = prominences.seats.subarray(slot, slot + 3);
        const lean = prominences.leans.subarray(slot, slot + 3);
        const dot = seat[0] * lean[0] + seat[1] * lean[1] + seat[2] * lean[2];
        assert.ok(Math.abs(Math.hypot(...seat) - 1) < 1e-5);
        assert.ok(Math.abs(Math.hypot(...lean) - 1) < 1e-5);
        assert.ok(Math.abs(dot) < 1e-5);
        assert.ok(strength > 0 && strength <= 1);
        assert.ok(prominences.seats[slot + 3] > 0.02 && prominences.seats[slot + 3] < 0.3);
        assert.ok(prominences.leans[slot + 3] > 0.005 && prominences.leans[slot + 3] < 0.15);
        assert.ok(prominences.forms[slot + 3] >= 0 && prominences.forms[slot + 3] <= 0.3);
      }
    }
  }
  assert.ok(seen > 5000);
});

test("the prominences of a tick do not depend on the ticks looked at before", () => {
  const one = createProminences(99, flame);
  const other = createProminences(99, flame);
  for (const tick of [0, 9000, 40, 5200, 70000]) {
    one.turn(tick);
  }
  one.turn(3210);
  other.turn(3210);
  assert.deepEqual(one.forms, other.forms);
  for (let index = 0; index < PROMINENCE_ROOM; index++) {
    if (one.forms[4 * index] > 0) {
      assert.deepEqual(
        one.seats.subarray(4 * index, 4 * index + 4),
        other.seats.subarray(4 * index, 4 * index + 4),
      );
      assert.deepEqual(
        one.leans.subarray(4 * index, 4 * index + 4),
        other.leans.subarray(4 * index, 4 * index + 4),
      );
    }
  }
});

test("a star with no regions has no prominences", () => {
  const prominences = createProminences(7, { ...flame, regions: 0 });
  prominences.turn(500);
  assert.ok(prominences.forms.every((value) => value === 0));
});
