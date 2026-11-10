import type { SeatInfo, TimeState, Triggers } from "@barycenter/protocol";
import type { Constants, GameEvent, NodeView, Outline, View } from "@barycenter/sim";

export interface Game {
  room: string;
  seat: number;
  tuning: boolean;
  tickRate: number;
  outline: Outline;
  constants: Constants;
  time: TimeState;
  seats: SeatInfo[];
  triggers: Triggers;
  view: View;
}

export interface Report {
  tick: number;
  text: string;
  node: number | null;
  urgent: boolean;
}

export interface Summary {
  nodes: number;
  levels: number;
  force: number;
  matter: number;
}

export function summarize(view: View): Summary {
  const summary = { nodes: 0, levels: 0, force: 0, matter: 0 };
  for (const node of view.nodes) {
    if (node.holding !== null && node.status !== null) {
      summary.nodes += 1;
      summary.levels += node.status.level;
      summary.force += node.status.force;
      summary.matter += node.holding.matter;
    }
  }
  return summary;
}

export function nameOf(game: Game, power: number | null): string {
  if (power === null) {
    return "nobody";
  }
  return power === game.seat ? "you" : (game.seats[power]?.label ?? `power ${power}`);
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function isMine(game: Game, node: NodeView): boolean {
  return node.status?.owner === game.seat;
}

export function report(game: Game, event: GameEvent): Report {
  const tick = game.view.tick;
  const me = game.seat;
  if (event.kind === "eliminated") {
    const text = `${capitalized(nameOf(game, event.power))} lost the last region`;
    return { tick, text, node: null, urgent: event.power === me };
  }
  if (event.kind === "discovered") {
    return { tick, text: `Discovered region ${event.node}`, node: event.node, urgent: false };
  }
  if (event.kind === "captured") {
    const taker = capitalized(nameOf(game, event.to));
    const text =
      event.from === null
        ? `${taker} settled region ${event.node}`
        : `${taker} took region ${event.node} from ${nameOf(game, event.from)}`;
    return { tick, text, node: event.node, urgent: event.from === me || event.to === me };
  }
  const attacker = capitalized(nameOf(game, event.power));
  const wait = Math.max(0, event.activeAt - tick);
  const text = `${attacker} will press region ${event.to} of ${nameOf(game, event.target)} from region ${event.from} in ${wait} ticks`;
  return { tick, text, node: event.to, urgent: event.target === me };
}

export function reachOf(game: Game, edge: number): number {
  return (game.view.edges[edge].capacity ?? 0) * game.constants.pressurePerCapacity;
}

export function levelCostOf(game: Game, level: number): number {
  return game.constants.levelCost * (level + 1);
}

export function expansionCostOf(game: Game, expansions: number): number {
  return game.constants.expandCost * (expansions + 1);
}
