import { GRAVITY } from "./physics.ts";
import { anomalyOf, courseOf, type Pose, poleOf, posesOf, treeOf } from "./system.ts";
import type { Sketch, Vector } from "./types.ts";

export const STANDARD_GRAVITY = 9.80665;

export const HEADINGS = [
  "hold",
  "prograde",
  "retrograde",
  "normal",
  "antinormal",
  "outward",
  "inward",
] as const;

export type Heading = (typeof HEADINGS)[number];

export interface Rails {
  count: number;
  pulls: Float64Array;
  radii: Float64Array;
  domains: Float64Array;
  parents: Int32Array;
  place(time: number, at: Float64Array, speed: Float64Array): void;
}

export interface Burn {
  force: number;
  exhaust: number;
  dry: number;
  endless: boolean;
  heading: Heading;
  about: number;
  held: Vector;
}

export interface Flight {
  time: number;
  state: Float64Array;
  stride: number;
  wrecked: number | null;
}

export interface Orbit {
  semi: number;
  stretch: number;
  low: number;
  high: number;
  year: number;
  lean: number;
  toLow: number;
  toHigh: number;
}

export type Flyer = (flight: Flight, until: number, burn: Burn | null, limit: number) => number;

const SIZE = 7;
const TOLERANCE = 1e-10;
const CAUTION = 0.25;
const THRIFT = 0.05;
const EASE = 1;
const EMPTY = 1e-9;
const FIRST_STRIDE = 1e-3;
const DOMAIN_POWER = 0.4;
const ROUND = 1e-9;

const NODES = [0, 2 / 27, 1 / 9, 1 / 6, 5 / 12, 1 / 2, 5 / 6, 1 / 6, 2 / 3, 1 / 3, 1, 0, 1];
const SLOTS = [0, 1, 2, 3, 4, 5, 6, 3, 7, 8, 9, 0, 9];
const MOMENTS = 10;
const LAST = 9;
const WEIGHTS = [
  [],
  [2 / 27],
  [1 / 36, 1 / 12],
  [1 / 24, 0, 1 / 8],
  [5 / 12, 0, -25 / 16, 25 / 16],
  [1 / 20, 0, 0, 1 / 4, 1 / 5],
  [-25 / 108, 0, 0, 125 / 108, -65 / 27, 125 / 54],
  [31 / 300, 0, 0, 0, 61 / 225, -2 / 9, 13 / 900],
  [2, 0, 0, -53 / 6, 704 / 45, -107 / 9, 67 / 90, 3],
  [-91 / 108, 0, 0, 23 / 108, -976 / 135, 311 / 54, -19 / 60, 17 / 6, -1 / 12],
  [2383 / 4100, 0, 0, -341 / 164, 4496 / 1025, -301 / 82, 2133 / 4100, 45 / 82, 45 / 164, 18 / 41],
  [3 / 205, 0, 0, 0, 0, -6 / 41, -3 / 205, -3 / 41, 3 / 41, 6 / 41, 0],
  [
    -1777 / 4100,
    0,
    0,
    -341 / 164,
    4496 / 1025,
    -289 / 82,
    2193 / 4100,
    51 / 82,
    33 / 164,
    12 / 41,
    0,
    1,
  ],
];
const FINE = [0, 0, 0, 0, 0, 34 / 105, 9 / 35, 9 / 35, 9 / 280, 9 / 280, 0, 41 / 840, 41 / 840];
const DOUBT = 41 / 840;
const STILL: Pose = { shift: 0, scale: 1, drift: 0, swell: 0 };

