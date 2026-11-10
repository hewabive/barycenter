import type { Constants, Link, State } from "./types.ts";

export const EPSILON = 1e-9;

export function capacityOf(state: State, edge: number): number {
  const growth = 1 + state.constants.expandGain * state.edges[edge].expansions;
  return state.map.edges[edge].baseCapacity * growth;
}

export function defenseOf(state: State, node: number): number {
  const { constants } = state;
  const target = state.nodes[node];
  const base = target.owner === null ? constants.neutralDefense : constants.defenseBase;
  return base + constants.defensePerLevel * target.level + constants.defensePerForce * target.force;
}

export function levelCostOf(constants: Constants, level: number): number {
  return constants.levelCost * (level + 1);
}

export function expansionCostOf(constants: Constants, expansions: number): number {
  return constants.expandCost * (expansions + 1);
}

export function outputOf(constants: Constants, supply: number): number {
  return constants.shortageOutput + (1 - constants.shortageOutput) * supply;
}

export function matterProductionOf(state: State, node: number): number {
  const { constants } = state;
  const current = state.nodes[node];
  const richness = state.map.nodes[node].matterRichness;
  const extraction = current.role === "extraction" ? constants.matterRate * current.level : 0;
  return richness * (constants.baseMatter + extraction) * outputOf(constants, current.supply);
}

export function energyProductionOf(state: State, node: number): number {
  const { constants } = state;
  const current = state.nodes[node];
  const richness = state.map.nodes[node].energyRichness;
  const generation = current.role === "power" ? constants.energyRate * current.level : 0;
  return richness * (constants.baseEnergy + generation);
}

export function energyNeedOf(state: State, node: number): number {
  const { constants } = state;
  const current = state.nodes[node];
  return constants.upkeepPerLevel * current.level + constants.upkeepPerForce * current.force;
}

export function spread(state: State, source: number[], reach: number): number[] {
  const potential = source.slice();
  let changed = true;
  while (changed) {
    changed = false;
    for (let node = 0; node < potential.length; node++) {
      const owner = state.nodes[node].owner;
      if (owner === null) {
        continue;
      }
      for (const link of state.map.links[node]) {
        if (state.nodes[link.node].owner !== owner) {
          continue;
        }
        const carried = potential[link.node] * reach;
        if (carried > potential[node] + EPSILON) {
          potential[node] = carried;
          changed = true;
        }
      }
    }
  }
  return potential;
}

export function bestLink(state: State, node: number, potential: number[]): Link | null {
  const owner = state.nodes[node].owner;
  let best: Link | null = null;
  let bestPotential = potential[node] + EPSILON;
  for (const link of state.map.links[node]) {
    if (state.nodes[link.node].owner !== owner) {
      continue;
    }
    if (potential[link.node] > bestPotential) {
      best = link;
      bestPotential = potential[link.node];
    }
  }
  return best;
}

export function signedFlow(state: State, edge: number, from: number, amount: number): number {
  return state.map.edges[edge].a === from ? amount : -amount;
}
