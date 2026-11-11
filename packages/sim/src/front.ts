import type { State } from "./types.ts";

export interface Lane {
  pressure: number;
  from: number;
  to: number;
  joint: number;
}

export function lanesOf(state: State): Lane[] {
  const { cells, map } = state;
  const lanes: Lane[] = [];
  state.pressures.forEach((pressure, index) => {
    for (const to of map.regions[pressure.region].cells) {
      if (cells[to].owner !== pressure.target) {
        continue;
      }
      for (const link of map.links[to]) {
        if (cells[link.cell].owner === pressure.power) {
          lanes.push({ pressure: index, from: link.cell, to, joint: link.joint });
        }
      }
    }
  });
  return lanes;
}

export function touches(
  state: State,
  power: number,
  region: number,
  target: number | null,
): boolean {
  const { cells, map } = state;
  return map.regions[region].cells.some(
    (cell) =>
      cells[cell].owner === target &&
      map.links[cell].some((link) => cells[link.cell].owner === power),
  );
}

export function postsOf(state: State): number[] {
  const { cells, map } = state;
  const posts = new Array<number>(cells.length).fill(0);
  state.powers.forEach((power, id) => {
    if (!power.alive) {
      return;
    }
    for (const region of map.regions) {
      const garrison = power.holdings[region.id].garrison;
      if (garrison <= 0) {
        continue;
      }
      const own = region.cells.filter((cell) => cells[cell].owner === id);
      if (own.length === 0) {
        continue;
      }
      const facing = (rival: boolean) =>
        own.filter((cell) =>
          map.links[cell].some((link) => {
            const other = cells[link.cell].owner;
            return other !== id && (other !== null) === rival;
          }),
        );
      const exposed = facing(true);
      const frontier = exposed.length > 0 ? exposed : facing(false);
      const guards = frontier.length > 0 ? frontier : own;
      for (const cell of guards) {
        posts[cell] = garrison / guards.length;
      }
    }
  });
  return posts;
}
