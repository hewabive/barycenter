import assert from "node:assert/strict";
import { test } from "node:test";
import { type Field, fallOf, fieldOf, reachOf, shieldOf, VACUUM, windAt } from "../src/field.ts";
import { radiusOf } from "../src/interior.ts";
import {
  ASTRONOMICAL_UNIT,
  DAY,
  EARTH_MASS,
  GIGAYEAR,
  glowOf,
  innerHeat,
  JUPITER_MASS,
  lifeOf,
  SUN_GLOW,
  SUN_MASS,
  starborn,
  starHeat,
  starStages,
  starTurn,
  YEAR,
  yearOf,
} from "../src/physics.ts";
import { sketchSystem } from "../src/system.ts";
import type { Body, Physics } from "../src/types.ts";

const GAUSS = 1e-4;
const AGE = 4.567 * GIGAYEAR;
const between = (value: number, least: number, most: number) => value >= least && value <= most;
const near = (value: number, wanted: number, share: number) =>
  Math.abs(value / wanted - 1) <= share;

const blank = {
  coldest: 0,
  hottest: 0,
  light: 0,
  air: 0,
  gases: [],
  life: 0,
  orbit: 1.5e11,
  stretch: 0,
  year: 3e7,
  disks: [],
};

function solid(mass: number, iron: number, heat: number, days: number, age = AGE): Physics {
  const shares = { iron, rock: 1 - iron, ice: 0, gas: 0 };
  const radius = radiusOf(mass, shares);
  return { ...blank, mass, radius, ...shares, heat, glow: 0, vigor: 0.5, age, day: days * DAY };
}

function earth(days = 0.99727, age = AGE): Physics {
  const system = sketchSystem(1, { settled: true, star: null });
  const home = system.bodies[system.home ?? 0].physics;
  const shares = { iron: 0.325, rock: 0.675 - home.ice, ice: home.ice, gas: 0 };
  const radius = radiusOf(EARTH_MASS, shares);
  return { ...home, ...shares, mass: EARTH_MASS, radius, age, day: days * DAY, vigor: 0.5 };
}

function gassy(mass: number, heavy: [number, number, number], inner: number, lit: number): Physics {
  const [iron, rock, ice] = heavy;
  const shares = { iron, rock, ice, gas: 1 - iron - rock - ice };
  const radius = radiusOf(mass, shares, inner, lit);
  const heat = (inner ** 4 + lit ** 4) ** 0.25;
  const glow = glowOf(radius, inner);
  return { ...blank, mass, radius, ...shares, heat, glow, vigor: 0.5, age: AGE, day: 0.42 * DAY };
}

function star(suns: number, age: number, vigor = 0.5): Physics {
  const life = lifeOf(suns * SUN_MASS, age);
  const heat = starHeat(life.glow, life.radius);
  const day = starTurn(suns * SUN_MASS, age, life, 0.5);
  const shares = { iron: 0, rock: 0, ice: 0, gas: 1 };
  return {
    ...blank,
    ...shares,
    mass: life.mass,
    radius: life.radius,
    glow: life.glow,
    heat,
    vigor,
    age,
    day,
  };
}

function found(physics: Physics): Field {
  const field = fieldOf(physics, null);
  assert.ok(field !== null, "a field");
  return field;
}

const sun = star(1, 4.57 * GIGAYEAR);

test("the Earth has its field, a slow Earth a weak one of many poles, and a still core none", () => {
  const field = found(earth());
  assert.equal(field.source, "core");
  assert.equal(field.split, false);
  assert.ok(near(field.moment, 7.71e22, 0.3), `moment ${field.moment}`);
  assert.ok(near(field.surface, 29.8e-6, 0.3), `surface ${field.surface}`);
  assert.ok(field.tilt < (12 * Math.PI) / 180);
  const slow = found(earth(30));
  assert.ok(slow.split && near(slow.moment, field.moment / 20, 0.01), `slow ${slow.moment}`);
  assert.ok(slow.tilt > field.tilt);
  assert.ok(found(earth(0.7, GIGAYEAR)).surface > 10e-6, "a field before the inner core");
  assert.equal(fieldOf(solid(0.815 * EARTH_MASS, 0.325, 737, 243), null), null);
  assert.equal(fieldOf(solid(0.1074 * EARTH_MASS, 0.24, 215, 1.026), null), null);
  assert.ok(found(solid(0.1074 * EARTH_MASS, 0.24, 215, 1.026, 0.2 * GIGAYEAR)).surface > 1e-7);
  const mercury = found(solid(0.0553 * EARTH_MASS, 0.74, 440, 58.646));
  assert.ok(mercury.split && between(mercury.moment, 2.8e19, 2.8e20), `Mercury ${mercury.moment}`);
  assert.equal(fieldOf(solid(1e20, 0.3, 200, 1), null), null);
});

