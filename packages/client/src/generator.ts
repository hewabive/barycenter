import "./style.css";
import "./generator.css";
import {
  ASTRONOMICAL_UNIT,
  type Body,
  balanceHeat,
  classOf,
  cloudsOf,
  DAY,
  densityOf,
  EARTH_AIR,
  EARTH_GRAVITY,
  EARTH_LIGHT,
  EARTH_MASS,
  EARTH_RADIUS,
  EARTH_SEEN,
  escapeOf,
  frostOf,
  GASES,
  GIGAYEAR,
  gravityOf,
  HOUR,
  heatAt,
  hillOf,
  JUPITER_MASS,
  type Lamp,
  LUMENS,
  lampsAt,
  lampsOf,
  lightAt,
  moltenOf,
  type Physics,
  pullOf,
  rocheOf,
  roughOf,
  type Shown,
  SUN_GLOW,
  SUN_MASS,
  SUN_RADIUS,
  seaCover,
  seenGlow,
  sketchSystem,
  starborn,
  starHeat,
  surveySystem,
  swayOf,
  syncOf,
  tornAt,
  turnover,
  type Wreck,
  wrapped,
  YEAR,
} from "@barycenter/sim";
import { button, el, required, write } from "./dom.ts";
import {
  DENSE_STAR,
  familyOf,
  flatnessOf,
  holeOf,
  livelyOf,
  recipeOf,
  SHADOW,
  shownOf,
} from "./looks.ts";
import { createSpace } from "./space.ts";

interface Moment {
  heat: number;
  lamps: Lamp[];
  shown: Shown;
}

type Fact = [name: string, value: string | ((now: Moment) => string)] | string;

const PACES = [0, 2, 16, 128, 1024];
const RATES: [rate: number, label: string][] = [
  [0, "Pause"],
  [1, "1×"],
  [60, "1 min/s"],
  [HOUR, "1 h/s"],
  [DAY, "1 d/s"],
  [30 * DAY, "30 d/s"],
  [YEAR, "1 y/s"],
];
const WEATHER_SPAN = 72;
const WEATHER_MOST = 16;
const LAMPS = 2;
const HEAVY = 0.03;
const ROCK_GRAIN = 3000;
const ICE_GRAIN = 900;
const AGE_LEAST = 1e-4;
const AGE_MOST = 13;
const FPS_SPAN = 0.5;
const AT_REST = "at rest";

const query = new URLSearchParams(location.search);
const asked = Number.parseInt(query.get("seed") ?? "", 10);
const seed = Number.isFinite(asked) ? asked : Math.floor(Math.random() * 1e6);
const settled = query.get("home") === "1";
const given = Number.parseFloat(query.get("star") ?? "");
const starMass = Number.isFinite(given) && given > 0 ? Math.min(60, Math.max(0.013, given)) : null;
const old = Number.parseFloat(query.get("age") ?? "");
const starAge =
  !settled && Number.isFinite(old) && old > 0 ? Math.min(AGE_MOST, Math.max(AGE_LEAST, old)) : null;
const real = query.get("scale") === "real";

const address = (next: {
  seed: number;
  settled: boolean;
  star: number | null;
  age: number | null;
  real: boolean;
}) => {
  const search = new URLSearchParams({ seed: String(next.seed), home: next.settled ? "1" : "0" });
  if (next.star !== null) {
    search.set("star", String(next.star));
  }
  if (!next.settled && next.age !== null) {
    search.set("age", String(next.age));
  }
  if (next.real) {
    search.set("scale", "real");
  }
  return `?${search}`;
};
history.replaceState(null, "", address({ seed, settled, star: starMass, age: starAge, real }));

const plan = {
  settled,
  star: starMass === null ? null : starMass * SUN_MASS,
  age: starAge === null ? null : starAge * GIGAYEAR,
};
const system = real ? surveySystem(seed, plan) : sketchSystem(seed, plan);
const star = system.bodies[0];

const beat = real ? "seconds" : "ticks";
const figure = (value: number, digits = 3): string => {
  if (value === 0) {
    return "0";
  }
  const size = Math.abs(value);
  if (size >= 1e5 || size < 1e-3) {
    return value.toExponential(digits - 1).replace("e+", "e");
  }
  return size >= 1000
    ? Math.round(value).toLocaleString("en-US")
    : String(Number(value.toPrecision(digits)));
};
const share = (value: number) =>
  value >= 0.001 || value === 0 ? `${figure(100 * value)}%` : figure(value);
