import {
  type Body,
  createRandom,
  type Lamp,
  lampsOf,
  pitsOf,
  type Sketch,
  seaCover,
  seenGlow,
  shownLight,
} from "@barycenter/sim";
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  type Camera,
  Color,
  CubeTexture,
  type Data3DTexture,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  HalfFloatType,
  IcosahedronGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  RedFormat,
  RepeatWrapping,
  RingGeometry,
  Scene,
  ShaderMaterial,
  Sphere,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  WebGL3DRenderTarget,
  WebGLCubeRenderTarget,
  type WebGLRenderer,
} from "three";
import {
  emberOf,
  familyOf,
  flameOf,
  flatnessOf,
  type Giant,
  giantOf,
  type Hoop,
  holeOf,
  hoopOf,
  SHADOW,
  SUN_CELLS,
  seasonOf,
  skinOf,
  WAVES,
  WIEN,
} from "./looks.ts";
import { createProminences } from "./prominences.ts";
import {
  BAKE_FRAGMENT,
  BAKE_VERTEX,
  BODY_VERTEX,
  bodyFragment,
  EXPOSURE,
  FLARE_FRAGMENT,
  FLARE_VERTEX,
  GAS_BAKE_FRAGMENT,
  GAS_STEP_FRAGMENT,
  GAS_STEPS,
  GRAIN_BAKE_FRAGMENT,
  GRAIN_CELLS,
  LAMP_ROOM,
  LIMB,
  LIMB_DEPTH,
  LUMP_VERTEX,
  PALETTE_ROOM,
  PROMINENCE_FRAGMENT,
  PROMINENCE_ROOM,
  PROMINENCE_VERTEX,
  RING_FRAGMENT,
  RING_VERTEX,
  SCREEN_ROOM,
  SHELL_FRAGMENT,
  SHELL_VERTEX,
  STAR_BAKE_FRAGMENT,
  STAR_FRAGMENT,
  STORM_ROOM,
} from "./shaders.ts";
import { createActivity, createRoll, type Sight, sift } from "./spots.ts";

export interface Look {
  body: Body;
  frame: Group;
  girth: number;
  ball: number;
  flat: number;
  halo: number;
  screens: Vector4[];
  poles: Vector4[];
  suns: number[];
  tone: Color;
  ember: Color;
  shine: Color;
  dusk: number;
  paint: Paint | null;
  detail(): number;
  relief(): CubeTexture;
  bare(next: boolean): void;
  light(rays: Vector3[], chart: number, tick: number): void;
  warm(heat: number, glare: number[]): boolean;
  refine(size: number): void;
  recede(far: boolean): void;
  restore(): void;
  dispose(): void;
}

export type Paint = Record<string, { value: unknown }>;

export interface Glare {
  seen: number;
  tint: Color;
}

export interface Studio {
  shineOf(source: Body): Color;
  shape(body: Body, lamps: Glare[], spare?: number): Look;
}

interface Band {
  side: number;
  from: number;
  to: number;
  dark: boolean;
  tint: Color;
}

interface Storm {
  height: number;
  turn: number;
  year: number;
  size: number;
  stretch: number;
  spin: number;
  wake: number;
  crest: number;
  tint: Color;
  cover: number;
}

const SHELL_SCALE = 1.04;
const FLARE_REACH = 3;
const LUMP_SWELL = 1.75;
const CLOUD_TURN = 2400;
const JET_TURN = 1800;
const FLOW_LIFE = 300;
const BAND_STEPS = 1024;
const BAND_LEAST = 0.05;
const WAKE_SHIFT = 3;
const RING_STEPS = 512;
const RING_EDGE = 0.004;
const RING_VIEW = 0.7;
const STORM_YEAR = 5000;
const GRAIN_LIFE = 480;
const GRAIN_FADE = 0.1;
const GRANULE_PACE = 0.125;
const BOIL_LEAST = 0.1;
const GRAIN_SIZE = 128;
const GOLDEN_TURN = 2.39996;
const SHINE_PALE = 0.6;
const DIM_PALE = 0.25;
const SPECK_EMBER = 0.6;
const RING_GLEAM = 0.25;
const WARM_STEP = 0.5;
const GLARE_STEP = 0.02;
const DISC_STEPS = 16;
const RIBBON_STEPS = 48;
const RIBBON_ROWS = 3;
const RIBBON_LANES = 3;
const PROMINENCE_DRIFT = 0.00004;
const NOWHERE = new Vector3();

function sightOf(camera: Camera, globe: Mesh): Sight | null {
  if (!(camera instanceof PerspectiveCamera)) {
    return null;
  }
  const inward = new Matrix4().copy(globe.matrixWorld).invert();
  const eye = new Vector3().setFromMatrixPosition(camera.matrixWorld).applyMatrix4(inward);
  const ahead = camera.getWorldDirection(new Vector3()).transformDirection(inward);
  const { elements } = camera.projectionMatrix;
  return {
    eye: [eye.x, eye.y, eye.z],
    ahead: [ahead.x, ahead.y, ahead.z],
    wide: Math.atan(Math.hypot(1 / elements[0], 1 / elements[5])),
  };
}

