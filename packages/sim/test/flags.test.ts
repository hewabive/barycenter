import assert from "node:assert/strict";
import { test } from "node:test";
import {
  economyReportFor,
  type GameEvent,
  retune,
  type State,
  step,
  viewFor,
} from "../src/index.ts";
import { cellsHeld, fresh, run } from "./support.ts";

function starved(seed = 1): { state: State; capital: number; home: number } {
  const { state: base, capital, home } = fresh(seed);
  const state = retune(base, { energyRate: 0, matterRate: 0 }) ?? base;
  for (const cell of state.cells) {
    cell.stock.fill(0);
  }
  return { state, capital, home };
}

function follow(state: State, ticks: number): { state: State; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let current = state;
  for (let tick = 0; tick < ticks; tick++) {
    const result = step(current, []);
    events.push(...result.events);
    current = result.state;
  }
  return { state: current, events };
}

test("a cell without levels makes nothing and still needs energy for its flag", () => {
  const { state, capital, home } = fresh();
  const report = economyReportFor(state, 0, home);
  const { flagUpkeep, startCells } = state.constants;
  assert.equal(report.books.bare, startCells - 1);
  assert.ok(Math.abs(report.books.energy.flags - flagUpkeep * startCells) < 1e-9);
  for (const account of report.cells) {
    assert.equal(account.books.energy.flags, flagUpkeep);
    if (account.cell === capital) {
      assert.ok(account.books.matter.made > 0);
      assert.ok(account.books.energy.made > 0);
    } else {
      assert.equal(account.books.matter.made, 0);
      assert.equal(account.books.energy.made, 0);
    }
  }
});

test("a power that only develops keeps every flag it starts with", () => {
  const { state } = fresh();
  const after = run(state, 400);
  assert.equal(cellsHeld(after, 0), state.constants.startCells);
  for (const cell of after.cells) {
    assert.equal(cell.flag, 1);
  }
});

test("matter goes to a first level before a dearer one", () => {
  const { state, capital } = fresh();
  const after = run(state, 200);
  const raised = after.cells.filter(
    (cell, id) => cell.owner === 0 && id !== capital && cell.level > 0,
  );
  assert.ok(raised.length >= 2);
  assert.equal(after.cells[capital].level, state.constants.startLevel);
});

test("a flag that no energy reaches falls and the cell turns neutral", () => {
  const { state, capital, home } = starved();
  const { flagFall, startCells } = state.constants;
  const whole = Math.ceil(1 / flagFall);

  const early = follow(state, Math.floor(whole / 2));
  assert.equal(cellsHeld(early.state, 0), startCells);
  assert.deepEqual(early.events, []);
  const view = viewFor(early.state, 0);
  const estate = view.regions[home].estate;
  assert.ok(estate);
  assert.equal(estate.falling, startCells - 1);
  assert.ok(estate.fallsIn !== null && estate.fallsIn <= whole / 2 + 2);
  view.cells.flag.forEach((flag, cell) => {
    const bare = early.state.cells[cell].owner === 0 && cell !== capital;
    assert.ok(bare ? flag < 0.6 : flag === 1);
  });

  const late = follow(early.state, whole);
  assert.equal(cellsHeld(late.state, 0), 1);
  assert.equal(late.state.cells[capital].owner, 0);
  assert.equal(late.state.cells[capital].flag, 1);
  let fallen = 0;
  for (const event of late.events) {
    if (event.kind === "lapsed" && event.power === 0) {
      assert.equal(event.region, home);
      assert.equal(event.left, false);
      fallen += event.cells;
    }
  }
  assert.equal(fallen, startCells - 1);
  for (const cell of late.state.cells) {
    if (cell.owner === null) {
      assert.equal(cell.flag, 1);
      assert.equal(cell.force, 0);
    }
  }
});

test("a falling flag rises again once energy reaches it", () => {
  const { state } = starved();
  const short = follow(state, 60).state;
  assert.ok(short.cells.some((cell) => cell.owner === 0 && cell.flag < 1));
  const fed = retune(short, { energyRate: 1 }) ?? short;
  const after = follow(fed, 60);
  assert.deepEqual(after.events, []);
  assert.ok(after.state.cells.every((cell) => cell.flag === 1));
});

test("a power whose last flag falls is out of the game", () => {
  const { state, capital, home } = starved();
  state.cells[capital].level = 0;
  state.cells[capital].branches.fill(0);
  const { state: after, events } = follow(state, Math.ceil(1 / state.constants.flagFall) + 5);
  assert.equal(cellsHeld(after, 0), 0);
  assert.equal(after.powers[0].alive, false);
  assert.ok(
    events.some(
      (event) =>
        event.kind === "lapsed" && event.power === 0 && event.region === home && event.left,
    ),
  );
  assert.ok(events.some((event) => event.kind === "eliminated" && event.power === 0));
  assert.ok(after.pressures.every((pressure) => pressure.power !== 0 && pressure.target !== 0));
});

test("the books count what a fallen flag takes with it", () => {
  const { state, capital } = starved();
  const bare = state.cells.findIndex((cell, id) => cell.owner === 0 && id !== capital);
  let current = state;
  while (current.cells[bare].flag > state.constants.flagFall * 1.5) {
    assert.equal(economyReportFor(current, 0, null).books.matter.abandoned, 0);
    current = step(current, []).state;
  }
  const others = current.cells.filter((cell, id) => cell.owner === 0 && id !== bare);
  for (const cell of others) {
    cell.flag = 1;
  }
  current.cells[bare].stock[0] = 3;
  const owned = current.cells.map((cell) => cell.owner === 0);
  const held = (from: State) =>
    from.cells.reduce((sum, cell, id) => sum + (owned[id] ? cell.stock[0] : 0), 0);
  const { matter } = economyReportFor(current, 0, null).books;
  const next = step(current, []).state;
  assert.equal(next.cells[bare].owner, null);
  assert.ok(matter.abandoned > 0);
  const spent = matter.levels + matter.roads + matter.quarters + matter.force;
  assert.ok(
    Math.abs(held(next) - held(current) - (matter.made - spent - matter.lost - matter.abandoned)) <
      1e-9,
  );
});
