import { type Disk, depthAt, type Lane, type Ridge } from "@barycenter/sim";

export const HAZE_COLUMNS = 384;
export const SHADE_COLUMNS = 192;
export const SHADE_ROWS = 40;
export const SHADE_REACH = 7;
export const SHADE_FLOOR = -30;
export const LAMP_HEIGHT = 4 / (3 * Math.PI);

const BELL = 1 / Math.sqrt(2 * Math.PI);
const TAIL = [0.3435, 5.3954372];
const SOFT = 1;
const MARGIN = 1;
const INSET = 3;
const INSET_MOST = 0.3;
const BRIM_LEAST = 4.5;
const SEEN_LEAST = 1e-12;
const SKIN = Math.log(0.02);
const BRIM_SPARE = 0.3;

export interface Layer {
  lane: Lane;
  disk: Disk;
  thinned: number;
}

export interface Profile {
  inner: number;
  outer: number;
  dense: Float32Array;
  tall: Float32Array;
  far: Float32Array;
  ice: Float32Array;
  fine: Float32Array;
}

export interface Shade {
  depth: Float32Array;
  brims: Float32Array;
  top: number;
  steep: number;
  deepest: number;
}

export function above(height: number): number {
  const high = Math.abs(height);
  const [share, bend] = TAIL;
  const tail =
    (BELL * Math.exp(-0.5 * high * high)) /
    ((1 - share) * high + share * Math.sqrt(high * high + bend));
  return height < 0 ? 1 - tail : tail;
}

export function between(from: number, to: number): number {
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  if (low >= 0) {
    return above(low) - above(high);
  }
  if (high <= 0) {
    return above(-high) - above(-low);
  }
  return 1 - above(-low) - above(high);
}

export function spreadOf(from: number, to: number): number {
  const wide = Math.abs(to - from);
  const middle = 0.5 * (from + to);
  return wide > 0.02 ? between(from, to) / wide : BELL * Math.exp(-0.5 * middle * middle);
}

export function strip(before: number, after: number, through: number): number {
  const turn = after - before + through;
  const lit = Math.exp(-before);
  return Math.abs(turn) < 1e-3
    ? through * lit * (1 - 0.5 * turn)
    : (through * (lit - Math.exp(-after - through))) / turn;
}

function standOf({ inner, outer, height, flare }: Disk, at: number): number {
  const reach = Math.min(outer, Math.max(inner, at));
  return height * (reach / Math.sqrt(inner * outer)) ** flare;
}

export function profileOf(layers: Layer[], ridges: Ridge[] = []): Profile {
  const first = layers[0];
  const last = layers[layers.length - 1];
  const rough = Math.log(last.lane.outer / first.lane.inner) / HAZE_COLUMNS;
  const soft = (disk: Disk, at: number) => Math.max(rough, SOFT * standOf(disk, at));
  const edges = layers.map(({ lane, disk }) => {
    const wide = Math.log(lane.outer / lane.inner);
    const rise = Math.min(soft(disk, disk.inner), (INSET_MOST * wide) / INSET);
    const fall = Math.min(soft(disk, disk.outer), (INSET_MOST * wide) / INSET);
    return {
      from: Math.log(lane.inner) + INSET * rise,
      to: Math.log(lane.outer) - INSET * fall,
      rise,
      fall,
    };
  });
  const inner = first.lane.inner * Math.exp(-MARGIN * edges[0].rise);
  const outer = last.lane.outer * Math.exp(MARGIN * edges[edges.length - 1].fall);
  const knots = layers.flatMap(({ lane, disk }) => [
    { seen: Math.log(lane.inner), real: Math.log(disk.inner) },
    { seen: Math.log(lane.outer), real: Math.log(disk.outer) },
  ]);
  const truly = (at: number): number => {
    const found = knots.findIndex(({ seen }) => seen > at);
    const next = found < 0 ? knots.length - 1 : Math.max(1, found);
    const low = knots[next - 1];
    const high = knots[next];
    const run = high.seen - low.seen;
    return Math.exp(
      run > 0 ? low.real + ((high.real - low.real) * (at - low.seen)) / run : low.real,
    );
  };
  const dense = new Float32Array(HAZE_COLUMNS);
  const tall = new Float32Array(HAZE_COLUMNS);
  const far = new Float32Array(HAZE_COLUMNS);
  const ice = new Float32Array(HAZE_COLUMNS);
  const fine = new Float32Array(HAZE_COLUMNS);
  for (let column = 0; column < HAZE_COLUMNS; column++) {
    const at = Math.log(inner) + (Math.log(outer / inner) * column) / (HAZE_COLUMNS - 1);
    const real = truly(at);
    far[column] = real;
    const found = edges.findIndex((edge) => edge.to >= at);
    const here = found < 0 ? layers.length - 1 : found;
    const right = layers[here].disk;
    if (here === 0 || at >= edges[here].from) {
      tall[column] = standOf(right, real);
      ice[column] = right.ice;
      fine[column] = right.gas > 0 ? 1 : 0;
    } else {
      const left = layers[here - 1].disk;
      const along = (at - edges[here - 1].to) / (edges[here].from - edges[here - 1].to);
      const low = Math.log(standOf(left, left.outer));
      const high = Math.log(standOf(right, right.inner));
      tall[column] = Math.exp(low + (high - low) * along);
      ice[column] = left.ice + (right.ice - left.ice) * along;
      fine[column] = (left.gas > 0 ? 1 - along : 0) + (right.gas > 0 ? along : 0);
    }
    let sum = 0;
    layers.forEach(({ disk, thinned }, index) => {
      const edge = edges[index];
      const window =
        (1 - above((at - edge.from) / edge.rise)) * (1 - above((edge.to - at) / edge.fall));
      sum += window * depthAt(disk, real);
      const beyond = layers[index + 1];
      if (thinned > 0 && beyond !== undefined) {
        const after = edges[index + 1];
        const wide = after.from - edge.to;
        const share = wide > 0 ? Math.max(0, Math.min(1, (at - edge.to) / wide)) : 0;
        const near = depthAt(disk, disk.outer);
        const away = depthAt(beyond.disk, beyond.disk.inner);
        const lane = above((edge.to - at) / edge.fall) * above((at - after.from) / after.rise);
        if (near > 0 && away > 0) {
          sum += thinned * lane * near ** (1 - share) * away ** share;
        }
      }
    });
    dense[column] = column === 0 || column === HAZE_COLUMNS - 1 ? 0 : sum;
  }
  const pace = Math.log(outer / inner) / (HAZE_COLUMNS - 1);
  for (const { at, rise } of ridges) {
    const crest = far.findIndex((real) => real >= at);
    if (crest > 0) {
      const wide = Math.max(rough, SOFT * tall[crest]);
      dense.forEach((seen, column) => {
        dense[column] =
          seen * (1 + rise * Math.exp(-0.5 * (((column - crest) * pace) / wide) ** 2));
      });
    }
  }
  return { inner, outer, dense, tall, far, ice, fine };
}

