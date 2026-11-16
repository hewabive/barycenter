import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type Burn,
  centreOf,
  circling,
  createFlight,
  createFlyer,
  type Heading,
  hubOf,
  orbitOf,
  positionOf,
  primaryOf,
  type Rails,
  railsOf,
  starborn,
  surveySystem,
  weightOf,
} from "../src/index.ts";

const EARTH_PULL = 3.986e14;
const UP = { x: 0, y: 0, z: 1 };

function lone(pull: number, radius = 1): Rails {
  return {
    count: 1,
    pulls: Float64Array.of(pull),
    radii: Float64Array.of(radius),
    domains: Float64Array.of(Number.POSITIVE_INFINITY),
    parents: Int32Array.of(-1),
    place(_time, at, speed) {
      at.fill(0);
      speed.fill(0);
    },
  };
}

function energyOf(pull: number, state: Float64Array): number {
  const swift = state[3] ** 2 + state[4] ** 2 + state[5] ** 2;
  return swift / 2 - pull / Math.hypot(state[0], state[1], state[2]);
}

function push(heading: Heading, force: number, dry = 1000): Burn {
  return {
    force,
    exhaust: 3000,
    dry,
    endless: false,
    heading,
    about: 0,
    held: { x: 1, y: 0, z: 0 },
  };
}

test("the rails put every body where the core puts it, and give its speed", () => {
  for (const seed of [1, 2, 26, 191, 396, 522]) {
    for (const settled of [true, false]) {
      const system = surveySystem(seed, { settled, star: null });
      const rails = railsOf(system);
      const at = new Float64Array(3 * rails.count);
      const speed = new Float64Array(3 * rails.count);
      const before = new Float64Array(3 * rails.count);
      const after = new Float64Array(3 * rails.count);
      const spare = new Float64Array(3 * rails.count);
      const quickest = Math.min(
        ...system.bodies.filter((body) => body.parent !== null).map((body) => body.year),
      );
      const blink = 1e-5 * quickest;
      for (const time of [0, 3.3e7, 1.7e9]) {
        rails.place(time, at, speed);
        rails.place(time - blink, before, spare);
        rails.place(time + blink, after, spare);
        for (const body of system.bodies) {
          const label = `seed ${seed} ${body.name} at ${time}`;
          const base = 3 * body.id;
          const truly = positionOf(system, body.id, time, true);
          const far = Math.hypot(truly.x, truly.y, truly.z);
          const off = Math.hypot(
            at[base] - truly.x,
            at[base + 1] - truly.y,
            at[base + 2] - truly.z,
          );
          assert.ok(off <= 1e-10 * far + 1e-3, `${label}: ${off} m off`);
          const swift = Math.hypot(speed[base], speed[base + 1], speed[base + 2]);
          const slip = Math.hypot(
            (after[base] - before[base]) / (2 * blink) - speed[base],
            (after[base + 1] - before[base + 1]) / (2 * blink) - speed[base + 1],
            (after[base + 2] - before[base + 2]) / (2 * blink) - speed[base + 2],
          );
          const coarse = (4e-15 * far + 4e-16 * time * swift) / blink;
          assert.ok(slip <= 1e-6 * swift + coarse + 1e-6, `${label}: ${slip} m/s`);
        }
      }
      assert.equal(rails.pulls.length, system.bodies.length);
      assert.equal(rails.domains[0], Number.POSITIVE_INFINITY);
      for (const body of system.bodies.slice(1)) {
        assert.ok(rails.domains[body.id] > 0, body.name);
        assert.ok(rails.domains[body.id] < body.physics.orbit, body.name);
      }
    }
  }
});

test("a body flown round a single mass keeps its orbit for a hundred turns", () => {
  const fly = createFlyer(lone(EARTH_PULL));
  const far = 7e6;
  const swift = Math.sqrt(EARTH_PULL / far);
  const year = 2 * Math.PI * Math.sqrt(far ** 3 / EARTH_PULL);
  const flight = createFlight(0, [far, 0, 0, 0, swift, 0, 1000]);
  const energy = energyOf(EARTH_PULL, flight.state);
  const steps = fly(flight, 100 * year, null, 1e6);
  assert.equal(flight.time, 100 * year);
  assert.ok(steps / 100 > 15 && steps / 100 < 80, `${steps / 100} steps a turn`);
  assert.ok(Math.abs(energyOf(EARTH_PULL, flight.state) / energy - 1) < 1e-8);
  assert.ok(Math.hypot(flight.state[0] - far, flight.state[1], flight.state[2]) < 1e-5 * far);
  assert.equal(flight.state[6], 1000);
  assert.equal(flight.wrecked, null);
});

