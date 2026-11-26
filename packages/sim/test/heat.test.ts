import assert from "node:assert/strict";
import { test } from "node:test";
import { decayOf, forcedBy, warmthOf } from "../src/heat.ts";
import { radiusOf, turningOf, wrapped } from "../src/interior.ts";
import { DAY, EARTH_MASS, GIGAYEAR, JUPITER_MASS, SUN_MASS, starborn } from "../src/physics.ts";
import { sketchSystem } from "../src/system.ts";
import { pairedHeat, roundingOf, yieldOf } from "../src/tides.ts";
import type { Physics } from "../src/types.ts";

const AGE = 4.567 * GIGAYEAR;
const between = (value: number, least: number, most: number) => value >= least && value <= most;
const face = (physics: Physics) => 4 * Math.PI * physics.radius ** 2;

function made(mass: number, iron: number, ice: number, heat: number, age = AGE): Physics {
  const shares = { iron, rock: 1 - iron - ice, ice, gas: 0 };
  return {
    mass,
    radius: radiusOf(mass, shares),
    ...shares,
    heat,
    coldest: heat,
    hottest: heat,
    glow: 0,
    light: 0,
    air: 0,
    gases: [],
    life: 0,
    vigor: 0.5,
    age,
    orbit: 1.5e11,
    stretch: 0,
    year: 3e7,
    day: 1e5,
    disks: [],
  };
}

const held = (physics: Physics, orbit: number, stretch: number, days: number): Physics => ({
  ...physics,
  orbit,
  stretch,
  year: days * DAY,
  day: days * DAY,
});

function earth(age = AGE): Physics {
  const system = sketchSystem(1, { settled: true, star: null });
  const home = system.bodies[system.home ?? 0].physics;
  const shares = { iron: 0.325, rock: 0.675 - home.ice, ice: home.ice, gas: 0 };
  return { ...home, ...shares, mass: EARTH_MASS, radius: radiusOf(EARTH_MASS, shares), age };
}

const sun = { ...made(SUN_MASS, 0, 0, 5772), iron: 0, rock: 0, radius: 6.957e8 };
const jupiter = {
  ...made(JUPITER_MASS, 0.01, 0.02, 124),
  rock: 0.02,
  gas: 0.95,
  radius: 6.99e7,
  day: 0.4135 * DAY,
};
const io = held(made(8.93e22, 0.15, 0, 110), 4.217e8, 0.0041, 1.769);
const europa = held(made(4.8e22, 0.12, 0.075, 102), 6.711e8, 0.0094, 3.551);
const ganymede = held(made(1.4815e23, 0.06, 0.45, 110), 1.0704e9, 0.0013, 7.155);
const callisto = held(made(1.0757e23, 0, 0.5, 134), 1.8827e9, 0.0074, 16.69);

test("rock gives off the heat of the decay measured in it, and five times more when new", () => {
  assert.ok(between(decayOf(AGE), 4.0e-12, 5.6e-12), `now ${decayOf(AGE)}`);
  assert.ok(between(decayOf(0) / decayOf(AGE), 4, 6), `at birth ${decayOf(0)}`);
  assert.ok(decayOf(2 * AGE) < decayOf(AGE));
});

test("the Earth comes out with its heat, its rock, its core and its inner core", () => {
  const warmth = warmthOf(earth(), null);
  assert.ok(warmth?.core && warmth.mantle !== null);
  const { core } = warmth;
  const seam = 4 * Math.PI * 3.48e6 ** 2;
  assert.ok(warmth.plates);
  assert.ok(between(warmth.flow * face(earth()), 33e12, 47e12), `flow ${warmth.flow}`);
  assert.ok(between(warmth.mantle, 1573, 1673), `rock ${warmth.mantle}`);
  assert.ok(between(core.heat, 3910, 4290), `core ${core.heat}`);
  assert.ok(between(core.flux * seam, 5e12, 15e12), `from the core ${core.flux}`);
  assert.ok(between(core.frozen, 0.3, 0.4), `frozen ${core.frozen}`);
  assert.ok(core.stirring > 0);
  assert.equal(warmth.melt, 0);
});

