import assert from "node:assert/strict";
import { test } from "node:test";
import { type Shot, shotOf, shotQuery } from "../src/shot.ts";

test("a shot read back from its query is the shot", () => {
  const shot: Shot = {
    focus: "Kemis b",
    camera: [1.25, -0.5, 3.75e-7],
    tick: 1234.5,
    weather: 88.125,
  };
  assert.deepEqual(shotOf(`?seed=10&home=0&${shotQuery(shot)}`), shot);
});

test("a shot keeps every digit of its numbers", () => {
  const shot: Shot = {
    focus: null,
    camera: [0.1 + 0.2, -1.2345678901234566e-9, 2e21],
    tick: 39.197123456789,
    weather: null,
  };
  const query = shotQuery(shot);
  assert.equal(
    query,
    "camera=0.30000000000000004,-1.2345678901234566e-9,2e%2B21&tick=39.197123456789",
  );
  assert.deepEqual(shotOf(query), shot);
});

test("an address with no shot or a broken one gives the start of a fresh view", () => {
  const fresh: Shot = { focus: null, camera: null, tick: 0, weather: null };
  assert.deepEqual(shotOf("?seed=4"), fresh);
  assert.deepEqual(shotOf("?focus=&camera=1,2&tick=fast&weather=-3"), fresh);
  assert.equal(shotOf("?camera=0,0,0").camera, null);
});
