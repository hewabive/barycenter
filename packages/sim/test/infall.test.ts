import assert from "node:assert/strict";
import { test } from "node:test";
import { sinkerOf, trackOf } from "../src/infall.ts";
import {
  ASTRONOMICAL_UNIT,
  DAY,
  EARTH_MASS,
  EARTH_RADIUS,
  GIGAYEAR,
  GRAVITY,
  JUPITER_MASS,
  lifeOf,
  SUN_MASS,
  starLife,
  starTurn,
  YEAR,
} from "../src/physics.ts";
import { sketchSystem } from "../src/system.ts";

const sun = trackOf(SUN_MASS);
const widest = lifeOf(SUN_MASS, starLife(SUN_MASS)).swell;
const jupiters = (count: number) => ({
  mass: count * JUPITER_MASS,
  radius: 7.1e7,
  fluid: true,
});
const earths = (count: number) => ({
  mass: count * EARTH_MASS,
  radius: EARTH_RADIUS * count ** 0.27,
  fluid: false,
});

const survivesFrom = (body: ReturnType<typeof jupiters>) => {
  let low = 0.5 * widest;
  let high = 12 * widest;
  for (let halving = 0; halving < 20; halving++) {
    const middle = Math.sqrt(low * high);
    if (sinkerOf(sun, body, middle, 0).fall(0) === null) {
      high = middle;
    } else {
      low = middle;
    }
  }
  return high / widest;
};

test("a giant draws in heavy planets from farther than light ones", () => {
  const earth = survivesFrom(earths(1));
  const jupiter = survivesFrom(jupiters(1));
  const heavy = survivesFrom(jupiters(5));
  assert.ok(earth > 1.3 && earth < 2.5, `an Earth survives from ${earth} widest radii`);
  assert.ok(jupiter > 3 && jupiter < 4.5, `a Jupiter survives from ${jupiter} widest radii`);
  assert.ok(heavy > jupiter && earth < jupiter, `${earth} < ${jupiter} < ${heavy}`);
});

test("a hot Jupiter falls within the main sequence and one on a three-day orbit outlives it", () => {
  const near = sinkerOf(sun, jupiters(1), 0.02 * ASTRONOMICAL_UNIT, 0);
  const fall = near.fall(0);
  assert.ok(fall !== null && fall < GIGAYEAR, `falls at ${fall}`);
  const wide = sinkerOf(sun, jupiters(1), 0.04 * ASTRONOMICAL_UNIT, 0);
  const now = wide.at(9 * GIGAYEAR);
  assert.equal(now.fell, null);
  assert.ok(now.orbit < 0.04 * ASTRONOMICAL_UNIT && now.orbit > 0.035 * ASTRONOMICAL_UNIT);
  assert.ok((wide.fall(0) ?? 0) > sun.main, "it falls once the star leaves the main sequence");
});

test("an oval orbit rounds as the tide draws it in, and the star gains what the orbit lost", () => {
  const planet = sinkerOf(sun, jupiters(6), 1.13 * ASTRONOMICAL_UNIT, 0.4);
  const fall = planet.fall(0);
  assert.ok(fall !== null && fall > sun.main, `falls at ${fall}`);
  const before = planet.at(fall - 2e-3 * GIGAYEAR);
  assert.equal(before.fell, null);
  assert.ok(before.stretch < 0.2 && before.orbit < 0.9 * ASTRONOMICAL_UNIT, `${before.stretch}`);
  const gains = planet.given(fall + 1);
  assert.ok(gains.every((gain, at) => at === 0 || gain.at >= gains[at - 1].at));
  assert.ok(Math.abs((gains.at(-1)?.at ?? 0) / fall - 1) < 1e-6, "the rest is given at the fall");
  const total = gains.reduce((sum, gain) => sum + gain.spin, 0);
  const whole = 6 * JUPITER_MASS * Math.sqrt(GRAVITY * SUN_MASS * 1.13 * ASTRONOMICAL_UNIT * 0.84);
  assert.ok(Math.abs(total / whole - 1) < 1e-9, `${total} of ${whole}`);
});

