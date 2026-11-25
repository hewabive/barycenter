import {
  BURST_LEAST,
  bareRadius,
  coreOf,
  dwarfOf,
  type Ending,
  emberOf,
  endingOf,
  GIGAYEAR,
  GRAVITY,
  LIGHT_SPEED,
  type Life,
  lifeOf,
  relicOf,
  SUN_MASS,
  starDawn,
  starHeat,
  starLife,
  starRadius,
  starSpan,
  starStages,
} from "./physics.ts";
import type { Random } from "./random.ts";

const KEPT = 0.5;
const HOT_LIMIT = 4;
const COOL_LIMIT = 10;
const HOT_HEAT = [5500, 7000];
const GIANT_FROM = 3;
const LOOSE = [0.25, 1];
const MERGED_SHED = 0.03;
const COLLAPSE = 1.38 * SUN_MASS;
const COLLAPSED = 1.25 * SUN_MASS;
const PULSAR_MOST = 2.17 * SUN_MASS;
const ROUNDING = [0.4, 0.9];
const DETACHED = 0.5;
const SQUEEZED = 0.5;
const FRESH = [1.1, 1.6];
const KICK_KEPT = 0.14;
const STEPS = 96;
const SCAN = 48;
const HALVINGS = 44;
const TURNS = 8;
const LATEST = 20 * GIGAYEAR;
const AFTER = 1e-12;

export interface Phase extends Life {
  seed: number;
  clock: number;
  ending: Ending | null;
  burst: boolean;
  lobe: number;
}

export interface Flow {
  from: 0 | 1;
  rate: number;
  kept: number;
}

interface Link {
  stars: [Phase, Phase | null];
  orbit: number;
  stretch: number;
  flow: Flow | null;
}

export interface Bond extends Link {
  apart: boolean;
}

export interface Turn {
  kind: "pass" | "shed" | "merge";
  seat: 0 | 1;
  from: number;
  until: number;
  had: number;
  mass: number;
  kept: number;
  spin: number;
  close: boolean;
}

export interface Pairing {
  at(age: number): Bond;
  turns: Turn[];
  marks: number[];
  edges: number[];
}

export interface Lone {
  at(age: number): Phase;
  turns: Turn[];
  marks: number[];
  edges: number[];
}

export interface Seat {
  born: number;
  dim: Pick<Life, "radius" | "glow"> | null;
}

interface Clock {
  seed: number;
  shift: number;
}

interface Left {
  ending: Ending;
  mass: number;
  since: number;
  burst: boolean;
  helium: boolean;
}

interface Actor {
  clock: Clock;
  extra: number;
  wide: number;
  bright: number;
  held: boolean;
  left: Left | null;
  dim: Life | null;
}

interface Base {
  orbit: number;
  stretch: number;
  weight: number;
  from: number;
  wave: number;
}

type Reader = (age: number) => Link;

function smooth(from: number, to: number, value: number): number {
  const share = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return share * share * (3 - 2 * share);
}

export function lobeOf(share: number): number {
  const cube = Math.cbrt(share);
  return (0.49 * cube * cube) / (0.6 * cube * cube + Math.log(1 + cube));
}

function actorOf(seat: Seat): Actor {
  const { born, dim } = seat;
  const still = { extra: 0, wide: 0, bright: 0, held: false, left: null };
  const clock = { seed: born, shift: 0 };
  return dim === null
    ? { ...still, clock, dim: null }
    : { ...still, clock, dim: { mass: born, ...dim, swell: dim.radius, peak: dim.glow, spent: 0 } };
}