export function railsOf(system: Sketch): Rails {
  const { bodies } = system;
  const count = bodies.length;
  const { weights, families, sharers } = treeOf(system);
  const major = new Float64Array(3 * count);
  const minor = new Float64Array(3 * count);
  const reach = new Float64Array(3 * count);
  const drift = new Float64Array(3 * count);
  const domains = new Float64Array(count).fill(Number.POSITIVE_INFINITY);
  for (const body of bodies) {
    if (body.parent === null) {
      continue;
    }
    const oval = body.physics.stretch;
    const nearest = courseOf(body, 0, true);
    const beside = courseOf(body, Math.PI / 2, true);
    const wide = 1 / (1 - oval);
    const base = 3 * body.id;
    major[base] = nearest.x * wide;
    major[base + 1] = nearest.y * wide;
    major[base + 2] = nearest.z * wide;
    minor[base] = beside.x + oval * major[base];
    minor[base + 1] = beside.y + oval * major[base + 1];
    minor[base + 2] = beside.z + oval * major[base + 2];
    const lead = body.shared === null ? body.id : body.shared.with;
    const { children, shares } = families[body.parent];
    const group = sharers[lead].reduce((sum, other) => sum + weights[other], weights[lead]);
    const within = group / shares[children.indexOf(lead)];
    const edge = (weights[body.id] / (within - weights[body.id])) ** DOMAIN_POWER;
    domains[body.id] = (body.physics.orbit * (1 - oval) * edge) / (1 + edge);
  }

  let spots: Float64Array = reach;
  let rates: Float64Array = drift;
  const course = (id: number, time: number, pose: Pose) => {
    const body = bodies[id];
    const oval = body.physics.stretch;
    const anomaly = anomalyOf(body, time, pose.shift);
    const sine = Math.sin(anomaly);
    const cosine = Math.cos(anomaly);
    const turn = ((2 * Math.PI) / body.year + pose.drift) / (1 - oval * cosine);
    const along = pose.scale * (cosine - oval);
    const across = pose.scale * sine;
    const ahead = pose.swell * (cosine - oval) - pose.scale * sine * turn;
    const aside = pose.swell * sine + pose.scale * cosine * turn;
    const base = 3 * id;
    for (let axis = 0; axis < 3; axis++) {
      reach[base + axis] = major[base + axis] * along + minor[base + axis] * across;
      drift[base + axis] = major[base + axis] * ahead + minor[base + axis] * aside;
    }
  };
  const settle = (
    id: number,
    time: number,
    hubX: number,
    hubY: number,
    hubZ: number,
    paceX: number,
    paceY: number,
    paceZ: number,
  ) => {
    const { children, shares } = families[id];
    let x = hubX;
    let y = hubY;
    let z = hubZ;
    let u = paceX;
    let v = paceY;
    let w = paceZ;
    for (let index = children.length - 1; index >= 0; index--) {
      const lead = children[index];
      const others = sharers[lead];
      const poses = others.length === 0 ? null : posesOf(system, lead, time);
      let whole = weights[lead];
      course(lead, time, poses === null ? STILL : poses[0]);
      for (let slot = 0; slot < others.length; slot++) {
        course(others[slot], time, poses === null ? STILL : poses[slot + 1]);
        whole += weights[others[slot]];
      }
      const pull = shares[index] / whole;
      for (let slot = -1; slot < others.length; slot++) {
        const member = slot < 0 ? lead : others[slot];
        const part = pull * weights[member];
        const base = 3 * member;
        x -= part * reach[base];
        y -= part * reach[base + 1];
        z -= part * reach[base + 2];
        u -= part * drift[base];
        v -= part * drift[base + 1];
        w -= part * drift[base + 2];
      }
      for (let slot = -1; slot < others.length; slot++) {
        const member = slot < 0 ? lead : others[slot];
        const base = 3 * member;
        settle(
          member,
          time,
          x + reach[base],
          y + reach[base + 1],
          z + reach[base + 2],
          u + drift[base],
          v + drift[base + 1],
          w + drift[base + 2],
        );
      }
    }
    const base = 3 * id;
    spots[base] = x;
    spots[base + 1] = y;
    spots[base + 2] = z;
    rates[base] = u;
    rates[base + 1] = v;
    rates[base + 2] = w;
  };

  return {
    count,
    pulls: Float64Array.from(bodies, (body) => GRAVITY * body.physics.mass),
    radii: Float64Array.from(bodies, (body) => body.physics.radius),
    domains,
    parents: Int32Array.from(bodies, (body) => body.parent ?? -1),
    place(time, at, speed) {
      spots = at;
      rates = speed;
      for (const body of bodies) {
        if (body.parent === null) {
          settle(body.id, time, 0, 0, 0, 0, 0, 0);
        }
      }
    },
  };
}

