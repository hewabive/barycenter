import { inflowOf } from "./disks.ts";
import { warmthOf } from "./heat.ts";
import { denseAt, interiorOf, wrapped } from "./interior.ts";
import {
  DENSE_STAR,
  densityOf,
  dwarfSpent,
  GIGAYEAR,
  GRAVITY,
  holeRadius,
  PULSAR_SLOWING,
  RADIATION,
  STAR_LEAST,
  SUN_GLOW,
  SUN_MASS,
  SUN_RADIUS,
  starborn,
  starDawn,
  starRadius,
  turnover,
  YEAR,
} from "./physics.ts";
import { createRandom } from "./random.ts";
import { withinOf } from "./stars.ts";
import type { Body, Physics, Sketch } from "./types.ts";

export type Source = "core" | "metal" | "water" | "shell" | "frozen";

export interface Shield {
  field: Field | null;
  press: number;
  reach: number;
  inside: number | null;
}

export interface Fall {
  rate: number;
  edge: number;
  light: number;
  speed: number;
  spots: number;
  heat: number;
}

export interface Field {
  source: Source;
  moment: number;
  surface: number;
  mean: number;
  tilt: number;
  split: boolean;
}

export const VACUUM = 4e-7 * Math.PI;
const DYNAMO = 0.2;
const SPLIT_FROM = 0.12;
const SPLIT_LOSS = 20;
const EARTH_SWIRL = [0.09, 1.11e-12, 2.248e6, 7.292e-5];
const IRON_SPREAD = 1.3;
const FLOW = [1.3, 1 / 5, 2 / 5];
const FLOW_LEAST = 40;
const WATER_LOSS = Math.sqrt(0.23 / 0.63);
const STANDOFF = 1.16;
const WIND = [(2e-14 * SUN_MASS) / YEAR, 4e5, 0.77];
const HARD = [10 ** -3.13, 0.13, 2.18];
const SUN_SWIRL = 2;
const FLUX_FIELD = 0.48;
const FLUX_DIPOLE = 1 / (2 * Math.SQRT2);
const FIELD_SALT = 0x3c6ef372;
const GAUSS = 1e-4;
const DIPOLE_MEAN = 1.38;
const SHELL = [257 * GAUSS, 0.06, 1.4];
const SHELL_MEAN = [61, 0.7, 2900 * GAUSS];
const SHELL_LEAST = 1e-7;
const YOUNG = [1500 * GAUSS, 100 * GAUSS, 0.4];
const YOUNG_LEAN = [10, 10, 50];
const FOSSIL_MASS = [1.5, 3.8];
const FOSSIL_SHARE = [0.003, 0.11];
const FOSSIL = [3.4, 0.2, 330 * GAUSS, 18100 * GAUSS];
const DWARF = [4e4 * GAUSS, 3e8 * GAUSS];
const DWARF_HEAVY = [1.1, 0.85, 3e6 * GAUSS];
const DWARF_LIGHT = [0.75, 0.025, 0.6 * GIGAYEAR, 0.17, 3 * GIGAYEAR];
const PULSAR = 3.2e19 * GAUSS;
const CALM_LEAN = 12;
const SPLIT_LEAN = [30, 60];
const DEGREE = Math.PI / 180;
const EDGE = [2, 140 * GAUSS, (1e-8 * SUN_MASS) / YEAR, 0.8 * SUN_MASS, 2 * SUN_RADIUS];
const LANDING = 0.5;
const SPOT_HEAT = 8000;

function shaped(
  source: Source,
  physics: Physics,
  surface: number,
  tilt: number,
  split: boolean,
  mean = DIPOLE_MEAN * surface,
): Field {
  const moment = (4 * Math.PI * physics.radius ** 3 * surface) / VACUUM;
  return { source, moment, surface, mean, tilt, split };
}

function drawn(physics: Physics): number[] {
  const random = createRandom(Math.floor(physics.vigor * 0x7fffffff) ^ FIELD_SALT);
  return [random.next(), random.next(), random.next(), random.next()];
}

