import { housingOf, quartersLimitOf, wantedQuartersOf } from "./bases.ts";
import { commitmentOf } from "./conflict.ts";
import { visibleRegions } from "./explore.ts";
import { ticksToFallOf } from "./flags.ts";
import { forceCapsOf, forceFieldOf } from "./force.ts";
import { lanesOf } from "./front.ts";
import { capacityOf, defenseOf, heldOf, holds, hubOf } from "./rules.ts";
import {
  BRANCHES,
  type GameEvent,
  type JointKind,
  KINDS,
  type MapEdge,
  type MapRegion,
  type Neighbor,
  type StarSystem,
  type State,
  type Vector,
  type WorldMap,
} from "./types.ts";

export const NEUTRAL = -1;
export const UNSEEN = -2;
export const GROUND = { unknown: 0, plain: 1, mountain: 2 };

const FLOW_FLOOR = 1e-4;
const PUSH_FLOOR = 0.05;

export interface Outline {
  cells: { position: Vector; region: number }[];
  regions: MapRegion[];
  joints: { a: number; b: number; edge: number | null; strait: boolean }[];
  edges: MapEdge[];
  neighbors: Neighbor[][];
  system: StarSystem;
  reach: number;
}

export interface Nature {
  cells: number;
  mountains: number;
  deposits: number[];
  energyRichness: number;
  levelCap: number;
}

export interface HoldingView {
  owner: number | null;
  cells: number;
  level: number;
  force: number;
  profile: number[];
  defense: number;
  contact: number;
  reach: number;
}

export interface Estate {
  matter: number;
  dial: number;
  garrison: number | null;
  reinforcement: number;
  quarters: number;
  quartersWanted: number;
  quartersLimit: number;
  supply: number;
  levelCap: number;
  bare: number;
  falling: number;
  fallsIn: number | null;
  exposure: number;
  hostile: number;
}

export interface RegionView {
  id: number;
  nature: Nature | null;
  holdings: HoldingView[] | null;
  estate: Estate | null;
}

export interface EdgeView {
  id: number;
  kind: JointKind | null;
  capacity: number | null;
  road: boolean;
  open: boolean;
  load: number;
}

export interface Breach {
  joint: number;
  progress: number;
}

export interface PressureView {
  power: number;
  region: number;
  target: number | null;
  activeAt: number;
  aim: number | null;
  commit: number;
  breaches: Breach[];
}

export interface CellLayer {
  ground: number[];
  cap: number[];
  owner: number[];
  level: number[];
  force: number[];
  quarters: number[];
  flag: number[];
}

export interface FlowView {
  joint: number;
  matter: number;
  force: number;
  energy: number;
}

export interface View {
  tick: number;
  power: number;
  alive: boolean[];
  lean: number[];
  army: number;
  forward: number;
  forceCap: number;
  housing: number;
  regions: RegionView[];
  edges: EdgeView[];
  pressures: PressureView[];
  cells: CellLayer;
  roads: number[];
  flows: FlowView[];
}

export function outlineOf(map: WorldMap): Outline {
  return {
    cells: map.cells.map((cell) => ({ position: cell.position, region: cell.region })),
    regions: map.regions,
    joints: map.joints.map((joint) => ({
      a: joint.a,
      b: joint.b,
      edge: joint.edge,
      strait: joint.kind === "strait",
    })),
    edges: map.edges,
    neighbors: map.neighbors,
    system: map.system,
    reach: map.reach,
  };
}

function natureOf(state: State, region: MapRegion): Nature {
  const places = region.cells.map((cell) => state.map.cells[cell]);
  const mean = (read: (index: number) => number) =>
    places.reduce((sum, _, index) => sum + read(index), 0) / places.length;
  return {
    cells: places.length,
    mountains: places.filter((place) => place.terrain === "mountain").length,
    deposits: KINDS.map((_, kind) => mean((index) => places[index].deposits[kind])),
    energyRichness: mean((index) => places[index].energyRichness),
    levelCap: places.reduce((sum, place) => sum + place.levelCap, 0),
  };
}

