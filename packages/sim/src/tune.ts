import { cloneState } from "./step.ts";
import type { Constants, State } from "./types.ts";

type Limit = [minimum: number, maximum: number, whole?: boolean];

const SHARE: Limit = [0, 1];
const REACH: Limit = [0, 0.99];
const DEFAULT_LIMIT: Limit = [0, 1_000_000];

const LIMITS: Partial<Record<keyof Constants, Limit>> = {
  hopLoss: REACH,
  roadRelief: SHARE,
  roadMemory: SHARE,
  shortageOutput: SHARE,
  forceDecay: SHARE,
  strandedDecay: SHARE,
  excessDecay: SHARE,
  flagFall: SHARE,
  flagRise: SHARE,
  restUpkeep: SHARE,
  defenderLossShare: SHARE,
  captureLevelLoss: SHARE,
  defaultDial: SHARE,
  defaultLean: SHARE,
  convertRate: SHARE,
  attrition: SHARE,
  leanSpan: [1, 1000],
  forceCost: [0.01, 1_000_000],
  energyRounds: [0, 64, true],
  visionRange: [0, 8, true],
  maxGrade: [0, 8, true],
  announceTicks: [0, 10_000, true],
  startCells: [1, 64, true],
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
