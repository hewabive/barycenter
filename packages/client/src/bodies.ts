import { type Body, type BodyKind, createRandom } from "@barycenter/sim";
import {
  AdditiveBlending,
  BackSide,
  Color,
  type CubeTexture,
  Group,
  HalfFloatType,
  IcosahedronGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  MathUtils,
  Mesh,
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

interface Storm {
  height: number;
  turn: number;
  size: number;
  year: number;
}

const SHELL_SCALE = 1.04;
const FLARE_REACH = 3;
const PALETTE_ROOM = 8;
const CLOUD_TURN = 2400;
const JET_TURN = 1800;
const GRANULE_LIFE = 24;
const GRANULE_CHURN = 0.02;
const GOLDEN_TURN = 2.39996;
const REGION_LIFE = 1400;
const SHINE_PALE = 0.6;
const WIEN = 14388;
const WAVES = [0.61, 0.55, 0.465];
const COARSE_SIDE = 32;
const STORM_SIZES = [0.26, 0.13, 0.1, 0.08];
const STORM_YEAR = 5000;

const WARM_GAS = [0xc9a57a, 0x8a5a3a, 0xe8d6b4, 0x6f5a4a, 0xb5553a, 0xf0e3c8];
const COLD_GAS = [0x5f8fc0, 0x2f5f9a, 0xa9cfe6, 0x35507a, 0xe9f4fb, 0x24467a];

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

function skinOf(kind: Exclude<BodyKind, "star">, seed: number): Skin {
  if (kind !== "gas") {
    return SKINS[kind];
  }
  const palette = seed % 2 === 0 ? WARM_GAS : COLD_GAS;
  return { palette, haze: palette[2], air: 0.8 };
}

function stormsOf(body: Body): Storm[] {
  if (body.kind !== "gas") {
    return [];
  }
  const random = createRandom(body.seed);
  return STORM_SIZES.slice(0, STORM_ROOM).map((size, index) => ({
    height: (index % 2 === 0 ? 1 : -1) * (0.15 + 0.45 * random.next()),
    turn: 2 * Math.PI * random.next(),
    size,
    year: (random.next() < 0.5 ? -1 : 1) * STORM_YEAR * (1 + random.next()),
  }));
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
  const plate = new Mesh(sheet, press);
  const bench = new Scene();
  bench.add(plate);
  const lens = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const fill = (target: WebGLCubeRenderTarget, body: Body) => {
    const size = target.width;
    const tool = body.kind === "star" ? forge : press;
    tool.uniforms.seed.value = body.seed;
    tool.uniforms.size.value = size;
    press.uniforms.shape.value.set(body.relief.frequency, body.relief.warp, body.relief.ridge);
    press.uniforms.sea.value = body.relief.sea ?? 0;
    plate.material = tool;
    const before = renderer.getRenderTarget();
    for (let face = 0; face < 6; face++) {
      tool.uniforms.face.value = face;
      tool.uniformsNeedUpdate = true;
      renderer.setRenderTarget(target, face);
      renderer.render(bench, lens);
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
    const skin = skinOf(body.kind, body.seed);
    const palette = Array.from(
      { length: PALETTE_ROOM },
      (_, index) => new Color(skin.palette[index] ?? 0),
    );
    const haze = new Color(skin.haze);
    const sun = new Vector3(1, 0, 0);
    const storms = stormsOf(body);
    const spots = Array.from({ length: STORM_ROOM }, () => new Vector4());
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
      grain: { value: 0 },
      storms: { value: spots },
    };
    const surface = baked(body, (relief, size) => {
      uniforms.relief.value = relief;
      uniforms.grain.value = Math.log2(size / COARSE_SIDE);
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
    globe.scale.setScalar(body.radius);
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
      shell.scale.setScalar(body.radius * SHELL_SCALE);
      frame.add(shell);
    }

    return {
      body,
      frame,
      ...surface,
      light(toward, chart, tick) {
        sun.copy(toward);
        uniforms.chart.value = chart;
        const turn = body.kind === "gas" ? JET_TURN : CLOUD_TURN;
        uniforms.drift.value = (2 * Math.PI * (tick % turn)) / turn;
        storms.forEach((storm, index) => {
          const angle = storm.turn + (2 * Math.PI * tick) / storm.year;
          const level = Math.sqrt(1 - storm.height ** 2);
          spots[index].set(
            level * Math.cos(angle),
            storm.height,
            level * Math.sin(angle),
            storm.size,
          );
        });
      },
    };
  });
}
