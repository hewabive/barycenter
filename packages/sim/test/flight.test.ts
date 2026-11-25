import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type Burn,
  burnFor,
  centreOf,
  circling,
  createFlight,
  createFlyer,
  createForecast,
  type Heading,
  hubOf,
  lagrangeOf,
  orbitOf,
  passesOf,
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
  const system = surveySystem(1, { settled: true, star: null });
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

test("the points of balance of two bodies lie where the quintics put them", () => {
  const earth = lagrangeOf(3.0404e-6);
  assert.ok(Math.abs(earth.inner - 0.010011) < 2e-5, String(earth.inner));
  assert.ok(Math.abs(earth.outer - 0.010078) < 2e-5, String(earth.outer));
  assert.ok(Math.abs(earth.far - (1 - (7 / 12) * 3.0404e-6)) < 1e-8, String(earth.far));
  const twins = lagrangeOf(0.5);
  assert.ok(Math.abs(twins.inner - 0.5) < 1e-9);
  assert.ok(Math.abs(twins.outer - twins.far) < 1e-9);
  for (const share of [1e-6, 1e-3, 0.02, 0.2]) {
    const { inner, outer } = lagrangeOf(share);
    const hill = Math.cbrt(share / 3);
    assert.ok(inner < outer && inner > 0.6 * hill && outer < 1.4 * hill, String(share));
  }
});

test("a forecast runs ahead of the ship along the path the ship then takes", () => {
  const rails = lone(EARTH_PULL, 6.4e6);
  const fly = createFlyer(rails);
  const far = 7e6;
  const swift = Math.sqrt(EARTH_PULL / far);
  const year = 2 * Math.PI * Math.sqrt(far ** 3 / EARTH_PULL);
  const flight = createFlight(100, [far, 0, 0, 0, swift, 0, 1]);
  const forecast = createForecast(rails, fly, flight, [], null, 4000);
  assert.equal(forecast.count, 1);
  forecast.extend(10);
  assert.equal(forecast.done, false);
  forecast.extend(1e5);
  assert.equal(forecast.done, true);
  assert.equal(forecast.wrecked, null);
  const last = forecast.count - 1;
  assert.ok(Math.abs(forecast.times[last] - 100 - 1.1 * year) < 1e-6 * year);
  assert.ok(forecast.count > 60 && forecast.count < 120, `${forecast.count} samples`);
  assert.equal(flight.time, 100);
  for (const slot of [7, 31, last]) {
    fly(flight, forecast.times[slot], null, 1e5);
    for (let axis = 0; axis < 6; axis++) {
      const off = Math.abs(flight.state[axis] - forecast.states[6 * slot + axis]);
      assert.ok(off < 1e-6 * (axis < 3 ? far : swift), `sample ${slot} axis ${axis}: ${off}`);
    }
  }
  const fixed = createForecast(
    rails,
    fly,
    createFlight(0, [far, 0, 0, 0, swift, 0, 1]),
    [],
    600,
    4000,
  );
  fixed.extend(1e5);
  assert.equal(fixed.times[fixed.count - 1], 600);
});

test("a planned push bends the forecast at its moment and not the flight", () => {
  const rails = lone(EARTH_PULL, 6.4e6);
  const fly = createFlyer(rails);
  const far = 7e6;
  const swift = Math.sqrt(EARTH_PULL / far);
  const year = 2 * Math.PI * Math.sqrt(far ** 3 / EARTH_PULL);
  const flight = createFlight(0, [far, 0, 0, 0, swift, 0, 1]);
  const plan = [
    { time: year / 2, along: 500, north: 0, out: 0, about: null },
    { time: -5, along: 9, north: 9, out: 9, about: null },
  ];
  const forecast = createForecast(rails, fly, flight, plan, null, 4000);
  forecast.extend(1e5);
  assert.equal(forecast.done, true);
  assert.equal(forecast.marks.length, 1);
  const mark = forecast.marks[0];
  assert.ok(mark > 0);
  assert.equal(forecast.times[mark], year / 2);
  assert.equal(forecast.legs[mark - 1], 0);
  assert.equal(forecast.legs[mark], 1);
  assert.ok(Math.abs(forecast.pushes[1] + 500) < 1e-3, String(forecast.pushes[1]));
  assert.ok(Math.abs(forecast.states[6 * mark + 4] + swift + 500) < 1e-3);
  const semi = 1 / (2 / far - (swift + 500) ** 2 / EARTH_PULL);
  const { highs, lows, nearest } = passesOf(forecast, 1, 0, year / 2);
  assert.ok(highs.length >= 1 && lows.length >= 1);
  assert.ok(Math.abs(highs[0].gap / (2 * semi - far) - 1) < 1e-4, String(highs[0].gap));
  assert.ok(Math.abs(lows[0].gap / far - 1) < 1e-4);
  assert.ok(nearest !== null && Math.abs(nearest.gap / far - 1) < 1e-4);
  const turn = 2 * Math.PI * Math.sqrt(semi ** 3 / EARTH_PULL);
  assert.ok(Math.abs(highs[0].time - year / 2 - turn / 2) < 1e-3 * turn);
  assert.ok(Math.abs(forecast.times[forecast.count - 1] - year / 2 - 1.1 * turn) < 1e-3 * turn);
  const across = createForecast(
    rails,
    fly,
    flight,
    [{ time: 10, along: 0, north: 100, out: 50, about: 0 }],
    null,
    4000,
  );
  across.extend(1e5);
  assert.ok(Math.abs(across.pushes[2] - 100) < 1e-3);
  assert.ok(Math.abs(across.pushes[0] - 50) < 0.1);
  assert.equal(flight.state[4], swift);
});

