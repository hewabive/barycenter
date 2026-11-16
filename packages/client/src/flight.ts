import "./style.css";
import "./generator.css";
import "./flight.css";
import {
  ASTRONOMICAL_UNIT,
  type Burn,
  circling,
  classOf,
  createFlight,
  createFlyer,
  DAY,
  HEADINGS,
  type Heading,
  HOUR,
  headingOf,
  orbitOf,
  poleOf,
  primaryOf,
  railsOf,
  STANDARD_GRAVITY,
  SUN_MASS,
  seenGlow,
  shownLight,
  surveySystem,
  YEAR,
} from "@barycenter/sim";
import { Quaternion, Vector3 } from "three";
import { CRAFT_REACH, createCraft } from "./craft.ts";
import { button, el, required, write } from "./dom.ts";
import { createSpace } from "./space.ts";

const WARPS = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7];
const BUDGET = 7;
const BATCH = 6;
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
const HEADING_NAMES: Record<Heading, string> = {
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
let throttle = 0;
let heading: Heading = "prograde";
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
};

const stage = required<HTMLElement>("#stage");
const space = createSpace(stage, system, true);
const probe = space.probe(CRAFT_REACH / unit);
const craft = createCraft(unit);
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
const settle = () => {
  rails.place(flight.time, at, speed);
  about = chosen ?? primaryOf(rails, at, flight.state);
  headingOf(heading, held, ...relative(about), aim);
};
const burning = () => throttle > 0 && (engine.endless || fuelLeft() > 0);
const burnNow = (): Burn | null =>
  burning()
    ? {
        force: throttle * engine.thrust,
        exhaust: engine.exhaust,
        dry: engine.dry,
        endless: engine.endless,
        heading,
        about,
        held: { ...held },
      }
    : null;
const point = (next: Heading) => {
  if (next === "hold") {
    held.x = aim[0];
    held.y = aim[1];
    held.z = aim[2];
  }
  heading = next;
  dirty = true;
};

const turning = new Vector3();
const spun = new Vector3();
const unturned = new Quaternion();
const steer = (frame: number) => {
  const yaw = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
  const pitch = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0);
  if (yaw !== 0 || pitch !== 0) {
    if (heading !== "hold") {
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
    const until = flight.time + WARPS[level] * frame;
    const burn = burnNow();
    const started = performance.now();
    while (flight.time < until && flight.wrecked === null && performance.now() - started < BUDGET) {
      fly(flight, until, burn, BATCH);
    }
    weather += frame * Math.min(WARPS[level] / WEATHER_SPAN, WEATHER_MOST);
    dirty = true;
  }
  if (frame > 0) {
    pace += 0.1 * ((flight.time - before) / frame - pace);
  }
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

space.onPresent(() => {
  const { world, camera } = space;
  const { state } = flight;
  const ship = [state[0], state[1], state[2]];
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
});

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
const headings = HEADINGS.map((name) => {
  const control = button(HEADING_NAMES[name], `Point the ship ${name}`, () => point(name));
  return { name, control };
});

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
    control.classList.toggle("active", name === heading);
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
