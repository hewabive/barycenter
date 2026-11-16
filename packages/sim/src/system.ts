import {
  ASTRONOMICAL_UNIT,
  BROWN_LEAST,
  balanceHeat,
  type Climate,
  clearOf,
  climateOf,
  columnOf,
  DAMP_LEAST,
  DAY,
  densityOf,
  EARTH_AIR,
  EARTH_MASS,
  EARTH_RADIUS,
  envelopeOf,
  frostOf,
  GIGAYEAR,
  gasShare,
  glowOf,
  gripOf,
  HOUR,
  hillOf,
  holdOf,
  innerHeat,
  lightAt,
  nestOf,
  radiusOf,
  rocheOf,
  SKY_LIGHT,
  STAR_LEAST,
  SUN_GLOW,
  SUN_MASS,
  seaCover,
  seenGlow,
  starborn,
  starGlow,
  starHeat,
  starRadius,
  starSpan,
  stocked,
  strippedShare,
  swingOf,
  wrapped,
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
  lent: number;
  stretch: number;
  tied: boolean;
}

export interface Lamp {
  source: number;
  seen: number;
  reach: number;
}

export interface Plan {
  settled: boolean;
  star: number | null;
}

interface Beat {
  sun: number;
  sweep: number;
  season: number;
}

interface Share {
  ahead: number;
  sway: number;
  lane: number;
  chase: number;
}

interface Draft {
  physics: Physics;
  parent: number | null;
  tilt: number | null;
  slant: number | null;
  plane: number | null;
  beat: Beat | null;
  shared: (Share & { with: number }) | null;
  apart: boolean;
}

interface Star {
  physics: Physics;
  kin: Star[];
  slant: number;
  tilt: number | null;
  weight: number;
  glow: number;
}

interface Span {
  centre: Physics;
  inner: number;
  outer: number;
  before: Star | null;
  next: Star | null;
}

interface Zone {
  centre: Physics;
  around: number;
  inner: number;
  floor: number;
  outer: number;
  lent: number;
  plane: "system" | "equator" | number;
  home: boolean;
  last: boolean;
}

interface Kin {
  slant: number | null;
  physics: Physics;
  moons: Kin[];
  shared: (Share & { lead: Kin }) | null;
  apart: boolean;
}

interface Anchor {
  radius: number;
  orbit: number;
  year: number;
  day: number;
}

const INNER_EDGE = 0.02 * ASTRONOMICAL_UNIT;
const OUTER_EDGE = 40 * ASTRONOMICAL_UNIT;
const STAR_CLEARANCE = 4;
const DIM_REACH = 0.02;
const FIRST_SPAN = 1.3;
const FIRST_LEAN = 0.36;
const FIRST_ROOM = 0.5;
const INNER_STEPS = 2;
const OUTER_STEPS = 5;
const WILD_STEPS = 12;
const HOT_SHARE = 0.1;
const SYSTEM_SALT = 0x5bd1e995;
const MARK_SALT = 0x27d4eb2f;
const TURN_SALT = 0x165667b1;
const STIRRED_SHARE = 0.06;
const STIRRED_STRETCH = [0.2, 0.6];
const CALM_STRETCH = 0.15;
const SCATTERED_SHARE = 0.08;
const SCATTERED_KEPT = 0.4;
const SCATTERED_STIRRED = 0.6;
const HOME_STRETCH = 0.03;
const ROOM_SHARE = 0.8;
const TILTED_SHARE = 0.05;
const TILTED_SLANT = [0.15, 0.8];
const CALM_SLANT = 0.08;
const MOON_STRETCH = 0.02;
const CAUGHT_SHARE = 0.3;
const CAUGHT_STRETCH = 0.2;
const TIED_REACH = 0.5 * ASTRONOMICAL_UNIT;
const TIED_HEAVY = [10 * EARTH_MASS, 0.3];
const KEPLER_STEPS = 5;
const LAMP_LEAST = 1e-3;
const CHASE_SHARP = 0.97;
const ALONE = { ahead: 0, sway: 0, lane: 0, year: 1, phase: 0 };
const KIN_SALT = 0x2545f491;
const KIN_SHARE = [0.46, 0.25, 0.15, 0.8];
const KIN_SETTLED = 0.3;
const KIN_NEXT = 0.3;
const KIN_RATIO = 0.15;
const KIN_NEAR = 4;
const KIN_MIDDLE = 40 * ASTRONOMICAL_UNIT;
const KIN_POWER = 0.8;
const KIN_SPREAD = 1.5;
const KIN_SLACK = 0.08;
const KIN_EDGE = 20000 * ASTRONOMICAL_UNIT;
const KIN_STRETCH = 0.6;
const KIN_ROUND = [3 * DAY, 100 * DAY];
const KIN_TIED = 20 * DAY;
const KIN_LOOSE = [ASTRONOMICAL_UNIT, 100 * ASTRONOMICAL_UNIT];
const KIN_SLANT = 0.7;
const NEST_ROOM = 1.3;
const HOLD_ROOM = 0.8;
const CLEAR_ROOM = 1.15;
const HOME_IN = 1.6;
const HOME_OUT = 2.5;
const BELT_REACH = 1.3;
const ZONE_LEAST = 10;
const SHARE_SALT = 0x3c6ef372;
const RING_DENSE = 0.55;
const CHASE_SHARE = 1 / 30;
const CHASE_WIDE = [1.6, 4];
const CHASE_MOST = 0.49;
const TROJAN_MOONS = 0.2;
const TROJAN_BOTH = 0.3;
const TROJAN_LIGHT = [-6, -4];
const TROJAN_SWAY = [0.05, 0.35];
const TROJAN_PLANETS = 0.013;
const TROJAN_HOST = 10 * EARTH_MASS;
const TROJAN_LEAST = 0.01 * EARTH_MASS;
const TROJAN_MASS = [-3, -1];
const TROJAN_SLOW = 10 * DAY;
const CHASE_CLEAR = 1.5;
const DOUBLE_SHARE = 0.08;
const DOUBLE_MASS = [0.05, 0.45];
const SETTLED_STARS = [0.3, 1.6];
const WILD_STARS = [0.08, 2.5];
const BROWN_STARS = [0.013, 0.074];
const BROWN_SHARE = 0.07;
const SETTLED_AGES = [2, 8];
const WILD_AGES = [0.1, 10];
const COMPANION_SHARE = [0.03, 0.06];
const COMPANION_MOST = 0.08;
const PLANET_MOST = 0.01;
const MIGRATED_SHARE = [0.04, 0.2];
const MIGRATED_HEAT = 800;
const GIANT_SPAN = [1.7, 1.8, 1.5];
const PLANET_SHARE = 0.85;
const PARCH_HEAT = 400;
const ICE_HEAT = 160;
const ICY_SHARE = 0.1;
const HELIUM_SHARE = 0.14;
const LOOSE_GRIP = 0.8;
const RING_SHARE_FLUID = 0.45;
const RING_SHARE_SOLID = 0.05;
const RING_HEAT = 1200;
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
const STRAY_SHARE = 0.1;
const STRAY_NEAR = 1.9;
const STRAY_FLUID = [17, 20];
const STRAY_SOLID = [15.3, 18.5];
const STRAY_MOST = 1e-4;

