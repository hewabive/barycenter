import assert from "node:assert/strict";
import { test } from "node:test";
import { Vector3 } from "three";
import { funnelPath } from "../src/funnels.ts";

test("a stream leaves the edge of the disk and lands on the star along a line of its dipole", () => {
  for (const [hole, lean, toward] of [
    [1.5, 0.2, 0.4],
    [2, 0.05, 3],
    [4, 0.6, 5.5],
    [1.2, 1.2, 1],
  ]) {
    const path = funnelPath(hole, lean, toward);
    const [first, last] = [path[0], path[path.length - 1]];
    const axis = new Vector3(
      Math.sin(lean) * Math.cos(toward),
      Math.cos(lean),
      Math.sin(lean) * Math.sin(toward),
    );
    assert.ok(Math.abs(first.y) < 1e-9 && Math.abs(first.length() - hole) < 1e-9, "from the disk");
    assert.ok(Math.abs(first.angleTo(new Vector3(Math.cos(toward), 0, Math.sin(toward)))) < 1e-6);
    assert.ok(Math.abs(last.length() - 1) < 1e-9, `lands at ${last.length()}`);
    assert.ok(last.dot(axis) > 0 && last.y > 0, "on the side of the pole that leans to it");
    const shell = first.length() / Math.sin(first.angleTo(axis)) ** 2;
    path.forEach((point, at) => {
      const far = point.length();
      assert.ok(at === 0 || far < path[at - 1].length(), "ever nearer the star");
      assert.ok(Math.abs(far / Math.sin(point.angleTo(axis)) ** 2 / shell - 1) < 1e-9);
    });
  }
});
