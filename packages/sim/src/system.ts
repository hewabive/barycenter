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
  GASES,
  type Gas,
  type Physics,
  type Relief,
  type Ring,
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
const MOON_REST = 0.35;

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
    ring: null,
  };
}

function ringOf(
  mass: number,
  radius: number,
  fluid: boolean,
  bare: number,
  random: Random,
): Ring | null {
  if (random.next() >= (fluid ? RING_SHARE_FLUID : RING_SHARE_SOLID)) {
    return null;
  }
  const ice = bare < ICE_HEAT ? between(random, 0.6, 1) : between(random, 0, 0.1);
  const grain = ROCK_GRAIN - (ROCK_GRAIN - ICE_GRAIN) * ice;
  const limit = 0.95 * rocheOf(radius, densityOf(mass, radius), grain);
  const dense = fluid && random.next() < 0.4;
  const inner = radius * between(random, 1.15, 1.5);
  const outer = Math.min(limit, radius * between(random, 1.8, 2.4));
  if (outer < inner * 1.15) {
    return null;
  }
  return {
    inner,
    outer,
    depth: dense ? between(random, 0.55, 0.95) : between(random, 0.2, 0.5),
    ice,
  };
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
    ring: ringOf(mass, radius, fluid, bare, random),
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
    ring: null,
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

function moonsOf(planet: Physics, star: Physics, random: Random): Physics[] {
  const fluid = planet.gas >= FLUID_SHARE;
  const earths = planet.mass / EARTH_MASS;
  const settledHere = planet.life > 0;
  const count = settledHere
    ? 1 + (random.next() < 0.15 ? 1 : 0)
    : fluid
      ? (earths > 50 ? 1 : 0) + Math.floor(3 * random.next())
      : random.next() < (earths > 0.2 ? 0.3 : 0.05)
        ? 1
        : 0;
  const low = Math.max(
    3 * planet.radius,
    1.3 * (planet.ring?.outer ?? 0),
    1.2 * rocheOf(planet.radius, densityOf(planet.mass, planet.radius), MOON_GRAIN),
  );
  const high = MOON_REST * hillOf(planet.orbit, planet.mass, star.mass);
  let orbit = fluid
    ? low * decades(random, 0.1, 0.5)
    : Math.max(low, Math.min(high, planet.radius * between(random, 25, 65)));
  const moons: Physics[] = [];
  for (let index = 0; index < count; index++) {
    if (orbit > high && !(settledHere && index === 0)) {
      break;
    }
    const share = settledHere
      ? decades(random, -2.3, -1.7)
      : fluid
        ? decades(random, -5, -3.7)
        : decades(random, -3.2, -1.8);
    const site = { star, distance: planet.orbit, around: planet, orbit };
    moons.push(formed(planet.mass * share, site, random, true));
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
  const reach = (id: number): number => {
    const { physics, parent } = bodies[id];
    const own = radius[id] * Math.max(1, (physics.ring?.outer ?? 0) / physics.radius);
    const gap = parent === null ? PLANET_GAP : MOON_GAP;
    let edge = own * CLEARANCE;
    const around = bodies
      .filter((child) => child.parent === id)
      .sort((left, right) => left.physics.orbit - right.physics.orbit);
    for (const child of around) {
      const span = reach(child.id);
      const drawn =
        parent === null
          ? HOME_ORBIT * (child.physics.orbit / anchor.orbit) ** ORBIT_POWER
          : MOON_REACH * radius[id] * Math.sqrt(child.physics.orbit / physics.radius);
      orbit[child.id] = Math.max(drawn, edge + span);
      edge = orbit[child.id] + span + gap;
    }
    return around.length === 0 ? own : edge - gap;
  };
  for (const body of bodies) {
    if (body.parent === null) {
      reach(body.id);
    }
  }
  const pace = (span: number, unit: number, ticks: number) =>
    Math.max(1, Math.round(ticks * (span / unit) ** TIME_POWER));
  return bodies.map((body) => {
    const year = body.parent === null ? 0 : pace(body.physics.year, anchor.year, HOME_YEAR);
    const locked = body.physics.day === body.physics.year;
    return {
      ...body,
      radius: trim(radius[body.id]),
      orbit: trim(orbit[body.id]),
      year,
      day: locked ? year : pace(body.physics.day, anchor.day, HOME_DAY),
    };
  });
}

function trimmed(physics: Physics): Physics {
  const ring = physics.ring;
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
    ring:
      ring === null
        ? null
        : {
            inner: trim(ring.inner),
            outer: trim(ring.outer),
            depth: trim(ring.depth),
            ice: trim(ring.ice),
          },
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
  const pick = (list: string[]) => list[Math.floor(random.next() * list.length)];
  const name = (): string => {
    const made = pick(OPENINGS) + pick(MIDDLES) + pick(ENDINGS);
    if (taken.has(made)) {
      return name();
    }
    taken.add(made);
    return made;
  };
  const seed = () => Math.floor(random.next() * 0x7fffffff);
  const homeSeed = seed();

  const [least, most] = plan.settled ? SETTLED_STARS : WILD_STARS;
  const drawn = SUN_MASS * decades(random, Math.log10(least), Math.log10(most));
  const star = kindled(plan.star ?? drawn, random);
  const lit = Math.sqrt(star.glow / SUN_GLOW);
  const nearest = Math.max(INNER_EDGE * lit, 6 * star.radius);
  const orbits: number[] = [];
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
    }
  }

  const drafts: Draft[] = [{ physics: star, parent: null, tilt: 0 }];
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
    for (const moon of moonsOf(planet, star, random)) {
      drafts.push({ physics: moon, parent: id, tilt: 0 });
    }
  }

  const bodies = drafts.map((draft, id): Body => {
    const physics = trimmed(draft.physics);
    const own = id === home ? homeSeed : seed();
    return {
      id,
      name: name(),
      seed: own,
      parent: draft.parent,
      physics,
      radius: 0,
      orbit: 0,
      year: 0,
      phase: draft.parent === null ? 0 : trim(2 * Math.PI * random.next()),
      tilt: trim(draft.tilt),
      day: 0,
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
