import { wrapped } from "./interior.ts";
import { type Star, withinOf } from "./stars.ts";
import { GASES, type Gas, type Physics } from "./types.ts";

export const SUN_MASS = 1.989e30;
export const SUN_RADIUS = 6.957e8;
export const SUN_GLOW = 3.828e26;
export const SUN_HEAT = 5772;
export const EARTH_MASS = 5.972e24;
export const EARTH_RADIUS = 6.371e6;
export const EARTH_AIR = 101325;
export const EARTH_GRAVITY = 9.81;
export const JUPITER_MASS = 1.898e27;
export const ASTRONOMICAL_UNIT = 1.496e11;
export const HOUR = 3600;
export const DAY = 86400;
export const YEAR = 3.156e7;
export const GIGAYEAR = 1e9 * YEAR;
export const STAR_LEAST = 0.075 * SUN_MASS;
export const BROWN_LEAST = 13 * JUPITER_MASS;
export const BURST_LEAST = 8 * SUN_MASS;
export const HOLE_LEAST = 20 * SUN_MASS;
export const ROCK_MELT = 1400;

export const GRAVITY = 6.674e-11;
export const LIGHT_SPEED = 2.998e8;
const FROST_LINE = 2.7 * ASTRONOMICAL_UNIT;
export const RADIATION = 5.67e-8;
const HOLD_LEAST = 0.02;
export const SPIN_MOST = 0.3;
export const BOLTZMANN = 1.381e-23;
export const DALTON = 1.661e-27;
export const GAS_WEIGHT = 2.34;
const GAS_FROM = 3;
const GAS_FULL = 300;
const GAS_MOST = 0.95;
export const ROUND_ROCK = 3e5;
export const ROUND_ICE = 2e5;
const SPAN_FIT = [1315, 2498.6, 160.75, 0.035266, 0.34263];
const SPAN_HOOK = [19.118, 4.9038, 0.047358, 1.3631, 0.8074];
const SPAN_SHARE = 0.95;
const DAWN = [4e7 * YEAR, 1.4, 2.5];
const DAWN_LEAST = 1e5 * YEAR;
const DAWN_SWELL = 0.33;
const DAWN_HEAT = [4300, 0.16];
const DAWN_WARMING = 1.175;
const DAWN_HEAVY = 1.5;
const DAWN_RADIATIVE = 1.02;
const DAWN_STEADY = [1, 3];
const GLOW_LIGHT = [
  [2.028, -0.976],
  [4.572, -0.102],
  [5.743, 0],
];
const GLOW_HEAVY = [
  [5.743, 0],
  [4.329, 0.01],
  [3.967, 0.093],
  [2.865, 1.105],
];
const SUBDWARF_MASS = 2;
const BRIGHT_MASS = 20;
const BRIGHT_POWER = 2.3;
const DWARF_RADIUS = [0.438, 0.479, 0.075];
const RED_RADIUS = [-0.1297, 1.0718, 0.0135];
const DWARF_HEAT = [-0.17, 0.888, 3.671];
const TURN_SHARE = [0.08, 1.5, 0.005];
const CLIMB_SHARE = [0.06, 2];
const CORE_SPAN = [0.13 * GIGAYEAR, 0.15];
const LAST_SHARE = 0.15;
const TURN_GLOW = [95.11033, 4.597479, 31.13458, 9.301992, 10.07963, 39.10862, 4.637345, 6.682518];
const FLASH_MASS = [1.995, 15];
const FLASH_GLOW = [2751.631, -0.03820831];
const QUIET_GLOW = [11486.22, 734.8793, 84.99536];
const QUIET_MASS = [2, 2.5];
const CLIMB_MOST = [12.5, 13.5];
const CLUMP_GLOW = [54.96045, 1.832694, 121.1104, 1.6479];
const CLUMP_BARE = [15262, 29.54, 31.18, 0.0469];
const CLUMP_PACE = 2;
const CORE_GLOW = [48.70031, 3.629118, 323.6427, 0.4837614];
const LAST_FROM = [162.6062, 0.3336833];
const LAST_QUIET = [42547.4, 926.8325, 2.474401, 400.7733];
const LAST_GLOW = [4000, 1.2];
const CLIMB_PACE = 3;
const GIANT_RADIUS = [0.9960283, 0.2561062, 1.157338, 0.4022765, 0.397, 0.3827, 0.755];
const GIANT_HEAT = [2800, 0.08];
const GIANT_CORE = [3e4, 500, 1.75e4, 0.6];
const GIANT_STEEP = [6, 3];
const LOOP_MASS = [1.8, 4];
const LOOP_WARM = [1.06, 0.4, 1.5, 20];
const HEAVY_MASS = [8, 12];
const BLUE_MASS = [22, 40];
const RED_MASS = [25, 45];
const RED_LEAST = 0.25;
const BARED_MASS = [25, 35];
const BARED_SHARE = 0.55;
const BARED_RADIUS = [2, 10, 0.6];
const SETTLING = 0.3;
const EMBER_MASS = [0.394, 0.109];
const CORE_LIGHT = [5.37, 0.975, 0.18, 0.5, 0.06, -1];
const CORE_HEAVY = [0.098, 1.35];
const EMBER_RADIUS = [0.0127, 1.44];
const EMBER_COOLING = [8.8e6 * YEAR, 1.4, 3e5 * YEAR];
const EMBER_DAY = [0.25, 2];
const PULSAR_MASS = [1.17, 0.0692];
const PULSAR_RADIUS = 11500;
const PULSAR_HEAT = [1.6e6, 100 * YEAR, 1 / 12, 6e5 * YEAR];
const PULSAR_DAY = [0.04, 0.52];
const HOLE_SHARE = 0.3;
const HOLE_HEAT = 6.17e-8;
const HOLE_SPIN = [0.1, 0.88];
export const DENSE_STAR = [1e7, 1e13];
const STAR_SIZES = [0.7, 1.3, 3];
const SUN_AGE = 4.57 * GIGAYEAR;
const SUN_ROSSBY = 2;
const SPIN_PACE = [0.5, 0.62];
const SPIN_TURN = 0.67 * GIGAYEAR;
const SPIN_LATE = 0.8;
const SPIN_STALL = 0.36;
const SPIN_COOL = 2.85;
const STAR_TURNING = 0.07;
const COOLING_HEAT = 107;
const COOLING_AGE = 4.5 * GIGAYEAR;
const COOLING_PACE = 0.3;
const COOLING_LIGHT = 0.25;
const COOLING_HEAVY = [0.468, 20, 0.83];
const BURNING_POWER = 8;
const DUST_HEAT = [1300, 2200];
const SEEN_WAVES = [0.38e-6, 0.78e-6];
const SEEN_STEPS = 80;
const SEEN_PEAK = [1.019, 0.559e-6, 285.4e12];
const FIRST_RADIATION = 3.7418e-16;
export const LUMENS = 683;
const SEEN_ALBEDO = 0.3;
const SECOND_RADIATION = 0.014388;
const LIGHT_POWER = 0.1;
const GLARE_POWER = 0.3;
const LIGHT_MOST = 1.35;
const FILL_LIGHT = 0.025;
const DUST_POWER = 0.2;
const DUST_MOST = 3;
const GLOW_FROM = [650, 900];
export const SKY_LIGHT = 3e-7;
const GAS_STORE = 14300;
const AIR_STORE = 1000;
const WATER_STORE = 4.2e6;
const SEA_DEPTH = 50;
const ROCK_STORE = 2e6;
const ROCK_CREEP = 1e-6;
const STUFFY_HEAT = [600, 2000];
const STUFFY_MOST = 0.8;
const ESCAPE_MARGIN = 6;
export const LOOSE_GRIP = 0.8;
const EXOBASE = 1000;
const MELTING = 273;
const TRIPLE_AIR = 1000;
const TRACE_AIR = 1;
export const DAMP_LEAST = 1e-5;
const HUMIDITY: Partial<Record<Gas, number>> = { water: 0.6, methane: 0.45 };
const COLD_TRAP = 0.75;
const CLIMATE_ROUNDS = 400;
const CLIMATE_EXACT = 1e-8;
const CLIMATE_LEAP = 2;
export const XUV_GLOW = 10 ** -3.5;
export const XUV_SATURATED = 1e8 * YEAR;
const XUV_FADING = 0.5;
export const XUV_SHARE = 0.1;
export const RUNAWAY = 4 * 375;
const CRITICAL = 647;
const STEAMY_AIR = 300;
const STEAMED_HEAT = 1500;
const STEAMED_AIR = [3e5, 3e6];
const THERMOSTAT = 278;
const THERMOSTAT_STEPS = 14;
const BRIGHT_AIR = 0.3;
const BRIGHT_DECK = 0.76;
const BRIGHT_ICE = 0.55;
const BRIGHT_ROCK = 0.12;
const BRIGHT_DUST = 0.25;
const BRIGHT_GAS = [0.32, 0.5];
const BRIGHT_GAS_MASS = [16 * EARTH_MASS, JUPITER_MASS];
const SUN_HYDROGEN = 0.86;
const RICH_JUPITER = 2.4;
const RICH_POWER = -1.11;
const RICH_MOST = 200;