const span = (seconds: number) =>
  seconds >= 2 * YEAR
    ? `${figure(seconds / YEAR)} years`
    : seconds >= 3 * DAY
      ? `${figure(seconds / DAY)} days`
      : `${figure(seconds / HOUR)} hours`;
const WRECKS: Record<Wreck, string> = {
  break: "a small moon that broke up",
  tide: "a moon that tides drew down",
  return: "the moon it had gathered, drawn back down",
  gas: "the last moon its disk of gas dragged down",
};
const nth = (count: number) =>
  `${count}${count % 10 === 1 && count !== 11 ? "st" : count % 10 === 2 && count !== 12 ? "nd" : count % 10 === 3 && count !== 13 ? "rd" : "th"}`;
const tideFact = (moon: Physics, host: Physics): string => {
  const dense = densityOf(host.mass, host.radius);
  const torn = tornAt(host.radius, dense, densityOf(moon.mass, moon.radius));
  const pace = moon.orbit ** 6.5 / pullOf({ ...host, fluid: wrapped(host) }, moon.mass);
  if (moon.year === host.day) {
    return "none, it circles as its planet turns";
  }
  if (0.065 * pace > 10 * GIGAYEAR) {
    return "too weak to move it";
  }
  return moon.orbit > syncOf(host.mass, host.day)
    ? `push it outward, a hundredth of its distance in ${lived(0.065 * pace)}`
    : `draw it in · torn apart at ${figure(torn / host.radius)} radii in ${lived(pace * (1 - (torn / moon.orbit) ** 6.5))}`;
};
const lived = (seconds: number) =>
  seconds >= GIGAYEAR
    ? `${figure(seconds / GIGAYEAR)} billion years`
    : seconds >= 1e6 * YEAR
      ? `${figure(seconds / (1e6 * YEAR))} million years`
      : `${figure(seconds / (1e3 * YEAR))} thousand years`;
const massOf = (mass: number) =>
  mass >= 0.07 * SUN_MASS
    ? `${figure(mass / SUN_MASS)} suns`
    : mass >= 30 * EARTH_MASS
      ? `${figure(mass / EARTH_MASS)} earths · ${figure(mass / JUPITER_MASS)} jupiters`
      : `${figure(mass / EARTH_MASS)} earths`;
const degrees = (angle: number) => `${figure((angle * 180) / Math.PI)}°`;
const lengthOf = (meters: number) =>
  meters >= 0.01 * ASTRONOMICAL_UNIT
    ? `${figure(meters / ASTRONOMICAL_UNIT)} AU`
    : `${figure(meters / 1000)} km`;
const grainOf = (meters: number) =>
  meters >= 1000
    ? `${figure(meters / 1000)} km`
    : meters >= 1
      ? `${figure(meters)} m`
      : meters >= 1e-3
        ? `${figure(1000 * meters)} mm`
        : `${figure(1e6 * meters)} µm`;

const heavy = (body: Body) =>
  system.bodies
    .filter((other) => other.parent === body.id && swayOf(system, other.id) >= HEAVY)
    .sort((left, right) => left.physics.orbit - right.physics.orbit);
const nearer = (body: Body) => (other: Body) => other.physics.orbit < body.physics.orbit;
const listed = (bodies: Body[]) =>
  bodies.length < 2
    ? bodies.map((body) => body.name).join("")
    : `${bodies
        .slice(0, -1)
        .map((body) => body.name)
        .join(", ")} and ${bodies[bodies.length - 1].name}`;

const sunny = (body: Body) => body.parent === null || starborn(body.physics);
const sunOf = (body: Body): { sun: Body; reach: number } => {
  const above = body.parent === null ? body : system.bodies[body.parent];
  const reach = body.physics.orbit * (1 - body.physics.stretch ** 2) ** 0.25;
  return sunny(above) ? { sun: above, reach } : sunOf(above);
};

