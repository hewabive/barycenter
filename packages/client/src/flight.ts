import "./style.css";
import "./generator.css";
import "./flight.css";
import {
  ASTRONOMICAL_UNIT,
  type Burn,
  centreOf,
  circling,
  classOf,
  createFlight,
  createFlyer,
  createForecast,
  DAY,
  type Forecast,
  HEADINGS,
  type Heading,
  HOUR,
  headingOf,
  hubOf,
  type Kick,
  lagrangeOf,
  orbitOf,
  passesOf,
  poleOf,
  primaryOf,
  railsOf,
  STANDARD_GRAVITY,
  SUN_MASS,
  seenGlow,
  shownLight,
  surveySystem,
  swayOf,
  YEAR,
} from "@barycenter/sim";
import { Quaternion, Vector3 } from "three";
import { createCourse, type Frame } from "./course.ts";
import { CRAFT_REACH, createCraft } from "./craft.ts";
import { button, el, required, write } from "./dom.ts";
import { createSpace } from "./space.ts";

type Steering = Heading | "plan";

interface Push {
  id: number;
  time: number;
  along: number;
  north: number;
  out: number;
  left: number;
}

interface Pin {
  text: string;
  tone: string;
  slot: number;
  share: number;
}

const WARPS = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7];
const BUDGET = 7;
const BATCH = 6;
const FORECAST_BUDGET = 3;
const FORECAST_ROOM = 5000;
const FORECAST_WORN = 0.25;
const PUSH_DONE = 1e-6;
const PUSH_GRACE = 5;
const PUSH_AHEAD = 600;
const AUTO_LEVEL = 1;
const AHEADS: [span: number | null, label: string][] = [
  [null, "as far as the orbit asks"],
  [HOUR, "1 hour"],
  [6 * HOUR, "6 hours"],
  [DAY, "1 day"],
  [10 * DAY, "10 days"],
  [100 * DAY, "100 days"],
  [YEAR, "1 year"],
  [10 * YEAR, "10 years"],
  [100 * YEAR, "100 years"],
];
const LONGEST_FRAME = 0.1;
const READOUT_PACE = 0.15;
const TURN_RATE = 0.9;
const THROTTLE_RATE = 0.7;
const WEATHER_SPAN = 72;
const WEATHER_MOST = 16;
const LOW_HEIGHT = 2e5;
const LOW_SHARE = 0.05;
const LABEL_GAP = 10;
const SEEN_LEAST = 0.6;
const TAG_MOST = 40;
const HEADING_NAMES: Record<Steering, string> = {
  plan: "Plan",
  hold: "Hold",
  prograde: "Prograde",
  retrograde: "Retrograde",
  normal: "Normal",
  antinormal: "Antinormal",
  outward: "Outward",
  inward: "Inward",
};

const query = new URLSearchParams(location.search);
const asked = Number.parseInt(query.get("seed") ?? "", 10);
const seed = Number.isFinite(asked) ? asked : 1;
const settled = query.get("home") !== "0";
const given = Number.parseFloat(query.get("star") ?? "");
const starMass = Number.isFinite(given) && given > 0 ? Math.min(3, Math.max(0.013, given)) : null;
const search = new URLSearchParams({ seed: String(seed), home: settled ? "1" : "0" });
if (starMass !== null) {
  search.set("star", String(starMass));
}
history.replaceState(null, "", `?${search}`);

const system = surveySystem(seed, {
  settled,
  star: starMass === null ? null : starMass * SUN_MASS,
});
const { unit, bodies } = system;
const rails = railsOf(system);
const fly = createFlyer(rails);
const at = new Float64Array(3 * rails.count);
const speed = new Float64Array(3 * rails.count);
const candles = bodies.map(({ physics }) => seenGlow(physics.heat) * physics.radius ** 2);

const figure = (value: number, digits = 4): string => {
  if (value === 0) {
    return "0";
  }
  const size = Math.abs(value);
  if (size >= 1e7 || size < 1e-3) {
    return value.toExponential(digits - 1).replace("e+", "e");
  }
  return size >= 1000
    ? Math.round(value).toLocaleString("en-US")
    : String(Number(value.toPrecision(digits)));
};
const lengthOf = (meters: number): string => {
  const size = Math.abs(meters);
  if (size < 1e4) {
    return `${meters.toFixed(0)} m`;
  }
  return size < 1e10
    ? `${figure(meters / 1000, 5)} km`
    : `${figure(meters / ASTRONOMICAL_UNIT, 5)} AU`;
};
const speedOf = (rate: number): string =>
  Math.abs(rate) < 1000 ? `${rate.toFixed(1)} m/s` : `${figure(rate / 1000, 5)} km/s`;
const spanOf = (seconds: number): string => {
  if (!Number.isFinite(seconds)) {
    return "never";
  }
  const size = Math.abs(seconds);
  const sign = seconds < 0 ? "−" : "";
  if (size < 120) {
    return `${sign}${size.toFixed(0)} s`;
  }
  if (size < 2 * HOUR) {
    return `${sign}${Math.floor(size / 60)} min ${Math.floor(size % 60)} s`;
  }
  if (size < 2 * DAY) {
    return `${sign}${Math.floor(size / HOUR)} h ${Math.floor((size % HOUR) / 60)} min`;
  }
  return size < 2 * YEAR
    ? `${sign}${figure(size / DAY, 4)} d`
    : `${sign}${figure(size / YEAR, 4)} y`;
};
const massOf = (mass: number): string =>
  mass >= 1000 ? `${figure(mass / 1000, 4)} t` : `${figure(mass, 4)} kg`;
