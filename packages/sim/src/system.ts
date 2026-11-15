import {
  ASTRONOMICAL_UNIT,
  balanceHeat,
  type Climate,
  climateOf,
  columnOf,
  DAMP_LEAST,
  DAY,
  densityOf,
  EARTH_AIR,
  EARTH_MASS,
  EARTH_RADIUS,
  envelopeOf,
  FLUID_SHARE,
  frostOf,
  gasShare,
  gripOf,
  HOUR,
  hillOf,
  radiusOf,
  rocheOf,
  SUN_GLOW,
  SUN_MASS,
  seaCover,
  starGlow,
  starHeat,
  starRadius,
  stocked,
  strippedShare,
  yearOf,
} from "./physics.ts";
import { createRandom, type Random } from "./random.ts";
import { elevationAt } from "./relief.ts";
import { scatter } from "./sphere.ts";
import {
  type Body,
  type Disk,
  GASES,
  type Gas,
  type Lane,
  type Physics,
  type Relief,
  type Sketch,
  type StarSystem,
  type Vector,
} from "./types.ts";

export interface Site {
  star: Physics;
  distance: number;
  around: Physics;
  orbit: number;
}

export interface Plan {
  settled: boolean;
  star: number | null;
}

interface Draft {
  physics: Physics;
  parent: number | null;
  tilt: number;
}

interface Kin {
  physics: Physics;
  moons: Kin[];
}

interface Anchor {
  radius: number;
  orbit: number;
  year: number;
  day: number;
}

const INNER_EDGE = 0.15 * ASTRONOMICAL_UNIT;
const OUTER_EDGE = 40 * ASTRONOMICAL_UNIT;
const INNER_STEPS = 2;
const OUTER_STEPS = 5;
const WILD_STEPS = 10;
const SYSTEM_SALT = 0x5bd1e995;
const MARK_SALT = 0x27d4eb2f;
const SETTLED_STARS = [0.3, 1.6];
const WILD_STARS = [0.1, 2.5];
const PLANET_SHARE = 0.85;
const PARCH_HEAT = 400;
const ICE_HEAT = 160;
const ICY_SHARE = 0.1;
const HELIUM_SHARE = 0.14;
const LOOSE_GRIP = 0.8;
const RING_SHARE_FLUID = 0.45;
const RING_SHARE_SOLID = 0.05;
const ROCK_GRAIN = 3000;
const ICE_GRAIN = 900;
const MOON_GRAIN = 2000;
const RING_ROCK = 1;
const BELT_ROCK = 1000;
const BELT_SHARE = 0.6;
const MOON_REST = 0.4;
const SUBMOON_REST = 0.33;
const SUBMOON_SHARE = 0.02;
const MOON_DEPTH = 3;

const SIZE_POWER = 0.45;
const ORBIT_POWER = 0.37;
const TIME_POWER = 0.6;
const HOME_ORBIT = 34;
const HOME_YEAR = 9600;
const HOME_DAY = 1200;
const MOON_REACH = 1.16;
const CLEARANCE = 1.35;
const PLANET_GAP = 3;
const MOON_GAP = 0.8;
const MAX_TILT = 0.45;

const SHORE_POINTS = 240;
const HIGH_SHARE = 0.82;
const HOME_SHAPE = { frequency: 1.2, warp: 0.5, ridge: 0.45 };
const FLUID_RELIEF: Relief = { frequency: 2, warp: 0.7, ridge: 0, sea: null, peak: 0.5 };

const OPENINGS = ["Ta", "Ke", "Mo", "Vi", "Su", "Ar", "El", "No", "Ri", "Ze", "Ha", "Ol"];
const MIDDLES = ["ra", "li", "no", "ve", "tu", "sha", "mi", "do", ""];
const ENDINGS = ["n", "s", "r", "th", "x", "l", "m", "a", "is", "on"];

const trim = (value: number) => Number(value.toPrecision(5));
const between = (random: Random, from: number, to: number) => from + (to - from) * random.next();
const decades = (random: Random, from: number, to: number) => 10 ** between(random, from, to);

function smooth(from: number, to: number, value: number): number {
  const share = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return share * share * (3 - 2 * share);
}