test("Jupiter, the ice giants and brown dwarfs have the fields their own heat drives", () => {
  const jupiter = found(gassy(JUPITER_MASS, [0.01, 0.015, 0.015], 107, 110));
  assert.equal(jupiter.source, "metal");
  assert.ok(near(jupiter.surface, 4.177 * GAUSS, 0.3), `Jupiter ${jupiter.surface}`);
  assert.ok(!jupiter.split && jupiter.tilt < (12 * Math.PI) / 180);
  const saturn = found(gassy(5.683e26, [0.03, 0.06, 0.06], 87, 82));
  assert.ok(between(saturn.surface, 0.21 * GAUSS, jupiter.surface), `Saturn ${saturn.surface}`);
  const uranus = found(gassy(8.681e25, [0.05, 0.2, 0.62], 30, 58));
  const neptune = found(gassy(1.024e26, [0.05, 0.2, 0.62], 53, 47));
  assert.deepEqual([uranus.source, uranus.split, neptune.split], ["water", true, true]);
  assert.ok(near(uranus.surface, 0.228 * GAUSS, 0.3), `Uranus ${uranus.surface}`);
  assert.ok(between(neptune.surface, 0.14 * GAUSS, 4 * 0.14 * GAUSS), `Neptune ${neptune.surface}`);
  assert.ok(uranus.tilt > (30 * Math.PI) / 180);
  const hot = found(gassy(JUPITER_MASS, [0.01, 0.015, 0.015], 400, 1500));
  assert.ok(hot.surface > 2 * jupiter.surface, `a hot Jupiter ${hot.surface}`);
  const heat = innerHeat(70 * JUPITER_MASS, GIGAYEAR, 0.5);
  const dwarf = found(gassy(70 * JUPITER_MASS, [0, 0, 0], heat, 0));
  const within = 2 * Math.SQRT2 * dwarf.surface;
  assert.ok(between(within, 1500 * GAUSS, 4000 * GAUSS), `a brown dwarf ${within}`);
});

test("a cool star has a field by how fast it turns, strongest when young", () => {
  const field = found(sun);
  assert.equal(field.source, "shell");
  assert.ok(between(1.38 * field.surface, 1.5 * GAUSS, 3.81 * GAUSS), `large ${field.surface}`);
  assert.ok(between(field.mean, 70 * GAUSS, 160 * GAUSS), `mean ${field.mean}`);
  const early = found(star(1, 0.1 * GIGAYEAR));
  assert.ok(early.surface > 10 * field.surface && early.mean > 5 * field.mean);
  const dwarf = found({ ...star(0.3, 5 * GIGAYEAR), day: 0.5 * DAY });
  assert.ok(near(1.38 * dwarf.surface, 257 * GAUSS, 1e-9), `saturated ${dwarf.surface}`);
  assert.ok(near(dwarf.mean, 2900 * GAUSS, 0.05), `mean ${dwarf.mean}`);
  const giant = star(1, starStages(SUN_MASS)[2] * 0.999);
  assert.ok(found(giant).surface < field.surface);
});

test("a star not yet settled has a strong dipole while it is stirred all through", () => {
  const young = found(star(1, 1e-3 * GIGAYEAR));
  assert.ok(between(2 * young.surface, 1000 * GAUSS, 1900 * GAUSS), `pole ${young.surface}`);
  assert.ok(between(young.tilt, (10 * Math.PI) / 180, (25 * Math.PI) / 180), `tilt ${young.tilt}`);
  assert.ok(young.mean <= 2900 * GAUSS && !young.split);
  const later = found(star(1, 1e-2 * GIGAYEAR));
  assert.ok(
    later.surface < 0.5 * young.surface && later.tilt > young.tilt,
    `later ${later.surface}`,
  );
  const heavy = found(star(2, 1e-3 * GIGAYEAR, 0.1));
  assert.ok(
    between(2 * heavy.surface, 20 * GAUSS, 300 * GAUSS),
    `a heavy young star ${heavy.surface}`,
  );
});