const forceOf = (force: number): string =>
  force >= 1e6
    ? `${figure(force / 1e6)} MN`
    : force >= 1000
      ? `${figure(force / 1000)} kN`
      : `${figure(force)} N`;
const dateOf = (seconds: number): string => {
  const pair = (value: number) => String(Math.floor(value)).padStart(2, "0");
  const rest = seconds % DAY;
  const days = Math.floor((seconds % YEAR) / DAY);
  return `${Math.floor(seconds / YEAR)} y ${days} d ${pair(rest / HOUR)}:${pair((rest % HOUR) / 60)}:${pair(rest % 60)}`;
};

const engine = { thrust: 1e5, exhaust: 4500, dry: 4000, tank: 16000, endless: false };
const held = { x: 1, y: 0, z: 0 };
const aim = new Float64Array(3);
const keys = new Set<string>();
const plan: Push[] = [];
const planAim = { x: 1, y: 0, z: 0 };
const frame: Frame = { body: null, turning: false };
let throttle = 0;
let steering: Steering = "prograde";
let autopilot = true;
let aimedFor = -1;
let pushes = 0;
let lookahead: number | null = null;
let target: number | null = null;
let forecast: Forecast | null = null;
let brewing: Forecast | null = null;
let spare: Forecast | null = null;
let stalePlan = true;
let pins: Pin[] = [];
let chosen: number | null = null;
let about = 0;
let level = 0;
let paused = false;
let weather = 0;
let pace = 0;
let dirty = true;
let sinceReadout = Number.POSITIVE_INFINITY;

const lowOver = (id: number) => Math.max(LOW_HEIGHT, LOW_SHARE * rails.radii[id]);
const first =
  system.home ??
  bodies.find((body) => body.parent === 0 && body.physics.mass < 0.01 * bodies[0].physics.mass)
    ?.id ??
  0;
let flight = createFlight(0, [
  ...circling(rails, system, first, lowOver(first), 0),
  engine.dry + engine.tank,
]);
const fuelLeft = () => Math.max(0, flight.state[6] - engine.dry);
const launch = (id: number, height: number) => {
  const { time } = flight;
  flight = createFlight(time, [
    ...circling(rails, system, id, height, time),
    engine.dry + engine.tank,
  ]);
  throttle = 0;
  dirty = true;
  replan();
};

const stage = required<HTMLElement>("#stage");
const space = createSpace(stage, system, true);
const probe = space.probe(CRAFT_REACH / unit);
const craft = createCraft(unit);
const course = createCourse(space.world, system, unit);
const foresee = createFlyer(rails);
space.fore.add(craft.frame, craft.lights);
const tag = el("button", { class: "label craft", type: "button" }, "Ship");
tag.addEventListener("click", () => space.focus(probe.id));
space.labels.append(tag);
let focused = probe.id;

const relative = (id: number) => {
  const base = 3 * id;
  const { state } = flight;
  return [
    state[0] - at[base],
    state[1] - at[base + 1],
    state[2] - at[base + 2],
    state[3] - speed[base],
    state[4] - speed[base + 1],
    state[5] - speed[base + 2],
  ] as const;
};
const burning = () => throttle > 0 && (engine.endless || fuelLeft() > 0);
const headingNow = (): Heading => (steering === "plan" ? "hold" : steering);
const sighted = () => plan.length > 0 && aimedFor === plan[0].id;
const follow = () => {
  held.x = planAim.x;
  held.y = planAim.y;
  held.z = planAim.z;
};
const settle = () => {
  rails.place(flight.time, at, speed);
  about = chosen ?? primaryOf(rails, at, flight.state);
  if (steering === "plan" && sighted() && !burning()) {
    follow();
  }
  headingOf(headingNow(), held, ...relative(about), aim);
};
const burnNow = (): Burn | null =>
  burning()
    ? {
        force: throttle * engine.thrust,
        exhaust: engine.exhaust,
        dry: engine.dry,
        endless: engine.endless,
        heading: headingNow(),
        about,
        held: { ...held },
      }
    : null;
const point = (next: Steering) => {
  if (next === "hold") {
    held.x = aim[0];
    held.y = aim[1];
    held.z = aim[2];
  }
  steering = next;
  dirty = true;
};
const sizeOf = (push: Push) => Math.hypot(push.along, push.north, push.out);
const burnSpan = (gain: number, force: number): number => {
  const mass = flight.state[6];
  return engine.endless
    ? (gain * mass) / force
    : (mass * (1 - Math.exp(-gain / engine.exhaust)) * engine.exhaust) / force;
};
const kicksNow = (): Kick[] =>
  plan.map((push) => ({
    time: Math.max(push.time, flight.time + 1e-3),
    along: push.along * push.left,
    north: push.north * push.left,
    out: push.out * push.left,
    about: null,
  }));
