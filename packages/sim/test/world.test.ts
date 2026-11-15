import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ASTRONOMICAL_UNIT,
  angleBetween,
  climateOf,
  columnOf,
  createWorld,
  EARTH_AIR,
  EARTH_MASS,
  EARTH_RADIUS,
  elevationAt,
  FLUID_SHARE,
  positionOf,
  type Sketch,
  STAR_LEAST,
  SUN_GLOW,
  SUN_MASS,
  seaCover,
  shareOf,
  sketchSystem,
  slerp,
  stocked,
  strippedShare,
  type Vector,
} from "../src/index.ts";
import { densityOf, hillOf, rocheOf, yearOf } from "../src/physics.ts";
import { sidesOf } from "../src/sphere.ts";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function sketches(): { label: string; system: Sketch }[] {
  return SEEDS.flatMap((seed) => [
    { label: `seed ${seed}`, system: createWorld({ seed }).map.system },
    {
      label: `wild seed ${seed}`,
      system: sketchSystem(seed, { settled: false, star: null }),
    },
  ]);
}

test("the same seed produces the same world", () => {
  assert.deepEqual(createWorld({ seed: 7 }), createWorld({ seed: 7 }));
});

test("different seeds produce different worlds", () => {
  assert.notDeepEqual(createWorld({ seed: 7 }).map, createWorld({ seed: 8 }).map);
});

test("every cell can be reached from every other cell", () => {
  for (const seed of SEEDS) {
    const { map } = createWorld({ seed });
    const reached = new Set([0]);
    const queue = [0];
    for (let head = 0; head < queue.length; head++) {
      for (const link of map.links[queue[head]]) {
        if (!reached.has(link.cell)) {
          reached.add(link.cell);
          queue.push(link.cell);
        }
      }
    }
    assert.equal(reached.size, map.cells.length, `seed ${seed}`);
  }
});

test("a world has about twenty regions of uneven size", () => {
  for (const seed of SEEDS) {
    const { map } = createWorld({ seed });
    const sizes = map.regions.map((region) => region.cells.length);
    assert.ok(sizes.length >= 18 && sizes.length <= 30, `seed ${seed}`);
    assert.ok(Math.min(...sizes) <= 5, `seed ${seed}`);
    assert.ok(Math.max(...sizes) >= 15, `seed ${seed}`);
    assert.equal(
      sizes.reduce((sum, size) => sum + size, 0),
      map.cells.length,
    );
  }
});

test("every region is one piece of land", () => {
  for (const seed of SEEDS) {
    const { map } = createWorld({ seed });
    for (const region of map.regions) {
      const reached = new Set([region.cells[0]]);
      const queue = [region.cells[0]];
      for (let head = 0; head < queue.length; head++) {
        for (const link of map.links[queue[head]]) {
          if (map.joints[link.joint].edge === null && !reached.has(link.cell)) {
            reached.add(link.cell);
            queue.push(link.cell);
          }
        }
      }
      assert.equal(reached.size, region.cells.length, `seed ${seed}, region ${region.id}`);
      assert.ok(region.cells.includes(region.center));
    }
  }
});

test("an edge gathers the joints between two regions, wide and narrow", () => {
  for (const seed of SEEDS) {
    const { map } = createWorld({ seed });
    for (const joint of map.joints) {
      const from = map.cells[joint.a].region;
      const to = map.cells[joint.b].region;
      if (from === to) {
        assert.equal(joint.edge, null);
        assert.equal(joint.kind, "land");
        continue;
      }
      assert.notEqual(joint.edge, null);
      const edge = map.edges[joint.edge ?? 0];
      assert.deepEqual([edge.a, edge.b], [Math.min(from, to), Math.max(from, to)]);
      assert.ok(edge.joints.includes(joint.id));
    }
    const crossing = map.joints.filter((joint) => joint.edge !== null);
    assert.ok(crossing.some((joint) => joint.kind === "land"));
    assert.ok(crossing.some((joint) => joint.kind !== "land"));
  }
});

test("each power starts with the same few cells around its capital and sees its surroundings", () => {
  for (const seed of SEEDS) {
    const state = createWorld({ seed, powers: 3 });
    const homes = state.powers.map((power) => state.map.cells[power.capital].region);
    assert.equal(new Set(homes).size, 3, `seed ${seed}`);
    state.powers.forEach((power, id) => {
      const own = state.cells.filter((cell) => cell.owner === id);
      assert.equal(own.length, state.constants.startCells, `seed ${seed}`);
      assert.equal(state.cells[power.capital].owner, id);
      assert.equal(state.cells[power.capital].level, state.constants.startLevel);
      assert.ok(power.explored[homes[id]]);
      for (const neighbor of state.map.neighbors[homes[id]]) {
        assert.ok(power.explored[neighbor.region]);
      }
    });
  }
});

