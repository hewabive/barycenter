import { diskOf, GROWN_MOST, ICE_GRAIN, nebulaOf, ROCK_GRAIN, type Station } from "./disks.ts";
import {
  ASTRONOMICAL_UNIT,
  BROWN_LEAST,
  BURST_LEAST,
  balanceHeat,
  bulgeOf,
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
  gravityOf,
  gripOf,
  HOLE_LEAST,
  HOUR,
  hillOf,
  holdOf,
  innerHeat,
  laplaceOf,
  lifeOf,
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
  starDawn,
  starGlow,
  starHeat,
  starLife,
  starSpan,
  starTurn,
  stocked,
  strippedShare,
  swingOf,
  wrapped,
  YEAR,
  yearOf,
} from "./physics.ts";
import { createRandom, type Random } from "./random.ts";
import { cratersOf, elevationAt, heightOf } from "./relief.ts";
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
  type Survey,
  type Vector,
} from "./types.ts";

export interface Past {
  star: Pick<Physics, "mass" | "glow">;
  distance: number;
  peak: number;
  lent: number;
  young: boolean;
}

export interface Site {
  star: Physics;
  distance: number;
  around: Physics;
  orbit: number;
  lent: number;
  stretch: number;
  tied: boolean;
  past: Past | null;
}

export interface Lamp {
  source: number;
  seen: number;
  reach: number;
}

export interface Plan {
  settled: boolean;
  star: number | null;
  age?: number | null;
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
  lean: number | null;
  beat: Beat | null;
  shared: (Share & { with: number }) | null;
  apart: boolean;
  gone: boolean;
  absent: boolean;
  share: number;
  setting: Setting | null;
  aged: ((age: number) => void) | null;
}

interface Star {
  physics: Physics;
  kin: Star[];
  slant: number;
  tilt: number | null;
  weight: number;
  glow: number;
  vigor: number;
  luck: number;
}

interface Now {
  physics: Physics;
  young: boolean;
  weight: number;
  glow: number;
  swell: number;
  peak: number;
  alone: boolean;
  gone: boolean;
  kin: Now[];
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

interface Ground {
  centre: Physics;
  young: boolean;
  widened: number;
  swallowed: number;
  inner: number;
  outer: number;
  lent: number;
  peak: number;
}

interface Row {
  draft: Draft;
  orbit: number;
  mass: number;
  dwarf: boolean;
}

interface Post {
  id: number;
  zones: Zone[];
  belts: Disk[][];
  rows: Row[][];
}

interface Setting {
  star: Physics;
  distance: number;
  lent: number;
  past: Past | null;
}

interface Lot {
  mass: number;
  vigor: number;
  gas: number;
  damp: number;
  metal: number;
  beyond: boolean;
  luck: number | null;
  vent: number;
  blend: Partial<Record<Gas, number>>;
  weathered: number;
  free: number | null;
  ring: Disk[];
}

interface Kin {
  slant: number | null;
  lean: number | null;
  physics: Physics;
  lot: Lot;
  site: Site;
  moons: Kin[];
  shared: (Share & { lead: Kin }) | null;
  apart: boolean;
}

interface Seat {
  orbit: number;
  far: number;
  mass: number;
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
const SCATTERED_SHARE = 0.2;
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
const FATE_SALT = 0x6a09e667;
const HEAVY_SHARE = 0.04;
const HEAVY_STARS = [2.5, 60];
const HEAVY_AGES = [0.05, 1.6];
const SWOLLEN_SHARE = 0.03;
const SPENT_SHARE = 0.07;
const LATE_STARS = [1, 2.5, 8];
const LATE_AGE = 12;
const SWALLOWED = 1.5;
const SHED_AFTER = 1.001;
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
const ICE_LOST = 200;
const DRIED = 1e-4;
const HELIUM_SHARE = 0.14;
const LOOSE_GRIP = 0.8;
const RING_SHARE_FLUID = 0.45;
const RING_SHARE_SOLID = 0.05;
const RING_HEAT = 1200;
const RING_ICY = 0.5;
const RING_CLEAR = 1.05;
const MOON_FROM = 0.6;
const MOON_CLEAR = 1.45;
const BORN_SHARE = 0.05;
const YOUTH_SALT = 0x3c6ef35f;
const GAS_YEARS = [2e6, 6e6, 0.5];
const GAS_BEARING = 0.01;
const SOLID_YEARS = 3e7;
const DISK_REACH = 1.5;
const YOUNG_SHARE = 0.03;
const YOUNG_AGES = [3e5, 1e8];
const MOON_GRAIN = 2000;
const BELT_SHARE = 0.6;
const MOON_REST = 0.3;
const SUBMOON_REST = 0.33;
const SHARE_REST = 0.05;
const APART = 6;
const ROOMY = [8, 10];
const WEDGE_MOST = 0.75;
const SPREAD_MOST = 3;
const MOONS_APART = 5;
const STEEP_LEAST = 0.68;
const STEEP_TILT = 0.87;
const HOME_MOST = 1.25 * EARTH_MASS;
const PLANET_LEAST = 1e-3 * EARTH_MASS;
const HOLD_STEPS = 24;
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
const FLUID_RELIEF: Relief = {
  frequency: 2,
  warp: 0.7,
  ridge: 0,
  sea: null,
  peak: 0.5,
  height: 0,
  craters: 0,
};

const OPENINGS = ["Ta", "Ke", "Mo", "Vi", "Su", "Ar", "El", "No", "Ri", "Ze", "Ha", "Ol"];
const MIDDLES = ["ra", "li", "no", "ve", "tu", "sha", "mi", "do", ""];
const ENDINGS = ["n", "s", "r", "th", "x", "l", "m", "a", "is", "on"];

const trim = (value: number) => Number(value.toPrecision(5));
const amid = (from: number, to: number, share: number) => from + (to - from) * share;
const between = (random: Random, from: number, to: number) => amid(from, to, random.next());
const decades = (random: Random, from: number, to: number) => 10 ** between(random, from, to);

function smooth(from: number, to: number, value: number): number {
  const share = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return share * share * (3 - 2 * share);
}

function starAt(mass: number, age: number, vigor: number, luck: number): Physics {
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
      day: HOUR * amid(2, 10, luck),
    };
  }
  const life = lifeOf(mass, age);
  const heat = starHeat(life.glow, life.radius);
  return {
    mass: life.mass,
    radius: life.radius,
    ...shares,
    heat,
    coldest: heat,
    hottest: heat,
    glow: life.glow,
    light: 0,
    air: 0,
    gases: [],
    ...rest,
    day: starTurn(mass, age, life, luck),
  };
}

export function kindled(mass: number, age: number, random: Random): Physics {
  return starAt(mass, age, random.next(), random.next());
}

function starOf(mass: number, age: number, random: Random): Star {
  const vigor = random.next();
  const luck = random.next();
  const settled = mass < STAR_LEAST ? age : Math.max(age, starDawn(mass));
  const physics = { ...starAt(mass, settled, vigor, luck), age };
  return {
    physics,
    kin: [],
    slant: 0,
    tilt: null,
    weight: physics.mass,
    glow: physics.glow,
    vigor,
    luck,
  };
}

