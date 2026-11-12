import { EPSILON, hubOf } from "./rules.ts";
import type { State } from "./types.ts";

export function quartersLimitOf(state: State, cell: number): number {
  const { constants } = state;
  return constants.quartersBase + constants.quartersPerLevel * state.cells[cell].level;
}

export function wantedQuartersOf(state: State): number[] {
  const wanted = new Array<number>(state.cells.length).fill(0);
  state.powers.forEach((power, id) => {
    if (!power.alive) {
      return;
    }
    power.holdings.forEach((orders, region) => {
      if (orders.garrison <= 0) {
        return;
      }
      const hub = hubOf(state, id, region);
      if (hub !== null) {
        wanted[hub] = Math.min(orders.garrison, quartersLimitOf(state, hub));
      }
    });
  });
  return wanted;
}

export function quarterUseOf(state: State, cell: number, wanted: number[]): number {
  const { constants } = state;
  const missing = wanted[cell] - state.cells[cell].quarters;
  return missing > EPSILON ? Math.min(constants.quarterRate, missing * constants.quarterCost) : 0;
}

export function settleQuarters(state: State, wanted: number[]): void {
  const decay = state.constants.quarterDecay;
  state.cells.forEach((cell, id) => {
    const kept = cell.owner === null ? 0 : wanted[id];
    if (cell.quarters > kept) {
      cell.quarters = Math.max(kept, cell.quarters - decay);
    }
  });
}