function ribbonsOf(): BufferGeometry {
  const places: number[] = [];
  const corners: number[] = [];
  for (let sheet = 0; sheet < PROMINENCE_ROOM * RIBBON_LANES; sheet++) {
    const first = places.length / 3;
    const mark = Math.floor(sheet / RIBBON_LANES) + (sheet % RIBBON_LANES) / 4;
    for (let row = 0; row <= RIBBON_ROWS; row++) {
      for (let step = 0; step <= RIBBON_STEPS; step++) {
        places.push((2 * step) / RIBBON_STEPS - 1, row / RIBBON_ROWS, mark);
      }
    }
    for (let row = 0; row < RIBBON_ROWS; row++) {
      for (let step = 0; step < RIBBON_STEPS; step++) {
        const low = first + row * (RIBBON_STEPS + 1) + step;
        const high = low + RIBBON_STEPS + 1;
        corners.push(low, low + 1, high, high, low + 1, high + 1);
      }
    }
  }
  const ribbons = new BufferGeometry();
  ribbons.setAttribute("position", new Float32BufferAttribute(places, 3));
  ribbons.setIndex(corners);
  ribbons.boundingSphere = new Sphere(new Vector3(), 2);
  return ribbons;
}

function bandsOf(body: Body, giant: Giant): Band[] {
  const random = createRandom(body.seed + 17);
  const pick = (list: number[]) => {
    const at = random.next() * list.length;
    const first = new Color(list[Math.floor(at) % list.length]);
    return first.lerp(new Color(list[(Math.floor(at) + 1) % list.length]), at % 1);
  };
  return [1, -1].flatMap((side) => {
    const bands: Band[] = [];
    let from = giant.first * (0.85 + 0.3 * random.next());
    let width = giant.width;
    let dark = true;
    bands.push({ side, from: 0, to: from, dark: false, tint: new Color(giant.zones[0]) });
    while (from < giant.cap) {
      const to = from + width * (0.75 + 0.5 * random.next());
      bands.push({ side, from, to, dark, tint: pick(dark ? giant.belts : giant.zones) });
      from = to;
      width = Math.max(width * giant.narrowing, BAND_LEAST);
      dark = !dark;
    }
    return bands;
  });
}

function ripple(random: { next(): number }, steps: number): (at: number) => number {
  const values = Array.from({ length: steps + 1 }, () => 2 * random.next() - 1);
  return (at) => {
    const place = Math.max(0, Math.min(steps - 1e-6, at * steps));
    const share = place % 1;
    const eased = share * share * (3 - 2 * share);
    return values[Math.floor(place)] * (1 - eased) + values[Math.floor(place) + 1] * eased;
  };
}

function flowOf(giant: Giant, bands: Band[]): (height: number) => number {
  if (giant.jets === 0) {
    return (height) => {
      const share = MathUtils.smoothstep(Math.abs(height), 0, 1.25);
      return (giant.eastward ? 1 : -1) * (1 - 1.7 * share);
    };
  }
  return (height) => {
    const side = height < 0 ? -1 : 1;
    const level = Math.abs(height);
    const own = bands.filter((band) => band.side === side);
    const knots = [{ at: 0, speed: 0.8 }];
    own.forEach((band, index) => {
      const fade = Math.exp(-band.to / 0.8);
      knots.push({ at: band.to, speed: (index === 0 ? 1 : band.dark ? -0.4 : 0.75) * fade });
    });
    knots.push({ at: Math.PI / 2, speed: 0 });
    const next = Math.max(
      1,
      knots.findIndex((knot) => knot.at >= level),
    );
    const before = knots[next - 1];
    const after = knots[next];
    const share = (level - before.at) / Math.max(after.at - before.at, 1e-6);
    return giant.jets * (before.speed + (after.speed - before.speed) * Math.min(1, share));
  };
}

