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
  nodes: number;
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
  landTaken: number[];
  conquests: number[];
  losses: number[];
  lateConquests: number;
  attacks: number;
  lateAttacks: number;
  rejections: number;
  samples: Sample[];
}

const LATE_SHARE = 2 / 3;

export function standingsOf(state: State): Standing[] {
  const standings = state.powers.map(() => ({
    nodes: 0,
    levels: 0,
    force: 0,
    matter: 0,
    supply: 0,
  }));
  for (const node of state.nodes) {
    if (node.owner === null) {
      continue;
    }
    const standing = standings[node.owner];
    standing.nodes += 1;
    standing.levels += node.level;
    standing.force += node.force;
    standing.matter += node.matter;
    standing.supply += node.supply;
  }
  for (const standing of standings) {
    standing.supply = standing.nodes > 0 ? standing.supply / standing.nodes : 0;
  }
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
    landTaken: options.doctrines.map(() => 0),
    conquests: options.doctrines.map(() => 0),
    losses: options.doctrines.map(() => 0),
    lateConquests: 0,
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
    state = result.state;
    summary.rejections += result.rejections.length;

    for (const event of result.events) {
      if (event.kind === "eliminated") {
        summary.eliminatedAt[event.power] = state.tick;
      } else if (event.kind === "announced") {
        summary.attacks += 1;
        if (state.tick > options.ticks * LATE_SHARE) {
          summary.lateAttacks += 1;
        }
      } else if (event.kind === "captured") {
        if (event.from === null) {
          summary.landTaken[event.to] += 1;
          continue;
        }
        summary.conquests[event.to] += 1;
        summary.losses[event.from] += 1;
        if (state.tick > options.ticks * LATE_SHARE) {
          summary.lateConquests += 1;
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
  summary.standings = standingsOf(state);
  return summary;
}
