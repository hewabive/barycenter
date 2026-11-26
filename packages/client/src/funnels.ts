import { type Body, createRandom, type Fall, type Field } from "@barycenter/sim";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  RingGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
} from "three";
import { emberOf } from "./looks.ts";
import { FUNNEL_FRAGMENT, GUSH_VERTEX, SPOT_FRAGMENT, SPOT_VERTEX } from "./shaders.ts";

const FUNNEL_STEPS = 28;
const FUNNEL_GIRTH = [0.2, -0.12];
const FUNNEL_GLOW = [0.5, 0.125, 0.1];
const FUNNEL_MIGHT = 0.9;
const FUNNEL_FALL = 0.1;
const FUNNEL_LEAN = (70 * Math.PI) / 180;
const FUNNEL_ROOM = 1.15;
const SPOT_LIFT = 1.006;
const SPOT_LEAST = 0.09;
const SPOT_MIGHT = 1.4;
const SPOT_FLICKER = [0.25, 7, 2.6];

export interface Funnels {
  group: Group;
  turn(tick: number): void;
  dispose(): void;
}

export function funnelPath(hole: number, lean: number, toward: number): Vector3[] {
  const axis = new Vector3(
    Math.sin(lean) * Math.cos(toward),
    Math.cos(lean),
    Math.sin(lean) * Math.sin(toward),
  );
  const start = new Vector3(Math.cos(toward), 0, Math.sin(toward));
  const from = Math.PI / 2 - lean;
  const across = start.clone().addScaledVector(axis, -Math.cos(from)).divideScalar(Math.sin(from));
  const shell = hole / Math.sin(from) ** 2;
  const foot = Math.asin(Math.sqrt(1 / shell));
  return Array.from({ length: FUNNEL_STEPS + 1 }, (_, step) => {
    const angle = from + ((foot - from) * step) / FUNNEL_STEPS;
    const far = shell * Math.sin(angle) ** 2;
    return axis
      .clone()
      .multiplyScalar(far * Math.cos(angle))
      .addScaledVector(across, far * Math.sin(angle));
  });
}

function ribbonOf(paths: Vector3[][]): BufferGeometry {
  const places: number[] = [];
  const aheads: number[] = [];
  const seats: number[] = [];
  const order: number[] = [];
  for (const path of paths) {
    const first = places.length / 3;
    path.forEach((point, at) => {
      const ahead = (path[at + 1] ?? point)
        .clone()
        .sub(path[at - 1] ?? point)
        .normalize();
      for (const side of [-1, 1]) {
        places.push(point.x, point.y, point.z);
        aheads.push(ahead.x, ahead.y, ahead.z);
        seats.push(side, at / (path.length - 1));
      }
      if (at > 0) {
        const base = first + 2 * at;
        order.push(base - 2, base - 1, base, base, base - 1, base + 1);
      }
    });
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(places), 3));
  geometry.setAttribute("ahead", new BufferAttribute(new Float32Array(aheads), 3));
  geometry.setAttribute("seat", new BufferAttribute(new Float32Array(seats), 2));
  geometry.setIndex(order);
  return geometry;
}

export function createFunnels(star: Body, fall: Fall, field: Field, hole: number): Funnels | null {
  if (hole < FUNNEL_ROOM || star.day <= 0) {
    return null;
  }
  const random = createRandom(star.seed + 389);
  const toward = 2 * Math.PI * random.next();
  const north = funnelPath(hole, Math.min(field.tilt, FUNNEL_LEAN), toward);
  const south = north.map((point) => point.clone().negate());
  const flow = { value: 0 };
  const might = { value: SPOT_MIGHT };
  const streams = new Mesh(
    ribbonOf([north, south]),
    new ShaderMaterial({
      vertexShader: GUSH_VERTEX,
      fragmentShader: FUNNEL_FRAGMENT,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      uniforms: {
        girth: { value: new Vector2(FUNNEL_GIRTH[0], FUNNEL_GIRTH[1]) },
        tint: { value: new Color(...FUNNEL_GLOW) },
        flow,
        might: { value: FUNNEL_MIGHT },
      },
    }),
  );
  streams.frustumCulled = false;
  const disc = new RingGeometry(0, 1, 24, 6);
  const wide = Math.max(SPOT_LEAST, Math.acos(1 - Math.min(1, fall.spots)));
  const glow = new ShaderMaterial({
    vertexShader: SPOT_VERTEX,
    fragmentShader: SPOT_FRAGMENT,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    uniforms: {
      tint: { value: new Color(...emberOf(fall.heat)) },
      might,
      cap: { value: new Vector2(Math.tan(wide), SPOT_LIFT) },
    },
  });
  const spots = [north, south].map((path) => {
    const spot = new Mesh(disc, glow);
    const foot = path[path.length - 1].clone().normalize();
    spot.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), foot);
    spot.frustumCulled = false;
    return spot;
  });
  const group = new Group();
  group.add(streams, ...spots);
  const phase = 2 * Math.PI * random.next();
  const [depth, fast, slow] = SPOT_FLICKER;
  return {
    group,
    turn(tick) {
      const turns = tick / star.day;
      flow.value = (turns / FUNNEL_FALL) % 1;
      might.value =
        SPOT_MIGHT *
        (1 - depth + depth * Math.sin(fast * turns + phase) * Math.sin(slow * turns + 2 * phase));
    },
    dispose() {
      streams.geometry.dispose();
      streams.material.dispose();
      disc.dispose();
      glow.dispose();
    },
  };
}
