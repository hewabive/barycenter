import type {
  Command,
  Constants,
  EdgeView,
  Holding,
  Nature,
  Outline,
  PressureView,
  Role,
  Status,
  View,
} from "@barycenter/sim";
import type { Doctrine } from "./doctrine.ts";

interface OwnNode {
  id: number;
  nature: Nature;
  status: Status;
  holding: Holding;
}

interface Survey {
  outline: Outline;
  view: View;
  constants: Constants;
  me: number;
  own: OwnNode[];
  campaigns: Map<number, PressureView[]>;
  totalForce: number;
  forceBudget: number;
}

interface Source {
  from: number;
  edge: number;
  reach: number;
}

interface Option {
  to: number;
  sources: Source[];
  score: number;
  required: number;
}

interface Plan {
  commands: Command[];
  staging: Map<number, number>;
  widening: Set<number>;
  active: boolean;
  committed: number;
}

interface Guard {
  urgent: Map<number, number>;
  routine: Map<number, number>;
}

const PLANNED_LEVEL = 2;
const ENERGY_MARGIN = 1.15;
const FORCE_BUDGET_SHARE = 0.8;
const DIAL_STEP = 0.05;
const GARRISON_STEP = 0.5;
const GRAB_RATIO = 2;
const HOLD_RATIO = 1.2;
const RETREAT_RATIO = 0.7;
const FUTILE_RATIO = 1.05;
const SATURATION = 0.95;
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
    ...assignRoles(survey, doctrine),
    ...setDials(survey, doctrine, plan),
    ...setGarrisons(survey, guard, plan),
    ...plan.commands,
    ...expandEdges(survey, doctrine, plan),
  ];
}

function look(outline: Outline, constants: Constants, view: View): Survey {
  const own: OwnNode[] = [];
  for (const node of view.nodes) {
    if (node.holding !== null && node.status !== null && node.nature !== null) {
      own.push({ id: node.id, nature: node.nature, status: node.status, holding: node.holding });
    }
  }
  let spareEnergy = 0;
  for (const node of own) {
    const generation = node.status.role === "power" ? constants.energyRate * node.status.level : 0;
    spareEnergy += node.nature.energyRichness * (constants.baseEnergy + generation);
    spareEnergy -= constants.upkeepPerLevel * node.status.level;
  }
  const campaigns = new Map<number, PressureView[]>();
  for (const pressure of view.pressures) {
    if (pressure.power === view.power) {
      campaigns.set(pressure.to, [...(campaigns.get(pressure.to) ?? []), pressure]);
    }
  }
  return {
    outline,
    view,
    constants,
    me: view.power,
    own,
    campaigns,
    totalForce: own.reduce((sum, node) => sum + node.status.force, 0),
    forceBudget: Math.max(0, (spareEnergy * FORCE_BUDGET_SHARE) / constants.upkeepPerForce),
  };
}

function ownerOf(survey: Survey, node: number): number | null | undefined {
  return survey.view.nodes[node].status?.owner;
}

function isRival(survey: Survey, node: number): boolean {
  const owner = ownerOf(survey, node);
  return owner !== undefined && owner !== null && owner !== survey.me;
}

function reachOf(survey: Survey, edge: EdgeView): number {
  return (edge.capacity ?? 0) * survey.constants.pressurePerCapacity;
}

function reachBetween(survey: Survey, from: number, to: number): number {
  const link = survey.outline.links[from].find((candidate) => candidate.node === to);
  return link === undefined ? 0 : reachOf(survey, survey.view.edges[link.edge]);
}

function marginOf(doctrine: Doctrine): number {
  return 2.4 - 0.8 * doctrine.aggression;
}

function desiredForce(survey: Survey, doctrine: Doctrine): number {
  return survey.own.length * (2 + 3 * doctrine.aggression + 3 * doctrine.caution);
}

function total(values: Map<number, number>): number {
  let sum = 0;
  for (const value of values.values()) {
    sum += value;
  }
  return sum;
}

function assessGuard(survey: Survey, doctrine: Doctrine): Guard {
  const { constants, own, me, view, outline } = survey;
  const attacking = new Set<number>();
  for (const orders of survey.campaigns.values()) {
    for (const order of orders) {
      attacking.add(order.from);
    }
  }
  const guard: Guard = { urgent: new Map(), routine: new Map() };
  for (const node of own) {
    let hostile = 0;
    let bordersRival = false;
    for (const link of outline.links[node.id]) {
      if (isRival(survey, link.node)) {
        bordersRival = true;
        hostile += view.nodes[link.node].status?.force ?? 0;
      }
    }
    let threat = 0;
    for (const pressure of view.pressures) {
      if (pressure.to === node.id && pressure.power !== me) {
        const massed = view.nodes[pressure.from].status?.force ?? 0;
        threat += Math.min(massed, reachBetween(survey, node.id, pressure.from));
      }
    }
    if (threat > 0) {
      const walls = constants.defenseBase + constants.defensePerLevel * node.status.level;
      const needed = (threat * THREAT_MARGIN - walls) / constants.defensePerForce;
      guard.urgent.set(node.id, Math.max(1, needed));
    } else if (bordersRival) {
      const share = attacking.has(node.id) ? 1 - doctrine.aggression : 1;
      guard.routine.set(node.id, (1 + doctrine.caution * 0.5 * hostile) * share);
    }
  }
  return guard;
}