function burst(born: number, left: number): boolean {
  return born >= BURST_LEAST && born < HOLE_LEAST && left < born;
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

function sharesOf(gas: number, damp: number, metal: number) {
  const ice = (1 - gas) * damp;
  const iron = (1 - gas) * (1 - damp) * metal;
  return { iron, rock: 1 - gas - ice - iron, ice, gas };
}

function framed(
  lot: Pick<Lot, "mass" | "vigor" | "gas" | "damp" | "metal" | "beyond">,
  site: Site,
  fed = 0,
) {
  const { mass, gas } = lot;
  const light = lightAt(site.star.glow, site.distance) + site.lent;
  const lit = 4 * Math.PI * site.distance ** 2 * light;
  const bare = balanceHeat(lit, site.distance, 0);
  const then = site.past ?? {
    distance: site.distance,
    peak: site.star.glow,
    lent: site.lent,
    young: false,
  };
  const brightest =
    4 * Math.PI * then.distance ** 2 * (lightAt(then.peak, then.distance) + then.lent);
  const once = balanceHeat(brightest, then.distance, 0);
  const worst = then.young ? once : Math.max(bare, once);
  const soaked = sharesOf(gas, lot.damp, lot.metal);
  const cold = fed > 0 ? radiusOf(mass, soaked) : 1;
  const falling = fed > 0 ? (gravityOf(mass, cold) * fed) / (Math.PI * cold) : 0;
  const glow = fed > 0 ? 4 * Math.PI * site.distance ** 2 * (light + falling) : lit;
  const inner = innerHeat(mass, site.star.age, lot.vigor);
  const warmth = Math.max(fed > 0 ? balanceHeat(glow, site.distance, 0) : bare, inner);
  const baked =
    lot.beyond &&
    worst > ICE_LOST &&
    gripOf(mass, radiusOf(mass, soaked, warmth), worst, "water") < LOOSE_GRIP;
  const { iron, rock, ice } = baked ? sharesOf(gas, lot.damp * DRIED, lot.metal) : soaked;
  const radius = radiusOf(mass, { iron, rock, ice, gas }, warmth);
  const fluid = wrapped({ mass, radius, gas });
  const grip = (kind: Gas) => gripOf(mass, radius, worst, kind);
  return { light, glow, bare, worst, inner, iron, rock, ice, radius, fluid, grip };
}

function lotOf(mass: number, site: Site, random: Random, locked: boolean): Lot {
  const then = site.past ?? { star: site.star, distance: site.distance, lent: site.lent };
  const lit =
    4 * Math.PI * then.distance ** 2 * (lightAt(then.star.glow, then.distance) + then.lent);
  const young = balanceHeat(lit, then.distance, 0);
  const vigor = random.next();
  const inner = innerHeat(mass, site.star.age, vigor);
  const typical = gasShare(mass);
  const odds = (typical / (1 - typical)) * decades(random, -0.3, 0.3);
  const gathered = odds / (1 + odds);
  const beyond = then.distance > frostOf(lit);
  const damp = beyond
    ? between(random, 0.3, 0.65)
    : decades(random, -5.5, -3.2) * (young > PARCH_HEAT ? 0.01 : 1);
  const metal = random.next() < 0.06 ? between(random, 0.45, 0.7) : between(random, 0.15, 0.38);
  const puffed = radiusOf(mass, sharesOf(gathered, damp, metal), Math.max(young, inner));
  const gas = Math.max(0, gathered - strippedShare(mass, puffed, then.star, then.distance));
  const core = { mass, vigor, gas, damp, metal, beyond };
  const frame = framed(core, site);
  const luck = frame.grip("nitrogen") > 1 ? random.next() : null;
  const vent = decades(random, -2.5, 2);
  const blend: Partial<Record<Gas, number>> = beyond
    ? {
        nitrogen: 1,
        methane: decades(random, -2, -0.7),
        "carbon dioxide": decades(random, -1, 0),
        ammonia: decades(random, -3, -2),
      }
    : { "carbon dioxide": 1, nitrogen: decades(random, -1.7, -1) };
  const weathered = EARTH_AIR * decades(random, -4.2, -2.5);
  const slow = random.next() < 0.12;
  const spun = () =>
    frame.fluid
      ? HOUR * (mass < BROWN_LEAST ? between(random, 8, 20) : between(random, 2, 10))
      : slow
        ? DAY * decades(random, 1.3, 2.4)
        : HOUR * decades(random, 0.9, 1.8);
  const free = locked ? null : spun();
  const hold = SUBMOON_REST * hillOf(site.orbit * (1 - site.stretch), mass, site.around.mass);
  const ring = ringOf(mass, frame.radius, frame.fluid, frame.bare, hold, random);
  return { ...core, luck, vent, blend, weathered, free, ring };
}

function shaped(lot: Lot, site: Site, share = 1, fed = 0): Physics {
  const mass = lot.mass * share;
  const part = share === 1 || lot.gas === 0 ? 1 : Math.min(1, gasShare(mass) / gasShare(lot.mass));
  const gas = lot.gas * part;
  const { light, glow, bare, worst, inner, iron, rock, ice, radius, fluid, grip } = framed(
    { ...lot, mass, gas },
    site,
    fed,
  );
  const ringed = smooth(MOON_FROM, 1, share);
  const earths = mass / EARTH_MASS;
  const held = grip("nitrogen");
  const kept = lot.luck !== null && held > 1 && lot.luck < held - 0.6;
  const outgassed = EARTH_AIR * earths * lot.vent;
  const parts = Object.values(lot.blend).reduce((sum, part) => sum + part, 0);
  const column = columnOf(mass, radius);
  const stock = stocked({
    ...Object.fromEntries(
      Object.entries(lot.blend).map(([kind, part]) => [kind, (outgassed * part) / parts]),
    ),
    water: column * ice,
    hydrogen: column * gas * (1 - HELIUM_SHARE),
    helium: column * gas * HELIUM_SHARE,
  }).map((amount, index) => (grip(GASES[index]) < LOOSE_GRIP ? 0 : amount));
  const frozen = ice > ICY_SHARE && bare < 1.3 * ICE_HEAT;
  const climate: Climate = fluid
    ? envelopeOf(mass, glow, site.distance, inner)
    : climateOf({
        glow,
        distance: site.distance,
        stock: kept ? stock : stock.map(() => 0),
        weathered: lot.weathered,
        pool: column * DAMP_LEAST,
        frozen,
        ceiling: Math.max(site.star.heat, site.around.heat),
      });
  const year = yearOf(site.orbit, site.around.mass + mass);
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
    vigor: lot.vigor,
    age: site.star.age,
    orbit: site.orbit,
    stretch: site.stretch,
    year,
    day: site.tied || lot.free === null ? year : lot.free,
    disks: lot.ring
      .filter((disk) => worst <= (disk.ice > RING_ICY ? ICE_LOST : RING_HEAT))
      .filter((disk) => ringed > 0 && disk.inner >= RING_CLEAR * radius)
      .map((disk) =>
        ringed === 1 ? disk : { ...disk, mass: disk.mass * ringed, depth: disk.depth * ringed },
      ),
  };
}