test("a long oval is flown as well as a circle, with short steps where it is fast", () => {
  const fly = createFlyer(lone(EARTH_PULL));
  const semi = 4e7;
  const stretch = 0.9;
  const low = semi * (1 - stretch);
  const swift = Math.sqrt((EARTH_PULL * (1 + stretch)) / low);
  const year = 2 * Math.PI * Math.sqrt(semi ** 3 / EARTH_PULL);
  const flight = createFlight(0, [low, 0, 0, 0, swift, 0, 1]);
  const energy = energyOf(EARTH_PULL, flight.state);
  fly(flight, 10 * year, null, 1e6);
  assert.ok(Math.abs(energyOf(EARTH_PULL, flight.state) / energy - 1) < 1e-8);
  assert.ok(Math.hypot(flight.state[0] - low, flight.state[1], flight.state[2]) < 1e-4 * semi);
});

test("an orbit is read off a place and a speed", () => {
  const semi = 1e7;
  const stretch = 0.3;
  const angle = Math.PI / 3;
  const level = semi * (1 - stretch ** 2);
  const far = level / (1 + stretch * Math.cos(angle));
  const pace = Math.sqrt(EARTH_PULL / level);
  const state = [
    far * Math.cos(angle),
    far * Math.sin(angle),
    0,
    -pace * Math.sin(angle),
    pace * (stretch + Math.cos(angle)),
    0,
  ] as const;
  const orbit = orbitOf(EARTH_PULL, ...state, UP);
  assert.ok(Math.abs(orbit.semi / semi - 1) < 1e-12);
  assert.ok(Math.abs(orbit.stretch - stretch) < 1e-12);
  assert.ok(Math.abs(orbit.low / (semi * (1 - stretch)) - 1) < 1e-12);
  assert.ok(Math.abs(orbit.high / (semi * (1 + stretch)) - 1) < 1e-12);
  assert.ok(Math.abs(orbit.year / (2 * Math.PI * Math.sqrt(semi ** 3 / EARTH_PULL)) - 1) < 1e-12);
  assert.ok(orbit.lean < 1e-7);
  assert.ok(Math.abs(orbitOf(EARTH_PULL, ...state, { x: 0, y: 0, z: -1 }).lean - Math.PI) < 1e-7);
  assert.ok(orbit.toHigh < orbit.toLow && orbit.toLow < orbit.year);

  const fly = createFlyer(lone(EARTH_PULL));
  const flight = createFlight(0, [...state, 1]);
  fly(flight, orbit.toHigh, null, 1e5);
  assert.ok(Math.abs(Math.hypot(flight.state[0], flight.state[1]) / orbit.high - 1) < 1e-8);
  fly(flight, orbit.toLow, null, 1e5);
  assert.ok(Math.abs(Math.hypot(flight.state[0], flight.state[1]) / orbit.low - 1) < 1e-8);

  const open = 1.5;
  const reach = 2e7;
  const fast = Math.sqrt((EARTH_PULL * (1 + open)) / reach);
  const passing = createFlight(0, [reach, 0, 0, 0, fast, 0, 1]);
  fly(passing, 20000, null, 1e5);
  const leaving = orbitOf(EARTH_PULL, ...(Array.from(passing.state.slice(0, 6)) as Six), UP);
  assert.ok(Math.abs(leaving.stretch - open) < 1e-8);
  assert.ok(Math.abs(leaving.low / reach - 1) < 1e-8);
  assert.ok(Math.abs(leaving.toLow + 20000) < 1e-3);
  assert.equal(leaving.high, Number.POSITIVE_INFINITY);
  assert.ok(leaving.semi < 0);
});

type Six = [number, number, number, number, number, number];