test("a forecast flies a push as the engine will, half before its moment and half after", () => {
  const rails = lone(EARTH_PULL, 6.371e6);
  const fly = createFlyer(rails);
  const speed = Math.sqrt(EARTH_PULL / 6.7e6);
  const from = createFlight(0, [6.7e6, 0, 0, 0, 0, speed, 2e4]);
  const drive = { force: 1e5, exhaust: 4500, dry: 4000, endless: false };
  const kick = { time: 1500, along: 2000, north: 150, out: -80, about: null, drive };
  const size = Math.hypot(kick.along, kick.north, kick.out);
  const span = burnFor(drive, 2e4, size);
  assert.ok(Math.abs(span - (2e4 * (1 - Math.exp(-size / 4500)) * 4500) / 1e5) < 1e-9);

  const forecast = createForecast(rails, fly, from, [kick], 6000, 5000);
  while (!forecast.done) {
    forecast.extend(64);
  }
  const aim = [forecast.pushes[0] / size, forecast.pushes[1] / size, forecast.pushes[2] / size];
  assert.ok(Math.abs(Math.hypot(...forecast.pushes) - size) < 1e-9);
  const mark = forecast.marks[0];
  assert.ok(forecast.times[mark] >= 1500 && forecast.times[mark - 1] < 1500);
  assert.ok(forecast.legs[mark] === 1 && forecast.legs[0] === 0);

  const flight = createFlight(0, from.state);
  const burn: Burn = {
    ...drive,
    heading: "hold",
    about: 0,
    held: { x: aim[0], y: aim[1], z: aim[2] },
  };
  const until = (time: number, thrust: Burn | null) => {
    while (flight.time < time) {
      fly(flight, time, thrust, 64);
    }
  };
  until(1500 - span / 2, null);
  until(1500 + span / 2, burn);
  const last = forecast.count - 1;
  until(forecast.times[last], null);
  for (let axis = 0; axis < 3; axis++) {
    assert.ok(Math.abs(forecast.states[6 * last + axis] - flight.state[axis]) < 1);
    assert.ok(Math.abs(forecast.states[6 * last + 3 + axis] - flight.state[3 + axis]) < 1e-3);
  }
  assert.ok(Math.abs(flight.state[6] - 2e4 * Math.exp(-size / 4500)) < 1e-6);

  const sudden = createForecast(rails, fly, from, [{ ...kick, drive: null }], 6000, 5000);
  while (!sudden.done) {
    sudden.extend(64);
  }
  const apart = Math.hypot(
    sudden.states[6 * (sudden.count - 1)] - flight.state[0],
    sudden.states[6 * (sudden.count - 1) + 1] - flight.state[1],
    sudden.states[6 * (sudden.count - 1) + 2] - flight.state[2],
  );
  assert.ok(apart > 1e5);
});

test("a forecast ends at the ground", () => {
  const rails = lone(EARTH_PULL, 6.4e6);
  const fly = createFlyer(rails);
  const flight = createFlight(0, [7e6, 0, 0, 0, 5000, 0, 1]);
  const forecast = createForecast(rails, fly, flight, [], null, 4000);
  forecast.extend(1e5);
  assert.equal(forecast.wrecked, 0);
  assert.equal(forecast.done, true);
  const short = createForecast(rails, fly, flight, [], null, 5);
  short.extend(1e5);
  assert.equal(short.count, 5);
  assert.equal(short.done, true);
  const again = createForecast(rails, fly, flight, [], null, 4000, forecast);
  assert.equal(again.times, forecast.times);
  assert.equal(again.count, 1);
  again.extend(1e5);
  assert.equal(again.wrecked, 0);
  assert.notEqual(createForecast(rails, fly, flight, [], null, 9, forecast).times, forecast.times);
});

