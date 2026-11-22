import {
  ASTRONOMICAL_UNIT,
  BOLTZMANN,
  DALTON,
  EARTH_MASS,
  frostOf,
  GRAVITY,
  hillOf,
  SUN_GLOW,
  SUN_MASS,
  YEAR,
  yearOf,
} from "./physics.ts";
import type { Disk } from "./types.ts";

export const ROCK_GRAIN = 3000;
export const ICE_GRAIN = 900;
export const RUBBLE = 1;
export const GROWN_MOST = 1e8 * YEAR;
export const RING_DEEP = 10;
export const SOLID_YEARS = 3e7;

const DUST = 1e-5;
const WORN = 200;
const FALL = 1.5;
const FADE = [0.75, 4];
const SKIN = 1e-6;
const RIM = 0.07 * ASTRONOMICAL_UNIT;
const RIDGE = [10, 2];
const RESONANCES = [
  [4, 1],
  [3, 1],
  [5, 2],
  [7, 3],
  [2, 1],
];
const CLEARED = [0.015, 1e-3, 0.003];
const SUM_STEPS = 16;
const SOLID_SIGMA = 70;
const ICE_BOOST = 4;
const ICE_FAR = 0.6;
const ICE_NEAR = 0.05;
const GAS_SHARE = 0.02;
const GAS_THINNED = 0.9;
const HOLE_FROM = 0.8;
const GAP_HILL = 4;
const DISK_LEAST = 1e-6 * EARTH_MASS;
const JOINED = 1.01;
const FROST_HEAT = 170;
const GAS_WEIGHT = 2.34;
const TURBULENCE = 3e-4;
const FLARE = 0.25;
const STIRRED = 2;
const STIRRED_MOST = 0.3;
const DUST_STANDS = 0.04;
const GAP_DEPTH = 0.04;
const SPREAD = 0.0425;

export interface Station {
  orbit: number;
  share: number;
  mass: number;
  belt: Disk | null;
}

export interface Cloud {
  inner: number;
  outer: number;
  reach: number;
  centre: number;
  frost: number;
  age: number;
  airy: number;
  stations: Station[];
}

interface Piece {
  inner: number;
  outer: number;
  mass: number;
  ice: number;
}

export interface Ridge {
  at: number;
  rise: number;
}

export interface Cleared {
  at: number;
  wide: number;
}

const means = new WeakMap<Disk, number>();

function faded(at: number, fade: number): number {
  return fade > 0 ? Math.exp(-((at / fade) ** FADE[1])) : 1;
}

function summed(from: number, to: number, fade: number): number {
  const low = Math.sqrt(from);
  const step = (Math.sqrt(to) - low) / SUM_STEPS;
  let sum = 0;
  for (let index = 0; index <= SUM_STEPS; index++) {
    const reach = (low + index * step) ** 2;
    const weight = index === 0 || index === SUM_STEPS ? 1 : index % 2 === 1 ? 4 : 2;
    sum += weight * faded(reach, fade);
  }
  return (2 * step * sum) / 3;
}

export function depthAt(disk: Disk, at: number): number {
  const { inner, outer, depth, fade } = disk;
  const reach = Math.min(outer, Math.max(inner, at));
  const mean = means.get(disk) ?? (2 * summed(inner, outer, fade)) / (outer ** 2 - inner ** 2);
  means.set(disk, mean);
  return (depth * reach ** -FALL * faded(reach, fade)) / mean;
}

export function wearOf(at: number, centre: number, age: number): number {
  return age / (WORN * yearOf(at, centre));
}

export function diskOf(
  inner: number,
  outer: number,
  ice: number,
  given: Partial<Disk> & { stirred?: number; wear?: number },
  size = RUBBLE,
): Disk {
  const area = Math.PI * (outer ** 2 - inner ** 2);
  const grain = ROCK_GRAIN - (ROCK_GRAIN - ICE_GRAIN) * ice;
  const laden = (4 * grain * size) / 3;
  const mass = given.mass ?? (given.depth ?? 0) * area * laden;
  const fresh = given.depth ?? mass / (area * laden);
  const depth = fresh > 0 ? 1 / (1 / fresh + (given.wear ?? 0)) : 0;
  const packed = (RING_DEEP * size) / Math.sqrt(inner * outer);
  const loose = given.stirred ?? 0;
  return {
    inner,
    outer,
    mass,
    depth,
    ice,
    gas: given.gas ?? 0,
    grain: depth > 0 ? (size * fresh) / depth : size,
    height: given.height ?? Math.max(packed, loose),
    flare: given.flare ?? (packed > loose ? -1 : 0),
    fade: given.fade ?? 0,
    since: given.since ?? 0,
    lasts: given.lasts ?? 0,
  };
}