function replan(): void {
  plan.sort((left, right) => left.time - right.time);
  spare = spare ?? brewing;
  brewing = null;
  stalePlan = true;
}
const advance = (until: number) => {
  const started = performance.now();
  while (flight.time < until && flight.wrecked === null && performance.now() - started < BUDGET) {
    let stop = until;
    const push = plan.length > 0 ? plan[0] : null;
    const size = push === null ? 0 : sizeOf(push);
    const pushing = push !== null && size > 0 && steering === "plan" && burning();
    if (push !== null && !pushing) {
      const half = burnSpan(push.left * size, engine.thrust) / 2;
      if (flight.time > push.time + half + PUSH_GRACE) {
        plan.shift();
        listPlan();
        replan();
        continue;
      }
      if (autopilot && size > 0 && sighted() && (engine.endless || fuelLeft() > 0)) {
        if (flight.time >= push.time - half) {
          steering = "plan";
          throttle = 1;
          follow();
          level = Math.min(level, AUTO_LEVEL);
          gauge();
          continue;
        }
        stop = Math.min(stop, push.time - half);
      }
    }
    if (push !== null && pushing) {
      stop = Math.min(stop, flight.time + burnSpan(push.left * size, throttle * engine.thrust));
    }
    const burn = burnNow();
    const mass = flight.state[6];
    const from = flight.time;
    fly(flight, stop, burn, BATCH);
    if (burn !== null) {
      stalePlan = true;
    }
    if (push !== null && pushing && burn !== null) {
      const gained = engine.endless
        ? (burn.force / mass) * (flight.time - from)
        : engine.exhaust * Math.log(mass / flight.state[6]);
      push.left -= gained / size;
      if (push.left <= PUSH_DONE || !burning()) {
        plan.shift();
        throttle = 0;
        steering = "hold";
        listPlan();
        replan();
      }
    }
  }
};
const brew = () => {
  if (brewing === null) {
    const worn =
      forecast === null ||
      flight.time - forecast.times[0] >
        FORECAST_WORN * (forecast.times[forecast.count - 1] - forecast.times[0]);
    if (!stalePlan && !worn) {
      return;
    }
    brewing = createForecast(rails, foresee, flight, kicksNow(), lookahead, FORECAST_ROOM, spare);
    spare = null;
    stalePlan = false;
  }
  const started = performance.now();
  while (!brewing.done && performance.now() - started < FORECAST_BUDGET) {
    brewing.extend(4);
  }
  if (brewing.done) {
    spare = forecast;
    forecast = brewing;
    brewing = null;
    study();
    dirty = true;
  }
};

const turning = new Vector3();
const spun = new Vector3();
const unturned = new Quaternion();
const steer = (frame: number) => {
  const yaw = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
  const pitch = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0);
  if (yaw !== 0 || pitch !== 0) {
    if (steering !== "hold") {
      point("hold");
    }
    unturned.copy(space.world.quaternion).invert();
    spun.set(held.x, held.y, held.z);
    turning.setFromMatrixColumn(space.camera.matrixWorld, 1).applyQuaternion(unturned);
    spun.applyAxisAngle(turning, -yaw * TURN_RATE * frame);
    turning.setFromMatrixColumn(space.camera.matrixWorld, 0).applyQuaternion(unturned);
    spun.applyAxisAngle(turning, pitch * TURN_RATE * frame).normalize();
    held.x = spun.x;
    held.y = spun.y;
    held.z = spun.z;
    dirty = true;
  }
  const lift =
    (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 1 : 0) -
    (keys.has("ControlLeft") || keys.has("ControlRight") ? 1 : 0);
  if (lift !== 0) {
    throttle = Math.max(0, Math.min(1, throttle + lift * THROTTLE_RATE * frame));
    dirty = true;
  }
};

space.onFrame((elapsed) => {
  const frame = Math.min(elapsed, LONGEST_FRAME);
  steer(frame);
  const before = flight.time;
  if (!paused && flight.wrecked === null) {
    advance(flight.time + WARPS[level] * frame);
    weather += frame * Math.min(WARPS[level] / WEATHER_SPAN, WEATHER_MOST);
    dirty = true;
  }
  if (frame > 0) {
    pace += 0.1 * ((flight.time - before) / frame - pace);
  }
  brew();
  if (dirty) {
    settle();
    space.clock(flight.time, 0, weather);
    dirty = false;
  }
  sinceReadout += elapsed;
  if (sinceReadout >= READOUT_PACE) {
    sinceReadout = 0;
    refresh();
  }
});

space.onArrange(() => {
  const { state } = flight;
  probe.frame.position.set(state[0] / unit, state[1] / unit, state[2] / unit);
});

const shipAt = new Vector3();
const eyeAt = new Vector3();
const toward = new Vector3();
const sunward = new Vector3();
const projected = new Vector3();
const blocked = (fromX: number, fromY: number, fromZ: number, to: number[], skip: number) => {
  const dx = to[0] - fromX;
  const dy = to[1] - fromY;
  const dz = to[2] - fromZ;
  const whole = dx * dx + dy * dy + dz * dz;
  for (let body = 0; body < rails.count; body++) {
    if (body === skip) {
      continue;
    }
    const cx = at[3 * body] - fromX;
    const cy = at[3 * body + 1] - fromY;
    const cz = at[3 * body + 2] - fromZ;
    const along = (cx * dx + cy * dy + cz * dz) / whole;
    if (along <= 0 || along >= 1) {
      continue;
    }
    const aside = cx * cx + cy * cy + cz * cz - along * along * whole;
    if (aside < rails.radii[body] ** 2) {
      return true;
    }
  }
  return false;
};

