import {
  DENSE_STAR,
  densityOf,
  holeRadius,
  SUN_MASS,
  starDawn,
  starGlow,
  starRadius,
  starSpan,
  starStages,
} from "./physics.ts";
import { STAR_TRACKS } from "./tracks.ts";
import type { Physics } from "./types.ts";

export type Stage = "young" | "prime" | "climb" | "helium" | "last" | "ember" | "pulsar";

export interface Within {
  stage: Stage;
  core: number;
  wrap: number;
  floor: number;
  spent: number;
  turning: number;
  love: number;
  heat: number;
  dense: number;
}

export type Star = Pick<Physics, "mass" | "radius" | "glow" | "age">;

const { fine, embers, stars } = STAR_TRACKS;
const LATE_FROM = stars.findIndex(({ late }) => late.length > 0);
const SWOLLEN = 1.001;
const LIGHT_WEIGHT = 0.5;
const STAGE_BIAS = 0.3;
const HELIUM = 1;
const CENTRAL = [0, 3, 6, 7];
const PULSAR_TURNING = [0.237, 4.2, 90];
const PULSAR_LOVE = 2 * 0.0763;

function mixed(from: number[], to: number[], share: number): number[] {
  return from.map((value, index) => value + (to[index] - value) * share);
}

function along(rows: number[][], key: number): number[] {
  const found = rows.findIndex(([at]) => at >= key);
  const next = found < 0 ? rows.length - 1 : Math.max(1, found);
  const [from, to] = [rows[next - 1], rows[next]];
  const share = Math.max(0, Math.min(1, (key - from[0]) / (to[0] - from[0] || 1)));
  return mixed(from, to, share).slice(1);
}

function nearest(
  groups: number[][][],
  wide: number,
  bright: number,
  favored: number,
  passed: number,
): number[] {
  let best = groups[0][0];
  let least = Number.POSITIVE_INFINITY;
  let found = 0;
  let before: number[] | null = null;
  for (const [group, rows] of groups.entries()) {
    for (const row of rows) {
      const from = before ?? row;
      const [across, up] = [row[1] - from[1], LIGHT_WEIGHT * (row[2] - from[2])];
      const [right, above] = [wide - from[1], LIGHT_WEIGHT * (bright - from[2])];
      const length = across * across + up * up;
      const share =
        length > 0 ? Math.max(0, Math.min(1, (right * across + above * up) / length)) : 0;
      const bias = group === favored ? 0 : STAGE_BIAS / fine;
      const far = (right - across * share) ** 2 + (above - up * share) ** 2 + bias * bias;
      if (far < least) {
        least = far;
        found = group;
        best = mixed(from, row, share).slice(1);
      }
      before = row;
    }
  }
  const placed = best.slice(2);
  if (found !== HELIUM || favored !== HELIUM) {
    return placed;
  }
  const timed = along(groups[HELIUM], passed).slice(2);
  return placed.map((value, index) => (CENTRAL.includes(index) ? timed[index] : value));
}

function emberOf(suns: number): Within {
  const [turning, love, dense] = along(embers, suns / fine);
  return {
    stage: "ember",
    core: 0,
    wrap: 0,
    floor: 1,
    spent: 1,
    turning: turning * fine,
    love: 2 * 10 ** (love * fine),
    heat: 0,
    dense: 10 ** (dense * fine),
  };
}

function pulsarOf(suns: number, radius: number): Within {
  const [plain, slope, steep] = PULSAR_TURNING;
  const tight = suns / (radius / 1000);
  return {
    stage: "pulsar",
    core: 0,
    wrap: 0,
    floor: 1,
    spent: 1,
    turning: plain * (1 + slope * tight + steep * tight ** 4),
    love: PULSAR_LOVE,
    heat: 0,
    dense: 0,
  };
}

export function withinOf(star: Star): Within | null {
  const packed = densityOf(star.mass, star.radius);
  if (star.radius < 1.5 * holeRadius(star.mass)) {
    return null;
  }
  const suns = star.mass / SUN_MASS;
  if (packed > DENSE_STAR[1]) {
    return pulsarOf(suns, star.radius);
  }
  if (packed > DENSE_STAR[0]) {
    return emberOf(suns);
  }
  const dwarf = starRadius(star.mass);
  const young = star.age < starDawn(star.mass) && star.radius > dwarf;
  const late =
    !young &&
    (star.radius > SWOLLEN * dwarf ||
      star.radius < dwarf / SWOLLEN ||
      star.glow > SWOLLEN * starGlow(star.mass));
  const [, , climbed, relit] = starStages(star.mass);
  const favored = star.age <= climbed ? 0 : star.age <= relit ? HELIUM : 2;
  const passed = (star.age - climbed) / (relit - climbed);
  const read = ({ young: early, prime, late: after }: (typeof stars)[number]) =>
    young
      ? along(early, Math.log10(star.age / starDawn(star.mass)) / fine)
      : late
        ? nearest(
            after,
            Math.log10(star.radius / dwarf) / fine,
            Math.log10(star.glow / starGlow(star.mass)) / fine,
            favored,
            passed / fine,
          )
        : along(prime, Math.min(1, star.age / starSpan(star.mass)) / fine);
  const found = stars.findIndex((track) => track.suns >= suns);
  const above = found < 0 ? stars.length - 1 : Math.max((late ? LATE_FROM : 0) + 1, found);
  const [light, heavy] = [stars[above - 1], stars[above]];
  const share = Math.max(
    0,
    Math.min(1, Math.log(suns / light.suns) / Math.log(heavy.suns / light.suns)),
  );
  const [core, wrap, floor, spent, turning, love, heat, dense] = mixed(
    read(light),
    read(heavy),
    share,
  );
  const stages: Stage[] = ["climb", "helium", "last"];
  return {
    stage: young ? "young" : late ? stages[favored] : "prime",
    core: core * fine,
    wrap: wrap * fine,
    floor: floor * fine,
    spent: spent * fine,
    turning: turning * fine,
    love: 2 * 10 ** (love * fine),
    heat: 10 ** (heat * fine),
    dense: 10 ** (dense * fine),
  };
}
