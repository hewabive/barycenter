import type { GameEvent, State } from "./types.ts";

export function visibleNodes(state: State, power: number): Set<number> {
  const visible = new Set<number>();
  let frontier: number[] = [];
  for (let node = 0; node < state.nodes.length; node++) {
    if (state.nodes[node].owner === power) {
      visible.add(node);
      frontier.push(node);
    }
  }
  for (let range = 0; range < state.constants.visionRange; range++) {
    const next: number[] = [];
    for (const node of frontier) {
      for (const link of state.map.links[node]) {
        if (!visible.has(link.node)) {
          visible.add(link.node);
          next.push(link.node);
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
    for (const node of visibleNodes(state, power)) {
      if (!explored[node]) {
        explored[node] = true;
        events.push({ kind: "discovered", power, node });
      }
    }
  }
}
