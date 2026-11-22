import "./style.css";
import "./flight.css";
import {
  type Berth,
  type Burn,
  burnFor,
  type Crust,
  centreOf,
  circling,
  classOf,
  createFlight,
  createFlyer,
  createForecast,
  createLander,
  createRover,
  crustOf,
  DAY,
  type Drive,
  drive,
  type Forecast,
  type Heading,
  HOUR,
  headingOf,
  hubOf,
  type Kick,
  lagrangeOf,
  landable,
  type Outcome,
  orbitOf,
  passesOf,
  poleOf,
  primaryOf,
  type Rover,
  railsOf,
  SOFT_LANDING,
  STANDARD_GRAVITY,
  SUN_MASS,
  seek,
  seenGlow,
  shownLight,
  starborn,
  surveySystem,
  swayOf,
  YEAR,
} from "@barycenter/sim";
import { Vector3 } from "three";
import { BUGGY_REACH, createBuggy } from "./buggy.ts";
import { createCourse, type Frame, type Sight } from "./course.ts";
import { CRAFT_REACH, createCraft } from "./craft.ts";
import { button, el, required, write } from "./dom.ts";
import { type Glyph, glyph } from "./glyphs.ts";
import { createLever } from "./lever.ts";
import { BALL_SIZE, type Bearing, createNavball } from "./navball.ts";
import {
  dayOf,
  figure,
  forceOf,
  hourOf,
  lengthOf,
  massOf,
  rateOf,
  spanOf,
  speedOf,
} from "./readout.ts";
import { createSpace } from "./space.ts";
import { createTerrain } from "./terrain.ts";
import { createTumbler, type Place } from "./tumbler.ts";

type Steering = Heading | "plan";
type Part = "along" | "north" | "out";

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
  act: ((x: number, y: number) => void) | null;
  grab: number | null;
}

interface Haul {
  id: number;
  pointer: number;
  x: number;
  y: number;
  moved: boolean;
}

interface Card {
  frame: HTMLElement;
  fold(closed: boolean): void;
}

