import {
  angleBetween,
  circumcenter,
  cross,
  dot,
  hullFaces,
  normalize,
  slerp,
  subtract,
  type Vector,
} from "@barycenter/sim";

export interface Cell {
  center: Vector;
  corners: Vector[];
}

export interface Tooth {
  left: Vector;
  right: Vector;
  tip: Vector;
}

function scaled(vector: Vector, factor: number): Vector {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
}

function sum(left: Vector, right: Vector): Vector {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

export function arc(from: Vector, to: Vector, steps: number, base: number, lift: number): Vector[] {
  const points: Vector[] = [];
  for (let step = 0; step <= steps; step++) {
    const share = step / steps;
    const radius = base + lift * Math.sin(Math.PI * share);
    points.push(scaled(slerp(from, to, share), radius));
  }
  return points;
}

function sortAround(center: Vector, corners: Vector[]): Vector[] {
  const helper = Math.abs(center.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const east = normalize(cross(helper, center));
  const north = cross(center, east);
  const angleOf = (corner: Vector) => Math.atan2(dot(corner, north), dot(corner, east));
  return corners.slice().sort((left, right) => angleOf(left) - angleOf(right));
}

export function buildCells(points: Vector[]): Cell[] {
  const around: Vector[][] = points.map(() => []);
  for (const [first, second, third] of hullFaces(points)) {
    const corner = circumcenter(points[first], points[second], points[third]);
    around[first].push(corner);
    around[second].push(corner);
    around[third].push(corner);
  }
  return points.map((center, index) => ({ center, corners: sortAround(center, around[index]) }));
}

export function neighborsAcross(cells: Cell[]): number[][] {
  const ids = new Map<Vector, number>();
  const idOf = (corner: Vector): number => {
    let id = ids.get(corner);
    if (id === undefined) {
      id = ids.size;
      ids.set(corner, id);
    }
    return id;
  };
  const sides = new Map<string, number[]>();
  const keys = cells.map((cell, index) =>
    cell.corners.map((corner, side) => {
      const from = idOf(corner);
      const to = idOf(cell.corners[(side + 1) % cell.corners.length]);
      const key = `${Math.min(from, to)}:${Math.max(from, to)}`;
      sides.set(key, [...(sides.get(key) ?? []), index]);
      return key;
    }),
  );
  return keys.map((row, index) =>
    row.map((key) => sides.get(key)?.find((other) => other !== index) ?? -1),
  );
}

function capped(center: Vector, point: Vector, reach: number): Vector {
  const away = angleBetween(center, point);
  return away > reach ? slerp(center, point, reach / away) : point;
}

export function rimOf(cell: Cell, reach: number, step: number): Vector[] {
  const rim: Vector[] = [];
  cell.corners.forEach((corner, index) => {
    const next = cell.corners[(index + 1) % cell.corners.length];
    const pieces = Math.max(1, Math.ceil(angleBetween(corner, next) / step));
    for (let piece = 0; piece < pieces; piece++) {
      rim.push(capped(cell.center, slerp(corner, next, piece / pieces), reach));
    }
  });
  return rim;
}

export function patch(
  center: Vector,
  rim: Vector[],
  ring: number,
): { vertices: Vector[]; shares: number[] } {
  const widest = rim.reduce((most, point) => Math.max(most, angleBetween(center, point)), 0);
  const rings = Math.max(1, Math.ceil(widest / ring));
  const vertices: Vector[] = [];
  const shares: number[] = [];
  const add = (point: Vector, level: number) => {
    vertices.push(level === 0 ? center : slerp(center, point, level / rings));
    shares.push(level / rings);
  };
  rim.forEach((point, index) => {
    const next = rim[(index + 1) % rim.length];
    for (let level = 0; level < rings; level++) {
      add(point, level);
      add(point, level + 1);
      add(next, level + 1);
      if (level > 0) {
        add(point, level);
        add(next, level + 1);
        add(next, level);
      }
    }
  });
  return { vertices, shares };
}

export function shoreline(
  from: Vector,
  to: Vector,
  step: number,
  dry: (at: Vector) => boolean,
): Vector[][] {
  const steps = Math.max(2, Math.ceil(angleBetween(from, to) / step));
  const at = (share: number) => slerp(from, to, share);
  const edge = (wet: number, ashore: number): Vector => {
    let low = wet;
    let high = ashore;
    for (let round = 0; round < 5; round++) {
      const middle = (low + high) / 2;
      if (dry(at(middle))) {
        high = middle;
      } else {
        low = middle;
      }
    }
    return at(high);
  };
  const runs: Vector[][] = [];
  let run: Vector[] | null = null;
  for (let index = 0; index <= steps; index++) {
    const share = index / steps;
    const point = at(share);
    if (dry(point)) {
      if (run === null) {
        run = index === 0 ? [] : [edge((index - 1) / steps, share)];
        runs.push(run);
      }
      run.push(point);
    } else if (run !== null) {
      run.push(edge(share, (index - 1) / steps));
      run = null;
    }
  }
  return runs;
}

export function teethAlong(
  from: Vector,
  to: Vector,
  toward: Vector,
  pitch: number,
  share: number,
  depth: number,
): Tooth[] {
  const span = subtract(to, from);
  const length = Math.sqrt(dot(span, span));
  if (length < 1e-9) {
    return [];
  }
  const run = scaled(span, 1 / length);
  const inward = normalize(subtract(toward, scaled(run, dot(toward, run))));
  const count = Math.max(1, Math.round(length / pitch));
  const step = length / count;
  const half = (step * share) / 2;
  const reach = depth * Math.min(1, step / pitch);
  const teeth: Tooth[] = [];
  for (let index = 0; index < count; index++) {
    const foot = sum(from, scaled(run, step * (index + 0.5)));
    teeth.push({
      left: sum(foot, scaled(run, -half)),
      right: sum(foot, scaled(run, half)),
      tip: sum(foot, scaled(inward, reach)),
    });
  }
  return teeth;
}

export function rimmed(tooth: Tooth, margin: number): Tooth {
  const { left, right, tip } = tooth;
  const span = (first: Vector, second: Vector) => {
    const gap = subtract(second, first);
    return Math.sqrt(dot(gap, gap));
  };
  const base = span(left, right);
  const rise = span(right, tip);
  const fall = span(tip, left);
  const around = base + rise + fall;
  const normal = cross(subtract(right, left), subtract(tip, left));
  const inradius = Math.sqrt(dot(normal, normal)) / around;
  const heart = scaled(
    sum(sum(scaled(left, rise), scaled(right, fall)), scaled(tip, base)),
    1 / around,
  );
  const grown = (corner: Vector) =>
    sum(heart, scaled(subtract(corner, heart), 1 + margin / inradius));
  return { left: grown(left), right: grown(right), tip: grown(tip) };
}

export function landfall(
  points: Vector[],
  from: number,
  to: number,
  steps: number,
  dry: (at: Vector) => boolean,
): Vector {
  const reached = (share: number) => {
    const at = slerp(points[from], points[to], share);
    return nearest(points, at) === to && dry(at);
  };
  for (let step = 1; step <= steps; step++) {
    if (!reached(step / steps)) {
      continue;
    }
    let short = (step - 1) / steps;
    let ashore = step / steps;
    for (let round = 0; round < 12; round++) {
      const middle = (short + ashore) / 2;
      if (reached(middle)) {
        ashore = middle;
      } else {
        short = middle;
      }
    }
    return slerp(points[from], points[to], ashore);
  }
  return points[to];
}

export function barAcross(at: Vector, heading: Vector, length: number): [Vector, Vector] {
  const sideways = normalize(cross(at, heading));
  return [sum(at, scaled(sideways, -length / 2)), sum(at, scaled(sideways, length / 2))];
}

export function nearest(points: Vector[], direction: Vector): number {
  let best = 0;
  for (let index = 1; index < points.length; index++) {
    if (dot(points[index], direction) > dot(points[best], direction)) {
      best = index;
    }
  }
  return best;
}

function groupsOf(members: number[], across: number[][]): number[][] {
  const loose = new Set(members);
  const groups: number[][] = [];
  for (const start of members) {
    if (!loose.delete(start)) {
      continue;
    }
    const group = [start];
    for (let index = 0; index < group.length; index++) {
      for (const other of across[group[index]]) {
        if (loose.delete(other)) {
          group.push(other);
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

export function heartOf(members: number[], points: Vector[], across: number[][]): number {
  const largest = groupsOf(members, across).reduce((best, group) =>
    group.length > best.length ? group : best,
  );
  const middle = largest.reduce((total, cell) => sum(total, points[cell]), { x: 0, y: 0, z: 0 });
  return largest.reduce((best, cell) =>
    dot(points[cell], middle) > dot(points[best], middle) ? cell : best,
  );
}

function solidAngle(first: Vector, second: Vector, third: Vector): number {
  const triple = Math.abs(dot(first, cross(second, third)));
  const spread = 1 + dot(first, second) + dot(second, third) + dot(third, first);
  return 2 * Math.atan2(triple, spread);
}

export function areaOf(cell: Cell): number {
  return cell.corners.reduce((area, corner, index) => {
    const next = cell.corners[(index + 1) % cell.corners.length];
    return area + solidAngle(cell.center, corner, next);
  }, 0);
}
