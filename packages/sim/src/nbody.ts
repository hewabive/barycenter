import { railsOf } from "./flight.ts";
import { bulgeOf } from "./interior.ts";
import { GRAVITY } from "./physics.ts";
import { poleOf } from "./system.ts";
import type { Survey, Vector } from "./types.ts";

export interface Member {
  parent: number | null;
  mass: number;
  radius: number;
  orbit: number;
  bulge: number;
  pole: Vector;
}

export interface Jacobi {
  count: number;
  parents: Int32Array;
  kids: number[][];
  masses: Float64Array;
  weights: Float64Array;
  inner: Float64Array;
  radii: Float64Array;
  offsets: Float64Array;
  rates: Float64Array;
  orbits: Float64Array;
  stretches: Float64Array;
  years: Float64Array;
  normals: Float64Array;
  poles: Float64Array;
  bulges: Float64Array;
}

export const MISHAPS = ["encounter", "collision", "escape", "stretched"] as const;

export type MishapKind = (typeof MISHAPS)[number];

export interface Mishap {
  kind: MishapKind;
  time: number;
  body: number;
  other: number;
}

export interface Track {
  body: number;
  low: number;
  high: number;
  stretch: number;
  lean: number;
}

export interface Watch {
  cut: number;
  span: number;
  absent?: ReadonlySet<number>;
  paces?: number;
}

export interface Run {
  span: number;
  steps: number;
  bodies: number;
  mishap: Mishap | null;
  tracks: Track[];
  drift: number;
}

const PACES = 20;
const COARSEST = 3;
const STRIDE = 16;
const REFINES = 6;
const HEAVY_PAIR = 0.05;
const STEPS_MOST = 6e7;
const KEPLER_STEPS = 12;
const KEPLER_CLOSE = 1e-15;
const NOBODY: ReadonlySet<number> = new Set();

interface Shape {
  orbit: number;
  stretch: number;
  x: number;
  y: number;
  z: number;
}

function shapeOf(pull: number, offsets: Float64Array, rates: Float64Array, at: number): Shape {
  const base = 3 * at;
  const rx = offsets[base];
  const ry = offsets[base + 1];
  const rz = offsets[base + 2];
  const vx = rates[base];
  const vy = rates[base + 1];
  const vz = rates[base + 2];
  const bound = (2 * pull) / Math.hypot(rx, ry, rz) - (vx * vx + vy * vy + vz * vz);
  const orbit = pull / bound;
  const x = ry * vz - rz * vy;
  const y = rz * vx - rx * vz;
  const z = rx * vy - ry * vx;
  const stretch = Math.sqrt(Math.max(0, 1 - (x * x + y * y + z * z) / (pull * orbit)));
  return { orbit, stretch, x, y, z };
}

function nearTurn(year: number, stretch: number): number {
  return year * Math.sqrt((1 - stretch) ** 3 / (1 + stretch));
}

