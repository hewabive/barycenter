import { capacityOf, defenseOf, EPSILON } from "./rules.ts";
import type { GameEvent, State } from "./types.ts";

export function resolveConflict(state: State, events: GameEvent[]): void {
  const { constants, nodes } = state;
  const powerCount = state.powers.length;

  const sharing = new Map<number, number>();
  const active = state.pressures.filter((pressure) => pressure.activeAt <= state.tick);
  for (const pressure of state.pressures) {
    pressure.commit = 0;
  }
  for (const pressure of active) {
    sharing.set(pressure.from, (sharing.get(pressure.from) ?? 0) + 1);
  }
  for (const pressure of active) {
    const source = nodes[pressure.from];
    const available = Math.max(0, source.force - source.garrison);
    const limit = capacityOf(state, pressure.edge) * constants.pressurePerCapacity;
    pressure.commit = Math.min(available / (sharing.get(pressure.from) ?? 1), limit);
  }

  const totals = nodes.map(() => new Array<number>(powerCount).fill(0));
  for (const pressure of active) {
    totals[pressure.to][pressure.power] += pressure.commit;
  }
  const defense = nodes.map((_, id) => defenseOf(state, id));

  for (const pressure of active) {
    const total = totals[pressure.to][pressure.power];
    if (total <= EPSILON) {
      continue;
    }
    const engaged = Math.min(total, defense[pressure.to]) * constants.attrition;
    const source = nodes[pressure.from];
    source.force = Math.max(0, source.force - (engaged * pressure.commit) / total);
  }

  for (let target = 0; target < nodes.length; target++) {
    const node = nodes[target];
    let garrisonLoss = 0;
    for (let power = 0; power < powerCount; power++) {
      const total = totals[target][power];
      if (total > defense[target]) {
        node.siege[power] += constants.siegeRate * Math.min(total / defense[target] - 1, 1);
      } else {
        node.siege[power] = Math.max(0, node.siege[power] - constants.siegeDecay);
      }
      garrisonLoss +=
        Math.min(total, defense[target]) * constants.attrition * constants.defenderLossShare;
    }
    node.force = Math.max(0, node.force - garrisonLoss);
  }

  for (let target = 0; target < nodes.length; target++) {
    const siege = nodes[target].siege;
    let winner = -1;
    for (let power = 0; power < powerCount; power++) {
      if (siege[power] >= 1 && (winner < 0 || siege[power] > siege[winner])) {
        winner = power;
      }
    }
    if (winner >= 0) {
      capture(state, target, winner, events);
    }
  }
}

function capture(state: State, target: number, winner: number, events: GameEvent[]): void {
  const { constants } = state;
  const node = state.nodes[target];
  const loser = node.owner;

  node.owner = winner;
  node.level = Math.round(node.level * (1 - constants.captureLevelLoss));
  node.progress = 0;
  node.force = 0;
  node.dial = constants.defaultDial;
  node.garrison = 0;
  node.supply = 1;
  node.siege.fill(0);
  events.push({ kind: "captured", node: target, from: loser, to: winner });

  state.pressures = state.pressures.filter(
    (pressure) => pressure.to !== target && pressure.from !== target,
  );
  for (const link of state.map.links[target]) {
    const edge = state.edges[link.edge];
    if (edge.expanding === null) {
      continue;
    }
    const route = state.map.edges[link.edge];
    const stillTouches =
      state.nodes[route.a].owner === edge.expanding ||
      state.nodes[route.b].owner === edge.expanding;
    if (!stillTouches) {
      edge.expanding = null;
    }
  }

  if (loser !== null) {
    relocateCapital(state, loser, events);
  }
}

function relocateCapital(state: State, power: number, events: GameEvent[]): void {
  const holder = state.powers[power];
  if (state.nodes[holder.capital].owner === power) {
    return;
  }
  let successor = -1;
  for (let node = 0; node < state.nodes.length; node++) {
    const candidate = state.nodes[node];
    if (candidate.owner !== power) {
      continue;
    }
    if (successor < 0 || candidate.level > state.nodes[successor].level) {
      successor = node;
    }
  }
  if (successor >= 0) {
    holder.capital = successor;
    return;
  }
  holder.alive = false;
  state.pressures = state.pressures.filter((pressure) => pressure.power !== power);
  events.push({ kind: "eliminated", power });
}
