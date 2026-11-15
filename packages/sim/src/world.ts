import { defaultConstants } from "./constants.ts";
import { explore } from "./explore.ts";
import { createRandom, type Random } from "./random.ts";
import { elevationAt } from "./relief.ts";
import { blankOrders } from "./rules.ts";
import { type Side, scatter, sidesOf } from "./sphere.ts";
import { createSystem } from "./system.ts";
import {
  BRANCHES,
  type CellState,
  type Constants,
  KINDS,
  type Link,
  type MapCell,
  type MapEdge,
  type MapJoint,
  type MapRegion,
  type Neighbor,
  type Relief,
  type State,
  type Vector,
} from "./types.ts";
import { angleBetween, dot, normalize, slerp } from "./vector.ts";

export interface WorldOptions {
  seed: number;
  powers?: number;
  points?: number;
  regions?: number;
  landShare?: number;
  constants?: Constants;
}

interface Draft {
  a: number;
  b: number;
  strait: boolean;
}

interface Crossing {
  a: number;
  b: number;
  distance: number;
}

const MOUNTAIN_SHARE = 0.18;
const MOUNTAIN_STEP = 2.5;
const EXTRA_STRAITS = 2;
const REACH_SHARE = 1.9;
export const SHORE_STEP = 0.01;
const CAPITAL_LEVEL_CAP = 6;
const START_MIX = [0.3, 0.45, 0.25];
const SYSTEM_SALT = 0x5bd1e995;

export function createWorld(options: WorldOptions): State {
  const constants = options.constants ?? defaultConstants;
  const powerCount = options.powers ?? 3;
  const pointCount = options.points ?? 400;
  const regionCount = options.regions ?? 22;
  const landShare = options.landShare ?? 0.62;
  const random = createRandom(options.seed);

  const drawn = createSystem(createRandom(options.seed ^ SYSTEM_SALT));
  const points = scatter(pointCount, random);
  const shape = drawn.bodies[drawn.home];
  const heights = points.map((point) => elevationAt(shape.seed, shape.relief, point));
  const ascending = heights.slice().sort((left, right) => left - right);
  const oceanCount = Math.round(pointCount * (1 - landShare));
  const landCount = pointCount - oceanCount;
  const firstPeak = pointCount - Math.round(landCount * MOUNTAIN_SHARE);
  const relief: Relief = {
    ...shape.relief,
    sea: (ascending[oceanCount - 1] + ascending[oceanCount]) / 2,
    peak: (ascending[firstPeak - 1] + ascending[firstPeak]) / 2,
  };
  const system = {
    ...drawn,
    bodies: drawn.bodies.map((body) => (body.id === drawn.home ? { ...body, relief } : body)),
  };
  const reach = REACH_SHARE * Math.sqrt((4 * Math.PI) / pointCount);
  const dry = (at: Vector) => elevationAt(shape.seed, relief, at) > (relief.sea ?? 0);

  const cells: MapCell[] = [];
  const elevationRank = rank(heights);
  for (let point = 0; point < pointCount; point++) {
    if (elevationRank[point] < oceanCount) {
      continue;
    }
    const height = (elevationRank[point] - oceanCount) / Math.max(1, landCount - 1);
    const mountain = heights[point] > relief.peak;
    cells.push(describeCell(cells.length, points[point], height, mountain, random));
  }

  const land: Draft[] = [];
  const crossings: Crossing[] = [];
  for (const side of sidesOf(cells.map((cell) => cell.position))) {
    if (touches(side, cells[side.a].position, reach, dry)) {
      land.push({ a: side.a, b: side.b, strait: false });
    } else {
      const distance = angleBetween(cells[side.a].position, cells[side.b].position);
      crossings.push({ a: side.a, b: side.b, distance });
    }
  }

  const regions = partition(cells, land, regionCount, random);
  const drafts = [...land, ...straits(cells, land, crossings)];

  const edges: MapEdge[] = [];
  const edgeOf = new Map<number, number>();
  const joints: MapJoint[] = drafts.map((draft, id) => {
    const from = cells[draft.a];
    const to = cells[draft.b];
    if (from.region === to.region) {
      return { id, a: draft.a, b: draft.b, kind: "land", edge: null };
    }
    const low = Math.min(from.region, to.region);
    const high = Math.max(from.region, to.region);
    const key = low * regions.length + high;
    let edge = edgeOf.get(key);
    if (edge === undefined) {
      edge = edges.length;
      edgeOf.set(key, edge);
      edges.push({ id: edge, a: low, b: high, joints: [] });
    }
    edges[edge].joints.push(id);
    const pass = from.terrain === "mountain" || to.terrain === "mountain";
    return {
      id,
      a: draft.a,
      b: draft.b,
      kind: draft.strait ? "strait" : pass ? "pass" : "land",
      edge,
    };
  });

  const links: Link[][] = cells.map(() => []);
  for (const joint of joints) {
    links[joint.a].push({ cell: joint.b, joint: joint.id });
    links[joint.b].push({ cell: joint.a, joint: joint.id });
  }
  const neighbors: Neighbor[][] = regions.map(() => []);
  for (const edge of edges) {
    neighbors[edge.a].push({ region: edge.b, edge: edge.id });
    neighbors[edge.b].push({ region: edge.a, edge: edge.id });
  }

  const capitals = placeCapitals(cells, regions, neighbors, powerCount, constants.startCells);
  for (const capital of capitals) {
    cells[capital] = {
      ...cells[capital],
      terrain: "plain",
      deposits: KINDS.map(() => 1),
      energyRichness: 1,
      levelCap: CAPITAL_LEVEL_CAP,
    };
  }

  const state: State = {
    tick: 0,
    constants,
    map: { seed: options.seed, cells, regions, joints, edges, links, neighbors, system, reach },
    cells: cells.map(() => emptyCell(powerCount)),
    joints: joints.map(() => ({
      matterFlow: 0,
      forceFlow: 0,
      energyFlow: 0,
      grade: 0,
      progress: 0,
      load: 0,
    })),
    powers: capitals.map((capital) => ({
      alive: true,
      capital,
      explored: new Array<boolean>(regions.length).fill(false),
      lean: BRANCHES.map(() => constants.defaultLean),
      army: constants.startQuarters,
      forward: constants.defaultForward,
      holdings: regions.map(() => blankOrders(constants)),
      roads: edges.map(() => false),
    })),
    pressures: [],
  };
  capitals.forEach((capital, power) => {
    for (const cell of startCells(state, capital, constants.startCells)) {
      state.cells[cell].owner = power;
    }
    const seat = state.cells[capital];
    seat.level = Math.min(constants.startLevel, cells[capital].levelCap);
    seat.branches = START_MIX.map((share) => share * seat.level);
    seat.stock[0] = constants.startMatter;
    seat.force = constants.startForce;
    seat.quarters = constants.startQuarters;
  });
  explore(state, []);
  return state;
}

