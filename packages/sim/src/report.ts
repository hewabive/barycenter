import { type Battle, battlesOf } from "./battle.ts";
import { lanesOf, postsOf } from "./front.ts";
import { type Muster, mustersOf } from "./muster.ts";
import type { State } from "./types.ts";

export interface ForceReport {
  arming: boolean;
  musters: (Muster | null)[];
  battles: Battle[];
}

export function forceReportFor(state: State, power: number): ForceReport {
  const lanes = lanesOf(state);
  const posts = postsOf(state);
  const { arming, regions } = mustersOf(state, power, lanes, posts);
  return { arming, musters: regions, battles: battlesOf(state, power, lanes, posts) };
}
