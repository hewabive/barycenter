import {
  bestLink,
  EPSILON,
  energyNeedOf,
  energyProductionOf,
  passOf,
  roadUpkeepOf,
  signedFlow,
  spread,
} from "./rules.ts";
import type { State } from "./types.ts";

export function distributeEnergy(state: State): void {
  const { constants, cells } = state;
  for (const joint of state.joints) {
    joint.energyFlow = 0;
  }

  const roads = roadUpkeepOf(state);
  const need = cells.map((cell, id) =>
    cell.owner === null ? 0 : energyNeedOf(state, id) + roads[id],
  );
  const surplus = new Array<number>(cells.length).fill(0);
  const deficit = new Array<number>(cells.length).fill(0);
  for (let cell = 0; cell < cells.length; cell++) {
    if (cells[cell].owner === null) {
      continue;
    }
    const balance = energyProductionOf(state, cell) - need[cell];
    surplus[cell] = Math.max(0, balance);
    deficit[cell] = Math.max(0, -balance);
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
      arrivals[link.cell] += surplus[cell] * passOf(state, link.joint);
      state.joints[link.joint].energyFlow += signedFlow(state, link.joint, cell, surplus[cell]);
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
  }
}
