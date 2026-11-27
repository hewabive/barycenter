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

export interface Relief {
  frequency: number;
  warp: number;
  ridge: number;
  sea: number | null;
  peak: number;
  height: number;
  craters: number;
}

export const GASES = [
  "hydrogen",
  "helium",
  "methane",
  "ammonia",
  "water",
  "nitrogen",
  "oxygen",
  "carbon dioxide",
] as const;

export type Gas = (typeof GASES)[number];

export interface Disk {
  inner: number;
  outer: number;
  mass: number;
  depth: number;
  ice: number;
  gas: number;
  grain: number;
  height: number;
  flare: number;
  fade: number;
  since: number;
  lasts: number;
  wreck: Wreck | null;
}

export type Wreck = "break" | "tide" | "return" | "gas";

export interface Lane {
  inner: number;
  outer: number;
  year: number;
}

export interface Physics {
  mass: number;
  radius: number;
  iron: number;
  rock: number;
  ice: number;
  gas: number;
  lost: number;
  heat: number;
  coldest: number;
  hottest: number;
  glow: number;
  light: number;
  air: number;
  gases: number[];
  life: number;
  vigor: number;
  age: number;
  orbit: number;
  stretch: number;
  year: number;
  day: number;
  disks: Disk[];
}

export interface Shared {
  with: number;
  ahead: number;
  sway: number;
  lane: number;
  chase: number;
  year: number;
  phase: number;
}

export interface Body {
  id: number;
  name: string;
  seed: number;
  parent: number | null;
  physics: Physics;
  radius: number;
  orbit: number;
  year: number;
  phase: number;
  slant: number;
  node: number;
  apse: number;
  tilt: number;
  swing: number;
  day: number;
  disks: Lane[];
  relief: Relief;
  shared: Shared | null;
  gathered: Gathered | null;
  drawn: Drawn | null;
  swallowed: Swallowed[];
  freed: Freed | null;
  lobe: number;
  passages: Passage[];
  shell: Shell | null;
}

export interface Shell {
  radius: number;
  reach: number;
  since: number;
  mass: number;
}

export interface Passage {
  kind: "gave" | "took" | "shed";
  with: string | null;
  mass: number;
  from: number;
  until: number | null;
  since: number;
  rate: number;
}

export interface Gathered {
  since: number;
  turn: number;
}

export interface Drawn {
  from: number;
  stretch: number;
  falls: number | null;
}

export interface Swallowed {
  name: string;
  of: string | null;
  mass: number;
  since: number;
}

export interface Freed {
  from: string;
  since: number;
  falls: number | null;
}

export interface StarSystem {
  home: number;
  bodies: Body[];
}

export interface Sketch {
  home: number | null;
  bodies: Body[];
}

export interface Survey extends Sketch {
  unit: number;
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
  system: StarSystem;
  reach: number;
}

export interface CellState {
  owner: number | null;
  level: number;
  progress: number;
  branches: number[];
  stock: number[];
  force: number;
  quarters: number;
  supply: number;
  siege: number[];
  flag: number;
}

export interface JointState {
  matterFlow: number;
  forceFlow: number;
  energyFlow: number;
  grade: number;
  progress: number;
  load: number;
}

export interface HoldingOrders {
  dial: number;
  garrison: number | null;
  reinforcement: number;
}

export interface PowerState {
  alive: boolean;
  capital: number;
  explored: boolean[];
  lean: number[];
  army: number;
  forward: number;
  holdings: HoldingOrders[];
  roads: boolean[];
}

export interface Pressure {
  power: number;
  region: number;
  target: number | null;
  activeAt: number;
  aim: number | null;
}

export interface Constants {
  matterRate: number;
  energyRate: number;
  energyRounds: number;
  upkeepPerLevel: number;
  upkeepPerForce: number;
  restUpkeep: number;
  upkeepPerQuarter: number;
  flagUpkeep: number;
  flagFall: number;
  flagRise: number;
  shortageOutput: number;
  forceDecay: number;
  strandedDecay: number;
  excessDecay: number;
  quarterCost: number;
  quarterRate: number;
  quarterDecay: number;
  quartersBase: number;
  quartersPerLevel: number;
  forwardSpan: number;
  levelCost: number;
  buildRate: number;
  shipyardRate: number;
  forceCost: number;
  hopLoss: number;
  roadRelief: number;
  roadGain: number;
  maxGrade: number;
  roadCost: number;
  roadRate: number;
  roadDemand: number;
  roadKeep: number;
  roadDecay: number;
  roadMemory: number;
  upkeepPerRoad: number;
  reserveTicks: number;
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
  defaultForward: number;
  leanSpan: number;
  extractionFloor: number;
  extractionGain: number;
  powerFloor: number;
  powerGain: number;
  shipyardFloor: number;
  shipyardGain: number;
  convertRate: number;
  visionRange: number;
  landCapacity: number;
  passCapacity: number;
  straitCapacity: number;
  startCells: number;
  startLevel: number;
  startMatter: number;
  startForce: number;
  startQuarters: number;
}

export interface State {
  tick: number;
  constants: Constants;
  map: WorldMap;
  cells: CellState[];
  joints: JointState[];
  powers: PowerState[];
  pressures: Pressure[];
}

export type Command =
  | { kind: "dial"; power: number; region: number; value: number }
  | { kind: "garrison"; power: number; region: number; value: number | null }
  | { kind: "reinforce"; power: number; region: number; value: number }
  | { kind: "army"; power: number; value: number }
  | { kind: "forward"; power: number; value: number }
  | { kind: "lean"; power: number; branch: Branch; value: number }
  | { kind: "road"; power: number; edge: number; active: boolean }
  | { kind: "pressure"; power: number; region: number; target: number | null; active: boolean }
  | { kind: "aim"; power: number; region: number; target: number | null; cell: number | null };

export type GameEvent =
  | { kind: "announced"; power: number; region: number; target: number; activeAt: number }
  | { kind: "entered"; power: number; region: number }
  | { kind: "secured"; power: number; region: number }
  | { kind: "expelled"; power: number; region: number; by: number }
  | { kind: "lapsed"; power: number; region: number; cells: number; left: boolean }
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
