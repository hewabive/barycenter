import { denseAt, interiorOf, type Layer, ROCK_DEEP_FROM, wrapped } from "./interior.ts";
import { GIGAYEAR, GRAVITY, seaCover, smooth, starborn } from "./physics.ts";
import { type Circling, roundingOf, workOf, yieldOf } from "./tides.ts";
import type { Physics } from "./types.ts";

export interface Sea {
  roof: number;
  depth: number;
  heat: number;
}

export interface Core {
  heat: number;
  flux: number;
  steep: number;
  frozen: number;
  stirring: number;
}

export interface Warmth {
  decay: number;
  tide: number;
  flow: number;
  melt: number;
  plates: boolean;
  mantle: number | null;
  lid: number;
  core: Core | null;
  sea: Sea | null;
}

const BIRTH = 4.567 * GIGAYEAR;
const DECAYS = [
  [95.13e-6 * 0.992796 * 20.3e-9, 4.468],
  [568.47e-6 * 0.007204 * 20.3e-9, 0.7038],
  [26.28e-6 * 79.5e-9, 14.05],
  [28.47e-6 * 1.17e-4 * 240e-6, 1.277],
];
const TIDE = 21 / 2;
const TIDE_MOLTEN = 0.015;
const MELT_CARRIED = 3000;
const ICE_CONDUCT = 651;
const ICE_DENSE = 930;
const SEA_DENSE = 1100;
const THAW = [
  [0, 273.16],
  [208.566e6, 251.165],
  [350.1e6, 256.164],
  [632.4e6, 273.31],
  [2216e6, 355],
];
const SHELL_TURNS = 12;
const UNDER_ICE = 270;
const GAS_CONSTANT = 8.314;
const ROCK_CONDUCT = 4.2;
const ROCK_CONDUCT_DEEP = 10;
const ROCK_SPREAD = 1e-6;
const ROCK_SWELL = 3e-5;
const ROCK_GRIP = 1;
const ROCK_HEAT = 1265;
const ROCK_CRIT = 660;
const ROCK_VISCOUS = 6e7;
const ROCK_BARRIER = 3e5;
const ROCK_VISCOUS_DEEP = 5e18;
const ROCK_MOLTEN = 2000;
const LID = 0.53;
const IRON_HEAT = 840;
const IRON_GRIP = 1.5;
const IRON_SWELL = 1e-5;
const IRON_LIGHTER = 700 / 11900;
const IRON_CONDUCT = 70;
const IRON_FREEZING = 1.05e6;
const LIQUIDUS = [0.88 * 1809, 31e9, 0.512];
const CORE_FIRST = 1.56;
const SHELLS = 32;
const STEPS = 150;
const PACE = 0.02;
const STEPS_MOST = 4000;

export function decayOf(age: number): number {
  return DECAYS.reduce(
    (sum, [now, half]) => sum + now * 2 ** ((BIRTH - age) / (half * GIGAYEAR)),
    0,
  );
}

function tideOn(physics: Physics, host: Physics | null, decay: number): number {
  if (host === null || physics.day !== physics.year || physics.stretch <= 0) {
    return 0;
  }
  const cold = yieldOf({ ...physics, fluid: false });
  const kept = starborn(host) ? Math.exp(-physics.age / roundingOf(physics, host.mass, cold)) : 1;
  const worked = TIDE * workOf(physics, host.mass) * (physics.stretch * kept) ** 2;
  const carried = Math.max(decay, 8 * Math.PI * MELT_CARRIED * physics.radius);
  const molten = smooth(0, 1, Math.log10((cold * worked) / carried));
  return worked * (cold + Math.max(0, TIDE_MOLTEN - cold) * molten);
}

export function forcedBy(heat: number, body: Circling, host: number): number {
  return Math.sqrt(heat / (TIDE * TIDE_MOLTEN * workOf(body, host)));
}

function thawAt(pressure: number, from: number): number {
  const above = THAW.findLastIndex(([at]) => pressure >= at);
  const first = Math.max(from, Math.min(THAW.length - 2, above));
  const [low, cold] = THAW[first];
  const [high, warm] = THAW[first + 1];
  return cold + ((warm - cold) * (pressure - low)) / (high - low);
}

