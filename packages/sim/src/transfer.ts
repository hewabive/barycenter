import {
  createForecast,
  type Flight,
  type Flyer,
  type Forecast,
  type Kick,
  orbitOf,
  type Rails,
} from "./flight.ts";

type Triple = [number, number, number];

export interface Approach {
  time: number;
  gap: number;
  speed: number;
  reach: number;
  side: [number, number];
  drawn: boolean;
  struck: boolean;
}

export interface Quest {
  rails: Rails;
  fly: Flyer;
  flight: Flight;
  plan: Kick[];
  kick: Kick;
  target: number;
  height: number;
}

export interface Way {
  kick: Kick;
  cost: number;
  approach: Approach;
  settled: boolean;
}

export interface Opening {
  time: number;
  cost: number;
}

export type Trouble = "same" | "nested" | "none";

export interface Outcome {
  way: Way | null;
  opening: Opening | null;
  trouble: Trouble | null;
  tried: number;
}

const UP: Triple = [0, 1, 0];
const ASIDE: Triple = [1, 0, 0];
const ROOM = 4000;
const SPANS = 24;
const SPAN_LEAST = 0.2;
const SPAN_MOST = 2;
const DATES = 96;
const WINDOW_MOST = 4;
const TURNS_NEAR = 2.5;
const TURNS_INNER = 1.5;
const SEEDS = 3;
const SEED_GAP = 4;
const NUDGE = 0.05;
const ROUNDS = 24;
const RETRIES = 3;
const STEP_LEAST = 50;
const STEP_SHARE = 0.5;
const CLOSE_LEAST = 1000;
const CLOSE_SHARE = 0.005;
const HALVINGS = 60;
const OPENING_GAIN = 0.9;

const sub = (a: Triple, b: Triple): Triple => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Triple, b: Triple): Triple => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Triple, by: number): Triple => [a[0] * by, a[1] * by, a[2] * by];
const dot = (a: Triple, b: Triple): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Triple): number => Math.hypot(a[0], a[1], a[2]);
const cross = (a: Triple, b: Triple): Triple => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: Triple): Triple => {
  const size = norm(a);
  return size > 0 ? scale(a, 1 / size) : [1, 0, 0];
};
const pick = (from: ArrayLike<number>, at: number): Triple => [
  from[at],
  from[at + 1],
  from[at + 2],
];

function curve(z: number): number {
  if (z > 1e-6) {
    return (1 - Math.cos(Math.sqrt(z))) / z;
  }
  return z < -1e-6 ? (Math.cosh(Math.sqrt(-z)) - 1) / -z : 0.5 - z / 24;
}

function sweep(z: number): number {
  if (z > 1e-6) {
    const root = Math.sqrt(z);
    return (root - Math.sin(root)) / root ** 3;
  }
  if (z < -1e-6) {
    const root = Math.sqrt(-z);
    return (Math.sinh(root) - root) / root ** 3;
  }
  return 1 / 6 - z / 120;
}

export function lambert(
  pull: number,
  from: Triple,
  to: Triple,
  span: number,
  pole: Triple,
): { leave: Triple; arrive: Triple } | null {
  const near = norm(from);
  const far = norm(to);
  const cosine = Math.max(-1, Math.min(1, dot(from, to) / (near * far)));
  const turn =
    dot(cross(from, to), pole) >= 0 ? Math.acos(cosine) : 2 * Math.PI - Math.acos(cosine);
  const arm = Math.sin(turn) * Math.sqrt((near * far) / (1 - cosine));
  if (!(Math.abs(arm) > 1e-9 * (near + far)) || !(span > 0)) {
    return null;
  }
  const height = (z: number) => near + far + (arm * (z * sweep(z) - 1)) / Math.sqrt(curve(z));
  const late = (z: number) => {
    const y = height(z);
    if (!(y > 0)) {
      return Number.NEGATIVE_INFINITY;
    }
    return (y / curve(z)) ** 1.5 * sweep(z) + arm * Math.sqrt(y) - Math.sqrt(pull) * span;
  };
  let high = 4 * Math.PI ** 2 - 1e-6;
  let low = -4 * Math.PI ** 2;
  while (late(low) > 0 && low > -1e7) {
    low *= 2;
  }
  if (late(low) > 0 || late(high) < 0) {
    return null;
  }
  for (let round = 0; round < HALVINGS; round++) {
    const middle = 0.5 * (low + high);
    if (late(middle) > 0) {
      high = middle;
    } else {
      low = middle;
    }
  }
  const y = height(high);
  if (!(y > 0)) {
    return null;
  }
  const lead = 1 - y / near;
  const lag = arm * Math.sqrt(y / pull);
  const trail = 1 - y / far;
  return {
    leave: scale(sub(to, scale(from, lead)), 1 / lag),
    arrive: scale(sub(scale(to, trail), from), 1 / lag),
  };
}