const WEIGHTS: Record<Gas, number> = {
  hydrogen: 2,
  helium: 4,
  methane: 16,
  ammonia: 17,
  water: 18,
  nitrogen: 28,
  oxygen: 32,
  "carbon dioxide": 44,
};

const VAPORS: Record<Gas, [boiling: number, latent: number] | null> = {
  hydrogen: null,
  helium: null,
  methane: [111.7, 985],
  ammonia: [239.8, 2810],
  water: [373.15, 4890],
  nitrogen: [77.4, 671],
  oxygen: [90.2, 820],
  "carbon dioxide": [194.7, 3180],
};

const WARMING: Record<Gas, [gain: number, power: number]> = {
  hydrogen: [8, 1.16],
  helium: [0, 1],
  methane: [1.9, 0.3],
  ammonia: [3, 0.3],
  water: [3, 0.3],
  nitrogen: [0, 1],
  oxygen: [0, 1],
  "carbon dioxide": [5.65, 0.72],
};

const SUN_TRACES: Partial<Record<Gas, number>> = {
  methane: 5e-4,
  ammonia: 1.4e-4,
  water: 1e-3,
};

export interface Climate {
  air: number;
  gases: number[];
  heat: number;
}

export interface Shown {
  lamps: number[];
  sky: number;
  glow: number;
}

export interface Volatiles {
  glow: number;
  distance: number;
  stock: number[];
  weathered: number;
  pool: number;
  frozen: boolean;
  ceiling?: number;
  hint?: number;
}
const ROCHE = 2.44;

export function smooth(from: number, to: number, value: number): number {
  const share = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return share * share * (3 - 2 * share);
}

export function starGlow(mass: number): number {
  const suns = mass / SUN_MASS;
  const heavy = Math.min(suns, BRIGHT_MASS);
  const fit = ([slope, base]: number[]) => slope * Math.log10(heavy) + base;
  const power = suns < 1 ? Math.max(...GLOW_LIGHT.map(fit)) : Math.min(...GLOW_HEAVY.map(fit));
  return SUN_GLOW * 10 ** power * (suns / heavy) ** BRIGHT_POWER;
}

export function starRadius(mass: number): number {
  const suns = mass / SUN_MASS;
  const [square, plain, rest] = DWARF_RADIUS;
  const fitted = (square * suns ** 2 + plain * suns + rest) / (square + plain + rest);
  if (suns <= 1) {
    const [bend, slope, base] = RED_RADIUS;
    return SUN_RADIUS * Math.max(fitted, bend * suns ** 2 + slope * suns + base);
  }
  const [curve, slope, base] = DWARF_HEAT;
  const log = Math.log10(suns);
  const heat = 10 ** (curve * log ** 2 + slope * log + base);
  const hot = Math.sqrt(starGlow(mass) / SUN_GLOW) * (SUN_HEAT / heat) ** 2;
  return SUN_RADIUS * Math.min(fitted, hot);
}

export function starHeat(glow: number, radius: number): number {
  return (SUN_HEAT * (glow / SUN_GLOW) ** 0.25) / Math.sqrt(radius / SUN_RADIUS);
}

export function starSpan(mass: number): number {
  const suns = mass / SUN_MASS;
  const [base, quartic, steep, low, high] = SPAN_FIT;
  const giant =
    (base + quartic * suns ** 4 + steep * suns ** 5.5 + suns ** 7) /
    (low * suns ** 2 + high * suns ** 7);
  const [early, fall, floor, lean, bend] = SPAN_HOOK;
  const hook = 1 - 0.01 * Math.max(early / suns ** fall, floor + lean / suns ** bend);
  return 1e6 * YEAR * giant * Math.max(SPAN_SHARE, hook);
}

export function starDawn(mass: number): number {
  const suns = mass / SUN_MASS;
  return DAWN[0] * suns ** -(suns < 1 ? DAWN[1] : DAWN[2]);
}

export interface Life {
  mass: number;
  radius: number;
  glow: number;
  swell: number;
  peak: number;
  spent: number;
}

