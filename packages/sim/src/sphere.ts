import type { Random } from "./random.ts";
import type { Vector } from "./types.ts";
import { cross, dot, normalize, subtract } from "./vector.ts";

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const PLANE_TOLERANCE = 1e-9;
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
  const faces: [number, number, number][] = [];
  for (let first = 0; first < count; first++) {
    for (let second = first + 1; second < count; second++) {
      for (let third = second + 1; third < count; third++) {
        if (isHullFace(points, first, second, third)) {
          faces.push([first, second, third]);
        }
      }
    }
  }
  return faces;
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

function isHullFace(points: Vector[], first: number, second: number, third: number): boolean {
  const origin = points[first];
  const normal = cross(subtract(points[second], origin), subtract(points[third], origin));
  let above = false;
  let below = false;
  for (let other = 0; other < points.length; other++) {
    if (other === first || other === second || other === third) {
      continue;
    }
    const side = dot(normal, subtract(points[other], origin));
    if (side > PLANE_TOLERANCE) {
      above = true;
    } else if (side < -PLANE_TOLERANCE) {
      below = true;
    }
    if (above && below) {
      return false;
    }
  }
  return true;
}
