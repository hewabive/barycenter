import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ASTRONOMICAL_UNIT,
  assemble,
  EARTH_MASS,
  evolve,
  GRAVITY,
  JUPITER_MASS,
  jacobiOf,
  ladderOf,
  type Member,
  SUN_MASS,
  SUN_RADIUS,
  surveySystem,
} from "../src/index.ts";

const UP = { x: 0, y: 0, z: 1 };

interface Circle {
  parent: number | null;
  mass: number;
  radius?: number;
  orbit?: number;
  turn?: number;
  lean?: number;
  bulge?: number;
  pole?: { x: number; y: number; z: number };
}

function arrange(circles: Circle[]) {
  const at = new Float64Array(3 * circles.length);
  const speed = new Float64Array(3 * circles.length);
  const members: Member[] = circles.map((circle) => ({
    parent: circle.parent,
    mass: circle.mass,
    radius: circle.radius ?? 1,
    orbit: circle.orbit ?? 0,
    bulge: circle.bulge ?? 0,
    pole: circle.pole ?? UP,
  }));
  circles.forEach((circle, id) => {
    if (circle.parent === null) {
      return;
    }
    const orbit = circle.orbit ?? 0;
    const turn = circle.turn ?? 0;
    const lean = circle.lean ?? 0;
    const swift = Math.sqrt((GRAVITY * (circles[circle.parent].mass + circle.mass)) / orbit);
    const reach = [
      orbit * Math.cos(turn),
      orbit * Math.sin(turn) * Math.cos(lean),
      orbit * Math.sin(turn) * Math.sin(lean),
    ];
    const pace = [
      -swift * Math.sin(turn),
      swift * Math.cos(turn) * Math.cos(lean),
      swift * Math.cos(turn) * Math.sin(lean),
    ];
    for (let axis = 0; axis < 3; axis++) {
      at[3 * id + axis] = at[3 * circle.parent + axis] + reach[axis];
      speed[3 * id + axis] = speed[3 * circle.parent + axis] + pace[axis];
    }
  });
  return assemble(members, at, speed);
}

test("the tree of a made system holds the orbits the generator gave its bodies", () => {
  for (let seed = 1; seed <= 40; seed++) {
    for (const settled of [true, false]) {
      const system = surveySystem(seed, { settled, star: null });
      const jacobi = jacobiOf(system);
      for (const body of system.bodies) {
        if (body.parent === null || body.shared !== null) {
          continue;
        }
        const label = `seed ${seed} ${body.name}`;
        assert.ok(Math.abs(jacobi.orbits[body.id] / body.physics.orbit - 1) < 1e-3, label);
        assert.ok(Math.abs(jacobi.stretches[body.id] - body.physics.stretch) < 1e-3, label);
        assert.ok(Math.abs(jacobi.years[body.id] / body.physics.year - 1) < 1e-3, label);
      }
    }
  }
});

test("four giant planets keep their orbits and their energy over a hundred thousand years", () => {
  const jacobi = arrange([
    { parent: null, mass: SUN_MASS, radius: SUN_RADIUS },
    { parent: 0, mass: JUPITER_MASS, orbit: 5.2 * ASTRONOMICAL_UNIT, turn: 0.3 },
    { parent: 0, mass: 5.683e26, orbit: 9.58 * ASTRONOMICAL_UNIT, turn: 5.5, lean: 0.04 },
    { parent: 0, mass: 8.681e25, orbit: 19.2 * ASTRONOMICAL_UNIT, turn: 2.4, lean: 0.01 },
    { parent: 0, mass: 1.024e26, orbit: 30.1 * ASTRONOMICAL_UNIT, turn: 4.5, lean: 0.03 },
  ]);
  const run = evolve(jacobi, { cut: 0, span: 1e4 * jacobi.years[1] });
  assert.equal(run.mishap, null);
  assert.ok(run.drift < 1e-5, `energy moved by ${run.drift}`);
  for (const track of run.tracks) {
    assert.ok(track.low > 0.99 && track.high < 1.01, `orbit ${track.body}`);
    assert.ok(track.stretch < 0.1, `stretch ${track.body}`);
  }
});

test("two planets meet inside the limit of Hill and keep apart outside it", () => {
  const share = 1e-5;
  const hill = Math.cbrt((2 * share) / 3);
  const fate = (gap: number) => {
    const wider = (1 + (gap * hill) / 2) / (1 - (gap * hill) / 2);
    const jacobi = arrange([
      { parent: null, mass: SUN_MASS },
      { parent: 0, mass: share * SUN_MASS, orbit: ASTRONOMICAL_UNIT },
      { parent: 0, mass: share * SUN_MASS, orbit: wider * ASTRONOMICAL_UNIT, turn: 2.5 },
    ]);
    return evolve(jacobi, { cut: 0, span: 2e4 * jacobi.years[1] }).mishap;
  };
  assert.equal(fate(2.8)?.kind, "encounter");
  assert.equal(fate(4.2), null);
});

test("the bulge of a planet on its side keeps a near moon in its equator and not a far one", () => {
  const lean = 1.48;
  const pole = { x: 0, y: -Math.sin(lean), z: Math.cos(lean) };
  const moon = (orbit: number, bulge: number) => {
    const jacobi = arrange([
      { parent: null, mass: SUN_MASS, radius: SUN_RADIUS },
      { parent: 0, mass: 15 * EARTH_MASS, radius: 2.556e7, orbit: ASTRONOMICAL_UNIT, bulge, pole },
      { parent: 1, mass: 1e21, radius: 5e5, orbit, lean },
    ]);
    return evolve(jacobi, { cut: 0, span: 6000 * jacobi.years[2] });
  };
  const bulge = 0.0035 * 2.556e7 ** 2;
  const held = moon(1.2e8, bulge);
  assert.equal(held.mishap, null);
  assert.ok(held.tracks[1].stretch < 0.005, `stretch ${held.tracks[1].stretch}`);
  assert.ok(held.tracks[1].lean < 0.01, `lean ${held.tracks[1].lean}`);
  const loose = moon(1.2e8, 0);
  assert.ok(loose.tracks[1].lean > 3 * held.tracks[1].lean, `lean ${loose.tracks[1].lean}`);
  assert.equal(moon(3.7e8, bulge).mishap?.kind, "collision");
});

test("a run leaves out the bodies quicker than its cut and those named absent", () => {
  const system = surveySystem(1, { settled: true, star: null });
  const jacobi = jacobiOf(system);
  const ladder = ladderOf(jacobi, 8);
  assert.ok(ladder.length > 2);
  assert.equal(ladder[0], Math.min(...Array.from(jacobi.years)));
  const slow = jacobi.years.reduce((sum, year) => sum + (year >= ladder[1] ? 1 : 0), 0);
  const run = evolve(jacobi, { cut: ladder[1], span: 10 * ladder[1] });
  assert.equal(run.bodies, slow);
  const planet = system.bodies.findIndex((body) => body.parent === 0);
  const fewer = evolve(jacobi, { cut: ladder[1], span: 10 * ladder[1], absent: new Set([planet]) });
  assert.ok(fewer.bodies < run.bodies);
  assert.ok(fewer.tracks.every((track) => track.body !== planet));
});