function emptyCell(powerCount: number): CellState {
  return {
    owner: null,
    level: 0,
    progress: 0,
    branches: BRANCHES.map(() => 0),
    stock: KINDS.map(() => 0),
    force: 0,
    quarters: 0,
    supply: 1,
    siege: new Array<number>(powerCount).fill(0),
    flag: 1,
  };
}

function touches(side: Side, site: Vector, reach: number, dry: (at: Vector) => boolean): boolean {
  const steps = Math.max(2, Math.ceil(angleBetween(side.from, side.to) / SHORE_STEP));
  for (let step = 0; step <= steps; step++) {
    const at = slerp(side.from, side.to, step / steps);
    if (angleBetween(at, site) <= reach && dry(at)) {
      return true;
    }
  }
  return false;
}

function rank(values: number[]): number[] {
  const order = values.map((_, index) => index).sort((left, right) => values[left] - values[right]);
  const ranks = new Array<number>(values.length).fill(0);
  order.forEach((index, position) => {
    ranks[index] = position;
  });
  return ranks;
}

function describeCell(
  id: number,
  position: Vector,
  height: number,
  mountain: boolean,
  random: Random,
): MapCell {
  const sunlight = 1 - Math.abs(position.y);
  return {
    id,
    position,
    region: -1,
    terrain: mountain ? "mountain" : "plain",
    deposits: KINDS.map(() => richness(0.4 + 0.9 * height + (random.next() - 0.5) * 0.4)),
    energyRichness: richness(0.4 + 0.9 * sunlight + (random.next() - 0.5) * 0.5),
    levelCap: mountain ? 2 : 2 + Math.floor(random.next() * 3),
  };
}

