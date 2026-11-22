import { gravityOf, moltenOf, seaCover } from "./physics.ts";
import { createRandom } from "./random.ts";
import type { Body, Physics, Relief, Vector } from "./types.ts";

export const RELIEF_SHAPE = {
  octaves: 5,
  warpOctaves: 2,
  warpSeed: 17,
  ridgeOctaves: 3,
  ridgeScale: 2.5,
  ridgeSeed: 101,
  ridgeFrom: -0.15,
  ridgeTo: 0.35,
  ridgeWeight: 1.75,
} as const;

export const PIT_SHAPE = {
  seed: 151,
  twin: 0x68bc21eb,
  pitch: 1,
  least: 0.125,
  most: 0.25,
  reach: 2,
  shell: 0.8,
  soft: 0.6,
  depth: 0.32,
  rim: 0.07,
  deepen: 0.3,
  raise: 0.4,
  steepest: 6,
  blurFrom: 1.5,
  blurTo: 3.5,
} as const;

export const GRAIN_SHAPE = {
  seed: 173,
  fall: 0.52,
  blurFrom: 2,
  blurTo: 4,
} as const;

export const GROUND_GRAIN = 0.5;
export const TILE_CELLS = 32;
const CELL_GRAIN = 0.3;

export function depthOf(radius: number): number {
  return Math.max(0, Math.floor(Math.log2((radius * Math.PI) / (2 * TILE_CELLS * GROUND_GRAIN))));
}

export function grainOf(radius: number, level = depthOf(radius)): number {
  return (CELL_GRAIN * Math.PI) / (2 * TILE_CELLS * 2 ** level);
}
const BOWL_ROCK = 29000;
const BOWL_ICE = 4000;
const BOWL_ICY = [0.1, 0.5];
const STAND_PULL = 92000;
const STAND_CAP = 0.05;
const STAND_STILL = 0.15;
const STAND_ICE = 0.4;
const PIT_AIR = [3, 5];
const PIT_STIR = 0.85;
const PIT_SEED = 83;
const PIT_KEPT_ROCK = 0.6;
const PIT_KEPT_ICE = 0.15;

function scramble(x: number, y: number, z: number, seed: number): number {
  let mixed = Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca77) ^ Math.imul(z, 0xc2b2ae3d) ^ seed;
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x2c1b3c6d);
  mixed = Math.imul(mixed ^ (mixed >>> 12), 0x297a2d39);
  return (mixed ^ (mixed >>> 15)) >>> 0;
}

function lean(corner: number, x: number, y: number, z: number): number {
  const pick = corner & 15;
  const first = pick < 8 ? x : y;
  const second = pick < 4 ? y : pick === 12 || pick === 14 ? x : z;
  return ((pick & 1) === 0 ? first : -first) + ((pick & 2) === 0 ? second : -second);
}

function fade(share: number): number {
  return share * share * share * (share * (share * 6 - 15) + 10);
}

function mix(from: number, to: number, share: number): number {
  return from + (to - from) * share;
}

function smooth(from: number, to: number, value: number): number {
  const share = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return share * share * (3 - 2 * share);
}

export function noise(x: number, y: number, z: number, seed: number): number {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const cellZ = Math.floor(z);
  const inX = x - cellX;
  const inY = y - cellY;
  const inZ = z - cellZ;
  const shareX = fade(inX);
  const shareY = fade(inY);
  const lowFront = lean(scramble(cellX, cellY, cellZ, seed), inX, inY, inZ);
  const lowBack = lean(scramble(cellX + 1, cellY, cellZ, seed), inX - 1, inY, inZ);
  const highFront = lean(scramble(cellX, cellY + 1, cellZ, seed), inX, inY - 1, inZ);
  const highBack = lean(scramble(cellX + 1, cellY + 1, cellZ, seed), inX - 1, inY - 1, inZ);
  const near = mix(mix(lowFront, lowBack, shareX), mix(highFront, highBack, shareX), shareY);
  const farLowFront = lean(scramble(cellX, cellY, cellZ + 1, seed), inX, inY, inZ - 1);
  const farLowBack = lean(scramble(cellX + 1, cellY, cellZ + 1, seed), inX - 1, inY, inZ - 1);
  const farHighFront = lean(scramble(cellX, cellY + 1, cellZ + 1, seed), inX, inY - 1, inZ - 1);
  const farHighBack = lean(
    scramble(cellX + 1, cellY + 1, cellZ + 1, seed),
    inX - 1,
    inY - 1,
    inZ - 1,
  );
  const far = mix(
    mix(farLowFront, farLowBack, shareX),
    mix(farHighFront, farHighBack, shareX),
    shareY,
  );
  return mix(near, far, fade(inZ));
}

