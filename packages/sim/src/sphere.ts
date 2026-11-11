import type { Random } from "./random.ts";
import type { Vector } from "./types.ts";
import { cross, dot, normalize, subtract } from "./vector.ts";

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const PLANE_TOLERANCE = 1e-9;
const SIMPLEX_TOLERANCE = 1e-6;

type Triple = [number, number, number];

interface Face {
  corners: Triple;
  normal: Vector;
}
const JITTER_SHARE = 0.25;

export function scatter(count: number, random: Random): Vector[] {
  const jitter = JITTER_SHARE * Math.sqrt((4 * Math.PI) / count);
  const offset = () => (random.next() - 0.5) * 2 * jitter;
  const points: Vector[] = [];
  for (let index = 0; index < count; index++) {
    const height = 1 - (2 * (index + 0.5)) / count;
    const radius = Math.sqrt(1 - height * height);
    const angle = index * GOLDEN_ANGLE;
    points.push(
      normalize({
        x: Math.cos(angle) * radius + offset(),
        y: height + offset(),
        z: Math.sin(angle) * radius + offset(),
      }),
    );
  }
  return points;
}

export function hullFaces(points: Vector[]): [number, number, number][] {
  const count = points.length;
  const seed = firstSimplex(points);
  if (seed === null) {
    return [];
  }
  let faces: Face[] = [];
  const [a, b, c, d] = seed;
  for (const [first, second, third, apex] of [
    [a, b, c, d],
    [a, b, d, c],
    [a, c, d, b],
    [b, c, d, a],
  ]) {
    const face = faceOf(points, first, second, third);
    const inward = dot(face.normal, subtract(points[apex], points[first])) > 0;
    faces.push(inward ? faceOf(points, first, third, second) : face);
  }

  const placed = new Set(seed);
  for (let point = 0; point < count; point++) {
    if (placed.has(point)) {
      continue;
    }
    const seen = new Set<number>();
    const kept: Face[] = [];
    const lit: Face[] = [];
    for (const face of faces) {
      const side = dot(face.normal, subtract(points[point], points[face.corners[0]]));
      if (side > PLANE_TOLERANCE) {
        lit.push(face);
        const [first, second, third] = face.corners;
        seen.add(first * count + second);
        seen.add(second * count + third);
        seen.add(third * count + first);
      } else {
        kept.push(face);
      }
    }
    if (lit.length === 0) {
      continue;
    }
    for (const face of lit) {
      const [first, second, third] = face.corners;
      for (const [from, to] of [
        [first, second],
        [second, third],
        [third, first],
      ]) {
        if (!seen.has(to * count + from)) {
          kept.push(faceOf(points, from, to, point));
        }
      }
    }
    faces = kept;
  }

  return faces
    .map((face) => face.corners.slice().sort((left, right) => left - right) as Triple)
    .sort((left, right) => left[0] - right[0] || left[1] - right[1] || left[2] - right[2]);
}

export function neighborPairs(points: Vector[]): [number, number][] {
  const count = points.length;
  const seen = new Set<number>();
  const pairs: [number, number][] = [];
  const add = (low: number, high: number) => {
    const key = low * count + high;
    if (!seen.has(key)) {
      seen.add(key);
      pairs.push([low, high]);
    }
  };
  for (const [first, second, third] of hullFaces(points)) {
    add(first, second);
    add(second, third);
    add(first, third);
  }
  return pairs;
}

function faceOf(points: Vector[], first: number, second: number, third: number): Face {
  const origin = points[first];
  return {
    corners: [first, second, third],
    normal: cross(subtract(points[second], origin), subtract(points[third], origin)),
  };
}

function firstSimplex(points: Vector[]): [number, number, number, number] | null {
  const count = points.length;
  for (let second = 1; second < count; second++) {
    for (let third = second + 1; third < count; third++) {
      const normal = cross(subtract(points[second], points[0]), subtract(points[third], points[0]));
      if (dot(normal, normal) < SIMPLEX_TOLERANCE) {
        continue;
      }
      for (let fourth = third + 1; fourth < count; fourth++) {
        const side = dot(normal, subtract(points[fourth], points[0]));
        if (Math.abs(side) > SIMPLEX_TOLERANCE) {
          return [0, second, third, fourth];
        }
      }
    }
  }
  return null;
}
