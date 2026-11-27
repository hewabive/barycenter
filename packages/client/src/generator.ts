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
  fallOf,
  frostOf,
  GASES,
  GIGAYEAR,
  gravityOf,
  HOUR,
  heatAt,
  hillOf,
  interiorOf,
  JUPITER_MASS,
  type Lamp,
  LUMENS,
  lampsAt,
  lampsOf,
  lightAt,
  type Matter,
  moltenOf,
  type Physics,
  pullOf,
  rocheOf,
  roughOf,
  type Shown,
  type Skewed,
  type Slanted,
  SUN_GLOW,
  SUN_MASS,
  SUN_RADIUS,
  scaleHeight,
  seaCover,
  seenGlow,
  shieldOf,
  sketchSystem,
  starborn,
  starHeat,
  surveySystem,
  swayOf,
  syncOf,
  tornAt,
  turnover,
  type Wreck,
  warmthOf,
  withinOf,
  wrapped,
  YEAR,
} from "@barycenter/sim";
import { Vector3 } from "three";
import { button, dismissible, el, required, write } from "./dom.ts";
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
import { type Shot, shotOf, shotQuery } from "./shot.ts";
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
const THIN_SHELL = 1e-3;
const EARTH_FIELD = 29.8e-6;
const FIELD_SOURCES = {
  core: "the stirring of its iron core",
  metal: "hydrogen pressed into a metal, turning over",
  water: "a shell of water that conducts, turning over",
  shell: "the stirred shell of the star",
  frozen: "a field kept from before, not made anew",
};
const SPENT_LEAST = 0.01;
const MATTERS: Record<Matter, string> = {
  iron: "iron",
  rock: "rock",
  ice: "ice",
  blend: "mix",
  metal: "metallic hydrogen",
  gas: "hydrogen and helium",
};
const ROCK_GRAIN = 3000;
const ICE_GRAIN = 900;
const AGE_LEAST = 1e-4;
const AGE_MOST = 13;
const FPS_SPAN = 0.5;
const COPIED_FOR = 1500;
const AT_REST = "at rest";

interface Choice {
  seed: number;
  settled: boolean;
  star: number | null;
  age: number | null;
  real: boolean;
}