test("a push gives the speed the rocket equation promises, and stops with the tank", () => {
  const fly = createFlyer(lone(0));
  const flight = createFlight(0, [1e7, 0, 0, 0, 0, 0, 5000]);
  const burn = push("hold", 20000);
  fly(flight, 100, burn, 1e5);
  assert.ok(Math.abs(flight.state[6] - (5000 - (20000 / 3000) * 100)) < 1e-6);
  assert.ok(Math.abs(flight.state[3] - 3000 * Math.log(5000 / flight.state[6])) < 1e-5);
  fly(flight, 1e4, burn, 1e5);
  assert.equal(flight.state[6], 1000);
  assert.ok(Math.abs(flight.state[3] - 3000 * Math.log(5)) < 1e-4);
  assert.equal(flight.state[4], 0);
  const coasting = flight.state[0];
  fly(flight, 2e4, burn, 1e5);
  assert.ok(Math.abs(flight.state[0] - coasting - 1e4 * flight.state[3]) < 1e-3);
  assert.equal(flight.time, 2e4);

  const endless = createFlight(0, [1e7, 0, 0, 0, 0, 0, 5000]);
  fly(endless, 100, { ...burn, endless: true }, 1e5);
  assert.equal(endless.state[6], 5000);
  assert.ok(Math.abs(endless.state[3] - 400) < 1e-5);
});

test("a push along the path lifts the orbit, against it lowers it, across it turns it", () => {
  const fly = createFlyer(lone(EARTH_PULL));
  const far = 7e6;
  const swift = Math.sqrt(EARTH_PULL / far);
  const after = (heading: Heading) => {
    const flight = createFlight(0, [far, 0, 0, 0, swift, 0, 5000]);
    fly(flight, 20, push(heading, 50000), 1e5);
    return orbitOf(EARTH_PULL, ...(Array.from(flight.state.slice(0, 6)) as Six), UP);
  };
  const still = after("hold").semi;
  assert.ok(after("prograde").semi > 1.05 * far);
  assert.ok(after("retrograde").semi < 0.95 * far);
  assert.ok(Math.abs(after("normal").semi / far - 1) < 1e-3);
  assert.ok(after("normal").lean > 0.02 && after("antinormal").lean > 0.02);
  assert.ok(after("prograde").lean < 1e-9);
  assert.ok(Math.abs(after("outward").semi / far - 1) < 1e-2);
  assert.ok(after("outward").stretch > 0.02 && after("inward").stretch > 0.02);
  assert.ok(still > far);
});

test("a push against the path stops the ship and holds it there", () => {
  const fly = createFlyer(lone(EARTH_PULL, 1e6));
  const far = 7e6;
  const flight = createFlight(0, [far, 0, 0, 0, Math.sqrt(EARTH_PULL / far), 0, 5000]);
  const burn = { ...push("retrograde", 100000), endless: true };
  const steps = fly(flight, 2000, burn, 1e6);
  assert.equal(flight.time, 2000);
  assert.ok(steps < 40000, `${steps} steps`);
  assert.ok(Math.hypot(flight.state[3], flight.state[4], flight.state[5]) < 2);
  assert.ok(Math.hypot(flight.state[0], flight.state[1], flight.state[2]) > 6e6);
});

test("a flight ends where it meets the ground", () => {
  const fly = createFlyer(lone(EARTH_PULL, 6.4e6));
  const flight = createFlight(0, [7e6, 0, 0, 0, 5000, 0, 1]);
  fly(flight, 1e5, null, 1e5);
  assert.equal(flight.wrecked, 0);
  assert.ok(flight.time < 1e4);
  const time = flight.time;
  fly(flight, 2e5, null, 1e5);
  assert.equal(flight.time, time);
});

test("a ship set down around a body circles it, and knows what it circles", () => {
  for (const seed of [1, 4, 16]) {
    const system = surveySystem(seed, { settled: true, star: null });
    const rails = railsOf(system);
    const at = new Float64Array(3 * rails.count);
    const speed = new Float64Array(3 * rails.count);
    rails.place(5e6, at, speed);
    for (const body of system.bodies) {
      const height = Math.max(2e5, 0.05 * body.physics.radius);
      const state = circling(rails, system, body.id, height, 5e6);
      const base = 3 * body.id;
      const orbit = orbitOf(
        rails.pulls[body.id],
        state[0] - at[base],
        state[1] - at[base + 1],
        state[2] - at[base + 2],
        state[3] - speed[base],
        state[4] - speed[base + 1],
        state[5] - speed[base + 2],
        { x: 0, y: 1, z: 0 },
      );
      assert.ok(orbit.stretch < 1e-6, `${body.name} ${orbit.stretch}`);
      assert.ok(Math.abs(orbit.semi / (body.physics.radius + height) - 1) < 1e-6, body.name);
      if (rails.domains[body.id] > body.physics.radius + height) {
        assert.equal(primaryOf(rails, at, state), body.id, body.name);
      }
    }
    const adrift = Float64Array.of(at[0] + 3e13, at[1] + 4e13, at[2], 0, 0, 0);
    assert.equal(primaryOf(rails, at, adrift), 0);
  }
});

