import { defaultConstants } from "./constants.ts";
import { explore } from "./explore.ts";
import { createRandom, type Random } from "./random.ts";
import { neighborPairs, scatter } from "./sphere.ts";
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
  type State,
  type Vector,
} from "./types.ts";
import { angleBetween, dot, normalize } from "./vector.ts";

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
const WAVES = 6;
const RIPPLE = 0.7;
const GRAIN = 0.5;
const CAPITAL_LEVEL_CAP = 5;
const START_MIX = [0.4, 0.3, 0.3];

export function createWorld(options: WorldOptions): State {
  const constants = options.constants ?? defaultConstants;
  const powerCount = options.powers ?? 3;
  const pointCount = options.points ?? 400;
  const regionCount = options.regions ?? 22;
  const landShare = options.landShare ?? 0.62;
  const random = createRandom(options.seed);

  const points = scatter(pointCount, random);
  const pairs = neighborPairs(points);
  const elevationRank = rank(elevationField(points, random));
  const oceanCount = Math.round(pointCount * (1 - landShare));
  const landCount = pointCount - oceanCount;

  const cellOfPoint = new Array<number>(pointCount).fill(-1);
  const cells: MapCell[] = [];
  const oceans: Vector[] = [];
  for (let point = 0; point < pointCount; point++) {
    if (elevationRank[point] < oceanCount) {
      oceans.push(points[point]);
      continue;
    }
    const height = (elevationRank[point] - oceanCount) / Math.max(1, landCount - 1);
    cellOfPoint[point] = cells.length;
    cells.push(describeCell(cells.length, points[point], height, random));
  }

  const land: Draft[] = [];
  const shores: number[][] = cellOfPoint.map(() => []);
  for (const [first, second] of pairs) {
    const a = cellOfPoint[first];
    const b = cellOfPoint[second];
    if (a >= 0 && b >= 0) {
      land.push({ a, b, strait: false });
    } else if (a >= 0) {
      shores[second].push(a);
    } else if (b >= 0) {
      shores[first].push(b);
    }
  }

  const regions = partition(cells, land, regionCount, random);
  const drafts = [...land, ...straits(cells, land, shores)];

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
    map: { seed: options.seed, cells, regions, joints, edges, links, neighbors, oceans },
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
      holdings: regions.map(() => ({ dial: constants.defaultDial, garrison: 0 })),
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
    supply: 1,
    siege: new Array<number>(powerCount).fill(0),
  };
}

function elevationField(points: Vector[], random: Random): number[] {
  const waves = Array.from({ length: WAVES }, (_, index) => ({
    direction: normalize({
      x: random.next() - 0.5,
      y: random.next() - 0.5,
      z: random.next() - 0.5,
    }),
    frequency: (1.5 + 2 * random.next()) * (1 + RIPPLE * index),
    phase: 2 * Math.PI * random.next(),
    amplitude: 1 / (index + 1),
  }));
  return points.map(
    (point) =>
      waves.reduce(
        (sum, wave) =>
          sum + wave.amplitude * Math.sin(wave.frequency * dot(point, wave.direction) + wave.phase),
        0,
      ) +
      GRAIN * (random.next() - 0.5),
  );
}

function rank(values: number[]): number[] {
  const order = values.map((_, index) => index).sort((left, right) => values[left] - values[right]);
  const ranks = new Array<number>(values.length).fill(0);
  order.forEach((index, position) => {
    ranks[index] = position;
  });
  return ranks;
}

function describeCell(id: number, position: Vector, height: number, random: Random): MapCell {
  const mountain = height > 1 - MOUNTAIN_SHARE;
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

function straits(cells: MapCell[], land: Draft[], shores: number[][]): Draft[] {
  const keyOf = (a: number, b: number) => Math.min(a, b) * cells.length + Math.max(a, b);
  const joined = new Set<number>();
  const groups = createGroups(cells.length);
  for (const draft of land) {
    joined.add(keyOf(draft.a, draft.b));
    groups.join(draft.a, draft.b);
  }

  const crossings: Crossing[] = [];
  const offered = new Set<number>();
  for (const shore of shores) {
    for (let first = 0; first < shore.length; first++) {
      for (let second = first + 1; second < shore.length; second++) {
        const a = shore[first];
        const b = shore[second];
        const key = keyOf(a, b);
        if (a === b || joined.has(key) || offered.has(key)) {
          continue;
        }
        offered.add(key);
        crossings.push({
          a: Math.min(a, b),
          b: Math.max(a, b),
          distance: angleBetween(cells[a].position, cells[b].position),
        });
      }
    }
  }
  crossings.sort(byDistance);

  const drafts: Draft[] = [];
  const spare: Crossing[] = [];
  for (const crossing of crossings) {
    if (groups.join(crossing.a, crossing.b)) {
      drafts.push({ a: crossing.a, b: crossing.b, strait: true });
      joined.add(keyOf(crossing.a, crossing.b));
    } else {
      spare.push(crossing);
    }
  }

  if (groups.count() > 1) {
    const remote: Crossing[] = [];
    for (let a = 0; a < cells.length; a++) {
      for (let b = a + 1; b < cells.length; b++) {
        if (!groups.same(a, b)) {
          remote.push({ a, b, distance: angleBetween(cells[a].position, cells[b].position) });
        }
      }
    }
    remote.sort(byDistance);
    for (const crossing of remote) {
      if (groups.join(crossing.a, crossing.b)) {
        drafts.push({ a: crossing.a, b: crossing.b, strait: true });
        joined.add(keyOf(crossing.a, crossing.b));
      }
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
  let groups = size;
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
      groups -= 1;
      return true;
    },
    same: (first: number, second: number) => find(first) === find(second),
    count: () => groups,
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
