import type { Constants, Link, State } from "./types.ts";

export const EPSILON = 1e-9;
export const EXTRACTION = 0;
export const POWER = 1;
export const SHIPYARD = 2;
export const FULL_SIEGE = 2;

export function capacityOf(state: State, joint: number): number {
  const { constants } = state;
  const route = state.map.joints[joint];
  const base =
    route.kind === "land"
      ? constants.landCapacity
      : route.kind === "pass"
        ? constants.passCapacity
        : constants.straitCapacity;
  if (route.edge === null) {
    return base;
  }
  return base * (1 + constants.expandGain * state.edges[route.edge].expansions);
}

export function defenseOf(state: State, cell: number): number {
  const { constants } = state;
  const target = state.cells[cell];
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

export function matterYieldOf(state: State, cell: number): number {
  const { constants } = state;
  const current = state.cells[cell];
  const extraction = constants.matterRate * current.branches[EXTRACTION];
  return (constants.baseMatter + extraction) * outputOf(constants, current.supply);
}

export function energyProductionOf(state: State, cell: number): number {
  const { constants } = state;
  const generation = constants.energyRate * state.cells[cell].branches[POWER];
  return state.map.cells[cell].energyRichness * (constants.baseEnergy + generation);
}

export function energyNeedOf(state: State, cell: number): number {
  const { constants } = state;
  const current = state.cells[cell];
  return constants.upkeepPerLevel * current.level + constants.upkeepPerForce * current.force;
}

export function heldOf(stock: number[]): number {
  let sum = 0;
  for (const amount of stock) {
    sum += amount;
  }
  return sum;
}

export function takeFrom(stock: number[], amount: number): number[] {
  const held = heldOf(stock);
  const share = held > EPSILON ? Math.min(1, amount / held) : 0;
  return stock.map((value, kind) => {
    const taken = value * share;
    stock[kind] = value - taken;
    return taken;
  });
}

export function addTo(stock: number[], amounts: number[]): void {
  for (let kind = 0; kind < stock.length; kind++) {
    stock[kind] += amounts[kind];
  }
}

export function dialOf(state: State, cell: number): number {
  const owner = state.cells[cell].owner;
  return owner === null ? 0 : state.powers[owner].holdings[state.map.cells[cell].region].dial;
}

export function spread(state: State, source: number[], reach: number): number[] {
  const { cells, map } = state;
  const potential = source.slice();
  const waiting = new Array<boolean>(cells.length).fill(false);
  const queue: number[] = [];
  for (let cell = 0; cell < cells.length; cell++) {
    if (cells[cell].owner !== null && potential[cell] > EPSILON) {
      queue.push(cell);
      waiting[cell] = true;
    }
  }
  queue.sort((left, right) => potential[right] - potential[left] || left - right);
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    waiting[cell] = false;
    const owner = cells[cell].owner;
    const carried = potential[cell] * reach;
    for (const link of map.links[cell]) {
      if (cells[link.cell].owner !== owner || carried <= potential[link.cell] + EPSILON) {
        continue;
      }
      potential[link.cell] = carried;
      if (!waiting[link.cell]) {
        waiting[link.cell] = true;
        queue.push(link.cell);
      }
    }
  }
  return potential;
}

export function bestLink(state: State, cell: number, potential: number[]): Link | null {
  const owner = state.cells[cell].owner;
  let best: Link | null = null;
  let bestPotential = potential[cell] + EPSILON;
  for (const link of state.map.links[cell]) {
    if (state.cells[link.cell].owner !== owner) {
      continue;
    }
    if (potential[link.cell] > bestPotential) {
      best = link;
      bestPotential = potential[link.cell];
    }
  }
  return best;
}

export function signedFlow(state: State, joint: number, from: number, amount: number): number {
  return state.map.joints[joint].a === from ? amount : -amount;
}

export function cellsOf(state: State, region: number, owner: number | null): number[] {
  return state.map.regions[region].cells.filter((cell) => state.cells[cell].owner === owner);
}

export function holds(state: State, power: number, region: number): boolean {
  return state.map.regions[region].cells.some((cell) => state.cells[cell].owner === power);
}
