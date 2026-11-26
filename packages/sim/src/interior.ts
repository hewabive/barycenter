import {
  EARTH_MASS,
  EARTH_RADIUS,
  GRAVITY,
  ROUND_ICE,
  ROUND_ROCK,
  SPIN_MOST,
  smooth,
  starborn,
  wrapped,
} from "./physics.ts";
import type { Physics } from "./types.ts";

export type Matter = "iron" | "rock" | "ice" | "blend";

export interface Layer {
  matter: Matter;
  radius: number;
  mass: number;
  pressure: number;
}

export interface Interior {
  radius: number;
  centre: number;
  turning: number;
  layers: Layer[];
}

type Law = "birch" | "murnaghan" | "vinet";

interface Squeeze {
  law: Law;
  from: number;
  rest: number;
  stiff: number;
  slope: number;
}

interface Phase {
  from: number;
  table: Float64Array;
}

interface Part {
  matter: Matter;
  bound: number;
  phases: Phase[];
}

type Solids = Pick<Physics, "iron" | "rock" | "ice">;
type Curve = (pressure: number) => number;

const GIGAPASCAL = 1e9;
const IRON: Squeeze[] = [{ law: "birch", from: 0, rest: 7050, stiff: 201 * GIGAPASCAL, slope: 4 }];
const ROCK_SHALLOW = [
  [
    [0, 3381],
    [2.45, 3375],
    [7.11, 3360],
  ],
  [
    [7.11, 3436],
    [13.35, 3543],
  ],
  [
    [13.35, 3724],
    [21.04, 3976],
    [23.83, 3992],
  ],
];
const ROCK_DEEP: Squeeze = {
  law: "birch",
  from: 23.83 * GIGAPASCAL,
  rest: 3980,
  stiff: 206 * GIGAPASCAL,
  slope: 4,
};
const ICE: Squeeze[] = [
  { law: "murnaghan", from: 0, rest: 934.31, stiff: 10.995 * GIGAPASCAL, slope: 7 },
  {
    law: "murnaghan",
    from: 0.213 * GIGAPASCAL,
    rest: 1199.65,
    stiff: 13.951 * GIGAPASCAL,
    slope: 5.5,
  },
  {
    law: "murnaghan",
    from: 0.6708 * GIGAPASCAL,
    rest: 1326.8,
    stiff: 17.82 * GIGAPASCAL,
    slope: 5.4,
  },
  { law: "birch", from: 2.216 * GIGAPASCAL, rest: 1460, stiff: 23.7 * GIGAPASCAL, slope: 4.15 },
  {
    law: "vinet",
    from: 44.3 * GIGAPASCAL,
    rest: 1460,
    stiff: 14.3771 * GIGAPASCAL,
    slope: 6.57972,
  },
];
const RATE = 24;
const PRESSURE_UNIT = 1e7;
const PRESSURE_MOST = 1e15;
const NEWTON = 12;
const STEPS = 48;
const STRIDE = 0.25;
const START = 1e-3;
const SHOTS = 40;
const EXACT = 1e-9;
const CUTS = 6;
const KEPT = 512;
const POROUS_MOST = 0.4;
const POROUS_SPAN = [18.5, 20.5];
const TURNING_FLUID = 0.25;
const TURNING_EVEN = 0.4;
const LOVE_STAR = 0.03;
const LOVE_FLUID = 0.4;
const FLAT_MOST = 0.2;
const GAS_RADIUS = 11.4;
const GAS_PEAK = 318;
const PUFF_FROM = 1000;
const PUFF_SPAN = 1000;
const PUFF_MOST = 1.4;
const PUFF_GAIN = 0.5;
const EMPTY: Interior = { radius: 0, centre: 0, turning: TURNING_EVEN, layers: [] };

function pressed({ law, stiff, slope }: Squeeze, ratio: number): number {
  if (law === "vinet") {
    const short = 1 - ratio ** (-1 / 3);
    return 3 * stiff * ratio ** (2 / 3) * short * Math.exp(1.5 * (slope - 1) * short);
  }
  const wide = ratio ** (2 / 3);
  const bent = 1 + 0.75 * (slope - 4) * (wide - 1);
  return 1.5 * stiff * (wide ** 3.5 - wide ** 2.5) * bent;
}

