import { HYDROGEN_ADIABATS, WATER_ADIABATS } from "./adiabats.ts";
import {
  aloftOf,
  GRAVITY,
  gasAlbedo,
  JUPITER_MASS,
  RADIATION,
  ROUND_ICE,
  ROUND_ROCK,
  SPIN_MOST,
  STAR_LEAST,
  seaCover,
  smooth,
  starborn,
  starHeat,
} from "./physics.ts";
import { withinOf } from "./stars.ts";
import type { Physics } from "./types.ts";

export type Matter = "iron" | "rock" | "ice" | "blend" | "metal" | "gas";

export interface Layer {
  matter: Matter;
  radius: number;
  mass: number;
  pressure: number;
}

export type Form =
  | "alloy"
  | "upper"
  | "transition"
  | "lower"
  | "Ih"
  | "II"
  | "VI"
  | "VII"
  | "X"
  | "blend"
  | "still"
  | "stirred"
  | "metal"
  | "water";

export interface Stratum {
  matter: Matter;
  form: Form;
  radius: number;
  pressure: number;
  heat: number | null;
}

export interface Interior {
  radius: number;
  centre: number;
  turning: number;
  skin: number;
  layers: Layer[];
  strata: Stratum[];
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
  matter: Matter;
  form: Form;
  from: number;
  unit: number;
  table: Float64Array;
}

interface Part {
  bound: number;
  phases: Phase[];
}

type Solids = Pick<Physics, "iron" | "rock" | "ice">;
type Curve = (pressure: number) => number;

const GIGAPASCAL = 1e9;
const IRON: Squeeze[] = [{ law: "birch", from: 0, rest: 7050, stiff: 201 * GIGAPASCAL, slope: 4 }];
const ROCK_FORMS: Form[] = ["upper", "upper", "transition", "lower"];
const ICE_FORMS: Form[] = ["Ih", "II", "VI", "VII", "X"];
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
export const ROCK_DEEP_FROM = ROCK_DEEP.from;
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
const SOLID_UNIT = 1e7;
const SOLID_MOST = 1e15;
const GAS_UNIT = 1e4;
const GAS_MOST = 1e18;
const SKY = 1e5;
const DEEP_AIR = 1e8;
const METAL_FROM = 140 * GIGAPASCAL;
const GREY_OPACITY = 2.98e-3;
const GREY_AT = [1e5, 160];
const GREY_POWERS = [1, 0.5];
const LAPSE = 2 / 7;
const OWN_LEAST = 1;
const JOINED = 0.05;
const RADIATIVE_MOST = 1e9;
const LOOSE = 6;
const LOOSE_UNDER = 1e8;
const STIR = [0.18, 0.14, 1.095, 1e6];
const STIR_MASS = [0.1, 0.5];
const NEWTON = 12;
const STEPS = 48;
const STRIDE = 0.25;
const START = 1e-3;
const SHOTS = 40;
const EXACT = 1e-6;
const LEAN_SOLID = 1.5;
const LEAN_FLUID = 0.6;
const CUTS = 6;
const SETTLES = 6;
const SETTLED = 3e-3;
const HELD = 1e-3;
const RUNG = 1.15;
const RUNGS = 40;
const HALVINGS = 16;
const KEPT = 512;
const ROUNDED = 1e-3;
const THAWED = 273.16;
const POROUS_MOST = 0.4;
const POROUS_SPAN = [18.5, 20.5];
const TURNING_FLUID = 0.25;
const TURNING_EVEN = 0.4;
const LOVE_FLUID = 0.4;
const FLAT_MOST = 0.2;
const GAS_GUESS = 7e7;
const EMPTY: Interior = {
  radius: 0,
  centre: 0,
  turning: TURNING_EVEN,
  skin: 0,
  layers: [],
  strata: [],
};

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

function tabled(unit: number, most: number, curve: Curve): Float64Array {
  const count = Math.ceil(RATE * Math.log1p(most / unit)) + 2;
  return Float64Array.from({ length: count }, (_, index) => curve(unit * Math.expm1(index / RATE)));
}

function read({ table, unit }: Phase, pressure: number): number {
  const place = RATE * Math.log1p(Math.max(0, pressure) / unit);
  const index = Math.min(table.length - 2, Math.floor(place));
  return table[index] + (table[index + 1] - table[index]) * (place - index);
}