export function spreadOf(mass: number, centre: number, year: number): number {
  return SPREAD * (centre / mass) ** 2 * year;
}

export function leftOf(
  mass: number,
  centre: number,
  year: number,
  wear: number,
  since: number,
): number {
  if (since < 0 || mass <= 0) {
    return 0;
  }
  const worn = wear / spreadOf(mass, centre, year);
  return mass / Math.sqrt((1 + worn) * Math.exp(Math.min(700, (2 * since) / wear)) - worn);
}

export function rimOf(glow: number): number {
  return RIM * Math.sqrt(glow / SUN_GLOW);
}

export function gasHeight(orbit: number, centre: number, frost: number): number {
  const heat = FROST_HEAT * Math.sqrt(frost / orbit);
  const sound = Math.sqrt((BOLTZMANN * heat) / (GAS_WEIGHT * DALTON));
  return sound / Math.sqrt((GRAVITY * centre) / orbit);
}

export function stirredHeight(heaviest: number, centre: number, grown = 1): number {
  const hill = Math.cbrt(heaviest / (3 * centre));
  const stirred = Math.min(STIRRED_MOST, Math.max(DUST_STANDS, STIRRED * hill));
  return DUST_STANDS + (stirred - DUST_STANDS) * grown;
}

export function thinningOf(mass: number, orbit: number, centre: number, glow: number): number {
  const height = gasHeight(orbit, centre, frostOf(glow));
  return 1 / (1 + (GAP_DEPTH * (mass / centre) ** 2) / (height ** 5 * TURBULENCE));
}

export function ridgeOf(mass: number, orbit: number, centre: number, glow: number): Ridge {
  return {
    at: orbit + RIDGE[0] * hillOf(orbit, mass, centre),
    rise: RIDGE[1] * (1 - thinningOf(mass, orbit, centre, glow)),
  };
}

export function clearedBy(
  disk: Pick<Disk, "inner" | "outer">,
  planets: { mass: number; orbit: number }[],
  centre: number,
): Cleared[] {
  return planets
    .filter((planet) => planet.orbit > disk.outer)
    .flatMap(({ mass, orbit }) => {
      const wide = CLEARED[0] * Math.sqrt(mass / centre / CLEARED[1]);
      return wide < CLEARED[2]
        ? []
        : RESONANCES.map(([inside, outside]) => ({
            at: orbit * (outside / inside) ** (2 / 3),
            wide,
          }));
    })
    .filter(({ at }) => at > disk.inner && at < disk.outer);
}

export function holeOf(cloud: Pick<Cloud, "inner" | "outer" | "age" | "airy">): number {
  const { inner, outer, age, airy } = cloud;
  const opened = Math.max(0, Math.min(1, (age / airy - HOLE_FROM) / (1 - HOLE_FROM)));
  return inner * (outer / inner) ** opened;
}