test("a hot star has a field one time in fourteen, kept from its birth, and a cool one never", () => {
  const draws = Array.from({ length: 2000 }, (_, index) => (index + 0.5) / 2000);
  const hot = draws.map((vigor) => fieldOf(star(3, 0.1 * GIGAYEAR, vigor), null));
  const kept = hot.flatMap((field) => (field === null ? [] : [field]));
  assert.ok(between(kept.length / hot.length, 0.05, 0.1), `share ${kept.length / hot.length}`);
  assert.ok(kept.every(({ source }) => source === "frozen"));
  const poles = kept.map(({ surface }) => 2 * surface).sort((left, right) => left - right);
  assert.ok(poles[0] >= 330 * GAUSS && poles[poles.length - 1] <= 18100 * GAUSS);
  assert.ok(between(poles[poles.length >> 1], 1500 * GAUSS, 4000 * GAUSS), `median ${poles[0]}`);
  assert.ok(kept.some(({ tilt }) => tilt > 1) && kept.some(({ tilt }) => tilt < 0.6));
  const cool = draws.slice(0, 200).map((vigor) => found(star(1.2, GIGAYEAR, vigor)));
  assert.ok(cool.every(({ source }) => source === "shell"));
  const swollen = { ...star(3, 0.1 * GIGAYEAR, kept.length > 0 ? 0.00025 : 0), radius: 5e9 };
  const wide = fieldOf({ ...swollen, heat: 4500, day: 300 * DAY }, null);
  assert.ok(wide === null || wide.surface < 1000 * GAUSS);
});

test("what a star leaves keeps a field or none: white dwarfs, neutron stars, black holes", () => {
  const draws = Array.from({ length: 1000 }, (_, index) => (index + 0.5) / 1000);
  const ends = (suns: number, after: number, vigor: number) =>
    star(suns, starStages(suns * SUN_MASS)[4] + after * GIGAYEAR, vigor);
  const share = (suns: number, after: number) =>
    draws.filter((vigor) => fieldOf(ends(suns, after, vigor), null) !== null).length / draws.length;
  assert.ok(between(share(1, 5), 0.14, 0.22), `old light dwarfs ${share(1, 5)}`);
  assert.ok(between(share(1, 0.1), 0.01, 0.05), `young light dwarfs ${share(1, 0.1)}`);
  assert.ok(share(7, 0.1) > 0.8, `heavy dwarfs ${share(7, 0.1)}`);
  const fields = draws.flatMap((vigor) => fieldOf(ends(1, 5, vigor), null) ?? []);
  assert.ok(fields.every(({ mean }) => between(mean, 4e4 * GAUSS, 3e8 * GAUSS)));
  const pulsar = found(ends(10, 0.01, 0.5));
  assert.ok(near(pulsar.surface, 4.47e12 * GAUSS, 0.01), `pulsar ${pulsar.surface}`);
  assert.equal(fieldOf(ends(30, 0.01, 0.5), null), null);
});

test("the wind of a star presses as measured at the Earth and holds a field in", () => {
  const press = windAt(sun, ASTRONOMICAL_UNIT);
  assert.ok(between(press, 1.5e-9, 2.7e-9), `wind ${press}`);
  assert.ok(near(windAt(sun, 2 * ASTRONOMICAL_UNIT), press / 4, 1e-9));
  assert.ok(windAt(star(1, 0.1 * GIGAYEAR), ASTRONOMICAL_UNIT) > 5 * press);
  assert.equal(windAt(star(1, starStages(SUN_MASS)[4] + GIGAYEAR), ASTRONOMICAL_UNIT), 0);
  const home = earth();
  assert.ok(between(reachOf(found(home), home.radius, press) / home.radius, 9, 12));
  const dipole = (surface: number): Field => ({ ...found(home), surface });
  const mercury = reachOf(dipole(190e-9), 1, windAt(sun, 0.387 * ASTRONOMICAL_UNIT));
  assert.ok(between(mercury, 1.2, 1.6), `Mercury ${mercury}`);
  const jupiter = reachOf(dipole(4.177 * GAUSS), 1, windAt(sun, 5.2 * ASTRONOMICAL_UNIT));
  assert.ok(between(jupiter, 35, 63), `Jupiter ${jupiter}`);
  const ganymede = reachOf(dipole(719e-9), 1, 124e-9 ** 2 / (2 * VACUUM));
  assert.ok(between(ganymede, 2, 2.6), `Ganymede ${ganymede}`);
  assert.equal(reachOf(dipole(1e-12), 1, press), 1);
});