test("land is where the relief of the home body rises above its sea", () => {
  for (const seed of SEEDS) {
    const { map } = createWorld({ seed });
    const home = map.system.bodies[map.system.home];
    assert.equal(home.physics.life, 1);
    assert.ok(seaCover(home.physics) > 0, `seed ${seed}`);
    assert.ok(home.physics.heat > 278 && home.physics.heat < 300, `seed ${seed}`);
    assert.ok(shareOf(home.physics, "nitrogen") > 0.6, `seed ${seed}`);
    assert.ok(shareOf(home.physics, "oxygen") > 0.15, `seed ${seed}`);
    const sea = home.relief.sea;
    assert.ok(sea !== null);
    for (const cell of map.cells) {
      const height = elevationAt(home.seed, home.relief, cell.position);
      assert.ok(height > sea, `seed ${seed}, cell ${cell.id}`);
      assert.equal(cell.terrain === "mountain", height > home.relief.peak);
    }
    const land = map.cells.length / 400;
    assert.ok(Math.abs(land - 0.62) < 0.01, `seed ${seed}`);
  }
});

test("cells joined by land meet on dry ground and a strait crosses water", () => {
  for (const seed of SEEDS) {
    const { map } = createWorld({ seed });
    const home = map.system.bodies[map.system.home];
    const dry = (at: Vector) => elevationAt(home.seed, home.relief, at) > (home.relief.sea ?? 0);
    const sides = new Map(
      sidesOf(map.cells.map((cell) => cell.position)).map((side) => [`${side.a}:${side.b}`, side]),
    );
    assert.ok(sides.size >= map.joints.length);
    for (const joint of map.joints) {
      const side = sides.get(`${Math.min(joint.a, joint.b)}:${Math.max(joint.a, joint.b)}`);
      assert.ok(side, `seed ${seed}, joint ${joint.id}`);
      const shore = Array.from({ length: 201 }, (_, step) => slerp(side.from, side.to, step / 200));
      const near = shore.filter((at) => angleBetween(at, map.cells[joint.a].position) <= map.reach);
      assert.equal(near.some(dry), joint.kind !== "strait", `seed ${seed}, joint ${joint.id}`);
    }
  }
});

test("a system has one star, a home body and others around them", () => {
  for (const seed of SEEDS) {
    const { system } = createWorld({ seed }).map;
    assert.deepEqual(
      system.bodies.map((body) => body.id),
      system.bodies.map((_, index) => index),
    );
    assert.equal(system.bodies.filter((body) => body.parent === null).length, 1);
    assert.ok(system.bodies[0].physics.mass >= STAR_LEAST);
    assert.equal(new Set(system.bodies.map((body) => body.name)).size, system.bodies.length);
    assert.ok(system.bodies.some((body) => body.parent === system.home));
    for (const body of system.bodies) {
      const at = positionOf(system, body.id, 1234);
      if (body.parent === null) {
        assert.deepEqual(at, { x: 0, y: 0, z: 0 });
        continue;
      }
      const center = positionOf(system, body.parent, 1234);
      const away = Math.hypot(at.x - center.x, at.y - center.y, at.z - center.z);
      assert.ok(Math.abs(away - body.orbit) < 1e-9);
      assert.ok(body.orbit > body.radius + system.bodies[body.parent].radius);
      const later = positionOf(system, body.id, 1234 + body.year);
      const moved = positionOf(system, body.parent, 1234 + body.year);
      const drift = Math.hypot(
        later.x - moved.x - at.x + center.x,
        later.z - moved.z - at.z + center.z,
      );
      assert.ok(drift < 1e-6 * body.orbit);
    }
  }
});

test("the physics of every body holds together", () => {
  for (const { label: world, system } of sketches()) {
    const star = system.bodies[0].physics;
    for (const body of system.bodies) {
      const { physics } = body;
      const label = `${world}, ${body.name}`;
      const whole = physics.iron + physics.rock + physics.ice + physics.gas;
      assert.ok(Math.abs(whole - 1) < 1e-3, label);
      assert.ok(physics.mass > 0 && physics.radius > 0 && physics.heat > 0, label);
      const airy = physics.air > 0 || (physics.gas >= FLUID_SHARE && physics.glow === 0);
      const gases = physics.gases.reduce((sum, part) => sum + part, 0);
      assert.ok(airy ? Math.abs(gases - 1) < 1e-3 : physics.gases.length === 0, label);
      const density = densityOf(physics.mass, physics.radius);
      assert.ok(
        density > 200 && density < (physics.glow > 0 ? 200000 : 20000),
        `${label}: ${density}`,
      );
      if (physics.ring !== null) {
        assert.ok(physics.ring.inner > physics.radius, label);
        assert.ok(physics.ring.outer > physics.ring.inner, label);
        assert.ok(physics.ring.outer < rocheOf(physics.radius, density, 900), label);
      }
      if (body.parent === null) {
        assert.ok(physics.glow > 0, label);
        continue;
      }
      const around = system.bodies[body.parent].physics;
      const year = yearOf(physics.orbit, around.mass);
      assert.ok(Math.abs(physics.year / year - 1) < 1e-3, label);
      assert.ok(physics.orbit > around.radius + physics.radius, label);
      assert.ok(physics.mass < around.mass, label);
      if (body.parent !== 0) {
        assert.equal(physics.day, physics.year, label);
        if (body.parent !== system.home) {
          assert.ok(physics.orbit < hillOf(around.orbit, around.mass, star.mass), label);
        }
      }
    }
  }
});