function factsOf(body: Body): Fact[] {
  const { physics } = body;
  const parent = body.parent === null ? null : system.bodies[body.parent];
  const { sun, reach } = sunOf(body);
  const density = densityOf(physics.mass, physics.radius);
  const family = familyOf(physics);
  const moons = system.bodies.filter((other) => other.parent === body.id).length;
  const rough = roughOf(physics);
  const molten = moltenOf(physics);
  const glow = (LUMENS * seenGlow(physics.heat)) / Math.PI;
  const warmer = physics.light > 0 ? 1 - lightAt(sun.physics.glow, reach) / physics.light : 0;
  const sway = swayOf(system, body.id);
  const { shared } = body;
  const sharers = system.bodies.filter((other) => other.shared?.with === body.id);
  const within = parent === null ? [] : [parent, ...heavy(parent).filter(nearer(body))];
  const swaying = heavy(body);
  const lamps = lampsOf(system, body.id).slice(0, LAMPS);
  const facts: Fact[] = [
    "Body",
    ["Class", classOf(physics)],
    ...(sway < HEAVY
      ? []
      : [
          [
            "Shares a centre with",
            `${listed(within)} · has ${share(sway)} of the mass of them all`,
          ] satisfies Fact,
        ]),
    ...(swaying.length === 0
      ? []
      : [
          [
            "Swayed by",
            swaying.map((other) => `${other.name}, ${share(swayOf(system, other.id))}`).join(" · "),
          ] satisfies Fact,
        ]),
    ["Mass", `${massOf(physics.mass)} · ${figure(physics.mass)} kg`],
    [
      "Radius",
      family === "star"
        ? `${figure(physics.radius / SUN_RADIUS)} suns · ${figure(physics.radius / 1000)} km`
        : `${figure(physics.radius / EARTH_RADIUS)} earths · ${figure(physics.radius / 1000)} km`,
    ],
    ["Density", `${figure(density)} kg/m³`],
    ["Gravity", `${figure(gravityOf(physics.mass, physics.radius) / EARTH_GRAVITY)} g`],
    ["Escape speed", `${figure(escapeOf(physics.mass, physics.radius) / 1000)} km/s`],
    ["Flattening", figure(flatnessOf(physics))],
    [
      "Shape",
      rough === 0
        ? "round"
        : `${share(rough)} of the way from round to a lump, too small to pull itself round`,
    ],
    [
      "Activity",
      family !== "star"
        ? figure(physics.vigor)
        : density > DENSE_STAR
          ? "none"
          : `${figure(livelyOf(physics))} · Rossby number ${figure(physics.day / turnover(physics.heat))}`,
    ],
  ];
  if (holeOf(physics)) {
    facts.push(
      ["Temperature", `${figure(physics.heat, 4)} K, next to nothing`],
      ["Light", "none: it is seen by the sky it bends and hides"],
      [
        "Shadow",
        `${figure((2 * SHADOW * physics.radius) / 1000)} km across, ${SHADOW} times as wide as the horizon`,
      ],
    );
  } else if (family === "star") {
    facts.push(
      ["Temperature", `${figure(physics.heat, 4)} K`],
      ["Light", `${figure(physics.glow / SUN_GLOW)} suns`],
      ["Frost line", lengthOf(frostOf(physics.glow))],
      ["Light of the Earth at", lengthOf(ASTRONOMICAL_UNIT * Math.sqrt(physics.glow / SUN_GLOW))],
    );
  } else {
    const cover = seaCover(physics);
    facts.push(
      [
        "Made of",
        `iron ${share(physics.iron)} · rock ${share(physics.rock)} · ice ${share(physics.ice)} · gas ${share(physics.gas)}`,
      ],
      ["Temperature", `${figure(physics.heat)} K · ${figure(physics.heat - 273.15)} °C`],
      [
        "Over its year",
        physics.hottest - physics.coldest < 1
          ? "the same"
          : `from ${figure(physics.coldest)} K at its farthest to ${figure(physics.hottest)} K at its nearest`,
      ],
      ...(physics.hottest - physics.coldest < 1
        ? []
        : [
            [
              "Now",
              (now) => `${figure(now.heat)} K · ${figure(now.heat - 273.15)} °C`,
            ] satisfies Fact,
          ]),
      [
        "As a black body",
        parent === null
          ? "none, nothing lights it"
          : `${figure(balanceHeat(4 * Math.PI * physics.light, 1, 0))} K`,
      ],
      [
        "Heat of its own",
        physics.glow > 0
          ? `${figure(starHeat(physics.glow, physics.radius))} K · ${figure(physics.glow)} W · ${figure(physics.glow / SUN_GLOW)} suns`
          : "none to speak of",
      ],
      [
        "Light and heat reaching it",
        parent === null
          ? "none"
          : `${figure(physics.light)} W/m² · ${figure(physics.light / EARTH_LIGHT)} of the Earth's${
              warmer > 0.01 ? ` · ${share(warmer)} of it not from ${sun.name}` : ""
            }`,
      ],
      ["Glow an eye sees", glow >= 1e-6 ? `${figure(glow)} candela on a square meter` : "none"],
      ["Molten rock", molten > 0 ? `${share(molten)} of the surface` : "none"],
      [
        "Air",
        family === "fluid"
          ? "all the way down"
          : physics.air > 0
            ? `${figure(physics.air / EARTH_AIR)} bar`
            : "none",
      ],
      [
        "Air made of",
        physics.gases.length === 0
          ? "nothing"
          : GASES.map((gas, index): [string, number] => [gas, physics.gases[index]])
              .filter(([, part]) => part >= 1e-6)
              .sort((left, right) => right[1] - left[1])
              .map(([gas, part]) => `${gas} ${share(part)}`)
              .join(" · "),
      ],
      ["Clouds of", cloudsOf(physics)],
      ["Sea", cover > 0 ? `covers ${share(cover)}` : "none"],
      ["Life", physics.life > 0 ? "yes" : "no"],
    );
  }
  if (parent !== null) {
    const hill = hillOf(physics.orbit, physics.mass, parent.physics.mass);
    const holder = system.bodies.find(
      (moon) => moon.parent === body.id && moon.physics.year === physics.day,
    );
    const tide = sunny(parent) || shared !== null ? null : tideFact(physics, parent.physics);
    facts.push(
      "Orbit",
      [
        "Around",
        sway >= HEAVY
          ? `the point it shares with ${listed(within)}, ${share(sway)} of the way from ${within.length > 1 ? "them" : parent.name}`
          : within.length > 1
            ? `${listed(within)} together`
            : parent.name,
      ],
      [
        "Distance",
        `${lengthOf(physics.orbit)} · ${figure(physics.orbit / parent.physics.radius)} radii of ${parent.name}`,
      ],
      [
        "Shape of the orbit",
        physics.stretch < 0.0005
          ? "a circle"
          : `an oval, stretched ${figure(physics.stretch)} · from ${lengthOf(physics.orbit * (1 - physics.stretch))} to ${lengthOf(physics.orbit * (1 + physics.stretch))}`,
      ],
      [
        "Plane of the orbit",
        parent.parent !== null && body.slant === parent.tilt && body.node === parent.swing
          ? `that of the equator of ${parent.name}`
          : `${degrees(body.slant)} to the plane of the system${body.slant > Math.PI / 2 ? ", backward" : ""}`,
      ],
      ...(shared === null
        ? []
        : [
            [
              "Shares its orbit with",
              shared.sway > Math.PI / 2
                ? `${system.bodies[shared.with].name} · the two trade places every ${span(shared.chase / 2)} and come no nearer than ${degrees(Math.PI - shared.sway)} · their orbits differ by ${lengthOf(shared.lane * physics.orbit)}`
                : `${system.bodies[shared.with].name} · keeps 60° ${shared.ahead > 0 ? "ahead of" : "behind"} it, swinging ${degrees(shared.sway)} either way every ${span(shared.chase)}`,
            ] satisfies Fact,
          ]),
      ...(sharers.length === 0 ? [] : [["Shares its orbit with", listed(sharers)] satisfies Fact]),
      ["Year", span(physics.year)],
      [
        "Day",
        physics.day === physics.year
          ? "locked to its year, one face inward"
          : holder === undefined
            ? span(physics.day)
            : `${span(physics.day)}, the month of ${holder.name}, one face to it`,
      ],
      ...(tide === null ? [] : [["Tides", tide] satisfies Fact]),
      ...(body.gathered === null
        ? []
        : [
            [
              "Gathered",
              `from a ring of ${parent.name} ${lived(body.gathered.since)} ago${body.gathered.turn > 1 ? ` · the ${nth(body.gathered.turn)} moon of its line, each a fifth of the one before and made of its wreck` : ""}`,
            ] satisfies Fact,
          ]),
      ["Tilt", `${degrees(body.tilt)} to the plane of the system`],
      ["Holds moons within", `${lengthOf(hill)} · ${figure(hill / physics.radius)} radii`],
    );
  } else {
    facts.push("Spin", ["Day", span(physics.day)]);
  }
  facts.push(
    "Around it",
    [sunny(body) ? "Planets" : "Moons", String(moons)],
    [
      "Tears apart within",
      `${figure(rocheOf(physics.radius, density, ROCK_GRAIN) / physics.radius)} radii for rock · ${figure(rocheOf(physics.radius, density, ICE_GRAIN) / physics.radius)} for ice`,
    ],
    ...(physics.disks.length === 0
      ? [[parent === null ? "Belts" : "Ring", "none"] satisfies Fact]
      : physics.disks.map(
          (disk): Fact =>
            parent === null || disk.lasts === 0
              ? [
                  disk.gas > 0 ? "Disk" : "Belt",
                  `${lengthOf(disk.inner)} to ${lengthOf(disk.outer)} · ${massOf(disk.mass)}${disk.gas > 0 ? ` of dust in ${massOf(disk.gas)} of gas` : ""} · ice ${share(disk.ice)} · density ${figure(disk.depth)} · grains of ${grainOf(disk.grain)} · ${figure(disk.height)} of its width in height${disk.fade > 0 ? ` · thins out beyond ${lengthOf(disk.fade)}` : ""}`,
                ]
              : [
                  "Ring",
                  `${figure(disk.inner / physics.radius)} to ${figure(disk.outer / physics.radius)} radii · density ${figure(disk.depth)} · ice ${share(disk.ice)} · ${figure(disk.mass)} kg · grains of ${grainOf(disk.grain)} · ${grainOf(disk.height * Math.sqrt(disk.inner * disk.outer))} deep · last fed ${lived(disk.since)} ago${disk.wreck === null ? "" : ` by ${WRECKS[disk.wreck]}`} · wears away by half every ${lived(Math.LN2 * disk.lasts)}`,
                ],
        )),
    "Light now",
    ...(lamps.length === 0
      ? [["Lit by", "the stars of the sky alone"] satisfies Fact]
      : lamps.map(
          ({ source }, at): Fact => [
            at === 0 ? "Lit by" : "And by",
            ({ lamps: lit, shown }) =>
              `${system.bodies[source].name}, ${lengthOf(lit[at].reach)} away · ${figure(LUMENS * lit[at].seen)} lux · ${figure(lit[at].seen / EARTH_SEEN)} of daylight on the Earth · drawn at ${share(shown.lamps[at])}`,
          ],
        )),
    ["Sky drawn at", ({ shown }) => share(shown.sky)],
    ["Glow drawn at", ({ shown }) => (shown.glow > 0 ? share(shown.glow) : "none")],
    "On screen",
    [
      "Drawn as",
      [
        family === "star" ? "a star" : family === "fluid" ? "a body in gas" : "a solid body",
        ...recipeOf(body)
          .filter(([, part]) => part >= 0.005)
          .sort((left, right) => right[1] - left[1])
          .map(([name, part]) => `${name} ${Math.round(100 * part)}%`),
      ].join(" · "),
    ],
    ["Radius", figure(body.radius, 4)],
    ["Orbit", parent === null ? "none" : figure(body.orbit, 4)],
    ["Year", parent === null ? "none" : `${figure(body.year, 5)} ${beat}`],
    ["Day", `${figure(body.day, 5)} ${beat}`],
    ["Seed", String(body.seed)],
  );
  return facts;
}

