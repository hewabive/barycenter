import assert from "node:assert/strict";
import { test } from "node:test";
import { cloneState, createWorld, eventsFor, type GameEvent, issue, retune } from "../src/index.ts";

test("orders can be issued without advancing time", () => {
  const state = createWorld({ seed: 1 });
  const home = state.map.cells[state.powers[0].capital].region;
  const foreign = state.map.cells[state.powers[1].capital].region;
  const result = issue(state, [
    { kind: "garrison", power: 0, region: home, value: 4 },
    { kind: "garrison", power: 0, region: foreign, value: 4 },
  ]);
  assert.equal(result.state.tick, 0);
  assert.equal(result.state.powers[0].holdings[home].garrison, 4);
  assert.equal(result.rejections.length, 1);
  assert.equal(state.powers[0].holdings[home].garrison, 0);
});

test("retuning replaces constants and leaves the old state alone", () => {
  const state = createWorld({ seed: 1 });
  const tuned = retune(state, { buildRate: 3, announceTicks: 40 });
  assert.ok(tuned);
  assert.equal(tuned.constants.buildRate, 3);
  assert.equal(tuned.constants.announceTicks, 40);
  assert.notEqual(state.constants.buildRate, 3);
  assert.equal(tuned.tick, state.tick);
});

test("retuning refuses unknown names and values that would break the simulation", () => {
  const state = createWorld({ seed: 1 });
  assert.equal(retune(state, { warpDrive: 1 } as never), null);
  assert.equal(retune(state, { buildRate: -1 }), null);
  assert.equal(retune(state, { buildRate: Number.NaN }), null);
  assert.equal(retune(state, { matterReach: 1 }), null);
  assert.equal(retune(state, { energyFade: 1.2 }), null);
  assert.equal(retune(state, { forceCost: 0 }), null);
  assert.equal(retune(state, { energyRounds: 2.5 }), null);
  assert.equal(retune(state, { leanSpan: 0.5 }), null);
  assert.equal(retune(state, { buildRate: "fast" } as never), null);
});

test("a power learns only of events it can see", () => {
  const state = cloneState(createWorld({ seed: 1 }));
  const home = state.map.cells[state.powers[0].capital].region;
  const near = state.map.neighbors[home][0].region;
  const far = state.map.cells[state.powers[1].capital].region;
  const events: GameEvent[] = [
    { kind: "entered", power: 2, region: near },
    { kind: "entered", power: 2, region: far },
    { kind: "expelled", power: 1, region: far, by: 0 },
    { kind: "discovered", power: 0, region: near },
    { kind: "discovered", power: 1, region: near },
    { kind: "announced", power: 2, region: far, target: 0, activeAt: 15 },
    { kind: "announced", power: 2, region: far, target: 1, activeAt: 15 },
    { kind: "eliminated", power: 2 },
  ];
  assert.deepEqual(eventsFor(state, 0, events), [
    events[0],
    events[2],
    events[3],
    events[5],
    events[7],
  ]);
});
