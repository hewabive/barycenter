import { EPSILON, hubOf } from "./rules.ts";
import type { State } from "./types.ts";

const DEPTH_LIMIT = 8;

interface Slot {
  hub: number;
  limit: number;
  weight: number;
}

export function quartersLimitOf(state: State, cell: number): number {
  const { constants } = state;
  return constants.quartersBase + constants.quartersPerLevel * state.cells[cell].level;
}

export function depthsOf(state: State): number[] {
  const { cells, map } = state;
  const facing = state.powers.map(() => false);
  const edged = state.powers.map(() => false);
  const rivals = cells.map((cell, id) => {
    const met = map.links[id].some((link) => {
      const other = cells[link.cell].owner;
      return other !== null && other !== cell.owner;
    });
    if (cell.owner !== null && met) {
      facing[cell.owner] = true;
    }
    return met;
  });
  const free = cells.map((cell, id) => {
    const open = map.links[id].some((link) => cells[link.cell].owner === null);
    if (cell.owner !== null && open) {
      edged[cell.owner] = true;
    }
    return open;
  });

  const depths = new Array<number>(cells.length).fill(DEPTH_LIMIT);
  const queue: number[] = [];
  cells.forEach((cell, id) => {
    if (cell.owner === null) {
      return;
    }
    const frontier = facing[cell.owner] ? rivals[id] : !edged[cell.owner] || free[id];
    if (frontier) {
      depths[id] = 0;
      queue.push(id);
    }
  });
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    const next = depths[cell] + 1;
    if (next >= DEPTH_LIMIT) {
      continue;
    }
    for (const link of map.links[cell]) {
      if (cells[link.cell].owner === cells[cell].owner && depths[link.cell] > next) {
        depths[link.cell] = next;
        queue.push(link.cell);
      }
    }
  }
  return depths;
}

function allot(pool: number, slots: Slot[], wanted: number[]): void {
  let left = pool;
  let open = slots;
  while (left > EPSILON && open.length > 0) {
    const sum = open.reduce((total, slot) => total + slot.weight, 0);
    if (sum <= EPSILON) {
      return;
    }
    const share = left / sum;
    const full = open.filter((slot) => slot.weight * share >= slot.limit);
    if (full.length === 0) {
      for (const slot of open) {
        wanted[slot.hub] = slot.weight * share;
      }
      return;
    }
    for (const slot of full) {
      wanted[slot.hub] = slot.limit;
      left -= slot.limit;
    }
    open = open.filter((slot) => !full.includes(slot));
  }
}

export function wantedQuartersOf(state: State): number[] {
  const { constants } = state;
  const wanted = new Array<number>(state.cells.length).fill(0);
  const depths = depthsOf(state);
  state.powers.forEach((power, id) => {
    if (!power.alive) {
      return;
    }
    const lean = constants.forwardSpan * (2 * power.forward - 1);
    const slots: Slot[] = [];
    let pool = power.army;
    power.holdings.forEach((orders, region) => {
      const hub = hubOf(state, id, region);
      if (hub === null) {
        return;
      }
      const limit = quartersLimitOf(state, hub);
      if (orders.garrison === null) {
        slots.push({ hub, limit, weight: limit * 2 ** (-lean * depths[hub]) });
        return;
      }
      wanted[hub] = Math.min(orders.garrison, limit);
      pool -= wanted[hub];
    });
    allot(pool, slots, wanted);
  });
  return wanted;
}

export function housingOf(state: State, power: number): number {
  let housing = 0;
  for (const region of state.map.regions) {
    const hub = hubOf(state, power, region.id);
    if (hub !== null) {
      housing += quartersLimitOf(state, hub);
    }
  }
  return housing;
}

export function quarterUseOf(state: State, cell: number, wanted: number[]): number {
  const { constants } = state;
  const missing = wanted[cell] - state.cells[cell].quarters;
  return missing > EPSILON ? Math.min(constants.quarterRate, missing * constants.quarterCost) : 0;
}

export function settleQuarters(state: State, wanted: number[]): void {
  const decay = state.constants.quarterDecay;
  state.cells.forEach((cell, id) => {
    const kept = cell.owner === null ? 0 : wanted[id];
    if (cell.quarters > kept) {
      cell.quarters = Math.max(kept, cell.quarters - decay);
    }
  });
}