function planPressure(survey: Survey, doctrine: Doctrine, guard: Guard): Plan {
  const { own, me, view, outline } = survey;
  const plan: Plan = {
    commands: [],
    staging: new Map(),
    widening: new Set(),
    active: false,
    committed: 0,
  };
  const guarded = total(guard.urgent) + doctrine.caution * total(guard.routine);
  let uncommitted = survey.totalForce - guarded;
  let landGrabs = 0;
  let attacks = 0;

  for (const [to, orders] of survey.campaigns) {
    const status = view.nodes[to].status;
    if (status === null) {
      continue;
    }
    const neutral = status.owner === null;
    const reach = orders.reduce((sum, order) => sum + reachBetween(survey, order.from, to), 0);
    const floor = status.defense * (neutral ? FUTILE_RATIO : RETREAT_RATIO);
    if (Math.min(uncommitted, reach) < floor) {
      for (const order of orders) {
        plan.commands.push({ kind: "pressure", power: me, from: order.from, to, active: false });
      }
      continue;
    }
    uncommitted -= status.defense * HOLD_RATIO;
    plan.committed += status.defense * HOLD_RATIO;
    plan.active = true;
    if (neutral) {
      landGrabs += 1;
    } else {
      attacks += 1;
    }
  }

  const holdings = new Map<number, number>();
  for (const node of view.nodes) {
    const owner = node.status?.owner;
    if (owner !== undefined && owner !== null) {
      holdings.set(owner, (holdings.get(owner) ?? 0) + 1);
    }
  }
  const aggressors = new Set(
    view.pressures.filter((pressure) => pressure.power !== me).map((pressure) => pressure.power),
  );

  const approaches = new Map<number, Source[]>();
  for (const node of own) {
    for (const link of outline.links[node.id]) {
      if (ownerOf(survey, link.node) === me || survey.campaigns.has(link.node)) {
        continue;
      }
      const reach = reachOf(survey, view.edges[link.edge]);
      const source = { from: node.id, edge: link.edge, reach };
      approaches.set(link.node, [...(approaches.get(link.node) ?? []), source]);
    }
  }

  const grabs: Option[] = [];
  const strikes: Option[] = [];
  const blocked: Option[] = [];
  for (const [to, sources] of approaches) {
    const target = view.nodes[to];
    if (target.status === null || target.nature === null) {
      continue;
    }
    sources.sort((left, right) => right.reach - left.reach || left.from - right.from);
    const worth =
      doctrine.matterBias * target.nature.matterRichness +
      (1 - doctrine.matterBias) * target.nature.energyRichness +
      0.05 * target.nature.levelCap;
    const owner = target.status.owner;
    if (owner === null) {
      const required = target.status.defense * GRAB_RATIO;
      if (sources[0].reach >= required) {
        grabs.push({ to, sources: [sources[0]], score: worth, required });
      }
      continue;
    }
    const required = target.status.defense * marginOf(doctrine);
    const needed: Source[] = [];
    let reach = 0;
    for (const source of sources) {
      if (reach >= required) {
        break;
      }
      needed.push(source);
      reach += source.reach;
    }
    const size = holdings.get(owner) ?? 1;
    let weight = 1;
    if (doctrine.retaliation === "attacker" && aggressors.has(owner)) {
      weight = 3;
    } else if (doctrine.retaliation === "strongest") {
      weight = 1 + size / 5;
    } else if (doctrine.retaliation === "weakest") {
      weight = 1 + 1 / size;
    }
    const score = (weight * (worth + 0.2 * target.status.level)) / target.status.defense;
    if (reach >= required) {
      strikes.push({ to, sources: needed, score, required });
    } else {
      blocked.push({ to, sources, score, required });
    }
  }

  const pursue = (options: Option[], slots: number, mayStage: boolean) => {
    options.sort((left, right) => right.score - left.score || left.to - right.to);
    let taken = 0;
    for (const option of options) {
      if (taken >= slots) {
        return;
      }
      if (uncommitted < option.required) {
        const affordable = guarded + option.required <= survey.forceBudget;
        if (mayStage && !plan.active && plan.staging.size === 0 && affordable) {
          plan.staging.set(option.sources[0].from, option.required);
        }
        return;
      }
      taken += 1;
      uncommitted -= option.required;
      plan.committed += option.required;
      plan.active = true;
      for (const source of option.sources) {
        plan.commands.push({
          kind: "pressure",
          power: me,
          from: source.from,
          to: option.to,
          active: true,
        });
      }
    }
  };
  pursue(grabs, doctrine.frontage - landGrabs, true);
  const ambitious = doctrine.aggression >= 0.5;
  pursue(strikes, (doctrine.aggression > 0.7 ? 2 : 1) - attacks, ambitious);

  if (ambitious && strikes.length === 0 && attacks === 0) {
    blocked.sort((left, right) => right.score - left.score || left.to - right.to);
    const goal = blocked.find((option) => guarded + option.required <= survey.forceBudget);
    if (goal !== undefined) {
      plan.widening.add(goal.sources[0].edge);
    }
  }
  return plan;
}