const WARPS = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7];
const BUDGET = 7;
const BATCH = 6;
const FORECAST_BUDGET = 3;
const EDIT_BUDGET = 9;
const EDIT_SPAN = 600;
const FORECAST_ROOM = 5000;
const FORECAST_WORN = 0.25;
const PUSH_DONE = 1e-6;
const PUSH_GRACE = 5;
const PUSH_AHEAD = 600;
const PUSH_LEAD = 10;
const WARP_LEAD = 1;
const AUTO_LEVEL = 1;
const AHEADS: [span: number | null, label: string][] = [
  [null, "as the orbit asks"],
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
const ROLL_RATE = 1.4;
const THROTTLE_RATE = 0.7;
const WEATHER_SPAN = 72;
const WEATHER_MOST = 16;
const LOW_HEIGHT = 2e5;
const PLUMB_FULL = 0.05;
const STAND = 5.2;
const ROVER_APART = 14;
const SET_DOWN_TURN = 0.95;
const ROVER_PACE = 4;
const LIFT_CLEAR = 0.2;
const SKIM_SHARE = 0.03;
const PLUMB_NONE = 0.3;
const LOW_SHARE = 0.05;
const LABEL_GAP = 10;
const SEEN_LEAST = 0.6;
const TAG_MOST = 40;
const PICK_REACH = 12;
const TOUCH_REACH = 26;
const MAP_FIT = 4.2;
const DECK_LIFT = 0.11;
const OPEN_FIT = 3;
const QUEST_LEAD = 600;
const QUEST_BUDGET = 6;
const HAUL_SLACK = 4;
const HAUL_HUSH = 300;
const LAY_BUDGET = 250;
const RAIL_SHADE = 0.4;
const LEVER_DECADES = 6;
const LEVER_MARKS: [value: number, label: string][] = [
  [-1e6, "−1M"],
  [-1e4, "−10k"],
  [-100, "−100"],
  [0, "0"],
  [100, "100"],
  [1e4, "10k"],
  [1e6, "1M"],
];
const SPEED_PLACES: (Place | string)[] = [
  { step: 1e6, within: Number.POSITIVE_INFINITY, title: "1,000 km/s a notch" },
  { step: 1e5, within: Number.POSITIVE_INFINITY, title: "100 km/s a notch" },
  { step: 1e4, within: Number.POSITIVE_INFINITY, title: "10 km/s a notch" },
  { step: 1e3, within: Number.POSITIVE_INFINITY, title: "1 km/s a notch" },
  { step: 100, within: Number.POSITIVE_INFINITY, title: "100 m/s a notch" },
  { step: 10, within: Number.POSITIVE_INFINITY, title: "10 m/s a notch" },
  { step: 1, within: Number.POSITIVE_INFINITY, title: "1 m/s a notch" },
  ".",
  { step: 0.1, within: Number.POSITIVE_INFINITY, title: "0.1 m/s a notch" },
];
const TIME_PLACES: (Place | string)[] = [
  { step: 10 * DAY, within: Number.POSITIVE_INFINITY, title: "Ten days a notch" },
  { step: DAY, within: Number.POSITIVE_INFINITY, title: "A day a notch" },
  " d ",
  { step: 10 * HOUR, within: DAY, title: "Ten hours a notch" },
  { step: HOUR, within: DAY, title: "An hour a notch" },
  ":",
  { step: 600, within: HOUR, title: "Ten minutes a notch" },
  { step: 60, within: HOUR, title: "A minute a notch" },
  ":",
  { step: 10, within: 60, title: "Ten seconds a notch" },
  { step: 1, within: 60, title: "A second a notch" },
];
const TOAST_SPAN = 5;
const NARROW = 760;
const TONES = {
  along: "#d8e85a",
  north: "#c792ff",
  out: "#5fd0ff",
  plan: "#ffab4a",
  target: "#ff7ab8",
};
const MODES: { name: Steering; label: string; glyph: Glyph; tone: string; title: string }[] = [
  {
    name: "prograde",
    label: "Prograde",
    glyph: "prograde",
    tone: TONES.along,
    title: "Along the path",
  },
  {
    name: "retrograde",
    label: "Retrograde",
    glyph: "retrograde",
    tone: TONES.along,
    title: "Against the path",
  },
  {
    name: "normal",
    label: "Normal",
    glyph: "normal",
    tone: TONES.north,
    title: "Across the plane of the orbit, to its north",
  },
  {
    name: "antinormal",
    label: "Antinormal",
    glyph: "antinormal",
    tone: TONES.north,
    title: "Across the plane of the orbit, to its south",
  },
  {
    name: "outward",
    label: "Outward",
    glyph: "outward",
    tone: TONES.out,
    title: "Away from the body, square to the path",
  },
  {
    name: "inward",
    label: "Inward",
    glyph: "inward",
    tone: TONES.out,
    title: "Toward the body, square to the path",
  },
  {
    name: "hold",
    label: "Hold",
    glyph: "hold",
    tone: "#ffd27a",
    title: "Keep the nose where it points",
  },
  { name: "plan", label: "Plan", glyph: "plan", tone: TONES.plan, title: "Along the next push" },
];
const KEYS: [keys: string, deed: string][] = [
  ["W S", "nose up and down"],
  ["A D", "nose left and right"],
  ["Q E", "roll"],
  ["drag the ball", "turn the ship with the mouse"],
  ["R F", "throttle up and down"],
  ["Z X", "full throttle, engine off"],
  ["1 – 8", "headings, in the order of their buttons"],
  [". ,", "time faster and slower"],
  ["/", "time back to its real speed"],
  ["Space", "pause"],
  ["click the path", "plan a push there or run time to it"],
  ["scroll a digit", "change that place of a number in the plan"],
  ["drag a push", "move it along the path"],
  ["Enter", "run time to the next push"],
  ["Delete", "drop the chosen push"],
  ["M", "the whole orbit and back to the ship"],
  ["G", "set the rover down by a landed ship, then switch between the two"],
  ["W S A D B", "in the rover: drive, steer and brake"],
  ["[ ]", "look at the next body"],
  ["H", "this list"],
];

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
const wished = query.get("body");
const lofty = Number.parseFloat(query.get("height") ?? "");
if (wished !== null) {
  search.set("body", wished);
}
if (Number.isFinite(lofty) && lofty > 0) {
  search.set("height", String(lofty));
}
const grounded = query.get("land") === "1";
if (grounded) {
  search.set("land", "1");
}
history.replaceState(null, "", `?${search}`);

const system = surveySystem(seed, {
  settled,
  star: starMass === null ? null : starMass * SUN_MASS,
});
const { unit, bodies } = system;
const rails = railsOf(system);
const lander = createLander(system);
const footed = (crust: Crust): Crust => ({
  ...crust,
  surface: (body, time, x, y, z) => crust.surface(body, time, x, y, z) + STAND,
});
const fly = createFlyer(rails, footed(lander.crust));
const at = new Float64Array(3 * rails.count);
const speed = new Float64Array(3 * rails.count);
const candles = bodies.map(({ physics }) => seenGlow(physics.heat) * physics.radius ** 2);

const engine = { thrust: 1e5, exhaust: 4500, dry: 4000, tank: 16000, endless: false };
const held = { x: 1, y: 0, z: 0 };
const aim = new Float64Array(3);
const nose = new Vector3(1, 0, 0);
const roof = new Vector3(0, 1, 0);
const side = new Vector3();
const keys = new Set<string>();
const plan: Push[] = [];
const planAim = { x: 1, y: 0, z: 0 };
const frame: Frame = { body: null, turning: false };
let throttle = 0;
let steering: Steering = "prograde";
let autopilot = true;
let aimedFor = -1;
let pushes = 0;
let selected: number | null = null;
let lookahead: number | null = null;
let target: number | null = null;
let forecast: Forecast | null = null;
let forecastFor: number[] = [];
let brewing: Forecast | null = null;
let brewingFor: number[] = [];
let spare: Forecast | null = null;
let stalePlan = true;
let edited = Number.NEGATIVE_INFINITY;
let pins: Pin[] = [];
let chosen: number | null = null;
let about = 0;
let level = 0;
let paused = false;
let warpTo: number | null = null;
let weather = 0;
let pace = 0;
let dirty = true;
let sinceReadout = Number.POSITIVE_INFINITY;
let toast: { text: string; left: number } | null = null;
let rested: Berth | null = null;
let impact = 0;
const drift = new Float64Array(3);
const upNow = new Float64Array(3);
const swirl = { x: 0, y: 0, z: 0 };

const say = (text: string) => {
  toast = { text, left: TOAST_SPAN };
  sinceReadout = Number.POSITIVE_INFINITY;
};
const lowOver = (id: number) => Math.max(LOW_HEIGHT, LOW_SHARE * rails.radii[id]);
const first =
  bodies.find((body) => body.name === wished)?.id ??
  system.home ??
  bodies.find(
    (body) =>
      body.parent !== null && !starborn(body.physics) && starborn(bodies[body.parent].physics),
  )?.id ??
  0;
let flight = createFlight(0, [
  ...circling(
    rails,
    system,
    first,
    Number.isFinite(lofty) && lofty > 0 ? lofty : lowOver(first),
    0,
  ),
  engine.dry + engine.tank,
]);
const fuelLeft = () => Math.max(0, flight.state[6] - engine.dry);

const stage = required<HTMLElement>("#stage");
const hud = required<HTMLElement>("#hud");
const space = createSpace(stage, system, true);
const probe = space.probe(CRAFT_REACH / unit);
const craft = createCraft(unit);
const course = createCourse(space.world, system, unit);
const rail = createCourse(space.world, system, unit, RAIL_SHADE);
const foresee = createFlyer(rails, footed(crustOf(system)));
const forelay = createFlyer(rails, footed(crustOf(system)));
const seeker = createFlyer(rails);
const ball = createNavball();
const terrain = createTerrain(space, system);
const plumbLine = new Vector3();
const rig = space.probe(BUGGY_REACH / unit);
const buggy = createBuggy(unit);
buggy.frame.visible = false;
space.fore.add(craft.frame, craft.lights, buggy.frame);
const wheel = { throttle: 0, turn: 0, brake: false };
const parked = { throttle: 0, turn: 0, brake: true };
const roverAt = new Float64Array(3);
const roverWay = new Float64Array(3);
let rover: Rover | null = null;
let driving = false;
const tag = el("button", { class: "label craft", type: "button" }, "Ship");
tag.addEventListener("click", () => space.focus(probe.id));
space.labels.append(tag);
let focused = probe.id;
const onCraft = () => focused >= bodies.length;
const ride = () => {
  if (rover !== null) {
    space.focus(driving ? probe.id : rig.id);
    return;
  }
  if (rested === null || flight.wrecked !== null) {
    say("Land the ship softly to set the rover down");
    return;
  }
  const { body } = rested;
  const { radius } = bodies[body].physics;
  const flat = lander.crust.squash[body];
  const far = Math.hypot(rested.x, rested.y / flat, rested.z);
  const at = { x: rested.x / far, y: rested.y / flat / far, z: rested.z / far };
  const east = Math.hypot(at.x, at.z) > 1e-3 ? { x: at.z, y: 0, z: -at.x } : { x: 1, y: 0, z: 0 };
  const span = ROVER_APART / radius / Math.hypot(east.x, east.z);
  rover = createRover(
    lander.crust,
    radius,
    body,
    { x: at.x + span * east.x, y: at.y, z: at.z + span * east.z },
    east,
  );
  space.focus(rig.id);
  say("The rover is down · W S drive · A D steer · B brakes · G back to the ship");
};

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
const skimming = (id: number) => {
  const base = 3 * id;
  const { state } = flight;
  const far = Math.hypot(state[0] - at[base], state[1] - at[base + 1], state[2] - at[base + 2]);
  return landable(bodies[id]) && far < (1 + SKIM_SHARE) * rails.radii[id];
};
const swirlOf = (id: number) => {
  const { pole, rate } = lander.crust.turns[id];
  const share = skimming(id) ? rate : 0;
  swirl.x = share * pole.x;
  swirl.y = share * pole.y;
  swirl.z = share * pole.z;
  return swirl;
};
const passing = (id: number) => {
  const [rx, ry, rz, vx, vy, vz] = relative(id);
  const turn = swirlOf(id);
  return [
    rx,
    ry,
    rz,
    vx - (turn.y * rz - turn.z * ry),
    vy - (turn.z * rx - turn.x * rz),
    vz - (turn.x * ry - turn.y * rx),
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
const square = () => {
  nose.set(aim[0], aim[1], aim[2]);
  roof.addScaledVector(nose, -roof.dot(nose));
  if (roof.lengthSq() < 1e-12) {
    roof.set(0, 1, 0).addScaledVector(nose, -nose.y);
  }
  if (roof.lengthSq() < 1e-12) {
    roof.set(1, 0, 0);
  }
  roof.normalize();
  side.crossVectors(nose, roof);
};
const settle = () => {
  rails.place(flight.time, at, speed);
  about = chosen ?? primaryOf(rails, at, flight.state);
  if (steering === "plan" && sighted() && !burning()) {
    follow();
  }
  if (rested !== null) {
    lander.up(rested, flight.time, upNow);
    steering = "hold";
    held.x = upNow[0];
    held.y = upNow[1];
    held.z = upNow[2];
  }
  headingOf(headingNow(), held, ...passing(about), aim);
  square();
};
const upright = () => {
  const [rx, ry, rz] = relative(about);
  roof.set(rx, ry, rz).normalize();
  square();
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
        swirl: { ...swirlOf(about) },
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
const turn = (pitch: number, yaw: number, roll: number) => {
  if (steering !== "hold") {
    point("hold");
  }
  nose.applyAxisAngle(side, pitch);
  roof.applyAxisAngle(side, pitch);
  nose.applyAxisAngle(roof, -yaw).normalize();
  roof.applyAxisAngle(nose, roll);
  held.x = nose.x;
  held.y = nose.y;
  held.z = nose.z;
  aim[0] = nose.x;
  aim[1] = nose.y;
  aim[2] = nose.z;
  square();
  dirty = true;
};
const sizeOf = (push: Push) => Math.hypot(push.along, push.north, push.out);
const driveNow = (): Drive => ({
  force: engine.thrust,
  exhaust: engine.exhaust,
  dry: engine.dry,
  endless: engine.endless,
});
const burnSpan = (gain: number, force: number): number =>
  burnFor({ ...driveNow(), force }, flight.state[6], gain);
const kicksNow = (): Kick[] =>
  plan.map((push) => ({
    time: Math.max(push.time, flight.time + 1e-3),
    along: push.along * push.left,
    north: push.north * push.left,
    out: push.out * push.left,
    about: null,
    drive: driveNow(),
  }));
const order = () => plan.sort((left, right) => left.time - right.time);
function replan(): void {
  order();
  spare = spare ?? brewing;
  brewing = null;
  stalePlan = true;
}
const touch = () => {
  order();
  stalePlan = true;
  edited = performance.now();
};
const pick = (rung: number) => {
  level = Math.max(0, Math.min(WARPS.length - 1, rung));
  warpTo = null;
};
const runTo = (time: number) => {
  if (time > flight.time && flight.wrecked === null) {
    warpTo = time;
    paused = false;
  }
};
const launch = (id: number, height: number) => {
  const { time } = flight;
  flight = createFlight(time, [
    ...circling(rails, system, id, height, time),
    engine.dry + engine.tank,
  ]);
  throttle = 0;
  warpTo = null;
  steering = "prograde";
  rested = null;
  settle();
  upright();
  dirty = true;
  replan();
};
const ground = (id: number) => {
  rails.place(flight.time, at, speed);
  lander.slip(id, at, speed, flight.state, drift);
  impact = Math.hypot(drift[0], drift[1], drift[2]);
  rested = lander.touch(id, flight.time, at, flight.state, STAND);
  lander.hold(rested, flight.time, at, speed, flight.state);
  throttle = 0;
  warpTo = null;
  level = 0;
  if (impact <= SOFT_LANDING && landable(bodies[id])) {
    flight.wrecked = null;
    forecast = null;
    brewing = null;
    study();
    say(`Landed on ${bodies[id].name} at ${speedOf(impact)}`);
  }
};
const setDown = (id: number) => {
  const body = bodies[id];
  if (!landable(body)) {
    say(`${body.name} has no ground to stand on`);
    return;
  }
  const { time } = flight;
  rails.place(time, at, speed);
  const base = 3 * id;
  let sun = 0;
  let seen = 0;
  for (let lamp = 0; lamp < rails.count; lamp++) {
    const apart =
      (at[3 * lamp] - at[base]) ** 2 +
      (at[3 * lamp + 1] - at[base + 1]) ** 2 +
      (at[3 * lamp + 2] - at[base + 2]) ** 2;
    if (lamp !== id && candles[lamp] / apart > seen) {
      seen = candles[lamp] / apart;
      sun = lamp;
    }
  }
  const pole = poleOf(body);
  const lit = new Vector3(
    at[3 * sun] - at[base],
    at[3 * sun + 1] - at[base + 1],
    at[3 * sun + 2] - at[base + 2],
  ).normalize();
  const aside = new Vector3(pole.x, pole.y, pole.z).cross(lit);
  if (aside.lengthSq() < 1e-6) {
    aside.set(1, 0, 0).cross(lit);
  }
  lit
    .multiplyScalar(Math.cos(SET_DOWN_TURN))
    .addScaledVector(aside.normalize(), Math.sin(SET_DOWN_TURN));
  const far = 1.2 * rails.radii[id];
  flight = createFlight(time, [
    at[base] + far * lit.x,
    at[base + 1] + far * lit.y,
    at[base + 2] + far * lit.z,
    speed[base],
    speed[base + 1],
    speed[base + 2],
    engine.dry + engine.tank,
  ]);
  rested = lander.touch(id, time, at, flight.state, STAND);
  lander.hold(rested, time, at, speed, flight.state);
  rover = null;
  throttle = 0;
  warpTo = null;
  level = 0;
  forecast = null;
  brewing = null;
  study();
  settle();
  dirty = true;
  space.focus(probe.id);
  say(`The ship stands on ${body.name}`);
};
const stay = (until: number): boolean => {
  if (rested === null) {
    return false;
  }
  const site = rested;
  const { state } = flight;
  const burn = burnNow();
  const far = Math.hypot(site.x, site.y, site.z);
  lander.up(site, flight.time, upNow);
  const lift =
    burn === null
      ? 0
      : (burn.force / state[6]) * (aim[0] * upNow[0] + aim[1] * upNow[1] + aim[2] * upNow[2]);
  if (lift > rails.pulls[site.body] / far ** 2) {
    const clear = 1 + LIFT_CLEAR / far;
    rails.place(flight.time, at, speed);
    lander.hold(
      { body: site.body, x: site.x * clear, y: site.y * clear, z: site.z * clear },
      flight.time,
      at,
      speed,
      state,
    );
    rested = null;
    stalePlan = true;
    say("Lift-off");
    return false;
  }
  if (burn !== null && !burn.endless) {
    state[6] = Math.max(burn.dry, state[6] - (burn.force / burn.exhaust) * (until - flight.time));
  }
  flight.time = until;
  rails.place(until, at, speed);
  lander.hold(site, until, at, speed, state);
  return true;
};
const advance = (until: number) => {
  const started = performance.now();
  while (flight.time < until && flight.wrecked === null && performance.now() - started < BUDGET) {
    if (stay(until)) {
      break;
    }
    let stop = until;
    const push = plan.length > 0 ? plan[0] : null;
    const size = push === null ? 0 : sizeOf(push);
    const pushing = push !== null && size > 0 && steering === "plan" && burning();
    if (push !== null && !pushing) {
      const half = burnSpan(push.left * size, engine.thrust) / 2;
      if (flight.time > push.time + half + PUSH_GRACE) {
        drop(push);
        continue;
      }
      if (autopilot && size > 0 && sighted() && (engine.endless || fuelLeft() > 0)) {
        if (flight.time >= push.time - half) {
          steering = "plan";
          throttle = 1;
          follow();
          level = Math.min(level, AUTO_LEVEL);
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
    if (flight.wrecked !== null) {
      ground(flight.wrecked);
      break;
    }
    if (burn !== null) {
      stalePlan = true;
    }
    if (burn !== null && !burning()) {
      throttle = 0;
      say("The tanks are empty");
    }
    if (push !== null && pushing && burn !== null) {
      const gained = engine.endless
        ? (burn.force / mass) * (flight.time - from)
        : engine.exhaust * Math.log(mass / flight.state[6]);
      push.left -= gained / size;
      if (push.left <= PUSH_DONE || !burning()) {
        if (push.left <= PUSH_DONE) {
          say("The push is given");
        }
        throttle = 0;
        steering = "hold";
        drop(push);
      }
    }
  }
};
const brew = () => {
  if (rested !== null) {
    return;
  }
  if (brewing === null) {
    const worn =
      forecast === null ||
      flight.time - forecast.times[0] >
        FORECAST_WORN * (forecast.times[forecast.count - 1] - forecast.times[0]);
    if (!stalePlan && !worn) {
      return;
    }
    brewing = createForecast(rails, foresee, flight, kicksNow(), lookahead, FORECAST_ROOM, spare);
    brewingFor = plan.map((push) => push.id);
    spare = null;
    stalePlan = false;
  }
  const started = performance.now();
  const budget = started - edited < EDIT_SPAN ? EDIT_BUDGET : FORECAST_BUDGET;
  while (!brewing.done && performance.now() - started < budget) {
    brewing.extend(4);
  }
  if (brewing.done) {
    spare = forecast;
    forecast = brewing;
    forecastFor = brewingFor;
    brewing = null;
    study();
    dirty = true;
  }
};

const pressed = (code: string) => (keys.has(code) ? 1 : 0);
const steer = (elapsed: number) => {
  wheel.throttle = driving ? pressed("KeyW") - pressed("KeyS") : 0;
  wheel.turn = driving ? pressed("KeyD") - pressed("KeyA") : 0;
  wheel.brake = driving && keys.has("KeyB");
  if (driving) {
    return;
  }
  const pitch = pressed("KeyW") - pressed("KeyS");
  const yaw = pressed("KeyD") - pressed("KeyA");
  const roll = pressed("KeyE") - pressed("KeyQ");
  if (pitch !== 0 || yaw !== 0 || roll !== 0) {
    turn(pitch * TURN_RATE * elapsed, yaw * TURN_RATE * elapsed, roll * ROLL_RATE * elapsed);
  }
  const lift = pressed("KeyR") - pressed("KeyF");
  if (lift !== 0) {
    throttle = Math.max(0, Math.min(1, throttle + lift * THROTTLE_RATE * elapsed));
    dirty = true;
  }
};
const chase = () => {
  if (warpTo === null) {
    return;
  }
  const left = warpTo - flight.time;
  if (left <= 0 || flight.wrecked !== null) {
    warpTo = null;
    level = 0;
    return;
  }
  let rung = 0;
  while (rung + 1 < WARPS.length && WARPS[rung + 1] * WARP_LEAD <= left) {
    rung += 1;
  }
  level = burning() ? Math.min(rung, AUTO_LEVEL) : rung;
};

const sky = new Vector3();
const north = new Vector3();
const scratch = new Float64Array(3);
const marked = {
  prograde: new Vector3(),
  retrograde: new Vector3(),
  normal: new Vector3(),
  antinormal: new Vector3(),
  outward: new Vector3(),
  inward: new Vector3(),
  plan: new Vector3(),
  target: new Vector3(),
};
const steady: Bearing[] = [
  { glyph: "normal", tone: TONES.north, toward: marked.normal, edge: false },
  { glyph: "antinormal", tone: TONES.north, toward: marked.antinormal, edge: false },
  { glyph: "outward", tone: TONES.out, toward: marked.outward, edge: false },
  { glyph: "inward", tone: TONES.out, toward: marked.inward, edge: false },
  { glyph: "prograde", tone: TONES.along, toward: marked.prograde, edge: false },
  { glyph: "retrograde", tone: TONES.along, toward: marked.retrograde, edge: false },
];
const toPlan: Bearing = { glyph: "plan", tone: TONES.plan, toward: marked.plan, edge: true };
const toTarget: Bearing = {
  glyph: "target",
  tone: TONES.target,
  toward: marked.target,
  edge: true,
};
const instrument = () => {
  const [rx, ry, rz, vx, vy, vz] = passing(about);
  const pairs: [Heading, Vector3, Vector3][] = [
    ["prograde", marked.prograde, marked.retrograde],
    ["normal", marked.normal, marked.antinormal],
    ["outward", marked.outward, marked.inward],
  ];
  for (const [name, fore, back] of pairs) {
    headingOf(name, held, rx, ry, rz, vx, vy, vz, scratch);
    fore.set(scratch[0], scratch[1], scratch[2]);
    back.copy(fore).negate();
  }
  sky.set(rx, ry, rz).normalize();
  const pole = poleOf(bodies[about]);
  north.set(pole.x, pole.y, pole.z);
  const bearings = [...steady];
  if (target !== null && target !== about) {
    const [tx, ty, tz] = relative(target);
    marked.target.set(-tx, -ty, -tz).normalize();
    bearings.push(toTarget);
  }
  if (sighted()) {
    marked.plan.set(planAim.x, planAim.y, planAim.z);
    bearings.push(toPlan);
  }
  ball.draw(nose, roof, sky, north, bearings);
};

space.onFrame((elapsed) => {
  const tick = Math.min(elapsed, LONGEST_FRAME);
  steer(tick);
  chase();
  think();
  if (toast !== null) {
    toast.left -= tick;
    if (toast.left <= 0) {
      toast = null;
      sinceReadout = Number.POSITIVE_INFINITY;
    }
  }
  const before = flight.time;
  if (!paused && flight.wrecked === null) {
    advance(flight.time + WARPS[level] * tick);
    weather += tick * Math.min(WARPS[level] / WEATHER_SPAN, WEATHER_MOST);
    dirty = true;
  }
  if (tick > 0) {
    pace += 0.1 * ((flight.time - before) / tick - pace);
  }
  if (rover !== null && !paused && flight.time > before) {
    drive(
      lander.crust,
      rails.radii[rover.body],
      rails.pulls[rover.body],
      rover,
      driving ? wheel : parked,
      Math.min(flight.time - before, ROVER_PACE * tick),
    );
  }
  brew();
  if (dirty) {
    settle();
    space.clock(flight.time, 0, weather);
    dirty = false;
  }
  const [overX, overY, overZ] = relative(about);
  const high = Math.hypot(overX, overY, overZ) / rails.radii[about] - 1;
  const standing = onCraft() && landable(bodies[about]);
  space.plumb(
    standing ? plumbLine.set(overX, overY, overZ) : null,
    1 - Math.max(0, Math.min(1, (high - PLUMB_FULL) / (PLUMB_NONE - PLUMB_FULL))),
  );
  instrument();
  gauge();
  sinceReadout += elapsed;
  if (sinceReadout >= READOUT_PACE) {
    sinceReadout = 0;
    refresh();
  }
});

space.onArrange(() => {
  const { state } = flight;
  probe.frame.position.set(state[0] / unit, state[1] / unit, state[2] / unit);
  if (rover !== null) {
    const base = 3 * rover.body;
    const far = rails.radii[rover.body] + rover.height;
    lander.crust.turns[rover.body].spun(
      flight.time,
      rover.at.x * far,
      lander.crust.squash[rover.body] * rover.at.y * far,
      rover.at.z * far,
      roverAt,
    );
    rig.frame.position.set(
      (at[base] + roverAt[0]) / unit,
      (at[base + 1] + roverAt[1]) / unit,
      (at[base + 2] + roverAt[2]) / unit,
    );
  }
});

const shipAt = new Vector3();
const roverSpot = new Vector3();
const roverAhead = new Vector3();
const roverUp = new Vector3();
const eyeAt = new Vector3();
const toward = new Vector3();
const above = new Vector3();
const sunward = new Vector3();
const projected = new Vector3();
const blocked = (
  fromX: number,
  fromY: number,
  fromZ: number,
  toX: number,
  toY: number,
  toZ: number,
  skip: number,
) => {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dz = toZ - fromZ;
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
const sight: Sight = {
  camera: space.camera,
  width: 1,
  height: 1,
  seen: (spot) =>
    !blocked(eyeAt.x, eyeAt.y, eyeAt.z, spot.x * unit, spot.y * unit, spot.z * unit, -1),
};

const hover = { x: 0, y: 0, on: false };
const coarse = window.matchMedia("(pointer: coarse)");
const ghost = el("div", { class: "label ghost" }, "");
ghost.style.display = "none";
space.labels.append(ghost);
const menuWhen = el("div", { class: "hint" }, "");
const menu = el(
  "div",
  { class: "pathmenu" },
  menuWhen,
  button("Plan a push", "Plan a push at this point of the path", () => {
    const time = menuAt;
    shut();
    if (time !== null) {
      add(time);
    }
  }),
  button("Run time to here", "Speed time up until the ship is here", () => {
    const time = menuAt;
    shut();
    if (time !== null) {
      runTo(time);
    }
  }),
);
menu.style.display = "none";
space.labels.append(menu);
let menuAt: number | null = null;
function shut(): void {
  menuAt = null;
  menu.style.display = "none";
  space.invalidate();
}
const offer = (time: number, x: number, y: number) => {
  menuAt = time;
  menu.style.display = "";
  const left = Math.min(x + 14, stage.clientWidth - menu.offsetWidth - 8);
  const top = Math.min(y + 14, stage.clientHeight - menu.offsetHeight - 8);
  menu.style.transform = `translate(${Math.max(8, left).toFixed(0)}px, ${Math.max(8, top).toFixed(0)}px)`;
  sinceReadout = Number.POSITIVE_INFINITY;
  space.invalidate();
};
stage.addEventListener("pointermove", (event) => {
  const bounds = stage.getBoundingClientRect();
  hover.x = event.clientX - bounds.left;
  hover.y = event.clientY - bounds.top;
  hover.on = event.pointerType === "mouse" && event.buttons === 0;
  space.invalidate();
});
stage.addEventListener("pointerleave", () => {
  hover.on = false;
  space.invalidate();
});
space.onClaim((x, y) => {
  const open = menuAt !== null;
  shut();
  const bounds = stage.getBoundingClientRect();
  const reach = coarse.matches ? TOUCH_REACH : PICK_REACH;
  const found = course.near(sight, x - bounds.left, y - bounds.top, reach, flight.time);
  if (found === null) {
    return open;
  }
  offer(found.time, x - bounds.left, y - bounds.top);
  return true;
});

const pinLabels: HTMLButtonElement[] = [];
const pinActs: (Pin["act"] | undefined)[] = [];
const pinGrabs: (number | null)[] = [];
const pinSpots: [number, number][] = [];
let haul: Haul | null = null;
let hauledAt = Number.NEGATIVE_INFINITY;
const pinAt = new Vector3();
const arm = new Vector3();
const heart = new Vector3();
const shares = new Map<number, ReturnType<typeof lagrangeOf>>();
let pinned = 0;
const pin = (
  text: string,
  tone: string,
  where: Vector3,
  act: Pin["act"],
  grab: number | null = null,
  bright = false,
) => {
  const { world, camera } = space;
  if (!sight.seen(where)) {
    return;
  }
  where.applyMatrix4(world.matrixWorld);
  if (projected.copy(where).applyMatrix4(camera.matrixWorldInverse).z >= 0) {
    return;
  }
  if (pinned === pinLabels.length) {
    const index = pinLabels.length;
    const made = el("button", { class: "label pin", type: "button" }, "");
    made.addEventListener("click", () => {
      if (performance.now() - hauledAt > HAUL_HUSH) {
        pinActs[index]?.(...pinSpots[index]);
      }
    });
    made.addEventListener("pointerdown", (event) => {
      const id = pinGrabs[index];
      if (id !== null && id !== undefined && event.button === 0) {
        event.preventDefault();
        haul = { id, pointer: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      }
    });
    space.labels.append(made);
    pinLabels.push(made);
    pinSpots.push([0, 0]);
  }
  const label = pinLabels[pinned];
  projected.copy(where).project(camera);
  const x = (projected.x * 0.5 + 0.5) * stage.clientWidth;
  const y = (0.5 - projected.y * 0.5) * stage.clientHeight;
  pinActs[pinned] = act;
  pinGrabs[pinned] = grab;
  pinSpots[pinned] = [x, y];
  pinned += 1;
  write(label, text);
  label.dataset.tone = tone;
  label.classList.toggle("live", act !== null);
  label.classList.toggle("grab", grab !== null);
  label.classList.toggle("lit", bright);
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
    pin(name, "balance", pinAt, null);
  }
};

space.onPresent(() => {
  terrain.update();
  const { world, camera } = space;
  const { state } = flight;
  course.place(flight.time, at, state);
  if (haul?.moved) {
    rail.place(flight.time, at, state);
  }
  shipAt.copy(probe.frame.position).applyMatrix4(world.matrixWorld);
  const gap = shipAt.distanceTo(camera.position);
  eyeAt.copy(camera.position);
  world.worldToLocal(eyeAt).multiplyScalar(unit);
  sight.width = stage.clientWidth;
  sight.height = stage.clientHeight;
  const hidden = blocked(eyeAt.x, eyeAt.y, eyeAt.z, state[0], state[1], state[2], -1);

  let sun = 0;
  let seen = 0;
  for (let body = 0; body < rails.count; body++) {
    const apart =
      (at[3 * body] - state[0]) ** 2 +
      (at[3 * body + 1] - state[1]) ** 2 +
      (at[3 * body + 2] - state[2]) ** 2;
    if (candles[body] / apart > seen) {
      seen = candles[body] / apart;
      sun = body;
    }
  }
  const lampX = at[3 * sun];
  const lampY = at[3 * sun + 1];
  const lampZ = at[3 * sun + 2];
  const shaded = blocked(state[0], state[1], state[2], lampX, lampY, lampZ, sun);
  const lit = shaded || seen <= 0 ? 0 : shownLight([seen], 0).lamps[0];
  sunward
    .set(lampX - state[0], lampY - state[1], lampZ - state[2])
    .normalize()
    .applyQuaternion(world.quaternion);
  toward.copy(nose).applyQuaternion(world.quaternion);
  above.copy(roof).applyQuaternion(world.quaternion);

  const reach = CRAFT_REACH / unit;
  const pixels = stage.clientHeight / 2 / Math.tan((camera.fov * Math.PI) / 360);
  const wide = (reach * pixels) / Math.max(gap, 1e-12);
  craft.frame.position.copy(shipAt);
  craft.frame.visible = !hidden && wide >= SEEN_LEAST;
  craft.pose(toward, above, burning() ? throttle : 0, sunward, lit);
  let nearest = Math.max(gap - 3 * reach, 0.05 * gap);
  let farthest = gap + 3 * reach;
  buggy.frame.visible = false;
  if (rover !== null) {
    const turn = lander.crust.turns[rover.body];
    roverSpot.copy(rig.frame.position).applyMatrix4(world.matrixWorld);
    const apart = roverSpot.distanceTo(camera.position);
    const size = BUGGY_REACH / unit;
    buggy.frame.visible = (size * pixels) / Math.max(apart, 1e-12) >= SEEN_LEAST;
    if (buggy.frame.visible) {
      turn.spun(flight.time, rover.ahead.x, rover.ahead.y, rover.ahead.z, roverWay);
      roverAhead.set(roverWay[0], roverWay[1], roverWay[2]).applyQuaternion(world.quaternion);
      turn.spun(flight.time, rover.up.x, rover.up.y, rover.up.z, roverWay);
      roverUp.set(roverWay[0], roverWay[1], roverWay[2]).applyQuaternion(world.quaternion);
      buggy.frame.position.copy(roverSpot);
      buggy.pose(roverAhead, roverUp);
      const close = Math.max(apart - 3 * size, 0.05 * apart);
      nearest = craft.frame.visible ? Math.min(nearest, close) : close;
      farthest = craft.frame.visible ? Math.max(farthest, apart + 3 * size) : apart + 3 * size;
    }
  }
  space.depth(nearest, farthest);

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
        const bright = each.tone === "push" && each.text === litPin;
        pin(each.text, each.tone, pinAt, each.act, each.grab, bright);
      }
    }
  }
  if (frame.turning && frame.body !== null && bodies[frame.body].parent !== null) {
    balances(frame.body);
  }
  for (let index = pinned; index < pinLabels.length; index++) {
    pinLabels[index].style.display = "none";
  }

  const fixed = menuAt === null ? null : course.find(menuAt);
  const near =
    fixed ?? (hover.on ? course.near(sight, hover.x, hover.y, PICK_REACH, flight.time) : null);
  let ghostly = false;
  if (near !== null && course.spot(near.slot, near.share, pinAt)) {
    pinAt.applyMatrix4(world.matrixWorld);
    if (projected.copy(pinAt).applyMatrix4(camera.matrixWorldInverse).z < 0) {
      projected.copy(pinAt).project(camera);
      const x = (projected.x * 0.5 + 0.5) * stage.clientWidth;
      const y = (0.5 - projected.y * 0.5) * stage.clientHeight;
      write(ghost, fixed === null ? `in ${spanOf(near.time - flight.time)}` : "");
      ghost.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      ghostly = true;
    }
  }
  ghost.style.display = ghostly ? "" : "none";
  stage.classList.toggle("aiming", ghostly && fixed === null);
  if (menuAt !== null && menuAt <= flight.time) {
    shut();
  }
});

let litPin = "";
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
  litPin = "";
  if (forecast === null) {
    return;
  }
  const { marks, count } = forecast;
  let last = 0;
  marks.forEach((mark, index) => {
    const id = forecastFor[index];
    const place = plan.findIndex((push) => push.id === id);
    if (mark < 0 || place < 0) {
      return;
    }
    const text = `Push ${place + 1}`;
    pins.push({ text, tone: "push", slot: mark, share: 0, act: () => choose(id), grab: id });
    if (id === selected) {
      litPin = text;
    }
    last = mark;
  });
  if (plan.length > 0 && forecastFor[0] === plan[0].id && marks[0] >= 0) {
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
      act: (x, y) => offer(low.time, x, y),
      grab: null,
    });
  }
  if (high !== null) {
    pins.push({
      text: `Highest ${lengthOf(high.gap - radius)}`,
      tone: "turn",
      slot: high.index,
      share: high.share,
      act: (x, y) => offer(high.time, x, y),
      grab: null,
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
        act: (x, y) => offer(nearest.time, x, y),
        grab: null,
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
      act: null,
      grab: null,
    });
  }
}

const card = (name: string, title: string, ...inside: (Node | null)[]): Card => {
  const head = el("button", { class: "fold", type: "button" }, title);
  const frame = el(
    "section",
    { class: `card ${name}` },
    head,
    el("div", { class: "inside" }, ...inside),
  );
  head.addEventListener("click", () => frame.classList.toggle("folded"));
  return { frame, fold: (closed) => frame.classList.toggle("folded", closed) };
};
const cell = () => el("td", {}, "");
const line = (name: string, ...values: HTMLElement[]) =>
  el("tr", {}, el("td", {}, name), ...values);
const choice = (
  title: string,
  options: [value: string, label: string][],
  onPick: (value: string) => void,
) => {
  const field = el(
    "select",
    { title },
    ...options.map(([value, label]) => el("option", { value }, label)),
  );
  field.addEventListener("change", () => {
    onPick(field.value);
    field.blur();
  });
  return field;
};
const named: [value: string, label: string][] = bodies.map((body) => [String(body.id), body.name]);

const heightName = el("div", { class: "name" }, "Height");
const speedName = el("div", { class: "name" }, "Speed");
const readings = {
  height: el("div", { class: "big" }, ""),
  speed: el("div", { class: "big" }, ""),
  high: cell(),
  highIn: cell(),
  low: cell(),
  lowIn: cell(),
  year: cell(),
  stretch: cell(),
  lean: cell(),
  mass: cell(),
  push: cell(),
  tank: el("span", { class: "value" }, ""),
  budget: el("span", { class: "value" }, ""),
};
const referenceField = choice(
  "The body the readings and the headings are counted from",
  [["auto", "nearest hold"], ...named],
  (value) => {
    chosen = value === "auto" ? null : Number(value);
    dirty = true;
  },
);

const throttleFill = el("div", { class: "fill" });
const throttleNote = el("div", { class: "note" }, "0%");
const throttleTrack = el(
  "div",
  { class: "track", title: "Throttle: drag, or R and F, Z for full and X for off" },
  throttleFill,
);
const slide = (event: PointerEvent) => {
  const bounds = throttleTrack.getBoundingClientRect();
  throttle = Math.max(0, Math.min(1, (bounds.bottom - event.clientY) / bounds.height));
  if (throttle < 0.03) {
    throttle = 0;
  }
  dirty = true;
};
throttleTrack.addEventListener("pointerdown", (event) => {
  throttleTrack.setPointerCapture(event.pointerId);
  slide(event);
});
throttleTrack.addEventListener("pointermove", (event) => {
  if (throttleTrack.hasPointerCapture(event.pointerId)) {
    slide(event);
  }
});

let grip: { id: number; x: number; y: number } | null = null;
ball.frame.title = "Drag to turn the ship";
ball.frame.addEventListener("pointerdown", (event) => {
  ball.frame.setPointerCapture(event.pointerId);
  grip = { id: event.pointerId, x: event.clientX, y: event.clientY };
});
ball.frame.addEventListener("pointermove", (event) => {
  if (grip === null || grip.id !== event.pointerId) {
    return;
  }
  const scale = 2 / BALL_SIZE;
  turn((event.clientY - grip.y) * scale, (grip.x - event.clientX) * scale, 0);
  grip.x = event.clientX;
  grip.y = event.clientY;
});
const release = () => {
  grip = null;
};
ball.frame.addEventListener("pointerup", release);
ball.frame.addEventListener("pointercancel", release);

const modes = MODES.map((mode, index) => {
  const control = el(
    "button",
    { type: "button", class: "mode", title: `${mode.label}: ${mode.title} (${index + 1})` },
    glyph(mode.glyph),
  );
  control.style.setProperty("--tone", mode.tone);
  control.addEventListener("click", () => point(mode.name));
  return { name: mode.name, control };
});
const modeNote = el("div", { class: "note" }, "");
const tankFill = el("div", { class: "fill" });
const burnFill = el("div", { class: "fill" });
const burnNote = el("span", {}, "");
const burnRun = button("Run to it", "Speed time up until the push is due (Enter)", () =>
  runToPush(),
);
const burnBar = el(
  "div",
  { class: "burn" },
  glyph("plan"),
  burnNote,
  burnRun,
  el("div", { class: "bar" }, burnFill),
);

const planList = el("div", { class: "plan" });
const planHint = el("div", { class: "hint" }, "");
const aheadLine = el("div", { class: "hint" }, "");
const nearLine = el("div", { class: "hint" }, "");
let planRows: {
  push: Push;
  name: HTMLElement;
  when: HTMLElement;
  size: HTMLElement;
  sum: HTMLElement | null;
  shows: (() => void)[];
}[] = [];
const turnNow = () => orbitOf(rails.pulls[about], ...relative(about), poleOf(bodies[about]));
function choose(id: number | null): void {
  selected = id;
  listPlan();
  study();
  plans.fold(false);
  space.invalidate();
}
function drop(push: Push): void {
  const index = plan.indexOf(push);
  if (index < 0) {
    return;
  }
  plan.splice(index, 1);
  if (selected === push.id) {
    selected = plan.length > 0 ? plan[Math.min(index, plan.length - 1)].id : null;
  }
  replan();
  listPlan();
}
const runToPush = () => {
  if (plan.length > 0) {
    const push = plan[0];
    runTo(push.time - burnSpan(push.left * sizeOf(push), engine.thrust) / 2 - PUSH_LEAD);
  }
};
function listPlan(): void {
  planList.replaceChildren();
  planRows = plan.map((push) => {
    const open = push.id === selected;
    const name = el("strong", {}, "");
    const when = el("span", { class: "value" }, "");
    const size = el("span", { class: "value" }, "");
    const head = el("button", { class: "head", type: "button" }, glyph("plan"), name, when, size);
    head.addEventListener("click", () => choose(open ? null : push.id));
    const frame = el("div", { class: open ? "push open" : "push" }, head);
    planList.append(frame);
    if (!open) {
      return { push, name, when, size, sum: null, shows: [] };
    }
    const shows: (() => void)[] = [];
    const told = () => {
      touch();
      sinceReadout = Number.POSITIVE_INFINITY;
    };
    const part = (label: string, tone: string, title: string, key: Part) => {
      const set = (value: number) => {
        push[key] = value;
        push.left = 1;
        told();
      };
      const wheel = createTumbler(SPEED_PLACES, 0.1, 1, true, (by) => set(push[key] + by));
      const lever = createLever(
        LEVER_DECADES,
        LEVER_MARKS,
        "A rough setting on a scale of tenfold steps; the digits above finish it",
        set,
      );
      shows.push(() => {
        wheel.show(push[key]);
        lever.show(push[key]);
      });
      const row = el(
        "div",
        { class: "part", title },
        el("span", { class: "name" }, label),
        wheel.frame,
        el("span", { class: "unit" }, "m/s"),
        button("0", "Back to nothing", () => set(0)),
        lever.frame,
      );
      row.style.setProperty("--tone", tone);
      return row;
    };
    const move = (by: number) => {
      const place = plan.indexOf(push);
      push.time = Math.max(flight.time + 1, push.time + by);
      told();
      if (plan.indexOf(push) !== place) {
        listPlan();
      }
    };
    const turns = (by: number) => {
      const { year } = turnNow();
      if (Number.isFinite(year)) {
        move(by * year);
      }
    };
    const moment = createTumbler(TIME_PLACES, 1, 1, false, move);
    shows.push(() => moment.show(push.time - flight.time));
    const sum = el("span", {}, "");
    frame.append(
      el(
        "div",
        { class: "part", title: "The moment of the push, counted from now" },
        el("span", { class: "name" }, "In"),
        moment.frame,
        button("−", "One turn of the present orbit earlier", () => turns(-1)),
        el("span", { class: "unit" }, "orbit"),
        button("+", "One turn of the present orbit later", () => turns(1)),
      ),
      part(
        "Along",
        TONES.along,
        "Meters a second along the path, or against it when negative",
        "along",
      ),
      part("North", TONES.north, "Meters a second across the plane of the orbit", "north"),
      part("Out", TONES.out, "Meters a second outward, or inward when negative", "out"),
      el(
        "div",
        { class: "foot" },
        sum,
        button("Drop", "Take this push out of the plan (Delete)", () => drop(push)),
      ),
    );
    return { push, name, when, size, sum, shows };
  });
}
const lay = (id: number) => {
  const index = plan.findIndex((push) => push.id === id);
  if (index < 0) {
    return;
  }
  if (selected !== id) {
    choose(id);
  }
  const before = kicksNow().slice(0, index);
  const ghost = createForecast(rails, forelay, flight, before, lookahead, FORECAST_ROOM);
  const started = performance.now();
  while (!ghost.done && performance.now() - started < LAY_BUDGET) {
    ghost.extend(16);
  }
  rail.show(ghost, frame);
};
const tow = (id: number, x: number, y: number) => {
  const index = plan.findIndex((push) => push.id === id);
  if (index < 0) {
    return;
  }
  const bounds = stage.getBoundingClientRect();
  const from = Math.max(flight.time, index > 0 ? plan[index - 1].time : 0) + 1;
  const until = index + 1 < plan.length ? plan[index + 1].time - 1 : Number.POSITIVE_INFINITY;
  const found = rail.near(sight, x - bounds.left, y - bounds.top, Number.POSITIVE_INFINITY, from);
  if (found !== null) {
    plan[index].time = Math.min(until, Math.max(from, found.time));
    touch();
    sinceReadout = Number.POSITIVE_INFINITY;
  }
};
window.addEventListener("pointermove", (event) => {
  if (haul === null || haul.pointer !== event.pointerId) {
    return;
  }
  if (!haul.moved) {
    if (Math.hypot(event.clientX - haul.x, event.clientY - haul.y) < HAUL_SLACK) {
      return;
    }
    haul.moved = true;
    lay(haul.id);
  }
  tow(haul.id, event.clientX, event.clientY);
});
const letGo = (event: PointerEvent) => {
  if (haul === null || haul.pointer !== event.pointerId) {
    return;
  }
  if (haul.moved) {
    hauledAt = performance.now();
    rail.show(null, frame);
    space.invalidate();
  }
  haul = null;
};
window.addEventListener("pointerup", letGo);
window.addEventListener("pointercancel", letGo);
function add(time: number): void {
  if (!Number.isFinite(time) || time <= flight.time) {
    return;
  }
  pushes += 1;
  plan.push({ id: pushes, time, along: 0, north: 0, out: 0, left: 1 });
  replan();
  choose(pushes);
}
const autoField = el("input", { type: "checkbox" });
autoField.checked = autopilot;
autoField.addEventListener("change", () => {
  autopilot = autoField.checked;
});
const aheadField = choice(
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
const frameField = choice(
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
const aimAt = (id: number | null) => {
  target = id;
  targetField.value = id === null ? "none" : String(id);
  reframe();
};
const targetField = choice(
  "The body whose nearest pass is marked on the path",
  [["none", "none"], ...named],
  (value) => aimAt(value === "none" ? null : Number(value)),
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
    stalePlan = true;
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
const seeName = el("strong", {}, "");
const seeKind = el("span", { class: "hint" }, "");
const seeFar = el("div", { class: "value" }, "");
const aimButton = button("Target", "Mark the nearest pass by this body on the path", () => {
  aimAt(target === focused ? null : focused);
});
const orbitButton = button("Orbit it", "Set the ship into a round orbit of this body", () => {
  const typed = Number.parseFloat(heightField.value);
  const id = onCraft() ? about : focused;
  launch(id, Number.isFinite(typed) && typed > 0 ? typed * 1000 : lowOver(id));
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
    el("td", { style: `padding-left: ${4 + 10 * depthOf(body.id)}px` }, body.name),
    el("td", {}, classOf(body.physics)),
    far,
  );
  row.addEventListener("click", () => space.focus(body.id));
  return { row, far };
});

const clock = el("div", { class: "clock" }, hourOf(0));
const date = el("div", { class: "date" }, dayOf(0));
const rate = el("span", { class: "rate" }, "");
const chaseNote = el("div", { class: "hint" }, "");
const pauseButton = button("", "Stop or start time (Space)", () => {
  paused = !paused;
  warpTo = null;
  dirty = true;
});
pauseButton.classList.add("pause");
const rungs = WARPS.map((warp, index) => {
  const control = button("", `${figure(warp)} seconds a second`, () => {
    pick(index);
    paused = false;
  });
  control.classList.add("rung");
  return control;
});

const orbits = card(
  "orbit",
  "Orbit",
  el(
    "table",
    { class: "facts" },
    el("tr", {}, el("td", {}, "Around"), el("td", { colspan: "2" }, referenceField)),
    line("Highest", readings.high, readings.highIn),
    line("Lowest", readings.low, readings.lowIn),
    line("Period", readings.year, cell()),
    line("Stretch", readings.stretch, cell()),
    line("Lean", readings.lean, cell()),
  ),
  aheadLine,
  nearLine,
);
const plans = card(
  "plans",
  "Plan",
  planHint,
  el(
    "div",
    { class: "strip" },
    button("At lowest", "Plan a push at the lowest point of the orbit", () =>
      add(flight.time + turnNow().toLow),
    ),
    button("At highest", "Plan a push at the highest point of the orbit", () =>
      add(flight.time + turnNow().toHigh),
    ),
    button("In 10 min", "Plan a push ten minutes from now", () => add(flight.time + PUSH_AHEAD)),
  ),
  planList,
  el(
    "label",
    {
      class: "check",
      title: "The ship turns and burns each planned push by itself, half before its moment",
    },
    autoField,
    "the ship flies the plan by itself",
  ),
);
const paths = card(
  "paths",
  "Path",
  el(
    "table",
    { class: "facts" },
    el("tr", {}, el("td", {}, "Ahead"), el("td", {}, aheadField)),
    el("tr", {}, el("td", {}, "Around"), el("td", {}, frameField)),
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
            class: "check",
            title:
              "Draw the path as seen turning with that body round what it circles, and mark its five points of balance",
          },
          turningField,
          "with that body",
        ),
      ),
    ),
    el("tr", {}, el("td", {}, "Target"), el("td", {}, targetField)),
  ),
);
const ships = card(
  "ships",
  "Ship",
  el("table", { class: "facts" }, line("Mass", readings.mass), line("Full thrust", readings.push)),
  el("div", { class: "dial" }, ...dials.flatMap((each) => each.parts)),
  el(
    "div",
    { class: "strip" },
    el("label", { class: "check" }, endlessField, "tanks never empty"),
    button("Refill", "Fill the tanks", () => {
      flight.state[6] = engine.dry + engine.tank;
      dirty = true;
      stalePlan = true;
    }),
  ),
);
const lists = card(
  "lists",
  "Bodies",
  el("table", { class: "bodies" }, shipRow, ...rows.map(({ row }) => row)),
  el(
    "div",
    { class: "strip" },
    el("a", { href: `generator.html?${search}&scale=real` }, "The whole system and its numbers"),
  ),
);

