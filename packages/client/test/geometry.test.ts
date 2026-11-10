import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorld, dot, outlineOf, type Vector } from "@barycenter/sim";
import { arc, areaOf, buildCells, nearest, outlineOfCell, triangulate } from "../src/geometry.ts";

function pointsOf(seed: number): { points: Vector[]; land: number; pairs: Set<string> } {
  const outline = outlineOf(createWorld({ seed }).map);
  const points = [...outline.nodes.map((node) => node.position), ...outline.oceans];
  const pairs = new Set(outline.edges.map((edge) => `${edge.a}-${edge.b}`));
  return { points, land: outline.nodes.length, pairs };
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

test("land cells that share a border are joined by a land edge or a pass", () => {
  const { points, land, pairs } = pointsOf(3);
  const cells = buildCells(points);
  const keyOf = (corner: Vector) =>
    `${corner.x.toFixed(6)},${corner.y.toFixed(6)},${corner.z.toFixed(6)}`;
  const owners = new Map<string, number[]>();
  cells.forEach((cell, index) => {
    for (const corner of cell.corners) {
      owners.set(keyOf(corner), [...(owners.get(keyOf(corner)) ?? []), index]);
    }
  });
  let shared = 0;
  for (let a = 0; a < land; a++) {
    for (let b = a + 1; b < land; b++) {
      const common = cells[a].corners.filter((corner) => owners.get(keyOf(corner))?.includes(b));
      if (common.length >= 2) {
        shared += 1;
        assert.ok(pairs.has(`${a}-${b}`), `${a}-${b}`);
      }
    }
  }
  assert.ok(shared > 10);
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
