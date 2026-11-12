import {
  BRANCHES,
  type Command,
  type Constants,
  type Estate,
  type HoldingView,
  type Outline,
  type PressureView,
  type RegionView,
  type View,
} from "@barycenter/sim";
import type { Doctrine } from "./doctrine.ts";

interface Own {
  id: number;
  region: RegionView;
  estate: Estate;
  mine: HoldingView;
}

interface Survey {
  outline: Outline;
  view: View;
  constants: Constants;
  me: number;
  own: Own[];
  campaigns: Map<string, PressureView>;
  totalForce: number;
  forceBudget: number;
}

interface Option {
  region: number;
  target: number | null;
  score: number;
  required: number;
}

interface Plan {
  commands: Command[];
  staging: Map<number, number>;
  fronts: Set<number>;
  active: boolean;
  committed: number;
}

interface Guard {
  urgent: Map<number, number>;
  routine: Map<number, number>;
}

const POWER_BRANCH = BRANCHES.indexOf("power");
const FORCE_BUDGET_SHARE = 0.8;
const LEAN_STEP = 0.02;
const DIAL_STEP = 0.05;
const GARRISON_STEP = 0.5;
const GRAB_RATIO = 2;
const HOLD_RATIO = 1.2;
const RETREAT_RATIO = 0.7;
const STRIKE_WIDTH = 2;
const ROAD_START = 0.6;
const ROAD_KEEP = 0.15;
const THREAT_MARGIN = 1.15;
const FORCE_GROWTH = 1.25;
const FORCE_STEP = 5;

export function decide(
  outline: Outline,
  constants: Constants,
  view: View,
  doctrine: Doctrine,
): Command[] {
  const survey = look(outline, constants, view);
  if (survey.own.length === 0) {
    return [];
  }
  const guard = assessGuard(survey, doctrine);
  const plan = planPressure(survey, doctrine, guard);
  return [
    ...setLean(survey, doctrine),
    ...setDials(survey, doctrine, plan),
    ...setGarrisons(survey, guard, plan),
    ...plan.commands,
    ...layRoads(survey, plan),
  ];
}

function keyOf(region: number, target: number | null): string {
  return `${region}:${target ?? "neutral"}`;
}

function look(outline: Outline, constants: Constants, view: View): Survey {
  const me = view.power;
  const own: Own[] = [];
  let spareEnergy = 0;
  for (const region of view.regions) {
    const mine = region.holdings?.find((holding) => holding.owner === me);
    if (region.estate === null || region.nature === null || mine === undefined) {
      continue;
    }
    own.push({ id: region.id, region, estate: region.estate, mine });
    const generation =
      constants.baseEnergy * mine.cells + constants.energyRate * mine.profile[POWER_BRANCH];
    spareEnergy += region.nature.energyRichness * generation;
    spareEnergy -= constants.upkeepPerLevel * mine.level;
  }
  const campaigns = new Map<string, PressureView>();
  for (const pressure of view.pressures) {
    if (pressure.power === me) {
      campaigns.set(keyOf(pressure.region, pressure.target), pressure);
    }
  }
  return {
    outline,
    view,
    constants,
    me,
    own,
    campaigns,
    totalForce: own.reduce((sum, holding) => sum + holding.mine.force, 0),
    forceBudget: Math.max(0, (spareEnergy * FORCE_BUDGET_SHARE) / constants.upkeepPerForce),
  };
}

function marginOf(doctrine: Doctrine): number {
  return 2.4 - 0.8 * doctrine.aggression;
}

function total(values: Map<number, number>): number {
  let sum = 0;
  for (const value of values.values()) {
    sum += value;
  }
  return sum;
}

function foreignIn(survey: Survey, region: number, target: number | null): HoldingView | undefined {
  return survey.view.regions[region].holdings?.find((holding) => holding.owner === target);
}

function assessGuard(survey: Survey, doctrine: Doctrine): Guard {
  const { own, me, view } = survey;
  const guard: Guard = { urgent: new Map(), routine: new Map() };
  for (const holding of own) {
    if (holding.estate.exposure === 0) {
      continue;
    }
    const threatened = view.pressures.some(
      (pressure) => pressure.target === me && pressure.region === holding.id,
    );
    if (threatened) {
      guard.urgent.set(holding.id, Math.max(1, holding.estate.hostile * THREAT_MARGIN));
    } else {
      guard.routine.set(holding.id, 1 + doctrine.caution * 0.5 * holding.estate.hostile);
    }
  }
  return guard;
}

