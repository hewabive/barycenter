import { bestLink, capacityOf, EPSILON, signedFlow, spread } from "./rules.ts";
import type { State } from "./types.ts";

export function forceWantedBy(state: State): boolean[] {
  const wanted = state.powers.map(() => false);
  for (const pressure of state.pressures) {
    wanted[pressure.power] = true;
  }
  for (const node of state.nodes) {
    if (node.owner !== null && node.force < node.garrison - EPSILON) {
      wanted[node.owner] = true;
    }
  }
  return wanted;
}

export function routeForce(state: State): void {
  const { constants, nodes } = state;
  for (const edge of state.edges) {
    edge.forceFlow = 0;
  }

  const attacking = new Set<number>();
  const held = nodes.map((node) => node.garrison);
  for (const pressure of state.pressures) {
    attacking.add(pressure.from);
    held[pressure.from] += capacityOf(state, pressure.edge) * constants.pressurePerCapacity;
  }
  const demand = nodes.map((node, id) => {
    if (node.owner === null || node.force >= held[id] - EPSILON) {
      return 0;
    }
    return attacking.has(id) ? 1 : constants.garrisonPull;
  });
  const potential = spread(state, demand, constants.forceReach);

  const arrivals = new Array<number>(nodes.length).fill(0);
  for (let node = 0; node < nodes.length; node++) {
    const current = nodes[node];
    const free = current.force - held[node];
    if (current.owner === null || free <= EPSILON) {
      continue;
    }
    const link = bestLink(state, node, potential);
    if (link === null) {
      continue;
    }
    const amount = Math.min(free, capacityOf(state, link.edge) * constants.forcePerCapacity);
    current.force -= amount;
    arrivals[link.node] += amount;
    state.edges[link.edge].forceFlow += signedFlow(state, link.edge, node, amount);
  }
  for (let node = 0; node < nodes.length; node++) {
    nodes[node].force += arrivals[node];
  }
}

export function decayForce(state: State): void {
  for (const node of state.nodes) {
    if (node.owner !== null && node.supply < 1) {
      node.force -= node.force * state.constants.forceDecay * (1 - node.supply);
    }
  }
}
