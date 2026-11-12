import assert from "node:assert/strict";
import { test } from "node:test";
import { angleBetween, createWorld, dot, outlineOf, subtract, type Vector } from "@barycenter/sim";
import {
  arc,
  areaOf,
  barAcross,
  buildCells,
  heartOf,
  landfall,
  nearest,
  neighborsAcross,
  outlineOfCell,
  rimmed,
  teethAlong,
  triangulate,
} from "../src/geometry.ts";

function pointsOf(seed: number): { points: Vector[]; land: number; pairs: Set<string> } {
  const outline = outlineOf(createWorld({ seed }).map);
  const points = [...outline.cells.map((cell) => cell.position), ...outline.oceans];
  const pairs = new Set(
    outline.joints.map((joint) => `${Math.min(joint.a, joint.b)}-${Math.max(joint.a, joint.b)}`),
  );
  return { points, land: outline.cells.length, pairs };
}

function lengthOf(vector: Vector): number {
  return Math.sqrt(dot(vector, vector));
}

test("the cells of a world tile the whole sphere", () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const { points } = pointsOf(seed);
    const cells = buildCells(points);
    assert.equal(cells.length, points.length);
    const total = cells.reduce((area, cell) => area + areaOf(cell), 0);
    assert.ok(Math.abs(total - 4 * Math.PI) < 1e-6, `seed ${seed}: ${total}`);
    for (const cell of cells) {
      assert.ok(cell.corners.length >= 3);
      for (const corner of cell.corners) {
        assert.ok(Math.abs(lengthOf(corner) - 1) < 1e-9);
      }
    }
  }
});

test("every point of a cell is closest to that cell's center", () => {
  const { points } = pointsOf(2);
  const cells = buildCells(points);
  cells.forEach((cell, index) => {
    for (const corner of triangulate(cell, 1)) {
      const inward = {
        x: corner.x * 0.95 + cell.center.x * 0.05,
        y: corner.y * 0.95 + cell.center.y * 0.05,
        z: corner.z * 0.95 + cell.center.z * 0.05,
      };
      assert.equal(nearest(points, inward), index);
    }
  });
});

test("every side of a cell has one neighbor, and land neighbors are joined", () => {
  const { points, land, pairs } = pointsOf(3);
  const cells = buildCells(points);
  const across = neighborsAcross(cells);
  let shared = 0;
  across.forEach((row, cell) => {
    assert.equal(row.length, cells[cell].corners.length);
    for (const other of row) {
      assert.ok(other >= 0 && other !== cell);
      assert.ok(across[other].includes(cell));
      if (cell < other && other < land) {
        shared += 1;
        assert.ok(pairs.has(`${cell}-${other}`), `${cell}-${other}`);
      }
    }
  });
  assert.ok(shared > 100);
});

test("triangles subdivide a cell without leaving the sphere", () => {
  const cell = buildCells(pointsOf(1).points)[0];
  const coarse = triangulate(cell, 0);
  const fine = triangulate(cell, 2);
  assert.equal(coarse.length, cell.corners.length * 3);
  assert.equal(fine.length, coarse.length * 16);
  for (const vertex of fine) {
    assert.ok(Math.abs(lengthOf(vertex) - 1) < 1e-9);
  }
});

test("an arc runs between its ends and rises in the middle", () => {
  const from = { x: 1, y: 0, z: 0 };
  const to = { x: 0, y: 1, z: 0 };
  const points = arc(from, to, 8, 1, 0.1);
  assert.equal(points.length, 9);
  assert.ok(Math.abs(lengthOf(points[0]) - 1) < 1e-9);
  assert.ok(Math.abs(lengthOf(points[4]) - 1.1) < 1e-9);
  assert.ok(Math.abs(points[8].y - 1) < 1e-9);
});

test("a cell outline is a closed loop on the given radius", () => {
  const cell = buildCells(pointsOf(1).points)[0];
  const loop = outlineOfCell(cell, 4, 1.01);
  assert.equal(loop.length, cell.corners.length * 4);
  for (const point of loop) {
    assert.ok(Math.abs(lengthOf(point) - 1.01) < 1e-9);
  }
});

test("the heart of a holding is one of its cells, in its largest group", () => {
  const outline = outlineOf(createWorld({ seed: 4 }).map);
  const points = [...outline.cells.map((cell) => cell.position), ...outline.oceans];
  const across = neighborsAcross(buildCells(points));
  const land = outline.cells.length;
  const within = (region: number, cell: number) =>
    across[cell].filter((other) => other < land && outline.cells[other].region === region);
  for (const region of outline.regions) {
    assert.equal(heartOf(region.cells, points, across), region.center);
    for (const cell of region.cells) {
      assert.equal(heartOf([cell], points, across), cell);
    }
    const far = (from: number) =>
      region.cells.reduce((best, cell) =>
        dot(points[cell], points[from]) < dot(points[best], points[from]) ? cell : best,
      );
    const lone = far(region.center);
    const group = [far(lone)];
    group.push(...within(region.id, group[0]).filter((cell) => cell !== lone));
    if (group.length < 2 || across[lone].some((other) => group.includes(other))) {
      continue;
    }
    assert.ok(group.includes(heartOf([lone, ...group], points, across)));
    assert.ok(group.includes(heartOf([...group, lone], points, across)));
  }
});