export function kindled(mass: number, random: Random): Physics {
  const glow = starGlow(mass);
  const radius = starRadius(mass);
  return {
    mass,
    radius,
    iron: 0,
    rock: 0,
    ice: 0,
    gas: 1,
    heat: starHeat(glow, radius),
    glow,
    air: 0,
    gases: [],
    life: 0,
    vigor: random.next(),
    orbit: 0,
    year: 0,
    day: DAY * between(random, 12, 40),
    disks: [],
  };
}

function diskOf(inner: number, outer: number, ice: number, given: Partial<Disk>): Disk {
  const area = Math.PI * (outer ** 2 - inner ** 2);
  const grain = ROCK_GRAIN - (ROCK_GRAIN - ICE_GRAIN) * ice;
  const size = given.depth === undefined ? BELT_ROCK : RING_ROCK;
  const laden = (4 * grain * size) / 3;
  const mass = given.mass ?? (given.depth ?? 0) * area * laden;
  return { inner, outer, mass, depth: given.depth ?? mass / (area * laden), ice };
}

function ringOf(
  mass: number,
  radius: number,
  fluid: boolean,
  bare: number,
  hold: number,
  random: Random,
): Disk[] {
  if (random.next() >= (fluid ? RING_SHARE_FLUID : RING_SHARE_SOLID)) {
    return [];
  }
  const ice = bare < ICE_HEAT ? between(random, 0.6, 1) : between(random, 0, 0.1);
  const grain = ROCK_GRAIN - (ROCK_GRAIN - ICE_GRAIN) * ice;
  const limit = Math.min(0.95 * rocheOf(radius, densityOf(mass, radius), grain), hold);
  const dense = fluid && random.next() < 0.4;
  const inner = radius * between(random, 1.15, 1.5);
  const outer = Math.min(limit, radius * between(random, 1.8, 2.4));
  if (outer < inner * 1.15) {
    return [];
  }
  const depth = dense ? between(random, 0.55, 0.95) : between(random, 0.2, 0.5);
  return [diskOf(inner, outer, ice, { depth })];
}

function beltOf(orbit: number, star: Physics, random: Random): Disk {
  const beyond = orbit > frostOf(star.glow);
  const mass = EARTH_MASS * (beyond ? decades(random, -2.5, -0.5) : decades(random, -4.5, -2.5));
  const ice = beyond ? between(random, 0.4, 0.8) : between(random, 0, 0.1);
  const inner = orbit * between(random, 0.8, 0.92);
  return diskOf(inner, orbit * between(random, 1.08, 1.25), ice, { mass });
}

