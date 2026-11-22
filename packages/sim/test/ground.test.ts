import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type Body,
  ceilingOf,
  createFlight,
  createFlyer,
  createGround,
  createLander,
  createRandom,
  createRover,
  crustOf,
  depthOf,
  drive,
  GROUND_GRAIN,
  grainOf,
  groundAt,
  landable,
  poleOf,
  ROVER,
  railsOf,
  surveySystem,
  TILE_CELLS,
  turnOf,
  wrapped,
} from "../src/index.ts";
import { scatter } from "../src/sphere.ts";

const system = surveySystem(1, { settled: true, star: null });
const rails = railsOf(system);
const solid = system.bodies.filter(landable);
const pocked = solid.filter((body) => body.relief.craters > 0.5);
const moon = pocked.reduce((best, body) =>
  body.physics.radius > best.physics.radius ? body : best,
);

const beside = (
  centre: { x: number; y: number; z: number },
  reach: number,
  random: () => number,
) => {
  const x = centre.x + reach * (random() - 0.5);
  const y = centre.y + reach * (random() - 0.5);
  const z = centre.z + reach * (random() - 0.5);
  const length = Math.hypot(x, y, z);
  return { x: x / length, y: y / length, z: z / length };
};

test("a patch of ground is the ground at every point in it, at any size and grain", () => {
  const random = createRandom(11);
  const centres = scatter(12, random);
  for (const body of [moon, solid[0]]) {
    const { radius } = body.physics;
    for (const [index, centre] of centres.entries()) {
      const level = (index * 3) % (depthOf(radius) + 1);
      const reach = Math.PI / 2 ** (level + 1);
      const grain = grainOf(radius, level);
      const ground = createGround(body, centre, reach, grain);
      for (let sample = 0; sample < 40; sample++) {
        const at = beside(centre, reach, () => random.next());
        const plain = groundAt(body, at, grain);
        assert.ok(Math.abs(ground(at.x, at.y, at.z) - plain) < 1e-6);
      }
    }
  }
});

test("the finest tiles of a body have cells of half a meter to a meter", () => {
  for (const body of solid) {
    const { radius } = body.physics;
    const cell = (radius * Math.PI) / (2 * TILE_CELLS * 2 ** depthOf(radius));
    assert.ok(cell >= GROUND_GRAIN && cell < 2 * GROUND_GRAIN);
    assert.ok(radius * grainOf(radius) < cell);
    assert.equal(grainOf(radius, 3), 2 * grainOf(radius, 4));
  }
});

test("the frame of a body turns once a day about its pole and back again", () => {
  const into = new Float64Array(3);
  const back = new Float64Array(3);
  for (const body of solid) {
    const turn = turnOf(body);
    const pole = poleOf(body);
    for (const time of [0, 0.3 * body.day, 7.7 * body.day]) {
      turn.spun(time, 0, 1, 0, into);
      assert.ok(Math.hypot(into[0] - pole.x, into[1] - pole.y, into[2] - pole.z) < 1e-12);
      turn.spun(time, 0.48, 0.6, 0.64, into);
      turn.fixed(time, into[0], into[1], into[2], back);
      assert.ok(Math.hypot(back[0] - 0.48, back[1] - 0.6, back[2] - 0.64) < 1e-12);
    }
    turn.spun(0, 1, 0, 0, into);
    turn.spun(body.day / 4, 1, 0, 0, back);
    assert.ok(Math.abs(into[0] * back[0] + into[1] * back[1] + into[2] * back[2]) < 1e-9);
    turn.spun(body.day, 1, 0, 0, back);
    assert.ok(Math.hypot(into[0] - back[0], into[1] - back[1], into[2] - back[2]) < 1e-9);
  }
});

test("the surface of a round solid body stays under its ceiling and a gas body has none", () => {
  const crust = crustOf(system);
  const points = scatter(200, createRandom(3));
  for (const body of system.bodies) {
    const { radius } = body.physics;
    if (!landable(body)) {
      assert.equal(crust.ceilings[body.id], radius);
      assert.equal(crust.surface(body.id, 0, radius, 0, 0), radius);
      continue;
    }
    assert.ok(!wrapped(body.physics));
    let highest = 0;
    let lowest = Number.POSITIVE_INFINITY;
    for (const at of points) {
      const surface = crust.surface(body.id, 0, at.x * radius, at.y * radius, at.z * radius);
      highest = Math.max(highest, surface);
      lowest = Math.min(lowest, surface);
    }
    assert.ok(highest < ceilingOf(body), `${body.name} rises to ${highest - radius}`);
    assert.ok(lowest > 0.75 * radius);
    assert.ok(highest - lowest > 0.2 * body.relief.height);
  }
});