function layered(
  x: number,
  y: number,
  z: number,
  seed: number,
  octaves: number,
  crested: boolean,
): number {
  let total = 0;
  let weight = 1;
  for (let octave = 0; octave < octaves; octave++) {
    const value = noise(x, y, z, seed + octave);
    total += weight * (crested ? (1 - Math.abs(value)) ** 2 : value);
    const turnedX = 2 * (-0.8 * y - 0.6 * z);
    const turnedY = 2 * (0.8 * x + 0.36 * y - 0.48 * z);
    const turnedZ = 2 * (0.6 * x - 0.48 * y + 0.64 * z);
    x = turnedX;
    y = turnedY;
    z = turnedZ;
    weight *= 0.5;
  }
  return total;
}

function raised(seed: number, relief: Relief, atX: number, atY: number, atZ: number): number {
  const shape = RELIEF_SHAPE;
  const x = atX * relief.frequency;
  const y = atY * relief.frequency;
  const z = atZ * relief.frequency;
  const warpedX =
    x + relief.warp * layered(x, y, z, seed + shape.warpSeed, shape.warpOctaves, false);
  const warpedY =
    y + relief.warp * layered(x, y, z, seed + 2 * shape.warpSeed, shape.warpOctaves, false);
  const warpedZ =
    z + relief.warp * layered(x, y, z, seed + 3 * shape.warpSeed, shape.warpOctaves, false);
  const base = layered(warpedX, warpedY, warpedZ, seed, shape.octaves, false);
  const ridges =
    layered(
      warpedX * shape.ridgeScale,
      warpedY * shape.ridgeScale,
      warpedZ * shape.ridgeScale,
      seed + shape.ridgeSeed,
      shape.ridgeOctaves,
      true,
    ) / shape.ridgeWeight;
  return base + relief.ridge * ridges * smooth(shape.ridgeFrom, shape.ridgeTo, base);
}

export function elevationAt(seed: number, relief: Relief, at: Vector): number {
  return raised(seed, relief, at.x, at.y, at.z);
}

function fine(
  seed: number,
  relief: Relief,
  atX: number,
  atY: number,
  atZ: number,
  grain: number,
): number {
  const shape = GRAIN_SHAPE;
  const scale = relief.frequency * 2 ** RELIEF_SHAPE.octaves;
  const blurFrom = shape.blurFrom * grain;
  const blurTo = shape.blurTo * grain;
  let x = atX * scale;
  let y = atY * scale;
  let z = atZ * scale;
  let wave = 1 / scale;
  let weight = 2 ** -RELIEF_SHAPE.octaves;
  let total = 0;
  for (let octave = 0; wave > blurFrom; octave++) {
    total += weight * smooth(blurFrom, blurTo, wave) * noise(x, y, z, seed + shape.seed + octave);
    const turnedX = 2 * (-0.8 * y - 0.6 * z);
    const turnedY = 2 * (0.8 * x + 0.36 * y - 0.48 * z);
    const turnedZ = 2 * (0.6 * x - 0.48 * y + 0.64 * z);
    x = turnedX;
    y = turnedY;
    z = turnedZ;
    wave /= 2;
    weight *= shape.fall;
  }
  return total;
}

const PIT_FIELDS = 8;
const pit = new Float64Array(PIT_FIELDS);