function stagesOf(mass: number): number[] {
  const suns = mass / SUN_MASS;
  const main = starSpan(mass);
  const turn = main * Math.max(TURN_SHARE[2], Math.min(1, suns ** -TURN_SHARE[1]) * TURN_SHARE[0]);
  const climb = main * CLIMB_SHARE[0] * Math.min(1, suns ** -CLIMB_SHARE[1]);
  const core = Math.min(CORE_SPAN[0], CORE_SPAN[1] * main);
  return [main, turn, climb, core, LAST_SHARE * core];
}

export function starLife(mass: number): number {
  return stagesOf(mass).reduce((sum, stage) => sum + stage, 0);
}

export function starStages(mass: number): number[] {
  let end = 0;
  return stagesOf(mass).map((stage) => {
    end += stage;
    return end;
  });
}

export function holeRadius(mass: number): number {
  return (2 * GRAVITY * mass) / LIGHT_SPEED ** 2;
}

export type Ending = "dwarf" | "pulsar" | "hole" | "core";

type Left = Pick<Life, "mass" | "radius" | "glow">;

export function emberRadius(mass: number): number {
  const left = Math.min(mass / SUN_MASS, 0.999 * EMBER_RADIUS[1]);
  const squeezed = Math.sqrt(1 - (left / EMBER_RADIUS[1]) ** (4 / 3));
  return SUN_RADIUS * EMBER_RADIUS[0] * squeezed * left ** (-1 / 3);
}

export function dwarfOf(mass: number, spent: number): Left {
  const left = Math.min(mass / SUN_MASS, 0.999 * EMBER_RADIUS[1]);
  const cooled = (EMBER_COOLING[0] / (spent + EMBER_COOLING[2])) ** EMBER_COOLING[1];
  return { mass, radius: emberRadius(mass), glow: SUN_GLOW * left * cooled };
}

export function dwarfSpent(mass: number, glow: number): number {
  const left = Math.min(mass / SUN_MASS, 0.999 * EMBER_RADIUS[1]);
  const [pace, power, first] = EMBER_COOLING;
  return Math.max(0, pace / (glow / (SUN_GLOW * left)) ** (1 / power) - first);
}

export const PULSAR_SLOWING = 1.95e-14;

export function pulsarOf(mass: number, spent: number): Left {
  const [warm, early, slope, late] = PULSAR_HEAT;
  const heat = (warm * (1 + spent / early) ** -slope) / (1 + spent / late);
  return { mass, radius: PULSAR_RADIUS, glow: glowOf(PULSAR_RADIUS, heat) };
}

export function holeOf(mass: number): Left {
  const radius = holeRadius(mass);
  return { mass, radius, glow: glowOf(radius, (HOLE_HEAT * SUN_MASS) / mass) };
}

export function endingOf(born: number): Ending {
  return born >= HOLE_LEAST ? "hole" : born >= BURST_LEAST ? "pulsar" : "dwarf";
}

export function relicOf(born: number): number {
  const suns = born / SUN_MASS;
  if (born >= HOLE_LEAST) {
    return HOLE_SHARE * born;
  }
  if (born >= BURST_LEAST) {
    return SUN_MASS * (PULSAR_MASS[0] + PULSAR_MASS[1] * (suns - BURST_LEAST / SUN_MASS));
  }
  return Math.min(born, SUN_MASS * (EMBER_MASS[0] + EMBER_MASS[1] * suns));
}

export function emberOf(ending: Ending, mass: number, spent: number): Left {
  return ending === "hole"
    ? holeOf(mass)
    : ending === "pulsar"
      ? pulsarOf(mass, spent)
      : dwarfOf(mass, spent);
}

export function bareRadius(mass: number): number {
  return SUN_RADIUS * BARED_RADIUS[0] * (mass / (BARED_RADIUS[1] * SUN_MASS)) ** BARED_RADIUS[2];
}

function acrossFlash(
  suns: number,
  [scale, lean]: number[],
  quiet: (suns: number) => number,
): number {
  const [edge, steep] = FLASH_MASS;
  if (suns >= edge) {
    return quiet(suns);
  }
  const meet = quiet(edge);
  const bend = (scale * edge ** lean - meet) / meet;
  return (scale * suns ** lean) / (1 + bend * Math.exp(steep * (suns - edge)));
}

function baseGlow(suns: number): number {
  const [first, firstPower, second, secondPower, floor, third, thirdPower, lastPower] = TURN_GLOW;
  return (
    (first * suns ** firstPower + second * suns ** secondPower) /
    (floor + third * suns ** thirdPower + suns ** lastPower)
  );
}

function quietHelium(suns: number): number {
  const [floor, gain, wide] = QUIET_GLOW;
  return (floor + gain * suns ** 3.8) / (wide + suns ** 2);
}

function heliumGlow(suns: number): number {
  return acrossFlash(suns, FLASH_GLOW, quietHelium);
}

function dropOf(suns: number): number {
  const [floor, power, wide, gain] = CORE_GLOW;
  return (floor + gain * suns ** (power + 0.1)) / (wide + suns ** power);
}

function bareHelium(core: number): number {
  const [scale, first, second, floor] = CLUMP_BARE;
  return (scale * core ** 10.25) / (core ** 9 + first * core ** 7.5 + second * core ** 6 + floor);
}

function restGlow(suns: number): number {
  const [edge, steep] = FLASH_MASS;
  const helium = heliumGlow(suns);
  if (suns >= edge) {
    return helium * dropOf(suns);
  }
  const core = coreByGlow(suns, helium);
  const bare = bareHelium(core);
  const meet = heliumGlow(edge) * dropOf(edge);
  const [scale, power, crowd, crowdPower] = CLUMP_GLOW;
  const envelope = Math.max((suns - core) / (edge - core), 1e-12);
  const bend = (scale + bare - meet) / (meet - bare);
  return (
    bare +
    ((1 + crowd) * scale * envelope ** power) /
      ((1 + crowd * envelope ** crowdPower) * (1 + bend * Math.exp(steep * (suns - edge))))
  );
}

function quietLast(suns: number): number {
  const [floor, gain, power, wide] = LAST_QUIET;
  return (floor + gain * suns ** (power + 1.8)) / (wide + suns ** power);
}

function coreByGlow(suns: number, glow: number): number {
  const [low, high] = QUIET_MASS;
  const quiet = Math.max(0, Math.min(1, (suns - low) / (high - low)));
  const [faint, lean, slope, half, gentle, least] = CORE_LIGHT;
  const settled = Math.max(least, half * faint - gentle * suns, lean * faint - slope * suns);
  const dim = 10 ** (quiet < 1 ? faint - (faint - lean * faint + slope * high) * quiet : settled);
  const [floor, base, gain, power] = GIANT_CORE;
  const bright = Math.max(floor, base + gain * suns ** power);
  const [steep, gentler] = GIANT_STEEP;
  return Math.max(
    (glow / dim) ** (1 / (steep - quiet)),
    (glow / bright) ** (1 / (gentler - quiet)),
  );
}

