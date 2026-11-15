import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ASTRONOMICAL_UNIT,
  angleBetween,
  BROWN_LEAST,
  centreOf,
  classOf,
  climateOf,
  columnOf,
  createWorld,
  EARTH_AIR,
  EARTH_MASS,
  EARTH_RADIUS,
  EARTH_SEEN,
  elevationAt,
  GIGAYEAR,
  glowOf,
  heatAt,
  hubOf,
  innerHeat,
  JUPITER_MASS,
  LUMENS,
  lampsOf,
  moltenOf,
  type Physics,
  poleOf,
  positionOf,
  radiusOf,
  roughOf,
  SKY_LIGHT,
  type Sketch,
  STAR_LEAST,
  SUN_GLOW,
  SUN_MASS,
  seaCover,
  seenGlow,
  seenShare,
  shareOf,
  shownLight,
  sketchSystem,
  slerp,
  starHeat,
  stocked,
  strippedShare,
  swayOf,
  swingOf,
  type Vector,
  wrapped,
} from "../src/index.ts";
import {
  densityOf,
  hillOf,
  rocheOf,
  starGlow,
  starRadius,
  starSpan,
  yearOf,
} from "../src/physics.ts";
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
    assert.ok(home.physics.light > 1280 && home.physics.light < 1480, `seed ${seed}`);
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
      const at = hubOf(system, body.id, 1234);
      if (body.parent === null) {
        assert.deepEqual(at, { x: 0, y: 0, z: 0 });
        continue;
      }
      const around = system.bodies[body.parent];
      const share = around.mate === body.id ? 1 - swayOf(system, around.id) : 1;
      const center = centreOf(system, body.id, 1234);
      const away = Math.hypot(at.x - center.x, at.y - center.y, at.z - center.z) / share;
      const oval = body.physics.stretch;
      assert.ok(away > body.orbit * (1 - oval) - 1e-9 && away < body.orbit * (1 + oval) + 1e-9);
      assert.ok(body.orbit * (1 - oval) > body.radius + around.radius);
      const later = hubOf(system, body.id, 1234 + body.year);
      const moved = centreOf(system, body.id, 1234 + body.year);
      const drift = Math.hypot(
        later.x - moved.x - at.x + center.x,
        later.y - moved.y - at.y + center.y,
        later.z - moved.z - at.z + center.z,
      );
      assert.ok(drift < 1e-6 * body.orbit);
    }
  }
});