function axes(inward: Triple, lever: Triple): [number, number] {
  const flat = cross(inward, UP);
  const across = unit(norm(flat) > 1e-6 ? flat : cross(inward, ASIDE));
  return [dot(lever, across), dot(lever, cross(inward, across))];
}

export function approachOf(
  forecast: Forecast,
  rails: Rails,
  target: number,
  from: number,
): Approach | null {
  const { count, times, states, places } = forecast;
  const crowd = rails.count;
  let first = 0;
  while (first < count && times[first] < from) {
    first += 1;
  }
  let best = -1;
  let least = Number.POSITIVE_INFINITY;
  for (let slot = first; slot < count; slot++) {
    const gap = norm(sub(pick(states, 6 * slot), pick(places, 3 * (crowd * slot + target))));
    if (gap < least) {
      least = gap;
      best = slot;
    }
  }
  if (best < 0) {
    return null;
  }
  const at = new Float64Array(3 * crowd);
  const speed = new Float64Array(3 * crowd);
  const beside = (slot: number): [Triple, Triple] => {
    rails.place(times[slot], at, speed);
    return [
      sub(pick(states, 6 * slot), pick(at, 3 * target)),
      sub(pick(states, 6 * slot + 3), pick(speed, 3 * target)),
    ];
  };
  const struck = forecast.wrecked === target;
  let [place, pace] = beside(struck ? Math.max(first, count - 2) : best);
  let time = times[best];
  for (const [early, late] of [
    [best - 1, best],
    [best, best + 1],
  ]) {
    if (struck || early < first || late >= count) {
      continue;
    }
    const [placeEarly, paceEarly] = beside(early);
    const [placeLate, paceLate] = beside(late);
    if (!(dot(placeEarly, paceEarly) < 0 && dot(placeLate, paceLate) >= 0)) {
      continue;
    }
    const span = times[late] - times[early];
    const along = (share: number): [Triple, Triple] => {
      const square = share * share;
      const cube = square * share;
      const spot = add(
        add(
          scale(placeEarly, 2 * cube - 3 * square + 1),
          scale(paceEarly, span * (cube - 2 * square + share)),
        ),
        add(scale(placeLate, 3 * square - 2 * cube), scale(paceLate, span * (cube - square))),
      );
      const rate = add(
        add(
          scale(placeEarly, (6 * square - 6 * share) / span),
          scale(paceEarly, 3 * square - 4 * share + 1),
        ),
        add(
          scale(placeLate, (6 * share - 6 * square) / span),
          scale(paceLate, 3 * square - 2 * share),
        ),
      );
      return [spot, rate];
    };
    let low = 0;
    let high = 1;
    for (let round = 0; round < HALVINGS / 2; round++) {
      const middle = 0.5 * (low + high);
      const [spot, rate] = along(middle);
      if (dot(spot, rate) < 0) {
        low = middle;
      } else {
        high = middle;
      }
    }
    [place, pace] = along(high);
    time = times[early] + high * span;
    break;
  }
  const pull = rails.pulls[target];
  const free = dot(pace, pace) - (2 * pull) / norm(place);
  if ((struck || norm(place) < rails.domains[target]) && free > 0) {
    const swing = cross(place, pace);
    const oval = sub(scale(cross(pace, swing), 1 / pull), unit(place));
    const stretch = norm(oval);
    const swift = Math.sqrt(free);
    const reach = norm(swing) / swift;
    const nearest = unit(oval);
    const onward = cross(unit(swing), nearest);
    const inward = add(
      scale(nearest, 1 / stretch),
      scale(onward, Math.sqrt(Math.max(0, 1 - 1 / stretch ** 2))),
    );
    return {
      time,
      gap: dot(swing, swing) / (pull * (1 + stretch)),
      speed: swift,
      reach,
      side: axes(inward, scale(cross(inward, unit(swing)), reach)),
      drawn: true,
      struck,
    };
  }
  const inward = unit(pace);
  const lever = sub(place, scale(inward, dot(place, inward)));
  return {
    time,
    gap: norm(lever),
    speed: norm(pace),
    reach: norm(lever),
    side: axes(inward, lever),
    drawn: false,
    struck: false,
  };
}

