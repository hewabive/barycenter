import assert from "node:assert/strict";
import { test } from "node:test";
import { bulgeOf, flatOf, interiorOf, radiusOf, solidOf, turningOf } from "../src/interior.ts";
import { EARTH_MASS, EARTH_RADIUS, JUPITER_MASS, SUN_MASS, SUN_RADIUS } from "../src/physics.ts";

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

test("what a body is made of is read back from its physics, and gas and stars have none yet", () => {
  const shares = { ...rocky(0.3), gas: 0 };
  const radius = radiusOf(EARTH_MASS, shares);
  const world = { mass: EARTH_MASS, radius, ...shares, day: 86164 };
  const inside = interiorOf(world);
  assert.ok(inside !== null && within(inside.radius, radius, 1e-12));
  assert.ok(within(turningOf(world), 0.33, 0.02));
  const love =
    (3 * bulgeOf(world) * 6.674e-11 * world.mass * world.day ** 2) /
    (4 * Math.PI ** 2 * radius ** 5);
  assert.ok(love > 0.9 && love < 0.97, `love ${love}`);
  assert.ok(within(flatOf(world), 1 / 298.3, 0.05), `flat ${1 / flatOf(world)}`);
  const gas = { iron: 0.01, rock: 0.02, ice: 0.02, gas: 0.95 };
  const giant = { mass: JUPITER_MASS, radius: radiusOf(JUPITER_MASS, gas), ...gas, day: 35730 };
  assert.equal(interiorOf(giant), null);
  assert.equal(turningOf(giant), 0.25);
  assert.ok(within(giant.radius, 6.9911e7, 0.05));
  const star = { mass: SUN_MASS, radius: SUN_RADIUS, iron: 0, rock: 0, ice: 0, gas: 1 };
  assert.equal(interiorOf(star), null);
  assert.ok(within(EARTH_RADIUS, radius, 0.01));
});