function solid(matter: Matter, form: Form, from: number, curve: Curve): Phase {
  return { matter, form, from, unit: SOLID_UNIT, table: tabled(SOLID_UNIT, SOLID_MOST, curve) };
}

type Hard = "iron" | "rock" | "ice";

let stored: Record<Hard, Phase[]> | null = null;

function matters(): Record<Hard, Phase[]> {
  stored ??= {
    iron: IRON.map((squeeze) => solid("iron", "alloy", squeeze.from, squeezed(squeeze))),
    rock: [
      ...ROCK_SHALLOW.map((nodes, index) =>
        solid("rock", ROCK_FORMS[index], nodes[0][0] * GIGAPASCAL, traced(nodes)),
      ),
      solid("rock", ROCK_FORMS[ROCK_SHALLOW.length], ROCK_DEEP.from, squeezed(ROCK_DEEP)),
    ],
    ice: ICE.map((squeeze, index) =>
      solid("ice", ICE_FORMS[index], squeeze.from, squeezed(squeeze)),
    ),
  };
  return stored;
}

type Adiabats = typeof HYDROGEN_ADIABATS;

function warmAt(traced: Adiabats, place: number, pascals: number): number {
  const { pressure, heat, fine } = traced;
  const along = (Math.log10(pascals) - pressure.from) / pressure.step;
  const index = Math.max(0, Math.min(heat[0].length - 2, Math.floor(along)));
  const at = (row: number) =>
    heat[row][index] + (heat[row][index + 1] - heat[row][index]) * (along - index);
  const row = Math.min(heat.length - 2, Math.floor(place));
  return 10 ** (fine * (at(row) + (at(row + 1) - at(row)) * (place - row)));
}

function rowAt(traced: Adiabats, pascals: number, kelvin: number): number {
  const { pressure, heat, fine } = traced;
  const along = (Math.log10(pascals) - pressure.from) / pressure.step;
  const index = Math.max(0, Math.min(heat[0].length - 2, Math.floor(along)));
  const at = (row: number) =>
    heat[row][index] + (heat[row][index + 1] - heat[row][index]) * (along - index);
  const wanted = Math.log10(kelvin) / fine;
  let row = 0;
  while (row < heat.length - 2 && at(row + 1) < wanted) {
    row += 1;
  }
  return row + Math.max(0, Math.min(1, (wanted - at(row)) / (at(row + 1) - at(row))));
}

const gridded = new Map<Adiabats, Float64Array[]>();

function adiabat(traced: Adiabats, unit: number, most: number, place: number): Float64Array {
  const { pressure, density, fine } = traced;
  const rows =
    gridded.get(traced) ??
    density.map((row) =>
      tabled(unit, most, (pascals) => {
        const along = (Math.log10(Math.max(pascals, 1)) - pressure.from) / pressure.step;
        const index = Math.max(0, Math.min(row.length - 2, Math.floor(along)));
        return Math.LN10 * fine * (row[index] + (row[index + 1] - row[index]) * (along - index));
      }),
    );
  gridded.set(traced, rows);
  const row = Math.min(rows.length - 2, Math.floor(place));
  const [low, high] = [rows[row], rows[row + 1]];
  return low.map((value, index) => Math.exp(value + (high[index] - value) * (place - row)));
}

interface Air {
  phases: Phase[];
  skin: number;
  heat: (pascals: number) => number;
}

function gaseous(own: number, lit: number, gravity: number): Air {
  const inner = Math.max(own, OWN_LEAST);
  const [at, warm] = GREY_AT;
  const far = (lit ** 4 + inner ** 4 / 2) ** 0.25;
  const [rise, fall] = GREY_POWERS;
  const span = 4 + fall;
  const steep = (rise + 1) / span;
  const turn =
    ((16 * steep * gravity * at ** rise * far ** span) /
      (3 * GREY_OPACITY * warm ** fall * inner ** 4)) **
    (1 / (rise + 1));
  const shine = (pascals: number) => far * (1 + (pascals / turn) ** (rise + 1)) ** (1 / span);
  const foot = Math.min(turn * (LAPSE / (steep - LAPSE)) ** (1 / (rise + 1)), RADIATIVE_MOST);
  const place = rowAt(HYDROGEN_ADIABATS, foot, shine(foot));
  const deep = adiabat(HYDROGEN_ADIABATS, GAS_UNIT, GAS_MOST, place);
  const phases: Phase[] = [
    { matter: "gas", form: "stirred", from: foot > SKY ? foot : 0, unit: GAS_UNIT, table: deep },
    { matter: "metal", form: "metal", from: METAL_FROM, unit: GAS_UNIT, table: deep },
  ];
  const heat = (pascals: number) =>
    pascals < foot ? shine(pascals) : warmAt(HYDROGEN_ADIABATS, place, pascals);
  if (foot <= SKY) {
    return { phases, skin: heat(SKY), heat };
  }
  const dense = read(phases[0], foot);
  const footing = shine(foot);
  const thin = tabled(
    GAS_UNIT,
    1.1 * foot,
    (pascals) => (dense * (pascals / foot) * footing) / shine(Math.min(pascals, foot)),
  );
  return {
    phases: [{ matter: "gas", form: "still", from: 0, unit: GAS_UNIT, table: thin }, ...phases],
    skin: shine(SKY),
    heat,
  };
}