test("every body of a made system has a field that can be reckoned, and moons lie inside their planet's", () => {
  let inside = 0;
  let shielded = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const system = sketchSystem(seed, { settled: seed % 2 === 0, star: null });
    for (const body of system.bodies) {
      const { field, press, reach, inside: host } = shieldOf(system, body.id);
      const label = `${seed} ${body.name}`;
      if (field === null) {
        assert.ok(reach === 0 || starborn(body.physics) || body.parent === null, label);
        continue;
      }
      assert.ok(field.surface > 0 && Number.isFinite(field.moment + field.mean), label);
      assert.ok(between(field.tilt, 0, Math.PI / 2) && field.mean >= field.surface, label);
      assert.ok(press >= 0 && reach >= body.physics.radius, `${label} reach ${reach}`);
      if (host !== null) {
        assert.equal(host, body.parent, label);
        inside += 1;
      }
      shielded += Number.isFinite(reach) ? 1 : 0;
    }
    if (system.home !== null) {
      const home = shieldOf(system, system.home);
      assert.ok(
        home.field !== null && home.reach > 1.5 * system.bodies[system.home].physics.radius,
      );
    }
  }
  assert.ok(inside > 20 && shielded > 100, `inside ${inside}, shielded ${shielded}`);
});

test("the field of a young star stops its disk, and the gas falls in from there", () => {
  const young = (suns: number, age: number, seed = 256) =>
    sketchSystem(seed, { settled: false, star: suns * SUN_MASS, age: age * GIGAYEAR }).bodies;
  const alone = (bodies: Body[]) => fallOf(bodies[0], bodies);
  const system = young(1, 5e-4);
  const star = system[0];
  const fall = alone(system);
  assert.ok(fall !== null);
  const { mass, radius, day } = star.physics;
  assert.ok(near((fall.rate * YEAR) / SUN_MASS, 1.1e-7, 0.05), `rate ${fall.rate}`);
  assert.ok(between(fall.edge / radius, 3, 9), `edge ${fall.edge / radius}`);
  assert.ok(near(day, yearOf(fall.edge, mass), 1e-3), `day ${day / DAY}`);
  assert.ok(between(day / DAY, 3, 10), `day ${day / DAY}`);
  assert.ok(between(fall.light / SUN_GLOW, 0.5, 1.2), `light ${fall.light / SUN_GLOW}`);
  assert.ok(between(fall.speed, 2e5, 4e5) && between(fall.spots, 0.001, 0.1), `${fall.spots}`);
  assert.equal(alone(young(1, 0.05)), null);
  assert.equal(alone(sketchSystem(1, { settled: true, star: null }).bodies), null);
  const heavy = young(2, 1e-3, 9)[0];
  const landing = alone(young(2, 1e-3, 9));
  assert.ok(landing !== null && landing.edge === heavy.physics.radius && landing.speed === 0);
  assert.ok(heavy.physics.day < 3 * DAY, "a star that cannot hold its disk off keeps its day");
  const days: number[] = [];
  for (let seed = 1; seed <= 120; seed++) {
    const system = sketchSystem(seed, { settled: false, star: null, age: 2e-3 * GIGAYEAR });
    for (const body of system.bodies) {
      const fed = starborn(body.physics) ? fallOf(body, system.bodies) : null;
      if (fed !== null && fed.edge > body.physics.radius) {
        days.push(body.physics.day / DAY);
      }
    }
  }
  days.sort((left, right) => left - right);
  assert.ok(days.length > 60 && between(days[days.length >> 1], 3, 10), `${days.length} days`);
});

test("both stars of a pair take gas from the disk around them, the lighter more", () => {
  const pair = sketchSystem(447178, { settled: false, star: null, age: 2e-4 * GIGAYEAR }).bodies;
  const [heavy, light] = pair.filter((body) => starborn(body.physics));
  const [one, two] = [fallOf(heavy, pair), fallOf(light, pair)];
  assert.ok(one !== null && two !== null);
  const ratio = light.physics.mass / heavy.physics.mass;
  assert.ok(near(two.rate / one.rate, 1 / (0.1 + 0.9 * ratio), 1e-9), `${two.rate / one.rate}`);
  const tight = sketchSystem(30, { settled: false, star: null, age: 5e-4 * GIGAYEAR }).bodies;
  const stars = tight.filter((body) => starborn(body.physics));
  assert.equal(stars.length, 2);
  for (const star of stars) {
    const fall = fallOf(star, tight);
    assert.ok(fall !== null && fall.edge === star.physics.radius, star.name);
    assert.ok(fall.edge < stars[1].physics.orbit, star.name);
  }
});