const placed = (time: number) => {
  const at = new Float64Array(3 * rails.count);
  const speed = new Float64Array(3 * rails.count);
  rails.place(time, at, speed);
  return { at, speed };
};

const over = (
  body: Body,
  time: number,
  toward: { x: number; y: number; z: number },
  far: number,
) => {
  const { at, speed } = placed(time);
  const base = 3 * body.id;
  return Float64Array.of(
    at[base] + far * toward.x,
    at[base + 1] + far * toward.y,
    at[base + 2] + far * toward.z,
    speed[base],
    speed[base + 1],
    speed[base + 2],
    1000,
  );
};

test("a ship set down stands on the ground and turns with it", () => {
  const lander = createLander(system);
  const slip = new Float64Array(3);
  for (const toward of scatter(6, createRandom(8))) {
    const state = over(moon, 500, toward, 1.2 * moon.physics.radius);
    const first = placed(500);
    const berth = lander.touch(moon.id, 500, first.at, state, 4);
    for (const time of [500, 500 + 0.37 * moon.day]) {
      const { at, speed } = placed(time);
      lander.hold(berth, time, at, speed, state);
      assert.ok(Math.abs(lander.clearance(moon.id, time, at, state) - 4) < 1e-3);
      lander.slip(moon.id, at, speed, state, slip);
      assert.ok(Math.hypot(slip[0], slip[1], slip[2]) < 1e-6);
    }
  }
});

test("a falling ship meets the ground where the relief stands", () => {
  const crust = crustOf(system);
  const fly = createFlyer(rails, crust);
  const plain = createFlyer(rails);
  const { radius } = moon.physics;
  let apart = 0;
  for (const toward of scatter(5, createRandom(19))) {
    const ground = crust.surface(moon.id, 0, toward.x, toward.y, toward.z);
    const flight = createFlight(0, over(moon, 0, toward, ground + 2000));
    const blind = createFlight(0, over(moon, 0, toward, ground + 2000));
    while (flight.wrecked === null && flight.time < 4000) {
      fly(flight, flight.time + 0.5, null, 50);
    }
    while (blind.wrecked === null && blind.time < 40000) {
      plain(blind, blind.time + 0.5, null, 50);
    }
    assert.equal(flight.wrecked, moon.id);
    const { at } = placed(flight.time);
    const base = 3 * moon.id;
    const { state } = flight;
    const far = Math.hypot(state[0] - at[base], state[1] - at[base + 1], state[2] - at[base + 2]);
    const fallen = Math.hypot(state[3], state[4], state[5]);
    assert.ok(Math.abs(far - ground) < 0.6 * (fallen + 5), `${far - ground} m off`);
    apart = Math.max(apart, Math.abs(blind.time - flight.time));
    assert.ok(Math.abs(ground - radius) < ceilingOf(moon) - radius);
  }
  assert.ok(apart > 1);
});

test("a rover keeps to the ground, climbs gentle slopes and is held by steep ones", () => {
  const crust = crustOf(system);
  const { radius, mass } = moon.physics;
  const pull = 6.674e-11 * mass;
  const start = scatter(9, createRandom(5))[4];
  const rover = createRover(crust, radius, moon.id, start, { x: 0, y: 1, z: 0 });
  const from = { ...rover.at };
  for (let second = 0; second < 30; second++) {
    drive(crust, radius, pull, rover, { throttle: 1, turn: 0, brake: false }, 1);
    assert.ok(Math.abs(Math.hypot(rover.at.x, rover.at.y, rover.at.z) - 1) < 1e-12);
    const tangent =
      rover.ahead.x * rover.at.x + rover.ahead.y * rover.at.y + rover.ahead.z * rover.at.z;
    assert.ok(Math.abs(tangent) < 1e-9);
    assert.equal(rover.height, crust.rise(moon.id, rover.at.x, rover.at.y, rover.at.z));
    assert.ok(Math.abs(rover.speed) <= ROVER.swiftest + 5);
  }
  const gone = radius * Math.hypot(rover.at.x - from.x, rover.at.y - from.y, rover.at.z - from.z);
  assert.ok(gone > 20 && gone < 30 * (ROVER.swiftest + 5), `${gone} m`);
  for (let second = 0; second < 60; second++) {
    drive(crust, radius, pull, rover, { throttle: 0, turn: 0, brake: true }, 1);
  }
  if (Math.abs(rover.slope) < ROVER.grip) {
    assert.equal(rover.speed, 0);
  }
  const turned = { ...rover.ahead };
  drive(crust, radius, pull, rover, { throttle: 0, turn: 1, brake: false }, 1);
  const cosine = turned.x * rover.ahead.x + turned.y * rover.ahead.y + turned.z * rover.ahead.z;
  assert.ok(Math.abs(Math.acos(cosine) - ROVER.pivot) < 0.02);
});
