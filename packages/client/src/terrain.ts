import {
  type Body,
  createGround,
  depthOf,
  type Ground,
  grainOf,
  groundFlat,
  landable,
  type Survey,
  TILE_CELLS,
} from "@barycenter/sim";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  ShaderMaterial,
  Sphere,
  Vector2,
  Vector3,
} from "three";
import { bodyFragment, GRIT_SPAN, TILE_VERTEX } from "./shaders.ts";
import type { Space } from "./space.ts";

export interface Terrain {
  update(): void;
  body(): number | null;
  clearance(): number;
  shown(): number;
  waiting(): number;
}

const SPLIT = 1.6;
const WAKE = 0.5;
const SLEEP = 0.65;
const KEPT = 700;
const SKIRT = 0.12;
const BOUND = 0.8;
const MAP_SIZE = 512;
const GRIT_MOST = 4096;
const EYE_LEAST = 1.5;
const EYE_PATCH = 60;
const EYE_SHARE = 0.05;
const CLOUD_LOW = 5000;
const CLOUD_HIGH = 60000;
const BUDGET = 6;
const BUDGET_SHARE = 0.3;
const BUDGET_MOST = 80;
const FIELD_LOW = 3.1;
const SIDE = TILE_CELLS + 1;
const WIDE = SIDE + 2;
const GRID = SIDE * SIDE;
const COUNT = GRID + 4 * SIDE;

interface Node {
  face: number;
  level: number;
  column: number;
  row: number;
  heading: Vector3;
  centre: Vector3;
  edge: number;
  angle: number;
  kids: Node[] | null;
  mesh: Mesh<BufferGeometry, ShaderMaterial> | null;
  seen: number;
}

function aim(face: number, u: number, v: number, into: Vector3): Vector3 {
  const a = Math.tan((u * Math.PI) / 4);
  const b = Math.tan((v * Math.PI) / 4);
  if (face === 0) {
    into.set(1, b, -a);
  } else if (face === 1) {
    into.set(-1, b, a);
  } else if (face === 2) {
    into.set(a, 1, -b);
  } else if (face === 3) {
    into.set(a, -1, b);
  } else if (face === 4) {
    into.set(a, b, 1);
  } else {
    into.set(-a, b, -1);
  }
  return into.normalize();
}

function laced(): Uint16Array {
  const order: number[] = [];
  for (let row = 0; row < TILE_CELLS; row++) {
    for (let column = 0; column < TILE_CELLS; column++) {
      const from = row * SIDE + column;
      order.push(from, from + 1, from + SIDE, from + 1, from + SIDE + 1, from + SIDE);
    }
  }
  const edges = [
    (step: number) => step,
    (step: number) => (SIDE - 1) * SIDE + step,
    (step: number) => step * SIDE,
    (step: number) => step * SIDE + SIDE - 1,
  ];
  edges.forEach((edge, side) => {
    for (let step = 0; step < TILE_CELLS; step++) {
      const low = GRID + side * SIDE + step;
      order.push(edge(step), edge(step + 1), low, edge(step + 1), low + 1, low);
    }
  });
  return Uint16Array.from(order);
}

