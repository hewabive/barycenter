import {
  bestLink,
  EPSILON,
  energyNeedOf,
  energyProductionOf,
  signedFlow,
  spread,
} from "./rules.ts";
import type { State } from "./types.ts";

export function distributeEnergy(state: State): void {
  const { constants, nodes } = state;
  for (const edge of state.edges) {
    edge.energyFlow = 0;
  }

  const need = nodes.map((node, id) => (node.owner === null ? 0 : energyNeedOf(state, id)));
  const surplus = new Array<number>(nodes.length).fill(0);
  const deficit = new Array<number>(nodes.length).fill(0);
  for (let node = 0; node < nodes.length; node++) {
    if (nodes[node].owner === null) {
      continue;
    }
    const balance = energyProductionOf(state, node) - need[node];
    surplus[node] = Math.max(0, balance);
    deficit[node] = Math.max(0, -balance);
  }

  for (let round = 0; round < constants.energyRounds; round++) {
    const shortage = deficit.map((missing) => (missing > EPSILON ? 1 : 0));
    const potential = spread(state, shortage, constants.energyFade);
    const arrivals = new Array<number>(nodes.length).fill(0);
    let moved = false;
    for (let node = 0; node < nodes.length; node++) {
      if (surplus[node] <= EPSILON) {
        continue;
      }
      const link = bestLink(state, node, potential);
      if (link === null) {
        continue;
      }
      arrivals[link.node] += surplus[node] * constants.energyFade;
      state.edges[link.edge].energyFlow += signedFlow(state, link.edge, node, surplus[node]);
      surplus[node] = 0;
      moved = true;
    }
    if (!moved) {
      break;
    }
    for (let node = 0; node < nodes.length; node++) {
      const used = Math.min(deficit[node], arrivals[node]);
      deficit[node] -= used;
      surplus[node] += arrivals[node] - used;
    }
  }

  for (let node = 0; node < nodes.length; node++) {
    nodes[node].supply = need[node] > EPSILON ? 1 - deficit[node] / need[node] : 1;
  }
}
