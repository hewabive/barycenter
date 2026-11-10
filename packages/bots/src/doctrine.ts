export type Retaliation = "attacker" | "strongest" | "weakest";

export interface Doctrine {
  name: string;
  aggression: number;
  caution: number;
  matterBias: number;
  shipyardShare: number;
  frontage: number;
  retaliation: Retaliation;
}

export const doctrines: Record<string, Doctrine> = {
  aggressor: {
    name: "aggressor",
    aggression: 0.9,
    caution: 0.3,
    matterBias: 0.6,
    shipyardShare: 0.25,
    frontage: 2,
    retaliation: "weakest",
  },
  builder: {
    name: "builder",
    aggression: 0.25,
    caution: 0.9,
    matterBias: 0.5,
    shipyardShare: 0.2,
    frontage: 2,
    retaliation: "attacker",
  },
  opportunist: {
    name: "opportunist",
    aggression: 0.55,
    caution: 0.6,
    matterBias: 0.4,
    shipyardShare: 0.2,
    frontage: 3,
    retaliation: "strongest",
  },
};
