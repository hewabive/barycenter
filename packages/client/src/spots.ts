import { createRandom, type Random } from "@barycenter/sim";
import type { Flame } from "./looks.ts";
import { MEMBER_ROOM, PLAGE_REACH, REGION_ROOM, SPOT_ROOM } from "./shaders.ts";

const REGION_LIFE = 1400;
const CYCLE_LIFE = 60000;
const CYCLE_RISE = 0.3;
const CYCLE_FLOOR = 0.25;
const IDLE = 0.4;
const SUNLIKE = 0.134;
const SWELL = 1.45;
const GIRTH_MOST = 0.07;
const LENGTH_MOST = 0.36;
const STEADY_FROM = 0.45;
const STEADY_TO = 0.9;
const BELT_EARLY = 0.9;
const BELT_LATE = 0.25;
const BELT_SCATTER = 0.18;
const CAP_FROM = 0.7;
const CAP_BOTH = 0.85;
const FLARE_SPAN = 150;
const FLARE_MOST = 0.8;
const FLARE_RISE = 1.5;
const FLARE_FADE = 8;
const FLARE_HEAT = 2.5;
const SIZE_SPREAD = 0.65;
const SIZE_LEAST = 0.36;
const SIZE_MOST = 4.8;
const BRIEF = 0.35;
const LASTING = 0.4;
const LENGTH_LEAST = 6;
const LENGTH_GROWTH = 5;
const JOY = 0.5;
const TILT_SCATTER = 0.2;
const LEADER_LARGER = 0.72;
const LONE = 0.08;
const SKIRT = 4.6;
const EMERGING = 0.12;
const PEAK = 0.15;
const SPREADING = 0.3;
const SIGHT_SLACK = 0.02;
const LIMB_SLACK = 0.2;

type Triple = [number, number, number];

interface Member {
  east: number;
  north: number;
  girth: number;
  from: number;
  until: number;
  fray: number;
  wear: number;
}

interface Region {
  span: number;
  shift: number;
  cycle: number;
  lasting: boolean;
  born: number;
  life: number;
  middle: Triple;
  reach: number;
  members: Member[];
}

export interface Mood {
  swell: number;
  steady: number;
  at(tick: number): { phase: number; level: number };
}

export interface Activity {
  regions: Float32Array;
  plages: Float32Array;
  spots: Float32Array;
  flash: Float32Array;
  burst: number;
  turn(tick: number): void;
}

export interface Sight {
  eye: Triple;
  ahead: Triple;
  wide: number;
}

export interface Roll {
  regions: Float32Array;
  plages: Float32Array;
  spots: Float32Array;
}

const clamp = (value: number, least: number, most: number) =>
  Math.max(least, Math.min(most, value));

const eased = (value: number, from: number, to: number) => {
  const share = clamp((value - from) / (to - from), 0, 1);
  return share * share * (3 - 2 * share);
};

const bell = (random: Random) =>
  Math.sqrt(-2 * Math.log(1 - random.next())) * Math.cos(2 * Math.PI * random.next());

const dot = (one: Triple, other: Triple) =>
  one[0] * other[0] + one[1] * other[1] + one[2] * other[2];

const cross = (one: Triple, other: Triple): Triple => [
  one[1] * other[2] - one[2] * other[1],
  one[2] * other[0] - one[0] * other[2],
  one[0] * other[1] - one[1] * other[0],
];

