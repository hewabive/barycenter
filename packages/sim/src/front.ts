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
