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
  return base * (1 + constants.roadGain * state.joints[joint].grade);
}

export function lossOf(constants: Constants, grade: number): number {
  return constants.hopLoss * constants.roadRelief ** grade;
}

export function passOf(state: State, joint: number): number {
  return 1 - lossOf(state.constants, state.joints[joint].grade);
}

export function roadCostOf(constants: Constants, grade: number): number {
  return constants.roadCost * (grade + 1);
}

export function roadUpkeepOf(state: State): number[] {
  const { cells, constants } = state;
  const upkeep = new Array<number>(cells.length).fill(0);
  state.joints.forEach((joint, id) => {
    if (joint.grade <= 0) {
      return;
    }
    const { a, b } = state.map.joints[id];
    if (cells[a].owner === null || cells[a].owner !== cells[b].owner) {
      return;
    }
    const share = (constants.upkeepPerRoad * joint.grade) / 2;
    upkeep[a] += share;
    upkeep[b] += share;
  });
  return upkeep;
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

export function energyNeedOf(state: State, cell: number, resting: number): number {
  const { constants } = state;
  const current = state.cells[cell];
  const fielded = current.force - resting * (1 - constants.restUpkeep);
  return (
    constants.upkeepPerLevel * current.level +
    constants.upkeepPerForce * fielded +
    constants.upkeepPerQuarter * current.quarters
  );
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

export function spread(state: State, source: number[]): number[] {
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
    for (const link of map.links[cell]) {
      if (cells[link.cell].owner !== owner) {
        continue;
      }
      const carried = potential[cell] * passOf(state, link.joint);
      if (carried <= potential[link.cell] + EPSILON) {
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
  const floor = potential[cell] + EPSILON;
  let best: Link | null = null;
  let bestPull = 0;
  for (const link of state.map.links[cell]) {
    if (state.cells[link.cell].owner !== owner || potential[link.cell] <= floor) {
      continue;
    }
    const pull = potential[link.cell] * passOf(state, link.joint);
    if (pull > bestPull) {
      best = link;
      bestPull = pull;
    }
  }
  return best;
}

export function hubOf(state: State, power: number, region: number): number | null {
  const { cells, map } = state;
  const capital = state.powers[power].capital;
  if (map.cells[capital].region === region && cells[capital].owner === power) {
    return capital;
  }
  let hub: number | null = null;
  for (const cell of map.regions[region].cells) {
    if (cells[cell].owner !== power) {
      continue;
    }
    if (hub === null || map.cells[cell].levelCap > map.cells[hub].levelCap) {
      hub = cell;
    }
  }
  return hub;
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