function stagingGround(survey: Survey, region: number): number | null {
  if (survey.view.regions[region].estate !== null) {
    return region;
  }
  let best: Own | null = null;
  for (const neighbor of survey.outline.neighbors[region]) {
    const holding = survey.own.find((candidate) => candidate.id === neighbor.region);
    if (holding !== undefined && (best === null || holding.mine.force > best.mine.force)) {
      best = holding;
    }
  }
  return best?.id ?? null;
}

function planPressure(survey: Survey, doctrine: Doctrine, guard: Guard): Plan {
  const { me, view } = survey;
  const plan: Plan = {
    commands: [],
    staging: new Map(),
    fronts: new Set(),
    active: false,
    committed: 0,
  };
  const guarded = total(guard.urgent) + doctrine.caution * total(guard.routine);
  let uncommitted = survey.totalForce - guarded;
  let landGrabs = 0;
  let attacks = 0;

  for (const pressure of survey.campaigns.values()) {
    const holding = foreignIn(survey, pressure.region, pressure.target);
    const neutral = pressure.target === null;
    const futile =
      holding === undefined ||
      holding.contact === 0 ||
      (!neutral && Math.min(uncommitted, holding.reach) < holding.defense * RETREAT_RATIO);
    if (futile) {
      plan.commands.push({
        kind: "pressure",
        power: me,
        region: pressure.region,
        target: pressure.target,
        active: false,
      });
      continue;
    }
    const ground = neutral ? null : stagingGround(survey, pressure.region);
    if (ground !== null) {
      plan.fronts.add(ground);
    }
    const held = holding.defense * (neutral ? 1 : HOLD_RATIO);
    uncommitted -= held;
    plan.committed += held;
    plan.active = true;
    if (neutral) {
      landGrabs += 1;
    } else {
      attacks += 1;
    }
  }

  const sizes = new Map<number, number>();
  for (const region of view.regions) {
    for (const holding of region.holdings ?? []) {
      if (holding.owner !== null) {
        sizes.set(holding.owner, (sizes.get(holding.owner) ?? 0) + holding.cells);
      }
    }
  }
  const aggressors = new Set(
    view.pressures.filter((pressure) => pressure.target === me).map((pressure) => pressure.power),
  );

  const grabs: Option[] = [];
  const strikes: Option[] = [];
  for (const region of view.regions) {
    if (region.holdings === null || region.nature === null) {
      continue;
    }
    const worth =
      doctrine.matterBias * region.nature.deposits.reduce((sum, value) => sum + value, 0) +
      (1 - doctrine.matterBias) * region.nature.energyRichness;
    for (const holding of region.holdings) {
      const taken = survey.campaigns.has(keyOf(region.id, holding.owner));
      if (holding.owner === me || holding.contact === 0 || taken) {
        continue;
      }
      if (holding.owner === null) {
        const started = region.estate === null ? 0 : 1;
        grabs.push({
          region: region.id,
          target: null,
          score: worth + started,
          required: holding.defense * GRAB_RATIO,
        });
        continue;
      }
      const required = holding.defense * marginOf(doctrine) * STRIKE_WIDTH;
      const size = sizes.get(holding.owner) ?? 1;
      let weight = 1;
      if (doctrine.retaliation === "attacker" && aggressors.has(holding.owner)) {
        weight = 3;
      } else if (doctrine.retaliation === "strongest") {
        weight = 1 + size / 40;
      } else if (doctrine.retaliation === "weakest") {
        weight = 1 + 8 / size;
      }
      const density = holding.level / holding.cells;
      const option = {
        region: region.id,
        target: holding.owner,
        score: (weight * (worth + 0.3 * density)) / holding.defense,
        required,
      };
      if (holding.reach >= holding.defense * marginOf(doctrine)) {
        strikes.push(option);
      }
    }
  }

  const pursue = (options: Option[], slots: number, mayStage: boolean) => {
    options.sort(
      (left, right) =>
        right.score - left.score ||
        left.region - right.region ||
        (left.target ?? -1) - (right.target ?? -1),
    );
    let taken = 0;
    for (const option of options) {
      if (taken >= slots) {
        return;
      }
      if (uncommitted < option.required) {
        const affordable = guarded + option.required <= survey.forceBudget;
        const ground = stagingGround(survey, option.region);
        if (mayStage && !plan.active && plan.staging.size === 0 && affordable && ground !== null) {
          plan.staging.set(ground, option.required);
        }
        return;
      }
      taken += 1;
      uncommitted -= option.required;
      plan.committed += option.required;
      plan.active = true;
      plan.commands.push({
        kind: "pressure",
        power: me,
        region: option.region,
        target: option.target,
        active: true,
      });
    }
  };
  pursue(grabs, doctrine.frontage - landGrabs, true);
  pursue(strikes, (doctrine.aggression > 0.7 ? 2 : 1) - attacks, doctrine.aggression >= 0.5);

  return plan;
}