const SIZE_POWER = 0.45;
const ORBIT_POWER = 0.37;
const TIME_POWER = 0.6;
const HOME_ORBIT = 34;
const HOME_YEAR = 9600;
const HOME_DAY = 1200;
const MOON_REACH = 1.16;
const CLEARANCE = 1.35;
const STAR_ROOM = 1.7;
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

export function kindled(mass: number, age: number, random: Random): Physics {
  const vigor = random.next();
  const shares = { iron: 0, rock: 0, ice: 0, gas: 1 };
  const rest = { life: 0, vigor, age, orbit: 0, stretch: 0, year: 0, disks: [] };
  if (mass < STAR_LEAST) {
    const inner = innerHeat(mass, age, vigor);
    const radius = radiusOf(mass, shares, inner);
    const climate = envelopeOf(mass, 0, 1, inner);
    return {
      mass,
      radius,
      ...shares,
      heat: climate.heat,
      coldest: climate.heat,
      hottest: climate.heat,
      glow: glowOf(radius, inner),
      light: 0,
      air: 0,
      gases: climate.gases,
      ...rest,
      day: HOUR * between(random, 2, 10),
    };
  }
  const glow = starGlow(mass);
  const radius = starRadius(mass);
  return {
    mass,
    radius,
    ...shares,
    heat: starHeat(glow, radius),
    coldest: starHeat(glow, radius),
    hottest: starHeat(glow, radius),
    glow,
    light: 0,
    air: 0,
    gases: [],
    ...rest,
    day: DAY * between(random, 12, 40),
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
  if (random.next() >= (fluid ? RING_SHARE_FLUID : RING_SHARE_SOLID) || bare > RING_HEAT) {
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
  const light = lightAt(site.star.glow, site.distance) + site.lent;
  const glow = 4 * Math.PI * site.distance ** 2 * light;
  const bare = balanceHeat(glow, site.distance, 0);
  const earths = mass / EARTH_MASS;
  const vigor = random.next();
  const inner = innerHeat(mass, site.star.age, vigor);
  const warmth = Math.max(bare, inner);
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
  const puffed = radiusOf(mass, made(gathered), warmth);
  const gas = Math.max(0, gathered - strippedShare(mass, puffed, site.star, site.distance));
  const { iron, rock, ice } = made(gas);
  const radius = radiusOf(mass, { iron, rock, ice, gas }, warmth);
  const fluid = wrapped({ mass, radius, gas });
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
    ? envelopeOf(mass, glow, site.distance, inner)
    : climateOf({
        glow,
        distance: site.distance,
        stock: kept ? stock : stock.map(() => 0),
        weathered,
        pool: column * DAMP_LEAST,
        frozen,
        ceiling: Math.max(site.star.heat, site.around.heat),
      });
  const year = yearOf(site.orbit, site.around.mass + mass);
  const slow = random.next() < 0.12;
  const spun = () =>
    fluid
      ? HOUR * (mass < BROWN_LEAST ? between(random, 8, 20) : between(random, 2, 10))
      : slow
        ? DAY * decades(random, 1.3, 2.4)
        : HOUR * decades(random, 0.9, 1.8);
  const free = locked ? year : spun();
  const day = site.tied ? year : free;
  return {
    mass,
    radius,
    iron,
    rock,
    ice,
    gas,
    heat: climate.heat,
    coldest: climate.heat,
    hottest: climate.heat,
    glow: fluid ? glowOf(radius, inner) : 0,
    light,
    air: climate.air,
    gases: climate.gases,
    life: 0,
    vigor,
    age: site.star.age,
    orbit: site.orbit,
    stretch: site.stretch,
    year,
    day,
    disks: ringOf(
      mass,
      radius,
      fluid,
      bare,
      SUBMOON_REST * hillOf(site.orbit * (1 - site.stretch), mass, site.around.mass),
      random,
    ),
  };
}

function settled(star: Physics, orbit: number, stretch: number, random: Random): Physics {
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
    coldest: climate.heat,
    hottest: climate.heat,
    glow: 0,
    light: lightAt(star.glow, orbit),
    air: climate.air,
    gases: climate.gases,
    life: 1,
    vigor: between(random, 0.5, 0.9),
    age: star.age,
    orbit,
    stretch,
    year: yearOf(orbit, star.mass),
    day: HOUR * between(random, 18, 30),
    disks: [],
  };
}

function massAt(distance: number, star: Physics, random: Random): number {
  const place = distance / frostOf(star.glow);
  const pick = random.next();
  const giant = () => GIANT_SPAN[0] + GIANT_SPAN[1] * random.next() ** GIANT_SPAN[2];
  const migrated = MIGRATED_SHARE[balanceHeat(star.glow, distance, 0) > MIGRATED_HEAT ? 1 : 0];
  const drawn =
    place < 0.8
      ? pick < migrated
        ? giant()
        : pick < migrated + 0.14
          ? between(random, 0.5, 1)
          : between(random, -1.4, 0.45)
      : place < 3.5
        ? pick < 0.55
          ? giant()
          : pick < 0.8
            ? between(random, 0.9, 1.5)
            : between(random, -1.5, 0.3)
        : pick < 0.45
          ? between(random, 0.9, 1.5)
          : pick < 0.6
            ? between(random, 1.6, 2.3)
            : between(random, -3, -0.7);
  const share = PLANET_MOST * Math.sqrt(star.mass / SUN_MASS);
  const most = Math.log10((share * star.mass) / EARTH_MASS);
  return EARTH_MASS * 10 ** (drawn > most ? most - random.next() : drawn);
}

function moonsOf(
  host: Physics,
  around: Physics,
  star: Physics,
  distance: number,
  lent: number,
  depth: number,
  random: Random,
  turns: Random,
  rare: Random,
): Kin[] {
  const fluid = wrapped(host);
  const earths = host.mass / EARTH_MASS;
  const settledHere = host.life > 0;
  const siteAt = (orbit: number, stretch: number): Site => {
    const warmed = lent + lightAt(glowOf(host.radius, host.heat), orbit);
    return { star, distance, around: host, orbit, lent: warmed, stretch, tied: false };
  };
  const kin = (mass: number, orbit: number, stray: boolean): Kin => {
    const caught = turns.next() < CAUGHT_SHARE && stray && !fluid;
    const stretch = (caught ? CAUGHT_STRETCH : MOON_STRETCH) * turns.next();
    const slant = caught ? Math.PI * turns.next() : null;
    const site = siteAt(orbit, stretch);
    const physics = formed(mass, site, random, true);
    const moons = moonsOf(physics, host, star, distance, site.lent, depth + 1, random, turns, rare);
    return { physics, slant, moons, shared: null, apart: false };
  };
  const sharing = (lead: Kin, mass: number, share: Share): Kin => {
    const site = siteAt(lead.physics.orbit, lead.physics.stretch);
    const { year } = lead.physics;
    const physics = { ...formed(mass, site, rare, true), year, day: year };
    return { physics, slant: lead.slant, moons: [], shared: { ...share, lead }, apart: true };
  };
  const low = Math.max(
    3 * host.radius,
    1.3 * Math.max(0, ...host.disks.map((disk) => disk.outer)),
    1.2 * rocheOf(host.radius, densityOf(host.mass, host.radius), MOON_GRAIN),
  );
  const rest = depth === 0 ? MOON_REST : SUBMOON_REST;
  const high = rest * hillOf(host.orbit * (1 - host.stretch), host.mass, around.mass);
  if (depth >= MOON_DEPTH) {
    return [];
  }
  const moons: Kin[] = [];
  const strays =
    depth > 0 || settledHere
      ? 0
      : fluid
        ? Math.floor(2.5 * random.next() ** 2)
        : random.next() < STRAY_SHARE
          ? 1 + Math.floor(2 * random.next())
          : 0;
  const nearest = Math.max(
    STRAY_NEAR * host.radius,
    1.12 * Math.max(0, ...host.disks.map((disk) => disk.outer)),
  );
  const farthest = Math.min(low / 1.2, high);
  for (let index = 0; index < strays && farthest > 1.1 * nearest; index++) {
    const share = (index + between(random, 0.2, 0.8)) / strays;
    const [least, most] = fluid ? STRAY_FLUID : STRAY_SOLID;
    const mass = Math.min(STRAY_MOST * host.mass, decades(random, least, most));
    moons.push(kin(mass, nearest * (farthest / nearest) ** share, true));
  }
  const ringed = host.disks.some((disk) => disk.depth >= RING_DENSE);
  if (depth === 0 && fluid && ringed && farthest > 1.1 * nearest && rare.next() < CHASE_SHARE) {
    const [least, most] = STRAY_FLUID;
    const heavy = Math.min(STRAY_MOST * host.mass, decades(rare, least, most));
    const light = heavy / (1 + 4 * rare.next());
    const part = (heavy + light) / host.mass;
    const wide = Math.min(
      between(rare, CHASE_WIDE[0], CHASE_WIDE[1]),
      CHASE_MOST / part ** (1 / 6),
    );
    const lane = wide * Math.sqrt((8 * part) / 3);
    const closest = 1 / wide ** 2;
    const orbit = nearest * between(rare, 1.02, 1.15);
    const round = yearOf(orbit, host.mass);
    const chase = ((4 * round) / (3 * lane)) * (1 - closest / Math.PI);
    const site = siteAt(orbit, 0);
    const lead: Kin = {
      physics: formed(heavy, site, rare, true),
      slant: null,
      moons: [],
      shared: null,
      apart: true,
    };
    const share = { ahead: Math.PI, sway: Math.PI - closest, lane, chase };
    moons.push(lead, sharing(lead, light, share));
  }
  if (high <= low && !settledHere) {
    return moons;
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
  for (let index = 0; index < count; index++) {
    if (orbit > high && !(settledHere && index === 0)) {
      break;
    }
    const usual =
      depth > 0
        ? decades(random, -4.5, -2.5)
        : settledHere
          ? decades(random, -2.3, -1.7)
          : fluid
            ? decades(random, -5, -3.7)
            : decades(random, -3.2, -1.8);
    const double = turns.next() < DOUBLE_SHARE && depth === 0 && !fluid && !settledHere;
    const twin = DOUBLE_MASS[0] + DOUBLE_MASS[1] * turns.next() ** 2;
    const moon = kin(host.mass * (double && index === 0 ? twin : usual), orbit, false);
    moons.push(moon);
    if (depth === 0 && fluid && rare.next() < TROJAN_MOONS) {
      const part = moon.physics.mass / host.mass;
      const both = rare.next() < TROJAN_BOTH;
      const side = rare.next() < 0.5 ? 1 : -1;
      for (const ahead of both ? [side, -side] : [side]) {
        const mass = moon.physics.mass * decades(rare, TROJAN_LIGHT[0], TROJAN_LIGHT[1]);
        const sway = between(rare, TROJAN_SWAY[0], TROJAN_SWAY[1]);
        moons.push(sharing(moon, mass, trojan(ahead, sway, part, moon.physics.year)));
      }
    }
    orbit *= between(random, 1.5, 2.3);
  }
  return moons;
}

function trojan(side: number, sway: number, part: number, round: number): Share {
  return {
    ahead: (side * Math.PI) / 3,
    sway,
    lane: sway * Math.sqrt(3 * part),
    chase: round / Math.sqrt((27 * part) / 4),
  };
}

export function reliefOf(physics: Physics, seed: number): Relief {
  if (wrapped(physics)) {
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
    const sun = parent === null || starborn(physics);
    const drawn = (span: number) =>
      sun
        ? HOME_ORBIT * (span / anchor.orbit) ** ORBIT_POWER
        : MOON_REACH * radius[id] * Math.sqrt(span / physics.radius);
    const rings = sun ? [] : physics.disks;
    lanes[id] = rings.map((disk) => ({
      inner: (radius[id] * disk.inner) / physics.radius,
      outer: (radius[id] * disk.outer) / physics.radius,
      year: turn(disk, physics.mass),
    }));
    const own = Math.max(radius[id], ...lanes[id].map((lane) => lane.outer));
    const gap = sun ? PLANET_GAP : MOON_GAP;
    let edge = own * (sun ? STAR_ROOM : CLEARANCE);
    const belts = sun ? physics.disks : [];
    const around = [
      ...bodies
        .filter((child) => child.parent === id && child.shared === null)
        .map((child) => ({ at: child.physics.orbit, child, belt: null })),
      ...belts.map((belt) => ({ at: belt.inner, child: null, belt })),
    ].sort((left, right) => left.at - right.at);
    for (const { child, belt } of around) {
      if (child !== null) {
        const sharers = bodies.filter((other) => other.shared?.with === child.id);
        const span = Math.max(reach(child.id), ...sharers.map((other) => reach(other.id)));
        const oval = child.physics.stretch;
        orbit[child.id] = Math.max(drawn(child.physics.orbit), (edge + span) / (1 - oval));
        for (const other of sharers) {
          orbit[other.id] = orbit[child.id];
        }
        edge = orbit[child.id] * (1 + oval) + span + gap;
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
    const { shared } = body;
    const touch =
      shared === null
        ? 0
        : (radius[body.id] + radius[shared.with]) / Math.max(orbit[body.id], 1e-9);
    return {
      ...body,
      shared:
        shared === null
          ? null
          : {
              ...shared,
              sway: trim(
                Math.max(0, Math.min(shared.sway, Math.abs(shared.ahead) - CHASE_CLEAR * touch)),
              ),
              year: pace(shared.chase, anchor.year, HOME_YEAR),
            },
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
    coldest: trim(physics.coldest),
    hottest: trim(physics.hottest),
    glow: trim(physics.glow),
    light: trim(physics.light),
    air: trim(physics.air),
    gases: physics.gases.map(trim),
    life: physics.life,
    vigor: trim(physics.vigor),
    age: trim(physics.age),
    orbit: trim(physics.orbit),
    stretch: trim(physics.stretch),
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

function likely(mass: number): number {
  const [usual, slope, least, most] = KIN_SHARE;
  return Math.max(least, Math.min(most, usual + slope * Math.log10(mass / SUN_MASS)));
}

function wideOf(physics: Physics): number {
  return physics.orbit * (1 - physics.stretch ** 2) ** 0.25;
}

function accompany(
  star: Star,
  most: number,
  odds: number,
  dice: Random,
  kin: Random,
  fit: ((orbit: number, least: number, most: number, other: Star) => number | null) | null,
): void {
  let chance = odds;
  let within = 0;
  let cast = dice;
  for (;;) {
    const paired = cast.next() < chance;
    const bell = cast.next();
    const ratio = KIN_RATIO + (1 - KIN_RATIO) * cast.next();
    const drawnOut = cast.next();
    const spread = cast.next();
    const leaned = cast.next();
    cast = kin;
    const mass = ratio * star.physics.mass;
    if (!paired || mass < 1.05 * BROWN_LEAST) {
      return;
    }
    const other = kindled(mass, star.physics.age, kin);
    const touching = KIN_NEAR * (star.physics.radius + other.radius);
    const middle = KIN_MIDDLE * (star.physics.mass / SUN_MASS) ** KIN_POWER;
    const stretched = (orbit: number) => {
      const turn = yearOf(orbit, star.weight + mass);
      const round = smooth(Math.log10(KIN_ROUND[0]), Math.log10(KIN_ROUND[1]), Math.log10(turn));
      return KIN_STRETCH * drawnOut ** 1.5 * round;
    };
    const least = (stretch: number) =>
      Math.max(
        touching,
        (NEST_ROOM * nestOf(mass / star.weight, stretch) * within) / (1 - stretch),
      );
    const floor = Math.log10(least(0));
    const ceiling = Math.log10(most);
    if (floor + KIN_SLACK > ceiling) {
      return;
    }
    const gauss = Math.sqrt(-2 * Math.log(Math.max(bell, 1e-12))) * Math.cos(2 * Math.PI * spread);
    const aimed = Math.log10(middle) + KIN_SPREAD * gauss;
    const drawn =
      10 ** (aimed < floor || aimed > ceiling ? floor + (ceiling - floor) * spread : aimed);
    const raised = Math.max(drawn, least(stretched(drawn)));
    const companion: Star = {
      physics: other,
      kin: [],
      slant: 0,
      tilt: null,
      weight: mass,
      glow: other.glow,
    };
    const placed = (orbit: number) => {
      const stretch = stretched(orbit);
      companion.physics = { ...other, orbit, stretch };
      return companion;
    };
    const fitted =
      fit === null ? raised : fit(raised, least(stretched(raised)), most, placed(raised));
    if (fitted === null || fitted > most) {
      return;
    }
    const orbit = fitted;
    const stretch = stretched(orbit);
    const loose = smooth(Math.log10(KIN_LOOSE[0]), Math.log10(KIN_LOOSE[1]), Math.log10(orbit));
    companion.slant = KIN_SLANT * leaned * loose;
    companion.tilt = loose > 0 ? KIN_SLANT * kin.next() * loose : null;
    const room = (orbit * (1 - stretch)) / (NEST_ROOM * nestOf(star.weight / mass, stretch));
    companion.physics = { ...other, orbit, stretch };
    const lesser = (KIN_NEXT * likely(mass) * odds) / likely(star.physics.mass);
    accompany(companion, room, lesser, kin, kin, null);
    const year = yearOf(orbit, star.weight + companion.weight);
    const day = year <= KIN_TIED ? year : other.day;
    companion.physics = { ...other, orbit, stretch, year, day };
    star.kin.push(companion);
    star.weight += companion.weight;
    star.glow += companion.glow;
    within = orbit * (1 + stretch);
    chance *= KIN_NEXT;
  }
}

export function sketchSystem(world: number, plan: Plan): Sketch {
  const random = createRandom(world ^ SYSTEM_SALT);
  const taken = new Set<string>();
  const marks = createRandom(world ^ MARK_SALT);
  const turns = createRandom(world ^ TURN_SALT);
  const kin = createRandom(world ^ KIN_SALT);
  const rare = createRandom(world ^ SHARE_SALT);
  const name = (dice: Random): string => {
    const pick = (list: string[]) => list[Math.floor(dice.next() * list.length)];
    const made = pick(OPENINGS) + pick(MIDDLES) + pick(ENDINGS);
    if (taken.has(made)) {
      return name(dice);
    }
    taken.add(made);
    return made;
  };
  const homeSeed = Math.floor(random.next() * 0x7fffffff);

  const dim = !plan.settled && random.next() < BROWN_SHARE;
  const [least, most] = plan.settled ? SETTLED_STARS : dim ? BROWN_STARS : WILD_STARS;
  const drawn = SUN_MASS * decades(random, Math.log10(least), Math.log10(most));
  const [young, old] = plan.settled ? SETTLED_AGES : WILD_AGES;
  const oldest = Math.min(old * GIGAYEAR, 0.8 * starSpan(plan.star ?? drawn));
  const age = between(random, Math.min(young * GIGAYEAR, 0.5 * oldest), oldest);
  const first = kindled(plan.star ?? drawn, age, random);
  const root: Star = {
    physics: first,
    kin: [],
    slant: 0,
    tilt: 0,
    weight: first.mass,
    glow: first.glow,
  };
  const reachOf = (glow: number) => Math.max(Math.sqrt(glow / SUN_GLOW), DIM_REACH);
  const spans = (star: Star, hold: number): Span[] => {
    const within = { mass: star.physics.mass, glow: star.physics.glow };
    return Array.from({ length: star.kin.length + 1 }, (_, level) => {
      const before = star.kin[level - 1] ?? null;
      const next = star.kin[level] ?? null;
      within.mass += before?.weight ?? 0;
      within.glow += before?.glow ?? 0;
      const centre: Physics =
        before === null ? star.physics : { ...star.physics, mass: within.mass, glow: within.glow };
      const bare = Math.max(
        INNER_EDGE * reachOf(centre.glow),
        STAR_CLEARANCE * star.physics.radius,
      );
      const cleared =
        before === null
          ? 0
          : CLEAR_ROOM *
            clearOf(before.weight / within.mass, before.physics.stretch) *
            before.physics.orbit;
      const outer =
        next === null
          ? hold
          : HOLD_ROOM *
            holdOf(next.weight / (within.mass + next.weight), next.physics.stretch) *
            next.physics.orbit;
      return { centre, inner: Math.max(bare, cleared), outer, before, next };
    });
  };
  const settles = (span: Span) => {
    const here = ASTRONOMICAL_UNIT * reachOf(span.centre.glow);
    return span.inner * HOME_IN <= here && here * HOME_OUT <= span.outer;
  };
  const calmed = { orbit: ASTRONOMICAL_UNIT * reachOf(first.glow), open: true };
  const calm = (orbit: number, low: number, high: number, other: Star): number | null => {
    const { stretch } = other.physics;
    const share = other.weight / (root.weight + other.weight);
    const held = HOLD_ROOM * holdOf(share, stretch);
    const cleared = CLEAR_ROOM * clearOf(share, stretch);
    const beyond = ASTRONOMICAL_UNIT * reachOf(root.glow + other.glow);
    if (held * orbit >= HOME_OUT * calmed.orbit) {
      calmed.open = false;
      return orbit;
    }
    if (calmed.open && cleared * orbit * HOME_IN <= beyond) {
      calmed.orbit = beyond;
      return orbit;
    }
    const far = (HOME_OUT * calmed.orbit) / held;
    if (far <= high) {
      calmed.open = false;
      return far;
    }
    const near = beyond / (HOME_IN * cleared);
    if (calmed.open && near >= low) {
      calmed.orbit = beyond;
      return near;
    }
    return null;
  };
  const edge = KIN_EDGE * Math.sqrt(first.mass / SUN_MASS);
  const odds = likely(first.mass) * (plan.settled ? KIN_SETTLED : 1);
  accompany(root, edge, odds, turns, kin, plan.settled ? calm : null);
  const open = Number.POSITIVE_INFINITY;
  while (plan.settled && !spans(root, open).some(settles)) {
    const gone = root.kin.pop();
    root.weight -= gone?.weight ?? 0;
    root.glow -= gone?.glow ?? 0;
  }
  const homeLevel = Math.max(0, spans(root, open).findIndex(settles));

  const scattered = turns.next() < SCATTERED_SHARE && !plan.settled;
  const kept = scattered ? SCATTERED_KEPT : PLANET_SHARE;
  const drafts: Draft[] = [];
  const beatOf = (planet: Physics, sun: Physics, distance: number): Beat => ({
    sun: lightAt(sun.glow, distance),
    sweep: planet.stretch,
    season: planet.year,
  });
  const adopted = new Map<Kin, number>();
  const adopt = (moon: Kin, parent: number) => {
    const own = drafts.length;
    const { beat } = drafts[parent];
    const { physics, slant, apart } = moon;
    const lead = moon.shared === null ? undefined : adopted.get(moon.shared.lead);
    const shared =
      moon.shared === null || lead === undefined
        ? null
        : {
            ahead: moon.shared.ahead,
            sway: moon.shared.sway,
            lane: moon.shared.lane,
            chase: moon.shared.chase,
            with: lead,
          };
    adopted.set(moon, own);
    drafts.push({ physics, parent, tilt: null, slant, plane: null, beat, shared, apart });
    for (const lesser of moon.moons) {
      adopt(lesser, own);
    }
  };
  const seat: { home: number | null; trojan: boolean } = {
    home: null,
    trojan: rare.next() < TROJAN_PLANETS,
  };

  const lay = (zone: Zone): Disk[] => {
    const star = zone.centre;
    const lit = reachOf(star.glow);
    const nearest = zone.inner;
    const farthest = Math.min(zone.outer, OUTER_EDGE * lit);
    const orbits: number[] = [];
    const rungs: number[] = [];
    const belts: Disk[] = [];
    const closed = zone.outer < Number.POSITIVE_INFINITY && !zone.home;
    if (nearest * (closed ? ZONE_LEAST : 1) >= farthest) {
      return belts;
    }
    const empty = (orbit: number) => {
      if (scattered || orbit * BELT_REACH > zone.outer) {
        return;
      }
      rungs.push(orbit);
      if (random.next() < BELT_SHARE) {
        belts.push(beltOf(orbit, star, random));
      }
    };
    let homeOrbit: number | null = null;
    if (zone.home) {
      const settledAt = (ASTRONOMICAL_UNIT * lit) / Math.sqrt(between(random, 0.95, 1.08));
      homeOrbit = settledAt;
      orbits.push(settledAt);
      let inward = settledAt;
      for (let step = 0; step < INNER_STEPS; step++) {
        inward /= between(random, 1.45, 2);
        if (inward < nearest) {
          break;
        }
        if (random.next() < kept) {
          orbits.unshift(inward);
        } else {
          empty(inward);
        }
      }
      const scorched = nearest * decades(random, 0, 0.6);
      if (random.next() < HOT_SHARE && scorched < 0.5 * Math.min(inward, orbits[0])) {
        orbits.unshift(scorched);
      }
    }
    const span = Math.min(FIRST_SPAN, FIRST_ROOM * Math.log10(farthest / nearest));
    const lowest = nearest * 10 ** (span * random.next() ** FIRST_LEAN);
    let outward = homeOrbit ?? lowest / 1.5;
    for (let step = 0; step < (plan.settled ? OUTER_STEPS : WILD_STEPS); step++) {
      outward *= between(random, 1.5, 2.1);
      if (outward > farthest) {
        break;
      }
      if (random.next() < kept) {
        orbits.push(outward);
      } else {
        empty(outward);
      }
    }
    const pairs = COMPANION_SHARE[plan.settled ? 0 : 1];
    const heaviest = Math.min(0.99 * STAR_LEAST, COMPANION_MOST * star.mass);
    const outermost = Math.max(outward, orbits[orbits.length - 1] ?? 0);
    const brown =
      zone.last && random.next() < pairs && heaviest > BROWN_LEAST
        ? {
            orbit: outermost * between(random, 2.5, 4),
            mass: BROWN_LEAST * (heaviest / BROWN_LEAST) ** random.next(),
          }
        : null;
    if (brown !== null) {
      orbits.push(brown.orbit);
    } else if (zone.last && outward * 1.6 < 1.5 * OUTER_EDGE * lit) {
      empty(outward * between(random, 1.4, 1.8));
    }
    rungs.push(...orbits);
    rungs.sort((left, right) => left - right);
    const tiedWithin =
      TIED_REACH * Math.cbrt(star.mass / SUN_MASS) * (age / (10 * GIGAYEAR)) ** (1 / 6);
    for (const orbit of orbits) {
      const settledHere = orbit === homeOrbit;
      const rung = rungs.indexOf(orbit);
      const inside = rungs[rung - 1] ?? zone.floor;
      const outside = rungs[rung + 1] ?? zone.outer;
      const room =
        ROOM_SHARE *
        Math.min(
          (orbit - inside) / (orbit + inside),
          outside > 1e300 ? 1 : (outside - orbit) / (outside + orbit),
        );
      const stirred = turns.next() < (scattered ? SCATTERED_STIRRED : STIRRED_SHARE);
      const oval = turns.next();
      const tilted = turns.next() < TILTED_SHARE;
      const leaning = turns.next();
      const mass = settledHere
        ? 0
        : orbit === brown?.orbit
          ? brown.mass
          : massAt(orbit, star, random);
      const tied = !settledHere && orbit < tiedWithin * (mass >= TIED_HEAVY[0] ? TIED_HEAVY[1] : 1);
      const wide = stirred
        ? STIRRED_STRETCH[0] + (STIRRED_STRETCH[1] - STIRRED_STRETCH[0]) * oval
        : CALM_STRETCH * oval ** 2.5;
      const stretch = settledHere
        ? HOME_STRETCH * oval
        : Math.max(0, Math.min(room, wide)) * (tied ? 0.1 : 1);
      const slant = settledHere
        ? 0
        : tilted
          ? TILTED_SLANT[0] + (TILTED_SLANT[1] - TILTED_SLANT[0]) * leaning
          : CALM_SLANT * leaning ** 2;
      const distance = orbit * (1 - stretch ** 2) ** 0.25;
      const site = { star, distance, around: star, orbit, lent: zone.lent, stretch, tied };
      const planet = settledHere
        ? settled(star, orbit, stretch, random)
        : formed(mass, site, random);
      const id = drafts.length;
      const steep = !settledHere && random.next() < 0.1;
      const tilt = steep ? between(random, 0.5, 1.75) : MAX_TILT * random.next();
      const beat = beatOf(planet, star, distance);
      drafts.push({
        physics: planet,
        parent: zone.around,
        tilt: tied ? null : tilt,
        slant: zone.plane === "equator" ? null : zone.plane === "system" ? slant : 0,
        plane: typeof zone.plane === "number" ? zone.plane : null,
        beat,
        shared: null,
        apart: false,
      });
      if (settledHere) {
        seat.home = id;
      }
      const moons = moonsOf(planet, star, star, distance, zone.lent, 0, random, turns, rare);
      for (const moon of moons) {
        adopt(moon, id);
      }
      if (seat.trojan && !settledHere && mass >= TROJAN_HOST && planet.year >= TROJAN_SLOW) {
        seat.trojan = false;
        const light = planet.mass * decades(rare, TROJAN_MASS[0], TROJAN_MASS[1]);
        const made = formed(Math.max(TROJAN_LEAST, light), site, rare);
        const other = { ...made, year: planet.year, day: tied ? planet.year : made.day };
        const part = (planet.mass + other.mass) / star.mass;
        const side = rare.next() < 0.5 ? 1 : -1;
        const sway = between(rare, TROJAN_SWAY[0], TROJAN_SWAY[1]);
        drafts.push({
          ...drafts[id],
          physics: other,
          tilt: MAX_TILT * rare.next(),
          beat: beatOf(other, star, distance),
          shared: { ...trojan(side, sway, part, planet.year), with: id },
          apart: true,
        });
      }
    }
    return belts;
  };

  const emit = (star: Star, parent: number | null, hold: number, lent: number): number => {
    const id = drafts.length;
    const { tilt, slant } = star;
    const physics = { ...star.physics, light: lent };
    const alone = { plane: null, beat: null, shared: null, apart: false };
    drafts.push({ physics, parent, tilt, slant, ...alone });
    const belts: Disk[] = [];
    const beyond = (from: number) =>
      star.kin.slice(from).reduce((sum, far) => sum + lightAt(far.glow, wideOf(far.physics)), lent);
    let inside: number | null = null;
    for (const [level, span] of spans(star, hold).entries()) {
      const plane =
        span.before === null || inside === null
          ? parent === null
            ? "system"
            : "equator"
          : span.before.slant === 0
            ? "system"
            : inside;
      belts.push(
        ...lay({
          centre: span.centre,
          around: id,
          inner: span.inner,
          floor: span.before === null ? 0.7 * span.inner : span.inner,
          outer: span.outer,
          lent: beyond(level),
          plane,
          home: plan.settled && parent === null && level === homeLevel,
          last: parent === null && span.next === null,
        }),
      );
      if (span.next !== null) {
        const share = span.next.weight / (span.centre.mass + span.next.weight);
        const { stretch, orbit } = span.next.physics;
        const room = HOLD_ROOM * holdOf(1 - share, stretch) * orbit;
        const given = lightAt(span.centre.glow, wideOf(span.next.physics)) + beyond(level + 1);
        inside = emit(span.next, id, room, given);
      }
    }
    belts.sort((left, right) => left.inner - right.inner);
    drafts[id].physics = { ...drafts[id].physics, disks: belts };
    return id;
  };
  emit(root, null, open, 0);
  const { home } = seat;

  const bodies: Body[] = [];
  for (const [id, draft] of drafts.entries()) {
    const { beat } = draft;
    const [coldest, hottest] =
      beat === null
        ? [draft.physics.heat, draft.physics.heat]
        : swingOf(draft.physics, beat.sun, beat.sweep, beat.season);
    const physics = trimmed({ ...draft.physics, coldest, hottest });
    const marked = draft.apart ? rare : marks;
    const spun = draft.apart ? rare : turns;
    const drawn = Math.floor(marked.next() * 0x7fffffff);
    const own = id === home ? homeSeed : drawn;
    const named = name(marked);
    const lead = draft.shared === null ? null : bodies[draft.shared.with];
    const placed = draft.parent === null || lead !== null ? 0 : trim(2 * Math.PI * marked.next());
    const phase = lead === null ? placed : lead.phase;
    const around = draft.parent === null ? null : bodies[draft.parent];
    const node = 2 * Math.PI * spun.next();
    const apse = 2 * Math.PI * spun.next();
    const swing = 2 * Math.PI * spun.next();
    const level = draft.slant === null && around !== null;
    const flat = lead ?? (draft.plane === null ? null : bodies[draft.plane]);
    const slant = flat !== null ? flat.slant : level ? around.tilt : (draft.slant ?? 0);
    const turned =
      flat !== null ? flat.node : level ? around.swing : around === null || id === home ? 0 : node;
    const shared =
      draft.shared === null
        ? null
        : {
            with: draft.shared.with,
            ahead: trim(draft.shared.ahead),
            sway: trim(draft.shared.sway),
            lane: trim(draft.shared.lane),
            chase: trim(draft.shared.chase),
            year: 1,
            phase: trim(2 * Math.PI * rare.next()),
          };
    bodies.push({
      id,
      name: named,
      seed: own,
      parent: draft.parent,
      physics,
      radius: 0,
      orbit: 0,
      year: 0,
      phase,
      slant: trim(slant),
      node: trim(turned),
      apse: lead !== null ? lead.apse : around === null ? 0 : trim(apse),
      tilt: trim(draft.tilt ?? slant),
      swing: around === null ? 0 : trim(draft.tilt === null ? turned : swing),
      day: 0,
      disks: [],
      relief: id === home ? { ...HOME_SHAPE, sea: null, peak: 0.5 } : reliefOf(physics, own),
      shared,
    });
  }
  const settledOn = home === null ? null : bodies[home].physics;
  const middle = spans(root, open)[homeLevel].centre;
  const light = ASTRONOMICAL_UNIT * reachOf(middle.glow);
  const anchor: Anchor =
    settledOn === null
      ? { radius: EARTH_RADIUS, orbit: light, year: yearOf(light, middle.mass), day: DAY }
      : {
          radius: settledOn.radius,
          orbit: settledOn.orbit,
          year: settledOn.year,
          day: settledOn.day,
        };
  return { home, bodies: arranged(bodies, anchor) };
}

interface Family {
  children: number[];
  shares: number[];
}

interface Tree {
  weights: number[];
  families: Family[];
  sharers: number[][];
  candles: number[];
}

interface Pose {
  shift: number;
  scale: number;
}

export interface Places {
  at: Vector[];
  hub: Vector[];
  centre: Vector[];
}

const trees = new WeakMap<Body[], Tree>();
const moments = new WeakMap<Body[], ({ tick: number; places: Places } | undefined)[]>();

function treeOf(system: Sketch): Tree {
  const known = trees.get(system.bodies);
  if (known !== undefined) {
    return known;
  }
  const kids: number[][] = system.bodies.map(() => []);
  const sharers: number[][] = system.bodies.map(() => []);
  for (const body of system.bodies) {
    if (body.parent !== null) {
      kids[body.parent].push(body.id);
    }
    if (body.shared !== null) {
      sharers[body.shared.with].push(body.id);
    }
  }
  const weights = system.bodies.map(() => 0);
  const weigh = (id: number): number => {
    const retinue = kids[id].reduce((sum, kid) => sum + weigh(kid), 0);
    weights[id] = system.bodies[id].physics.mass + retinue;
    return weights[id];
  };
  for (const body of system.bodies) {
    if (body.parent === null) {
      weigh(body.id);
    }
  }
  const families = system.bodies.map((body) => {
    const children = kids[body.id]
      .filter((kid) => system.bodies[kid].shared === null)
      .sort(
        (left, right) => system.bodies[left].physics.orbit - system.bodies[right].physics.orbit,
      );
    let within = body.physics.mass;
    const shares = children.map((child) => {
      const group = sharers[child].reduce((sum, other) => sum + weights[other], weights[child]);
      within += group;
      return group / within;
    });
    return { children, shares };
  });
  const candles = system.bodies.map(({ physics }) => seenGlow(physics.heat) * physics.radius ** 2);
  const tree = { weights, families, sharers, candles };
  trees.set(system.bodies, tree);
  return tree;
}

export function weightOf(system: Sketch, id: number): number {
  return treeOf(system).weights[id];
}

export function swayOf(system: Sketch, id: number): number {
  const { parent, shared } = system.bodies[id];
  if (parent === null) {
    return 0;
  }
  const { children, shares } = treeOf(system).families[parent];
  return shares[children.indexOf(shared === null ? id : shared.with)];
}

function posesOf(system: Sketch, lead: number, tick: number): Pose[] {
  const { weights, sharers } = treeOf(system);
  const others = sharers[lead];
  if (others.length === 0) {
    return [{ shift: 0, scale: 1 }];
  }
  const whole = others.reduce((sum, id) => sum + weights[id], weights[lead]);
  const steps = others.map((id) => {
    const { ahead, sway, lane, year, phase } = system.bodies[id].shared ?? ALONE;
    const turn = phase + (2 * Math.PI * tick) / year;
    const sharp = sway > Math.PI / 2 ? CHASE_SHARP : 0;
    const blunt = Math.sqrt(1 - (sharp * Math.sin(turn)) ** 2);
    const wave = sharp > 0 ? Math.asin(sharp * Math.sin(turn)) / Math.asin(sharp) : Math.sin(turn);
    const share = weights[id] / whole;
    return { angle: ahead + sway * wave, gap: (-lane * Math.cos(turn)) / blunt, share };
  });
  const back = steps.reduce((sum, step) => sum + step.share * step.angle, 0);
  const down = steps.reduce((sum, step) => sum + step.share * step.gap, 0);
  return [
    { shift: -back, scale: 1 - down },
    ...steps.map((step) => ({ shift: step.angle - back, scale: 1 + step.gap - down })),
  ];
}

export function poseOf(system: Sketch, id: number, tick: number): Pose {
  const { shared } = system.bodies[id];
  const lead = shared === null ? id : shared.with;
  const at = shared === null ? 0 : 1 + treeOf(system).sharers[lead].indexOf(id);
  return posesOf(system, lead, tick)[at];
}

export function lampsOf(system: Sketch, id: number): Lamp[] {
  const { candles } = treeOf(system);
  const wide = ({ physics }: Body) => physics.orbit * (1 - physics.stretch ** 2) ** 0.25;
  const chain = (from: number) => {
    const line = [from];
    for (let up = system.bodies[from].parent; up !== null; up = system.bodies[up].parent) {
      line.push(up);
    }
    return line.reverse();
  };
  const own = chain(id);
  const lamps: Lamp[] = [];
  for (const source of system.bodies) {
    if (source.id === id || candles[source.id] <= 0) {
      continue;
    }
    const other = chain(source.id);
    let fork = 0;
    while (fork < own.length && fork < other.length && own[fork] === other[fork]) {
      fork += 1;
    }
    const reach = Math.max(
      fork < own.length ? wide(system.bodies[own[fork]]) : 0,
      fork < other.length ? wide(system.bodies[other[fork]]) : 0,
    );
    const seen = candles[source.id] / reach ** 2;
    if (seen >= LAMP_LEAST * SKY_LIGHT) {
      lamps.push({ source: source.id, seen, reach });
    }
  }
  return lamps.sort((left, right) => right.seen - left.seen);
}

export function lampsAt(system: Sketch, id: number, tick: number): Lamp[] {
  const here = positionOf(system, id, tick, true);
  return lampsOf(system, id).map(({ source, seen, reach }) => {
    const there = positionOf(system, source, tick, true);
    const apart = Math.hypot(there.x - here.x, there.y - here.y, there.z - here.z);
    return { source, seen: seen * (reach / apart) ** 2, reach: apart };
  });
}

export function courseOf(body: Body, anomaly: number, real = false, scale = 1): Vector {
  const oval = body.physics.stretch;
  const reach = scale * (real ? body.physics.orbit : body.orbit);
  const along = reach * (Math.cos(anomaly) - oval);
  const across = reach * Math.sqrt(1 - oval ** 2) * Math.sin(anomaly);
  const ahead = along * Math.cos(body.apse) - across * Math.sin(body.apse);
  const aside = along * Math.sin(body.apse) + across * Math.cos(body.apse);
  const flat = -aside * Math.cos(body.slant);
  return {
    x: ahead * Math.cos(body.node) + flat * Math.sin(body.node),
    y: aside * Math.sin(body.slant),
    z: flat * Math.cos(body.node) - ahead * Math.sin(body.node),
  };
}

export function anomalyOf(body: Body, tick: number, shift = 0): number {
  const oval = body.physics.stretch;
  const mean = body.phase + (2 * Math.PI * tick) / body.year + shift;
  let anomaly = mean + oval * Math.sin(mean);
  for (let step = 0; step < KEPLER_STEPS; step++) {
    anomaly -= (anomaly - oval * Math.sin(anomaly) - mean) / (1 - oval * Math.cos(anomaly));
  }
  return anomaly;
}

export function placesOf(system: Sketch, tick: number, real = false): Places {
  const kept = moments.get(system.bodies) ?? [];
  const slot = real ? 1 : 0;
  const known = kept[slot];
  if (known !== undefined && known.tick === tick) {
    return known.places;
  }
  const { families, sharers, weights } = treeOf(system);
  const origin = { x: 0, y: 0, z: 0 };
  const places: Places = {
    at: system.bodies.map(() => origin),
    hub: system.bodies.map(() => origin),
    centre: system.bodies.map(() => origin),
  };
  const settle = (id: number, hub: Vector) => {
    const { children, shares } = families[id];
    let within = hub;
    places.hub[id] = hub;
    for (let index = children.length - 1; index >= 0; index--) {
      const lead = children[index];
      const group = [lead, ...sharers[lead]];
      const poses = posesOf(system, lead, tick);
      const reaches = group.map((member, at) => {
        const body = system.bodies[member];
        const { shift, scale } = poses[at];
        return courseOf(body, anomalyOf(body, tick, shift), real, scale);
      });
      const whole = group.reduce((sum, member) => sum + weights[member], 0);
      const pull = shares[index] / whole;
      const inner = reaches.reduce(
        (sum, reach, at) => ({
          x: sum.x - pull * weights[group[at]] * reach.x,
          y: sum.y - pull * weights[group[at]] * reach.y,
          z: sum.z - pull * weights[group[at]] * reach.z,
        }),
        within,
      );
      for (const [at, member] of group.entries()) {
        const reach = reaches[at];
        places.centre[member] = within;
        settle(member, { x: inner.x + reach.x, y: inner.y + reach.y, z: inner.z + reach.z });
      }
      within = inner;
    }
    places.at[id] = within;
  };
  for (const body of system.bodies) {
    if (body.parent === null) {
      settle(body.id, origin);
    }
  }
  kept[slot] = { tick, places };
  moments.set(system.bodies, kept);
  return places;
}

export function centreOf(system: Sketch, id: number, tick: number, real = false): Vector {
  return placesOf(system, tick, real).centre[id];
}

export function hubOf(system: Sketch, id: number, tick: number, real = false): Vector {
  return placesOf(system, tick, real).hub[id];
}

export function positionOf(system: Sketch, id: number, tick: number, real = false): Vector {
  return placesOf(system, tick, real).at[id];
}

export function heatAt(system: Sketch, id: number, tick: number): number {
  const { heat, coldest, hottest } = system.bodies[id].physics;
  let path = system.bodies[id];
  while (path.parent !== null) {
    const host = system.bodies[path.parent];
    if (host.parent === null || starborn(host.physics)) {
      break;
    }
    path = host;
  }
  const oval = path.physics.stretch;
  if (path.parent === null || oval <= 0 || hottest - coldest <= 0) {
    return heat;
  }
  const even = (1 - oval ** 2) ** 0.25;
  const share = (reach: number) => Math.sqrt(even / reach);
  const { shift } = poseOf(system, path.id, tick);
  const now = share(1 - oval * Math.cos(anomalyOf(path, tick, shift)));
  return now >= 1
    ? heat + ((hottest - heat) * (now - 1)) / (share(1 - oval) - 1)
    : heat - ((heat - coldest) * (1 - now)) / (1 - share(1 + oval));
}

export function poleOf(body: Body): Vector {
  const lean = Math.sin(body.tilt);
  return {
    x: lean * Math.sin(body.swing),
    y: Math.cos(body.tilt),
    z: lean * Math.cos(body.swing),
  };
}

export function spinOf(body: Body, tick: number): number {
  return (2 * Math.PI * tick) / body.day;
}