function holdingsOf(state: State, region: MapRegion, viewer: number): HoldingView[] {
  const { cells, map, constants } = state;
  const holdings = new Map<number | null, HoldingView>();
  const facing = new Map<number | null, { defense: number; cells: number }>();
  const overall = new Map<number | null, number>();
  for (const id of region.cells) {
    const cell = cells[id];
    let holding = holdings.get(cell.owner);
    if (holding === undefined) {
      holding = {
        owner: cell.owner,
        cells: 0,
        level: 0,
        force: 0,
        profile: BRANCHES.map(() => 0),
        defense: 0,
        contact: 0,
        reach: 0,
      };
      holdings.set(cell.owner, holding);
    }
    holding.cells += 1;
    holding.level += cell.level;
    holding.force += cell.force;
    for (let branch = 0; branch < holding.profile.length; branch++) {
      holding.profile[branch] += cell.branches[branch];
    }
    const defense = defenseOf(state, id);
    overall.set(cell.owner, (overall.get(cell.owner) ?? 0) + defense);
    if (cell.owner === viewer) {
      continue;
    }
    let touched = false;
    for (const link of map.links[id]) {
      if (cells[link.cell].owner === viewer) {
        touched = true;
        holding.contact += 1;
        holding.reach += capacityOf(state, link.joint) * constants.pressurePerCapacity;
      }
    }
    if (touched) {
      const front = facing.get(cell.owner) ?? { defense: 0, cells: 0 };
      front.defense += defense;
      front.cells += 1;
      facing.set(cell.owner, front);
    }
  }
  return [...holdings.values()]
    .map((holding) => {
      const front = facing.get(holding.owner);
      const defense =
        front === undefined
          ? (overall.get(holding.owner) ?? 0) / holding.cells
          : front.defense / front.cells;
      return { ...holding, defense };
    })
    .sort((left, right) => (left.owner ?? NEUTRAL) - (right.owner ?? NEUTRAL));
}

function estateOf(
  state: State,
  region: MapRegion,
  viewer: number,
  wanted: number[],
): Estate | null {
  const { cells, map } = state;
  const own = region.cells.filter((cell) => cells[cell].owner === viewer);
  if (own.length === 0) {
    return null;
  }
  const orders = state.powers[viewer].holdings[region.id];
  const rivals = new Set<number>();
  for (const cell of own) {
    for (const link of map.links[cell]) {
      const other = cells[link.cell].owner;
      if (other !== null && other !== viewer) {
        rivals.add(link.cell);
      }
    }
  }
  let hostile = 0;
  for (const cell of rivals) {
    hostile += cells[cell].force;
  }
  const hub = hubOf(state, viewer, region.id);
  const falls = own.flatMap((cell) => ticksToFallOf(state, cell) ?? []);
  return {
    matter: own.reduce((sum, cell) => sum + heldOf(cells[cell].stock), 0),
    dial: orders.dial,
    garrison: orders.garrison,
    reinforcement: orders.reinforcement,
    quarters: own.reduce((sum, cell) => sum + cells[cell].quarters, 0),
    quartersWanted: hub === null ? 0 : wanted[hub],
    quartersLimit: hub === null ? 0 : quartersLimitOf(state, hub),
    supply: own.reduce((sum, cell) => sum + cells[cell].supply, 0) / own.length,
    levelCap: own.reduce((sum, cell) => sum + map.cells[cell].levelCap, 0),
    bare: own.filter((cell) => cells[cell].level === 0).length,
    falling: falls.length,
    fallsIn: falls.length > 0 ? Math.min(...falls) : null,
    exposure: rivals.size,
    hostile,
  };
}

function kindOf(state: State, edge: MapEdge): JointKind {
  const kinds = edge.joints.map((joint) => state.map.joints[joint].kind);
  if (kinds.includes("strait")) {
    return "strait";
  }
  return kinds.every((kind) => kind === "pass") ? "pass" : "land";
}

function loadOf(state: State, edge: MapEdge, viewer: number): number {
  const { cells, map } = state;
  let load = 0;
  for (const joint of edge.joints) {
    const { a, b } = map.joints[joint];
    if (cells[a].owner === viewer && cells[b].owner === viewer) {
      load = Math.max(load, state.joints[joint].load);
    }
  }
  return load;
}

