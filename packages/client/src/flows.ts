import {
  type Body,
  GRAVITY,
  lobeOf,
  lobeShape,
  type Sketch,
  starborn,
  streamOf,
  YEAR,
} from "@barycenter/sim";
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  type Camera,
  Color,
  CylinderGeometry,
  DoubleSide,
  IcosahedronGeometry,
  Matrix4,
  Mesh,
  type Quaternion,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
} from "three";
import { emberOf } from "./looks.ts";
import {
  GUSH_FRAGMENT,
  GUSH_VERTEX,
  HUSK_FRAGMENT,
  HUSK_VERTEX,
  WHIRL_FRAGMENT,
  WHIRL_TALL,
  WHIRL_VERTEX,
} from "./shaders.ts";

const SHAPED_FROM = 0.5;
const FULL_FROM = 0.98;
const RADIATION = 5.670374e-8;
const WHIRL_REACH = 0.45;
const WHIRL_ROOM = 1.6;
const WHIRL_HOLE = 0.04;
const WHIRL_MIGHT = 5;
const WHIRL_TURNS = 3;
const LIT_SHARE = 0.68;
const GAS_GLOW = [0.5, 0.125, 0.1];
const GUSH_GIRTH = [0.012, 0.022];
const GUSH_MIGHT = 0.9;
const GUSH_KNOTS = 2;
const GUSH_INTO = 0.7;
const HUSK_YEARS = 5e4;
const HUSK_THIN = 0.12;
const HUSK_MIGHT = 1;
const HUSK_WARM = [1, 0.3, 0.24];
const HUSK_KEEN = [0.22, 0.8, 0.66];
const HUSK_HOT = 25000;

export interface Mate {
  body: Body;
  share: number;
  apart: number;
}

export interface Molded {
  geometry: BufferGeometry;
  girth: number;
  least: number;
}

export interface Gush {
  meshes: Mesh[];
  place(from: Vector3, to: Vector3, stance: Quaternion): void;
  turn(tick: number): void;
  dispose(): void;
}

export interface Husk {
  mesh: Mesh;
  dispose(): void;
}

export function mateOf(system: Sketch, body: Body): Mate | null {
  if (!starborn(body.physics) || body.lobe <= 0) {
    return null;
  }
  const inner = system.bodies
    .filter((other) => other.parent === body.id && starborn(other.physics) && other.lobe > 0)
    .sort((left, right) => left.physics.orbit - right.physics.orbit)[0];
  const outer = body.parent === null ? undefined : system.bodies[body.parent];
  const mate = inner ?? (outer !== undefined && starborn(outer.physics) ? outer : undefined);
  if (mate === undefined) {
    return null;
  }
  const apart = mate.parent === body.id ? mate.orbit : body.orbit;
  return { body: mate, share: body.physics.mass / mate.physics.mass, apart };
}

export function molded(body: Body, mate: Mate | null, ball: BufferGeometry): Molded | null {
  if (mate === null || body.lobe < SHAPED_FROM) {
    return null;
  }
  const full = body.lobe >= FULL_FROM;
  const lobe = lobeShape(mate.share, full ? 1 : body.lobe);
  const from = ball.getAttribute("position");
  const places = new Float32Array(3 * from.count);
  const leans = new Float32Array(3 * from.count);
  const known = new Map<string, number[]>();
  for (let index = 0; index < from.count; index++) {
    const [x, y, z] = [from.getX(index), from.getY(index), from.getZ(index)];
    const key = `${x.toFixed(5)},${y.toFixed(5)},${z.toFixed(5)}`;
    let made = known.get(key);
    if (made === undefined) {
      const reach = lobe.at(x, -z, y) / lobe.mean;
      const [east, north, up] = lobe.out(x, -z, y);
      made = [x * reach, y * reach, z * reach, east, up, -north];
      known.set(key, made);
    }
    places.set(made.slice(0, 3), 3 * index);
    leans.set(made.slice(3), 3 * index);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(places, 3));
  geometry.setAttribute("normal", new BufferAttribute(leans, 3));
  geometry.computeBoundingSphere();
  return {
    geometry,
    girth: full ? lobe.mean * mate.apart : body.radius,
    least: lobe.least / lobe.mean,
  };
}