const stage = required<HTMLElement>("#stage");
const space = createSpace(stage, system, real);

let tick = 0;
let pace = 0;
let weather = 0;
let refresh = () => {};
const dial = () => {
  if (!real) {
    return `tick ${Math.floor(tick)}`;
  }
  const pair = (value: number) => String(Math.floor(value)).padStart(2, "0");
  const rest = tick % DAY;
  const days = Math.floor((tick % YEAR) / DAY);
  return `${Math.floor(tick / YEAR)} y ${days} d ${pair(rest / HOUR)}:${pair((rest % HOUR) / 60)}:${pair(rest % 60)}`;
};
const clock = el("span", { class: "clock" }, dial());
const paces: [rate: number, label: string, title: string][] = real
  ? RATES.map(([rate, label]) => [rate, label, `${figure(rate)} seconds a second`])
  : PACES.map((rate) => [rate, `${rate / PACES[1]}×`, `${rate} ticks a second`]);
const speeds = paces.map(([rate, label, title], index) => {
  const control = button(rate === 0 ? "Pause" : label, rate === 0 ? "Stop time" : title, () => {
    pace = rate;
    space.clock(tick, pace, real ? weather : undefined);
    speeds.forEach((other, at) => {
      other.classList.toggle("active", at === index);
    });
  });
  control.classList.toggle("active", rate === pace);
  return control;
});
space.onFrame((elapsed) => {
  if (pace > 0) {
    tick += elapsed * pace;
    weather += elapsed * Math.min(pace / WEATHER_SPAN, WEATHER_MOST);
    space.clock(tick, pace, real ? weather : undefined);
    write(clock, dial());
    refresh();
  }
});