function pressuresOf(state: State, viewer: number, visible: Set<number>): PressureView[] {
  const { map } = state;
  const shown = state.pressures.map(
    (pressure) => pressure.power === viewer || visible.has(pressure.region),
  );
  const views = state.pressures.map(
    ({ power, region, target, activeAt, aim }): PressureView => ({
      power,
      region,
      target,
      activeAt,
      aim,
      commit: 0,
      breaches: [],
    }),
  );
  if (shown.includes(true)) {
    const lanes = lanesOf(state);
    const { active, commits } = commitmentOf(state, lanes, forceFieldOf(state, lanes).rest);
    active.forEach((lane, index) => {
      const view = views[lane.pressure];
      view.commit += commits[index];
      const progress = state.cells[lane.to].siege[view.power];
      const seen =
        visible.has(map.cells[lane.from].region) && visible.has(map.cells[lane.to].region);
      if (seen && commits[index] >= PUSH_FLOOR && progress > 0) {
        view.breaches.push({ joint: lane.joint, progress });
      }
    });
  }
  return views.filter((_, index) => shown[index]);
}

export function viewFor(state: State, power: number): View {
  const { map } = state;
  const visible = visibleRegions(state, power);
  const explored = state.powers[power].explored;

  const layer: CellLayer = {
    ground: [],
    cap: [],
    owner: [],
    level: [],
    force: [],
    quarters: [],
    flag: [],
  };
  state.cells.forEach((cell, id) => {
    const place = map.cells[id];
    const known = explored[place.region];
    const seen = visible.has(place.region);
    layer.ground.push(known ? GROUND[place.terrain] : GROUND.unknown);
    layer.cap.push(known ? place.levelCap : 0);
    layer.owner.push(seen ? (cell.owner ?? NEUTRAL) : UNSEEN);
    layer.level.push(seen ? cell.level : 0);
    layer.force.push(seen ? cell.force : 0);
    layer.quarters.push(seen ? Math.round(cell.quarters) : 0);
    layer.flag.push(seen ? Math.round(cell.flag * 100) / 100 : 1);
  });

  const wanted = wantedQuartersOf(state);
  const regions = map.regions.map(
    (region): RegionView => ({
      id: region.id,
      nature: explored[region.id] ? natureOf(state, region) : null,
      holdings: visible.has(region.id) ? holdingsOf(state, region, power) : null,
      estate: estateOf(state, region, power, wanted),
    }),
  );

  const edges = map.edges.map((edge): EdgeView => {
    const known = explored[edge.a] || explored[edge.b];
    return {
      id: edge.id,
      kind: known ? kindOf(state, edge) : null,
      capacity: known
        ? edge.joints.reduce((sum, joint) => sum + capacityOf(state, joint), 0)
        : null,
      road: state.powers[power].roads[edge.id],
      open: holds(state, power, edge.a) && holds(state, power, edge.b),
      load: loadOf(state, edge, power),
    };
  });

  const roads = state.joints.map((joint, id) => {
    const { a, b } = map.joints[id];
    const seen = visible.has(map.cells[a].region) && visible.has(map.cells[b].region);
    return seen ? joint.grade : 0;
  });

  const flows: FlowView[] = [];
  state.joints.forEach((flow, joint) => {
    const { a, b } = map.joints[joint];
    const own = state.cells[a].owner === power && state.cells[b].owner === power;
    const moving =
      Math.abs(flow.matterFlow) > FLOW_FLOOR ||
      Math.abs(flow.forceFlow) > FLOW_FLOOR ||
      Math.abs(flow.energyFlow) > FLOW_FLOOR;
    if (own && moving) {
      flows.push({
        joint,
        matter: flow.matterFlow,
        force: flow.forceFlow,
        energy: flow.energyFlow,
      });
    }
  });

  return {
    tick: state.tick,
    power,
    alive: state.powers.map((holder) => holder.alive),
    lean: state.powers[power].lean.slice(),
    army: state.powers[power].army,
    forward: state.powers[power].forward,
    forceCap: forceCapsOf(state)[power],
    housing: housingOf(state, power),
    regions,
    edges,
    pressures: pressuresOf(state, power, visible),
    cells: layer,
    roads,
    flows,
  };
}

export function eventsFor(state: State, power: number, events: GameEvent[]): GameEvent[] {
  const visible = visibleRegions(state, power);
  return events.filter((event) => {
    if (event.kind === "eliminated") {
      return true;
    }
    if (event.kind === "discovered") {
      return event.power === power;
    }
    if (event.power === power || visible.has(event.region)) {
      return true;
    }
    if (event.kind === "announced") {
      return event.target === power;
    }
    return event.kind === "expelled" && event.by === power;
  });
}
