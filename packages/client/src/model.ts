import type { SeatInfo, TimeState, Triggers } from "@barycenter/protocol";
import type { Constants, GameEvent, Outline, PressureView, View } from "@barycenter/sim";

export interface Game {
  room: string;
  seat: number;
  tuning: boolean;
  tickRate: number;
  outline: Outline;
  constants: Constants;
  time: TimeState;
  seats: SeatInfo[];
  triggers: Triggers;
  view: View;
}

export interface Report {
  tick: number;
  text: string;
  region: number | null;
  urgent: boolean;
}

export interface Summary {
  regions: number;
  cells: number;
  levels: number;
  force: number;
  matter: number;
  profile: number[];
}

export function summarize(view: View): Summary {
  const summary: Summary = { regions: 0, cells: 0, levels: 0, force: 0, matter: 0, profile: [] };
  for (const region of view.regions) {
    const mine = region.holdings?.find((holding) => holding.owner === view.power);
    if (region.estate === null || mine === undefined) {
      continue;
    }
    summary.regions += 1;
    summary.cells += mine.cells;
    summary.levels += mine.level;
    summary.force += mine.force;
    summary.matter += region.estate.matter;
    mine.profile.forEach((built, branch) => {
      summary.profile[branch] = (summary.profile[branch] ?? 0) + built;
    });
  }
  return summary;
}

export function nameOf(game: Game, power: number | null): string {
  if (power === null) {
    return "neutral land";
  }
  return power === game.seat ? "you" : (game.seats[power]?.label ?? `power ${power}`);
}

export function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function report(game: Game, event: GameEvent): Report {
  const tick = game.view.tick;
  const me = game.seat;
  if (event.kind === "eliminated") {
    const text = `${capitalized(nameOf(game, event.power))} lost the last cell`;
    return { tick, text, region: null, urgent: event.power === me };
  }
  const who = capitalized(nameOf(game, event.power));
  const region = event.region;
  if (event.kind === "discovered") {
    return { tick, text: `Discovered region ${region}`, region, urgent: false };
  }
  if (event.kind === "entered") {
    return { tick, text: `${who} entered region ${region}`, region, urgent: false };
  }
  if (event.kind === "secured") {
    const verb = event.power === me ? "hold" : "holds";
    return { tick, text: `${who} ${verb} all of region ${region}`, region, urgent: false };
  }
  if (event.kind === "expelled") {
    const verb = event.power === me ? "were" : "was";
    const text = `${who} ${verb} driven out of region ${region} by ${nameOf(game, event.by)}`;
    return { tick, text, region, urgent: event.power === me };
  }
  const wait = Math.max(0, event.activeAt - tick);
  const text = `${who} will press ${nameOf(game, event.target)} in region ${region} in ${wait} ticks`;
  return { tick, text, region, urgent: event.target === me };
}

export function pressureOn(
  game: Game,
  power: number,
  region: number,
  target: number | null,
): PressureView | undefined {
  return game.view.pressures.find(
    (pressure) =>
      pressure.power === power && pressure.region === region && pressure.target === target,
  );
}

export function expansionCostOf(game: Game, expansions: number): number {
  return game.constants.expandCost * (expansions + 1);
}
