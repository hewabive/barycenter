import type { Ledger } from "./ledger.ts";
import {
  bestLink,
  EPSILON,
  energyProductionOf,
  passOf,
  roadUpkeepOf,
  signedFlow,
  spread,
  upkeepOf,
} from "./rules.ts";
import type { State } from "./types.ts";

export function distributeEnergy(state: State, rest: number[], ledger: Ledger | null = null): void {
  const { constants, cells } = state;
  for (const joint of state.joints) {
    joint.energyFlow = 0;
  }

  const roads = roadUpkeepOf(state);
  const need = cells.map((cell, id) => {
    if (cell.owner === null) {
      return 0;
    }
    const upkeep = upkeepOf(state, id, rest[id]);
    if (ledger !== null) {
      ledger.energy.levels[id] = upkeep.levels;
      ledger.energy.force[id] = upkeep.force;
      ledger.energy.quarters[id] = upkeep.quarters;
      ledger.energy.roads[id] = roads[id];
    }
    return upkeep.levels + upkeep.force + upkeep.quarters + roads[id];
  });
  const surplus = new Array<number>(cells.length).fill(0);
  const deficit = new Array<number>(cells.length).fill(0);
  for (let cell = 0; cell < cells.length; cell++) {
    if (cells[cell].owner === null) {
      continue;
    }
    const made = energyProductionOf(state, cell);
    const balance = made - need[cell];
    surplus[cell] = Math.max(0, balance);
    deficit[cell] = Math.max(0, -balance);
    if (ledger !== null) {
      ledger.energy.made[cell] = made;
    }
  }

  for (let round = 0; round < constants.energyRounds; round++) {
    const shortage = deficit.map((missing) => (missing > EPSILON ? 1 : 0));
    const potential = spread(state, shortage);
    const arrivals = new Array<number>(cells.length).fill(0);
    let moved = false;
    for (let cell = 0; cell < cells.length; cell++) {
      if (surplus[cell] <= EPSILON) {
        continue;
      }
      const link = bestLink(state, cell, potential);
      if (link === null) {
        continue;
      }
      const arrived = surplus[cell] * passOf(state, link.joint);
      arrivals[link.cell] += arrived;
      state.joints[link.joint].energyFlow += signedFlow(state, link.joint, cell, surplus[cell]);
      ledger?.energy.hauls.push({ from: cell, to: link.cell, sent: surplus[cell], arrived });
      surplus[cell] = 0;
      moved = true;
    }
    if (!moved) {
      break;
    }
    for (let cell = 0; cell < cells.length; cell++) {
      const used = Math.min(deficit[cell], arrivals[cell]);
      deficit[cell] -= used;
      surplus[cell] += arrivals[cell] - used;
    }
  }

  for (let cell = 0; cell < cells.length; cell++) {
    cells[cell].supply = need[cell] > EPSILON ? 1 - deficit[cell] / need[cell] : 1;
    if (ledger !== null) {
      ledger.energy.met[cell] = need[cell] - deficit[cell];
      ledger.energy.spare[cell] = surplus[cell];
    }
  }
}