function seaOf(physics: Physics, ice: Layer, under: number, flow: number): Sea | null {
  const pull = (GRAVITY * physics.mass) / physics.radius ** 2;
  const thick = ice.radius - under;
  if (!(flow > 0) || physics.heat >= THAW[0][1]) {
    return null;
  }
  let roof = 0;
  let heat = THAW[0][1];
  for (let turn = 0; turn < SHELL_TURNS; turn++) {
    heat = thawAt(ICE_DENSE * pull * roof, 0);
    roof = (ICE_CONDUCT * Math.log(heat / physics.heat)) / flow;
  }
  const press = ICE_DENSE * pull * roof;
  if (roof >= thick || press >= THAW[1][0]) {
    return null;
  }
  const most = press + SEA_DENSE * pull * (thick - roof);
  let floor = THAW[1][0];
  while (floor < most && thawAt(floor, 1) < heat) {
    floor *= 1.02;
  }
  const depth = Math.min(thick - roof, (Math.min(floor, most) - press) / (SEA_DENSE * pull));
  return { roof, depth, heat };
}

interface Stone {
  mass: number;
  radius: number;
  mantle: number;
  core: number;
  heart: number;
  joint: number;
  centre: number;
}

interface Cooked {
  mantle: number;
  lid: number;
  lost: number;
  melt: number;
  core: Core | null;
}

function cooked(stone: Stone, cold: number, age: number, moving: boolean, tide: number): Cooked {
  const { radius, heart, mantle, core, joint, centre } = stone;
  const cored = heart > 0;
  const deep = radius - heart;
  const pull = (GRAVITY * stone.mass) / radius ** 2;
  const sunk = cored ? (GRAVITY * core) / heart ** 2 : 0;
  const face = 4 * Math.PI * radius ** 2;
  const seam = 4 * Math.PI * heart ** 2;
  const thick = (heat: number) => ROCK_VISCOUS * Math.exp(ROCK_BARRIER / (GAS_CONSTANT * heat));
  const lift = (denseAt("rock", joint) / denseAt("rock", 0)) ** ROCK_GRIP;
  const deepened = smooth(0, 1, joint / ROCK_DEEP_FROM - 1);
  const dense = cored ? denseAt("iron", joint) : 1;
  const shells = Array.from({ length: SHELLS + 1 }, (_, index) => {
    const share = index / SHELLS;
    const pressure = centre - (centre - joint) * share * share;
    const rise = (denseAt("iron", pressure) / dense) ** IRON_GRIP;
    return {
      share,
      rise,
      thaw: (LIQUIDUS[0] * (1 + pressure / LIQUIDUS[1]) ** LIQUIDUS[2]) / rise,
    };
  });
  for (let index = SHELLS - 1; index >= 0; index--) {
    shells[index].thaw = Math.max(shells[index].thaw, shells[index + 1].thaw);
  }
  const held =
    IRON_HEAT *
    (shells.reduce((sum, { share, rise }) => sum + share * share * rise, 0) /
      shells.reduce((sum, { share }) => sum + share * share, 0));
  const storedAt = (index: number) =>
    held * shells[index].thaw - IRON_FREEZING * shells[index].share ** 3;
  const coreAt = (stored: number) => {
    if (stored >= storedAt(0)) {
      return { top: stored / held, frozen: 0, growing: 0 };
    }
    if (stored <= storedAt(SHELLS)) {
      return { top: (stored + IRON_FREEZING) / held, frozen: 1, growing: 0 };
    }
    const outer = shells.findIndex((_, index) => storedAt(index) <= stored);
    const [inner, wide] = [shells[outer - 1], shells[outer].share - shells[outer - 1].share];
    const cooled = shells[outer].thaw - inner.thaw;
    const spare = (part: number) =>
      held * (inner.thaw + cooled * part) -
      IRON_FREEZING * (inner.share + wide * part) ** 3 -
      stored;
    let [low, high] = [0, 1];
    for (let halving = 0; halving < 30; halving++) {
      const middle = (low + high) / 2;
      if (spare(middle) > 0) {
        low = middle;
      } else {
        high = middle;
      }
    }
    const part = (low + high) / 2;
    const frozen = inner.share + wide * part;
    return {
      top: inner.thaw + cooled * part,
      frozen,
      growing: wide / (3 * IRON_FREEZING * frozen * frozen * wide - held * cooled),
    };
  };
  const steepness = cored ? (IRON_GRIP * sunk * dense) / stiffAt(joint) : 0;
  let rock = ROCK_MOLTEN;
  let stored = held * Math.max(CORE_FIRST * rock * lift, shells[0].thaw);
  let state = coreAt(stored);
  let time = 0;
  let lost = 0;
  let melt = 0;
  let passed = 0;
  let drop = 0;
  for (let step = 0; step < STEPS_MOST && time < age; step++) {
    drop = Math.max(rock - cold, 1e-3);
    const stir = ((ROCK_SWELL * pull) / (ROCK_SPREAD * thick(rock))) ** (1 / 3);
    const still = (ROCK_CONDUCT * drop) / deep;
    const free = Math.max(still, (ROCK_CONDUCT * stir * drop ** (4 / 3)) / ROCK_CRIT ** (1 / 3));
    const lidded = Math.max(
      still,
      LID * ROCK_CONDUCT * stir * ((GAS_CONSTANT * rock * rock) / ROCK_BARRIER) ** (4 / 3),
    );
    lost = (moving ? free : Math.min(free, lidded)) * face;
    const base = rock * lift;
    const gap = state.top - base;
    const foot = thick((state.top + base) / 2) ** (1 - deepened) * ROCK_VISCOUS_DEEP ** deepened;
    const led = (ROCK_CONDUCT * gap) / deep;
    const risen =
      ROCK_CONDUCT_DEEP *
      Math.max(gap, 0) *
      ((ROCK_SWELL * sunk * Math.max(gap, 0)) / (ROCK_SPREAD * foot * ROCK_CRIT)) ** (1 / 3);
    passed = cored ? (gap > 0 ? Math.max(led, risen) : led) * seam : 0;
    const gained = mantle * decayOf(time) + tide + passed;
    const warming = (gained - lost) / (mantle * ROCK_HEAT * 0.5 * (1 + lift));
    const span = Math.min(
      age - time,
      age / STEPS,
      PACE * Math.abs(rock / (warming || 1e-30)),
      cored ? PACE * Math.abs((core * held * state.top) / (passed || 1e-30)) : age,
    );
    const next = rock + warming * span;
    melt = next > ROCK_MOLTEN ? gained - lost : 0;
    rock = Math.min(ROCK_MOLTEN, next);
    time += span;
    if (cored) {
      stored -= (passed * span) / core;
      state = coreAt(stored);
    }
  }
  const flux = cored ? passed / seam : 0;
  const steep = IRON_CONDUCT * steepness * state.top;
  const growth = (heart * state.growing * Math.max(0, passed)) / core;
  const stirring =
    state.frozen >= 1
      ? 0
      : (IRON_SWELL * sunk * (flux - steep)) / (dense * IRON_HEAT) +
        sunk * IRON_LIGHTER * state.frozen ** 3 * growth;
  return {
    mantle: rock,
    lid: lost > 0 ? Math.min(deep, (ROCK_CONDUCT * drop * face) / lost) : deep,
    lost: lost + melt,
    melt,
    core: cored ? { heat: state.top, flux, steep, frozen: state.frozen, stirring } : null,
  };
}

