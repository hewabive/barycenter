import { type Constants, createWorld, outlineOf, type State, step, viewFor } from "@barycenter/sim";
import { decide } from "./decide.ts";
import type { Doctrine } from "./doctrine.ts";

export interface MatchOptions {
  seed: number;
  doctrines: Doctrine[];
  ticks: number;
  thinkEvery?: number;
  sampleEvery?: number;
  constants?: Constants;
}

export interface Standing {
  cells: number;
  regions: number;
  levels: number;
  force: number;
  matter: number;
  supply: number;
}

export interface Sample {
  tick: number;
  standings: Standing[];
}

export interface MatchSummary {
  seed: number;
  ticks: number;
  doctrines: string[];
  standings: Standing[];
  eliminatedAt: (number | null)[];
  settled: number[];
  seized: number[];
  ceded: number[];
  lapsed: number[];
  lateSeized: number;
  sharedRegions: number;
  attacks: number;
  lateAttacks: number;
  rejections: number;
  samples: Sample[];
}

const LATE_SHARE = 2 / 3;

export function standingsOf(state: State): Standing[] {
  const standings = state.powers.map(() => ({
    cells: 0,
    regions: 0,
    levels: 0,
    force: 0,
    matter: 0,
    supply: 0,
  }));
  const present = state.powers.map(() => new Set<number>());
  state.cells.forEach((cell, id) => {
    if (cell.owner === null) {
      return;
    }
    const standing = standings[cell.owner];
    standing.cells += 1;
    standing.levels += cell.level;
    standing.force += cell.force;
    standing.matter += cell.stock.reduce((sum, amount) => sum + amount, 0);
    standing.supply += cell.supply;
    present[cell.owner].add(state.map.cells[id].region);
  });
  standings.forEach((standing, power) => {
    standing.regions = present[power].size;
    standing.supply = standing.cells > 0 ? standing.supply / standing.cells : 0;
  });
  return standings;
}

export function runMatch(options: MatchOptions): MatchSummary {
  const thinkEvery = options.thinkEvery ?? 5;
  const sampleEvery = options.sampleEvery ?? 500;
  const powerCount = options.doctrines.length;
  let state = createWorld({
    seed: options.seed,
    powers: powerCount,
    ...(options.constants === undefined ? {} : { constants: options.constants }),
  });
  const outline = outlineOf(state.map);

  const summary: MatchSummary = {
    seed: options.seed,
    ticks: 0,
    doctrines: options.doctrines.map((doctrine) => doctrine.name),
    standings: [],
    eliminatedAt: options.doctrines.map(() => null),
    settled: options.doctrines.map(() => 0),
    seized: options.doctrines.map(() => 0),
    ceded: options.doctrines.map(() => 0),
    lapsed: options.doctrines.map(() => 0),
    lateSeized: 0,
    sharedRegions: 0,
    attacks: 0,
    lateAttacks: 0,
    rejections: 0,
    samples: [{ tick: 0, standings: standingsOf(state) }],
  };

  while (state.tick < options.ticks) {
    const commands = [];
    for (let power = 0; power < powerCount; power++) {
      if (state.powers[power].alive && (state.tick + power) % thinkEvery === 0) {
        const view = viewFor(state, power);
        commands.push(...decide(outline, state.constants, view, options.doctrines[power]));
      }
    }
    const result = step(state, commands);
    const late = result.state.tick > options.ticks * LATE_SHARE;
    result.state.cells.forEach((cell, id) => {
      const before = state.cells[id].owner;
      if (cell.owner === null || cell.owner === before) {
        return;
      }
      if (before === null) {
        summary.settled[cell.owner] += 1;
        return;
      }
      summary.seized[cell.owner] += 1;
      summary.ceded[before] += 1;
      if (late) {
        summary.lateSeized += 1;
      }
    });
    state = result.state;
    summary.rejections += result.rejections.length;

    for (const event of result.events) {
      if (event.kind === "eliminated") {
        summary.eliminatedAt[event.power] = state.tick;
      } else if (event.kind === "lapsed") {
        summary.lapsed[event.power] += event.cells;
      } else if (event.kind === "announced") {
        summary.attacks += 1;
        if (late) {
          summary.lateAttacks += 1;
        }
      }
    }
    if (state.tick % sampleEvery === 0) {
      summary.samples.push({ tick: state.tick, standings: standingsOf(state) });
    }
    if (state.powers.filter((power) => power.alive).length <= 1) {
      break;
    }
  }

  summary.ticks = state.tick;
  summary.sharedRegions = state.map.regions.filter((region) => {
    const holders = new Set(region.cells.map((cell) => state.cells[cell].owner));
    holders.delete(null);
    return holders.size > 1;
  }).length;
  summary.standings = standingsOf(state);
  return summary;
}