let quest: { run: Generator<number, Outcome, void>; target: number } | null = null;
let opening: number | null = null;
const questNote = el(
  "div",
  { class: "hint" },
  "Name a body and how high to pass it, and a push that takes the ship there is worked out and set into the plan.",
);
const questField = choice("The body to fly to", named, () => {});
questField.value = String(
  bodies.find((body) => body.parent === first)?.id ?? bodies.find((body) => body.id !== first)?.id,
);
const passField = el("input", {
  type: "number",
  min: "1",
  step: "10",
  placeholder: "low",
  title: "Height of the pass above the body in kilometers; empty for a low pass",
});
const openingButton = button("Run time to it", "Speed time up until that window opens", () => {
  if (opening !== null) {
    runTo(opening - QUEST_LEAD);
  }
});
openingButton.hidden = true;
const ask = () => {
  if (flight.wrecked !== null || burning()) {
    write(questNote, "A way is worked out for a ship that coasts.");
    return;
  }
  const to = Number(questField.value);
  const typed = Number.parseFloat(passField.value);
  const kicks = kicksNow();
  const since = kicks.reduce((latest, kick) => Math.max(latest, kick.time), flight.time);
  pick(Math.min(level, AUTO_LEVEL));
  opening = null;
  openingButton.hidden = true;
  aimAt(to);
  quest = {
    target: to,
    run: seek({
      rails,
      fly: seeker,
      flight: createFlight(flight.time, flight.state),
      plan: kicks,
      kick: {
        time: since + QUEST_LEAD,
        along: 0,
        north: 0,
        out: 0,
        about: null,
        drive: driveNow(),
      },
      target: to,
      height: Number.isFinite(typed) && typed > 0 ? typed * 1000 : lowOver(to),
    }),
  };
  write(questNote, "Thinking");
};
const answer = (to: number, { way, opening: later, trouble }: Outcome) => {
  const { name } = bodies[to];
  const lines: string[] = [];
  if (trouble === "same") {
    lines.push(`The ship already circles ${name}.`);
  } else if (trouble === "nested") {
    lines.push(
      `No way is worked out from a moon to a body beyond its planet. Leave ${bodies[about].name} first.`,
    );
  } else if (way === null || !way.settled) {
    lines.push(`No way to ${name} was found from here for now.`);
  } else {
    const { kick, approach, cost } = way;
    pushes += 1;
    plan.push({
      id: pushes,
      time: kick.time,
      along: kick.along,
      north: kick.north,
      out: kick.out,
      left: 1,
    });
    replan();
    choose(pushes);
    lines.push(
      `A push of ${speedOf(cost)} in ${spanOf(kick.time - flight.time)} is set into the plan. It passes ${lengthOf(approach.gap - rails.radii[to])} over ${name} ${spanOf(approach.time - kick.time)} later, at ${speedOf(approach.speed)}.`,
    );
  }
  if (later !== null) {
    opening = later.time;
    lines.push(
      `A ${way?.settled ? "cheaper " : ""}window opens in ${spanOf(later.time - flight.time)}: about ${speedOf(later.cost)}.`,
    );
  }
  openingButton.hidden = later === null;
  write(questNote, lines.join(" "));
};
function think(): void {
  if (quest === null) {
    return;
  }
  const started = performance.now();
  do {
    const step = quest.run.next();
    if (step.done) {
      const { target: to } = quest;
      quest = null;
      answer(to, step.value);
      return;
    }
    write(questNote, `Thinking: ${step.value} paths flown`);
  } while (performance.now() - started < QUEST_BUDGET);
}
const quests = card(
  "quests",
  "Transfer",
  el(
    "table",
    { class: "facts" },
    el("tr", {}, el("td", {}, "To"), el("td", {}, questField)),
    el("tr", {}, el("td", {}, "Pass"), el("td", {}, el("label", {}, passField, " km over it"))),
  ),
  el(
    "div",
    { class: "strip" },
    button("Find a way", "Work out a push that takes the ship past that body", ask),
    openingButton,
  ),
  questNote,
);
const helps = card(
  "helps",
  "Keys",
  el(
    "table",
    { class: "facts keys" },
    ...KEYS.map(([name, deed]) => el("tr", {}, el("td", {}, name), el("td", {}, deed))),
  ),
);
const sees = el(
  "section",
  { class: "card sees" },
  el(
    "div",
    { class: "inside" },
    el("div", { class: "title" }, seeName, seeKind),
    seeFar,
    el(
      "div",
      { class: "strip" },
      aimButton,
      orbitButton,
      el("label", {}, "at", heightField, "km"),
      button("Land on it", "Set the ship down on the sunlit ground of this body", () => {
        setDown(onCraft() ? about : focused);
      }),
      button("Ship", "Look at the ship again (M)", () => space.focus(probe.id)),
    ),
  ),
);
const drawers: [string, Card, string][] = [
  ["Transfer", quests, "A push that takes the ship to another body"],
  ["Path", paths, "How the path ahead is drawn"],
  ["Ship", ships, "The engine and the tanks"],
  ["Bodies", lists, "Every body of the system"],
  ["Keys", helps, "What the keys do (H)"],
];
const tabs = drawers.map(([label, drawer, title]) => {
  drawer.fold(true);
  drawer.frame.hidden = true;
  const tab = button(label, title, () => {
    const open = drawer.frame.hidden;
    for (const [, other] of drawers) {
      other.frame.hidden = true;
    }
    drawer.frame.hidden = !open;
    drawer.fold(!open);
    tint();
  });
  return { tab, drawer };
});
function tint(): void {
  for (const { tab, drawer } of tabs) {
    tab.classList.toggle("active", !drawer.frame.hidden);
  }
}