function chartOf(body: Body, giant: Giant, bands: Band[]): DataTexture {
  const random = createRandom(body.seed + 29);
  const coarse = ripple(random, 40);
  const fine = ripple(random, 130);
  const finest = ripple(random, 420);
  const flow = flowOf(giant, bands);
  const pole = new Color(giant.pole);
  const wisp = new Color(giant.wisp);
  const data = new Uint8Array(BAND_STEPS * 2 * 4);
  const shade = new Color();
  for (let step = 0; step < BAND_STEPS; step++) {
    const share = (step + 0.5) / BAND_STEPS;
    const height = (share - 0.5) * Math.PI;
    const level = Math.abs(height);
    const own = bands.filter((band) => band.side === (height < 0 ? -1 : 1));
    shade.copy(own[0].tint);
    let stir = 0.3;
    let puff = 0.15;
    own.slice(1).forEach((band, index) => {
      const soft = giant.edge * (0.5 + (2.5 * ((index * 7 + 3) % 5)) / 4);
      const within = MathUtils.smoothstep(level, band.from - soft, band.from + soft);
      shade.lerp(band.tint, within);
      if (band.dark && level > band.from && level < band.to) {
        const middle = Math.sin((Math.PI * (level - band.from)) / (band.to - band.from));
        const wide = MathUtils.smoothstep(band.to - band.from, 0.06, 0.14);
        shade.lerp(own[0].tint, 0.3 * wide * middle ** 3);
        shade.multiplyScalar(1 - 0.14 * (1 - middle));
      }
      const calm = MathUtils.clamp((band.to - band.from) / 0.12, 0.3, 1);
      stir += ((band.dark ? 1 : 0.3) * calm - stir) * within;
      puff += ((band.dark ? 1 : 0.1) - puff) * within;
      const brink = Math.exp(-(((level - band.from) / (2.5 * giant.edge + 0.012)) ** 2));
      stir += 0.5 * calm * brink;
      if (index === 0) {
        shade.lerp(wisp, giant.wispy * Math.exp(-(((level - band.from - 0.012) / 0.014) ** 2)));
      }
    });
    const capped = MathUtils.smoothstep(level, giant.cap - 0.12, giant.cap + 0.12);
    shade.lerp(pole, 0.85 * capped);
    stir += (0.8 - stir) * capped;
    puff += (0.7 - puff) * capped;
    const veins =
      1 + giant.veins * (0.9 * coarse(share) + 0.7 * fine(share) + 0.45 * finest(share));
    const at = step * 4;
    data[at] = 255 * Math.sqrt(MathUtils.clamp(shade.r * veins, 0, 1));
    data[at + 1] = 255 * Math.sqrt(MathUtils.clamp(shade.g * veins, 0, 1));
    data[at + 2] = 255 * Math.sqrt(MathUtils.clamp(shade.b * veins, 0, 1));
    data[at + 3] = 255 * MathUtils.clamp(puff, 0, 1);
    const below = (BAND_STEPS + step) * 4;
    data[below] = 255 * MathUtils.clamp(0.5 + 0.5 * flow(height), 0, 1);
    data[below + 1] = 255 * MathUtils.clamp(stir, 0, 1);
    data[below + 2] = 0;
    data[below + 3] = 255;
  }
  const chart = new DataTexture(data, BAND_STEPS, 2);
  chart.minFilter = LinearFilter;
  chart.magFilter = LinearFilter;
  chart.needsUpdate = true;
  return chart;
}

function gritOf(body: Body, hoop: Hoop): DataTexture {
  const random = createRandom(body.seed + 59);
  const coarse = ripple(random, 24);
  const fine = ripple(random, 150);
  const tint = new Color(hoop.tint);
  const from = hoop.parts[0][0];
  const to = hoop.parts[hoop.parts.length - 1][1];
  const data = new Uint8Array(RING_STEPS * 4);
  for (let step = 0; step < RING_STEPS; step++) {
    const share = (step + 0.5) / RING_STEPS;
    const radius = from + (to - from) * share;
    const whole = hoop.parts.reduce(
      (sum, [inner, outer, density]) =>
        sum +
        density *
          MathUtils.smoothstep(radius, inner - RING_EDGE, inner + RING_EDGE) *
          (1 - MathUtils.smoothstep(radius, outer - RING_EDGE, outer + RING_EDGE)),
      0,
    );
    const dense = MathUtils.clamp(whole * (1 + 0.25 * coarse(share) + 0.2 * fine(share)), 0, 1);
    const pale = (0.72 + 0.28 * dense) * (1 + 0.06 * fine(share));
    const at = step * 4;
    data[at] = 255 * Math.sqrt(MathUtils.clamp(tint.r * pale, 0, 1));
    data[at + 1] = 255 * Math.sqrt(MathUtils.clamp(tint.g * pale, 0, 1));
    data[at + 2] = 255 * Math.sqrt(MathUtils.clamp(tint.b * pale, 0, 1));
    data[at + 3] = 255 * dense;
  }
  const grit = new DataTexture(data, RING_STEPS, 1);
  grit.generateMipmaps = true;
  grit.minFilter = LinearMipmapLinearFilter;
  grit.magFilter = LinearFilter;
  grit.needsUpdate = true;
  return grit;
}

function stormsOf(body: Body, giant: Giant, bands: Band[]): Storm[] {
  const random = createRandom(body.seed + 43);
  const flow = flowOf(giant, bands);
  return giant.brews
    .flatMap((brew) => {
      const side = brew.side === 0 ? (random.next() < 0.5 ? -1 : 1) : brew.side;
      const own = bands.filter((band) => band.side === side);
      const band = own[Math.min(brew.band, own.length - 1)];
      const width = band.to - band.from;
      const size = Math.min(brew.size * width, 0.16);
      const level = (band.from + band.to) / 2 + (brew.seat * (width - 2 * size)) / 2;
      const year = (random.next() < 0.5 ? -1 : 1) * STORM_YEAR * (1 + random.next());
      const shear = flow(side * (level + 0.02)) - flow(side * (level - 0.02));
      const start = 2 * Math.PI * random.next();
      const gap = (2 * Math.PI) / Math.max(brew.count, 5);
      return Array.from({ length: brew.count }, (_, index) => ({
        height: side * (level + (index === 0 ? 0 : 0.012 * (2 * random.next() - 1))),
        turn: start + index * gap * (0.7 + 0.5 * random.next()),
        year,
        size: size * (index === 0 ? 1 : 0.7 + 0.3 * random.next()),
        stretch: brew.stretch,
        spin: shear * side > 0 ? -1 : 1,
        wake: brew.wake * (flow(side * (level - size)) < 0 ? -1 : 1),
        crest: brew.crest,
        tint: new Color(brew.tint),
        cover: brew.cover,
      }));
    })
    .slice(0, STORM_ROOM);
}