function dug(
  cellX: number,
  cellY: number,
  cellZ: number,
  salt: number,
  pitch: number,
  cover: number,
  blurFrom: number,
  blurTo: number,
): boolean {
  const shape = PIT_SHAPE;
  const mixed = scramble(cellX, cellY, cellZ, salt);
  const siteX = (cellX + (mixed & 1023) / 1024) * pitch;
  const siteY = (cellY + ((mixed >>> 10) & 1023) / 1024) * pitch;
  const siteZ = (cellZ + ((mixed >>> 20) & 1023) / 1024) * pitch;
  const span = Math.sqrt(siteX * siteX + siteY * siteY + siteZ * siteZ);
  const kept = 1 - smooth(shape.shell, 1, Math.abs(span - 1) / (0.5 * pitch));
  if (kept <= 0) {
    return false;
  }
  const more = scramble(cellX, cellY, cellZ, salt ^ shape.twin);
  const radius = pitch * mix(shape.least, shape.most, (more & 0xffff) / 65536);
  const fresh = Math.max(0, Math.min(1, (cover - (more >>> 16) / 65536) / shape.soft));
  const strength = kept * fresh * smooth(blurFrom, blurTo, radius);
  if (strength <= 0) {
    return false;
  }
  pit[0] = siteX / span;
  pit[1] = siteY / span;
  pit[2] = siteZ / span;
  pit[3] = radius;
  pit[4] = strength;
  return true;
}

function shaped(radius: number, bowl: number, into: Float64Array, base: number): void {
  const shape = PIT_SHAPE;
  const wide = Math.max(1, radius / bowl);
  const least = Math.min(radius, bowl);
  into[base] = shape.depth * least * wide ** shape.deepen;
  into[base + 1] = shape.rim * least * wide ** shape.raise;
  into[base + 2] = Math.min(shape.steepest, 2 + Math.log2(wide));
}

function dent(share: number, depth: number, rim: number, steep: number): number {
  if (share < 1) {
    return (depth + rim) * share ** steep - depth;
  }
  return (rim * (1 - smooth(1, PIT_SHAPE.reach, share))) / share ** 3;
}

function pitted(
  x: number,
  y: number,
  z: number,
  salt: number,
  pitch: number,
  cover: number,
  bowl: number,
  blurFrom: number,
  blurTo: number,
): number {
  const baseX = Math.floor(x / pitch);
  const baseY = Math.floor(y / pitch);
  const baseZ = Math.floor(z / pitch);
  let total = 0;
  for (let cellX = baseX - 1; cellX <= baseX + 1; cellX++) {
    for (let cellY = baseY - 1; cellY <= baseY + 1; cellY++) {
      for (let cellZ = baseZ - 1; cellZ <= baseZ + 1; cellZ++) {
        if (!dug(cellX, cellY, cellZ, salt, pitch, cover, blurFrom, blurTo)) {
          continue;
        }
        const fromX = x - pit[0];
        const fromY = y - pit[1];
        const fromZ = z - pit[2];
        const share = Math.sqrt(fromX * fromX + fromY * fromY + fromZ * fromZ) / pit[3];
        if (share < PIT_SHAPE.reach) {
          shaped(pit[3], bowl, pit, 5);
          total += pit[4] * dent(share, pit[5], pit[6], pit[7]);
        }
      }
    }
  }
  return total;
}

export function pitsAt(
  seed: number,
  cover: number,
  bowl: number,
  at: Vector,
  grain: number,
): number {
  const shape = PIT_SHAPE;
  const blurFrom = shape.blurFrom * grain;
  const blurTo = shape.blurTo * grain;
  let total = 0;
  for (let layer = 0, pitch = shape.pitch; shape.most * pitch > blurFrom; layer++, pitch /= 2) {
    const salt = seed + shape.seed + layer;
    total += pitted(at.x, at.y, at.z, salt, pitch, cover, bowl, blurFrom, blurTo);
  }
  return total;
}

type Solid = Pick<Physics, "mass" | "radius" | "iron" | "rock" | "ice">;

function icyOf(physics: Solid): number {
  const solid = physics.iron + physics.rock + physics.ice;
  return solid > 0 ? smooth(BOWL_ICY[0], BOWL_ICY[1], physics.ice / solid) : 0;
}

export function bowlOf(physics: Solid): number {
  const widest = mix(BOWL_ROCK, BOWL_ICE, icyOf(physics)) / gravityOf(physics.mass, physics.radius);
  return widest / (2 * physics.radius);
}

export function heightOf(physics: Solid, lively: number): number {
  const stirred = STAND_STILL + (1 - STAND_STILL) * lively;
  const raised =
    (STAND_PULL * mix(1, STAND_ICE, icyOf(physics)) * stirred) /
    gravityOf(physics.mass, physics.radius);
  return Math.round(Math.min(STAND_CAP * physics.radius, raised));
}