const choiceOf = (search: string): Choice => {
  const query = new URLSearchParams(search);
  const asked = Number.parseInt(query.get("seed") ?? "", 10);
  const settled = query.get("home") === "1";
  const given = Number.parseFloat(query.get("star") ?? "");
  const old = Number.parseFloat(query.get("age") ?? "");
  return {
    seed: Number.isFinite(asked) ? asked : Math.floor(Math.random() * 1e6),
    settled,
    star: Number.isFinite(given) && given > 0 ? Math.min(60, Math.max(0.013, given)) : null,
    age:
      !settled && Number.isFinite(old) && old > 0
        ? Math.min(AGE_MOST, Math.max(AGE_LEAST, old))
        : null,
    real: query.get("scale") === "real",
  };
};
const address = (next: Choice) => {
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
const make = (next: Choice) => {
  const plan = {
    settled: next.settled,
    star: next.star === null ? null : next.star * SUN_MASS,
    age: next.age === null ? null : next.age * GIGAYEAR,
  };
  return next.real ? surveySystem(next.seed, plan) : sketchSystem(next.seed, plan);
};

let choice = choiceOf(location.search);
const arrival = shotOf(location.search);
history.replaceState(null, "", address(choice));
let system = make(choice);

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
const squeeze = (pascals: number) =>
  pascals >= 1e8
    ? `${figure(pascals / 1e9)} GPa`
    : pascals >= 1e5
      ? `${figure(pascals / 1e6)} MPa`
      : `${figure(pascals / 1e3)} kPa`;
const power = (watts: number) =>
  watts >= 1e11
    ? `${figure(watts / 1e12)} TW`
    : watts >= 1e8
      ? `${figure(watts / 1e9)} GW`
      : `${figure(watts / 1e6)} MW`;
const tesla = (value: number) =>
  value >= 1
    ? `${figure(value)} T`
    : value >= 1e-3
      ? `${figure(value * 1e3)} mT`
      : value >= 1e-6
        ? `${figure(value * 1e6)} µT`
        : `${figure(value * 1e9)} nT`;
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
      : seconds >= 1e3 * YEAR
        ? `${figure(seconds / (1e3 * YEAR))} thousand years`
        : `${figure(seconds / YEAR)} years`;
const massOf = (mass: number) =>
  mass >= 0.07 * SUN_MASS
    ? `${figure(mass / SUN_MASS)} suns`
    : mass >= 30 * EARTH_MASS
      ? `${figure(mass / EARTH_MASS)} earths · ${figure(mass / JUPITER_MASS)} jupiters`
      : `${figure(mass / EARTH_MASS)} earths`;
const degrees = (angle: number) => `${figure((angle * 180) / Math.PI)}°`;
const slantedOf = ({ by, of, lean }: Slanted) => {
  if (by === "disk") {
    return "in the plane of the disk it formed in";
  }
  const why =
    by === "neighbors"
      ? "stirred by its neighbors within the room their orbits leave"
      : by === "near"
        ? "so near its star that it leans more, as the nearest planets do"
        : by === "inside"
          ? `tilted together with the other planets inside ${of}, whose orbit keeps the plane`
          : "thrown out of it when the giants of its zone scattered one another";
  return `${degrees(lean)} to the plane its planets share · ${why}`;
};
const skewedOf = ({ by, of, lean, born, period }: Skewed) => {
  if (by === "locked") {
    return `upright on its orbit with ${of}, held by their tides`;
  }
  const leaning = `${degrees(lean)} to the plane of its disk${lean > Math.PI / 2 ? ", turning backward" : ""}`;
  return by === "birth"
    ? `${leaning} · so it was born`
    : `${leaning} · ${degrees(born)} at birth, since its planets turn about the orbit of ${of} once every ${span(period ?? 0)}`;
};
const lengthOf = (meters: number) =>
  meters >= 0.01 * ASTRONOMICAL_UNIT
    ? `${figure(meters / ASTRONOMICAL_UNIT)} AU`
    : `${figure(meters / 1000)} km`;
const pulledFact = (body: Body, host: Body): string => {
  const { drawn } = body;
  if (drawn === null) {
    return "too weak to have moved it";
  }
  const oval = drawn.stretch >= 0.0005 ? `, stretched ${figure(drawn.stretch)}` : "";
  const end =
    drawn.falls === null
      ? `it outlasts ${host.name}`
      : `falls into ${host.name} in ${lived(drawn.falls)}`;
  return `drawn in by ${host.name} from ${lengthOf(drawn.from)}${oval} · ${end}`;
};
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
  const inside = interiorOf(physics);
  const warmth = warmthOf(physics, parent?.physics ?? null);
  const depths = family === "star" ? withinOf(physics) : null;
  const stuff = (matter: Matter) =>
    matter === "ice" && family === "fluid" ? "water" : MATTERS[matter];
  const shells = (inside?.layers ?? []).filter(
    ({ radius }, index, layers) =>
      radius - (layers[index - 1]?.radius ?? 0) >= THIN_SHELL * physics.radius,
  );
  const glow = (LUMENS * seenGlow(physics.heat)) / Math.PI;
  const warmer = physics.light > 0 ? 1 - lightAt(sun.physics.glow, reach) / physics.light : 0;
  const sway = swayOf(system, body.id);
  const { shared } = body;
  const sharers = system.bodies.filter((other) => other.shared?.with === body.id);
  const within = parent === null ? [] : [parent, ...heavy(parent).filter(nearer(body))];
  const swaying = heavy(body);
  const lamps = lampsOf(system, body.id).slice(0, LAMPS);
  const beat = choice.real ? "seconds" : "ticks";
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
    ...(family === "fluid"
      ? [
          [
            "Scale height",
            `${figure(scaleHeight(physics) / 1000)} km · ${share(scaleHeight(physics) / physics.radius)} of the radius`,
          ] satisfies Fact,
        ]
      : []),
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
    if (depths !== null) {
      const zones =
        depths.floor < THIN_SHELL
          ? ["stirred all the way down"]
          : [
              ...(depths.core >= THIN_SHELL
                ? [`stirred at its centre, ${share(depths.core)} of its mass`]
                : []),
              ...(depths.spent >= SPENT_LEAST
                ? [`spent to ${share(depths.spent)} of its mass`]
                : []),
              ...(1 - depths.floor >= THIN_SHELL
                ? [
                    `still to ${share(depths.floor)} of its radius`,
                    `stirred above, ${share(depths.wrap)} of its mass`,
                  ]
                : ["still up to its surface"]),
            ];
      facts.push(
        [
          "Inside",
          depths.spent >= 1 ? "spent matter that its own weight packs" : zones.join(" · "),
        ],
        ...(depths.dense > 0
          ? [
              [
                "At its centre",
                `${depths.heat > 0 ? `${figure(depths.heat / 1e6)} million K · ` : ""}${figure(depths.dense)} kg/m³`,
              ] satisfies Fact,
            ]
          : []),
        ["Moment of inertia", `${figure(depths.turning)} of its mass times its radius squared`],
      );
    }
  } else {
    const cover = seaCover(physics);
    facts.push(
      [
        "Made of",
        `iron ${share(physics.iron)} · rock ${share(physics.rock)} · water ${share(physics.ice)} · gas ${share(physics.gas)}`,
      ],
      ...(physics.lost > 0
        ? ([
            [
              "Water lost",
              `${figure(physics.lost)} kg · ${share(physics.lost / (physics.mass + physics.lost))} of the mass it was laid with`,
            ],
          ] as [string, string][])
        : []),
      ...(inside === null
        ? []
        : ([
            [
              "Inside",
              shells.length === 1 && shells[0].matter === "blend"
                ? "one mix all the way down, too small to have parted into layers"
                : shells
                    .map(({ matter, radius }) => `${stuff(matter)} to ${figure(radius / 1000)} km`)
                    .join(" · "),
            ],
            [
              "Pressure inside",
              [
                `${squeeze(inside.centre)} at the centre`,
                ...shells
                  .slice(1)
                  .map(({ matter, pressure }) => `${squeeze(pressure)} under the ${stuff(matter)}`),
              ].join(" · "),
            ],
            ...(inside.skin > 0
              ? [["Temperature at one bar", `${figure(inside.skin)} K`] satisfies Fact]
              : []),
            ["Moment of inertia", `${figure(inside.turning)} of its mass times its radius squared`],
          ] satisfies Fact[])),
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
      ...(warmth === null
        ? []
        : ([
            [
              "Heat from within",
              `${figure(1000 * warmth.flow)} mW/m² · ${power(warmth.decay)} by decay${
                warmth.tide > 0.01 * warmth.decay ? ` · ${power(warmth.tide)} by its tide` : ""
              }`,
            ],
            ...(warmth.mantle === null
              ? []
              : [
                  [
                    "Rock within",
                    `${figure(warmth.mantle)} K where it turns over · ${
                      warmth.plates ? "under plates that move" : "under one still lid"
                    }${warmth.melt > 0 ? ` · ${power(warmth.melt)} comes up as molten rock` : ""}`,
                  ] satisfies Fact,
                ]),
            ...(warmth.core === null
              ? []
              : [
                  [
                    "Iron core",
                    `${figure(warmth.core.heat)} K at its top · ${
                      warmth.core.frozen >= 1
                        ? `frozen through · giving off ${figure(1000 * warmth.core.flux)} mW/m²`
                        : `${
                            warmth.core.frozen <= 0
                              ? "all molten"
                              : `solid to ${share(warmth.core.frozen)} of its radius`
                          } · ${warmth.core.stirring > 0 ? "stirred" : "still"}, giving off ${figure(
                            1000 * warmth.core.flux,
                          )} mW/m² where ${figure(1000 * warmth.core.steep)} would pass without stirring`
                    }`,
                  ] satisfies Fact,
                ]),
            ...(warmth.sea === null
              ? []
              : [
                  [
                    "Sea under ice",
                    `${figure(warmth.sea.depth / 1000)} km deep under ${figure(
                      warmth.sea.roof / 1000,
                    )} km of ice · ${figure(warmth.sea.heat)} K`,
                  ] satisfies Fact,
                ]),
          ] satisfies Fact[])),
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
  const { field, press, reach: held, inside: host } = shieldOf(system, body.id);
  const wide = held / physics.radius;
  const fall = family === "star" ? fallOf(body, system.bodies) : null;
  const shelter =
    host !== null
      ? `inside the field of ${system.bodies[host].name}${
          field === null ? "" : ` · its own holds out to ${figure(wide)} of its radii`
        }`
      : press <= 0 || family === "star"
        ? null
        : field === null || wide <= 1
          ? `none: the wind of ${sun.name} reaches it`
          : `holds off the wind of ${sun.name} out to ${figure(wide)} of its radii`;
  facts.push(
    "Field",
    ...(field === null
      ? ([["Field of its own", "none"]] satisfies Fact[])
      : ([
          [
            "Field of its own",
            `${tesla(field.surface)} at its equator · ${figure(field.surface / EARTH_FIELD)} of the Earth's`,
          ],
          ["Made by", FIELD_SOURCES[field.source]],
          [
            "Poles",
            `${field.split ? "many, with a dipole" : "two, a dipole"} tilted ${figure(
              (180 * field.tilt) / Math.PI,
            )}° to its axis · ${figure(field.moment)} A·m²`,
          ],
          ...(field.source === "shell"
            ? [["Mean over its surface", tesla(field.mean)] satisfies Fact]
            : []),
        ] satisfies Fact[])),
    ...(shelter === null ? [] : [["Shelter", shelter] satisfies Fact]),
    ...(fall === null
      ? []
      : [
          [
            "Gas falling in",
            `${figure((fall.rate * YEAR) / SUN_MASS)} suns a year · ${
              fall.edge > physics.radius
                ? `stopped by the field at ${figure(fall.edge / physics.radius)} radii, it falls at ${figure(
                    fall.speed / 1000,
                  )} km/s onto ${share(fall.spots)} of the surface, lit to ${figure(fall.heat)} K`
                : "straight from the disk onto the equator"
            } · ${figure(fall.light / SUN_GLOW)} suns of light`,
          ] satisfies Fact,
        ]),
  );
  if (parent !== null) {
    const hill = hillOf(physics.orbit, physics.mass, parent.physics.mass);
    const holder = system.bodies.find(
      (moon) => moon.parent === body.id && moon.physics.year === physics.day,
    );
    const tide =
      shared !== null || starborn(physics)
        ? null
        : sunny(parent)
          ? pulledFact(body, parent)
          : tideFact(physics, parent.physics);
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
      ...(body.slanted === null
        ? []
        : [["Why it lies so", slantedOf(body.slanted)] satisfies Fact]),
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
      ...(body.freed === null
        ? []
        : [
            [
              "Torn from",
              `${body.freed.from} by the pull of ${parent.name} ${lived(body.freed.since)} ago${body.drawn !== null ? "" : body.freed.falls === null ? ` · it outlasts ${parent.name}` : ` · falls into ${parent.name} in ${lived(body.freed.falls)}`}`,
            ] satisfies Fact,
          ]),
      ...(body.gathered === null
        ? []
        : [
            [
              "Gathered",
              `from a ring of ${parent.name} ${lived(body.gathered.since)} ago${body.gathered.turn > 1 ? ` · the ${nth(body.gathered.turn)} moon of its line, each a fifth of the one before and made of its wreck` : ""}`,
            ] satisfies Fact,
          ]),
      ["Tilt", `${degrees(body.tilt)} to the plane of the system`],
      ...(body.skewed === null ? [] : [["Axis", skewedOf(body.skewed)] satisfies Fact]),
      ["Holds moons within", `${lengthOf(hill)} · ${figure(hill / physics.radius)} radii`],
    );
  } else {
    const holder = system.bodies.find(
      (other) => other.parent === body.id && other.physics.year === physics.day,
    );
    facts.push("Spin", [
      "Day",
      holder === undefined
        ? span(physics.day)
        : `${span(physics.day)}, the year of ${holder.name}, one face to it`,
    ]);
    if (body.skewed !== null) {
      facts.push(["Axis", skewedOf(body.skewed)]);
    }
  }
  const mate =
    system.bodies
      .filter((other) => other.parent === body.id && starborn(other.physics))
      .sort((left, right) => left.physics.orbit - right.physics.orbit)[0] ?? parent;
  if (starborn(physics) && mate !== null && (body.lobe > 0 || body.passages.length > 0)) {
    const when = (seconds: number) => `${(seconds / GIGAYEAR).toFixed(6)} billion years`;
    const yearly = (rate: number) => `${figure((rate * YEAR) / SUN_MASS)} suns a year`;
    facts.push(
      "Beside a star",
      [
        "Room",
        body.lobe >= 0.999
          ? `fills all the room it has beside ${mate.name}, and its gas spills toward it`
          : `fills ${share(body.lobe)} of the width it may have beside ${mate.name}`,
      ],
      ...body.passages.map((passage): Fact => {
        const { kind, mass, from, until, since, rate } = passage;
        const other = passage.with ?? "its companions";
        if (kind === "shed") {
          const close = passage.with === null ? "" : ` · ${other} was inside it and came out near`;
          return [
            "Threw off",
            `its envelope, ${massOf(mass)}, ${lived(since)} ago, at ${when(from)}${close}`,
          ];
        }
        const way = kind === "gave" ? "to" : "from";
        if (until === null) {
          return [
            kind === "gave" ? "Gives gas" : "Takes gas",
            `${yearly(rate)} ${way} ${other} · ${massOf(mass)} since ${when(from)}, ${lived(since)} ago`,
          ];
        }
        return [
          kind === "gave" ? "Gave gas" : "Took gas",
          `${massOf(mass)} ${way} ${other} · from ${when(from)} for ${lived(until - from)}, ended ${lived(since - (until - from))} ago`,
        ];
      }),
    );
  }
  facts.push(
    "Around it",
    [sunny(body) ? "Planets" : "Moons", String(moons)],
    ...(body.swallowed.length === 0
      ? []
      : [
          [
            "Swallowed",
            body.swallowed
              .map(
                (taken) =>
                  `${taken.name}${taken.of === null ? "" : `, a moon of ${taken.of}`}, ${massOf(taken.mass)}, ${lived(taken.since)} ago`,
              )
              .join(" · "),
          ] satisfies Fact,
        ]),
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
let space = createSpace(stage, system, choice.real);
let cutting = arrival.cut;
space.cut(cutting);

let tick = 0;
let pace = 0;
let weather = 0;
let refresh = () => {};
const dial = () => {
  if (!choice.real) {
    return `tick ${Math.floor(tick)}`;
  }
  const pair = (value: number) => String(Math.floor(value)).padStart(2, "0");
  const rest = tick % DAY;
  const days = Math.floor((tick % YEAR) / DAY);
  return `${Math.floor(tick / YEAR)} y ${days} d ${pair(rest / HOUR)}:${pair((rest % HOUR) / 60)}:${pair(rest % 60)}`;
};
const clock = el("span", { class: "clock" }, dial());
const strip = el("span", { class: "speeds" });
const edges = () => {
  strip.classList.toggle("before", strip.scrollLeft > 1);
  strip.classList.toggle("after", strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1);
};
strip.addEventListener("scroll", edges, { passive: true });
new ResizeObserver(edges).observe(strip);
let speeds: HTMLButtonElement[] = [];
const pacesOf = (real: boolean): [rate: number, label: string, title: string][] =>
  real
    ? RATES.map(([rate, label]) => [rate, label, `${figure(rate)} seconds a second`])
    : PACES.map((rate) => [rate, `${rate / PACES[1]}×`, `${rate} ticks a second`]);
const time = () => {
  const paces = pacesOf(choice.real);
  speeds = paces.map(([rate, label, title], index) => {
    const control = button(rate === 0 ? "Pause" : label, rate === 0 ? "Stop time" : title, () => {
      pace = rate;
      space.clock(tick, pace, choice.real ? weather : undefined);
      speeds.forEach((other, at) => {
        other.classList.toggle("active", at === index);
      });
      control.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    });
    control.classList.toggle("active", rate === pace);
    return control;
  });
  strip.replaceChildren(...speeds);
  strip.scrollLeft = 0;
  edges();
};

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
const watch = () => {
  space.onFrame((elapsed) => {
    if (pace > 0) {
      tick += elapsed * pace;
      weather += elapsed * Math.min(pace / WEATHER_SPAN, WEATHER_MOST);
      space.clock(tick, pace, choice.real ? weather : undefined);
      write(clock, dial());
      refresh();
    }
  });
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
    if (waited >= FPS_SPAN && pending === null) {
      write(fps, drawing > 0 ? `${Math.round(frames / drawing)} fps` : AT_REST);
      frames = 0;
      drawing = 0;
      waited = 0;
    }
  });
  space.onFocus(show);
};

