import assert from "node:assert/strict";
import { test } from "node:test";
import { HYDROGEN_ADIABATS, WATER_ADIABATS } from "../src/adiabats.ts";
import {
  bodyOf,
  bulgeOf,
  flatOf,
  interiorOf,
  radiusOf,
  solidOf,
  turningOf,
  wrapped,
} from "../src/interior.ts";
import {
  EARTH_MASS,
  EARTH_RADIUS,
  GRAVITY,
  SUN_MASS,
  SUN_RADIUS,
  starborn,
  starHeat,
} from "../src/physics.ts";
import { sketchSystem } from "../src/system.ts";

const within = (value: number, wanted: number, share: number) =>
  Math.abs(value / wanted - 1) <= share;
const rocky = (iron: number) => ({ iron, rock: 1 - iron, ice: 0 });
const icy = (iron: number, ice: number) => ({ iron, rock: 1 - iron - ice, ice });

test("the Earth comes out with its size, its core, its pressure and its moment of inertia", () => {
  const earth = solidOf(5.97217e24, rocky(0.325));
  const [core, mantle] = earth.layers;
  assert.ok(within(earth.radius, 6.371e6, 0.005), `radius ${earth.radius}`);
  assert.equal(core.matter, "iron");
  assert.equal(mantle.matter, "rock");
  assert.ok(within(core.radius, 3.48e6, 0.005), `core ${core.radius}`);
  assert.ok(within(mantle.pressure, 135.75e9, 0.02), `under the rock ${mantle.pressure}`);
  assert.ok(within(earth.centre, 363.85e9, 0.02), `centre ${earth.centre}`);
  assert.ok(within(earth.turning, 0.3308, 0.01), `turning ${earth.turning}`);
});

test("rock, iron and water worlds are as wide as published models make them", () => {
  const listed: [share: ReturnType<typeof icy>, radii: number[]][] = [
    [rocky(1), [0.676, 0.823, 0.99]],
    [rocky(0.3), [0.823, 1.005, 1.22]],
    [rocky(0), [0.872, 1.067, 1.3]],
    [icy(0, 0.5), [1.039, 1.27, 1.54]],
  ];
  for (const [shares, radii] of listed) {
    [0.5, 1, 2].forEach((earths, index) => {
      const found = solidOf(earths * 5.9742e24, shares).radius / 6.371e6;
      assert.ok(within(found, radii[index], 0.01), `${JSON.stringify(shares)} ${earths}: ${found}`);
    });
  }
});

test("the solid bodies of the Sun come out at their size", () => {
  const bodies: [name: string, mass: number, shares: ReturnType<typeof icy>, radius: number][] = [
    ["Venus", 4.86731e24, rocky(0.325), 6.0518e6],
    ["Mars", 6.41691e23, rocky(0.24), 3.3895e6],
    ["Mercury", 3.30103e23, rocky(0.74), 2.4394e6],
    ["Moon", 7.3458e22, rocky(0.015), 1.7374e6],
    ["Ganymede", 1.48148e23, icy(0.06, 0.45), 2.6312e6],
    ["Callisto", 1.07566e23, icy(0, 0.5), 2.4103e6],
    ["Pluto", 1.30246e22, icy(0, 1 / 3), 1.1883e6],
  ];
  for (const [name, mass, shares, radius] of bodies) {
    const found = solidOf(mass, shares).radius;
    assert.ok(within(found, radius, 0.02), `${name} ${found / radius}`);
  }
  const moon = solidOf(7.3458e22, rocky(0.015));
  assert.ok(
    Math.abs(moon.layers[0].radius - 3.3e5) < 2e4,
    `core of the Moon ${moon.layers[0].radius}`,
  );
  assert.ok(within(moon.turning, 0.3931, 0.015), `turning of the Moon ${moon.turning}`);
  const mercury = solidOf(3.30103e23, rocky(0.74));
  assert.ok(
    within(mercury.layers[0].radius, 2.024e6, 0.03),
    `core of Mercury ${mercury.layers[0].radius}`,
  );
  assert.ok(Math.abs(mercury.turning - 0.346) < 0.009, `turning of Mercury ${mercury.turning}`);
});