export function lifeOf(born: number, age: number): Life {
  const suns = born / SUN_MASS;
  const first = { mass: born, radius: starRadius(born), glow: starGlow(born) };
  const [main, turn, climb, core, last] = stagesOf(born);
  const dawn = starDawn(born);
  if (age < dawn) {
    const early = Math.max(0, dawn / Math.max(age, DAWN_LEAST) - 1);
    const wide = Math.cbrt(1 + DAWN_SWELL * early);
    const settled = starHeat(first.glow, first.radius);
    const track = (DAWN_HEAT[0] * suns ** DAWN_HEAT[1]) / settled;
    const cool = Math.min(1, Math.max(track, wide ** -DAWN_WARMING));
    const steady = smooth(DAWN_STEADY[0], DAWN_STEADY[1], suns);
    return {
      mass: born,
      radius: first.radius * wide,
      glow: first.glow * Math.max(steady, wide ** 2 * cool ** 4),
      swell: first.radius,
      peak: first.glow,
      spent: 0,
    };
  }
  if (age <= main) {
    return { ...first, swell: first.radius, peak: first.glow, spent: 0 };
  }
  const dwarf = first.radius / SUN_RADIUS;
  const bright = first.glow / SUN_GLOW;
  const blend = (from: number, to: number, share: number) => from * (to / from) ** share;
  const helium = heliumGlow(suns);
  const early = smooth(CLIMB_MOST[0], CLIMB_MOST[1], suns);
  const turned = Math.max(bright, blend(Math.min(baseGlow(suns), helium), helium, early));
  const tip = Math.max(turned, helium);
  const steady = Math.min(tip, blend(restGlow(suns), tip, early));
  const based = Math.max(steady, acrossFlash(suns, LAST_FROM, quietLast));
  const ending = Math.max(LAST_GLOW[0] * suns ** LAST_GLOW[1], based);
  const reddest = 1 - (1 - RED_LEAST) * smooth(RED_MASS[0], RED_MASS[1], suns);
  const looping = smooth(LOOP_MASS[0], LOOP_MASS[1], suns);
  const warm =
    LOOP_WARM[0] +
    LOOP_WARM[1] * looping +
    LOOP_WARM[2] * smooth(HEAVY_MASS[0], HEAVY_MASS[1], suns) +
    LOOP_WARM[3] * smooth(BLUE_MASS[0], BLUE_MASS[1], suns);
  const bared = smooth(BARED_MASS[0], BARED_MASS[1], suns);
  const [light, lightPower, heavy, heavyPower, low, part, high] = GIANT_RADIUS;
  const scale = Math.min(light * suns ** -lightPower, heavy * suns ** -heavyPower);
  const girths = (glow: number) => {
    const hot = dwarf * Math.sqrt(glow / bright);
    const coolest = (SUN_HEAT / (GIANT_HEAT[0] * suns ** GIANT_HEAT[1])) ** 2 * Math.sqrt(glow);
    const cool = Math.min(coolest, scale * (glow ** low + part * glow ** high));
    return [hot, Math.max(hot, cool)];
  };
  const wide = (glow: number, red: number) => {
    const [hot, cool] = girths(glow);
    return blend(hot, cool, red);
  };
  const bluest = (glow: number) => {
    const [hot, cool] = girths(glow);
    const room = Math.log(cool / hot);
    return room <= 0 ? reddest : Math.max(0, Math.min(reddest, 1 - Math.log(warm ** 2) / room));
  };
  const shape = (glow: number, red: number, shed = 0) => {
    const mass = born * (1 - BARED_SHARE * shed);
    const bare = bareRadius(mass) / SUN_RADIUS;
    return { mass, glow: SUN_GLOW * glow, radius: SUN_RADIUS * blend(wide(glow, red), bare, shed) };
  };
  const stages = [
    (share: number) => shape(blend(bright, turned, share), reddest * smooth(0, 1, share)),
    (share: number) => shape(blend(turned, tip, share ** CLIMB_PACE), reddest),
    (share: number) => {
      const glow = blend(steady, based, share ** CLUMP_PACE);
      const loop = 1 - looping * (1 - Math.sin(Math.PI * share) ** 2);
      return shape(glow, reddest - (reddest - bluest(glow)) * loop);
    },
    (share: number) => {
      const settled = smooth(0, SETTLING, share);
      const glow = blend(based, ending, share);
      const from = reddest - (reddest - bluest(glow)) * (1 - looping);
      return shape(glow, from + (reddest - from) * settled, bared * settled);
    },
  ];
  const spans = [turn, climb, core, last];
  let since = age - main;
  let swell = first.radius;
  let peak = first.glow;
  for (const [index, stage] of stages.entries()) {
    const from = stage(0);
    const upTo = stage(Math.min(1, since / spans[index]));
    swell = Math.max(swell, from.radius, upTo.radius);
    peak = Math.max(peak, from.glow, upTo.glow);
    if (since < spans[index]) {
      return { ...upTo, swell, peak, spent: 0 };
    }
    since -= spans[index];
  }
  return { ...emberOf(endingOf(born), relicOf(born), since), swell, peak, spent: since };
}

export function coreOf(born: number, age: number): number {
  const suns = born / SUN_MASS;
  const heavy = SUN_MASS * CORE_HEAVY[0] * suns ** CORE_HEAVY[1];
  if (born >= BURST_LEAST) {
    return heavy;
  }
  const whole = relicOf(born);
  const lit = (peak: number) =>
    Math.min(whole, Math.max(heavy, SUN_MASS * coreByGlow(suns, peak / SUN_GLOW)));
  const stages = starStages(born);
  const [from, to] = [stages[3], stages[4]];
  if (age >= to) {
    return whole;
  }
  if (age <= from) {
    return lit(lifeOf(born, age).peak);
  }
  const first = lit(lifeOf(born, from).peak);
  return first + ((whole - first) * (age - from)) / (to - from);
}

export interface Gain {
  at: number;
  spin: number;
}

