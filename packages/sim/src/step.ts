import { settleQuarters, wantedQuartersOf } from "./bases.ts";
import { applyCommands } from "./commands.ts";
import { resolveConflict } from "./conflict.ts";
import { distributeEnergy } from "./energy.ts";
import { explore } from "./explore.ts";
import { decayForce, forceFieldOf, forceRoomOf, routeForce } from "./force.ts";
import { lanesOf, lapseAims } from "./front.ts";
import { createLedger, type Ledger } from "./ledger.ts";
import { matterFieldOf, produceMatter, routeMatter, spendMatter, worksOf } from "./matter.ts";
import { convert, wantsOf } from "./profile.ts";
import { lapseRoads, trunksOf, wearRoads } from "./roads.ts";
import type { Command, GameEvent, State, StepResult } from "./types.ts";

export function cloneState(state: State): State {
  return {
    tick: state.tick,
    constants: state.constants,
    map: state.map,
    cells: state.cells.map((cell) => ({
      ...cell,
      branches: cell.branches.slice(),
      stock: cell.stock.slice(),
      siege: cell.siege.slice(),
    })),
    joints: state.joints.map((joint) => ({ ...joint })),
    powers: state.powers.map((power) => ({
      ...power,
      explored: power.explored.slice(),
      lean: power.lean.slice(),
      holdings: power.holdings.map((holding) => ({ ...holding })),
      roads: power.roads.slice(),
    })),
    pressures: state.pressures.map((pressure) => ({ ...pressure })),
  };
}

export function issue(previous: State, commands: Command[]): StepResult {
  const state = cloneState(previous);
  const events: GameEvent[] = [];
  const rejections = applyCommands(state, commands, events);
  return { state, events, rejections };
}

function advance(state: State, events: GameEvent[], ledger: Ledger | null): void {
  lapseRoads(state);
  lapseAims(state);
  const lanes = lanesOf(state);
  const field = forceFieldOf(state, lanes);
  distributeEnergy(state, field.rest, ledger);
  const room = forceRoomOf(state);
  const arming = room.map((left) => left > 0);
  const trunks = trunksOf(state);
  const works = worksOf(state, trunks);
  const quarters = wantedQuartersOf(state);
  const matterField = matterFieldOf(state, works, arming, quarters);
  const forceNeed = field.toFront.map((front, cell) => Math.max(front, field.toHome[cell]));
  const wants = wantsOf(state, matterField.potential, forceNeed);

  produceMatter(state, ledger);
  spendMatter(state, works, room, quarters, wants, ledger);
  routeMatter(state, matterField, ledger);
  routeForce(state, field, ledger);
  wearRoads(state, trunks);
  settleQuarters(state, quarters);
  resolveConflict(state, lanes, field.rest, events, ledger);
  decayForce(state, ledger);
  convert(state, wants);
  explore(state, events);
  if (ledger !== null) {
    ledger.wants = wants;
  }

  state.tick += 1;
}

export function step(previous: State, commands: Command[]): StepResult {
  const { state, events, rejections } = issue(previous, commands);
  advance(state, events, null);
  return { state, events, rejections };
}

export function foresee(previous: State): Ledger {
  const state = cloneState(previous);
  const ledger = createLedger(state);
  advance(state, [], ledger);
  return ledger;
}
