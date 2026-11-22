import type { Crust } from "./ground.ts";
import type { Vector } from "./types.ts";

export const ROVER = {
  wheelbase: 3.2,
  track: 2.4,
  clearance: 0.9,
  drive: 2.4,
  swiftest: 22,
  grip: 0.8,
  roll: 0.04,
  steer: 0.9,
  pivot: 0.35,
  stride: 0.05,
} as const;

export interface Rover {
  body: number;
  at: Vector;
  ahead: Vector;
  up: Vector;
  speed: number;
  height: number;
  slope: number;
}

export interface Wheel {
  throttle: number;
  turn: number;
  brake: boolean;
}

function unit(x: number, y: number, z: number): Vector {
  const length = Math.hypot(x, y, z);
  return { x: x / length, y: y / length, z: z / length };
}

function square(at: Vector, toward: Vector): Vector {
  const along = toward.x * at.x + toward.y * at.y + toward.z * at.z;
  const x = toward.x - along * at.x;
  const y = toward.y - along * at.y;
  const z = toward.z - along * at.z;
  if (Math.hypot(x, y, z) < 1e-9) {
    return square(at, Math.abs(at.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 });
  }
  return unit(x, y, z);
}

function stand(crust: Crust, radius: number, rover: Rover): void {
  const { at, ahead } = rover;
  const side = {
    x: ahead.y * at.z - ahead.z * at.y,
    y: ahead.z * at.x - ahead.x * at.z,
    z: ahead.x * at.y - ahead.y * at.x,
  };
  const reach = ROVER.wheelbase / 2 / radius;
  const width = ROVER.track / 2 / radius;
  const rise = (along: number, across: number) => {
    const spot = unit(
      at.x + along * ahead.x + across * side.x,
      at.y + along * ahead.y + across * side.y,
      at.z + along * ahead.z + across * side.z,
    );
    return crust.rise(rover.body, spot.x, spot.y, spot.z);
  };
  const pitch = (rise(reach, 0) - rise(-reach, 0)) / ROVER.wheelbase;
  const bank = (rise(0, width) - rise(0, -width)) / ROVER.track;
  rover.height = crust.rise(rover.body, at.x, at.y, at.z);
  rover.slope = pitch;
  rover.up = unit(
    at.x - pitch * ahead.x - bank * side.x,
    at.y - pitch * ahead.y - bank * side.y,
    at.z - pitch * ahead.z - bank * side.z,
  );
}

export function createRover(
  crust: Crust,
  radius: number,
  body: number,
  at: Vector,
  toward: Vector,
): Rover {
  const place = unit(at.x, at.y, at.z);
  const rover: Rover = {
    body,
    at: place,
    ahead: square(place, toward),
    up: place,
    speed: 0,
    height: 0,
    slope: 0,
  };
  stand(crust, radius, rover);
  return rover;
}

export function drive(
  crust: Crust,
  radius: number,
  pull: number,
  rover: Rover,
  wheel: Wheel,
  span: number,
): void {
  const steps = Math.max(1, Math.ceil(span / ROVER.stride));
  const step = span / steps;
  const gravity = pull / radius ** 2;
  for (let index = 0; index < steps; index++) {
    const steep = Math.hypot(1, rover.slope);
    const hold = (ROVER.grip * gravity) / steep;
    const downhill = (-gravity * rover.slope) / steep;
    const eager = Math.max(-1, Math.min(1, wheel.throttle));
    const spent = Math.max(0, 1 - Math.abs(rover.speed) / ROVER.swiftest);
    const pushing = eager * rover.speed >= 0 ? ROVER.drive * eager * spent : ROVER.drive * eager;
    const braking =
      wheel.brake || eager === 0 ? -Math.sign(rover.speed) * (wheel.brake ? hold : 0) : 0;
    const traction = Math.max(-hold, Math.min(hold, pushing + braking));
    const before = rover.speed;
    rover.speed += step * (traction + downhill - ROVER.roll * gravity * Math.sign(rover.speed));
    const idle = eager === 0 && Math.abs(downhill) <= hold;
    if (idle && (before * rover.speed <= 0 || Math.abs(rover.speed) < step * hold)) {
      rover.speed = 0;
    }
    const turning =
      Math.max(-1, Math.min(1, wheel.turn)) *
      (ROVER.pivot + (ROVER.steer - ROVER.pivot) * Math.min(1, Math.abs(rover.speed) / 3));
    const { at, ahead } = rover;
    const sine = Math.sin(turning * step);
    const cosine = Math.cos(turning * step);
    const side = {
      x: ahead.y * at.z - ahead.z * at.y,
      y: ahead.z * at.x - ahead.x * at.z,
      z: ahead.x * at.y - ahead.y * at.x,
    };
    const headed = {
      x: cosine * ahead.x + sine * side.x,
      y: cosine * ahead.y + sine * side.y,
      z: cosine * ahead.z + sine * side.z,
    };
    const moved = (rover.speed * step) / steep / (radius + rover.height);
    rover.at = unit(at.x + moved * headed.x, at.y + moved * headed.y, at.z + moved * headed.z);
    rover.ahead = square(rover.at, headed);
    stand(crust, radius, rover);
  }
}
