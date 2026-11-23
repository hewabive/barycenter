import assert from "node:assert/strict";
import { test } from "node:test";
import { createRandom } from "@barycenter/sim";
import type { Flame } from "../src/looks.ts";
import { MEMBER_ROOM, PLAGE_REACH, REGION_ROOM } from "../src/shaders.ts";
import { createActivity, createRoll, moodOf, sift, tangentsOf } from "../src/spots.ts";

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

const young: Flame = { ...flame, lively: 0.6, vigor: 0.9 };
const dwarf: Flame = { ...flame, kelvin: 3300, girth: 0.0105, belt: 1.1, lively: 1, vigor: 0.5 };

function count(activity: ReturnType<typeof createActivity>): number {
  let alive = 0;
  for (let region = 0; region < REGION_ROOM; region++) {
    alive += activity.regions[4 * region + 3] > 0 ? 1 : 0;
  }
  return alive;
}

test("a spot stays inside the circle of its region", () => {
  for (const given of [flame, young, dwarf]) {
    let seen = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const activity = createActivity(seed * 7717, given);
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
            assert.ok(reach > 0 && reach < 0.8, `region of ${reach}`);
            assert.ok(girth <= 0.0701, `spot of ${girth}`);
            assert.ok(away + 3 * girth <= reach, `spot ${away} + ${girth} in ${reach}`);
            assert.ok(activity.spots[slot + 3] >= 0 && activity.spots[slot + 3] <= 1);
          }
        }
      }
    }
    assert.ok(seen > 5000);
  }
});

test("a livelier star has more and larger spots, and the liveliest has them at its poles", () => {
  const measure = (given: Flame) => {
    let regions = 0;
    let largest = 0;
    let polar = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const activity = createActivity(seed * 104729, given);
      activity.turn(700);
      regions += count(activity);
      for (let region = 0; region < REGION_ROOM; region++) {
        if (
          activity.regions[4 * region + 3] > 0 &&
          Math.abs(activity.regions[4 * region + 1]) > 0.95
        ) {
          polar += 1;
        }
      }
      for (let slot = 0; slot < REGION_ROOM * MEMBER_ROOM; slot++) {
        largest = Math.max(largest, activity.spots[4 * slot + 2]);
      }
    }
    return { regions, largest, polar };
  };
  const quiet = measure({ ...flame, lively: 0, vigor: 0.5 });
  const sunny = measure(flame);
  const wild = measure(dwarf);
  assert.ok(quiet.regions < sunny.regions);
  assert.ok(sunny.largest < wild.largest);
  assert.equal(sunny.polar, 0);
  assert.ok(wild.polar >= 40);
});

test("the regions of a star with a cycle come and go with it and move toward the equator", () => {
  const tally = Array.from({ length: 4 }, () => ({ regions: 0, height: 0, stars: 0 }));
  for (let seed = 1; seed <= 300; seed++) {
    const activity = createActivity(seed * 15485863, flame);
    const { phase } = moodOf(seed * 15485863, flame).at(0);
    activity.turn(0);
    const quarter = tally[Math.floor(4 * phase)];
    quarter.stars += 1;
    for (let region = 0; region < REGION_ROOM; region++) {
      if (activity.regions[4 * region + 3] > 0) {
        quarter.regions += 1;
        quarter.height += Math.abs(Math.asin(activity.regions[4 * region + 1]));
      }
    }
  }
  const mean = tally.map((quarter) => quarter.regions / quarter.stars);
  const height = tally.map((quarter) => quarter.height / quarter.regions);
  assert.ok(mean[1] > 1.5 * mean[3], `regions ${mean}`);
  assert.ok(mean[3] > 1, `regions ${mean}`);
  assert.ok(height[0] > height[1] && height[1] > height[2] && height[2] > height[3], `${height}`);
});