export function starTurn(
  born: number,
  age: number,
  life: Life,
  luck: number,
  gains: Gain[] = [],
  ending: Ending = endingOf(born),
): number {
  if (life.spent <= 0) {
    const dwarf = starRadius(born);
    const heat = starHeat(starGlow(born), dwarf);
    const main = starSpan(born);
    const early = gains.filter((gain) => gain.at <= Math.min(age, main));
    const steady = starDay(born, heat, Math.min(age, main) + sped(born, heat, luck, early), luck);
    const braked = SUN_ROSSBY * turnover(starHeat(life.glow, life.radius));
    const slowed = (steady * life.radius) / dwarf;
    const day =
      age < starDawn(born) ? slowed : life.radius > dwarf ? Math.max(braked, slowed) : steady;
    const late = gains
      .filter((gain) => gain.at > main && gain.at <= age)
      .reduce((sum, gain) => sum + gain.spin, 0);
    if (late <= 0) {
      return day;
    }
    const turning = turningAt({ ...life, age }) * life.mass * life.radius ** 2;
    const fastest = Math.sqrt((SPIN_MOST * GRAVITY * life.mass) / life.radius ** 3);
    return (2 * Math.PI) / Math.min(fastest, (2 * Math.PI) / day + late / turning);
  }
  if (ending === "hole") {
    const spin = HOLE_SPIN[0] + HOLE_SPIN[1] * luck;
    const beat = (4 * Math.PI * GRAVITY * life.mass) / LIGHT_SPEED ** 3;
    return (beat * (1 + Math.sqrt(1 - spin ** 2))) / spin;
  }
  if (ending === "pulsar") {
    const newborn = PULSAR_DAY[0] + PULSAR_DAY[1] * luck;
    return Math.sqrt(newborn ** 2 + 2 * PULSAR_SLOWING * life.spent);
  }
  return DAY * (EMBER_DAY[0] + EMBER_DAY[1] * luck);
}

function turningAt(star: Star): number {
  return withinOf(star)?.turning ?? STAR_TURNING;
}

export function turnover(heat: number): number {
  return DAY * (314.24 * Math.exp(-heat / 1952.5 - (heat / 6250) ** 18) + 0.002);
}

function coolOf(mass: number, heat: number): number {
  return (heat / SUN_HEAT) ** (SPIN_COOL * smooth(0.2, 0.6, mass / SUN_MASS));
}

export function starDay(mass: number, heat: number, age: number, luck: number): number {
  const late = SPIN_LATE * (1 - smooth(0.2, 0.6, mass / SUN_MASS));
  const [young, old] = SPIN_PACE;
  const since = Math.max(0, age);
  const pace =
    since < SPIN_TURN
      ? (SPIN_TURN / SUN_AGE) ** (old + late) * (since / SPIN_TURN) ** (young + late)
      : (since / SUN_AGE) ** (old + late);
  const steady = SUN_ROSSBY * pace;
  const stalled = Math.max(Math.min(steady, SPIN_STALL), steady * coolOf(mass, heat));
  const rossby = Math.min(SUN_ROSSBY, stalled);
  return Math.max(rossby * turnover(heat) * (0.75 + 0.5 * luck), DAY * (0.4 + 1.1 * luck));
}

function youthOf(mass: number, heat: number, day: number, luck: number): number {
  const late = SPIN_LATE * (1 - smooth(0.2, 0.6, mass / SUN_MASS));
  const [young, old] = SPIN_PACE;
  const rossby = Math.min(day / (turnover(heat) * (0.75 + 0.5 * luck)), SUN_ROSSBY);
  const cool = coolOf(mass, heat);
  const pace = (cool < 1 && rossby < SPIN_STALL ? rossby : rossby / cool) / SUN_ROSSBY;
  const turned = (SPIN_TURN / SUN_AGE) ** (old + late);
  return pace >= turned
    ? SUN_AGE * pace ** (1 / (old + late))
    : SPIN_TURN * (pace / turned) ** (1 / (young + late));
}

function sped(born: number, heat: number, luck: number, gains: Gain[]): number {
  const dwarf = { mass: born, radius: starRadius(born), glow: starGlow(born) };
  let shift = 0;
  for (const gain of [...gains].sort((left, right) => left.at - right.at)) {
    const turning = turningAt({ ...dwarf, age: gain.at }) * born * dwarf.radius ** 2;
    const day = starDay(born, heat, gain.at + shift, luck);
    const spun = (2 * Math.PI) / ((2 * Math.PI) / day + gain.spin / turning);
    shift = Math.min(shift, youthOf(born, heat, spun, luck) - gain.at);
  }
  return shift;
}

export function glowOf(radius: number, heat: number): number {
  return 4 * Math.PI * radius ** 2 * RADIATION * heat ** 4;
}

export function lightAt(glow: number, distance: number): number {
  return glow / (4 * Math.PI * distance ** 2);
}

export function seenGlow(heat: number): number {
  if (heat <= 0) {
    return 0;
  }
  const [from, to] = SEEN_WAVES;
  const step = (to - from) / SEEN_STEPS;
  let sum = 0;
  for (let index = 0; index < SEEN_STEPS; index++) {
    const wave = from + (index + 0.5) * step;
    const depth = SECOND_RADIATION / (wave * heat);
    const eye = SEEN_PEAK[0] * Math.exp(-SEEN_PEAK[2] * (wave - SEEN_PEAK[1]) ** 2);
    sum += depth > 500 ? 0 : (eye * step) / (wave ** 5 * (Math.exp(depth) - 1));
  }
  return FIRST_RADIATION * sum;
}

export function seenShare(heat: number): number {
  return heat <= 0 ? 0 : seenGlow(heat) / (RADIATION * heat ** 4);
}

export function shownLight(lamps: number[], heat: number, spare = 0): Shown {
  const own = seenGlow(heat);
  const lent = lamps.map((seen) => SEEN_ALBEDO * seen);
  const sky = SEEN_ALBEDO * (SKY_LIGHT + spare);
  const most = Math.max(own, sky, ...lent);
  const whole = (most / (SEEN_ALBEDO * EARTH_SEEN)) ** LIGHT_POWER;
  const part = (given: number) => Math.min(LIGHT_MOST, whole) * (given / most) ** GLARE_POWER;
  const shown = lent.map(part);
  return {
    lamps: shown,
    sky: Math.max(part(sky), FILL_LIGHT * Math.max(0, ...shown)),
    glow: part(own) * smooth(GLOW_FROM[0], GLOW_FROM[1], heat),
  };
}

export function dustLight(seen: number): number {
  return Math.min(DUST_MOST, (seen / EARTH_SEEN) ** DUST_POWER);
}

