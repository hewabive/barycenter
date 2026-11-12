import assert from "node:assert/strict";
import { test } from "node:test";
import { type Command, type State, step, viewFor } from "../src/index.ts";
import { fresh } from "./support.ts";

function farNeutral(state: State, capital: number, region: number): number {
  const hops = new Map([[capital, 0]]);
  const queue = [capital];
  for (let head = 0; head < queue.length; head++) {
    for (const link of state.map.links[queue[head]]) {
      if (!hops.has(link.cell)) {
        hops.set(link.cell, (hops.get(queue[head]) ?? 0) + 1);
        queue.push(link.cell);
      }
    }
  }
  const neutral = state.map.regions[region].cells.filter(
    (cell) => state.cells[cell].owner === null,
  );
  return neutral.reduce((far, cell) => ((hops.get(cell) ?? 0) > (hops.get(far) ?? 0) ? cell : far));
}

function ticksToTake(state: State, commands: Command[], cell: number): number {
  let current = step(state, commands).state;
  while (current.cells[cell].owner !== 0 && current.tick < 3000) {
    current = step(current, []).state;
  }
  return current.tick;
}

test("an aimed pressure reaches its aim sooner than a pressure along the whole line", () => {
  const { state, capital, home } = fresh();
  const aim = farNeutral(state, capital, home);
  assert.ok(!state.map.links[aim].some((link) => state.cells[link.cell].owner === 0));
  const press: Command = { kind: "pressure", power: 0, region: home, target: null, active: true };
  const broad = ticksToTake(state, [press], aim);
  const aimed = ticksToTake(
    state,
    [press, { kind: "aim", power: 0, region: home, target: null, cell: aim }],
    aim,
  );
  assert.ok(aimed < broad);
});

test("an aimed pressure presses only the cells nearest to its aim", () => {
  const { state, capital, home } = fresh();
  const aim = farNeutral(state, capital, home);
  let current = step(state, [
    { kind: "pressure", power: 0, region: home, target: null, active: true },
    { kind: "aim", power: 0, region: home, target: null, cell: aim },
  ]).state;
  assert.equal(viewFor(current, 0).pressures[0].aim, aim);
  for (let tick = 0; tick < 12; tick++) {
    current = step(current, []).state;
  }
  const sieged = current.cells.filter((cell) => cell.owner === null && cell.siege[0] > 0).length;
  assert.equal(sieged, 1);
});

test("an aim lapses once its cell is taken", () => {
  const { state, capital, home } = fresh();
  const aim = farNeutral(state, capital, home);
  let current = step(state, [
    { kind: "pressure", power: 0, region: home, target: null, active: true },
    { kind: "aim", power: 0, region: home, target: null, cell: aim },
  ]).state;
  while (current.cells[aim].owner !== 0 && current.tick < 3000) {
    current = step(current, []).state;
  }
  current = step(current, []).state;
  assert.equal(current.cells[aim].owner, 0);
  for (const pressure of current.pressures) {
    assert.equal(pressure.aim, null);
  }
});

test("an aim must be a cell of the pressed holder in the pressed region", () => {
  const { state, capital, home } = fresh();
  const aim = farNeutral(state, capital, home);
  const order = { kind: "aim", power: 0, region: home, target: null } as const;
  assert.equal(step(state, [{ ...order, cell: aim }]).rejections.length, 1);

  const pressed = step(state, [
    { kind: "pressure", power: 0, region: home, target: null, active: true },
  ]).state;
  const outside = state.cells.findIndex(
    (cell, id) => cell.owner === null && state.map.cells[id].region !== home,
  );
  assert.equal(step(pressed, [{ ...order, cell: capital }]).rejections.length, 1);
  assert.equal(step(pressed, [{ ...order, cell: outside }]).rejections.length, 1);
  assert.equal(step(pressed, [{ ...order, cell: 99999 }]).rejections.length, 1);

  const aimed = step(pressed, [{ ...order, cell: aim }]);
  assert.deepEqual(aimed.rejections, []);
  assert.equal(aimed.state.pressures[0].aim, aim);
  assert.equal(step(aimed.state, [{ ...order, cell: null }]).state.pressures[0].aim, null);
});
