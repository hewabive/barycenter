import assert from "node:assert/strict";
import { test } from "node:test";
import { GROWN_MOST } from "../src/disks.ts";
import {
  ASTRONOMICAL_UNIT,
  angleBetween,
  type Body,
  BROWN_LEAST,
  centreOf,
  classOf,
  clearOf,
  climateOf,
  columnOf,
  createWorld,
  DAY,
  EARTH_AIR,
  EARTH_MASS,
  EARTH_RADIUS,
  EARTH_SEEN,
  elevationAt,
  GIGAYEAR,
  glowOf,
  heatAt,
  holdOf,
  hubOf,
  innerHeat,
  JUPITER_MASS,
  LUMENS,
  lampsAt,
  lampsOf,
  moltenOf,
  nestOf,
  type Physics,
  poleOf,
  poseOf,
  positionOf,
  radiusOf,
  roughOf,
  SKY_LIGHT,
  type Sketch,
  STAR_LEAST,
  SUN_GLOW,
  SUN_MASS,
  scaleHeight,
  seaCover,
  seenGlow,
  seenShare,
  shareOf,
  shownLight,
  sketchSystem,
  slerp,
  starborn,
  starDay,
  starHeat,
  stocked,
  strippedShare,
  surveySystem,
  swayOf,
  swingOf,
  turnover,
  type Vector,
  weightOf,
  wrapped,
} from "../src/index.ts";
import {
  BURST_LEAST,
  densityOf,
  frostOf,
  hillOf,
  holeRadius,
  lifeOf,
  rocheOf,
  SUN_RADIUS,
  starDawn,
  starGlow,
  starLife,
  starRadius,
  starSpan,
  YEAR,
  yearOf,
} from "../src/physics.ts";
import { sidesOf } from "../src/sphere.ts";
import { kindled } from "../src/system.ts";
import { syncOf, tornAt } from "../src/tides.ts";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const LATE_SEEDS = [21, 24, 26, 68, 75, 204, 264];