function squeezed(squeeze: Squeeze): Curve {
  const { law, rest, stiff, slope } = squeeze;
  if (law === "murnaghan") {
    return (pressure) => rest * (1 + (slope * pressure) / stiff) ** (1 / slope);
  }
  let ratio = 1;
  return (pressure) => {
    for (let turn = 0; turn < NEWTON; turn++) {
      const nudge = 1e-6 * ratio;
      const rise =
        (pressed(squeeze, ratio + nudge) - pressed(squeeze, ratio - nudge)) / (2 * nudge);
      ratio = Math.max(1, ratio - (pressed(squeeze, ratio) - pressure) / rise);
    }
    return rest * ratio;
  };
}

function traced(nodes: number[][]): Curve {
  return (pressure) => {
    const depth = pressure / GIGAPASCAL;
    const above = nodes.findLastIndex(([from]) => depth >= from);
    const first = Math.max(0, Math.min(nodes.length - 2, above));
    const [from, low] = nodes[first];
    const [to, high] = nodes[first + 1];
    return low + ((high - low) * (depth - from)) / (to - from);
  };
}

function tabled(from: number, curve: Curve): Phase {
  const count = Math.ceil(RATE * Math.log1p(PRESSURE_MOST / PRESSURE_UNIT)) + 2;
  const table = Float64Array.from({ length: count }, (_, index) =>
    curve(PRESSURE_UNIT * Math.expm1(index / RATE)),
  );
  return { from, table };
}

function read(table: Float64Array, pressure: number): number {
  const place = RATE * Math.log1p(Math.max(0, pressure) / PRESSURE_UNIT);
  const index = Math.min(table.length - 2, Math.floor(place));
  return table[index] + (table[index + 1] - table[index]) * (place - index);
}

let stored: Record<Exclude<Matter, "blend">, Phase[]> | null = null;

function matters(): Record<Exclude<Matter, "blend">, Phase[]> {
  stored ??= {
    iron: IRON.map((squeeze) => tabled(squeeze.from, squeezed(squeeze))),
    rock: [
      ...ROCK_SHALLOW.map((nodes) => tabled(nodes[0][0] * GIGAPASCAL, traced(nodes))),
      tabled(ROCK_DEEP.from, squeezed(ROCK_DEEP)),
    ],
    ice: ICE.map((squeeze) => tabled(squeeze.from, squeezed(squeeze))),
  };
  return stored;
}

interface Shot {
  mass: number;
  radius: number;
  turning: number;
  layers: Layer[];
}