export function headingOf(
  heading: Heading,
  held: Vector,
  rx: number,
  ry: number,
  rz: number,
  vx: number,
  vy: number,
  vz: number,
  into: Float64Array,
): void {
  let x = held.x;
  let y = held.y;
  let z = held.z;
  if (heading === "prograde" || heading === "retrograde") {
    x = vx;
    y = vy;
    z = vz;
  } else if (heading === "normal" || heading === "antinormal") {
    x = ry * vz - rz * vy;
    y = rz * vx - rx * vz;
    z = rx * vy - ry * vx;
  } else if (heading === "outward" || heading === "inward") {
    const swift = vx * vx + vy * vy + vz * vz;
    const closing = rx * vx + ry * vy + rz * vz;
    x = rx * swift - vx * closing;
    y = ry * swift - vy * closing;
    z = rz * swift - vz * closing;
  }
  const length = Math.hypot(x, y, z);
  const sign =
    heading === "retrograde" || heading === "antinormal" || heading === "inward" ? -1 : 1;
  const scale = length > 0 ? sign / length : 0;
  into[0] = length > 0 ? x * scale : 1;
  into[1] = y * scale;
  into[2] = z * scale;
}

export function createFlight(time: number, state: ArrayLike<number>): Flight {
  return { time, state: Float64Array.from(state), stride: 0, wrecked: null };
}

