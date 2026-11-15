import type { Watch } from "@barycenter/protocol";
import type { Battle, Estate, ForceReport, Muster, Siege } from "@barycenter/sim";
import { amount, button, el, percent, write } from "./dom.ts";
import { capitalized, type Game, nameOf, pressureOn } from "./model.ts";
import { createSheet, fill } from "./sheet.ts";

export interface Forces {
  open(): void;
  watch(): Watch | null;
  show(game: Game): void;
}

export interface ForcesActions {
  select(region: number): void;
  watch(watch: Watch | null): void;
}

const SHOWN = 0.05;
const STAND_COLUMNS = ["Region", "Force", "Garrison", "Front", "Moving", "Why it is there"];
const BATTLE_COLUMNS = [
  "Cell",
  "Level",
  "Force",
  "Defense",
  "Facing",
  "Pressure",
  "Siege",
  "Outlook",
];
const STAND_LEGEND =
  "Garrison shows the force resting in the garrison of the region and the room it has. " +
  "Front shows the force standing at a front and the force wanted there by attacks, defense " +
  "and reinforcement orders. " +
  "Moving is force on its way: to a front that is short, or back to a garrison with room.";

function share(standing: number, wanted: number): string {
  return wanted < SHOWN ? "—" : `${amount(standing)} / ${amount(wanted)}`;
}

function waitOf(game: Game, power: number, region: number, target: number | null): number {
  const pressure = pressureOn(game, power, region, target);
  return pressure === undefined ? 0 : Math.max(0, pressure.activeAt - game.view.tick);
}

function reasonsOf(game: Game, region: number, estate: Estate, muster: Muster): string[] {
  const reasons: string[] = [];
  for (const duty of muster.duties) {
    const wait = waitOf(game, duty.power, duty.region, duty.target);
    const subject =
      duty.power === game.seat
        ? `Attack on ${nameOf(game, duty.target)} in region ${duty.region}`
        : `Defense against ${nameOf(game, duty.power)}`;
    const start = wait > 0 ? `, starts in ${wait} ticks` : "";
    reasons.push(`${subject} needs ${amount(duty.need)}${start}`);
  }
  if (estate.reinforcement >= SHOWN) {
    reasons.push(`Reinforcement of ${amount(estate.reinforcement)} is ordered here`);
  }
  const ordered = estate.quartersWanted;
  if (estate.quarters < ordered - SHOWN) {
    reasons.push(
      `Garrison is being built: room for ${amount(estate.quarters)} of ${amount(ordered)}`,
    );
  }
  if (estate.garrison !== null && estate.garrison > estate.quartersLimit + SHOWN) {
    reasons.push(`The hub here can house only ${amount(estate.quartersLimit)}`);
  }
  let routed = 0;
  for (const route of muster.routes) {
    routed += route.amount;
    if (route.amount >= SHOWN) {
      const goal = route.region === region ? "cells here" : `region ${route.region}`;
      reasons.push(`${amount(route.amount)} is on its way to ${goal}`);
    }
  }
  const idle = muster.reserve - routed;
  if (idle >= SHOWN) {
    reasons.push(
      `${amount(idle)} stands still: it waits at its front, or no garrison in reach has room`,
    );
  }
  return reasons;
}

function titleOf(game: Game, battle: Battle): string {
  const mine = battle.power === game.seat;
  const attacker = nameOf(game, battle.power);
  const defender = nameOf(game, battle.target);
  const who = mine ? `You press ${defender}` : `${capitalized(attacker)} presses you`;
  const where = `${who} in region ${battle.region}`;
  const wait = waitOf(game, battle.power, battle.region, battle.target);
  if (wait > 0) {
    return `${where} · starts in ${wait} ticks`;
  }
  const pressure = battle.sieges.reduce((sum, siege) => sum + siege.pressure, 0);
  if (pressure < SHOWN) {
    return `${where} · no pressure now`;
  }
  const paid = `${attacker} ${mine ? "lose" : "loses"} ${amount(battle.attackerLoss, 2)} a tick`;
  const taken =
    battle.target === null
      ? ""
      : `, ${defender} ${mine ? "loses" : "lose"} ${amount(battle.defenderLoss, 2)}`;
  return `${where} · pressure ${amount(pressure)} · ${paid}${taken}`;
}

