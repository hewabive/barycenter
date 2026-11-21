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
  soft: 0.25,
  depth: 0.4,
  rim: 0.07,
  deepen: 0.3,
  raise: 0.4,
  steepest: 6,
  blurFrom: 1.5,
  blurTo: 3.5,
} as const;

export const GRAIN_SHAPE = {
  seed: 173,
  fall: 0.6,
  blurFrom: 2,
  blurTo: 4,
} as const;

export const GROUND_GRAIN = 0.5;
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
  const at = (dx: number, dy: number, dz: number) =>
    lean(scramble(cellX + dx, cellY + dy, cellZ + dz, seed), inX - dx, inY - dy, inZ - dz);
  const shareX = fade(inX);
  const shareY = fade(inY);
  const near = mix(
    mix(at(0, 0, 0), at(1, 0, 0), shareX),
    mix(at(0, 1, 0), at(1, 1, 0), shareX),
    shareY,
  );
  const far = mix(
    mix(at(0, 0, 1), at(1, 0, 1), shareX),
    mix(at(0, 1, 1), at(1, 1, 1), shareX),
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
  shape: (value: number) => number,
): number {
  let total = 0;
  let weight = 1;
  for (let octave = 0; octave < octaves; octave++) {
    total += weight * shape(noise(x, y, z, seed + octave));
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

const plain = (value: number) => value;
const crest = (value: number) => (1 - Math.abs(value)) ** 2;

export function elevationAt(seed: number, relief: Relief, at: Vector): number {
  const shape = RELIEF_SHAPE;
  const x = at.x * relief.frequency;
  const y = at.y * relief.frequency;
  const z = at.z * relief.frequency;
  const bend = (turn: number) =>
    relief.warp * layered(x, y, z, seed + turn * shape.warpSeed, shape.warpOctaves, plain);
  const warpedX = x + bend(1);
  const warpedY = y + bend(2);
  const warpedZ = z + bend(3);
  const base = layered(warpedX, warpedY, warpedZ, seed, shape.octaves, plain);
  const ridges =
    layered(
      warpedX * shape.ridgeScale,
      warpedY * shape.ridgeScale,
      warpedZ * shape.ridgeScale,
      seed + shape.ridgeSeed,
      shape.ridgeOctaves,
      crest,
    ) / shape.ridgeWeight;
  return base + relief.ridge * ridges * smooth(shape.ridgeFrom, shape.ridgeTo, base);
}

function fine(seed: number, relief: Relief, at: Vector, grain: number): number {
  const shape = GRAIN_SHAPE;
  const scale = relief.frequency * 2 ** RELIEF_SHAPE.octaves;
  let x = at.x * scale;
  let y = at.y * scale;
  let z = at.z * scale;
  let wave = 1 / scale;
  let weight = 2 ** -RELIEF_SHAPE.octaves;
  let total = 0;
  for (let octave = 0; wave > shape.blurFrom * grain; octave++) {
    const shown = smooth(shape.blurFrom * grain, shape.blurTo * grain, wave);
    total += weight * shown * noise(x, y, z, seed + shape.seed + octave);
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

function dent(share: number, radius: number, bowl: number): number {
  const shape = PIT_SHAPE;
  const wide = Math.max(1, radius / bowl);
  const least = Math.min(radius, bowl);
  const depth = shape.depth * least * wide ** shape.deepen;
  const rim = shape.rim * least * wide ** shape.raise;
  if (share < 1) {
    return (depth + rim) * share ** Math.min(shape.steepest, 2 + Math.log2(wide)) - depth;
  }
  return (rim * (1 - smooth(1, shape.reach, share))) / share ** 3;
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
    const baseX = Math.floor(at.x / pitch);
    const baseY = Math.floor(at.y / pitch);
    const baseZ = Math.floor(at.z / pitch);
    for (let step = 0; step < 27; step++) {
      const cellX = baseX + (step % 3) - 1;
      const cellY = baseY + (Math.floor(step / 3) % 3) - 1;
      const cellZ = baseZ + Math.floor(step / 9) - 1;
      const mixed = scramble(cellX, cellY, cellZ, salt);
      const siteX = (cellX + (mixed & 1023) / 1024) * pitch;
      const siteY = (cellY + ((mixed >>> 10) & 1023) / 1024) * pitch;
      const siteZ = (cellZ + ((mixed >>> 20) & 1023) / 1024) * pitch;
      const span = Math.sqrt(siteX * siteX + siteY * siteY + siteZ * siteZ);
      const kept = 1 - smooth(shape.shell, 1, Math.abs(span - 1) / (0.5 * pitch));
      if (kept <= 0) {
        continue;
      }
      const more = scramble(cellX, cellY, cellZ, salt ^ shape.twin);
      const radius = pitch * mix(shape.least, shape.most, (more & 0xffff) / 65536);
      const fresh = Math.max(0, Math.min(1, (cover - (more >>> 16) / 65536) / shape.soft));
      const strength = kept * fresh * smooth(blurFrom, blurTo, radius);
      if (strength <= 0) {
        continue;
      }
      const fromX = at.x - siteX / span;
      const fromY = at.y - siteY / span;
      const fromZ = at.z - siteZ / span;
      const share = Math.sqrt(fromX * fromX + fromY * fromY + fromZ * fromZ) / radius;
      if (share < shape.reach) {
        total += strength * dent(share, radius, bowl);
      }
    }
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

export function groundAt(
  body: Grounded,
  at: Vector,
  grain = GROUND_GRAIN / body.physics.radius,
): number {
  const { seed, relief, physics } = body;
  const field = elevationAt(seed, relief, at) + fine(seed, relief, at, grain);
  const dug =
    relief.craters > 0
      ? physics.radius * pitsAt(seed, relief.craters, bowlOf(physics), at, grain)
      : 0;
  return relief.height * (field - (relief.sea ?? 0)) + dug;
}
