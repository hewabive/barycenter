import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type Cloud,
  clearedBy,
  depthAt,
  diskOf,
  GROWN_MOST,
  gasHeight,
  holeOf,
  inflowOf,
  leftAt,
  leftOf,
  nebulaOf,
  ridgeOf,
  rimOf,
  type Station,
  settledBy,
  stirredHeight,
  thinningOf,
  wearOf,
} from "../src/disks.ts";
import {
  ASTRONOMICAL_UNIT,
  EARTH_MASS,
  JUPITER_MASS,
  SUN_GLOW,
  SUN_MASS,
  starborn,
  YEAR,
} from "../src/physics.ts";
import { sketchSystem } from "../src/system.ts";

const AU = ASTRONOMICAL_UNIT;
const MYR = 1e6 * YEAR;

const cloud = (age: number, stations: Station[] = []): Cloud => ({
  inner: 0.05 * AU,
  outer: 60 * AU,
  reach: 60 * AU,
  centre: SUN_MASS,
  frost: 2.7 * AU,
  age: age * MYR,
  airy: 4 * MYR,
  stations,
});

const planet = (orbit: number, share: number, earths: number): Station => ({
  orbit: orbit * AU,
  share,
  mass: share * earths * EARTH_MASS,
  belt: null,
});

test("a young disk is one sheet of dust and gas, as heavy as the nebula of the Sun", () => {
  const [disk, ...rest] = nebulaOf(cloud(0.3));
  assert.equal(rest.length, 0);
  assert.equal(disk.inner, 0.05 * AU);
  assert.equal(disk.outer, 60 * AU);
  assert.ok(disk.mass > 40 * EARTH_MASS && disk.mass < 150 * EARTH_MASS, `${disk.mass}`);
  assert.ok(disk.gas > 0.003 * SUN_MASS && disk.gas < 0.005 * SUN_MASS);
  assert.ok(disk.depth > 30 && disk.depth < 300, `${disk.depth}`);
  assert.equal(disk.grain, 1e-5);
  assert.ok(disk.ice > 0.4 && disk.ice < 0.6);
});

test("a growing body clears a lane as wide as its reach and takes the dust beside it", () => {
  const widths = [0.1, 0.5, 1].map((share) => {
    const disks = nebulaOf(cloud(1, [planet(1, 0.02, 1), planet(5, share, 300)]));
    const inside = disks.findLast((disk) => disk.outer < 5 * AU);
    const outside = disks.find((disk) => disk.inner > 5 * AU);
    assert.ok(inside !== undefined && outside !== undefined);
    assert.ok(disks.every((disk) => disk.outer <= 5 * AU || disk.inner >= 5 * AU));
    return { lane: outside.inner - inside.outer, left: outside.mass };
  });
  assert.ok(widths[0].lane < widths[1].lane && widths[1].lane < widths[2].lane);
  assert.ok(Math.abs(widths[2].lane / (8 * 5 * AU * Math.cbrt((300 * 3e-6) / 3)) - 1) < 0.02);
  assert.ok(widths[0].left > widths[1].left && widths[1].left > widths[2].left);
  const whole = nebulaOf(cloud(1, [planet(1, 1, 1), planet(5, 1, 300)]));
  assert.ok(whole.every((disk) => disk.depth === 0 && disk.gas > 0));
});

test("the gas thins, then goes from the inside out, and the dust goes with it", () => {
  const gas = (age: number) => nebulaOf(cloud(age)).reduce((sum, disk) => sum + disk.gas, 0);
  assert.ok(gas(0.3) > gas(2) && gas(2) > gas(3.5) && gas(3.5) > gas(3.8) && gas(3.8) > 0);
  assert.equal(gas(4), 0);
  assert.equal(holeOf(cloud(3.5)), 0.05 * AU);
  assert.equal(holeOf(cloud(4)), 60 * AU);
  const half = cloud(3.8);
  const hole = holeOf(half);
  assert.ok(hole > 0.05 * AU && hole < 60 * AU);
  const [cleared, dusty, ...more] = nebulaOf(half);
  assert.equal(more.length, 0);
  assert.equal(cleared.outer, hole);
  assert.equal(dusty.inner, hole);
  assert.ok(cleared.gas === 0 && dusty.gas > 0);
  assert.ok(cleared.depth < 0.1 && dusty.depth > 0.3);
});