interface Steam {
  phases: Phase[];
  heat: (pascals: number) => number;
}

function steamed(joint: number, kelvin: number): Steam {
  const place = rowAt(WATER_ADIABATS, joint, kelvin);
  const table = adiabat(WATER_ADIABATS, SOLID_UNIT, SOLID_MOST, place);
  return {
    phases: [{ matter: "ice", form: "water", from: 0, unit: SOLID_UNIT, table }],
    heat: (pascals) => warmAt(WATER_ADIABATS, place, pascals),
  };
}

export function denseAt(matter: Hard, pressure: number): number {
  const phases = matters()[matter];
  return read(
    phases[
      Math.max(
        0,
        phases.findLastIndex(({ from }) => pressure >= from),
      )
    ],
    pressure,
  );
}

interface Shot {
  mass: number;
  radius: number;
  turning: number;
  layers: Layer[];
  strata: Stratum[];
}

function shot(centre: number, parts: Part[], top: number): Shot {
  const reach = Math.sqrt(centre - top);
  const phaseAt = (part: Part, pressure: number) =>
    Math.max(
      0,
      part.phases.findLastIndex(({ from }) => pressure >= from),
    );
  let part = parts[0];
  let seat = 0;
  let phase = phaseAt(part, centre);
  let now = part.phases[phase];
  let dense = read(now, centre);
  let depth = reach * Math.sqrt(START);
  let radius = (depth * Math.sqrt(3 / (2 * Math.PI * GRAVITY))) / dense;
  let mass = (4 / 3) * Math.PI * dense * radius ** 3;
  let turning = 0.4 * mass * radius ** 2;
  let floor = centre;
  let below = 0;
  let [farRadius, farMass, farTurning, farDense] = [0, 0, 0, 0];
  const layers: Layer[] = [];
  const strata: Stratum[] = [];
  let bottom = centre;
  const pace = (reach - depth) / STEPS;
  const advance = (span: number) => {
    const half = depth + span / 2;
    const far = depth + span;
    const middle = read(now, centre - half * half);
    farDense = read(now, centre - far * far);
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
  const laid = () => {
    layers.push({ matter: now.matter, radius, mass: mass - below, pressure: floor });
    floor = centre - depth * depth;
    below = mass;
  };
  const formed = () => {
    strata.push({ matter: now.matter, form: now.form, radius, pressure: bottom, heat: null });
    bottom = centre - depth * depth;
  };
  while (depth < reach * (1 - 1e-12)) {
    const pressure = centre - depth * depth;
    const edge = now.from > top ? Math.sqrt(centre - now.from) : reach;
    const stride = (STRIDE * (pressure + now.unit)) / (2 * depth);
    let span = Math.min(pace, stride, edge - depth);
    const turned = span === edge - depth;
    advance(span);
    const high = centre - (depth + span) ** 2;
    const held = (GRAVITY * farMass * farDense) / (high * farRadius);
    if (now.matter === "gas" && high < LOOSE_UNDER && !(held >= LOOSE)) {
      break;
    }
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
      laid();
      formed();
      seat += 1;
      part = parts[seat];
      phase = phaseAt(part, floor);
      now = part.phases[phase];
      dense = read(now, floor);
    } else if (turned && now.from > top) {
      const next = part.phases[phase - 1];
      if (next.matter !== now.matter) {
        laid();
      }
      if (next.matter !== now.matter || next.form !== now.form) {
        formed();
      }
      phase -= 1;
      now = next;
      dense = read(now, centre - depth * depth);
    }
  }
  layers.push({ matter: now.matter, radius, mass: mass - below, pressure: floor });
  strata.push({ matter: now.matter, form: now.form, radius, pressure: bottom, heat: null });
  return { mass, radius, turning: turning / (mass * radius ** 2), layers, strata };
}

