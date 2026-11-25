import {
  anomalyOf,
  type Body,
  centreOf,
  clearedBy,
  courseOf,
  createRandom,
  type Disk,
  dustLight,
  heatAt,
  inflowOf,
  poleOf,
  poseOf,
  positionOf,
  type Ridge,
  ridgeOf,
  type Sketch,
  SUN_MASS,
  seenGlow,
  shownLight,
  spinOf,
  starborn,
  swayOf,
  thinningOf,
  YEAR,
} from "@barycenter/sim";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  type CubeTexture,
  Euler,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineLoop,
  PerspectiveCamera,
  Points,
  Quaternion,
  Raycaster,
  Scene,
  ShaderMaterial,
  Sphere,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createBelt, createHaze, createJet, createMist, createSwarm } from "./belts.ts";
import { createLooks, type Look, type Paint } from "./bodies.ts";
import { el } from "./dom.ts";
import { createGush, createHusk, stanceOf } from "./flows.ts";
import type { Layer } from "./haze.ts";
import { holeOf } from "./looks.ts";
import { ORBIT, SKY } from "./palette.ts";
import {
  LENS_ROOM,
  SCREEN_ROOM,
  SKY_FRAGMENT,
  SKY_VERTEX,
  SPECK_FRAGMENT,
  SPECK_VERTEX,
} from "./shaders.ts";

export interface Probe {
  id: number;
  frame: Group;
}

export interface View {
  focus: number;
  camera: Vector3;
}

export interface Space {
  camera: PerspectiveCamera;
  labels: HTMLElement;
  world: Group;
  fore: Scene;
  surface: Group;
  relief: CubeTexture;
  defines: Record<string, string>;
  eye: Vector3;
  chart(): number;
  size(): { width: number; height: number };
  invalidate(): void;
  clock(tick: number, pace: number, weather?: number): void;
  lively(busy: () => boolean): void;
  onFrame(listener: (elapsed: number) => void): void;
  onPresent(listener: () => void): void;
  onResize(listener: (width: number, height: number) => void): void;
  onTap(listener: (at: Vector3 | null) => void): void;
  onFocus(listener: (id: number) => void): void;
  onArrange(listener: (shown: number) => void): void;
  onClaim(listener: (x: number, y: number) => boolean): void;
  focus(id: number, reach?: number): void;
  probe(radius: number): Probe;
  depth(near: number, far: number): void;
  visit(toward: Vector3): void;
  frame(id: number): Group;
  paint(id: number): Paint | null;
  bare(id: number, next: boolean): void;
  onClearance(listener: () => number): void;
  sharpen(id: number | null): void;
  plumb(up: Vector3 | null, share: number): void;
  view(): View;
  resume(view: View): void;
  dispose(): void;
}

interface Shift {
  from: number;
  to: number;
  share: number;
}

interface Glide {
  from: number;
  to: number;
  share: number;
  toward: Vector3 | null;
  start: Vector3 | null;
}

interface Press {
  id: number;
  x: number;
  y: number;
}

const FIELD_OF_VIEW = 40;
const CLICK_SLACK = 5;
const TAP_SLACK = 12;
const HANDHELD_FRAME = 30;
const APPROACH = 1.3;
const FARTHEST = 1400;
const FAR_VIEW = 2.4;
const HOME_VIEW = 3.3;
const PORTRAIT = 4.5;
const CHART_FULL = 5;
const CHART_GONE = 11;
const RIG_BASE = 16;
const RIG_PER_RADIUS = 14;
const RIG_SPAN = 4;
const RIG_CLEAR = 3.5;
const SHIFT_TIME = 0.7;
const GLIDE_TIME = 1.1;
const PICK_SHARE = 0.012;
const STARS = 2600;
const SKY_STAR = 1.6;
const ORBIT_STEPS = 256;
const ORBIT_CROWD = 3;
const NEAR_LEAST = 0.02;
const REAL_NEAR = 1e-5;
const GROUND_NEAR = 3e-8;
const REAL_ZOOM = 1.6;
const LABEL_GAP = 12;
const KIN_CLEARANCE = 70;
const NAME_WIDTH = 64;
const NAME_HEIGHT = 20;
const SUNLIT_TURN = 0.6;
const SUNLIT_LIFT = 0.3;
const STAR_CLEAR = 1.7;
const SWING_LEAST = 0.005;
const SWAY_LEAST = 0.03;
const HALO_SLACK = 1.1;
const BALL_SLACK = 1.5;
const WAKE_PIXELS = 7;
const SLEEP_PIXELS = 3.5;
const SPECK_PIXELS = 3;
const TRACK_GONE = 5;
const TRACK_FULL = 12;
const TRACK_SHADE = 0.55;
const HAZE_ORDER = 0.25;
const MIST_LAYER = 1;
const BELT_ORDER = 0.3;
const SWARM_HELD = [-4.5, -3.5];
const SWARM_LEAN = 0.3;
const SWARM_SHINE = 0.8;
const SPIRAL_FROM = [-2.7, -2.2];
const SPIRAL_GAIN = 0.7;
const JET_LEAST = (1e-8 * SUN_MASS) / YEAR;
const JET_LONG = 3;
const JET_GIRTH = 0.25;
const HAZE_BUBBLE = 6;
const HAZE_NEAR = [10, 30];
const TRACK_ORDER = 0.5;

function eased(share: number): number {
  return share * share * (3 - 2 * share);
}

function ramp(value: number, from: number, to: number): number {
  const share = (Math.log(value) - Math.log(from)) / (Math.log(to) - Math.log(from));
  return eased(Math.max(0, Math.min(1, share)));
}

