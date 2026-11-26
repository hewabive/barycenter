import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const FINE = 1e-4;
const SUN_GRAMS = 1.98841e33;
const SUN_CENTIMETERS = 6.957e10;
const MASSES = [
  0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.8, 1, 1.1, 1.2, 1.4, 1.5, 1.7, 2, 2.5, 3,
  4, 5, 6.5, 8, 10, 13, 20, 30, 40, 60,
];
const BORN = 1;
const SETTLED = 202;
const MIDWAY = 353;
const SPENT = 454;
const TIP = 605;
const RELIT = 631;
const EMPTIED = 707;
const PULSING = 808;
const BARED = 1409;
const COLD = 1721;
const STEPS = { young: 7, prime: 6, climb: 10, helium: 3, last: 3, pulses: 4 };
const TIMES = { prime: [0.35, 0.5, 0.75], helium: [0.2, 0.4, 0.6, 0.8] };
const OUTERMOST = [0.99, 0.9, 1.1];
const THROUGHOUT = 0.999;
const DEEP = 0.05;
const TURNING_MOST = 0.4;

const { values } = parseArgs({
  options: {
    tracks: { type: "string" },
    out: { type: "string", default: new URL("../src/tracks.ts", import.meta.url).pathname },
  },
});
if (values.tracks === undefined) {
  throw new Error("--tracks <folder of MIST v2.5 .track.eep files> is required");
}

type Point = Record<string, number>;

function trackOf(folder: string, suns: number): Point[] {
  const name = `${String(Math.round(suns * 100)).padStart(5, "0")}M.track.eep`;
  const lines = readFileSync(join(folder, name), "utf8").split("\n");
  const first = lines.findIndex((line) => line.length > 0 && !line.startsWith("#"));
  const names = lines[first - 1].replace("#", "").trim().split(/\s+/);
  return lines
    .slice(first)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const cells = line.trim().split(/\s+/).map(Number);
      return Object.fromEntries(names.map((column, index) => [column, cells[index]]));
    });
}

function between(from: number, to: number, steps: number): number[] {
  return Array.from({ length: steps + 1 }, (_, step) =>
    Math.round(from + ((to - from) * step) / steps),
  );
}

function timed(track: Point[], from: number, to: number, steps: number, times: number[]): number[] {
  const [start, end] = [track[from - 1].star_age, track[to - 1].star_age];
  const nearest = times.map((time) => {
    const wanted = start + time * (end - start);
    let best = from;
    for (let point = from; point <= to; point++) {
      if (
        Math.abs(track[point - 1].star_age - wanted) < Math.abs(track[best - 1].star_age - wanted)
      ) {
        best = point;
      }
    }
    return best;
  });
  return [...new Set([...between(from, to, steps), ...nearest])].sort(
    (left, right) => left - right,
  );
}

function lovedAt(track: Point[], point: number): number {
  for (let away = 0; away < track.length; away++) {
    for (const near of [track[point - 1 - away], track[point - 1 + away]]) {
      if (near !== undefined && near.apsidal_constant_k2 > 0) {
        return near.apsidal_constant_k2;
      }
    }
  }
  throw new Error("a track with no apsidal constant");
}

function insideOf(track: Point[], at: number, born: number): number[] {
  const point = track[at - 1];
  const mass = point.star_mass;
  const radius = 10 ** point.log_R;
  const [deep, low, high] = OUTERMOST;
  const top = point.conv_env_top_radius / radius;
  const wrapped = point.conv_env_top_mass >= deep * mass && top >= low && top <= high;
  const own = wrapped ? (point.conv_env_top_mass - point.conv_env_bot_mass) / mass : 0;
  const wrap = own > DEEP ? 1 - point.conv_env_bot_mass / born : own;
  const turning =
    point.total_moment_of_inertia / (mass * SUN_GRAMS * (radius * SUN_CENTIMETERS) ** 2);
  if (!(turning > 0 && turning <= TURNING_MOST)) {
    throw new Error(`moment of inertia ${turning} at point ${at} of ${mass}`);
  }
  return [
    wrap >= THROUGHOUT ? 0 : point.mass_conv_core / born,
    wrap,
    wrapped ? Math.min(1, point.conv_env_bot_radius / radius) : 1,
    point.he_core_mass / born,
    turning,
    Math.log10(lovedAt(track, at)),
    point.log_center_T,
    point.log_center_Rho + 3,
  ];
}

const whole = (cells: number[]) => cells.map((cell) => Math.round(cell / FINE));

function reduced(folder: string, suns: number) {
  const track = trackOf(folder, suns);
  const at = (point: number) => track[point - 1];
  const settled = at(SETTLED);
  const midway = at(MIDWAY);
  const young = between(BORN, SETTLED, STEPS.young).map((point) =>
    whole([Math.log10(at(point).star_age / settled.star_age), ...insideOf(track, point, suns)]),
  );
  const span = at(SPENT).star_age - settled.star_age;
  const prime = timed(track, SETTLED, SPENT, STEPS.prime, TIMES.prime).map((point) =>
    whole([(at(point).star_age - settled.star_age) / span, ...insideOf(track, point, suns)]),
  );
  const placed = (points: number[]) => {
    const [from, to] = [at(points[0]).star_age, at(points[points.length - 1]).star_age];
    return points.map((point) =>
      whole([
        (at(point).star_age - from) / (to - from),
        at(point).log_R - midway.log_R,
        at(point).log_L - midway.log_L,
        ...insideOf(track, point, suns),
      ]),
    );
  };
  const late =
    track.length < PULSING
      ? []
      : [
          placed(between(SPENT, TIP, STEPS.climb)),
          placed(timed(track, RELIT, EMPTIED, STEPS.helium, TIMES.helium)),
          placed([
            ...between(EMPTIED, PULSING, STEPS.last),
            ...(track.length < BARED ? [] : between(PULSING, BARED, STEPS.pulses).slice(1)),
          ]).slice(1),
        ];
  const cold = track.length < COLD ? null : insideOf(track, COLD, suns);
  const ember = cold === null ? null : whole([at(COLD).star_mass, cold[4], cold[5], cold[7]]);
  return { suns, young, prime, late, ember };
}

const tracks = MASSES.map((suns) => reduced(values.tracks ?? "", suns));
const listed = (rows: number[][]) => `[${rows.map((row) => `[${row.join(", ")}]`).join(", ")}]`;
const embers = tracks.flatMap(({ ember }) => (ember === null ? [] : [ember]));
writeFileSync(
  values.out,
  `export const STAR_TRACKS = {
  fine: ${FINE},
  embers: ${listed(embers.sort((left, right) => left[0] - right[0]))},
  stars: [
${tracks
  .map(
    ({ suns, young, prime, late }) => `    {
      suns: ${suns},
      young: ${listed(young)},
      prime: ${listed(prime)},
      late: [${late.map(listed).join(", ")}],
    },`,
  )
  .join("\n")}
  ],
};
`,
);
