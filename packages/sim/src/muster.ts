import { attackNeedOf, defenseNeedOf, forceFieldOf, forceWantedBy } from "./force.ts";
import type { Lane } from "./front.ts";
import { bestLink, EPSILON } from "./rules.ts";
import type { State } from "./types.ts";

export interface Duty {
  power: number;
  region: number;
  target: number | null;
  need: number;
}

export interface Route {
  region: number;
  amount: number;
}

export interface Muster {
  garrison: number;
  front: number;
  need: number;
  reserve: number;
  routes: Route[];
  duties: Duty[];
}

export interface Musters {
  arming: boolean;
  regions: (Muster | null)[];
}

export function mustersOf(state: State, viewer: number, lanes: Lane[], posts: number[]): Musters {
  const { cells, map } = state;
  const field = forceFieldOf(state, lanes, posts);
  const regions: (Muster | null)[] = map.regions.map(() => null);

  const musterIn = (cell: number): Muster => {
    const region = map.cells[cell].region;
    const known = regions[region];
    if (known !== null) {
      return known;
    }
    const created: Muster = { garrison: 0, front: 0, need: 0, reserve: 0, routes: [], duties: [] };
    regions[region] = created;
    return created;
  };

  const goalOf = (cell: number): number | null => {
    let reached: number | null = null;
    for (let link = bestLink(state, cell, field.potential); link !== null; ) {
      reached = link.cell;
      link = bestLink(state, reached, field.potential);
    }
    return reached;
  };

  cells.forEach((cell, id) => {
    if (cell.owner !== viewer) {
      return;
    }
    const muster = musterIn(id);
    const garrison = Math.min(cell.force, posts[id]);
    const need = field.held[id] - posts[id];
    const reserve = Math.max(0, cell.force - field.held[id]);
    muster.garrison += garrison;
    muster.front += Math.min(cell.force - garrison, need);
    muster.need += need;
    muster.reserve += reserve;
    const goal = reserve > EPSILON ? goalOf(id) : null;
    if (goal === null) {
      return;
    }
    const region = map.cells[goal].region;
    const route = muster.routes.find((known) => known.region === region);
    if (route === undefined) {
      muster.routes.push({ region, amount: reserve });
    } else {
      route.amount += reserve;
    }
  });

  for (const lane of lanes) {
    const { power, region, target } = state.pressures[lane.pressure];
    if (power !== viewer && target !== viewer) {
      continue;
    }
    const attacking = power === viewer;
    const need = attacking ? attackNeedOf(state, lane) : defenseNeedOf(state, lane);
    const duties = musterIn(attacking ? lane.from : lane.to).duties;
    const duty = duties.find(
      (known) => known.power === power && known.region === region && known.target === target,
    );
    if (duty === undefined) {
      duties.push({ power, region, target, need });
    } else {
      duty.need += need;
    }
  }

  return { arming: forceWantedBy(state, field)[viewer], regions };
}