export function createTerrain(space: Space, system: Survey): Terrain {
  const { unit, bodies } = system;
  const solid = bodies.filter(landable);
  const order = new BufferAttribute(laced(), 1);
  const eye = new Vector3();
  const toward = new Vector3();
  const spot = new Vector3();
  const lift = new Vector3();
  const scratch = new Vector3();

  let near: Body | null = null;
  let group: Group | null = null;
  let roots: Node[] = [];
  let materials: (ShaderMaterial | null)[] = [];
  let built: Node[] = [];
  let ready = false;
  let frame = 0;
  let clear = Number.POSITIVE_INFINITY;
  let drawn = 0;
  let pending = 0;
  let updated = performance.now();
  let allowed = BUDGET;
  let under: { at: Vector3; reach: number; ground: Ground } | null = null;
  let clouds: Vector2[] = [];

  const squashOf = (body: Body) => 1 - groundFlat(body.physics);

  const nodeOf = (body: Body, face: number, level: number, column: number, row: number): Node => {
    const span = 2 / 2 ** level;
    const heading = aim(face, -1 + span * (column + 0.5), -1 + span * (row + 0.5), new Vector3());
    const { radius } = body.physics;
    return {
      face,
      level,
      column,
      row,
      heading,
      centre: new Vector3(heading.x, squashOf(body) * heading.y, heading.z).multiplyScalar(radius),
      edge: (radius * Math.PI) / (2 * 2 ** level),
      angle: (BOUND * Math.PI) / (2 * 2 ** level),
      kids: null,
      mesh: null,
      seen: 0,
    };
  };

  const materialOf = (body: Body, level: number): ShaderMaterial => {
    const known = materials[level];
    if (known) {
      return known;
    }
    const paint = space.paint(body.id);
    if (paint === null) {
      throw new Error(`${body.name} has no ground to paint`);
    }
    const edge = (body.physics.radius * Math.PI) / (2 * 2 ** level);
    const deck = new Vector2().copy(paint.deck.value as Vector2);
    clouds.push(deck);
    const made = new ShaderMaterial({
      vertexShader: TILE_VERTEX,
      fragmentShader: bodyFragment(false),
      defines: { ...space.defines, TILED: "" },
      side: DoubleSide,
      uniforms: {
        ...paint,
        relish: {
          value: (paint.relish.value as number) * Math.min(1, MAP_SIZE / (TILE_CELLS * 2 ** level)),
        },
        squash: { value: 1 / squashOf(body) },
        deck: { value: deck },
        gritty: { value: edge < GRIT_MOST ? 1 : 0 },
      },
    });
    materials[level] = made;
    return made;
  };

  const places = new Float64Array(3 * WIDE * WIDE);
  const headings = new Float64Array(3 * WIDE * WIDE);
  const build = (body: Body, node: Node, into: Group) => {
    const { radius } = body.physics;
    const flat = squashOf(body);
    const wet = body.relief.sea !== null;
    const span = 2 / 2 ** node.level;
    const ground = createGround(
      body,
      node.heading,
      (BOUND * Math.PI) / (2 * 2 ** node.level),
      grainOf(radius, node.level),
    );
    for (let row = 0; row < WIDE; row++) {
      for (let column = 0; column < WIDE; column++) {
        const at = aim(
          node.face,
          -1 + span * (node.column + (column - 1) / TILE_CELLS),
          -1 + span * (node.row + (row - 1) / TILE_CELLS),
          scratch,
        );
        const height = ground(at.x, at.y, at.z);
        const far = radius + (wet ? Math.max(0, height) : height);
        const base = 3 * (row * WIDE + column);
        headings[base] = at.x;
        headings[base + 1] = at.y;
        headings[base + 2] = at.z;
        places[base] = at.x * far;
        places[base + 1] = flat * at.y * far;
        places[base + 2] = at.z * far;
      }
    }
    const middle = 3 * ((WIDE * WIDE - 1) / 2);
    const originX = places[middle];
    const originY = places[middle + 1];
    const originZ = places[middle + 2];
    const tread = (value: number) => Math.floor(value / GRIT_SPAN) * GRIT_SPAN;
    const treadX = tread(originX);
    const treadY = tread(originY);
    const treadZ = tread(originZ);
    const position = new Float32Array(3 * COUNT);
    const normal = new Float32Array(3 * COUNT);
    const heading = new Float32Array(3 * COUNT);
    const grit = new Float32Array(3 * COUNT);
    const drop = SKIRT * node.edge;
    const write = (slot: number, row: number, column: number, sink: number) => {
      const base = 3 * ((row + 1) * WIDE + column + 1);
      const east = base + 3;
      const west = base - 3;
      const north = base + 3 * WIDE;
      const south = base - 3 * WIDE;
      const ax = places[east] - places[west];
      const ay = places[east + 1] - places[west + 1];
      const az = places[east + 2] - places[west + 2];
      const bx = places[north] - places[south];
      const by = places[north + 1] - places[south + 1];
      const bz = places[north + 2] - places[south + 2];
      const nx = ay * bz - az * by;
      const ny = az * bx - ax * bz;
      const nz = ax * by - ay * bx;
      const length = Math.hypot(nx, ny, nz);
      const x = places[base] - sink * headings[base];
      const y = places[base + 1] - sink * flat * headings[base + 1];
      const z = places[base + 2] - sink * headings[base + 2];
      const out = 3 * slot;
      position[out] = (x - originX) / unit;
      position[out + 1] = (y - originY) / unit;
      position[out + 2] = (z - originZ) / unit;
      normal[out] = nx / length;
      normal[out + 1] = ny / length;
      normal[out + 2] = nz / length;
      heading[out] = headings[base];
      heading[out + 1] = headings[base + 1];
      heading[out + 2] = headings[base + 2];
      grit[out] = places[base] - treadX;
      grit[out + 1] = places[base + 1] - treadY;
      grit[out + 2] = places[base + 2] - treadZ;
    };
    for (let row = 0; row < SIDE; row++) {
      for (let column = 0; column < SIDE; column++) {
        write(row * SIDE + column, row, column, 0);
      }
    }
    for (let step = 0; step < SIDE; step++) {
      write(GRID + step, 0, step, drop);
      write(GRID + SIDE + step, SIDE - 1, step, drop);
      write(GRID + 2 * SIDE + step, step, 0, drop);
      write(GRID + 3 * SIDE + step, step, SIDE - 1, drop);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(position, 3));
    geometry.setAttribute("normal", new BufferAttribute(normal, 3));
    geometry.setAttribute("heading", new BufferAttribute(heading, 3));
    geometry.setAttribute("grit", new BufferAttribute(grit, 3));
    geometry.setIndex(order);
    geometry.boundingSphere = new Sphere(new Vector3(), (BOUND * node.edge + drop) / unit);
    const mesh = new Mesh(geometry, materialOf(body, node.level));
    mesh.position.set(originX / unit, originY / unit, originZ / unit);
    mesh.visible = false;
    into.add(mesh);
    node.mesh = mesh;
    node.centre.set(originX, originY, originZ);
    built.push(node);
  };

  const drop = (node: Node) => {
    if (node.mesh !== null) {
      node.mesh.removeFromParent();
      node.mesh.geometry.dispose();
      node.mesh = null;
    }
  };

  const leave = () => {
    if (near !== null) {
      space.bare(near.id, false);
      space.sharpen(null);
    }
    built.forEach(drop);
    for (const material of materials) {
      material?.dispose();
    }
    group?.removeFromParent();
    near = null;
    group = null;
    roots = [];
    materials = [];
    clouds = [];
    built = [];
    ready = false;
    under = null;
    clear = Number.POSITIVE_INFINITY;
    drawn = 0;
    pending = 0;
  };

  const enter = (body: Body) => {
    leave();
    near = body;
    group = new Group();
    space.frame(body.id).add(group);
    space.sharpen(body.id);
    roots = [0, 1, 2, 3, 4, 5].map((face) => nodeOf(body, face, 0, 0, 0));
  };

  space.onClearance(() => clear / unit);

  return {
    body: () => (ready && near !== null ? near.id : null),
    clearance: () => clear,
    shown: () => drawn,
    waiting: () => pending,
    update() {
      const { camera } = space;
      const now = performance.now();
      allowed = Math.max(BUDGET, Math.min(BUDGET_MOST, BUDGET_SHARE * (now - updated)));
      updated = now;
      let closest: Body | null = null;
      let least = Number.POSITIVE_INFINITY;
      for (const body of solid) {
        space.frame(body.id).getWorldPosition(spot);
        const high = spot.distanceTo(camera.position) / body.radius - 1;
        if (high < least) {
          least = high;
          closest = body;
        }
      }
      if (near !== null && (closest !== near || least > SLEEP)) {
        leave();
      }
      if (near === null && closest !== null && least < WAKE && space.paint(closest.id) !== null) {
        enter(closest);
      }
      if (near === null || group === null) {
        return;
      }
      const body = near;
      const into = group;
      const { radius } = body.physics;
      const flat = squashOf(body);
      const anchor = space.frame(body.id);
      eye.copy(camera.position);
      anchor.worldToLocal(eye).multiplyScalar(unit);

      toward.set(eye.x, eye.y / flat, eye.z).normalize();
      if (under === null || under.at.distanceTo(toward) * radius > under.reach / 2) {
        const reach = Math.max(EYE_PATCH, Number.isFinite(clear) ? EYE_SHARE * clear : 0);
        under = {
          at: toward.clone(),
          reach,
          ground: createGround(body, toward, reach / radius),
        };
      }
      const height = under.ground(toward.x, toward.y, toward.z);
      const stretch = Math.hypot(toward.x, flat * toward.y, toward.z);
      const floor = stretch * (radius + (body.relief.sea === null ? height : Math.max(0, height)));
      clear = eye.length() - floor;
      if (ready && clear < EYE_LEAST) {
        lift
          .copy(eye)
          .normalize()
          .transformDirection(anchor.matrixWorld)
          .multiplyScalar((EYE_LEAST - clear) / unit);
        camera.position.add(lift);
        camera.updateMatrixWorld();
        eye.copy(camera.position);
        anchor.worldToLocal(eye).multiplyScalar(unit);
        clear = EYE_LEAST;
        space.invalidate();
      }

      const paint = space.paint(body.id);
      const cloudy = paint === null ? 0 : (paint.deck.value as Vector2).x;
      const veiled = Math.max(0, Math.min(1, (clear - CLOUD_LOW) / (CLOUD_HIGH - CLOUD_LOW)));
      for (const deck of clouds) {
        deck.x = cloudy * veiled;
      }

      const lowest = radius * flat - FIELD_LOW * body.relief.height - 0.12 * radius;
      const far = eye.length();
      const sight =
        Math.acos(Math.min(1, lowest / far)) +
        Math.acos(Math.min(1, lowest / (radius + FIELD_LOW * body.relief.height)));
      toward.copy(eye).normalize();
      const hidden = (node: Node) => toward.angleTo(node.heading) > sight + node.angle;
      const deepest = depthOf(radius);
      frame += 1;
      for (const node of built) {
        if (node.mesh !== null) {
          node.mesh.visible = false;
        }
      }
      const wanted: Node[] = [];
      drawn = 0;
      const visit = (node: Node) => {
        node.seen = frame;
        if (hidden(node)) {
          return;
        }
        const gap = Math.max(0, eye.distanceTo(node.centre) - BOUND * node.edge);
        if (node.level < deepest && gap < SPLIT * node.edge) {
          node.kids ??= [0, 1, 2, 3].map((quarter) =>
            nodeOf(
              body,
              node.face,
              node.level + 1,
              2 * node.column + (quarter & 1),
              2 * node.row + (quarter >> 1),
            ),
          );
          for (const kid of node.kids) {
            kid.seen = frame;
          }
          const lacking = node.kids.filter((kid) => kid.mesh === null && !hidden(kid));
          if (lacking.length === 0) {
            node.kids.forEach(visit);
            return;
          }
          wanted.push(...lacking);
        }
        if (node.mesh !== null) {
          node.mesh.visible = true;
          drawn += 1;
        }
      };
      const bare = roots.filter((root) => root.mesh === null);
      if (bare.length > 0) {
        wanted.push(...bare);
      } else {
        if (!ready) {
          ready = true;
          space.bare(body.id, true);
        }
        roots.forEach(visit);
      }
      wanted.sort(
        (left, right) =>
          left.level - right.level ||
          eye.distanceToSquared(left.centre) - eye.distanceToSquared(right.centre),
      );
      pending = wanted.length;
      const started = performance.now();
      for (const node of wanted) {
        build(body, node, into);
        pending -= 1;
        if (performance.now() - started > allowed) {
          break;
        }
      }
      if (wanted.length > 0) {
        space.invalidate();
      }
      if (built.length > KEPT) {
        built.sort((left, right) => right.seen - left.seen || left.level - right.level);
        for (const node of built.splice(KEPT)) {
          if (node.level === 0 || node.seen === frame) {
            built.push(node);
          } else {
            drop(node);
          }
        }
      }
    },
  };
}
