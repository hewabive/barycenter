import {
  type Cleared,
  createRandom,
  type Disk,
  EARTH_MASS,
  type Lane,
  type Ridge,
  TIME_POWER,
} from "@barycenter/sim";
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  Color,
  CylinderGeometry,
  DataTexture,
  DataUtils,
  HalfFloatType,
  LinearFilter,
  Mesh,
  type PixelFormat,
  Points,
  RedFormat,
  RGBAFormat,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
} from "three";
import {
  HAZE_COLUMNS,
  LAMP_HEIGHT,
  type Layer,
  profileOf,
  SHADE_COLUMNS,
  SHADE_ROWS,
  shadeOf,
  shadowAt,
} from "./haze.ts";
import {
  BELT_FRAGMENT,
  BELT_VERTEX,
  BUBBLE_ROOM,
  HAZE_FRAGMENT,
  HAZE_STEPS,
  HAZE_VERTEX,
  MIST_FRAGMENT,
  MIST_VERTEX,
  SCREEN_ROOM,
} from "./shaders.ts";

export interface Belt {
  points: Points;
  turn(tick: number, dense: number, scale: number): void;
}

export interface Lamp {
  girth: number;
  shine: Color;
  level(far: number): number;
  ember(far: number): number;
}

export interface Haze {
  mesh: Mesh;
  eye: Vector3;
  screens: Vector4[];
  bubbles: Vector4[];
  reach: number;
  passed(at: Vector3): number;
  turn(tick: number, pitch: number): void;
}

export interface Mist {
  target: WebGLRenderTarget;
  mesh: Mesh;
  screens: Vector4[];
  lens: Vector2;
  grid: Vector2;
  fit(width: number, height: number): void;
}

const ROCK = 0x8a8076;
const ICE = 0xcdd6dd;
const LEAN_MOST = 3;
const LEAST = 300;
const MOST = 1800;
const BARED = [1e-3, 1e-4];
const CLEARED_TURNS = 12;
const DUST = 0xb39474;
const FROST = 0xaab4bd;
const HAZE_LEAST = 2e-5;
const HAZE_SIDES = 64;
const HAZE_COARSE = 0.7;
const SKINNED = 0.3;
const EMBER_LEAST = 0.004;
const HULL_LEAST = 1e-12;
const MIST_PIXELS = 2;
const STREAK_SEEDS = 64;

export function createBelt(
  lane: Lane,
  disk: Disk,
  seed: number,
  shine: Color,
  sparse: boolean,
  cleared: Cleared[] = [],
): Belt {
  const random = createRandom(seed + 113);
  const weight = Math.log10(disk.mass / EARTH_MASS) + 5;
  const full = Math.max(LEAST, Math.min(MOST, Math.round(500 + 250 * weight)));
  const count = sparse ? Math.round(full / 2) : full;
  const courses = new Float32Array(3 * count);
  const grains = new Float32Array(count);
  const power = Math.log(disk.outer / disk.inner) / Math.log(lane.outer / lane.inner);
  const kept = (reach: number) => {
    const real = disk.inner * (reach / lane.inner) ** power;
    return cleared.every(({ at, wide }) => Math.abs(real / at - 1) > wide);
  };
  for (let index = 0; index < count; index++) {
    let reach = 0;
    for (let turn = 0; turn < CLEARED_TURNS && (turn === 0 || !kept(reach)); turn++) {
      reach = lane.inner + ((lane.outer - lane.inner) * (random.next() + random.next())) / 2;
    }
    const lean = Math.sqrt(-2 * Math.log(1 - random.next()));
    courses[3 * index] = reach;
    courses[3 * index + 1] = 2 * Math.PI * random.next();
    courses[3 * index + 2] = disk.height * Math.min(LEAN_MOST, lean);
    grains[index] = random.next();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(courses, 3));
  geometry.setAttribute("grain", new BufferAttribute(grains, 1));
  const rocky =
    disk.gas > 0
      ? 0
      : Math.log(BARED[0] / Math.max(disk.depth, 1e-30)) / Math.log(BARED[0] / BARED[1]);
  const uniforms = {
    tick: { value: 0 },
    year: { value: lane.year },
    middle: { value: (lane.inner + lane.outer) / 2 },
    dense: { value: 1 },
    scale: { value: 1 },
    room: { value: (Math.PI * (lane.outer ** 2 - lane.inner ** 2)) / count },
    tint: { value: new Color(ROCK).lerp(new Color(ICE), disk.ice) },
    shine: { value: shine.clone().multiplyScalar(Math.max(0, Math.min(1, rocky))) },
  };
  const points = new Points(
    geometry,
    new ShaderMaterial({ vertexShader: BELT_VERTEX, fragmentShader: BELT_FRAGMENT, uniforms }),
  );
  points.frustumCulled = false;
  points.visible = rocky > 0;
  return {
    points,
    turn(tick, dense, scale) {
      uniforms.tick.value = tick;
      uniforms.dense.value = dense;
      uniforms.scale.value = scale;
    },
  };
}

