import { createRandom, type Random } from "@barycenter/sim";
import type { Flame } from "./looks.ts";
import { MEMBER_ROOM, REGION_ROOM, SPOT_ROOM } from "./shaders.ts";

const REGION_LIFE = 1400;
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
const SKIRT = 4.2;
const EMERGING = 0.12;
const PEAK = 0.15;
const SPREADING = 0.3;

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
  born: number;
  life: number;
  middle: Triple;
  reach: number;
  members: Member[];
}

export interface Activity {
  regions: Float32Array;
  plages: Float32Array;
  spots: Float32Array;
  turn(tick: number): void;
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

function emerge(random: Random, flame: Flame): Omit<Region, "span" | "shift" | "cycle"> {
  const size = clamp(Math.exp(SIZE_SPREAD * bell(random)), SIZE_LEAST, SIZE_MOST);
  const girth = flame.girth * size;
  const height = (random.next() < 0.5 ? -1 : 1) * flame.belt * (0.2 + 0.8 * random.next());
  const turn = 2 * Math.PI * random.next();
  const tilt = JOY * Math.abs(height) + (TILT_SCATTER / Math.sqrt(size)) * bell(random);
  const length = flame.girth * (LENGTH_LEAST + LENGTH_GROWTH * size) * (0.75 + 0.5 * random.next());
  const life = clamp(BRIEF + LASTING * size, BRIEF, 1);
  const born = (1 - life) * random.next();

  const level = Math.cos(height);
  const middle: Triple = [level * Math.cos(turn), Math.sin(height), level * Math.sin(turn)];
  const ahead: Triple = [Math.sin(turn), 0, -Math.cos(turn)];
  const upward: Triple = [
    -Math.sin(height) * Math.cos(turn),
    level,
    -Math.sin(height) * Math.sin(turn),
  ];
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
  const reach = Math.max(
    ...members.map((member) => Math.hypot(member.east, member.north) + SKIRT * member.girth),
  );
  return { born, life, middle, reach, members };
}

export function createActivity(seed: number, flame: Flame): Activity {
  const starts = createRandom(seed);
  const regions: Region[] = Array.from({ length: Math.min(flame.regions, REGION_ROOM) }, () => {
    const span = REGION_LIFE * (0.6 + starts.next());
    return {
      span,
      shift: span * starts.next(),
      cycle: Number.NaN,
      born: 0,
      life: 1,
      middle: [0, 1, 0],
      reach: 0,
      members: [],
    };
  });
  const activity: Activity = {
    regions: new Float32Array(4 * REGION_ROOM),
    plages: new Float32Array(REGION_ROOM),
    spots: new Float32Array(4 * SPOT_ROOM),
    turn(tick) {
      activity.regions.fill(0);
      activity.plages.fill(0);
      activity.spots.fill(0);
      regions.forEach((region, index) => {
        const age = (tick + region.shift) / region.span;
        const cycle = Math.floor(age);
        if (cycle !== region.cycle) {
          const random = createRandom(seed + 7919 * (index + 1) + 104729 * cycle);
          Object.assign(region, emerge(random, flame), { cycle });
        }
        const lived = (age - cycle - region.born) / region.life;
        if (lived <= 0 || lived >= 1) {
          return;
        }
        activity.regions[4 * index] = region.middle[0];
        activity.regions[4 * index + 1] = region.middle[1];
        activity.regions[4 * index + 2] = region.middle[2];
        activity.regions[4 * index + 3] = region.reach;
        activity.plages[index] = eased(lived, 0, 0.1) * (1 - eased(lived, 0.85, 1));
        const stretch = 0.45 + 0.55 * eased(lived, 0, SPREADING);
        region.members.forEach((member, part) => {
          const area =
            eased(lived, member.from, member.from + EMERGING) *
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
    },
  };
  return activity;
}
