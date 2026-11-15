import type { Relief, Vector } from "./types.ts";

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