const PARTS = ["along", "north", "out"] as const;

const costOf = (kick: Kick): number => Math.hypot(kick.along, kick.north, kick.out);

function* aim(quest: Quest, seed: Kick): Generator<void, Way | null, void> {
  const { rails, fly, flight, plan, target } = quest;
  const wanted = rails.radii[target] + quest.height;
  const close = Math.max(CLOSE_LEAST, CLOSE_SHARE * quest.height);
  const pull = rails.pulls[target];
  let spare: Forecast | null = null;
  const read = (kick: Kick): Approach | null => {
    const forecast = createForecast(rails, fly, flight, [...plan, kick], null, ROOM, spare);
    while (!forecast.done) {
      forecast.extend(64);
    }
    spare = forecast;
    return approachOf(forecast, rails, target, kick.time);
  };
  const goalOf = (approach: Approach): number =>
    approach.drawn ? wanted * Math.sqrt(1 + (2 * pull) / (wanted * approach.speed ** 2)) : wanted;
  const off = (approach: Approach): number => Math.abs(approach.reach - goalOf(approach));

  let kick = { ...seed };
  let now = read(kick);
  yield;
  if (now === null) {
    return null;
  }
  const slope: number[][] = [[], []];
  let fresh = false;
  function* survey(): Generator<void, boolean, void> {
    for (const [index, part] of PARTS.entries()) {
      const moved = read({ ...kick, [part]: kick[part] + NUDGE });
      yield;
      if (moved === null || now === null) {
        return false;
      }
      slope[0][index] = (moved.side[0] - now.side[0]) / NUDGE;
      slope[1][index] = (moved.side[1] - now.side[1]) / NUDGE;
    }
    fresh = true;
    return true;
  }
  if (!(yield* survey())) {
    return null;
  }
  for (let round = 0; round < ROUNDS; round++) {
    if (Math.abs(now.gap - wanted) <= close && !now.struck) {
      return { kick, cost: costOf(kick), approach: now, settled: true };
    }
    const goal = goalOf(now);
    const size = Math.max(now.reach, 1e-9);
    const miss = [
      (now.side[0] / size) * goal - now.side[0],
      (now.side[1] / size) * goal - now.side[1],
    ];
    const aa = dot(slope[0] as Triple, slope[0] as Triple);
    const ab = dot(slope[0] as Triple, slope[1] as Triple);
    const bb = dot(slope[1] as Triple, slope[1] as Triple);
    const mix = aa * bb - ab * ab;
    if (!(mix > 1e-12 * aa * bb)) {
      break;
    }
    const first = (bb * miss[0] - ab * miss[1]) / mix;
    const second = (aa * miss[1] - ab * miss[0]) / mix;
    let change = PARTS.map((_, index) => slope[0][index] * first + slope[1][index] * second);
    const most = Math.max(STEP_LEAST, STEP_SHARE * costOf(kick));
    const long = Math.hypot(...change);
    if (long > most) {
      change = change.map((value) => (value * most) / long);
    }
    let taken = false;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      const trial: Kick = {
        ...kick,
        along: kick.along + change[0],
        north: kick.north + change[1],
        out: kick.out + change[2],
      };
      const then = read(trial);
      yield;
      if (then !== null) {
        const square = change[0] ** 2 + change[1] ** 2 + change[2] ** 2;
        for (let row = 0; row < 2; row++) {
          const told = slope[row].reduce((sum, value, index) => sum + value * change[index], 0);
          const seen = then.side[row] - now.side[row];
          for (let index = 0; index < 3; index++) {
            slope[row][index] += ((seen - told) * change[index]) / square;
          }
        }
        if (off(then) < off(now)) {
          kick = trial;
          now = then;
          taken = true;
          fresh = false;
          break;
        }
      }
      change = change.map((value) => value * 0.3);
    }
    if (!taken && (fresh || !(yield* survey()))) {
      break;
    }
  }
  const settled = Math.abs(now.gap - wanted) <= close && !now.struck;
  return { kick, cost: costOf(kick), approach: now, settled };
}

interface Seed {
  kick: Kick;
  cost: number;
}

function parted(like: Kick, push: Triple, place: Triple, pace: Triple, time: number): Kick {
  const along = unit(pace);
  const north = unit(cross(place, pace));
  return {
    ...like,
    time,
    along: dot(push, along),
    north: dot(push, north),
    out: dot(push, cross(along, north)),
  };
}

