import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

interface Grid {
  heats: number[];
  pressures: number[];
  density: Float64Array;
  entropy: Float64Array;
  slope: Float64Array;
}

interface Span {
  from: number;
  step: number;
  count: number;
}

interface Plan {
  at: number;
  warmth: Span;
  pressure: Span;
}

const FINE = 1e-4;
const HYDROGEN: Plan = {
  at: 5,
  warmth: { from: 1.6, step: 0.1, count: 25 },
  pressure: { from: 5, step: 0.1, count: 131 },
};
const WATER: Plan = {
  at: 9,
  warmth: { from: 2.3, step: 0.1, count: 21 },
  pressure: { from: 7, step: 0.1, count: 77 },
};

const { values } = parseArgs({
  options: {
    hydrogen: { type: "string" },
    water: { type: "string" },
    out: { type: "string", default: new URL("../src/adiabats.ts", import.meta.url).pathname },
  },
});
if (values.hydrogen === undefined || values.water === undefined) {
  throw new Error(
    "--hydrogen <TABLEEOS_2021_TP_Y0275_v1> and --water <aqua_eos_pt_v1_0.dat> are required",
  );
}

function rowsOf(path: string, width: number): number[][] {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim().split(/\s+/).map(Number))
    .filter((row) => row.length >= width && row.every(Number.isFinite));
}

function hydrogenOf(path: string): Grid {
  const rows = rowsOf(path, 10);
  const heats = Array.from({ length: 121 }, (_, index) => 2 + 0.05 * index);
  const pressures = Array.from({ length: 441 }, (_, index) => 0.05 * index);
  if (rows.length !== heats.length * pressures.length) {
    throw new Error(`hydrogen: ${rows.length} rows`);
  }
  return {
    heats,
    pressures,
    density: Float64Array.from(rows, (row) => row[2] + 3),
    entropy: Float64Array.from(rows, (row) => row[4]),
    slope: Float64Array.from(rows, (row) => row[9]),
  };
}

function waterOf(path: string): Grid {
  const rows = rowsOf(path, 11);
  const heats = Array.from({ length: 301 }, (_, index) => 2 + 0.01 * index);
  const pressures = Array.from(
    { length: 1093 },
    (_, index) => -1 + (index * (Math.log10(4e14) + 1)) / 1092,
  );
  if (rows.length !== heats.length * pressures.length) {
    throw new Error(`water: ${rows.length} rows`);
  }
  const wide = pressures.length;
  const laid = (field: (row: number[]) => number) =>
    Float64Array.from({ length: rows.length }, (_, index) =>
      field(rows[(index % wide) * heats.length + Math.floor(index / wide)]),
    );
  return {
    heats,
    pressures,
    density: laid((row) => Math.log10(row[2])),
    entropy: laid((row) => row[4]),
    slope: laid((row) => row[3]),
  };
}

function traced(grid: Grid, { at, warmth, pressure }: Plan) {
  const { heats, pressures } = grid;
  const wide = pressures.length;
  const coldest = heats[0];
  const hottest = heats[heats.length - 1];
  const pace = heats[1] - heats[0];
  const column = (pascals: number) => (pascals - pressures[0]) / (pressures[1] - pressures[0]);
  const read = (field: Float64Array, heat: number, spot: number) => {
    const low = Math.min(wide - 2, Math.floor(spot + 1e-9));
    const share = Math.max(0, spot - low);
    return field[heat * wide + low] * (1 - share) + field[heat * wide + low + 1] * share;
  };
  const along = (field: Float64Array, spot: number, heat: number) => {
    const place = Math.max(0, Math.min(heats.length - 1 - 1e-9, (heat - coldest) / pace));
    const low = Math.floor(place);
    const share = place - low;
    return read(field, low, spot) * (1 - share) + read(field, low + 1, spot) * share;
  };
  const across = (field: Float64Array, pascals: number) => {
    const place = (pascals - pressures[0]) / (pressures[1] - pressures[0]);
    const low = Math.floor(place);
    return field[low] * (1 - (place - low)) + field[low + 1] * (place - low);
  };
  const heatAt = (spot: number, entropy: number, from: number) => {
    let low = Math.max(0, Math.min(heats.length - 2, Math.floor((from - coldest) / pace)));
    while (low < heats.length - 2 && read(grid.entropy, low + 1, spot) < entropy) {
      low += 1;
    }
    const under = read(grid.entropy, low, spot);
    const over = read(grid.entropy, low + 1, spot);
    const share = Math.max(0, Math.min(1, (entropy - under) / (over - under)));
    return Math.min(hottest, Math.max(from, coldest + pace * (low + share)));
  };
  const density: number[][] = [];
  const heat: number[][] = [];
  for (let row = 0; row < warmth.count; row++) {
    const asked = warmth.from + warmth.step * row;
    const slope = read(grid.slope, 0, column(at));
    const entered = asked >= coldest ? at : at + (coldest - asked) / slope;
    const entropy =
      asked >= coldest ? along(grid.entropy, column(at), asked) : across(grid.entropy, entered);
    const dense: number[] = [];
    const warm: number[] = [];
    let last = Math.max(asked, coldest);
    for (let step = 0; step < pressure.count; step++) {
      const pascals = pressure.from + pressure.step * step;
      if (asked < coldest && pascals < entered) {
        const cold = asked + slope * (pascals - at);
        warm.push(cold);
        dense.push(across(grid.density, entered) + (pascals - entered) - (cold - coldest));
        continue;
      }
      last = heatAt(column(pascals), entropy, pascals <= at ? coldest : last);
      warm.push(last);
      dense.push(along(grid.density, column(pascals), last));
    }
    density.push(dense);
    heat.push(warm);
  }
  return { density, heat };
}

function written(name: string, grid: Grid, plan: Plan): string {
  const { density, heat } = traced(grid, plan);
  const listed = (rows: number[][]) =>
    rows
      .map((row) => `[${row.map((value) => Math.round(value / FINE)).join(", ")}]`)
      .join(",\n    ");
  return `export const ${name} = {
  at: ${plan.at},
  warmth: { from: ${plan.warmth.from}, step: ${plan.warmth.step} },
  pressure: { from: ${plan.pressure.from}, step: ${plan.pressure.step} },
  fine: ${FINE},
  density: [
    ${listed(density)},
  ],
  heat: [
    ${listed(heat)},
  ],
};
`;
}

writeFileSync(
  values.out,
  [
    written("HYDROGEN_ADIABATS", hydrogenOf(values.hydrogen), HYDROGEN),
    written("WATER_ADIABATS", waterOf(values.water), WATER),
  ].join("\n"),
);
