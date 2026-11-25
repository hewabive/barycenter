import assert from "node:assert/strict";
import { test } from "node:test";
import { limitOf, lobeOf, loneOf, pairOf } from "../src/pairs.ts";
import {
  classOf,
  DAY,
  GIGAYEAR,
  GRAVITY,
  lifeOf,
  SUN_MASS,
  SUN_RADIUS,
  starborn,
  starLife,
  starSpan,
} from "../src/physics.ts";
import { surveySystem } from "../src/system.ts";

const pair = (first: number, second: number, orbit: number, stretch = 0) =>
  pairOf(
    { born: first * SUN_MASS, dim: null },
    { born: second * SUN_MASS, dim: null },
    orbit * SUN_RADIUS,
    stretch,
    null,
  );
const yearOf = (orbit: number, mass: number) =>
  2 * Math.PI * Math.sqrt(orbit ** 3 / (GRAVITY * mass));
const weigh = (twins: ReturnType<typeof pair>, age: number) =>
  twins.at(age).stars.reduce((sum, star) => sum + (star?.mass ?? 0), 0);

test("the lobe of a star beside an equal one is 0.38 of the way between them", () => {
  assert.ok(Math.abs(lobeOf(1) - 0.379) < 1e-3);
  assert.ok(lobeOf(0.1) < lobeOf(1) && lobeOf(1) < lobeOf(10));
  assert.ok(Math.abs(lobeOf(0.2) + lobeOf(5) - 0.78) < 0.02);
});

test("a giant may be heavier beside its companion the wider it is, and a hot star four times", () => {
  const sun = SUN_MASS;
  const span = starSpan(sun);
  const at = (age: number) => {
    const life = lifeOf(sun, age);
    return { ...life, seed: sun, clock: age, ending: null, burst: false, lobe: 0 };
  };
  const base = limitOf(at(1.08 * span));
  const tip = limitOf(at(starLife(sun) * (1 - 1e-6)));
  assert.ok(base >= 1 && base < 1.5, `${base} at the foot of the giant branch`);
  assert.ok(tip > 9 && tip <= 10, `${tip} at its widest`);
  const hot = 5 * SUN_MASS;
  const life = lifeOf(hot, 0.5 * starSpan(hot));
  const blue = { ...life, seed: hot, clock: 0.5 * starSpan(hot), ending: null, burst: false };
  assert.equal(limitOf({ ...blue, lobe: 0 }), 4);
});

test("twins on a twelve-day orbit pass gas and end as a helium dwarf beside a heavier star", () => {
  const twins = pair(1.1, 1.055, 29.13, 0.011);
  const [pass] = twins.turns;
  assert.equal(pass.kind, "pass");
  assert.equal(pass.seat, 0);
  const before = twins.at(pass.from * (1 - 1e-9));
  assert.ok(Math.abs(before.stars[0].lobe - 1) < 1e-3 && before.stretch === 0);
  const during = twins.at((pass.from + pass.until) / 2);
  assert.ok(during.flow !== null && during.flow.from === 0 && during.flow.rate > 0);
  assert.ok(Math.abs(during.stars[0].lobe - 1) < 1e-6);
  const after = twins.at(pass.until * (1 + 1e-9));
  const [dwarf, grown] = after.stars;
  assert.ok(grown !== null);
  assert.equal(dwarf.ending, "dwarf");
  assert.ok(dwarf.mass > 0.28 * SUN_MASS && dwarf.mass < 0.36 * SUN_MASS);
  assert.ok(Math.abs(pass.kept / pass.mass - 0.5) < 1e-6);
  assert.ok(Math.abs(grown.mass - 1.055 * SUN_MASS - pass.kept) < 1e-6 * SUN_MASS);
  assert.ok(
    Math.abs(weigh(twins, pass.until * (1 + 1e-9)) - (2.155 * SUN_MASS - pass.kept)) <
      1e-3 * SUN_MASS,
  );
  const days = yearOf(after.orbit, dwarf.mass + grown.mass) / DAY;
  const fit = (days / 1.2e5) ** (1 / 4.5) + 0.12;
  assert.ok(days > 80 && days < 150, `${days} days`);
  assert.ok(
    Math.abs(dwarf.mass / SUN_MASS - fit) < 0.03,
    `${dwarf.mass / SUN_MASS} against ${fit}`,
  );
  assert.ok(
    grown.clock < starSpan(grown.seed),
    "the star that took the gas is on the main sequence",
  );
});