function solved(
  mass: number,
  parts: Part[],
  first: number,
  top: number,
  lean: number,
): Shot & { centre: number } {
  const least = Math.log(Math.max(top, 1e-300)) + 1e-3;
  let near = Math.max(least, Math.log(first));
  let found = shot(Math.exp(near), parts, top);
  let miss = Math.log(found.mass / mass);
  let far = Math.max(least, near - miss / lean);
  for (let turn = 0; turn < SHOTS && Math.abs(miss) > EXACT && far !== near; turn++) {
    const next = shot(Math.exp(far), parts, top);
    const off = Math.log(next.mass / mass);
    const slope = (off - miss) / (far - near);
    [near, miss, found] = [far, off, next];
    const step = slope > 0 ? -miss / slope : -miss;
    far = Math.max(least, near + Math.max(-3, Math.min(3, step)));
  }
  return { ...found, centre: Math.exp(near) };
}

const kept = new Map<string, Interior>();

function remembered(key: string, make: () => Interior): Interior {
  const known = kept.get(key);
  if (known) {
    return known;
  }
  const made = make();
  if (kept.size >= KEPT) {
    kept.clear();
  }
  kept.set(key, made);
  return made;
}

function ordered(shares: Solids): { matter: Hard; share: number }[] {
  const whole = shares.iron + shares.rock + shares.ice;
  const [iron, ice] = [shares.iron / whole, shares.ice / whole];
  return [
    { matter: "iron" as const, share: iron },
    { matter: "rock" as const, share: 1 - iron - ice },
    { matter: "ice" as const, share: ice },
  ].filter(({ share }) => share > 0);
}

function stacked(mass: number, order: { matter: Hard; share: number }[], open: boolean): Part[] {
  const made = matters();
  let sum = 0;
  return order.map(({ matter, share }, index) => {
    sum += share;
    const last = open && index === order.length - 1;
    return { bound: last ? Number.POSITIVE_INFINITY : sum * mass, phases: made[matter] };
  });
}

export function solidOf(mass: number, shares: Solids): Interior {
  const whole = shares.iron + shares.rock + shares.ice;
  if (!(mass > 0) || !(whole > 0)) {
    return EMPTY;
  }
  return remembered(`hard ${mass} ${shares.iron / whole} ${shares.ice / whole}`, () => {
    const made = matters();
    const order = ordered(shares);
    const mixed = (pressure: number) =>
      1 /
      order.reduce((sum, { matter, share }) => sum + share / read(made[matter][0], pressure), 0);
    const packed = mixed(0);
    const holes = POROUS_MOST * (1 - smooth(POROUS_SPAN[0], POROUS_SPAN[1], Math.log10(mass)));
    const loose = Math.cbrt((3 * mass) / (4 * Math.PI * packed * (1 - holes)));
    const round = ROUND_ROCK - (ROUND_ROCK - ROUND_ICE) * (shares.ice / whole);
    const parts: Part[] =
      loose >= round || order.length === 1
        ? stacked(mass, order, true)
        : [{ bound: Number.POSITIVE_INFINITY, phases: [solid("blend", "blend", 0, mixed)] }];
    const tight = Math.cbrt((3 * mass) / (4 * Math.PI * packed));
    const first = (4 * Math.PI * GRAVITY * packed ** 2 * tight ** 2) / 3;
    const found = solved(mass, parts, first, 0, LEAN_SOLID);
    const swell = (1 - holes) ** (-1 / 3);
    return {
      radius: found.radius * swell,
      centre: found.centre / swell ** 4,
      turning: found.turning,
      skin: 0,
      layers: found.layers.map((layer) => ({
        ...layer,
        radius: layer.radius * swell,
        pressure: layer.pressure / swell ** 4,
      })),
      strata: found.strata.map((stratum) => ({
        ...stratum,
        radius: stratum.radius * swell,
        pressure: stratum.pressure / swell ** 4,
      })),
    };
  });
}

type Shares = Solids & Pick<Physics, "gas">;

type Fluid = Interior & { joint: number; held: boolean };

export function wrapped(physics: Pick<Physics, "mass"> & Shares): boolean {
  if (physics.gas >= 1 || !(physics.gas > 0)) {
    return physics.gas >= 1;
  }
  const under = solidOf(physics.mass * (1 - physics.gas), physics).radius;
  return (GRAVITY * physics.mass ** 2 * physics.gas) / (4 * Math.PI * under ** 4) >= DEEP_AIR;
}

