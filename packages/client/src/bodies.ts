import {
  type Body,
  createRandom,
  lampsOf,
  type Sketch,
  seaCover,
  seenGlow,
  shownLight,
} from "@barycenter/sim";
import {
  AdditiveBlending,
  BackSide,
  Color,
  type CubeTexture,
  DataTexture,
  DoubleSide,
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
  Quaternion,
  RingGeometry,
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
  type Ember,
  emberOf,
  type Flame,
  familyOf,
  flameOf,
  flatnessOf,
  type Giant,
  giantOf,
  type Hoop,
  hoopOf,
  skinOf,
  WAVES,
  WIEN,
} from "./looks.ts";
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
  LAMP_ROOM,
  LIMB,
  LIMB_DEPTH,
  LUMP_VERTEX,
  PALETTE_ROOM,
  RING_FRAGMENT,
  RING_VERTEX,
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
  girth: number;
  tone: Color;
  ember: Color;
  shine: Color;
  dusk: number;
  detail(): number;
  relief(): CubeTexture;
  light(rays: Vector3[], chart: number, tick: number): void;
  refine(size: number): void;
  restore(): void;
  dispose(): void;
}

export interface Glare {
  seen: number;
  tint: Color;
}

export interface Studio {
  shineOf(source: Body): Color;
  shape(body: Body, lamps: Glare[]): Look;
}

