import {
  courseOf,
  createRandom,
  positionOf,
  type Sketch,
  seenGlow,
  shownLight,
  spinOf,
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

export interface Space {
  camera: PerspectiveCamera;
  labels: HTMLElement;
  surface: Group;
  relief: CubeTexture;
  defines: Record<string, string>;
  eye: Vector3;
  chart(): number;
  size(): { width: number; height: number };
  invalidate(): void;
  clock(tick: number, pace: number): void;
  lively(busy: () => boolean): void;
  onFrame(listener: (elapsed: number) => void): void;
  onPresent(listener: () => void): void;
  onResize(listener: (width: number, height: number) => void): void;
  onTap(listener: (at: Vector3 | null) => void): void;
  onFocus(listener: (id: number) => void): void;
  focus(id: number): void;
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
const FARTHEST = 420;
const HOME_VIEW = 3.3;
const PORTRAIT = 4.5;
const CHART_FULL = 5;
const CHART_GONE = 11;
const RIG_BASE = 16;
const RIG_PER_RADIUS = 14;
const RIG_SPAN = 4;
const SHIFT_TIME = 0.7;
const GLIDE_TIME = 1.1;
const PICK_SHARE = 0.012;
const STARS = 2600;
const ORBIT_STEPS = 160;
const LABEL_GAP = 12;
const MOON_CLEARANCE = 70;
const SUNLIT_TURN = 0.6;
const SUNLIT_LIFT = 0.3;
const STAR_CLEAR = 1.7;
const WAKE_PIXELS = 7;
const SLEEP_PIXELS = 3.5;
const SPECK_PIXELS = 3;

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

export function createSpace(stage: HTMLElement, system: Sketch): Space {
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  stage.append(renderer.domElement);
  const labels = el("div", { class: "labels" });
  stage.append(labels);

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
  controls.zoomSpeed = coarse.matches ? 1.5 : 2.5;
  controls.minDistance = APPROACH;
  controls.maxDistance = FARTHEST;

  let stale = true;
  const invalidate = () => {
    stale = true;
  };
  controls.addEventListener("change", invalidate);

  const world = new Group();
  scene.add(world);
  const sky = createSky(system.bodies[0].seed);
  scene.add(sky);

  const { looks, sources, tintOf } = createLooks(renderer, system);
  const home = system.home === null ? null : looks[system.home];
  home?.refine(fine);
  const star = looks.find((look) => look.body.parent === null) ?? looks[0];
  star.refine(fine);
  const first = home ?? star;
  if (home === null) {
    camera.position.set(0, 0.35, 1).setLength(PORTRAIT * star.girth);
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
  specks.setAttribute(
    "shine",
    new BufferAttribute(
      new Float32Array(
        looks.flatMap((look) => [look.shine.r, look.shine.g, look.shine.b, look.dusk]),
      ),
      4,
    ),
  );
  const shades = (pick: (look: Look) => Color) =>
    new BufferAttribute(
      new Float32Array(looks.flatMap((look) => [pick(look).r, pick(look).g, pick(look).b])),
      3,
    );
  specks.setAttribute(
    "tone",
    shades((look) => look.tone),
  );
  specks.setAttribute(
    "ember",
    shades((look) => look.ember),
  );
  const speckMaterial = new ShaderMaterial({
    vertexShader: SPECK_VERTEX,
    fragmentShader: SPECK_FRAGMENT,
    uniforms: { scale: { value: 1 }, least: { value: SPECK_PIXELS } },
  });
  const dust = new Points(specks, speckMaterial);
  dust.frustumCulled = false;
  world.add(dust);
  const belts = star.body.disks.map((lane, index) => {
    const disk = star.body.physics.disks[index];
    const { heat, radius } = star.body.physics;
    const seen = seenGlow(heat) * ((2 * radius) / (disk.inner + disk.outer)) ** 2;
    const shine = tintOf(star.body).multiplyScalar(shownLight([seen], 0).lamps[0]);
    return createBelt(lane, disk, star.body.seed + index, shine, coarse.matches);
  });
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

  const trackMaterial = new LineBasicMaterial({ color: ORBIT, transparent: true, opacity: 0 });
  const tracks = looks.flatMap((look) => {
    if (look.body.parent === null) {
      return [];
    }
    const loop: Vector3[] = [];
    for (let step = 0; step < ORBIT_STEPS; step++) {
      const at = courseOf(look.body, (2 * Math.PI * step) / ORBIT_STEPS);
      loop.push(new Vector3(at.x, at.y, at.z));
    }
    const line = new LineLoop(new BufferGeometry().setFromPoints(loop), trackMaterial);
    line.frustumCulled = false;
    world.add(line);
    return [{ line, around: looks[look.body.parent] }];
  });

  const names = looks.map((look) => {
    const name = el("button", { class: "label body", type: "button" }, look.body.name);
    name.addEventListener("click", () => attend(look.body.id));
    labels.append(name);
    return name;
  });

  let tick = 0;
  let pace = 0;
  let since = performance.now();
  let chart = 1;
  let busy = () => false;
  const shift: Shift = { from: first.body.id, to: first.body.id, share: 1 };
  let glide: Glide | null = null;
  const frameListeners: ((elapsed: number) => void)[] = [];
  const presentListeners: (() => void)[] = [];
  const resizeListeners: ((width: number, height: number) => void)[] = [];
  const tapListeners: ((at: Vector3 | null) => void)[] = [];
  const focusListeners: ((id: number) => void)[] = [];
  const eye = new Vector3();

  const attend = (id: number) => {
    if (id !== shift.to) {
      const left = looks[shift.to];
      if (left !== home && left !== star) {
        left.refine(rough);
      }
      shift.from = shift.to;
      shift.to = id;
      shift.share = 0;
      looks[id].refine(fine);
      for (const listener of focusListeners) {
        listener(id);
      }
    }
    const body = looks[id].body;
    const wanted = id === system.home ? HOME_VIEW : PORTRAIT * looks[id].girth;
    glide = {
      from: camera.position.length(),
      to: wanted,
      share: 0,
      toward: null,
      start:
        id === system.home || body.parent === null ? null : camera.position.clone().normalize(),
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
  const rays = [new Vector3(), new Vector3()];
  const facing = new Vector3();
  const sunlit = new Vector3();
  const swing = new Quaternion();
  const partway = new Quaternion();
  const upward = new Vector3(0, 1, 0);
  const reachNow = () => {
    const from = looks[shift.from].body.radius;
    return from + (looks[shift.to].body.radius - from) * eased(shift.share);
  };

  const arrange = (shown: number) => {
    for (const look of looks) {
      const at = positionOf(system, look.body.id, shown);
      look.frame.position.set(at.x, at.y, at.z);
      turn.set(look.body.tilt, look.body.swing, 0);
      twirl.setFromAxisAngle(upward, spinOf(look.body, shown));
      look.frame.quaternion.setFromEuler(turn).multiply(twirl);
    }
    for (const track of tracks) {
      track.line.position.copy(track.around.frame.position);
    }

    const from = looks[shift.from];
    const to = looks[shift.to];
    const share = eased(shift.share);
    const reach = reachNow();
    spot.copy(from.frame.position).lerp(to.frame.position, share);
    pose.copy(from.frame.quaternion).slerp(to.frame.quaternion, share);

    const distance = camera.position.length();
    const near = RIG_BASE + RIG_PER_RADIUS * reach;
    const away = ramp(distance, near, near * RIG_SPAN);
    rig.copy(pose).slerp(still, away).invert();
    world.quaternion.copy(rig);
    world.position
      .copy(spot)
      .multiplyScalar(away - 1)
      .applyQuaternion(rig);

    const homeward = home === null ? 0 : to === home ? share : from === home ? 1 - share : 0;
    chart = homeward * (1 - ramp(distance, CHART_FULL, CHART_GONE));

    if (glide?.toward && home !== null) {
      facing.copy(glide.toward).applyQuaternion(home.frame.quaternion).applyQuaternion(rig);
      camera.position.copy(facing).setLength(distance);
      camera.lookAt(0, 0, 0);
    }
    if (glide?.start) {
      sunlit.copy(star.frame.position).sub(to.frame.position).applyQuaternion(rig);
      const apart = sunlit.length();
      const clear = STAR_CLEAR * star.body.radius;
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
    let farthest = 0;
    let waking: Look | null = null;
    let widest = WAKE_PIXELS;
    looks.forEach((look, index) => {
      look.frame.getWorldPosition(places[index]);
    });
    for (const [index, look] of looks.entries()) {
      const place = places[index];
      const gap = place.distanceTo(camera.position);
      closest = Math.min(closest, gap - look.body.radius);
      farthest = Math.max(farthest, gap + look.body.radius);
      const lit = sources[index];
      rays.forEach((ray, at) => {
        if (at < lit.length) {
          ray.copy(places[lit[at]]).sub(place).normalize();
        } else {
          ray.set(0, 0, 0);
        }
      });
      look.light(rays, look === home ? chart : 0, shown);
      const wide = (look.body.radius * pixels) / Math.max(gap, 1e-6);
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
    looks.forEach((look, index) => {
      spots.setXYZ(index, look.frame.position.x, look.frame.position.y, look.frame.position.z);
      girths.setX(index, look.detail() === 0 ? look.body.radius : 0);
      const lamp = looks[sources[index][0] ?? index].frame.position;
      lamps.setXYZ(index, lamp.x, lamp.y, lamp.z);
    });
    spots.needsUpdate = true;
    girths.needsUpdate = true;
    lamps.needsUpdate = true;
    const dense = renderer.getPixelRatio();
    speckMaterial.uniforms.scale.value = pixels * dense;
    speckMaterial.uniforms.least.value = SPECK_PIXELS * dense;
    for (const belt of belts) {
      belt.turn(shown, dense);
    }
    camera.near = Math.max(0.02, Math.min(20, closest * 0.25));
    camera.far = farthest * 1.2 + 50;
    camera.updateProjectionMatrix();
    sky.position.copy(camera.position);
    sky.scale.setScalar(camera.far * 0.8);
    sky.updateMatrixWorld(true);
    trackMaterial.opacity = 0.55 * (1 - chart);
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
    if (shown && parent !== null && parent !== star.body.id && look.body.id !== shift.to) {
      looks[parent].frame.getWorldPosition(place).project(camera);
      const apart = Math.hypot(
        (place.x - projected.x) * 0.5 * width,
        (place.y - projected.y) * 0.5 * height,
      );
      shown = apart > MOON_CLEARANCE;
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
    const elapsed = (now - previous) / 1000;
    previous = now;
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
    surface: first.frame,
    relief: first.relief(),
    defines,
    eye,
    chart: () => chart,
    size: () => ({ width: stage.clientWidth, height: stage.clientHeight }),
    invalidate,
    clock(nextTick, nextPace) {
      tick = nextTick;
      pace = nextPace;
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
    focus: attend,
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
