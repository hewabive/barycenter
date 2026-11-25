import assert from "node:assert/strict";
import { test } from "node:test";
import {
  approachOf,
  type Burn,
  burnFor,
  circling,
  createFlight,
  createFlyer,
  createForecast,
  type Drive,
  type Flight,
  type Kick,
  lambert,
  type Outcome,
  type Rails,
  railsOf,
  seek,
  surveySystem,
} from "../src/index.ts";

const EARTH_PULL = 3.986e14;

function lone(pull: number): Rails {
  return {
    count: 1,
    pulls: Float64Array.of(pull),
    radii: Float64Array.of(1),
    domains: Float64Array.of(Number.POSITIVE_INFINITY),
    parents: Int32Array.of(-1),
    place(_time, at, speed) {
      at.fill(0);
      speed.fill(0);
    },
  };
}

function found(run: Generator<number, Outcome, void>): Outcome {
  let step = run.next();
  while (!step.done) {
    step = run.next();
  }
  return step.value;
}

test("a way between two places in a given time is the one a ship then flies", () => {
  const rails = lone(EARTH_PULL);
  const fly = createFlyer(rails);
  const cases: [[number, number, number], [number, number, number], number, number][] = [
    [[5e6, 1e7, 2.1e6], [-1.46e7, 2.5e6, 7e6], 3600, 1],
    [[5e6, 1e7, 2.1e6], [-1.46e7, 2.5e6, 7e6], 30000, -1],
    [[7e6, 0, 0], [0, 4e8, 1e7], 40000, 1],
    [[7e6, 0, 0], [-3e7, 2e6, 1e6], 12000, 1],
  ];
  for (const [from, to, span, way] of cases) {
    const pole: [number, number, number] = [0, 0, way];
    const path = lambert(EARTH_PULL, from, to, span, pole);
    assert.ok(path !== null);
    const turn = from[0] * path.leave[1] - from[1] * path.leave[0];
    assert.ok(turn * way > 0);
    const flight = createFlight(0, [...from, ...path.leave, 1]);
    while (flight.time < span) {
      fly(flight, span, null, 64);
    }
    const size = Math.hypot(...to);
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(Math.abs(flight.state[axis] - to[axis]) < 1e-6 * size);
      assert.ok(Math.abs(flight.state[3 + axis] - path.arrive[axis]) < 1e-3);
    }
  }
  assert.equal(lambert(EARTH_PULL, [7e6, 0, 0], [-1.4e7, 0, 0], 9000, [0, 0, 1]), null);
});

const system = surveySystem(1, { settled: true, star: null });
const rails = railsOf(system);
const named = (name: string): number => {
  const body = system.bodies.find((each) => each.name === name);
  assert.ok(body !== undefined);
  return body.id;
};
const drive: Drive = { force: 1e5, exhaust: 4500, dry: 4000, endless: false };
const parked = (body: number): Flight => {
  const height = Math.max(2e5, 0.05 * rails.radii[body]);
  return createFlight(0, [...circling(rails, system, body, height, 0), 2e4]);
};
const blank: Kick = { time: 600, along: 0, north: 0, out: 0, about: null, drive };

test("a way to a moon is found, and the engine flies the ship past it at the height asked", () => {
  const fly = createFlyer(rails);
  const home = named("Riran");
  const moon = named("Surais");
  const flight = parked(home);
  const { way, trouble } = found(
    seek({ rails, fly, flight, plan: [], kick: blank, target: moon, height: 1e5 }),
  );
  assert.equal(trouble, null);
  assert.ok(way?.settled);
  const wanted = rails.radii[moon] + 1e5;
  assert.ok(Math.abs(way.approach.gap - wanted) < 1e3);
  assert.ok(way.cost > 3800 && way.cost < 4150);

  const forecast = createForecast(rails, fly, flight, [way.kick], null, 4000);
  while (!forecast.done) {
    forecast.extend(64);
  }
  const size = Math.hypot(...forecast.pushes);
  const span = burnFor(drive, 2e4, size);
  assert.ok(span > 505 && span < 550);
  const burn: Burn = {
    ...drive,
    heading: "hold",
    about: home,
    held: {
      x: forecast.pushes[0] / size,
      y: forecast.pushes[1] / size,
      z: forecast.pushes[2] / size,
    },
  };
  const real = createFlight(0, flight.state);
  while (real.time < way.kick.time - span / 2) {
    fly(real, way.kick.time - span / 2, null, 64);
  }
  while (real.time < way.kick.time + span / 2) {
    fly(real, way.kick.time + span / 2, burn, 64);
  }
  const rest = createForecast(rails, fly, real, [], null, 4000);
  while (!rest.done) {
    rest.extend(64);
  }
  const pass = approachOf(rest, rails, moon, real.time);
  assert.ok(pass !== null && !pass.struck);
  assert.ok(Math.abs(pass.gap - wanted) < 5e3);

  const sudden = createForecast(rails, fly, flight, [{ ...way.kick, drive: null }], null, 4000);
  while (!sudden.done) {
    sudden.extend(64);
  }
  const other = approachOf(sudden, rails, moon, way.kick.time);
  assert.ok(other !== null && Math.abs(other.gap - wanted) > 1e6);
});

test("a way to another planet leaves the hold of the first and passes the second as asked", () => {
  const fly = createFlyer(rails);
  const planet = named("Haran");
  const { way } = found(
    seek({
      rails,
      fly,
      flight: parked(named("Riran")),
      plan: [],
      kick: blank,
      target: planet,
      height: 1e6,
    }),
  );
  assert.ok(way?.settled);
  assert.ok(Math.abs(way.approach.gap - rails.radii[planet] - 1e6) < 5e3);
  assert.ok(way.cost > 5000 && way.cost < 7000);
  assert.ok(way.approach.time - way.kick.time > 100 * 86400);
});

test("a way down to the body a moon circles is found from the moon", () => {
  const fly = createFlyer(rails);
  const home = named("Riran");
  const { way } = found(
    seek({
      rails,
      fly,
      flight: parked(named("Surais")),
      plan: [],
      kick: { ...blank, time: 20000 },
      target: home,
      height: 3e5,
    }),
  );
  assert.ok(way?.settled);
  assert.ok(Math.abs(way.approach.gap - rails.radii[home] - 3e5) < 1500);
  assert.ok(way.cost < 1200);
});

test("no way is sought to the body the ship circles, nor from a moon to another planet", () => {
  const fly = createFlyer(rails);
  const home = named("Riran");
  const same = found(
    seek({ rails, fly, flight: parked(home), plan: [], kick: blank, target: home, height: 1e5 }),
  );
  assert.equal(same.trouble, "same");
  assert.equal(same.way, null);
  const nested = found(
    seek({
      rails,
      fly,
      flight: parked(named("Surais")),
      plan: [],
      kick: blank,
      target: named("Haran"),
      height: 1e6,
    }),
  );
  assert.equal(nested.trouble, "nested");
});
