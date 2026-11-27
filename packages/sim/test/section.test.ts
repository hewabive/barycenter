import assert from "node:assert/strict";
import { test } from "node:test";
import { radiusOf } from "../src/interior.ts";
import { EARTH_MASS, GIGAYEAR, JUPITER_MASS, lifeOf, SUN_MASS, starHeat } from "../src/physics.ts";
import { type Section, sectionOf } from "../src/section.ts";
import { sketchSystem } from "../src/system.ts";
import type { Physics } from "../src/types.ts";

const AGE = 4.567 * GIGAYEAR;
const between = (value: number, least: number, most: number) => value >= least && value <= most;

function made(mass: number, iron: number, ice: number, heat: number, gas = 0): Physics {
  const shares = { iron, rock: 1 - iron - ice - gas, ice, gas };
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
    age: AGE,
    orbit: 1.5e11,
    stretch: 0,
    year: 3e7,
    day: 1e5,
    disks: [],
  };
}

function star(suns: number, age: number): Physics {
  const life = lifeOf(suns * SUN_MASS, age);
  return {
    ...made(SUN_MASS, 0, 0, 0),
    iron: 0,
    rock: 0,
    ice: 0,
    gas: 1,
    mass: life.mass,
    radius: life.radius,
    glow: life.glow,
    heat: starHeat(life.glow, life.radius),
    age,
  };
}

function cut(physics: Physics, host: Physics | null = null): Section {
  const section = sectionOf(physics, host);
  assert.ok(section !== null);
  section.zones.forEach((zone, index) => {
    assert.equal(zone.inner, section.zones[index - 1]?.outer ?? 0, `zone ${index} starts`);
    assert.ok(zone.outer > zone.inner, `zone ${index} has width`);
  });
  assert.equal(section.zones[section.zones.length - 1].outer, section.radius);
  return section;
}

test("the Earth is cut into a solid and a molten core, a mantle that turns over and a lid", () => {
  const system = sketchSystem(1, { settled: true, star: null });
  const home = system.bodies[system.home ?? 0].physics;
  const shares = { iron: 0.325, rock: 0.675 - home.ice, ice: home.ice, gas: 0 };
  const earth = {
    ...home,
    ...shares,
    mass: EARTH_MASS,
    radius: radiusOf(EARTH_MASS, shares),
    age: AGE,
  };
  const { zones } = cut(earth, system.bodies[0].physics);
  const [inner, outer] = zones;
  assert.ok(inner.stuff === "iron" && inner.solid, "inner core");
  assert.ok(between(inner.outer, 1.1e6, 1.35e6), `inner core to ${inner.outer}`);
  assert.ok(outer.stuff === "iron" && !outer.solid && outer.stirred, "outer core");
  assert.deepEqual(
    zones.filter(({ stuff }) => stuff === "rock").map(({ form, stirred }) => [form, stirred]),
    [
      ["lower", true],
      ["transition", true],
      ["upper", true],
      ["upper", false],
    ],
  );
  const lid = zones.find(({ stuff, stirred }) => stuff === "rock" && !stirred);
  assert.ok(lid !== undefined && between(lid.outer - lid.inner, 5e4, 1.5e5), "lid");
});

test("Ganymede keeps a sea between its ice and the ice that pressure makes", () => {
  const { zones } = cut(made(1.48148e23, 0.06, 0.45, 110));
  const order = zones.map(({ stuff, form }) => (form === null ? stuff : `${stuff} ${form}`));
  const sea = order.indexOf("sea");
  assert.ok(sea > 0, order.join(", "));
  assert.equal(order[sea + 1], "ice Ih");
  assert.ok(
    order.slice(0, sea).some((name) => name === "ice VI"),
    order.join(", "),
  );
});

test("Jupiter has a metal of hydrogen under its gas and a core of heavier stuff", () => {
  const jupiter = { ...made(JUPITER_MASS, 0.01, 0.02, 124, 0.95), radius: 6.99e7 };
  const { zones } = cut(jupiter);
  const metal = zones.find(({ stuff }) => stuff === "metal");
  assert.ok(metal !== undefined);
  assert.ok(metal.stirred);
  assert.ok(between(metal.outer / jupiter.radius, 0.75, 0.9), `metal to ${metal.outer}`);
  assert.equal(zones[zones.length - 1].stuff, "gas");
  assert.ok(zones.every(({ heat }) => heat !== null && heat > 0));
});

test("the Sun burns within the quarter of its radius that Model S gives", () => {
  const sun = cut(star(1, AGE));
  const [still, stirred] = sun.zones;
  assert.ok(!still.stirred && stirred.stirred);
  assert.ok(between(still.outer / sun.radius, 0.7, 0.74), `still to ${still.outer}`);
  const [fire] = sun.fires;
  assert.equal(fire.fuel, "hydrogen");
  assert.ok(between(fire.outer / sun.radius, 0.235, 0.275), `burns to ${fire.outer}`);
});

test("a heavy star is stirred at its centre and a giant burns in a shell around its helium", () => {
  const heavy = cut(star(10, 0.01 * GIGAYEAR));
  assert.ok(heavy.zones[0].stirred && heavy.zones[0].stuff === "hydrogen");
  assert.ok(heavy.fires[0].outer <= heavy.zones[0].outer);
  const giant = cut(star(1, 11.3 * GIGAYEAR));
  assert.equal(giant.zones[0].stuff, "helium");
  assert.ok(giant.zones[0].outer < 0.01 * giant.radius);
  assert.ok(giant.fires.some(({ fuel, inner }) => fuel === "hydrogen" && inner > 0));
});

test("remnants have the layers of white dwarfs and neutron stars, and a black hole none", () => {
  const dwarf = cut(star(2, 3 * GIGAYEAR));
  assert.deepEqual(
    dwarf.zones.map(({ stuff }) => stuff),
    ["carbon", "helium", "hydrogen"],
  );
  const pulsar = cut(star(12, 0.1 * GIGAYEAR));
  const crust = pulsar.zones[1];
  assert.equal(crust.stuff, "crust");
  assert.ok(between(crust.outer - crust.inner, 300, 1500), `crust ${crust.outer - crust.inner}`);
  assert.equal(sectionOf(star(40, 0.1 * GIGAYEAR), null), null);
});