function assignRoles(survey: Survey, doctrine: Doctrine): Command[] {
  const { constants, own, me } = survey;
  const commands: Command[] = [];
  let extractors = own.filter((node) => node.status.role === "extraction").length;
  let shipyards = own.filter((node) => node.status.role === "shipyard").length;
  let produced = 0;
  let needed = constants.upkeepPerForce * desiredForce(survey, doctrine);
  for (const node of own) {
    const cap = node.nature.levelCap;
    const generation = node.status.role === "power" ? constants.energyRate * cap : 0;
    produced += node.nature.energyRichness * (constants.baseEnergy + generation);
    needed += constants.upkeepPerLevel * cap;
  }
  const wantedShipyards = Math.max(1, Math.round(own.length * doctrine.shipyardShare));

  for (const node of own) {
    if (node.status.role !== null) {
      continue;
    }
    let role: Role = "extraction";
    if (extractors === 0) {
      extractors += 1;
    } else if (produced < needed * ENERGY_MARGIN) {
      role = "power";
      produced += node.nature.energyRichness * constants.energyRate * node.nature.levelCap;
    } else if (shipyards < wantedShipyards) {
      role = "shipyard";
      shipyards += 1;
    } else {
      extractors += 1;
    }
    commands.push({ kind: "role", power: me, node: node.id, role });
  }
  return commands;
}

function setDials(survey: Survey, doctrine: Doctrine, plan: Plan): Command[] {
  const { own, me, view, outline } = survey;
  const commands: Command[] = [];
  const forceWanted =
    plan.active ||
    plan.staging.size > 0 ||
    own.some((node) => node.status.force < node.holding.garrison);
  const tight = survey.forceBudget < desiredForce(survey, doctrine);

  for (const node of own) {
    if (node.status.role === null) {
      continue;
    }
    const cap = node.nature.levelCap;
    const level = node.status.level;
    const held = tight && node.status.role !== "power" && level >= PLANNED_LEVEL;
    let dial = 0;
    if (level < cap && !held) {
      dial = level < PLANNED_LEVEL ? 1 : 0.4 + 0.5 * (1 - level / cap);
    }
    if (node.status.role === "shipyard" && forceWanted) {
      dial = Math.max(dial, 0.5 + 0.5 * doctrine.aggression);
    }
    if (outline.links[node.id].some((link) => view.edges[link.edge].expanding === me)) {
      dial = Math.max(dial, 0.6);
    }
    if (Math.abs(dial - node.holding.dial) > DIAL_STEP) {
      commands.push({ kind: "dial", power: me, node: node.id, value: dial });
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
    for (const [node, value] of tier) {
      wanted.set(node, value * scale);
    }
    pool = Math.max(0, pool - asked * scale);
  }

  const commands: Command[] = [];
  for (const node of survey.own) {
    const target = (wanted.get(node.id) ?? 0) + (plan.staging.get(node.id) ?? 0);
    const value = Math.round(target / GARRISON_STEP) * GARRISON_STEP;
    if (Math.abs(value - node.holding.garrison) >= GARRISON_STEP) {
      commands.push({ kind: "garrison", power: survey.me, node: node.id, value });
    }
  }
  return commands;
}

function expandEdges(survey: Survey, doctrine: Doctrine, plan: Plan): Command[] {
  const { constants, me, view, outline } = survey;
  const commands: Command[] = [];
  const wanted = new Set(plan.widening);

  for (const [to, orders] of survey.campaigns) {
    const status = view.nodes[to].status;
    if (status === null || status.owner === null) {
      continue;
    }
    const reach = orders.reduce((sum, order) => sum + reachBetween(survey, order.from, to), 0);
    if (reach >= status.defense * marginOf(doctrine)) {
      continue;
    }
    for (const order of orders) {
      const link = outline.links[order.from].find((candidate) => candidate.node === to);
      if (link !== undefined) {
        wanted.add(link.edge);
      }
    }
  }

  for (const edge of view.edges) {
    if (edge.capacity === null || edge.expansions === null) {
      continue;
    }
    const route = outline.edges[edge.id];
    const internal = ownerOf(survey, route.a) === me && ownerOf(survey, route.b) === me;
    const load = Math.max(
      Math.abs(edge.matterFlow),
      Math.abs(edge.forceFlow) / constants.forcePerCapacity,
    );
    const expandable = edge.expansions < constants.maxExpansions;
    const needed = wanted.has(edge.id) || (internal && load >= SATURATION * edge.capacity);
    if (needed && expandable && edge.expanding === null) {
      commands.push({ kind: "expand", power: me, edge: edge.id, active: true });
    }
  }
  return commands;
}