const seedField = el("input", {
  type: "number",
  min: "0",
  step: "1",
  inputmode: "numeric",
  enterkeyhint: "go",
});
const starField = el("input", {
  type: "number",
  inputmode: "decimal",
  enterkeyhint: "go",
  min: "0.013",
  max: "60",
  step: "0.01",
  placeholder: "any",
});
const ageField = el("input", {
  type: "number",
  inputmode: "decimal",
  enterkeyhint: "go",
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
});
const ageRead = el("span", { class: "clock" });
const homeField = el("input", { type: "checkbox" });
const go = (next: number, scale = choice.real) => {
  const mass = Number.parseFloat(starField.value);
  const age = Number.parseFloat(ageField.value);
  const wanted = choiceOf(
    address({
      seed: next,
      settled: homeField.checked,
      star: Number.isFinite(mass) && mass > 0 ? mass : null,
      age: Number.isFinite(age) && age > 0 ? age : null,
      real: scale,
    }),
  );
  if (pending === null) {
    history.pushState(null, "", address(wanted));
  } else {
    history.replaceState(null, "", address(wanted));
  }
  open(wanted);
};
const read = () => {
  const typed = Number.parseInt(seedField.value, 10);
  return Number.isFinite(typed) ? typed : choice.seed;
};
const handheld = window.matchMedia("(pointer: coarse)");
for (const field of [seedField, starField, ageField]) {
  field.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      if (handheld.matches) {
        field.blur();
      }
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
addEventListener("popstate", () => open(choiceOf(location.search)));

const topbar = required<HTMLElement>("#topbar");
const marked = <Item extends HTMLElement>(item: Item, name: string): Item => {
  item.classList.add(name);
  return item;
};
const scale = button("", "", () => go(read(), !choice.real));
const cutter = button("Cut", "Show the body in focus cut open, with what lies inside it", () => {
  cutting = !cutting;
  space.cut(cutting);
  cutter.classList.toggle("active", cutting);
});
cutter.classList.toggle("active", cutting);
const fly = el("a", { class: "away", title: "Fly a ship through this system" }, "Fly");
const linked = () => {
  const view = space.view();
  const shot: Shot = {
    focus: system.bodies[view.focus].name,
    camera: [view.camera.x, view.camera.y, view.camera.z],
    tick,
    weather: choice.real ? weather : null,
    cut: cutting,
  };
  return `${location.origin}${location.pathname}${address(choice)}&${shotQuery(shot)}`;
};
const detailed = () => {
  const speed = pacesOf(choice.real).find(([rate]) => rate === pace)?.[1] ?? `${pace}`;
  const setting = [
    pace === 0 ? "time paused" : `time at ${speed}`,
    `window ${innerWidth}×${innerHeight}`,
    `scene ${stage.clientWidth}×${stage.clientHeight}`,
    `pixel ratio ${devicePixelRatio}`,
    handheld.matches ? "coarse pointer" : "fine pointer",
    fps.textContent,
    `build ${import.meta.env.VITE_BUILD}`,
    space.gpu(),
    navigator.userAgent,
  ];
  return `${linked()}\n${setting.join(" · ")}`;
};
const copied = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = el("textarea", { readonly: "", style: "position: fixed; opacity: 0" }, text);
    document.body.append(field);
    field.select();
    field.setSelectionRange(0, text.length);
    const done = document.execCommand("copy");
    field.remove();
    return done;
  }
};
const copier = (label: string, title: string, textOf: () => string) => {
  let timer = 0;
  const control = button(label, title, () => {
    const text = textOf();
    void copied(text).then((done) => {
      if (!done) {
        prompt(label, text);
      }
      write(control, done ? "Copied" : label);
      clearTimeout(timer);
      timer = setTimeout(() => write(control, label), COPIED_FOR);
    });
  });
  control.classList.add("copy");
  return control;
};
const copyLink = copier(
  "Copy link",
  "Copy a link that opens this system on the same frame: the body in focus, the camera and the clock, paused",
  linked,
);
const copyDetails = copier(
  "Copy details",
  "Copy the link with the speed of time, the size of the screen, the build, the graphics card and the browser, to report what is drawn",
  detailed,
);
topbar.append(
  el("strong", { class: "title" }, "Generator"),
  el(
    "span",
    { class: "more" },
    el("label", { class: "seed" }, "Seed", seedField),
    marked(
      button("Make", "Make the system of this seed", () => go(read())),
      "make",
    ),
    button("Random", "Make the system of a random seed", () => go(Math.floor(Math.random() * 1e6))),
    el(
      "label",
      {
        title:
          "The mass of the centre at its birth in solar masses; below 0.075 it is a brown dwarf",
      },
      "Star",
      starField,
    ),
    el(
      "label",
      {
        class: "age",
        title:
          "The age of the system in billions of years, where there is no home; left empty, it is drawn with the seed",
      },
      "Age",
      ageField,
      ageSlide,
      ageRead,
    ),
    el(
      "label",
      { title: "Make the system around a living home, as a game does" },
      homeField,
      "home",
    ),
    scale,
    cutter,
    el("a", { class: "away", href: "atlas.html" }, "Atlas"),
    fly,
    copyLink,
    copyDetails,
  ),
  marked(
    button("Next", "Make the system of the next seed", () => go(read() + 1)),
    "next",
  ),
  strip,
  el("span", { class: "readings" }, clock, fps),
  marked(
    button("☰", "Seed, star, age, scale and other pages", () => topbar.classList.toggle("open")),
    "menu",
  ),
);
dismissible(topbar, "open");

