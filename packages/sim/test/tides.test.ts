import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EARTH_MASS,
  EARTH_RADIUS,
  GIGAYEAR,
  GRAVITY,
  HOUR,
  JUPITER_MASS,
  YEAR,
  yearOf,
} from "../src/physics.ts";
import {
  cycleOf,
  type Reach,
  type Rider,
  syncOf,
  type Turner,
  tideOf,
  tornAt,
  trainOf,
  yieldOf,
} from "../src/tides.ts";

const MYR = 1e6 * YEAR;
const NEVER = Number.POSITIVE_INFINITY;

const mars: Turner = { mass: 6.417e23, radius: 3.39e6, day: 88643, ice: 0, fluid: false };
const earth: Turner = { mass: EARTH_MASS, radius: EARTH_RADIUS, day: 86164, ice: 0, fluid: false };
const jupiter: Turner = {
  mass: JUPITER_MASS,
  radius: 6.99e7,
  day: 9.93 * HOUR,
  ice: 0,
  fluid: true,
};

const reachOf = (host: Turner, grain: number): Reach => ({
  torn: tornAt(host.radius, host.mass / ((4 / 3) * Math.PI * host.radius ** 3), grain),
  born: 3 * host.radius,
  far: 300 * host.radius,
});

test("a moon that circles faster than its planet turns is drawn down and torn", () => {
  const phobos = { mass: 1.07e16, orbit: 9.376e6 };
  const reach = reachOf(mars, 1860);
  assert.ok(phobos.orbit < syncOf(mars.mass, mars.day));
  assert.ok(reach.torn > 1.5 * mars.radius && reach.torn < 2 * mars.radius);
  const soon = tideOf(mars, phobos, reach, 0, NEVER, 10 * MYR, false);
  assert.ok(!soon.fell && soon.orbit < phobos.orbit && soon.orbit > 0.9 * phobos.orbit);
  assert.ok(!tideOf(mars, phobos, reach, 0, NEVER, 20 * MYR, false).fell);
  assert.ok(tideOf(mars, phobos, reach, 0, NEVER, 50 * MYR, false).fell);
  const steps = [0, 5, 10, 15, 20].map(
    (age) => tideOf(mars, phobos, reach, 0, NEVER, age * MYR, false).orbit,
  );
  assert.ok(steps.every((orbit, at) => at === 0 || orbit < steps[at - 1]));
  assert.ok(steps[3] - steps[4] > steps[0] - steps[1]);
});

test("a small moon beyond that orbit hardly moves", () => {
  const deimos = { mass: 1.5e15, orbit: 2.346e7 };
  assert.ok(deimos.orbit > syncOf(mars.mass, mars.day));
  const late = tideOf(mars, deimos, reachOf(mars, 1500), 0, NEVER, 4.5 * GIGAYEAR, false);
  assert.ok(!late.fell && late.orbit >= deimos.orbit && late.orbit < 1.01 * deimos.orbit);
});

test("a heavy moon was nearer once, and its planet turned faster", () => {
  const moon = { mass: 7.35e22, orbit: 3.844e8 };
  const reach = reachOf(earth, 3340);
  const now = 4.5 * GIGAYEAR;
  const today = tideOf(earth, moon, reach, now, NEVER, now, true);
  assert.equal(today.orbit, moon.orbit);
  assert.equal(today.day, earth.day);
  const once = tideOf(earth, moon, reach, now, NEVER, 0.5 * GIGAYEAR, true);
  assert.ok(once.orbit < moon.orbit && once.orbit > 40 * earth.radius, `${once.orbit}`);
  assert.ok(once.day < earth.day && once.day > 10 * HOUR, `${once.day / HOUR}`);
  const turning = (tide: { orbit: number; day: number }) =>
    (0.33 * earth.mass * earth.radius ** 2 * 2 * Math.PI) / tide.day +
    ((moon.mass * earth.mass) / (earth.mass + moon.mass)) *
      Math.sqrt(GRAVITY * (earth.mass + moon.mass) * tide.orbit);
  assert.ok(Math.abs(turning(once) / turning(today) - 1) < 1e-9);
  const later = tideOf(earth, moon, reach, now, NEVER, 9 * GIGAYEAR, true);
  assert.ok(later.orbit > moon.orbit && later.day > earth.day);
});