function outlookOf(siege: Siege, waiting: boolean): string {
  if (waiting) {
    return "Not started";
  }
  if (siege.rate > 0) {
    return `Falls in about ${Math.ceil((1 - siege.progress) / siege.rate)} ticks`;
  }
  const fading = siege.rate < 0 ? ", the siege fades" : "";
  const contacts = siege.contacts === 1 ? "1 contact carries" : `${siege.contacts} contacts carry`;
  const line = `${contacts} at most ${amount(siege.limit)}`;
  if (siege.limit <= siege.bare) {
    return `Cannot fall: ${line}, its levels alone defend ${amount(siege.bare)}${fading}`;
  }
  if (siege.limit <= siege.defense) {
    return `Holds while its force lasts: ${line}${fading}`;
  }
  if (siege.pressure < SHOWN) {
    return `Not pressed: too little force at the line${fading}`;
  }
  return `Holds: pressure is below defense${fading}`;
}

function battleLegend(game: Game): string {
  const { defenseBase, neutralDefense, defensePerLevel, defensePerForce } = game.constants;
  const neutral = neutralDefense === defenseBase ? "" : ` (${neutralDefense} on neutral land)`;
  return (
    "A cell falls when the pressure on it stays above its defense until the siege reaches 100%. " +
    `Defense is ${defenseBase}${neutral} plus ${defensePerLevel} a level ` +
    `and ${defensePerForce} a unit of force in the cell. ` +
    "Facing is the attacker's force standing against the cell: what presses it and what waits to. " +
    "Force that touches several cells is counted once, where it presses or would press next. " +
    "Pressure shows what is committed now and the most the contacts can carry."
  );
}

