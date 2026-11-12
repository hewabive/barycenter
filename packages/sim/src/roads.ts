import { bestLink, capacityOf, holds, hubOf, roadCostOf, spread } from "./rules.ts";
import type { State } from "./types.ts";

export function lapseRoads(state: State): void {
  state.powers.forEach((power, id) => {
    power.roads.forEach((ordered, edge) => {
      if (!ordered) {
        return;
      }
      const { a, b } = state.map.edges[edge];
      if (!power.alive || !holds(state, id, a) || !holds(state, id, b)) {
        power.roads[edge] = false;
      }
    });
  });
}

export function trunksOf(state: State): boolean[] {
  const { cells, map } = state;
  const trunks = new Array<boolean>(state.joints.length).fill(false);
  state.powers.forEach((power, id) => {
    power.roads.forEach((ordered, edge) => {
      if (!ordered) {
        return;
      }
      const from = hubOf(state, id, map.edges[edge].a);
      const to = hubOf(state, id, map.edges[edge].b);
      if (from === null || to === null) {
        return;
      }
      const source = new Array<number>(cells.length).fill(0);
      source[to] = 1;
      const potential = spread(state, source);
      for (let link = bestLink(state, from, potential); link !== null; ) {
        trunks[link.joint] = true;
        link = bestLink(state, link.cell, potential);
      }
    });
  });
  return trunks;
}

export function wantedGradeOf(state: State, joint: number, trunks: boolean[]): number {
  const { constants } = state;
  const current = state.joints[joint];
  if (trunks[joint]) {
    return constants.maxGrade;
  }
  const busy = current.load >= constants.roadDemand;
  return Math.min(constants.maxGrade, current.grade + (busy ? 1 : 0));
}

export function advanceRoad(state: State, joint: number, spent: number): void {
  const { constants } = state;
  const current = state.joints[joint];
  current.progress += spent;
  const cost = roadCostOf(constants, current.grade);
  if (current.progress >= cost && current.grade < constants.maxGrade) {
    current.progress -= cost;
    current.grade += 1;
  }
}

export function wearRoads(state: State, trunks: boolean[]): void {
  const { constants } = state;
  state.joints.forEach((joint, id) => {
    const capacity = capacityOf(state, id);
    const load = Math.max(
      Math.abs(joint.matterFlow) / capacity,
      Math.abs(joint.forceFlow) / (capacity * constants.forcePerCapacity),
    );
    joint.load += (load - joint.load) * constants.roadMemory;
    if (trunks[id] || joint.load >= constants.roadKeep) {
      return;
    }
    if (joint.grade <= 0 && joint.progress <= 0) {
      return;
    }
    joint.progress -= constants.roadDecay;
    if (joint.grade <= 0) {
      joint.progress = Math.max(0, joint.progress);
      return;
    }
    if (joint.progress <= -roadCostOf(constants, joint.grade - 1)) {
      joint.grade -= 1;
      joint.progress = 0;
    }
  });
}