export function formed(mass: number, site: Site, random: Random, locked = false): Physics {
  const glow = site.star.glow;
  const bare = balanceHeat(glow, site.distance, 0);
  const earths = mass / EARTH_MASS;
  const typical = gasShare(mass);
  const odds = (typical / (1 - typical)) * decades(random, -0.3, 0.3);
  const gathered = odds / (1 + odds);
  const beyond = site.distance > frostOf(glow);
  const damp = beyond
    ? between(random, 0.3, 0.65)
    : decades(random, -5.5, -3.2) * (bare > PARCH_HEAT ? 0.01 : 1);
  const metal = random.next() < 0.06 ? between(random, 0.45, 0.7) : between(random, 0.15, 0.38);
  const made = (gas: number) => {
    const ice = (1 - gas) * damp;
    const iron = (1 - gas) * (1 - damp) * metal;
    return { iron, rock: 1 - gas - ice - iron, ice, gas };
  };
  const puffed = radiusOf(mass, made(gathered));
  const gas = Math.max(0, gathered - strippedShare(mass, puffed, site.star, site.distance));
  const { iron, rock, ice } = made(gas);
  const radius = radiusOf(mass, { iron, rock, ice, gas });
  const fluid = gas >= FLUID_SHARE;
  const grip = (kind: Gas) => gripOf(mass, radius, bare, kind);
  const kept = grip("nitrogen") > 1 && random.next() < grip("nitrogen") - 0.6;
  const outgassed = EARTH_AIR * earths * decades(random, -2.5, 2);
  const blend: Partial<Record<Gas, number>> = beyond
    ? {
        nitrogen: 1,
        methane: decades(random, -2, -0.7),
        "carbon dioxide": decades(random, -1, 0),
        ammonia: decades(random, -3, -2),
      }
    : { "carbon dioxide": 1, nitrogen: decades(random, -1.7, -1) };
  const parts = Object.values(blend).reduce((sum, part) => sum + part, 0);
  const column = columnOf(mass, radius);
  const stock = stocked({
    ...Object.fromEntries(
      Object.entries(blend).map(([kind, part]) => [kind, (outgassed * part) / parts]),
    ),
    water: column * ice,
    hydrogen: column * gas * (1 - HELIUM_SHARE),
    helium: column * gas * HELIUM_SHARE,
  }).map((amount, index) => (grip(GASES[index]) < LOOSE_GRIP ? 0 : amount));
  const frozen = ice > ICY_SHARE && bare < 1.3 * ICE_HEAT;
  const weathered = EARTH_AIR * decades(random, -4.2, -2.5);
  const climate: Climate = fluid
    ? envelopeOf(mass, glow, site.distance)
    : climateOf({
        glow,
        distance: site.distance,
        stock: kept ? stock : stock.map(() => 0),
        weathered,
        pool: column * DAMP_LEAST,
        frozen,
      });
  const year = yearOf(site.orbit, site.around.mass);
  const slow = random.next() < 0.12;
  const day = locked
    ? year
    : fluid
      ? HOUR * between(random, 8, 20)
      : slow
        ? DAY * decades(random, 1.3, 2.4)
        : HOUR * decades(random, 0.9, 1.8);
  return {
    mass,
    radius,
    iron,
    rock,
    ice,
    gas,
    heat: climate.heat,
    glow: 0,
    air: climate.air,
    gases: climate.gases,
    life: 0,
    vigor: random.next(),
    orbit: site.orbit,
    year,
    day,
    disks: ringOf(
      mass,
      radius,
      fluid,
      bare,
      SUBMOON_REST * hillOf(site.orbit, mass, site.around.mass),
      random,
    ),
  };
}

function settled(star: Physics, orbit: number, random: Random): Physics {
  const mass = EARTH_MASS * between(random, 0.8, 1.25);
  const iron = between(random, 0.28, 0.36);
  const ice = between(random, 1.5e-5, 3e-5);
  const shares = { iron, rock: 1 - iron - ice, ice, gas: 0 };
  const radius = radiusOf(mass, shares);
  const nitrogen = EARTH_AIR * between(random, 0.6, 1);
  const column = columnOf(mass, radius);
  const climate = climateOf({
    glow: star.glow,
    distance: orbit,
    stock: stocked({
      nitrogen,
      oxygen: nitrogen * between(random, 0.22, 0.33),
      "carbon dioxide": EARTH_AIR,
      water: column * ice,
    }),
    weathered: EARTH_AIR * decades(random, -3.7, -3.2),
    pool: column * DAMP_LEAST,
    frozen: false,
  });
  return {
    mass,
    radius,
    ...shares,
    heat: climate.heat,
    glow: 0,
    air: climate.air,
    gases: climate.gases,
    life: 1,
    vigor: between(random, 0.5, 0.9),
    orbit,
    year: yearOf(orbit, star.mass),
    day: HOUR * between(random, 18, 30),
    disks: [],
  };
}

function massAt(distance: number, star: Physics, random: Random): number {
  const place = distance / frostOf(star.glow);
  const pick = random.next();
  if (place < 0.8) {
    return EARTH_MASS * (pick < 0.12 ? decades(random, 0.5, 1) : decades(random, -1.4, 0.45));
  }
  if (place < 3.5) {
    return (
      EARTH_MASS *
      (pick < 0.55
        ? decades(random, 1.7, 2.9)
        : pick < 0.8
          ? decades(random, 0.9, 1.5)
          : decades(random, -1.5, 0.3))
    );
  }
  return (
    EARTH_MASS *
    (pick < 0.45
      ? decades(random, 0.9, 1.5)
      : pick < 0.6
        ? decades(random, 1.6, 2.3)
        : decades(random, -3, -0.7))
  );
}

