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
export const ROCK_MELT = 1400;

const GRAVITY = 6.674e-11;
const FROST_LINE = 2.7 * ASTRONOMICAL_UNIT;
const RADIATION = 5.67e-8;
const BOLTZMANN = 1.381e-23;
const DALTON = 1.661e-27;
const EARTH_DENSITY = 5514;
const IRON_DENSITY = 7900;
const ROCK_DENSITY = 3400;
const ICE_DENSITY = 1000;
const SQUEEZE_MASS = 0.45;
const SQUEEZE_POWER = 0.078;
const GAS_RADIUS = 11.4;
const GAS_PEAK = 318;
const GAS_FROM = 3;
const GAS_FULL = 300;
const GAS_MOST = 0.95;
const DEEP_AIR = 1e8;
const PUFF_FROM = 1000;
const PUFF_SPAN = 1000;
const PUFF_MOST = 1.4;
const PUFF_GAIN = 0.5;
const POROUS_MOST = 0.4;
const POROUS_SPAN = [18.5, 20.5];
const ROUND_ROCK = 3e5;
const ROUND_ICE = 2e5;
const SUN_SPAN = 10 * GIGAYEAR;
const COOLING_HEAT = 100;
const COOLING_AGE = 4.5 * GIGAYEAR;
const COOLING_PACE = 0.3;
const COOLING_LIGHT = 0.25;
const COOLING_HEAVY = 0.6;
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
const DAYSIDE = 1.4;
const MELTING = 273;
const TRIPLE_AIR = 1000;
const TRACE_AIR = 1;
export const DAMP_LEAST = 1e-5;
const HUMIDITY = 0.6;
const COLD_TRAP = 0.75;
const CLIMATE_ROUNDS = 40;
const XUV_DOSE = 6e15;
const XUV_SHARE = 0.1;
const XUV_SPAN = [0.3, 10];
const CRITICAL = 647;
const STEAM_LEFT = 200;
const THERMOSTAT = 278;
const THERMOSTAT_STEPS = 14;
const BRIGHT_AIR = 0.3;
const BRIGHT_DECK = 0.65;
const BRIGHT_ICE = 0.55;
const BRIGHT_ROCK = 0.12;
const BRIGHT_GAS = 0.34;
const SUN_HYDROGEN = 0.86;
const RICH_JUPITER = 4;
const RICH_POWER = -0.8;
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
  hydrogen: [4.9, 1.16],
  helium: [0, 1],
  methane: [1.5, 0.3],
  ammonia: [3, 0.3],
  water: [3, 0.3],
  nitrogen: [0, 1],
  oxygen: [0, 1],
  "carbon dioxide": [5.19, 0.72],
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
}
const FLATTENING = 0.7;
const ROCHE = 2.44;

function smooth(from: number, to: number, value: number): number {
  const share = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return share * share * (3 - 2 * share);
}

export function starGlow(mass: number): number {
  const suns = mass / SUN_MASS;
  const glow = suns < 0.43 ? 0.23 * suns ** 2.3 : suns < 2 ? suns ** 4 : 1.4 * suns ** 3.5;
  return SUN_GLOW * glow;
}

export function starRadius(mass: number): number {
  const suns = mass / SUN_MASS;
  return SUN_RADIUS * suns ** (suns < 1 ? 0.9 : 0.57);
}

export function starHeat(glow: number, radius: number): number {
  return (SUN_HEAT * (glow / SUN_GLOW) ** 0.25) / Math.sqrt(radius / SUN_RADIUS);
}

