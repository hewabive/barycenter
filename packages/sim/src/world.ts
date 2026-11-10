import { defaultConstants } from "./constants.ts";
import { explore } from "./explore.ts";
import { createRandom, type Random } from "./random.ts";
import { neighborPairs, scatter } from "./sphere.ts";
import type {
  Constants,
  EdgeKind,
  Link,
  MapEdge,
  MapNode,
  NodeState,
  State,
  Vector,
} from "./types.ts";
import { angleBetween, dot, normalize } from "./vector.ts";

export interface WorldOptions {
  seed: number;
  powers?: number;
  cells?: number;
  landShare?: number;
  constants?: Constants;
}

interface EdgeDraft {
  a: number;
  b: number;
  kind: EdgeKind;
}

interface Crossing {
  a: number;
  b: number;
  distance: number;
}

const MOUNTAIN_SHARE = 0.18;
const EXTRA_STRAITS = 2;
const WAVES = 4;
const CAPITAL_LEVEL_CAP = 8;

export function createWorld(options: WorldOptions): State {
  const constants = options.constants ?? defaultConstants;
  const powerCount = options.powers ?? 3;
  const cellCount = options.cells ?? 34;
  const landShare = options.landShare ?? 0.62;
  const random = createRandom(options.seed);

  const points = scatter(cellCount, random);
  const pairs = neighborPairs(points);
  const elevationRank = rank(elevationField(points, random));
  const oceanCount = Math.round(cellCount * (1 - landShare));
  const landCount = cellCount - oceanCount;

  const nodeOfCell = new Array<number>(cellCount).fill(-1);
  const nodes: MapNode[] = [];
  const oceans: Vector[] = [];
  for (let cell = 0; cell < cellCount; cell++) {
    if (elevationRank[cell] < oceanCount) {
      oceans.push(points[cell]);
      continue;
    }
    const height = (elevationRank[cell] - oceanCount) / Math.max(1, landCount - 1);
    nodeOfCell[cell] = nodes.length;
    nodes.push(describeNode(nodes.length, points[cell], height, random));
  }

  const drafts = connect(pairs, nodeOfCell, nodes);
  const edges: MapEdge[] = drafts.map((draft, id) => ({
    id,
    a: draft.a,
    b: draft.b,
    kind: draft.kind,
    baseCapacity: capacityOfKind(constants, draft.kind),
  }));
  const links: Link[][] = nodes.map(() => []);
  for (const edge of edges) {
    links[edge.a].push({ node: edge.b, edge: edge.id });
    links[edge.b].push({ node: edge.a, edge: edge.id });
  }

  const capitals = placeCapitals(links, nodes, powerCount);
  for (const capital of capitals) {
    nodes[capital] = {
      ...nodes[capital],
      matterRichness: 1,
      energyRichness: 1,
      levelCap: CAPITAL_LEVEL_CAP,
    };
  }

  const state: State = {
    tick: 0,
    constants,
    map: { seed: options.seed, nodes, edges, links, oceans },
    nodes: nodes.map(() => emptyNode(constants, powerCount)),
    edges: edges.map(() => ({
      expansions: 0,
      progress: 0,
      expanding: null,
      matterFlow: 0,
      forceFlow: 0,
      energyFlow: 0,
    })),
    powers: capitals.map((capital) => ({
      alive: true,
      capital,
      explored: new Array<boolean>(nodes.length).fill(false),
    })),
    pressures: [],
  };
  capitals.forEach((capital, power) => {
    const node = state.nodes[capital];
    node.owner = power;
    node.level = constants.startLevel;
    node.role = "shipyard";
    node.matter = constants.startMatter;
    node.force = constants.startForce;
  });
  explore(state, []);
  return state;
}

function emptyNode(constants: Constants, powerCount: number): NodeState {
  return {
    owner: null,
    level: 0,
    role: null,
    progress: 0,
    matter: 0,
    force: 0,
    dial: constants.defaultDial,
    garrison: 0,
    supply: 1,
    siege: new Array<number>(powerCount).fill(0),
  };
}

function capacityOfKind(constants: Constants, kind: EdgeKind): number {
  if (kind === "land") {
    return constants.landCapacity;
  }
  return kind === "pass" ? constants.passCapacity : constants.straitCapacity;
}