interface Region {
  span: number;
  shift: number;
  cycle: number;
  height: number;
  turn: number;
  girth: number;
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
const GRANULE_LIFE = 24;
const GRANULE_CHURN = 0.02;
const GOLDEN_TURN = 2.39996;
const REGION_LIFE = 1400;
const SHINE_PALE = 0.6;
const DIM_PALE = 0.25;
const SPECK_EMBER = 0.6;
const RING_GLEAM = 0.25;
const NOWHERE = new Vector3();

function regionsOf(star: Body, flame: Flame): Region[] {
  const random = createRandom(star.seed);
  return Array.from({ length: Math.min(flame.regions, SPOT_ROOM / 2) }, () => {
    const span = REGION_LIFE * (0.7 + 0.6 * random.next());
    return { span, shift: span * random.next(), cycle: Number.NaN, height: 0, turn: 0, girth: 0 };
  });
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
): { looks: Look[]; sources: number[][]; tintOf(source: Body): Color } {
  const studio = createStudio(renderer);
  const lamps = system.bodies.map((body) => lampsOf(system, body.id).slice(0, LAMP_ROOM));
  const looks = system.bodies.map((body, id) =>
    studio.shape(
      body,
      lamps[id].map(({ source, seen }) => ({
        seen,
        tint: studio.shineOf(system.bodies[source]),
      })),
    ),
  );
  return {
    looks,
    sources: lamps.map((list) => list.map((lamp) => lamp.source)),
    tintOf: studio.shineOf,
  };
}

export function createStudio(renderer: WebGLRenderer): Studio {
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
      press.uniforms.shape.value.set(body.relief.frequency, body.relief.warp, body.relief.ridge);
      press.uniforms.sea.value = body.relief.sea ?? 0;
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
  const baked = (body: Body, settle: (relief: CubeTexture | null) => void) => {
    let size = 0;
    let target: WebGLCubeRenderTarget | null = null;
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
        settle(target?.texture ?? null);
        old?.dispose();
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
    const frame = new Group();
    const globe = new Mesh(
      ball,
      new ShaderMaterial({ vertexShader: BODY_VERTEX, fragmentShader: STAR_FRAGMENT, uniforms }),
    );
    globe.visible = false;
    const { release, ...surface } = baked(body, (relief) => {
      uniforms.relief.value = relief;
      globe.visible = relief !== null;
    });
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
      girth: body.radius,
      tone: tint,
      ember: new Color(0, 0, 0),
      shine: new Color(0, 0, 0),
      dusk: 0,
      ...surface,
      light(_rays, _chart, tick) {
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
      dispose() {
        release();
        globe.material.dispose();
        flare.material.dispose();
      },
    };
  };

  const shape = (body: Body, lamps: Glare[]): Look => {
    const family = familyOf(body.physics);
    if (family === "star") {
      return ignite(body);
    }
    const seen = lamps.map((lamp) => lamp.seen);
    const giant = family === "fluid" ? giantOf(body, seen) : null;
    const skin = giant === null ? skinOf(body, seen) : null;
    const lit = giant?.shown ?? skin?.shown ?? shownLight(seen, 0);
    const suns = Array.from({ length: LAMP_ROOM }, () => new Vector3());
    const shines = suns.map((_, at) =>
      at < lamps.length ? lamps[at].tint.clone().multiplyScalar(lit.lamps[at]) : new Color(0, 0, 0),
    );
    const might = Math.max(shines[0].r, shines[0].g, shines[0].b);
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
    const glow: Ember = giant?.ember ?? skin?.ember ?? [0, 0, 0, 0];
    const hoop = hoopOf(body);
    const grit = hoop === null ? null : gritOf(body, hoop);
    const bands = giant === null ? null : chartOf(body, giant, lanes);
    const reach =
      hoop === null
        ? new Vector2(0, 0)
        : new Vector2(hoop.parts[0][0], hoop.parts[hoop.parts.length - 1][1]);
    const sunny = new Vector3(1, 0, 0);
    const upright = new Quaternion();
    const uniforms = {
      relief: { value: null as CubeTexture | null },
      palette: { value: palette },
      haze: { value: haze },
      suns: { value: suns },
      shines: { value: shines },
      dusk: { value: lit.sky },
      chart: { value: 0 },
      air: { value: giant?.air ?? skin?.air ?? 0 },
      fog: { value: new Color(skin?.fog ?? 0xffffff) },
      drift: { value: 0 },
      squash: { value: 1 / flat ** 2 },
      grit: { value: grit },
      hoop: { value: reach },
      sunny: { value: sunny },
      ember: { value: new Vector4(...glow) },
      lump: { value: lump },
      seed: { value: body.seed },
      ...(skin === null
        ? {}
        : {
            melt: { value: new Vector2(...skin.melt) },
            ramp: {
              value: wet
                ? new Vector2(0, body.relief.peak - (body.relief.sea ?? 0))
                : new Vector2(skin.low, skin.span),
            },
            clime: { value: new Vector4(skin.frost, skin.lift, skin.snowy, wet ? 1 : 0) },
            marks: { value: new Vector4(skin.patch, skin.belted, skin.cracks, 0) },
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
    const { release, ...surface } = baked(body, (relief) => {
      uniforms.relief.value = relief;
      for (const mesh of shown) {
        mesh.visible = relief !== null;
      }
    });

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
            might: { value: might },
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

    const own = giant === null ? 0 : seenGlow(body.physics.heat);
    const cast = (own * RING_GLEAM) / Math.max(1, (reach.x + reach.y) / 2) ** 3;
    const hooped = shownLight([...seen, cast], 0);
    const beam =
      lamps.length > 0 ? lamps[0].tint.clone().multiplyScalar(hooped.lamps[0]) : new Color(0, 0, 0);
    const gleam = new Color(glow[0], glow[1], glow[2]).multiplyScalar(hooped.lamps[seen.length]);
    if (grit !== null) {
      const ring = new Mesh(
        new RingGeometry(reach.x * 0.98, reach.y * 1.02, 128, 1).rotateX(-Math.PI / 2),
        new ShaderMaterial({
          vertexShader: RING_VERTEX,
          fragmentShader: RING_FRAGMENT,
          side: DoubleSide,
          transparent: true,
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
    const bared = giant === null ? 0.5 * (skin?.melt[1] ?? 0) * (1 - (skin?.shroud ?? 0)) : 1;
    const ember = new Color(glow[0], glow[1], glow[2]);
    ember.multiplyScalar(SPECK_EMBER * glow[3] * Math.max(0, Math.min(1, bared)));

    return {
      body,
      frame,
      girth: body.radius * Math.max(1, RING_VIEW * reach.y),
      tone,
      ember,
      shine: shines[0],
      dusk: lit.sky,
      ...surface,
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