test("the core of the Earth is stirred through its life and freezes late", () => {
  for (const age of [0.3, 1, 2, 3, 4]) {
    const core = warmthOf(earth(age * GIGAYEAR), null)?.core;
    assert.ok(core && core.stirring > 0, `stirred at ${age}`);
  }
  assert.equal(warmthOf(earth(3 * GIGAYEAR), null)?.core?.frozen, 0);
});

test("a dry world of that size keeps one lid, hotter rock and a still core", () => {
  const venus = warmthOf(made(0.815 * EARTH_MASS, 0.325, 0, 737), null);
  const wet = warmthOf(earth(), null);
  assert.ok(venus?.core && venus.mantle !== null && wet?.mantle);
  assert.equal(venus.plates, false);
  assert.ok(venus.mantle > wet.mantle + 200, `rock ${venus.mantle}`);
  assert.equal(venus.core.frozen, 0);
  assert.ok(venus.core.stirring < 0);
  assert.ok(venus.core.flux < venus.core.steep);
});

test("Mars and the Moon lost the stirring of their cores and give off the heat measured", () => {
  const mars = (age: number) => warmthOf(made(0.1074 * EARTH_MASS, 0.24, 0, 215, age), null);
  const moon = (age: number) => warmthOf(made(0.0123 * EARTH_MASS, 0.015, 0, 250, age), null);
  for (const [name, body, least, most] of [
    ["Mars", mars, 0.019, 0.025],
    ["the Moon", moon, 0.012, 0.021],
  ] as const) {
    const young = body(0.25 * GIGAYEAR);
    const old = body(AGE);
    assert.ok(young?.core && old?.core);
    assert.ok(young.core.stirring > 0, `${name} young`);
    assert.ok(old.core.stirring < 0, `${name} now`);
    assert.ok(between(old.flow, least, most), `${name} ${old.flow}`);
    assert.ok(young.melt > 0 && old.melt === 0, `${name} erupts young`);
  }
});

test("the core of Mercury freezes from its centre and that stirs it", () => {
  const core = warmthOf(made(0.0553 * EARTH_MASS, 0.74, 0, 440), null)?.core;
  assert.ok(core);
  assert.ok(between(core.frozen, 0.3, 0.8), `frozen ${core.frozen}`);
  assert.ok(core.flux < core.steep);
  assert.ok(core.stirring > 0);
});

test("a heavy core starts molten through and a small or mixed body has none to stir", () => {
  const heavy = warmthOf(made(5 * EARTH_MASS, 0.325, 0, 288, 0.2 * GIGAYEAR), null)?.core;
  assert.ok(heavy && heavy.frozen < 1 && heavy.stirring > 0, `heavy ${heavy?.frozen}`);
  const lump = warmthOf(made(2.6e20, 0.18, 0, 170), null);
  assert.ok(lump && lump.core === null && lump.mantle === null && lump.sea === null);
  assert.ok(
    between(lump.flow * face(made(2.6e20, 0.18, 0, 170)), 0.5 * lump.decay, 2 * lump.decay),
  );
  assert.equal(warmthOf(jupiter, sun), null);
  assert.equal(warmthOf(sun, null), null);
});

test("Io is heated by its tide as measured and molten rock carries the heat up", () => {
  const warmth = warmthOf(io, jupiter);
  assert.ok(warmth?.core);
  assert.ok(between(warmth.tide, 0.7 * 9.33e13, 1.3 * 9.33e13), `tide ${warmth.tide}`);
  assert.ok(warmth.melt > 0.9 * warmth.tide);
  assert.ok(between(warmth.flow, 1.5, 3), `flow ${warmth.flow}`);
  assert.ok(warmth.core.stirring < 0);
  assert.equal(warmthOf({ ...io, stretch: 0 }, jupiter)?.tide, 0);
  assert.equal(warmthOf({ ...io, day: 0.5 * io.year }, jupiter)?.tide, 0);
});