function fluidAt(
  mass: number,
  shares: Shares,
  own: number,
  lit: number,
  gravity: number,
  joint: number,
  first: number,
): Fluid {
  const hard = mass * (1 - shares.gas);
  const whole = shares.iron + shares.rock + shares.ice;
  const air = gaseous(own, lit, gravity);
  const wet = shares.ice > 0 ? steamed(joint, air.heat(joint)) : null;
  const under = (hard > 0 && whole > 0 ? stacked(hard, ordered(shares), false) : []).map((part) =>
    part.phases[0].matter === "ice" && wet !== null ? { ...part, phases: wet.phases } : part,
  );
  const top = { bound: Number.POSITIVE_INFINITY, phases: air.phases };
  const found = solved(mass, [...under, top], first, SKY, LEAN_FLUID);
  const lowest = found.layers.find(({ matter }) => matter === "metal" || matter === "gas");
  return {
    radius: found.radius,
    centre: found.centre,
    turning: found.turning,
    skin: air.skin,
    layers: found.layers,
    strata: found.strata.map((stratum) => ({
      ...stratum,
      heat:
        stratum.matter === "gas" || stratum.matter === "metal"
          ? air.heat(stratum.pressure)
          : stratum.matter === "ice" && wet !== null
            ? wet.heat(stratum.pressure)
            : null,
    })),
    joint: under.length > 0 && lowest ? lowest.pressure : joint,
    held: Math.abs(Math.log(found.mass / mass)) < HELD,
  };
}

function balanced(
  mass: number,
  shares: Shares,
  own: number,
  lit: number,
  joint: number,
  from: number,
): Fluid {
  const at = (radius: number) =>
    fluidAt(
      mass,
      shares,
      own,
      lit,
      (GRAVITY * mass) / radius ** 2,
      joint,
      (GRAVITY * mass ** 2) / radius ** 4,
    );
  const wider = (radius: number, found: Fluid) => found.held && found.radius > radius;
  const halved = (inside: number, held: Fluid, outside: number, past: Fluid): Fluid => {
    for (let cut = 0; cut < HALVINGS; cut++) {
      const middle = Math.sqrt(inside * outside);
      const found = at(middle);
      if (wider(middle, found)) {
        [inside, held] = [middle, found];
      } else {
        [outside, past] = [middle, found];
      }
    }
    return held.held ? held : past;
  };
  let before = from;
  let found = at(before);
  const up = wider(before, found);
  let next = before;
  let reached = found;
  for (let rung = 0; rung < RUNGS && wider(next, reached) === up; rung++) {
    [before, found] = [next, reached];
    next = up ? next * RUNG : next / RUNG;
    reached = at(next);
  }
  if (wider(next, reached) === up) {
    return reached.held ? reached : found;
  }
  return up ? halved(before, found, next, reached) : halved(next, reached, before, found);
}

function stirredBy(lit: number, mass: number): number {
  const [gain, peak, width, unit] = STIR;
  const bare = lit / (1 - gasAlbedo(mass)) ** 0.25;
  const flux = 4 * RADIATION * bare ** 4;
  if (!(flux > 0)) {
    return 0;
  }
  const heavy = smooth(STIR_MASS[0], STIR_MASS[1], mass / JUPITER_MASS);
  return heavy * gain * bare * Math.exp(-((Math.log10(flux / unit) - peak) ** 2) / width);
}

function ownOf(inner: number, lit: number, mass: number): number {
  return (inner ** 4 + stirredBy(lit, mass) ** 4) ** 0.25;
}