test("what is left in the end is the belt the system keeps", () => {
  const wear = wearOf(Math.sqrt(2.1 * 3.3) * AU, SUN_MASS, GROWN_MOST);
  const belt = diskOf(2.1 * AU, 3.3 * AU, 0.05, { mass: 3e-4 * EARTH_MASS, wear });
  const here: Station = { orbit: Math.sqrt(2.1 * 3.3) * AU, share: 0, mass: 0, belt };
  const stations = [planet(1, 1, 1), here, planet(5.2, 1, 318)];
  const at = (age: number) => nebulaOf(cloud(age, stations));
  const young = at(10).find((disk) => disk.outer > 2.2 * AU && disk.inner < 3.2 * AU);
  assert.ok(young !== undefined);
  assert.ok(young.inner < belt.inner && young.outer > belt.outer && young.mass > 100 * belt.mass);
  assert.ok(young.depth > 5 * belt.depth && young.depth < 0.1, `${young.depth} ${belt.depth}`);
  const [last, ...others] = at(99.999);
  assert.equal(others.length, 0);
  for (const key of ["inner", "outer", "mass", "depth", "ice"] as const) {
    assert.ok(Math.abs(last[key] / belt[key] - 1) < 1e-3, `${key} ${last[key]} ${belt[key]}`);
  }
  assert.equal(last.gas, 0);
  assert.ok(GROWN_MOST === 100 * MYR);
});

test("dust stands as high as the gas holds it, and lower where the gas has thinned", () => {
  const held = [1, 10, 100].map((orbit) => gasHeight(orbit * AU, SUN_MASS, 2.7 * AU));
  assert.ok(Math.abs(held[0] - 0.033) < 0.002 && Math.abs(held[2] - 0.105) < 0.005, `${held}`);
  const giant = [planet(5.2, 0.5, 318)];
  const [near, far] = nebulaOf(cloud(0.3, giant));
  assert.ok(near.height > 0.012 && near.height < 0.6 * gasHeight(0.5 * AU, SUN_MASS, 2.7 * AU));
  assert.ok(far.height > near.height && far.height < 0.6 * gasHeight(25 * AU, SUN_MASS, 2.7 * AU));
  assert.ok(near.flare > 0.2 && near.flare <= 0.25 && far.flare < near.flare);
  const late = nebulaOf(cloud(3.1, giant))[1];
  assert.ok(late.gas < far.gas && late.height < 0.9 * far.height, `${late.height} ${far.height}`);
});

test("without gas a disk is as thick as its planets have had time to stir it", () => {
  assert.ok(Math.abs(Math.SQRT2 * stirredHeight(JUPITER_MASS, SUN_MASS) - 0.193) < 0.005);
  assert.equal(stirredHeight(EARTH_MASS, SUN_MASS), 0.04);
  assert.equal(stirredHeight(0, SUN_MASS), 0.04);
  const giant = [planet(1, 0.5, 1), planet(5.2, 1, 318)];
  const heights = [30, 60, 99.999].map((age) => nebulaOf(cloud(age, giant))[0]);
  assert.ok(heights.every((disk) => disk.gas === 0 && disk.flare === 0 && disk.grain >= 1));
  assert.ok(heights[0].height < 0.08 && heights[0].height < heights[1].height);
  assert.ok(Math.abs(heights[2].height / stirredHeight(JUPITER_MASS, SUN_MASS) - 1) < 1e-3);
});

test("a ring that nothing stirs is a few of its own grains deep", () => {
  const ring = diskOf(1e8, 1.4e8, 1, { depth: 0.6 });
  assert.ok(Math.abs(ring.height * Math.sqrt(1e8 * 1.4e8) - 10) < 1e-9 && ring.flare === -1);
  const belt = diskOf(2.1 * AU, 3.3 * AU, 0.05, { mass: 3e-4 * EARTH_MASS, stirred: 0.137 });
  assert.ok(belt.height === 0.137 && belt.flare === 0 && belt.grain === 1);
});

test("collisions wear the dust near the star first, and all of it as the age goes by", () => {
  const stations = [planet(1, 0.2, 1), planet(5.2, 1, 318), planet(20, 0.3, 15)];
  const rubble = nebulaOf(cloud(8, stations));
  const near = rubble[0];
  const far = rubble[rubble.length - 1];
  assert.ok(near.gas === 0 && far.gas === 0 && near.outer < AU && far.inner > 20 * AU);
  assert.ok(near.grain > 100 * far.grain && far.grain < 3, `${near.grain} ${far.grain}`);
  assert.ok(near.depth < 1e-4 && far.depth > near.depth, `${near.depth} ${far.depth}`);
  const belt = (earths: number, years: number) =>
    diskOf(2.1 * AU, 3.3 * AU, 0.05, {
      mass: earths * EARTH_MASS,
      wear: wearOf(2.63 * AU, SUN_MASS, years * YEAR),
    });
  const ours = belt(4e-4, 4.57e9);
  assert.ok(ours.depth > 4e-8 && ours.depth < 4e-7, `${ours.depth}`);
  assert.ok(Math.abs(belt(4e-4, 9e9).depth / ours.depth - 0.5) < 0.05);
  assert.ok(Math.abs(belt(4, 4.57e9).depth / ours.depth - 1) < 0.2);
  assert.ok(Math.abs(belt(4e-4, 1e5).grain - 1) < 0.1 && ours.grain > 5);
});

