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
  EARTH_MASS,
  EARTH_RADIUS,
  escapeOf,
  frostOf,
  GASES,
  gravityOf,
  HOUR,
  hillOf,
  JUPITER_MASS,
  rocheOf,
  SUN_GLOW,
  SUN_MASS,
  SUN_RADIUS,
  seaCover,
  sketchSystem,
  YEAR,
} from "@barycenter/sim";
import { button, el, required, write } from "./dom.ts";
import { familyOf, flatnessOf, recipeOf } from "./looks.ts";
import { createSpace } from "./space.ts";

type Fact = [name: string, value: string] | string;

const PACES = [0, 2, 16, 128, 1024];
const ROCK_GRAIN = 3000;
const ICE_GRAIN = 900;

const query = new URLSearchParams(location.search);
const asked = Number.parseInt(query.get("seed") ?? "", 10);
const seed = Number.isFinite(asked) ? asked : Math.floor(Math.random() * 1e6);
const settled = query.get("home") === "1";
const given = Number.parseFloat(query.get("star") ?? "");
const starMass = Number.isFinite(given) && given > 0 ? Math.min(3, Math.max(0.08, given)) : null;

const address = (next: { seed: number; settled: boolean; star: number | null }) => {
  const search = new URLSearchParams({ seed: String(next.seed), home: next.settled ? "1" : "0" });
  if (next.star !== null) {
    search.set("star", String(next.star));
  }
  return `?${search}`;
};
history.replaceState(null, "", address({ seed, settled, star: starMass }));

const system = sketchSystem(seed, {
  settled,
  star: starMass === null ? null : starMass * SUN_MASS,
});
const star = system.bodies[0];

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
const massOf = (mass: number) =>
  mass >= 0.07 * SUN_MASS
    ? `${figure(mass / SUN_MASS)} suns`
    : mass >= 30 * EARTH_MASS
      ? `${figure(mass / EARTH_MASS)} earths · ${figure(mass / JUPITER_MASS)} jupiters`
      : `${figure(mass / EARTH_MASS)} earths`;
const lengthOf = (meters: number) =>
  meters >= 0.01 * ASTRONOMICAL_UNIT
    ? `${figure(meters / ASTRONOMICAL_UNIT)} AU`
    : `${figure(meters / 1000)} km`;

const starOf = (body: Body): Body =>
  body.parent === null ? body : starOf(system.bodies[body.parent]);
const distanceOf = (body: Body): number =>
  body.parent === null || system.bodies[body.parent].parent === null
    ? body.physics.orbit
    : distanceOf(system.bodies[body.parent]);

function factsOf(body: Body): Fact[] {
  const { physics } = body;
  const parent = body.parent === null ? null : system.bodies[body.parent];
  const lit = starOf(body).physics;
  const density = densityOf(physics.mass, physics.radius);
  const family = familyOf(physics);
  const moons = system.bodies.filter((other) => other.parent === body.id).length;
  const facts: Fact[] = [
    "Body",
    ["Class", classOf(physics)],
    ["Mass", `${massOf(physics.mass)} · ${figure(physics.mass)} kg`],
    [
      "Radius",
      physics.glow > 0
        ? `${figure(physics.radius / SUN_RADIUS)} suns · ${figure(physics.radius / 1000)} km`
        : `${figure(physics.radius / EARTH_RADIUS)} earths · ${figure(physics.radius / 1000)} km`,
    ],
    ["Density", `${figure(density)} kg/m³`],
    ["Gravity", `${figure(gravityOf(physics.mass, physics.radius) / EARTH_GRAVITY)} g`],
    ["Escape speed", `${figure(escapeOf(physics.mass, physics.radius) / 1000)} km/s`],
    ["Flattening", figure(flatnessOf(physics))],
    ["Activity", figure(physics.vigor)],
  ];
  if (physics.glow > 0) {
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
      ["As a black body", `${figure(balanceHeat(lit.glow, distanceOf(body), 0))} K`],
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
    facts.push(
      "Orbit",
      ["Around", parent.name],
      [
        "Distance",
        `${lengthOf(physics.orbit)} · ${figure(physics.orbit / parent.physics.radius)} radii of ${parent.name}`,
      ],
      ["Year", span(physics.year)],
      ["Day", physics.day === physics.year ? "locked to its year" : span(physics.day)],
      ["Tilt", `${figure((body.tilt * 180) / Math.PI)}°`],
      ["Holds moons within", `${lengthOf(hill)} · ${figure(hill / physics.radius)} radii`],
    );
  } else {
    facts.push("Spin", ["Day", span(physics.day)]);
  }
  facts.push(
    "Around it",
    ["Moons", String(moons)],
    [
      "Tears apart within",
      `${figure(rocheOf(physics.radius, density, ROCK_GRAIN) / physics.radius)} radii for rock · ${figure(rocheOf(physics.radius, density, ICE_GRAIN) / physics.radius)} for ice`,
    ],
    [
      "Ring",
      physics.ring === null
        ? "none"
        : `${figure(physics.ring.inner / physics.radius)} to ${figure(physics.ring.outer / physics.radius)} radii · density ${figure(physics.ring.depth)} · ice ${share(physics.ring.ice)}`,
    ],
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
    ["Year", parent === null ? "none" : `${body.year} ticks`],
    ["Day", `${body.day} ticks`],
    ["Seed", String(body.seed)],
  );
  return facts;
}