test("a forecast follows a ship out of the hold of a moon and round its planet", () => {
  const system = surveySystem(1, { settled: true, star: null });
  const rails = railsOf(system);
  const fly = createFlyer(rails);
  const home = system.home ?? 0;
  const moon = system.bodies.find((body) => body.parent === home);
  assert.ok(moon !== undefined);
  const state = circling(rails, system, moon.id, 2e5, 0);
  const low = createForecast(rails, fly, createFlight(0, [...state, 1]), [], null, 6000);
  low.extend(1e5);
  assert.equal(low.wrecked, null);
  assert.ok(low.holds.subarray(0, low.count).every((hold) => hold === moon.id));
  const swift = Math.sqrt(rails.pulls[moon.id] / (rails.radii[moon.id] + 2e5));
  const leaving = createForecast(
    rails,
    fly,
    createFlight(0, [...state, 1]),
    [{ time: 600, along: 0.6 * swift, north: 0, out: 0, about: null }],
    null,
    6000,
  );
  leaving.extend(1e5);
  const holds = Array.from(leaving.holds.subarray(0, leaving.count));
  assert.ok(holds.includes(home), "the ship comes into the hold of the planet");
  assert.equal(holds[0], moon.id);
  const out = holds.indexOf(home);
  const { nearest } = passesOf(leaving, rails.count, moon.id, leaving.times[out]);
  assert.ok(nearest === null || nearest.gap > rails.radii[moon.id]);
  assert.ok(leaving.times[leaving.count - 1] > 5 * 86400);
});

test("between a planet and its star a ship hangs where the formula says, and not for long", () => {
  const system = surveySystem(1, { settled: true, star: null });
  const id = system.home ?? 0;
  const body = system.bodies[id];
  const rails = railsOf(system);
  const fly = createFlyer(rails);
  const year = body.physics.year;
  const inside = system.bodies
    .filter((other) => other.parent === body.parent && other.physics.orbit <= body.physics.orbit)
    .reduce((sum, other) => sum + weightOf(system, other.id), system.bodies[0].physics.mass);
  const share = weightOf(system, id) / inside;
  const { inner } = lagrangeOf(share);
  const start = 2e8;
  const blink = 1e-5 * year;
  const arm = (time: number) => {
    const hub = hubOf(system, id, time, true);
    const centre = centreOf(system, id, time, true);
    return { hub, centre };
  };
  const now = arm(start);
  const next = arm(start + blink);
  const last = arm(start - blink);
  const fate = (reach: number): number => {
    const scale = 1 - reach / (1 - share);
    const along = (pick: (from: { x: number; y: number; z: number }) => number) => {
      const place = pick(now.centre) + scale * (pick(now.hub) - pick(now.centre));
      const hubSpeed = (pick(next.hub) - pick(last.hub)) / (2 * blink);
      const centreSpeed = (pick(next.centre) - pick(last.centre)) / (2 * blink);
      return [place, centreSpeed + scale * (hubSpeed - centreSpeed)];
    };
    const [x, u] = along((from) => from.x);
    const [y, v] = along((from) => from.y);
    const [z, w] = along((from) => from.z);
    const flight = createFlight(start, [x, y, z, u, v, w, 1]);
    for (let turn = 1; turn <= 160; turn++) {
      fly(flight, start + (turn * year) / 40, null, 1e5);
      const there = arm(flight.time);
      const wide =
        Math.hypot(
          there.hub.x - there.centre.x,
          there.hub.y - there.centre.y,
          there.hub.z - there.centre.z,
        ) /
        (1 - share);
      const gap =
        Math.hypot(
          flight.state[0] - there.hub.x,
          flight.state[1] - there.hub.y,
          flight.state[2] - there.hub.z,
        ) /
        (wide * reach);
      if (gap < 0.5 || flight.wrecked !== null) {
        return -1;
      }
      if (gap > 1.7) {
        return 1;
      }
    }
    return 0;
  };
  let low = 0.7 * inner;
  let high = 1.3 * inner;
  assert.equal(fate(low), -1);
  assert.equal(fate(high), 1);
  for (let step = 0; step < 24; step++) {
    const middle = (low + high) / 2;
    if (fate(middle) < 0) {
      low = middle;
    } else {
      high = middle;
    }
  }
  assert.ok(Math.abs((low + high) / 2 / inner - 1) < 5e-3, `${(low + high) / 2} against ${inner}`);
});
