import { type Command, cloneState, createWorld, type State, step } from "../src/index.ts";

export function run(state: State, ticks: number, commands: Command[] = []): State {
  let current = step(state, commands).state;
  for (let tick = 1; tick < ticks; tick++) {
    current = step(current, []).state;
  }
  return current;
}

export function fresh(seed = 1): { state: State; capital: number; home: number } {
  const state = cloneState(createWorld({ seed }));
  const capital = state.powers[0].capital;
  return { state, capital, home: state.map.cells[capital].region };
}

export function ownNeighbor(state: State, cell: number): number {
  const owner = state.cells[cell].owner;
  const link = state.map.links[cell].find(
    (candidate) => state.cells[candidate.cell].owner === owner,
  );
  if (link === undefined) {
    throw new Error("the cell has no neighbor of the same owner");
  }
  return link.cell;
}

export function neutralNeighbor(state: State, power: number): { from: number; to: number } {
  for (let from = 0; from < state.cells.length; from++) {
    if (state.cells[from].owner !== power) {
      continue;
    }
    const link = state.map.links[from].find(
      (candidate) => state.cells[candidate.cell].owner === null,
    );
    if (link !== undefined) {
      return { from, to: link.cell };
    }
  }
  throw new Error("the power touches no neutral cell");
}

export function fill(state: State, cell: number, branch: number): void {
  const target = state.cells[cell];
  target.level = state.map.cells[cell].levelCap;
  target.branches = target.branches.map((_, index) => (index === branch ? target.level : 0));
}

export function cellsHeld(state: State, power: number, region?: number): number {
  return state.cells.filter(
    (cell, id) =>
      cell.owner === power && (region === undefined || state.map.cells[id].region === region),
  ).length;
}
