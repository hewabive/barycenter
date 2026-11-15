import { type Body, type BodyKind, createRandom } from "@barycenter/sim";
import {
  AdditiveBlending,
  BackSide,
  Color,
  type CubeTexture,
  DataTexture,
  Group,
  HalfFloatType,
  IcosahedronGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  MathUtils,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  WebGLCubeRenderTarget,
  type WebGLRenderer,
} from "three";
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
  LIMB,
  LIMB_DEPTH,
  SHELL_FRAGMENT,
  SHELL_VERTEX,
  SPOT_ROOM,
  STAR_BAKE_FRAGMENT,
  STAR_FRAGMENT,
  STORM_ROOM,
} from "./shaders.ts";

export interface Look {
  body: Body;
  frame: Group;
  relief(): CubeTexture;
  light(sun: Vector3, chart: number, tick: number): void;
  refine(size: number): void;
  restore(): void;
}

interface Skin {
  palette: number[];
  haze: number;
  air: number;
}

interface Flame {
  tint: number;
  kelvin: number;
  grain: number;
  chill: number;
  poles: number;
  regions: number;
  girth: number;
  belt: number;
}

interface Region {
  span: number;
  shift: number;
  cycle: number;
  height: number;
  turn: number;
  girth: number;
}

interface Brew {
  side: -1 | 0 | 1;
  band: number;
  seat: number;
  count: number;
  size: number;
  stretch: number;
  tint: number;
  cover: number;
  wake: number;
  crest: number;
}