export function assemble(members: Member[], at: Float64Array, speed: Float64Array): Jacobi {
  const count = members.length;
  const parents = Int32Array.from(members, (member) => member.parent ?? -1);
  const masses = Float64Array.from(members, (member) => member.mass);
  const kids: number[][] = members.map(() => []);
  members.forEach((member, id) => {
    if (member.parent !== null) {
      kids[member.parent].push(id);
    }
  });
  for (const list of kids) {
    list.sort((left, right) => members[left].orbit - members[right].orbit || left - right);
  }
  const weights = Float64Array.from(masses);
  const middles = new Float64Array(3 * count);
  const drifts = new Float64Array(3 * count);
  for (let id = 0; id < count; id++) {
    for (let axis = 0; axis < 3; axis++) {
      middles[3 * id + axis] = masses[id] * at[3 * id + axis];
      drifts[3 * id + axis] = masses[id] * speed[3 * id + axis];
    }
  }
  for (let id = count - 1; id >= 0; id--) {
    const parent = parents[id];
    if (parent < 0) {
      continue;
    }
    weights[parent] += weights[id];
    for (let axis = 0; axis < 3; axis++) {
      middles[3 * parent + axis] += middles[3 * id + axis];
      drifts[3 * parent + axis] += drifts[3 * id + axis];
    }
  }
  for (let id = 0; id < count; id++) {
    for (let axis = 0; axis < 3; axis++) {
      middles[3 * id + axis] /= weights[id];
      drifts[3 * id + axis] /= weights[id];
    }
  }
  const inner = new Float64Array(count);
  const offsets = new Float64Array(3 * count);
  const rates = new Float64Array(3 * count);
  const orbits = new Float64Array(count);
  const stretches = new Float64Array(count);
  const years = new Float64Array(count).fill(Number.POSITIVE_INFINITY);
  const normals = new Float64Array(3 * count);
  for (let id = 0; id < count; id++) {
    let within = masses[id];
    const hub = [at[3 * id], at[3 * id + 1], at[3 * id + 2]];
    const pace = [speed[3 * id], speed[3 * id + 1], speed[3 * id + 2]];
    for (const kid of kids[id]) {
      inner[kid] = within;
      const whole = within + weights[kid];
      for (let axis = 0; axis < 3; axis++) {
        offsets[3 * kid + axis] = middles[3 * kid + axis] - hub[axis];
        rates[3 * kid + axis] = drifts[3 * kid + axis] - pace[axis];
        hub[axis] = (hub[axis] * within + middles[3 * kid + axis] * weights[kid]) / whole;
        pace[axis] = (pace[axis] * within + drifts[3 * kid + axis] * weights[kid]) / whole;
      }
      within = whole;
      const pull = GRAVITY * whole;
      const shape = shapeOf(pull, offsets, rates, kid);
      const turn = Math.hypot(shape.x, shape.y, shape.z);
      orbits[kid] = shape.orbit;
      stretches[kid] = shape.stretch;
      years[kid] = 2 * Math.PI * Math.sqrt(shape.orbit ** 3 / pull);
      normals[3 * kid] = shape.x / turn;
      normals[3 * kid + 1] = shape.y / turn;
      normals[3 * kid + 2] = shape.z / turn;
    }
  }
  return {
    count,
    parents,
    kids,
    masses,
    weights,
    inner,
    radii: Float64Array.from(members, (member) => member.radius),
    offsets,
    rates,
    orbits,
    stretches,
    years,
    normals,
    poles: Float64Array.from(members.flatMap(({ pole }) => [pole.x, pole.y, pole.z])),
    bulges: Float64Array.from(members, (member) => member.bulge),
  };
}

export function jacobiOf(system: Survey): Jacobi {
  const rails = railsOf(system);
  const at = new Float64Array(3 * rails.count);
  const speed = new Float64Array(3 * rails.count);
  rails.place(0, at, speed);
  return assemble(
    system.bodies.map((body) => ({
      parent: body.parent,
      mass: body.physics.mass,
      radius: body.physics.radius,
      orbit: body.physics.orbit,
      bulge: bulgeOf(body.physics),
      pole: poleOf(body),
    })),
    at,
    speed,
  );
}

export function ladderOf(jacobi: Jacobi, ratio: number): number[] {
  const cuts: number[] = [];
  let next = 0;
  for (const year of Array.from(jacobi.years).sort((left, right) => left - right)) {
    if (Number.isFinite(year) && year >= next) {
      cuts.push(year);
      next = year * ratio;
    }
  }
  return cuts;
}