export function createFlyer(rails: Rails): Flyer {
  const { count, pulls, radii } = rails;
  const places = Array.from({ length: MOMENTS }, () => new Float64Array(3 * count));
  const speeds = Array.from({ length: MOMENTS }, () => new Float64Array(3 * count));
  const stamps = new Float64Array(MOMENTS).fill(Number.NaN);
  const slopes = NODES.map(() => new Float64Array(SIZE));
  const probe = new Float64Array(SIZE);
  const aim = new Float64Array(3);
  let thrust: Burn | null = null;

  const slope = (stage: number, time: number, state: Float64Array, into: Float64Array) => {
    const slot = SLOTS[stage];
    if (stamps[slot] !== time) {
      rails.place(time, places[slot], speeds[slot]);
      stamps[slot] = time;
    }
    const at = places[slot];
    let ax = 0;
    let ay = 0;
    let az = 0;
    for (let body = 0; body < count; body++) {
      const dx = at[3 * body] - state[0];
      const dy = at[3 * body + 1] - state[1];
      const dz = at[3 * body + 2] - state[2];
      const apart = dx * dx + dy * dy + dz * dz;
      const pull = pulls[body] / (apart * Math.sqrt(apart));
      ax += pull * dx;
      ay += pull * dy;
      az += pull * dz;
    }
    let flow = 0;
    if (thrust !== null) {
      const base = 3 * thrust.about;
      const moving = speeds[slot];
      headingOf(
        thrust.heading,
        thrust.held,
        state[0] - at[base],
        state[1] - at[base + 1],
        state[2] - at[base + 2],
        state[3] - moving[base],
        state[4] - moving[base + 1],
        state[5] - moving[base + 2],
        aim,
      );
      const swift = Math.hypot(
        state[3] - moving[base],
        state[4] - moving[base + 1],
        state[5] - moving[base + 2],
      );
      const eased = thrust.heading === "retrograde" ? swift / Math.hypot(swift, EASE) : 1;
      const push = (eased * thrust.force) / state[6];
      ax += push * aim[0];
      ay += push * aim[1];
      az += push * aim[2];
      flow = thrust.endless ? 0 : (-eased * thrust.force) / thrust.exhaust;
    }
    into[0] = state[3];
    into[1] = state[4];
    into[2] = state[5];
    into[3] = ax;
    into[4] = ay;
    into[5] = az;
    into[6] = flow;
  };

  return (flight, until, burn, limit) => {
    const { state } = flight;
    let used = 0;
    while (used < limit && flight.time < until && flight.wrecked === null) {
      const fuel = burn === null || burn.endless ? Number.POSITIVE_INFINITY : state[6] - burn.dry;
      thrust = burn !== null && burn.force > 0 && fuel > EMPTY * burn.dry ? burn : null;
      const start = flight.time;
      slope(0, start, state, slopes[0]);
      const here = places[0];
      const moving = speeds[0];
      let near = Number.POSITIVE_INFINITY;
      let heaviest = -1;
      let room = Number.POSITIVE_INFINITY;
      for (let body = 0; body < count; body++) {
        const apart = Math.hypot(
          here[3 * body] - state[0],
          here[3 * body + 1] - state[1],
          here[3 * body + 2] - state[2],
        );
        const closing = Math.hypot(
          moving[3 * body] - state[3],
          moving[3 * body + 1] - state[4],
          moving[3 * body + 2] - state[5],
        );
        const tug = pulls[body] / (apart * apart);
        if (tug > heaviest) {
          heaviest = tug;
          near = apart;
        }
        room = Math.min(room, apart / Math.max(closing, ROUND));
      }
      const push = thrust === null ? 0 : thrust.force / state[6];
      const swift = Math.sqrt((Math.max(heaviest, 0) + push) * near);
      const span = until - start;
      const tank =
        thrust === null || thrust.endless
          ? Number.POSITIVE_INFINITY
          : (fuel * thrust.exhaust) / thrust.force;
      const first = (FIRST_STRIDE * near) / Math.max(swift, ROUND);
      const spend =
        thrust === null || thrust.endless
          ? Number.POSITIVE_INFINITY
          : (THRIFT * state[6] * thrust.exhaust) / thrust.force;
      let stride = Math.min(flight.stride > 0 ? flight.stride : first, CAUTION * room, spend);
      for (;;) {
        const step = Math.min(stride, span, tank);
        for (let stage = 1; stage < NODES.length; stage++) {
          const row = WEIGHTS[stage];
          for (let slot = 0; slot < SIZE; slot++) {
            let sum = 0;
            for (let prior = 0; prior < stage; prior++) {
              sum += row[prior] * slopes[prior][slot];
            }
            probe[slot] = state[slot] + step * sum;
          }
          slope(stage, start + NODES[stage] * step, probe, slopes[stage]);
        }
        for (let slot = 0; slot < 6; slot++) {
          probe[slot] = slopes[11][slot] + slopes[12][slot] - slopes[0][slot] - slopes[10][slot];
        }
        const astray = Math.hypot(probe[0], probe[1], probe[2]) / near;
        const askew = Math.hypot(probe[3], probe[4], probe[5]) / Math.max(swift, ROUND);
        const doubt = (step * DOUBT * Math.max(astray, askew)) / TOLERANCE;
        const grown = doubt > 0 ? Math.min(4, Math.max(0.2, 0.9 * doubt ** -0.125)) : 4;
        used += 1;
        if (doubt > 1 && start + step * 0.2 > start) {
          stride = step * grown;
          continue;
        }
        for (let slot = 0; slot < SIZE; slot++) {
          let sum = 0;
          for (let stage = 5; stage < NODES.length; stage++) {
            sum += FINE[stage] * slopes[stage][slot];
          }
          state[slot] += step * sum;
        }
        if (thrust !== null && !thrust.endless && state[6] - thrust.dry <= EMPTY * thrust.dry) {
          state[6] = thrust.dry;
        }
        flight.time = step === span ? until : start + step;
        flight.stride = step < stride ? stride : step * grown;
        const ended = places[LAST];
        places[LAST] = places[0];
        places[0] = ended;
        const sped = speeds[LAST];
        speeds[LAST] = speeds[0];
        speeds[0] = sped;
        stamps[0] = stamps[LAST];
        stamps[LAST] = Number.NaN;
        for (let body = 0; body < count; body++) {
          const apart = Math.hypot(
            ended[3 * body] - state[0],
            ended[3 * body + 1] - state[1],
            ended[3 * body + 2] - state[2],
          );
          if (apart < radii[body]) {
            flight.wrecked = body;
            break;
          }
        }
        break;
      }
    }
    return used;
  };
}

