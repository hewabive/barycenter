import {
  type Body,
  createRandom,
  EARTH_MASS,
  flatOf,
  type Gas,
  HOUR,
  moltenOf,
  type Physics,
  ROCK_MELT,
  roughOf,
  type Shown,
  STAR_LEAST,
  seaCover,
  shareOf,
  shownLight,
  wrapped,
} from "@barycenter/sim";
import { Color } from "three";

export type Family = "star" | "fluid" | "solid";

export interface Flame {
  kelvin: number;
  tint: number;
  grain: number;
  chill: number;
  poles: number;
  regions: number;
  girth: number;
  belt: number;
}

export interface Brew {
  side: -1 | 0 | 1;
  band: number;
  seat: number;
  count: number;
  size: number;
  stretch: number;
  tint: number;
  cover: number;
  wake: number;
  crest: number;
}

export interface Hoop {
  tint: number;
  parts: [from: number, to: number, density: number][];
}

export type Ember = [red: number, green: number, blue: number, bright: number];

export interface Season {
  frost: number;
  melt: [night: number, noon: number];
  ember: Ember;
}

export interface Giant {
  ember: Ember;
  shown: Shown;
  vents: number;
  zones: number[];
  belts: number[];
  pole: number;
  wisp: number;
  wispy: number;
  first: number;
  width: number;
  narrowing: number;
  cap: number;
  edge: number;
  veins: number;
  stir: number;
  streak: number;
  puff: number;
  eastward: boolean;
  jets: number;
  haze: number;
  air: number;
  brews: Brew[];
}

export interface Skin {
  palette: number[];
  low: number;
  span: number;
  frost: number;
  lift: number;
  snowy: number;
  patch: number;
  belted: number;
  cracks: number;
  bump: number;
  clouds: number;
  shroud: number;
  fog: number;
  haze: number;
  air: number;
  ember: Ember;
  shown: Shown;
  melt: [night: number, noon: number];
  lump: [depth: number, along: number, up: number, across: number];
}

export const WIEN = 14388;
export const WAVES = [0.61, 0.55, 0.465];
const FLAT_LEAST = 0.008;
const NO_FROST = 2;
const DARK: Ember = [0, 0, 0, 0];
const UNLIT: Shown = { lamps: [], sky: 0, glow: 0 };
const EMBER_HUE = [500, 0.8, 1400];
const ALKALI_BLUE = 0.28;
const LAVA_GAIN = 1.6;
const ALKALI = [1200, 1600];
const MELT_SPAN = [ROCK_MELT - 100, ROCK_MELT + 400];
const NIGHT_SHARE = 0.35;
const LAVA_MOST = 2600;
const LUMP_DEPTH = 0.2;

function smooth(from: number, to: number, value: number): number {
  const share = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return share * share * (3 - 2 * share);
}

function tone(from: number, to: number, share: number): number {
  return new Color(from).lerp(new Color(to), share).getHex();
}

function varied(shade: number, turn: number, vivid: number, bright: number): number {
  const color = new Color(shade);
  const parts = { h: 0, s: 0, l: 0 };
  color.getHSL(parts);
  const hue = (((parts.h + turn) % 1) + 1) % 1;
  return color.setHSL(hue, Math.min(1, parts.s * vivid), Math.min(1, parts.l * bright)).getHex();
}

export function familyOf(physics: Physics): Family {
  return physics.mass >= STAR_LEAST ? "star" : wrapped(physics) ? "fluid" : "solid";
}

export function emberOf(kelvin: number, tinge = 0): [number, number, number] {
  const shone = (wave: number, heat: number) => wave ** -5 / (Math.exp(WIEN / (wave * heat)) - 1);
  const hue = Math.max(EMBER_HUE[0], Math.min(EMBER_HUE[1] * kelvin, EMBER_HUE[2]));
  const red = shone(WAVES[0], hue);
  const green = (shone(WAVES[1], hue) / red) * (1 - 0.5 * tinge);
  const blue = shone(WAVES[2], hue) / red;
  return [1, green, blue + tinge * (ALKALI_BLUE - blue)];
}

