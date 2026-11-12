import { EPSILON, EXTRACTION, heldOf, POWER, SHIPYARD, spread } from "./rules.ts";
import { BRANCHES, type State } from "./types.ts";

export function wantsOf(state: State, matterNeed: number[], forceNeed: number[]): number[][] {
  const { constants, cells, map } = state;
  const shortage = cells.map((cell) => (cell.owner === null ? 0 : 1 - cell.supply));
  const energyNeed = spread(state, shortage);
  const tilt = state.powers.map((power) =>
    power.lean.map((value) => constants.leanSpan ** (2 * value - 1)),
  );

  return cells.map((cell, id) => {
    if (cell.owner === null) {
      return BRANCHES.map(() => 0);
    }
    const nature = map.cells[id];
    const scores = BRANCHES.map(() => 0);
    scores[EXTRACTION] =
      heldOf(nature.deposits) *
      (constants.extractionFloor + constants.extractionGain * matterNeed[id]);
    scores[POWER] =
      nature.energyRichness * (constants.powerFloor + constants.powerGain * energyNeed[id]);
    scores[SHIPYARD] = constants.shipyardFloor + constants.shipyardGain * forceNeed[id];
    let total = 0;
    for (let branch = 0; branch < scores.length; branch++) {
      scores[branch] *= tilt[cell.owner][branch];
      total += scores[branch];
    }
    return total > EPSILON
      ? scores.map((score) => score / total)
      : scores.map(() => 1 / scores.length);
  });
}

export function convert(state: State, wants: number[][]): void {
  const rate = state.constants.convertRate;
  state.cells.forEach((cell, id) => {
    if (cell.owner === null || cell.level <= 0) {
      return;
    }
    for (let branch = 0; branch < cell.branches.length; branch++) {
      const wanted = cell.level * wants[id][branch];
      cell.branches[branch] += (wanted - cell.branches[branch]) * rate;
    }
  });
}
