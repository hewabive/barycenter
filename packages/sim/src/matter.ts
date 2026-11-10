import {
  bestLink,
  capacityOf,
  EPSILON,
  expansionCostOf,
  levelCostOf,
  matterProductionOf,
  outputOf,
  signedFlow,
  spread,
} from "./rules.ts";
import type { State } from "./types.ts";

interface Usage {
  expanding: number[];
  shipyard: number;
  build: number;
  total: number;
}

function usageOf(state: State, node: number, forceWanted: boolean[]): Usage {
  const { constants } = state;
  const current = state.nodes[node];
  const owner = current.owner;
  if (owner === null) {
    return { expanding: [], shipyard: 0, build: 0, total: 0 };
  }
  const expanding = state.map.links[node]
    .filter((link) => state.edges[link.edge].expanding === owner)
    .map((link) => link.edge);
  const shipyard =
    current.role === "shipyard" && forceWanted[owner]
      ? current.level *
        constants.shipyardRate *
        constants.forceCost *
        outputOf(constants, current.supply)
      : 0;
  const powered = current.role === "power" || current.supply >= 1 - EPSILON;
  const canGrow = current.role !== null && current.level < state.map.nodes[node].levelCap;
  const build = canGrow && powered ? constants.buildRate : 0;
  return {
    expanding,
    shipyard,
    build,
    total: expanding.length * constants.expandRate + shipyard + build,
  };
}

export function produceMatter(state: State): void {
  for (let node = 0; node < state.nodes.length; node++) {
    if (state.nodes[node].owner !== null) {
      state.nodes[node].matter += matterProductionOf(state, node);
    }
  }
}

export function spendMatter(state: State, forceWanted: boolean[]): void {
  const { constants } = state;
  for (let node = 0; node < state.nodes.length; node++) {
    const current = state.nodes[node];
    const usage = usageOf(state, node, forceWanted);
    if (usage.total <= 0) {
      continue;
    }
    let budget = Math.min(current.matter, current.dial * usage.total);
    const take = (limit: number) => {
      const spent = Math.min(budget, limit);
      budget -= spent;
      current.matter -= spent;
      return spent;
    };

    for (const edge of usage.expanding) {
      advanceExpansion(state, edge, take(constants.expandRate));
    }
    current.force += take(usage.shipyard) / constants.forceCost;
    current.progress += take(usage.build);

    const cap = state.map.nodes[node].levelCap;
    while (current.level < cap && current.progress >= levelCostOf(constants, current.level)) {
      current.progress -= levelCostOf(constants, current.level);
      current.level += 1;
    }
    if (current.level >= cap) {
      current.matter += current.progress;
      current.progress = 0;
    }
  }
}

function advanceExpansion(state: State, edge: number, spent: number): void {
  const current = state.edges[edge];
  current.progress += spent;
  const cost = expansionCostOf(state.constants, current.expansions);
  if (current.progress < cost) {
    return;
  }
  current.progress = 0;
  current.expansions += 1;
  current.expanding = null;
}

export function routeMatter(state: State, forceWanted: boolean[]): void {
  const { constants, nodes } = state;
  for (const edge of state.edges) {
    edge.matterFlow = 0;
  }

  const reserve = nodes.map((node, id) => {
    const usage = usageOf(state, id, forceWanted);
    return node.dial * usage.total * constants.reserveTicks;
  });
  const attraction = nodes.map((node, id) => (node.matter < reserve[id] ? node.dial : 0));
  const potential = spread(state, attraction, constants.matterReach);

  const arrivals = new Array<number>(nodes.length).fill(0);
  for (let node = 0; node < nodes.length; node++) {
    const current = nodes[node];
    const spare = current.matter - reserve[node];
    if (current.owner === null || spare <= EPSILON) {
      continue;
    }
    const link = bestLink(state, node, potential);
    if (link === null) {
      continue;
    }
    const amount = Math.min(spare, capacityOf(state, link.edge));
    current.matter -= amount;
    arrivals[link.node] += amount;
    state.edges[link.edge].matterFlow += signedFlow(state, link.edge, node, amount);
  }
  for (let node = 0; node < nodes.length; node++) {
    nodes[node].matter += arrivals[node];
  }
}
