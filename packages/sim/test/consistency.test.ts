import assert from "node:assert/strict";
import { test } from "node:test";
import { flawsOf, GIGAYEAR, sketchSystem } from "../src/index.ts";

test("the parts of every solid body agree with each other at every age", () => {
  for (let seed = 1; seed <= 40; seed++) {
    for (const plan of [
      { settled: true, star: null },
      { settled: false, star: null },
      { settled: false, star: null, age: 0.003 * GIGAYEAR },
      { settled: false, star: null, age: 0.03 * GIGAYEAR },
    ]) {
      const system = sketchSystem(seed, plan);
      const found = flawsOf(system).map(
        ({ body, flaw }) =>
          `seed ${seed} at ${plan.age ?? "its age"}, ${system.bodies[body].name}: ${flaw}`,
      );
      assert.deepEqual(found, []);
    }
  }
});
