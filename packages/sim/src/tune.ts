import { cloneState } from "./step.ts";
import type { Constants, State } from "./types.ts";

type Limit = [minimum: number, maximum: number, whole?: boolean];

const SHARE: Limit = [0, 1];
const REACH: Limit = [0, 0.99];
const DEFAULT_LIMIT: Limit = [0, 1_000_000];

const LIMITS: Partial<Record<keyof Constants, Limit>> = {
  energyFade: REACH,
  matterReach: REACH,
  forceReach: REACH,
  garrisonPull: REACH,
  shortageOutput: SHARE,
  forceDecay: SHARE,
  defenderLossShare: SHARE,
  captureLevelLoss: SHARE,
  roleChangeLevelLoss: SHARE,
  defaultDial: SHARE,
  attrition: SHARE,
  forceCost: [0.01, 1_000_000],
  energyRounds: [0, 32, true],
  visionRange: [0, 8, true],
  maxExpansions: [0, 32, true],
  announceTicks: [0, 10_000, true],
};

export function retune(state: State, changes: Partial<Constants>): State | null {
  const constants = { ...state.constants };
  for (const [name, value] of Object.entries(changes)) {
    if (!Object.hasOwn(constants, name) || typeof value !== "number") {
      return null;
    }
    const key = name as keyof Constants;
    const [minimum, maximum, whole] = LIMITS[key] ?? DEFAULT_LIMIT;
    if (!(value >= minimum && value <= maximum) || (whole === true && !Number.isInteger(value))) {
      return null;
    }
    constants[key] = value;
  }
  return { ...cloneState(state), constants };
}