export function shadeOf(profile: Profile, lamp: number): Shade {
  const { inner, outer, dense, tall } = profile;
  const radii = Float64Array.from(
    { length: HAZE_COLUMNS },
    (_, column) => inner * (outer / inner) ** (column / (HAZE_COLUMNS - 1)),
  );
  const depth = new Float32Array(SHADE_COLUMNS * SHADE_ROWS).fill(SHADE_FLOOR);
  const opening = Math.max(0, dense.findIndex((seen) => seen > SEEN_LEAST) - 1);
  let deepest = 0;
  for (let row = 0; row < SHADE_ROWS; row++) {
    const height = (SHADE_REACH * row) / (SHADE_ROWS - 1);
    for (let column = 0; column < SHADE_COLUMNS; column++) {
      const share = column / (SHADE_COLUMNS - 1);
      const reach = inner * (outer / inner) ** share;
      const cell = share * (HAZE_COLUMNS - 1);
      const whole = Math.min(HAZE_COLUMNS - 2, Math.floor(cell));
      const stand = tall[whole] + (tall[whole + 1] - tall[whole]) * (cell - whole);
      const rise = (height * stand * reach - lamp) / reach;
      const slant = Math.sqrt(1 + rise * rise);
      let sum = 0;
      for (let step = opening; step < HAZE_COLUMNS - 1 && radii[step] < reach; step++) {
        const from = radii[step];
        const to = Math.min(reach, radii[step + 1]);
        const part = (to - from) / (radii[step + 1] - from);
        const thick = dense[step] + 0.5 * part * (dense[step + 1] - dense[step]);
        if (thick <= SEEN_LEAST) {
          continue;
        }
        const scale = 0.5 * (tall[step] * from + tall[step + 1] * radii[step + 1]);
        const low = (lamp + rise * from) / scale;
        const high = (lamp + rise * to) / scale;
        sum += (thick * spreadOf(low, high) * (to - from) * slant) / scale;
      }
      depth[row * SHADE_COLUMNS + column] = Math.max(SHADE_FLOOR, Math.log(sum));
      deepest = row === 0 ? Math.max(deepest, sum) : deepest;
    }
  }
  const brims = Float32Array.from({ length: HAZE_COLUMNS }, (_, column) => {
    const at = Math.round((column * (SHADE_COLUMNS - 1)) / (HAZE_COLUMNS - 1));
    let row = SHADE_ROWS - 1;
    while (row > 0 && depth[row * SHADE_COLUMNS + at] < SKIN) {
      row--;
    }
    const skin = (SHADE_REACH * (row + 1)) / (SHADE_ROWS - 1);
    return Math.min(SHADE_REACH, Math.max(BRIM_LEAST, skin + BRIM_SPARE));
  });
  let top = 0;
  let steep = 0;
  dense.forEach((seen, column) => {
    if (seen > SEEN_LEAST) {
      top = Math.max(top, brims[column] * tall[column] * radii[column]);
      steep = Math.max(steep, brims[column] * tall[column]);
    }
  });
  return { depth, brims, top, steep, deepest };
}

export function shadowAt(profile: Profile, shade: Shade, reach: number, lift: number): number {
  const { inner, outer, tall } = profile;
  if (reach <= inner) {
    return 0;
  }
  const far = Math.min(reach, outer);
  const share = Math.log(far / inner) / Math.log(outer / inner);
  const cell = share * (HAZE_COLUMNS - 1);
  const whole = Math.min(HAZE_COLUMNS - 2, Math.floor(cell));
  const stand = tall[whole] + (tall[whole + 1] - tall[whole]) * (cell - whole);
  const height = Math.min(SHADE_REACH, (Math.abs(lift) * far) / reach / (stand * far));
  const across = share * (SHADE_COLUMNS - 1);
  const column = Math.min(SHADE_COLUMNS - 2, Math.floor(across));
  const up = (height / SHADE_REACH) * (SHADE_ROWS - 1);
  const row = Math.min(SHADE_ROWS - 2, Math.floor(up));
  const read = (line: number, cut: number) => shade.depth[line * SHADE_COLUMNS + cut];
  const blend = (line: number) =>
    read(line, column) + (read(line, column + 1) - read(line, column)) * (across - column);
  return Math.exp(blend(row) + (blend(row + 1) - blend(row)) * (up - row));
}