test("a star turns faster for what it swallowed and brakes again on the main sequence", () => {
  const age = 4.6 * GIGAYEAR;
  const life = lifeOf(SUN_MASS, age);
  const spin = 6e41;
  const calm = starTurn(SUN_MASS, age, life, 0.5);
  const fresh = starTurn(SUN_MASS, age, life, 0.5, [{ at: age, spin }]);
  const old = starTurn(SUN_MASS, age, life, 0.5, [{ at: 0.5 * GIGAYEAR, spin }]);
  assert.ok(fresh < 0.5 * calm, `${fresh / DAY} days after it, ${calm / DAY} without`);
  assert.ok(old > fresh && old < calm, `${old / DAY} days four billion years later`);
  const giant = lifeOf(SUN_MASS, 11.3 * GIGAYEAR);
  const slow = starTurn(SUN_MASS, 11.3 * GIGAYEAR, giant, 0.5);
  const swift = starTurn(SUN_MASS, 11.3 * GIGAYEAR, giant, 0.5, [{ at: 11.2 * GIGAYEAR, spin }]);
  assert.ok(swift < slow, `a giant turns in ${swift / DAY} days, ${slow / DAY} without`);
});

test("Ollis is drawn into its giant star and left in its list", () => {
  const at = (age: number) =>
    sketchSystem(587, { settled: false, star: SUN_MASS, age: age * GIGAYEAR });
  const drawn = at(11.301).bodies.find((body) => body.name === "Ollis");
  assert.ok(drawn?.drawn !== null && drawn?.drawn !== undefined, "Ollis is being drawn in");
  assert.ok(drawn.physics.orbit < drawn.drawn.from && drawn.drawn.falls !== null);
  const later = at(11.336);
  assert.ok(!later.bodies.some((body) => ["Ollis", "Ridoon"].includes(body.name)));
  const taken = later.bodies[0].swallowed.find((entry) => entry.name === "Ollis");
  assert.ok(taken !== undefined && taken.of === null);
  assert.ok(Math.abs(taken.since - (0.035 * GIGAYEAR - drawn.drawn.falls)) < 1e-3 * GIGAYEAR);
});

test("the moons of a planet drawn into its star are torn away or go in with it", () => {
  const at = (age: number) =>
    sketchSystem(587, { settled: false, star: SUN_MASS, age: age * GIGAYEAR });
  const last = at(11.3053);
  const star = last.bodies[0];
  const host = last.bodies.find((body) => body.name === "Ollis");
  assert.ok(host !== undefined);
  const nearest = host.physics.orbit * (1 - host.physics.stretch);
  for (const moon of last.bodies.filter((body) => body.parent === host.id)) {
    const far = moon.physics.orbit * (1 + moon.physics.stretch);
    assert.ok(nearest - far > star.physics.radius, `${moon.name} passes inside the star`);
  }
  const freed = last.bodies.find((body) => body.name === "Riliis");
  assert.equal(freed?.freed?.from, "Ollis");
  assert.deepEqual(
    [freed?.slant, freed?.node, freed?.apse],
    [host.slant, host.node, host.apse],
    "Riliis keeps the plane of Ollis",
  );
  const kept = last.bodies.filter((body) => body.parent === host.id).map((body) => body.name);
  assert.deepEqual(kept, ["Ridoon", "Viram"]);
  const after = at(11.32);
  const left = after.bodies.find((body) => body.name === "Riliis");
  assert.equal(left?.parent, 0);
  assert.equal(left?.freed?.from, "Ollis");
  assert.ok(left?.freed?.falls !== null && (left?.freed?.falls ?? 0) > 0);
  const eaten = new Map(after.bodies[0].swallowed.map((entry) => [entry.name, entry]));
  assert.equal(eaten.get("Ridoon")?.of, "Ollis");
  assert.equal(eaten.get("Viram")?.of, "Ollis");
  const fell = eaten.get("Ollis")?.since ?? 0;
  const dove = (eaten.get("Ridoon")?.since ?? 0) - fell;
  assert.ok(dove > 0 && dove < 1e-5 * GIGAYEAR, `Ridoon went in ${dove / YEAR} years before`);
  assert.ok((eaten.get("Viram")?.since ?? fell) < fell, "Viram was torn away and fell later");
  const late = at(11.36).bodies[0].swallowed.map((entry) => entry.name);
  assert.ok(["Ollis", "Ridoon", "Viram", "Riliis"].every((name) => late.includes(name)));
  assert.ok(!late.includes("Tavex") && !late.includes("Hadois"), "moons lost long before");
});