const summary = el("section", {});
const roster = el("table", { class: "bodies" });
let rows: HTMLTableRowElement[] = [];
const title = el("h3", {}, "");
const heading = el("span", {});
const facts = el("table", { class: "facts" });
const raw = el("pre", { class: "raw" });
const show = (id: number) => {
  const body = system.bodies[id];
  rows.forEach((row, at) => {
    row.classList.toggle("active", at === id);
  });
  write(title, body.name);
  write(heading, `${body.name} · ${classOf(body.physics)}`);
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

const panel = required<HTMLElement>("#panel");
const handle = el("button", { type: "button", class: "handle" }, heading);
handle.addEventListener("click", () => panel.classList.toggle("folded"));
const sheet = el(
  "div",
  { class: "body" },
  summary,
  el("section", {}, el("h3", {}, "Bodies"), roster),
  el("section", {}, title, facts),
  el("details", {}, el("summary", {}, "Description as stored"), raw),
);
panel.append(handle, sheet);

const depthOf = (body: Body): number =>
  body.parent === null ? 0 : 1 + depthOf(system.bodies[body.parent]);
const settle = (kept: number | null) => {
  const star = system.bodies[0];
  write(clock, dial());
  time();
  watch();
  space.clock(tick, pace, choice.real ? weather : undefined);

  seedField.value = String(choice.seed);
  starField.value = choice.star === null ? "" : String(choice.star);
  ageField.value = choice.age === null ? "" : String(choice.age);
  ageSlide.value = String(Math.log10(star.physics.age / GIGAYEAR));
  ageSlide.disabled = choice.settled;
  write(ageRead, lived(star.physics.age));
  homeField.checked = choice.settled;
  write(scale, choice.real ? "Drawn scale" : "Real scale");
  scale.title = choice.real
    ? "Show the system on the scale of the game, squeezed to fit a screen"
    : "Show the system in its real sizes and distances, with a clock in seconds";
  fly.href = `flight.html${address({ ...choice, real: false })}`;

  const suns = system.bodies.filter((body) => sunny(body));
  const planets = system.bodies.filter(
    (body) => !sunny(body) && sunny(system.bodies[body.parent ?? 0]),
  ).length;
  summary.replaceChildren(
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
          : `home ${system.bodies[system.home].name}, the system of world seed ${choice.seed}`
      }`,
    ),
  );
  rows = system.bodies.map((body) => {
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
  roster.replaceChildren(...rows);
  show(kept ?? system.home ?? star.id);
  if (kept === null) {
    sheet.scrollTop = 0;
  }
  document.body.dataset.done = "true";
};
const aged = (next: Choice) =>
  next.seed === choice.seed &&
  next.settled === choice.settled &&
  next.star === choice.star &&
  next.real === choice.real;
const survivor = (body: Body, from: Body[]): Body | null =>
  system.bodies.find((other) => other.name === body.name) ??
  (body.parent === null ? null : survivor(from[body.parent], from));
let pending: Choice | null = null;
const build = () => {
  if (pending === null) {
    return;
  }
  const next = pending;
  pending = null;
  if (next.real !== choice.real) {
    pace = 0;
  }
  const held = aged(next) ? space.view() : null;
  const before = system.bodies;
  choice = next;
  system = make(next);
  space.dispose();
  space = createSpace(stage, system, next.real);
  space.cut(cutting);
  stage.classList.remove("making");
  const kept = held === null ? null : survivor(before[held.focus], before);
  if (held !== null && kept !== null) {
    space.resume({ focus: kept.id, camera: held.camera });
    if (kept.name !== before[held.focus].name) {
      space.focus(kept.id);
    }
  } else {
    tick = 0;
    weather = 0;
  }
  settle(kept?.id ?? null);
};
const open = (next: Choice) => {
  seedField.value = String(next.seed);
  write(fps, "making…");
  stage.classList.add("making");
  delete document.body.dataset.done;
  if (pending === null) {
    requestAnimationFrame(() => setTimeout(build));
  }
  pending = next;
};
const land = (shot: Shot): number | null => {
  const focus = system.bodies.find((body) => body.name === shot.focus) ?? null;
  tick = shot.tick;
  weather = shot.weather ?? 0;
  if (shot.camera !== null) {
    space.resume({
      focus: focus?.id ?? space.view().focus,
      camera: new Vector3(...shot.camera),
    });
  } else if (focus !== null) {
    space.focus(focus.id);
  }
  return focus?.id ?? null;
};
settle(land(arrival));
