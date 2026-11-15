export type Retaliation = "attacker" | "strongest" | "weakest";

export interface Doctrine {
  name: string;
  aggression: number;
  caution: number;
  forward: number;
  matterBias: number;
  lean: number[];
  frontage: number;
  retaliation: Retaliation;
}

export const doctrines: Record<string, Doctrine> = {
  aggressor: {
    name: "aggressor",
    aggression: 0.9,
    caution: 0.3,
    forward: 0.8,
    matterBias: 0.6,
    lean: [0.5, 0.6, 0.6],
    frontage: 3,
    retaliation: "weakest",
  },
  builder: {
    name: "builder",
    aggression: 0.25,
    caution: 0.9,
    forward: 0.5,
    matterBias: 0.5,
    lean: [0.6, 0.6, 0.4],
    frontage: 3,
    retaliation: "attacker",
  },
  opportunist: {
    name: "opportunist",
    aggression: 0.55,
    caution: 0.6,
    forward: 0.65,
    matterBias: 0.4,
    lean: [0.5, 0.6, 0.5],
    frontage: 3,
    retaliation: "strongest",
  },
};