function lavaHeat(physics: Physics, heat: number): number {
  if (moltenOf({ ...physics, heat }) <= 0) {
    return 0;
  }
  const even = smooth(4, 6, physics.air > 0 ? Math.log10(physics.air) : 0);
  const noon = heat * (Math.SQRT2 + (1 - Math.SQRT2) * even);
  return Math.max(ROCK_MELT, Math.min(LAVA_MOST, noon));
}

export function shownOf(physics: Physics, seen: number[]): Shown {
  const family = familyOf(physics);
  return shownLight(seen, family === "fluid" ? physics.heat : lavaHeat(physics, physics.heat));
}

export function seasonOf(body: Body, seen: number[], heat: number): Season {
  const { physics } = body;
  if (familyOf(physics) === "fluid") {
    const tinge = 0.8 * (1 - smooth(ALKALI[0], ALKALI[1], heat));
    const glow = shownLight(seen, heat).glow;
    return { frost: NO_FROST, melt: [0, 0], ember: [...emberOf(heat, tinge), glow] };
  }
  const { pressure, airy, wet, icy } = skinShares(physics);
  const damp = Math.max(0, Math.min(1, Math.log10(Math.max(physics.ice, 1e-6) / 1e-6) / 2.5));
  const frost = wet
    ? Math.max(0.2, Math.min(1.3, 0.925 + 0.014 * (heat - 288)))
    : icy >= 0.5 || airy === 0
      ? NO_FROST
      : 1.05 - 0.17 * damp * (1 - smooth(250, 320, heat));
  const lava = lavaHeat(physics, heat);
  if (lava <= 0) {
    return { frost, melt: [0, 0], ember: DARK };
  }
  const even = smooth(4, 6, pressure);
  const noon = heat * (Math.SQRT2 + (1 - Math.SQRT2) * even);
  const night = heat * (NIGHT_SHARE + (1 - NIGHT_SHARE) * even);
  const melted = (warmth: number) => (warmth - MELT_SPAN[0]) / (MELT_SPAN[1] - MELT_SPAN[0]);
  const glow = LAVA_GAIN * shownLight(seen, lava).glow;
  return { frost, melt: [melted(night), melted(noon)], ember: [...emberOf(lava), glow] };
}

export function flatnessOf(physics: Physics): number {
  const flat = flatOf(physics);
  if (familyOf(physics) === "fluid") {
    return flat;
  }
  return flat >= FLAT_LEAST && roughOf(physics) === 0 ? flat : 0;
}

const FLAMES: Flame[] = [
  {
    kelvin: 2600,
    tint: 0xff5a1e,
    grain: 0.02,
    chill: 0.85,
    poles: 0,
    regions: 8,
    girth: 0.055,
    belt: 1.2,
  },
  {
    kelvin: 3400,
    tint: 0xff6f2c,
    grain: 0.03,
    chill: 0.8,
    poles: 0,
    regions: 8,
    girth: 0.05,
    belt: 1.1,
  },
  {
    kelvin: 4700,
    tint: 0xff9545,
    grain: 0.055,
    chill: 0.62,
    poles: 0,
    regions: 8,
    girth: 0.036,
    belt: 0.7,
  },
  {
    kelvin: 5800,
    tint: 0xffb663,
    grain: 0.07,
    chill: 0.58,
    poles: 0,
    regions: 7,
    girth: 0.03,
    belt: 0.55,
  },
  { kelvin: 8200, tint: 0xccdeff, grain: 0, chill: 1, poles: 0.2, regions: 0, girth: 0, belt: 0 },
  { kelvin: 11000, tint: 0xb4c8ff, grain: 0, chill: 1, poles: 0.25, regions: 0, girth: 0, belt: 0 },
];

