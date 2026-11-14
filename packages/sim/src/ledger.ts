import type { State } from "./types.ts";

export interface Haul {
  from: number;
  to: number;
  sent: number;
  arrived: number;
}

export interface MatterLedger {
  made: number[];
  asked: number[];
  levels: number[];
  roads: number[];
  quarters: number[];
  force: number[];
  hauls: Haul[];
}

export interface EnergyLedger {
  made: number[];
  levels: number[];
  force: number[];
  quarters: number[];
  roads: number[];
  met: number[];
  spare: number[];
  hauls: Haul[];
}

export interface ForceLedger {
  yards: number[];
  fought: number[];
  starved: number[];
  stranded: number[];
  crowded: number[];
  hauls: Haul[];
}

export interface Ledger {
  matter: MatterLedger;
  energy: EnergyLedger;
  force: ForceLedger;
  wants: number[][];
}

export function createLedger(state: State): Ledger {
  const blank = () => new Array<number>(state.cells.length).fill(0);
  return {
    matter: {
      made: blank(),
      asked: blank(),
      levels: blank(),
      roads: blank(),
      quarters: blank(),
      force: blank(),
      hauls: [],
    },
    energy: {
      made: blank(),
      levels: blank(),
      force: blank(),
      quarters: blank(),
      roads: blank(),
      met: blank(),
      spare: blank(),
      hauls: [],
    },
    force: {
      yards: blank(),
      fought: blank(),
      starved: blank(),
      stranded: blank(),
      crowded: blank(),
      hauls: [],
    },
    wants: [],
  };
}