export function nebulaOf(cloud: Cloud): Disk[] {
  const { inner, outer, reach, centre, frost, age, airy } = cloud;
  if (outer <= inner) {
    return [];
  }
  const grown = Math.min(1, age / GROWN_MOST);
  const hole = holeOf(cloud);
  const thin = 1 - GAS_THINNED * Math.min(1, age / (HOLE_FROM * airy));
  const sigma = SOLID_SIGMA * (centre / SUN_MASS) * ASTRONOMICAL_UNIT ** 1.5;
  const fade = FADE[0] * reach;
  const strip = (from: number, to: number, boost: number) =>
    to > from ? 2 * Math.PI * sigma * boost * summed(from, to, fade) : 0;
  const aired = (from: number, to: number) =>
    (Math.exp(-from / fade) - Math.exp(-to / fade)) / (1 - Math.exp(-reach / fade));
  const strewn = (from: number, to: number) =>
    strip(from, Math.min(to, frost), 1) + strip(Math.max(from, frost), to, ICE_BOOST);
  const stations = cloud.stations
    .filter((station) => station.orbit > inner && station.orbit < outer)
    .sort((left, right) => left.orbit - right.orbit);
  const edges = [
    inner,
    ...stations.slice(1).map((station, at) => Math.sqrt(stations[at].orbit * station.orbit)),
    outer,
  ];
  const pieces: Piece[] = [];
  const lay = (from: number, to: number, left: number) => {
    const near = Math.min(to, frost);
    const far = Math.max(from, frost);
    if (near > from) {
      pieces.push({ inner: from, outer: near, mass: strewn(from, near) * left, ice: ICE_NEAR });
    }
    if (to > far) {
      pieces.push({ inner: far, outer: to, mass: strewn(far, to) * left, ice: ICE_FAR });
    }
  };
  if (stations.length === 0) {
    lay(inner, outer, (1 - grown) ** 2);
  }
  for (const [at, { orbit, share, mass, belt }] of stations.entries()) {
    const low = edges[at];
    const high = edges[at + 1];
    if (belt !== null) {
      const from = low ** (1 - grown) * belt.inner ** grown;
      const to = high ** (1 - grown) * belt.outer ** grown;
      const spare = Math.max(0, strewn(from, to) - belt.mass) * (1 - grown) ** 2;
      pieces.push({ inner: from, outer: to, mass: belt.mass + spare, ice: belt.ice });
      continue;
    }
    const gap = share > 0 ? GAP_HILL * orbit * Math.cbrt(mass / (3 * centre)) : 0;
    const left = (1 - share) ** 2;
    if (gap > 0) {
      lay(low, Math.min(high, orbit - gap), left);
      lay(Math.max(low, orbit + gap), high, left);
    } else {
      lay(low, high, left);
    }
  }
  const airyYet = age < airy;
  const split = pieces.flatMap((piece) => {
    if (!airyYet || piece.inner >= hole || piece.outer <= hole) {
      return [piece];
    }
    const part = strewn(piece.inner, hole) / strewn(piece.inner, piece.outer);
    return [
      { ...piece, outer: hole, mass: piece.mass * part },
      { ...piece, inner: hole, mass: piece.mass * (1 - part) },
    ];
  });
  const stirred = stirredHeight(
    Math.max(0, ...stations.map((station) => station.mass)),
    centre,
    grown,
  );
  const area = (disk: Disk) => disk.outer ** 2 - disk.inner ** 2;
  const disks: Disk[] = [];
  for (const piece of split) {
    const dusty = airyYet && piece.inner >= hole;
    const gas = dusty ? GAS_SHARE * centre * thin * aired(piece.inner, piece.outer) : 0;
    const wear = dusty ? 0 : wearOf(Math.sqrt(piece.inner * piece.outer), centre, age);
    const made = diskOf(
      piece.inner,
      piece.outer,
      piece.ice,
      { mass: piece.mass, gas, wear, fade },
      dusty ? DUST : RUBBLE,
    );
    const last = disks.at(-1);
    const joined = last !== undefined && made.inner <= JOINED * last.outer;
    if (last !== undefined && joined && last.gas > 0 === made.gas > 0) {
      const mass = last.mass + made.mass;
      disks[disks.length - 1] = {
        ...made,
        inner: last.inner,
        mass,
        depth: (last.depth * area(last) + made.depth * area(made)) / (area(last) + area(made)),
        ice: mass > 0 ? (last.ice * last.mass + made.ice * made.mass) / mass : made.ice,
        gas: last.gas + made.gas,
      };
    } else {
      disks.push(made);
    }
  }
  return disks
    .filter((disk) => disk.mass >= DISK_LEAST || disk.gas > 0)
    .map((disk) => {
      const grain = ROCK_GRAIN - (ROCK_GRAIN - ICE_GRAIN) * disk.ice;
      if (disk.gas === 0) {
        const size = (3 * disk.mass) / (4 * grain * Math.PI * area(disk) * disk.depth);
        return { ...disk, grain: size, height: stirred, flare: 0 };
      }
      const spread = disk.gas / (Math.PI * area(disk));
      const loose = (Math.PI * grain * SKIN) / (2 * spread * TURBULENCE);
      const held = gasHeight(Math.sqrt(disk.inner * disk.outer), centre, frost);
      return {
        ...disk,
        height: held / Math.sqrt(1 + loose),
        flare: FLARE - (0.5 * loose) / (1 + loose),
      };
    });
}