interface Giant {
  zones: number[];
  belts: number[];
  pole: number;
  wisp: number | null;
  first: number;
  width: number;
  narrowing: number;
  cap: number;
  edge: number;
  veins: number;
  stir: number;
  streak: number;
  puff: number;
  eastward: boolean;
  jets: number;
  squash: number;
  haze: number;
  air: number;
  brews: Brew[];
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
const PALETTE_ROOM = 8;
const CLOUD_TURN = 2400;
const JET_TURN = 1800;
const FLOW_LIFE = 300;
const BAND_STEPS = 1024;
const BAND_LEAST = 0.05;
const WAKE_SHIFT = 3;
const STORM_YEAR = 5000;
const GRANULE_LIFE = 24;
const GRANULE_CHURN = 0.02;
const GOLDEN_TURN = 2.39996;
const REGION_LIFE = 1400;
const SHINE_PALE = 0.6;
const WIEN = 14388;
const WAVES = [0.61, 0.55, 0.465];

function brew(given: Partial<Brew> & Pick<Brew, "band" | "size" | "tint">): Brew {
  return { side: -1, seat: 0, count: 1, stretch: 1.3, cover: 0.9, wake: 0, crest: 0, ...given };
}

const GIANTS: Giant[] = [
  {
    zones: [0xefe6d2, 0xe3d2b0, 0xd9c8a8, 0xe8dcc0],
    belts: [0x9a6a4a, 0x7a4b35, 0xa87a52, 0x86705e],
    pole: 0x7f7669,
    wisp: 0x6b7480,
    first: 0.13,
    width: 0.15,
    narrowing: 0.82,
    cap: 0.95,
    edge: 0.008,
    veins: 0.13,
    stir: 0.8,
    streak: 0.5,
    puff: 0.35,
    eastward: true,
    jets: 1,
    squash: 0.065,
    haze: 0xbfae95,
    air: 0.07,
    brews: [
      brew({ band: 2, seat: -0.75, size: 0.6, stretch: 1.6, tint: 0xb5694e, cover: 0.95, wake: 1 }),
      brew({ band: 4, count: 4, size: 0.3, stretch: 1.2, tint: 0xf3ead8 }),
      brew({ band: 3, seat: 0.2, size: 0.34, stretch: 1.4, tint: 0xe2b99a }),
      brew({
        side: 1,
        band: 1,
        seat: 0.45,
        count: 2,
        size: 0.14,
        stretch: 2.6,
        tint: 0x5a3524,
        cover: 0.85,
      }),
    ],
  },
  {
    zones: [0xf5e0a8, 0xf0d590, 0xf7e7ba],
    belts: [0xdcb872, 0xcfa35c, 0xe3c483, 0xc9a868],
    pole: 0x8f9c9e,
    wisp: null,
    first: 0.16,
    width: 0.12,
    narrowing: 0.92,
    cap: 1.15,
    edge: 0.02,
    veins: 0.09,
    stir: 0.3,
    streak: 0.2,
    puff: 0.1,
    eastward: true,
    jets: 0.8,
    squash: 0.098,
    haze: 0xd9c79a,
    air: 0.1,
    brews: [
      brew({ side: 1, band: 3, size: 0.3, stretch: 1.5, tint: 0xf4ecd6, cover: 0.7, wake: 0.6 }),
      brew({ band: 4, count: 2, size: 0.25, tint: 0xefe2bd, cover: 0.6 }),
    ],
  },
  {
    zones: [0x3f6fd0, 0x4a7bd8, 0x3a66c4],
    belts: [0x2f58b8, 0x2a4fa8, 0x3560bc],
    pole: 0x2c4f9c,
    wisp: null,
    first: 0.3,
    width: 0.24,
    narrowing: 0.95,
    cap: 1.2,
    edge: 0.05,
    veins: 0.05,
    stir: 0.2,
    streak: 0.2,
    puff: 0.12,
    eastward: false,
    jets: 0,
    squash: 0.02,
    haze: 0x5a8cf0,
    air: 0.25,
    brews: [
      brew({ band: 1, seat: 0.2, size: 0.42, stretch: 1.8, tint: 0x1c3476, cover: 0.85, crest: 1 }),
      brew({ side: 1, band: 2, size: 0.16, stretch: 1.5, tint: 0x1f3a80, cover: 0.8, crest: 0.8 }),
      brew({ side: 0, band: 1, seat: -0.4, count: 3, size: 0.045, stretch: 6, tint: 0xe8f1ff }),
    ],
  },
  {
    zones: [0xa0dbe8, 0xaae2ea, 0x9cd6e6],
    belts: [0x93cfe0, 0x98d3e2, 0x8fcbdc],
    pole: 0xc2eef0,
    wisp: null,
    first: 0.35,
    width: 0.25,
    narrowing: 0.95,
    cap: 0.85,
    edge: 0.08,
    veins: 0.02,
    stir: 0.15,
    streak: 0.08,
    puff: 0.1,
    eastward: false,
    jets: 0,
    squash: 0.023,
    haze: 0xb9ecec,
    air: 0.25,
    brews: [
      brew({ side: 1, band: 2, count: 2, size: 0.05, stretch: 4, tint: 0xf2ffff, cover: 0.6 }),
    ],
  },
];

const STARS: Flame[] = [
  {
    tint: 0xffb663,
    kelvin: 5800,
    grain: 0.07,
    chill: 0.58,
    poles: 0,
    regions: 7,
    girth: 0.03,
    belt: 0.55,
  },
  {
    tint: 0xff9545,
    kelvin: 4700,
    grain: 0.055,
    chill: 0.62,
    poles: 0,
    regions: 8,
    girth: 0.036,
    belt: 0.7,
  },
  { tint: 0xccdeff, kelvin: 8200, grain: 0, chill: 1, poles: 0.2, regions: 0, girth: 0, belt: 0 },
  {
    tint: 0xff6f2c,
    kelvin: 3400,
    grain: 0.03,
    chill: 0.8,
    poles: 0,
    regions: 8,
    girth: 0.05,
    belt: 1.1,
  },
];

function flameOf(star: Body): Flame {
  return STARS[star.seed % STARS.length];
}

function regionsOf(star: Body, flame: Flame): Region[] {
  const random = createRandom(star.seed);
  return Array.from({ length: Math.min(flame.regions, SPOT_ROOM / 2) }, () => {
    const span = REGION_LIFE * (0.7 + 0.6 * random.next());
    return { span, shift: span * random.next(), cycle: Number.NaN, height: 0, turn: 0, girth: 0 };
  });
}

const SKINS: Record<Exclude<BodyKind, "gas" | "star">, Skin> = {
  terran: {
    palette: [0x081a2c, 0x173d58, 0x4f6b45, 0x72804f, 0x97855f, 0x7d6a5a, 0xdfe3e6, 0xa59a66],
    haze: 0x6fa8ff,
    air: 1,
  },
  desert: {
    palette: [0x4a2f24, 0x9a5230, 0xc48a55, 0xdcb98a, 0, 0, 0xe6e2da],
    haze: 0xd89a70,
    air: 0.4,
  },
  barren: { palette: [0x3c3a39, 0x77736e, 0xa9a49c], haze: 0, air: 0 },
  ice: { palette: [0x9db8c9, 0xe8f1f5, 0x3f6a8c], haze: 0xa8d8ff, air: 0.6 },
};

function giantOf(body: Body): Giant {
  return GIANTS[body.seed % GIANTS.length];
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
  const wisp = giant.wisp === null ? null : new Color(giant.wisp);
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
      if (index === 0 && wisp !== null) {
        shade.lerp(wisp, 0.75 * Math.exp(-(((level - band.from - 0.012) / 0.014) ** 2)));
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

export function createLooks(renderer: WebGLRenderer, bodies: Body[], detail: number): Look[] {
  const packed =
    !renderer.extensions.has("EXT_color_buffer_half_float") &&
    !renderer.extensions.has("EXT_color_buffer_float");
  const defines: Record<string, string> = packed ? { PACKED: "" } : {};
  const ball = new IcosahedronGeometry(1, 20);
  const sheet = new PlaneGeometry(2, 2);

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
  const fill = (target: WebGLCubeRenderTarget, body: Body) => {
    const before = renderer.getRenderTarget();
    if (body.kind === "star") {
      stamp(target, forge, body);
    } else if (body.kind === "gas") {
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
      press.uniforms.shape.value.set(body.relief.frequency, body.relief.warp, body.relief.ridge);
      press.uniforms.sea.value = body.relief.sea ?? 0;
      stamp(target, press, body);
    }
    renderer.setRenderTarget(before);
  };
  const bake = (body: Body, size: number): WebGLCubeRenderTarget => {
    const target = new WebGLCubeRenderTarget(size, {
      type: packed || body.kind === "star" ? UnsignedByteType : HalfFloatType,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
    });
    fill(target, body);
    return target;
  };
  const baked = (body: Body, settle: (relief: CubeTexture, size: number) => void) => {
    let size = detail;
    let target = bake(body, size);
    settle(target.texture, size);
    return {
      relief: () => target.texture,
      refine(wanted: number) {
        if (wanted === size) {
          return;
        }
        const old = target;
        size = wanted;
        target = bake(body, size);
        settle(target.texture, size);
        old.dispose();
      },
      restore() {
        fill(target, body);
      },
    };
  };

  const star = bodies.find((body) => body.kind === "star");
  const shine =
    star === undefined
      ? new Color(0xffffff)
      : new Color(flameOf(star).tint).lerp(new Color(0xffffff), SHINE_PALE);

  const ignite = (body: Body): Look => {
    const flame = flameOf(body);
    const regions = regionsOf(body, flame);
    const spots = Array.from({ length: SPOT_ROOM }, () => new Vector4(0, 0, 0, 0));
    const boil = new Vector4(0, 1, 0, 0);
    const flow = new Vector2();
    const tint = new Color(flame.tint);
    const steep = new Vector3(...WAVES.map((wave) => WIEN / (wave * flame.kelvin)));
    const edge = (shade: number, power: number) =>
      1 - Math.exp(-EXPOSURE * shade * LIMB_DEPTH ** (LIMB * power));
    const rim = new Color(edge(tint.r, steep.x), edge(tint.g, steep.y), edge(tint.b, steep.z));
    const uniforms = {
      relief: { value: null as CubeTexture | null },
      spots: { value: spots },
      boil: { value: boil },
      flow: { value: flow },
      tint: { value: tint },
      steep: { value: steep },
      traits: { value: new Vector3(flame.grain, flame.chill, flame.poles) },
    };
    const surface = baked(body, (relief) => {
      uniforms.relief.value = relief;
    });

    const frame = new Group();
    const globe = new Mesh(
      ball,
      new ShaderMaterial({ vertexShader: BODY_VERTEX, fragmentShader: STAR_FRAGMENT, uniforms }),
    );
    globe.scale.setScalar(body.radius);
    frame.add(globe);
    const flare = new Mesh(
      sheet,
      new ShaderMaterial({
        vertexShader: FLARE_VERTEX,
        fragmentShader: FLARE_FRAGMENT,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
        uniforms: {
          spots: uniforms.spots,
          rim: { value: rim },
          reach: { value: body.radius * FLARE_REACH },
          girth: { value: body.radius },
        },
      }),
    );
    flare.frustumCulled = false;
    frame.add(flare);

    const place = (spot: Vector4, height: number, turn: number, girth: number) => {
      const level = Math.cos(height);
      spot.set(level * Math.cos(turn), Math.sin(height), level * Math.sin(turn), girth);
    };
    const beat = (age: number) => {
      const cycle = Math.floor(age);
      const share = age - cycle;
      return {
        angle: ((cycle * GOLDEN_TURN) % (2 * Math.PI)) + (share - 0.5) * GRANULE_CHURN,
        weight: 1 - Math.abs(2 * share - 1),
        share,
      };
    };

    return {
      body,
      frame,
      ...surface,
      light(_toward, _chart, tick) {
        const one = beat(tick / GRANULE_LIFE);
        const two = beat(tick / GRANULE_LIFE + 0.5);
        const whole = Math.hypot(one.weight, two.weight);
        boil.set(one.angle, one.weight / whole, two.angle, two.weight / whole);
        flow.set(one.share, two.share);
        regions.forEach((region, index) => {
          const age = (tick + region.shift) / region.span;
          const cycle = Math.floor(age);
          const share = age - cycle;
          if (cycle !== region.cycle) {
            const random = createRandom(body.seed + 7919 * (index + 1) + 104729 * cycle);
            region.cycle = cycle;
            region.height =
              (random.next() < 0.5 ? -1 : 1) * flame.belt * (0.2 + 0.8 * random.next());
            region.turn = 2 * Math.PI * random.next();
            region.girth = flame.girth * (0.6 + 0.8 * random.next());
          }
          const lead =
            MathUtils.smoothstep(share, 0, 0.12) * (1 - MathUtils.smoothstep(share, 0.5, 1));
          const trail =
            MathUtils.smoothstep(share, 0.04, 0.18) * (1 - MathUtils.smoothstep(share, 0.35, 0.8));
          const gap = ((3 + 1.5 * share) * region.girth) / Math.cos(region.height);
          place(spots[2 * index], region.height, region.turn, region.girth * Math.sqrt(lead));
          place(
            spots[2 * index + 1],
            region.height + Math.sign(region.height) * 0.8 * region.girth,
            region.turn + gap,
            0.62 * region.girth * Math.sqrt(trail),
          );
        });
      },
    };
  };

  return bodies.map((body): Look => {
    if (body.kind === "star") {
      return ignite(body);
    }
    const giant = body.kind === "gas" ? giantOf(body) : null;
    const skin: Skin =
      giant !== null
        ? { palette: [], haze: giant.haze, air: giant.air }
        : SKINS[body.kind as keyof typeof SKINS];
    const palette = Array.from(
      { length: PALETTE_ROOM },
      (_, index) => new Color(skin.palette[index] ?? 0),
    );
    const haze = new Color(skin.haze);
    const sun = new Vector3(1, 0, 0);
    const bands = giant === null ? [] : bandsOf(body, giant);
    const storms = giant === null ? [] : stormsOf(body, giant, bands);
    const spots = Array.from({ length: STORM_ROOM }, () => new Vector4(1, 0, 0, 0));
    const stream = new Vector4(0, 1, 0, 0);
    const shift = new Vector2();
    const flat = 1 - (giant?.squash ?? 0);
    const uniforms = {
      relief: { value: null as CubeTexture | null },
      palette: { value: palette },
      haze: { value: haze },
      sun: { value: sun },
      chart: { value: 0 },
      span: { value: body.relief.peak - (body.relief.sea ?? 0) },
      air: { value: skin.air },
      shine: { value: shine },
      drift: { value: 0 },
      squash: { value: 1 / flat ** 2 },
      ...(giant === null
        ? {}
        : {
            bands: { value: chartOf(body, giant, bands) },
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
    const surface = baked(body, (relief) => {
      uniforms.relief.value = relief;
    });

    const frame = new Group();
    const globe = new Mesh(
      ball,
      new ShaderMaterial({
        vertexShader: BODY_VERTEX,
        fragmentShader: bodyFragment(body.kind),
        defines,
        uniforms,
      }),
    );
    globe.scale.set(body.radius, body.radius * flat, body.radius);
    frame.add(globe);

    if (skin.air > 0) {
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
            sun: uniforms.sun,
            chart: uniforms.chart,
            air: uniforms.air,
            rim: { value: Math.sqrt(1 - 1 / SHELL_SCALE ** 2) },
          },
        }),
      );
      shell.scale.copy(globe.scale).multiplyScalar(SHELL_SCALE);
      frame.add(shell);
    }

    return {
      body,
      frame,
      ...surface,
      light(toward, chart, tick) {
        sun.copy(toward);
        uniforms.chart.value = chart;
        uniforms.drift.value = (2 * Math.PI * (tick % CLOUD_TURN)) / CLOUD_TURN;
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
    };
  });
}