export function flameOf(star: Body): Flame {
  const kelvin = Math.max(
    FLAMES[0].kelvin,
    Math.min(FLAMES[FLAMES.length - 1].kelvin, star.physics.heat),
  );
  const next = Math.max(
    1,
    FLAMES.findIndex((flame) => flame.kelvin >= kelvin),
  );
  const cool = FLAMES[next - 1];
  const hot = FLAMES[next];
  const share = (kelvin - cool.kelvin) / (hot.kelvin - cool.kelvin);
  const mix = (from: number, to: number) => from + (to - from) * share;
  return {
    kelvin,
    tint: tone(cool.tint, hot.tint, share),
    grain: mix(cool.grain, hot.grain),
    chill: mix(cool.chill, hot.chill),
    poles: mix(cool.poles, hot.poles),
    regions: Math.min(
      8,
      Math.round(mix(cool.regions, hot.regions) * (0.6 + 0.6 * star.physics.vigor)),
    ),
    girth: mix(cool.girth, hot.girth),
    belt: mix(cool.belt, hot.belt),
  };
}

function brew(given: Partial<Brew> & Pick<Brew, "band" | "size" | "tint">): Brew {
  return { side: -1, seat: 0, count: 1, stretch: 1.3, cover: 0.9, wake: 0, crest: 0, ...given };
}

const JOVIAN: Giant = {
  ember: DARK,
  shown: UNLIT,
  vents: 0.4,
  zones: [0xefe6d2, 0xe3d2b0, 0xd9c8a8, 0xe8dcc0],
  belts: [0x9a6a4a, 0x7a4b35, 0xa87a52, 0x86705e],
  pole: 0x7f7669,
  wisp: 0x6b7480,
  wispy: 0.75,
  first: 0.13,
  width: 0.15,
  narrowing: 0.82,
  cap: 0.95,
  edge: 0.008,
  veins: 0.13,
  stir: 0.8,
  streak: 0.5,
  puff: 0.35,
  eastward: true,
  jets: 1,
  haze: 0xbfae95,
  air: 0.07,
  brews: [
    brew({ band: 2, seat: -0.75, size: 0.6, stretch: 1.6, tint: 0xb5694e, cover: 0.95, wake: 1 }),
    brew({ band: 4, count: 4, size: 0.3, stretch: 1.2, tint: 0xf3ead8 }),
    brew({ band: 3, seat: 0.2, size: 0.34, stretch: 1.4, tint: 0xe2b99a }),
    brew({
      side: 1,
      band: 1,
      seat: 0.45,
      count: 2,
      size: 0.14,
      stretch: 2.6,
      tint: 0x5a3524,
      cover: 0.85,
    }),
  ],
};

const SATURNIAN: Giant = {
  ember: DARK,
  shown: UNLIT,
  vents: 0.4,
  zones: [0xf5e0a8, 0xf0d590, 0xf7e7ba],
  belts: [0xdcb872, 0xcfa35c, 0xe3c483, 0xc9a868],
  pole: 0x8f9c9e,
  wisp: 0x6b7480,
  wispy: 0,
  first: 0.16,
  width: 0.12,
  narrowing: 0.92,
  cap: 1.15,
  edge: 0.02,
  veins: 0.09,
  stir: 0.3,
  streak: 0.2,
  puff: 0.1,
  eastward: true,
  jets: 0.8,
  haze: 0xd9c79a,
  air: 0.1,
  brews: [
    brew({ side: 1, band: 3, size: 0.3, stretch: 1.5, tint: 0xf4ecd6, cover: 0.7, wake: 0.6 }),
    brew({ band: 4, count: 2, size: 0.25, tint: 0xefe2bd, cover: 0.6 }),
  ],
};

const NEPTUNIAN: Giant = {
  ember: DARK,
  shown: UNLIT,
  vents: 0.4,
  zones: [0x3f6fd0, 0x4a7bd8, 0x3a66c4],
  belts: [0x2f58b8, 0x2a4fa8, 0x3560bc],
  pole: 0x2c4f9c,
  wisp: 0x6b7480,
  wispy: 0,
  first: 0.3,
  width: 0.24,
  narrowing: 0.95,
  cap: 1.2,
  edge: 0.05,
  veins: 0.05,
  stir: 0.2,
  streak: 0.2,
  puff: 0.12,
  eastward: false,
  jets: 0,
  haze: 0x5a8cf0,
  air: 0.25,
  brews: [
    brew({ band: 1, seat: 0.2, size: 0.42, stretch: 1.8, tint: 0x1c3476, cover: 0.85, crest: 1 }),
    brew({ side: 1, band: 2, size: 0.16, stretch: 1.5, tint: 0x1f3a80, cover: 0.8, crest: 0.8 }),
    brew({ side: 0, band: 1, seat: -0.4, count: 3, size: 0.045, stretch: 6, tint: 0xe8f1ff }),
  ],
};