test("the drawn scale keeps the order and the nesting of the real one", () => {
  for (const { label: world, system } of sketches()) {
    if (system.home !== null) {
      const home = system.bodies[system.home];
      assert.equal(home.radius, 1);
      assert.equal(home.year, 9600);
      assert.equal(home.day, 1200);
    }
    const reach = (id: number): number => {
      const body = system.bodies[id];
      const ring = (body.physics.ring?.outer ?? 0) / body.physics.radius;
      const moons = system.bodies.filter((moon) => moon.parent === id);
      return Math.max(
        body.radius * Math.max(1, ring),
        ...moons.map((moon) => moon.orbit + reach(moon.id)),
      );
    };
    for (const body of system.bodies) {
      const label = `${world}, ${body.name}`;
      const around = system.bodies
        .filter((other) => other.parent === body.id)
        .sort((left, right) => left.physics.orbit - right.physics.orbit);
      around.forEach((child, index) => {
        const before = index === 0 ? null : around[index - 1];
        const edge =
          before === null
            ? body.radius * Math.max(1, (body.physics.ring?.outer ?? 0) / body.physics.radius)
            : before.orbit + reach(before.id);
        assert.ok(child.orbit - reach(child.id) > edge, label);
        assert.equal(child.day === child.year, child.physics.day === child.physics.year, label);
      });
      for (const other of system.bodies) {
        if (other.physics.radius > body.physics.radius) {
          assert.ok(other.radius > body.radius, label);
        }
        if (other.parent === body.parent && other.physics.year > body.physics.year) {
          assert.ok(other.year >= body.year, label);
        }
      }
    }
  }
});

test("the air of a body follows from what it keeps and how warm it is", () => {
  const bar = EARTH_AIR;
  const sun = { glow: SUN_GLOW, weathered: 4e-4 * bar, pool: bar, frozen: false };
  const share = (found: { gases: number[] }, gas: Parameters<typeof shareOf>[1]) =>
    shareOf({ gases: found.gases } as Parameters<typeof shareOf>[0], gas);

  const earth = climateOf({
    ...sun,
    distance: ASTRONOMICAL_UNIT,
    stock: stocked({
      nitrogen: 0.78 * bar,
      oxygen: 0.21 * bar,
      "carbon dioxide": 60 * bar,
      water: 260 * bar,
    }),
  });
  assert.ok(earth.heat > 280 && earth.heat < 295, `earth ${earth.heat}`);
  assert.ok(Math.abs(earth.air / bar - 1) < 0.05);
  assert.ok(share(earth, "carbon dioxide") < 0.001 && share(earth, "water") < 0.03);

  const venus = climateOf({
    ...sun,
    distance: 0.723 * ASTRONOMICAL_UNIT,
    stock: stocked({ nitrogen: 3.2 * bar, "carbon dioxide": 92 * bar }),
  });
  assert.ok(venus.heat > 650 && venus.heat < 900, `venus ${venus.heat}`);
  assert.ok(share(venus, "carbon dioxide") > 0.9);

  const mars = climateOf({
    ...sun,
    distance: 1.524 * ASTRONOMICAL_UNIT,
    stock: stocked({ nitrogen: 2e-4 * bar, "carbon dioxide": 0.006 * bar, water: 2 * bar }),
  });
  assert.ok(mars.heat > 205 && mars.heat < 240, `mars ${mars.heat}`);

  const titan = climateOf({
    ...sun,
    frozen: true,
    distance: 9.54 * ASTRONOMICAL_UNIT,
    stock: stocked({
      nitrogen: 1.4 * bar,
      methane: 2 * bar,
      "carbon dioxide": 0.3 * bar,
      water: 1e4 * bar,
    }),
  });
  assert.ok(titan.heat > 85 && titan.heat < 102, `titan ${titan.heat}`);
  assert.ok(share(titan, "methane") > 0.03 && share(titan, "methane") < 0.25);
  assert.equal(share(titan, "carbon dioxide") < 1e-6, true);

  const cold = climateOf({
    ...sun,
    distance: 1.25 * ASTRONOMICAL_UNIT,
    stock: stocked({ nitrogen: 0.5 * bar, "carbon dioxide": 20 * bar, water: 260 * bar }),
  });
  assert.ok(cold.heat >= 277 && cold.heat < 285, `thermostat ${cold.heat}`);
  assert.ok(share(cold, "carbon dioxide") > share(earth, "carbon dioxide"));

  const wrapped = (distance: number, hydrogen: number) =>
    climateOf({
      ...sun,
      distance: distance * ASTRONOMICAL_UNIT,
      stock: stocked({ hydrogen: hydrogen * bar, water: 260 * bar }),
    });
  const outer = wrapped(10, 40);
  assert.ok(outer.heat > 262 && outer.heat < 300, `hydrogen at 10 AU ${outer.heat}`);
  const inner = wrapped(1.4, 300);
  assert.ok(inner.heat > 1000, `hydrogen at 1.4 AU ${inner.heat}`);
  assert.ok(share(inner, "water") > 0.1);

  const far = climateOf({
    ...sun,
    frozen: true,
    distance: 39.5 * ASTRONOMICAL_UNIT,
    stock: stocked({ nitrogen: bar, water: 1e4 * bar }),
  });
  assert.equal(far.air, 0);
  assert.deepEqual(far.gases, []);
});