function createSky(seed: number, size: number, lenses: Vector4[], echoes: number): Points[] {
  const random = createRandom(seed);
  const positions = new Float32Array(STARS * 3);
  const colors = new Float32Array(STARS * 3);
  const shade = new Color();
  for (let star = 0; star < STARS; star++) {
    const height = 2 * random.next() - 1;
    const around = 2 * Math.PI * random.next();
    const radius = Math.sqrt(1 - height * height);
    positions.set([radius * Math.cos(around), height, radius * Math.sin(around)], star * 3);
    const glow = 0.15 + 0.85 * random.next() ** 4;
    shade.setHSL(0.55 + 0.6 * random.next(), 0.35 * random.next(), 0.5).multiplyScalar(2 * glow);
    colors.set([shade.r, shade.g, shade.b], star * 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("shade", new Float32BufferAttribute(colors, 3));
  return Array.from({ length: 1 + echoes }, (_, pass) => {
    const sky = new Points(
      geometry,
      new ShaderMaterial({
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        uniforms: { size: { value: size }, lenses: { value: lenses }, echo: { value: pass - 1 } },
        depthTest: false,
        depthWrite: false,
      }),
    );
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    return sky;
  });
}

export function createSpace(stage: HTMLElement, system: Sketch, real = false): Space {
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  stage.append(renderer.domElement);
  const labels = el("div", { class: "labels" });
  stage.append(labels);
  labels.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      renderer.domElement.dispatchEvent(new WheelEvent(event.type, event));
    },
    { passive: false },
  );

  const coarse = window.matchMedia("(pointer: coarse)");
  const fine = coarse.matches ? 256 : 512;
  const rough = coarse.matches ? 64 : 128;

  const scene = new Scene();
  scene.background = new Color(SKY);
  const camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 0.1, 50);
  camera.position.set(0, 0.9, HOME_VIEW);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.zoomSpeed = (coarse.matches ? 1.5 : 2.5) * (real ? REAL_ZOOM : 1);
  controls.minDistance = APPROACH;
  const span = (id: number): number => {
    const { parent, orbit, physics } = system.bodies[id];
    return parent === null ? 0 : span(parent) + orbit * (1 + physics.stretch);
  };
  const brim = Math.max(
    ...system.bodies.map(
      (body) =>
        span(body.id) +
        Math.max(body.radius, body.shell?.radius ?? 0, ...body.disks.map((lane) => lane.outer)),
    ),
  );
  const outmost = Math.max(FARTHEST, FAR_VIEW * brim);
  controls.maxDistance = outmost;

  let stale = true;
  const invalidate = () => {
    stale = true;
  };
  const drawn = { position: new Vector3(), quaternion: new Quaternion() };
  controls.addEventListener("change", () => {
    stale =
      stale ||
      !camera.position.equals(drawn.position) ||
      !camera.quaternion.equals(drawn.quaternion);
  });

  const world = new Group();
  scene.add(world);
  const fore = new Scene();
  const range = { near: 1e-7, far: 1e-3 };
  const { looks, lamps: lit, tintOf } = createLooks(renderer, system);
  const holes = looks.filter((look) => holeOf(look.body.physics)).slice(0, LENS_ROOM);
  const lenses = Array.from({ length: LENS_ROOM }, () => new Vector4(0, 0, 0, 0));
  const dot = SKY_STAR * renderer.getPixelRatio();
  const skies = createSky(system.bodies[0].seed, dot, lenses, holes.length);
  scene.add(...skies);

  const sources = lit.map((list) => list.map((lamp) => lamp.source));
  const glares = lit.map((list) => list.map((lamp) => lamp.seen));
  const home = system.home === null ? null : looks[system.home];
  home?.refine(fine);
  const star = looks.find((look) => look.body.parent === null) ?? looks[0];
  star.refine(fine);
  const first = home ?? star;
  if (home === null) {
    camera.position.set(0, 0.35, 1).setLength(PORTRAIT * star.girth);
  } else if (real) {
    const here = positionOf(system, home.body.id, 0);
    const lamp = positionOf(system, sources[home.body.id][0] ?? star.body.id, 0);
    camera.position
      .set(lamp.x - here.x, lamp.y - here.y, lamp.z - here.z)
      .normalize()
      .applyAxisAngle(new Vector3(0, 1, 0), SUNLIT_TURN);
    camera.position.y += SUNLIT_LIFT;
    camera.position.setLength(HOME_VIEW);
  }
  for (const look of looks) {
    world.add(look.frame);
  }
  const sweepOf = (from: number, to: number) => {
    const apart = (tick: number) => {
      const [here, there] = [positionOf(system, from, tick), positionOf(system, to, tick)];
      return new Vector3(there.x - here.x, there.y - here.y, there.z - here.z);
    };
    const turned = apart(0).cross(apart(1e-3 * Math.max(1, system.bodies[to].year)));
    return turned.lengthSq() > 0 ? turned.normalize() : new Vector3(0, 1, 0);
  };
  const gushes = looks.flatMap((giver) => {
    const taker = giver.toward === null ? undefined : looks[giver.toward];
    const gush =
      taker === undefined ? null : createGush(giver.body, taker.body, giver.girth, giver.tone);
    if (gush === null || taker === undefined) {
      return [];
    }
    const child = taker.body.parent === giver.body.id ? taker.body.id : giver.body.id;
    const head = child === taker.body.id ? giver.body.id : taker.body.id;
    return [{ ...gush, giver, taker, sweep: sweepOf(head, child) }];
  });
  for (const gush of gushes) {
    for (const mesh of gush.meshes) {
      mesh.renderOrder = BELT_ORDER;
      world.add(mesh);
    }
  }
  const husks = looks.flatMap((owner) => {
    const husk = createHusk(owner.body);
    return husk === null ? [] : [{ ...husk, owner }];
  });
  for (const husk of husks) {
    husk.mesh.renderOrder = BELT_ORDER;
    world.add(husk.mesh);
  }
  const spots = new BufferAttribute(new Float32Array(3 * looks.length), 3);
  const girths = new BufferAttribute(new Float32Array(looks.length), 1);
  const lamps = new BufferAttribute(new Float32Array(3 * looks.length), 3);
  const specks = new BufferGeometry();
  specks.setAttribute("position", spots);
  specks.setAttribute("girth", girths);
  specks.setAttribute("lamp", lamps);
  const shines = new BufferAttribute(new Float32Array(4 * looks.length), 4);
  const embers = new BufferAttribute(new Float32Array(3 * looks.length), 3);
  const tinge = () => {
    looks.forEach(({ shine, dusk, ember }, index) => {
      shines.setXYZW(index, shine.r, shine.g, shine.b, dusk);
      embers.setXYZ(index, ember.r, ember.g, ember.b);
    });
    shines.needsUpdate = true;
    embers.needsUpdate = true;
  };
  tinge();
  specks.setAttribute("shine", shines);
  specks.setAttribute("ember", embers);
  specks.setAttribute(
    "tone",
    new BufferAttribute(new Float32Array(looks.flatMap(({ tone }) => [tone.r, tone.g, tone.b])), 3),
  );
  const speckMaterial = new ShaderMaterial({
    vertexShader: SPECK_VERTEX,
    fragmentShader: SPECK_FRAGMENT,
    uniforms: { scale: { value: 1 }, least: { value: SPECK_PIXELS } },
  });
  const dust = new Points(specks, speckMaterial);
  dust.frustumCulled = false;
  world.add(dust);
  const strewn = ({ body }: Look) =>
    body.physics.disks.flatMap((disk, index) =>
      disk.lasts === 0 ? [{ disk, index, lane: body.disks[index] }] : [],
    );
  const rooted = looks.filter((owner) => strewn(owner).length > 0);
  const leanOf = (owner: Look) => {
    const pole = poleOf(owner.body);
    return new Quaternion().setFromUnitVectors(
      new Vector3(0, 1, 0),
      new Vector3(pole.x, pole.y, pole.z),
    );
  };
  const insideOf = (owner: Look, disk: Disk, suns: boolean) =>
    system.bodies
      .filter(
        (body) =>
          body.parent === owner.body.id &&
          body.physics.orbit < disk.inner &&
          (!suns || starborn(body.physics)),
      )
      .sort((left, right) => right.physics.orbit - left.physics.orbit)[0]?.id ?? null;
  const belts = rooted.flatMap((owner) =>
    strewn(owner).map(({ disk, index, lane }) => {
      const { heat, radius } = owner.body.physics;
      const seen = seenGlow(heat) * ((2 * radius) / (disk.inner + disk.outer)) ** 2;
      const shine = tintOf(owner.body).multiplyScalar(shownLight([seen], 0).lamps[0]);
      const circling = system.bodies
        .filter((body) => body.parent === owner.body.id && !starborn(body.physics))
        .map((body) => body.physics);
      const cleared = disk.gas > 0 ? [] : clearedBy(disk, circling, owner.body.physics.mass);
      const seed = owner.body.seed + index;
      const cloud = createBelt(lane, disk, seed, shine, coarse.matches, cleared);
      cloud.points.quaternion.copy(leanOf(owner));
      cloud.points.renderOrder = BELT_ORDER;
      const hub = insideOf(owner, disk, true);
      return { ...cloud, about: insideOf(owner, disk, false), hub, owner };
    }),
  );
  const hazes = rooted.flatMap((owner) => {
    const { heat, radius, mass, glow } = owner.body.physics;
    const hubs = new Map<number | null, Layer[]>();
    for (const { disk, lane } of strewn(owner)) {
      const hub = insideOf(owner, disk, true);
      hubs.set(hub, [...(hubs.get(hub) ?? []), { lane, disk, thinned: 0 }]);
    }
    const seen = seenGlow(heat);
    const lit = (far: number) => seen * (radius / far) ** 2;
    return [...hubs].flatMap(([about, layers]) => {
      layers.sort((left, right) => left.disk.inner - right.disk.inner);
      const ridges: Ridge[] = [];
      const lanes: { planet: Body; inner: Layer; outer: Layer }[] = [];
      layers.forEach((layer, index) => {
        const beyond = layers[index + 1];
        if (beyond !== undefined && layer.disk.gas > 0 && beyond.disk.gas > 0) {
          const circling = system.bodies.filter(
            ({ parent, physics }) =>
              parent === owner.body.id &&
              physics.orbit > layer.disk.outer &&
              physics.orbit < beyond.disk.inner,
          );
          lanes.push(...circling.map((planet) => ({ planet, inner: layer, outer: beyond })));
          const between = circling.map(({ physics }) => physics);
          layer.thinned = between.reduce(
            (left, planet) => left * thinningOf(planet.mass, planet.orbit, mass, glow),
            1,
          );
          ridges.push(...between.map((planet) => ridgeOf(planet.mass, planet.orbit, mass, glow)));
        }
      });
      const haze = createHaze(
        layers,
        ridges,
        {
          girth: owner.body.radius,
          shine: tintOf(owner.body),
          level: (far) => dustLight(lit(far)),
          ember: (far) => shownLight([lit(far)], heat * Math.sqrt(radius / (2 * far))).glow,
        },
        coarse.matches,
      );
      if (haze === null) {
        return [];
      }
      haze.mesh.quaternion.copy(leanOf(owner));
      haze.mesh.layers.set(MIST_LAYER);
      const lamps = about === null ? [owner.body.id] : [owner.body.id, about];
      const swarms = lanes.map(({ planet, inner, outer }) => {
        const share = Math.log10(planet.physics.mass / mass);
        const held = Math.max(
          0,
          Math.min(1, (share - SWARM_HELD[0]) / (SWARM_HELD[1] - SWARM_HELD[0])),
        );
        const light = shownLight([lit(planet.physics.orbit)], 0).lamps[0];
        const swarm = createSwarm(
          { inner: inner.lane.outer, outer: outer.lane.inner, year: planet.year },
          planet.orbit,
          held,
          SWARM_LEAN * inner.disk.height,
          0.5 * (inner.disk.ice + outer.disk.ice),
          planet.seed,
          tintOf(owner.body).multiplyScalar(SWARM_SHINE * light),
          coarse.matches,
        );
        swarm.points.quaternion.copy(leanOf(owner));
        swarm.points.renderOrder = BELT_ORDER;
        swarm.veil(haze.shroud);
        const wake =
          SPIRAL_GAIN *
          Math.max(0, Math.min(1, (share - SPIRAL_FROM[0]) / (SPIRAL_FROM[1] - SPIRAL_FROM[0])));
        return { ...swarm, planet: planet.id, orbit: planet.orbit, wake, slot: -1 };
      });
      swarms
        .filter(({ wake }) => wake > 0)
        .sort((left, right) => right.wake - left.wake)
        .slice(0, haze.spirals.length)
        .forEach((swarm, slot) => {
          swarm.slot = slot;
        });
      const flow = starborn(owner.body.physics) ? inflowOf(owner.body) : 0;
      const strength = Math.min(1, Math.log10(Math.max(1, flow / JET_LEAST)));
      const jet =
        strength > 0 && about === null
          ? createJet(
              JET_LONG * haze.shroud.span.y,
              JET_GIRTH * owner.body.radius,
              layers[0].lane.year,
              strength,
              haze.shroud,
            )
          : null;
      if (jet !== null) {
        jet.mesh.renderOrder = BELT_ORDER;
        haze.mesh.add(jet.mesh);
      }
      return [{ ...haze, about, owner, lamps, swarms, jet }];
    });
  });
  for (const belt of belts) {
    world.add(belt.points);
  }
  for (const haze of hazes) {
    world.add(haze.mesh);
    for (const swarm of haze.swarms) {
      world.add(swarm.points);
    }
    for (const belt of belts) {
      if (belt.owner === haze.owner && belt.hub === haze.about) {
        belt.veil(haze.shroud);
      }
    }
  }
  const mist = hazes.length > 0 ? createMist() : null;
  if (mist !== null) {
    mist.mesh.renderOrder = HAZE_ORDER;
    scene.add(mist.mesh);
  }
  const veiled = Math.max(0, ...hazes.map((haze) => span(haze.owner.body.id) + haze.reach));
  renderer.domElement.addEventListener("webglcontextrestored", () => {
    for (const look of looks) {
      look.restore();
    }
    stale = true;
  });
  const defines: Record<string, string> =
    renderer.extensions.has("EXT_color_buffer_half_float") ||
    renderer.extensions.has("EXT_color_buffer_float")
      ? {}
      : { PACKED: "" };

  const halves = Array.from({ length: ORBIT_STEPS }, (_, step) => {
    const along = (2 * step) / ORBIT_STEPS - 1;
    const half = (Math.PI / 2) * Math.sign(along) * Math.abs(along) ** ORBIT_CROWD;
    return { sine: Math.sin(half), cosine: Math.cos(half) };
  });
  const traced = (source: Body, share: number) => {
    const oval = source.physics.stretch;
    const nearest = courseOf(source, 0);
    const beside = courseOf(source, Math.PI / 2);
    const major = new Vector3(nearest.x, nearest.y, nearest.z).multiplyScalar(share / (1 - oval));
    const minor = new Vector3(beside.x, beside.y, beside.z)
      .multiplyScalar(share)
      .addScaledVector(major, oval);
    const path = new BufferAttribute(new Float32Array(3 * ORBIT_STEPS), 3);
    const material = new LineBasicMaterial({ color: ORBIT, transparent: true, opacity: 0 });
    const line = new LineLoop(new BufferGeometry().setAttribute("position", path), material);
    line.frustumCulled = false;
    line.renderOrder = TRACK_ORDER;
    world.add(line);
    return {
      line,
      material,
      path,
      major,
      minor,
      oval,
      about: source.id,
      reach: Math.abs(share) * source.orbit,
      middle: new Vector3(),
      anomaly: 0,
      drawn: Number.NaN,
    };
  };
  const tracks = looks.flatMap(({ body }) => {
    if (body.parent === null || body.shared !== null) {
      return [];
    }
    const sway = swayOf(system, body.id);
    const own = traced(body, 1 - sway);
    return sway >= SWAY_LEAST ? [own, traced(body, -sway)] : [own];
  });

  const names = looks.map((look) => {
    const name = el("button", { class: "label body", type: "button" }, look.body.name);
    name.addEventListener("click", () => attend(look.body.id));
    labels.append(name);
    return name;
  });

  let tick = 0;
  let pace = 0;
  let weather: number | null = null;
  let since = performance.now();
  let chart = real ? 0 : 1;
  let busy = () => false;
  const shift: Shift = { from: first.body.id, to: first.body.id, share: 1 };
  let glide: Glide | null = null;
  const frameListeners: ((elapsed: number) => void)[] = [];
  const presentListeners: (() => void)[] = [];
  const resizeListeners: ((width: number, height: number) => void)[] = [];
  const tapListeners: ((at: Vector3 | null) => void)[] = [];
  const focusListeners: ((id: number) => void)[] = [];
  const arrangeListeners: ((shown: number) => void)[] = [];
  const claimListeners: ((x: number, y: number) => boolean)[] = [];
  const eye = new Vector3();
  const probes: { frame: Group; radius: number }[] = [];
  const lookOf = (id: number): Look | null => (id < looks.length ? looks[id] : null);
  const frameOf = (id: number) => lookOf(id)?.frame ?? probes[id - looks.length].frame;
  const girthOf = (id: number) => lookOf(id)?.body.radius ?? probes[id - looks.length].radius;

  let sharp: Look | null = null;
  const attend = (id: number, reach?: number) => {
    const look = lookOf(id);
    if (id !== shift.to) {
      const left = lookOf(shift.to);
      if (left !== null && left !== home && left !== star && left !== sharp) {
        left.refine(rough);
      }
      shift.from = shift.to;
      shift.to = id;
      shift.share = 0;
      look?.refine(fine);
      for (const listener of focusListeners) {
        listener(id);
      }
    }
    const usual =
      look === null
        ? PORTRAIT * girthOf(id)
        : id === system.home
          ? HOME_VIEW
          : PORTRAIT * look.girth;
    const wanted =
      reach === undefined ? usual : Math.min(outmost, Math.max(APPROACH * girthOf(id), reach));
    const turned = look !== null && id !== system.home && look.body.parent !== null;
    glide = {
      from: camera.position.length(),
      to: wanted,
      share: 0,
      toward: null,
      start: turned ? camera.position.clone().normalize() : null,
    };
    stale = true;
  };
  controls.addEventListener("start", () => {
    glide = null;
  });

  const place = new Vector3();
  const turn = new Euler(0, 0, 0, "YXZ");
  const twirl = new Quaternion();
  const spot = new Vector3();
  const pose = new Quaternion();
  const still = new Quaternion();
  const rig = new Quaternion();
  const places = looks.map(() => new Vector3());
  const tiny = looks.map(() => false);
  const swung = looks.map(
    ({ body }) => body.physics.hottest > (1 + SWING_LEAST) * body.physics.coldest,
  );
  const glaring = looks.filter((look) => look.halo > 0);
  const axis = new Vector3();
  const seat = new Vector3();
  const shaded = new Vector3();
  const stance = new Quaternion();
  const rays = [new Vector3(), new Vector3()];
  const facing = new Vector3();
  const sunlit = new Vector3();
  const swing = new Quaternion();
  const partway = new Quaternion();
  const upward = new Vector3(0, 1, 0);
  const clearances: (() => number)[] = [];
  const plumbed = { up: new Vector3(0, 1, 0), share: 0 };
  const stood = new Quaternion();
  const reachNow = () => {
    const from = girthOf(shift.from);
    return from + (girthOf(shift.to) - from) * eased(shift.share);
  };

  const arrange = (shown: number) => {
    for (const listener of arrangeListeners) {
      listener(shown);
    }
    const truly = looks.map((look) => positionOf(system, look.body.id, shown, true));
    for (const look of looks) {
      const at = positionOf(system, look.body.id, shown);
      look.frame.position.set(at.x, at.y, at.z);
      turn.set(look.body.tilt, look.body.swing, 0);
      twirl.setFromAxisAngle(upward, spinOf(look.body, shown));
      look.frame.quaternion.setFromEuler(turn).multiply(twirl);
    }
    for (const look of looks) {
      if (look.toward !== null) {
        const mate = looks[look.toward];
        const head = mate.body.parent === look.body.id ? look.body : mate.body;
        const pole = poleOf(head);
        axis.set(pole.x, pole.y, pole.z);
        stanceOf(look.frame.position, mate.frame.position, axis, look.frame.quaternion);
      }
    }
    for (const gush of gushes) {
      const [from, to] = [gush.giver.frame.position, gush.taker.frame.position];
      gush.place(from, to, stanceOf(from, to, gush.sweep, stance));
      gush.turn(shown);
    }
    for (const husk of husks) {
      husk.mesh.position.copy(husk.owner.frame.position);
    }
    for (const track of tracks) {
      const middle = centreOf(system, track.about, shown);
      const { shift: ahead } = poseOf(system, track.about, shown);
      track.anomaly = anomalyOf(system.bodies[track.about], shown, ahead);
      track.middle.set(middle.x, middle.y, middle.z);
      track.line.position
        .copy(track.middle)
        .addScaledVector(track.major, Math.cos(track.anomaly) - track.oval)
        .addScaledVector(track.minor, Math.sin(track.anomaly));
    }
    for (const belt of belts) {
      if (belt.about === null) {
        belt.points.position.copy(belt.owner.frame.position);
      } else {
        const middle = centreOf(system, belt.about, shown);
        belt.points.position.set(middle.x, middle.y, middle.z);
      }
    }
    for (const haze of hazes) {
      if (haze.about === null) {
        haze.mesh.position.copy(haze.owner.frame.position);
      } else {
        const middle = centreOf(system, haze.about, shown);
        haze.mesh.position.set(middle.x, middle.y, middle.z);
      }
      for (const swarm of haze.swarms) {
        swarm.points.position.copy(haze.mesh.position);
      }
    }

    const to = lookOf(shift.to);
    const share = eased(shift.share);
    const reach = reachNow();
    spot.copy(frameOf(shift.from).position).lerp(frameOf(shift.to).position, share);
    pose.copy(frameOf(shift.from).quaternion).slerp(frameOf(shift.to).quaternion, share);

    const distance = camera.position.length();
    const near = RIG_BASE + RIG_PER_RADIUS * reach;
    const away = real ? 1 : ramp(distance, near, near * RIG_SPAN);
    const loose = Math.min(outmost, Math.max(near * RIG_SPAN, RIG_CLEAR * spot.length()));
    const adrift = ramp(distance, loose / RIG_SPAN, loose);
    rig.copy(pose).slerp(still, away).invert();
    if (real && plumbed.share > 0) {
      rig.slerp(stood.setFromUnitVectors(plumbed.up, upward), plumbed.share);
    }
    world.quaternion.copy(rig);
    world.position
      .copy(spot)
      .multiplyScalar(adrift - 1)
      .applyQuaternion(rig);

    const homeward = shift.to === system.home ? share : shift.from === system.home ? 1 - share : 0;
    chart = real ? 0 : homeward * (1 - ramp(distance, CHART_FULL, CHART_GONE));

    if (glide?.toward && home !== null) {
      facing.copy(glide.toward).applyQuaternion(home.frame.quaternion).applyQuaternion(rig);
      camera.position.copy(facing).setLength(distance);
      camera.lookAt(0, 0, 0);
    }
    if (glide?.start && to !== null) {
      const sun = looks[sources[to.body.id][0] ?? star.body.id];
      sunlit.copy(sun.frame.position).sub(to.frame.position).applyQuaternion(rig);
      const apart = sunlit.length();
      const clear = STAR_CLEAR * sun.body.radius;
      const cosine = (apart ** 2 + glide.to ** 2 - clear ** 2) / (2 * apart * glide.to);
      const aside = cosine < 1 ? Math.acos(Math.max(-1, cosine)) : 0;
      sunlit.normalize().applyAxisAngle(upward, Math.max(SUNLIT_TURN, aside));
      sunlit.y += SUNLIT_LIFT;
      swing.setFromUnitVectors(glide.start, sunlit.normalize());
      partway.identity().slerp(swing, eased(glide.share));
      facing.copy(glide.start).applyQuaternion(partway);
      camera.position.copy(facing).setLength(distance);
      camera.lookAt(0, 0, 0);
    }
    if (glide !== null && glide.share >= 1) {
      glide = null;
    }

    scene.updateMatrixWorld(true);
    const pixels = stage.clientHeight / 2 / Math.tan((camera.fov * Math.PI) / 360);
    let closest = Number.POSITIVE_INFINITY;
    let waking: Look | null = null;
    let widest = WAKE_PIXELS;
    let turned = false;
    looks.forEach((look, index) => {
      look.frame.getWorldPosition(places[index]);
    });
    for (const [index, look] of looks.entries()) {
      const place = places[index];
      const gap = place.distanceTo(camera.position);
      closest = Math.min(closest, gap - look.body.radius);
      const lent = lit[index];
      rays.forEach((ray, at) => {
        if (at < lent.length) {
          ray.copy(places[lent[at].source]).sub(place).normalize();
        } else {
          ray.set(0, 0, 0);
        }
      });
      look.light(rays, look === home ? chart : 0, weather ?? shown);
      const here = truly[index];
      lent.forEach(({ source, seen, reach }, at) => {
        const there = truly[source];
        const apart = (there.x - here.x) ** 2 + (there.y - here.y) ** 2 + (there.z - here.z) ** 2;
        const passed = hazes
          .filter((haze) => haze.lamps.includes(source))
          .reduce(
            (left, haze) => left * haze.passed(haze.mesh.worldToLocal(shaded.copy(place))),
            1,
          );
        glares[index][at] = (passed * seen * reach ** 2) / apart;
      });
      const heat = swung[index] ? heatAt(system, index, shown) : look.body.physics.heat;
      turned = look.warm(heat, glares[index]) || turned;
      const wide = (look.body.radius * pixels) / Math.max(gap, 1e-6);
      tiny[index] = 2 * wide < SPECK_PIXELS;
      look.recede(tiny[index]);
      if (look === home || look === star || look === to || look === sharp) {
        continue;
      }
      if (look.detail() === 0 && wide > widest) {
        stale = waking !== null || stale;
        widest = wide;
        waking = look;
      } else if (look.detail() === 0 && wide > WAKE_PIXELS) {
        stale = true;
      } else if (look.detail() > 0 && wide < SLEEP_PIXELS) {
        look.refine(0);
      }
    }
    waking?.refine(rough);
    camera.updateMatrixWorld();
    if (mist !== null) {
      const nearest = looks
        .map((look, index) => ({
          look,
          place: places[index],
          wide: look.body.radius / Math.max(places[index].distanceTo(camera.position), 1e-9),
        }))
        .sort((left, right) => right.wide - left.wide)
        .slice(0, SCREEN_ROOM);
      const bared = nearest.filter(({ look }) => look.halo === 0);
      const slope = Math.tan((camera.fov * Math.PI) / 360);
      mist.lens.set(slope * camera.aspect, slope);
      mist.screens.forEach((screen, at) => {
        const found = nearest[at];
        if (found === undefined) {
          screen.set(0, 0, 0, 0);
        } else {
          seat.copy(found.place).applyMatrix4(camera.matrixWorldInverse);
          screen.set(seat.x, seat.y, seat.z, found.look.body.radius);
        }
      });
      for (const haze of hazes) {
        haze.turn(shown, (2 * slope) / mist.grid.y);
        haze.mesh.worldToLocal(haze.eye.copy(camera.position));
        haze.jet?.turn(shown, haze.eye.length() / haze.shroud.span.y);
        const parent = haze.owner.body.parent;
        const around = hazes.find((other) => other.owner.body.id === parent);
        if (around !== undefined) {
          around.mesh.worldToLocal(seat.copy(places[haze.owner.body.id]));
          around.mesh.worldToLocal(shaded.copy(camera.position));
          haze.faint.value = around.passing(seat, shaded);
        }
        haze.screens.forEach((screen, at) => {
          const found = nearest[at];
          if (found === undefined) {
            screen.set(0, 0, 0, 0);
          } else {
            haze.mesh.worldToLocal(seat.copy(found.place));
            screen.set(seat.x, seat.y, seat.z, found.look.body.radius);
          }
        });
        haze.bubbles.forEach((bubble, at) => {
          const found = bared[at];
          if (found === undefined) {
            bubble.set(0, 0, 0, 0);
          } else {
            const near = 1 - ramp(1 / found.wide, HAZE_NEAR[0], HAZE_NEAR[1]);
            haze.mesh.worldToLocal(seat.copy(found.place));
            bubble.set(seat.x, seat.y, seat.z, HAZE_BUBBLE * found.look.girth * near);
          }
        });
      }
    }
    for (const glare of glaring) {
      const middle = places[glare.body.id];
      const within = looks
        .filter((look) => look !== glare)
        .map((look) => ({ look, apart: places[look.body.id].distanceTo(middle) }))
        .filter(
          ({ look, apart }) =>
            look.halo > 0 || apart < HALO_SLACK * glare.halo + BALL_SLACK * look.ball,
        )
        .sort((left, right) => left.apart - right.apart);
      glare.screens.forEach((screen, at) => {
        const look = within[at]?.look;
        if (look === undefined) {
          screen.set(0, 0, 0, 0);
          glare.poles[at].set(0, 0, 0, 0);
          glare.suns[at] = 0;
          return;
        }
        seat.copy(places[look.body.id]).applyMatrix4(camera.matrixWorldInverse);
        screen.set(seat.x, seat.y, seat.z, look.ball);
        axis
          .set(0, 1, 0)
          .applyQuaternion(look.frame.getWorldQuaternion(stance))
          .transformDirection(camera.matrixWorldInverse);
        glare.poles[at].set(axis.x, axis.y, axis.z, 1 / look.flat - 1);
        glare.suns[at] = look.halo > 0 ? 1 : 0;
      });
    }
    looks.forEach((look, index) => {
      const at = look.frame.position;
      spots.setXYZ(index, at.x - spot.x, at.y - spot.y, at.z - spot.z);
      girths.setX(index, look.detail() === 0 || tiny[index] ? look.body.radius : 0);
      const lamp = looks[sources[index][0] ?? index].frame.position;
      lamps.setXYZ(index, lamp.x - spot.x, lamp.y - spot.y, lamp.z - spot.z);
    });
    dust.position.copy(spot);
    spots.needsUpdate = true;
    girths.needsUpdate = true;
    lamps.needsUpdate = true;
    if (turned) {
      tinge();
    }
    const dense = renderer.getPixelRatio();
    speckMaterial.uniforms.scale.value = pixels * dense;
    speckMaterial.uniforms.least.value = SPECK_PIXELS * dense;
    for (const belt of belts) {
      belt.turn(shown, dense, pixels * dense);
    }
    for (const haze of hazes) {
      const clouds = [
        ...haze.swarms,
        ...belts.filter((belt) => belt.owner === haze.owner && belt.hub === haze.about),
      ];
      for (const cloud of clouds) {
        cloud.into.copy(haze.mesh.matrixWorld).invert().multiply(cloud.points.matrixWorld);
      }
      for (const swarm of haze.swarms) {
        swarm.points.worldToLocal(seat.copy(places[swarm.planet]));
        const angle = Math.atan2(seat.z, seat.x);
        swarm.guide(angle);
        swarm.turn(shown, dense, pixels * dense);
        if (swarm.slot >= 0) {
          haze.spirals[swarm.slot].set(swarm.orbit, swarm.wake, Math.cos(angle), Math.sin(angle));
        }
      }
    }
    for (const track of tracks) {
      const gap = seat
        .copy(track.middle)
        .applyMatrix4(world.matrixWorld)
        .distanceTo(camera.position);
      const size = (track.reach * pixels) / Math.max(gap, 1e-6);
      track.material.opacity = TRACK_SHADE * (1 - chart) * ramp(size, TRACK_GONE, TRACK_FULL);
      track.line.visible = track.material.opacity > 0;
      if (track.line.visible && track.drawn !== track.anomaly) {
        const sine = Math.sin(track.anomaly);
        const cosine = Math.cos(track.anomaly);
        const { major, minor, path } = track;
        halves.forEach((half, step) => {
          const along = -2 * half.sine * (sine * half.cosine + cosine * half.sine);
          const across = 2 * half.sine * (cosine * half.cosine - sine * half.sine);
          path.setXYZ(
            step,
            major.x * along + minor.x * across,
            major.y * along + minor.y * across,
            major.z * along + minor.z * across,
          );
        });
        path.needsUpdate = true;
        track.drawn = track.anomaly;
      }
    }
    const ground = clearances.reduce(
      (least, ask) => Math.min(least, ask()),
      Number.POSITIVE_INFINITY,
    );
    const grounded = real && Number.isFinite(ground);
    const least = !real ? NEAR_LEAST : grounded ? GROUND_NEAR : REAL_NEAR;
    camera.near = Math.max(least, Math.min(20, (grounded ? ground : closest) * 0.25));
    camera.far = (camera.position.distanceTo(world.position) + Math.max(brim, veiled)) * 1.2 + 50;
    camera.updateProjectionMatrix();
    for (const sky of skies) {
      sky.position.copy(camera.position);
      sky.scale.setScalar(camera.far * 0.8);
      sky.updateMatrixWorld(true);
    }
    holes.forEach((hole, at) => {
      seat.copy(places[hole.body.id]).sub(camera.position);
      const apart = Math.max(seat.length(), 1e-9);
      lenses[at].set(
        seat.x / apart,
        seat.y / apart,
        seat.z / apart,
        (2 * hole.body.radius) / apart,
      );
    });
    eye.copy(camera.position);
    first.frame.worldToLocal(eye);
  };

  const projected = new Vector3();
  const caption = (look: Look, index: number) => {
    const label = names[index];
    look.frame.getWorldPosition(place);
    const gap = place.distanceTo(camera.position);
    projected.copy(place).project(camera);
    const { clientWidth: width, clientHeight: height } = stage;
    const x = (projected.x * 0.5 + 0.5) * width;
    const y = (0.5 - projected.y * 0.5) * height;
    const half = Math.tan((camera.fov * Math.PI) / 360);
    const disc = (look.body.radius / gap / half) * (height / 2);
    let shown = chart < 0.5 && projected.z < 1 && gap > look.body.radius;
    const parent = look.body.parent;
    if (shown && parent !== null && look.body.id !== shift.to) {
      const kin = looks[parent];
      kin.frame.getWorldPosition(place);
      const sunk = (kin.body.radius / place.distanceTo(camera.position) / half) * (height / 2);
      place.project(camera);
      const across = (place.x - projected.x) * 0.5 * width;
      const down = (projected.y - place.y) * 0.5 * height;
      shown =
        look.halo > 0
          ? Math.abs(across) > NAME_WIDTH || Math.abs(down + sunk - disc) > NAME_HEIGHT
          : Math.hypot(across, down) > KIN_CLEARANCE;
    }
    if (shown && look.body.id !== shift.to && shift.to < looks.length) {
      const front = places[shift.to];
      seat.copy(places[index]).sub(camera.position).normalize();
      const along = seat.dot(axis.copy(front).sub(camera.position));
      const aside = front.distanceToSquared(camera.position) - along ** 2;
      shown = along <= 0 || along >= gap || aside >= looks[shift.to].body.radius ** 2;
    }
    label.style.display = shown ? "" : "none";
    if (shown) {
      label.classList.toggle("focus", look.body.id === shift.to);
      label.style.transform = `translate(-50%, 0) translate(${x.toFixed(1)}px, ${(y + disc + LABEL_GAP).toFixed(1)}px)`;
    }
  };

  let presented = performance.now();
  const present = (now: number) => {
    stale = false;
    presented = now;
    const lead = pace > 0 ? Math.min(1, ((now - since) * pace) / 1000) : 0;
    arrange(tick + lead);
    for (const listener of presentListeners) {
      listener();
    }
    looks.forEach(caption);
    if (mist !== null) {
      const backdrop = scene.background;
      const veil = renderer.getClearAlpha();
      scene.background = null;
      renderer.setClearAlpha(0);
      renderer.setRenderTarget(mist.target);
      camera.layers.set(MIST_LAYER);
      renderer.render(scene, camera);
      camera.layers.set(0);
      renderer.setRenderTarget(null);
      renderer.setClearAlpha(veil);
      scene.background = backdrop;
    }
    renderer.render(scene, camera);
    drawn.position.copy(camera.position);
    drawn.quaternion.copy(camera.quaternion);
    if (fore.children.length > 0) {
      const { near, far } = camera;
      camera.near = range.near;
      camera.far = range.far;
      camera.updateProjectionMatrix();
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(fore, camera);
      renderer.autoClear = true;
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  };

  const fit = () => {
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    const aspect = width / height;
    const half = Math.tan((FIELD_OF_VIEW * Math.PI) / 360);
    renderer.setSize(width, height);
    mist?.fit(width, height);
    camera.aspect = aspect;
    camera.fov = (Math.atan(half / Math.min(1, aspect)) * 360) / Math.PI;
    camera.updateProjectionMatrix();
    for (const listener of resizeListeners) {
      listener(width, height);
    }
    present(performance.now());
  };
  const watch = new ResizeObserver(fit);
  watch.observe(stage);

  const pointer = new Vector2();
  const raycaster = new Raycaster();
  const ball = new Sphere();
  const hit = new Vector3();
  const down = new Set<number>();
  let press: Press | null = null;
  const emit = (at: Vector3 | null) => {
    for (const listener of tapListeners) {
      listener(at);
    }
  };
  const tap = (x: number, y: number) => {
    if (claimListeners.some((claim) => claim(x, y))) {
      return;
    }
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((x - bounds.left) / bounds.width) * 2 - 1,
      1 - ((y - bounds.top) / bounds.height) * 2,
    );
    raycaster.setFromCamera(pointer, camera);
    let found: Look | null = null;
    let nearest = Number.POSITIVE_INFINITY;
    for (const look of looks) {
      look.frame.getWorldPosition(ball.center);
      const gap = ball.center.distanceTo(camera.position);
      ball.radius = Math.max(look.body.radius, gap * PICK_SHARE);
      if (raycaster.ray.intersectSphere(ball, hit) !== null && gap < nearest) {
        nearest = gap;
        found = look;
      }
    }
    if (found === null) {
      emit(null);
      return;
    }
    if (home === null || found !== home || shift.to !== system.home || chart < 0.5) {
      attend(found.body.id);
      return;
    }
    home.frame.getWorldPosition(ball.center);
    ball.radius = home.body.radius;
    if (raycaster.ray.intersectSphere(ball, hit) === null) {
      emit(null);
      return;
    }
    emit(home.frame.worldToLocal(hit.clone()));
  };
  renderer.domElement.addEventListener("pointerdown", (event) => {
    down.add(event.pointerId);
    press = down.size === 1 ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
  });
  renderer.domElement.addEventListener("pointercancel", (event) => {
    down.delete(event.pointerId);
    press = null;
  });
  renderer.domElement.addEventListener("pointerup", (event) => {
    down.delete(event.pointerId);
    const started = press;
    press = null;
    if (started === null || started.id !== event.pointerId) {
      return;
    }
    const slack = event.pointerType === "mouse" ? CLICK_SLACK : TAP_SLACK;
    if (Math.hypot(event.clientX - started.x, event.clientY - started.y) <= slack) {
      tap(event.clientX, event.clientY);
    }
  });

  let previous = performance.now();
  let alive = true;
  const animate = (now: number) => {
    if (!alive) {
      return;
    }
    requestAnimationFrame(animate);
    const elapsed = Math.max(0, (now - previous) / 1000);
    previous = Math.max(previous, now);
    if (shift.share < 1) {
      shift.share = Math.min(1, shift.share + elapsed / SHIFT_TIME);
      stale = true;
    }
    if (glide !== null) {
      glide.share = Math.min(1, glide.share + elapsed / GLIDE_TIME);
      const length = Math.exp(
        Math.log(glide.from) + (Math.log(glide.to) - Math.log(glide.from)) * eased(glide.share),
      );
      camera.position.setLength(length);
      stale = true;
    }
    const reach = reachNow();
    controls.minDistance = APPROACH * reach;
    const span =
      ((camera.position.length() - reach) / reach) * Math.tan((camera.fov * Math.PI) / 360);
    controls.rotateSpeed = Math.min(1, span / Math.PI);
    controls.update();
    for (const listener of frameListeners) {
      listener(elapsed);
    }
    const moving = pace > 0 && (chart < 1 || busy());
    const due = moving && (!coarse.matches || now - presented >= HANDHELD_FRAME);
    if (stale || due) {
      present(now);
    }
  };
  requestAnimationFrame(animate);

  return {
    camera,
    labels,
    world,
    fore,
    surface: first.frame,
    relief: first.relief(),
    defines,
    eye,
    chart: () => chart,
    size: () => ({ width: stage.clientWidth, height: stage.clientHeight }),
    invalidate,
    clock(nextTick, nextPace, nextWeather) {
      tick = nextTick;
      pace = nextPace;
      weather = nextWeather ?? null;
      since = performance.now();
      stale = true;
    },
    lively(report) {
      busy = report;
    },
    onFrame: (listener) => frameListeners.push(listener),
    onPresent: (listener) => presentListeners.push(listener),
    onResize(listener) {
      resizeListeners.push(listener);
      listener(Math.max(1, stage.clientWidth), Math.max(1, stage.clientHeight));
    },
    onTap: (listener) => tapListeners.push(listener),
    onFocus: (listener) => focusListeners.push(listener),
    onArrange: (listener) => arrangeListeners.push(listener),
    onClaim: (listener) => claimListeners.push(listener),
    focus: attend,
    probe(radius) {
      const frame = new Group();
      world.add(frame);
      probes.push({ frame, radius });
      return { id: looks.length + probes.length - 1, frame };
    },
    depth(near, far) {
      range.near = near;
      range.far = far;
    },
    frame: (id) => looks[id].frame,
    paint: (id) => looks[id].paint,
    bare(id, next) {
      looks[id].bare(next);
      stale = true;
    },
    onClearance: (listener) => clearances.push(listener),
    sharpen(id) {
      const next = id === null ? null : looks[id];
      if (next === sharp) {
        return;
      }
      if (sharp !== null && sharp !== home && sharp !== star && sharp !== lookOf(shift.to)) {
        sharp.refine(rough);
      }
      sharp = next;
      sharp?.refine(fine);
      stale = true;
    },
    plumb(up, share) {
      if (up !== null) {
        plumbed.up.copy(up).normalize();
      }
      plumbed.share = up === null ? 0 : Math.max(0, Math.min(1, share));
    },
    visit(toward) {
      if (system.home === null) {
        return;
      }
      if (shift.to !== system.home) {
        attend(system.home);
      }
      const distance = camera.position.length();
      const within = shift.share >= 1 && distance <= CHART_FULL;
      glide = {
        from: distance,
        to: within ? distance : HOME_VIEW,
        share: within ? 1 : 0,
        toward: toward.clone(),
        start: null,
      };
      stale = true;
    },
    view: () => ({ focus: shift.to, camera: camera.position.clone() }),
    resume(view) {
      lookOf(view.focus)?.refine(fine);
      shift.from = view.focus;
      shift.to = view.focus;
      shift.share = 1;
      glide = null;
      camera.position.copy(view.camera);
      stale = true;
    },
    dispose() {
      alive = false;
      watch.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      labels.remove();
    },
  };
}