const URANIAN: Giant = {
  ember: DARK,
  shown: UNLIT,
  vents: 0.4,
  zones: [0xa0dbe8, 0xaae2ea, 0x9cd6e6],
  belts: [0x93cfe0, 0x98d3e2, 0x8fcbdc],
  pole: 0xc2eef0,
  wisp: 0x6b7480,
  wispy: 0,
  first: 0.35,
  width: 0.25,
  narrowing: 0.95,
  cap: 0.85,
  edge: 0.08,
  veins: 0.02,
  stir: 0.15,
  streak: 0.08,
  puff: 0.1,
  eastward: false,
  jets: 0,
  haze: 0xb9ecec,
  air: 0.25,
  brews: [brew({ side: 1, band: 2, count: 2, size: 0.05, stretch: 4, tint: 0xf2ffff, cover: 0.6 })],
};

const WATERY: Giant = {
  ember: DARK,
  shown: UNLIT,
  vents: 0.4,
  zones: [0xf2f4f6, 0xe6ecf2, 0xf7f3ea],
  belts: [0xb9c4d2, 0xa6b6c8, 0xcfc8ba, 0x9fb0c4],
  pole: 0x9fb2c8,
  wisp: 0x6b7480,
  wispy: 0,
  first: 0.15,
  width: 0.16,
  narrowing: 0.88,
  cap: 1,
  edge: 0.015,
  veins: 0.08,
  stir: 0.6,
  streak: 0.35,
  puff: 0.5,
  eastward: true,
  jets: 0.9,
  haze: 0xcfe0ff,
  air: 0.14,
  brews: [
    brew({ band: 3, count: 3, size: 0.3, tint: 0xffffff, cover: 0.8 }),
    brew({ side: 1, band: 2, size: 0.4, stretch: 1.5, tint: 0x8fa3ba, cover: 0.8, wake: 0.7 }),
  ],
};

const CLEAR: Giant = {
  ember: DARK,
  shown: UNLIT,
  vents: 0.4,
  zones: [0x3d6fb8, 0x4478c0, 0x3a68ae],
  belts: [0x335fa6, 0x2f589c, 0x3964aa],
  pole: 0x2b4f90,
  wisp: 0x6b7480,
  wispy: 0,
  first: 0.3,
  width: 0.26,
  narrowing: 0.95,
  cap: 1.2,
  edge: 0.07,
  veins: 0.03,
  stir: 0.12,
  streak: 0.1,
  puff: 0.03,
  eastward: true,
  jets: 0,
  haze: 0x6f9cf0,
  air: 0.3,
  brews: [],
};

const SCORCHED: Giant = {
  ember: DARK,
  shown: UNLIT,
  vents: 0.4,
  zones: [0x2a2f3c, 0x343846, 0x262b38],
  belts: [0x1c1f2a, 0x221f24, 0x1a1d28],
  pole: 0x15171f,
  wisp: 0x6b7480,
  wispy: 0,
  first: 0.25,
  width: 0.22,
  narrowing: 0.92,
  cap: 1.2,
  edge: 0.04,
  veins: 0.06,
  stir: 0.5,
  streak: 0.4,
  puff: 0.1,
  eastward: true,
  jets: 0.6,
  haze: 0x4a5a80,
  air: 0.15,
  brews: [],
};

const DUSTY: Giant = {
  ember: DARK,
  shown: UNLIT,
  vents: 0.4,
  zones: [0x5a4038, 0x4c3832, 0x64483a],
  belts: [0x2c1c1a, 0x341f1a, 0x261a1c, 0x3a2620],
  pole: 0x241a1a,
  wisp: 0x6b7480,
  wispy: 0,
  first: 0.14,
  width: 0.13,
  narrowing: 0.9,
  cap: 1.15,
  edge: 0.03,
  veins: 0.1,
  stir: 0.55,
  streak: 0.5,
  puff: 0.5,
  eastward: true,
  jets: 0.8,
  haze: 0x6a4038,
  air: 0.1,
  brews: [
    brew({ band: 2, count: 3, size: 0.4, stretch: 1.8, tint: 0x1a1214, cover: 0.8 }),
    brew({ side: 1, band: 3, count: 2, size: 0.35, stretch: 1.5, tint: 0x6a4a3a, cover: 0.7 }),
  ],
};