export function innerHeat(mass: number, age: number, vigor: number): number {
  const jupiters = mass / JUPITER_MASS;
  const steady = smooth(-1, 0.5, Math.log10(jupiters));
  const mood = 1 + (0.75 * vigor - 0.45) * (1 - steady);
  const [heavy, dwarf, steep] = COOLING_HEAVY;
  const grown =
    jupiters < 1
      ? jupiters ** COOLING_LIGHT
      : Math.min(jupiters, dwarf) ** heavy * Math.max(1, jupiters / dwarf) ** steep;
  const cooling = COOLING_HEAT * grown * (COOLING_AGE / age) ** COOLING_PACE * mood;
  const limit = starHeat(starGlow(STAR_LEAST), starRadius(STAR_LEAST));
  const burning = limit * (mass / STAR_LEAST) ** BURNING_POWER;
  return Math.min(limit, (cooling ** 4 + burning ** 4) ** 0.25);
}

export function frostOf(glow: number): number {
  return FROST_LINE * Math.sqrt(glow / SUN_GLOW);
}

export function gravityOf(mass: number, radius: number): number {
  return (GRAVITY * mass) / radius ** 2;
}

export function scaleHeight(physics: Pick<Physics, "mass" | "radius" | "heat">): number {
  return (
    (BOLTZMANN * physics.heat) / (GAS_WEIGHT * DALTON * gravityOf(physics.mass, physics.radius))
  );
}

export function escapeOf(mass: number, radius: number): number {
  return Math.sqrt((2 * GRAVITY * mass) / radius);
}

export function gasShare(mass: number): number {
  const earths = mass / EARTH_MASS;
  return GAS_MOST * smooth(Math.log(GAS_FROM), Math.log(GAS_FULL), Math.log(earths)) ** 2;
}

export function densityOf(mass: number, radius: number): number {
  return mass / ((4 / 3) * Math.PI * radius ** 3);
}

export function yearOf(orbit: number, around: number): number {
  return 2 * Math.PI * Math.sqrt(orbit ** 3 / (GRAVITY * around));
}

export function hillOf(orbit: number, mass: number, around: number): number {
  return orbit * Math.cbrt(mass / (3 * around));
}

export function laplaceOf(
  bulge: number,
  orbit: number,
  stretch: number,
  mass: number,
  around: number,
): number {
  return ((bulge * orbit ** 3 * (1 - stretch ** 2) ** 1.5 * mass) / around) ** 0.2;
}

export function holdOf(share: number, stretch: number): number {
  const held =
    0.464 -
    0.38 * share -
    0.631 * stretch +
    0.586 * share * stretch +
    0.15 * stretch ** 2 -
    0.198 * share * stretch ** 2;
  return Math.max(HOLD_LEAST, held);
}

export function clearOf(share: number, stretch: number): number {
  const light = Math.min(share, 1 - share);
  return (
    1.6 +
    5.1 * stretch -
    2.22 * stretch ** 2 +
    4.12 * light -
    4.27 * stretch * light -
    5.09 * light ** 2 +
    4.61 * stretch ** 2 * light ** 2
  );
}

export function nestOf(ratio: number, stretch: number): number {
  return 2.8 * (((1 + ratio) * (1 + stretch)) / Math.sqrt(1 - stretch)) ** 0.4;
}

export function starborn(physics: Pick<Physics, "iron" | "rock" | "ice">): boolean {
  return physics.iron === 0 && physics.rock === 0 && physics.ice === 0;
}

export function rocheOf(radius: number, density: number, grain: number): number {
  return ROCHE * radius * Math.cbrt(density / grain);
}

export function balanceHeat(glow: number, distance: number, albedo: number): number {
  return ((glow * (1 - albedo)) / (16 * Math.PI * RADIATION * distance ** 2)) ** 0.25;
}

function exobaseOf(heat: number): number {
  return Math.max(heat, EXOBASE * (heat / balanceHeat(SUN_GLOW, ASTRONOMICAL_UNIT, 0)) ** 2);
}

export function gripOf(mass: number, radius: number, heat: number, gas: Gas): number {
  const thermal = Math.sqrt((3 * BOLTZMANN * exobaseOf(heat)) / (WEIGHTS[gas] * DALTON));
  return escapeOf(mass, radius) / (ESCAPE_MARGIN * thermal);
}

export function holdsSteam(mass: number, radius: number, heat: number): boolean {
  const thermal = Math.sqrt((3 * BOLTZMANN * heat) / (WEIGHTS.water * DALTON));
  return escapeOf(mass, radius) >= LOOSE_GRIP * ESCAPE_MARGIN * thermal;
}

export function stocked(parts: Partial<Record<Gas, number>>): number[] {
  return GASES.map((gas) => parts[gas] ?? 0);
}

export function shareOf(physics: Pick<Physics, "gases">, gas: Gas): number {
  return physics.gases[GASES.indexOf(gas)] ?? 0;
}

export function vaporOf(gas: Gas, heat: number): number {
  const curve = VAPORS[gas];
  return curve === null
    ? Number.POSITIVE_INFINITY
    : EARTH_AIR * Math.exp(-curve[1] * (1 / heat - 1 / curve[0]));
}

function warmed(partials: number[]): number {
  const depth = GASES.reduce((sum, gas, index) => {
    const [gain, power] = WARMING[gas];
    return sum + gain * (partials[index] / EARTH_AIR) ** power;
  }, 0);
  return (1 + 0.75 * depth) ** 0.25;
}

