import type { Vector } from "./types.ts";

export function subtract(left: Vector, right: Vector): Vector {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

export function dot(left: Vector, right: Vector): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

export function cross(left: Vector, right: Vector): Vector {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

export function normalize(vector: Vector): Vector {
  const length = Math.sqrt(dot(vector, vector));
  if (length === 0) {
    return { x: 1, y: 0, z: 0 };
  }
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

export function angleBetween(left: Vector, right: Vector): number {
  return Math.acos(Math.max(-1, Math.min(1, dot(left, right))));
}