test("the dust of a young disk thins out over the outer half of its width", () => {
  const [disk] = nebulaOf(cloud(0.3));
  assert.equal(disk.fade, 30 * AU);
  const fall = (at: number) => depthAt(disk, at * AU) * at ** 1.5;
  assert.ok(Math.abs(fall(3) / fall(1) - 1) < 0.02);
  assert.ok(fall(15) / fall(3) > 0.85 && fall(30) / fall(3) < 0.4);
  assert.ok(fall(45) / fall(3) < 0.05 && depthAt(disk, 60 * AU) < 0.01);
  assert.ok(Math.abs(leftAt(disk, 30 * AU) - Math.exp(-1)) < 1e-9 && leftAt(disk, AU) > 0.999);
  const near = nebulaOf({ ...cloud(0.3), outer: 12 * AU })[0];
  assert.equal(near.fade, 6 * AU);
  assert.ok(depthAt(near, 12 * AU) < 1e-3 * depthAt(near, 3 * AU));
  assert.ok(settledBy(1) === 1 && settledBy(0) === 0);
  assert.ok(Math.abs(settledBy(0.1) - 1 / Math.sqrt(5.5)) < 1e-9);
  const steps = 4000;
  let sum = 0;
  for (let step = 0; step < steps; step++) {
    const at = disk.inner + ((step + 0.5) * (disk.outer - disk.inner)) / steps;
    sum += depthAt(disk, at) * 2 * at * ((disk.outer - disk.inner) / steps);
  }
  assert.ok(Math.abs(sum / (disk.outer ** 2 - disk.inner ** 2) / disk.depth - 1) < 0.02);
  const belt = diskOf(2 * AU, 3 * AU, 0, { mass: EARTH_MASS });
  assert.ok(belt.fade === 0 && depthAt(belt, 2 * AU) > depthAt(belt, 3 * AU));
});

test("dust gathers beyond the lane of a heavy planet, and a belt is empty where it keeps time with one", () => {
  const ridge = ridgeOf(318 * EARTH_MASS, 5.2 * AU, SUN_MASS, SUN_GLOW);
  assert.ok(Math.abs(ridge.at / AU - 8.75) < 0.1 && ridge.rise > 1.9, `${ridge.at / AU}`);
  assert.ok(ridgeOf(EARTH_MASS, AU, SUN_MASS, SUN_GLOW).rise < 0.1);
  const belt = { inner: 2.1 * AU, outer: 3.3 * AU };
  const giant = [{ mass: 318 * EARTH_MASS, orbit: 5.2 * AU }];
  const gaps = clearedBy(belt, giant, SUN_MASS).map(({ at }) => at / AU);
  assert.deepEqual(
    gaps.map((at) => at.toFixed(2)),
    ["2.50", "2.82", "2.96", "3.28"],
  );
  assert.ok(clearedBy(belt, giant, SUN_MASS).every(({ wide }) => Math.abs(wide - 0.0146) < 1e-3));
  assert.equal(clearedBy(belt, [{ mass: EARTH_MASS, orbit: 5.2 * AU }], SUN_MASS).length, 0);
  assert.equal(clearedBy(belt, [{ mass: 318 * EARTH_MASS, orbit: AU }], SUN_MASS).length, 0);
});

test("dust begins where the light of the star no longer turns it to gas", () => {
  assert.ok(Math.abs(rimOf(SUN_GLOW) / AU - 0.07) < 1e-9);
  assert.ok(Math.abs(rimOf(50 * SUN_GLOW) / AU - 0.495) < 1e-3);
});

test("only a heavy planet thins the gas along its orbit", () => {
  const thinned = (earths: number, orbit: number) =>
    thinningOf(earths * EARTH_MASS, orbit * AU, SUN_MASS, SUN_GLOW);
  assert.ok(thinned(318, 5.2) < 0.01 && thinned(95, 9.5) < 0.1);
  assert.ok(thinned(17, 30) > 0.8 && thinned(1, 1) > 0.95);
  assert.ok(thinned(10, 1) < thinned(10, 10));
});