function moonsOf(
  host: Physics,
  around: Physics,
  star: Physics,
  distance: number,
  depth: number,
  random: Random,
): Kin[] {
  const fluid = host.gas >= FLUID_SHARE;
  const earths = host.mass / EARTH_MASS;
  const settledHere = host.life > 0;
  const low = Math.max(
    3 * host.radius,
    1.3 * Math.max(0, ...host.disks.map((disk) => disk.outer)),
    1.2 * rocheOf(host.radius, densityOf(host.mass, host.radius), MOON_GRAIN),
  );
  const rest = depth === 0 ? MOON_REST : SUBMOON_REST;
  const high = rest * hillOf(host.orbit, host.mass, around.mass);
  if (depth >= MOON_DEPTH || (high <= low && !settledHere)) {
    return [];
  }
  const count =
    depth > 0
      ? random.next() < SUBMOON_SHARE
        ? 1
        : 0
      : settledHere
        ? 1 + (random.next() < 0.15 ? 1 : 0)
        : fluid
          ? (earths > 50 ? 2 : 0) + Math.floor(4 * random.next())
          : random.next() < (earths > 0.2 ? 0.3 : 0.05)
            ? 1
            : 0;
  let orbit =
    depth > 0
      ? low * (high / low) ** between(random, 0.1, 0.8)
      : fluid
        ? low * decades(random, 0.1, 0.5)
        : Math.max(low, Math.min(high, host.radius * between(random, 25, 65)));
  const moons: Kin[] = [];
  for (let index = 0; index < count; index++) {
    if (orbit > high && !(settledHere && index === 0)) {
      break;
    }
    const share =
      depth > 0
        ? decades(random, -4.5, -2.5)
        : settledHere
          ? decades(random, -2.3, -1.7)
          : fluid
            ? decades(random, -5, -3.7)
            : decades(random, -3.2, -1.8);
    const physics = formed(
      host.mass * share,
      { star, distance, around: host, orbit },
      random,
      true,
    );
    moons.push({ physics, moons: moonsOf(physics, host, star, distance, depth + 1, random) });
    orbit *= between(random, 1.5, 2.3);
  }
  return moons;
}

export function reliefOf(physics: Physics, seed: number): Relief {
  if (physics.gas >= FLUID_SHARE) {
    return FLUID_RELIEF;
  }
  const random = createRandom(seed + 71);
  const small = 1 - smooth(-2, 0, Math.log10(physics.mass / EARTH_MASS));
  const lively = physics.vigor * (1 - small);
  const shape =
    physics.life > 0
      ? HOME_SHAPE
      : physics.ice >= ICY_SHARE
        ? { frequency: 1.6 + 0.4 * random.next(), warp: 0.55, ridge: 0.7 }
        : { frequency: 1.3 + 1.1 * small, warp: 0.25 + 0.3 * lively, ridge: 0.2 + 0.45 * lively };
  const cover = seaCover(physics);
  if (cover === 0) {
    return { ...shape, sea: null, peak: 0.5 };
  }
  const dry = { ...shape, sea: null, peak: 0.5 };
  const heights = scatter(SHORE_POINTS, random)
    .map((at) => elevationAt(seed, dry, at))
    .sort((left, right) => left - right);
  const level = (share: number) =>
    heights[Math.min(heights.length - 1, Math.floor(share * heights.length))];
  return { ...shape, sea: level(cover), peak: level(cover + HIGH_SHARE * (1 - cover)) };
}

