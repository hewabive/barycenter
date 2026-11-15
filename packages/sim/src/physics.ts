import type { Physics } from "./types.ts";

export const SUN_MASS = 1.989e30;
export const SUN_RADIUS = 6.957e8;
export const SUN_GLOW = 3.828e26;
export const SUN_HEAT = 5772;
export const EARTH_MASS = 5.972e24;
export const EARTH_RADIUS = 6.371e6;
export const EARTH_AIR = 101325;
export const ASTRONOMICAL_UNIT = 1.496e11;
export const HOUR = 3600;
export const DAY = 86400;
export const YEAR = 3.156e7;
export const STAR_LEAST = 0.075 * SUN_MASS;
export const FLUID_SHARE = 0.002;

const GRAVITY = 6.674e-11;
const RADIATION = 5.67e-8;
const BOLTZMANN = 1.381e-23;
const NITROGEN = 28 * 1.661e-27;
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
const ESCAPE_MARGIN = 6;
const DAYSIDE = 1.4;
const HAZE_DEPTH = 0.83;
const HAZE_POWER = 1.1;
const STEAM = 4890;
const BOILING = 373.15;
const MELTING = 273;
const TRIPLE_AIR = 1000;
const DAMP_LEAST = 1e-5;
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

export function gasShare(mass: number): number {
  const earths = mass / EARTH_MASS;
  return GAS_MOST * smooth(Math.log(GAS_FROM), Math.log(GAS_FULL), Math.log(earths)) ** 2;
}

function solidRadius(mass: number, iron: number, rock: number, ice: number): number {
  const whole = iron + rock + ice;
  if (mass <= 0 || whole <= 0) {
    return 0;
  }
  const loose = whole / (iron / IRON_DENSITY + rock / ROCK_DENSITY + ice / ICE_DENSITY);
  const earths = mass / EARTH_MASS;
  const squeezed = (1 + earths / SQUEEZE_MASS) ** -SQUEEZE_POWER;
  return EARTH_RADIUS * Math.cbrt((earths * EARTH_DENSITY) / loose) * squeezed;
}

function gasRadius(mass: number): number {
  const share = mass / EARTH_MASS / GAS_PEAK;
  return EARTH_RADIUS * GAS_RADIUS * share ** (share < 1 ? 0.15 : -0.04);
}

export function radiusOf(
  mass: number,
  shares: { iron: number; rock: number; ice: number; gas: number },
): number {
  const core = solidRadius(mass * (1 - shares.gas), shares.iron, shares.rock, shares.ice);
  return Math.cbrt(core ** 3 + shares.gas * gasRadius(mass) ** 3);
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

export function gripOf(mass: number, radius: number, heat: number): number {
  const leave = Math.sqrt((2 * GRAVITY * mass) / radius);
  const thermal = Math.sqrt((3 * BOLTZMANN * DAYSIDE * heat) / NITROGEN);
  return leave / (ESCAPE_MARGIN * thermal);
}

export function greenhouse(air: number): number {
  return (1 + 0.75 * HAZE_DEPTH * (air / EARTH_AIR) ** HAZE_POWER) ** 0.25;
}

export function flatOf(physics: Physics): number {
  const turn = (2 * Math.PI) / physics.day;
  const share = (turn ** 2 * physics.radius ** 3) / (GRAVITY * physics.mass);
  return Math.min(0.2, FLATTENING * share);
}

export function seaCover(physics: Physics): number {
  if (physics.gas >= FLUID_SHARE || physics.air < TRIPLE_AIR || physics.ice < DAMP_LEAST) {
    return 0;
  }
  const boiling = 1 / (1 / BOILING - Math.log(physics.air / EARTH_AIR) / STEAM);
  if (physics.heat < MELTING || physics.heat > boiling) {
    return 0;
  }
  return Math.max(0.1, Math.min(0.97, 0.3 + 0.3 * Math.log10(physics.ice / DAMP_LEAST)));
}

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
  if (physics.gas >= FLUID_SHARE) {
    if (earths >= 4000) {
      return "brown dwarf";
    }
    const frozen = earths >= 10 || physics.ice > physics.rock + physics.iron;
    const giant = physics.gas > 0.5 ? "gas giant" : frozen ? "ice giant" : "gas dwarf";
    return physics.heat > 800 ? `hot ${giant}` : giant;
  }
  const size = earths < 1e-3 ? "body" : "world";
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