const VEIL = 0xc9d6e2;

function veiled(giant: Giant, share: number): Giant {
  if (share <= 0) {
    return giant;
  }
  const shades = [...giant.zones, ...giant.belts].map((shade) => new Color(shade));
  const mean = shades
    .reduce((sum, shade) => sum.add(shade), new Color(0))
    .multiplyScalar(1 / shades.length)
    .lerp(new Color(VEIL), 0.45);
  const calm = (shade: number) => new Color(shade).lerp(mean, 0.85 * share).getHex();
  return {
    ...giant,
    zones: giant.zones.map(calm),
    belts: giant.belts.map(calm),
    pole: calm(giant.pole),
    wispy: giant.wispy * (1 - share),
    edge: giant.edge * (1 + 3 * share),
    veins: giant.veins * (1 - 0.7 * share),
    stir: giant.stir * (1 - 0.6 * share),
    streak: giant.streak * (1 - 0.6 * share),
    puff: giant.puff * (1 - 0.5 * share),
    haze: tone(giant.haze, VEIL, 0.5 * share),
    air: giant.air + 0.15 * share,
    brews: giant.brews.map((given) => ({ ...given, cover: given.cover * (1 - share) })),
  };
}

function blended(from: Giant, to: Giant, share: number): Giant {
  if (share <= 0) {
    return from;
  }
  if (share >= 1) {
    return to;
  }
  const mix = (left: number, right: number) => left + (right - left) * share;
  const tones = (left: number[], right: number[]) =>
    Array.from({ length: Math.max(left.length, right.length) }, (_, index) =>
      tone(left[index % left.length], right[index % right.length], share),
    );
  const lead = share < 0.5 ? from : to;
  const fade = Math.abs(1 - 2 * share);
  return {
    ember: lead.ember,
    shown: UNLIT,
    vents: mix(from.vents, to.vents),
    zones: tones(from.zones, to.zones),
    belts: tones(from.belts, to.belts),
    pole: tone(from.pole, to.pole, share),
    wisp: lead.wisp,
    wispy: mix(from.wispy, to.wispy),
    first: mix(from.first, to.first),
    width: mix(from.width, to.width),
    narrowing: mix(from.narrowing, to.narrowing),
    cap: mix(from.cap, to.cap),
    edge: mix(from.edge, to.edge),
    veins: mix(from.veins, to.veins),
    stir: mix(from.stir, to.stir),
    streak: mix(from.streak, to.streak),
    puff: mix(from.puff, to.puff),
    eastward: lead.eastward,
    jets: mix(from.jets, to.jets),
    haze: tone(from.haze, to.haze, share),
    air: mix(from.air, to.air),
    brews: lead.brews.map((given) => ({
      ...given,
      cover: given.cover * fade,
      size: given.size * (0.5 + 0.5 * fade),
    })),
  };
}

function giantShares(physics: Physics) {
  const weight = Math.log(physics.mass / EARTH_MASS);
  return {
    heavy: smooth(Math.log(110), Math.log(280), weight),
    light: Math.max(
      1 - smooth(Math.log(25), Math.log(80), weight),
      0.8 * (1 - smooth(45, 70, physics.heat)),
    ),
    lively: physics.vigor,
    mild: smooth(140, 200, physics.heat),
    warm: smooth(330, 450, physics.heat),
    hot: smooth(800, 1100, physics.heat),
    dusty: smooth(1250, 1500, physics.heat),
    bare: smooth(2100, 2500, physics.heat),
    thin: 1 - smooth(Math.log(0.004), Math.log(0.08), Math.log(Math.max(physics.gas, 1e-9))),
  };
}