function chart(values: number[], width: number, height: number, format: PixelFormat): DataTexture {
  const data = Uint16Array.from(values, (value) => DataUtils.toHalfFloat(value));
  const texture = new DataTexture(data, width, height, format, HalfFloatType);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

export function createHaze(
  layers: Layer[],
  ridges: Ridge[],
  lamp: Lamp,
  sparse: boolean,
): Haze | null {
  const profile = profileOf(layers, ridges);
  if (profile.dense.every((seen) => seen < HAZE_LEAST)) {
    return null;
  }
  const shade = shadeOf(profile, LAMP_HEIGHT * lamp.girth);
  const lanes: number[] = [];
  const tones: number[] = [];
  let hot = 0;
  profile.dense.forEach((seen, column) => {
    const far = profile.far[column];
    const ember = lamp.ember(far);
    lanes.push(Math.log(Math.max(seen, 1e-13)), Math.log(profile.tall[column]), lamp.level(far));
    lanes.push(profile.fine[column]);
    tones.push(profile.ice[column], ember, Math.log(Math.max(shade.hull[column], HULL_LEAST)), 0);
    hot = ember > EMBER_LEAST ? (column + 1) / (HAZE_COLUMNS - 1) : hot;
  });
  const eye = new Vector3();
  const screens = Array.from({ length: SCREEN_ROOM }, () => new Vector4(0, 0, 0, 0));
  const bubbles = Array.from({ length: BUBBLE_ROOM }, () => new Vector4(0, 0, 0, 0));
  const wide = profile.outer / Math.cos(Math.PI / HAZE_SIDES);
  const { lane, disk } = layers[0];
  const years = Array.from(
    profile.far,
    (far) => lane.year * ((2 * far) / (disk.inner + disk.outer)) ** (1.5 * TIME_POWER),
  );
  const turns = new Uint16Array(4 * HAZE_COLUMNS);
  const spins = new DataTexture(turns, HAZE_COLUMNS, 1, RGBAFormat, HalfFloatType);
  spins.minFilter = LinearFilter;
  spins.magFilter = LinearFilter;
  spins.wrapS = ClampToEdgeWrapping;
  spins.wrapT = ClampToEdgeWrapping;
  const pitch = { value: 0 };
  const mesh = new Mesh(
    new CylinderGeometry(wide, wide, 2 * shade.top, HAZE_SIDES, 1),
    new ShaderMaterial({
      vertexShader: HAZE_VERTEX,
      fragmentShader: HAZE_FRAGMENT,
      uniforms: {
        lanes: { value: chart(lanes, HAZE_COLUMNS, 1, RGBAFormat) },
        tones: { value: chart(tones, HAZE_COLUMNS, 1, RGBAFormat) },
        shade: { value: chart([...shade.depth], SHADE_COLUMNS, SHADE_ROWS, RedFormat) },
        eye: { value: eye },
        span: { value: new Vector2(profile.inner, profile.outer) },
        hull: { value: new Vector3(profile.outer, shade.top, shade.steep) },
        hot: { value: hot },
        count: {
          value: Math.round(
            HAZE_STEPS[shade.deepest > SKINNED ? 0 : 1] * (sparse ? HAZE_COARSE : 1),
          ),
        },
        screens: { value: screens },
        bubbles: { value: bubbles },
        shine: { value: lamp.shine },
        dust: { value: new Color(DUST) },
        frost: { value: new Color(FROST) },
        spins: { value: spins },
        pitch,
      },
      transparent: true,
      premultipliedAlpha: true,
      depthTest: false,
      depthWrite: false,
      side: BackSide,
    }),
  );
  mesh.frustumCulled = false;
  return {
    mesh,
    eye,
    screens,
    bubbles,
    reach: Math.hypot(wide, shade.top),
    passed: (at) => Math.exp(-shadowAt(profile, shade, Math.hypot(at.x, at.z), at.y)),
    turn(tick, texel) {
      years.forEach((year, column) => {
        const gone = tick / year;
        const angle = 2 * Math.PI * (gone - Math.floor(gone));
        turns[4 * column] = DataUtils.toHalfFloat(Math.cos(angle));
        turns[4 * column + 1] = DataUtils.toHalfFloat(Math.sin(angle));
        turns[4 * column + 2] = DataUtils.toHalfFloat(Math.floor(gone) % STREAK_SEEDS);
        turns[4 * column + 3] = DataUtils.toHalfFloat(Math.floor(gone + 0.5) % STREAK_SEEDS);
      });
      spins.needsUpdate = true;
      pitch.value = texel;
    },
  };
}

export function createMist(): Mist {
  const target = new WebGLRenderTarget(1, 1, { depthBuffer: false });
  const screens = Array.from({ length: SCREEN_ROOM }, () => new Vector4(0, 0, 0, 0));
  const lens = new Vector2(1, 1);
  const grid = new Vector2(1, 1);
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  );
  const mesh = new Mesh(
    geometry,
    new ShaderMaterial({
      vertexShader: MIST_VERTEX,
      fragmentShader: MIST_FRAGMENT,
      uniforms: {
        mist: { value: target.texture },
        grid: { value: grid },
        lens: { value: lens },
        screens: { value: screens },
      },
      transparent: true,
      premultipliedAlpha: true,
      depthTest: false,
      depthWrite: false,
    }),
  );
  mesh.frustumCulled = false;
  return {
    target,
    mesh,
    screens,
    lens,
    grid,
    fit(width, height) {
      const wide = Math.max(1, Math.ceil(width / MIST_PIXELS));
      const high = Math.max(1, Math.ceil(height / MIST_PIXELS));
      target.setSize(wide, high);
      grid.set(wide, high);
    },
  };
}
