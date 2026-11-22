import { type Body, createGround, grainOf, TILE_CELLS } from "@barycenter/sim";

export const TILE_BOUND = 0.8;
export const TILE_SKIRT = 0.12;
export const GRIT_SPAN = 256;
export const TILE_SIDE = TILE_CELLS + 1;
export const TILE_GRID = TILE_SIDE * TILE_SIDE;
export const TILE_COUNT = TILE_GRID + 4 * TILE_SIDE;

const WIDE = TILE_SIDE + 2;

export interface Ask {
  ticket: number;
  body: Pick<Body, "seed" | "relief" | "physics">;
  flat: number;
  unit: number;
  face: number;
  level: number;
  column: number;
  row: number;
}

export interface Made {
  ticket: number;
  origin: [x: number, y: number, z: number];
  position: Float32Array;
  normal: Float32Array;
  heading: Float32Array;
  grit: Float32Array;
}

export function aim(face: number, u: number, v: number): [x: number, y: number, z: number] {
  const a = Math.tan((u * Math.PI) / 4);
  const b = Math.tan((v * Math.PI) / 4);
  const length = Math.hypot(a, b, 1);
  const across = a / length;
  const along = b / length;
  const out = 1 / length;
  if (face === 0) {
    return [out, along, -across];
  }
  if (face === 1) {
    return [-out, along, across];
  }
  if (face === 2) {
    return [across, out, -along];
  }
  if (face === 3) {
    return [across, -out, along];
  }
  if (face === 4) {
    return [across, along, out];
  }
  return [-across, along, -out];
}

export function shapeTile(ask: Ask): Made {
  const { body, flat, unit, face, level } = ask;
  const { radius } = body.physics;
  const wet = body.relief.sea !== null;
  const span = 2 / 2 ** level;
  const edge = (radius * Math.PI) / (2 * 2 ** level);
  const [midX, midY, midZ] = aim(face, -1 + span * (ask.column + 0.5), -1 + span * (ask.row + 0.5));
  const ground = createGround(
    body,
    { x: midX, y: midY, z: midZ },
    (TILE_BOUND * Math.PI) / (2 * 2 ** level),
    grainOf(radius, level),
  );
  const places = new Float64Array(3 * WIDE * WIDE);
  const headings = new Float64Array(3 * WIDE * WIDE);
  for (let row = 0; row < WIDE; row++) {
    for (let column = 0; column < WIDE; column++) {
      const [x, y, z] = aim(
        face,
        -1 + span * (ask.column + (column - 1) / TILE_CELLS),
        -1 + span * (ask.row + (row - 1) / TILE_CELLS),
      );
      const height = ground(x, y, z);
      const far = radius + (wet ? Math.max(0, height) : height);
      const base = 3 * (row * WIDE + column);
      headings[base] = x;
      headings[base + 1] = y;
      headings[base + 2] = z;
      places[base] = x * far;
      places[base + 1] = flat * y * far;
      places[base + 2] = z * far;
    }
  }
  const middle = 3 * ((WIDE * WIDE - 1) / 2);
  const originX = places[middle];
  const originY = places[middle + 1];
  const originZ = places[middle + 2];
  const tread = (value: number) => Math.floor(value / GRIT_SPAN) * GRIT_SPAN;
  const treadX = tread(originX);
  const treadY = tread(originY);
  const treadZ = tread(originZ);
  const position = new Float32Array(3 * TILE_COUNT);
  const normal = new Float32Array(3 * TILE_COUNT);
  const heading = new Float32Array(3 * TILE_COUNT);
  const grit = new Float32Array(3 * TILE_COUNT);
  const write = (slot: number, row: number, column: number, sink: number) => {
    const base = 3 * ((row + 1) * WIDE + column + 1);
    const east = base + 3;
    const west = base - 3;
    const north = base + 3 * WIDE;
    const south = base - 3 * WIDE;
    const ax = places[east] - places[west];
    const ay = places[east + 1] - places[west + 1];
    const az = places[east + 2] - places[west + 2];
    const bx = places[north] - places[south];
    const by = places[north + 1] - places[south + 1];
    const bz = places[north + 2] - places[south + 2];
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    const length = Math.hypot(nx, ny, nz);
    const out = 3 * slot;
    position[out] = (places[base] - sink * headings[base] - originX) / unit;
    position[out + 1] = (places[base + 1] - sink * flat * headings[base + 1] - originY) / unit;
    position[out + 2] = (places[base + 2] - sink * headings[base + 2] - originZ) / unit;
    normal[out] = nx / length;
    normal[out + 1] = ny / length;
    normal[out + 2] = nz / length;
    heading[out] = headings[base];
    heading[out + 1] = headings[base + 1];
    heading[out + 2] = headings[base + 2];
    grit[out] = places[base] - treadX;
    grit[out + 1] = places[base + 1] - treadY;
    grit[out + 2] = places[base + 2] - treadZ;
  };
  for (let row = 0; row < TILE_SIDE; row++) {
    for (let column = 0; column < TILE_SIDE; column++) {
      write(row * TILE_SIDE + column, row, column, 0);
    }
  }
  const drop = TILE_SKIRT * edge;
  for (let step = 0; step < TILE_SIDE; step++) {
    write(TILE_GRID + step, 0, step, drop);
    write(TILE_GRID + TILE_SIDE + step, TILE_SIDE - 1, step, drop);
    write(TILE_GRID + 2 * TILE_SIDE + step, step, 0, drop);
    write(TILE_GRID + 3 * TILE_SIDE + step, step, TILE_SIDE - 1, drop);
  }
  return {
    ticket: ask.ticket,
    origin: [originX, originY, originZ],
    position,
    normal,
    heading,
    grit,
  };
}