export function cratersOf(physics: Physics, lively: number, seed: number): number {
  if (physics.life > 0 || seaCover(physics) > 0) {
    return 0;
  }
  const bare = 1 - smooth(PIT_AIR[0], PIT_AIR[1], Math.log10(Math.max(physics.air, 1)));
  const least = mix(PIT_KEPT_ROCK, PIT_KEPT_ICE, icyOf(physics));
  const kept = mix(least, 1, createRandom(seed + PIT_SEED).next());
  const share = bare * (1 - PIT_STIR * lively) * (1 - moltenOf(physics)) * kept;
  return Math.round(1000 * share) / 1000;
}

export interface Pits {
  cover: number;
  bowl: number;
  lift: number;
}

type Grounded = Pick<Body, "seed" | "relief" | "physics">;

export function pitsOf(body: Grounded): Pits {
  const { relief, physics } = body;
  if (relief.craters <= 0 || relief.height <= 0) {
    return { cover: 0, bowl: 1, lift: 0 };
  }
  return { cover: relief.craters, bowl: bowlOf(physics), lift: physics.radius / relief.height };
}

export function groundAt(body: Grounded, at: Vector, grain = grainOf(body.physics.radius)): number {
  const { seed, relief, physics } = body;
  const field =
    raised(seed, relief, at.x, at.y, at.z) + fine(seed, relief, at.x, at.y, at.z, grain);
  const sunk =
    relief.craters > 0
      ? physics.radius * pitsAt(seed, relief.craters, bowlOf(physics), at, grain)
      : 0;
  return relief.height * (field - (relief.sea ?? 0)) + sunk;
}

export type Ground = (x: number, y: number, z: number) => number;

const GATHER = 0.5;
const KEPT_FIELDS = 8;

export function createGround(
  body: Grounded,
  centre: Vector,
  reach: number,
  grain = grainOf(body.physics.radius),
): Ground {
  const { seed, relief, physics } = body;
  const shape = PIT_SHAPE;
  const cover = relief.height > 0 ? relief.craters : 0;
  const bowl = cover > 0 ? bowlOf(physics) : 1;
  const blurFrom = shape.blurFrom * grain;
  const blurTo = shape.blurTo * grain;
  const datum = relief.sea ?? 0;
  const kept: number[] = [];
  const direct: number[] = [];
  for (
    let layer = 0, pitch = shape.pitch;
    cover > 0 && shape.most * pitch > blurFrom;
    layer++, pitch /= 2
  ) {
    const salt = seed + shape.seed + layer;
    if (pitch < GATHER * reach) {
      direct.push(salt, pitch);
      continue;
    }
    const from = (value: number) => Math.floor((value - reach) / pitch) - 1;
    const to = (value: number) => Math.floor((value + reach) / pitch) + 1;
    for (let cellX = from(centre.x); cellX <= to(centre.x); cellX++) {
      for (let cellY = from(centre.y); cellY <= to(centre.y); cellY++) {
        for (let cellZ = from(centre.z); cellZ <= to(centre.z); cellZ++) {
          if (!dug(cellX, cellY, cellZ, salt, pitch, cover, blurFrom, blurTo)) {
            continue;
          }
          const apart = Math.hypot(centre.x - pit[0], centre.y - pit[1], centre.z - pit[2]);
          if (apart < reach + shape.reach * pit[3]) {
            shaped(pit[3], bowl, pit, 5);
            kept.push(...pit);
          }
        }
      }
    }
  }
  const pits = Float64Array.from(kept);
  const layers = Float64Array.from(direct);
  return (x, y, z) => {
    let sunk = 0;
    for (let base = 0; base < pits.length; base += KEPT_FIELDS) {
      const fromX = x - pits[base];
      const fromY = y - pits[base + 1];
      const fromZ = z - pits[base + 2];
      const radius = pits[base + 3];
      const far = fromX * fromX + fromY * fromY + fromZ * fromZ;
      if (far < shape.reach * shape.reach * radius * radius) {
        sunk +=
          pits[base + 4] *
          dent(Math.sqrt(far) / radius, pits[base + 5], pits[base + 6], pits[base + 7]);
      }
    }
    for (let base = 0; base < layers.length; base += 2) {
      sunk += pitted(x, y, z, layers[base], layers[base + 1], cover, bowl, blurFrom, blurTo);
    }
    const field = raised(seed, relief, x, y, z) + fine(seed, relief, x, y, z, grain);
    return relief.height * (field - datum) + physics.radius * sunk;
  };
}
