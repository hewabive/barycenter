import {
  addTo,
  bestLink,
  capacityOf,
  dialOf,
  EPSILON,
  expansionCostOf,
  heldOf,
  levelCostOf,
  matterYieldOf,
  outputOf,
  POWER,
  SHIPYARD,
  signedFlow,
  spread,
  takeFrom,
} from "./rules.ts";
import type { State } from "./types.ts";

export interface Work {
  edge: number;
  rate: number;
}

export interface MatterField {
  reserve: number[];
  potential: number[];
}

export function worksOf(state: State): Work[][] {
  const { cells, map } = state;
  const works: Work[][] = cells.map(() => []);
  state.edges.forEach((edge, id) => {
    const builder = edge.expanding;
    if (builder === null) {
      return;
    }
    const crew = new Set<number>();
    for (const joint of map.edges[id].joints) {
      for (const cell of [map.joints[joint].a, map.joints[joint].b]) {
        if (cells[cell].owner === builder) {
          crew.add(cell);
        }
      }
    }
    if (crew.size === 0) {
      edge.expanding = null;
      return;
    }
    for (const cell of crew) {
      works[cell].push({ edge: id, rate: state.constants.expandRate / crew.size });
    }
  });
  return works;
}

function shipyardUse(state: State, cell: number, forceWanted: boolean[]): number {
  const { constants } = state;
  const current = state.cells[cell];
  if (current.owner === null || !forceWanted[current.owner]) {
    return 0;
  }
  const output = outputOf(constants, current.supply);
  return current.branches[SHIPYARD] * constants.shipyardRate * constants.forceCost * output;
}

function canGrow(state: State, cell: number): boolean {
  return state.cells[cell].level < state.map.cells[cell].levelCap;
}

function worksUse(works: Work[]): number {
  let sum = 0;
  for (const work of works) {
    sum += work.rate;
  }
  return sum;
}

export function matterFieldOf(state: State, works: Work[][], forceWanted: boolean[]): MatterField {
  const { constants, cells } = state;
  const reserve = cells.map((cell, id) => {
    if (cell.owner === null) {
      return 0;
    }
    const build = canGrow(state, id) ? constants.buildRate : 0;
    const total = worksUse(works[id]) + shipyardUse(state, id, forceWanted) + build;
    return dialOf(state, id) * total * constants.reserveTicks;
  });
  const attraction = cells.map((cell, id) =>
    heldOf(cell.stock) < reserve[id] ? dialOf(state, id) : 0,
  );
  return { reserve, potential: spread(state, attraction, constants.matterReach) };
}

export function produceMatter(state: State): void {
  state.cells.forEach((cell, id) => {
    if (cell.owner === null) {
      return;
    }
    const yielded = matterYieldOf(state, id);
    const deposits = state.map.cells[id].deposits;
    for (let kind = 0; kind < cell.stock.length; kind++) {
      cell.stock[kind] += deposits[kind] * yielded;
    }
  });
}

export function spendMatter(
  state: State,
  works: Work[][],
  forceWanted: boolean[],
  wants: number[][],
): void {
  const { constants } = state;
  state.cells.forEach((current, id) => {
    if (current.owner === null) {
      return;
    }
    const short = current.supply < 1 - EPSILON;
    const pace = short ? wants[id][POWER] : 1;
    const build = canGrow(state, id) ? constants.buildRate * pace : 0;
    const shipyard = shipyardUse(state, id, forceWanted);
    const total = worksUse(works[id]) + shipyard + build;
    if (total <= 0) {
      return;
    }
    let budget = Math.min(heldOf(current.stock), dialOf(state, id) * total);
    const take = (limit: number) => {
      const spent = Math.min(budget, limit);
      budget -= spent;
      takeFrom(current.stock, spent);
      return spent;
    };

    for (const work of works[id]) {
      advanceExpansion(state, work.edge, take(work.rate));
    }
    current.force += take(shipyard) / constants.forceCost;
    current.progress += take(build);

    const cap = state.map.cells[id].levelCap;
    while (current.level < cap && current.progress >= levelCostOf(constants, current.level)) {
      current.progress -= levelCostOf(constants, current.level);
      current.level += 1;
      for (let branch = 0; branch < current.branches.length; branch++) {
        current.branches[branch] += short ? (branch === POWER ? 1 : 0) : wants[id][branch];
      }
    }
    if (current.level >= cap) {
      current.stock[0] += current.progress;
      current.progress = 0;
    }
  });
}

function advanceExpansion(state: State, edge: number, spent: number): void {
  const current = state.edges[edge];
  if (current.expanding === null) {
    return;
  }
  current.progress += spent;
  const cost = expansionCostOf(state.constants, current.expansions);
  if (current.progress < cost) {
    return;
  }
  current.progress = 0;
  current.expansions += 1;
  current.expanding = null;
}

export function routeMatter(state: State, field: MatterField): void {
  const { cells } = state;
  for (const joint of state.joints) {
    joint.matterFlow = 0;
  }
  const arrivals: number[][] = cells.map(() => []);
  for (let cell = 0; cell < cells.length; cell++) {
    const current = cells[cell];
    const spare = heldOf(current.stock) - field.reserve[cell];
    if (current.owner === null || spare <= EPSILON) {
      continue;
    }
    const link = bestLink(state, cell, field.potential);
    if (link === null) {
      continue;
    }
    const amount = Math.min(spare, capacityOf(state, link.joint));
    const moved = takeFrom(current.stock, amount);
    if (arrivals[link.cell].length === 0) {
      arrivals[link.cell] = moved;
    } else {
      addTo(arrivals[link.cell], moved);
    }
    state.joints[link.joint].matterFlow += signedFlow(state, link.joint, cell, amount);
  }
  for (let cell = 0; cell < cells.length; cell++) {
    if (arrivals[cell].length > 0) {
      addTo(cells[cell].stock, arrivals[cell]);
    }
  }
}