function phaseOf(actor: Actor, age: number): Phase {
  const { clock, left, dim } = actor;
  const none = { burst: false, lobe: 0 };
  if (dim !== null) {
    return { ...dim, seed: dim.mass, clock: age, ending: null, ...none };
  }
  const { seed, shift } = clock;
  const life = lifeOf(seed, age - shift);
  const told = { seed, clock: age - shift };
  if (left !== null) {
    const kept = { swell: actor.wide, peak: actor.bright };
    if (left.ending !== "core") {
      const spent = Math.max(age - left.since, 1);
      const made = emberOf(left.ending, left.mass, spent);
      return { ...made, ...kept, spent, ...told, ending: left.ending, burst: left.burst, lobe: 0 };
    }
    if (life.spent <= 0) {
      const bare = { mass: left.mass, radius: bareRadius(left.mass), glow: life.glow };
      return { ...bare, ...kept, spent: 0, ...told, ending: "core", ...none };
    }
    const ending = endingOf(seed);
    const made = emberOf(ending, Math.min(relicOf(seed), left.mass), life.spent);
    const burst = ending === "pulsar";
    return { ...made, ...kept, spent: life.spent, ...told, ending, burst, lobe: 0 };
  }
  const swell = Math.max(actor.wide, actor.held ? life.radius : life.swell);
  const peak = Math.max(actor.bright, actor.held ? life.glow : life.peak);
  if (life.spent > 0) {
    const ending = endingOf(seed);
    return { ...life, swell, peak, ...told, ending, burst: ending === "pulsar", lobe: 0 };
  }
  return { ...life, mass: life.mass + actor.extra, swell, peak, ...told, ending: null, ...none };
}

function slackOf(phase: Phase): number {
  const base = GIANT_FROM * starRadius(phase.seed);
  const top = Math.log(lifeOf(phase.seed, starLife(phase.seed)).swell / base);
  return top <= 0 ? 0 : Math.max(0, Math.min(1, Math.log(phase.radius / base) / top));
}

export function limitOf(phase: Phase): number {
  const cool = COOL_LIMIT ** slackOf(phase);
  const hot = smooth(HOT_HEAT[0], HOT_HEAT[1], starHeat(phase.glow, phase.radius));
  return cool + (HOT_LIMIT - cool) * hot;
}

function boundsOf(actors: (Actor | null)[]): number[] {
  return actors.flatMap((actor) => {
    if (actor === null || actor.dim !== null) {
      return [];
    }
    const { seed, shift } = actor.clock;
    return [starDawn(seed), ...starStages(seed)].map((stage) => stage + shift);
  });
}

function gridOf(bounds: number[], from: number, to: number): number[] {
  if (to <= from) {
    return [];
  }
  const edges = [from, ...bounds.filter((bound) => bound > from && bound < to), to].sort(
    (left, right) => left - right,
  );
  const grid: number[] = [];
  for (let at = 1; at < edges.length; at++) {
    const [before, after] = [edges[at - 1], edges[at]];
    for (let step = 1; step <= SCAN; step++) {
      grid.push(before + ((after - before) * step) / SCAN);
    }
  }
  return grid;
}

function crossing(test: (age: number) => number, before: number, after: number): number {
  let [low, high] = [before, after];
  for (let halving = 0; halving < HALVINGS; halving++) {
    const middle = (low + high) / 2;
    if (test(middle) >= 0) {
      high = middle;
    } else {
      low = middle;
    }
  }
  return high;
}

function firstOf(
  tests: ((age: number) => number)[],
  bounds: number[],
  from: number,
): { at: number; which: number } | null {
  let before = from;
  for (const [which, test] of tests.entries()) {
    if (test(from) >= 0) {
      return { at: from, which };
    }
  }
  for (const after of gridOf(bounds, from, LATEST)) {
    const hit = tests
      .map((test, which) => ({ which, at: test(after) >= 0 ? crossing(test, before, after) : -1 }))
      .filter(({ at }) => at >= 0)
      .sort((left, right) => left.at - right.at)[0];
    if (hit !== undefined) {
      return hit;
    }
    before = after;
  }
  return null;
}

function bared(actor: Actor, phase: Phase, mass: number, since: number): Actor {
  const heavy = phase.seed >= BURST_LEAST;
  return {
    ...actor,
    extra: 0,
    wide: phase.swell,
    bright: phase.peak,
    left: {
      ending: heavy ? "core" : "dwarf",
      mass,
      since,
      burst: false,
      helium: !heavy && phase.clock < starStages(phase.seed)[2],
    },
  };
}