function ribbonOf(path: { x: number; y: number }[]): BufferGeometry {
  const lengths = [0];
  for (let at = 1; at < path.length; at++) {
    const step = Math.hypot(path[at].x - path[at - 1].x, path[at].y - path[at - 1].y);
    lengths.push(lengths[at - 1] + step);
  }
  const whole = Math.max(lengths[lengths.length - 1], 1e-9);
  const places: number[] = [];
  const aheads: number[] = [];
  const seats: number[] = [];
  const order: number[] = [];
  for (const [at, point] of path.entries()) {
    const before = path[Math.max(0, at - 1)];
    const after = path[Math.min(path.length - 1, at + 1)];
    const long = Math.max(Math.hypot(after.x - before.x, after.y - before.y), 1e-9);
    for (const side of [-1, 1]) {
      places.push(point.x, 0, -point.y);
      aheads.push((after.x - before.x) / long, 0, -(after.y - before.y) / long);
      seats.push(side, lengths[at] / whole);
    }
    if (at > 0) {
      const base = 2 * at;
      order.push(base - 2, base - 1, base, base, base - 1, base + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(places), 3));
  geometry.setAttribute("ahead", new BufferAttribute(new Float32Array(aheads), 3));
  geometry.setAttribute("seat", new BufferAttribute(new Float32Array(seats), 2));
  geometry.setIndex(order);
  return geometry;
}

function gasTint(kelvin: number): Color {
  const [red, green, blue] = emberOf(Math.max(kelvin, 1));
  const shine = Math.min(1, (kelvin / 3000) ** 4);
  return new Color(
    Math.max(GAS_GLOW[0], red * shine),
    Math.max(GAS_GLOW[1], green * shine),
    Math.max(GAS_GLOW[2], blue * shine),
  );
}

export function createGush(giver: Body, taker: Body, girth: number, tone: Color): Gush | null {
  const going = giver.passages.find(({ kind, until }) => kind === "gave" && until === null);
  const apart = taker.parent === giver.id ? taker.orbit : giver.orbit;
  if (going === undefined || apart <= 0) {
    return null;
  }
  const share = giver.physics.mass / taker.physics.mass;
  const reach = WHIRL_REACH * lobeOf(1 / share);
  const core = taker.radius / apart;
  const whirled = reach > WHIRL_ROOM * core;
  const path = streamOf(share, whirled ? GUSH_INTO * reach : core);
  const flow = { value: 0 };
  const stream = new Mesh(
    ribbonOf(path),
    new ShaderMaterial({
      vertexShader: GUSH_VERTEX,
      fragmentShader: GUSH_FRAGMENT,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      uniforms: {
        girth: { value: new Vector2(GUSH_GIRTH[0], GUSH_GIRTH[1]) },
        tint: { value: tone.clone().lerp(new Color(...GAS_GLOW).multiplyScalar(2), 0.5) },
        flow,
        might: { value: GUSH_MIGHT },
      },
    }),
  );
  stream.frustumCulled = false;
  const meshes = [stream];
  const turn = { value: 0 };
  const eye = new Vector3();
  let wide = 0;
  if (whirled) {
    const { mass, radius, heat } = taker.physics;
    const far = reach * (taker.parent === giver.id ? taker : giver).physics.orbit;
    const hole = Math.max(core, WHIRL_HOLE * reach) / reach;
    const fed = going.rate;
    const warmth = (span: number) =>
      Math.max(
        ((3 * GRAVITY * mass * fed) / (8 * Math.PI * RADIATION * span ** 3)) ** 0.25,
        LIT_SHARE * heat * (radius / span) ** 0.75,
      );
    const end = path[path.length - 1];
    const whirl = new Mesh(
      new CylinderGeometry(1, 1, 2 * WHIRL_TALL, 40, 1, false),
      new ShaderMaterial({
        vertexShader: WHIRL_VERTEX,
        fragmentShader: WHIRL_FRAGMENT,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        side: BackSide,
        uniforms: {
          eye: { value: eye },
          hot: { value: gasTint(warmth(hole * far)) },
          cool: { value: gasTint(warmth(far)) },
          screen: { value: new Vector4(-1 / reach, 0, 0, girth / (reach * apart)) },
          spot: { value: new Vector4((end.x - 1) / reach, 0, -end.y / reach, 0.7) },
          inner: { value: hole },
          heart: { value: core / reach },
          turn,
          might: { value: WHIRL_MIGHT },
        },
      }),
    );
    whirl.frustumCulled = false;
    whirl.onBeforeRender = (_renderer, _scene, camera: Camera) => {
      eye.copy(camera.position);
      whirl.worldToLocal(eye);
    };
    meshes.push(whirl);
    wide = reach;
  }
  const year = giver.parent === taker.id ? giver.year : taker.year;
  const pace = year > 0 ? (2 * Math.PI) / year : 0;
  return {
    meshes,
    place(from, to, stance) {
      const span = from.distanceTo(to);
      stream.position.copy(from);
      stream.quaternion.copy(stance);
      stream.scale.setScalar(span);
      if (meshes.length > 1) {
        meshes[1].position.copy(to);
        meshes[1].quaternion.copy(stance);
        meshes[1].scale.setScalar(wide * span);
      }
    },
    turn(tick) {
      flow.value = (GUSH_KNOTS * tick * pace) % 1;
      turn.value = (WHIRL_TURNS * tick * pace) % (2 * Math.PI);
    },
    dispose() {
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        (mesh.material as ShaderMaterial).dispose();
      }
    },
  };
}

export function stanceOf(from: Vector3, to: Vector3, pole: Vector3, into: Quaternion): Quaternion {
  const east = new Vector3().subVectors(to, from).normalize();
  const up = pole.clone().addScaledVector(east, -pole.dot(east)).normalize();
  const south = new Vector3().crossVectors(east, up);
  return into.setFromRotationMatrix(new Matrix4().makeBasis(east, up, south));
}

export function createHusk(body: Body): Husk | null {
  const { shell } = body;
  if (shell === null || shell.radius <= 0) {
    return null;
  }
  const age = shell.since / (HUSK_YEARS * YEAR);
  const lit = body.physics.heat >= HUSK_HOT;
  const mesh = new Mesh(
    new IcosahedronGeometry(1, 12),
    new ShaderMaterial({
      vertexShader: HUSK_VERTEX,
      fragmentShader: HUSK_FRAGMENT,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: BackSide,
      uniforms: {
        warm: { value: new Color(...HUSK_WARM) },
        keen: {
          value: lit ? new Color(...HUSK_KEEN) : new Color(...HUSK_WARM).multiplyScalar(0.5),
        },
        might: { value: HUSK_MIGHT * Math.max(0, 1 - age) ** 1.5 * (lit ? 1 : 0.4) },
        thin: { value: HUSK_THIN },
        salt: { value: body.seed >>> 0 },
      },
    }),
  );
  mesh.scale.setScalar(shell.radius);
  mesh.frustumCulled = false;
  return {
    mesh,
    dispose() {
      mesh.geometry.dispose();
      mesh.material.dispose();
    },
  };
}
