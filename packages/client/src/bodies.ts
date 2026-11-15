import type { Body, BodyKind } from "@barycenter/sim";
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
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
  WebGLCubeRenderTarget,
  type WebGLRenderer,
} from "three";
import {
  BAKE_FRAGMENT,
  BAKE_VERTEX,
  BODY_VERTEX,
  bodyFragment,
  FLARE_FRAGMENT,
  FLARE_VERTEX,
  SHELL_FRAGMENT,
  SHELL_VERTEX,
  STAR_FRAGMENT,
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

const SHELL_SCALE = 1.04;
const FLARE_REACH = 4.5;
const PALETTE_ROOM = 8;
const CLOUD_DAYS = 6;

const WARM_GAS = [0xc9a57a, 0x8a5a3a, 0xe8d6b4, 0x6f5a4a];
const COLD_GAS = [0x5f8fc0, 0x2f5f9a, 0xa9cfe6, 0x35507a];

const SKINS: Record<Exclude<BodyKind, "gas">, Skin> = {
  star: { palette: [0xfff3d1, 0xff9a3c], haze: 0xffd9a0, air: 0 },
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

function skinOf(body: Body): Skin {
  if (body.kind !== "gas") {
    return SKINS[body.kind];
  }
  const palette = body.seed % 2 === 0 ? WARM_GAS : COLD_GAS;
  return { palette, haze: palette[2], air: 0.8 };
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
  const bench = new Scene();
  bench.add(new Mesh(sheet, press));
  const lens = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const fill = (target: WebGLCubeRenderTarget, body: Body) => {
    const size = target.width;
    press.uniforms.seed.value = body.seed;
    press.uniforms.shape.value.set(body.relief.frequency, body.relief.warp, body.relief.ridge);
    press.uniforms.sea.value = body.relief.sea ?? 0;
    press.uniforms.size.value = size;
    const before = renderer.getRenderTarget();
    for (let face = 0; face < 6; face++) {
      press.uniforms.face.value = face;
      press.uniformsNeedUpdate = true;
      renderer.setRenderTarget(target, face);
      renderer.render(bench, lens);
    }
    renderer.setRenderTarget(before);
  };
  const bake = (body: Body, size: number): WebGLCubeRenderTarget => {
    const target = new WebGLCubeRenderTarget(size, {
      type: packed ? UnsignedByteType : HalfFloatType,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
    });
    fill(target, body);
    return target;
  };

  return bodies.map((body): Look => {
    const skin = skinOf(body);
    const palette = Array.from(
      { length: PALETTE_ROOM },
      (_, index) => new Color(skin.palette[index] ?? 0),
    );
    const haze = new Color(skin.haze);
    const sun = new Vector3(1, 0, 0);
    let size = detail;
    let target = bake(body, size);
    const uniforms = {
      relief: { value: target.texture },
      palette: { value: palette },
      haze: { value: haze },
      sun: { value: sun },
      chart: { value: 0 },
      span: { value: body.relief.peak - (body.relief.sea ?? 0) },
      air: { value: skin.air },
      drift: { value: 0 },
    };

    const frame = new Group();
    const globe = new Mesh(
      ball,
      new ShaderMaterial({
        vertexShader: BODY_VERTEX,
        fragmentShader: body.kind === "star" ? STAR_FRAGMENT : bodyFragment(body.kind),
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
    if (body.kind === "star") {
      const flare = new Mesh(
        sheet,
        new ShaderMaterial({
          vertexShader: FLARE_VERTEX,
          fragmentShader: FLARE_FRAGMENT,
          blending: AdditiveBlending,
          transparent: true,
          depthWrite: false,
          uniforms: {
            tint: uniforms.haze,
            reach: { value: body.radius * FLARE_REACH },
            core: { value: 1 / FLARE_REACH },
          },
        }),
      );
      flare.frustumCulled = false;
      frame.add(flare);
    }

    return {
      body,
      frame,
      relief: () => target.texture,
      light(toward, chart, tick) {
        sun.copy(toward);
        uniforms.chart.value = chart;
        uniforms.drift.value = (2 * Math.PI * tick) / (body.day * CLOUD_DAYS);
      },
      refine(wanted) {
        if (wanted === size) {
          return;
        }
        const old = target;
        size = wanted;
        target = bake(body, size);
        uniforms.relief.value = target.texture;
        old.dispose();
      },
      restore() {
        fill(target, body);
      },
    };
  });
}
