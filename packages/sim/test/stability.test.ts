import assert from "node:assert/strict";
import { test } from "node:test";
import { GROWN_MOST } from "../src/disks.ts";
import { BROWN_LEAST, jacobiOf, standingsOf, starborn, surveySystem, trial } from "../src/index.ts";

const LEAN = [0.96, 2.269];

test("neighbors keep six Hill radii apart and moons stay well inside the hold of their host", () => {
  let planets = 0;
  let moons = 0;
  let level = 0;
  for (let seed = 1; seed <= 60; seed++) {
    for (const settled of [true, false]) {
      const system = surveySystem(seed, { settled, star: null });
      const jacobi = jacobiOf(system);
      const standings = standingsOf(system, jacobi);
      for (const body of system.bodies) {
        const { id, parent, physics } = body;
        if (parent === null || starborn(physics) || body.shared !== null) {
          continue;
        }
        const label = `seed ${seed} ${settled ? "with a home" : "with no home"}, ${body.name}`;
        const { gap, hold, lean, laplace } = standings[id];
        const host = system.bodies[parent];
        const led = system.bodies.some((other) => other.shared?.with === id);
        if (starborn(host.physics)) {
          const heavy = system.bodies.some(
            (other) => other.parent === parent && other.physics.mass >= BROWN_LEAST,
          );
          planets += 1;
          assert.ok(heavy || gap > 5.99, `${label}: ${gap}`);
          continue;
        }
        if (host.parent === null || !starborn(system.bodies[host.parent].physics)) {
          continue;
        }
        moons += 1;
        const sun = system.bodies[host.parent];
        const fed = sun.passages.some(({ kind }) => kind === "took");
        const growing = sun.physics.age < GROWN_MOST;
        const most = fed ? 0.491 : growing ? 0.361 / Math.cbrt(0.6) : 0.361;
        assert.ok(
          hold < most || (id === parent + 1 && parent === system.home),
          `${label}: ${hold}`,
        );
        assert.ok(led || gap > 4.99, `${label}: ${gap}`);
        if (laplace > 1.05) {
          level += lean < 1e-3 ? 1 : 0;
          assert.ok(fed || lean < LEAN[0] + 1e-3 || lean > LEAN[1] - 1e-3, `${label}: ${lean}`);
        }
        const sharers = system.bodies.filter((other) => other.shared?.with === id);
        assert.ok(sharers.length === 0 || hold < 0.07, `${label}: ${hold}`);
      }
    }
  }
  assert.ok(planets > 600 && moons > 600);
  assert.ok(level > 0.25 * moons, `${level} of ${moons}`);
});

test("made systems keep their bodies for three hundred turns when all pull on all", () => {
  for (let seed = 1; seed <= 3; seed++) {
    for (const settled of [true, false]) {
      const system = surveySystem(seed, { settled, star: null });
      const { losses } = trial(system, 300);
      assert.deepEqual(losses, [], `seed ${seed} ${settled ? "with a home" : "with no home"}`);
    }
  }
});