test("no mass appears: the two only pass it or lose it", () => {
  for (const [first, second, orbit] of [
    [1.1, 1.055, 29],
    [1.1, 0.3, 30],
    [1.5, 0.3, 150],
    [1.5, 0.3, 400],
    [3, 2.8, 300],
    [12, 9, 600],
  ]) {
    const twins = pair(first, second, orbit, 0.1);
    let before = (first + second) * SUN_MASS;
    for (let step = 1; step <= 400; step++) {
      const mass = weigh(
        twins,
        (step / 400) * Math.min(14 * GIGAYEAR, 1.3 * starLife(second * SUN_MASS)),
      );
      assert.ok(mass <= before * (1 + 1e-9), `${first} and ${second} at ${orbit}: step ${step}`);
      before = mass;
    }
  }
});

test("a light companion goes through the envelope of a wide giant and comes out near", () => {
  const twins = pair(1.5, 0.3, 150);
  const [shed] = twins.turns;
  assert.equal(shed.kind, "shed");
  const after = twins.at(shed.from * (1 + 1e-9));
  const [dwarf, small] = after.stars;
  assert.ok(small !== null);
  assert.equal(dwarf.ending, "dwarf");
  assert.ok(Math.abs(dwarf.mass + shed.mass - 1.5 * SUN_MASS) < 1e-6 * SUN_MASS);
  assert.equal(small.mass, 0.3 * SUN_MASS);
  const days = yearOf(after.orbit, dwarf.mass + small.mass) / DAY;
  assert.ok(days > 0.1 && days < 3, `${days} days`);
  assert.ok(small.lobe < 1);
});

test("a light companion close to a small giant merges with it, and the giant turns fast", () => {
  const twins = pair(1.1, 0.3, 30);
  const [merge] = twins.turns;
  assert.equal(merge.kind, "merge");
  assert.ok(merge.spin > 0);
  const after = twins.at(merge.from * (1 + 1e-9));
  assert.equal(after.stars[1], null);
  assert.ok(Math.abs(after.stars[0].mass / (1.4 * SUN_MASS) - 0.97) < 1e-6);
  assert.equal(after.stars[0].ending, null);
  const end = twins.at(1.5 * starLife(1.1 * SUN_MASS));
  assert.equal(end.stars[0].ending, "dwarf");
});

test("two white dwarfs an hour apart spiral together within the age of the Galaxy", () => {
  const twins = pair(1.1, 1.055, 29.13, 0.011);
  const merge = twins.turns.find((turn) => turn.kind === "merge");
  const shed = twins.turns.find((turn) => turn.kind === "shed");
  assert.ok(merge !== undefined && shed !== undefined && merge.from > shed.from);
  const close = twins.at(shed.from * (1 + 1e-9));
  const later = twins.at((shed.from + merge.from) / 2);
  assert.ok(later.orbit < close.orbit && later.orbit > 0.5 * close.orbit);
  const one = twins.at(merge.from * (1 + 1e-9)).stars;
  assert.equal(one[1], null);
  assert.equal(one[0].ending, "dwarf");
  assert.ok(Math.abs(one[0].mass - weigh(twins, merge.from * (1 - 1e-9))) < 1e-6 * SUN_MASS);
});