test("teeth stand on a side and point into the cell beyond it", () => {
  const { points, land } = pointsOf(1);
  const cells = buildCells(points);
  const across = neighborsAcross(cells);
  const pitch = 0.03;
  const depth = 0.02;
  let seen = 0;
  for (let cell = 0; cell < land; cell++) {
    across[cell].forEach((other, side) => {
      const corners = cells[cell].corners;
      const from = corners[side];
      const to = corners[(side + 1) % corners.length];
      const length = lengthOf(subtract(to, from));
      if (other < 0 || length < 1e-6) {
        return;
      }
      const toward = subtract(points[other], points[cell]);
      const teeth = teethAlong(from, to, toward, pitch, 0.7, depth);
      assert.equal(teeth.length, Math.max(1, Math.round(length / pitch)));
      for (const tooth of teeth) {
        const along =
          lengthOf(subtract(tooth.left, from)) +
          lengthOf(subtract(tooth.right, tooth.left)) +
          lengthOf(subtract(to, tooth.right));
        assert.ok(Math.abs(along - length) < 1e-9);
        assert.ok(dot(subtract(tooth.tip, tooth.left), toward) > 0);
        const foot = { x: 0, y: 0, z: 0 };
        for (const axis of ["x", "y", "z"] as const) {
          foot[axis] = (tooth.left[axis] + tooth.right[axis]) / 2;
        }
        const reach = lengthOf(subtract(tooth.tip, foot));
        assert.ok(reach <= depth + 1e-12 && reach > 0);
        assert.ok(Math.abs(dot(subtract(tooth.tip, foot), subtract(to, from))) < 1e-12);
        seen += 1;
      }
    });
  }
  assert.ok(seen > land);
});

test("a rim keeps the same distance from every side of a tooth", () => {
  const tooth = {
    left: { x: -1, y: 0, z: 1 },
    right: { x: 1, y: 0, z: 1 },
    tip: { x: 0, y: 3, z: 1 },
  };
  const rim = rimmed(tooth, 0.25);
  assert.ok(Math.abs(rim.left.y + 0.25) < 1e-12 && Math.abs(rim.right.y + 0.25) < 1e-12);
  assert.ok(Math.abs(rim.left.z - 1) < 1e-12 && Math.abs(rim.tip.x) < 1e-12);
  const slope = Math.hypot(1, 3);
  const beyond = (point: Vector) => (3 * point.x + point.y - 3) / slope;
  assert.ok(Math.abs(beyond(rim.right) - 0.25) < 1e-12);
  assert.ok(Math.abs(beyond(rim.tip) - 0.25) < 1e-12);
});

test("a crossing makes landfall on the near edge of the far cell", () => {
  let crossings = 0;
  for (const seed of [1, 2, 3]) {
    const outline = outlineOf(createWorld({ seed }).map);
    const points = [...outline.cells.map((cell) => cell.position), ...outline.oceans];
    const across = neighborsAcross(buildCells(points));
    for (const { a, b } of outline.joints) {
      if (across[a].includes(b)) {
        continue;
      }
      crossings += 1;
      for (const [from, to] of [
        [a, b],
        [b, a],
      ]) {
        const shore = landfall(points, from, to, 24);
        assert.equal(nearest(points, shore), to);
        const sailed = angleBetween(points[from], shore);
        const left = angleBetween(shore, points[to]);
        assert.ok(Math.abs(sailed + left - angleBetween(points[from], points[to])) < 1e-9);
        const back = arc(shore, points[from], 100, 1, 0)[1];
        assert.notEqual(nearest(points, back), to);
      }
    }
  }
  assert.ok(crossings > 0);
});

test("a bar lies across a heading with its middle on the given point", () => {
  const at = { x: 0, y: 0, z: 1 };
  const [left, right] = barAcross(at, { x: 0.3, y: 0, z: -0.2 }, 0.5);
  assert.ok(Math.abs(lengthOf(subtract(right, left)) - 0.5) < 1e-12);
  assert.ok(Math.abs(left.x) < 1e-12 && Math.abs(right.x) < 1e-12);
  assert.ok(Math.abs(left.y + right.y) < 1e-12);
  assert.ok(Math.abs(left.z - 1) < 1e-12 && Math.abs(right.z - 1) < 1e-12);
});