test("seas lie under the ice of the large cold moons about as deep as published", () => {
  const titan = held(made(1.3452e23, 0, 0.48, 94), 1.22187e9, 0.0288, 15.945);
  const saturn = { ...jupiter, mass: 5.683e26, radius: 5.82e7 };
  const roofs: [name: string, moon: Physics, host: Physics, least: number, most: number][] = [
    ["Europa", europa, jupiter, 19e3, 60e3],
    ["Ganymede", ganymede, jupiter, 70e3, 134e3],
    ["Callisto", callisto, jupiter, 90e3, 132e3],
    ["Titan", titan, saturn, 50e3, 141e3],
  ];
  for (const [name, moon, host, least, most] of roofs) {
    const sea = warmthOf(moon, host)?.sea;
    assert.ok(sea, name);
    assert.ok(between(sea.roof, least, most), `${name} roof ${sea.roof}`);
    assert.ok(sea.depth > 0 && between(sea.heat, 251, 273.16), `${name} sea ${sea.heat}`);
  }
  const small = held(made(2.3e21, 0, 0.75, 76), 5.27e8, 0.001, 4.52);
  assert.equal(warmthOf(small, saturn)?.sea, null);
  assert.equal(warmthOf(earth(), null)?.sea, null);
});

test("two moons in step keep an oval that their planet's tide pays for", () => {
  const turner = { ...jupiter, fluid: wrapped(jupiter), turning: turningOf(jupiter) };
  const paid = pairedHeat(io, europa, turner);
  assert.ok(between(paid, 1e13, 1e14), `paid ${paid}`);
  assert.ok(between(forcedBy(paid, io, jupiter.mass), 0.0041 / 2.5, 0.0041), "oval of Io");
  assert.ok(pairedHeat(io, europa, { ...turner, day: 100 * DAY }) >= 0);
});

test("tides have rounded the paths of old close moons unless a neighbor in step holds them", () => {
  let rounded = 0;
  let forced = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const { bodies } = sketchSystem(seed, { settled: seed % 2 === 0, star: null });
    for (const body of bodies) {
      const host = body.parent === null ? null : bodies[body.parent].physics;
      const { physics } = body;
      if (host === null || starborn(host) || physics.day !== physics.year || body.shared !== null) {
        continue;
      }
      const loss = yieldOf({ ...physics, fluid: wrapped(physics) });
      const spans = physics.age / roundingOf(physics, host.mass, loss);
      if (spans < 30) {
        continue;
      }
      const stepped = bodies.some(
        (other) =>
          other.parent === body.parent &&
          Math.abs(other.physics.orbit / physics.orbit / 2 ** (2 / 3) - 1) < 0.02,
      );
      if (stepped) {
        forced += physics.stretch > 1e-6 ? 1 : 0;
      } else {
        assert.ok(physics.stretch < 1e-6, `${seed} ${body.name} ${physics.stretch}`);
        rounded += 1;
      }
    }
  }
  assert.ok(rounded > 50, `rounded ${rounded}`);
  assert.ok(forced > 5, `forced ${forced}`);
});

test("every solid body of a made system has a heat that can be reckoned", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { bodies } = sketchSystem(seed, { settled: seed % 2 === 0, star: null });
    for (const body of bodies) {
      const host = body.parent === null ? null : bodies[body.parent].physics;
      const warmth = warmthOf(body.physics, host);
      if (warmth === null) {
        assert.ok(starborn(body.physics) || wrapped(body.physics), body.name);
        continue;
      }
      const label = `${seed} ${body.name}`;
      assert.ok(Number.isFinite(warmth.flow) && warmth.flow >= 0, `${label} flow ${warmth.flow}`);
      assert.ok(warmth.decay >= 0 && warmth.tide >= 0 && warmth.melt >= 0, label);
      assert.ok(warmth.mantle === null || between(warmth.mantle, 30, 2000), label);
      if (warmth.core !== null) {
        const { heat, flux, steep, frozen, stirring } = warmth.core;
        assert.ok([heat, flux, steep, stirring].every(Number.isFinite), label);
        assert.ok(between(frozen, 0, 1) && steep > 0, `${label} frozen ${frozen}`);
      }
      if (warmth.sea !== null) {
        assert.ok(warmth.sea.roof > 0 && warmth.sea.depth > 0, label);
      }
    }
  }
});
