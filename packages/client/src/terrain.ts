import {
  type Body,
  createGround,
  depthOf,
  type Ground,
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
import { bodyFragment, TILE_VERTEX } from "./shaders.ts";
import type { Space } from "./space.ts";
import { type Ask, aim, type Made, TILE_BOUND, TILE_GRID, TILE_SIDE, TILE_SKIRT } from "./tile.ts";

export interface Terrain {
  update(): void;
  body(): number | null;
  clearance(): number;
  shown(): number;
  waiting(): number;
}

const SPLIT = 1.4;
const WAKE = 0.5;
const SLEEP = 0.65;
const KEPT = 1000;
const CREW_MOST = 4;
const MAP_SIZE = 512;
const GRIT_MOST = 4096;
const EYE_LEAST = 1.5;
const EYE_PATCH = 60;
const EYE_SHARE = 0.05;
const CLOUD_LOW = 5000;
const CLOUD_HIGH = 60000;
const FIELD_LOW = 3.1;

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
  asked: boolean;
  seen: number;
}

interface Order {
  node: Node;
  body: Body;
  into: Group;
}

function laced(): Uint16Array {
  const order: number[] = [];
  for (let row = 0; row < TILE_CELLS; row++) {
    for (let column = 0; column < TILE_CELLS; column++) {
      const from = row * TILE_SIDE + column;
      order.push(
        from,
        from + 1,
        from + TILE_SIDE,
        from + 1,
        from + TILE_SIDE + 1,
        from + TILE_SIDE,
      );
    }
  }
  const edges = [
    (step: number) => step,
    (step: number) => (TILE_SIDE - 1) * TILE_SIDE + step,
    (step: number) => step * TILE_SIDE,
    (step: number) => step * TILE_SIDE + TILE_SIDE - 1,
  ];
  edges.forEach((edge, side) => {
    for (let step = 0; step < TILE_CELLS; step++) {
      const low = TILE_GRID + side * TILE_SIDE + step;
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

  let near: Body | null = null;
  let group: Group | null = null;
  let roots: Node[] = [];
  let materials: (ShaderMaterial | null)[] = [];
  let clouds: Vector2[] = [];
  let built: Node[] = [];
  let ready = false;
  let frame = 0;
  let clear = Number.POSITIVE_INFINITY;
  let drawn = 0;
  let pending = 0;
  let ticket = 0;
  let queue: Node[] = [];
  let under: { at: Vector3; reach: number; ground: Ground } | null = null;
  const orders = new Map<number, Order>();

  const squashOf = (body: Body) => 1 - groundFlat(body.physics);

  const nodeOf = (body: Body, face: number, level: number, column: number, row: number): Node => {
    const span = 2 / 2 ** level;
    const heading = new Vector3(...aim(face, -1 + span * (column + 0.5), -1 + span * (row + 0.5)));
    const { radius } = body.physics;
    return {
      face,
      level,
      column,
      row,
      heading,
      centre: new Vector3(heading.x, squashOf(body) * heading.y, heading.z).multiplyScalar(radius),
      edge: (radius * Math.PI) / (2 * 2 ** level),
      angle: (TILE_BOUND * Math.PI) / (2 * 2 ** level),
      kids: null,
      mesh: null,
      asked: false,
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

  const raise = ({ node, body, into }: Order, made: Made) => {
    const [x, y, z] = made.origin;
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(made.position, 3));
    geometry.setAttribute("normal", new BufferAttribute(made.normal, 3));
    geometry.setAttribute("heading", new BufferAttribute(made.heading, 3));
    geometry.setAttribute("grit", new BufferAttribute(made.grit, 3));
    geometry.setIndex(order);
    geometry.boundingSphere = new Sphere(
      new Vector3(),
      ((TILE_BOUND + TILE_SKIRT) * node.edge) / unit,
    );
    const mesh = new Mesh(geometry, materialOf(body, node.level));
    mesh.position.set(x / unit, y / unit, z / unit);
    mesh.visible = false;
    into.add(mesh);
    node.mesh = mesh;
    node.centre.set(x, y, z);
    built.push(node);
  };

  const crew = Array.from(
    { length: Math.max(1, Math.min(CREW_MOST, (navigator.hardwareConcurrency ?? 2) - 1)) },
    () => {
      const hand = {
        worker: new Worker(new URL("./tiler.ts", import.meta.url), { type: "module" }),
        busy: false,
      };
      hand.worker.addEventListener("message", (event: MessageEvent<Made>) => {
        hand.busy = false;
        const made = event.data;
        const known = orders.get(made.ticket);
        orders.delete(made.ticket);
        if (known !== undefined && known.into === group) {
          known.node.asked = false;
          raise(known, made);
        }
        feed();
        space.invalidate();
      });
      return hand;
    },
  );

  const ask = (body: Body, node: Node, into: Group): boolean => {
    const hand = crew.find((each) => !each.busy);
    if (hand === undefined) {
      return false;
    }
    ticket += 1;
    orders.set(ticket, { node, body, into });
    node.asked = true;
    hand.busy = true;
    const request: Ask = {
      ticket,
      body: { seed: body.seed, relief: body.relief, physics: body.physics },
      flat: squashOf(body),
      unit,
      face: node.face,
      level: node.level,
      column: node.column,
      row: node.row,
    };
    hand.worker.postMessage(request);
    return true;
  };

  function feed(): void {
    while (near !== null && group !== null && queue.length > 0) {
      const node = queue[0];
      if (node.mesh === null && !node.asked && !ask(near, node, group)) {
        return;
      }
      queue.shift();
    }
  }

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
    orders.clear();
    queue = [];
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
        const gap = Math.max(0, eye.distanceTo(node.centre) - TILE_BOUND * node.edge);
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
      queue = wanted;
      feed();
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