export function createForces(root: HTMLDialogElement, actions: ForcesActions): Forces {
  const totals = el("div", { class: "totals" });
  const yards = el("div", { class: "hint" });
  const legend = el("div", { class: "hint" });
  const waiting = el("div", { class: "hint" }, "Asking the server for the report.");

  const stands = createSheet("stands", STAND_COLUMNS, "You hold no force.", (key) => {
    const link = el("a", { href: "#", class: "node-link" }, key);
    link.addEventListener("click", (event) => {
      event.preventDefault();
      root.close();
      actions.select(Number(key));
    });
    const cells = STAND_COLUMNS.slice(1).map(() => el("td"));
    return { row: el("tr", {}, el("td", {}, link), ...cells), cells };
  });

  const battles = createSheet(
    "battles",
    BATTLE_COLUMNS,
    "No battles: no pressure is ordered by you or against you.",
    (key) => {
      if (key.includes("#")) {
        const cells = BATTLE_COLUMNS.map(() => el("td"));
        return { row: el("tr", {}, ...cells), cells };
      }
      const title = el("td", { colspan: String(BATTLE_COLUMNS.length) });
      return { row: el("tr", { class: "front" }, title), cells: [title] };
    },
  );

  const scroll = el(
    "div",
    { class: "scroll", tabindex: "-1", autofocus: "" },
    el("h3", {}, "Where your force stands"),
    stands.block,
    el("div", { class: "hint" }, STAND_LEGEND),
    el("h3", {}, "Battles"),
    battles.block,
    legend,
  );
  root.replaceChildren(
    el(
      "div",
      { class: "report" },
      el(
        "div",
        { class: "row" },
        el("h2", {}, "Force report"),
        button("Close", "Esc", () => root.close()),
      ),
      waiting,
      totals,
      yards,
      scroll,
    ),
  );
  root.addEventListener("click", (event) => {
    if (event.target === root) {
      root.close();
    }
  });
  root.addEventListener("close", () => actions.watch(null));

  const reveal = (ready: boolean) => {
    waiting.hidden = ready;
    for (const part of [totals, yards, scroll]) {
      part.hidden = !ready;
    }
  };

  const showStands = (game: Game, report: ForceReport) => {
    const sum = { force: 0, garrison: 0, front: 0, reserve: 0 };
    const keys: string[] = [];
    for (const region of game.view.regions) {
      const mine = region.holdings?.find((holding) => holding.owner === game.seat);
      const muster = report.musters[region.id];
      if (region.estate === null || mine === undefined || !muster) {
        continue;
      }
      const { quarters, quartersWanted, reinforcement } = region.estate;
      const unused = quarters < SHOWN && quartersWanted < SHOWN && reinforcement < SHOWN;
      sum.force += mine.force;
      sum.garrison += muster.garrison;
      sum.front += muster.front;
      sum.reserve += muster.reserve;
      if (mine.force < SHOWN && unused && muster.duties.length === 0) {
        continue;
      }
      const key = String(region.id);
      keys.push(key);
      fill(stands.line(key), [
        amount(mine.force),
        share(muster.garrison, quarters),
        share(muster.front, muster.need),
        muster.reserve < SHOWN ? "—" : amount(muster.reserve),
        reasonsOf(game, region.id, region.estate, muster).join("\n"),
      ]);
    }
    stands.arrange(keys);
    const cap = game.view.forceCap;
    write(
      totals,
      `Total ${amount(sum.force)} of ${amount(cap)} · army ordered ${amount(game.view.army)} · ` +
        `in garrisons ${amount(sum.garrison)} · ` +
        `front ${amount(sum.front)} · moving ${amount(sum.reserve)}`,
    );
    const { upkeepPerForce, restUpkeep, upkeepPerQuarter } = game.constants;
    const fielded = sum.force - sum.garrison * (1 - restUpkeep);
    const upkeep = amount(fielded * upkeepPerForce + cap * upkeepPerQuarter, 2);
    write(
      yards,
      `${
        report.arming
          ? "Shipyards are building: your force is below the room in your garrisons."
          : "Shipyards are idle: your garrisons are full."
      } Keeping this force and its garrisons takes ${upkeep} energy a tick.`,
    );
  };

  const showBattles = (game: Game, report: ForceReport) => {
    const keys: string[] = [];
    const ordered = report.battles.toSorted(
      (left, right) =>
        Number(left.power !== game.seat) - Number(right.power !== game.seat) ||
        left.region - right.region ||
        left.power - right.power,
    );
    for (const battle of ordered) {
      const front = `${battle.power}>${battle.region}:${battle.target ?? "neutral"}`;
      const waiting = waitOf(game, battle.power, battle.region, battle.target) > 0;
      keys.push(front);
      fill(battles.line(front), [titleOf(game, battle)]);
      for (const siege of battle.sieges.toSorted((left, right) => left.cell - right.cell)) {
        const key = `${front}#${siege.cell}`;
        keys.push(key);
        fill(battles.line(key), [
          `#${siege.cell}`,
          String(siege.level),
          siege.force < SHOWN ? "—" : amount(siege.force),
          amount(siege.defense),
          siege.facing < SHOWN ? "—" : amount(siege.facing),
          `${amount(siege.pressure)} / ${amount(siege.limit)}`,
          percent(siege.progress),
          outlookOf(siege, waiting),
        ]);
      }
    }
    battles.arrange(keys);
    write(legend, battleLegend(game));
  };

  return {
    open() {
      if (root.open) {
        return;
      }
      reveal(false);
      root.showModal();
      actions.watch({ subject: "force" });
    },
    watch() {
      return root.open ? { subject: "force" } : null;
    },
    show(game) {
      if (!root.open || game.force === null) {
        return;
      }
      showStands(game, game.force);
      showBattles(game, game.force);
      reveal(true);
    },
  };
}