export function formed(mass: number, site: Site, random: Random, locked = false): Physics {
  return shaped(lotOf(mass, site, random, locked), site);
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
  lying: boolean,
  random: Random,
  turns: Random,
  rare: Random,
): Kin[] {
  const fluid = wrapped(host);
  const earths = host.mass / EARTH_MASS;
  const settledHere = host.life > 0;
  const siteAt = (orbit: number, stretch: number): Site => {
    const warmed = lent + lightAt(glowOf(host.radius, host.heat), orbit);
    return { star, distance, around: host, orbit, lent: warmed, stretch, tied: false, past: null };
  };
  let girth = bulgeOf(host);
  const seats: Seat[] = [];
  const beyond = (orbit: number) =>
    orbit > laplaceOf(girth, host.orbit, host.stretch, host.mass, around.mass);
  const settle = (moon: Kin) => {
    const { mass, orbit, stretch } = moon.physics;
    girth += (0.5 * mass * orbit ** 2) / host.mass;
    seats.push({ orbit, far: orbit * (1 + stretch), mass });
  };
  const wedgeOf = (seat: Seat, mass: number) =>
    (MOONS_APART / 2) * Math.cbrt((seat.mass + mass) / (3 * host.mass));
  const kin = (mass: number, orbit: number, stray: boolean): Kin => {
    const caught = turns.next() < CAUGHT_SHARE && stray && !fluid;
    const stretch = (caught ? CAUGHT_STRETCH : MOON_STRETCH) * turns.next();
    const tip = caught ? Math.PI * turns.next() : null;
    const far = beyond(orbit);
    const site = siteAt(orbit, stretch);
    const lot = lotOf(mass, site, random, true);
    const physics = shaped(lot, site);
    const moons = moonsOf(
      physics,
      host,
      star,
      distance,
      site.lent,
      depth + 1,
      false,
      random,
      turns,
      rare,
    );
    return {
      physics,
      lot,
      site,
      slant: far ? null : tip,
      lean: far ? gentle(tip ?? 0) : null,
      moons,
      shared: null,
      apart: false,
    };
  };
  const sharing = (lead: Kin, mass: number, share: Share): Kin => {
    const site = siteAt(lead.physics.orbit, lead.physics.stretch);
    const { year } = lead.physics;
    const lot = lotOf(mass, site, rare, true);
    const physics = { ...shaped(lot, site), year, day: year };
    return {
      physics,
      lot,
      site,
      slant: lead.slant,
      lean: lead.lean,
      moons: [],
      shared: { ...share, lead },
      apart: true,
    };
  };
  const low = Math.max(
    3 * host.radius,
    1.3 * Math.max(0, ...host.disks.map((disk) => disk.outer)),
    1.2 * rocheOf(host.radius, densityOf(host.mass, host.radius), MOON_GRAIN),
  );
  const hold = hillOf(host.orbit * (1 - host.stretch), host.mass, around.mass);
  const high = depth === 0 ? (MOON_REST * hold) / (1 + MOON_STRETCH) : SUBMOON_REST * hold;
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
  const farthest = Math.min(low / 1.2, (MOON_REST * hold) / (1 + CAUGHT_STRETCH));
  for (let index = 0; index < strays && farthest > 1.1 * nearest; index++) {
    const share = (index + between(random, 0.2, 0.8)) / strays;
    const [least, most] = fluid ? STRAY_FLUID : STRAY_SOLID;
    const mass = Math.min(STRAY_MOST * host.mass, decades(random, least, most));
    const place = nearest * (farthest / nearest) ** share;
    if (lying && beyond(place)) {
      break;
    }
    const moon = kin(mass, place, true);
    const { orbit, stretch } = moon.physics;
    const seat = seats.at(-1);
    if (
      seat === undefined ||
      orbit * (1 - stretch) - seat.far >= wedgeOf(seat, mass) * (seat.orbit + orbit)
    ) {
      moons.push(moon);
      settle(moon);
    }
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
    const lot = lotOf(heavy, site, rare, true);
    const lead: Kin = {
      physics: shaped(lot, site),
      lot,
      site,
      slant: null,
      lean: beyond(orbit) ? 0 : null,
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
    const mass = host.mass * (double && index === 0 ? twin : usual);
    const seat = seats.at(-1);
    if (seat !== undefined) {
      const wedge = wedgeOf(seat, mass);
      const least = (seat.far + wedge * seat.orbit) / (1 - MOON_STRETCH - wedge);
      if (wedge >= 1 - MOON_STRETCH || Math.max(orbit, least) > high) {
        break;
      }
      orbit = Math.max(orbit, least);
    }
    if (lying && beyond(orbit)) {
      break;
    }
    const moon = kin(mass, orbit, false);
    moons.push(moon);
    settle(moon);
    const near = orbit * (1 + moon.physics.stretch) <= SHARE_REST * hold;
    if (depth === 0 && fluid && rare.next() < TROJAN_MOONS && near) {
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

function weightOfKin(kin: Kin): number {
  return kin.moons.reduce((sum, moon) => sum + weightOfKin(moon), kin.physics.mass);
}

function looseOf(share: number, needed: number): number {
  let low = 0;
  let high = 1;
  for (let step = 0; step < HOLD_STEPS; step++) {
    const middle = (low + high) / 2;
    if (holdOf(share, middle) >= needed) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return low;
}

function gentle(tip: number): number {
  const share = STEEP_LEAST / (Math.PI / 2);
  return tip < Math.PI / 2 ? tip * share : Math.PI - (Math.PI - tip) * share;
}

function tipped(
  base: { slant: number; node: number },
  lean: number,
  turn: number,
): { slant: number; node: number } {
  const tilt = Math.sin(base.slant);
  const pole = [tilt * Math.sin(base.node), Math.cos(base.slant), tilt * Math.cos(base.node)];
  const along = [Math.cos(base.node), 0, -Math.sin(base.node)];
  const across = [
    pole[1] * along[2] - pole[2] * along[1],
    pole[2] * along[0] - pole[0] * along[2],
    pole[0] * along[1] - pole[1] * along[0],
  ];
  const [x, y, z] = pole.map(
    (part, axis) =>
      Math.cos(lean) * part +
      Math.sin(lean) * (Math.cos(turn) * along[axis] + Math.sin(turn) * across[axis]),
  );
  return {
    slant: Math.acos(Math.max(-1, Math.min(1, y))),
    node: (Math.atan2(x, z) + 2 * Math.PI) % (2 * Math.PI),
  };
}

function stirOf(physics: Physics): [small: number, lively: number] {
  const small = 1 - smooth(-2, 0, Math.log10(physics.mass / EARTH_MASS));
  return [small, physics.vigor * (1 - small)];
}

export function reliefOf(physics: Physics, seed: number): Relief {
  if (wrapped(physics)) {
    return FLUID_RELIEF;
  }
  const random = createRandom(seed + 71);
  const [small, lively] = stirOf(physics);
  const shape =
    physics.life > 0
      ? HOME_SHAPE
      : physics.ice >= ICY_SHARE
        ? { frequency: 1.6 + 0.4 * random.next(), warp: 0.55, ridge: 0.7 }
        : { frequency: 1.3 + 1.1 * small, warp: 0.25 + 0.3 * lively, ridge: 0.2 + 0.45 * lively };
  const cover = seaCover(physics);
  const dry = {
    ...shape,
    sea: null,
    peak: 0.5,
    height: heightOf(physics, lively),
    craters: cratersOf(physics, lively, seed),
  };
  if (cover === 0) {
    return dry;
  }
  const heights = scatter(SHORE_POINTS, random)
    .map((at) => elevationAt(seed, dry, at))
    .sort((left, right) => left - right);
  const level = (share: number) =>
    heights[Math.min(heights.length - 1, Math.floor(share * heights.length))];
  return { ...dry, sea: level(cover), peak: level(cover + HIGH_SHARE * (1 - cover)) };
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
    const room = sun ? STAR_ROOM : CLEARANCE;
    let edge = own * room;
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
        const wide = Math.max(radius[child.id], ...sharers.map((other) => radius[other.id]));
        const spare = (room - 1) * Math.max(0, wide - own);
        const oval = child.physics.stretch;
        const clear = (edge + span + spare) / (1 - oval);
        orbit[child.id] = Math.max(drawn(child.physics.orbit), clear);
        for (const other of sharers) {
          orbit[other.id] = orbit[child.id];
        }
        edge = orbit[child.id] * (1 + oval) + span + gap + spare;
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

function ranked(given: Body[], home: number | null): { bodies: Body[]; home: number | null } {
  const bodies = [...given];
  const circling = (id: number) => bodies.filter((body) => body.parent === id);
  const suns = (id: number) => circling(id).filter((body) => starborn(body.physics));
  const shine = (id: number): number =>
    suns(id).reduce((sum, body) => sum + shine(body.id), bodies[id].physics.glow);
  const trade = (head: Body, heir: Body) => {
    const reach = heir.physics.orbit;
    const wide = wideOf(heir.physics);
    const beside = suns(head.id).filter((body) => body.physics.orbit < reach);
    const within = beside.reduce((sum, body) => sum + shine(body.id), head.physics.glow);
    const beyond = Math.max(0, heir.physics.light - lightAt(within, wide));
    const lit = beyond + lightAt(shine(heir.id), wide);
    for (const body of circling(head.id)) {
      if (body.id !== heir.id && body.physics.orbit > reach) {
        bodies[body.id] = { ...body, parent: heir.id };
      }
    }
    bodies[heir.id] = {
      ...heir,
      parent: head.parent,
      phase: head.phase,
      slant: head.slant,
      node: head.node,
      apse: head.apse,
      physics: {
        ...heir.physics,
        orbit: head.physics.orbit,
        stretch: head.physics.stretch,
        year: head.physics.year,
        light: head.physics.light,
        disks: [...heir.physics.disks, ...head.physics.disks.filter((disk) => disk.inner > reach)],
      },
    };
    bodies[head.id] = {
      ...head,
      parent: heir.id,
      phase: heir.phase,
      slant: heir.slant,
      node: heir.node,
      apse: trim((heir.apse + Math.PI) % (2 * Math.PI)),
      physics: {
        ...head.physics,
        orbit: reach,
        stretch: heir.physics.stretch,
        year: heir.physics.year,
        light: trim(lit),
        disks: head.physics.disks.filter((disk) => disk.inner <= reach),
      },
    };
  };
  let traded = false;
  const settle = (id: number): number => {
    let top = id;
    for (;;) {
      for (const body of suns(top)) {
        settle(body.id);
      }
      const head = bodies[top];
      const heir = suns(top)
        .filter((body) => body.physics.mass > head.physics.mass)
        .sort((left, right) => right.physics.mass - left.physics.mass)[0];
      if (heir === undefined) {
        return top;
      }
      trade(head, heir);
      traded = true;
      top = heir.id;
    }
  };
  const first = settle(given.findIndex((body) => body.parent === null));
  if (!traded) {
    return { bodies: given, home };
  }
  const order: number[] = [];
  const visit = (id: number) => {
    order.push(id);
    const kids = circling(id).sort(
      (left, right) => left.physics.orbit - right.physics.orbit || left.id - right.id,
    );
    for (const body of kids) {
      visit(body.id);
    }
  };
  visit(first);
  const seats = new Map(order.map((old, seat) => [old, seat]));
  const seated = (old: number) => seats.get(old) ?? 0;
  return {
    bodies: order.map((old, id) => {
      const { parent, shared } = bodies[old];
      return {
        ...bodies[old],
        id,
        parent: parent === null ? null : seated(parent),
        shared: shared === null ? null : { ...shared, with: seated(shared.with) },
      };
    }),
    home: home === null ? null : seated(home),
  };
}

function measured(bodies: Body[], unit: number): Body[] {
  return bodies.map((body) => {
    const { physics, shared } = body;
    return {
      ...body,
      shared: shared === null ? null : { ...shared, year: shared.chase },
      radius: physics.radius / unit,
      orbit: physics.orbit / unit,
      year: body.parent === null ? 0 : physics.year,
      day: physics.day,
      disks: physics.disks.map((disk) => ({
        inner: disk.inner / unit,
        outer: disk.outer / unit,
        year: yearOf((disk.inner + disk.outer) / 2, physics.mass),
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
      gas: trim(disk.gas),
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
    const companion = starOf(mass, star.physics.age, kin);
    const other = companion.physics;
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

function paced(drafts: Draft[]): void {
  const kids: number[][] = drafts.map(() => []);
  for (const [id, draft] of drafts.entries()) {
    if (draft.parent !== null) {
      kids[draft.parent].push(id);
    }
  }
  const weights = drafts.map(() => 0);
  const weigh = (id: number): number => {
    weights[id] = kids[id].reduce((sum, kid) => sum + weigh(kid), drafts[id].physics.mass);
    return weights[id];
  };
  for (const [id, draft] of drafts.entries()) {
    if (draft.parent === null) {
      weigh(id);
    }
  }
  const turn = (id: number, year: number) => {
    const draft = drafts[id];
    const { physics, shared } = draft;
    const rate = year / physics.year;
    draft.physics = { ...physics, year, day: physics.day === physics.year ? year : physics.day };
    draft.shared = shared === null ? null : { ...shared, chase: shared.chase * rate };
  };
  for (const [id, draft] of drafts.entries()) {
    let within = draft.physics.mass;
    const leads = kids[id]
      .filter((kid) => drafts[kid].shared === null)
      .sort((left, right) => drafts[left].physics.orbit - drafts[right].physics.orbit);
    for (const lead of leads) {
      const group = [lead, ...kids[id].filter((kid) => drafts[kid].shared?.with === lead)];
      within += group.reduce((sum, member) => sum + weights[member], 0);
      const year = yearOf(drafts[lead].physics.orbit, within);
      for (const member of group) {
        turn(member, year);
      }
    }
  }
  const seasons = new Set<Beat>();
  for (const { beat, physics } of drafts) {
    if (beat !== null && !seasons.has(beat)) {
      seasons.add(beat);
      beat.season = physics.year;
    }
  }
}

function laid(world: number, plan: Plan): { home: number | null; bodies: Body[]; anchor: Anchor } {
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
  const fate = createRandom(world ^ FATE_SALT);
  const lot = plan.settled || plan.star !== null || dim ? 1 : fate.next();
  const heavy = lot < HEAVY_SHARE;
  const swollen = !heavy && lot < HEAVY_SHARE + SWOLLEN_SHARE;
  const late = HEAVY_SHARE + SWOLLEN_SHARE + SPENT_SHARE;
  const spent = !heavy && !swollen && lot < late;
  const fresh = lot >= late && lot < late + YOUNG_SHARE;
  const [slight, middling, weighty] = LATE_STARS;
  const chosen = fate.next();
  const picked = heavy
    ? HEAVY_STARS[0] * (HEAVY_STARS[1] / HEAVY_STARS[0]) ** (chosen ** 2)
    : swollen
      ? slight * (middling / slight) ** chosen
      : slight * (weighty / slight) ** (chosen ** 1.5);
  const mass = plan.star ?? (heavy || swollen || spent ? SUN_MASS * picked : drawn);
  const oldest = Math.min(old * GIGAYEAR, 0.8 * starSpan(mass));
  const prime = between(random, Math.min(young * GIGAYEAR, 0.5 * oldest), oldest);
  const lived = fate.next();
  const whole = starLife(mass);
  const age =
    plan.age !== undefined && plan.age !== null && !plan.settled
      ? plan.age
      : heavy
        ? whole * (HEAVY_AGES[0] + (HEAVY_AGES[1] - HEAVY_AGES[0]) * lived)
        : swollen
          ? starSpan(mass) + (whole - starSpan(mass)) * lived
          : spent
            ? whole + Math.max(0, LATE_AGE * GIGAYEAR - whole) * lived
            : fresh
              ? YEAR * YOUNG_AGES[0] * (YOUNG_AGES[1] / YOUNG_AGES[0]) ** lived
              : prime;
  const root: Star = { ...starOf(mass, prime, random), tilt: 0 };
  const first = root.physics;
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
  const open = Number.POSITIVE_INFINITY;
  const edge = KIN_EDGE * Math.sqrt(first.mass / SUN_MASS);
  const odds = likely(first.mass) * (plan.settled ? KIN_SETTLED : 1);
  accompany(root, edge, odds, turns, kin, plan.settled ? calm : null);
  while (plan.settled && !spans(root, open).some(settles)) {
    const gone = root.kin.pop();
    root.weight -= gone?.weight ?? 0;
    root.glow -= gone?.glow ?? 0;
  }
  const homeLevel = Math.max(0, spans(root, open).findIndex(settles));

  const scattered = turns.next() < SCATTERED_SHARE && !plan.settled;
  const kept = scattered ? SCATTERED_KEPT : PLANET_SHARE;
  const drafts: Draft[] = [];
  const youth = createRandom(world ^ YOUTH_SALT);
  const airy = YEAR * amid(GAS_YEARS[0], GAS_YEARS[1], youth.next());
  const gasFor = (mass: number) => airy * (mass / SUN_MASS) ** -GAS_YEARS[2];
  const posts = new Map<Star, Post>();
  const grounds = new Map<Zone, Ground>();
  const beatOf = (planet: Physics, sun: Physics, distance: number): Beat => ({
    sun: lightAt(sun.glow, distance),
    sweep: planet.stretch,
    season: planet.year,
  });
  const adopted = new Map<Kin, number>();
  const adopt = (moon: Kin, parent: number) => {
    const own = drafts.length;
    const { physics, slant, lean, apart, lot, site } = moon;
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
    const draft: Draft = {
      physics,
      parent,
      tilt: null,
      slant,
      plane: lean === null ? null : parent,
      lean,
      beat: drafts[parent].beat,
      shared,
      apart,
      gone: false,
      absent: false,
      share: 1,
      setting: { star: site.star, distance: site.distance, lent: site.lent, past: null },
      aged: null,
    };
    draft.aged = (age) => {
      const host = drafts[parent];
      const stand = host.setting;
      const share = smooth(MOON_FROM, 1, host.share);
      const near = site.orbit * (1 - site.stretch);
      const early = share < BORN_SHARE || (moon.shared !== null && age < GROWN_MOST);
      if (stand === null || early || near < MOON_CLEAR * host.physics.radius) {
        draft.absent = true;
        return;
      }
      const warmth = lightAt(glowOf(host.physics.radius, host.physics.heat), site.orbit);
      const past = stand.past === null ? null : { ...stand.past, lent: site.lent };
      const setting = { ...stand, lent: stand.lent + warmth, past };
      const made = shaped(lot, { ...site, ...setting, around: host.physics }, share);
      const beside = lead === undefined ? null : drafts[lead].physics.year;
      draft.physics = beside === null ? made : { ...made, year: beside, day: beside };
      draft.beat = host.beat;
      draft.share = share;
      draft.setting = setting;
    };
    drafts.push(draft);
    for (const lesser of moon.moons) {
      adopt(lesser, own);
    }
  };
  const seat: { home: number | null; trojan: boolean } = {
    home: null,
    trojan: rare.next() < TROJAN_PLANETS,
  };

  const lay = (zone: Zone): { belts: Disk[]; row: Row[] } => {
    const star = zone.centre;
    const lit = reachOf(star.glow);
    const nearest = zone.inner;
    const farthest = Math.min(zone.outer, OUTER_EDGE * lit);
    const orbits: number[] = [];
    const rungs: number[] = [];
    const belts: Disk[] = [];
    const row: Row[] = [];
    const beltRungs: number[] = [];
    const closed = zone.outer < Number.POSITIVE_INFINITY && !zone.home;
    if (nearest * (closed ? ZONE_LEAST : 1) >= farthest || star.glow >= starGlow(BURST_LEAST)) {
      return { belts, row };
    }
    const empty = (orbit: number) => {
      if (scattered || orbit * BELT_REACH > zone.outer) {
        return;
      }
      rungs.push(orbit);
      if (random.next() < BELT_SHARE) {
        belts.push(beltOf(orbit, star, random));
        beltRungs.push(orbit);
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
    const tiedAt = (years: number) =>
      TIED_REACH * Math.cbrt(star.mass / SUN_MASS) * (years / (10 * GIGAYEAR)) ** (1 / 6);
    const tiedWithin = tiedAt(prime);
    const wedgeOf = (apart: number, left: number, right: number, centre = star.mass) =>
      Math.min(WEDGE_MOST, (apart / 2) * Math.cbrt((left + right) / (3 * centre)));
    const lightest = (apart: number, gap: number, reach: number, beside: number) =>
      3 * star.mass * (gap / ((apart / 2) * reach)) ** 3 - beside;
    const loosest = (apart: number, before: Seat, orbit: number, mass: number) =>
      1 - (before.far + wedgeOf(apart, before.mass, mass) * (before.orbit + orbit)) / orbit;
    const seats: Seat[] = [];
    const spreads: { rung: number; spread: number }[] = [];
    let spread = 1;
    const seated = (
      rung: number,
      drawn: number,
      inward: boolean,
      dwarf: boolean,
      roomy: number,
    ) => {
      const before = seats.at(-1);
      let orbit = rung * spread;
      let mass = drawn;
      let most = 1;
      let eased = 1;
      if (before !== undefined && dwarf) {
        const share = mass / (star.mass + mass);
        orbit = Math.max(orbit, before.far / (HOLD_ROOM * holdOf(share, 0)));
        most = looseOf(share, before.far / (HOLD_ROOM * orbit));
        eased = most;
      } else if (before !== undefined) {
        const wedge = wedgeOf(APART, before.mass, mass);
        if (orbit * (1 - wedge) < before.far + wedge * before.orbit) {
          const wider = wedgeOf(roomy, before.mass, mass);
          const clear = (before.far + wider * before.orbit) / (1 - wider);
          const open = !inward && zone.outer === Number.POSITIVE_INFINITY;
          if (open && clear <= SPREAD_MOST * rung) {
            orbit = clear;
          } else {
            mass = lightest(roomy, orbit - before.far, before.orbit + orbit, before.mass);
          }
        }
        most = loosest(APART, before, orbit, mass);
        eased = loosest(roomy, before, orbit, mass);
      }
      if (inward && homeOrbit !== null) {
        const near = homeOrbit * (1 - HOME_STRETCH);
        const reach = orbit + homeOrbit;
        if (lightest(APART, near - orbit, reach, HOME_MOST) < mass) {
          mass = lightest(roomy, near - orbit, reach, HOME_MOST);
        }
        most = Math.min(most, (near - wedgeOf(APART, mass, HOME_MOST) * reach) / orbit - 1);
        eased = Math.min(eased, (near - wedgeOf(roomy, mass, HOME_MOST) * reach) / orbit - 1);
      }
      return mass >= PLANET_LEAST ? { orbit, mass, most, eased } : null;
    };
    for (const rung of orbits) {
      const settledHere = rung === homeOrbit;
      const at = rungs.indexOf(rung);
      const inside = rungs[at - 1] ?? zone.floor;
      const outside = rungs[at + 1] ?? zone.outer;
      const room =
        ROOM_SHARE *
        Math.min(
          (rung - inside) / (rung + inside),
          outside > 1e300 ? 1 : (outside - rung) / (outside + rung),
        );
      const stirred = turns.next() < (scattered ? SCATTERED_STIRRED : STIRRED_SHARE);
      const oval = turns.next();
      const tilted = turns.next() < TILTED_SHARE;
      const leaning = turns.next();
      const drawn = settledHere
        ? 0
        : rung === brown?.orbit
          ? brown.mass
          : massAt(rung, star, random);
      const inward = homeOrbit !== null && rung < homeOrbit;
      const roomy = ROOMY[0] + (ROOMY[1] - ROOMY[0]) * leaning;
      const fit = settledHere
        ? { orbit: rung, mass: 0, most: 1, eased: 1 }
        : seated(rung, drawn, inward, rung === brown?.orbit, roomy);
      if (fit === null) {
        continue;
      }
      const { orbit, mass } = fit;
      if (!settledHere && !inward) {
        spread = orbit / rung;
        spreads.push({ rung, spread });
      }
      const heavy = mass >= TIED_HEAVY[0] ? TIED_HEAVY[1] : 1;
      const tied = !settledHere && orbit < tiedWithin * heavy;
      const wide = stirred
        ? STIRRED_STRETCH[0] + (STIRRED_STRETCH[1] - STIRRED_STRETCH[0]) * oval
        : CALM_STRETCH * oval ** 2.5;
      const eased = (wished: number) =>
        wished <= fit.most ? wished : Math.max(0, Math.min(wished, fit.eased));
      const wished = Math.max(0, Math.min(room, wide));
      const stretch = settledHere ? HOME_STRETCH * oval : eased(wished * (tied ? 0.1 : 1));
      const slant = settledHere
        ? 0
        : tilted
          ? TILTED_SLANT[0] + (TILTED_SLANT[1] - TILTED_SLANT[0]) * leaning
          : CALM_SLANT * leaning ** 2;
      const distance = orbit * (1 - stretch ** 2) ** 0.25;
      const site: Site = {
        star,
        distance,
        around: star,
        orbit,
        lent: zone.lent,
        stretch,
        tied,
        past: null,
      };
      const lot = settledHere ? null : lotOf(mass, site, random, false);
      const planet = lot === null ? settled(star, orbit, stretch, random) : shaped(lot, site);
      const id = drafts.length;
      const steep = !settledHere && random.next() < 0.1;
      const tilt = steep ? between(random, 0.5, 1.75) : MAX_TILT * random.next();
      const draft: Draft = {
        physics: planet,
        parent: zone.around,
        tilt: tied ? null : tilt,
        slant: zone.plane === "equator" ? null : zone.plane === "system" ? slant : 0,
        plane: typeof zone.plane === "number" ? zone.plane : null,
        lean: null,
        beat: beatOf(planet, star, distance),
        shared: null,
        apart: false,
        gone: false,
        absent: false,
        share: 1,
        setting: { star, distance, lent: zone.lent, past: null },
        aged: null,
      };
      const haste = youth.next();
      const airborne = lot !== null && lot.gas >= GAS_BEARING;
      const done = airborne
        ? gasFor(star.mass) * amid(0.5, 1, haste)
        : Math.min(
            GROWN_MOST,
            SOLID_YEARS * YEAR * Math.sqrt(planet.year / YEAR) * amid(0.5, 2, haste),
          );
      let here = site;
      let fed = 0;
      const place = row.length;
      const mine = { draft, orbit, mass: planet.mass, dwarf: rung === brown?.orbit };
      row.push(mine);
      if (lot !== null) {
        draft.aged = (age) => {
          const ground = grounds.get(zone);
          const bound = orbit < tiedAt(age) * heavy;
          const round = bound && !tied ? eased(0.1 * wished) : stretch;
          const reach = orbit * (ground?.widened ?? 1);
          if (
            ground === undefined ||
            orbit * (1 - round) < ground.swallowed ||
            reach < ground.inner ||
            reach > ground.outer
          ) {
            draft.gone = true;
            return;
          }
          const part = Math.min(1, age / done);
          const share = airborne ? part ** 3 : part;
          const clear = ground.young ? STAR_CLEARANCE * ground.centre.radius : 0;
          if (share < BORN_SHARE || orbit * (1 - round) < clear) {
            draft.absent = true;
            return;
          }
          fed = part < 1 ? ((airborne ? 3 * part ** 2 : 1) * lot.mass) / done : 0;
          const centre = ground.centre.mass;
          for (let at = place - 1; at >= 0 && centre !== star.mass; at--) {
            const inner = row[at];
            if (inner.draft.gone) {
              continue;
            }
            const far = inner.orbit * (1 + inner.draft.physics.stretch);
            const wedge = wedgeOf(APART, inner.mass, mine.mass, centre);
            const held = HOLD_ROOM * holdOf(mine.mass / (centre + mine.mass), round) * orbit;
            if (
              mine.dwarf ? far <= held : orbit * (1 - round) >= far + wedge * (inner.orbit + orbit)
            ) {
              break;
            }
            if (inner.mass >= mine.mass) {
              draft.gone = true;
              return;
            }
            inner.draft.gone = true;
          }
          const far = orbit * (1 - round ** 2) ** 0.25 * ground.widened;
          const same =
            ground.widened === 1 && ground.centre.glow === star.glow && ground.lent === zone.lent;
          const { peak, young } = ground;
          const past = same ? null : { star, distance, peak, lent: zone.lent, young };
          const setting = { star: ground.centre, distance: far, lent: ground.lent, past };
          here = { ...setting, around: ground.centre, orbit: reach, stretch: round, tied: bound };
          draft.physics = shaped(lot, here, share, fed);
          draft.share = share;
          draft.tilt = bound ? null : tilt;
          draft.beat = beatOf(draft.physics, ground.centre, far);
          draft.setting = setting;
        };
      }
      drafts.push(draft);
      if (settledHere) {
        seat.home = id;
      }
      const lying = !tied && tilt > STEEP_TILT && tilt < Math.PI - STEEP_TILT;
      const moons = moonsOf(planet, star, star, distance, zone.lent, 0, lying, random, turns, rare);
      for (const moon of moons) {
        adopt(moon, id);
      }
      const retinue = moons.reduce((sum, moon) => sum + weightOfKin(moon), planet.mass);
      mine.mass = retinue;
      seats.push({ orbit, far: orbit * (1 + stretch), mass: retinue });
      if (seat.trojan && !settledHere && mass >= TROJAN_HOST && planet.year >= TROJAN_SLOW) {
        seat.trojan = false;
        const light = planet.mass * decades(rare, TROJAN_MASS[0], TROJAN_MASS[1]);
        const twin = lotOf(Math.max(TROJAN_LEAST, light), site, rare, false);
        const made = shaped(twin, site);
        const other = { ...made, year: planet.year, day: tied ? planet.year : made.day };
        const part = (planet.mass + other.mass) / star.mass;
        const side = rare.next() < 0.5 ? 1 : -1;
        const sway = between(rare, TROJAN_SWAY[0], TROJAN_SWAY[1]);
        const sharer: Draft = {
          ...draft,
          physics: other,
          tilt: MAX_TILT * rare.next(),
          beat: beatOf(other, star, distance),
          shared: { ...trojan(side, sway, part, planet.year), with: id },
          apart: true,
        };
        sharer.aged = (age) => {
          sharer.absent = age < GROWN_MOST;
          const fresh = shaped(twin, here);
          const { year } = draft.physics;
          sharer.physics = { ...fresh, year, day: here.tied ? year : fresh.day };
          sharer.beat = beatOf(sharer.physics, here.star, here.distance);
          sharer.setting = draft.setting;
        };
        drafts.push(sharer);
        mine.mass = retinue + other.mass;
        seats.push({ orbit, far: orbit * (1 + stretch), mass: retinue + other.mass });
      }
    }
    const stayed = belts.flatMap((belt, at) => {
      const wider = spreads.findLast((moved) => moved.rung < beltRungs[at])?.spread ?? 1;
      return wider === 1
        ? [belt]
        : belt.outer * wider > zone.outer
          ? []
          : [diskOf(belt.inner * wider, belt.outer * wider, belt.ice, { mass: belt.mass })];
    });
    return { belts: stayed, row };
  };

  const emit = (star: Star, parent: number | null, hold: number, lent: number): number => {
    const id = drafts.length;
    const { tilt, slant } = star;
    const physics = { ...star.physics, light: lent };
    const alone = { plane: null, lean: null, beat: null, shared: null, apart: false };
    const there = { gone: false, absent: false, share: 1, setting: null, aged: null };
    drafts.push({ physics, parent, tilt, slant, ...alone, ...there });
    const post: Post = { id, zones: [], belts: [], rows: [] };
    posts.set(star, post);
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
      const zone: Zone = {
        centre: span.centre,
        around: id,
        inner: span.inner,
        floor: span.before === null ? 0.7 * span.inner : span.inner,
        outer: span.outer,
        lent: beyond(level),
        plane,
        home: plan.settled && parent === null && level === homeLevel,
        last: parent === null && span.next === null,
      };
      const { belts, row } = lay(zone);
      post.zones.push(zone);
      post.belts.push(belts);
      post.rows.push(row);
      if (span.next !== null) {
        const share = span.next.weight / (span.centre.mass + span.next.weight);
        const { stretch, orbit } = span.next.physics;
        const room = HOLD_ROOM * holdOf(1 - share, stretch) * orbit;
        const given = lightAt(span.centre.glow, wideOf(span.next.physics)) + beyond(level + 1);
        inside = emit(span.next, id, room, given);
      }
    }
    const belts = post.belts.flat().sort((left, right) => left.inner - right.inner);
    drafts[id].physics = { ...drafts[id].physics, disks: belts };
    return id;
  };
  emit(root, null, open, 0);

  const lost = new Set<Star>();
  const nowOf = (star: Star, age: number): Now => {
    const born = star.physics.mass;
    const life = born < STAR_LEAST ? null : lifeOf(born, age);
    const shone = starAt(born, age, star.vigor, star.luck);
    const { orbit, stretch, year } = star.physics;
    const now: Now = {
      physics: { ...shone, orbit, stretch, year },
      young: born >= STAR_LEAST && age < starDawn(born),
      weight: shone.mass,
      glow: shone.glow,
      swell: life?.swell ?? shone.radius,
      peak: life?.peak ?? shone.glow,
      alone: burst(born, shone.mass),
      gone: false,
      kin: [],
    };
    let heft = born;
    let once = 0;
    let within = 0;
    for (const companion of star.kin) {
      const other = nowOf(companion, age);
      now.kin.push(other);
      const first = companion.physics.orbit;
      const oval = companion.physics.stretch;
      const own = other.physics.mass;
      const placed = () => first * ((heft + companion.weight) / (now.weight + other.weight));
      let reach = placed();
      for (let last = other.kin.length - 1; last >= 0; last--) {
        const far = other.kin[last];
        const room = (reach * (1 - oval)) / (NEST_ROOM * nestOf(now.weight / own, oval));
        if (far.gone) {
          continue;
        }
        if (far.physics.orbit <= room) {
          break;
        }
        far.gone = true;
        lost.add(companion.kin[last]);
        other.weight -= far.weight;
        other.glow -= far.glow;
        reach = placed();
      }
      const nested = (near: number, share: number, inside: number) =>
        inside > 0 ? near / (nestOf(share, oval) * inside) : Number.POSITIVE_INFINITY;
      const before = nested(first * (1 - oval), companion.physics.mass / heft, once);
      const after = nested(reach * (1 - oval), own / now.weight, within);
      const near = first * (1 - oval);
      heft += companion.weight;
      once = first * (1 + oval);
      const taken =
        lost.has(companion) ||
        now.alone ||
        burst(companion.physics.mass, own) ||
        near < SWALLOWED * (now.swell + other.swell) ||
        after < Math.min(NEST_ROOM, before);
      other.gone = taken || near < SWALLOWED * (now.physics.radius + other.physics.radius);
      if (taken) {
        lost.add(companion);
      }
      if (other.gone) {
        continue;
      }
      const round = yearOf(reach, now.weight + other.weight);
      const day = round <= KIN_TIED ? round : other.physics.day;
      other.physics = { ...other.physics, orbit: reach, year: round, day };
      now.weight += other.weight;
      now.glow += other.glow;
      within = reach * (1 + oval);
    }
    return now;
  };
  const zoned = (star: Star, now: Now, hold: number, lent: number): void => {
    const post = posts.get(star);
    if (post === undefined) {
      return;
    }
    const beyond = (from: number) =>
      now.kin
        .slice(from)
        .reduce(
          (sum, far) => (far.gone ? sum : sum + lightAt(far.glow, wideOf(far.physics))),
          lent,
        );
    const within = { mass: now.physics.mass, glow: now.physics.glow };
    let before: Now | null = null;
    for (const [level, zone] of post.zones.entries()) {
      const passed = now.kin[level - 1] ?? null;
      if (passed !== null && !passed.gone) {
        within.mass += passed.weight;
        within.glow += passed.glow;
        before = passed;
      }
      const next = now.kin.slice(level).find((far) => !far.gone) ?? null;
      const centre: Physics =
        before === null ? now.physics : { ...now.physics, mass: within.mass, glow: within.glow };
      const widened = zone.centre.mass / within.mass;
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
      const swallowed = now.alone ? Number.POSITIVE_INFINITY : SWALLOWED * now.swell;
      grounds.set(zone, {
        centre,
        young: now.young,
        widened,
        swallowed,
        inner: cleared,
        outer,
        lent: beyond(level),
        peak: now.peak + within.glow - now.physics.glow,
      });
      const far = now.kin[level] ?? null;
      const left = far === null ? undefined : posts.get(star.kin[level]);
      if (far?.gone && left !== undefined) {
        drafts[left.id].absent = true;
      } else if (far !== null && !far.gone) {
        const share = far.weight / (centre.mass + far.weight);
        const room = HOLD_ROOM * holdOf(1 - share, far.physics.stretch) * far.physics.orbit;
        const given = lightAt(centre.glow, wideOf(far.physics)) + beyond(level + 1);
        zoned(star.kin[level], far, room, given);
      }
    }
    drafts[post.id].physics = { ...now.physics, light: lent, disks: [] };
  };
  const strewn = (post: Post, age: number): Disk[] =>
    post.zones
      .flatMap((zone, level) => {
        const ground = grounds.get(zone);
        if (ground === undefined) {
          return [];
        }
        const { swallowed, widened, outer } = ground;
        if (age >= GROWN_MOST) {
          return post.belts[level]
            .filter((belt) => belt.inner >= swallowed && belt.outer * widened <= outer)
            .map((belt) =>
              widened === 1
                ? belt
                : diskOf(belt.inner * widened, belt.outer * widened, belt.ice, { mass: belt.mass }),
            );
        }
        const lit = reachOf(zone.centre.glow);
        const bare = zone.centre.glow >= starGlow(BURST_LEAST) || zone.outer <= zone.inner;
        const stations: Station[] = [
          ...post.rows[level]
            .filter(({ draft }) => !draft.gone)
            .map(({ draft, orbit }) => ({
              orbit,
              share: draft.absent ? 0 : draft.share,
              mass: draft.physics.mass,
              belt: null,
            })),
          ...post.belts[level].map((belt) => ({
            orbit: Math.sqrt(belt.inner * belt.outer),
            share: 0,
            mass: 0,
            belt,
          })),
        ];
        const cloud = {
          inner: Math.max(zone.inner, ground.young ? STAR_CLEARANCE * ground.centre.radius : 0),
          outer: Math.min(zone.outer, DISK_REACH * OUTER_EDGE * lit),
          reach: DISK_REACH * OUTER_EDGE * lit,
          centre: zone.centre.mass,
          frost: frostOf(zone.centre.glow),
          age,
          airy: gasFor(zone.centre.mass),
          stations,
        };
        return (bare ? [] : nebulaOf(cloud))
          .filter((disk) => disk.outer > swallowed && disk.inner * widened < outer)
          .map((disk) => ({
            ...disk,
            inner: Math.max(disk.inner, swallowed) * widened,
            outer: Math.min(disk.outer * widened, outer),
          }));
      })
      .sort((left, right) => left.inner - right.inner);
  const ends = [...posts.keys()]
    .map((star) => SHED_AFTER * starLife(star.physics.mass))
    .filter((end) => end < age)
    .sort((left, right) => left - right);
  for (const moment of plan.settled ? [] : [...ends, age]) {
    for (const draft of drafts) {
      draft.absent = false;
      draft.share = 1;
    }
    zoned(root, nowOf(root, moment), open, 0);
    const left = (id: number | null) => id !== null && drafts[id].gone;
    const away = (id: number | null) => id !== null && drafts[id].absent;
    for (const draft of drafts) {
      if (left(draft.parent) || left(draft.shared?.with ?? null)) {
        draft.gone = true;
      } else if (away(draft.parent) || away(draft.shared?.with ?? null)) {
        draft.absent = true;
      } else if (!draft.gone && !draft.absent) {
        draft.aged?.(moment);
      }
    }
    for (const draft of drafts) {
      draft.gone ||= left(draft.parent) || left(draft.shared?.with ?? null);
    }
    for (const post of posts.values()) {
      const draft = drafts[post.id];
      draft.physics = { ...draft.physics, disks: strewn(post, moment) };
    }
  }
  let count = 0;
  const seats = drafts.map((draft) => (draft.gone || draft.absent ? -1 : count++));
  const moved = (id: number | null) => (id === null ? null : seats[id]);
  const present = drafts
    .filter((draft) => !draft.gone && !draft.absent)
    .map((draft) => ({
      ...draft,
      parent: moved(draft.parent),
      shared: draft.shared === null ? null : { ...draft.shared, with: seats[draft.shared.with] },
    }));
  paced(present);
  const home = moved(seat.home);

  const bodies: Body[] = [];
  const lies: Pick<Body, "phase" | "slant" | "node" | "apse" | "tilt" | "swing">[] = [];
  for (const [at, draft] of drafts.entries()) {
    const marked = draft.apart ? rare : marks;
    const spun = draft.apart ? rare : turns;
    const drawn = Math.floor(marked.next() * 0x7fffffff);
    const own = at === seat.home ? homeSeed : drawn;
    const named = name(marked);
    const lead = draft.shared === null ? null : lies[draft.shared.with];
    const placed = draft.parent === null || lead !== null ? 0 : trim(2 * Math.PI * marked.next());
    const around = draft.parent === null ? null : lies[draft.parent];
    const node = 2 * Math.PI * spun.next();
    const apse = 2 * Math.PI * spun.next();
    const swing = 2 * Math.PI * spun.next();
    const level = draft.slant === null && around !== null;
    const flat = lead ?? (draft.plane === null ? null : lies[draft.plane]);
    const askew =
      lead === null && flat !== null && draft.lean !== null && draft.lean > 0
        ? tipped(flat, draft.lean, node)
        : null;
    const slant =
      askew !== null
        ? askew.slant
        : flat !== null
          ? flat.slant
          : level
            ? around.tilt
            : (draft.slant ?? 0);
    const turned =
      askew !== null
        ? askew.node
        : flat !== null
          ? flat.node
          : level
            ? around.swing
            : around === null || at === seat.home
              ? 0
              : node;
    const beside = draft.shared === null ? null : trim(2 * Math.PI * rare.next());
    const lie = {
      phase: lead === null ? placed : lead.phase,
      slant: trim(slant),
      node: trim(turned),
      apse: lead !== null ? lead.apse : around === null ? 0 : trim(apse),
      tilt: trim(draft.tilt ?? slant),
      swing: around === null ? 0 : trim(draft.tilt === null ? turned : swing),
    };
    lies.push(lie);
    if (draft.gone || draft.absent) {
      continue;
    }
    const live = present[seats[at]];
    const { beat, shared } = live;
    const [coldest, hottest] =
      beat === null
        ? [live.physics.heat, live.physics.heat]
        : swingOf(live.physics, beat.sun, beat.sweep, beat.season);
    const physics = trimmed({ ...live.physics, coldest, hottest });
    bodies.push({
      id: seats[at],
      name: named,
      seed: own,
      parent: live.parent,
      physics,
      radius: 0,
      orbit: 0,
      year: 0,
      ...lie,
      day: 0,
      disks: [],
      relief:
        at === seat.home
          ? {
              ...HOME_SHAPE,
              sea: null,
              peak: 0.5,
              height: heightOf(physics, stirOf(physics)[1]),
              craters: 0,
            }
          : reliefOf(physics, own),
      shared:
        shared === null || beside === null
          ? null
          : {
              with: shared.with,
              ahead: trim(shared.ahead),
              sway: trim(shared.sway),
              lane: trim(shared.lane),
              chase: trim(shared.chase),
              year: 1,
              phase: beside,
            },
    });
  }
  const settledOn = home === null ? null : bodies[home].physics;
  const born = spans(root, open)[homeLevel].centre;
  const rooted = posts.get(root);
  const ground = rooted === undefined ? undefined : grounds.get(rooted.zones[homeLevel]);
  const middle = ground?.centre ?? born;
  const light = ASTRONOMICAL_UNIT * reachOf(born.glow) * (ground?.widened ?? 1);
  const anchor: Anchor =
    settledOn === null
      ? { radius: EARTH_RADIUS, orbit: light, year: yearOf(light, middle.mass), day: DAY }
      : {
          radius: settledOn.radius,
          orbit: settledOn.orbit,
          year: settledOn.year,
          day: settledOn.day,
        };
  return { ...ranked(bodies, home), anchor };
}

export function sketchSystem(world: number, plan: Plan): Sketch {
  const { home, bodies, anchor } = laid(world, plan);
  return { home, bodies: arranged(bodies, anchor) };
}

export function surveySystem(world: number, plan: Plan): Survey {
  const { home, bodies, anchor } = laid(world, plan);
  return { home, bodies: measured(bodies, anchor.radius), unit: anchor.radius };
}

interface Family {
  children: number[];
  shares: number[];
}

export interface Tree {
  weights: number[];
  families: Family[];
  sharers: number[][];
  candles: number[];
}

export interface Pose {
  shift: number;
  scale: number;
  drift: number;
  swell: number;
}

export interface Places {
  at: Vector[];
  hub: Vector[];
  centre: Vector[];
}

const trees = new WeakMap<Body[], Tree>();
const moments = new WeakMap<Body[], ({ tick: number; places: Places } | undefined)[]>();

export function treeOf(system: Sketch): Tree {
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

export function posesOf(system: Sketch, lead: number, tick: number): Pose[] {
  const { weights, sharers } = treeOf(system);
  const others = sharers[lead];
  if (others.length === 0) {
    return [{ shift: 0, scale: 1, drift: 0, swell: 0 }];
  }
  const whole = others.reduce((sum, id) => sum + weights[id], weights[lead]);
  const steps = others.map((id) => {
    const { ahead, sway, lane, year, phase } = system.bodies[id].shared ?? ALONE;
    const turn = phase + (2 * Math.PI * tick) / year;
    const pace = (2 * Math.PI) / year;
    const sine = Math.sin(turn);
    const cosine = Math.cos(turn);
    const sharp = sway > Math.PI / 2 ? CHASE_SHARP : 0;
    const blunt = Math.sqrt(1 - (sharp * sine) ** 2);
    const wave = sharp > 0 ? Math.asin(sharp * sine) / Math.asin(sharp) : sine;
    const surge = sharp > 0 ? (sharp * cosine) / (blunt * Math.asin(sharp)) : cosine;
    const share = weights[id] / whole;
    return {
      angle: ahead + sway * wave,
      gap: (-lane * cosine) / blunt,
      turning: sway * surge * pace,
      parting: (lane * sine * pace * (1 - sharp ** 2)) / blunt ** 3,
      share,
    };
  });
  const back = steps.reduce((sum, step) => sum + step.share * step.angle, 0);
  const down = steps.reduce((sum, step) => sum + step.share * step.gap, 0);
  const round = steps.reduce((sum, step) => sum + step.share * step.turning, 0);
  const sink = steps.reduce((sum, step) => sum + step.share * step.parting, 0);
  return [
    { shift: -back, scale: 1 - down, drift: -round, swell: -sink },
    ...steps.map((step) => ({
      shift: step.angle - back,
      scale: 1 + step.gap - down,
      drift: step.turning - round,
      swell: step.parting - sink,
    })),
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