test("a moon as heavy as its planet can carry comes to hold the planet's face", () => {
  const pluto: Turner = { mass: 1.303e22, radius: 1.188e6, day: 6 * HOUR, ice: 0.3, fluid: false };
  const charon = { mass: 1.586e21, orbit: 8 * pluto.radius };
  const reach = reachOf(pluto, 1700);
  const late = tideOf(pluto, charon, reach, 0, NEVER, 4 * GIGAYEAR, true);
  assert.ok(late.held && !late.fell);
  assert.ok(late.orbit > charon.orbit && late.orbit < 30 * pluto.radius, `${late.orbit}`);
  const month = yearOf(late.orbit, pluto.mass + charon.mass);
  assert.ok(Math.abs(late.day / month - 1) < 1e-6, `${late.day / month}`);
  const early = tideOf(pluto, charon, reach, 0, NEVER, 1e3 * YEAR, true);
  assert.ok(!early.held && early.orbit < late.orbit && early.day < late.day);
});

test("a planet held by its star loses the moons that are heavy or near", () => {
  const reach = reachOf(earth, 3000);
  const heavy = { mass: 0.012 * EARTH_MASS, orbit: 30 * EARTH_RADIUS };
  const light = { mass: 1e-5 * EARTH_MASS, orbit: 60 * EARTH_RADIUS };
  assert.ok(tideOf(earth, heavy, reach, 0, 0, GIGAYEAR, false).fell);
  assert.ok(!tideOf(earth, light, reach, 0, 0, 10 * GIGAYEAR, false).fell);
  const free = tideOf(earth, heavy, reach, 0, GIGAYEAR, GIGAYEAR, true);
  assert.ok(!free.fell && free.orbit > heavy.orbit);
  const bound = tideOf(earth, heavy, reach, 0, GIGAYEAR, 1.2 * GIGAYEAR, true);
  assert.ok(!bound.fell && bound.orbit < free.orbit);
  assert.ok(tideOf(earth, heavy, reach, 0, GIGAYEAR, 9 * GIGAYEAR, true).fell);
});

test("a giant keeps its small inner moons and in time drops a large one", () => {
  const reach = reachOf(jupiter, 1000);
  const metis = { mass: 3.6e16, orbit: 1.28e8 };
  const kept = tideOf(jupiter, metis, reach, 0, NEVER, 10 * GIGAYEAR, false);
  assert.ok(metis.orbit < syncOf(jupiter.mass, jupiter.day));
  assert.ok(!kept.fell && kept.orbit > 0.99 * metis.orbit);
  const large = { mass: 1e20, orbit: 2 * jupiter.radius };
  assert.ok(!tideOf(jupiter, large, reach, 0, NEVER, GIGAYEAR, false).fell);
  assert.ok(tideOf(jupiter, large, reach, 0, NEVER, 5 * GIGAYEAR, false).fell);
});

test("a dense moon reaches a light planet whole", () => {
  assert.equal(tornAt(7e7, 700, 3000), 1.02 * 7e7);
  assert.ok(tornAt(7e7, 1300, 1000) > 1.5 * 7e7);
});

test("a large rocky body gives way to a tide more than a small one or a giant", () => {
  const moon: Turner = { mass: 7.35e22, radius: 1.737e6, day: 2.36e6, ice: 0, fluid: false };
  const icy: Turner = { ...moon, ice: 1 };
  assert.ok(yieldOf(mars) > 1e-3 && yieldOf(mars) < 2.5e-3, `${yieldOf(mars)}`);
  assert.ok(yieldOf(moon) > 2e-4 && yieldOf(moon) < 8e-4, `${yieldOf(moon)}`);
  assert.ok(yieldOf(earth) > yieldOf(mars) && yieldOf(earth) <= 4e-3);
  assert.ok(yieldOf(icy) > 3 * yieldOf(moon));
  assert.ok(yieldOf(jupiter) < 0.01 * yieldOf(moon));
});

test("a moon driven outward drives the lighter ones beyond it and keeps their order", () => {
  const still = (orbit: number) => ({ orbit, day: 1, fell: false, fall: NEVER, held: false });
  const riders: Rider[] = [
    { mass: 8, born: 4, stretch: 0, torn: 1.5, far: 100, tide: still(7) },
    { mass: 1, born: 6, stretch: 0, torn: 1.5, far: 100, tide: still(6.1) },
    { mass: 3, born: 11, stretch: 0, torn: 1.5, far: 100, tide: still(11) },
    { mass: 1, born: 30, stretch: 0, torn: 1.5, far: 100, tide: still(30) },
  ];
  const [first, second, third, fourth] = trainOf(riders, 1e6);
  assert.equal(first.orbit, 7);
  assert.ok(Math.abs(second.orbit / 7 - 1.5) < 1e-9, `${second.orbit}`);
  assert.ok(Math.abs(third.orbit / second.orbit - 2 ** (2 / 3)) < 1e-9, `${third.orbit}`);
  assert.equal(fourth.orbit, 30);
  assert.ok([first, second, third, fourth].every((fate) => !fate.fell && !fate.lost));
  const crowded = trainOf(
    riders.map((rider) => ({ ...rider, far: 15 })),
    1e6,
  );
  assert.ok(crowded[2].lost && !crowded[1].lost && !crowded[0].lost);
  const heavy = trainOf(riders, 300);
  assert.ok(heavy[1].orbit / heavy[0].orbit > 1.5 - 1e-9 && heavy[2].orbit / heavy[1].orbit > 1.7);
});