function coreField(physics: Physics, host: Physics | null): Field | null {
  const core = warmthOf(physics, host)?.core ?? null;
  const layers = interiorOf(physics)?.layers ?? [];
  const iron = layers.find(({ matter }) => matter === "iron");
  const rock = layers.find(({ matter }) => matter === "rock");
  if (core === null || core.stirring <= 0 || iron === undefined || rock === undefined) {
    return null;
  }
  const deep = iron.radius * (1 - core.frozen);
  const turn = (2 * Math.PI) / physics.day;
  const [pace, wide, driven] = FLOW;
  if ((pace * (deep / turn) ** wide * core.stirring ** driven * deep) / IRON_SPREAD < FLOW_LEAST) {
    return null;
  }
  const [swirl, stirring, depth, rate] = EARTH_SWIRL;
  const local =
    swirl *
    Math.sqrt(core.stirring / stirring) *
    Math.cbrt(depth / deep) *
    (rate / turn) ** (7 / 6);
  const split = local > SPLIT_FROM;
  const whole =
    4 *
    Math.PI *
    iron.radius ** 3 *
    DYNAMO *
    Math.sqrt(denseAt("iron", rock.pressure) / (2 * VACUUM)) *
    Math.cbrt(core.stirring * deep);
  const moment = split ? whole / SPLIT_LOSS : whole;
  const [lean] = drawn(physics);
  const tilt = split ? SPLIT_LEAN[0] + SPLIT_LEAN[1] * lean : CALM_LEAN * lean;
  const surface = (VACUUM * moment) / (4 * Math.PI * physics.radius ** 3);
  return shaped("core", physics, surface, tilt * DEGREE, split);
}

function gasField(physics: Physics): Field | null {
  const layers = interiorOf(physics)?.layers ?? [];
  const metal = layers.find(({ matter }) => matter === "metal");
  const deep = metal ?? layers.find(({ matter }) => matter === "ice");
  if (deep === undefined || physics.glow <= 0) {
    return null;
  }
  const within =
    FLUX_FIELD *
    (((physics.mass / SUN_MASS) * (physics.glow / SUN_GLOW) ** 2) /
      (physics.radius / SUN_RADIUS) ** 7) **
      (1 / 6);
  const split = metal === undefined;
  const surface =
    FLUX_DIPOLE * within * (deep.radius / physics.radius) ** 3 * (split ? WATER_LOSS : 1);
  const [lean] = drawn(physics);
  const tilt = split ? SPLIT_LEAN[0] + SPLIT_LEAN[1] * lean : CALM_LEAN * lean;
  return shaped(split ? "water" : "metal", physics, surface, tilt * DEGREE, split);
}

function dwarfField(physics: Physics, draws: number[]): Field | null {
  const [lean, lot, strong] = draws;
  const suns = physics.mass / SUN_MASS;
  const spent = dwarfSpent(physics.mass, physics.glow);
  const [light, young, early, old, late] = DWARF_LIGHT;
  const [heavy, most, least] = DWARF_HEAVY;
  const aged = Math.max(0, Math.min(1, (spent - early) / (late - early)));
  const quiet = young + (old - young) * aged;
  const weight = Math.max(0, Math.min(1, (suns - light) / (heavy - light)));
  if (lot >= quiet + (most - quiet) * weight) {
    return null;
  }
  const from = DWARF[0] * (least / DWARF[0]) ** weight;
  const mean = from * (DWARF[1] / from) ** strong;
  return shaped("frozen", physics, mean / DIPOLE_MEAN, Math.acos(lean), false, mean);
}

function fossilOf(physics: Physics, draws: number[]): number {
  const [, lot, strong, phase] = draws;
  const suns = physics.mass / SUN_MASS;
  const rise = Math.max(
    0,
    Math.min(1, (suns - FOSSIL_MASS[0]) / (FOSSIL_MASS[1] - FOSSIL_MASS[0])),
  );
  if (
    suns < FOSSIL_MASS[0] ||
    lot >= FOSSIL_SHARE[0] + (FOSSIL_SHARE[1] - FOSSIL_SHARE[0]) * rise
  ) {
    return 0;
  }
  const [middle, spread, least, most] = FOSSIL;
  const bell = Math.sqrt(-2 * Math.log(Math.max(strong, 1e-12))) * Math.cos(2 * Math.PI * phase);
  const pole = Math.max(least, Math.min(most, GAUSS * 10 ** (middle + spread * bell)));
  return (pole / 2) * Math.min(1, starRadius(physics.mass) / physics.radius) ** 2;
}