test("sixty degrees ahead of a planet a body stays with nothing to hold it", () => {
  const system = surveySystem(16, { settled: true, star: null });
  const stars = system.bodies.filter((body) => starborn(body.physics));
  assert.equal(stars.length, 1);
  const planet = system.bodies
    .filter((body) => body.parent === 0 && body.shared === null && body.physics.stretch < 0.06)
    .filter((body) => !system.bodies.some((other) => other.shared?.with === body.id))
    .map((body) => ({ body, share: weightOf(system, body.id) / weightOf(system, 0) }))
    .filter(({ share }) => share > 1e-4 && share < 0.02)
    .sort((left, right) => right.share - left.share)[0];
  assert.ok(planet !== undefined);
  const { id } = planet.body;
  const year = planet.body.physics.year;
  const rails = railsOf(system);
  const fly = createFlyer(rails);
  const blink = 1e-5 * year;
  const arm = (time: number) => {
    const hub = hubOf(system, id, time, true);
    const centre = centreOf(system, id, time, true);
    return { centre, x: hub.x - centre.x, y: hub.y - centre.y, z: hub.z - centre.z };
  };
  const start = 1e8;
  const now = arm(start);
  const next = arm(start + blink);
  const last = arm(start - blink);
  const drift = (pick: (from: ReturnType<typeof arm>) => number) =>
    (pick(next) - pick(last)) / (2 * blink);
  const armSpeed = {
    x: drift((from) => from.x),
    y: drift((from) => from.y),
    z: drift((from) => from.z),
  };
  const hubSpeed = {
    x: drift((from) => from.centre.x),
    y: drift((from) => from.centre.y),
    z: drift((from) => from.centre.z),
  };
  const pole = {
    x: now.y * armSpeed.z - now.z * armSpeed.y,
    y: now.z * armSpeed.x - now.x * armSpeed.z,
    z: now.x * armSpeed.y - now.y * armSpeed.x,
  };
  const size = Math.hypot(pole.x, pole.y, pole.z);
  const axis = { x: pole.x / size, y: pole.y / size, z: pole.z / size };
  const turned = (from: { x: number; y: number; z: number }, angle: number) => {
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const along = axis.x * from.x + axis.y * from.y + axis.z * from.z;
    return {
      x:
        from.x * cosine +
        (axis.y * from.z - axis.z * from.y) * sine +
        axis.x * along * (1 - cosine),
      y:
        from.y * cosine +
        (axis.z * from.x - axis.x * from.z) * sine +
        axis.y * along * (1 - cosine),
      z:
        from.z * cosine +
        (axis.x * from.y - axis.y * from.x) * sine +
        axis.z * along * (1 - cosine),
    };
  };
  const place = turned(now, Math.PI / 3);
  const speed = turned(armSpeed, Math.PI / 3);
  const flight = createFlight(start, [
    now.centre.x + place.x,
    now.centre.y + place.y,
    now.centre.z + place.z,
    hubSpeed.x + speed.x,
    hubSpeed.y + speed.y,
    hubSpeed.z + speed.z,
    1,
  ]);
  let least = Number.POSITIVE_INFINITY;
  let most = Number.NEGATIVE_INFINITY;
  let steps = 0;
  for (let turn = 1; turn <= 400; turn++) {
    steps += fly(flight, start + (turn * year) / 4, null, 1e5);
    const there = arm(flight.time);
    const own = {
      x: flight.state[0] - there.centre.x,
      y: flight.state[1] - there.centre.y,
      z: flight.state[2] - there.centre.z,
    };
    const across =
      axis.x * (there.y * own.z - there.z * own.y) +
      axis.y * (there.z * own.x - there.x * own.z) +
      axis.z * (there.x * own.y - there.y * own.x);
    const angle = Math.atan2(across, there.x * own.x + there.y * own.y + there.z * own.z);
    least = Math.min(least, angle);
    most = Math.max(most, angle);
    const ratio = Math.hypot(own.x, own.y, own.z) / Math.hypot(there.x, there.y, there.z);
    assert.ok(Math.abs(ratio - 1) < 0.01, `turn ${turn}: ${ratio}`);
  }
  assert.ok(least > (55 * Math.PI) / 180 && most < (65 * Math.PI) / 180, `${least}..${most}`);
  assert.ok(steps / 100 < 200, `${steps / 100} steps a year`);
});
