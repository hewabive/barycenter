import assert from "node:assert/strict";
import { test } from "node:test";
import {
  angleBetween,
  createWorld,
  dot,
  elevationAt,
  type Outline,
  outlineOf,
  SHORE_STEP,
  subtract,
  type Vector,
} from "@barycenter/sim";
import {
  arc,
  areaOf,
  barAcross,
  buildCells,
  heartOf,
  landfall,
  nearest,
  neighborsAcross,
  patch,
  rimmed,
  rimOf,
  shoreline,
  teethAlong,
} from "../src/geometry.ts";

interface Ground {
  outline: Outline;
  points: Vector[];
  dry: (at: Vector) => boolean;
}

function groundOf(seed: number): Ground {
  const outline = outlineOf(createWorld({ seed }).map);
  const home = outline.system.bodies[outline.system.home];
  const sea = home.relief.sea ?? 0;
  return {
    outline,
    points: outline.cells.map((cell) => cell.position),
    dry: (at) => elevationAt(home.seed, home.relief, at) > sea,
  };
}

function lengthOf(vector: Vector): number {
  return Math.sqrt(dot(vector, vector));
}

test("the cells of a world tile the whole sphere", () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const { points } = groundOf(seed);
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
  const { points } = groundOf(2);
  const cells = buildCells(points);
  cells.forEach((cell, index) => {
    for (const corner of cell.corners) {
      const inward = {
        x: corner.x * 0.95 + cell.center.x * 0.05,
        y: corner.y * 0.95 + cell.center.y * 0.05,
        z: corner.z * 0.95 + cell.center.z * 0.05,
      };
      assert.equal(nearest(points, inward), index);
    }
  });
});

test("cells meet on dry ground exactly where the map joins them by land", () => {
  for (const seed of [1, 3]) {
    const { outline, points, dry } = groundOf(seed);
    const cells = buildCells(points);
    const across = neighborsAcross(cells);
    const joined = new Map(
      outline.joints.map((joint) => [`${joint.a}-${joint.b}`, joint.strait] as const),
    );
    let shared = 0;
    across.forEach((row, cell) => {
      assert.equal(row.length, cells[cell].corners.length);
      row.forEach((other, side) => {
        assert.ok(other >= 0 && other !== cell);
        assert.ok(across[other].includes(cell));
        if (other < cell) {
          return;
        }
        const corners = cells[cell].corners;
        const runs = shoreline(
          corners[side],
          corners[(side + 1) % corners.length],
          SHORE_STEP,
          (at) => angleBetween(at, points[cell]) <= outline.reach && dry(at),
        );
        assert.equal(runs.length > 0, joined.get(`${cell}-${other}`) === false, `${cell}-${other}`);
        for (const run of runs) {
          assert.ok(run.length >= 2);
          assert.ok(run.every(dry));
        }
        shared += runs.length > 0 ? 1 : 0;
      });
    });
    assert.ok(shared > 100);
    for (const joint of outline.joints) {
      assert.ok(across[joint.a].includes(joint.b));
    }
  }
});

test("a patch covers its cell up to the reach without leaving the sphere", () => {
  const { outline, points } = groundOf(1);
  for (const cell of buildCells(points).slice(0, 40)) {
    const rim = rimOf(cell, outline.reach, 0.05);
    const { vertices, shares } = patch(cell.center, rim, 0.085);
    assert.equal(vertices.length % 3, 0);
    assert.equal(shares.length, vertices.length);
    assert.ok(shares.includes(0) && shares.includes(1));
    vertices.forEach((vertex, index) => {
      assert.ok(Math.abs(lengthOf(vertex) - 1) < 1e-9);
      assert.ok(angleBetween(cell.center, vertex) <= outline.reach + 1e-9);
      assert.ok(shares[index] >= 0 && shares[index] <= 1);
      if (shares[index] === 0) {
        assert.ok(angleBetween(cell.center, vertex) < 1e-6);
      }
    });
    for (let first = 0; first < vertices.length; first += 3) {
      for (const [from, to] of [
        [0, 1],
        [1, 2],
        [2, 0],
      ]) {
        const edge = angleBetween(vertices[first + from], vertices[first + to]);
        assert.ok(edge < 0.12, `edge ${edge}`);
      }
    }
    const near = cell.corners.filter((corner) => angleBetween(cell.center, corner) < outline.reach);
    for (const corner of near) {
      assert.ok(rim.some((point) => angleBetween(point, corner) < 1e-6));
    }
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

test("the heart of a holding is one of its cells, in its largest group", () => {
  const { outline, points } = groundOf(4);
  const across = neighborsAcross(buildCells(points));
  const within = (region: number, cell: number) =>
    across[cell].filter((other) => outline.cells[other].region === region);
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
  const { points } = groundOf(1);
  const cells = buildCells(points);
  const across = neighborsAcross(cells);
  const pitch = 0.03;
  const depth = 0.02;
  let seen = 0;
  for (let cell = 0; cell < points.length; cell++) {
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
  assert.ok(seen > points.length);
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

test("a crossing makes landfall where the far cell first rises from the water", () => {
  let crossings = 0;
  for (const seed of [1, 2, 3]) {
    const { outline, points, dry } = groundOf(seed);
    for (const { a, b, strait } of outline.joints) {
      if (!strait) {
        continue;
      }
      crossings += 1;
      for (const [from, to] of [
        [a, b],
        [b, a],
      ]) {
        const ashore = (at: Vector) => nearest(points, at) === to && dry(at);
        const shore = landfall(points, from, to, 24, dry);
        assert.ok(ashore(shore));
        const sailed = angleBetween(points[from], shore);
        const left = angleBetween(shore, points[to]);
        assert.ok(Math.abs(sailed + left - angleBetween(points[from], points[to])) < 1e-9);
        assert.ok(!ashore(arc(shore, points[from], 100, 1, 0)[1]));
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
