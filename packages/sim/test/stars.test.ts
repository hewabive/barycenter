import assert from "node:assert/strict";
import { test } from "node:test";
import { bulgeOf, flatOf } from "../src/interior.ts";
import {
  DAY,
  GIGAYEAR,
  GRAVITY,
  lifeOf,
  SUN_MASS,
  SUN_RADIUS,
  starborn,
  starDawn,
  starStages,
} from "../src/physics.ts";
import { withinOf } from "../src/stars.ts";
import { sketchSystem } from "../src/system.ts";
import { STAR_TRACKS } from "../src/tracks.ts";

const near = (value: number, wanted: number, share: number) =>
  Math.abs(value / wanted - 1) <= share;
const between = (value: number, least: number, most: number) => value >= least && value <= most;

function aged(suns: number, age: number) {
  const within = withinOf({ ...lifeOf(suns * SUN_MASS, age), age });
  assert.ok(within !== null, `${suns} at ${age / GIGAYEAR}`);
  return within;
}

function swollen(suns: number, from: number, to: number, radius: number) {
  let [low, high] = [from, to];
  for (let halving = 0; halving < 60; halving++) {
    const middle = (low + high) / 2;
    if (lifeOf(suns * SUN_MASS, middle).radius < radius) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return aged(suns, high);
}

test("the Sun has its stirred shell, its centre and its moment of inertia", () => {
  const sun = aged(1, 4.57 * GIGAYEAR);
  assert.ok(near(sun.floor, 0.7133, 0.02), `floor ${sun.floor}`);
  assert.ok(near(sun.wrap, 0.02415, 0.15), `wrap ${sun.wrap}`);
  assert.ok(near(sun.heat, 1.5696e7, 0.03), `heat ${sun.heat}`);
  assert.ok(near(sun.dense, 1.527e5, 0.12), `dense ${sun.dense}`);
  assert.ok(between(sun.turning, 0.065, 0.074), `turning ${sun.turning}`);
  assert.ok(near(sun.love / 2, 0.0134, 0.25), `love ${sun.love}`);
  assert.equal(sun.spent, 0);
  assert.ok(sun.core < 0.01);
});

test("the turning Sun bulges and flattens as measured and as its Love number says", () => {
  const life = lifeOf(SUN_MASS, 4.57 * GIGAYEAR);
  const sun = {
    ...life,
    iron: 0,
    rock: 0,
    ice: 0,
    gas: 1,
    age: 4.57 * GIGAYEAR,
    day: 25.38 * DAY,
  };
  const turn = (((2 * Math.PI) / sun.day) ** 2 * sun.radius ** 3) / (GRAVITY * sun.mass);
  assert.ok(near(bulgeOf(sun) / sun.radius ** 2, 2.18e-7, 0.1), `J2 ${bulgeOf(sun)}`);
  const love = withinOf(sun)?.love ?? 0;
  assert.ok(near(flatOf(sun), ((1 + love) / 2) * turn, 1e-9), `flat ${flatOf(sun)}`);
  assert.ok(flatOf(sun) < 0.53 * turn);
});

test("a light star is stirred all the way down and a heavy one only at its heart", () => {
  const light = aged(0.2, 5 * GIGAYEAR);
  assert.deepEqual([light.wrap, light.floor, light.core], [1, 0, 0]);
  assert.ok(near(light.turning, 0.2046, 0.06), `turning ${light.turning}`);
  assert.ok(near(light.love / 2, 0.1433, 0.12), `love ${light.love}`);
  assert.ok(aged(0.3, 5 * GIGAYEAR).floor < 0.01);
  const half = aged(0.5, 5 * GIGAYEAR);
  assert.ok(between(half.floor, 0.5, 0.7) && between(half.wrap, 0.15, 0.35), `half ${half.floor}`);
  assert.ok(aged(0.4, 5 * GIGAYEAR).floor > 0.3, "a still core above 0.35 Suns");
  assert.ok(aged(1, 4.57 * GIGAYEAR).core < 0.01 && aged(1.5, GIGAYEAR).core > 0.05);
  let last = 0;
  for (const suns of [2, 5, 10, 20, 40]) {
    const star = aged(suns, 0.5 * starStages(suns * SUN_MASS)[0]);
    assert.ok(star.wrap < 1e-3 && star.floor > 0.99, `${suns} wrap ${star.wrap}`);
    assert.ok(star.core > last && star.core < 0.6, `${suns} core ${star.core}`);
    assert.ok(between(star.turning, 0.03, 0.065), `${suns} turning ${star.turning}`);
    last = star.core;
  }
});

test("a star not yet settled is stirred through and settles into its layers", () => {
  const dawn = starDawn(SUN_MASS);
  const young = aged(1, 1e-3 * GIGAYEAR);
  assert.ok(young.wrap > 0.95 && young.floor < 0.1, `wrap ${young.wrap}`);
  assert.ok(near(young.turning, 0.4469 ** 2, 0.03), `turning ${young.turning}`);
  assert.ok(near(young.love / 2, 10 ** -0.8631, 0.06), `love ${young.love}`);
  const older = aged(1, 1e-2 * GIGAYEAR);
  assert.ok(near(older.turning, 0.4227 ** 2, 0.05), `turning ${older.turning}`);
  assert.ok(older.heat > young.heat && older.dense > young.dense);
  const [before, after] = [aged(1, dawn * (1 - 1e-6)), aged(1, dawn * (1 + 1e-6))];
  assert.ok(near(before.turning, after.turning, 0.02), `${before.turning} ${after.turning}`);
  assert.ok(Math.abs(before.floor - after.floor) < 0.01);
});

test("a giant is a spent core under a deep stirred shell, as published models have it", () => {
  const [main, turned, climbed, relit, last] = starStages(SUN_MASS);
  const [before, after] = [aged(1, main * (1 - 1e-9)), aged(1, main * (1 + 1e-9))];
  assert.ok(near(before.turning, after.turning, 0.01) && near(before.wrap, after.wrap, 0.02));
  const ten = swollen(1, turned, climbed, 10 * SUN_RADIUS);
  assert.ok(near(ten.turning, 0.3362 ** 2, 0.1), `turning ${ten.turning}`);
  assert.ok(near(ten.love / 2, 10 ** -1.33, 0.2), `love ${ten.love}`);
  assert.ok(ten.wrap > 0.6 && ten.floor < 0.1 && between(ten.spent, 0.2, 0.3), `wrap ${ten.wrap}`);
  const tip = aged(1, climbed * (1 - 1e-6));
  assert.ok(near(tip.turning, 0.2498 ** 2, 0.1), `turning ${tip.turning}`);
  assert.ok(near(tip.wrap + tip.spent, 1, 0.02) && tip.floor < 0.01, `tip ${tip.wrap}`);
  const burning = aged(1, (climbed + relit) / 2);
  assert.ok(burning.heat > 1e8 && between(burning.spent, 0.45, 0.52), `heat ${burning.heat}`);
  assert.ok(burning.core > 0.02, "helium burns in a stirred core");
  const late = aged(1, relit + 0.9 * (last - relit));
  assert.ok(late.wrap > 0.4 && late.floor < 0.02 && late.spent > burning.spent);
  const heavy = aged(10, 0.5 * (starStages(10 * SUN_MASS)[3] + starStages(10 * SUN_MASS)[4]));
  assert.ok(heavy.wrap > 0.5 && heavy.floor < 0.05, `a red supergiant ${heavy.wrap}`);
});

test("what a star leaves is packed matter with its own moment of inertia", () => {
  const dwarf = aged(1, starStages(SUN_MASS)[4] + GIGAYEAR);
  assert.deepEqual([dwarf.wrap, dwarf.floor, dwarf.spent, dwarf.heat], [0, 1, 1, 0]);
  assert.ok(between(dwarf.turning, 0.4043 ** 2, 0.19), `turning ${dwarf.turning}`);
  assert.ok(between(dwarf.love / 2, 10 ** -1.075, 0.12), `love ${dwarf.love}`);
  const heavy = aged(6, starStages(6 * SUN_MASS)[4] + GIGAYEAR);
  assert.ok(heavy.turning < dwarf.turning && heavy.dense > dwarf.dense);
  const pulsar = aged(10, starStages(10 * SUN_MASS)[4] + GIGAYEAR);
  const tight = 1.3084 / 11.5;
  assert.ok(near(pulsar.turning, 0.237 * (1 + 4.2 * tight + 90 * tight ** 4), 0.01));
  assert.equal(pulsar.love, 2 * 0.0763);
  const hole = lifeOf(30 * SUN_MASS, starStages(30 * SUN_MASS)[4] + GIGAYEAR);
  assert.equal(withinOf({ ...hole, age: GIGAYEAR }), null);
});

test("the table of tracks is in order and every star of a made system can be read from it", () => {
  const { stars, embers } = STAR_TRACKS;
  const rising = (keys: number[]) =>
    keys.every((key, index) => index === 0 || key >= keys[index - 1]);
  assert.ok(rising(stars.map(({ suns }) => suns)) && rising(embers.map(([mass]) => mass)));
  for (const { suns, young, prime, late } of stars) {
    assert.ok(rising(young.map(([time]) => time)) && young[young.length - 1][0] === 0, `${suns}`);
    assert.ok(rising(prime.map(([time]) => time)) && prime[prime.length - 1][0] === 10000);
    assert.ok(late.length === 0 || late.length === 3, `${suns} late`);
    assert.ok(late.every((group) => group.length > 0 && rising(group.map(([time]) => time))));
  }
  let read = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const { bodies } = sketchSystem(seed, { settled: seed % 2 === 0, star: null });
    for (const { name, physics } of bodies.filter((body) => starborn(body.physics))) {
      const within = withinOf(physics);
      if (within === null) {
        assert.ok(physics.radius < 1e5, `${seed} ${name} is no black hole`);
        continue;
      }
      read += 1;
      const { core, wrap, floor, spent, turning, love, heat, dense } = within;
      const label = `${seed} ${name} ${JSON.stringify(within)}`;
      assert.ok(
        [core, wrap, floor, spent].every((share) => between(share, 0, 1)),
        label,
      );
      assert.ok(between(turning, 1e-3, 0.45) && between(love, 1e-5, 0.4), label);
      assert.ok(heat >= 0 && dense >= 0 && Number.isFinite(heat + dense), label);
      assert.ok(flatOf(physics) >= 0 && bulgeOf(physics) >= 0, label);
    }
  }
  assert.ok(read > 80, `read ${read}`);
});
