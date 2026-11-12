import type { Battle, Estate, ForceReport, Muster, Siege } from "@barycenter/sim";
import { amount, button, el, percent, write } from "./dom.ts";
import { capitalized, type Game, nameOf, pressureOn } from "./model.ts";

export interface Forces {
  open(): void;
  watching(): boolean;
  show(game: Game): void;
}

export interface ForcesActions {
  select(region: number): void;
  watch(active: boolean): void;
}

interface Line {
  row: HTMLElement;
  cells: HTMLElement[];
}

interface Sheet {
  block: HTMLElement;
  line(key: string): Line;
  arrange(keys: string[]): void;
}

const SHOWN = 0.05;
const STAND_COLUMNS = ["Region", "Force", "Garrison", "Front", "Reserve", "Why it is there"];
const BATTLE_COLUMNS = ["Cell", "Level", "Force", "Defense", "Pressure", "Siege", "Outlook"];
const STAND_LEGEND =
  "Garrison and Front show the force standing there and the force wanted. " +
  "A reserve is force that no garrison and no front asks for: " +
  "it moves toward any cell that is short and stands still when none is.";

function createSheet(
  name: string,
  columns: string[],
  empty: string,
  create: (key: string) => Line,
): Sheet {
  const lines = new Map<string, Line>();
  let shown = "";
  const body = el("tbody");
  const heads = columns.map((column) => el("th", {}, column));
  const table = el("table", { class: name, hidden: "" }, el("thead", {}, el("tr", {}, ...heads)));
  table.append(body);
  const blank = el("div", { class: "hint" }, empty);

  const line = (key: string): Line => {
    const known = lines.get(key);
    if (known !== undefined) {
      return known;
    }
    const created = create(key);
    lines.set(key, created);
    return created;
  };

  return {
    block: el("div", {}, table, blank),
    line,
    arrange(keys) {
      const order = keys.join("|");
      if (order === shown) {
        return;
      }
      shown = order;
      body.replaceChildren(...keys.map((key) => line(key).row));
      for (const key of [...lines.keys()]) {
        if (!keys.includes(key)) {
          lines.delete(key);
        }
      }
      table.hidden = keys.length === 0;
      blank.hidden = keys.length > 0;
    },
  };
}

function fill(line: Line, texts: string[]): void {
  texts.forEach((text, index) => {
    write(line.cells[index], text);
  });
}

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
  const missing = estate.garrison - muster.garrison;
  if (missing >= SHOWN) {
    reasons.push(`Garrison is short by ${amount(missing)}`);
  }
  let routed = 0;
  for (const route of muster.routes) {
    routed += route.amount;
    if (route.amount >= SHOWN) {
      const goal = route.region === region ? "cells here" : `region ${route.region}`;
      reasons.push(`Reserve ${amount(route.amount)} heads to ${goal}`);
    }
  }
  const idle = muster.reserve - routed;
  if (idle >= SHOWN) {
    reasons.push(`Reserve ${amount(idle)} is idle: no cell asks for it`);
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
    "Pressure shows what is committed now and the most the touching cells can carry."
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
  root.addEventListener("close", () => actions.watch(false));

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
      const { garrison } = region.estate;
      sum.force += mine.force;
      sum.garrison += muster.garrison;
      sum.front += muster.front;
      sum.reserve += muster.reserve;
      if (mine.force < SHOWN && garrison <= 0 && muster.duties.length === 0) {
        continue;
      }
      const key = String(region.id);
      keys.push(key);
      fill(stands.line(key), [
        amount(mine.force),
        share(muster.garrison, garrison),
        share(muster.front, muster.need),
        muster.reserve < SHOWN ? "—" : amount(muster.reserve),
        reasonsOf(game, region.id, region.estate, muster).join("\n"),
      ]);
    }
    stands.arrange(keys);
    write(
      totals,
      `Total ${amount(sum.force)} · garrison ${amount(sum.garrison)} · ` +
        `front ${amount(sum.front)} · reserve ${amount(sum.reserve)}`,
    );
    const upkeep = amount(sum.force * game.constants.upkeepPerForce, 2);
    write(
      yards,
      `${
        report.arming
          ? "Shipyards are building: a pressure order stands or a cell is short of force."
          : "Shipyards are idle: no pressure is ordered and no cell is short of force."
      } Keeping this force takes ${upkeep} energy a tick.`,
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
      actions.watch(true);
    },
    watching() {
      return root.open;
    },
    show(game) {
      if (!root.open || game.report === null) {
        return;
      }
      showStands(game, game.report);
      showBattles(game, game.report);
      reveal(true);
    },
  };
}