test("a heavy moon drawn down sends the lighter ones inside it down first", () => {
  const still = (orbit: number) => ({ orbit, day: 1, fell: false, fall: NEVER, held: false });
  const fallen = { orbit: 1.5, day: 1, fell: true, fall: 7, held: false };
  const riders: Rider[] = [
    { mass: 1, born: 3, stretch: 0, torn: 1.5, far: 100, tide: still(2.9) },
    { mass: 5, born: 4, stretch: 0, torn: 1.5, far: 100, tide: still(2.5) },
  ];
  const [inner, outer] = trainOf(riders, 1e6);
  assert.equal(outer.orbit, 2.5);
  assert.ok(Math.abs(inner.orbit - 2.5 / (4 / 3)) < 1e-9 && !inner.fell);
  const later = trainOf([riders[0], { ...riders[1], tide: fallen }], 1e6);
  assert.ok(later[0].fell && later[1].fell);
  assert.equal(later[0].fall, 7);
  assert.equal(later[1].fall, 7);
  const light = trainOf(
    [
      { ...riders[0], mass: 9 },
      { ...riders[1], tide: fallen },
    ],
    1e6,
  );
  assert.ok(!light[0].fell && light[0].orbit === 2.9 && !light[1].fell);
  assert.ok(Math.abs(light[1].orbit - 2.9 * (4 / 3)) < 1e-9);
});

test("a heavy ring gathers a moon that comes back as a lighter ring, time after time", () => {
  const edge = 3.06 * mars.radius;
  const rim = {
    edge,
    torn: tornAt(mars.radius, 3934, 2000),
    far: 100 * mars.radius,
    turn: yearOf(edge, mars.mass),
    wear: 3e8 * YEAR,
  };
  const first = { at: 0, mass: 1e-5 * mars.mass };
  const early = cycleOf(mars, first, rim, NEVER, 1e4 * YEAR);
  assert.deepEqual(early.feeds, [first]);
  assert.equal(early.moon, null);
  const soon = cycleOf(mars, first, rim, NEVER, 2 * MYR);
  assert.ok(soon.moon !== null && soon.feeds.length === 1);
  assert.ok(Math.abs(soon.moon.mass / first.mass - 0.2) < 1e-9);
  assert.ok(soon.moon.orbit > edge && soon.moon.orbit < 1.59 * edge, `${soon.moon.orbit / edge}`);
  const later = cycleOf(mars, first, rim, NEVER, 10 * MYR);
  assert.ok(later.moon !== null && later.moon.orbit < soon.moon.orbit);
  const late = cycleOf(mars, first, rim, NEVER, 4 * GIGAYEAR);
  assert.ok(late.feeds.length >= 3 && late.feeds.length <= 6, `${late.feeds.length} rings`);
  late.feeds.forEach((feed, at) => {
    assert.ok(at === 0 || feed.at > late.feeds[at - 1].at);
    assert.ok(Math.abs(feed.mass / first.mass - 0.2 ** at) < 1e-9);
  });
  const quick: Turner = { ...mars, day: 5 * HOUR };
  assert.ok(syncOf(quick.mass, quick.day) < edge);
  const kept = cycleOf(quick, first, rim, NEVER, 4 * GIGAYEAR);
  assert.ok(kept.feeds.length === 1 && kept.moon !== null && kept.moon.orbit >= edge);
  const light = cycleOf(mars, { at: 0, mass: 1e-9 * mars.mass }, rim, NEVER, 4 * GIGAYEAR);
  assert.ok(light.feeds.length === 1 && light.moon === null);
  const tight = cycleOf(mars, first, { ...rim, far: 1.2 * edge }, NEVER, 4 * GIGAYEAR);
  assert.ok(tight.feeds.length === 1 && tight.moon === null);
});
