import { flatOf } from "./interior.ts";
import { roughOf, STAR_LEAST, wrapped } from "./physics.ts";
import { bowlOf, createGround, type Ground, PIT_SHAPE, RELIEF_SHAPE } from "./relief.ts";
import type { Body, Physics, Sketch, Vector } from "./types.ts";

export const SOFT_LANDING = 12;

const FLAT_LEAST = 0.008;
const FIELD_MOST = 3.1;
const RIM_STACK = 3;
const PATCH_REACH = 2000;
const PATCH_KEEP = 0.7;

export function groundFlat(physics: Physics): number {
  const flat = flatOf(physics);
  return flat >= FLAT_LEAST && roughOf(physics) === 0 ? flat : 0;
}

export function landable(body: Body): boolean {
  const { physics } = body;
  return (
    physics.mass < STAR_LEAST &&
    !wrapped(physics) &&
    roughOf(physics) === 0 &&
    body.relief.height > 0
  );
}

export function ceilingOf(body: Body): number {
  const { physics, relief } = body;
  if (!landable(body)) {
    return physics.radius;
  }
  const shape = PIT_SHAPE;
  const bowl = bowlOf(physics);
  const rim =
    relief.craters > 0
      ? shape.rim * Math.min(shape.most, bowl) * Math.max(1, shape.most / bowl) ** shape.raise
      : 0;
  const ridged = FIELD_MOST + RELIEF_SHAPE.ridgeOctaves * relief.ridge;
  return physics.radius * (1 + RIM_STACK * rim) + ridged * relief.height;
}

export interface Turn {
  pole: Vector;
  rate: number;
  fixed(time: number, x: number, y: number, z: number, into: Float64Array): void;
  spun(time: number, x: number, y: number, z: number, into: Float64Array): void;
}

export function turnOf(body: Body): Turn {
  const tiltSine = Math.sin(body.tilt);
  const tiltCosine = Math.cos(body.tilt);
  const swingSine = Math.sin(body.swing);
  const swingCosine = Math.cos(body.swing);
  const rate = (2 * Math.PI) / body.day;
  return {
    pole: { x: tiltSine * swingSine, y: tiltCosine, z: tiltSine * swingCosine },
    rate,
    fixed(time, x, y, z, into) {
      const swungX = x * swingCosine - z * swingSine;
      const swungZ = x * swingSine + z * swingCosine;
      const leantY = y * tiltCosine + swungZ * tiltSine;
      const leantZ = swungZ * tiltCosine - y * tiltSine;
      const sine = Math.sin(rate * time);
      const cosine = Math.cos(rate * time);
      into[0] = swungX * cosine - leantZ * sine;
      into[1] = leantY;
      into[2] = swungX * sine + leantZ * cosine;
    },
    spun(time, x, y, z, into) {
      const sine = Math.sin(rate * time);
      const cosine = Math.cos(rate * time);
      const turnedX = x * cosine + z * sine;
      const turnedZ = z * cosine - x * sine;
      const leantY = y * tiltCosine - turnedZ * tiltSine;
      const leantZ = y * tiltSine + turnedZ * tiltCosine;
      into[0] = turnedX * swingCosine + leantZ * swingSine;
      into[1] = leantY;
      into[2] = leantZ * swingCosine - turnedX * swingSine;
    },
  };
}

export interface Crust {
  ceilings: Float64Array;
  turns: Turn[];
  squash: Float64Array;
  rise(body: number, x: number, y: number, z: number): number;
  surface(body: number, time: number, x: number, y: number, z: number): number;
}

interface Patch {
  x: number;
  y: number;
  z: number;
  reach: number;
  ground: Ground;
}

