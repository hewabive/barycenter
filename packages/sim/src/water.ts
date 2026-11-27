import {
  GRAVITY,
  holdsSteam,
  RADIATION,
  RUNAWAY,
  SUN_GLOW,
  SUN_MASS,
  XUV_GLOW,
  XUV_SATURATED,
  XUV_SHARE,
  YEAR,
} from "./physics.ts";

export interface Shine {
  glow: number;
  mass: number;
}

export interface Course {
  shine: (time: number) => Shine;
  marks: number[];
  done: number;
  airborne: boolean;
}

export interface Grown {
  glow: number;
  whole: number;
  mass: number;
  radius: number;
  ice: number;
  age: number;
  distance: number;
  lent: number;
}

export interface Past {
  lost: number;
}

const FIRST = 1e5 * YEAR;
const NODES = 8;
const WIDTH_POWER = 1 / 3.7;
const WATER_PER_HYDROGEN = 9;
export const BARE_ICE = 200;

export function grownShare(course: Course, time: number): number {
  if (time >= course.done) {
    return 1;
  }
  const part = Math.max(0, time / course.done);
  return course.airborne ? part ** 3 : part;
}

function feedOf(course: Course, whole: number, time: number): number {
  if (time >= course.done) {
    return 0;
  }
  const part = Math.max(0, time / course.done);
  return ((course.airborne ? 3 * part ** 2 : 1) * whole) / course.done;
}

export function fallingLight(mass: number, radius: number, feed: number): number {
  return feed > 0 ? (GRAVITY * mass * feed) / (Math.PI * radius ** 3) : 0;
}

function hardBy(time: number): number {
  if (time <= XUV_SATURATED) {
    return time;
  }
  return XUV_SATURATED * (3 - 2 * Math.sqrt(XUV_SATURATED / time));
}

export function nodesTo(age: number, marks: number[] = []): number[] {
  const nodes: number[] = [...marks.filter((mark) => mark > FIRST && mark < age), age];
  for (let step = 1; FIRST * 10 ** (step / NODES) < age; step++) {
    nodes.push(FIRST * 10 ** (step / NODES));
  }
  return nodes.sort((left, right) => left - right);
}

export function pastOf(
  body: Grown,
  course: Course,
  airy: (mass: number, radius: number, heat: number) => boolean,
): Past {
  const now = course.shine(body.age);
  const brighter = now.glow > 0 ? body.glow / now.glow : 1;
  let lost = 0;
  let before = Math.min(FIRST, body.age);
  const at = (time: number) => {
    const shine = course.shine(time);
    const distance = (body.distance * now.mass) / shine.mass;
    const mass = Math.max(body.whole * grownShare(course, time), 1e-6 * body.whole);
    const radius = body.radius * (mass / body.mass) ** WIDTH_POWER;
    const light =
      (brighter * shine.glow) / (4 * Math.PI * distance ** 2) +
      body.lent +
      fallingLight(mass, radius, feedOf(course, body.whole, time));
    const heat = (light / (4 * RADIATION)) ** 0.25;
    return {
      shine,
      distance,
      mass,
      radius,
      light,
      bared: heat > BARE_ICE && !holdsSteam(mass, radius, heat) && !airy(mass, radius, heat),
    };
  };
  for (const time of nodesTo(body.age, course.marks)) {
    if (time <= before) {
      continue;
    }
    const { shine, distance, mass, radius, light, bared } = at(Math.sqrt(before * time));
    const held = body.ice * body.whole * grownShare(course, time) - lost;
    if (bared || at(time).bared) {
      lost += Math.max(0, held);
    } else if (light >= RUNAWAY) {
      const hard = (XUV_GLOW * SUN_GLOW * shine.mass) / SUN_MASS;
      const dose = (hard * (hardBy(time) - hardBy(before))) / (4 * Math.PI * distance ** 2);
      const taken =
        (WATER_PER_HYDROGEN * XUV_SHARE * Math.PI * radius ** 3 * dose) / (GRAVITY * mass);
      lost += Math.max(0, Math.min(held, taken));
    }
    before = time;
  }
  return { lost };
}

export function steadyCourse(glow: number, mass: number, done = 0): Course {
  return { shine: () => ({ glow, mass }), marks: [], done, airborne: false };
}