export function climateOf(given: Volatiles): Climate {
  const whole = (parts: number[]) => parts.reduce((sum, part) => sum + part, 0);
  const carbon = given.stock[GASES.indexOf("carbon dioxide")];
  const water = GASES.indexOf("water");
  const runaway = lightAt(given.glow, given.distance) >= RUNAWAY;
  const settle = (weathered: number, steam: number, pooled: boolean, boiled = false) => {
    const roundAt = (heat: number, before: number) => {
      const trap = COLD_TRAP + (1 - COLD_TRAP) * smooth(3, 5, Math.log10(Math.max(before, 1)));
      const partials = GASES.map((gas, index) => {
        const coldest = gas === "water" && pooled ? heat : trap * heat;
        const vapor = (HUMIDITY[gas] ?? 1) * vaporOf(gas, coldest);
        const most =
          gas === "water"
            ? boiled
              ? Number.POSITIVE_INFINITY
              : Math.min(steam, vapor)
            : gas === "carbon dioxide"
              ? Math.min(weathered, vapor)
              : vapor;
        return Math.min(given.stock[index], most);
      });
      const air = whole(partials);
      const deck = smooth(5.5, 6.5, Math.log10(Math.max(air, 1)));
      const albedo =
        air > TRIPLE_AIR
          ? BRIGHT_AIR + (BRIGHT_DECK - BRIGHT_AIR) * deck
          : given.frozen
            ? BRIGHT_ICE
            : BRIGHT_DUST;
      const bare = balanceHeat(given.glow, given.distance, albedo);
      const kept = 1 - STUFFY_MOST * smooth(STUFFY_HEAT[0], STUFFY_HEAT[1], bare);
      const next = Math.min(given.ceiling ?? bare * 10, bare * (1 + (warmed(partials) - 1) * kept));
      return { air, partials, next };
    };
    let heat = given.hint ?? balanceHeat(given.glow, given.distance, BRIGHT_AIR);
    let air = whole(given.stock);
    let partials = given.stock;
    let trail: number[] = [];
    for (let round = 0; round < CLIMATE_ROUNDS; round++) {
      const found = roundAt(heat, air);
      const moved = found.next - heat;
      const settled =
        Math.abs(moved) <= CLIMATE_EXACT * heat &&
        Math.abs(found.air - air) <= CLIMATE_EXACT * Math.max(found.air, 1);
      ({ air, partials } = found);
      if (settled) {
        break;
      }
      heat += 0.5 * moved;
      trail.push(heat);
      if (trail.length === 3) {
        const [first, second, third] = trail;
        const bend = third - 2 * second + first;
        const leap = bend === 0 ? 0 : -((third - second) ** 2) / bend;
        heat = Math.abs(leap) <= CLIMATE_LEAP * Math.abs(third - second) ? third + leap : third;
        trail = [];
      }
    }
    const sea =
      !boiled &&
      given.stock[water] - partials[water] >= given.pool &&
      air >= TRIPLE_AIR &&
      heat >= MELTING &&
      heat < CRITICAL;
    const smothered =
      boiled && runaway
        ? smooth(
            Math.log10(STEAMED_AIR[0]),
            Math.log10(STEAMED_AIR[1]),
            Math.log10(Math.max(partials[water], 1)),
          )
        : 0;
    const floor = Math.min(given.ceiling ?? STEAMED_HEAT, Math.max(heat, STEAMED_HEAT));
    const ground = heat + (floor - heat) * smothered;
    return {
      air,
      heat: ground,
      sea,
      gases: partials.map((part) => part / Math.max(air, 1e-12)),
    };
  };
  const wet = (weathered: number) => settle(weathered, Number.POSITIVE_INFINITY, true);
  const dry = () => settle(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, false);
  const boiled = () => settle(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, false, true);
  const regulated = () => {
    if (given.stock[water] < given.pool || wet(carbon).heat < THERMOSTAT) {
      return dry();
    }
    let low = Math.log(given.weathered);
    let high = Math.log(Math.max(carbon, given.weathered));
    for (let step = 0; step < THERMOSTAT_STEPS; step++) {
      const middle = (low + high) / 2;
      if (wet(Math.exp(middle)).heat < THERMOSTAT) {
        low = middle;
      } else {
        high = middle;
      }
    }
    const kept = wet(Math.exp(high));
    return kept.sea ? kept : dry();
  };
  const mild = runaway ? null : wet(given.weathered);
  const found =
    mild === null ? boiled() : mild.sea ? mild : mild.heat < MELTING ? regulated() : dry();
  return found.air < TRACE_AIR
    ? {
        air: 0,
        gases: [],
        heat: balanceHeat(given.glow, given.distance, given.frozen ? BRIGHT_ICE : BRIGHT_ROCK),
      }
    : { air: found.air, gases: found.gases, heat: found.heat };
}

function tracesOf(mass: number): Partial<Record<Gas, number>> {
  const rich = Math.min(RICH_MOST, RICH_JUPITER * (mass / JUPITER_MASS) ** RICH_POWER);
  return Object.fromEntries(Object.entries(SUN_TRACES).map(([gas, share]) => [gas, share * rich]));
}

export function gasAlbedo(mass: number): number {
  const [light, heavy] = BRIGHT_GAS_MASS;
  const [dim, bright] = BRIGHT_GAS;
  const share = Math.log(mass / light) / Math.log(heavy / light);
  return dim + (bright - dim) * Math.max(0, Math.min(1, share));
}

export function envelopeOf(mass: number, glow: number, distance: number, inner: number): Climate {
  const heat = (balanceHeat(glow, distance, gasAlbedo(mass)) ** 4 + inner ** 4) ** 0.25;
  const traces = tracesOf(mass);
  const broken: Partial<Record<Gas, number>> = {
    methane: smooth(900, 1300, heat),
    ammonia: smooth(500, 800, heat),
  };
  const kept = GASES.map((gas) =>
    Math.min((traces[gas] ?? 0) * (1 - (broken[gas] ?? 0)), vaporOf(gas, heat) / EARTH_AIR),
  );
  const light = 1 - kept.reduce((sum, share) => sum + share, 0);
  const gases = GASES.map((gas, index) =>
    gas === "hydrogen"
      ? SUN_HYDROGEN * light
      : gas === "helium"
        ? (1 - SUN_HYDROGEN) * light
        : kept[index],
  );
  return { air: 0, gases, heat };
}

export function cloudsOf(physics: Physics): string {
  if (!wrapped(physics) || physics.mass >= STAR_LEAST) {
    return seaCover(physics) > 0 ? "water" : "none";
  }
  const traces = tracesOf(physics.mass);
  const decks: Gas[] = ["methane", "ammonia", "water"];
  const deck = decks.find((gas) => (traces[gas] ?? 0) > vaporOf(gas, physics.heat) / EARTH_AIR);
  const dusty = physics.heat > DUST_HEAT[0] && physics.heat < DUST_HEAT[1];
  return deck ?? (dusty ? "rock and iron" : "none");
}

export function roughOf(physics: Physics): number {
  const solid = physics.iron + physics.rock + physics.ice;
  if (solid <= 0 || wrapped(physics)) {
    return 0;
  }
  const round = ROUND_ROCK - (ROUND_ROCK - ROUND_ICE) * (physics.ice / solid);
  const stiff = 1 - Math.min(1, 2 * moltenOf(physics));
  return stiff * (1 - smooth(0.5, 1.5, physics.radius / round));
}

export function moltenOf(physics: Physics): number {
  if (wrapped(physics)) {
    return 0;
  }
  const even = smooth(4, 6, Math.log10(Math.max(physics.air, 1)));
  const noon = Math.SQRT2 * physics.heat;
  const lit = noon <= ROCK_MELT ? 0 : 0.5 * (1 - (ROCK_MELT / noon) ** 4);
  const whole = smooth(ROCK_MELT - 100, ROCK_MELT + 100, physics.heat);
  return lit + (whole - lit) * even;
}

export function columnOf(mass: number, radius: number): number {
  return (gravityOf(mass, radius) * mass) / (4 * Math.PI * radius ** 2);
}