const pinLabels: HTMLElement[] = [];
const pinAt = new Vector3();
const arm = new Vector3();
const heart = new Vector3();
const shares = new Map<number, ReturnType<typeof lagrangeOf>>();
let pinned = 0;
const pin = (text: string, tone: string, where: Vector3) => {
  const { world, camera } = space;
  where.applyMatrix4(world.matrixWorld);
  if (projected.copy(where).applyMatrix4(camera.matrixWorldInverse).z >= 0) {
    return;
  }
  if (pinned === pinLabels.length) {
    const made = el("div", { class: "label pin" }, "");
    space.labels.append(made);
    pinLabels.push(made);
  }
  const label = pinLabels[pinned];
  pinned += 1;
  projected.copy(where).project(camera);
  const x = (projected.x * 0.5 + 0.5) * stage.clientWidth;
  const y = (0.5 - projected.y * 0.5) * stage.clientHeight;
  write(label, text);
  label.dataset.tone = tone;
  label.style.display = "";
  const lift = tone === "turn" ? "30%" : "-130%";
  label.style.transform = `translate(-50%, ${lift}) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
};
const balances = (id: number) => {
  const hub = hubOf(system, id, flight.time, true);
  const centre = centreOf(system, id, flight.time, true);
  const share = swayOf(system, id);
  const found = shares.get(id) ?? lagrangeOf(share);
  shares.set(id, found);
  arm.set(hub.x - centre.x, hub.y - centre.y, hub.z - centre.z).divideScalar(1 - share);
  heart.set(hub.x, hub.y, hub.z).sub(arm);
  const spots: [string, number, number][] = [
    ["L1", 1 - found.inner, 0],
    ["L2", 1 + found.outer, 0],
    ["L3", -found.far, 0],
    ["L4", 1, Math.PI / 3],
    ["L5", 1, -Math.PI / 3],
  ];
  for (const [name, reach, angle] of spots) {
    pinAt
      .copy(arm)
      .applyAxisAngle(course.pole(id), angle)
      .multiplyScalar(reach)
      .add(heart)
      .divideScalar(unit);
    pin(name, "balance", pinAt);
  }
};

space.onPresent(() => {
  const { world, camera } = space;
  const { state } = flight;
  const ship = [state[0], state[1], state[2]];
  course.place(flight.time, at, state);
  shipAt.copy(probe.frame.position).applyMatrix4(world.matrixWorld);
  const gap = shipAt.distanceTo(camera.position);
  eyeAt.copy(camera.position);
  world.worldToLocal(eyeAt).multiplyScalar(unit);
  const hidden = blocked(eyeAt.x, eyeAt.y, eyeAt.z, ship, -1);

  let sun = 0;
  let seen = 0;
  for (let body = 0; body < rails.count; body++) {
    const apart =
      (at[3 * body] - ship[0]) ** 2 +
      (at[3 * body + 1] - ship[1]) ** 2 +
      (at[3 * body + 2] - ship[2]) ** 2;
    if (candles[body] / apart > seen) {
      seen = candles[body] / apart;
      sun = body;
    }
  }
  const lamp = [at[3 * sun], at[3 * sun + 1], at[3 * sun + 2]];
  const shaded = blocked(ship[0], ship[1], ship[2], lamp, sun);
  const lit = shaded || seen <= 0 ? 0 : shownLight([seen], 0).lamps[0];
  sunward
    .set(lamp[0] - ship[0], lamp[1] - ship[1], lamp[2] - ship[2])
    .normalize()
    .applyQuaternion(world.quaternion);
  toward.set(aim[0], aim[1], aim[2]).applyQuaternion(world.quaternion);

  const reach = CRAFT_REACH / unit;
  const pixels = stage.clientHeight / 2 / Math.tan((camera.fov * Math.PI) / 360);
  const wide = (reach * pixels) / Math.max(gap, 1e-12);
  craft.frame.position.copy(shipAt);
  craft.frame.visible = !hidden && wide >= SEEN_LEAST;
  craft.pose(toward, burning() ? throttle : 0, sunward, lit);
  space.depth(Math.max(gap - 3 * reach, 0.05 * gap), gap + 3 * reach);

  const ahead = projected.copy(shipAt).applyMatrix4(camera.matrixWorldInverse).z < 0;
  const shown = !hidden && ahead && wide < TAG_MOST;
  tag.style.display = shown ? "" : "none";
  if (shown) {
    projected.copy(shipAt).project(camera);
    const x = (projected.x * 0.5 + 0.5) * stage.clientWidth;
    const y = (0.5 - projected.y * 0.5) * stage.clientHeight;
    tag.classList.toggle("focus", focused === probe.id);
    tag.style.transform = `translate(-50%, 0) translate(${x.toFixed(1)}px, ${(y + wide + LABEL_GAP).toFixed(1)}px)`;
  }

  pinned = 0;
  if (forecast !== null) {
    for (const each of pins) {
      const late = forecast.times[Math.min(each.slot + 1, forecast.count - 1)] >= flight.time;
      if (late && course.spot(each.slot, each.share, pinAt)) {
        pin(each.text, each.tone, pinAt);
      }
    }
  }
  if (frame.turning && frame.body !== null && bodies[frame.body].parent !== null) {
    balances(frame.body);
  }
  for (let index = pinned; index < pinLabels.length; index++) {
    pinLabels[index].style.display = "none";
  }
});

let passAhead: {
  body: number;
  low: number | null;
  high: number | null;
  lowAt: number;
  highAt: number;
} | null = null;
let passNear: { gap: number; time: number } | null = null;
function study(): void {
  course.show(forecast, frame);
  pins = [];
  passAhead = null;
  passNear = null;
  if (forecast === null) {
    return;
  }
  const { marks, count } = forecast;
  let last = 0;
  marks.forEach((mark, index) => {
    if (mark >= 0) {
      pins.push({ text: `Push ${index + 1}`, tone: "push", slot: mark, share: 0 });
      last = mark;
    }
  });
  if (plan.length > 0 && marks.length > 0 && marks[0] >= 0) {
    const size = Math.hypot(forecast.pushes[0], forecast.pushes[1], forecast.pushes[2]);
    if (size > 0) {
      planAim.x = forecast.pushes[0] / size;
      planAim.y = forecast.pushes[1] / size;
      planAim.z = forecast.pushes[2] / size;
      aimedFor = plan[0].id;
    }
  }
  const body = frame.body ?? forecast.holds[count - 1];
  const radius = rails.radii[body];
  let entered = count - 1;
  while (frame.body === null && entered > last && forecast.holds[entered - 1] === body) {
    entered -= 1;
  }
  const since = forecast.times[frame.body === null ? entered : last];
  const { lows, highs } = passesOf(forecast, rails.count, body, since);
  const low = lows.length > 0 ? lows[0] : null;
  const high = highs.length > 0 ? highs[0] : null;
  if (low !== null) {
    pins.push({
      text: `Lowest ${lengthOf(low.gap - radius)}`,
      tone: "turn",
      slot: low.index,
      share: low.share,
    });
  }
  if (high !== null) {
    pins.push({
      text: `Highest ${lengthOf(high.gap - radius)}`,
      tone: "turn",
      slot: high.index,
      share: high.share,
    });
  }
  passAhead = {
    body,
    low: low === null ? null : low.gap - radius,
    high: high === null ? null : high.gap - radius,
    lowAt: low?.time ?? 0,
    highAt: high?.time ?? 0,
  };
  if (target !== null) {
    const { nearest } = passesOf(forecast, rails.count, target, forecast.times[0]);
    if (nearest !== null) {
      const gap = nearest.gap - rails.radii[target];
      pins.push({
        text: `Nearest ${bodies[target].name} ${lengthOf(gap)}`,
        tone: "near",
        slot: nearest.index,
        share: nearest.share,
      });
      passNear = { gap, time: nearest.time };
    }
  }
  if (forecast.wrecked !== null) {
    pins.push({
      text: `Strikes ${bodies[forecast.wrecked].name}`,
      tone: "wreck",
      slot: count - 1,
      share: 0,
    });
  }
}

const cell = () => el("td", {}, "");
const readings = {
  about: cell(),
  height: cell(),
  speed: cell(),
  high: cell(),
  low: cell(),
  year: cell(),
  stretch: cell(),
  lean: cell(),
  mass: cell(),
  budget: cell(),
  push: cell(),
};
const referenceField = el(
  "select",
  { title: "The body the readings and the headings are counted from" },
  el("option", { value: "auto" }, "nearest hold"),
  ...bodies.map((body) => el("option", { value: String(body.id) }, body.name)),
);
referenceField.addEventListener("change", () => {
  chosen = referenceField.value === "auto" ? null : Number(referenceField.value);
  dirty = true;
});
const state = el("div", { class: "hint" }, "");
const line = (name: string, value: HTMLElement) => el("tr", {}, el("td", {}, name), value);

const throttleField = el("input", { type: "range", min: "0", max: "1", step: "0.01", value: "0" });
const throttleNote = el("span", {}, "0%");
throttleField.addEventListener("input", () => {
  throttle = Number(throttleField.value);
  dirty = true;
});
const steerings: Steering[] = [...HEADINGS, "plan"];
const headings = steerings.map((name) => {
  const title =
    name === "plan" ? "Point the ship along the next planned push" : `Point the ship ${name}`;
  const control = button(HEADING_NAMES[name], title, () => point(name));
  return { name, control };
});

const planList = el("div", { class: "plan" });
const aheadLine = el("div", { class: "hint" }, "");
const nearLine = el("div", { class: "hint" }, "");
let planRows: { push: Push; when: HTMLElement; sum: HTMLElement }[] = [];
const turnNow = () => orbitOf(rails.pulls[about], ...relative(about), poleOf(bodies[about]));
const nudge = () => {
  const { year } = turnNow();
  return Number.isFinite(year) ? Math.max(1, year / 360) : 60;
};
function listPlan(): void {
  planList.replaceChildren();
  planRows = plan.map((push, index) => {
    const when = el("span", { class: "value" }, "");
    const sum = el("div", { class: "hint" }, "");
    const shift = (label: string, title: string, turns: number) =>
      button(label, title, () => {
        push.time = Math.max(flight.time + 1, push.time + turns * nudge());
        replan();
        listPlan();
      });
    const part = (name: string, title: string, key: "along" | "north" | "out") => {
      const field = el("input", { type: "number", step: "1", value: String(push[key]), title });
      field.addEventListener("input", () => {
        const typed = Number.parseFloat(field.value);
        push[key] = Number.isFinite(typed) ? typed : 0;
        push.left = 1;
        replan();
      });
      return el("label", {}, name, field);
    };
    planList.append(
      el(
        "div",
        { class: "push" },
        el(
          "div",
          { class: "strip" },
          el("strong", {}, `Push ${index + 1}`),
          when,
          shift("«", "A tenth of a turn earlier", -36),
          shift("‹", "A degree of the orbit earlier", -1),
          shift("›", "A degree of the orbit later", 1),
          shift("»", "A tenth of a turn later", 36),
          button("Drop", "Take this push out of the plan", () => {
            plan.splice(plan.indexOf(push), 1);
            replan();
            listPlan();
          }),
        ),
        el(
          "div",
          { class: "strip" },
          part("along", "Meters a second along the path, or against it when negative", "along"),
          part("north", "Meters a second across the plane of the orbit", "north"),
          part("out", "Meters a second outward, or inward when negative", "out"),
        ),
        sum,
      ),
    );
    return { push, when, sum };
  });
}
const add = (time: number) => {
  if (!Number.isFinite(time) || time <= flight.time) {
    return;
  }
  pushes += 1;
  plan.push({ id: pushes, time, along: 0, north: 0, out: 0, left: 1 });
  replan();
  listPlan();
};
const autoField = el("input", { type: "checkbox" });
autoField.checked = autopilot;
autoField.addEventListener("change", () => {
  autopilot = autoField.checked;
});
const pick = (
  title: string,
  options: [value: string, label: string][],
  onPick: (value: string) => void,
) => {
  const field = el(
    "select",
    { title },
    ...options.map(([value, label]) => el("option", { value }, label)),
  );
  field.addEventListener("change", () => onPick(field.value));
  return field;
};
const named: [value: string, label: string][] = bodies.map((body) => [String(body.id), body.name]);
const aheadField = pick(
  "How far ahead the path is worked out, from now or from the last planned push",
  AHEADS.map(([, label], index) => [String(index), label]),
  (value) => {
    lookahead = AHEADS[Number(value)][0];
    replan();
  },
);
const turningField = el("input", { type: "checkbox" });
const reframe = () => {
  study();
  dirty = true;
};
const frameField = pick(
  "The body the path is drawn around",
  [["own", "the body holding each part"], ...named],
  (value) => {
    frame.body = value === "own" ? null : Number(value);
    reframe();
  },
);
turningField.addEventListener("change", () => {
  frame.turning = turningField.checked;
  reframe();
});
const targetField = pick(
  "The body whose nearest pass is marked on the path",
  [["none", "none"], ...named],
  (value) => {
    target = value === "none" ? null : Number(value);
    reframe();
  },
);

interface Dial {
  parts: HTMLElement[];
  show(): void;
}
const dial = (
  name: string,
  title: string,
  from: number,
  to: number,
  read: () => number,
  set: (value: number) => void,
  shown: (value: number) => string,
): Dial => {
  const field = el("input", {
    type: "range",
    min: String(from),
    max: String(to),
    step: "0.01",
    value: String(Math.log10(read())),
    title,
  });
  const note = el("span", {}, shown(read()));
  field.addEventListener("input", () => {
    set(10 ** Number(field.value));
    write(note, shown(read()));
    dirty = true;
    sinceReadout = Number.POSITIVE_INFINITY;
  });
  return { parts: [el("span", {}, name), field, note], show: () => write(note, shown(read())) };
};
const dials = [
  dial(
    "Thrust",
    "The push of the engine at full throttle",
    2,
    8,
    () => engine.thrust,
    (value) => {
      engine.thrust = value;
    },
    forceOf,
  ),
  dial(
    "Exhaust",
    "The speed of the exhaust: the faster, the farther a tank goes",
    3,
    7.5,
    () => engine.exhaust,
    (value) => {
      engine.exhaust = value;
    },
    (value) => `${speedOf(value)} · ${figure(value / STANDARD_GRAVITY, 3)} s`,
  ),
  dial(
    "Ship",
    "The mass of the ship with empty tanks",
    2,
    6,
    () => engine.dry,
    (value) => {
      flight.state[6] += value - engine.dry;
      engine.dry = value;
    },
    massOf,
  ),
  dial(
    "Tanks",
    "The propellant the tanks hold when full",
    2,
    7,
    () => engine.tank,
    (value) => {
      engine.tank = value;
      flight.state[6] = engine.dry + Math.min(fuelLeft(), value);
    },
    massOf,
  ),
];
const endlessField = el("input", { type: "checkbox" });
endlessField.addEventListener("change", () => {
  engine.endless = endlessField.checked;
  dirty = true;
});

const heightField = el("input", {
  type: "number",
  min: "1",
  step: "10",
  placeholder: "low",
  title: "Height above the body in kilometers; empty for a low orbit",
});
const aimed = () => (focused === probe.id ? about : focused);
const orbitButton = button("Orbit", "Put the ship into a round orbit of this body", () => {
  const typed = Number.parseFloat(heightField.value);
  launch(aimed(), Number.isFinite(typed) && typed > 0 ? typed * 1000 : lowOver(aimed()));
  space.focus(probe.id);
});

const depthOf = (id: number): number => {
  const { parent } = bodies[id];
  return parent === null ? 0 : 1 + depthOf(parent);
};
const shipRow = el("tr", {}, el("td", {}, "Ship"), el("td", {}, ""), el("td", {}, ""));
shipRow.addEventListener("click", () => space.focus(probe.id));
const rows = bodies.map((body) => {
  const far = cell();
  const row = el(
    "tr",
    {},
    el("td", { style: `padding-left: ${4 + 12 * depthOf(body.id)}px` }, body.name),
    el("td", {}, classOf(body.physics)),
    far,
  );
  row.addEventListener("click", () => space.focus(body.id));
  return { row, far };
});
const mark = () => {
  shipRow.classList.toggle("active", focused === probe.id);
  rows.forEach(({ row }, id) => {
    row.classList.toggle("active", focused === id);
  });
  write(orbitButton, `Orbit ${bodies[aimed()].name}`);
};
space.onFocus((id) => {
  focused = id;
  mark();
});

const clock = el("span", { class: "clock" }, dateOf(0));
const rate = el("span", { class: "rate" }, "");
const pauseButton = button("Pause", "Stop or start time (Space)", () => {
  paused = !paused;
  dirty = true;
  gauge();
});
const warps = WARPS.map((warp, index) =>
  button(
    warp < 1e4 ? `${warp}×` : `10${"⁰¹²³⁴⁵⁶⁷"[Math.round(Math.log10(warp))]}×`,
    `${figure(warp)} seconds a second`,
    () => {
      level = index;
      paused = false;
      gauge();
    },
  ),
);
const gauge = () => {
  write(pauseButton, paused ? "Resume" : "Pause");
  pauseButton.classList.toggle("active", paused);
  warps.forEach((control, index) => {
    control.classList.toggle("active", index === level);
  });
};
gauge();

function refresh(): void {
  const body = bodies[about];
  const [rx, ry, rz, vx, vy, vz] = relative(about);
  const radius = rails.radii[about];
  const orbit = orbitOf(rails.pulls[about], rx, ry, rz, vx, vy, vz, poleOf(body));
  const fuel = fuelLeft();
  const mass = flight.state[6];
  write(readings.height, lengthOf(Math.hypot(rx, ry, rz) - radius));
  write(readings.speed, speedOf(Math.hypot(vx, vy, vz)));
  write(
    readings.high,
    Number.isFinite(orbit.high)
      ? `${lengthOf(orbit.high - radius)} · in ${spanOf(orbit.toHigh)}`
      : "none, the path is open",
  );
  write(
    readings.low,
    `${lengthOf(orbit.low - radius)}${orbit.low < radius ? " · under the ground" : ""} · ${
      orbit.toLow >= 0 ? `in ${spanOf(orbit.toLow)}` : `${spanOf(-orbit.toLow)} ago`
    }`,
  );
  readings.low.classList.toggle("alert", orbit.low < radius);
  write(readings.year, spanOf(orbit.year));
  write(readings.stretch, figure(orbit.stretch, 4));
  write(readings.lean, `${((orbit.lean * 180) / Math.PI).toFixed(2)}° to its equator`);
  write(
    readings.mass,
    engine.endless
      ? `${massOf(mass)} · tanks never empty`
      : `${massOf(mass)} · ${massOf(fuel)} of propellant`,
  );
  write(
    readings.budget,
    engine.endless ? "without end" : speedOf(engine.exhaust * Math.log(mass / engine.dry)),
  );
  const push = engine.thrust / mass;
  write(readings.push, `${figure(push, 3)} m/s² · ${figure(push / STANDARD_GRAVITY, 3)} g`);
  write(
    state,
    flight.wrecked === null
      ? "W A S D turn the ship · Shift and Ctrl move the throttle · Z full · X cut · comma and period change the speed of time · Space pauses"
      : `The ship struck ${bodies[flight.wrecked].name}. Put it into an orbit to fly on.`,
  );
  state.classList.toggle("alert", flight.wrecked !== null);
  if (document.activeElement !== throttleField) {
    throttleField.value = String(throttle);
  }
  write(throttleNote, `${Math.round(100 * throttle)}%`);
  for (const { name, control } of headings) {
    control.classList.toggle("active", name === steering);
  }
  for (const each of dials) {
    each.show();
  }
  rows.forEach(({ far }, id) => {
    write(
      far,
      lengthOf(
        Math.hypot(
          at[3 * id] - flight.state[0],
          at[3 * id + 1] - flight.state[1],
          at[3 * id + 2] - flight.state[2],
        ),
      ),
    );
  });
  for (const { push, when, sum } of planRows) {
    const size = sizeOf(push);
    const span = burnSpan(push.left * size, engine.thrust);
    write(when, `in ${spanOf(push.time - flight.time)}`);
    write(
      sum,
      `${speedOf(push.left * size)}${push.left < 1 ? ` left of ${speedOf(size)}` : ""} · a burn of ${spanOf(span)} at full thrust`,
    );
  }
  const ahead = passAhead;
  const struck = forecast === null ? null : forecast.wrecked;
  write(
    aheadLine,
    ahead === null
      ? ""
      : `Ahead, around ${bodies[ahead.body].name}: ${
          ahead.low === null
            ? "no lowest point"
            : `lowest ${lengthOf(ahead.low)} in ${spanOf(ahead.lowAt - flight.time)}`
        } · ${
          ahead.high === null
            ? "no highest point"
            : `highest ${lengthOf(ahead.high)} in ${spanOf(ahead.highAt - flight.time)}`
        }${struck === null ? "" : ` · strikes ${bodies[struck].name}`}`,
  );
  aheadLine.classList.toggle("alert", struck !== null);
  write(
    nearLine,
    target === null
      ? ""
      : passNear === null
        ? `The path ahead has no nearest pass by ${bodies[target].name}.`
        : `Nearest to ${bodies[target].name}: ${lengthOf(passNear.gap)} in ${spanOf(passNear.time - flight.time)}`,
  );
  write(clock, dateOf(flight.time));
  const asked = WARPS[level];
  write(
    rate,
    paused || flight.wrecked !== null || pace > 0.8 * asked
      ? ""
      : `holding ${figure(pace, 2)}× of ${figure(asked, 2)}×`,
  );
  if (referenceField.value === "auto") {
    referenceField.options[0].textContent = `${body.name} (nearest hold)`;
  }
  mark();
}

window.addEventListener("keydown", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.type !== "range") {
    return;
  }
  if (target instanceof HTMLSelectElement) {
    return;
  }
  keys.add(event.code);
  if (event.code === "Space") {
    event.preventDefault();
    paused = !paused;
    gauge();
  } else if (event.code === "Period") {
    level = Math.min(WARPS.length - 1, level + 1);
    gauge();
  } else if (event.code === "Comma") {
    level = Math.max(0, level - 1);
    gauge();
  } else if (event.code === "KeyZ") {
    throttle = 1;
  } else if (event.code === "KeyX") {
    throttle = 0;
  }
  dirty = true;
});
window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});
window.addEventListener("blur", () => keys.clear());

required<HTMLElement>("#topbar").append(
  el("strong", {}, "Flight"),
  pauseButton,
  ...warps,
  clock,
  rate,
  el("a", { href: `generator.html?${search}&scale=real` }, "System"),
);

required<HTMLElement>("#panel").append(
  el(
    "div",
    { class: "body" },
    el(
      "section",
      {},
      el("h3", {}, "Flight"),
      el(
        "table",
        { class: "facts" },
        el("tr", {}, el("td", {}, "Around"), el("td", {}, referenceField)),
        line("Height", readings.height),
        line("Speed", readings.speed),
        line("Highest", readings.high),
        line("Lowest", readings.low),
        line("Turn", readings.year),
        line("Stretch", readings.stretch),
        line("Lean", readings.lean),
      ),
    ),
    el(
      "section",
      {},
      el("h3", {}, "Ship"),
      el(
        "table",
        { class: "facts" },
        line("Mass", readings.mass),
        line("Speed left in the tanks", readings.budget),
        line("Full thrust gives", readings.push),
      ),
      el("div", { class: "dial" }, el("span", {}, "Throttle"), throttleField, throttleNote),
      el("div", { class: "strip" }, ...headings.map(({ control }) => control)),
      state,
    ),
    el(
      "section",
      {},
      el("h3", {}, "Plan"),
      el(
        "div",
        { class: "strip" },
        button("Push in 10 min", "Plan a push ten minutes from now", () =>
          add(flight.time + PUSH_AHEAD),
        ),
        button("At lowest", "Plan a push at the lowest point of the orbit", () =>
          add(flight.time + turnNow().toLow),
        ),
        button("At highest", "Plan a push at the highest point of the orbit", () =>
          add(flight.time + turnNow().toHigh),
        ),
        el(
          "label",
          { title: "The ship turns and burns each planned push by itself, half before its moment" },
          autoField,
          "the ship flies the plan",
        ),
      ),
      planList,
      aheadLine,
      nearLine,
      el(
        "table",
        { class: "facts" },
        el("tr", {}, el("td", {}, "Path ahead"), el("td", {}, aheadField)),
        el("tr", {}, el("td", {}, "Drawn around"), el("td", {}, frameField)),
        el(
          "tr",
          {},
          el("td", {}, "Turning"),
          el(
            "td",
            {},
            el(
              "label",
              {
                title:
                  "Draw the path as seen turning with that body round what it circles, and mark its five points of balance",
              },
              turningField,
              " with that body",
            ),
          ),
        ),
        el("tr", {}, el("td", {}, "Target"), el("td", {}, targetField)),
      ),
    ),
    el(
      "section",
      {},
      el("h3", {}, "Engine"),
      el("div", { class: "dial" }, ...dials.flatMap((each) => each.parts)),
      el(
        "div",
        { class: "strip" },
        el("label", {}, endlessField, "tanks never empty"),
        button("Refill", "Fill the tanks", () => {
          flight.state[6] = engine.dry + engine.tank;
          dirty = true;
        }),
      ),
    ),
    el(
      "section",
      {},
      el("h3", {}, "Bodies"),
      el("div", { class: "strip" }, orbitButton, el("label", {}, "at", heightField, "km")),
      el("table", { class: "bodies" }, shipRow, ...rows.map(({ row }) => row)),
    ),
  ),
);

settle();
space.focus(probe.id);
refresh();
document.body.dataset.done = "true";