export function tangentsOf(middle: Triple): [Triple, Triple] {
  const across = cross(Math.abs(middle[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], middle);
  const scale = 1 / Math.hypot(...across);
  const first: Triple = [across[0] * scale, across[1] * scale, across[2] * scale];
  return [first, cross(middle, first)];
}

export function moodOf(seed: number, flame: Flame): Mood {
  const random = createRandom(seed + 271);
  const span = CYCLE_LIFE * (0.7 + 0.6 * random.next());
  const start = random.next();
  const steady = eased(flame.lively, STEADY_FROM, STEADY_TO);
  const most = Math.min(1, clamp(IDLE + 5 * flame.lively, IDLE, 1) * (0.75 + 0.5 * flame.vigor));
  return {
    swell: Math.exp(SWELL * Math.max(flame.lively - SUNLIKE, 0)),
    steady,
    at(tick) {
      const turns = start + tick / span;
      const phase = turns - Math.floor(turns);
      const wave = eased(phase, 0, CYCLE_RISE) * (1 - eased(phase, CYCLE_RISE, 1));
      const cycled = CYCLE_FLOOR + (1 - CYCLE_FLOOR) * wave;
      return { phase, level: most * (cycled + (1 - cycled) * steady) };
    },
  };
}

function frameAt(height: number, turn: number): { middle: Triple; ahead: Triple; upward: Triple } {
  const level = Math.cos(height);
  return {
    middle: [level * Math.cos(turn), Math.sin(height), level * Math.sin(turn)],
    ahead: [Math.sin(turn), 0, -Math.cos(turn)],
    upward: [-Math.sin(height) * Math.cos(turn), level, -Math.sin(height) * Math.sin(turn)],
  };
}

type Risen = Omit<Region, "span" | "shift" | "cycle" | "lasting">;

function emerge(random: Random, flame: Flame, mood: Mood, phase: number): Risen {
  const base = flame.girth * mood.swell;
  const size = clamp(
    Math.exp(SIZE_SPREAD * bell(random)),
    SIZE_LEAST,
    Math.min(SIZE_MOST, GIRTH_MOST / base),
  );
  const girth = base * size;
  const belt =
    flame.belt * (BELT_EARLY + (BELT_LATE - BELT_EARLY) * phase) * (1 - mood.steady) +
    0.95 * mood.steady;
  const scatter = BELT_SCATTER * flame.belt * (1 - mood.steady) + 0.35 * mood.steady;
  const height = (random.next() < 0.5 ? -1 : 1) * clamp(belt + scatter * bell(random), 0.03, 1.35);
  const turn = 2 * Math.PI * random.next();
  const tilt = JOY * Math.abs(height) + (TILT_SCATTER / Math.sqrt(size)) * bell(random);
  const length = Math.min(
    base * (LENGTH_LEAST + LENGTH_GROWTH * size) * (0.75 + 0.5 * random.next()),
    LENGTH_MOST,
  );
  const life = clamp(BRIEF + LASTING * size, BRIEF, 1);
  const born = (1 - life) * random.next();

  const { middle, ahead, upward } = frameAt(height, turn);
  const toward = -Math.sign(height) * Math.sin(tilt);
  const axis = ahead.map((part, at) => Math.cos(tilt) * part + toward * upward[at]) as Triple;
  const side = cross(middle, axis);
  const [first, second] = tangentsOf(middle);
  const seat = (along: number, across: number) => ({
    east: length * (along * dot(axis, first) + across * dot(side, first)),
    north: length * (along * dot(axis, second) + across * dot(side, second)),
  });

  const lone = random.next() < LONE;
  const larger = 0.5 + 0.28 * random.next();
  const front = lone ? 1 : random.next() < LEADER_LARGER ? larger : 1 - larger;
  const split = random.next() < 0.35 ? 0.1 + 0.25 * random.next() : 0;
  const members: Member[] = [
    {
      ...seat(0.5, 0),
      girth: girth * Math.sqrt(front * (1 - split)),
      from: 0,
      until: 0.9,
      fray: 0.05 + 0.3 * random.next() ** 2,
      wear: -0.3,
    },
  ];
  if (split > 0) {
    members.push({
      ...seat(
        0.4 - 0.25 * random.next(),
        (random.next() < 0.5 ? -1 : 1) * (0.1 + 0.15 * random.next()),
      ),
      girth: girth * Math.sqrt(front * split),
      from: 0.03 + 0.1 * random.next(),
      until: 0.45 + 0.3 * random.next(),
      fray: 0.2 + 0.5 * random.next(),
      wear: 0.3,
    });
  }
  if (!lone) {
    const crowd = 1 + Math.floor(3 * random.next() ** 1.5);
    const weights = Array.from({ length: crowd }, (_, at) =>
      at === 0 ? 1 : 0.2 + 0.6 * random.next(),
    );
    const whole = weights.reduce((sum, weight) => sum + weight, 0);
    weights.forEach((weight, at) => {
      members.push({
        ...seat(-0.5 + (at === 0 ? 0 : 0.18 * bell(random)), at === 0 ? 0 : 0.16 * bell(random)),
        girth: girth * Math.sqrt(((1 - front) * weight) / whole),
        from: 0.02 + 0.06 * at * random.next(),
        until: 0.5 + 0.35 * random.next(),
        fray: 0.3 + 0.6 * random.next(),
        wear: 0.3,
      });
    });
    const between = size > 0.8 && random.next() < 0.45 ? 1 + Math.floor(2 * random.next()) : 0;
    for (let pore = 0; pore < between && members.length < MEMBER_ROOM; pore++) {
      const from = 0.05 + 0.15 * random.next();
      members.push({
        ...seat(-0.3 + 0.6 * random.next(), 0.1 * bell(random)),
        girth: girth * (0.12 + 0.15 * random.next()),
        from,
        until: from + 0.3 + 0.25 * random.next(),
        fray: 0.2 + 0.5 * random.next(),
        wear: 0.3,
      });
    }
  }
  return { born, life, middle, reach: reachOf(members), members };
}

function reachOf(members: Member[]): number {
  return Math.max(
    ...members.map((member) => Math.hypot(member.east, member.north) + SKIRT * member.girth),
  );
}

function cap(random: Random, flame: Flame, mood: Mood, side: number): Risen {
  const girth = Math.min(flame.girth * mood.swell * (1.6 + 1.2 * random.next()), GIRTH_MOST);
  const { middle } = frameAt(side * (1.3 + 0.2 * random.next()), 2 * Math.PI * random.next());
  const members: Member[] = Array.from({ length: MEMBER_ROOM }, (_, at) => {
    const away = at === 0 ? 0 : girth * (1.5 + 2 * random.next());
    const around = 2 * Math.PI * random.next();
    return {
      east: away * Math.cos(around),
      north: away * Math.sin(around),
      girth: girth * (at === 0 ? 1 : 0.35 + 0.4 * random.next()),
      from: random.next(),
      until: 1,
      fray: at === 0 ? 0.2 + 0.3 * random.next() : 0.3 + 0.5 * random.next(),
      wear: 0,
    };
  });
  return { born: 0, life: 1, middle, reach: reachOf(members), members };
}

export function createActivity(seed: number, flame: Flame): Activity {
  const starts = createRandom(seed);
  const mood = moodOf(seed, flame);
  const caps = flame.lively > CAP_BOTH ? 2 : flame.lively > CAP_FROM ? 1 : 0;
  const regions: Region[] = Array.from({ length: Math.min(flame.regions, REGION_ROOM) }, () => {
    const span = REGION_LIFE * (0.6 + starts.next());
    return {
      span,
      shift: span * starts.next(),
      cycle: Number.NaN,
      lasting: false,
      born: 0,
      life: 1,
      middle: [0, 1, 0],
      reach: 0,
      members: [],
    };
  });
  regions.slice(0, caps).forEach((region, index) => {
    const random = createRandom(seed + 5381 * (index + 1));
    Object.assign(region, cap(random, flame, mood, index === 0 ? 1 : -1), { lasting: true });
  });
  const activity: Activity = {
    regions: new Float32Array(4 * REGION_ROOM),
    plages: new Float32Array(REGION_ROOM),
    spots: new Float32Array(4 * SPOT_ROOM),
    flash: new Float32Array(4),
    burst: 0,
    turn(tick) {
      activity.regions.fill(0);
      activity.plages.fill(0);
      activity.spots.fill(0);
      regions.forEach((region, index) => {
        const age = (tick + region.shift) / region.span;
        const cycle = Math.floor(age);
        if (!region.lasting && cycle !== region.cycle) {
          const random = createRandom(seed + 7919 * (index + 1) + 104729 * cycle);
          const { phase, level } = mood.at(cycle * region.span - region.shift);
          const risen = emerge(random, flame, mood, phase);
          Object.assign(region, risen, { cycle, life: random.next() < level ? risen.life : 0 });
        }
        const lived = region.lasting ? 0.5 : (age - cycle - region.born) / region.life;
        if (!(lived > 0 && lived < 1)) {
          return;
        }
        activity.regions[4 * index] = region.middle[0];
        activity.regions[4 * index + 1] = region.middle[1];
        activity.regions[4 * index + 2] = region.middle[2];
        activity.regions[4 * index + 3] = region.reach;
        activity.plages[index] = eased(lived, 0, 0.1) * (1 - eased(lived, 0.85, 1));
        const stretch = 0.45 + 0.55 * eased(lived, 0, SPREADING);
        region.members.forEach((member, part) => {
          const area = region.lasting
            ? 0.7 + 0.3 * Math.sin(2 * Math.PI * (age + member.from))
            : eased(lived, member.from, member.from + EMERGING) *
              clamp((member.until - lived) / (member.until - member.from - PEAK), 0, 1);
          if (area <= 0) {
            return;
          }
          const slot = 4 * (index * MEMBER_ROOM + part);
          activity.spots[slot] = stretch * member.east;
          activity.spots[slot + 1] = stretch * member.north;
          activity.spots[slot + 2] = member.girth * Math.sqrt(area);
          activity.spots[slot + 3] = clamp(member.fray + member.wear * lived, 0, 1);
        });
      });

      activity.burst = 0;
      const window = Math.floor(tick / FLARE_SPAN);
      const random = createRandom(seed + 31337 + 15485863 * window);
      const happens = random.next() < FLARE_MOST * flame.lively ** 2;
      const since = tick - FLARE_SPAN * (window + 0.6 * random.next());
      const at = 4 * Math.floor(random.next() * regions.length);
      const power = clamp(0.2 * random.next() ** -0.6, 0.2, 1);
      const reach = activity.regions[at + 3];
      if (happens && since > 0 && reach > 0) {
        activity.flash.set(activity.regions.subarray(at, at + 3));
        activity.flash[3] = reach * (0.15 + 0.25 * random.next());
        activity.burst =
          FLARE_HEAT *
          (0.3 + 0.7 * flame.lively) *
          power *
          Math.min(since / FLARE_RISE, 1) *
          Math.exp(-Math.max(since - FLARE_RISE, 0) / FLARE_FADE);
      }
    },
  };
  return activity;
}

export function createRoll(): Roll {
  return {
    regions: new Float32Array(4 * REGION_ROOM),
    plages: new Float32Array(REGION_ROOM),
    spots: new Float32Array(4 * SPOT_ROOM),
  };
}

function inSight(sight: Sight, middle: Triple, reach: number): boolean {
  const span = Math.sqrt(PLAGE_REACH) * reach + SIGHT_SLACK;
  const far = Math.hypot(...sight.eye);
  const horizon = Math.acos(Math.min(1, 1 / far)) + LIMB_SLACK;
  const arc = 2 * Math.asin(Math.min(1, span / 2));
  if (Math.acos(clamp(dot(middle, sight.eye) / far, -1, 1)) >= horizon + arc) {
    return false;
  }
  const from: Triple = [
    middle[0] - sight.eye[0],
    middle[1] - sight.eye[1],
    middle[2] - sight.eye[2],
  ];
  const along = dot(from, sight.ahead);
  const aside = Math.sqrt(Math.max(dot(from, from) - along * along, 0));
  return aside * Math.cos(sight.wide) - along * Math.sin(sight.wide) < span;
}

export function sift(activity: Activity, sight: Sight | null, roll: Roll): number {
  roll.regions.fill(0);
  roll.plages.fill(0);
  roll.spots.fill(0);
  let kept = 0;
  for (let index = 0; index < REGION_ROOM; index++) {
    const [east, north, south, reach] = activity.regions.subarray(4 * index, 4 * index + 4);
    if (reach <= 0 || (sight !== null && !inSight(sight, [east, north, south], reach))) {
      continue;
    }
    const members = 4 * MEMBER_ROOM;
    roll.regions.set(activity.regions.subarray(4 * index, 4 * index + 4), 4 * kept);
    roll.plages[kept] = activity.plages[index];
    roll.spots.set(activity.spots.subarray(members * index, members * (index + 1)), members * kept);
    kept += 1;
  }
  return kept;
}