export function starSpan(mass: number): number {
  return SUN_SPAN * (mass / SUN_MASS) ** -2.5;
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

export function shownLight(lamps: number[], heat: number): Shown {
  const own = seenGlow(heat);
  const lent = lamps.map((seen) => SEEN_ALBEDO * seen);
  const sky = SEEN_ALBEDO * SKY_LIGHT;
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

export function innerHeat(mass: number, age: number, vigor: number): number {
  const jupiters = mass / JUPITER_MASS;
  const steady = smooth(-1, 0.5, Math.log10(jupiters));
  const mood = 1 + (0.75 * vigor - 0.45) * (1 - steady);
  const slope = jupiters < 1 ? COOLING_LIGHT : COOLING_HEAVY;
  const cooling = COOLING_HEAT * jupiters ** slope * (COOLING_AGE / age) ** COOLING_PACE * mood;
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

export function escapeOf(mass: number, radius: number): number {
  return Math.sqrt((2 * GRAVITY * mass) / radius);
}

export function gasShare(mass: number): number {
  const earths = mass / EARTH_MASS;
  return GAS_MOST * smooth(Math.log(GAS_FROM), Math.log(GAS_FULL), Math.log(earths)) ** 2;
}

function solidRadius(mass: number, iron: number, rock: number, ice: number): number {
  const whole = iron + rock + ice;
  if (mass <= 0 || whole <= 0) {
    return 0;
  }
  const packed = whole / (iron / IRON_DENSITY + rock / ROCK_DENSITY + ice / ICE_DENSITY);
  const holes = POROUS_MOST * (1 - smooth(POROUS_SPAN[0], POROUS_SPAN[1], Math.log10(mass)));
  const loose = packed * (1 - holes);
  const earths = mass / EARTH_MASS;
  const squeezed = (1 + earths / SQUEEZE_MASS) ** -SQUEEZE_POWER;
  return EARTH_RADIUS * Math.cbrt((earths * EARTH_DENSITY) / loose) * squeezed;
}

function gasRadius(mass: number, warmth: number): number {
  const share = mass / EARTH_MASS / GAS_PEAK;
  const light = Math.max(0.3, Math.min(1.5, share ** -0.3));
  const excess = Math.max(0, Math.min(PUFF_MOST, (warmth - PUFF_FROM) / PUFF_SPAN));
  const cold = EARTH_RADIUS * GAS_RADIUS * share ** (share < 1 ? 0.15 : -0.04);
  return cold * (1 + PUFF_GAIN * light * excess);
}

export function radiusOf(
  mass: number,
  shares: { iron: number; rock: number; ice: number; gas: number },
  warmth = 0,
): number {
  const core = solidRadius(mass * (1 - shares.gas), shares.iron, shares.rock, shares.ice);
  return Math.cbrt(core ** 3 + shares.gas * gasRadius(mass, warmth) ** 3);
}

export function wrapped(physics: Pick<Physics, "mass" | "radius" | "gas">): boolean {
  return columnOf(physics.mass, physics.radius) * physics.gas >= DEEP_AIR;
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

export function rocheOf(radius: number, density: number, grain: number): number {
  return ROCHE * radius * Math.cbrt(density / grain);
}

export function balanceHeat(glow: number, distance: number, albedo: number): number {
  return ((glow * (1 - albedo)) / (16 * Math.PI * RADIATION * distance ** 2)) ** 0.25;
}

export function gripOf(mass: number, radius: number, heat: number, gas: Gas): number {
  const thermal = Math.sqrt((3 * BOLTZMANN * DAYSIDE * heat) / (WEIGHTS[gas] * DALTON));
  return escapeOf(mass, radius) / (ESCAPE_MARGIN * thermal);
}

export function stocked(parts: Partial<Record<Gas, number>>): number[] {
  return GASES.map((gas) => parts[gas] ?? 0);
}

export function shareOf(physics: Physics, gas: Gas): number {
  return physics.gases[GASES.indexOf(gas)] ?? 0;
}

export function vaporOf(gas: Gas, heat: number): number {
  const curve = VAPORS[gas];
  return curve === null
    ? Number.POSITIVE_INFINITY
    : EARTH_AIR * Math.exp(-curve[1] * (1 / heat - 1 / curve[0]));
}

function boilingAt(air: number): number {
  const [boiling, latent] = VAPORS.water ?? [0, 1];
  const found = 1 / (1 / boiling - Math.log(air / EARTH_AIR) / latent);
  return found > 0 ? Math.min(CRITICAL, found) : CRITICAL;
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
  const sheltered = given.stock[GASES.indexOf("hydrogen")] > 0;
  const settle = (weathered: number, steam: number) => {
    let heat = balanceHeat(given.glow, given.distance, BRIGHT_AIR);
    let partials = given.stock;
    let air = whole(partials);
    for (let round = 0; round < CLIMATE_ROUNDS; round++) {
      const trap = COLD_TRAP + (1 - COLD_TRAP) * smooth(3, 5, Math.log10(Math.max(air, 1)));
      partials = GASES.map((gas, index) => {
        const most =
          gas === "water"
            ? Math.min(steam, HUMIDITY * vaporOf(gas, heat))
            : gas === "carbon dioxide"
              ? Math.min(weathered, vaporOf(gas, trap * heat))
              : vaporOf(gas, trap * heat);
        return Math.min(given.stock[index], most);
      });
      air = whole(partials);
      const deck = smooth(5.5, 6.5, Math.log10(Math.max(air, 1)));
      const albedo =
        air > TRIPLE_AIR
          ? BRIGHT_AIR + (BRIGHT_DECK - BRIGHT_AIR) * deck
          : given.frozen
            ? BRIGHT_ICE
            : BRIGHT_ROCK;
      const bare = balanceHeat(given.glow, given.distance, albedo);
      const kept = 1 - STUFFY_MOST * smooth(STUFFY_HEAT[0], STUFFY_HEAT[1], bare);
      const next = Math.min(given.ceiling ?? bare * 10, bare * (1 + (warmed(partials) - 1) * kept));
      heat += 0.5 * (next - heat);
    }
    const sea =
      given.stock[water] - partials[water] >= given.pool &&
      air >= TRIPLE_AIR &&
      heat >= MELTING &&
      heat <= boilingAt(air);
    return { air, heat, sea, gases: partials.map((part) => part / Math.max(air, 1e-12)) };
  };
  const wet = (weathered: number) => settle(weathered, Number.POSITIVE_INFINITY);
  const dry = () =>
    settle(Number.POSITIVE_INFINITY, sheltered ? Number.POSITIVE_INFINITY : STEAM_LEFT);
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
  const mild = wet(given.weathered);
  const found = mild.sea ? mild : mild.heat < MELTING ? regulated() : dry();
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

export function envelopeOf(mass: number, glow: number, distance: number, inner: number): Climate {
  const heat = (balanceHeat(glow, distance, BRIGHT_GAS) ** 4 + inner ** 4) ** 0.25;
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
  return stiff * (1 - smooth(0.5, 1.2, physics.radius / round));
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

export function flatOf(physics: Physics): number {
  const turn = (2 * Math.PI) / physics.day;
  const share = (turn ** 2 * physics.radius ** 3) / (GRAVITY * physics.mass);
  return Math.min(0.2, FLATTENING * share);
}

export function columnOf(mass: number, radius: number): number {
  return (gravityOf(mass, radius) * mass) / (4 * Math.PI * radius ** 2);
}

export function strippedShare(
  mass: number,
  radius: number,
  star: { mass: number; glow: number },
  distance: number,
): number {
  const lively = Math.max(XUV_SPAN[0], Math.min(XUV_SPAN[1], (SUN_MASS / star.mass) ** 1.5));
  const dose = (XUV_DOSE * lively * (star.glow / SUN_GLOW)) / (distance / ASTRONOMICAL_UNIT) ** 2;
  return (XUV_SHARE * Math.PI * radius ** 3 * dose) / (GRAVITY * mass ** 2);
}

export function seaCover(physics: Physics): number {
  if (physics.air < TRIPLE_AIR || wrapped(physics)) {
    return 0;
  }
  const vapor = (shareOf(physics, "water") * physics.air) / columnOf(physics.mass, physics.radius);
  const liquid = physics.ice - vapor;
  if (liquid < DAMP_LEAST) {
    return 0;
  }
  if (physics.heat < MELTING || physics.heat > boilingAt(physics.air)) {
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
    const shades: [number, string][] = [
      [3900, "red dwarf"],
      [5300, "orange star"],
      [6100, "yellow star"],
      [7400, "yellow-white star"],
    ];
    return shades.find(([heat]) => physics.heat < heat)?.[1] ?? "white star";
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
  if (physics.air > 10 * EARTH_AIR) {
    return "veiled world";
  }
  if (physics.heat > 1000) {
    return `lava ${size}`;
  }
  if (physics.ice >= 0.1) {
    return `ice ${size}`;
  }
  if (physics.air > 300) {
    return `desert ${size}`;
  }
  return `barren ${size}`;
}