test("a body holds the mass asked for, in layers that press less the higher they lie", () => {
  for (const mass of [1e17, 4e20, 2e22, 6e24, 3e25, 6e26]) {
    for (const shares of [rocky(0.3), rocky(0), icy(0.1, 0.5), icy(0, 1), icy(0.6, 0.2)]) {
      const label = `${mass} ${JSON.stringify(shares)}`;
      const found = solidOf(mass, shares);
      const held = found.layers.reduce((sum, layer) => sum + layer.mass, 0);
      assert.ok(within(held, mass, 1e-6), label);
      assert.ok(found.turning > 0.2 && found.turning < 0.4005, `${label} ${found.turning}`);
      assert.ok(Math.abs(found.layers[found.layers.length - 1].radius - found.radius) < 1, label);
      assert.equal(found.layers[0].pressure, found.centre, label);
      found.layers.slice(1).forEach((layer, index) => {
        assert.ok(layer.radius > found.layers[index].radius, label);
        assert.ok(layer.pressure < found.layers[index].pressure, label);
      });
    }
  }
});

test("a heavier body is wider and a body of more iron narrower", () => {
  let last = 0;
  for (let power = 15; power <= 26.5; power += 0.25) {
    const radius = solidOf(10 ** power, icy(0.2, 0.3)).radius;
    assert.ok(radius > last, `${power}`);
    last = radius;
  }
  for (const earths of [0.01, 1, 10]) {
    const mass = earths * EARTH_MASS;
    assert.ok(solidOf(mass, rocky(0.6)).radius < solidOf(mass, rocky(0.2)).radius);
    assert.ok(solidOf(mass, icy(0.2, 0.5)).radius > solidOf(mass, rocky(0.2)).radius);
  }
});

test("a small body is one mix and a round one lies in layers", () => {
  const lump = solidOf(1e19, icy(0.2, 0.4));
  assert.deepEqual(
    lump.layers.map(({ matter }) => matter),
    ["blend"],
  );
  assert.ok(Math.abs(lump.turning - 0.4) < 1e-3);
  const round = solidOf(1e22, icy(0.2, 0.4));
  assert.deepEqual(
    round.layers.map(({ matter }) => matter),
    ["iron", "rock", "ice"],
  );
  assert.ok(round.turning < 0.35);
  assert.deepEqual(
    solidOf(1e19, icy(0, 1)).layers.map(({ matter }) => matter),
    ["ice"],
  );
});

test("what a body is made of is read back from its physics, and a star has no such layers", () => {
  const shares = { ...rocky(0.3), gas: 0 };
  const radius = radiusOf(EARTH_MASS, shares);
  const world = {
    mass: EARTH_MASS,
    radius,
    ...shares,
    heat: 288,
    glow: 0,
    day: 86164,
    age: 1.4e17,
  };
  const inside = interiorOf(world);
  assert.ok(inside !== null && within(inside.radius, radius, 1e-12));
  assert.ok(within(turningOf(world), 0.33, 0.02));
  const love =
    (3 * bulgeOf(world) * 6.674e-11 * world.mass * world.day ** 2) /
    (4 * Math.PI ** 2 * radius ** 5);
  assert.ok(love > 0.9 && love < 0.97, `love ${love}`);
  assert.ok(within(flatOf(world), 1 / 298.3, 0.05), `flat ${1 / flatOf(world)}`);
  assert.ok(within(EARTH_RADIUS, radius, 0.01));
  const star = { mass: SUN_MASS, radius: SUN_RADIUS, ...rocky(0), rock: 0, gas: 1, heat: 5772 };
  assert.equal(interiorOf({ ...star, glow: 3.828e26 }), null);
});

const JUPITER = 1.898125e27;
const SATURN = 5.68317e26;
const JUPITER_WIDE = 7.1492e7;
const cored = (iron: number, rock: number, ice: number) => ({
  iron,
  rock,
  ice,
  gas: 1 - iron - rock - ice,
});
const GAS = cored(0, 0, 0);

