import { holds } from "./rules.ts";
import type { GameEvent, State } from "./types.ts";

export function visibleRegions(state: State, power: number): Set<number> {
  const visible = new Set<number>();
  let frontier: number[] = [];
  for (const region of state.map.regions) {
    if (holds(state, power, region.id)) {
      visible.add(region.id);
      frontier.push(region.id);
    }
  }
  for (let range = 0; range < state.constants.visionRange; range++) {
    const next: number[] = [];
    for (const region of frontier) {
      for (const neighbor of state.map.neighbors[region]) {
        if (!visible.has(neighbor.region)) {
          visible.add(neighbor.region);
          next.push(neighbor.region);
        }
      }
    }
    frontier = next;
  }
  return visible;
}

export function explore(state: State, events: GameEvent[]): void {
  for (let power = 0; power < state.powers.length; power++) {
    const explored = state.powers[power].explored;
    for (const region of visibleRegions(state, power)) {
      if (!explored[region]) {
        explored[region] = true;
        events.push({ kind: "discovered", power, region });
      }
    }
  }
}