function setLean(survey: Survey, doctrine: Doctrine): Command[] {
  const commands: Command[] = [];
  BRANCHES.forEach((branch, index) => {
    const value = doctrine.lean[index];
    if (Math.abs(value - survey.view.lean[index]) > LEAN_STEP) {
      commands.push({ kind: "lean", power: survey.me, branch, value });
    }
  });
  return commands;
}

function setDials(survey: Survey, doctrine: Doctrine, plan: Plan): Command[] {
  const { own, me, view, outline } = survey;
  const commands: Command[] = [];
  const forceWanted =
    plan.active ||
    plan.staging.size > 0 ||
    own.some((holding) => holding.mine.force < holding.estate.garrison);

  for (const holding of own) {
    const cap = holding.estate.levelCap;
    const level = holding.mine.level;
    let dial = level < cap ? 0.5 + 0.5 * (1 - level / cap) : 0;
    if (forceWanted) {
      dial = Math.max(dial, 0.5 + 0.5 * doctrine.aggression);
    }
    if (outline.neighbors[holding.id].some((neighbor) => view.edges[neighbor.edge].road)) {
      dial = Math.max(dial, 0.6);
    }
    if (Math.abs(dial - holding.estate.dial) > DIAL_STEP) {
      commands.push({ kind: "dial", power: me, region: holding.id, value: dial });
    }
  }
  return commands;
}

function setGarrisons(survey: Survey, guard: Guard, plan: Plan): Command[] {
  const growth = Math.max(survey.totalForce * FORCE_GROWTH, survey.totalForce + FORCE_STEP);
  let pool = Math.max(0, Math.min(survey.forceBudget, growth) - plan.committed);
  const wanted = new Map<number, number>();
  for (const tier of [guard.urgent, guard.routine]) {
    const asked = total(tier);
    const scale = asked > pool && asked > 0 ? pool / asked : 1;
    for (const [region, value] of tier) {
      wanted.set(region, value * scale);
    }
    pool = Math.max(0, pool - asked * scale);
  }

  const commands: Command[] = [];
  for (const holding of survey.own) {
    const target = (wanted.get(holding.id) ?? 0) + (plan.staging.get(holding.id) ?? 0);
    const value = Math.round(target / GARRISON_STEP) * GARRISON_STEP;
    if (Math.abs(value - holding.estate.garrison) >= GARRISON_STEP) {
      commands.push({ kind: "garrison", power: survey.me, region: holding.id, value });
    }
  }
  return commands;
}

function coreOf(survey: Survey): number {
  let core = survey.own[0];
  for (const holding of survey.own) {
    if (holding.mine.level > core.mine.level) {
      core = holding;
    }
  }
  return core.id;
}

function supplyLines(survey: Survey, plan: Plan): Set<number> {
  const lines = new Set<number>();
  if (plan.fronts.size === 0) {
    return lines;
  }
  const { outline, view } = survey;
  const core = coreOf(survey);
  const via = new Map<number, { region: number; edge: number }>();
  const reached = new Set([core]);
  const queue = [core];
  for (let head = 0; head < queue.length; head++) {
    for (const neighbor of outline.neighbors[queue[head]]) {
      if (reached.has(neighbor.region) || view.regions[neighbor.region].estate === null) {
        continue;
      }
      reached.add(neighbor.region);
      via.set(neighbor.region, { region: queue[head], edge: neighbor.edge });
      queue.push(neighbor.region);
    }
  }
  for (const front of plan.fronts) {
    for (let step = via.get(front); step !== undefined; step = via.get(step.region)) {
      lines.add(step.edge);
    }
  }
  return lines;
}

function layRoads(survey: Survey, plan: Plan): Command[] {
  const lines = supplyLines(survey, plan);
  const commands: Command[] = [];
  for (const edge of survey.view.edges) {
    if (!edge.open) {
      continue;
    }
    const wanted = lines.has(edge.id) || edge.load >= (edge.road ? ROAD_KEEP : ROAD_START);
    if (wanted !== edge.road) {
      commands.push({ kind: "road", power: survey.me, edge: edge.id, active: wanted });
    }
  }
  return commands;
}