test("a ring spreads fast while it is heavy, lasts while it is light and is worn away", () => {
  const saturn = 5.683e26;
  const turn = 14 * 3600;
  const wear = 3e8 * YEAR;
  assert.equal(leftOf(1e19, saturn, turn, wear, 0), 1e19);
  assert.equal(leftOf(1e19, saturn, turn, wear, -1), 0);
  assert.ok(Math.abs(leftOf(1e19, saturn, turn, wear, wear) / 1e19 - Math.exp(-1)) < 0.01);
  assert.ok(leftOf(1e19, saturn, turn, wear, 10 * wear) < 1e-4 * 1e19);
  const never = 1e30;
  const late = 1e9 * YEAR;
  const heavy = leftOf(1e23, saturn, turn, never, late);
  const heavier = leftOf(1e25, saturn, turn, never, late);
  assert.ok(Math.abs(heavy / heavier - 1) < 0.01, `${heavy} ${heavier}`);
  const spread = saturn * Math.sqrt((0.0425 * turn) / (2 * late));
  assert.ok(Math.abs(heavy / spread - 1) < 0.01, `${heavy} ${spread}`);
  assert.ok(spread > 1.5e19 && spread < 1.5e20);
  assert.ok(Math.abs(leftOf(1e23, saturn, turn, never, 4 * late) / heavy - 0.5) < 0.01);
  assert.ok(leftOf(1e23, saturn, turn, wear, late) < 0.1 * heavy);
});

test("a young star takes in gas while its disk reaches it, less with every year", () => {
  const disks = nebulaOf(cloud(1));
  const star = (seed: number, age: number, given = disks) => ({
    id: 0,
    parent: null,
    seed,
    physics: { mass: SUN_MASS, age: age * MYR, disks: given } as never,
  });
  const unit = SUN_MASS / YEAR;
  const rates = Array.from({ length: 400 }, (_, seed) => inflowOf(star(seed, 1), []) / unit);
  const sorted = [...rates].sort((left, right) => left - right);
  assert.ok(Math.abs(Math.log10(sorted[200]) + 8) < 0.1, `${sorted[200]}`);
  assert.ok(sorted[0] > 1e-10 && sorted[399] < 1e-6);
  const wide = Math.log10(sorted[336] / sorted[64]);
  assert.ok(Math.abs(wide - 1) < 0.2, `${wide}`);
  assert.ok(Math.abs(inflowOf(star(7, 4), []) / inflowOf(star(7, 1), []) - 4 ** -1.5) < 1e-9);
  assert.equal(inflowOf(star(7, 0.01), []), inflowOf(star(7, 0.1), []));
  const holed = nebulaOf(cloud(3.9));
  assert.ok(holed[0].gas === 0 && holed.some((disk) => disk.gas > 0));
  assert.equal(inflowOf(star(7, 3.9, holed), []), 0);
  assert.equal(inflowOf(star(7, 1, []), []), 0);
});

test("two close pairs in three lose their disks within a million years, the lighter star first", () => {
  const gassy = (body: { physics: { disks: { gas: number }[] } }) =>
    body.physics.disks.some((disk) => disk.gas > 0);
  let close = 0;
  let bare = 0;
  for (let seed = 0; seed < 240; seed++) {
    for (const age of [0.2, 1]) {
      const { bodies } = sketchSystem(seed, { settled: false, star: null, age: age * MYR });
      for (const body of bodies) {
        const host = body.parent === null ? null : bodies[body.parent];
        if (host === null || !starborn(body.physics) || !starborn(host.physics)) {
          continue;
        }
        const apart = body.physics.orbit;
        if (age === 1 && apart < 40 * AU && body.physics.mass >= 0.08 * SUN_MASS) {
          close += 1;
          bare += gassy(body) || gassy(host) ? 0 : 1;
        }
        const lighter = body.physics.mass < host.physics.mass;
        if (apart < 100 * AU && lighter && host.physics.disks.length > 0 && gassy(body)) {
          assert.ok(gassy(host), `seed ${seed} at ${age} Myr: ${body.name} outlives ${host.name}`);
        }
      }
    }
  }
  assert.ok(close >= 15, `close pairs ${close}`);
  assert.ok(bare / close > 0.45 && bare / close < 0.9, `bare ${bare} of ${close}`);
});
