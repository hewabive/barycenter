import { cross, dot, hullFaces, normalize, subtract, type Vector } from "@barycenter/sim";

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

function midpoint(left: Vector, right: Vector): Vector {
  return normalize(sum(left, right));
}

export function slerp(from: Vector, to: Vector, share: number): Vector {
  const angle = Math.acos(Math.max(-1, Math.min(1, dot(from, to))));
  const sine = Math.sin(angle);
  if (sine < 1e-6) {
    return from;
  }
  return sum(
    scaled(from, Math.sin((1 - share) * angle) / sine),
    scaled(to, Math.sin(share * angle) / sine),
  );
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

function circumcenter(first: Vector, second: Vector, third: Vector): Vector {
  const normal = normalize(cross(subtract(second, first), subtract(third, first)));
  return dot(normal, first) < 0 ? scaled(normal, -1) : normal;
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

function subdivide(
  first: Vector,
  second: Vector,
  third: Vector,
  depth: number,
  output: Vector[],
): void {
  if (depth === 0) {
    output.push(first, second, third);
    return;
  }
  const a = midpoint(first, second);
  const b = midpoint(second, third);
  const c = midpoint(third, first);
  subdivide(first, a, c, depth - 1, output);
  subdivide(a, second, b, depth - 1, output);
  subdivide(c, b, third, depth - 1, output);
  subdivide(a, b, c, depth - 1, output);
}

export function triangulate(cell: Cell, depth: number): Vector[] {
  const triangles: Vector[] = [];
  cell.corners.forEach((corner, index) => {
    const next = cell.corners[(index + 1) % cell.corners.length];
    subdivide(cell.center, corner, next, depth, triangles);
  });
  return triangles;
}

export function outlineOfCell(cell: Cell, stepsPerSide: number, radius: number): Vector[] {
  const loop: Vector[] = [];
  cell.corners.forEach((corner, index) => {
    const next = cell.corners[(index + 1) % cell.corners.length];
    loop.push(...arc(corner, next, stepsPerSide, radius, 0).slice(0, -1));
  });
  return loop;
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