function starField(physics: Physics): Field | null {
  const draws = drawn(physics);
  const [lean] = draws;
  const packed = densityOf(physics.mass, physics.radius);
  if (physics.radius < 1.5 * holeRadius(physics.mass)) {
    return null;
  }
  if (packed > DENSE_STAR[1]) {
    const surface = PULSAR * Math.sqrt(PULSAR_SLOWING);
    return shaped("frozen", physics, surface, Math.acos(lean), false);
  }
  if (packed > DENSE_STAR[0]) {
    return dwarfField(physics, draws);
  }
  const swirl = physics.day / turnover(physics.heat);
  const [full, from, fall] = SHELL;
  const stirred = (full * Math.min(1, (swirl / from) ** -fall)) / DIPOLE_MEAN;
  const young = physics.age < starDawn(physics.mass) && physics.radius > starRadius(physics.mass);
  const still = Math.max(0, 1 - (withinOf(physics)?.wrap ?? 1));
  const settled = Math.min(1, still / YOUNG[2]);
  const dawn = young ? (YOUNG[0] * (YOUNG[1] / YOUNG[0]) ** settled) / 2 : 0;
  const kept = fossilOf(physics, draws);
  const surface = Math.max(stirred, dawn, kept);
  if (surface < SHELL_LEAST) {
    return null;
  }
  if (kept >= surface) {
    return shaped("frozen", physics, kept, Math.acos(lean), false);
  }
  const [least, more, most] = YOUNG_LEAN;
  const tilt = young ? least + more * lean + most * settled : SPLIT_LEAN[0] * lean;
  const [scale, power, top] = SHELL_MEAN;
  const large = DIPOLE_MEAN * surface;
  const mean = Math.max(large, Math.min(top, GAUSS * scale * (large / GAUSS) ** power));
  return shaped("shell", physics, surface, tilt * DEGREE, young && settled >= 1, mean);
}

function burning(physics: Physics): boolean {
  return starborn(physics) && physics.mass >= STAR_LEAST;
}

export function fieldOf(physics: Physics, host: Physics | null): Field | null {
  if (burning(physics)) {
    return starField(physics);
  }
  return starborn(physics) || wrapped(physics) ? gasField(physics) : coreField(physics, host);
}

export function windAt(star: Physics, distance: number): number {
  if (!burning(star) || densityOf(star.mass, star.radius) > DENSE_STAR[0]) {
    return 0;
  }
  const hard = (swirl: number) => HARD[0] * Math.min(1, (swirl / HARD[1]) ** -HARD[2]);
  const wide = (star.radius / SUN_RADIUS) ** 2;
  const lit =
    (hard(star.day / turnover(star.heat)) / hard(SUN_SWIRL)) * (star.glow / SUN_GLOW / wide);
  const [loss, speed, power] = WIND;
  return (loss * wide * lit ** power * speed) / (4 * Math.PI * distance ** 2);
}

export function reachOf(field: Field, radius: number, press: number): number {
  return (
    radius * Math.max(1, ((2 * STANDOFF ** 2 * field.surface ** 2) / (VACUUM * press)) ** (1 / 6))
  );
}

export function shieldOf(system: Sketch, id: number): Shield {
  const body = system.bodies[id];
  const parent = body.parent === null ? null : system.bodies[body.parent];
  const field = fieldOf(body.physics, parent?.physics ?? null);
  if (parent === null || burning(body.physics)) {
    return { field, press: 0, reach: Number.POSITIVE_INFINITY, inside: null };
  }
  const blown = (): number => {
    let [child, above] = [body, parent];
    while (!burning(above.physics) && above.parent !== null) {
      [child, above] = [above, system.bodies[above.parent]];
    }
    const { orbit, stretch } = child.physics;
    return windAt(above.physics, orbit * (1 - stretch ** 2) ** 0.25);
  };
  const host = burning(parent.physics) ? null : shieldOf(system, parent.id);
  const around = host?.field ?? null;
  const held = host !== null && around !== null && body.physics.orbit < host.reach;
  const press =
    held && around !== null
      ? (around.surface * (parent.physics.radius / body.physics.orbit) ** 3) ** 2 / (2 * VACUUM)
      : blown();
  const reach =
    field === null
      ? 0
      : press > 0
        ? reachOf(field, body.physics.radius, press)
        : Number.POSITIVE_INFINITY;
  return { field, press, reach, inside: held ? parent.id : null };
}

export function fallOf(star: Pick<Body, "seed" | "physics">): Fall | null {
  const { physics } = star;
  const rate = burning(physics) ? inflowOf(star) : 0;
  if (rate <= 0) {
    return null;
  }
  const { mass, radius } = physics;
  const [scale, strong, fed, heavy, wide] = EDGE;
  const stopped =
    scale *
    ((fieldOf(physics, null)?.surface ?? 0) / strong) ** (4 / 7) *
    (rate / fed) ** (-2 / 7) *
    (mass / heavy) ** (-1 / 7) *
    (radius / wide) ** (5 / 7);
  const edge = radius * Math.max(1, stopped);
  const fallen = 1 - radius / edge;
  const light = ((GRAVITY * mass * rate) / radius) * Math.max(LANDING, fallen);
  const spots = Math.min(1, light / (4 * Math.PI * radius ** 2 * RADIATION * SPOT_HEAT ** 4));
  const speed = Math.sqrt(((2 * GRAVITY * mass) / radius) * fallen);
  return { rate, edge, light, speed, spots, heat: SPOT_HEAT };
}
