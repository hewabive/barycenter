import { createRandom, type Disk, EARTH_MASS, type Lane } from "@barycenter/sim";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  Points,
  RingGeometry,
  ShaderMaterial,
  Vector2,
} from "three";
import { BELT_FRAGMENT, BELT_VERTEX, SHEET_FRAGMENT, SHEET_VERTEX } from "./shaders.ts";

export interface Belt {
  points: Points;
  turn(tick: number, dense: number, scale: number): void;
}

export interface Glow {
  near: Color;
  far: Color;
  warmth: number;
}

const ROCK = 0x8a8076;
const ICE = 0xcdd6dd;
const LEAN = 0.06;
const LEAST = 300;
const MOST = 1800;
const DUST = 0xb39474;
const FROST = 0xaab4bd;
const SHEET_STEPS = 128;
export const SHEET_LEAST = 1e-4;

export function createBelt(
  lane: Lane,
  disk: Disk,
  seed: number,
  shine: Color,
  sparse: boolean,
): Belt {
  const random = createRandom(seed + 113);
  const weight = Math.log10(disk.mass / EARTH_MASS) + 5;
  const full = Math.max(LEAST, Math.min(MOST, Math.round(500 + 250 * weight)));
  const count = sparse ? Math.round(full / 2) : full;
  const courses = new Float32Array(3 * count);
  const grains = new Float32Array(count);
  for (let index = 0; index < count; index++) {
    const across = (random.next() + random.next()) / 2;
    courses[3 * index] = lane.inner + (lane.outer - lane.inner) * across;
    courses[3 * index + 1] = 2 * Math.PI * random.next();
    courses[3 * index + 2] = LEAN * (random.next() + random.next() - 1);
    grains[index] = random.next();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(courses, 3));
  geometry.setAttribute("grain", new BufferAttribute(grains, 1));
  const uniforms = {
    tick: { value: 0 },
    year: { value: lane.year },
    middle: { value: (lane.inner + lane.outer) / 2 },
    dense: { value: 1 },
    scale: { value: 1 },
    room: { value: (Math.PI * (lane.outer ** 2 - lane.inner ** 2)) / count },
    tint: { value: new Color(ROCK).lerp(new Color(ICE), disk.ice) },
    shine: { value: shine },
  };
  const points = new Points(
    geometry,
    new ShaderMaterial({ vertexShader: BELT_VERTEX, fragmentShader: BELT_FRAGMENT, uniforms }),
  );
  points.frustumCulled = false;
  return {
    points,
    turn(tick, dense, scale) {
      uniforms.tick.value = tick;
      uniforms.dense.value = dense;
      uniforms.scale.value = scale;
    },
  };
}

export function createSheet(lane: Lane, disk: Disk, seed: number, glow: Glow): Mesh {
  const geometry = new RingGeometry(lane.inner, lane.outer, SHEET_STEPS, 1);
  geometry.rotateX(-Math.PI / 2);
  const uniforms = {
    hoop: { value: new Vector2(lane.inner, lane.outer) },
    spread: { value: disk.outer / disk.inner },
    depth: { value: disk.depth },
    warmth: { value: glow.warmth },
    grit: { value: seed % 1000 },
    tint: { value: new Color(DUST).lerp(new Color(FROST), disk.ice) },
    near: { value: glow.near },
    far: { value: glow.far },
  };
  const sheet = new Mesh(
    geometry,
    new ShaderMaterial({
      vertexShader: SHEET_VERTEX,
      fragmentShader: SHEET_FRAGMENT,
      uniforms,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  sheet.frustumCulled = false;
  return sheet;
}
