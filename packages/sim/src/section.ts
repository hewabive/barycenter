import { ironHeatAt, rockHeatAt, type Warmth, warmthOf } from "./heat.ts";
import { type Form, type Interior, interiorOf, type Matter, wrapped } from "./interior.ts";
import {
  DENSE_STAR,
  densityOf,
  emberRadius,
  GRAVITY,
  LIGHT_SPEED,
  moltenOf,
  STAR_LEAST,
  SUN_MASS,
  seaCover,
  starborn,
} from "./physics.ts";
import { type Within, withinOf } from "./stars.ts";
import type { Physics } from "./types.ts";

export type Stuff =
  | Matter
  | "sea"
  | "water"
  | "hydrogen"
  | "helium"
  | "carbon"
  | "neon"
  | "crust"
  | "neutrons";

export interface Zone {
  stuff: Stuff;
  form: Form | null;
  inner: number;
  outer: number;
  solid: boolean;
  stirred: boolean;
  pressure: number | null;
  heat: number | null;
  top: number | null;
}

export type Fuel = "hydrogen" | "helium";

export interface Fire {
  fuel: Fuel;
  inner: number;
  outer: number;
}

export interface Section {
  radius: number;
  zones: Zone[];
  fires: Fire[];
}

interface Polytrope {
  index: number;
  radii: Float64Array;
  heats: Float64Array;
  masses: Float64Array;
}

const UNDER_ICE = 270;
const MOLTEN = 0.5;
const POLY_MOST = 4.5;
const POLY_STEP = 0.004;
const POLY_HALVINGS = 30;
const BURNED = 0.99;
const GAMOW = 42.47;
const FUELS = [
  [1, 1, 0.5],
  [1, 7, 14 / 15],
];
const SUN_CENTRE = 16.0e6;
const SUN_CNO = 0.01;
const HELIUM_FLAME = 0.5;
const SHELL_WIDE = 1.3;
const HELIUM_SHELL = [0.7, 0.9];
const DWARF_HELIUM = 1e-2;
const DWARF_HYDROGEN = [0.493, 3.5, 1.05, 5.84];
const DWARF_NEON = 1.05;
const CRUST = [0.93e3, 1.4, 11.5e3];

const leanest = (values: Float64Array, wanted: number): number => {
  let [low, high] = [0, values.length - 1];
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (values[middle] < wanted) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return low;
};

const between = (values: Float64Array, places: Float64Array, wanted: number): number => {
  const at = leanest(values, wanted);
  const span = values[at + 1] - values[at];
  const share = span > 0 ? Math.max(0, Math.min(1, (wanted - values[at]) / span)) : 0;
  return places[at] + (places[at + 1] - places[at]) * share;
};

function laneEmden(index: number): Polytrope & { packed: number } {
  const radii = [0];
  const heats = [1];
  const masses = [0];
  let place = 1e-4;
  let heat = 1 - (place * place) / 6;
  let slope = -place / 3;
  const rise = (at: number, value: number, steep: number) => [
    steep,
    -(Math.max(value, 0) ** index) - (2 * steep) / at,
  ];
  while (heat > 0) {
    const step = POLY_STEP * (1 + place);
    const [a1, b1] = rise(place, heat, slope);
    const [a2, b2] = rise(place + step / 2, heat + (step / 2) * a1, slope + (step / 2) * b1);
    const [a3, b3] = rise(place + step / 2, heat + (step / 2) * a2, slope + (step / 2) * b2);
    const [a4, b4] = rise(place + step, heat + step * a3, slope + step * b3);
    const next = heat + (step / 6) * (a1 + 2 * a2 + 2 * a3 + a4);
    const steeper = slope + (step / 6) * (b1 + 2 * b2 + 2 * b3 + b4);
    if (next <= 0) {
      const share = heat / (heat - next);
      place += share * step;
      slope += share * (steeper - slope);
      heat = 0;
    } else {
      place += step;
      heat = next;
      slope = steeper;
    }
    radii.push(place);
    heats.push(heat);
    masses.push(-place * place * slope);
  }
  const edge = place;
  const whole = masses[masses.length - 1];
  return {
    index,
    radii: Float64Array.from(radii, (value) => value / edge),
    heats: Float64Array.from(heats),
    masses: Float64Array.from(masses, (value) => value / whole),
    packed: edge ** 3 / (3 * whole),
  };
}

const fitted = new Map<number, Polytrope>();