export function primaryOf(rails: Rails, at: Float64Array, state: Float64Array): number {
  let found = Math.max(0, rails.parents.indexOf(-1));
  let least = Number.POSITIVE_INFINITY;
  for (let body = 0; body < rails.count; body++) {
    const apart = Math.hypot(
      at[3 * body] - state[0],
      at[3 * body + 1] - state[1],
      at[3 * body + 2] - state[2],
    );
    if (apart < rails.domains[body] && rails.domains[body] < least) {
      found = body;
      least = rails.domains[body];
    }
  }
  return found;
}

export function orbitOf(
  pull: number,
  rx: number,
  ry: number,
  rz: number,
  vx: number,
  vy: number,
  vz: number,
  pole: Vector,
): Orbit {
  const far = Math.hypot(rx, ry, rz);
  const swift = vx * vx + vy * vy + vz * vz;
  const closing = rx * vx + ry * vy + rz * vz;
  const semi = 1 / (2 / far - swift / pull);
  const hx = ry * vz - rz * vy;
  const hy = rz * vx - rx * vz;
  const hz = rx * vy - ry * vx;
  const turn = Math.hypot(hx, hy, hz);
  const ex = (vy * hz - vz * hy) / pull - rx / far;
  const ey = (vz * hx - vx * hz) / pull - ry / far;
  const ez = (vx * hy - vy * hx) / pull - rz / far;
  const stretch = Math.hypot(ex, ey, ez);
  const tilt = (hx * pole.x + hy * pole.y + hz * pole.z) / Math.max(turn, 1e-300);
  const lean = Math.acos(Math.max(-1, Math.min(1, tilt)));
  const low = (turn * turn) / (pull * (1 + stretch));
  if (stretch < 1 && semi > 0) {
    const year = 2 * Math.PI * Math.sqrt(semi ** 3 / pull);
    const cosine = stretch > ROUND ? Math.max(-1, Math.min(1, (1 - far / semi) / stretch)) : 1;
    const anomaly = closing >= 0 ? Math.acos(cosine) : 2 * Math.PI - Math.acos(cosine);
    const mean = anomaly - stretch * Math.sin(anomaly);
    const since = (mean / (2 * Math.PI)) * year;
    return {
      semi,
      stretch,
      low,
      high: semi * (1 + stretch),
      year,
      lean,
      toLow: year - since,
      toHigh: since <= year / 2 ? year / 2 - since : 1.5 * year - since,
    };
  }
  const open = Math.abs(semi);
  const cosh = Math.max(1, (1 + far / open) / Math.max(stretch, 1));
  const anomaly = Math.sign(closing) * Math.acosh(cosh);
  const since = (stretch * Math.sinh(anomaly) - anomaly) * Math.sqrt(open ** 3 / pull);
  return {
    semi,
    stretch,
    low,
    high: Number.POSITIVE_INFINITY,
    year: Number.POSITIVE_INFINITY,
    lean,
    toLow: -since,
    toHigh: Number.POSITIVE_INFINITY,
  };
}