test("a flare is short, and a quiet star has next to none", () => {
  const lit = (given: Flame) => {
    let ticks = 0;
    const activity = createActivity(31, given);
    for (let tick = 0; tick < 30000; tick++) {
      activity.turn(tick);
      assert.ok(activity.burst >= 0 && activity.burst <= 2.5);
      ticks += activity.burst > 0.2 ? 1 : 0;
    }
    return ticks / 30000;
  };
  const wild = lit(dwarf);
  assert.ok(wild > 0.01 && wild < 0.2, `flaring ${wild}`);
  assert.ok(lit(flame) < 0.002);
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

test("with no eye given every live region is kept, packed to the front in its order", () => {
  const activity = createActivity(4242, young);
  const roll = createRoll();
  activity.turn(1234);
  const live = Array.from({ length: REGION_ROOM }, (_, region) => region).filter(
    (region) => activity.regions[4 * region + 3] > 0,
  );
  assert.ok(live.length > 2 && live.length < REGION_ROOM);
  assert.equal(sift(activity, null, roll), live.length);
  live.forEach((region, kept) => {
    const members = 4 * MEMBER_ROOM;
    assert.deepEqual(
      roll.regions.subarray(4 * kept, 4 * kept + 4),
      activity.regions.subarray(4 * region, 4 * region + 4),
    );
    assert.equal(roll.plages[kept], activity.plages[region]);
    assert.deepEqual(
      roll.spots.subarray(members * kept, members * (kept + 1)),
      activity.spots.subarray(members * region, members * (region + 1)),
    );
  });
  assert.ok(roll.regions.subarray(4 * live.length).every((value) => value === 0));
  assert.ok(roll.spots.subarray(4 * MEMBER_ROOM * live.length).every((value) => value === 0));
});

test("an eye keeps every region that reaches a place it sees", () => {
  const random = createRandom(97);
  const aim = (): [number, number, number] => {
    const height = 2 * random.next() - 1;
    const turn = 2 * Math.PI * random.next();
    const level = Math.sqrt(1 - height * height);
    return [level * Math.cos(turn), height, level * Math.sin(turn)];
  };
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const roll = createRoll();
  let checked = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const activity = createActivity(seed * 7717, seed % 2 === 0 ? flame : dwarf);
    activity.turn(131 * seed);
    const far = 1.3 + 6 * random.next() ** 2;
    const toward = aim();
    const eye = toward.map((part) => part * far) as [number, number, number];
    const lean = aim();
    const off = 0.3 * random.next();
    const ahead = toward.map((part, at) => -part + off * lean[at]);
    const length = Math.hypot(...ahead);
    const sight = {
      eye,
      ahead: ahead.map((part) => part / length) as [number, number, number],
      wide: 0.3 + 0.5 * random.next(),
    };
    const kept = sift(activity, sight, roll);
    const held = new Set<string>();
    for (let slot = 0; slot < kept; slot++) {
      held.add(roll.regions.subarray(4 * slot, 4 * slot + 4).join());
    }
    for (let probe = 0; probe < 400; probe++) {
      const place = aim();
      const ray = place.map((part, at) => part - eye[at]);
      const seen =
        dot(place, eye) > 1 && dot(ray, sight.ahead) > Math.cos(sight.wide) * Math.hypot(...ray);
      for (let region = 0; seen && region < REGION_ROOM; region++) {
        const [east, north, south, reach] = activity.regions.subarray(4 * region, 4 * region + 4);
        const apart = (place[0] - east) ** 2 + (place[1] - north) ** 2 + (place[2] - south) ** 2;
        if (reach > 0 && apart < PLAGE_REACH * reach * reach) {
          checked += 1;
          assert.ok(held.has([east, north, south, reach].join()), `region ${region} of ${seed}`);
        }
      }
    }
  }
  assert.ok(checked > 500, `checked ${checked}`);
});

test("an eye close to a star like the Sun keeps few of its regions, and a far one about half", () => {
  const roll = createRoll();
  const kept = [1.3, 4.5].map((far) => {
    let live = 0;
    let held = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const activity = createActivity(seed * 7717, flame);
      activity.turn(131 * seed);
      live += count(activity);
      for (const turn of [0, 1, 2, 3, 4, 5]) {
        const toward = [0.94 * Math.cos(turn), 0.34, 0.94 * Math.sin(turn)];
        const sight = {
          eye: toward.map((part) => part * far) as [number, number, number],
          ahead: toward.map((part) => -part) as [number, number, number],
          wide: 0.55,
        };
        held += sift(activity, sight, roll) / 6;
      }
    }
    return held / live;
  });
  assert.ok(kept[0] > 0.02 && kept[0] < 0.25, `close ${kept[0]}`);
  assert.ok(kept[1] > 0.35 && kept[1] < 0.7, `far ${kept[1]}`);
});