export function evolve(jacobi: Jacobi, watch: Watch): Run {
  const absent = watch.absent ?? NOBODY;
  const paces = watch.paces ?? PACES;
  const coarsest = paces / COARSEST;
  const ids: number[] = [];
  const dropped = new Uint8Array(jacobi.count);
  for (let id = 0; id < jacobi.count; id++) {
    const parent = jacobi.parents[id];
    const out =
      parent >= 0 && (dropped[parent] === 1 || absent.has(id) || jacobi.years[id] < watch.cut);
    dropped[id] = out ? 1 : 0;
    if (!out) {
      ids.push(id);
    }
  }
  const count = ids.length;
  const seat = new Int32Array(jacobi.count).fill(-1);
  ids.forEach((id, at) => {
    seat[id] = at;
  });
  const parents = new Int32Array(count);
  const kids: number[][] = ids.map(() => []);
  const masses = new Float64Array(count);
  const radii = new Float64Array(count);
  const depths = new Int32Array(count);
  const tensors = new Float64Array(6 * count);
  const oblate = new Uint8Array(count);
  let deepest = 0;
  for (let at = 0; at < count; at++) {
    const id = ids[at];
    const above = jacobi.parents[id];
    parents[at] = above < 0 ? -1 : seat[above];
    masses[at] = jacobi.masses[id];
    radii[at] = jacobi.radii[id];
    const bulge = (strength: number, x: number, y: number, z: number) => {
      if (strength <= 0) {
        return;
      }
      oblate[at] = 1;
      tensors[6 * at] += strength * (3 * x * x - 1);
      tensors[6 * at + 1] += strength * (3 * y * y - 1);
      tensors[6 * at + 2] += strength * (3 * z * z - 1);
      tensors[6 * at + 3] += strength * 3 * x * y;
      tensors[6 * at + 4] += strength * 3 * x * z;
      tensors[6 * at + 5] += strength * 3 * y * z;
    };
    bulge(
      jacobi.masses[id] * jacobi.bulges[id],
      jacobi.poles[3 * id],
      jacobi.poles[3 * id + 1],
      jacobi.poles[3 * id + 2],
    );
    for (const kid of jacobi.kids[id]) {
      if (seat[kid] >= 0) {
        kids[at].push(seat[kid]);
      } else if (!absent.has(kid)) {
        masses[at] += jacobi.weights[kid];
        const reduced =
          (jacobi.weights[kid] * jacobi.inner[kid]) / (jacobi.weights[kid] + jacobi.inner[kid]);
        bulge(
          0.5 * reduced * jacobi.orbits[kid] ** 2 * (1 + 1.5 * jacobi.stretches[kid] ** 2),
          jacobi.normals[3 * kid],
          jacobi.normals[3 * kid + 1],
          jacobi.normals[3 * kid + 2],
        );
      }
    }
    if (parents[at] >= 0) {
      depths[at] = depths[parents[at]] + 1;
      deepest = Math.max(deepest, depths[at]);
    }
  }
  const whole = Float64Array.from(masses);
  for (let at = count - 1; at >= 1; at--) {
    whole[parents[at]] += whole[at];
  }
  const inner = new Float64Array(count);
  const pulls = new Float64Array(count);
  const shares = new Float64Array(count);
  const offsets = new Float64Array(3 * count);
  const rates = new Float64Array(3 * count);
  for (let at = 0; at < count; at++) {
    let within = masses[at];
    for (const kid of kids[at]) {
      const id = ids[kid];
      inner[kid] = within;
      within += whole[kid];
      pulls[kid] = GRAVITY * within;
      shares[kid] = whole[kid] / within;
      const kept = Math.sqrt(within / (jacobi.weights[id] + jacobi.inner[id]));
      for (let axis = 0; axis < 3; axis++) {
        offsets[3 * kid + axis] = jacobi.offsets[3 * id + axis];
        rates[3 * kid + axis] = kept * jacobi.rates[3 * id + axis];
      }
    }
  }

  const levels = deepest + 1;
  const lines = ids.map((_, at) => {
    const line = [at];
    for (let up = parents[at]; up >= 0; up = parents[up]) {
      line.push(up);
    }
    return line.reverse();
  });
  const forks = new Int32Array(count * count);
  const near = new Float64Array(count * count);
  const touch = new Float64Array(count * count);
  for (let one = 0; one < count; one++) {
    for (let two = one + 1; two < count; two++) {
      let level = 0;
      while (
        level < lines[one].length &&
        level < lines[two].length &&
        lines[one][level] === lines[two][level]
      ) {
        level += 1;
      }
      const pair = one * count + two;
      forks[pair] = level - 1;
      const contact = radii[one] + radii[two];
      touch[pair] = contact * contact;
      let reach = 0;
      if (parents[one] === parents[two] && parents[one] >= 0) {
        const first = jacobi.orbits[ids[one]] <= jacobi.orbits[ids[two]] ? one : two;
        const share = (whole[one] + whole[two]) / inner[first];
        if (share < HEAVY_PAIR) {
          reach = Math.cbrt(share / 3) * 0.5 * (jacobi.orbits[ids[one]] + jacobi.orbits[ids[two]]);
        }
      }
      near[pair] = Math.max(reach, contact) ** 2;
    }
  }

  const tracks: Track[] = ids.slice(1).map((id) => ({
    body: id,
    low: 1,
    high: 1,
    stretch: jacobi.stretches[id],
    lean: 0,
  }));
  const hangs = new Float64Array(3 * count);
  const steps = new Float64Array(3 * count);
  const fromAbove = new Float64Array(3 * count * levels);
  const tugs = new Float64Array(3 * count);
  const loads = new Float64Array(3 * count);
  let mishap: Mishap | null = null;
  let now = 0;
  const met = (): Mishap | null => mishap;

  const place = () => {
    hangs.fill(0);
    for (let at = 1; at < count; at++) {
      const above = 3 * parents[at];
      const share = shares[at];
      hangs[above] -= share * offsets[3 * at];
      hangs[above + 1] -= share * offsets[3 * at + 1];
      hangs[above + 2] -= share * offsets[3 * at + 2];
    }
    for (let at = 0; at < count; at++) {
      const list = kids[at];
      let x = 0;
      let y = 0;
      let z = 0;
      for (let slot = 0; slot < list.length; slot++) {
        const kid = list[slot];
        const base = 3 * kid;
        steps[base] = offsets[base] + x + hangs[base];
        steps[base + 1] = offsets[base + 1] + y + hangs[base + 1];
        steps[base + 2] = offsets[base + 2] + z + hangs[base + 2];
        x += shares[kid] * offsets[base];
        y += shares[kid] * offsets[base + 1];
        z += shares[kid] * offsets[base + 2];
      }
    }
    for (let at = 1; at < count; at++) {
      const above = parents[at];
      const mine = 3 * at * levels;
      const theirs = 3 * above * levels;
      for (let level = 0; level <= depths[above]; level++) {
        fromAbove[mine + 3 * level] = steps[3 * at] + fromAbove[theirs + 3 * level];
        fromAbove[mine + 3 * level + 1] = steps[3 * at + 1] + fromAbove[theirs + 3 * level + 1];
        fromAbove[mine + 3 * level + 2] = steps[3 * at + 2] + fromAbove[theirs + 3 * level + 2];
      }
    }
  };

  const pull = () => {
    tugs.fill(0);
    for (let one = 0; one < count; one++) {
      const mine = 3 * one * levels;
      const heft = GRAVITY * masses[one];
      for (let two = one + 1; two < count; two++) {
        const pair = one * count + two;
        const level = 3 * forks[pair];
        const theirs = 3 * two * levels;
        const dx = fromAbove[theirs + level] - fromAbove[mine + level];
        const dy = fromAbove[theirs + level + 1] - fromAbove[mine + level + 1];
        const dz = fromAbove[theirs + level + 2] - fromAbove[mine + level + 2];
        const apart = dx * dx + dy * dy + dz * dz;
        if (apart < near[pair] && mishap === null) {
          mishap = {
            kind: apart < touch[pair] ? "collision" : "encounter",
            time: now,
            body: ids[one],
            other: ids[two],
          };
        }
        const fall = 1 / (apart * Math.sqrt(apart));
        const onOne = GRAVITY * masses[two] * fall;
        const onTwo = heft * fall;
        tugs[3 * one] += onOne * dx;
        tugs[3 * one + 1] += onOne * dy;
        tugs[3 * one + 2] += onOne * dz;
        tugs[3 * two] -= onTwo * dx;
        tugs[3 * two + 1] -= onTwo * dy;
        tugs[3 * two + 2] -= onTwo * dz;
      }
    }
    for (let at = 0; at < count; at++) {
      if (oblate[at] === 0) {
        continue;
      }
      const base = 6 * at;
      const list = kids[at];
      for (let slot = 0; slot < list.length; slot++) {
        const kid = list[slot];
        const x = steps[3 * kid];
        const y = steps[3 * kid + 1];
        const z = steps[3 * kid + 2];
        const apart = x * x + y * y + z * z;
        const tx = tensors[base] * x + tensors[base + 3] * y + tensors[base + 4] * z;
        const ty = tensors[base + 3] * x + tensors[base + 1] * y + tensors[base + 5] * z;
        const tz = tensors[base + 4] * x + tensors[base + 5] * y + tensors[base + 2] * z;
        const along = (2.5 * (x * tx + y * ty + z * tz)) / apart;
        const fall = -GRAVITY / (apart * apart * Math.sqrt(apart));
        const ax = fall * (tx - along * x);
        const ay = fall * (ty - along * y);
        const az = fall * (tz - along * z);
        const back = masses[kid] / masses[at];
        tugs[3 * kid] += ax;
        tugs[3 * kid + 1] += ay;
        tugs[3 * kid + 2] += az;
        tugs[3 * at] -= back * ax;
        tugs[3 * at + 1] -= back * ay;
        tugs[3 * at + 2] -= back * az;
      }
    }
  };

  const kick = (span: number) => {
    place();
    pull();
    for (let at = 0; at < count; at++) {
      loads[3 * at] = masses[at] * tugs[3 * at];
      loads[3 * at + 1] = masses[at] * tugs[3 * at + 1];
      loads[3 * at + 2] = masses[at] * tugs[3 * at + 2];
    }
    for (let at = count - 1; at >= 1; at--) {
      const above = 3 * parents[at];
      hangs[3 * at] = loads[3 * at];
      hangs[3 * at + 1] = loads[3 * at + 1];
      hangs[3 * at + 2] = loads[3 * at + 2];
      loads[above] += loads[3 * at];
      loads[above + 1] += loads[3 * at + 1];
      loads[above + 2] += loads[3 * at + 2];
    }
    for (let at = count - 1; at >= 0; at--) {
      const list = kids[at];
      let x = loads[3 * at];
      let y = loads[3 * at + 1];
      let z = loads[3 * at + 2];
      for (let slot = 0; slot < list.length; slot++) {
        x -= hangs[3 * list[slot]];
        y -= hangs[3 * list[slot] + 1];
        z -= hangs[3 * list[slot] + 2];
      }
      for (let slot = 0; slot < list.length; slot++) {
        const kid = list[slot];
        const base = 3 * kid;
        const rx = offsets[base];
        const ry = offsets[base + 1];
        const rz = offsets[base + 2];
        const apart = rx * rx + ry * ry + rz * rz;
        const round = pulls[kid] / (apart * Math.sqrt(apart));
        rates[base] += span * (hangs[base] / whole[kid] - x / inner[kid] + round * rx);
        rates[base + 1] += span * (hangs[base + 1] / whole[kid] - y / inner[kid] + round * ry);
        rates[base + 2] += span * (hangs[base + 2] / whole[kid] - z / inner[kid] + round * rz);
        x += hangs[base];
        y += hangs[base + 1];
        z += hangs[base + 2];
      }
    }
  };

  const coast = (span: number): boolean => {
    for (let at = 1; at < count; at++) {
      const base = 3 * at;
      const rx = offsets[base];
      const ry = offsets[base + 1];
      const rz = offsets[base + 2];
      const vx = rates[base];
      const vy = rates[base + 1];
      const vz = rates[base + 2];
      const far = Math.sqrt(rx * rx + ry * ry + rz * rz);
      const bound = (2 * pulls[at]) / far - (vx * vx + vy * vy + vz * vz);
      if (!(bound > 0)) {
        mishap ??= { kind: "escape", time: now, body: ids[at], other: ids[parents[at]] };
        return false;
      }
      const semi = pulls[at] / bound;
      const pace = Math.sqrt(pulls[at] / (semi * semi * semi));
      const even = 1 - far / semi;
      const odd = (rx * vx + ry * vy + rz * vz) / (pace * semi * semi);
      const swept = pace * span;
      let turn = swept;
      for (let step = 0; step < KEPLER_STEPS; step++) {
        const sine = Math.sin(turn);
        const cosine = Math.cos(turn);
        const miss = turn - even * sine + odd * (1 - cosine) - swept;
        const slope = 1 - even * cosine + odd * sine;
        const bend = even * sine + odd * cosine;
        const fix = -miss / (slope - (0.5 * miss * bend) / slope);
        turn += fix;
        if (Math.abs(fix) < KEPLER_CLOSE * (1 + Math.abs(turn))) {
          break;
        }
      }
      const sine = Math.sin(turn);
      const half = Math.sin(0.5 * turn);
      const dip = -2 * half * half;
      const slope = 1 - even * (1 + dip) + odd * sine;
      const keep = (semi / far) * dip + 1;
      const gain = span + (sine - turn) / pace;
      const lose = -(semi / (far * slope)) * pace * sine;
      const hold = dip / slope + 1;
      offsets[base] = keep * rx + gain * vx;
      offsets[base + 1] = keep * ry + gain * vy;
      offsets[base + 2] = keep * rz + gain * vz;
      rates[base] = lose * rx + hold * vx;
      rates[base + 1] = lose * ry + hold * vy;
      rates[base + 2] = lose * rz + hold * vz;
    }
    return true;
  };

  const energy = (): number => {
    place();
    let total = 0;
    for (let at = 1; at < count; at++) {
      const reduced = (whole[at] * inner[at]) / (whole[at] + inner[at]);
      total +=
        0.5 * reduced * (rates[3 * at] ** 2 + rates[3 * at + 1] ** 2 + rates[3 * at + 2] ** 2);
    }
    for (let one = 0; one < count; one++) {
      for (let two = one + 1; two < count; two++) {
        const level = 3 * forks[one * count + two];
        const mine = 3 * one * levels + level;
        const theirs = 3 * two * levels + level;
        const apart = Math.hypot(
          fromAbove[theirs] - fromAbove[mine],
          fromAbove[theirs + 1] - fromAbove[mine + 1],
          fromAbove[theirs + 2] - fromAbove[mine + 2],
        );
        total -= (GRAVITY * masses[one] * masses[two]) / apart;
      }
    }
    for (let at = 0; at < count; at++) {
      if (oblate[at] === 0) {
        continue;
      }
      const base = 6 * at;
      for (const kid of kids[at]) {
        const x = steps[3 * kid];
        const y = steps[3 * kid + 1];
        const z = steps[3 * kid + 2];
        const apart = Math.hypot(x, y, z);
        const tx = tensors[base] * x + tensors[base + 3] * y + tensors[base + 4] * z;
        const ty = tensors[base + 3] * x + tensors[base + 1] * y + tensors[base + 5] * z;
        const tz = tensors[base + 4] * x + tensors[base + 5] * y + tensors[base + 2] * z;
        total += (GRAVITY * masses[kid] * (x * tx + y * ty + z * tz)) / (2 * apart ** 5);
      }
    }
    return total;
  };

  const strideOf = (): number => {
    let least = Number.POSITIVE_INFINITY;
    for (let at = 1; at < count; at++) {
      const shape = shapeOf(pulls[at], offsets, rates, at);
      const year = 2 * Math.PI * Math.sqrt(shape.orbit ** 3 / pulls[at]);
      least = Math.min(least, nearTurn(year, Math.min(shape.stretch, 0.98)));
    }
    return least / paces;
  };

  const survey = (stride: number): boolean => {
    let resolved = true;
    for (let at = 1; at < count; at++) {
      const shape = shapeOf(pulls[at], offsets, rates, at);
      if (!(shape.orbit > 0)) {
        continue;
      }
      const id = ids[at];
      const track = tracks[at - 1];
      const size = shape.orbit / jacobi.orbits[id];
      track.low = Math.min(track.low, size);
      track.high = Math.max(track.high, size);
      track.stretch = Math.max(track.stretch, shape.stretch);
      const cosine =
        (shape.x * jacobi.normals[3 * id] +
          shape.y * jacobi.normals[3 * id + 1] +
          shape.z * jacobi.normals[3 * id + 2]) /
        Math.hypot(shape.x, shape.y, shape.z);
      track.lean = Math.max(track.lean, Math.acos(Math.max(-1, Math.min(1, cosine))));
      const year = 2 * Math.PI * Math.sqrt(shape.orbit ** 3 / pulls[at]);
      if (nearTurn(year, Math.min(shape.stretch, 0.999)) < coarsest * stride) {
        resolved = false;
      }
    }
    return resolved;
  };

  if (count < 2) {
    return { span: watch.span, steps: 0, bodies: count, mishap: null, tracks, drift: 0 };
  }
  const before = energy();
  let stride = strideOf();
  let taken = 0;
  let refined = 0;
  let cutShort = false;
  let bound = coast(0.5 * stride);
  now = 0.5 * stride;
  while (bound && met() === null && now < watch.span) {
    kick(stride);
    if (met() !== null) {
      break;
    }
    bound = coast(stride);
    now += stride;
    taken += 1;
    if (taken % STRIDE !== 0) {
      continue;
    }
    if (!survey(stride)) {
      if (refined >= REFINES) {
        const worst = tracks.reduce((most, track) => (track.stretch > most.stretch ? track : most));
        mishap = {
          kind: "stretched",
          time: now,
          body: worst.body,
          other: jacobi.parents[worst.body],
        };
        break;
      }
      refined += 1;
      stride = Math.min(stride, strideOf());
    }
    if (taken >= STEPS_MOST) {
      cutShort = true;
      break;
    }
  }
  const settled = met();
  const after = settled === null ? energy() : before;
  return {
    span: settled !== null || cutShort ? now : watch.span,
    steps: taken,
    bodies: count,
    mishap: settled,
    tracks,
    drift: Math.abs((after - before) / before),
  };
}