export function createLooks(
  renderer: WebGLRenderer,
  system: Sketch,
): { looks: Look[]; lamps: Lamp[][]; tintOf(source: Body): Color } {
  const studio = createStudio(renderer);
  const every = system.bodies.map((body) => lampsOf(system, body.id));
  const lamps = every.map((list) => list.slice(0, LAMP_ROOM));
  const looks = system.bodies.map((body, id) =>
    studio.shape(
      body,
      lamps[id].map(({ source, seen }) => ({
        seen,
        tint: studio.shineOf(system.bodies[source]),
      })),
      every[id].slice(LAMP_ROOM).reduce((sum, lamp) => sum + lamp.seen, 0),
    ),
  );
  return { looks, lamps, tintOf: studio.shineOf };
}

export function createStudio(renderer: WebGLRenderer): Studio {
  const packed =
    !renderer.extensions.has("EXT_color_buffer_half_float") &&
    !renderer.extensions.has("EXT_color_buffer_float");
  const defines: Record<string, string> = packed ? { PACKED: "" } : {};
  const ball = new IcosahedronGeometry(1, 20);
  const sheet = new PlaneGeometry(2, 2);
  const ribbons = ribbonsOf();

  const press = new ShaderMaterial({
    vertexShader: BAKE_VERTEX,
    fragmentShader: BAKE_FRAGMENT,
    defines,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      seed: { value: 0 },
      shape: { value: new Vector3() },
      sea: { value: 0 },
      pits: { value: new Vector4(0, 1, 0, 0) },
      grain: { value: 1 },
      size: { value: 1 },
      face: { value: 0 },
    },
  });
  const forge = new ShaderMaterial({
    vertexShader: BAKE_VERTEX,
    fragmentShader: STAR_BAKE_FRAGMENT,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      seed: { value: 0 },
      size: { value: 1 },
      face: { value: 0 },
    },
  });
  const tools = (fragmentShader: string) =>
    new ShaderMaterial({
      vertexShader: BAKE_VERTEX,
      fragmentShader,
      defines,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        seed: { value: 0 },
        size: { value: 1 },
        face: { value: 0 },
        prior: { value: null as CubeTexture | null },
      },
    });
  const mill = new ShaderMaterial({
    vertexShader: BAKE_VERTEX,
    fragmentShader: GRAIN_BAKE_FRAGMENT,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      seed: { value: 0 },
      size: { value: GRAIN_SIZE },
      layer: { value: 0 },
    },
  });
  const stir = tools(GAS_STEP_FRAGMENT);
  const churn = tools(GAS_BAKE_FRAGMENT);
  const plate = new Mesh(sheet, press);
  const bench = new Scene();
  bench.add(plate);
  const lens = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const stamp = (target: WebGLCubeRenderTarget, tool: ShaderMaterial, body: Body) => {
    tool.uniforms.seed.value = body.seed;
    tool.uniforms.size.value = target.width;
    plate.material = tool;
    for (let face = 0; face < 6; face++) {
      tool.uniforms.face.value = face;
      tool.uniformsNeedUpdate = true;
      renderer.setRenderTarget(target, face);
      renderer.render(bench, lens);
    }
  };
  let grain: WebGL3DRenderTarget | null = null;
  const grind = (target: WebGL3DRenderTarget) => {
    const before = renderer.getRenderTarget();
    plate.material = mill;
    for (let layer = 0; layer < GRAIN_SIZE; layer++) {
      mill.uniforms.layer.value = (layer + 0.5) / GRAIN_SIZE;
      mill.uniformsNeedUpdate = true;
      renderer.setRenderTarget(target, layer);
      target.texture.generateMipmaps = layer === GRAIN_SIZE - 1;
      renderer.render(bench, lens);
    }
    renderer.setRenderTarget(before);
  };
  const grainOf = (): Data3DTexture => {
    if (grain === null) {
      grain = new WebGL3DRenderTarget(GRAIN_SIZE, GRAIN_SIZE, GRAIN_SIZE, {
        format: RedFormat,
        type: UnsignedByteType,
        generateMipmaps: true,
        minFilter: LinearMipmapLinearFilter,
        magFilter: LinearFilter,
        depthBuffer: false,
      });
      grain.texture.wrapS = RepeatWrapping;
      grain.texture.wrapT = RepeatWrapping;
      grain.texture.wrapR = RepeatWrapping;
      grind(grain);
    }
    return grain.texture;
  };
  renderer.domElement.addEventListener("webglcontextrestored", () => {
    if (grain !== null) {
      grind(grain);
    }
  });
  const fill = (target: WebGLCubeRenderTarget, body: Body) => {
    const before = renderer.getRenderTarget();
    const family = familyOf(body.physics);
    if (family === "star") {
      stamp(target, forge, body);
    } else if (family === "fluid") {
      const drafts = packed
        ? []
        : [0, 1].map(
            () =>
              new WebGLCubeRenderTarget(target.width, {
                type: HalfFloatType,
                generateMipmaps: false,
                minFilter: NearestFilter,
                magFilter: NearestFilter,
                depthBuffer: false,
              }),
          );
      churn.uniforms.prior.value = null;
      for (let step = 0; step < GAS_STEPS && drafts.length > 0; step++) {
        stir.uniforms.prior.value = step === 0 ? null : drafts[(step + 1) % 2].texture;
        stamp(drafts[step % 2], stir, body);
        churn.uniforms.prior.value = drafts[step % 2].texture;
      }
      stamp(target, churn, body);
      stir.uniforms.prior.value = null;
      churn.uniforms.prior.value = null;
      for (const draft of drafts) {
        draft.dispose();
      }
    } else {
      const pits = pitsOf(body);
      press.uniforms.shape.value.set(body.relief.frequency, body.relief.warp, body.relief.ridge);
      press.uniforms.sea.value = body.relief.sea ?? 0;
      press.uniforms.pits.value.set(pits.cover, pits.bowl, pits.lift, 0);
      press.uniforms.grain.value = Math.PI / 2 / target.width;
      stamp(target, press, body);
    }
    renderer.setRenderTarget(before);
  };
  const bake = (body: Body, size: number): WebGLCubeRenderTarget => {
    const target = new WebGLCubeRenderTarget(size, {
      type: packed || familyOf(body.physics) === "star" ? UnsignedByteType : HalfFloatType,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
    });
    fill(target, body);
    return target;
  };
  const baked = (body: Body, slot: { value: CubeTexture | null }, shown: Mesh[]) => {
    let size = 0;
    let far = false;
    let stripped = false;
    let target: WebGLCubeRenderTarget | null = null;
    const settle = () => {
      slot.value = target?.texture ?? null;
      shown.forEach((mesh, index) => {
        mesh.visible = target !== null && !far && !(stripped && index === 0);
      });
    };
    return {
      detail: () => size,
      relief() {
        if (target === null) {
          throw new Error(`${body.name} has no map yet`);
        }
        return target.texture;
      },
      refine(wanted: number) {
        if (wanted === size) {
          return;
        }
        const old = target;
        size = wanted;
        target = wanted === 0 ? null : bake(body, wanted);
        settle();
        old?.dispose();
      },
      recede(next: boolean) {
        if (next !== far) {
          far = next;
          settle();
        }
      },
      bare(next: boolean) {
        if (next !== stripped) {
          stripped = next;
          settle();
        }
      },
      restore() {
        if (target !== null) {
          fill(target, body);
        }
      },
      release() {
        target?.dispose();
        target = null;
        size = 0;
      },
    };
  };

  const shineOf = (source: Body) => {
    if (familyOf(source.physics) === "star") {
      return new Color(flameOf(source).tint).lerp(new Color(0xffffff), SHINE_PALE);
    }
    const [red, green, blue] = emberOf(source.physics.heat);
    return new Color(red, green, blue).lerp(new Color(0xffffff), DIM_PALE);
  };

  const ignite = (body: Body): Look => {
    const flame = flameOf(body);
    const activity = createActivity(body.seed, flame);
    const roll = createRoll();
    const crowd = { value: 0 };
    const shuffle = 2 * Math.PI * createRandom(body.seed + 97).next();
    const prominences = createProminences(body.seed, flame);
    const drift = { value: 0 };
    const pace = Math.max(BOIL_LEAST, Math.min(1, flame.cells / SUN_CELLS)) / GRAIN_LIFE;
    const boil = new Vector4(0, 1, 0, 0);
    const screens = Array.from({ length: SCREEN_ROOM }, () => new Vector4(0, 0, 0, 0));
    const poles = Array.from({ length: SCREEN_ROOM }, () => new Vector4(0, 0, 0, 0));
    const suns = Array.from({ length: SCREEN_ROOM }, () => 0);
    const flow = new Vector2();
    const tint = new Color(flame.tint);
    const steep = new Vector3(...WAVES.map((wave) => WIEN / (wave * flame.kelvin)));
    const glow = (shade: number, power: number, facing: number) =>
      1 - Math.exp(-EXPOSURE * shade * MathUtils.lerp(LIMB_DEPTH, 1, facing) ** (LIMB * power));
    const disc = (shade: number, power: number) => {
      let mean = 0;
      for (let step = 0; step < DISC_STEPS; step++) {
        const facing = (step + 0.5) / DISC_STEPS;
        mean += (2 * facing * glow(shade, power, facing)) / DISC_STEPS;
      }
      return -Math.log(1 - mean);
    };
    const rim = new Color(
      glow(tint.r, steep.x, 0),
      glow(tint.g, steep.y, 0),
      glow(tint.b, steep.z, 0),
    );
    const ember = new Color(disc(tint.r, steep.x), disc(tint.g, steep.y), disc(tint.b, steep.z));
    const uniforms = {
      relief: { value: null as CubeTexture | null },
      granules: { value: grainOf() },
      pitch: {
        value: new Vector2(
          flame.cells / GRAIN_CELLS,
          (GRANULE_PACE * GRAIN_LIFE) / Math.max(flame.cells, SUN_CELLS),
        ),
      },
      regions: { value: roll.regions },
      plages: { value: roll.plages },
      spots: { value: roll.spots },
      crowd,
      flash: { value: activity.flash },
      burst: { value: 0 },
      boil: { value: boil },
      flow: { value: flow },
      tint: { value: tint },
      steep: { value: steep },
      traits: { value: new Vector3(flame.grain, flame.chill, flame.poles) },
      coarse: { value: flame.coarse },
    };
    const frame = new Group();
    const globe = new Mesh(
      ball,
      new ShaderMaterial({ vertexShader: BODY_VERTEX, fragmentShader: STAR_FRAGMENT, uniforms }),
    );
    globe.visible = false;
    globe.onBeforeRender = (_renderer, _scene, camera) => {
      crowd.value = sift(activity, sightOf(camera, globe), roll);
    };
    const flare = new Mesh(
      sheet,
      new ShaderMaterial({
        vertexShader: FLARE_VERTEX,
        fragmentShader: FLARE_FRAGMENT,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
        uniforms: {
          relief: uniforms.relief,
          fuzz: { value: Math.min(1, flame.grain / 0.02) },
          screens: { value: screens },
          poles: { value: poles },
          suns: { value: suns },
          rim: { value: rim },
          reach: { value: body.radius * FLARE_REACH },
          girth: { value: body.radius },
        },
      }),
    );
    flare.frustumCulled = false;
    const plumes = new Mesh(
      ribbons,
      new ShaderMaterial({
        vertexShader: PROMINENCE_VERTEX,
        fragmentShader: PROMINENCE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        uniforms: {
          relief: uniforms.relief,
          seats: { value: prominences.seats },
          leans: { value: prominences.leans },
          forms: { value: prominences.forms },
          screens: { value: screens },
          suns: { value: suns },
          tint: { value: new Color(1, 0.25, 0.25).multiplyScalar(rim.r) },
          drift,
        },
      }),
    );
    plumes.visible = false;
    plumes.frustumCulled = false;
    const { release, ...surface } = baked(body, uniforms.relief, [globe, plumes]);
    globe.scale.setScalar(body.radius);
    plumes.scale.setScalar(body.radius);
    frame.add(globe, flare, plumes);

    const beat = (age: number) => {
      const cycle = Math.floor(age);
      const share = age - cycle;
      return {
        shift: (cycle * GOLDEN_TURN + shuffle) % (2 * Math.PI),
        weight:
          MathUtils.clamp(share / GRAIN_FADE, 0, 1) *
          MathUtils.clamp((0.5 + GRAIN_FADE - share) / GRAIN_FADE, 0, 1),
        share,
      };
    };

    return {
      body,
      frame,
      girth: body.radius,
      ball: body.radius,
      flat: 1,
      halo: body.radius * FLARE_REACH,
      screens,
      poles,
      suns,
      tone: tint,
      ember,
      shine: new Color(0, 0, 0),
      dusk: 0,
      paint: null,
      ...surface,
      warm: () => false,
      light(_rays, _chart, tick) {
        const one = beat(tick * pace);
        const two = beat(tick * pace + 0.5);
        boil.set(one.shift, one.weight, two.shift, two.weight);
        flow.set(one.share, two.share);
        activity.turn(tick);
        uniforms.burst.value = activity.burst;
        prominences.turn(tick);
        drift.value = tick * PROMINENCE_DRIFT;
      },
      dispose() {
        release();
        globe.material.dispose();
        plumes.material.dispose();
        flare.material.dispose();
      },
    };
  };

  const hollow = (body: Body): Look => {
    const frame = new Group();
    const shadow = new Mesh(ball, new MeshBasicMaterial({ color: 0x000000 }));
    const girth = SHADOW * body.radius;
    const dark = new Color(0, 0, 0);
    const blank = new CubeTexture();
    const shown = { size: 0, far: false };
    const settle = () => {
      shadow.visible = shown.size > 0 && !shown.far;
    };
    shadow.scale.setScalar(girth);
    settle();
    frame.add(shadow);
    return {
      body,
      frame,
      girth,
      ball: girth,
      flat: 1,
      halo: 0,
      screens: [],
      poles: [],
      suns: [],
      tone: dark,
      ember: dark,
      shine: dark,
      dusk: 0,
      paint: null,
      detail: () => shown.size,
      relief: () => blank,
      bare() {},
      light() {},
      warm: () => false,
      refine(wanted) {
        shown.size = wanted;
        settle();
      },
      recede(next) {
        shown.far = next;
        settle();
      },
      restore() {},
      dispose() {
        shadow.material.dispose();
        blank.dispose();
      },
    };
  };

  const shape = (body: Body, lamps: Glare[], spare = 0): Look => {
    const family = familyOf(body.physics);
    if (family === "star") {
      return holeOf(body.physics) ? hollow(body) : ignite(body);
    }
    const seen = lamps.map((lamp) => lamp.seen);
    const giant = family === "fluid" ? giantOf(body, seen, spare) : null;
    const skin = giant === null ? skinOf(body, seen, spare) : null;
    const suns = Array.from({ length: LAMP_ROOM }, () => new Vector3());
    const shines = suns.map(() => new Color(0, 0, 0));
    const might = { value: 0 };
    const dusk = { value: 0 };
    const wet = body.relief.sea !== null;
    const palette = Array.from(
      { length: PALETTE_ROOM },
      (_, index) => new Color(skin?.palette[index] ?? 0),
    );
    const haze = new Color(giant?.haze ?? skin?.haze ?? 0);
    const lanes = giant === null ? [] : bandsOf(body, giant);
    const storms = giant === null ? [] : stormsOf(body, giant, lanes);
    const spots = Array.from({ length: STORM_ROOM }, () => new Vector4(1, 0, 0, 0));
    const stream = new Vector4(0, 1, 0, 0);
    const shift = new Vector2();
    const flat = 1 - flatnessOf(body.physics);
    const lump = skin === null ? new Vector4(0, 1, 1, 1) : new Vector4(...skin.lump);
    const girth = body.radius / Math.cbrt(lump.y * lump.z * lump.w);
    const hoop = hoopOf(body);
    const grit = hoop === null ? null : gritOf(body, hoop);
    const bands = giant === null ? null : chartOf(body, giant, lanes);
    const reach =
      hoop === null
        ? new Vector2(0, 0)
        : new Vector2(hoop.parts[0][0], hoop.parts[hoop.parts.length - 1][1]);
    const sunny = new Vector3(1, 0, 0);
    const upright = new Quaternion();
    const embers = new Vector4();
    const melt = new Vector2();
    const clime = new Vector4(0, skin?.lift ?? 0, skin?.snowy ?? 0, wet ? 1 : 0);
    const beam = new Color(0, 0, 0);
    const gleam = new Color(0, 0, 0);
    const ember = new Color(0, 0, 0);
    const fade = RING_GLEAM / Math.max(1, (reach.x + reach.y) / 2) ** 3;
    let warmth = body.physics.heat;
    const relit = () => {
      const season = seasonOf(body, seen, warmth, spare);
      const [red, green, blue, strength] = season.ember;
      embers.set(red, green, blue, strength);
      melt.set(...season.melt);
      clime.x = season.frost;
      lamps.forEach((lamp, at) => {
        shines[at].copy(lamp.tint).multiplyScalar(season.shown.lamps[at]);
      });
      might.value = Math.max(shines[0].r, shines[0].g, shines[0].b);
      dusk.value = season.shown.sky;
      if (grit !== null) {
        const cast = giant === null ? 0 : seenGlow(warmth) * fade;
        const hooped = shownLight([...seen, cast], 0, spare);
        if (lamps.length > 0) {
          beam.copy(lamps[0].tint).multiplyScalar(hooped.lamps[0]);
        }
        gleam.setRGB(red, green, blue).multiplyScalar(hooped.lamps[seen.length]);
      }
      const bared = giant === null ? 0.5 * season.melt[1] * (1 - (skin?.shroud ?? 0)) : 1;
      ember
        .setRGB(red, green, blue)
        .multiplyScalar(SPECK_EMBER * strength * Math.max(0, Math.min(1, bared)));
    };
    relit();
    const uniforms = {
      relief: { value: null as CubeTexture | null },
      palette: { value: palette },
      haze: { value: haze },
      suns: { value: suns },
      shines: { value: shines },
      dusk,
      chart: { value: 0 },
      air: { value: giant?.air ?? skin?.air ?? 0 },
      fog: { value: new Color(skin?.fog ?? 0xffffff) },
      drift: { value: 0 },
      squash: { value: 1 / flat ** 2 },
      grit: { value: grit },
      hoop: { value: reach },
      sunny: { value: sunny },
      ember: { value: embers },
      lump: { value: lump },
      seed: { value: body.seed },
      ...(skin === null
        ? {}
        : {
            melt: { value: melt },
            ramp: {
              value: wet
                ? new Vector2(0, body.relief.peak - (body.relief.sea ?? 0))
                : new Vector2(skin.low, skin.span),
            },
            clime: { value: clime },
            marks: {
              value: new Vector4(
                skin.patch,
                skin.belted,
                skin.cracks,
                body.relief.craters > 0 ? 1 : 0,
              ),
            },
            deck: { value: new Vector2(skin.clouds, skin.shroud) },
            relish: { value: skin.bump },
          }),
      ...(giant === null
        ? {}
        : {
            vents: { value: giant.vents },
            bands: { value: bands },
            stream: { value: stream },
            shift: { value: shift },
            mood: { value: new Vector3(giant.stir, giant.streak, giant.puff) },
            storms: { value: spots },
            whirls: {
              value: Array.from({ length: STORM_ROOM }, (_, index) => {
                const storm = storms[index];
                return storm === undefined
                  ? new Vector4(1, 0, 0, 0)
                  : new Vector4(storm.stretch, storm.spin, storm.wake * WAKE_SHIFT, storm.crest);
              }),
            },
            stains: {
              value: Array.from({ length: STORM_ROOM }, (_, index) => {
                const storm = storms[index];
                return storm === undefined
                  ? new Vector4(0, 0, 0, 0)
                  : new Vector4(storm.tint.r, storm.tint.g, storm.tint.b, storm.cover);
              }),
            },
          }),
    };
    const shown: Mesh[] = [];
    const { release, ...surface } = baked(body, uniforms.relief, shown);

    const frame = new Group();
    const globe = new Mesh(
      ball,
      new ShaderMaterial({
        vertexShader: LUMP_VERTEX,
        fragmentShader: bodyFragment(giant !== null),
        defines,
        uniforms,
      }),
    );
    globe.scale.set(girth, girth * flat, girth);
    globe.frustumCulled = lump.x === 0;
    globe.visible = false;
    shown.push(globe);
    frame.add(globe);

    const parts: Mesh<IcosahedronGeometry | RingGeometry, ShaderMaterial>[] = [globe];
    if (uniforms.air.value > 0) {
      const shell = new Mesh(
        ball,
        new ShaderMaterial({
          vertexShader: SHELL_VERTEX,
          fragmentShader: SHELL_FRAGMENT,
          side: BackSide,
          blending: AdditiveBlending,
          transparent: true,
          depthWrite: false,
          uniforms: {
            haze: uniforms.haze,
            sun: { value: suns[0] },
            chart: uniforms.chart,
            air: uniforms.air,
            might,
            rim: { value: Math.sqrt(1 - 1 / SHELL_SCALE ** 2) },
          },
        }),
      );
      shell.scale.copy(globe.scale).multiplyScalar(SHELL_SCALE);
      shell.visible = false;
      shown.push(shell);
      frame.add(shell);
      parts.push(shell);
    }

    if (grit !== null) {
      const ring = new Mesh(
        new RingGeometry(reach.x * 0.98, reach.y * 1.02, 128, 1).rotateX(-Math.PI / 2),
        new ShaderMaterial({
          vertexShader: RING_VERTEX,
          fragmentShader: RING_FRAGMENT,
          side: DoubleSide,
          transparent: true,
          premultipliedAlpha: true,
          depthWrite: false,
          uniforms: {
            grit: { value: grit },
            hoop: { value: reach },
            sunny: { value: sunny },
            shine: { value: beam },
            inner: { value: gleam },
            squash: uniforms.squash,
          },
        }),
      );
      ring.scale.setScalar(body.radius);
      ring.renderOrder = 1;
      frame.add(ring);
      parts.push(ring);
    }

    const tone = new Color(0, 0, 0);
    if (giant !== null) {
      const shades = [...giant.zones, ...giant.belts];
      for (const shade of shades) {
        tone.add(new Color(shade).multiplyScalar(1 / shades.length));
      }
    } else if (skin !== null) {
      tone.copy(palette[3]).lerp(palette[4], 0.5);
      tone.lerp(palette[1], 0.8 * seaCover(body.physics));
      tone.lerp(new Color(skin.fog), Math.max(skin.shroud, 0.3 * skin.clouds));
    }

    return {
      body,
      frame,
      girth: body.radius * Math.max(1, RING_VIEW * reach.y),
      ball:
        lump.x > 0
          ? girth * Math.min(lump.y, lump.z, lump.w) * (1 - LUMP_SWELL * lump.x)
          : body.radius,
      flat: lump.x > 0 ? 1 : flat,
      halo: 0,
      screens: [],
      poles: [],
      suns: [],
      tone,
      ember,
      shine: shines[0],
      get dusk() {
        return dusk.value;
      },
      paint: skin === null ? null : uniforms,
      ...surface,
      warm(heat, glare) {
        const moved = seen.some((was, at) => Math.abs(glare[at] - was) > GLARE_STEP * was);
        if (!moved && Math.abs(heat - warmth) < WARM_STEP) {
          return false;
        }
        warmth = heat;
        seen.forEach((_, at) => {
          seen[at] = glare[at];
        });
        relit();
        return true;
      },
      light(rays, chart, tick) {
        suns.forEach((sun, at) => {
          sun.copy(rays[at] ?? NOWHERE);
        });
        uniforms.chart.value = chart;
        uniforms.drift.value = (2 * Math.PI * (tick % CLOUD_TURN)) / CLOUD_TURN;
        if (grit !== null) {
          sunny.copy(suns[0]).applyQuaternion(frame.getWorldQuaternion(upright).invert());
        }
        if (giant === null) {
          return;
        }
        const beat = (age: number, offset: number) => {
          const cycle = Math.floor(age);
          const share = age - cycle;
          return {
            lag: (share - 0.5) * ((2 * Math.PI * FLOW_LIFE) / JET_TURN),
            weight: 1 - Math.abs(2 * share - 1),
            turn: ((cycle + offset) * GOLDEN_TURN) % (2 * Math.PI),
          };
        };
        const one = beat(tick / FLOW_LIFE, 0);
        const two = beat(tick / FLOW_LIFE + 0.5, 0.5);
        const whole = Math.hypot(one.weight, two.weight);
        stream.set(one.lag, one.weight / whole, two.lag, two.weight / whole);
        shift.set(one.turn, two.turn);
        storms.forEach((storm, index) => {
          const angle = storm.turn + (2 * Math.PI * tick) / storm.year;
          const level = Math.cos(storm.height);
          spots[index].set(
            level * Math.cos(angle),
            Math.sin(storm.height),
            level * Math.sin(angle),
            storm.size,
          );
        });
      },
      dispose() {
        release();
        grit?.dispose();
        bands?.dispose();
        for (const part of parts) {
          part.material.dispose();
          if (part.geometry !== ball) {
            part.geometry.dispose();
          }
        }
      },
    };
  };

  return { shineOf, shape };
}
