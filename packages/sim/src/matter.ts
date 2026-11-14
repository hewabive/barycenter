import { quarterUseOf } from "./bases.ts";
import type { Ledger } from "./ledger.ts";
import { advanceRoad, wantedGradeOf } from "./roads.ts";
import {
  addTo,
  bestLink,
  capacityOf,
  dialOf,
  EPSILON,
  heldOf,
  levelCostOf,
  matterYieldOf,
  outputOf,
  POWER,
  passOf,
  SHIPYARD,
  signedFlow,
  spread,
  takeFrom,
} from "./rules.ts";
import type { State } from "./types.ts";

export interface Work {
  joint: number;
  rate: number;
}

export interface MatterField {
  reserve: number[];
  potential: number[];
}

export function worksOf(state: State, trunks: boolean[]): Work[][] {
  const { cells, map, constants } = state;
  const works: Work[][] = cells.map(() => []);
  state.joints.forEach((joint, id) => {
    const { a, b } = map.joints[id];
    if (cells[a].owner === null || cells[a].owner !== cells[b].owner) {
      return;
    }
    if (joint.grade >= wantedGradeOf(state, id, trunks)) {
      return;
    }
    works[a].push({ joint: id, rate: constants.roadRate / 2 });
    works[b].push({ joint: id, rate: constants.roadRate / 2 });
  });
  return works;
}

function yardOf(state: State, cell: number): number {
  const { constants } = state;
  const current = state.cells[cell];
  const output = outputOf(constants, current.supply);
  return current.branches[SHIPYARD] * constants.shipyardRate * output;
}

function shipyardUse(state: State, cell: number, arming: boolean[]): number {
  const current = state.cells[cell];
  if (current.owner === null || !arming[current.owner]) {
    return 0;
  }
  return yardOf(state, cell) * state.constants.forceCost;
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

export function matterFieldOf(
  state: State,
  works: Work[][],
  arming: boolean[],
  quarters: number[],
): MatterField {
  const { constants, cells } = state;
  const reserve = cells.map((cell, id) => {
    if (cell.owner === null) {
      return 0;
    }
    const build = canGrow(state, id) ? constants.buildRate : 0;
    const total =
      worksUse(works[id]) +
      quarterUseOf(state, id, quarters) +
      shipyardUse(state, id, arming) +
      build;
    return dialOf(state, id) * total * constants.reserveTicks;
  });
  const attraction = cells.map((cell, id) =>
    heldOf(cell.stock) < reserve[id] ? dialOf(state, id) : 0,
  );
  return { reserve, potential: spread(state, attraction) };
}

export function produceMatter(state: State, ledger: Ledger | null = null): void {
  state.cells.forEach((cell, id) => {
    if (cell.owner === null) {
      return;
    }
    const yielded = matterYieldOf(state, id);
    const deposits = state.map.cells[id].deposits;
    for (let kind = 0; kind < cell.stock.length; kind++) {
      cell.stock[kind] += deposits[kind] * yielded;
    }
    if (ledger !== null) {
      ledger.matter.made[id] = heldOf(deposits) * yielded;
    }
  });
}

export function spendMatter(
  state: State,
  works: Work[][],
  room: number[],
  quarters: number[],
  wants: number[][],
  ledger: Ledger | null = null,
): void {
  const { constants } = state;
  const arming = room.map((left) => left > EPSILON);
  state.cells.forEach((current, id) => {
    if (current.owner === null) {
      return;
    }
    const short = current.supply < 1 - EPSILON;
    const pace = short ? wants[id][POWER] : 1;
    const build = canGrow(state, id) ? constants.buildRate * pace : 0;
    const shipyard = Math.min(
      shipyardUse(state, id, arming),
      room[current.owner] * constants.forceCost,
    );
    const housing = quarterUseOf(state, id, quarters);
    const total = worksUse(works[id]) + housing + shipyard + build;
    if (ledger !== null) {
      ledger.force.yards[id] = yardOf(state, id);
      ledger.matter.asked[id] = dialOf(state, id) * total;
    }
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

    let paved = 0;
    for (const work of works[id]) {
      const spent = take(work.rate);
      advanceRoad(state, work.joint, spent);
      paved += spent;
    }
    const housed = take(housing);
    current.quarters += housed / constants.quarterCost;
    const arms = take(shipyard);
    const armed = arms / constants.forceCost;
    current.force += armed;
    room[current.owner] -= armed;
    const raised = take(build);
    current.progress += raised;

    const cap = state.map.cells[id].levelCap;
    while (current.level < cap && current.progress >= levelCostOf(constants, current.level)) {
      current.progress -= levelCostOf(constants, current.level);
      current.level += 1;
      for (let branch = 0; branch < current.branches.length; branch++) {
        current.branches[branch] += short ? (branch === POWER ? 1 : 0) : wants[id][branch];
      }
    }
    const returned = current.level >= cap ? current.progress : 0;
    current.stock[0] += returned;
    current.progress -= returned;
    if (ledger !== null) {
      ledger.matter.roads[id] = paved;
      ledger.matter.quarters[id] = housed;
      ledger.matter.force[id] = arms;
      ledger.matter.levels[id] = raised - returned;
    }
  });
}

export function routeMatter(state: State, field: MatterField, ledger: Ledger | null = null): void {
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
    const pass = passOf(state, link.joint);
    const moved = takeFrom(current.stock, amount).map((taken) => taken * pass);
    if (arrivals[link.cell].length === 0) {
      arrivals[link.cell] = moved;
    } else {
      addTo(arrivals[link.cell], moved);
    }
    state.joints[link.joint].matterFlow += signedFlow(state, link.joint, cell, amount);
    ledger?.matter.hauls.push({ from: cell, to: link.cell, sent: amount, arrived: heldOf(moved) });
  }
  for (let cell = 0; cell < cells.length; cell++) {
    if (arrivals[cell].length > 0) {
      addTo(cells[cell].stock, arrivals[cell]);
    }
  }
}
