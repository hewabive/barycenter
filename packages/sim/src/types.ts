export type Role = "extraction" | "power" | "shipyard";
export type Terrain = "plain" | "mountain";
export type EdgeKind = "land" | "pass" | "strait";

export interface Vector {
  x: number;
  y: number;
  z: number;
}

export interface MapNode {
  id: number;
  position: Vector;
  terrain: Terrain;
  matterRichness: number;
  energyRichness: number;
  levelCap: number;
}

export interface MapEdge {
  id: number;
  a: number;
  b: number;
  kind: EdgeKind;
  baseCapacity: number;
}

export interface Link {
  node: number;
  edge: number;
}

export interface WorldMap {
  seed: number;
  nodes: MapNode[];
  edges: MapEdge[];
  links: Link[][];
  oceans: Vector[];
}

export interface NodeState {
  owner: number | null;
  level: number;
  role: Role | null;
  progress: number;
  matter: number;
  force: number;
  dial: number;
  garrison: number;
  supply: number;
  siege: number[];
}

export interface EdgeState {
  expansions: number;
  progress: number;
  expanding: number | null;
  matterFlow: number;
  forceFlow: number;
  energyFlow: number;
}

export interface PowerState {
  alive: boolean;
  capital: number;
  explored: boolean[];
}

export interface Pressure {
  power: number;
  from: number;
  to: number;
  edge: number;
  activeAt: number;
  commit: number;
}

export interface Constants {
  baseMatter: number;
  matterRate: number;
  baseEnergy: number;
  energyRate: number;
  energyFade: number;
  energyRounds: number;
  upkeepPerLevel: number;
  upkeepPerForce: number;
  shortageOutput: number;
  forceDecay: number;
  levelCost: number;
  buildRate: number;
  shipyardRate: number;
  forceCost: number;
  expandRate: number;
  expandCost: number;
  expandGain: number;
  maxExpansions: number;
  reserveTicks: number;
  matterReach: number;
  forceReach: number;
  garrisonPull: number;
  forcePerCapacity: number;
  pressurePerCapacity: number;
  neutralDefense: number;
  defenseBase: number;
  defensePerLevel: number;
  defensePerForce: number;
  attrition: number;
  defenderLossShare: number;
  siegeRate: number;
  siegeDecay: number;
  captureLevelLoss: number;
  roleChangeLevelLoss: number;
  announceTicks: number;
  defaultDial: number;
  visionRange: number;
  landCapacity: number;
  passCapacity: number;
  straitCapacity: number;
  startLevel: number;
  startMatter: number;
  startForce: number;
}

export interface State {
  tick: number;
  constants: Constants;
  map: WorldMap;
  nodes: NodeState[];
  edges: EdgeState[];
  powers: PowerState[];
  pressures: Pressure[];
}

export type Command =
  | { kind: "dial"; power: number; node: number; value: number }
  | { kind: "role"; power: number; node: number; role: Role }
  | { kind: "garrison"; power: number; node: number; value: number }
  | { kind: "expand"; power: number; edge: number; active: boolean }
  | { kind: "pressure"; power: number; from: number; to: number; active: boolean };

export type GameEvent =
  | { kind: "announced"; power: number; from: number; to: number; target: number; activeAt: number }
  | { kind: "captured"; node: number; from: number | null; to: number }
  | { kind: "discovered"; power: number; node: number }
  | { kind: "eliminated"; power: number };

export interface Rejection {
  command: Command;
  reason: string;
}

export interface StepResult {
  state: State;
  events: GameEvent[];
  rejections: Rejection[];
}
