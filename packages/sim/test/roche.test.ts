import assert from "node:assert/strict";
import { test } from "node:test";
import { lobeOf } from "../src/pairs.ts";
import { GIGAYEAR, starborn, YEAR } from "../src/physics.ts";
import { innerPoint, lobeShape, streamOf } from "../src/roche.ts";
import { sketchSystem, surveySystem } from "../src/system.ts";

test("the point between two stars where gas spills lies nearer the lighter one", () => {
  assert.ok(Math.abs(innerPoint(1) - 0.5) < 1e-9);
  for (const share of [0.1, 0.33, 3, 10]) {
    assert.ok(Math.abs(innerPoint(share) + innerPoint(1 / share) - 1) < 1e-9);
    assert.ok(innerPoint(share) < 0.5 === share < 1);
  }
});

test("a full lobe is a drop as wide as the fit of Eggleton says, with its tip toward the other star", () => {
  for (const share of [0.1, 0.33, 1, 3, 10]) {
    const lobe = lobeShape(share, 1);
    assert.ok(Math.abs(lobe.mean / lobeOf(share) - 1) < 0.01, `${share}: ${lobe.mean}`);
    const [pole, side, back, tip] = [
      lobe.at(0, 0, 1),
      lobe.at(0, 1, 0),
      lobe.at(-1, 0, 0),
      lobe.at(1, 0, 0),
    ];
    assert.ok(pole < side && side < back && back < tip, `${share}: ${pole} ${side} ${back} ${tip}`);
    assert.ok(Math.abs(tip - innerPoint(share)) < 1e-3 && Math.abs(lobe.least / pole - 1) < 1e-2);
    const [east, north, up] = lobe.out(0, 0, 1);
    assert.ok(Math.abs(north) < 1e-9 && up > 0.99 && Math.abs(east) < 0.1);
    assert.ok(lobe.out(-1, 0, 0)[0] < -0.999);
  }
});

test("a star that fills seven tenths of its lobe is nearly round", () => {
  for (const share of [0.2, 1, 5]) {
    const whole = lobeShape(share, 1);
    const part = lobeShape(share, 0.7);
    assert.ok(Math.abs(part.mean / whole.mean - 0.7) < 0.01);
    assert.ok(part.tip / part.at(0, 0, 1) < 1.1 && part.tip / part.at(0, 0, 1) > 1.02);
  }
});

test("gas that leaves the tip swings past the other star to one side", () => {
  for (const share of [0.2, 0.33, 1]) {
    const path = streamOf(share, 1e-3);
    const nearest = Math.min(...path.map(({ x, y }) => Math.hypot(x - 1, y)));
    const known = 0.0488 * share ** -0.464;
    assert.ok(Math.abs(nearest / known - 1) < 0.1, `${share}: ${nearest} against ${known}`);
    assert.ok(path.every(({ y }) => y <= 1e-9) && path.some(({ y }) => y < -0.02));
    assert.ok(Math.abs(path[0].x - innerPoint(share)) < 0.01);
  }
  const short = streamOf(1, 0.2);
  const last = short[short.length - 1];
  assert.ok(Math.abs(Math.hypot(last.x - 1, last.y) - 0.2) < 0.01);
});

test("a star that has just thrown off its envelope stands in a shell that grows and fades", () => {
  const ended = 0.619734;
  const fresh = surveySystem(21, { settled: false, star: null, age: ended * GIGAYEAR });
  const dwarf = fresh.bodies.find((body) => body.shell !== null);
  assert.ok(dwarf !== undefined && dwarf.shell !== null);
  const shed = dwarf.passages.find(({ kind }) => kind === "shed");
  assert.ok(shed !== undefined && shed.with === null && shed.mass === dwarf.shell.mass);
  assert.ok(dwarf.shell.since > 0 && dwarf.shell.since < 2.1e4 * YEAR);
  assert.ok(Math.abs(dwarf.shell.reach / (42000 * dwarf.shell.since) - 1) < 1e-9);
  assert.ok(
    Math.abs(dwarf.shell.radius * fresh.unit - dwarf.shell.reach) < 1e-6 * dwarf.shell.reach,
  );
  const drawn = (age: number) =>
    sketchSystem(21, { settled: false, star: null, age: age * GIGAYEAR }).bodies.find(
      (body) => body.shell !== null,
    )?.shell?.radius ?? 0;
  assert.ok(drawn(ended) > 0 && drawn(ended + 3e-6) > 1.5 * drawn(ended));
  const later = surveySystem(21, { settled: false, star: null, age: (ended + 0.001) * GIGAYEAR });
  assert.ok(later.bodies.every((body) => body.shell === null));
  assert.ok(later.bodies.some((body) => body.passages.some(({ kind }) => kind === "shed")));
});

test("a giant that fills its lobe is drawn as wide beside its companion as it is", () => {
  const system = sketchSystem(325, { settled: false, star: null, age: 7.75 * GIGAYEAR });
  const stars = system.bodies.filter((body) => starborn(body.physics));
  const giver = stars.find((body) => body.lobe === 1);
  const taker = stars.find((body) => body !== giver);
  assert.ok(giver !== undefined && taker !== undefined);
  const apart = Math.max(giver.orbit, taker.orbit);
  const share = lobeOf(giver.physics.mass / taker.physics.mass);
  assert.ok(Math.abs(giver.radius / (share * apart) - 1) < 1e-3, `${giver.radius} at ${apart}`);
  const calm = sketchSystem(325, { settled: false, star: null, age: 1 * GIGAYEAR });
  const [first, second] = calm.bodies.filter((body) => starborn(body.physics));
  assert.ok(Math.max(first.orbit, second.orbit) < 4 * Math.max(first.radius, second.radius));
});