const stage = required<HTMLElement>("#stage");
const space = createSpace(stage, system);

let tick = 0;
let pace = 0;
const clock = el("span", { class: "clock" }, "tick 0");
const speeds = PACES.map((rate, index) => {
  const label = rate === 0 ? "Pause" : `${rate / PACES[1]}×`;
  const control = button(label, rate === 0 ? "Stop time" : `${rate} ticks a second`, () => {
    pace = rate;
    space.clock(tick, pace);
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
    space.clock(tick, pace);
    write(clock, `tick ${Math.floor(tick)}`);
  }
});

const seedField = el("input", { type: "number", value: String(seed), min: "0", step: "1" });
const starField = el("input", {
  type: "number",
  value: starMass === null ? "" : String(starMass),
  min: "0.08",
  max: "3",
  step: "0.05",
  placeholder: "any",
});
const homeField = el("input", { type: "checkbox" });
homeField.checked = settled;
const go = (next: number) => {
  const mass = Number.parseFloat(starField.value);
  location.search = address({
    seed: next,
    settled: homeField.checked,
    star: Number.isFinite(mass) && mass > 0 ? mass : null,
  });
};
const read = () => {
  const typed = Number.parseInt(seedField.value, 10);
  return Number.isFinite(typed) ? typed : seed;
};
for (const field of [seedField, starField]) {
  field.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      go(read());
    }
  });
}
homeField.addEventListener("change", () => go(read()));

required<HTMLElement>("#topbar").append(
  el("strong", {}, "Generator"),
  el("label", {}, "Seed", seedField),
  button("Make", "Make the system of this seed", () => go(read())),
  button("Next", "Make the system of the next seed", () => go(read() + 1)),
  button("Random", "Make the system of a random seed", () => go(Math.floor(Math.random() * 1e6))),
  el("label", { title: "The mass of the star in solar masses" }, "Star", starField),
  el("label", { title: "Make the system around a living home, as a game does" }, homeField, "home"),
  ...speeds,
  clock,
  el("a", { href: "atlas.html" }, "Atlas"),
);

const planets = system.bodies.filter((body) => body.parent === star.id).length;
const summary = el(
  "section",
  {},
  el("h3", {}, "System"),
  el(
    "div",
    {},
    `${star.name}, ${classOf(star.physics)} of ${massOf(star.physics.mass)} and ${figure(star.physics.heat, 4)} K`,
  ),
  el(
    "div",
    { class: "hint" },
    `${planets} around the star and ${system.bodies.length - 1 - planets} moons · ${
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
    el("td", depthOf(body) > 1 ? { class: "moon" } : {}, body.name),
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
  facts.replaceChildren(
    ...factsOf(body).map((fact) =>
      typeof fact === "string"
        ? el("tr", { class: "group" }, el("td", { colspan: "2" }, fact))
        : el("tr", {}, el("td", {}, fact[0]), el("td", {}, fact[1])),
    ),
  );
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
