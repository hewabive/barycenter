import { createRandom, type Disk, EARTH_MASS, type Lane } from "@barycenter/sim";
import { BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial } from "three";
import { BELT_FRAGMENT, BELT_VERTEX } from "./shaders.ts";

export interface Belt {
  points: Points;
  turn(tick: number, dense: number): void;
}

const ROCK = 0x8a8076;
const ICE = 0xcdd6dd;
const LEAN = 0.06;
const LEAST = 300;
const MOST = 1800;

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
    turn(tick, dense) {
      uniforms.tick.value = tick;
      uniforms.dense.value = dense;
    },
  };
}