function richness(value: number): number {
  return Math.round(Math.max(0.2, Math.min(1.6, value)) * 100) / 100;
}

function adjacencyOf(count: number, drafts: Draft[]): number[][] {
  const adjacency: number[][] = Array.from({ length: count }, () => []);
  for (const draft of drafts) {
    adjacency[draft.a].push(draft.b);
    adjacency[draft.b].push(draft.a);
  }
  return adjacency;
}

function hops(adjacency: number[][], origin: number): number[] {
  const distance = new Array<number>(adjacency.length).fill(Number.POSITIVE_INFINITY);
  distance[origin] = 0;
  const queue = [origin];
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    for (const next of adjacency[current]) {
      if (distance[next] === Number.POSITIVE_INFINITY) {
        distance[next] = distance[current] + 1;
        queue.push(next);
      }
    }
  }
  return distance;
}

function partition(cells: MapCell[], land: Draft[], wanted: number, random: Random): MapRegion[] {
  const adjacency = adjacencyOf(cells.length, land);
  const average = cells.length / Math.max(1, wanted);
  const seen = new Array<boolean>(cells.length).fill(false);
  const seeds: number[] = [];

  for (let start = 0; start < cells.length; start++) {
    if (seen[start]) {
      continue;
    }
    const island = [start];
    seen[start] = true;
    for (let head = 0; head < island.length; head++) {
      for (const next of adjacency[island[head]]) {
        if (!seen[next]) {
          seen[next] = true;
          island.push(next);
        }
      }
    }
    const count = Math.max(1, Math.round(island.length / average));
    const first = island[Math.floor(random.next() * island.length)];
    const nearest = hops(adjacency, first);
    seeds.push(first);
    for (let placed = 1; placed < count; placed++) {
      let best = -1;
      for (const cell of island) {
        if (nearest[cell] > 0 && (best < 0 || nearest[cell] > nearest[best])) {
          best = cell;
        }
      }
      if (best < 0) {
        break;
      }
      seeds.push(best);
      const reach = hops(adjacency, best);
      for (const cell of island) {
        nearest[cell] = Math.min(nearest[cell], reach[cell]);
      }
    }
  }

  const pace = seeds.map(() => 0.6 + random.next());
  const cost = new Array<number>(cells.length).fill(Number.POSITIVE_INFINITY);
  const settled = new Array<boolean>(cells.length).fill(false);
  seeds.forEach((seed, region) => {
    cost[seed] = 0;
    cells[seed].region = region;
  });
  for (let round = 0; round < cells.length; round++) {
    let current = -1;
    for (let cell = 0; cell < cells.length; cell++) {
      if (!settled[cell] && (current < 0 || cost[cell] < cost[current])) {
        current = cell;
      }
    }
    settled[current] = true;
    const region = cells[current].region;
    for (const next of adjacency[current]) {
      const step = cells[next].terrain === "mountain" ? MOUNTAIN_STEP : 1;
      const reached = cost[current] + step / pace[region];
      if (!settled[next] && reached < cost[next]) {
        cost[next] = reached;
        cells[next].region = region;
      }
    }
  }

  return seeds.map((_, id) => {
    const members = cells.filter((cell) => cell.region === id).map((cell) => cell.id);
    const middle = normalize(
      members.reduce(
        (sum, cell) => ({
          x: sum.x + cells[cell].position.x,
          y: sum.y + cells[cell].position.y,
          z: sum.z + cells[cell].position.z,
        }),
        { x: 0, y: 0, z: 0 },
      ),
    );
    let center = members[0];
    for (const cell of members) {
      if (dot(cells[cell].position, middle) > dot(cells[center].position, middle)) {
        center = cell;
      }
    }
    return { id, cells: members, center };
  });
}