export function aloftOf(
  physics: Pick<Physics, "mass" | "radius" | "ice"> & Partial<Pick<Physics, "air" | "gases">>,
): number {
  const steam = (physics.gases?.[GASES.indexOf("water")] ?? 0) * (physics.air ?? 0);
  return steam > 0 ? Math.min(physics.ice, steam / columnOf(physics.mass, physics.radius)) : 0;
}

export function strippedShare(
  mass: number,
  radius: number,
  star: { mass: number },
  distance: number,
): number {
  const hard = XUV_GLOW * SUN_GLOW * (star.mass / SUN_MASS);
  const dose = (hard * XUV_SATURATED * (1 + 1 / XUV_FADING)) / (4 * Math.PI * distance ** 2);
  return (XUV_SHARE * Math.PI * radius ** 3 * dose) / (GRAVITY * mass ** 2);
}

export function seaCover(
  physics: Pick<
    Physics,
    "mass" | "radius" | "iron" | "rock" | "ice" | "gas" | "heat" | "air" | "gases"
  >,
): number {
  if (physics.air < TRIPLE_AIR || wrapped(physics)) {
    return 0;
  }
  const vapor = (shareOf(physics, "water") * physics.air) / columnOf(physics.mass, physics.radius);
  const liquid = physics.ice - vapor;
  if (liquid < DAMP_LEAST) {
    return 0;
  }
  if (physics.heat < MELTING || physics.heat >= CRITICAL) {
    return 0;
  }
  return Math.max(0.1, Math.min(0.97, 0.3 + 0.3 * Math.log10(liquid / DAMP_LEAST)));
}

export function heatStore(physics: Physics, season: number): number {
  const pull = gravityOf(physics.mass, physics.radius);
  if (wrapped(physics)) {
    return (GAS_STORE * EARTH_AIR) / pull;
  }
  const air = (AIR_STORE * physics.air) / pull;
  const sea = seaCover(physics) * WATER_STORE * SEA_DEPTH;
  const ground = ROCK_STORE * Math.sqrt((ROCK_CREEP * season) / Math.PI);
  return air + sea + ground;
}

export function swingOf(
  physics: Physics,
  sun: number,
  sweep: number,
  season: number,
): [coldest: number, hottest: number] {
  if (sweep <= 0 || season <= 0 || physics.light <= 0) {
    return [physics.heat, physics.heat];
  }
  const part = Math.min(1, sun / physics.light);
  const own = wrapped(physics) ? (starHeat(physics.glow, physics.radius) / physics.heat) ** 4 : 0;
  const slack = heatStore(physics, season) / (4 * RADIATION * physics.heat ** 3);
  const follow = 1 / Math.hypot(1, (2 * Math.PI * slack) / season);
  const even = (1 - sweep ** 2) ** 0.25;
  const at = (reach: number) => {
    const lit = 1 + part * ((even / reach) ** 2 - 1);
    const bare = (1 + (1 - Math.min(1, own)) * (lit - 1)) ** 0.25;
    return physics.heat * (1 + follow * (bare - 1));
  };
  return [at(1 + sweep), at(1 - sweep)];
}

export const EARTH_LIGHT = 1361;
export const EARTH_SEEN = EARTH_LIGHT * seenShare(SUN_HEAT);

export function classOf(physics: Physics): string {
  const earths = physics.mass / EARTH_MASS;
  if (physics.mass >= STAR_LEAST) {
    const dense = densityOf(physics.mass, physics.radius);
    if (physics.radius < 1.5 * holeRadius(physics.mass)) {
      return "black hole";
    }
    if (dense > DENSE_STAR[0]) {
      return dense > DENSE_STAR[1] ? "neutron star" : "white dwarf";
    }
    const shades: [number, string][] = [
      [3900, "red"],
      [5300, "orange"],
      [6100, "yellow"],
      [7400, "yellow-white"],
      [11000, "white"],
      [30000, "blue-white"],
    ];
    const shade = shades.find(([heat]) => physics.heat < heat)?.[1] ?? "blue";
    const size = physics.radius / starRadius(physics.mass);
    if (size < STAR_SIZES[0]) {
      return physics.mass < SUBDWARF_MASS * SUN_MASS ? "hot subdwarf" : "Wolf-Rayet star";
    }
    const gassy = physics.disks.some((disk) => disk.gas > 0);
    if (physics.age < starDawn(physics.mass) && (size >= STAR_SIZES[1] || gassy)) {
      const suns = physics.mass / SUN_MASS;
      if (suns < DAWN_HEAVY) {
        return "T Tauri star";
      }
      const hayashi = DAWN_HEAT[0] * suns ** DAWN_HEAT[1];
      return physics.heat > DAWN_RADIATIVE * hayashi
        ? "Herbig star"
        : "intermediate-mass T Tauri star";
    }
    if (size < STAR_SIZES[1]) {
      return shade === "red" ? "red dwarf" : `${shade} star`;
    }
    if (physics.mass >= BURST_LEAST) {
      return `${shade} supergiant`;
    }
    return `${shade} ${size < STAR_SIZES[2] ? "subgiant" : "giant"}`;
  }
  if (wrapped(physics)) {
    if (physics.mass >= BROWN_LEAST) {
      const types: [number, string][] = [
        [500, "Y"],
        [DUST_HEAT[0], "T"],
        [DUST_HEAT[1], "L"],
      ];
      return `brown dwarf ${types.find(([heat]) => physics.heat < heat)?.[1] ?? "M"}`;
    }
    const frozen = earths >= 10 || physics.ice > physics.rock + physics.iron;
    const giant = physics.gas > 0.5 ? "gas giant" : frozen ? "ice giant" : "gas dwarf";
    return physics.heat > 800 ? `hot ${giant}` : giant;
  }
  const size = roughOf(physics) > 0.5 ? "lump" : earths < 1e-3 ? "body" : "world";
  const cover = seaCover(physics);
  if (cover > 0) {
    return physics.life > 0 ? "living world" : cover > 0.9 ? "ocean world" : "sea world";
  }
  if (physics.air > STEAMY_AIR && shareOf(physics, "water") >= 0.5 && physics.heat >= MELTING) {
    return `steam ${size}`;
  }
  if (physics.air > 10 * EARTH_AIR) {
    return "veiled world";
  }
  if (physics.heat > 1000) {
    return `lava ${size}`;
  }
  if (physics.ice >= 0.1 && physics.heat < MELTING) {
    return `ice ${size}`;
  }
  if (physics.air > 300) {
    return `desert ${size}`;
  }
  return `barren ${size}`;
}