const notice = el("div", { class: "notice" }, "");
const again = button("Back into orbit", "Set a new ship into a low orbit of that body", () => {
  launch(flight.wrecked ?? first, lowOver(flight.wrecked ?? first));
  space.focus(probe.id);
});
const wreck = el("div", { class: "card wreck" }, notice, again);

hud.append(
  el(
    "div",
    { class: "column left" },
    el(
      "section",
      { class: "card time" },
      el("div", { class: "warp" }, pauseButton, ...rungs, rate),
      el("div", { class: "now" }, clock, date),
      chaseNote,
    ),
    orbits.frame,
  ),
  el("div", { class: "middle" }, wreck),
  el(
    "div",
    { class: "column right" },
    el(
      "nav",
      { class: "tabs" },
      button("Map", "The whole orbit, and back to the ship (M)", () => chart()),
      button("Rover", "Set the rover down by a landed ship, or switch to it and back (G)", () =>
        ride(),
      ),
      ...tabs.map(({ tab }) => tab),
    ),
    sees,
    ...drawers.map(([, drawer]) => drawer.frame),
    plans.frame,
  ),
  el(
    "div",
    { class: "deck" },
    burnBar,
    el(
      "section",
      { class: "card panel" },
      el("div", { class: "gauge" }, heightName, readings.height, speedName, readings.speed),
      el("div", { class: "throttle" }, throttleNote, throttleTrack),
      ball.frame,
      el(
        "div",
        { class: "heading" },
        el("div", { class: "modes" }, ...modes.map(({ control }) => control)),
        modeNote,
      ),
      el(
        "div",
        { class: "tank" },
        el("span", { class: "name" }, "Fuel"),
        el("div", { class: "bar" }, tankFill),
        readings.tank,
        el("span", { class: "name" }, "Δv"),
        readings.budget,
      ),
    ),
  ),
);
if (window.innerWidth < NARROW) {
  orbits.fold(true);
  plans.fold(true);
}

