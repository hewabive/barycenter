import {
  densityOf,
  type Gain,
  GRAVITY,
  type Life,
  lifeOf,
  starDawn,
  starRadius,
  starStages,
} from "./physics.ts";
import { PLUNGE } from "./tides.ts";

const STAR_LOSS = 1e7;
const ENVELOPE = 0.7;
const DEEPENING = [1, 3];
const STEP = 0.05;
const NODE_STEP = 0.04;
const NODE_DEPTH = 16;
const ROUND_LEAST = 1e-4;
const FAR = 20;
const SPREAD = [0.25, 0.5, 0.75];
const HALVINGS = 24;
const TORN_BARE = 2.44;
const TORN_WRAPPED = 1 / 0.49;

export interface Track {
  born: number;
  dawn: number;
  main: number;
  end: number;
  early: Node[];
  late: Node[] | null;
  life: (at: number) => Aged;
  edges: number[];
}

export type Aged = Life & { seed?: number };

export interface Course {
  life: (at: number) => Aged;
  edges: number[];
}

interface Node {
  at: number;
  mass: number;
  radius: number;
  glow: number;
  deep: number;
}

export interface Drift {
  orbit: number;
  stretch: number;
  fell: number | null;
}

export interface Sinker {
  at(age: number): Drift;
  fall(age: number): number | null;
  given(age: number): Gain[];
  first(age: number, test: (mark: Mark, star: () => Sun) => boolean): Mark | null;
}

export interface Sun {
  mass: number;
  radius: number;
}

export interface Mark {
  time: number;
  orbit: number;
  stretch: number;
}

export interface Pulled {
  mass: number;
  radius: number;
  fluid: boolean;
}

function smooth(from: number, to: number, value: number): number {
  const share = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return share * share * (3 - 2 * share);
}

export function trackOf(born: number, course: Course | null = null): Track {
  const life = course?.life ?? ((at: number) => lifeOf(born, at));
  const edges = course?.edges ?? starStages(born);
  const steady = starStages(born)[0];
  const main = Math.min(steady, ...edges.filter((edge) => edge > 0));
  const dawn = Math.min(starDawn(born), main);
  const first = nodeOf(life, born, dawn);
  return {
    born,
    dawn,
    main,
    end: Math.max(main, ...edges),
    early: [first, { ...first, at: main }],
    late: null,
    life,
    edges,
  };
}

function nodeOf(read: Track["life"], born: number, at: number): Node {
  const life = read(at);
  const dwarf = starRadius(life.seed ?? born);
  const deep = ENVELOPE * smooth(DEEPENING[0], DEEPENING[1], life.radius / dwarf);
  return { at, mass: life.mass, radius: life.radius, glow: life.glow, deep: deep * life.mass };
}

function lateOf(track: Track): Node[] {
  if (track.late !== null) {
    return track.late;
  }
  const { born, life } = track;
  const bounds = [track.main, ...track.edges.filter((edge) => edge > track.main)];
  const apart = (left: Node, right: Node) =>
    Math.abs(Math.log(right.radius / left.radius)) > NODE_STEP ||
    Math.abs(Math.log(right.glow / left.glow)) > 2 * NODE_STEP ||
    Math.abs(right.mass / left.mass - 1) > NODE_STEP / 4;
  const nodes: Node[] = [...track.early];
  const refine = (left: Node, right: Node, depth: number) => {
    if (depth < NODE_DEPTH && apart(left, right)) {
      const middle = nodeOf(life, born, (left.at + right.at) / 2);
      refine(left, middle, depth + 1);
      refine(middle, right, depth + 1);
      return;
    }
    nodes.push(right);
  };
  for (let stage = 1; stage < bounds.length; stage++) {
    const from = bounds[stage - 1];
    const to = bounds[stage];
    if (to <= from) {
      continue;
    }
    const start = nodeOf(life, born, from);
    nodes.push(start);
    refine(start, nodeOf(life, born, to - 1e-9 * (to - from)), 0);
  }
  track.late = nodes;
  return nodes;
}

function starAt(nodes: Node[], index: number, time: number): Node {
  const left = nodes[index];
  const right = nodes[index + 1] ?? left;
  const span = right.at - left.at;
  const share = span > 0 ? Math.max(0, Math.min(1, (time - left.at) / span)) : 0;
  const blend = (from: number, to: number) => from * (to / from) ** share;
  return {
    at: time,
    mass: left.mass + (right.mass - left.mass) * share,
    radius: blend(left.radius, right.radius),
    glow: blend(left.glow, right.glow),
    deep: left.deep + (right.deep - left.deep) * share,
  };
}

function envelopeOf(star: Node, turn: number): number {
  const lag = Math.cbrt((star.deep * star.radius ** 2) / (3 * star.glow));
  const pace = Math.min(1, (Math.PI / (turn * lag)) ** 2);
  return (pace * star.deep) / (lag * star.mass);
}

function ratesOf(body: Pulled, star: Node, orbit: number, stretch: number): [number, number] {
  const turn = Math.sqrt((GRAVITY * (star.mass + body.mass)) / orbit ** 3);
  const share = body.mass / star.mass;
  const near = star.radius / orbit;
  const tied = (4.5 * turn * share * near ** 5) / STAR_LOSS;
  const deep = star.deep > 0 ? envelopeOf(star, turn) : 0;
  const drag = deep * share * (1 + share) * near ** 8;
  const square = stretch * stretch;
  const open = 1 - square;
  const pull =
    (1 + square * (15.5 + square * (31.875 + square * (11.5625 + square * 0.390625)))) /
    open ** 7.5;
  const round = (1 + square * (3.75 + square * (1.875 + square * 0.078125))) / open ** 6.5;
  return [drag * pull + tied * (1 + 14.25 * square), 4.5 * drag * round + 2.375 * tied];
}