export function giantOf(body: Body, seen: number[]): Giant {
  const { physics } = body;
  const shown = shownOf(physics, seen);
  const shares = giantShares(physics);
  const heavy = blended(SATURNIAN, JOVIAN, shares.heavy);
  const cold = blended(heavy, blended(URANIAN, NEPTUNIAN, shares.lively), shares.light);
  const mild = blended(cold, WATERY, shares.mild);
  const warm = blended(mild, CLEAR, shares.warm);
  const hot = blended(warm, SCORCHED, shares.hot);
  const giant = veiled(blended(hot, DUSTY, shares.dusty), shares.thin);
  const random = createRandom(body.seed + 83);
  const turn = 0.03 * (2 * random.next() - 1);
  const vivid = 0.8 + 0.4 * random.next();
  const shift = (shade: number) => varied(shade, turn, vivid, 1);
  const pace = Math.max(0.75, Math.min(1.35, Math.sqrt(physics.day / (12 * HOUR))));
  return {
    ...giant,
    ember: seasonOf(body, seen, physics.heat).ember,
    shown,
    vents: 0.35 + 0.5 * shares.bare,
    zones: giant.zones.map(shift),
    belts: giant.belts.map(shift),
    pole: shift(giant.pole),
    width: giant.width * pace,
    stir: giant.stir * (0.6 + 0.8 * physics.vigor) * (1 - 0.6 * shares.bare),
    streak: giant.streak * (0.7 + 0.6 * physics.vigor),
  };
}

const DUST = 0x6b6258;
const FROST = 0xe9e1d0;

export function hoopOf(body: Body): Hoop | null {
  const { disks, radius } = body.physics;
  if (familyOf(body.physics) === "star" || disks.length === 0) {
    return null;
  }
  const ring = disks[0];
  const random = createRandom(body.seed + 97);
  const from = ring.inner / radius;
  const to = ring.outer / radius;
  const span = to - from;
  const parts: Hoop["parts"] = [];
  if (ring.depth >= 0.5) {
    const count = 3 + Math.floor(3 * random.next());
    const shares = Array.from({ length: count }, () => 0.4 + random.next());
    const whole = shares.reduce((sum, share) => sum + share, 0);
    const chief = 1 + Math.floor((count - 1) * random.next());
    let at = from;
    shares.forEach((share, index) => {
      const width = (span * share) / whole;
      const gap = index === count - 1 ? 0 : width * 0.12 * random.next() ** 2;
      const dense =
        index === chief ? 1 : index === 0 ? 0.15 + 0.2 * random.next() : 0.3 + 0.5 * random.next();
      parts.push([at, at + width - gap, ring.depth * dense]);
      at += width;
    });
  } else {
    const count = 3 + Math.floor(4 * random.next());
    for (let index = 0; index < count; index++) {
      const at = from + (span * (index + 0.2 + 0.6 * random.next())) / count;
      const width = span * (0.02 + 0.03 * random.next());
      parts.push([
        at,
        Math.min(to, at + width),
        Math.min(1, 2 * ring.depth * (0.6 + 0.4 * random.next())),
      ]);
    }
  }
  return { tint: tone(DUST, FROST, ring.ice), parts };
}

const BARREN: Skin = {
  palette: [0, 0, 0x3c3a39, 0x565351, 0x77736e, 0xa9a49c, 0xe6e2da, 0x4a4846, 0],
  low: -0.5,
  span: 1,
  frost: NO_FROST,
  lift: 0,
  snowy: 0,
  patch: 0.45,
  belted: 0,
  cracks: 0,
  bump: 0.1,
  clouds: 0,
  shroud: 0,
  fog: 0xffffff,
  haze: 0x8a8a8a,
  air: 0,
  ember: DARK,
  shown: UNLIT,
  melt: [0, 0],
  lump: [0, 1, 1, 1],
};

const CHARRED: Skin = {
  ...BARREN,
  palette: [0, 0, 0x1c1a19, 0x2b2625, 0x3a322e, 0x54453c, 0xe6e2da, 0x141211, 0],
};

