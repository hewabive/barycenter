import type { Random } from "./random.ts";
import type { Body, BodyKind, Relief, StarSystem, Vector } from "./types.ts";

interface Plan {
  kind: BodyKind;
  radius: number;
  orbit: number;
  moons: { kind: BodyKind; radius: number; orbit: number; year: number }[];
}

const STAR_RADIUS = 6;
const HOME_ORBIT = 34;
const HOME_YEAR = 9600;
const HOME_DAY = 1200;
const SPREAD = 0.12;
const MAX_TILT = 0.45;

const PLANETS: Plan[] = [
  { kind: "barren", radius: 0.4, orbit: 16, moons: [] },
  {
    kind: "terran",
    radius: 1,
    orbit: HOME_ORBIT,
    moons: [{ kind: "barren", radius: 0.27, orbit: 9, year: 1600 }],
  },
  { kind: "desert", radius: 0.55, orbit: 52, moons: [] },
  {
    kind: "gas",
    radius: 3.6,
    orbit: 86,
    moons: [
      { kind: "ice", radius: 0.3, orbit: 8.5, year: 900 },
      { kind: "barren", radius: 0.22, orbit: 12, year: 1500 },
    ],
  },
  { kind: "ice", radius: 1.5, orbit: 118, moons: [] },
];

const RELIEFS: Record<BodyKind, Relief> = {
  star: { frequency: 5, warp: 0.6, ridge: 0, sea: null, peak: 0.5 },
  terran: { frequency: 1.2, warp: 0.5, ridge: 0.45, sea: 0, peak: 0.5 },
  desert: { frequency: 1.6, warp: 0.4, ridge: 0.6, sea: null, peak: 0.5 },
  barren: { frequency: 2.4, warp: 0.25, ridge: 0.2, sea: null, peak: 0.5 },
  ice: { frequency: 1.8, warp: 0.55, ridge: 0.7, sea: null, peak: 0.5 },
  gas: { frequency: 2, warp: 0.7, ridge: 0, sea: null, peak: 0.5 },
};

const OPENINGS = ["Ta", "Ke", "Mo", "Vi", "Su", "Ar", "El", "No", "Ri", "Ze", "Ha", "Ol"];
const MIDDLES = ["ra", "li", "no", "ve", "tu", "sha", "mi", "do", ""];
const ENDINGS = ["n", "s", "r", "th", "x", "l", "m", "a", "is", "on"];

export function createSystem(random: Random): StarSystem {
  const taken = new Set<string>();
  const pick = (list: string[]) => list[Math.floor(random.next() * list.length)];
  const name = (): string => {
    const made = pick(OPENINGS) + pick(MIDDLES) + pick(ENDINGS);
    if (taken.has(made)) {
      return name();
    }
    taken.add(made);
    return made;
  };
  const spread = (value: number) => value * (1 + SPREAD * (2 * random.next() - 1));
  const seed = () => Math.floor(random.next() * 0x7fffffff);
  const turn = () => 2 * Math.PI * random.next();

  const bodies: Body[] = [
    {
      id: 0,
      name: name(),
      kind: "star",
      seed: seed(),
      radius: STAR_RADIUS,
      parent: null,
      orbit: 0,
      year: 0,
      phase: 0,
      tilt: 0,
      day: 4000,
      relief: RELIEFS.star,
    },
  ];
  let home = 0;
  for (const plan of PLANETS) {
    const id = bodies.length;
    const settled = plan.kind === "terran";
    const orbit = settled ? plan.orbit : spread(plan.orbit);
    bodies.push({
      id,
      name: name(),
      kind: plan.kind,
      seed: seed(),
      radius: settled ? plan.radius : spread(plan.radius),
      parent: 0,
      orbit,
      year: Math.round(HOME_YEAR * (orbit / HOME_ORBIT) ** 1.5),
      phase: turn(),
      tilt: MAX_TILT * random.next(),
      day: settled ? HOME_DAY : Math.round(spread(HOME_DAY) * (0.5 + random.next())),
      relief: RELIEFS[plan.kind],
    });
    if (settled) {
      home = id;
    }
    for (const moon of plan.moons) {
      bodies.push({
        id: bodies.length,
        name: name(),
        kind: moon.kind,
        seed: seed(),
        radius: spread(moon.radius),
        parent: id,
        orbit: moon.orbit,
        year: moon.year,
        phase: turn(),
        tilt: 0,
        day: moon.year,
        relief: RELIEFS[moon.kind],
      });
    }
  }
  return { home, bodies };
}

export function positionOf(system: StarSystem, id: number, tick: number): Vector {
  const body = system.bodies[id];
  if (body.parent === null) {
    return { x: 0, y: 0, z: 0 };
  }
  const center = positionOf(system, body.parent, tick);
  const angle = body.phase + (2 * Math.PI * tick) / body.year;
  return {
    x: center.x + body.orbit * Math.cos(angle),
    y: center.y,
    z: center.z + body.orbit * Math.sin(angle),
  };
}

export function spinOf(body: Body, tick: number): number {
  return (2 * Math.PI * tick) / body.day;
}
