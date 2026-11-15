import { widthOf } from "./force.ts";
import type { Lane } from "./front.ts";
import type { Ledger } from "./ledger.ts";
import { blankOrders, cellsOf, defenseOf, EPSILON, FULL_SIEGE, holds } from "./rules.ts";
import type { Constants, GameEvent, State } from "./types.ts";

export interface Commitment {
  active: Lane[];
  commits: number[];
  walls: Map<number, number>;
  totals: Map<number, number[]>;
}

export function siegeGainOf(constants: Constants, total: number, wall: number): number {
  return constants.siegeRate * Math.min(total / wall - 1, FULL_SIEGE - 1);
}

export function wearOf(constants: Constants, total: number, wall: number): number {
  return Math.min(total, wall) * constants.attrition;
}

export function commitmentOf(state: State, lanes: Lane[], posts: number[]): Commitment {
  const { cells } = state;
  const powerCount = state.powers.length;
  const active = lanes.filter((lane) => state.pressures[lane.pressure].activeAt <= state.tick);
  const walls = new Map<number, number>();
  const origins = new Map<number, number[]>();
  active.forEach((lane, index) => {
    if (!walls.has(lane.to)) {
      walls.set(lane.to, defenseOf(state, lane.to));
    }
    origins.set(lane.from, [...(origins.get(lane.from) ?? []), index]);
  });
  const wallOf = (cell: number) => walls.get(cell) ?? 0;

  const commits = new Array<number>(active.length).fill(0);
  for (const [origin, indices] of origins) {
    let available = Math.max(0, cells[origin].force - posts[origin]);
    indices.sort(
      (left, right) =>
        wallOf(active[left].to) - wallOf(active[right].to) || active[left].to - active[right].to,
    );
    let engaged = false;
    for (const index of indices) {
      const lane = active[index];
      const wall = wallOf(lane.to);
      const given = Math.min(available, widthOf(state, lane), FULL_SIEGE * wall);
      if (given <= EPSILON || (engaged && given <= wall)) {
        continue;
      }
      commits[index] = given;
      available -= given;
      engaged = true;
    }
  }

  const totals = new Map<number, number[]>();
  const tally = () => {
    totals.clear();
    active.forEach((lane, index) => {
      let row = totals.get(lane.to);
      if (row === undefined) {
        row = new Array<number>(powerCount).fill(0);
        totals.set(lane.to, row);
      }
      row[state.pressures[lane.pressure].power] += commits[index];
    });
  };
  tally();
  active.forEach((lane, index) => {
    const power = state.pressures[lane.pressure].power;
    const hopeless = (totals.get(lane.to)?.[power] ?? 0) <= wallOf(lane.to);
    if (cells[lane.to].owner === null && hopeless) {
      commits[index] = 0;
    }
  });
  tally();
  return { active, commits, walls, totals };
}

export function resolveConflict(
  state: State,
  lanes: Lane[],
  posts: number[],
  events: GameEvent[],
  ledger: Ledger | null = null,
): void {
  const { constants, cells } = state;
  const powerCount = state.powers.length;
  const { active, commits, walls, totals } = commitmentOf(state, lanes, posts);
  const wallOf = (cell: number) => walls.get(cell) ?? 0;
  const wear = (cell: number, loss: number) => {
    const worn = Math.min(cells[cell].force, loss);
    cells[cell].force -= worn;
    if (ledger !== null) {
      ledger.force.fought[cell] += worn;
    }
  };

  active.forEach((lane, index) => {
    const total = totals.get(lane.to)?.[state.pressures[lane.pressure].power] ?? 0;
    if (total <= EPSILON) {
      return;
    }
    const engaged = wearOf(constants, total, wallOf(lane.to));
    wear(lane.from, (engaged * commits[index]) / total);
  });

  const fallen: [cell: number, winner: number][] = [];
  cells.forEach((cell, target) => {
    const row = totals.get(target);
    const wall = wallOf(target);
    let loss = 0;
    let winner = -1;
    for (let power = 0; power < powerCount; power++) {
      const total = row?.[power] ?? 0;
      if (total > wall) {
        cell.siege[power] += siegeGainOf(constants, total, wall);
      } else if (cell.siege[power] > 0) {
        cell.siege[power] = Math.max(0, cell.siege[power] - constants.siegeDecay);
      }
      loss += wearOf(constants, total, wall) * constants.defenderLossShare;
      if (cell.siege[power] >= 1 && (winner < 0 || cell.siege[power] > cell.siege[winner])) {
        winner = power;
      }
    }
    wear(target, loss);
    if (winner >= 0) {
      fallen.push([target, winner]);
    }
  });

  for (const [target, winner] of fallen) {
    wear(target, cells[target].force);
    capture(state, target, winner, events);
  }
  if (fallen.length > 0) {
    prunePressures(state);
  }
}

export function prunePressures(state: State): void {
  state.pressures = state.pressures.filter(
    (pressure) =>
      state.powers[pressure.power].alive &&
      cellsOf(state, pressure.region, pressure.target).length > 0,
  );
}

export function vacate(state: State, power: number, region: number): boolean {
  if (holds(state, power, region)) {
    return false;
  }
  state.powers[power].holdings[region] = blankOrders(state.constants);
  return true;
}

function capture(state: State, target: number, winner: number, events: GameEvent[]): void {
  const { constants } = state;
  const cell = state.cells[target];
  const loser = cell.owner;
  const region = state.map.cells[target].region;
  const entering = !holds(state, winner, region);

  const kept = Math.round(cell.level * (1 - constants.captureLevelLoss));
  const scale = cell.level > 0 ? kept / cell.level : 0;
  cell.branches = cell.branches.map((built) => built * scale);
  cell.level = kept;
  cell.owner = winner;
  cell.progress = 0;
  cell.force = 0;
  cell.quarters *= 1 - constants.captureLevelLoss;
  cell.supply = 1;
  cell.siege.fill(0);
  cell.flag = 1;

  if (entering) {
    events.push({ kind: "entered", power: winner, region });
  }
  if (state.map.regions[region].cells.every((member) => state.cells[member].owner === winner)) {
    events.push({ kind: "secured", power: winner, region });
  }
  if (loser === null) {
    return;
  }
  if (vacate(state, loser, region)) {
    events.push({ kind: "expelled", power: loser, region, by: winner });
  }
  relocateCapital(state, loser, events);
}

export function relocateCapital(state: State, power: number, events: GameEvent[]): void {
  const holder = state.powers[power];
  if (state.cells[holder.capital].owner === power) {
    return;
  }
  let successor = -1;
  state.cells.forEach((candidate, cell) => {
    if (candidate.owner !== power) {
      return;
    }
    if (successor < 0 || candidate.level > state.cells[successor].level) {
      successor = cell;
    }
  });
  if (successor >= 0) {
    holder.capital = successor;
    return;
  }
  holder.alive = false;
  events.push({ kind: "eliminated", power });
}