function stiffAt(pressure: number): number {
  const nudge = 1e-3 * pressure;
  return (
    (denseAt("iron", pressure) * 2 * nudge) /
    (denseAt("iron", pressure + nudge) - denseAt("iron", pressure - nudge))
  );
}

export function rockHeatAt(mantle: number, pressure: number): number {
  return mantle * (denseAt("rock", pressure) / denseAt("rock", 0)) ** ROCK_GRIP;
}

export function ironHeatAt(top: number, joint: number, pressure: number): number {
  return top * (denseAt("iron", pressure) / denseAt("iron", joint)) ** IRON_GRIP;
}

export function warmthOf(physics: Physics, host: Physics | null): Warmth | null {
  const inside = starborn(physics) || wrapped(physics) ? null : interiorOf(physics);
  if (inside === null) {
    return null;
  }
  const decay = physics.mass * physics.rock * decayOf(physics.age);
  const tide = tideOn(physics, host, decay);
  const face = 4 * Math.PI * physics.radius ** 2;
  const { layers } = inside;
  const plates = seaCover(physics) > 0;
  const iron = layers.find(({ matter }) => matter === "iron");
  const rock = layers.find(({ matter }) => matter === "rock");
  const at = layers.findIndex(({ matter }) => matter === "ice");
  const stone =
    rock === undefined
      ? null
      : cooked(
          {
            mass: (iron?.mass ?? 0) + rock.mass,
            radius: rock.radius,
            mantle: rock.mass,
            core: iron?.mass ?? 0,
            heart: iron?.radius ?? 0,
            joint: rock.pressure,
            centre: inside.centre,
          },
          at < 0 ? physics.heat : Math.max(physics.heat, UNDER_ICE),
          physics.age,
          plates,
          tide,
        );
  const flow = (stone?.lost ?? decay + tide) / face;
  const sea = at < 0 ? null : seaOf(physics, layers[at], layers[at - 1]?.radius ?? 0, flow);
  return {
    decay,
    tide,
    flow,
    melt: stone?.melt ?? 0,
    plates: plates && stone !== null,
    mantle: stone?.mantle ?? null,
    lid: stone?.lid ?? 0,
    core: stone?.core ?? null,
    sea,
  };
}