const fps = el(
  "span",
  {
    class: "fps",
    title:
      "Frames of the scene drawn a second; while nothing in it moves it is at rest and is not drawn again",
  },
  AT_REST,
);
let drew = false;
let frames = 0;
let drawing = 0;
let waited = 0;
space.onPresent(() => {
  drew = true;
});
space.onFrame((elapsed) => {
  waited += elapsed;
  if (drew) {
    frames += 1;
    drawing += elapsed;
    drew = false;
  }
  if (waited >= FPS_SPAN) {
    write(fps, drawing > 0 ? `${Math.round(frames / drawing)} fps` : AT_REST);
    frames = 0;
    drawing = 0;
    waited = 0;
  }
});

const seedField = el("input", { type: "number", value: String(seed), min: "0", step: "1" });
const starField = el("input", {
  type: "number",
  value: starMass === null ? "" : String(starMass),
  min: "0.013",
  max: "60",
  step: "0.01",
  placeholder: "any",
});
const ageField = el("input", {
  type: "number",
  value: starAge === null ? "" : String(starAge),
  min: String(AGE_LEAST),
  max: String(AGE_MOST),
  step: "any",
  placeholder: "drawn",
});
const ageSlide = el("input", {
  type: "range",
  min: String(Math.log10(AGE_LEAST)),
  max: String(Math.log10(AGE_MOST)),
  step: "0.01",
  value: String(Math.log10(star.physics.age / GIGAYEAR)),
});
ageSlide.disabled = settled;
const ageRead = el("span", { class: "clock" }, lived(star.physics.age));
const homeField = el("input", { type: "checkbox" });
homeField.checked = settled;
const go = (next: number, scale = real) => {
  const mass = Number.parseFloat(starField.value);
  const age = Number.parseFloat(ageField.value);
  location.search = address({
    seed: next,
    settled: homeField.checked,
    star: Number.isFinite(mass) && mass > 0 ? mass : null,
    age: Number.isFinite(age) && age > 0 ? age : null,
    real: scale,
  });
};
const read = () => {
  const typed = Number.parseInt(seedField.value, 10);
  return Number.isFinite(typed) ? typed : seed;
};
for (const field of [seedField, starField, ageField]) {
  field.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      go(read());
    }
  });
}
homeField.addEventListener("change", () => go(read()));
ageSlide.addEventListener("input", () => {
  write(ageRead, lived(GIGAYEAR * 10 ** Number(ageSlide.value)));
});
ageSlide.addEventListener("change", () => {
  ageField.value = (10 ** Number(ageSlide.value)).toPrecision(3);
  go(read());
});

