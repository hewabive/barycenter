import { type Commitment, commitmentOf, siegeGainOf, wearOf } from "./conflict.ts";
import { widthOf } from "./force.ts";
import type { Lane } from "./front.ts";
import { defenseOf, EPSILON } from "./rules.ts";
import type { State } from "./types.ts";

export interface Siege {
  cell: number;
  level: number;
  force: number;
  defense: number;
  bare: number;
  facing: number;
  pressure: number;
  limit: number;
  contacts: number;
  progress: number;
  rate: number;
}

export interface Battle {
  power: number;
  region: number;
  target: number | null;
  attackerLoss: number;
  defenderLoss: number;
  sieges: Siege[];
}

function facingOf(
  state: State,
  lanes: Lane[],
  posts: number[],
  commitment: Commitment,
): Map<Lane, number> {
  const facing = new Map<Lane, number>();
  commitment.active.forEach((lane, index) => {
    facing.set(lane, commitment.commits[index]);
  });
  const origins = new Map<number, Lane[]>();
  for (const lane of lanes) {
    origins.set(lane.from, [...(origins.get(lane.from) ?? []), lane]);
  }
  const weaker = (left: Lane, right: Lane) =>
    defenseOf(state, left.to) - defenseOf(state, right.to) || left.to - right.to;
  for (const [origin, routes] of origins) {
    const pressing = routes.reduce((sum, lane) => sum + (facing.get(lane) ?? 0), 0);
    const waiting = Math.max(0, state.cells[origin].force - posts[origin]) - pressing;
    if (waiting <= EPSILON) {
      continue;
    }
    const resting = routes.filter((lane) => (facing.get(lane) ?? 0) <= EPSILON);
    const pool = resting.length > 0 ? resting : routes;
    const next = pool.reduce((best, lane) => (weaker(lane, best) < 0 ? lane : best));
    facing.set(next, (facing.get(next) ?? 0) + waiting);
  }
  return facing;
}

export function battlesOf(state: State, viewer: number, lanes: Lane[], posts: number[]): Battle[] {
  const { constants, cells } = state;
  const commitment = commitmentOf(state, lanes, posts);
  const { totals } = commitment;
  const facing = facingOf(state, lanes, posts, commitment);
  const battles = new Map<number, Battle>();
  for (const lane of lanes) {
    const { power, region, target } = state.pressures[lane.pressure];
    if (power !== viewer && target !== viewer) {
      continue;
    }
    let battle = battles.get(lane.pressure);
    if (battle === undefined) {
      battle = { power, region, target, attackerLoss: 0, defenderLoss: 0, sieges: [] };
      battles.set(lane.pressure, battle);
    }
    let siege = battle.sieges.find((known) => known.cell === lane.to);
    if (siege === undefined) {
      const pressed = cells[lane.to];
      const defense = defenseOf(state, lane.to);
      const pressure = totals.get(lane.to)?.[power] ?? 0;
      const progress = pressed.siege[power];
      const fading = progress > 0 ? -Math.min(progress, constants.siegeDecay) : 0;
      const wear = wearOf(constants, pressure, defense);
      battle.attackerLoss += wear;
      battle.defenderLoss += Math.min(pressed.force, wear * constants.defenderLossShare);
      siege = {
        cell: lane.to,
        level: pressed.level,
        force: pressed.force,
        defense,
        bare: defense - constants.defensePerForce * pressed.force,
        facing: 0,
        pressure,
        limit: 0,
        contacts: 0,
        progress,
        rate: pressure > defense ? siegeGainOf(constants, pressure, defense) : fading,
      };
      battle.sieges.push(siege);
    }
    siege.facing += facing.get(lane) ?? 0;
    siege.limit += widthOf(state, lane);
    siege.contacts += 1;
  }
  return [...battles.values()];
}