function spans(pull: number, near: number, far: number): number[] {
  const half = Math.PI * Math.sqrt(((near + far) / 2) ** 3 / pull);
  return Array.from(
    { length: SPANS },
    (_, index) => half * SPAN_LEAST * (SPAN_MOST / SPAN_LEAST) ** (index / (SPANS - 1)),
  );
}

export function* seek(quest: Quest): Generator<number, Outcome, void> {
  const { rails, fly, flight, plan, target } = quest;
  const { parents, pulls, count: crowd } = rails;
  const start = quest.kick.time;
  let tried = 0;
  const lineOf = (body: number): number[] => (body < 0 ? [] : [body, ...lineOf(parents[body])]);
  const line = lineOf(target);

  const flown = (span: number | null): Forecast => {
    const forecast = createForecast(rails, fly, flight, plan, span, ROOM);
    while (!forecast.done) {
      forecast.extend(64);
    }
    return forecast;
  };
  const after = (forecast: Forecast): number => {
    let slot = 0;
    while (slot < forecast.count - 1 && forecast.times[slot] < start) {
      slot += 1;
    }
    return slot;
  };
  let coast = flown(null);
  let from = after(coast);
  const hold = coast.holds[from];
  if (hold === target) {
    return { way: null, opening: null, trouble: "same", tried };
  }
  const above = parents[hold];
  const inner = line.includes(hold);
  if (!inner && (above < 0 || !line.includes(above))) {
    return { way: null, opening: null, trouble: "nested", tried };
  }
  const at = new Float64Array(3 * crowd);
  const speed = new Float64Array(3 * crowd);
  const about = (body: number, centre: number, time: number): [Triple, Triple] => {
    rails.place(time, at, speed);
    return [
      sub(pick(at, 3 * body), pick(at, 3 * centre)),
      sub(pick(speed, 3 * body), pick(speed, 3 * centre)),
    ];
  };
  const shipAt = (slot: number): [Triple, Triple] => {
    rails.place(coast.times[slot], at, speed);
    return [
      sub(pick(coast.states, 6 * slot), pick(at, 3 * hold)),
      sub(pick(coast.states, 6 * slot + 3), pick(speed, 3 * hold)),
    ];
  };
  const [placeNow, paceNow] = shipAt(from);
  const orbit = orbitOf(pulls[hold], ...placeNow, ...paceNow, { x: 0, y: 1, z: 0 });
  const closed = Number.isFinite(orbit.year) && orbit.high < rails.domains[hold];
  if (closed) {
    const since = plan.reduce((latest, kick) => Math.max(latest, kick.time), flight.time);
    coast = flown(start - since + (inner ? TURNS_INNER : TURNS_NEAR) * orbit.year);
    from = after(coast);
  }
  const last = coast.count - 1;
  yield tried;

  const seeds: Seed[] = [];
  let opening: Opening | null = null;
  if (inner) {
    const found: (Seed & { slot: number })[] = [];
    for (let slot = from; slot <= last; slot++) {
      const [place, pace] = shipAt(slot);
      const pole = cross(place, pace);
      const [there] = about(target, hold, coast.times[slot]);
      let best: Seed | null = null;
      for (const span of spans(pulls[hold], norm(place), norm(there))) {
        const [goal] = about(target, hold, coast.times[slot] + span);
        const way = lambert(pulls[hold], place, goal, span, pole);
        if (way === null) {
          continue;
        }
        const push = sub(way.leave, pace);
        if (best === null || norm(push) < best.cost) {
          best = {
            kick: parted(quest.kick, push, place, pace, coast.times[slot]),
            cost: norm(push),
          };
        }
      }
      if (best !== null) {
        found.push({ ...best, slot });
      }
      if (slot % 8 === 0) {
        yield tried;
      }
    }
    found.sort((left, right) => left.cost - right.cost);
    const kept: number[] = [];
    for (const each of found) {
      if (seeds.length < SEEDS && kept.every((slot) => Math.abs(slot - each.slot) >= SEED_GAP)) {
        seeds.push(each);
        kept.push(each.slot);
      }
    }
  } else if (closed) {
    const [homeNow, homePace] = about(hold, above, start);
    const park = norm(placeNow);
    const round = norm(paceNow);
    const leaving = (excess: Triple): Seed | null => {
      const wantedSpeed = norm(excess);
      let best: { slot: number; score: number } | null = null;
      const scores: number[] = [];
      for (
        let slot = from;
        slot <= last && coast.times[slot] <= start + orbit.year * 1.05;
        slot++
      ) {
        const [place, pace] = shipAt(slot);
        const fast = Math.sqrt(wantedSpeed ** 2 + (2 * pulls[hold]) / norm(place));
        const after = scale(unit(pace), fast);
        const swing = cross(place, after);
        const oval = sub(scale(cross(after, swing), 1 / pulls[hold]), unit(place));
        const stretch = norm(oval);
        const nearest = unit(oval);
        const onward = cross(unit(swing), nearest);
        const away = add(
          scale(nearest, -1 / stretch),
          scale(onward, Math.sqrt(Math.max(0, 1 - 1 / stretch ** 2))),
        );
        const score = dot(away, unit(excess));
        scores[slot] = score;
        if (best === null || score > best.score) {
          best = { slot, score };
        }
      }
      if (best === null) {
        return null;
      }
      const { slot } = best;
      const [place, pace] = shipAt(slot);
      const fast = Math.sqrt(wantedSpeed ** 2 + (2 * pulls[hold]) / norm(place));
      const before = scores[slot - 1];
      const after = scores[slot + 1];
      let time = coast.times[slot];
      if (before !== undefined && after !== undefined) {
        const bend = before - 2 * best.score + after;
        const shift = bend < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (before - after)) / bend)) : 0;
        time +=
          shift >= 0
            ? shift * (coast.times[slot + 1] - time)
            : shift * (time - coast.times[slot - 1]);
      }
      const along = fast - norm(pace);
      return { kick: { ...quest.kick, time, along, north: 0, out: 0 }, cost: Math.abs(along) };
    };
    const burnOf = (excess: Triple): number =>
      Math.abs(Math.sqrt(dot(excess, excess) + (2 * pulls[hold]) / park) - round);
    if (above === target) {
      const low = rails.radii[target] + quest.height;
      const far = norm(homeNow);
      const slow = Math.sqrt(pulls[above] * (2 / far - 2 / (far + low)));
      const seed = leaving(scale(unit(homePace), slow - norm(homePace)));
      if (seed !== null) {
        seeds.push(seed);
      }
    } else {
      const pole = cross(homeNow, homePace);
      const [there] = about(target, above, start);
      const own = 2 * Math.PI * Math.sqrt(norm(homeNow) ** 3 / pulls[above]);
      const other = 2 * Math.PI * Math.sqrt(norm(there) ** 3 / pulls[above]);
      const beat = Math.abs(1 / own - 1 / other);
      const window = Math.min(beat > 0 ? 1.05 / beat : own, WINDOW_MOST * Math.max(own, other));
      const lengths = spans(pulls[above], norm(homeNow), norm(there));
      let soon: { excess: Triple; cost: number } | null = null;
      for (let date = 0; date < DATES; date++) {
        const time = start + (window * date) / DATES;
        const [place, pace] = about(hold, above, time);
        for (const span of lengths) {
          const [goal] = about(target, above, time + span);
          const way = lambert(pulls[above], place, goal, span, pole);
          if (way === null) {
            continue;
          }
          const excess = sub(way.leave, pace);
          const cost = burnOf(excess);
          if (date === 0 && (soon === null || cost < soon.cost)) {
            soon = { excess, cost };
          }
          if (opening === null || cost < opening.cost) {
            opening = { time, cost };
          }
        }
        if (date % 16 === 0) {
          yield tried;
        }
      }
      if (soon !== null) {
        const seed = leaving(soon.excess);
        if (seed !== null) {
          seeds.push(seed);
        }
        if (opening !== null && !(opening.cost < OPENING_GAIN * soon.cost)) {
          opening = null;
        }
      }
    }
  }
  seeds.push({ kick: { ...quest.kick, along: 0, north: 0, out: 0 }, cost: 0 });

  const wanted = rails.radii[target] + quest.height;
  const better = (one: Way, other: Way): boolean => {
    if (one.settled !== other.settled) {
      return one.settled;
    }
    return one.settled
      ? one.cost < other.cost
      : Math.abs(one.approach.gap - wanted) < Math.abs(other.approach.gap - wanted);
  };
  let way: Way | null = null;
  for (const seed of seeds) {
    const run = aim(quest, seed.kick);
    for (;;) {
      const step = run.next();
      tried += 1;
      if (step.done) {
        const found = step.value;
        if (found !== null && (way === null || better(found, way))) {
          way = found;
        }
        break;
      }
      yield tried;
    }
  }
  return { way, opening, trouble: way === null ? "none" : null, tried };
}
