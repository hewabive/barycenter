import type { State } from "./types.ts";

export interface Lane {
  pressure: number;
  from: number;
  to: number;
  joint: number;
}

function hopsFrom(state: State, origin: number): number[] {
  const hops = new Array<number>(state.cells.length).fill(Number.POSITIVE_INFINITY);
  hops[origin] = 0;
  const queue = [origin];
  for (let head = 0; head < queue.length; head++) {
    for (const link of state.map.links[queue[head]]) {
      if (hops[link.cell] === Number.POSITIVE_INFINITY) {
        hops[link.cell] = hops[queue[head]] + 1;
        queue.push(link.cell);
      }
    }
  }
  return hops;
}

function contactsOf(state: State, index: number): Lane[] {
  const { cells, map } = state;
  const pressure = state.pressures[index];
  const contacts: Lane[] = [];
  for (const to of map.regions[pressure.region].cells) {
    if (cells[to].owner !== pressure.target) {
      continue;
    }
    for (const link of map.links[to]) {
      if (cells[link.cell].owner === pressure.power) {
        contacts.push({ pressure: index, from: link.cell, to, joint: link.joint });
      }
    }
  }
  return contacts;
}

export function lanesOf(state: State): Lane[] {
  const lanes: Lane[] = [];
  state.pressures.forEach((pressure, index) => {
    const contacts = contactsOf(state, index);
    if (pressure.aim === null) {
      lanes.push(...contacts);
      return;
    }
    const hops = hopsFrom(state, pressure.aim);
    const nearest = contacts.reduce((least, lane) => Math.min(least, hops[lane.to]), Infinity);
    lanes.push(...contacts.filter((lane) => hops[lane.to] === nearest));
  });
  return lanes;
}

export function lapseAims(state: State): void {
  for (const pressure of state.pressures) {
    if (pressure.aim !== null && state.cells[pressure.aim].owner !== pressure.target) {
      pressure.aim = null;
    }
  }
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