function kindled(mass: number, age: number): Clock {
  let [low, high] = [mass, BURST_LEAST];
  for (let halving = 0; halving < HALVINGS; halving++) {
    const middle = (low + high) / 2;
    if (relicOf(middle) < mass) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return { seed: high, shift: age - starStages(high)[2] };
}

function compact(actor: Actor | null): actor is Actor & { left: Left } {
  return actor !== null && actor.left !== null && actor.left.ending !== "core";
}

function detached(actors: [Actor, Actor | null], base: Base): Reader {
  return (age) => {
    const first = phaseOf(actors[0], age);
    if (actors[1] === null) {
      return { stars: [first, null], orbit: 0, stretch: 0, flow: null };
    }
    const second = phaseOf(actors[1], age);
    const wide = base.weight / (first.mass + second.mass);
    const shares = [lobeOf(first.mass / second.mass), lobeOf(second.mass / first.mass)];
    const near = base.orbit * (1 - base.stretch) * wide;
    const fill = Math.max(first.swell / shares[0], second.swell / shares[1]) / near;
    const stretch = base.stretch * (1 - smooth(ROUNDING[0], ROUNDING[1], fill));
    const even = (base.orbit * wide * (1 - base.stretch ** 2)) / (1 - stretch ** 2);
    const orbit =
      base.wave > 0 ? Math.max(0, even ** 4 - base.wave * (age - base.from)) ** 0.25 : even;
    const reach = orbit * (1 - stretch);
    return {
      stars: [
        { ...first, lobe: first.radius / (reach * shares[0]) },
        { ...second, lobe: second.radius / (reach * shares[1]) },
      ],
      orbit,
      stretch,
      flow: null,
    };
  };
}

function waveOf(actors: [Actor, Actor | null]): number {
  const [first, second] = actors;
  if (!compact(first) || !compact(second)) {
    return 0;
  }
  const [heavy, light] = [first.left.mass, second.left.mass];
  return (51.2 * GRAVITY ** 3 * heavy * light * (heavy + light)) / LIGHT_SPEED ** 5;
}

interface Table {
  mass: number[];
  wide: number[];
  room: number[];
  least: number;
}

function tableOf(donor: number, taker: number, floor: number, orbit: number, kept: number): Table {
  const slope = (mass: number) => {
    const other = taker + kept * (donor - mass);
    const whole = mass + other;
    const lost = 1 - kept;
    return 2 * ((lost * mass) / (whole * other) - 1 / mass + kept / other) + lost / whole;
  };
  const table: Table = { mass: [donor], wide: [orbit], room: [], least: 0 };
  let log = Math.log(orbit);
  for (let step = 1; step <= STEPS; step++) {
    const from = table.mass[step - 1];
    const to = donor * (floor / donor) ** (step / STEPS);
    const span = to - from;
    const middle = slope(from + span / 2);
    log += (span * (slope(from) + 4 * middle + slope(to))) / 6;
    table.mass.push(to);
    table.wide.push(Math.exp(log));
  }
  table.room = table.mass.map(
    (mass, at) => table.wide[at] * lobeOf(mass / (taker + kept * (donor - mass))),
  );
  table.least = table.room.reduce((least, room, at) => (room < table.room[least] ? at : least), 0);
  return table;
}

function massFor(table: Table, radius: number): number | null {
  const { mass, room, least } = table;
  if (radius < room[least]) {
    return null;
  }
  for (let at = least; at < STEPS; at++) {
    if (room[at + 1] >= radius) {
      const span = room[at + 1] - room[at];
      const share = span > 0 ? (radius - room[at]) / span : 1;
      return mass[at] + (mass[at + 1] - mass[at]) * share;
    }
  }
  return mass[STEPS];
}

function orbitFor(table: Table, mass: number): number {
  const { wide } = table;
  const [donor, floor] = [table.mass[0], table.mass[STEPS]];
  const place = Math.max(
    0,
    Math.min(STEPS, (STEPS * Math.log(mass / donor)) / Math.log(floor / donor)),
  );
  const at = Math.min(STEPS - 1, Math.floor(place));
  return wide[at] * (wide[at + 1] / wide[at]) ** (place - at);
}

interface Sample {
  at: number;
  mass: number;
  wide: number;
}

interface Passing {
  until: number;
  bare: boolean;
  samples: Sample[];
}

function passing(
  donor: Phase,
  taker: Phase,
  shift: number,
  from: number,
  table: Table,
  kept: number,
): Passing {
  const { seed } = donor;
  const heat = (GRAVITY * donor.mass ** 2) / (donor.radius * donor.glow);
  const pace = donor.mass / heat;
  const samples: Sample[] = [{ at: from, mass: donor.mass, wide: donor.swell }];
  const ends = shift + starLife(seed);
  const stages = [starDawn(seed), ...starStages(seed)].map((stage) => stage + shift);
  for (const at of gridOf(stages, from, ends)) {
    const last = samples[samples.length - 1];
    const clock = at - shift;
    const life = lifeOf(seed, clock);
    if (life.spent > 0 || at >= ends) {
      return { until: last.at, bare: false, samples };
    }
    const core = coreOf(seed, clock);
    const wanted = massFor(table, life.radius);
    const slow = donor.mass - pace * (at - from);
    const mass = Math.min(last.mass, Math.max(wanted ?? last.mass, slow));
    if (mass <= core) {
      const before = last.mass - coreOf(seed, last.at - shift);
      const share = before / (before + core - mass);
      const until = last.at + (at - last.at) * share;
      const left = last.mass + (mass - last.mass) * share;
      samples.push({ at: until, mass: left, wide: last.wide });
      return { until, bare: true, samples };
    }
    const room = orbitFor(table, mass) * lobeOf(mass / (taker.mass + kept * (donor.mass - mass)));
    samples.push({ at, mass, wide: Math.max(last.wide, Math.min(life.radius, room)) });
    if (wanted === null && life.radius < DETACHED * room && mass < donor.mass) {
      return { until: at, bare: false, samples };
    }
  }
  const last = samples[samples.length - 1];
  return { until: last.at, bare: false, samples };
}

function grown(taker: Phase, mass: number, since: number): Phase {
  const span = starSpan(taker.seed);
  const mixed = smooth(FRESH[0], FRESH[1], mass / SUN_MASS);
  const burnt = (taker.clock / span) * (taker.mass / mass) ** mixed;
  const wider = starSpan(mass);
  const clock = Math.max(starDawn(mass), burnt * wider + since);
  const life = lifeOf(mass, clock);
  return {
    ...life,
    swell: Math.max(taker.swell, life.radius),
    peak: Math.max(taker.peak, life.glow),
    seed: mass,
    clock,
    ending: life.spent > 0 ? endingOf(mass) : null,
    burst: false,
    lobe: 0,
  };
}

function turnOf(kind: Turn["kind"], seat: 0 | 1, at: number, had: number, mass: number): Turn {
  return { kind, seat, from: at, until: at, had, mass, kept: 0, spin: 0, close: true };
}

export function pairOf(
  first: Seat,
  second: Seat,
  orbit: number,
  stretch: number,
  room: number | null,
  fortune: Random,
): Pairing {
  const actors: [Actor, Actor | null] = [actorOf(first), actorOf(second)];
  const eras: { from: number; read: Reader }[] = [];
  const turns: Turn[] = [];
  const marks: number[] = [];
  const edges: number[] = [];
  let base: Base = { orbit, stretch, weight: first.born + second.born, from: 0, wave: 0 };
  let from = 0;
  let split = Number.POSITIVE_INFINITY;
  const live = (actor: Actor | null): actor is Actor =>
    actor !== null && actor.left === null && actor.dim === null;
  for (let turn = 0; turn < TURNS; turn++) {
    const pair: [Actor, Actor | null] = [actors[0], actors[1]];
    const steady = { ...base, from, wave: waveOf(pair) };
    const read = detached(pair, steady);
    eras.push({ from, read });
    edges.push(...boundsOf(pair));
    const tests: ((age: number) => number)[] = [];
    const acts: ((age: number) => boolean)[] = [];
    const blowing = (seat: 0 | 1, age: number) => {
      const actor = pair[seat];
      const phase = read(age).stars[seat];
      return actor !== null && actor.dim === null && !compact(actor) && (phase?.burst ?? false);
    };
    tests.push((age) => (blowing(0, age) || blowing(1, age) ? 1 : -1));
    acts.push((age) => {
      const seat = blowing(0, age) ? 0 : 1;
      const actor = pair[seat];
      if (actor === null || pair[1 - seat] === null) {
        return false;
      }
      const end = actor.clock.shift + starLife(actor.clock.seed);
      const before = read(end * (1 - AFTER));
      const after = read(age);
      const [prior, remnant] = [before.stars[seat], after.stars[seat]];
      if (prior === null || remnant === null || fortune.next() >= KICK_KEPT) {
        split = age;
        return false;
      }
      const quick = fortune.next() ** (2 / 3);
      const aside = 1 - (2 * fortune.next() - 1) ** 2;
      const stretch = Math.sqrt(1 - Math.max(AFTER, 4 * quick * (1 - quick) * aside));
      const left: Left = {
        ending: "pulsar",
        mass: remnant.mass,
        since: end,
        burst: true,
        helium: false,
      };
      actors[seat] = { ...actor, extra: 0, wide: remnant.radius, bright: prior.peak, left };
      const weight = after.stars[0].mass + (after.stars[1]?.mass ?? 0);
      base = { orbit: before.orbit / (2 * (1 - quick)), stretch, weight, from: age, wave: 0 };
      marks.push(age);
      return true;
    });
    for (const seat of [0, 1] as const) {
      const actor = pair[seat];
      const other = pair[1 - seat];
      if (!live(actor)) {
        continue;
      }
      const { seed, shift } = actor.clock;
      const dawn = shift + starDawn(seed);
      if (actor.extra < 0) {
        tests.push((age) => {
          const life = lifeOf(seed, age - shift);
          return life.spent > 0 ? -1 : coreOf(seed, age - shift) - (life.mass + actor.extra);
        });
        acts.push((age) => {
          const phase = phaseOf(actor, age);
          actors[seat] = bared(actor, phase, phase.mass, age);
          marks.push(age);
          return true;
        });
      }
      if (other === null) {
        if (room !== null) {
          tests.push((age) => {
            const phase = phaseOf(actor, age);
            return age < dawn || phase.ending !== null ? -1 : phase.radius - room;
          });
          acts.push((age) => {
            const phase = phaseOf(actor, age);
            const core = Math.min(coreOf(seed, phase.clock), phase.mass);
            actors[seat] = bared(actor, phase, core, age);
            const shed = turnOf("shed", seat, age, phase.mass, phase.mass - core);
            turns.push({ ...shed, close: false });
            marks.push(age);
            return true;
          });
        }
        continue;
      }
      tests.push((age) => {
        const phase = read(age).stars[seat];
        return phase === null || age < dawn || phase.ending !== null ? -1 : phase.lobe - 1;
      });
      acts.push((age) => {
        const bond = read(age);
        const donor = bond.stars[seat];
        const taker = bond.stars[1 - seat];
        if (donor === null || taker === null) {
          return false;
        }
        const core = Math.min(coreOf(seed, donor.clock), donor.mass);
        const fresh = live(other) && taker.clock <= starSpan(taker.seed);
        const kept = other.dim === null && other.left === null ? KEPT : 0;
        const floor = Math.min(core, 0.999 * donor.mass);
        const table = tableOf(donor.mass, taker.mass, floor, bond.orbit, kept);
        const open = table.room[table.least] >= SQUEEZED * table.room[0];
        if (donor.mass / taker.mass <= limitOf(donor) && open && core < donor.mass) {
          const run = passing(donor, taker, shift, age, table, kept);
          const { samples, until } = run;
          const gained = (mass: number) => taker.mass + kept * (donor.mass - mass);
          eras.push({
            from: age,
            read: (now) => {
              const found = samples.findIndex((sample) => sample.at >= now);
              const next = found < 0 ? samples.length - 1 : found;
              const [before, after] = [samples[Math.max(0, next - 1)], samples[next]];
              const span = after.at - before.at;
              const share = span > 0 ? Math.max(0, Math.min(1, (now - before.at) / span)) : 1;
              const mass = before.mass + (after.mass - before.mass) * share;
              const wide = orbitFor(table, mass);
              const heavier = gained(mass);
              const lobes = [wide * lobeOf(mass / heavier), wide * lobeOf(heavier / mass)];
              const life = lifeOf(seed, now - shift);
              const radius = Math.min(life.radius, lobes[0]);
              const giver: Phase = {
                mass,
                radius,
                glow: life.glow,
                swell: Math.max(before.wide, radius),
                peak: Math.max(donor.peak, life.glow),
                spent: 0,
                seed,
                clock: now - shift,
                ending: null,
                burst: false,
                lobe: radius / lobes[0],
              };
              const lone = phaseOf(other, now);
              const fed = fresh
                ? grown(taker, heavier, now - age)
                : {
                    ...lone,
                    mass: lone.ending === null ? lone.mass + heavier - taker.mass : lone.mass,
                  };
              const taking = { ...fed, lobe: fed.radius / lobes[1] };
              const rate = span > 0 ? (before.mass - after.mass) / span : 0;
              return {
                stars: seat === 0 ? [giver, taking] : [taking, giver],
                orbit: wide,
                stretch: 0,
                flow: rate > 0 ? { from: seat, rate, kept } : null,
              };
            },
          });
          const end = eras[eras.length - 1].read(until);
          const [gave, took] = [end.stars[seat], end.stars[1 - seat]];
          if (gave === null || took === null) {
            return false;
          }
          actors[seat] = run.bare
            ? bared(actor, gave, gave.mass, until)
            : {
                ...actor,
                extra: gave.mass - lifeOf(seed, until - shift).mass,
                wide: gave.swell,
                bright: gave.peak,
                held: true,
              };
          const more = took.mass - taker.mass;
          actors[1 - seat] = fresh
            ? {
                ...other,
                clock: { seed: took.mass, shift: until - took.clock },
                extra: 0,
                wide: took.swell,
                bright: took.peak,
                held: false,
              }
            : { ...other, extra: other.extra + (took.ending === null ? more : 0) };
          const spin = more * Math.sqrt(GRAVITY * took.mass * took.radius);
          const pass = turnOf("pass", seat, age, donor.mass, donor.mass - gave.mass);
          turns.push({ ...pass, until, kept: more, spin });
          base = {
            orbit: end.orbit,
            stretch: 0,
            weight: gave.mass + took.mass,
            from: until,
            wave: 0,
          };
          marks.push(age, until);
          from = until * (1 + AFTER);
          return true;
        }
        const loose = LOOSE[0] * (LOOSE[1] / LOOSE[0]) ** slackOf(donor);
        const cover = donor.mass - core;
        const bound = (donor.mass * cover) / (loose * donor.radius);
        const close =
          (core * taker.mass) / (2 * (bound + (donor.mass * taker.mass) / (2 * bond.orbit)));
        const heart = seed >= BURST_LEAST ? bareRadius(core) : dwarfOf(core, 1).radius;
        const fits =
          core > 0 &&
          taker.radius <= close * lobeOf(taker.mass / core) &&
          heart <= close * lobeOf(core / taker.mass);
        const whole = donor.mass + taker.mass;
        const swing = donor.mass * taker.mass * Math.sqrt((GRAVITY * bond.orbit) / whole);
        if (fits) {
          actors[seat] = bared(actor, donor, core, age);
          turns.push(turnOf("shed", seat, age, donor.mass, cover));
          base = { orbit: close, stretch: 0, weight: core + taker.mass, from: age, wave: 0 };
        } else {
          const sum = whole * (1 - MERGED_SHED);
          const gone = seat === 1 ? donor.mass : taker.mass;
          const kept = { wide: donor.swell, bright: donor.peak, held: false, dim: null };
          actors[0] =
            other.left?.ending === "hole"
              ? {
                  ...other,
                  left: { ...other.left, mass: other.left.mass + (1 - MERGED_SHED) * donor.mass },
                }
              : {
                  ...kept,
                  clock: { seed, shift },
                  extra: sum - (donor.mass - actor.extra),
                  left: null,
                };
          actors[1] = null;
          turns.push({ ...turnOf("merge", 1, age, gone, gone), spin: swing });
        }
        marks.push(age);
        return true;
      });
    }
    if (steady.wave > 0 && pair[1] !== null) {
      const start = read(from);
      const [heavy, light] = [start.stars[0], start.stars[1]];
      if (light !== null) {
        const touch = Math.max(
          heavy.radius / lobeOf(heavy.mass / light.mass),
          light.radius / lobeOf(light.mass / heavy.mass),
        );
        const met = from + (start.orbit ** 4 - touch ** 4) / steady.wave;
        tests.push((age) => age - met);
        acts.push((age) => {
          const sum = heavy.mass + light.mass;
          const pulsars = [heavy, light].filter((phase) => phase.ending === "pulsar");
          const dense = pulsars.reduce((whole, phase) => whole + phase.mass, 0);
          const hole = heavy.ending === "hole" || light.ending === "hole" || dense > PULSAR_MOST;
          const fallen = !hole && dense === 0 && sum >= COLLAPSE;
          const helium = pair.every((actor) => actor?.left?.helium ?? false);
          const told = { since: age, helium: false };
          const born = pair.find((actor) => actor?.left?.ending === "pulsar")?.left?.since ?? age;
          const left: Left = hole
            ? { ending: "hole", mass: sum, burst: false, ...told }
            : dense > 0
              ? { ending: "pulsar", mass: dense, burst: false, since: born, helium: false }
              : fallen
                ? { ending: "pulsar", mass: COLLAPSED, burst: true, ...told }
                : { ending: helium ? "core" : "dwarf", mass: sum, burst: false, ...told };
          const clock = helium ? kindled(sum, age) : actors[0].clock;
          actors[0] = { ...actors[0], clock, extra: 0, left };
          actors[1] = null;
          turns.push(turnOf("merge", 1, age, light.mass, light.mass));
          marks.push(age);
          return true;
        });
      }
    }
    const next = firstOf(tests, boundsOf(pair), from);
    if (next === null) {
      break;
    }
    from = next.at * (1 + AFTER);
    if (!acts[next.which](next.at)) {
      break;
    }
  }
  if (eras.length === 0 || eras[eras.length - 1].from < from) {
    const pair: [Actor, Actor | null] = [actors[0], actors[1]];
    eras.push({ from, read: detached(pair, { ...base, from, wave: waveOf(pair) }) });
  }
  for (const actor of actors) {
    if (
      actor !== null &&
      actor.dim === null &&
      (actor.left === null || actor.left.ending === "core")
    ) {
      marks.push(actor.clock.shift + starLife(actor.clock.seed));
    }
  }
  let last: { age: number; bond: Bond } | null = null;
  return {
    at(age) {
      if (last?.age !== age) {
        const era = eras.findLast((each) => each.from <= age) ?? eras[0];
        last = { age, bond: { ...era.read(age), apart: age >= split } };
      }
      return last.bond;
    },
    turns,
    marks: marks.sort((left, right) => left - right),
    edges: [...new Set([...edges, ...marks])].sort((left, right) => left - right),
  };
}

export function loneOf(born: number, room: number | null): Lone {
  let actor = actorOf({ born, dim: null });
  const turns: Turn[] = [];
  const marks: number[] = [];
  const whole = starLife(born);
  const dawn = starDawn(born);
  const first = actor;
  let cut = Number.POSITIVE_INFINITY;
  if (room !== null && lifeOf(born, whole).swell >= room) {
    const reached = (age: number) => {
      const life = lifeOf(born, age);
      return age < dawn || life.spent > 0 ? -1 : life.radius - room;
    };
    const hit = firstOf([reached], boundsOf([actor]), 0);
    if (hit !== null && hit.at < whole) {
      const phase = phaseOf(actor, hit.at);
      const core = Math.min(coreOf(born, hit.at), phase.mass);
      cut = hit.at;
      actor = bared(actor, phase, core, cut);
      turns.push({ ...turnOf("shed", 0, cut, phase.mass, phase.mass - core), close: false });
      marks.push(cut);
    }
  }
  if (actor.left === null || actor.left.ending === "core") {
    marks.push(whole);
  }
  const edges = [...new Set([...boundsOf([first]), ...marks])].sort((left, right) => left - right);
  return { at: (age) => phaseOf(age < cut ? first : actor, age), turns, marks, edges };
}