const DESERT: Skin = {
  palette: [0, 0, 0x4a2f24, 0x9a5230, 0xc48a55, 0xdcb98a, 0xe6e2da, 0x6a3f2c, 0],
  low: -0.417,
  span: 0.83,
  frost: 0.905,
  lift: 0,
  snowy: 0,
  patch: 0.3,
  belted: 0,
  cracks: 0,
  bump: 0.08,
  clouds: 0,
  shroud: 0,
  fog: 0xffffff,
  haze: 0xd89a70,
  air: 0.4,
  ember: DARK,
  shown: UNLIT,
  melt: [0, 0],
  lump: [0, 1, 1, 1],
};

const SEA: Skin = {
  palette: [0x081a2c, 0x173d58, 0x6b5a48, 0x8a7458, 0x9a8468, 0x7d6a5a, 0xdfe3e6, 0xb09a70, 0],
  low: 0,
  span: 0.5,
  frost: 0.925,
  lift: 0.06,
  snowy: 1,
  patch: 0.5,
  belted: 1,
  cracks: 0,
  bump: 0.07,
  clouds: 0.9,
  shroud: 0,
  fog: 0xffffff,
  haze: 0x6fa8ff,
  air: 1,
  ember: DARK,
  shown: UNLIT,
  melt: [0, 0],
  lump: [0, 1, 1, 1],
};

const LIVING: Skin = {
  ...SEA,
  palette: [0x081a2c, 0x173d58, 0x4f6b45, 0x72804f, 0x97855f, 0x7d6a5a, 0xdfe3e6, 0xa59a66, 0],
  patch: 0.75,
};

const ICE: Skin = {
  palette: [0, 0, 0xa4bdcd, 0xccdce5, 0xe8f1f5, 0xe8f1f5, 0xf4f8fa, 0x8a5a44, 0x3f6a8c],
  low: -0.5,
  span: 1,
  frost: NO_FROST,
  lift: 0,
  snowy: 0,
  patch: 0,
  belted: 0,
  cracks: 0.45,
  bump: 0.035,
  clouds: 0,
  shroud: 0,
  fog: 0xffffff,
  haze: 0xa8d8ff,
  air: 0.6,
  ember: DARK,
  shown: UNLIT,
  melt: [0, 0],
  lump: [0, 1, 1, 1],
};

const FOGS: [gas: Gas, shade: number, weight: number][] = [
  ["methane", 0xd9a55a, 8],
  ["carbon dioxide", 0xe8d9a8, 1],
  ["water", 0xf2f4f6, 1],
  ["hydrogen", 0xc9d6e2, 1],
  ["nitrogen", 0xdfe6ee, 0.3],
];

function fogOf(physics: Physics): number {
  const shade = new Color(0);
  let whole = 0;
  for (const [gas, tint, weight] of FOGS) {
    const part = weight * shareOf(physics, gas);
    const color = new Color(tint);
    shade.r += part * color.r;
    shade.g += part * color.g;
    shade.b += part * color.b;
    whole += part;
  }
  return whole > 0 ? shade.multiplyScalar(1 / whole).getHex() : 0xffffff;
}

function merged(from: Skin, to: Skin, share: number): Skin {
  if (share <= 0) {
    return from;
  }
  if (share >= 1) {
    return to;
  }
  const mix = (left: number, right: number) => left + (right - left) * share;
  return {
    palette: from.palette.map((shade, index) => tone(shade, to.palette[index], share)),
    low: mix(from.low, to.low),
    span: mix(from.span, to.span),
    frost: mix(from.frost, to.frost),
    lift: mix(from.lift, to.lift),
    snowy: mix(from.snowy, to.snowy),
    patch: mix(from.patch, to.patch),
    belted: mix(from.belted, to.belted),
    cracks: mix(from.cracks, to.cracks),
    bump: mix(from.bump, to.bump),
    clouds: mix(from.clouds, to.clouds),
    shroud: mix(from.shroud, to.shroud),
    fog: tone(from.fog, to.fog, share),
    haze: tone(from.haze, to.haze, share),
    air: mix(from.air, to.air),
    ember: from.ember,
    shown: from.shown,
    melt: from.melt,
    lump: from.lump,
  };
}