export function crustOf(system: Sketch): Crust {
  const { bodies } = system;
  const turns = bodies.map(turnOf);
  const squash = Float64Array.from(bodies, (body) =>
    landable(body) ? 1 - groundFlat(body.physics) : 1,
  );
  const solid = bodies.map(landable);
  const patches: (Patch | null)[] = bodies.map(() => null);
  const fixed = new Float64Array(3);

  const rise = (id: number, x: number, y: number, z: number): number => {
    const body = bodies[id];
    if (!solid[id]) {
      return 0;
    }
    let patch = patches[id];
    const off =
      patch === null ? Number.POSITIVE_INFINITY : Math.hypot(x - patch.x, y - patch.y, z - patch.z);
    if (patch === null || off > PATCH_KEEP * patch.reach) {
      const reach = PATCH_REACH / body.physics.radius;
      patch = { x, y, z, reach, ground: createGround(body, { x, y, z }, reach) };
      patches[id] = patch;
    }
    const height = patch.ground(x, y, z);
    return body.relief.sea === null ? height : Math.max(0, height);
  };

  return {
    ceilings: Float64Array.from(bodies, ceilingOf),
    turns,
    squash,
    rise,
    surface(id, time, x, y, z) {
      const radius = bodies[id].physics.radius;
      if (!solid[id]) {
        return radius;
      }
      turns[id].fixed(time, x, y, z, fixed);
      const flat = squash[id];
      const tall = fixed[1] / flat;
      const far = Math.hypot(fixed[0], tall, fixed[2]);
      const atX = fixed[0] / far;
      const atY = tall / far;
      const atZ = fixed[2] / far;
      return Math.hypot(atX, flat * atY, atZ) * (radius + rise(id, atX, atY, atZ));
    },
  };
}

export interface Berth {
  body: number;
  x: number;
  y: number;
  z: number;
}

export interface Lander {
  crust: Crust;
  clearance(body: number, time: number, at: Float64Array, state: Float64Array): number;
  slip(
    body: number,
    at: Float64Array,
    speed: Float64Array,
    state: Float64Array,
    into: Float64Array,
  ): void;
  touch(body: number, time: number, at: Float64Array, state: Float64Array, stand: number): Berth;
  hold(site: Berth, time: number, at: Float64Array, speed: Float64Array, state: Float64Array): void;
  up(site: Berth, time: number, into: Float64Array): void;
}

export function createLander(system: Sketch): Lander {
  const crust = crustOf(system);
  const { turns } = crust;
  const scratch = new Float64Array(3);
  return {
    crust,
    clearance(body, time, at, state) {
      const x = state[0] - at[3 * body];
      const y = state[1] - at[3 * body + 1];
      const z = state[2] - at[3 * body + 2];
      return Math.hypot(x, y, z) - crust.surface(body, time, x, y, z);
    },
    slip(body, at, speed, state, into) {
      const { pole, rate } = turns[body];
      const x = state[0] - at[3 * body];
      const y = state[1] - at[3 * body + 1];
      const z = state[2] - at[3 * body + 2];
      into[0] = state[3] - speed[3 * body] - rate * (pole.y * z - pole.z * y);
      into[1] = state[4] - speed[3 * body + 1] - rate * (pole.z * x - pole.x * z);
      into[2] = state[5] - speed[3 * body + 2] - rate * (pole.x * y - pole.y * x);
    },
    touch(body, time, at, state, stand) {
      const x = state[0] - at[3 * body];
      const y = state[1] - at[3 * body + 1];
      const z = state[2] - at[3 * body + 2];
      const scale = (crust.surface(body, time, x, y, z) + stand) / Math.hypot(x, y, z);
      turns[body].fixed(time, x * scale, y * scale, z * scale, scratch);
      return { body, x: scratch[0], y: scratch[1], z: scratch[2] };
    },
    hold(site, time, at, speed, state) {
      const { pole, rate } = turns[site.body];
      turns[site.body].spun(time, site.x, site.y, site.z, scratch);
      const [x, y, z] = scratch;
      const base = 3 * site.body;
      state[0] = at[base] + x;
      state[1] = at[base + 1] + y;
      state[2] = at[base + 2] + z;
      state[3] = speed[base] + rate * (pole.y * z - pole.z * y);
      state[4] = speed[base + 1] + rate * (pole.z * x - pole.x * z);
      state[5] = speed[base + 2] + rate * (pole.x * y - pole.y * x);
    },
    up(site, time, into) {
      const far = Math.hypot(site.x, site.y, site.z);
      turns[site.body].spun(time, site.x / far, site.y / far, site.z / far, into);
    },
  };
}