function elevationField(points: Vector[], random: Random): number[] {
  const waves = Array.from({ length: WAVES }, (_, index) => ({
    direction: normalize({
      x: random.next() - 0.5,
      y: random.next() - 0.5,
      z: random.next() - 0.5,
    }),
    frequency: 1.5 + 2 * random.next(),
    phase: 2 * Math.PI * random.next(),
    amplitude: 1 / (index + 1),
  }));
  return points.map((point) =>
    waves.reduce(
      (sum, wave) =>
        sum + wave.amplitude * Math.sin(wave.frequency * dot(point, wave.direction) + wave.phase),
      0,
    ),
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

function describeNode(id: number, position: Vector, height: number, random: Random): MapNode {
  const mountain = height > 1 - MOUNTAIN_SHARE;
  const sunlight = 1 - Math.abs(position.y);
  return {
    id,
    position,
    terrain: mountain ? "mountain" : "plain",
    matterRichness: richness(0.4 + 0.9 * height + (random.next() - 0.5) * 0.4),
    energyRichness: richness(0.4 + 0.9 * sunlight + (random.next() - 0.5) * 0.5),
    levelCap: mountain ? 4 : 5 + Math.floor(random.next() * 3),
  };
}

function richness(value: number): number {
  return Math.round(Math.max(0.2, Math.min(1.6, value)) * 100) / 100;
}

function connect(pairs: [number, number][], nodeOfCell: number[], nodes: MapNode[]): EdgeDraft[] {
  const keyOf = (a: number, b: number) => Math.min(a, b) * nodes.length + Math.max(a, b);
  const drafts: EdgeDraft[] = [];
  const joined = new Set<number>();
  const groups = createGroups(nodes.length);
  const shores: number[][] = nodeOfCell.map(() => []);

  for (const [first, second] of pairs) {
    const a = nodeOfCell[first];
    const b = nodeOfCell[second];
    if (a >= 0 && b >= 0) {
      const pass = nodes[a].terrain === "mountain" || nodes[b].terrain === "mountain";
      drafts.push({ a, b, kind: pass ? "pass" : "land" });
      joined.add(keyOf(a, b));
      groups.join(a, b);
    } else if (a >= 0) {
      shores[second].push(a);
    } else if (b >= 0) {
      shores[first].push(b);
    }
  }

  const crossings: Crossing[] = [];
  const offered = new Set<number>();
  const offer = (a: number, b: number) => {
    const key = keyOf(a, b);
    if (a === b || joined.has(key) || offered.has(key)) {
      return;
    }
    offered.add(key);
    crossings.push({
      a: Math.min(a, b),
      b: Math.max(a, b),
      distance: angleBetween(nodes[a].position, nodes[b].position),
    });
  };
  for (const shore of shores) {
    for (let first = 0; first < shore.length; first++) {
      for (let second = first + 1; second < shore.length; second++) {
        offer(shore[first], shore[second]);
      }
    }
  }
  crossings.sort(byDistance);

  const spare: Crossing[] = [];
  for (const crossing of crossings) {
    if (groups.join(crossing.a, crossing.b)) {
      drafts.push({ a: crossing.a, b: crossing.b, kind: "strait" });
      joined.add(keyOf(crossing.a, crossing.b));
    } else {
      spare.push(crossing);
    }
  }

  if (groups.count() > 1) {
    const remote: Crossing[] = [];
    for (let a = 0; a < nodes.length; a++) {
      for (let b = a + 1; b < nodes.length; b++) {
        if (!joined.has(keyOf(a, b))) {
          remote.push({ a, b, distance: angleBetween(nodes[a].position, nodes[b].position) });
        }
      }
    }
    remote.sort(byDistance);
    for (const crossing of remote) {
      if (groups.join(crossing.a, crossing.b)) {
        drafts.push({ a: crossing.a, b: crossing.b, kind: "strait" });
        joined.add(keyOf(crossing.a, crossing.b));
      }
    }
  }

  for (const crossing of spare.slice(0, EXTRA_STRAITS)) {
    drafts.push({ a: crossing.a, b: crossing.b, kind: "strait" });
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
    count: () => groups,
  };
}

function hops(links: Link[][], origin: number): number[] {
  const distance = new Array<number>(links.length).fill(Number.POSITIVE_INFINITY);
  distance[origin] = 0;
  const queue = [origin];
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head];
    for (const link of links[node]) {
      if (distance[link.node] === Number.POSITIVE_INFINITY) {
        distance[link.node] = distance[node] + 1;
        queue.push(link.node);
      }
    }
  }
  return distance;
}

function placeCapitals(links: Link[][], nodes: MapNode[], count: number): number[] {
  const distances = nodes.map((node) => hops(links, node.id));
  const open = nodes
    .filter((node) => node.terrain === "plain" && links[node.id].length >= 2)
    .map((node) => node.id);
  const candidates = open.length >= count ? open : nodes.map((node) => node.id);

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
  return best;
}