function polytropeOf(packed: number): Polytrope {
  const key = Math.round(Math.log(Math.max(packed, 1)) * 1000);
  const known = fitted.get(key);
  if (known) {
    return known;
  }
  let [low, high] = [0, POLY_MOST];
  let found = laneEmden(high);
  if (found.packed > packed) {
    for (let halving = 0; halving < POLY_HALVINGS && high - low > 1e-4; halving++) {
      const middle = (low + high) / 2;
      const tried = laneEmden(middle);
      if (tried.packed > packed) {
        high = middle;
        found = tried;
      } else {
        low = middle;
      }
    }
  }
  fitted.set(key, found);
  return found;
}

const reachOf = (poly: Polytrope, share: number): number =>
  share <= 0 ? 0 : share >= 1 ? 1 : between(poly.masses, poly.radii, share);

const heatOf = (poly: Polytrope, reach: number): number =>
  between(poly.radii, poly.heats, Math.max(0, Math.min(1, reach)));

const steepness = (centre: number): number[] =>
  FUELS.map(
    ([one, two, reduced]) =>
      (GAMOW * Math.cbrt(one * one * two * two * reduced) * (centre / 1e6) ** (-1 / 3) - 2) / 3,
  );

const [SUN_PP, SUN_CYCLE] = steepness(SUN_CENTRE);
const CNO_EVEN = SUN_CENTRE * ((1 - SUN_CNO) / SUN_CNO) ** (1 / (SUN_CYCLE - SUN_PP));

function burnedWithin(poly: Polytrope, centre: number): number {
  const [pp, cno] = steepness(centre);
  const share = 1 / (1 + (CNO_EVEN / centre) ** (cno - pp));
  const steep = pp + (cno - pp) * share;
  const power = 2 * poly.index + steep;
  const sums = new Float64Array(poly.radii.length);
  for (let at = 1; at < poly.radii.length; at++) {
    const [inner, outer] = [poly.radii[at - 1], poly.radii[at]];
    const made = (reach: number, heat: number) => heat ** power * reach * reach;
    sums[at] =
      sums[at - 1] +
      ((made(inner, poly.heats[at - 1]) + made(outer, poly.heats[at])) / 2) * (outer - inner);
  }
  const whole = sums[sums.length - 1];
  return whole > 0 ? between(sums, poly.radii, BURNED * whole) : 0;
}

const zone = (stuff: Stuff, inner: number, outer: number, rest: Partial<Zone> = {}): Zone => ({
  stuff,
  form: null,
  inner,
  outer,
  solid: false,
  stirred: false,
  pressure: null,
  heat: null,
  top: null,
  ...rest,
});

function pressedAt(inner: number, outer: number, foot: number, top: number, at: number): number {
  const span = outer * outer - inner * inner;
  return span > 0 ? foot - ((foot - top) * (at * at - inner * inner)) / span : foot;
}

function split(zones: Zone[], at: number, change: (zone: Zone) => Partial<Zone>): Zone[] {
  return zones.flatMap((each, index) => {
    const top = zones[index + 1]?.pressure ?? 0;
    if (at <= each.inner || at >= each.outer) {
      return [each];
    }
    const pressure =
      each.pressure === null ? null : pressedAt(each.inner, each.outer, each.pressure, top, at);
    const lower = { ...each, outer: at };
    const upper = { ...each, inner: at, pressure };
    return [lower, { ...upper, ...change(upper) }];
  });
}

function joined(zones: Zone[]): Zone[] {
  return zones.reduce<Zone[]>((kept, next) => {
    const last = kept[kept.length - 1];
    if (next.outer <= next.inner) {
      return kept;
    }
    if (
      last !== undefined &&
      last.stuff === next.stuff &&
      last.form === next.form &&
      last.solid === next.solid &&
      last.stirred === next.stirred
    ) {
      kept[kept.length - 1] = { ...last, outer: next.outer, top: next.top };
    } else {
      kept.push(next);
    }
    return kept;
  }, []);
}