function shot(centre: number, parts: Part[]): Shot {
  const reach = Math.sqrt(centre);
  const phaseAt = (part: Part, pressure: number) =>
    Math.max(
      0,
      part.phases.findLastIndex(({ from }) => pressure >= from),
    );
  let part = parts[0];
  let seat = 0;
  let phase = phaseAt(part, centre);
  let table = part.phases[phase].table;
  let dense = read(table, centre);
  let depth = reach * Math.sqrt(START);
  let radius = (depth * Math.sqrt(3 / (2 * Math.PI * GRAVITY))) / dense;
  let mass = (4 / 3) * Math.PI * dense * radius ** 3;
  let turning = 0.4 * mass * radius ** 2;
  let floor = centre;
  let below = 0;
  let [farRadius, farMass, farTurning, farDense] = [0, 0, 0, 0];
  const layers: Layer[] = [];
  const pace = (reach - depth) / STEPS;
  const advance = (span: number) => {
    const half = depth + span / 2;
    const far = depth + span;
    const middle = read(table, centre - half * half);
    farDense = read(table, centre - far * far);
    const swell1 = (2 * depth * radius ** 2) / (GRAVITY * mass * dense);
    const gain1 = (8 * Math.PI * depth * radius ** 4) / (GRAVITY * mass);
    const radius2 = radius + (span / 2) * swell1;
    const mass2 = mass + (span / 2) * gain1;
    const swell2 = (2 * half * radius2 ** 2) / (GRAVITY * mass2 * middle);
    const gain2 = (8 * Math.PI * half * radius2 ** 4) / (GRAVITY * mass2);
    const radius3 = radius + (span / 2) * swell2;
    const mass3 = mass + (span / 2) * gain2;
    const swell3 = (2 * half * radius3 ** 2) / (GRAVITY * mass3 * middle);
    const gain3 = (8 * Math.PI * half * radius3 ** 4) / (GRAVITY * mass3);
    const radius4 = radius + span * swell3;
    const mass4 = mass + span * gain3;
    const swell4 = (2 * far * radius4 ** 2) / (GRAVITY * mass4 * farDense);
    const gain4 = (8 * Math.PI * far * radius4 ** 4) / (GRAVITY * mass4);
    farRadius = radius + (span / 6) * (swell1 + 2 * swell2 + 2 * swell3 + swell4);
    farMass = mass + (span / 6) * (gain1 + 2 * gain2 + 2 * gain3 + gain4);
    farTurning =
      turning +
      (span / 9) *
        (gain1 * radius ** 2 +
          2 * gain2 * radius2 ** 2 +
          2 * gain3 * radius3 ** 2 +
          gain4 * radius4 ** 2);
  };
  while (depth < reach * (1 - 1e-12)) {
    const pressure = centre - depth * depth;
    const edge = Math.sqrt(centre - part.phases[phase].from);
    const stride = (STRIDE * (pressure + PRESSURE_UNIT)) / (2 * depth);
    let span = Math.min(pace, stride, edge - depth);
    const turned = span === edge - depth;
    advance(span);
    const crossed = farMass > part.bound;
    if (crossed) {
      let [short, long] = [0, span];
      let [under, over] = [mass - part.bound, farMass - part.bound];
      for (let cut = 0; cut < CUTS && Math.abs(farMass - part.bound) > 1e-12 * part.bound; cut++) {
        span = short - (under * (long - short)) / (over - under);
        advance(span);
        if (farMass > part.bound) {
          [long, over] = [span, farMass - part.bound];
        } else {
          [short, under] = [span, farMass - part.bound];
        }
      }
    }
    depth = crossed || !turned ? depth + span : edge;
    [radius, mass, turning, dense] = [farRadius, farMass, farTurning, farDense];
    if (crossed) {
      layers.push({ matter: part.matter, radius, mass: mass - below, pressure: floor });
      floor = centre - depth * depth;
      below = mass;
      seat += 1;
      part = parts[seat];
      phase = phaseAt(part, floor);
      table = part.phases[phase].table;
      dense = read(table, floor);
    } else if (turned && phase > 0) {
      phase -= 1;
      table = part.phases[phase].table;
      dense = read(table, centre - depth * depth);
    }
  }
  layers.push({ matter: part.matter, radius, mass: mass - below, pressure: floor });
  return { mass, radius, turning: turning / (mass * radius ** 2), layers };
}

function solved(mass: number, parts: Part[], first: number): Shot & { centre: number } {
  let near = Math.log(first);
  let found = shot(first, parts);
  let miss = Math.log(found.mass / mass);
  let far = near - miss / 1.5;
  for (let turn = 0; turn < SHOTS && Math.abs(miss) > EXACT; turn++) {
    const next = shot(Math.exp(far), parts);
    const off = Math.log(next.mass / mass);
    const slope = (off - miss) / (far - near);
    [near, miss, found] = [far, off, next];
    const step = slope > 0 ? -miss / slope : -miss;
    far = near + Math.max(-3, Math.min(3, step));
  }
  return { ...found, centre: Math.exp(near) };
}

const kept = new Map<string, Interior>();