required<HTMLElement>("#topbar").append(
  el("strong", {}, "Generator"),
  el("label", {}, "Seed", seedField),
  button("Make", "Make the system of this seed", () => go(read())),
  button("Next", "Make the system of the next seed", () => go(read() + 1)),
  button("Random", "Make the system of a random seed", () => go(Math.floor(Math.random() * 1e6))),
  el(
    "label",
    {
      title: "The mass of the centre at its birth in solar masses; below 0.075 it is a brown dwarf",
    },
    "Star",
    starField,
  ),
  el(
    "label",
    {
      title:
        "The age of the system in billions of years, where there is no home; left empty, it is drawn with the seed",
    },
    "Age",
    ageField,
    ageSlide,
    ageRead,
  ),
  el("label", { title: "Make the system around a living home, as a game does" }, homeField, "home"),
  button(
    real ? "Drawn scale" : "Real scale",
    real
      ? "Show the system on the scale of the game, squeezed to fit a screen"
      : "Show the system in its real sizes and distances, with a clock in seconds",
    () => go(read(), !real),
  ),
  ...speeds,
  clock,
  el("a", { href: "atlas.html" }, "Atlas"),
  el(
    "a",
    {
      href: `flight.html${address({ seed, settled, star: starMass, age: starAge, real: false })}`,
      title: "Fly a ship through this system",
    },
    "Fly",
  ),
  fps,
);