space.onResize((width, height) => {
  space.camera.setViewOffset(width, height, 0, DECK_LIFT * height, width, height);
});
space.onFocus((id) => {
  focused = id;
  driving = id === rig.id;
  sinceReadout = Number.POSITIVE_INFINITY;
});

let wasLevel = -1;
let wasPaused: boolean | null = null;
function gauge(): void {
  if (level !== wasLevel || paused !== wasPaused) {
    wasLevel = level;
    wasPaused = paused;
    write(pauseButton, paused ? "▶" : "❚❚");
    pauseButton.classList.toggle("active", paused);
    rungs.forEach((control, index) => {
      control.classList.toggle("lit", index <= level);
    });
  }
  const share = burning() || throttle === 0 ? throttle : 0;
  throttleFill.style.height = `${(100 * throttle).toFixed(1)}%`;
  throttleTrack.classList.toggle("live", share > 0);
  write(throttleNote, `${Math.round(100 * throttle)}%`);
  for (const { name, control } of modes) {
    control.classList.toggle("active", name === steering);
  }
}

function refresh(): void {
  const body = bodies[about];
  const [rx, ry, rz, vx, vy, vz] = relative(about);
  const radius = rails.radii[about];
  const orbit = orbitOf(rails.pulls[about], rx, ry, rz, vx, vy, vz, poleOf(body));
  const fuel = fuelLeft();
  const mass = flight.state[6];
  const [, , , gx, gy, gz] = passing(about);
  const over = landable(body)
    ? lander.clearance(about, flight.time, at, flight.state) - STAND
    : Math.hypot(rx, ry, rz) - radius;
  const swift = Math.hypot(gx, gy, gz);
  write(readings.height, lengthOf(Math.max(0, over)));
  write(readings.speed, speedOf(swift));
  write(heightName, landable(body) ? "Over ground" : "Height");
  write(speedName, skimming(about) ? "Ground speed" : "Speed");
  const fate = flight.wrecked !== null ? "wrecked" : rested !== null ? "landed" : "flying";
  document.body.dataset.flight = `${fate} ${over.toFixed(1)} ${swift.toFixed(2)}`;
  if (driving && rover !== null) {
    write(heightName, "Slope");
    write(readings.height, `${((Math.atan(rover.slope) * 180) / Math.PI).toFixed(1)}°`);
    write(speedName, "Rover speed");
    write(readings.speed, speedOf(Math.abs(rover.speed)));
  }
  if (rover !== null) {
    document.body.dataset.rover = `${rover.speed.toFixed(2)} ${rover.slope.toFixed(3)} ${rover.height.toFixed(1)}`;
  }
  const closed = Number.isFinite(orbit.high);
  write(readings.high, closed ? lengthOf(orbit.high - radius) : "none");
  write(readings.highIn, closed ? `in ${spanOf(orbit.toHigh)}` : "the path is open");
  write(readings.low, orbit.low < radius ? "underground" : lengthOf(orbit.low - radius));
  write(
    readings.lowIn,
    orbit.toLow >= 0 ? `in ${spanOf(orbit.toLow)}` : `${spanOf(-orbit.toLow)} ago`,
  );
  readings.low.classList.toggle("alert", orbit.low < radius);
  write(readings.year, spanOf(orbit.year));
  write(readings.stretch, figure(orbit.stretch, 4));
  write(readings.lean, `${((orbit.lean * 180) / Math.PI).toFixed(2)}°`);
  write(readings.mass, massOf(mass));
  const gives = engine.thrust / mass;
  write(readings.push, `${figure(gives, 3)} m/s² · ${figure(gives / STANDARD_GRAVITY, 3)} g`);
  const full = engine.endless ? 1 : Math.min(1, fuel / engine.tank);
  tankFill.style.width = `${(100 * full).toFixed(1)}%`;
  tankFill.classList.toggle("low", !engine.endless && full < 0.1);
  write(readings.tank, engine.endless ? "endless" : `${Math.round(100 * full)}%`);
  write(
    readings.budget,
    engine.endless ? "without end" : speedOf(engine.exhaust * Math.log(mass / engine.dry)),
  );
  write(modeNote, MODES.find((mode) => mode.name === steering)?.label ?? "");
  for (const each of dials) {
    each.show();
  }
  rows.forEach(({ far, row }, id) => {
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
    row.classList.toggle("active", focused === id);
    row.classList.toggle("aimed", target === id);
  });
  shipRow.classList.toggle("active", focused === probe.id);

  const seeing = !onCraft();
  sees.hidden = !seeing;
  if (seeing) {
    const [sx, sy, sz, wx, wy, wz] = relative(focused);
    write(seeName, bodies[focused].name);
    write(seeKind, classOf(bodies[focused].physics));
    write(
      seeFar,
      `${lengthOf(Math.hypot(sx, sy, sz) - rails.radii[focused])} away · ${speedOf(Math.hypot(wx, wy, wz))} past it`,
    );
    aimButton.classList.toggle("active", target === focused);
  }

  write(
    planHint,
    plan.length === 0
      ? "Click the path ahead, or one of its marks, to plan a push there."
      : "A lever sets a part roughly. Its digits finish it: scroll over one, drag it or click its upper or lower half. Drag a push along the path to move it.",
  );
  for (const { push, name, when, size, sum, shows } of planRows) {
    const whole = sizeOf(push);
    write(name, `Push ${plan.indexOf(push) + 1}`);
    write(when, `in ${spanOf(push.time - flight.time)}`);
    write(size, speedOf(push.left * whole));
    for (const show of shows) {
      show();
    }
    if (sum !== null) {
      const span = burnSpan(push.left * whole, engine.thrust);
      const short =
        !engine.endless && push.left * whole > engine.exhaust * Math.log(mass / engine.dry);
      write(
        sum,
        short
          ? "more than the tanks hold"
          : `${push.left < 1 ? `${speedOf(push.left * whole)} left of ${speedOf(whole)} · ` : ""}a burn of ${spanOf(span)} at full thrust`,
      );
      sum.classList.toggle("alert", short);
    }
  }
  const next = plan.length > 0 ? plan[0] : null;
  burnBar.hidden = next === null;
  if (next !== null) {
    const whole = sizeOf(next);
    const span = burnSpan(next.left * whole, engine.thrust);
    const due = next.time - span / 2 - flight.time;
    const underway = steering === "plan" && burning();
    write(
      burnNote,
      underway
        ? `Burning · ${speedOf(next.left * whole)} to go`
        : whole === 0
          ? `Push 1 in ${spanOf(next.time - flight.time)} · set its size`
          : due > 0
            ? `Push 1 · ${speedOf(next.left * whole)} · burn in ${spanOf(due)} for ${spanOf(span)}`
            : `Push 1 · ${speedOf(next.left * whole)} · burn now for ${spanOf(span)}`,
    );
    burnFill.style.width = `${(100 * (1 - next.left)).toFixed(1)}%`;
    burnRun.hidden = underway || due <= PUSH_LEAD;
  }

  const ahead = passAhead;
  const struck = forecast === null ? null : forecast.wrecked;
  const told = ahead !== null && (plan.length > 0 || ahead.body !== about || struck !== null);
  write(
    aheadLine,
    ahead === null || !told
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

  write(clock, hourOf(flight.time));
  write(date, dayOf(flight.time));
  document.body.dataset.ground = `${terrain.shown()} ${terrain.waiting()}`;
  const wanted = WARPS[level];
  const slow = !paused && flight.wrecked === null && pace <= 0.8 * wanted;
  write(rate, slow ? `${rateOf(pace)} of ${rateOf(wanted)}` : rateOf(wanted));
  rate.classList.toggle("slow", slow);
  write(
    chaseNote,
    warpTo === null ? "" : `Running to a point ${spanOf(warpTo - flight.time)} ahead`,
  );
  if (menuAt !== null) {
    write(menuWhen, `in ${spanOf(menuAt - flight.time)}`);
  }
  if (referenceField.value === "auto") {
    referenceField.options[0].textContent = `${body.name} (nearest hold)`;
  }
  const lost = flight.wrecked;
  wreck.hidden = lost === null && toast === null;
  wreck.classList.toggle("alert", lost !== null);
  again.hidden = lost === null;
  write(
    notice,
    lost === null
      ? (toast?.text ?? "")
      : `The ship struck ${bodies[lost].name} at ${speedOf(impact)}`,
  );
}

const DIGITS = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8"];
const cycle = (by: number) => {
  const count = bodies.length + 1;
  const now = onCraft() ? 0 : focused + 1;
  const next = (now + by + count) % count;
  space.focus(next === 0 ? probe.id : next - 1);
};
const chart = () => {
  if (focused !== probe.id) {
    space.focus(probe.id);
    return;
  }
  const [rx, ry, rz] = relative(about);
  const orbit = turnNow();
  const far = Math.hypot(rx, ry, rz);
  const kept = Number.isFinite(orbit.high) && orbit.high < rails.domains[about];
  space.focus(about, (MAP_FIT * (kept ? orbit.high : OPEN_FIT * far)) / unit);
};
window.addEventListener("keydown", (event) => {
  const from = event.target;
  const typing =
    from instanceof HTMLSelectElement ||
    (from instanceof HTMLInputElement && (from.type === "number" || from.type === "text"));
  if (typing && (event.code === "Enter" || event.code === "Escape")) {
    from.blur();
    return;
  }
  if (typing || event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }
  const { code } = event;
  keys.add(code);
  const digit = DIGITS.indexOf(code);
  if (code === "Space") {
    paused = !paused;
    warpTo = null;
  } else if (code === "Period") {
    pick(level + 1);
  } else if (code === "Comma") {
    pick(level - 1);
  } else if (code === "Slash") {
    pick(0);
  } else if (code === "KeyZ") {
    throttle = 1;
  } else if (code === "KeyX") {
    throttle = 0;
  } else if (digit >= 0) {
    point(MODES[digit].name);
  } else if (code === "KeyM") {
    chart();
  } else if (code === "KeyG") {
    ride();
  } else if (code === "BracketRight") {
    cycle(1);
  } else if (code === "BracketLeft") {
    cycle(-1);
  } else if (code === "Enter") {
    runToPush();
  } else if (code === "Delete" || code === "Backspace") {
    const push = plan.find((each) => each.id === selected);
    if (push !== undefined) {
      drop(push);
    }
  } else if (code === "KeyH") {
    tabs[tabs.length - 1].tab.click();
  } else if (code === "Escape") {
    shut();
  } else {
    return;
  }
  event.preventDefault();
  dirty = true;
  sinceReadout = Number.POSITIVE_INFINITY;
});
window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});
window.addEventListener("blur", () => keys.clear());
document.addEventListener("click", (event) => {
  sinceReadout = Number.POSITIVE_INFINITY;
  if (event.detail > 0 && event.target instanceof HTMLElement) {
    event.target.closest("button")?.blur();
  }
});
document.addEventListener("change", (event) => {
  if (event.target instanceof HTMLInputElement && event.target.type === "checkbox") {
    event.target.blur();
  }
});

settle();
upright();
space.focus(probe.id);
listPlan();
gauge();
say("H shows the keys");
if (grounded) {
  setDown(first);
}
refresh();
document.body.dataset.done = "true";
