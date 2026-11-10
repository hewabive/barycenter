import { applyCommands } from "./commands.ts";
import { resolveConflict } from "./conflict.ts";
import { distributeEnergy } from "./energy.ts";
import { explore } from "./explore.ts";
import { decayForce, forceWantedBy, routeForce } from "./force.ts";
import { produceMatter, routeMatter, spendMatter } from "./matter.ts";
import type { Command, GameEvent, State, StepResult } from "./types.ts";

export function cloneState(state: State): State {
  return {
    tick: state.tick,
    constants: state.constants,
    map: state.map,
    nodes: state.nodes.map((node) => ({ ...node, siege: node.siege.slice() })),
    edges: state.edges.map((edge) => ({ ...edge })),
    powers: state.powers.map((power) => ({ ...power, explored: power.explored.slice() })),
    pressures: state.pressures.map((pressure) => ({ ...pressure })),
  };
}

export function issue(previous: State, commands: Command[]): StepResult {
  const state = cloneState(previous);
  const events: GameEvent[] = [];
  const rejections = applyCommands(state, commands, events);
  return { state, events, rejections };
}

export function step(previous: State, commands: Command[]): StepResult {
  const { state, events, rejections } = issue(previous, commands);

  distributeEnergy(state);
  const forceWanted = forceWantedBy(state);
  produceMatter(state);
  spendMatter(state, forceWanted);
  routeMatter(state, forceWanted);
  routeForce(state);
  resolveConflict(state, events);
  decayForce(state);
  explore(state, events);

  state.tick += 1;
  return { state, events, rejections };
}
