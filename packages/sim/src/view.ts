import { visibleNodes } from "./explore.ts";
import { capacityOf, defenseOf } from "./rules.ts";
import type { EdgeKind, GameEvent, Link, Role, State, Terrain, Vector, WorldMap } from "./types.ts";

export interface Outline {
  nodes: { id: number; position: Vector }[];
  edges: { id: number; a: number; b: number }[];
  links: Link[][];
  oceans: Vector[];
}

export interface Nature {
  terrain: Terrain;
  matterRichness: number;
  energyRichness: number;
  levelCap: number;
}

export interface Status {
  owner: number | null;
  level: number;
  role: Role | null;
  force: number;
  supply: number;
  defense: number;
}

export interface Holding {
  matter: number;
  progress: number;
  dial: number;
  garrison: number;
}

export interface NodeView {
  id: number;
  nature: Nature | null;
  status: Status | null;
  holding: Holding | null;
}

export interface EdgeView {
  id: number;
  kind: EdgeKind | null;
  capacity: number | null;
  expansions: number | null;
  expanding: number | null;
  matterFlow: number;
  forceFlow: number;
  energyFlow: number;
}

export interface PressureView {
  power: number;
  from: number;
  to: number;
  activeAt: number;
  commit: number;
}

export interface View {
  tick: number;
  power: number;
  alive: boolean[];
  nodes: NodeView[];
  edges: EdgeView[];
  pressures: PressureView[];
}

export function outlineOf(map: WorldMap): Outline {
  return {
    nodes: map.nodes.map((node) => ({ id: node.id, position: node.position })),
    edges: map.edges.map((edge) => ({ id: edge.id, a: edge.a, b: edge.b })),
    links: map.links,
    oceans: map.oceans,
  };
}

export function viewFor(state: State, power: number): View {
  const visible = visibleNodes(state, power);
  const explored = state.powers[power].explored;

  const nodes = state.nodes.map((node, id): NodeView => {
    const place = state.map.nodes[id];
    return {
      id,
      nature: explored[id]
        ? {
            terrain: place.terrain,
            matterRichness: place.matterRichness,
            energyRichness: place.energyRichness,
            levelCap: place.levelCap,
          }
        : null,
      status: visible.has(id)
        ? {
            owner: node.owner,
            level: node.level,
            role: node.role,
            force: node.force,
            supply: node.supply,
            defense: defenseOf(state, id),
          }
        : null,
      holding:
        node.owner === power
          ? {
              matter: node.matter,
              progress: node.progress,
              dial: node.dial,
              garrison: node.garrison,
            }
          : null,
    };
  });

  const edges = state.edges.map((edge, id): EdgeView => {
    const route = state.map.edges[id];
    const known = explored[route.a] || explored[route.b];
    const internal = state.nodes[route.a].owner === power && state.nodes[route.b].owner === power;
    return {
      id,
      kind: known ? route.kind : null,
      capacity: known ? capacityOf(state, id) : null,
      expansions: known ? edge.expansions : null,
      expanding: visible.has(route.a) || visible.has(route.b) ? edge.expanding : null,
      matterFlow: internal ? edge.matterFlow : 0,
      forceFlow: internal ? edge.forceFlow : 0,
      energyFlow: internal ? edge.energyFlow : 0,
    };
  });

  const pressures = state.pressures
    .filter((pressure) => visible.has(pressure.from) || visible.has(pressure.to))
    .map((pressure) => ({
      power: pressure.power,
      from: pressure.from,
      to: pressure.to,
      activeAt: pressure.activeAt,
      commit: pressure.commit,
    }));

  return {
    tick: state.tick,
    power,
    alive: state.powers.map((holder) => holder.alive),
    nodes,
    edges,
    pressures,
  };
}

export function eventsFor(state: State, power: number, events: GameEvent[]): GameEvent[] {
  const visible = visibleNodes(state, power);
  return events.filter((event) => {
    if (event.kind === "eliminated") {
      return true;
    }
    if (event.kind === "discovered") {
      return event.power === power;
    }
    if (event.kind === "captured") {
      return event.from === power || event.to === power || visible.has(event.node);
    }
    const involved = event.power === power || event.target === power;
    return involved || visible.has(event.from) || visible.has(event.to);
  });
}