function sketches(): { label: string; system: Sketch }[] {
  const wild = (seed: number) => ({
    label: `wild seed ${seed}`,
    system: sketchSystem(seed, { settled: false, star: null }),
  });
  return [
    ...SEEDS.flatMap((seed) => [
      { label: `seed ${seed}`, system: createWorld({ seed }).map.system },
      wild(seed),
    ]),
    ...LATE_SEEDS.map(wild),
  ];
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

function spent(physics: Physics): boolean {
  return starborn(physics) && densityOf(physics.mass, physics.radius) > 1e7;
}

function sharing(system: Sketch, body: Body): boolean {
  return body.shared !== null || system.bodies.some((other) => other.shared?.with === body.id);
}

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
      const oval = body.physics.stretch;
      assert.ok(body.orbit * (1 - oval) > body.radius + around.radius);
      if (sharing(system, body)) {
        continue;
      }
      const share = 1 - swayOf(system, body.id);
      const center = centreOf(system, body.id, 1234);
      const away = Math.hypot(at.x - center.x, at.y - center.y, at.z - center.z) / share;
      assert.ok(away > body.orbit * (1 - oval) - 1e-9 && away < body.orbit * (1 + oval) + 1e-9);
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
      const swollen = starborn(physics) && physics.radius > 3 * starRadius(physics.mass);
      assert.ok(
        spent(physics) ||
          swollen ||
          (density > 50 && density < (physics.glow > 0 ? 200000 : 20000)),
        `${label}: ${density}`,
      );
      assert.equal(physics.glow > 0, wrapped(physics), label);
      assert.equal(physics.light > 0, body.parent !== null, label);
      assert.equal(physics.age, system.bodies[0].physics.age, label);
      assert.equal(body.disks.length, physics.disks.length, label);
      const grown = physics.age >= GROWN_MOST;
      for (const disk of physics.disks) {
        assert.ok(disk.inner > physics.radius && disk.outer > disk.inner, label);
        assert.ok(disk.mass >= 0 && disk.depth >= 0 && disk.gas >= 0, label);
        assert.ok(!grown || (disk.mass > 0 && disk.depth > 0 && disk.gas === 0), label);
        if (body.parent !== null && !starborn(physics) && disk.lasts === 0) {
          const pull = system.bodies[body.parent].physics.mass;
          assert.ok(disk.gas > 0 && disk.gas < 0.021 * physics.mass && !grown, label);
          assert.ok(disk.outer < 0.41 * hillOf(physics.orbit, physics.mass, pull), label);
          assert.ok(disk.height > 0.03 && disk.height <= 0.3 && disk.grain < 1e-4, label);
        } else if (body.parent !== null && !starborn(physics)) {
          const pull = system.bodies[body.parent].physics.mass;
          assert.ok(disk.outer < rocheOf(physics.radius, density, 900), label);
          assert.ok(disk.outer < 0.34 * hillOf(physics.orbit, physics.mass, pull), label);
          assert.ok(disk.depth < 1e3 && disk.gas === 0 && (disk.depth >= 2e-3 || !grown), label);
          const deep = disk.height * Math.sqrt(disk.inner * disk.outer);
          assert.ok(Math.abs(deep - 10) < 0.01 && disk.flare === -1 && disk.grain === 1, label);
          assert.ok(disk.wreck !== null && disk.since >= 0 && disk.since <= physics.age, label);
        } else {
          assert.equal(disk.wreck, null, label);
          assert.ok(disk.depth < 1e-4 || !grown, label);
          assert.ok(disk.depth < 2e-5 || physics.age < 2e9 * YEAR, `${label} dust`);
          assert.ok(disk.height > 0 && disk.height < 0.5 && disk.grain > 0, `${label} stands`);
          assert.ok(disk.gas > 0 ? disk.grain < 1e-4 : disk.flare === 0, label);
          assert.ok(disk.gas > 0 || disk.height >= 0.04, label);
        }
      }
      if (body.parent === null) {
        assert.ok(physics.glow > 0, label);
        continue;
      }
      const around = system.bodies[body.parent].physics;
      const lead = body.shared === null ? body : system.bodies[body.shared.with];
      const within = system.bodies
        .filter((kin) => kin.parent === body.parent)
        .filter(
          (kin) => kin.physics.orbit < physics.orbit || (kin.shared?.with ?? kin.id) === lead.id,
        )
        .reduce((sum, kin) => sum + weightOf(system, kin.id), 0);
      const year = yearOf(physics.orbit, around.mass + within);
      assert.ok(Math.abs(physics.year / year - 1) < 3e-4, label);
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
      const rings = body.parent === null || starborn(body.physics) ? [] : body.disks;
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
        .filter((other) => other.parent === body.id && other.shared === null)
        .sort((left, right) => left.physics.orbit - right.physics.orbit);
      for (const other of system.bodies.filter((kin) => kin.shared?.with === body.id)) {
        assert.equal(other.orbit, body.orbit, label);
        assert.equal(other.year, body.year, label);
        assert.equal(other.parent, body.parent, label);
      }
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

test("a survey is the same system on its real scale, with its clock in seconds", () => {
  for (const seed of [1, 2, 26, 396]) {
    for (const settled of [true, false]) {
      const plan = { settled, star: null };
      const drawn = sketchSystem(seed, plan);
      const real = surveySystem(seed, plan);
      const homeRadius =
        drawn.home === null ? EARTH_RADIUS : drawn.bodies[drawn.home].physics.radius;
      assert.equal(real.home, drawn.home);
      assert.equal(real.unit, homeRadius);
      assert.equal(real.bodies.length, drawn.bodies.length);
      for (const body of real.bodies) {
        const label = `seed ${seed} ${body.name}`;
        const { physics } = body;
        const sketched = drawn.bodies[body.id];
        assert.deepEqual(physics, sketched.physics, label);
        assert.equal(body.name, sketched.name, label);
        assert.equal(body.phase, sketched.phase, label);
        assert.ok(Math.abs((body.radius * real.unit) / physics.radius - 1) < 1e-12, label);
        assert.equal(body.day, physics.day, label);
        assert.equal(body.year, body.parent === null ? 0 : physics.year, label);
        assert.equal(body.disks.length, physics.disks.length, label);
        for (const [index, lane] of body.disks.entries()) {
          const disk = physics.disks[index];
          assert.ok(Math.abs((lane.outer * real.unit) / disk.outer - 1) < 1e-12, label);
          assert.ok(lane.year > 0 && lane.inner < lane.outer, label);
        }
        if (body.shared !== null) {
          assert.equal(body.shared.year, body.shared.chase, label);
        }
        const moment = 5e7 + 1e5 * seed;
        const here = positionOf(real, body.id, moment);
        const truly = positionOf(real, body.id, moment, true);
        const far = Math.hypot(truly.x, truly.y, truly.z);
        const off = Math.hypot(
          here.x * real.unit - truly.x,
          here.y * real.unit - truly.y,
          here.z * real.unit - truly.z,
        );
        assert.ok(off <= 1e-9 * (far + 1), label);
        const alone = !real.bodies.some((other) => other.shared?.with === body.id);
        if (body.parent !== null && body.shared === null && alone) {
          const from = (time: number) => {
            const hub = hubOf(real, body.id, time, true);
            const centre = centreOf(real, body.id, time, true);
            return { x: hub.x - centre.x, y: hub.y - centre.y, z: hub.z - centre.z };
          };
          const start = from(moment);
          const round = from(moment + physics.year);
          const moved = Math.hypot(round.x - start.x, round.y - start.y, round.z - start.z);
          assert.ok(moved < 1e-6 * physics.orbit, label);
          const reach = Math.hypot(start.x, start.y, start.z);
          assert.ok(reach <= physics.orbit * (1 + physics.stretch) * (1 + 1e-9), label);
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

test("tides have taken the moons they could reach and left a planet turning with a heavy one", () => {
  let held = 0;
  let near = 0;
  let free = 0;
  let tied = 0;
  let nearer = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const settled = seed % 2 === 0;
    const drawn = sketchSystem(seed, { settled, star: null });
    const { bodies } = surveySystem(seed, { settled, star: null });
    const once = settled
      ? []
      : surveySystem(seed, { settled, star: null, age: 0.2 * GIGAYEAR }).bodies;
    for (const body of bodies) {
      const star = body.parent === null ? null : bodies[body.parent];
      if (star === null || !starborn(star.physics) || starborn(body.physics)) {
        continue;
      }
      const label = `seed ${seed}, ${body.name}`;
      const { mass, radius, day, year } = body.physics;
      const moons = bodies.filter((moon) => moon.parent === body.id);
      const bound = day === year;
      tied += bound ? moons.length : 0;
      free += bound ? 0 : moons.length;
      const dense = densityOf(mass, radius);
      for (const moon of moons) {
        const grain = densityOf(moon.physics.mass, moon.physics.radius);
        assert.ok(moon.physics.orbit > tornAt(radius, dense, grain), `${label}, ${moon.name}`);
        near += moon.shared === null && moon.physics.orbit < syncOf(mass, day) ? 1 : 0;
        const before = once.find((each) => each.name === moon.name);
        const earlier = before !== undefined && body.physics.age > 0.5 * GIGAYEAR;
        nearer += earlier && before.physics.orbit < 0.98 * moon.physics.orbit ? 1 : 0;
      }
      const holder = moons.find((moon) => moon.physics.year === day);
      if (holder !== undefined) {
        held += 1;
        assert.ok(!bound, label);
        assert.equal(body.id === drawn.home, false, label);
        assert.equal(drawn.bodies[body.id].day, drawn.bodies[holder.id].year, label);
        assert.ok(holder.physics.mass > 1e-4 * mass, `${label}: a heavy moon`);
      }
    }
  }
  assert.ok(held > 0 && held < 30, `${held} planets turn with a moon`);
  assert.ok(near > 50 && near < 0.2 * free, `${near} of ${free} moons circle faster than the turn`);
  assert.ok(tied < 0.05 * free, `${tied} moons of planets held by their star, ${free} of others`);
  assert.ok(nearer > 20, `${nearer} moons were nearer when their system was young`);
});

test("a giant gathers its moons in a disk of its own while it takes gas", () => {
  let cradles = 0;
  let mooned = 0;
  let tipped = 0;
  for (let seed = 1; seed <= 16; seed++) {
    const late = { settled: false, star: SUN_MASS, age: 4.5 * GIGAYEAR };
    const grown = surveySystem(seed, late);
    const settledPoses = sketchSystem(seed, late).bodies;
    for (const years of [2e6, 3.5e6, 5e6, 2e8]) {
      const plan = { settled: false, star: SUN_MASS, age: years * YEAR };
      const system = surveySystem(seed, plan);
      const drawn = sketchSystem(seed, plan);
      for (const body of system.bodies) {
        const sun = body.parent === null ? null : system.bodies[body.parent].physics;
        const pieces = body.physics.disks.filter((disk) => disk.lasts === 0);
        if (sun === null || starborn(body.physics) || pieces.length === 0) {
          continue;
        }
        const label = `seed ${seed} at ${years}, ${body.name}`;
        const { mass, radius, orbit, stretch } = body.physics;
        const whole = grown.bodies.find((each) => each.name === body.name)?.physics.mass ?? 0;
        assert.ok(starborn(sun) && years < 1e7 && mass < whole, `${label}: still growing`);
        const hold = hillOf(orbit * (1 - stretch), mass, sun.mass);
        const moons = system.bodies.filter((moon) => moon.parent === body.id);
        const lanes = drawn.bodies[body.id].disks.slice(-pieces.length);
        const pose = drawn.bodies[body.id];
        const later = settledPoses.find((each) => each.name === body.name);
        assert.ok(Math.abs(pose.tilt - pose.slant) < 1e-4, `${label}: upright on its orbit`);
        assert.ok(pose.slant < 1e-4 || Math.abs(pose.swing - pose.node) < 1e-4, label);
        const group = drawn.bodies.filter(
          (each) =>
            each.parent === pose.parent && starborn(each.physics) && each.orbit < pose.orbit,
        );
        const disk =
          group.length === 0
            ? 0
            : group.reduce((one, other) => (other.orbit > one.orbit ? other : one)).slant;
        assert.ok(
          body.parent !== 0 || Math.abs(pose.slant - disk) < 1e-4,
          `${label}: in the plane of the disk`,
        );
        tipped += later !== undefined && Math.abs(later.tilt - later.slant) > 0.02 ? 1 : 0;
        cradles += 1;
        mooned += moons.length > 0 ? 1 : 0;
        pieces.forEach((disk, at) => {
          assert.ok(disk.inner >= 1.999 * radius && disk.outer <= 0.401 * hold, label);
          assert.ok(disk.gas > 0 && disk.depth > 0.01 && disk.height > 0.03, label);
          assert.ok(at === 0 || disk.inner >= pieces[at - 1].outer, label);
          assert.ok(
            moons.every(({ physics }) => physics.orbit < disk.inner || physics.orbit > disk.outer),
            `${label}: a moon keeps its lane clear`,
          );
          assert.ok(lanes[at].inner > drawn.bodies[body.id].radius, label);
          assert.ok(lanes[at].outer > lanes[at].inner, label);
          assert.ok(at === 0 || lanes[at].inner >= lanes[at - 1].outer, label);
        });
        for (const moon of drawn.bodies.filter((each) => each.parent === body.id)) {
          assert.ok(
            lanes.every((lane) => moon.orbit < lane.inner || moon.orbit > lane.outer),
            `${label}: ${moon.name} is drawn in its lane`,
          );
        }
      }
    }
  }
  assert.ok(cradles > 20 && mooned > 3, `${cradles} disks, ${mooned} with moons in them`);
  assert.ok(tipped > 0.5 * cradles, `${tipped} of them lean once their system has settled`);
});

test("a ring is the wreck of a moon: it comes late, thins and is gone", () => {
  const ages = [0.4, 0.8, 1.4, 2.2, 3.2, 4.5, 6.5, 9];
  let born = 0;
  let gone = 0;
  let thinned = 0;
  let torn = 0;
  let gathered = 0;
  let later = 0;
  const wrecks = new Set<string>();
  let giants = 0;
  let ringed = 0;
  let dense = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const looks = ages.map((age) =>
      surveySystem(seed, { settled: false, star: SUN_MASS, age: age * GIGAYEAR }),
    );
    const ringOf = (at: number, name: string) =>
      looks[at].bodies.find((body) => body.name === name)?.physics.disks[0];
    for (const body of looks[0].bodies) {
      if (body.parent === null || starborn(body.physics)) {
        continue;
      }
      for (let at = 1; at < ages.length; at++) {
        const label = `seed ${seed}, ${body.name} at ${ages[at]}`;
        const before = ringOf(at - 1, body.name);
        const now = ringOf(at, body.name);
        const passed = (ages[at] - ages[at - 1]) * GIGAYEAR;
        if (now !== undefined) {
          assert.ok(now.lasts >= 1e8 * YEAR && now.lasts <= 1e9 * YEAR, label);
          assert.ok(now.since >= 0 && now.since <= ages[at] * GIGAYEAR, label);
          assert.ok(now.wreck !== null, label);
          wrecks.add(now.wreck);
        }
        if (before === undefined && now !== undefined) {
          born += 1;
          assert.ok(now.since <= 1.001 * passed, `${label}: fed since the last look`);
          const host = looks[at].bodies.find((each) => each.name === body.name);
          const lost = looks[at - 1].bodies.filter(
            (moon) =>
              moon.parent !== null &&
              looks[at - 1].bodies[moon.parent].name === body.name &&
              !looks[at].bodies.some((each) => each.name === moon.name),
          );
          torn += host !== undefined && lost.length > 0 ? 1 : 0;
        } else if (before !== undefined && now === undefined) {
          gone += 1;
        } else if (
          before !== undefined &&
          now !== undefined &&
          Math.abs(now.since - before.since - passed) < 1e-3 * passed
        ) {
          thinned += 1;
          assert.ok(now.mass < before.mass, `${label}: ${before.mass} to ${now.mass}`);
        }
      }
    }
    const known = new Set(looks[0].bodies.map((body) => body.name));
    looks.forEach((look, at) => {
      for (const body of look.bodies) {
        const label = `seed ${seed}, ${body.name} at ${ages[at]}`;
        gathered += known.has(body.name) ? 0 : 1;
        assert.ok(known.has(body.name) || body.gathered !== null, `${label}: new from a ring`);
        known.add(body.name);
        if (body.gathered !== null) {
          const host = body.parent === null ? null : look.bodies[body.parent];
          assert.ok(host !== null && host.parent !== null && !starborn(host.physics), label);
          assert.ok(body.gathered.turn >= 1 && body.gathered.since >= 0, label);
          assert.ok(body.gathered.since <= ages[at] * GIGAYEAR, label);
          later += body.gathered.turn > 1 ? 1 : 0;
        }
      }
    });
    for (const body of looks[5].bodies) {
      const host = body.parent === null ? null : looks[5].bodies[body.parent];
      if (host === null || !starborn(host.physics) || !wrapped(body.physics)) {
        continue;
      }
      const [ring] = body.physics.disks;
      giants += starborn(body.physics) ? 0 : 1;
      ringed += ring === undefined ? 0 : 1;
      dense += ring !== undefined && ring.depth >= 0.2 ? 1 : 0;
    }
  }
  assert.ok(born > 20 && gone > 20 && thinned > 40, `${born} born, ${gone} gone, ${thinned}`);
  assert.ok(torn > 0, `${torn} rings came as a moon was lost`);
  assert.ok(gathered > 0, `${gathered} moons were gathered from a ring`);
  assert.ok(later > 0, `${later} looks at a moon that followed another`);
  assert.deepEqual([...wrecks].sort(), ["break", "gas", "return", "tide"]);
  assert.ok(ringed > 0.3 * giants && ringed < 0.65 * giants, `${ringed} of ${giants} ringed`);
  assert.ok(dense > 0.1 * giants && dense < 0.35 * giants, `${dense} of ${giants} dense`);
});

test("a moon keeps no moon of its own for long, and one that still has it holds it", () => {
  const found = [3e6, 3e7, null].map((years) => {
    let count = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const age = years === null ? null : years * YEAR;
      const { bodies } = sketchSystem(seed, { settled: false, star: null, age });
      for (const body of bodies) {
        const moon = body.parent === null ? null : bodies[body.parent];
        const planet = moon === null || moon.parent === null ? null : bodies[moon.parent];
        if (moon === null || planet === null || planet.parent === null) {
          continue;
        }
        if (starborn(planet.physics)) {
          continue;
        }
        count += 1;
        const hold = hillOf(moon.physics.orbit, moon.physics.mass, planet.physics.mass);
        assert.ok(body.physics.orbit < 0.34 * hold, `seed ${seed}, ${body.name}`);
        assert.ok(body.physics.orbit >= 1.4 * moon.physics.radius, `seed ${seed}, ${body.name}`);
        assert.ok(hold > 9 * moon.physics.radius, `seed ${seed}, ${body.name}`);
      }
    }
    return count;
  });
  assert.ok(found[2] < 3 && found[2] <= found[1], `found ${found}`);
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
  assert.ok(Math.min(...sizes) >= 1 && Math.max(...sizes) > 12 && Math.max(...sizes) < 120);
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
        const suns = system.bodies.filter(
          (other) =>
            other.id !== body.id && other.physics.mass >= STAR_LEAST && !spent(other.physics),
        );
        assert.ok(
          suns.every((other) => lamps.some((lamp) => lamp.source === other.id)),
          label,
        );
        assert.ok(
          lamps.every((lamp) => system.bodies[lamp.source].physics.heat > 500),
          label,
        );
        continue;
      }
      const centre = system.bodies[0].physics;
      const sun = lamps.find((lamp) => lamp.source === 0);
      if (centre.mass >= STAR_LEAST && !spent(centre)) {
        assert.ok(sun, label);
      }
      const suns = system.bodies.filter((other) => starborn(other.physics)).length;
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
      .filter((body) => body.parent === 0 && body.shared === null)
      .sort((left, right) => left.physics.orbit - right.physics.orbit);
    planets.forEach((planet, index) => {
      const next = planets[index + 1];
      const far = planet.physics.orbit * (1 + planet.physics.stretch);
      assert.ok(!next || far < next.physics.orbit * (1 - next.physics.stretch), `seed ${seed}`);
    });
    for (const body of system.bodies) {
      const label = `seed ${seed}, ${body.name}`;
      if (body.parent === null || sharing(system, body)) {
        continue;
      }
      const around = system.bodies[body.parent];
      const whole = 1 - swayOf(system, body.id);
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
      const later = from(100 + body.year / 8);
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

test("the stability of nested orbits follows the published fits", () => {
  const near = (value: number, wanted: number) => Math.abs(value / wanted - 1) < 0.02;
  assert.ok(near(holdOf(0.5, 0), 0.274) && near(holdOf(0.5, 0.5), 0.118));
  assert.ok(near(clearOf(0.5, 0), 2.39) && near(clearOf(0.5, 0.5), 3.6));
  assert.ok(clearOf(0.2, 0.3) === clearOf(0.8, 0.3) && holdOf(0.9, 0.7) > 0);
  assert.ok(near(nestOf(0.5, 0), 3.29) && nestOf(0.5, 0.4) > nestOf(0.5, 0));
  assert.ok(holdOf(0.2, 0.2) > holdOf(0.6, 0.2) && clearOf(0.5, 0.4) > clearOf(0.5, 0.1));
});

test("bodies balance about shared centres, and stars stand in nested groups that hold", () => {
  const stars = [0, 0, 0, 0];
  let double = 0;
  let swayed = 0;
  let owned = 0;
  let around = 0;
  let nested = 0;
  let deep = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const system = sketchSystem(seed, { settled: seed % 4 === 0, star: null });
    const whole = weightOf(system, 0);
    const widest = Math.max(...system.bodies.map((body) => body.orbit));
    for (const tick of [0, 777, 5000]) {
      for (const real of [false, true]) {
        const span = real ? Math.max(...system.bodies.map((body) => body.physics.orbit)) : widest;
        const pull = (axis: "x" | "y" | "z") =>
          system.bodies.reduce(
            (sum, body) => sum + body.physics.mass * positionOf(system, body.id, tick, real)[axis],
            0,
          );
        assert.ok(
          Math.hypot(pull("x"), pull("y"), pull("z")) <= 1e-9 * whole * span,
          `seed ${seed}: the middle of all the mass stays where it is`,
        );
      }
    }
    const born = system.bodies.filter((body) => starborn(body.physics));
    stars[Math.min(born.length, stars.length) - 1] += 1;
    const far = (body: Body) => body.physics.orbit * (1 + body.physics.stretch);
    const close = (body: Body) => body.physics.orbit * (1 - body.physics.stretch);
    for (const body of system.bodies) {
      const kids = system.bodies.filter((kin) => kin.parent === body.id);
      for (const tick of [0, 777]) {
        const hub = hubOf(system, body.id, tick);
        const one = positionOf(system, body.id, tick);
        const pull = (axis: "x" | "y" | "z") =>
          kids.reduce(
            (sum, kin) =>
              sum + weightOf(system, kin.id) * (hubOf(system, kin.id, tick)[axis] - hub[axis]),
            body.physics.mass * (one[axis] - hub[axis]),
          );
        const lever =
          weightOf(system, body.id) * Math.max(body.radius, ...kids.map((k) => k.orbit));
        assert.ok(
          Math.hypot(pull("x"), pull("y"), pull("z")) < 1e-9 * lever,
          `seed ${seed}, ${body.name}: a body and all around it balance about their middle`,
        );
      }
      if (body.parent === null) {
        continue;
      }
      const label = `seed ${seed}, ${body.name}`;
      const host = system.bodies[body.parent];
      const kin = system.bodies.filter(
        (other) => other.parent === host.id && other.id !== body.id && starborn(other.physics),
      );
      const within = (other: Body) =>
        kin
          .filter((inner) => inner.id !== other.id && inner.physics.orbit < other.physics.orbit)
          .reduce((sum, inner) => sum + weightOf(system, inner.id), host.physics.mass);
      const share = (other: Body) =>
        weightOf(system, other.id) / (within(other) + weightOf(system, other.id));
      if (starborn(body.physics)) {
        assert.ok(starborn(host.physics), label);
        assert.ok(body.physics.mass <= host.physics.mass, label);
        const inner = kin.filter((other) => other.physics.orbit < body.physics.orbit);
        const reach = Math.max(0, ...inner.map(far));
        const ratio = weightOf(system, body.id) / within(body);
        assert.ok(
          close(body) > 1.25 * nestOf(ratio, body.physics.stretch) * reach,
          `${label}: a group inside a wider orbit holds together`,
        );
        nested += inner.length > 0 ? 1 : 0;
        deep += host.parent !== null ? 1 : 0;
        continue;
      }
      if (!starborn(host.physics)) {
        double += host.parent !== null && swayOf(system, body.id) >= 0.03 ? 1 : 0;
        continue;
      }
      swayed += swayOf(system, body.id) >= 0.03 ? 1 : 0;
      owned += host.parent !== null ? 1 : 0;
      around += kin.some((other) => other.physics.orbit < body.physics.orbit) ? 1 : 0;
      for (const other of kin) {
        const { orbit, stretch } = other.physics;
        const kept =
          body.physics.orbit < orbit
            ? far(body) < 0.83 * holdOf(share(other), stretch) * orbit
            : close(body) > 1.12 * clearOf(share(other), stretch) * orbit;
        assert.ok(kept, `${label}: a planet keeps clear of ${other.name}`);
      }
      if (host.parent !== null) {
        const { orbit, stretch } = host.physics;
        assert.ok(
          far(body) < 0.83 * holdOf(1 - swayOf(system, host.id), stretch) * orbit,
          `${label}: a planet stays in the hold of its star`,
        );
        const plane =
          host.tilt === 0 ||
          body.slant === host.tilt ||
          kin.some((other) => other.slant === body.slant || other.slant === 0);
        assert.ok(plane, `${label}: it lies in the plane of its star or of the pair it circles`);
      }
    }
    if (system.home !== null) {
      const kin = system.bodies.filter((other) => other.parent === system.home);
      assert.ok(
        kin.every((other) => swayOf(system, other.id) < 0.03),
        `seed ${seed}`,
      );
      assert.equal(system.bodies[system.home].parent, 0, `seed ${seed}`);
    }
  }
  const [single, pair, triple, more] = stars;
  assert.ok(single > 220 && single < 330, `systems of one star ${single}`);
  assert.ok(pair > 60 && pair < 150, `of two ${pair}`);
  assert.ok(triple > 5 && triple < 45, `of three ${triple}`);
  assert.ok(more > 0 && more < 15, `of four and more ${more}`);
  assert.ok(nested > 5, `stars around a pair ${nested}`);
  assert.ok(deep > 5, `stars with a star of their own ${deep}`);
  assert.ok(owned > 30, `planets of a second star ${owned}`);
  assert.ok(around > 30, `planets around a pair ${around}`);
  assert.ok(double > 5, `double planets ${double}`);
  assert.ok(swayed > 0, `stars swayed by a brown dwarf ${swayed}`);
});

test("bodies that share an orbit keep apart and trade places", () => {
  let chases = 0;
  let rimmed = 0;
  let moons = 0;
  let planets = 0;
  for (let seed = 1; seed <= 600; seed++) {
    const system = sketchSystem(seed, { settled: seed % 3 === 0, star: null });
    for (const body of system.bodies) {
      const { shared } = body;
      if (shared === null || body.parent === null) {
        continue;
      }
      const label = `seed ${seed}, ${body.name}`;
      const lead = system.bodies[shared.with];
      const host = system.bodies[body.parent];
      assert.equal(lead.parent, body.parent, label);
      assert.equal(lead.shared, null, label);
      assert.equal(body.physics.orbit, lead.physics.orbit, label);
      assert.equal(body.physics.year, lead.physics.year, label);
      assert.ok(body.physics.mass <= lead.physics.mass, label);
      const chasing = shared.sway > Math.PI / 2;
      const part = (body.physics.mass + lead.physics.mass) / host.physics.mass;
      assert.ok(part < (chasing ? 4e-4 : 1 / 27), `${label}: light enough to last`);
      assert.ok(shared.chase > 10 * body.physics.year && shared.year > body.year, label);
      const others = system.bodies.filter((other) => other.shared?.with === lead.id);
      const ahead = (tick: number) =>
        poseOf(system, body.id, tick).shift - poseOf(system, lead.id, tick).shift;
      const wider = (tick: number) =>
        poseOf(system, body.id, tick).scale - poseOf(system, lead.id, tick).scale;
      const ticks = Array.from({ length: 96 }, (_, step) => (step * shared.year) / 96);
      const angles = ticks.map(ahead);
      const least = shared.ahead - shared.sway;
      const most = shared.ahead + shared.sway;
      assert.ok(Math.min(...angles) > least - 1e-9 && Math.max(...angles) < most + 1e-9, label);
      assert.ok(Math.max(...angles) - Math.min(...angles) > 1.9 * shared.sway, label);
      for (const tick of ticks) {
        const one = positionOf(system, lead.id, tick);
        const other = positionOf(system, body.id, tick);
        const apart = Math.hypot(one.x - other.x, one.y - other.y, one.z - other.z);
        assert.ok(apart > lead.radius + body.radius, `${label}: the two never touch on screen`);
        const turn = ahead(tick + 1e-3 * shared.year) - ahead(tick);
        if (Math.abs(wider(tick)) > 0.3 * shared.lane) {
          assert.ok(turn * wider(tick) < 0, `${label}: the one on the wider orbit falls behind`);
        }
        if (others.length === 1) {
          const weighed =
            weightOf(system, body.id) * poseOf(system, body.id, tick).shift +
            weightOf(system, lead.id) * poseOf(system, lead.id, tick).shift;
          assert.ok(Math.abs(weighed) < 1e-9 * weightOf(system, lead.id), label);
        }
      }
      const gaps = ticks.map(wider);
      assert.ok(Math.abs(Math.max(...gaps) / shared.lane - 1) < 0.02, label);
      assert.ok(Math.abs(Math.min(...gaps) / shared.lane + 1) < 0.02, label);
      if (chasing) {
        assert.ok(wrapped(host.physics), label);
        assert.ok(lead.physics.mass < 6 * body.physics.mass, `${label}: of like mass`);
        const rim = Math.max(0, ...host.physics.disks.map((disk) => disk.outer));
        assert.ok(body.physics.orbit > rim && body.physics.orbit < 4 * host.physics.radius, label);
        rimmed += rim > 0 ? 1 : 0;
        chases += 1;
      } else {
        assert.ok(Math.abs(Math.abs(shared.ahead) - Math.PI / 3) < 1e-4, label);
        assert.ok(shared.sway < 0.36, label);
        planets += starborn(host.physics) ? 1 : 0;
        moons += starborn(host.physics) ? 0 : 1;
      }
    }
  }
  assert.ok(chases > 0 && chases < 40, `pairs that trade places ${chases}`);
  assert.ok(rimmed > 0 && rimmed <= chases, `${rimmed} of them still at the rim of a ring`);
  assert.ok(moons > 200 && moons < 2500, `moons at the points ahead of and behind a moon ${moons}`);
  assert.ok(planets > 1 && planets < 25, `planets that share an orbit ${planets}`);
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

test("a lamp is as bright as it is near at the moment, and over a year as bright as counted", () => {
  const near = (left: number, right: number, slack: number) =>
    Math.abs(left - right) <= slack * Math.abs(right);
  let ovals = 0;
  let lent = 0;
  for (let seed = 1; seed <= 150; seed++) {
    const system = sketchSystem(seed, { settled: false, star: null });
    const star = system.bodies[0];
    for (const body of system.bodies) {
      const label = `seed ${seed}, ${body.name}`;
      const counted = lampsOf(system, body.id);
      const now = lampsAt(system, body.id, 777);
      assert.deepEqual(
        now.map((lamp) => lamp.source),
        counted.map((lamp) => lamp.source),
        label,
      );
      const here = positionOf(system, body.id, 777, true);
      for (const lamp of now) {
        const { heat, radius } = system.bodies[lamp.source].physics;
        const there = positionOf(system, lamp.source, 777, true);
        const apart = Math.hypot(there.x - here.x, there.y - here.y, there.z - here.z);
        assert.ok(near(lamp.reach, apart, 1e-9), label);
        assert.ok(near(lamp.seen, seenGlow(heat) * (radius / apart) ** 2, 1e-9), label);
        lent += lamp.source === star.id ? 0 : 1;
      }
      const heavy = system.bodies.some(
        (other) => other.parent !== null && swayOf(system, other.id) >= 0.01,
      );
      if (body.parent !== star.id || heavy) {
        continue;
      }
      const from = (real: boolean) => {
        const one = positionOf(system, body.id, 777, real);
        const sun = positionOf(system, star.id, 777, real);
        return { x: one.x - sun.x, y: one.y - sun.y, z: one.z - sun.z };
      };
      const drawn = from(false);
      const truly = from(true);
      const span = Math.hypot(truly.x, truly.y, truly.z);
      const scale = span / Math.hypot(drawn.x, drawn.y, drawn.z);
      for (const axis of ["x", "y", "z"] as const) {
        assert.ok(Math.abs(drawn[axis] * scale - truly[axis]) < 0.02 * span, label);
      }
      const oval = body.physics.stretch;
      if (oval < 0.2) {
        continue;
      }
      const sun = (tick: number) => {
        const lamp = lampsAt(system, body.id, tick).find(({ source }) => source === star.id);
        assert.ok(lamp, label);
        return lamp;
      };
      const nearest = (-body.phase * body.year) / (2 * Math.PI);
      const close = sun(nearest);
      const far = sun(nearest + body.year / 2);
      assert.ok(near(close.reach, body.physics.orbit * (1 - oval), 0.02), label);
      assert.ok(near(far.reach, body.physics.orbit * (1 + oval), 0.02), label);
      assert.ok(near(close.seen / far.seen, ((1 + oval) / (1 - oval)) ** 2, 0.06), label);
      const steps = 720;
      let sum = 0;
      for (let step = 0; step < steps; step++) {
        sum += sun((step * body.year) / steps).seen / steps;
      }
      const whole = counted.find(({ source }) => source === star.id);
      assert.ok(whole && near(sum, whole.seen, 0.02), `${label}: ${sum} against ${whole?.seen}`);
      ovals += 1;
    }
  }
  assert.ok(ovals > 10, `worlds on long ovals ${ovals}`);
  assert.ok(lent > 10, `lamps that are not the first star ${lent}`);
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
  assert.equal(classOf(body(EARTH_MASS, 0.4, 150)), "ice world");
  assert.equal(classOf(body(EARTH_MASS, 0.4, 600, 9 * EARTH_AIR)), "steam world");
  assert.equal(classOf(body(EARTH_MASS, 0.4, 600)), "barren world");
});

test("a centre too light to be a star is a brown dwarf with small worlds close to it", () => {
  for (const seed of SEEDS) {
    const system = sketchSystem(seed, { settled: false, star: 0.04 * SUN_MASS });
    const { bodies } = system;
    const centre = bodies[0].physics;
    const whole = weightOf(system, 0);
    const label = `seed ${seed}`;
    assert.ok(classOf(centre).startsWith("brown dwarf"), label);
    assert.ok(centre.glow > 0 && centre.glow < 1e-3 * SUN_GLOW, label);
    assert.ok(centre.heat > 400 && centre.heat < 2900, `${label}: ${centre.heat}`);
    assert.ok(Math.abs(centre.radius / 7.15e7 - 1) < 0.3, label);
    for (const body of bodies.filter((other) => other.parent === 0 && !starborn(other.physics))) {
      const most = 0.0105 * Math.sqrt(whole / SUN_MASS) * whole;
      assert.ok(body.physics.mass <= most, `${label}, ${body.name}`);
      assert.ok(body.physics.orbit < 5 * ASTRONOMICAL_UNIT, `${label}, ${body.name}`);
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
    assert.ok(centre.age > 0 && centre.age <= 12 * GIGAYEAR);
    const heavy = system.bodies.filter(
      (body) => body.physics.mass >= BROWN_LEAST && body.physics.mass < STAR_LEAST && body.id > 0,
    );
    const made = heavy.filter((body) => !starborn(body.physics));
    assert.ok(made.every((body) => body.physics.mass < 0.081 * weightOf(system, 0)));
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

test("a star turns slower as it ages, a red dwarf later than a Sun, and a hot star stays fast", () => {
  const day = (suns: number, age: number, luck = 0.5) => {
    const mass = suns * SUN_MASS;
    const heat = starHeat(starGlow(mass), starRadius(mass));
    return { days: starDay(mass, heat, age * GIGAYEAR, luck) / DAY, heat };
  };
  const sun = day(1, 4.57);
  assert.ok(sun.days > 24 && sun.days < 27, `the Sun turns in ${sun.days} days`);
  assert.ok(Math.abs(turnover(sun.heat) / DAY - 12.9) < 0.3);
  assert.ok(day(1, 0.1).days < 5);
  assert.ok(day(1, 0.6).days > 7 && day(1, 0.6).days < 12);
  assert.ok(day(1, 9).days < 1.15 * sun.days);
  assert.ok(day(0.2, 0.6).days < day(1, 0.6).days);
  assert.ok(day(0.2, 4.57).days > 80);
  assert.ok(day(2, 4.57).days < 2 && day(2, 0.1).days < 2);
  assert.ok(day(1, 4.57, 0).days < day(1, 4.57, 1).days);
});

test("a star lives by its mass and leaves what that mass allows", () => {
  const still = { next: () => 0.5 };
  const at = (suns: number, age: number) => kindled(suns * SUN_MASS, age * GIGAYEAR, still);
  const sun = at(1, 4.57);
  assert.equal(classOf(sun), "yellow star");
  assert.equal(sun.mass, SUN_MASS);
  assert.equal(sun.radius, starRadius(SUN_MASS));
  assert.equal(sun.glow, starGlow(SUN_MASS));
  assert.equal(classOf(at(1, 10.7)), "orange subgiant");
  const giant = at(1, 11.395);
  assert.equal(classOf(giant), "red giant");
  assert.ok(giant.radius > 80 * SUN_RADIUS && giant.radius < 200 * SUN_RADIUS);
  assert.ok(giant.glow > 500 * SUN_GLOW && giant.heat > 3000 && giant.heat < 3900);
  const clump = at(1, 11.45);
  assert.equal(classOf(clump), "orange giant");
  assert.ok(clump.radius > 8 * SUN_RADIUS && clump.radius < 15 * SUN_RADIUS);
  const dwarf = at(1, 12.5);
  assert.equal(classOf(dwarf), "white dwarf");
  assert.ok(dwarf.mass > 0.45 * SUN_MASS && dwarf.mass < 0.56 * SUN_MASS);
  assert.ok(Math.abs(dwarf.radius / 8.9e6 - 1) < 0.15, `as wide as ${dwarf.radius}`);
  assert.ok(dwarf.heat > 7000 && dwarf.heat < 9500, `a billion years on ${dwarf.heat}`);
  assert.ok(at(1, 11.6).heat > 2 * dwarf.heat);
  assert.ok(at(3, 10).heat < 5500);
  assert.ok(at(7, 1).mass > at(1.5, 5).mass && at(7, 1).radius < at(1.5, 5).radius);

  assert.equal(classOf(at(5, 0.1)), "blue-white star");
  assert.equal(classOf(at(25, 0.003)), "blue star");
  assert.ok(Math.abs(starSpan(20 * SUN_MASS) / (8.5e-3 * GIGAYEAR) - 1) < 0.1);
  const red = at(15, 0.0168);
  assert.equal(classOf(red), "red supergiant");
  assert.ok(red.radius > 400 * SUN_RADIUS && red.radius < 1000 * SUN_RADIUS);
  assert.ok(red.heat > 3300 && red.heat < 3900, `as cool as ${red.heat}`);
  assert.equal(classOf(at(15, 0.0155)), "white supergiant");
  assert.equal(classOf(at(60, 0.0039)), "Wolf-Rayet star");
  const pulsar = at(15, 0.0175);
  assert.equal(classOf(pulsar), "neutron star");
  assert.ok(pulsar.mass > 1.2 * SUN_MASS && pulsar.mass < 2 * SUN_MASS);
  assert.ok(pulsar.radius > 1e4 && pulsar.radius < 1.3e4);
  assert.ok(pulsar.day < 1 && pulsar.heat > 3e5 && pulsar.heat < 2e6);
  assert.ok(at(15, 0.5).heat < 0.1 * pulsar.heat && at(15, 0.5).day > pulsar.day);
  const hole = at(30, 0.01);
  assert.equal(classOf(hole), "black hole");
  assert.equal(hole.radius, holeRadius(hole.mass));
  assert.ok(Math.abs(hole.radius / 26600 - 1) < 0.02);
  assert.ok(hole.heat > 0 && hole.heat < 1e-6 && hole.glow > 0 && hole.glow < 1e-20);
  assert.ok(hole.day > 0 && hole.day < 0.1);

  for (const suns of [1, 1.7, 2.2, 3, 5, 7.9, 8.1, 12, 19, 21, 30, 45, 60]) {
    const mass = suns * SUN_MASS;
    const main = starSpan(mass);
    const whole = starLife(mass);
    assert.ok(whole > 1.1 * main && whole < 1.2 * main, `${suns} suns live ${whole / main}`);
    const just = lifeOf(mass, 1.000001 * main);
    assert.ok(Math.abs(just.radius / starRadius(mass) - 1) < 1e-3, `${suns} suns leave gently`);
    let before = lifeOf(mass, 0.5 * main);
    assert.equal(before.spent, 0);
    for (let step = 0; step <= 400; step++) {
      const now = lifeOf(mass, main + ((whole - main) * 1.2 * step) / 400);
      const label = `${suns} suns at step ${step}`;
      assert.ok(now.swell >= before.swell && now.peak >= before.peak, label);
      assert.ok(now.mass <= before.mass && now.radius <= now.swell * (1 + 1e-12), label);
      assert.ok(now.glow > 0 && now.radius > 0 && Number.isFinite(now.glow), label);
      assert.equal(now.spent > 0, step > 333, label);
      before = now;
    }
    assert.equal(before.radius > 1e6, mass < BURST_LEAST, `${suns} suns leave a white dwarf`);
  }
});

test("systems with no home hold stars at every time of life", () => {
  const seen = new Map<string, number>();
  const count = 1400;
  let overtaken = 0;
  let gassy = 0;
  for (let seed = 1; seed <= count; seed++) {
    const system = surveySystem(seed, { settled: false, star: null });
    const centre = system.bodies[0].physics;
    const kind = classOf(centre);
    gassy += system.bodies.some(({ physics }) => physics.disks.some((disk) => disk.gas > 0))
      ? 1
      : 0;
    seen.set(kind, (seen.get(kind) ?? 0) + 1);
    const stars = system.bodies.filter((body) => starborn(body.physics));
    for (const body of system.bodies) {
      const { physics } = body;
      const label = `seed ${seed}, ${body.name}`;
      assert.ok(
        Object.values(physics).every((value) => !Number.isNaN(value)),
        label,
      );
      assert.ok(physics.mass > 0 && physics.radius > 0 && physics.heat > 0, label);
      assert.ok(physics.day > 0 && physics.glow >= 0, label);
      if (body.parent === null) {
        continue;
      }
      const host = system.bodies[body.parent];
      const near = physics.orbit * (1 - physics.stretch);
      assert.ok(near > 1.4 * (host.physics.radius + physics.radius), label);
      const sun = host.parent === null ? null : system.bodies[host.parent].physics;
      if (sun !== null && starborn(sun) && !starborn(host.physics)) {
        const nearest = host.physics.orbit * (1 - host.physics.stretch);
        const far = physics.orbit * (1 + physics.stretch);
        assert.ok(nearest - far > sun.radius, `${label} passes inside its star`);
      }
      assert.ok(body.parent < body.id, `${label} is listed after what it circles`);
      assert.ok(physics.mass <= host.physics.mass, `${label} is lighter than what it circles`);
      if (starborn(physics)) {
        assert.notEqual(classOf(physics), "neutron star", label);
        overtaken += spent(physics) && !spent(host.physics) ? 1 : 0;
        continue;
      }
      if (starborn(host.physics)) {
        assert.ok(host.physics.mass < BURST_LEAST, `${label} circles a star too bright for it`);
        assert.notEqual(classOf(host.physics), "black hole", label);
      }
      if (host.parent === null && stars.length === 1 && kind === "white dwarf") {
        const born = (SUN_MASS * (centre.mass / SUN_MASS - 0.394)) / 0.109;
        const { swell } = lifeOf(born, centre.age);
        assert.ok(swell > 0.5 * ASTRONOMICAL_UNIT, label);
        assert.ok(near > (swell * born) / centre.mass, `${label} was not swallowed`);
      }
    }
    if (kind === "neutron star") {
      assert.equal(system.bodies.length, 1, `seed ${seed}`);
    }
  }
  const share = (test: (kind: string) => boolean) =>
    [...seen].reduce((sum, [kind, times]) => sum + (test(kind) ? times : 0), 0) / count;
  const dwarfs = share((kind) => kind === "white dwarf");
  assert.ok(dwarfs > 0.04 && dwarfs < 0.12, `white dwarfs ${dwarfs}`);
  const giants = share((kind) => kind.endsWith(" giant") || kind.endsWith("subgiant"));
  assert.ok(giants > 0.015 && giants < 0.06, `giants ${giants}`);
  const hot = share((kind) => kind.startsWith("blue"));
  assert.ok(hot > 0.01 && hot < 0.05, `hot stars ${hot}`);
  for (const kind of ["neutron star", "black hole", "red giant", "blue star"]) {
    assert.ok(seen.has(kind), `no ${kind} among ${count} systems`);
  }
  assert.ok(share((kind) => kind.endsWith("supergiant")) > 0);
  assert.ok(overtaken > 5, `${overtaken} stars that shed mass now circle a heavier companion`);
  assert.ok(seen.has("T Tauri star"), `no young star among ${count} systems`);
  assert.ok(gassy > 0.008 * count && gassy < 0.04 * count, `${gassy} systems with a disk of gas`);
});

test("on the drawn scale a body keeps clear of a wider one it circles", () => {
  let wider = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const system = sketchSystem(seed, { settled: false, star: null });
    for (const body of system.bodies) {
      if (body.parent === null) {
        continue;
      }
      const host = system.bodies[body.parent];
      const room = host.parent === null || starborn(host.physics) ? 0.7 : 0.35;
      const near = body.orbit * (1 - body.physics.stretch) - body.radius - host.radius;
      const widest = Math.max(body.radius, host.radius);
      assert.ok(near > 0.999 * room * widest, `seed ${seed}, ${body.name} passes ${near} away`);
      wider += body.radius > host.radius ? 1 : 0;
    }
  }
  assert.ok(wider > 10, `${wider} bodies wider than what they circle`);
});

test("a system can be given the age of its star", () => {
  const plan = { settled: false, star: SUN_MASS, age: 11.39 * GIGAYEAR };
  let icy = 0;
  let dried = 0;
  let lone = 0;
  for (const seed of SEEDS) {
    const system = surveySystem(seed, plan);
    const centre = system.bodies[0].physics;
    const calm = system.bodies.every((body) => body.passages.length === 0);
    lone += calm ? 1 : 0;
    assert.ok(!calm || classOf(centre) === "red giant", `seed ${seed}: ${classOf(centre)}`);
    assert.ok(system.bodies.every((body) => body.physics.age === centre.age));
    for (const body of system.bodies.filter((other) => other.parent === 0)) {
      const near = body.physics.orbit * (1 - body.physics.stretch);
      assert.ok(near > centre.radius, `seed ${seed}, ${body.name}`);
      const born = body.physics.orbit > 3.5 * ASTRONOMICAL_UNIT && body.physics.gas < 0.5;
      if (born && !starborn(body.physics) && body.physics.orbit < frostOf(centre.glow)) {
        const { ice, heat } = body.physics;
        icy += ice > 0.25 ? 1 : 0;
        dried += ice < 1e-3 ? 1 : 0;
        assert.ok(ice > 0.25 || (ice < 1e-3 && heat > 200), `seed ${seed}, ${body.name}`);
        const frozen = classOf(body.physics).startsWith("ice ");
        assert.ok(wrapped(body.physics) || frozen === (ice > 0.25 && heat < 273));
      }
    }
    const home = surveySystem(seed, { ...plan, settled: true }).bodies[0].physics;
    assert.equal(home.mass, SUN_MASS);
    assert.equal(classOf(home), "yellow star");
  }
  assert.ok(icy > 3 && dried > 1, `${icy} bodies kept the ice they formed of, ${dried} lost it`);
  assert.ok(lone >= 8, `${lone} of ${SEEDS.length} stars were left alone by their companions`);
});

test("a system is the same at every age, less what its star and its tides took", () => {
  const at = (seed: number, age: number) =>
    surveySystem(seed, { settled: false, star: SUN_MASS, age: age * GIGAYEAR });
  const names = (system: ReturnType<typeof at>) => system.bodies.map((body) => body.name);
  const circling = (system: ReturnType<typeof at>, moons: boolean) =>
    system.bodies
      .filter(({ parent, physics }) => {
        const host = parent === null ? null : system.bodies[parent].physics;
        const moon = host !== null && !starborn(host);
        const edge = moon ? rocheOf(host.radius, densityOf(host.mass, host.radius), 2000) : 0;
        return moons ? moon && physics.orbit > 1.7 * edge : !moon;
      })
      .map((body) => body.name);
  let drawn = 0;
  let swallowed = 0;
  let crowded = 0;
  let kept = 0;
  for (let seed = 13; seed <= 52; seed++) {
    const prime = at(seed, 4.5);
    const known = new Map(prime.bodies.map((body) => [body.name, body]));
    const hostOf = (system: ReturnType<typeof at>, name: string) => {
      const { parent } = system.bodies.find((body) => body.name === name) ?? { parent: null };
      return parent === null ? null : system.bodies[parent].name;
    };
    const young = at(seed, 0.3);
    const old = at(seed, 9.9);
    const fallen = (system: ReturnType<typeof at>) =>
      new Set(system.bodies[0].swallowed.map((taken) => taken.name));
    const since = (system: ReturnType<typeof at>, before: ReturnType<typeof at>) =>
      circling(before, false).filter((name) => !fallen(system).has(name));
    assert.deepEqual(circling(young, false), since(young, prime), `seed ${seed} when young`);
    assert.deepEqual(circling(old, false), since(old, prime), `seed ${seed} when old`);
    const then = circling(prime, true);
    const last = circling(old, true);
    assert.ok(
      then.every((name) => names(young).includes(name)),
      `seed ${seed}: no moon is new`,
    );
    assert.ok(
      last.every((name) => names(prime).includes(name)),
      `seed ${seed}: no moon comes back`,
    );
    drawn += names(young).filter((name) => !names(old).includes(name)).length;
    const lone = prime.bodies.filter((body) => starborn(body.physics)).length === 1;
    for (const age of [10.9, 11.3, 11.42, 11.56, 12.5]) {
      const late = at(seed, age);
      const label = `seed ${seed} at ${age}`;
      const { swell } = lifeOf(SUN_MASS, age * GIGAYEAR);
      const here = new Set(names(late));
      for (const body of late.bodies) {
        const once = known.get(body.name);
        const moon = body.parent !== null && !starborn(late.bodies[body.parent].physics);
        assert.ok(once !== undefined || moon, `${label}, ${body.name} was there at first`);
        if (once === undefined) {
          continue;
        }
        assert.equal(body.seed, once.seed, label);
        assert.equal(starborn(body.physics), starborn(once.physics), label);
        if (!starborn(body.physics) && !moon) {
          assert.equal(body.physics.mass, once.physics.mass, `${label}, ${body.name}`);
        }
      }
      if (!lone) {
        continue;
      }
      const sun = late.bodies[0].physics;
      const eaten = fallen(late);
      const nudged = late.bodies.some((body) => body.drawn !== null);
      for (const once of prime.bodies) {
        const host = hostOf(prime, once.name);
        if (host === null) {
          continue;
        }
        const near = once.physics.orbit * (1 - once.physics.stretch);
        const gone = !here.has(once.name);
        if (host !== prime.bodies[0].name) {
          const freed = late.bodies.find((body) => body.name === once.name)?.freed ?? null;
          const loose = freed !== null && freed.from === host;
          assert.ok(gone || here.has(host) || loose, `${label}, ${once.name} goes with ${host}`);
          continue;
        }
        const taken = eaten.has(once.name);
        assert.ok(!taken || gone, `${label}, ${once.name} was swallowed and is still there`);
        assert.ok(gone || near > swell, `${label}, ${once.name} at ${near} was reached`);
        assert.ok(!taken || near < 8 * swell, `${label}, ${once.name} at ${near} was drawn in`);
        assert.ok(
          taken || !gone || sun.mass < SUN_MASS || nudged,
          `${label}, ${once.name} was let go`,
        );
        swallowed += taken ? 1 : 0;
        crowded += gone && !taken ? 1 : 0;
        kept += gone ? 0 : 1;
        const now = late.bodies.find((body) => body.name === once.name);
        if (now !== undefined) {
          const wider = (now.physics.orbit * sun.mass) / (once.physics.orbit * SUN_MASS);
          assert.ok(wider < 1 + 1e-4, `${label}, ${once.name} moved out ${wider}`);
          assert.ok(wider > 1 - 1e-3 || now.drawn !== null, `${label}, ${once.name} drawn in`);
        }
      }
    }
  }
  assert.ok(swallowed > 100 && kept > 100, `${swallowed} swallowed, ${kept} kept`);
  assert.ok(drawn > 5, `${drawn} moons drawn down between the ages`);
  assert.ok(
    crowded > 0 && crowded < 0.2 * kept,
    `${crowded} crowded out by a lighter star or a drawn planet`,
  );
});

test("a young star is wide and cool and settles on the main sequence", () => {
  const still = { next: () => 0.5 };
  const at = (suns: number, years: number) => kindled(suns * SUN_MASS, years * YEAR, still);
  const sun = at(1, 1e6);
  assert.equal(classOf(sun), "T Tauri star");
  assert.ok(Math.abs(sun.radius / SUN_RADIUS - 2.4) < 0.1 && Math.abs(sun.heat - 4300) < 50);
  assert.ok(sun.glow > 1.5 * SUN_GLOW && sun.glow < 2.1 * SUN_GLOW);
  const dim = at(1, 1e7);
  assert.equal(classOf(dim), "orange star");
  assert.ok(dim.glow > 0.4 * SUN_GLOW && dim.glow < 0.6 * SUN_GLOW);
  assert.ok(sun.day < at(1, 1e8).day && at(1, 1e8).day < at(1, 4.5e9).day);
  assert.equal(classOf(at(3, 5e5)), "Herbig star");
  assert.equal(classOf(at(0.1, 1e8)), "T Tauri star");
  assert.equal(classOf(at(0.1, 5e8)), "red dwarf");
  assert.ok(Math.abs(at(0.1, 1e6).radius / SUN_RADIUS - 0.9) < 0.1);
  for (const suns of [0.08, 0.1, 0.3, 0.6, 1, 1.5, 2.5, 5, 9, 20, 60]) {
    const mass = suns * SUN_MASS;
    const dawn = starDawn(mass);
    assert.ok(dawn < 0.5 * starSpan(mass), `${suns} suns settle in ${dawn / YEAR} years`);
    const settled = lifeOf(mass, dawn);
    assert.equal(settled.radius, starRadius(mass));
    assert.equal(settled.glow, starGlow(mass));
    let before = lifeOf(mass, 1e4 * YEAR);
    assert.equal(before.radius, lifeOf(mass, 1e5 * YEAR).radius);
    for (let step = 1; step <= 60; step++) {
      const now = lifeOf(mass, 1e5 * YEAR * (dawn / (1e5 * YEAR)) ** (step / 60));
      const label = `${suns} suns at step ${step}`;
      assert.ok(now.radius <= before.radius * (1 + 1e-12), label);
      assert.ok(now.radius >= settled.radius && now.mass === mass && now.spent === 0, label);
      assert.ok(now.glow > (suns < 3 ? 0.25 : 1 - 1e-12) * settled.glow, label);
      assert.ok(now.swell === settled.radius && now.peak === settled.glow, label);
      before = now;
    }
  }
  assert.ok(Math.abs(starDawn(SUN_MASS) / (4e7 * YEAR) - 1) < 1e-9);
  assert.ok(starDawn(0.1 * SUN_MASS) > 0.9 * GIGAYEAR && starDawn(0.1 * SUN_MASS) < 1.1 * GIGAYEAR);
});

test("a system grows out of the disk of its young star", () => {
  const at = (seed: number, years: number) =>
    surveySystem(seed, { settled: false, star: SUN_MASS, age: years * YEAR });
  const ages = [1e5, 5e5, 2e6, 5e6, 1e7, 3e7, 6e7, 1e8, 1.5e8];
  let early = 0;
  let late = 0;
  let sheets = 0;
  let heavy = 0;
  let molten = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const grown = at(seed, 4.5e9);
    const whole = new Map(grown.bodies.map((body) => [body.name, body]));
    let before = new Map<string, number>();
    let tided = new Set<string>();
    let gas = Number.POSITIVE_INFINITY;
    for (const years of ages) {
      const system = at(seed, years);
      const label = `seed ${seed} at ${years} years`;
      const masses = new Map(system.bodies.map((body) => [body.name, body.physics.mass]));
      for (const [name, mass] of before) {
        const now = tided.has(name) ? mass : (masses.get(name) ?? 0);
        assert.ok(now >= mass, `${label}, ${name} has not shrunk or gone`);
      }
      tided = new Set(
        system.bodies
          .filter(({ parent }) => parent !== null && !starborn(system.bodies[parent].physics))
          .map((body) => body.name),
      );
      for (const body of system.bodies) {
        const end = whole.get(body.name);
        assert.ok(
          end !== undefined || tided.has(body.name),
          `${label}, ${body.name} is of the grown system`,
        );
        const full = tided.has(body.name) ? body : (end ?? body);
        assert.ok(body.physics.mass <= full.physics.mass, `${label}, ${body.name}`);
        assert.equal(body.seed, (end ?? body).seed, label);
        if (body.parent !== null && !starborn(body.physics)) {
          const host = system.bodies[body.parent].physics;
          const near = body.physics.orbit * (1 - body.physics.stretch);
          assert.ok(near > 1.4 * (host.radius + body.physics.radius), `${label}, ${body.name}`);
          molten += body.physics.mass < full.physics.mass && body.physics.heat > 1000 ? 1 : 0;
        }
      }
      const disks = system.bodies.flatMap((body) => body.physics.disks);
      const left = disks.reduce((sum, disk) => sum + disk.gas, 0);
      assert.ok(left <= gas, `${label}: the gas does not come back`);
      assert.equal(left, years >= 6e7 ? 0 : left, label);
      if (years === 5e5) {
        assert.equal(classOf(system.bodies[0].physics), "T Tauri star", label);
        assert.ok(left > 1e-4 * SUN_MASS && left < 0.03 * SUN_MASS, `${label}: ${left} of gas`);
        heavy += left > 0.01 * SUN_MASS ? 1 : 0;
        assert.ok(
          disks.some((disk) => disk.gas > 0 && disk.depth > 0.1),
          label,
        );
        sheets += disks.filter((disk) => disk.gas > 0).length;
        early += system.bodies.length;
      }
      if (years >= 1e8) {
        assert.deepEqual(
          [...masses.keys()].filter((name) => !tided.has(name)),
          grown.bodies
            .filter(({ parent }) => parent === null || starborn(grown.bodies[parent].physics))
            .map((body) => body.name),
          label,
        );
        const dust = (body: (typeof system.bodies)[number]) =>
          body.physics.disks.map(({ depth, grain, ...kept }) => ({
            ...kept,
            dust: body.parent === null || starborn(body.physics) ? 0 : depth * grain,
          }));
        for (const body of system.bodies) {
          const end = whole.get(body.name);
          if (end === undefined) {
            continue;
          }
          if (tided.has(body.name)) {
            continue;
          }
          assert.equal(body.physics.mass, end.physics.mass, `${label}, ${body.name}`);
          if (body.parent !== null && !starborn(body.physics)) {
            continue;
          }
          assert.deepEqual(dust(body), dust(end), `${label}, ${body.name}`);
          body.physics.disks.forEach((disk, at) => {
            const worn = starborn(body.physics);
            const late = end.physics.disks[at];
            assert.ok(worn ? late.depth < disk.depth : late.depth === disk.depth, label);
            assert.ok(worn ? late.grain > disk.grain : late.grain === disk.grain, label);
          });
        }
      }
      before = masses;
      gas = left;
    }
    late += grown.bodies.length;
  }
  assert.ok(early < 0.25 * late, `${early} bodies at half a million years of ${late} in the end`);
  assert.ok(
    sheets > 24 && molten > 10,
    `${sheets} sheets of gas and dust, ${molten} molten bodies`,
  );
  assert.ok(heavy > 8, `${heavy} disks of 24 as heavy as a hundredth of a Sun`);
});

test("the air of a cold heavy giant is a thin skin and of a hot light one a deep one", () => {
  const jupiter = scaleHeight({ mass: JUPITER_MASS, radius: 6.9911e7, heat: 125 });
  assert.ok(jupiter > 15e3 && jupiter < 20e3, `Jupiter thins by e every ${jupiter} m`);
  const puffed = { mass: 0.3 * JUPITER_MASS, radius: 8.4e7, heat: 1500 };
  const share = scaleHeight(puffed) / puffed.radius;
  assert.ok(share > 0.01 && share < 0.02, `a hot light giant at ${share} of its radius`);
  assert.ok(scaleHeight({ ...puffed, heat: 750 }) < scaleHeight(puffed));
});