export function solidOf(mass: number, shares: Solids): Interior {
  const whole = shares.iron + shares.rock + shares.ice;
  if (!(mass > 0) || !(whole > 0)) {
    return EMPTY;
  }
  const [iron, ice] = [shares.iron / whole, shares.ice / whole];
  const key = `${mass} ${iron} ${ice}`;
  const known = kept.get(key);
  if (known) {
    return known;
  }
  const rock = 1 - iron - ice;
  const made = matters();
  const order = [
    { matter: "iron" as const, share: iron },
    { matter: "rock" as const, share: rock },
    { matter: "ice" as const, share: ice },
  ].filter(({ share }) => share > 0);
  const mixed = (pressure: number) =>
    1 /
    order.reduce(
      (sum, { matter, share }) => sum + share / read(made[matter][0].table, pressure),
      0,
    );
  const packed = mixed(0);
  const holes = POROUS_MOST * (1 - smooth(POROUS_SPAN[0], POROUS_SPAN[1], Math.log10(mass)));
  const loose = Math.cbrt((3 * mass) / (4 * Math.PI * packed * (1 - holes)));
  const round = ROUND_ROCK - (ROUND_ROCK - ROUND_ICE) * ice;
  let sum = 0;
  const parts: Part[] =
    loose >= round || order.length === 1
      ? order.map(({ matter, share }, index) => {
          sum += share;
          const bound = index === order.length - 1 ? Number.POSITIVE_INFINITY : sum * mass;
          return { matter, bound, phases: made[matter] };
        })
      : [{ matter: "blend", bound: Number.POSITIVE_INFINITY, phases: [tabled(0, mixed)] }];
  const tight = Math.cbrt((3 * mass) / (4 * Math.PI * packed));
  const found = solved(mass, parts, (4 * Math.PI * GRAVITY * packed ** 2 * tight ** 2) / 3);
  const swell = (1 - holes) ** (-1 / 3);
  const interior: Interior = {
    radius: found.radius * swell,
    centre: found.centre / swell ** 4,
    turning: found.turning,
    layers: found.layers.map((layer) => ({
      ...layer,
      radius: layer.radius * swell,
      pressure: layer.pressure / swell ** 4,
    })),
  };
  if (kept.size >= KEPT) {
    kept.clear();
  }
  kept.set(key, interior);
  return interior;
}

function gasRadius(mass: number, warmth: number): number {
  const share = mass / EARTH_MASS / GAS_PEAK;
  const light = Math.max(0.3, Math.min(1.5, share ** -0.3));
  const excess = Math.max(0, Math.min(PUFF_MOST, (warmth - PUFF_FROM) / PUFF_SPAN));
  const cold = EARTH_RADIUS * GAS_RADIUS * share ** (share < 1 ? 0.15 : -0.04);
  return cold * (1 + PUFF_GAIN * light * excess);
}

export function radiusOf(mass: number, shares: Solids & { gas: number }, warmth = 0): number {
  const core = solidOf(mass * (1 - shares.gas), shares).radius;
  return Math.cbrt(core ** 3 + shares.gas * gasRadius(mass, warmth) ** 3);
}

type Made = Pick<Physics, "mass" | "radius" | "gas" | "iron" | "rock" | "ice">;

export function interiorOf(physics: Made): Interior | null {
  if (starborn(physics) || wrapped(physics)) {
    return null;
  }
  const found = solidOf(physics.mass * (1 - physics.gas), physics);
  const scale = physics.radius / found.radius;
  return {
    radius: physics.radius,
    centre: found.centre / scale ** 4,
    turning: found.turning,
    layers: found.layers.map((layer) => ({
      ...layer,
      radius: layer.radius * scale,
      pressure: layer.pressure / scale ** 4,
    })),
  };
}

export function turningOf(physics: Made): number {
  return interiorOf(physics)?.turning ?? TURNING_FLUID;
}

export function loveOf(physics: Made): number {
  if (starborn(physics)) {
    return LOVE_STAR;
  }
  const found = interiorOf(physics);
  return found ? 5 / (1 + (2.5 - 3.75 * found.turning) ** 2) - 1 : LOVE_FLUID;
}

function spinOf(physics: Pick<Physics, "mass" | "radius" | "day">): number {
  return (((2 * Math.PI) / physics.day) ** 2 * physics.radius ** 3) / (GRAVITY * physics.mass);
}

export function bulgeOf(physics: Made & Pick<Physics, "day">): number {
  return (loveOf(physics) / 3) * Math.min(SPIN_MOST, spinOf(physics)) * physics.radius ** 2;
}

export function flatOf(physics: Made & Pick<Physics, "day">): number {
  const love = starborn(physics) ? LOVE_FLUID : loveOf(physics);
  return Math.min(FLAT_MOST, ((1 + love) / 2) * spinOf(physics));
}