export function sinkerOf(
  track: Track,
  body: Pulled,
  orbit: number,
  stretch: number,
  since = track.dawn,
): Sinker {
  const born = track.born;
  const dense = densityOf(body.mass, body.radius);
  const torn = body.fluid ? TORN_WRAPPED : TORN_BARE;
  const tear = (star: Node) =>
    star.radius * Math.max(PLUNGE, torn * Math.cbrt(densityOf(star.mass, star.radius) / dense));
  const opened = Math.max(track.dawn, since);
  const begin = { time: opened, orbit, stretch, fell: null as number | null, index: 0 };
  let state = { ...begin };
  const swing = (at: number, oval: number) =>
    body.mass * Math.sqrt(GRAVITY * born * at * (1 - oval ** 2));
  const whole = swing(orbit, stretch);
  const start = { time: opened, spin: 0, orbit, stretch, index: 0 };
  let trail: (Mark & { spin: number; index: number })[] = [start];
  const nodesTo = (until: number) => (until <= track.main ? track.early : lateOf(track));
  const quiet = (until: number) =>
    orbit * (1 - stretch) > FAR * track.life(Math.min(until, track.end)).swell;
  const run = (from: typeof state, until: number, kept: typeof trail | null) => {
    const now = { ...from };
    const nodes = nodesTo(until);
    const stop = Math.min(until, track.end);
    while (now.fell === null && now.time < stop) {
      while (now.index < nodes.length - 1 && nodes[now.index + 1].at <= now.time) {
        now.index++;
      }
      const star = starAt(nodes, now.index, now.time);
      const actual = (now.orbit * born) / star.mass;
      if (actual * (1 - now.stretch) <= tear(star)) {
        now.fell = now.time;
        break;
      }
      if (now.index >= nodes.length - 1) {
        break;
      }
      const edge = Math.min(stop, nodes[now.index + 1].at);
      const [shrink, round] = ratesOf(body, star, actual, now.stretch);
      const fastest = Math.max(shrink, now.stretch > 0 ? round : 0, 1e-300);
      let step = Math.min(edge - now.time, STEP / fastest);
      const middle = starAt(nodes, now.index, now.time + step / 2);
      const halfway = actual * Math.exp((-shrink * step) / 2);
      const oval = now.stretch * Math.exp((-round * step) / 2);
      const [shrunk, rounded] = ratesOf(body, middle, (halfway * star.mass) / middle.mass, oval);
      const quickest = Math.max(shrunk, now.stretch > 0 ? rounded : 0);
      if (quickest * step > 2 * STEP) {
        step = STEP / quickest;
      }
      now.orbit *= Math.exp(-shrunk * step);
      now.stretch *= Math.exp(-rounded * step);
      if (now.stretch < ROUND_LEAST) {
        now.stretch = 0;
      }
      now.time += step;
      const spin = whole - swing(now.orbit, now.stretch);
      kept?.push({
        time: now.time,
        spin,
        orbit: now.orbit,
        stretch: now.stretch,
        index: now.index,
      });
    }
    return now;
  };
  return {
    at(age) {
      if (age <= opened || quiet(age)) {
        return { orbit, stretch, fell: null };
      }
      if (age < state.time) {
        state = { ...begin };
        trail = [start];
      }
      state = run(state, age, trail);
      return { orbit: state.orbit, stretch: state.stretch, fell: state.fell };
    },
    fall(age) {
      const drift = this.at(age);
      if (drift.fell !== null) {
        return drift.fell;
      }
      if (quiet(track.end)) {
        return null;
      }
      return run(age <= opened ? begin : state, track.end, null).fell;
    },
    given(age) {
      const drift = this.at(age);
      const last = drift.fell ?? age;
      const moved =
        drift.fell === null ? Math.max(0, whole - swing(drift.orbit, drift.stretch)) : whole;
      if (moved <= 0) {
        return [];
      }
      const gains: Gain[] = [];
      let laid = 0;
      for (const share of SPREAD) {
        const past = trail.findIndex((point) => point.spin >= share * moved);
        if (past < 1) {
          continue;
        }
        const [before, after] = [trail[past - 1], trail[past]];
        const part = (share * moved - before.spin) / (after.spin - before.spin);
        const at = before.time + part * (after.time - before.time);
        if (at < last) {
          gains.push({ at, spin: share * moved - laid });
          laid = share * moved;
        }
      }
      gains.push({ at: last, spin: moved - laid });
      return gains;
    },
    first(age, test) {
      this.at(age);
      const holds = (point: Mark, index: number) =>
        test(point, () => starAt(nodesTo(point.time), index, point.time));
      const found = trail.findIndex((point) => point.time <= age && holds(point, point.index));
      if (found < 0) {
        return null;
      }
      const after = trail[found];
      const before = trail[found - 1] ?? after;
      const between = (share: number): Mark => ({
        time: before.time + share * (after.time - before.time),
        orbit: before.orbit * (after.orbit / before.orbit) ** share,
        stretch: before.stretch + share * (after.stretch - before.stretch),
      });
      let low = 0;
      let high = 1;
      for (let halving = 0; before !== after && halving < HALVINGS; halving++) {
        const middle = (low + high) / 2;
        if (holds(between(middle), after.index)) {
          high = middle;
        } else {
          low = middle;
        }
      }
      return between(high);
    },
  };
}