function straits(cells: MapCell[], land: Draft[], crossings: Crossing[]): Draft[] {
  const keyOf = (a: number, b: number) => Math.min(a, b) * cells.length + Math.max(a, b);
  const groups = createGroups(cells.length);
  for (const draft of land) {
    groups.join(draft.a, draft.b);
  }

  const drafts: Draft[] = [];
  const spare: Crossing[] = [];
  for (const crossing of crossings.slice().sort(byDistance)) {
    if (groups.join(crossing.a, crossing.b)) {
      drafts.push({ a: crossing.a, b: crossing.b, strait: true });
    } else {
      spare.push(crossing);
    }
  }

  const bridged = new Set<number>();
  const pairOf = (ends: { a: number; b: number }) =>
    keyOf(cells[ends.a].region, cells[ends.b].region);
  for (const draft of [...land, ...drafts]) {
    bridged.add(pairOf(draft));
  }
  let extra = 0;
  for (const crossing of spare) {
    if (extra >= EXTRA_STRAITS) {
      break;
    }
    if (cells[crossing.a].region === cells[crossing.b].region || bridged.has(pairOf(crossing))) {
      continue;
    }
    bridged.add(pairOf(crossing));
    drafts.push({ a: crossing.a, b: crossing.b, strait: true });
    extra += 1;
  }
  return drafts;
}

function byDistance(left: Crossing, right: Crossing): number {
  return left.distance - right.distance || left.a - right.a || left.b - right.b;
}

function createGroups(size: number) {
  const parent = Array.from({ length: size }, (_, index) => index);
  const find = (item: number): number => {
    let root = item;
    while (parent[root] !== root) {
      root = parent[root];
    }
    parent[item] = root;
    return root;
  };
  return {
    join(first: number, second: number): boolean {
      const left = find(first);
      const right = find(second);
      if (left === right) {
        return false;
      }
      parent[left] = right;
      return true;
    },
  };
}

function seatOf(cells: MapCell[], region: MapRegion): number {
  if (cells[region.center].terrain === "plain") {
    return region.center;
  }
  let best = region.center;
  let bestAngle = Number.POSITIVE_INFINITY;
  for (const cell of region.cells) {
    const angle = angleBetween(cells[cell].position, cells[region.center].position);
    if (cells[cell].terrain === "plain" && angle < bestAngle) {
      best = cell;
      bestAngle = angle;
    }
  }
  return best;
}

function placeCapitals(
  cells: MapCell[],
  regions: MapRegion[],
  neighbors: Neighbor[][],
  count: number,
  roomNeeded: number,
): number[] {
  const adjacency = neighbors.map((list) => list.map((neighbor) => neighbor.region));
  const distances = regions.map((region) => hops(adjacency, region.id));
  const roomy = regions
    .filter((region) => region.cells.length >= roomNeeded && neighbors[region.id].length >= 2)
    .map((region) => region.id);
  const candidates = roomy.length >= count ? roomy : regions.map((region) => region.id);

  let best: number[] = candidates.slice(0, count);
  let bestSpread = -1;
  let bestTotal = -1;
  const chosen: number[] = [];
  const search = (start: number) => {
    if (chosen.length === count) {
      let spreadOut = Number.POSITIVE_INFINITY;
      let total = 0;
      for (let first = 0; first < count; first++) {
        for (let second = first + 1; second < count; second++) {
          const distance = distances[chosen[first]][chosen[second]];
          spreadOut = Math.min(spreadOut, distance);
          total += distance;
        }
      }
      if (spreadOut > bestSpread || (spreadOut === bestSpread && total > bestTotal)) {
        best = chosen.slice();
        bestSpread = spreadOut;
        bestTotal = total;
      }
      return;
    }
    for (let index = start; index < candidates.length; index++) {
      chosen.push(candidates[index]);
      search(index + 1);
      chosen.pop();
    }
  };
  search(0);
  return best.map((region) => seatOf(cells, regions[region]));
}

function startCells(state: State, capital: number, wanted: number): number[] {
  const { map } = state;
  const region = map.cells[capital].region;
  const taken = [capital];
  const seen = new Set(taken);
  for (let head = 0; head < taken.length && taken.length < wanted; head++) {
    for (const link of map.links[taken[head]]) {
      const inside = map.cells[link.cell].region === region && map.joints[link.joint].edge === null;
      if (inside && !seen.has(link.cell) && taken.length < wanted) {
        seen.add(link.cell);
        taken.push(link.cell);
      }
    }
  }
  return taken;
}