export function circling(
  rails: Rails,
  system: Sketch,
  id: number,
  height: number,
  time: number,
): Float64Array {
  const at = new Float64Array(3 * rails.count);
  const speed = new Float64Array(3 * rails.count);
  rails.place(time, at, speed);
  const pole = poleOf(system.bodies[id]);
  const flat = Math.abs(pole.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
  const sideX = pole.y * flat.z - pole.z * flat.y;
  const sideY = pole.z * flat.x - pole.x * flat.z;
  const sideZ = pole.x * flat.y - pole.y * flat.x;
  const side = Math.hypot(sideX, sideY, sideZ);
  const outX = sideX / side;
  const outY = sideY / side;
  const outZ = sideZ / side;
  const far = rails.radii[id] + height;
  const swift = Math.sqrt(rails.pulls[id] / far);
  const base = 3 * id;
  return Float64Array.of(
    at[base] + far * outX,
    at[base + 1] + far * outY,
    at[base + 2] + far * outZ,
    speed[base] + swift * (pole.y * outZ - pole.z * outY),
    speed[base + 1] + swift * (pole.z * outX - pole.x * outZ),
    speed[base + 2] + swift * (pole.x * outY - pole.y * outX),
  );
}

export interface Drive {
  force: number;
  exhaust: number;
  dry: number;
  endless: boolean;
}

export interface Kick {
  time: number;
  along: number;
  north: number;
  out: number;
  about: number | null;
  drive?: Drive | null;
}

export interface Forecast {
  count: number;
  times: Float64Array;
  states: Float64Array;
  places: Float64Array;
  holds: Int32Array;
  legs: Int32Array;
  marks: Int32Array;
  pushes: Float64Array;
  wrecked: number | null;
  done: boolean;
  extend(steps: number): void;
}

export interface Pass {
  time: number;
  gap: number;
  index: number;
  share: number;
}

export interface Passes {
  nearest: Pass | null;
  lows: Pass[];
  highs: Pass[];
}

export interface Balance {
  inner: number;
  outer: number;
  far: number;
}

const FINE_TURN = 0.09;
const AHEAD_TURNS = 1.1;
const AHEAD_REACH = 3;
const AHEAD_LEGS = 4;
const SPIN_AXIS = { x: 0, y: 1, z: 0 };

export function burnFor(drive: Drive, mass: number, gain: number): number {
  return drive.endless
    ? (gain * mass) / drive.force
    : (mass * (1 - Math.exp(-gain / drive.exhaust)) * drive.exhaust) / drive.force;
}

export function createForecast(
  rails: Rails,
  fly: Flyer,
  from: Flight,
  kicks: Kick[],
  span: number | null,
  room: number,
  spare: Forecast | null = null,
): Forecast {
  const { count: crowd } = rails;
  const kept =
    spare !== null && spare.times.length === room && spare.places.length === 3 * crowd * room;
  const flight = createFlight(from.time, from.state);
  const pending = kicks
    .filter((kick) => kick.time > from.time)
    .sort((left, right) => left.time - right.time);
  const at = new Float64Array(3 * crowd);
  const speed = new Float64Array(3 * crowd);
  const forecast: Forecast = {
    count: 0,
    times: kept ? spare.times : new Float64Array(room),
    states: kept ? spare.states : new Float64Array(6 * room),
    places: kept ? spare.places : new Float64Array(3 * crowd * room),
    holds: kept ? spare.holds : new Int32Array(room),
    legs: kept ? spare.legs : new Int32Array(room),
    marks: new Int32Array(pending.length).fill(-1),
    pushes: new Float64Array(3 * pending.length),
    wrecked: null,
    done: false,
    extend,
  };
  let applied = 0;
  let hold = 0;
  let legs = AHEAD_LEGS;
  let closing = Number.POSITIVE_INFINITY;
  let firing: { until: number; burn: Burn } | null = null;
  let due: { index: number; time: number } | null = null;

  const apart = (
    body: number,
    state = flight.state,
  ): [number, number, number, number, number, number] => {
    const base = 3 * body;
    return [
      state[0] - at[base],
      state[1] - at[base + 1],
      state[2] - at[base + 2],
      state[3] - speed[base],
      state[4] - speed[base + 1],
      state[5] - speed[base + 2],
    ];
  };
  const record = () => {
    rails.place(flight.time, at, speed);
    hold = primaryOf(rails, at, flight.state);
    const slot = forecast.count;
    forecast.times[slot] = flight.time;
    forecast.states.set(flight.state.subarray(0, 6), 6 * slot);
    forecast.places.set(at, 3 * crowd * slot);
    forecast.holds[slot] = hold;
    forecast.legs[slot] = applied;
    forecast.count = slot + 1;
    if (due !== null && flight.time >= due.time) {
      forecast.marks[due.index] = slot;
      due = null;
    }
  };
  const ahead = (): number => {
    if (span !== null) {
      return flight.time + span;
    }
    const [rx, ry, rz, vx, vy, vz] = apart(hold);
    const orbit = orbitOf(rails.pulls[hold], rx, ry, rz, vx, vy, vz, SPIN_AXIS);
    if (orbit.stretch < 1 && orbit.semi > 0 && orbit.high < rails.domains[hold]) {
      return flight.time + AHEAD_TURNS * orbit.year;
    }
    const reach = rails.domains[hold];
    const edge = Number.isFinite(reach) ? reach : AHEAD_REACH * Math.hypot(rx, ry, rz);
    return flight.time + (AHEAD_REACH * edge) / Math.max(Math.hypot(vx, vy, vz), ROUND);
  };
  const pushOf = (plan: Kick, state: Float64Array, held: number): number[] => {
    const [rx, ry, rz, vx, vy, vz] = apart(plan.about ?? held, state);
    const swift = Math.hypot(vx, vy, vz);
    const nx = ry * vz - rz * vy;
    const ny = rz * vx - rx * vz;
    const nz = rx * vy - ry * vx;
    const turn = Math.hypot(nx, ny, nz);
    const ax = swift > 0 ? vx / swift : 1;
    const ay = swift > 0 ? vy / swift : 0;
    const az = swift > 0 ? vz / swift : 0;
    const bx = turn > 0 ? nx / turn : 0;
    const by = turn > 0 ? ny / turn : 1;
    const bz = turn > 0 ? nz / turn : 0;
    return [
      plan.along * ax + plan.north * bx + plan.out * (ay * bz - az * by),
      plan.along * ay + plan.north * by + plan.out * (az * bx - ax * bz),
      plan.along * az + plan.north * bz + plan.out * (ax * by - ay * bx),
    ];
  };
  const kick = (plan: Kick) => {
    const push = pushOf(plan, flight.state, hold);
    forecast.pushes.set(push, 3 * applied);
    forecast.marks[applied] = forecast.count;
    flight.state[3] += push[0];
    flight.state[4] += push[1];
    flight.state[5] += push[2];
    applied += 1;
  };
  const light = (plan: Kick, drive: Drive) => {
    const sight = createFlight(flight.time, flight.state);
    while (sight.time < plan.time && sight.wrecked === null) {
      fly(sight, plan.time, null, 64);
    }
    rails.place(sight.time, at, speed);
    const push = pushOf(plan, sight.state, primaryOf(rails, at, sight.state));
    const size = Math.hypot(push[0], push[1], push[2]);
    forecast.pushes.set(push, 3 * applied);
    due = { index: applied, time: plan.time };
    applied += 1;
    if (size > 0) {
      firing = {
        until: flight.time + burnFor(drive, flight.state[6], size),
        burn: {
          ...drive,
          heading: "hold",
          about: hold,
          held: { x: push[0] / size, y: push[1] / size, z: push[2] / size },
        },
      };
    }
  };

  record();
  if (pending.length === 0) {
    closing = ahead();
  }

  function extend(steps: number): void {
    for (let step = 0; step < steps && !forecast.done; step++) {
      if (forecast.count >= room) {
        forecast.done = true;
        break;
      }
      const [rx, ry, rz, vx, vy, vz] = apart(hold);
      const fine = (FINE_TURN * Math.hypot(rx, ry, rz)) / Math.max(Math.hypot(vx, vy, vz), ROUND);
      const next = applied < pending.length ? pending[applied] : null;
      const was = hold;
      const drive = next === null ? null : (next.drive ?? null);
      const lit = firing;
      const opens =
        next === null || drive === null
          ? Number.POSITIVE_INFINITY
          : next.time -
            burnFor(drive, flight.state[6], Math.hypot(next.along, next.north, next.out)) / 2;
      const until =
        lit !== null ? lit.until : next === null ? closing : drive === null ? next.time : opens;
      if (lit === null && next !== null && drive !== null && flight.time >= opens) {
        light(next, drive);
        rails.place(flight.time, at, speed);
        continue;
      }
      fly(flight, Math.min(until, flight.time + fine), lit === null ? null : lit.burn, 1);
      if (flight.wrecked !== null) {
        record();
        forecast.wrecked = flight.wrecked;
        forecast.done = true;
        break;
      }
      if (lit !== null) {
        record();
        if (flight.time >= lit.until) {
          firing = null;
          if (applied === pending.length) {
            closing = ahead();
          }
        }
        continue;
      }
      if (next !== null && drive !== null) {
        record();
        continue;
      }
      if (next !== null && flight.time >= next.time) {
        rails.place(flight.time, at, speed);
        hold = primaryOf(rails, at, flight.state);
        kick(next);
        record();
        if (applied === pending.length) {
          closing = ahead();
        }
        continue;
      }
      record();
      if (next === null && span === null && hold !== was) {
        legs -= 1;
        closing = ahead();
      }
      if (next === null && (flight.time >= closing || legs < 0)) {
        forecast.done = true;
      }
    }
  }

  return forecast;
}

export function passesOf(forecast: Forecast, crowd: number, body: number, from: number): Passes {
  const { count, times, states, places } = forecast;
  const gapAt = (slot: number) =>
    Math.hypot(
      states[6 * slot] - places[3 * (crowd * slot + body)],
      states[6 * slot + 1] - places[3 * (crowd * slot + body) + 1],
      states[6 * slot + 2] - places[3 * (crowd * slot + body) + 2],
    );
  const lows: Pass[] = [];
  const highs: Pass[] = [];
  let first = 0;
  while (first < count && times[first] < from) {
    first += 1;
  }
  let before = first < count ? gapAt(first) : 0;
  let here = first + 1 < count ? gapAt(first + 1) : 0;
  for (let slot = first + 1; slot + 1 < count; slot++) {
    const after = gapAt(slot + 1);
    const early = times[slot] - times[slot - 1];
    const late = times[slot + 1] - times[slot];
    const low = here <= before && here < after;
    const high = here >= before && here > after;
    if ((low || high) && early > 0 && late > 0) {
      const rise = (after - here) / late;
      const fall = (here - before) / early;
      const bend = (rise - fall) / (0.5 * (early + late));
      const lean = (rise * early + fall * late) / (early + late);
      const shift = bend === 0 ? 0 : Math.max(-early, Math.min(late, -lean / bend));
      const pass: Pass = {
        time: times[slot] + shift,
        gap: here + lean * shift + 0.5 * bend * shift * shift,
        index: shift >= 0 ? slot : slot - 1,
        share: shift >= 0 ? shift / late : 1 + shift / early,
      };
      (low ? lows : highs).push(pass);
    }
    before = here;
    here = after;
  }
  const nearest = lows.reduce<Pass | null>(
    (best, pass) => (best === null || pass.gap < best.gap ? pass : best),
    null,
  );
  return { nearest, lows, highs };
}

export function lagrangeOf(share: number): Balance {
  const root = (net: (reach: number) => number, from: number, to: number) => {
    let low = from;
    let high = to;
    for (let step = 0; step < 200; step++) {
      const middle = (low + high) / 2;
      if (net(middle) > 0) {
        high = middle;
      } else {
        low = middle;
      }
    }
    return (low + high) / 2;
  };
  const rest = 1 - share;
  return {
    inner: root(
      (reach) => rest / (1 - reach) ** 2 - share / reach ** 2 - (rest - reach),
      1e-9,
      1 - 1e-9,
    ),
    outer: root((reach) => rest + reach - rest / (1 + reach) ** 2 - share / reach ** 2, 1e-9, 2),
    far: root((reach) => share + reach - rest / reach ** 2 - share / (1 + reach) ** 2, 1e-9, 2),
  };
}