function solidSection(physics: Physics, inside: Interior, warmth: Warmth | null): Section {
  let zones = inside.strata.map((stratum, index) =>
    zone(stratum.matter, inside.strata[index - 1]?.radius ?? 0, stratum.radius, {
      form: stratum.form,
      solid: true,
      pressure: index === 0 ? inside.centre : stratum.pressure,
    }),
  );
  const heart = inside.layers.find(({ matter }) => matter === "iron")?.radius ?? 0;
  const rock = inside.layers.find(({ matter }) => matter === "rock");
  const iced = inside.layers.some(({ matter }) => matter === "ice");
  const core = warmth?.core ?? null;
  if (heart > 0) {
    const frozen = heart * Math.min(1, core?.frozen ?? 0);
    const stirred = (core?.stirring ?? 0) > 0;
    zones = split(zones, frozen, () => ({})).map((each) =>
      each.stuff !== "iron"
        ? each
        : each.outer <= frozen
          ? { ...each, solid: true, stirred: false }
          : { ...each, solid: false, stirred },
    );
  }
  if (rock !== undefined && warmth?.mantle != null) {
    const floor = rock.radius - warmth.lid;
    const stirring = floor > heart;
    zones = zones.map((each) => (each.stuff === "rock" ? { ...each, stirred: stirring } : each));
    if (stirring) {
      zones = split(zones, floor, (each) => ({ stirred: each.stuff !== "rock" && each.stirred }));
    }
    if (moltenOf(physics) >= MOLTEN) {
      zones = zones.map((each) =>
        each.stuff === "rock" && each.inner >= floor - 1e-6 * rock.radius
          ? { ...each, solid: false, stirred: true }
          : each,
      );
    }
  }
  const sea = warmth?.sea ?? null;
  if (sea !== null && iced) {
    const roof = physics.radius - sea.roof;
    const base = roof - sea.depth;
    zones = split(
      split(zones, base, () => ({})),
      roof,
      () => ({}),
    );
    zones = zones.map((each) =>
      each.stuff === "ice" && each.inner >= base && each.outer <= roof
        ? { ...each, stuff: "sea", form: null, solid: false, stirred: true }
        : each,
    );
  }
  const pressureTop = (index: number) => zones[index + 1]?.pressure ?? 0;
  const mantle = warmth?.mantle ?? null;
  const cold = iced ? Math.max(physics.heat, UNDER_ICE) : physics.heat;
  const rockFloor = rock?.radius ?? 0;
  const lidFloor = warmth === null ? rockFloor : rockFloor - warmth.lid;
  zones = zones.map((each, index) => {
    const foot = each.pressure ?? 0;
    const above = pressureTop(index);
    if (each.stuff === "iron" && core !== null) {
      const seam = rock?.pressure ?? above;
      return {
        ...each,
        heat: ironHeatAt(core.heat, seam, foot),
        top: ironHeatAt(core.heat, seam, above),
      };
    }
    if (each.stuff === "rock" && mantle !== null) {
      const lidded = each.inner >= lidFloor - 1e-6 * rockFloor;
      const span = Math.max(rockFloor - lidFloor, 1e-9);
      const lidHeat = (at: number) => cold + ((mantle - cold) * (rockFloor - at)) / span;
      return lidded
        ? { ...each, heat: lidHeat(each.inner), top: lidHeat(each.outer) }
        : { ...each, heat: rockHeatAt(mantle, foot), top: rockHeatAt(mantle, above) };
    }
    if (each.stuff === "sea" && sea !== null) {
      return { ...each, heat: sea.heat, top: sea.heat };
    }
    return each;
  });
  const outermost = zones[zones.length - 1];
  if (outermost !== undefined && outermost.top === null) {
    zones[zones.length - 1] = { ...outermost, top: physics.heat };
  }
  const surface = zones[zones.length - 1];
  if (surface?.stuff === "ice" && seaCover(physics) > 0) {
    zones[zones.length - 1] = {
      ...surface,
      stuff: "sea",
      form: null,
      solid: false,
      stirred: true,
      heat: physics.heat,
    };
  }
  if (sea !== null && iced) {
    zones = zones.map((each) =>
      each.stuff === "ice" && each.inner >= physics.radius - sea.roof - 1
        ? { ...each, heat: sea.heat, top: physics.heat }
        : each,
    );
  }
  return { radius: physics.radius, zones: joined(zones), fires: [] };
}

function fluidSection(physics: Physics, inside: Interior): Section {
  const { strata } = inside;
  const heats = strata.map(({ heat }) => heat);
  for (let index = heats.length - 2; index >= 0; index--) {
    heats[index] ??= heats[index + 1];
  }
  const zones = strata.map((stratum, index) => {
    const stuff: Stuff = stratum.matter === "ice" ? "water" : stratum.matter;
    const fluid = stuff === "gas" || stuff === "metal" || stuff === "water";
    return zone(stuff, strata[index - 1]?.radius ?? 0, stratum.radius, {
      form: stratum.form,
      solid: !fluid,
      stirred: fluid && stratum.form !== "still",
      pressure: index === 0 ? inside.centre : stratum.pressure,
      heat: heats[index],
      top: index === strata.length - 1 ? inside.skin : heats[index + 1],
    });
  });
  return { radius: physics.radius, zones: joined(zones), fires: [] };
}

