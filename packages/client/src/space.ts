import {
  anomalyOf,
  type Body,
  centreOf,
  courseOf,
  createRandom,
  heatAt,
  poseOf,
  positionOf,
  type Sketch,
  seenGlow,
  shownLight,
  spinOf,
  starborn,
  swayOf,
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
  PointsMaterial,
  Quaternion,
  Raycaster,
  Scene,
  ShaderMaterial,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createBelt } from "./belts.ts";
import { createLooks, type Look } from "./bodies.ts";
import { el } from "./dom.ts";
import { ORBIT, SKY } from "./palette.ts";
import { SPECK_FRAGMENT, SPECK_VERTEX } from "./shaders.ts";

export interface Probe {
  id: number;
  frame: Group;
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
  focus(id: number): void;
  probe(radius: number): Probe;
  depth(near: number, far: number): void;
  visit(toward: Vector3): void;
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
const ORBIT_STEPS = 256;
const ORBIT_CROWD = 3;
const NEAR_LEAST = 0.02;
const REAL_NEAR = 1e-5;
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

function eased(share: number): number {
  return share * share * (3 - 2 * share);
}

function ramp(value: number, from: number, to: number): number {
  const share = (Math.log(value) - Math.log(from)) / (Math.log(to) - Math.log(from));
  return eased(Math.max(0, Math.min(1, share)));
}

function createSky(seed: number): Points {
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
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  const sky = new Points(
    geometry,
    new PointsMaterial({
      vertexColors: true,
      size: 1.6,
      sizeAttenuation: false,
      depthTest: false,
      depthWrite: false,
    }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
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
  const widest = Math.max(...system.bodies.map((body) => span(body.id)));
  const outmost = Math.max(FARTHEST, FAR_VIEW * widest);
  controls.maxDistance = outmost;
  const brim = Math.max(
    ...system.bodies.map(
      (body) => span(body.id) + Math.max(body.radius, ...body.disks.map((lane) => lane.outer)),
    ),
  );

  let stale = true;
  const invalidate = () => {
    stale = true;
  };
  controls.addEventListener("change", invalidate);

  const world = new Group();
  scene.add(world);
  const fore = new Scene();
  const range = { near: 1e-7, far: 1e-3 };
  const sky = createSky(system.bodies[0].seed);
  scene.add(sky);

  const { looks, lamps: lit, tintOf } = createLooks(renderer, system);
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
  const belts = looks
    .filter(({ body }) => body.parent === null || starborn(body.physics))
    .flatMap((owner) =>
      owner.body.disks.map((lane, index) => {
        const disk = owner.body.physics.disks[index];
        const { heat, radius } = owner.body.physics;
        const seen = seenGlow(heat) * ((2 * radius) / (disk.inner + disk.outer)) ** 2;
        const shine = tintOf(owner.body).multiplyScalar(shownLight([seen], 0).lamps[0]);
        const within = system.bodies
          .filter((body) => body.parent === owner.body.id && body.physics.orbit < disk.inner)
          .sort((left, right) => right.physics.orbit - left.physics.orbit)[0];
        const about = within === undefined ? null : within.id;
        const cloud = createBelt(lane, disk, owner.body.seed + index, shine, coarse.matches);
        return { ...cloud, about, owner };
      }),
    );
  for (const belt of belts) {
    world.add(belt.points);
  }
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
  const eye = new Vector3();
  const probes: { frame: Group; radius: number }[] = [];
  const lookOf = (id: number): Look | null => (id < looks.length ? looks[id] : null);
  const frameOf = (id: number) => lookOf(id)?.frame ?? probes[id - looks.length].frame;
  const girthOf = (id: number) => lookOf(id)?.body.radius ?? probes[id - looks.length].radius;

  const attend = (id: number) => {
    const look = lookOf(id);
    if (id !== shift.to) {
      const left = lookOf(shift.to);
      if (left !== null && left !== home && left !== star) {
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
    const wanted =
      look === null
        ? PORTRAIT * girthOf(id)
        : id === system.home
          ? HOME_VIEW
          : PORTRAIT * look.girth;
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
  const stance = new Quaternion();
  const rays = [new Vector3(), new Vector3()];
  const facing = new Vector3();
  const sunlit = new Vector3();
  const swing = new Quaternion();
  const partway = new Quaternion();
  const upward = new Vector3(0, 1, 0);
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
        glares[index][at] = (seen * reach ** 2) / apart;
      });
      const heat = swung[index] ? heatAt(system, index, shown) : look.body.physics.heat;
      turned = look.warm(heat, glares[index]) || turned;
      const wide = (look.body.radius * pixels) / Math.max(gap, 1e-6);
      tiny[index] = 2 * wide < SPECK_PIXELS;
      look.recede(tiny[index]);
      if (look === home || look === star || look === to) {
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
    for (const glare of glaring) {
      const middle = places[glare.body.id];
      const within = looks
        .filter((look) => look !== glare)
        .map((look) => ({ look, apart: places[look.body.id].distanceTo(middle) }))
        .filter(({ look, apart }) => apart < HALO_SLACK * glare.halo + BALL_SLACK * look.ball)
        .sort((left, right) => left.apart - right.apart);
      glare.screens.forEach((screen, at) => {
        const look = within[at]?.look;
        if (look === undefined) {
          screen.set(0, 0, 0, 0);
          glare.poles[at].set(0, 0, 0, 0);
          return;
        }
        seat.copy(places[look.body.id]).applyMatrix4(camera.matrixWorldInverse);
        screen.set(seat.x, seat.y, seat.z, look.ball);
        axis
          .set(0, 1, 0)
          .applyQuaternion(look.frame.getWorldQuaternion(stance))
          .transformDirection(camera.matrixWorldInverse);
        glare.poles[at].set(axis.x, axis.y, axis.z, 1 / look.flat - 1);
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
    camera.near = Math.max(real ? REAL_NEAR : NEAR_LEAST, Math.min(20, closest * 0.25));
    camera.far = (camera.position.distanceTo(world.position) + brim) * 1.2 + 50;
    camera.updateProjectionMatrix();
    sky.position.copy(camera.position);
    sky.scale.setScalar(camera.far * 0.8);
    sky.updateMatrixWorld(true);
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
    renderer.render(scene, camera);
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
    camera.aspect = aspect;
    camera.fov = (Math.atan(half / Math.min(1, aspect)) * 360) / Math.PI;
    camera.updateProjectionMatrix();
    for (const listener of resizeListeners) {
      listener(width, height);
    }
    present(performance.now());
  };
  new ResizeObserver(fit).observe(stage);

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
  const animate = (now: number) => {
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
  };
}