test("the adiabats are those of the published tables where they start", () => {
  const at = (traced: typeof HYDROGEN_ADIABATS, row: number, pascals: number) =>
    traced.density[row][Math.round((pascals - traced.pressure.from) / traced.pressure.step)];
  assert.ok(Math.abs(at(HYDROGEN_ADIABATS, 6, 5) - 1e4 * Math.log10(0.17703)) < 5);
  assert.ok(Math.abs(at(HYDROGEN_ADIABATS, 14, 5) - 1e4 * Math.log10(0.028072)) < 5);
  assert.ok(Math.abs(at(WATER_ADIABATS, 0, 9) - 1e4 * Math.log10(1377.2)) < 10);
  assert.ok(Math.abs(at(WATER_ADIABATS, 7, 9) - 1e4 * Math.log10(912.5)) < 10);
  for (const traced of [HYDROGEN_ADIABATS, WATER_ADIABATS]) {
    const start = Math.round((traced.at - traced.pressure.from) / traced.pressure.step);
    traced.density.forEach((row, index) => {
      const warm = traced.warmth.from + traced.warmth.step * index;
      assert.ok(Math.abs(traced.heat[index][start] * traced.fine - warm) < 2e-3, `row ${index}`);
      row.forEach((dense, step) => {
        assert.ok(step === 0 || dense >= row[step - 1], `row ${index} step ${step}`);
      });
    });
  }
});

test("Jupiter and Saturn come out with their size, their air and their weight within", () => {
  const jupiter = bodyOf(JUPITER, cored(0.01, 0.015, 0.015), 107, 102.5);
  assert.ok(within(jupiter.radius, 6.9911e7, 0.02), `radius ${jupiter.radius}`);
  assert.ok(Math.abs(jupiter.skin - 166) < 3, `one bar ${jupiter.skin}`);
  assert.ok(within(jupiter.turning, 0.276, 0.04), `turning ${jupiter.turning}`);
  const [metal, gas] = jupiter.layers.slice(-2);
  assert.deepEqual([metal.matter, gas.matter], ["metal", "gas"]);
  assert.ok(within(gas.pressure, 140e9, 1e-6), `metal from ${gas.pressure}`);
  assert.ok(metal.radius > 0.83 * jupiter.radius && metal.radius < 0.9 * jupiter.radius);
  const saturn = bodyOf(SATURN, cored(0.03, 0.06, 0.09), 77.2, 81.3);
  assert.ok(within(saturn.radius, 5.8232e7, 0.03), `radius ${saturn.radius}`);
  assert.ok(Math.abs(saturn.skin - 134) < 12, `one bar ${saturn.skin}`);
  assert.ok(within(saturn.turning, 0.234, 0.04), `turning ${saturn.turning}`);
  const coreless = bodyOf(JUPITER, GAS, 107, 78);
  assert.ok(within(coreless.radius / JUPITER_WIDE, 1.019, 0.035), `${coreless.radius}`);
});

test("brown dwarfs and heavy planets are as wide as cooling models make them", () => {
  const listed = [
    [0.001, 111, 1.006],
    [0.001, 169, 1.053],
    [0.005, 238, 1.053],
    [0.005, 596, 1.2],
    [0.01, 334, 1.02],
    [0.01, 931, 1.182],
    [0.019, 476, 0.949],
    [0.038, 780, 0.853],
    [0.038, 1213, 0.923],
    [0.058, 1141, 0.804],
  ];
  for (const [suns, heat, wide] of listed) {
    const found = bodyOf(suns * 1.98841e30, GAS, heat).radius / JUPITER_WIDE;
    assert.ok(within(found, wide, 0.04), `${suns} suns at ${heat} K: ${found} against ${wide}`);
  }
  const hot = bodyOf(0.038 * 1.98841e30, GAS, 2183).radius / JUPITER_WIDE;
  assert.ok(hot > 1 && hot < 1.242, `a hot young dwarf ${hot}`);
});

test("a thin wrap of gas stands as high as published models have it", () => {
  const listed = [
    [5.5, 0.01, 2.13],
    [5.5, 0.05, 2.86],
    [8.5, 0.01, 2.25],
    [8.5, 0.05, 2.95],
  ];
  for (const [earths, gas, wide] of listed) {
    const mass = earths * 5.972e24;
    const inner = 107 * (mass / JUPITER) ** 0.25 * 0.45 ** 0.3;
    const shares = { iron: (1 - gas) / 3, rock: (2 * (1 - gas)) / 3, ice: 0, gas };
    const found = bodyOf(mass, shares, inner, 449).radius / 6.371e6;
    assert.ok(within(found, wide, 0.05), `${earths} earths, ${gas} of gas: ${found}`);
  }
});