const suns = system.bodies.filter((body) => sunny(body));
const planets = system.bodies.filter(
  (body) => !sunny(body) && sunny(system.bodies[body.parent ?? 0]),
).length;
const summary = el(
  "section",
  {},
  el("h3", {}, "System"),
  el(
    "div",
    {},
    `${suns
      .map(
        (body) =>
          `${body.name}, ${classOf(body.physics)} of ${massOf(body.physics.mass)} and ${figure(body.physics.heat, 4)} K`,
      )
      .join(" with ")}, ${lived(star.physics.age)} old`,
  ),
  el(
    "div",
    { class: "hint" },
    `${planets} planets, ${system.bodies.length - suns.length - planets} moons and ${suns.reduce((sum, body) => sum + body.physics.disks.length, 0)} ${
      suns.some((body) => body.physics.disks.some((disk) => disk.gas > 0)) ? "disks" : "belts"
    } · ${
      system.home === null
        ? "no home"
        : `home ${system.bodies[system.home].name}, the system of world seed ${seed}`
    }`,
  ),
);

const depthOf = (body: Body): number =>
  body.parent === null ? 0 : 1 + depthOf(system.bodies[body.parent]);
const rows = system.bodies.map((body) => {
  const row = el(
    "tr",
    {},
    el("td", { style: `padding-left: ${4 + 12 * depthOf(body)}px` }, body.name),
    el("td", {}, classOf(body.physics)),
    el("td", {}, massOf(body.physics.mass).split(" · ")[0]),
    el("td", {}, `${figure(body.physics.heat)} K`),
  );
  row.addEventListener("click", () => space.focus(body.id));
  return row;
});
const title = el("h3", {}, "");
const facts = el("table", { class: "facts" });
const raw = el("pre", { class: "raw" });
const show = (id: number) => {
  const body = system.bodies[id];
  rows.forEach((row, at) => {
    row.classList.toggle("active", at === id);
  });
  write(title, body.name);
  const live: ((now: Moment) => void)[] = [];
  facts.replaceChildren(
    ...factsOf(body).map((fact) => {
      if (typeof fact === "string") {
        return el("tr", { class: "group" }, el("td", { colspan: "2" }, fact));
      }
      const [name, value] = fact;
      const cell = el("td", {}, typeof value === "string" ? value : "");
      if (typeof value !== "string") {
        live.push((now) => write(cell, value(now)));
      }
      return el("tr", {}, el("td", {}, name), cell);
    }),
  );
  refresh = () => {
    const heat = heatAt(system, id, tick);
    const lamps = lampsAt(system, id, tick).slice(0, LAMPS);
    const seen = lamps.map((lamp) => lamp.seen);
    const now = { heat, lamps, shown: shownOf(body.physics, seen, heat) };
    for (const each of live) {
      each(now);
    }
  };
  refresh();
  write(raw, JSON.stringify(body, null, 1));
};
space.onFocus(show);
show(system.home ?? star.id);

required<HTMLElement>("#panel").append(
  el(
    "div",
    { class: "body" },
    summary,
    el("section", {}, el("h3", {}, "Bodies"), el("table", { class: "bodies" }, ...rows)),
    el("section", {}, title, facts),
    el("details", {}, el("summary", {}, "Description as stored"), raw),
  ),
);
document.body.dataset.done = "true";