export function bodyOf(mass: number, shares: Shares, inner = 0, lit = 0): Interior {
  if (!wrapped({ mass, ...shares })) {
    return solidOf(mass * (1 - shares.gas), shares);
  }
  const { iron, rock, ice, gas } = shares;
  return remembered(`gas ${mass} ${iron} ${rock} ${ice} ${gas} ${inner} ${lit}`, () => {
    const own = ownOf(inner, lit, mass);
    const under = solidOf(mass * (1 - gas), shares).radius;
    const wide = Math.max(1.2 * under, GAS_GUESS * Math.min(1, gas));
    const weight = under > 0 ? (GRAVITY * mass ** 2 * gas) / (4 * Math.PI * under ** 4) : 0;
    let found = fluidAt(
      mass,
      shares,
      own,
      lit,
      (GRAVITY * mass) / wide ** 2,
      Math.max(weight, 2 * SKY),
      (GRAVITY * mass ** 2) / wide ** 4,
    );
    let settled = false;
    for (let turn = 0; turn < SETTLES && !settled; turn++) {
      const pull = (GRAVITY * mass) / found.radius ** 2;
      const next = fluidAt(mass, shares, own, lit, pull, found.joint, found.centre);
      settled =
        next.held &&
        Math.abs(next.radius / found.radius - 1) < SETTLED &&
        Math.abs(Math.log(next.joint / found.joint)) < JOINED;
      found = next;
    }
    if (!settled) {
      found = balanced(mass, shares, own, lit, found.joint, wide);
    }
    const { joint: _, held: __, ...interior } = found;
    return interior;
  });
}

export function radiusOf(mass: number, shares: Shares, inner = 0, lit = 0): number {
  return bodyOf(mass, shares, inner, lit).radius;
}

type Made = Pick<Physics, "mass" | "radius" | "heat" | "glow"> &
  Partial<Pick<Physics, "air" | "gases">> &
  Shares;

function groundedShares(physics: Made): { mass: number; shares: Shares } {
  const found = aloftOf(physics);
  const aloft = physics.ice - found < ROUNDED * physics.ice ? physics.ice : found;
  const { air, gases } = physics;
  const soaked =
    air !== undefined &&
    gases !== undefined &&
    physics.heat > THAWED &&
    !(seaCover({ ...physics, air, gases }) > 0);
  if (!(aloft > 0) && !soaked) {
    return { mass: physics.mass, shares: physics };
  }
  const left = 1 - aloft;
  const lying = (physics.ice - aloft) / left;
  return {
    mass: physics.mass * left,
    shares: {
      iron: physics.iron / left,
      rock: physics.rock / left + (soaked ? lying : 0),
      ice: soaked ? 0 : lying,
      gas: physics.gas / left,
    },
  };
}

export function interiorOf(physics: Made): Interior | null {
  if (starborn(physics) && physics.mass >= STAR_LEAST) {
    return null;
  }
  const { radius } = physics;
  const fluid = wrapped(physics);
  const inner = fluid ? starHeat(physics.glow, radius) : 0;
  const lit = fluid ? Math.max(0, physics.heat ** 4 - inner ** 4) ** 0.25 : 0;
  const { mass, shares } = fluid
    ? { mass: physics.mass, shares: physics }
    : groundedShares(physics);
  const found = bodyOf(mass, shares, inner, lit);
  const scale = radius / found.radius;
  return {
    radius,
    centre: found.centre / scale ** 4,
    turning: found.turning,
    skin: found.skin,
    layers: found.layers.map((layer) => ({
      ...layer,
      radius: layer.radius * scale,
      pressure: layer.pressure / scale ** 4,
    })),
    strata: found.strata.map((stratum) => ({
      ...stratum,
      radius: stratum.radius * scale,
      pressure: stratum.pressure / scale ** 4,
    })),
  };
}

type Solid = Pick<Physics, "mass"> & Shares;

function firm(physics: Solid): boolean {
  return !starborn(physics) && !wrapped(physics);
}

export function turningOf(physics: Solid): number {
  return firm(physics) ? solidOf(physics.mass * (1 - physics.gas), physics).turning : TURNING_FLUID;
}

type Spun = Solid & Pick<Physics, "radius" | "day" | "glow" | "age">;

export function loveOf(physics: Spun): number {
  if (starborn(physics)) {
    return withinOf(physics)?.love ?? 0;
  }
  if (!firm(physics)) {
    return LOVE_FLUID;
  }
  return 5 / (1 + (2.5 - 3.75 * turningOf(physics)) ** 2) - 1;
}

function spinOf(physics: Pick<Physics, "mass" | "radius" | "day">): number {
  return (((2 * Math.PI) / physics.day) ** 2 * physics.radius ** 3) / (GRAVITY * physics.mass);
}

export function bulgeOf(physics: Spun): number {
  return (loveOf(physics) / 3) * Math.min(SPIN_MOST, spinOf(physics)) * physics.radius ** 2;
}

export function flatOf(physics: Spun): number {
  const love = loveOf(physics);
  return Math.min(FLAT_MOST, ((1 + love) / 2) * spinOf(physics));
}