function arranged(bodies: Body[], anchor: Anchor): Body[] {
  const radius = bodies.map((body) => (body.physics.radius / anchor.radius) ** SIZE_POWER);
  const orbit = bodies.map(() => 0);
  const lanes: Lane[][] = bodies.map(() => []);
  const pace = (span: number, unit: number, ticks: number) =>
    Math.max(1, Math.round(ticks * (span / unit) ** TIME_POWER));
  const turn = (disk: Disk, around: number) =>
    pace(yearOf((disk.inner + disk.outer) / 2, around), anchor.year, HOME_YEAR);
  const reach = (id: number): number => {
    const { physics, parent } = bodies[id];
    const drawn = (span: number) =>
      parent === null
        ? HOME_ORBIT * (span / anchor.orbit) ** ORBIT_POWER
        : MOON_REACH * radius[id] * Math.sqrt(span / physics.radius);
    const rings = parent === null ? [] : physics.disks;
    lanes[id] = rings.map((disk) => ({
      inner: (radius[id] * disk.inner) / physics.radius,
      outer: (radius[id] * disk.outer) / physics.radius,
      year: turn(disk, physics.mass),
    }));
    const own = Math.max(radius[id], ...lanes[id].map((lane) => lane.outer));
    const gap = parent === null ? PLANET_GAP : MOON_GAP;
    let edge = own * CLEARANCE;
    const belts = parent === null ? physics.disks : [];
    const around = [
      ...bodies
        .filter((child) => child.parent === id)
        .map((child) => ({ at: child.physics.orbit, child, belt: null })),
      ...belts.map((belt) => ({ at: belt.inner, child: null, belt })),
    ].sort((left, right) => left.at - right.at);
    for (const { child, belt } of around) {
      if (child !== null) {
        const span = reach(child.id);
        orbit[child.id] = Math.max(drawn(child.physics.orbit), edge + span);
        edge = orbit[child.id] + span + gap;
      } else if (belt !== null) {
        const inner = Math.max(drawn(belt.inner), edge);
        const outer = inner + drawn(belt.outer) - drawn(belt.inner);
        lanes[id].push({ inner, outer, year: turn(belt, physics.mass) });
        edge = outer + gap;
      }
    }
    return around.length === 0 ? own : edge - gap;
  };
  for (const body of bodies) {
    if (body.parent === null) {
      reach(body.id);
    }
  }
  return bodies.map((body) => {
    const year = body.parent === null ? 0 : pace(body.physics.year, anchor.year, HOME_YEAR);
    const locked = body.physics.day === body.physics.year;
    return {
      ...body,
      radius: trim(radius[body.id]),
      orbit: trim(orbit[body.id]),
      year,
      day: locked ? year : pace(body.physics.day, anchor.day, HOME_DAY),
      disks: lanes[body.id].map((lane) => ({
        inner: trim(lane.inner),
        outer: trim(lane.outer),
        year: lane.year,
      })),
    };
  });
}

function trimmed(physics: Physics): Physics {
  return {
    mass: trim(physics.mass),
    radius: trim(physics.radius),
    iron: trim(physics.iron),
    rock: trim(physics.rock),
    ice: trim(physics.ice),
    gas: trim(physics.gas),
    heat: trim(physics.heat),
    glow: trim(physics.glow),
    air: trim(physics.air),
    gases: physics.gases.map(trim),
    life: physics.life,
    vigor: trim(physics.vigor),
    orbit: trim(physics.orbit),
    year: trim(physics.year),
    day: trim(physics.day),
    disks: physics.disks.map((disk) => ({
      inner: trim(disk.inner),
      outer: trim(disk.outer),
      mass: trim(disk.mass),
      depth: trim(disk.depth),
      ice: trim(disk.ice),
    })),
  };
}

export function createSystem(seed: number): StarSystem {
  const { home, bodies } = sketchSystem(seed, { settled: true, star: null });
  if (home === null) {
    throw new Error("a settled system has a home");
  }
  return { home, bodies };
}

