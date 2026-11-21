import { evolve, type Jacobi, jacobiOf, ladderOf, type MishapKind } from "./nbody.ts";
import { laplaceOf, starborn } from "./physics.ts";
import type { Survey } from "./types.ts";

export const CAUSES = [
  "planets too close",
  "planets stirred",
  "planet and star",
  "planet",
  "steep moon",
  "moons too close",
  "moon at the edge of its hold",
  "moon",
  "moon of a moon",
  "sharing an orbit",
  "stars",
] as const;

export type Cause = (typeof CAUSES)[number];

export interface Standing {
  gap: number;
  hold: number;
  lean: number;
  laplace: number;
}

export interface Loss {
  body: number;
  other: number;
  kind: MishapKind;
  turns: number;
  cause: Cause;
}

export interface Trial {
  losses: Loss[];
  steps: number;
}

const LADDER = 8;
const RETRIES = 4;
const CLOSE_GAP = 5;
const EDGE_HOLD = 0.3;
const STEEP = [0.68, Math.PI - 0.68];

export function gapOf(jacobi: Jacobi, near: number, far: number): number {
  const { orbits, stretches, weights, inner } = jacobi;
  const hill =
    Math.cbrt((weights[near] + weights[far]) / (3 * inner[near])) *
    0.5 *
    (orbits[near] + orbits[far]);
  return (orbits[far] * (1 - stretches[far]) - orbits[near] * (1 + stretches[near])) / hill;
}

export function standingsOf(system: Survey, jacobi: Jacobi): Standing[] {
  const { bodies } = system;
  const { parents, kids, orbits, stretches, weights, inner, masses, normals } = jacobi;
  const standings: Standing[] = bodies.map(() => ({
    gap: Number.POSITIVE_INFINITY,
    hold: 0,
    lean: 0,
    laplace: 0,
  }));
  for (const body of bodies) {
    const { id } = body;
    const host = parents[id];
    if (host < 0) {
      continue;
    }
    const rows = kids[host].filter(
      (kid) => bodies[kid].shared === null && !starborn(bodies[kid].physics),
    );
    const at = rows.indexOf(body.shared === null ? id : body.shared.with);
    const mine = standings[id];
    if (at > 0) {
      mine.gap = Math.min(mine.gap, gapOf(jacobi, rows[at - 1], rows[at]));
    }
    if (at >= 0 && at + 1 < rows.length) {
      mine.gap = Math.min(mine.gap, gapOf(jacobi, rows[at], rows[at + 1]));
    }
    if (parents[host] < 0) {
      continue;
    }
    const reach =
      orbits[host] * (1 - stretches[host]) * Math.cbrt(weights[host] / (3 * inner[host]));
    mine.hold = (orbits[id] * (1 + stretches[id])) / reach;
    const cosine =
      normals[3 * id] * normals[3 * host] +
      normals[3 * id + 1] * normals[3 * host + 1] +
      normals[3 * id + 2] * normals[3 * host + 2];
    mine.lean = Math.acos(Math.max(-1, Math.min(1, cosine)));
    const rings = kids[host]
      .filter((kid) => orbits[kid] < orbits[id])
      .reduce((sum, kid) => sum + (0.5 * weights[kid] * orbits[kid] ** 2) / masses[host], 0);
    mine.laplace =
      orbits[id] /
      laplaceOf(
        jacobi.bulges[host] + rings,
        orbits[host],
        stretches[host],
        masses[host],
        inner[host],
      );
  }
  return standings;
}

function causeOf(
  system: Survey,
  jacobi: Jacobi,
  standings: Standing[],
  body: number,
  other: number,
  kind: MishapKind,
): Cause {
  const { bodies } = system;
  const { parents, kids } = jacobi;
  const mine = bodies[body];
  const theirs = bodies[other];
  if (mine.shared !== null || theirs.shared?.with === body) {
    return "sharing an orbit";
  }
  if (starborn(mine.physics)) {
    return "stars";
  }
  const host = parents[body];
  const alone = other === host || kind === "escape" || kind === "stretched";
  const rows = kids[host].filter((kid) => bodies[kid].shared === null);
  const beside = Math.abs(rows.indexOf(body) - rows.indexOf(other)) === 1;
  const [near, far] = jacobi.orbits[body] <= jacobi.orbits[other] ? [body, other] : [other, body];
  const between = !alone && beside ? gapOf(jacobi, near, far) : null;
  const steep = (id: number) => standings[id].lean > STEEP[0] && standings[id].lean < STEEP[1];
  if (!starborn(bodies[host].physics)) {
    if (parents[host] >= 0 && !starborn(bodies[parents[host]].physics)) {
      return "moon of a moon";
    }
    if (between !== null && between < CLOSE_GAP) {
      return "moons too close";
    }
    if (steep(body) || (!alone && steep(other))) {
      return "steep moon";
    }
    if (alone && standings[body].gap < CLOSE_GAP) {
      return "moons too close";
    }
    const edge = (id: number) => standings[id].hold > EDGE_HOLD;
    return edge(body) || (!alone && edge(other)) ? "moon at the edge of its hold" : "moon";
  }
  if (alone) {
    return standings[body].gap < CLOSE_GAP ? "planets too close" : "planet";
  }
  if (starborn(theirs.physics)) {
    return "planet and star";
  }
  if (between !== null && between < CLOSE_GAP) {
    return "planets too close";
  }
  return "planets stirred";
}

export function trial(system: Survey, turns: number): Trial {
  const jacobi = jacobiOf(system);
  const standings = standingsOf(system, jacobi);
  const lost = new Map<number, Loss>();
  let steps = 0;
  for (const cut of ladderOf(jacobi, LADDER)) {
    const absent = new Set<number>();
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      const run = evolve(jacobi, { cut, span: turns * cut, absent });
      steps += run.steps;
      if (run.mishap === null) {
        break;
      }
      const { kind, body, other, time } = run.mishap;
      const single = kind === "escape" || kind === "stretched";
      const drop = single || jacobi.weights[body] <= jacobi.weights[other] ? body : other;
      if (jacobi.parents[drop] < 0) {
        break;
      }
      const loss: Loss = {
        body: drop,
        other: drop === body ? other : body,
        kind,
        turns: time / jacobi.years[drop],
        cause: causeOf(system, jacobi, standings, drop, drop === body ? other : body, kind),
      };
      const known = lost.get(drop);
      if (known === undefined || known.turns > loss.turns) {
        lost.set(drop, loss);
      }
      absent.add(drop);
    }
  }
  return { losses: [...lost.values()], steps };
}