function ground(skin: Skin, change: (shade: number) => number): Skin {
  return {
    ...skin,
    palette: skin.palette.map((shade, index) =>
      (index >= 2 && index <= 5) || index === 7 ? change(shade) : shade,
    ),
  };
}

function skinShares(physics: Physics) {
  const pressure = physics.air > 0 ? Math.log10(physics.air) : 0;
  return {
    pressure,
    airy: smooth(2.5, 4.5, pressure),
    hot: smooth(700, 1200, physics.heat),
    wet: seaCover(physics) > 0,
    icy: smooth(0.03, 0.25, physics.ice) * (1 - smooth(265, 275, physics.heat)),
    thick: Math.max(
      smooth(5.7, 6.7, pressure),
      smooth(0.02, 0.1, shareOf(physics, "methane")) * smooth(4, 5, pressure),
    ),
  };
}

export function recipeOf(body: Body): [name: string, share: number][] {
  const { physics } = body;
  const family = familyOf(physics);
  if (family === "star") {
    return [];
  }
  if (family === "fluid") {
    const { heavy, light, lively, mild, warm, hot, dusty, thin } = giantShares(physics);
    const cold = (1 - mild) * (1 - warm) * (1 - hot);
    return [
      ["banded", cold * (1 - light) * heavy],
      ["golden", cold * (1 - light) * (1 - heavy)],
      ["deep blue", cold * light * lively],
      ["pale cyan", cold * light * (1 - lively)],
      ["white", mild * (1 - warm) * (1 - hot)],
      ["azure", warm * (1 - hot)],
      ["dark", hot * (1 - dusty)],
      ["dusty", dusty],
      ["behind a veil", thin],
    ];
  }
  const { airy, hot, wet, icy, thick } = skinShares(physics);
  const dry = wet ? 0 : 1 - icy;
  const seas = wet ? 1 - icy : 0;
  return [
    ["bare rock", dry * (1 - airy) * (1 - hot)],
    ["desert", dry * airy * (1 - hot)],
    ["charred rock", dry * hot],
    ["sea", seas * (1 - physics.life)],
    ["living", seas * physics.life],
    ["ice", icy],
    ["under fog", thick],
    ["lava", moltenOf(physics)],
    ["lumpy", roughOf(physics)],
  ];
}

export function skinOf(body: Body, seen: number[]): Skin {
  const { physics } = body;
  const shown = shownOf(physics, seen);
  const season = seasonOf(body, seen, physics.heat);
  const random = createRandom(body.seed + 61);
  const turn = 0.04 * (2 * random.next() - 1);
  const vivid = random.next();
  const bright = 0.8 + 0.4 * random.next();
  const soot = random.next();
  const { pressure, airy, hot, wet, icy, thick } = skinShares(physics);

  const rock = ground(BARREN, (shade) => varied(shade, turn, 0.5 + 3 * vivid, bright));
  const sand = ground(DESERT, (shade) => varied(shade, turn, 0.8 + 0.4 * vivid, bright));
  const dry = merged(merged(rock, sand, airy), CHARRED, hot);
  const temperate = wet ? merged(SEA, LIVING, physics.life) : dry;
  const dirty = ground(ICE, (shade) => varied(shade, turn, 1, 1 - 0.45 * soot * soot));
  const tholin = { ...dirty, patch: 0.55 * (1 - smooth(55, 90, physics.heat)) };
  const skin = merged(temperate, tholin, icy);

  const rough = roughOf(physics) * (physics.disks.length > 0 ? 0.4 : 1);
  const across = 1 - 0.35 * rough * random.next();
  const up = across * (1 - 0.3 * rough * random.next());
  return {
    ...skin,
    frost: season.frost,
    shroud: thick,
    fog: thick > 0 ? fogOf(physics) : skin.fog,
    haze: thick > 0 ? tone(skin.haze, fogOf(physics), thick) : skin.haze,
    air: wet ? 1 : Math.max(0, Math.min(1.1, 0.35 * (pressure - 2) * Math.sign(physics.air))),
    ember: season.ember,
    shown,
    melt: season.melt,
    lump: [LUMP_DEPTH * rough, 1, up, across],
  };
}
