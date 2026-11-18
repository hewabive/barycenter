import { createRandom, type Random } from "@barycenter/sim";
import type { Flame } from "./looks.ts";
import { PROMINENCE_ROOM } from "./shaders.ts";
import { type Mood, moodOf } from "./spots.ts";

const PROMINENCE_LIFE = 2800;
const QUIET = 0.55;
const LOW = 0.3;
const ERUPTING = 0.35;
const RISING = 0.12;
const BURST = 0.3;
const TALLER = 0.8;
const SPARSE = 0.5;

type Triple = [number, number, number];

interface Prominence {
  span: number;
  shift: number;
  cycle: number;
  born: number;
  life: number;
  seat: Triple;
  lean: Triple;
  reach: number;
  height: number;
  legs: number;
  hollow: number;
  erupts: boolean;
}

export interface Prominences {
  seats: Float32Array;
  leans: Float32Array;
  forms: Float32Array;
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

function raise(
  random: Random,
  flame: Flame,
  mood: Mood,
): Omit<Prominence, "span" | "shift" | "cycle"> {
  const kind = random.next();
  const side = random.next() < 0.5 ? -1 : 1;
  const turn = 2 * Math.PI * random.next();
  const pick = random.next();
  const more = random.next();
  const shape =
    kind < QUIET
      ? {
          height: 0.35 + 0.95 * pick ** 1.2,
          slant: 0.45 * bell(random),
          reach: 0.08 * Math.exp(1.3 * more),
          rise: 0.025 + 0.045 * random.next(),
          legs: random.next() < 0.2 ? 0 : 2 + Math.floor(4 * more * (0.6 + 0.4 * random.next())),
          hollow: 0.3 + 0.45 * random.next(),
          life: 0.6 + 0.4 * random.next(),
        }
      : kind < QUIET + LOW
        ? {
            height: flame.belt * (0.2 + 0.8 * pick),
            slant: Math.PI * random.next(),
            reach: 0.03 + 0.05 * more,
            rise: 0.008 + 0.012 * random.next(),
            legs: Math.floor(3 * random.next()),
            hollow: 0.3 + 0.4 * random.next(),
            life: 0.25 + 0.25 * random.next(),
          }
        : {
            height: flame.belt * (0.2 + 0.8 * pick),
            slant: 0.5 * bell(random),
            reach: 0.03 + 0.03 * more,
            rise: 0.03 + 0.05 * random.next(),
            legs: 1,
            hollow: 0.7 + 0.2 * random.next(),
            life: 0.2 + 0.2 * random.next(),
          };
  const height = side * Math.min(shape.height, 1.4);
  const level = Math.cos(height);
  const seat: Triple = [level * Math.cos(turn), Math.sin(height), level * Math.sin(turn)];
  const east: Triple = [-Math.sin(turn), 0, Math.cos(turn)];
  const north: Triple = [
    -Math.sin(height) * Math.cos(turn),
    level,
    -Math.sin(height) * Math.sin(turn),
  ];
  const lean = east.map(
    (part, at) => Math.cos(shape.slant) * part + Math.sin(shape.slant) * north[at],
  ) as Triple;
  return {
    born: (1 - shape.life) * random.next(),
    life: shape.life,
    seat,
    lean,
    reach: shape.reach,
    height: shape.rise * (1 + TALLER * mood.steady),
    legs: shape.legs,
    hollow: shape.hollow,
    erupts: random.next() < ERUPTING,
  };
}

export function createProminences(seed: number, flame: Flame): Prominences {
  const starts = createRandom(seed + 613);
  const mood = moodOf(seed, flame);
  const count = Math.min(flame.regions, PROMINENCE_ROOM);
  const all: Prominence[] = Array.from({ length: count }, () => {
    const span = PROMINENCE_LIFE * (0.6 + starts.next());
    return {
      span,
      shift: span * starts.next(),
      cycle: Number.NaN,
      born: 0,
      life: 1,
      seat: [0, 1, 0],
      lean: [1, 0, 0],
      reach: 0,
      height: 0,
      legs: 0,
      hollow: 0,
      erupts: false,
    };
  });
  const prominences: Prominences = {
    seats: new Float32Array(4 * PROMINENCE_ROOM),
    leans: new Float32Array(4 * PROMINENCE_ROOM),
    forms: new Float32Array(4 * PROMINENCE_ROOM),
    turn(tick) {
      prominences.forms.fill(0);
      all.forEach((one, index) => {
        const age = (tick + one.shift) / one.span;
        const cycle = Math.floor(age);
        if (cycle !== one.cycle) {
          const random = createRandom(seed + 15485863 + 7919 * (index + 1) + 104729 * cycle);
          const risen = raise(random, flame, mood);
          const { level } = mood.at(cycle * one.span - one.shift);
          const shown = random.next() < SPARSE + (1 - SPARSE) * level;
          Object.assign(one, risen, { cycle, life: shown ? risen.life : 0 });
        }
        const lived = (age - cycle - one.born) / one.life;
        if (!(lived > 0 && lived < 1)) {
          return;
        }
        const leaving = eased(lived, 1 - RISING, 1);
        const slot = 4 * index;
        prominences.seats.set(one.seat, slot);
        prominences.seats[slot + 3] = one.reach;
        prominences.leans.set(one.lean, slot);
        prominences.leans[slot + 3] = one.height;
        prominences.forms[slot] = eased(lived, 0, RISING) * (1 - leaving);
        prominences.forms[slot + 1] = one.legs;
        prominences.forms[slot + 2] = one.hollow;
        prominences.forms[slot + 3] = one.erupts ? BURST * leaving * leaving : 0;
      });
    },
  };
  return prominences;
}