test("the physics of every body holds together", () => {
  for (const { label: world, system } of sketches()) {
    for (const body of system.bodies) {
      const { physics } = body;
      const label = `${world}, ${body.name}`;
      const whole = physics.iron + physics.rock + physics.ice + physics.gas;
      assert.ok(Math.abs(whole - 1) < 1e-3, label);
      assert.ok(physics.mass > 0 && physics.radius > 0 && physics.heat > 0, label);
      assert.ok(physics.coldest <= physics.heat && physics.heat <= physics.hottest, label);
      const airy = physics.air > 0 || (wrapped(physics) && physics.mass < STAR_LEAST);
      const gases = physics.gases.reduce((sum, part) => sum + part, 0);
      assert.ok(airy ? Math.abs(gases - 1) < 1e-3 : physics.gases.length === 0, label);
      const density = densityOf(physics.mass, physics.radius);
      assert.ok(
        density > 50 && density < (physics.glow > 0 ? 200000 : 20000),
        `${label}: ${density}`,
      );
      assert.equal(physics.glow > 0, wrapped(physics), label);
      assert.equal(physics.light > 0, body.parent !== null, label);
      assert.equal(physics.age, system.bodies[0].physics.age, label);
      assert.equal(body.disks.length, physics.disks.length, label);
      for (const disk of physics.disks) {
        assert.ok(disk.inner > physics.radius && disk.outer > disk.inner, label);
        assert.ok(disk.mass > 0 && disk.depth > 0 && disk.depth < 1, label);
        if (body.parent !== null) {
          const pull = system.bodies[body.parent].physics.mass;
          assert.ok(disk.outer < rocheOf(physics.radius, density, 900), label);
          assert.ok(disk.outer < 0.34 * hillOf(physics.orbit, physics.mass, pull), label);
          assert.ok(disk.depth > 0.1, label);
        } else {
          assert.ok(disk.depth < 1e-3, label);
        }
      }
      if (body.parent === null) {
        assert.ok(physics.glow > 0, label);
        continue;
      }
      const around = system.bodies[body.parent].physics;
      const mate = system.bodies[body.parent].mate;
      const pair = mate === null || mate === body.id ? null : system.bodies[mate].physics;
      const both = pair !== null && physics.orbit > pair.orbit ? pair.mass : 0;
      const own = physics.mass >= 0.03 * (physics.mass + around.mass + both) ? physics.mass : 0;
      const year = yearOf(physics.orbit, around.mass + both + own);
      assert.ok(Math.abs(physics.year / year - 1) < 1e-3, label);
      assert.equal(mate === body.id, physics.mass >= 0.03 * (physics.mass + around.mass), label);
      assert.ok(physics.stretch >= 0 && physics.stretch < 0.7, label);
      assert.ok(physics.orbit * (1 - physics.stretch) > around.radius + physics.radius, label);
      assert.ok(physics.mass < around.mass, label);
      const host = system.bodies[body.parent].parent;
      if (host !== null) {
        assert.equal(physics.day === physics.year || around.mass >= STAR_LEAST, true, label);
        if (body.parent !== system.home) {
          const pull = system.bodies[host].physics.mass;
          const nearest = around.orbit * (1 - around.stretch);
          const farthest = physics.orbit * (1 + physics.stretch);
          assert.ok(farthest < hillOf(nearest, around.mass, pull), label);
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
    const own = (id: number): number => {
      const body = system.bodies[id];
      const rings = body.parent === null ? [] : body.disks;
      return Math.max(body.radius, ...rings.map((lane) => lane.outer));
    };
    const reach = (id: number): number => {
      const moons = system.bodies.filter((moon) => moon.parent === id);
      return Math.max(
        own(id),
        ...moons.map((moon) => moon.orbit * (1 + moon.physics.stretch) + reach(moon.id)),
      );
    };
    const root = system.bodies[0];
    root.disks.forEach((lane, index) => {
      const belt = root.physics.disks[index];
      assert.ok(lane.outer > lane.inner && lane.inner > root.radius, world);
      for (const planet of system.bodies.filter((body) => body.parent === 0)) {
        const span = reach(planet.id);
        const inside = planet.physics.orbit < belt.inner;
        const oval = planet.physics.stretch;
        assert.ok(
          inside
            ? planet.orbit * (1 + oval) + span < lane.inner
            : planet.orbit * (1 - oval) - span > lane.outer,
          `${world}, ${planet.name} and a belt`,
        );
      }
    });
    for (const body of system.bodies) {
      const label = `${world}, ${body.name}`;
      const around = system.bodies
        .filter((other) => other.parent === body.id)
        .sort((left, right) => left.physics.orbit - right.physics.orbit);
      around.forEach((child, index) => {
        const before = index === 0 ? null : around[index - 1];
        const edge =
          before === null
            ? own(body.id)
            : before.orbit * (1 + before.physics.stretch) + reach(before.id);
        assert.ok(child.orbit * (1 - child.physics.stretch) - reach(child.id) > edge, label);
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

test("a moon has a moon of its own only where it holds one", () => {
  let found = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const { bodies } = sketchSystem(seed, { settled: false, star: null });
    for (const body of bodies) {
      const moon = body.parent === null ? null : bodies[body.parent];
      const planet = moon === null || moon.parent === null ? null : bodies[moon.parent];
      if (moon === null || planet === null || planet.parent === null) {
        continue;
      }
      if (planet.physics.mass >= STAR_LEAST) {
        continue;
      }
      found += 1;
      const hold = hillOf(moon.physics.orbit, moon.physics.mass, planet.physics.mass);
      assert.ok(body.physics.orbit < 0.34 * hold, `seed ${seed}, ${body.name}`);
      assert.ok(body.physics.orbit >= 3 * moon.physics.radius, `seed ${seed}, ${body.name}`);
      assert.ok(hold > 9 * moon.physics.radius, `seed ${seed}, ${body.name}`);
    }
  }
  assert.ok(found > 3 && found < 80, `found ${found}`);
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
  assert.ok(Math.min(...sizes) >= 1 && Math.max(...sizes) > 12 && Math.max(...sizes) < 48);
});

test("systems differ in their stars and in what circles them", () => {
  const systems = Array.from(
    { length: 60 },
    (_, seed) => createWorld({ seed: seed + 1 }).map.system,
  );
  const heats = systems.map((system) => system.bodies[0].physics.heat);
  assert.ok(Math.min(...heats) < 4200 && Math.max(...heats) > 6500);
  const fluid = systems.filter((system) =>
    system.bodies.some((body) => body.parent === 0 && wrapped(body.physics)),
  );
  assert.ok(fluid.length > 30);
  const ringed = systems.filter((system) =>
    system.bodies.some((body) => body.parent !== null && body.physics.disks.length > 0),
  );
  const belted = systems.filter((system) => system.bodies[0].physics.disks.length > 0);
  assert.ok(ringed.length > 10);
  assert.ok(belted.length > 15 && belted.length < 58);
});

test("a body in gas keeps heat of its own, more of it when heavy or young", () => {
  const old = 4.5 * GIGAYEAR;
  const jupiter = innerHeat(JUPITER_MASS, old, 0.6);
  assert.ok(jupiter > 85 && jupiter < 115, `jupiter ${jupiter}`);
  const calm = innerHeat(0.046 * JUPITER_MASS, old, 0);
  const lively = innerHeat(0.054 * JUPITER_MASS, old, 1);
  assert.ok(calm < 32 && lively > 45 && lively < 70, `ice giants ${calm} ${lively}`);
  const dwarf = innerHeat(50 * JUPITER_MASS, old, 0.5);
  assert.ok(dwarf > 900 && dwarf < 1250, `brown dwarf ${dwarf}`);
  assert.ok(innerHeat(50 * JUPITER_MASS, GIGAYEAR, 0.5) > 1.3 * dwarf);
  assert.ok(innerHeat(20 * JUPITER_MASS, old, 0.5) < 0.7 * dwarf);
  const least = starHeat(starGlow(STAR_LEAST), starRadius(STAR_LEAST));
  assert.ok(Math.abs(innerHeat(0.999 * STAR_LEAST, old, 0.5) / least - 1) < 0.06);
  const gas = { iron: 0.01, rock: 0.02, ice: 0.02, gas: 0.95 };
  const cool = radiusOf(JUPITER_MASS, gas, 500);
  assert.equal(radiusOf(JUPITER_MASS, gas), cool);
  const puffed = radiusOf(JUPITER_MASS, gas, 1800) / cool;
  assert.ok(puffed > 1.25 && puffed < 1.6, `puffed ${puffed}`);
  assert.ok(radiusOf(5 * JUPITER_MASS, gas, 1800) / radiusOf(5 * JUPITER_MASS, gas) < puffed);
});

test("light is drawn on a scale that keeps what is brighter brighter", () => {
  assert.ok(Math.abs(LUMENS * seenShare(5772) - 93) < 3);
  assert.ok(Math.abs(LUMENS * seenShare(2900) - 17) < 2);
  assert.ok(Math.abs(LUMENS * EARTH_SEEN - 127000) < 4000);
  const ember = (LUMENS * seenGlow(1000)) / Math.PI;
  assert.ok(ember > 1 && ember < 6, `a thousand kelvin ${ember}`);
  assert.equal(seenGlow(30), 0);
  assert.equal(seenGlow(0), 0);
  assert.deepEqual(shownLight([EARTH_SEEN], 0), shownLight([EARTH_SEEN], 288));

  const home = shownLight([EARTH_SEEN], 288);
  assert.ok(Math.abs(home.lamps[0] - 1) < 1e-9);
  assert.equal(home.glow, 0);
  assert.ok(Math.abs(home.sky - 0.025) < 1e-9);
  const far = shownLight([EARTH_SEEN / 900], 50);
  assert.ok(
    far.lamps[0] > 0.45 && far.lamps[0] < 0.55,
    `at thirty times the distance ${far.lamps[0]}`,
  );
  assert.ok(shownLight([EARTH_SEEN / 30], 100).lamps[0] > far.lamps[0]);
  assert.ok(shownLight([EARTH_SEEN * 1000], 288).lamps[0] <= 1.35);

  const dwarf = shownLight([EARTH_SEEN * 1.66e-5], 1013);
  assert.ok(dwarf.glow > dwarf.lamps[0] && dwarf.lamps[0] > 0.2 * dwarf.glow);
  assert.ok(dwarf.glow > 0.3 && dwarf.glow < 0.7, `far brown dwarf ${dwarf.glow}`);
  const scorched = shownLight([EARTH_SEEN * 1000], 1436);
  assert.ok(scorched.lamps[0] > 5 * scorched.glow && scorched.glow > 0.05);
  const even = seenGlow(1500) / 0.3;
  const level = shownLight([even], 1500);
  assert.ok(Math.abs(level.lamps[0] - level.glow) < 1e-9);
  assert.ok(shownLight([even], 2000).glow > level.glow);
  assert.equal(shownLight([EARTH_SEEN], 600).glow, 0);

  const dark = shownLight([], 300);
  assert.ok(dark.sky > 0.08 && dark.sky < 0.2, `under the stars alone ${dark.sky}`);
  const pair = shownLight([SKY_LIGHT * 1e4, SKY_LIGHT * 10], 100);
  assert.ok(pair.lamps[0] > pair.lamps[1] && pair.lamps[1] > pair.sky);

  let lit = 0;
  let warmed = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const system = sketchSystem(seed, { settled: false, star: null });
    for (const body of system.bodies) {
      const lamps = lampsOf(system, body.id);
      const label = `seed ${seed}, ${body.name}`;
      if (body.parent === null) {
        assert.deepEqual(
          lamps.map((lamp) => lamp.source),
          body.mate === null ? [] : [body.mate],
          label,
        );
        continue;
      }
      const centre = system.bodies[0].physics;
      const sun = lamps.find((lamp) => lamp.source === 0);
      if (centre.mass >= STAR_LEAST) {
        assert.ok(sun, label);
      }
      const suns = system.bodies.filter((other) => other.physics.mass >= STAR_LEAST).length;
      if (sun && body.parent === 0 && suns === 1) {
        const given = body.physics.light * seenShare(centre.heat);
        assert.ok(Math.abs(sun.seen / given - 1) < 0.01, `${label}: ${sun.seen} ${given}`);
      }
      assert.ok(
        lamps.every((lamp, at) => at === 0 || lamp.seen <= lamps[at - 1].seen),
        label,
      );
      const host = system.bodies[body.parent];
      if (host.parent !== null) {
        assert.ok(body.physics.light >= host.physics.light, label);
      }
      if (host.parent !== null && host.physics.heat > 900) {
        assert.ok(
          lamps.some((lamp) => lamp.source === host.id),
          label,
        );
        const near = body.physics.orbit < 20 * host.physics.radius;
        const fiery = glowOf(1, host.physics.heat) > 4e5 * Math.PI * host.physics.light;
        if (near && fiery) {
          assert.ok(body.physics.light > 100 * host.physics.light, label);
          assert.ok(body.physics.heat > 100, `${label}: ${body.physics.heat}`);
          warmed += 1;
        }
        lit += 1;
      }
    }
  }
  assert.ok(lit > 5, `moons lit by what they circle ${lit}`);
  assert.ok(warmed > 1, `moons warmed by what they circle ${warmed}`);
});

test("an orbit is an oval in a plane of its own, swept as the pull of its centre bids", () => {
  let stirred = 0;
  let tilted = 0;
  let tied = 0;
  let backward = 0;
  for (let seed = 1; seed <= 150; seed++) {
    const system = sketchSystem(seed, { settled: seed % 3 === 0, star: null });
    const planets = system.bodies
      .filter((body) => body.parent === 0)
      .sort((left, right) => left.physics.orbit - right.physics.orbit);
    planets.forEach((planet, index) => {
      const next = planets[index + 1];
      const far = planet.physics.orbit * (1 + planet.physics.stretch);
      assert.ok(!next || far < next.physics.orbit * (1 - next.physics.stretch), `seed ${seed}`);
    });
    for (const body of system.bodies) {
      const label = `seed ${seed}, ${body.name}`;
      if (body.parent === null) {
        continue;
      }
      const around = system.bodies[body.parent];
      const whole = around.mate === body.id ? 1 - swayOf(system, around.id) : 1;
      const from = (tick: number) => {
        const at = hubOf(system, body.id, tick);
        const middle = centreOf(system, body.id, tick);
        return {
          x: (at.x - middle.x) / whole,
          y: (at.y - middle.y) / whole,
          z: (at.z - middle.z) / whole,
        };
      };
      const oval = body.physics.stretch;
      const nearest = (-body.phase * body.year) / (2 * Math.PI);
      const near = from(nearest);
      const far = from(nearest + body.year / 2);
      assert.ok(
        Math.abs(Math.hypot(near.x, near.y, near.z) / body.orbit - (1 - oval)) < 1e-6,
        label,
      );
      assert.ok(Math.abs(Math.hypot(far.x, far.y, far.z) / body.orbit - (1 + oval)) < 1e-6, label);
      const start = from(100);
      const later = from(100 + body.year / 4);
      const sweep = {
        x: start.y * later.z - start.z * later.y,
        y: start.z * later.x - start.x * later.z,
        z: start.x * later.y - start.y * later.x,
      };
      const size = Math.hypot(sweep.x, sweep.y, sweep.z);
      const up = {
        x: Math.sin(body.slant) * Math.sin(body.node),
        y: Math.cos(body.slant),
        z: Math.sin(body.slant) * Math.cos(body.node),
      };
      const along = (sweep.x * up.x + sweep.y * up.y + sweep.z * up.z) / size;
      assert.ok(Math.abs(along - 1) < 1e-6, `${label}: ${along}`);
      const pole = poleOf(body);
      const level = pole.x * up.x + pole.y * up.y + pole.z * up.z;
      if (body.physics.day === body.physics.year) {
        assert.ok(Math.abs(level - 1) < 1e-6, label);
      }
      if (around.parent !== null && body.slant === around.tilt) {
        const host = poleOf(around);
        assert.ok(Math.abs(host.x * up.x + host.y * up.y + host.z * up.z - 1) < 1e-6, label);
      }
      stirred += around.parent === null && oval > 0.15 ? 1 : 0;
      tilted += around.parent === null && body.slant > 0.15 ? 1 : 0;
      tied += around.parent === null && body.physics.day === body.physics.year ? 1 : 0;
      backward += body.slant > Math.PI / 2 ? 1 : 0;
    }
    if (system.home !== null) {
      const home = system.bodies[system.home];
      assert.ok(home.physics.stretch <= 0.03 && home.slant === 0, `seed ${seed}`);
      assert.notEqual(home.physics.day, home.physics.year);
    }
  }
  assert.ok(stirred > 5 && stirred < 120, `stretched ${stirred}`);
  assert.ok(tilted > 10 && tilted < 150, `tilted ${tilted}`);
  assert.ok(tied > 30, `tied ${tied}`);
  assert.ok(backward > 1, `backward ${backward}`);
});

test("two bodies of like mass circle the point between them", () => {
  let near = 0;
  let far = 0;
  let double = 0;
  let swayed = 0;
  let owned = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const system = sketchSystem(seed, { settled: seed % 4 === 0, star: null });
    const stars = system.bodies.filter((body) => body.physics.mass >= STAR_LEAST);
    assert.ok(stars.length <= 2, `seed ${seed}`);
    for (const body of system.bodies) {
      if (body.mate === null) {
        continue;
      }
      const label = `seed ${seed}, ${body.name}`;
      const mate = system.bodies[body.mate];
      assert.equal(mate.parent, body.id, label);
      for (const tick of [0, 777, 5000]) {
        const hub = hubOf(system, body.id, tick);
        const one = positionOf(system, body.id, tick);
        const other = positionOf(system, mate.id, tick);
        const pull = (axis: "x" | "y" | "z") =>
          body.physics.mass * (one[axis] - hub[axis]) +
          mate.physics.mass * (other[axis] - hub[axis]);
        const lever = (body.physics.mass + mate.physics.mass) * mate.orbit;
        assert.ok(Math.hypot(pull("x"), pull("y"), pull("z")) < 1e-9 * lever, label);
      }
      const apart = mate.physics.orbit * (1 - mate.physics.stretch);
      for (const other of system.bodies.filter((kin) => kin.parent === body.id && kin !== mate)) {
        const inside = other.physics.orbit < mate.physics.orbit;
        const edge = inside
          ? other.physics.orbit * (1 + other.physics.stretch) < 0.36 * apart
          : other.physics.orbit * (1 - other.physics.stretch) >
            2.5 * mate.physics.orbit * (1 + mate.physics.stretch);
        assert.ok(edge || mate.physics.mass < 0.03 * body.physics.mass, `${label}, ${other.name}`);
      }
      if (mate.physics.mass >= STAR_LEAST) {
        const wide = system.bodies.some(
          (other) => other.parent === body.id && other.physics.orbit < mate.physics.orbit,
        );
        near += wide ? 0 : 1;
        far += wide ? 1 : 0;
        const planets = system.bodies.filter((other) => other.parent === mate.id);
        owned += planets.length;
        for (const planet of planets) {
          assert.ok(
            planet.physics.orbit * (1 + planet.physics.stretch) < 0.21 * apart,
            `${label}, ${planet.name}`,
          );
          assert.equal(planet.slant, mate.tilt, label);
        }
      } else if (body.parent === null) {
        swayed += 1;
      } else {
        double += 1;
      }
    }
    if (system.home !== null) {
      assert.equal(system.bodies[system.home].mate, null, `seed ${seed}`);
    }
  }
  assert.ok(near > 5 && near < 60, `near pairs ${near}`);
  assert.ok(far > 15 && far < 110, `far pairs ${far}`);
  assert.ok(owned > 10, `planets of a second star ${owned}`);
  assert.ok(double > 5, `double planets ${double}`);
  assert.ok(swayed > 0, `stars swayed by a brown dwarf ${swayed}`);
});

test("a world on a long oval is hot at its nearest and cold at its farthest", () => {
  const year = 3.156e7;
  const world = (air: number, ice: number, heat: number): Physics => {
    const shares = { iron: 0.3 * (1 - ice), rock: 0.7 * (1 - ice), ice, gas: 0 };
    const paths = { orbit: 1.5e11, stretch: 0.5, year, day: 9e4, disks: [] };
    const state = { heat, coldest: heat, hottest: heat, glow: 0, light: 1361, air, gases: [1] };
    const rest = { life: 0, vigor: 0.5, age: GIGAYEAR };
    return {
      mass: EARTH_MASS,
      radius: radiusOf(EARTH_MASS, shares),
      ...shares,
      ...state,
      ...rest,
      ...paths,
    };
  };
  const bare = world(0, 0, 280);
  const [cold, hot] = swingOf(bare, 1361, 0.5, year);
  assert.ok(hot / 280 > 1.25 && hot / 280 < 1.37, `bare rock at its nearest ${hot}`);
  assert.ok(cold / 280 > 0.78 && cold / 280 < 0.86, `bare rock at its farthest ${cold}`);
  assert.deepEqual(swingOf(bare, 1361, 0, year), [280, 280]);
  const wet = world(EARTH_AIR, 3e-5, 288);
  assert.ok(seaCover(wet) > 0);
  const [chill, warm] = swingOf(wet, 1361, 0.5, year);
  assert.ok(warm - 288 < 0.35 * (hot - 280) && warm > 288, `sea world at its nearest ${warm}`);
  assert.ok(chill > 265 && chill < 288, `sea world at its farthest ${chill}`);
  const [, lent] = swingOf(bare, 1361 / 4, 0.5, year);
  assert.ok(lent < hot && lent > 280);
  assert.ok(swingOf(bare, 1361, 0.2, year)[1] < hot);

  let swung = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const system = sketchSystem(seed, { settled: false, star: null });
    for (const body of system.bodies) {
      const { heat, coldest, hottest } = body.physics;
      const label = `seed ${seed}, ${body.name}`;
      const samples = Array.from({ length: 24 }, (_, step) =>
        heatAt(system, body.id, (step * body.year) / 24),
      );
      assert.ok(Math.min(...samples) >= coldest - 1e-6 * heat, label);
      assert.ok(Math.max(...samples) <= hottest + 1e-6 * heat, label);
      if (body.parent === 0 && hottest > 1.15 * coldest) {
        const nearest = (-body.phase * body.year) / (2 * Math.PI);
        assert.ok(Math.abs(heatAt(system, body.id, nearest) - hottest) < 1e-6 * heat, label);
        const farthest = nearest + body.year / 2;
        assert.ok(Math.abs(heatAt(system, body.id, farthest) - coldest) < 1e-6 * heat, label);
        const moons = system.bodies.filter((moon) => moon.parent === body.id);
        assert.ok(
          moons.every((moon) => moon.physics.hottest > moon.physics.coldest),
          label,
        );
        swung += 1;
      }
    }
  }
  assert.ok(swung > 10, `worlds with a wide swing ${swung}`);
});

test("small bodies are loose and not round, and rock melts where it is hot", () => {
  const body = (mass: number, ice: number, heat = 200, air = 0): Physics => {
    const shares = { iron: 0.2 * (1 - ice), rock: 0.8 * (1 - ice), ice, gas: 0 };
    const dark = { glow: 0, light: 0, stretch: 0 };
    const rest = { gases: [], life: 0, vigor: 0.5, age: GIGAYEAR, orbit: 1, year: 1, ...dark };
    return {
      mass,
      radius: radiusOf(mass, shares),
      ...shares,
      heat,
      coldest: heat,
      hottest: heat,
      air,
      ...rest,
      day: 1,
      disks: [],
    };
  };
  const pebble = body(1e16, 0);
  assert.equal(roughOf(pebble), 1);
  assert.equal(classOf(pebble), "barren lump");
  assert.ok(densityOf(pebble.mass, pebble.radius) < 2600);
  assert.ok(roughOf(body(5.6e18, 0.7)) > 0.9);
  const middling = roughOf(body(2.6e20, 0));
  assert.ok(middling > 0.2 && middling < 0.8, `vesta ${middling}`);
  assert.equal(roughOf(body(9.4e20, 0.25)), 0);
  assert.equal(roughOf(body(EARTH_MASS, 0)), 0);

  assert.equal(moltenOf(body(EARTH_MASS, 0, 288, EARTH_AIR)), 0);
  assert.equal(moltenOf(body(EARTH_MASS, 0, 900)), 0);
  const bare = moltenOf(body(EARTH_MASS, 0, 1500));
  assert.ok(bare > 0.3 && bare <= 0.5, `bare ${bare}`);
  assert.equal(moltenOf(body(EARTH_MASS, 0, 1600, 100 * EARTH_AIR)), 1);
  assert.equal(classOf(body(EARTH_MASS, 0, 1500)), "lava world");
});

test("a centre too light to be a star is a brown dwarf with small worlds close to it", () => {
  for (const seed of SEEDS) {
    const { bodies } = sketchSystem(seed, { settled: false, star: 0.04 * SUN_MASS });
    const centre = bodies[0].physics;
    const label = `seed ${seed}`;
    assert.ok(classOf(centre).startsWith("brown dwarf"), label);
    assert.ok(centre.glow > 0 && centre.glow < 1e-3 * SUN_GLOW, label);
    assert.ok(centre.heat > 400 && centre.heat < 2900, `${label}: ${centre.heat}`);
    assert.ok(Math.abs(centre.radius / 7.15e7 - 1) < 0.3, label);
    for (const body of bodies.filter((other) => other.parent === 0)) {
      assert.ok(body.physics.mass <= 0.0021 * centre.mass, `${label}, ${body.name}`);
      assert.ok(body.physics.orbit < 2 * ASTRONOMICAL_UNIT, `${label}, ${body.name}`);
    }
  }
});

test("rare bodies turn up among many systems", () => {
  const systems = Array.from({ length: 300 }, (_, seed) =>
    sketchSystem(seed + 1, { settled: false, star: null }),
  );
  const having = (test: (physics: Physics, system: Sketch) => boolean) =>
    systems.filter((system) => system.bodies.some((body) => test(body.physics, system))).length;
  const dark = systems.filter((system) => system.bodies[0].physics.mass < STAR_LEAST).length;
  assert.ok(dark > 5 && dark < 60, `brown centres ${dark}`);
  const paired = having(
    (physics) => physics.orbit > 0 && physics.mass >= BROWN_LEAST && physics.mass < STAR_LEAST,
  );
  assert.ok(paired > 3 && paired < 45, `companions ${paired}`);
  const molten = having((physics) => moltenOf(physics) > 0.02);
  assert.ok(molten > 8 && molten < 90, `lava ${molten}`);
  const lumpy = having((physics) => roughOf(physics) > 0.5);
  assert.ok(lumpy > 150, `lumps ${lumpy}`);
  const glowing = having((physics) => physics.orbit > 0 && wrapped(physics) && physics.heat > 800);
  assert.ok(glowing > 2, `glowing ${glowing}`);
  for (const system of systems) {
    const centre = system.bodies[0].physics;
    assert.ok(centre.age >= 0.09 * GIGAYEAR && centre.age <= 10 * GIGAYEAR);
    assert.ok(centre.age < starSpan(centre.mass));
    const heavy = system.bodies.filter(
      (body) => body.physics.mass >= BROWN_LEAST && body.physics.mass < STAR_LEAST && body.id > 0,
    );
    assert.ok(heavy.every((body) => body.physics.mass < 0.081 * centre.mass));
    assert.ok(heavy.every((body) => classOf(body.physics).startsWith("brown dwarf")));
  }
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