test("a giant swells under a near star, a light one more, and when it is young", () => {
  const shares = cored(0, 0.0158, 0.0158);
  const far = bodyOf(JUPITER, shares, 107, 100).radius;
  const near = bodyOf(JUPITER, shares, 107, 1261).radius / far;
  assert.ok(within(near * (far / 6.9911e7), 1.27, 0.03), `near ${near}`);
  const light = bodyOf(0.5 * JUPITER, shares, 90, 1300).radius;
  assert.ok(light / bodyOf(0.5 * JUPITER, shares, 90, 100).radius > near);
  const cool = bodyOf(JUPITER, shares, 107, 600).radius / far;
  assert.ok(cool > 1 && cool < 1.1, `cool ${cool}`);
  const young = bodyOf(JUPITER, shares, 700, 100).radius / far;
  assert.ok(young > 1.2 && young < 1.5, `young ${young}`);
  assert.ok(bodyOf(JUPITER, shares, 0, 0).radius < far);
});

test("a young giant lit far beyond its own heat swells smoothly and never shrinks", () => {
  const shares = cored(0, 0.0165, 0);
  const lits = [300, 1000, 1500, 2000, 2300, 2600, 3000, 3500];
  const widths = lits.map((lit) => bodyOf(JUPITER, shares, 1100, lit).radius / 6.9911e7);
  for (const [index, width] of widths.entries()) {
    assert.ok(width > 1.4 && width < 25, `${lits[index]} K ${width}`);
  }
  const old = bodyOf(JUPITER, shares, 160, 3500).radius / 6.9911e7;
  assert.ok(old > 1.3 && old < 2.2, `an old giant at 3500 K ${old}`);
});

test("gas that lies deep makes a body one of gas, and thin air leaves it its ground", () => {
  const rock = { iron: 0.3, rock: 0.7, ice: 0 };
  const ground = solidOf(5 * EARTH_MASS, rock).radius;
  const weight = (share: number) =>
    (GRAVITY * (5 * EARTH_MASS) ** 2 * share) / (4 * Math.PI * ground ** 4);
  const thin = { iron: 0.3 * (1 - 1e-5), rock: 0.7 * (1 - 1e-5), ice: 0, gas: 1e-5 };
  assert.ok(weight(1e-5) < 1e8 && !wrapped({ mass: 5 * EARTH_MASS, ...thin }));
  assert.ok(within(radiusOf(5 * EARTH_MASS, thin, 40, 300), ground, 1e-4));
  const deep = { iron: 0.3 * 0.99, rock: 0.7 * 0.99, ice: 0, gas: 0.01 };
  assert.ok(weight(0.01) > 1e8 && wrapped({ mass: 5 * EARTH_MASS, ...deep }));
  const wide = bodyOf(5 * EARTH_MASS, deep, 40, 300);
  assert.ok(wide.radius > 1.2 * ground && wide.radius < 2 * ground, `${wide.radius / ground}`);
  assert.deepEqual(
    wide.layers.map(({ matter }) => matter),
    ["iron", "rock", "gas"],
  );
  assert.ok(wide.layers[1].radius < ground, "the weight of the gas presses the rock");
});

test("the inside of a body in gas is read back from what the system keeps of it", () => {
  let seen = 0;
  for (let seed = 1; seed <= 12; seed++) {
    for (const { physics, name } of sketchSystem(seed, { settled: false, star: null }).bodies) {
      if (!wrapped(physics) || (starborn(physics) && physics.mass >= 0.075 * SUN_MASS)) {
        continue;
      }
      const inner = starHeat(physics.glow, physics.radius);
      const lit = Math.max(0, physics.heat ** 4 - inner ** 4) ** 0.25;
      const found = bodyOf(physics.mass, physics, inner, lit);
      assert.ok(within(found.radius, physics.radius, 5e-3), `seed ${seed}, ${name}`);
      const inside = interiorOf(physics);
      assert.ok(inside !== null && inside.skin > 0 && inside.radius === physics.radius);
      assert.equal(inside.layers[inside.layers.length - 1].matter, "gas");
      assert.equal(turningOf(physics), 0.25);
      seen += 1;
    }
  }
  assert.ok(seen > 10, `bodies in gas ${seen}`);
});