function starSection(physics: Physics, within: Within): Section {
  const { radius, mass } = physics;
  const packed = densityOf(mass, radius);
  const poly = polytropeOf(within.dense / packed);
  const heatAt = (reach: number) => Math.max(physics.heat, within.heat * heatOf(poly, reach));
  const spentMass = within.spent * mass;
  const degenerate = within.dense > DENSE_STAR[0];
  const spent =
    within.spent <= 0
      ? 0
      : Math.min(
          radius,
          degenerate ? emberRadius(spentMass) : radius * reachOf(poly, within.spent),
        );
  const stirredCore =
    within.core <= 0
      ? 0
      : within.core <= within.spent
        ? spent * Math.cbrt(within.core / within.spent)
        : radius * reachOf(poly, within.core);
  const floor = within.floor >= 1 ? radius : radius * Math.max(0, within.floor);
  const marks = [...new Set([0, spent, stirredCore, floor, radius])]
    .filter((mark) => mark >= 0 && mark <= radius)
    .sort((left, right) => left - right);
  const pieces = marks.slice(1).map((outer, index) => {
    const inner = marks[index];
    const middle = (inner + outer) / 2;
    return zone(middle < spent ? "helium" : "hydrogen", inner, outer, {
      stirred: middle < stirredCore || middle > floor,
      heat: heatAt(inner / radius),
      top: heatAt(outer / radius),
    });
  });
  const zones = joined(pieces);
  const fires: Fire[] = [];
  const shell = (fuel: Fuel, inner: number, outer: number) => {
    if (outer > inner) {
      fires.push({ fuel, inner, outer: Math.min(radius, outer) });
    }
  };
  if (within.stage === "prime") {
    shell("hydrogen", 0, radius * burnedWithin(poly, within.heat));
  } else if (within.stage !== "young" && spent > 0) {
    if (within.stage === "helium") {
      shell(
        "helium",
        0,
        stirredCore > 0 && stirredCore < spent ? stirredCore : HELIUM_FLAME * spent,
      );
    }
    if (within.stage === "last") {
      shell("helium", HELIUM_SHELL[0] * spent, HELIUM_SHELL[1] * spent);
    }
    shell("hydrogen", spent, SHELL_WIDE * spent);
  }
  return { radius, zones, fires };
}

function emberSection(physics: Physics, within: Within): Section {
  const { radius, mass } = physics;
  const suns = mass / SUN_MASS;
  const poly = polytropeOf(within.dense / densityOf(mass, radius));
  const [light, lightLog, heavy, heavyLog] = DWARF_HYDROGEN;
  const hydrogen = 10 ** -(lightLog + ((heavyLog - lightLog) * (suns - light)) / (heavy - light));
  const helium = radius * reachOf(poly, 1 - DWARF_HELIUM);
  const skin = radius * reachOf(poly, 1 - Math.min(hydrogen, DWARF_HELIUM / 2));
  return {
    radius,
    zones: [
      zone(suns > DWARF_NEON ? "neon" : "carbon", 0, helium),
      zone("helium", helium, skin),
      zone("hydrogen", skin, radius, { top: physics.heat }),
    ],
    fires: [],
  };
}

function pulsarSection(physics: Physics): Section {
  const { radius, mass } = physics;
  const [thick, suns, wide] = CRUST;
  const bent = (weight: number, across: number) =>
    (across * across * (1 - (2 * GRAVITY * weight) / (across * LIGHT_SPEED ** 2))) / weight;
  const crust = Math.min(radius / 2, (thick * bent(mass, radius)) / bent(suns * SUN_MASS, wide));
  return {
    radius,
    zones: [
      zone("neutrons", 0, radius - crust),
      zone("crust", radius - crust, radius, { solid: true, top: physics.heat }),
    ],
    fires: [],
  };
}

export function sectionOf(physics: Physics, host: Physics | null): Section | null {
  if (starborn(physics) && physics.mass >= STAR_LEAST) {
    const within = withinOf(physics);
    if (within === null) {
      return null;
    }
    if (within.stage === "pulsar") {
      return pulsarSection(physics);
    }
    if (within.stage === "ember") {
      return emberSection(physics, within);
    }
    return starSection(physics, within);
  }
  const inside = interiorOf(physics);
  if (inside === null || inside.strata.length === 0) {
    return null;
  }
  return wrapped(physics)
    ? fluidSection(physics, inside)
    : solidSection(physics, inside, warmthOf(physics, host));
}
