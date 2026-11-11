export const BRANCHES = ["extraction", "power", "shipyard"] as const;
export type Branch = (typeof BRANCHES)[number];
export const KINDS = ["matter"] as const;

export type Terrain = "plain" | "mountain";
export type JointKind = "land" | "pass" | "strait";

export interface Vector {
  x: number;
  y: number;
  z: number;
}

export interface MapCell {
  id: number;
  position: Vector;
  region: number;
  terrain: Terrain;
  deposits: number[];
  energyRichness: number;
  levelCap: number;
}

export interface MapRegion {
  id: number;
  cells: number[];
  center: number;
}

export interface MapJoint {
  id: number;
  a: number;
  b: number;
  kind: JointKind;
  edge: number | null;
}

export interface MapEdge {
  id: number;
  a: number;
  b: number;
  joints: number[];
}

export interface Link {
  cell: number;
  joint: number;
}

export interface Neighbor {
  region: number;
  edge: number;
}

export interface WorldMap {
  seed: number;
  cells: MapCell[];
  regions: MapRegion[];
  joints: MapJoint[];
  edges: MapEdge[];
  links: Link[][];
  neighbors: Neighbor[][];
  oceans: Vector[];
}

export interface CellState {
  owner: number | null;
  level: number;
  progress: number;
  branches: number[];
  stock: number[];
  force: number;
  supply: number;
  siege: number[];
}

export interface JointState {
  matterFlow: number;
  forceFlow: number;
  energyFlow: number;
}

export interface EdgeState {
  expansions: number;
  progress: number;
  expanding: number | null;
}

export interface HoldingOrders {
  dial: number;
  garrison: number;
}

export interface PowerState {
  alive: boolean;
  capital: number;
  explored: boolean[];
  lean: number[];
  holdings: HoldingOrders[];
}

export interface Pressure {
  power: number;
  region: number;
  target: number | null;
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
  announceTicks: number;
  defaultDial: number;
  defaultLean: number;
  leanSpan: number;
  extractionFloor: number;
  extractionGain: number;
  powerFloor: number;
  powerGain: number;
  shipyardFloor: number;
  shipyardGain: number;
  needReach: number;
  convertRate: number;
  visionRange: number;
  landCapacity: number;
  passCapacity: number;
  straitCapacity: number;
  startCells: number;
  startLevel: number;
  startMatter: number;
  startForce: number;
}

export interface State {
  tick: number;
  constants: Constants;
  map: WorldMap;
  cells: CellState[];
  joints: JointState[];
  edges: EdgeState[];
  powers: PowerState[];
  pressures: Pressure[];
}

export type Command =
  | { kind: "dial"; power: number; region: number; value: number }
  | { kind: "garrison"; power: number; region: number; value: number }
  | { kind: "lean"; power: number; branch: Branch; value: number }
  | { kind: "expand"; power: number; edge: number; active: boolean }
  | { kind: "pressure"; power: number; region: number; target: number | null; active: boolean };

export type GameEvent =
  | { kind: "announced"; power: number; region: number; target: number; activeAt: number }
  | { kind: "entered"; power: number; region: number }
  | { kind: "secured"; power: number; region: number }
  | { kind: "expelled"; power: number; region: number; by: number }
  | { kind: "discovered"; power: number; region: number }
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
