import { densityOf, GRAVITY } from "./physics.ts";

const TIDE_FLUID = 1e-6;
const SOLID_LOSS = 100;
const LOVE_MOST = 0.4;
const ROCK_STIFF = 5e10;
const ICE_STIFF = 4e9;
const TURNING_SOLID = 0.33;
const TURNING_FLUID = 0.25;
const POWER = 6.5;
const SCAN = 48;
const HALVINGS = 40;
const SPIN_MOST = 0.8;
const RIGID = 1.44;
const PLUNGE = 1.02;
const IN_STEP = 2 ** (2 / 3);
const WEDGE_MOST = 0.9;

export const MOONS_APART = 5;

export interface Turner {
  mass: number;
  radius: number;
  day: number;
  ice: number;
  fluid: boolean;
}

export interface Reach {
  torn: number;
  born: number;
  far: number;
}

export interface Tide {
  orbit: number;
  day: number;
  fell: boolean;
  held: boolean;
}

export interface Rider {
  mass: number;
  born: number;
  stretch: number;
  torn: number;
  far: number;
  tide: Tide;
}

export interface Fate extends Tide {
  lost: boolean;
}

export function syncOf(mass: number, day: number): number {
  return Math.cbrt((GRAVITY * mass * day ** 2) / (4 * Math.PI ** 2));
}

export function tornAt(radius: number, density: number, grain: number): number {
  return radius * Math.max(PLUNGE, RIGID * Math.cbrt(density / grain));
}

export function yieldOf(host: Pick<Turner, "mass" | "radius" | "ice" | "fluid">): number {
  if (host.fluid) {
    return TIDE_FLUID;
  }
  const stiff = ROCK_STIFF * (ICE_STIFF / ROCK_STIFF) ** host.ice;
  const weight = (densityOf(host.mass, host.radius) * GRAVITY * host.mass) / host.radius;
  const soft = (2 * weight) / (19 * stiff);
  return Math.min(LOVE_MOST, (1.5 * soft) / (1 + soft)) / SOLID_LOSS;
}

export function pullOf(host: Turner, moon: number): number {
  const drawn = host.radius ** 5 * Math.sqrt(GRAVITY * (host.mass + moon));
  return ((39 / 2) * yieldOf(host) * moon * drawn) / host.mass;
}

export function tideOf(
  host: Turner,
  moon: { mass: number; orbit: number },
  reach: Reach,
  set: number,
  tied: number,
  age: number,
  turning: boolean,
): Tide {
  const whole = host.mass + moon.mass;
  const pull = pullOf(host, moon.mass);
  const inertia = (host.fluid ? TURNING_FLUID : TURNING_SOLID) * host.mass * host.radius ** 2;
  const swing = (orbit: number) =>
    ((moon.mass * host.mass) / whole) * Math.sqrt(GRAVITY * whole * orbit);
  const fastest = SPIN_MOST * Math.sqrt((GRAVITY * host.mass) / host.radius ** 3);
  const steady = (2 * Math.PI) / host.day;
  const store = inertia * steady + swing(moon.orbit);
  const spin = (orbit: number) =>
    turning ? Math.min(fastest, (store - swing(orbit)) / inertia) : steady;
  const lag = (orbit: number) => Math.sqrt((GRAVITY * whole) / orbit ** 3) - spin(orbit);
  let orbit = moon.orbit;
  let day = host.day;
  let held = false;
  if (orbit <= reach.torn) {
    return { orbit: reach.torn, day, fell: true, held };
  }
  const until = Math.min(age, tied);
  if (set < tied && until !== set) {
    const outward = lag(orbit) < 0;
    const span = until - set;
    const rising = outward === span > 0;
    const bound = rising ? reach.far : span > 0 ? reach.torn : Math.min(orbit, reach.born);
    let stop = bound;
    let met = false;
    let last = orbit;
    const even = syncOf(whole, host.day);
    if (!turning && rising !== outward && (rising ? even < bound : even > bound)) {
      stop = even;
      met = true;
    }
    for (let step = 1; turning && step <= SCAN && !met && bound !== orbit; step++) {
      const next = orbit * (bound / orbit) ** (step / SCAN);
      if (lag(next) < 0 !== outward) {
        let low = last;
        let high = next;
        for (let halving = 0; halving < HALVINGS; halving++) {
          const middle = Math.sqrt(low * high);
          if (lag(middle) < 0 === outward) {
            low = middle;
          } else {
            high = middle;
          }
        }
        stop = low;
        met = true;
      }
      last = next;
    }
    const moved = orbit ** POWER + (outward ? 1 : -1) * pull * span;
    const end = stop ** POWER;
    const arrived = rising ? moved >= end : moved <= end;
    orbit = arrived ? stop : moved ** (1 / POWER);
    held = arrived && met;
    if (arrived && !met && !rising && span > 0) {
      const spun = turning ? Math.min(fastest, store / inertia) : steady;
      return { orbit: reach.torn, day: (2 * Math.PI) / spun, fell: true, held: false };
    }
    day = turning ? (2 * Math.PI) / Math.max(spin(orbit), 1e-30) : host.day;
  }
  const bound = Math.max(set, tied);
  if (age > bound) {
    const moved = orbit ** POWER - pull * (age - bound);
    if (moved <= reach.torn ** POWER) {
      return { orbit: reach.torn, day, fell: true, held: false };
    }
    return { orbit: moved ** (1 / POWER), day, fell: false, held: false };
  }
  return { orbit, day, fell: false, held };
}

export function trainOf(riders: Rider[], around: number): Fate[] {
  const steps = riders.map((rider, at) => {
    if (at === 0) {
      return 1;
    }
    const inner = riders[at - 1];
    const wedge = (MOONS_APART / 2) * Math.cbrt((inner.mass + rider.mass) / (3 * around));
    const clear = (1 + inner.stretch + wedge) / Math.max(1 - rider.stretch - wedge, 1 - WEDGE_MOST);
    return Math.min(rider.born / inner.born, Math.max(IN_STEP, clear));
  });
  const apart = (from: number, to: number) =>
    steps.slice(from + 1, to + 1).reduce((product, step) => product * step, 1);
  const ranks = riders
    .map((_, at) => at)
    .sort((left, right) => riders[right].mass - riders[left].mass || left - right);
  const fates: (Fate | null)[] = riders.map(() => null);
  for (const at of ranks) {
    const { tide, torn, far } = riders[at];
    let low = 0;
    let high = Number.POSITIVE_INFINITY;
    fates.forEach((fate, other) => {
      if (fate === null || fate.lost) {
        return;
      }
      if (other < at && !fate.fell) {
        low = Math.max(low, fate.orbit * apart(other, at));
      } else if (other > at) {
        high = Math.min(high, (fate.fell ? riders[other].torn : fate.orbit) / apart(at, other));
      }
    });
    const pushed = low > 0 && (tide.fell || tide.orbit < low);
    const orbit = Math.min(high, pushed ? low : tide.orbit);
    const fell = orbit <= torn || (tide.fell && !pushed);
    const lost = !fell && orbit > far && orbit > tide.orbit;
    const held = tide.held && orbit === tide.orbit;
    fates[at] = { orbit: fell ? torn : orbit, day: tide.day, fell, held, lost };
  }
  return fates.map((fate, at) => fate ?? { ...riders[at].tide, lost: false });
}
