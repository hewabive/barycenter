import assert from "node:assert/strict";
import { test } from "node:test";
import { type Books, type Command, economyReportFor, type State, step } from "../src/index.ts";
import { fresh, neutralNeighbor, run } from "./support.ts";

const CLOSE = 1e-9;

function grown(ticks: number, seed = 1): { state: State; home: number } {
  const { state, home } = fresh(seed);
  const orders: Command[] = state.map.regions.map((region) => ({
    kind: "pressure",
    power: 0,
    region: region.id,
    target: null,
    active: true,
  }));
  let current = run(state, 1, orders);
  for (let tick = 1; tick < ticks; tick++) {
    current = step(current, tick % 20 === 0 ? orders : []).state;
  }
  return { state: current, home };
}

function totalOf(owned: boolean[], read: (cell: number) => number): number {
  let sum = 0;
  owned.forEach((mine, cell) => {
    sum += mine ? read(cell) : 0;
  });
  return sum;
}

function close(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < CLOSE, `${actual} is not ${expected}`);
}

function figuresOf(books: Books): number[] {
  return [
    books.cells,
    books.bare,
    books.falling,
    books.capped,
    books.level,
    books.cap,
    ...books.branches,
    ...books.heading,
    ...Object.values(books.matter),
    ...Object.values(books.energy),
    ...Object.values(books.force),
  ];
}

test("the books of a fresh power show its start", () => {
  const { state, capital, home } = fresh();
  const report = economyReportFor(state, 0, home);
  const { constants } = state;
  assert.equal(report.books.cells, constants.startCells);
  assert.equal(report.books.level, state.cells[capital].level);
  assert.equal(report.books.matter.held, constants.startMatter);
  assert.equal(report.books.force.held, constants.startForce);
  assert.equal(report.books.force.room, constants.startQuarters);
  assert.ok(report.books.matter.made > 0);
  assert.ok(report.books.energy.made > 0);
  assert.deepEqual(
    report.regions.map((account) => account.region),
    [home],
  );
  assert.equal(report.cells.length, constants.startCells);
});

test("matter made is spent, lost on the way or left in stock", () => {
  let { state } = grown(1);
  let moved = 0;
  for (let tick = 0; tick < 60; tick++) {
    const owned = state.cells.map((cell) => cell.owner === 0);
    const { matter } = economyReportFor(state, 0, null).books;
    const next = step(state, []).state;
    const held = (from: State) => totalOf(owned, (cell) => from.cells[cell].stock[0]);
    const spent = matter.levels + matter.roads + matter.quarters + matter.force;
    close(matter.held, held(state));
    close(held(next) - held(state), matter.made - spent - matter.lost - matter.abandoned);
    assert.ok(spent <= matter.asked + CLOSE);
    moved += matter.lost;
    state = next;
  }
  assert.ok(moved > 0);
});

test("energy made reaches a use, is lost on the way or finds no use", () => {
  let { state } = grown(150);
  let lost = 0;
  for (let tick = 0; tick < 40; tick++) {
    const { energy } = economyReportFor(state, 0, null).books;
    const need = energy.flags + energy.levels + energy.force + energy.quarters + energy.roads;
    close(energy.made, energy.met + energy.spare + energy.lost);
    assert.ok(energy.met <= need + CLOSE);
    lost += energy.lost;
    state = step(state, []).state;
  }
  assert.ok(lost > 0);
});

test("force changes by what is built and what is lost", () => {
  let { state } = grown(60);
  let fought = 0;
  let built = 0;
  for (let tick = 0; tick < 120; tick++) {
    const owned = state.cells.map((cell) => cell.owner === 0);
    const { force } = economyReportFor(state, 0, null).books;
    const next = step(state, []).state;
    const held = (from: State) => totalOf(owned, (cell) => from.cells[cell].force);
    const gone =
      force.fought + force.starved + force.stranded + force.crowded + force.lost + force.abandoned;
    close(force.held, held(state));
    close(held(next) - held(state), force.built - gone);
    assert.ok(force.built <= force.yards + CLOSE);
    fought += force.fought;
    built += force.built;
    state = next;
  }
  assert.ok(fought > 0);
  assert.ok(built > 0);
});

test("regions add up to the power and cells to their region", () => {
  const { state } = grown(400);
  const whole = economyReportFor(state, 0, null);
  assert.ok(whole.regions.length > 1);
  assert.deepEqual(whole.cells, []);

  const sums = figuresOf(whole.books).map(() => 0);
  for (const account of whole.regions) {
    figuresOf(account.books).forEach((figure, index) => {
      sums[index] += figure;
    });
  }
  figuresOf(whole.books).forEach((figure, index) => {
    close(sums[index], figure);
  });

  for (const account of whole.regions) {
    const focused = economyReportFor(state, 0, account.region);
    assert.equal(focused.focus, account.region);
    assert.equal(focused.cells.length, account.books.cells);
    let level = 0;
    let made = 0;
    for (const cell of focused.cells) {
      assert.equal(state.map.cells[cell.cell].region, account.region);
      assert.equal(state.cells[cell.cell].owner, 0);
      level += cell.books.level;
      made += cell.books.matter.made;
    }
    assert.equal(level, account.books.level);
    close(made, account.books.matter.made);
  }
});

test("what one region sends another receives less the loss on the way", () => {
  let { state } = grown(20, 5);
  let crossings = 0;
  for (let tick = 0; tick < 120; tick++) {
    const report = economyReportFor(state, 0, null);
    for (const account of report.regions) {
      for (const sent of account.sends) {
        const other = report.regions.find((known) => known.region === sent.place);
        const received = other?.receives.find((known) => known.place === account.region);
        assert.ok(received);
        assert.ok(received.matter <= sent.matter);
        assert.ok(received.matter >= sent.matter * (1 - state.constants.hopLoss) - CLOSE);
        assert.ok(received.energy <= sent.energy);
        crossings += 1;
      }
    }
    state = step(state, []).state;
  }
  assert.ok(crossings > 0);
});

test("the books cover only the land of their power", () => {
  const { state, home } = fresh();
  const rival = economyReportFor(state, 1, home);
  assert.ok(rival.regions.every((account) => account.region !== home));
  assert.deepEqual(rival.cells, []);
  const { to } = neutralNeighbor(state, 0);
  const far = economyReportFor(state, 0, state.map.cells[to].region);
  assert.ok(far.cells.every((account) => state.cells[account.cell].owner === 0));
});

test("asking for the books leaves the state as it was", () => {
  const { state } = grown(30);
  const before = JSON.stringify(state);
  economyReportFor(state, 0, null);
  assert.equal(JSON.stringify(state), before);
});