test("a star that swells beside a group is bared where its lobe ends", () => {
  const free = loneOf(SUN_MASS, null);
  assert.equal(free.turns.length, 0);
  const held = loneOf(SUN_MASS, 50 * SUN_RADIUS);
  const [shed] = held.turns;
  assert.equal(shed.kind, "shed");
  assert.ok(shed.from < starLife(SUN_MASS));
  const before = held.at(shed.from * (1 - 1e-9));
  const after = held.at(shed.from * (1 + 1e-9));
  assert.ok(Math.abs(before.radius / (50 * SUN_RADIUS) - 1) < 1e-3);
  assert.equal(after.ending, "dwarf");
  assert.ok(after.mass < 0.47 * SUN_MASS && after.mass > 0.3 * SUN_MASS);
  assert.ok(Math.abs(after.mass + shed.mass - SUN_MASS) < 1e-9 * SUN_MASS);
});

test("the stars of a system never gain mass together and none comes back", () => {
  const ages = [0.3, 1, 2, 4, 6, 8, 9, 10, 11, 12, 13];
  let passed = 0;
  for (let seed = 1; seed <= 80; seed++) {
    let before: { names: Set<string>; mass: number } | null = null;
    for (const age of ages) {
      const system = surveySystem(seed, { settled: false, star: null, age: age * GIGAYEAR });
      const stars = system.bodies.filter((body) => starborn(body.physics));
      const mass = stars.reduce((sum, body) => sum + body.physics.mass, 0);
      const names = new Set(stars.map((body) => body.name));
      const label = `seed ${seed} at ${age}`;
      for (const body of stars) {
        const host = body.parent === null ? null : system.bodies[body.parent].physics;
        const near = body.physics.orbit * (1 - body.physics.stretch);
        assert.ok(body.lobe <= 1 && body.lobe >= 0, `${label}, ${body.name}: ${body.lobe}`);
        assert.ok(
          host === null || !starborn(host) || near > body.physics.radius + host.radius,
          label,
        );
        passed += body.passages.length;
      }
      if (before !== null) {
        assert.ok(mass <= before.mass * (1 + 1e-4), `${label}: ${before.mass} to ${mass}`);
        assert.ok(
          [...names].every((name) => before?.names.has(name)),
          label,
        );
      }
      before = { names, mass };
    }
  }
  assert.ok(passed > 20, `${passed} passages met`);
});

test("the twins of seed 325 are both still there when the first has swollen", () => {
  const at = (age: number) =>
    surveySystem(325, { settled: false, star: null, age: age * GIGAYEAR }).bodies.filter((body) =>
      starborn(body.physics),
    );
  const young = at(1);
  assert.equal(young.length, 2);
  assert.ok(young.every((body) => body.physics.day === young[1].physics.year));
  const whole = young.reduce((sum, body) => sum + body.physics.mass, 0);
  const passing = at(7.75);
  const giver = passing.find((body) => body.passages.some(({ kind }) => kind === "gave"));
  const taker = passing.find((body) => body.passages.some(({ kind }) => kind === "took"));
  assert.ok(giver !== undefined && taker !== undefined);
  assert.equal(giver.lobe, 1);
  assert.ok(classOf(giver.physics).endsWith("giant"));
  assert.ok(giver.passages[0].until === null && giver.passages[0].rate > 0);
  assert.equal(giver.physics.day, giver.physics.year);
  assert.ok(taker.physics.mass > giver.physics.mass);
  const done = at(8);
  assert.deepEqual(done.map((body) => body.name).sort(), young.map((body) => body.name).sort());
  const left = done.reduce((sum, body) => sum + body.physics.mass, 0);
  const lost = whole - left;
  const gave = done.flatMap((body) => body.passages).find(({ kind }) => kind === "gave");
  assert.ok(gave !== undefined && Math.abs(lost / (0.5 * gave.mass) - 1) < 1e-3, `lost ${lost}`);
  assert.ok(done.some((body) => classOf(body.physics) === "white dwarf"));
});
