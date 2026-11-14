import { prunePressures, relocateCapital, vacate } from "./conflict.ts";
import type { Ledger } from "./ledger.ts";
import { EPSILON, heldOf } from "./rules.ts";
import type { GameEvent, State } from "./types.ts";

interface Lapse {
  power: number;
  region: number;
  cells: number;
}

export function flagLossOf(state: State, cell: number): number {
  const current = state.cells[cell];
  if (current.owner === null || current.level > 0) {
    return 0;
  }
  return state.constants.flagFall * (1 - current.supply);
}

export function ticksToFallOf(state: State, cell: number): number | null {
  const loss = flagLossOf(state, cell);
  return loss > EPSILON ? Math.ceil(state.cells[cell].flag / loss) : null;
}

export function settleFlags(state: State, events: GameEvent[], ledger: Ledger | null = null): void {
  const { constants, cells, map } = state;
  const lapses: Lapse[] = [];
  cells.forEach((cell, id) => {
    if (cell.owner === null) {
      return;
    }
    const loss = flagLossOf(state, id);
    if (loss <= EPSILON) {
      cell.flag = Math.min(1, cell.flag + constants.flagRise);
      return;
    }
    cell.flag -= loss;
    if (cell.flag > 0) {
      return;
    }
    const power = cell.owner;
    const region = map.cells[id].region;
    if (ledger !== null) {
      ledger.matter.abandoned[id] = heldOf(cell.stock);
      ledger.force.abandoned[id] = cell.force;
    }
    cell.owner = null;
    cell.progress = 0;
    cell.stock.fill(0);
    cell.force = 0;
    cell.quarters = 0;
    cell.supply = 1;
    cell.siege.fill(0);
    cell.flag = 1;
    const known = lapses.find((lapse) => lapse.power === power && lapse.region === region);
    if (known === undefined) {
      lapses.push({ power, region, cells: 1 });
    } else {
      known.cells += 1;
    }
  });
  for (const { power, region, cells: count } of lapses) {
    const left = vacate(state, power, region);
    events.push({ kind: "lapsed", power, region, cells: count, left });
    relocateCapital(state, power, events);
  }
  if (lapses.length > 0) {
    prunePressures(state);
  }
}