export function sketchSystem(world: number, plan: Plan): Sketch {
  const random = createRandom(world ^ SYSTEM_SALT);
  const taken = new Set<string>();
  const marks = createRandom(world ^ MARK_SALT);
  const pick = (list: string[]) => list[Math.floor(marks.next() * list.length)];
  const name = (): string => {
    const made = pick(OPENINGS) + pick(MIDDLES) + pick(ENDINGS);
    if (taken.has(made)) {
      return name();
    }
    taken.add(made);
    return made;
  };
  const homeSeed = Math.floor(random.next() * 0x7fffffff);

  const [least, most] = plan.settled ? SETTLED_STARS : WILD_STARS;
  const drawn = SUN_MASS * decades(random, Math.log10(least), Math.log10(most));
  const star = kindled(plan.star ?? drawn, random);
  const lit = Math.sqrt(star.glow / SUN_GLOW);
  const nearest = Math.max(INNER_EDGE * lit, 6 * star.radius);
  const orbits: number[] = [];
  const belts: Disk[] = [];
  const empty = (orbit: number) => {
    if (random.next() < BELT_SHARE) {
      belts.push(beltOf(orbit, star, random));
    }
  };
  let homeOrbit: number | null = null;
  if (plan.settled) {
    const settledAt = (ASTRONOMICAL_UNIT * lit) / Math.sqrt(between(random, 0.95, 1.08));
    homeOrbit = settledAt;
    orbits.push(settledAt);
    let inward = settledAt;
    for (let step = 0; step < INNER_STEPS; step++) {
      inward /= between(random, 1.45, 2);
      if (inward < nearest) {
        break;
      }
      if (random.next() < PLANET_SHARE) {
        orbits.unshift(inward);
      } else {
        empty(inward);
      }
    }
  }
  let outward = homeOrbit ?? (nearest * decades(random, 0, 0.5)) / 1.5;
  for (let step = 0; step < (plan.settled ? OUTER_STEPS : WILD_STEPS); step++) {
    outward *= between(random, 1.5, 2.1);
    if (outward > OUTER_EDGE * lit) {
      break;
    }
    if (random.next() < PLANET_SHARE) {
      orbits.push(outward);
    } else {
      empty(outward);
    }
  }
  if (outward * 1.6 < 1.5 * OUTER_EDGE * lit) {
    empty(outward * between(random, 1.4, 1.8));
  }
  belts.sort((left, right) => left.inner - right.inner);

  const drafts: Draft[] = [{ physics: { ...star, disks: belts }, parent: null, tilt: 0 }];
  let home: number | null = null;
  for (const orbit of orbits) {
    const settledHere = orbit === homeOrbit;
    const site = { star, distance: orbit, around: star, orbit };
    const planet = settledHere
      ? settled(star, orbit, random)
      : formed(massAt(orbit, star, random), site, random);
    const id = drafts.length;
    const steep = !settledHere && random.next() < 0.1;
    drafts.push({
      physics: planet,
      parent: 0,
      tilt: steep ? between(random, 0.5, 1.75) : MAX_TILT * random.next(),
    });
    if (settledHere) {
      home = id;
    }
    const adopt = (kin: Kin, parent: number) => {
      const own = drafts.length;
      drafts.push({ physics: kin.physics, parent, tilt: 0 });
      for (const moon of kin.moons) {
        adopt(moon, own);
      }
    };
    for (const kin of moonsOf(planet, star, star, orbit, 0, random)) {
      adopt(kin, id);
    }
  }

  const bodies = drafts.map((draft, id): Body => {
    const physics = trimmed(draft.physics);
    const drawn = Math.floor(marks.next() * 0x7fffffff);
    const own = id === home ? homeSeed : drawn;
    return {
      id,
      name: name(),
      seed: own,
      parent: draft.parent,
      physics,
      radius: 0,
      orbit: 0,
      year: 0,
      phase: draft.parent === null ? 0 : trim(2 * Math.PI * marks.next()),
      tilt: trim(draft.tilt),
      day: 0,
      disks: [],
      relief: id === home ? { ...HOME_SHAPE, sea: null, peak: 0.5 } : reliefOf(physics, own),
    };
  });
  const settledOn = home === null ? null : bodies[home].physics;
  const light = ASTRONOMICAL_UNIT * lit;
  const anchor: Anchor =
    settledOn === null
      ? { radius: EARTH_RADIUS, orbit: light, year: yearOf(light, star.mass), day: DAY }
      : {
          radius: settledOn.radius,
          orbit: settledOn.orbit,
          year: settledOn.year,
          day: settledOn.day,
        };
  return { home, bodies: arranged(bodies, anchor) };
}

export function positionOf(system: Sketch, id: number, tick: number): Vector {
  const body = system.bodies[id];
  if (body.parent === null) {
    return { x: 0, y: 0, z: 0 };
  }
  const center = positionOf(system, body.parent, tick);
  const angle = body.phase + (2 * Math.PI * tick) / body.year;
  return {
    x: center.x + body.orbit * Math.cos(angle),
    y: center.y,
    z: center.z + body.orbit * Math.sin(angle),
  };
}

export function spinOf(body: Body, tick: number): number {
  return (2 * Math.PI * tick) / body.day;
}