test("the light of the star takes a thin wrap of gas from a body near it", () => {
  const sun = { mass: SUN_MASS, glow: SUN_GLOW };
  const mass = 3 * EARTH_MASS;
  const radius = 1.35 * EARTH_RADIUS;
  const wrap = (40 * EARTH_AIR) / columnOf(mass, radius);
  const lost = (distance: number) => strippedShare(mass, radius, sun, distance * ASTRONOMICAL_UNIT);
  assert.ok(lost(1) > wrap);
  assert.ok(lost(4) < wrap);
  assert.ok(lost(2) / wrap > 0.5 && lost(2) / wrap < 2);
  const dwarf = { mass: 0.3 * SUN_MASS, glow: 0.01 * SUN_GLOW };
  assert.ok(strippedShare(mass, radius, dwarf, 0.1 * ASTRONOMICAL_UNIT) > lost(1));
  for (let seed = 1; seed <= 40; seed++) {
    for (const body of sketchSystem(seed, { settled: false, star: null }).bodies) {
      const hot = seaCover(body.physics) > 0 && body.physics.heat > 647;
      assert.equal(hot, false, `seed ${seed}, ${body.name}`);
    }
  }
});

test("a system sketched without a home has no life and can be given its star", () => {
  for (const seed of SEEDS) {
    const wild = sketchSystem(seed, { settled: false, star: null });
    assert.equal(wild.home, null);
    assert.ok(wild.bodies.every((body) => body.physics.life === 0));
    assert.deepEqual(wild, sketchSystem(seed, { settled: false, star: null }));
    const given = sketchSystem(seed, { settled: true, star: 2e30 });
    assert.equal(given.bodies[0].physics.mass, 2e30);
    assert.notEqual(given.home, null);
  }
  const sizes = Array.from(
    { length: 60 },
    (_, seed) => sketchSystem(seed + 1, { settled: false, star: null }).bodies.length,
  );
  assert.ok(Math.min(...sizes) >= 1 && Math.max(...sizes) > 12 && Math.max(...sizes) < 40);
});

test("systems differ in their stars and in what circles them", () => {
  const systems = Array.from(
    { length: 60 },
    (_, seed) => createWorld({ seed: seed + 1 }).map.system,
  );
  const heats = systems.map((system) => system.bodies[0].physics.heat);
  assert.ok(Math.min(...heats) < 4200 && Math.max(...heats) > 6500);
  const fluid = systems.filter((system) =>
    system.bodies.some((body) => body.parent === 0 && body.physics.gas >= FLUID_SHARE),
  );
  assert.ok(fluid.length > 30 && fluid.length < 60);
  assert.ok(systems.some((system) => system.bodies.some((body) => body.physics.ring !== null)));
});

test("relief is the same at the same place and smooth between places", () => {
  const { system } = createWorld({ seed: 3 }).map;
  const home = system.bodies[system.home];
  const at = { x: 0.36, y: 0.48, z: 0.8 };
  const height = elevationAt(home.seed, home.relief, at);
  assert.equal(elevationAt(home.seed, home.relief, { ...at }), height);
  assert.notEqual(elevationAt(home.seed + 1, home.relief, at), height);
  const beside = elevationAt(home.seed, home.relief, { x: 0.36, y: 0.4801, z: 0.8 });
  assert.ok(Math.abs(beside - height) < 0.01);
});
