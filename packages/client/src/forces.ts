import type { Estate } from "@barycenter/sim";
import { amount, button, el, write } from "./dom.ts";
import { type Game, nameOf, pressureOn } from "./model.ts";

export interface Forces {
  open(): void;
  show(game: Game): void;
}

interface Line {
  row: HTMLElement;
  cells: HTMLElement[];
}

const SHOWN = 0.05;
const COLUMNS = ["Region", "Force", "Garrison", "Front", "Reserve", "Why it is there"];
const LEGEND =
  "Garrison and Front show the force standing there and the force wanted. " +
  "A reserve is force that no garrison and no front asks for: " +
  "it moves toward any cell that is short and stands still when none is.";

function share(standing: number, wanted: number): string {
  return wanted < SHOWN ? "—" : `${amount(standing)} / ${amount(wanted)}`;
}

function reasonsOf(game: Game, region: number, estate: Estate): string[] {
  const { muster } = estate;
  const reasons: string[] = [];
  for (const duty of muster.duties) {
    const pressure = pressureOn(game, duty.power, duty.region, duty.target);
    const wait = pressure === undefined ? 0 : pressure.activeAt - game.view.tick;
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

export function createForces(root: HTMLDialogElement, select: (region: number) => void): Forces {
  let latest: Game | null = null;
  let shownRegions = "";
  const lines = new Map<number, Line>();
  const totals = el("div", { class: "totals" });
  const yards = el("div", { class: "hint" });
  const body = el("tbody");
  const table = el(
    "table",
    {},
    el("thead", {}, el("tr", {}, ...COLUMNS.map((column) => el("th", {}, column)))),
    body,
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
      totals,
      yards,
      el("div", { class: "scroll", tabindex: "-1", autofocus: "" }, table),
      el("div", { class: "hint" }, LEGEND),
    ),
  );
  root.addEventListener("click", (event) => {
    if (event.target === root) {
      root.close();
    }
  });

  const lineOf = (region: number): Line => {
    const known = lines.get(region);
    if (known !== undefined) {
      return known;
    }
    const link = el("a", { href: "#", class: "node-link" }, String(region));
    link.addEventListener("click", (event) => {
      event.preventDefault();
      root.close();
      select(region);
    });
    const cells = COLUMNS.slice(1).map(() => el("td"));
    const line = { row: el("tr", {}, el("td", {}, link), ...cells), cells };
    lines.set(region, line);
    return line;
  };

  const render = (game: Game) => {
    const sum = { force: 0, garrison: 0, front: 0, reserve: 0 };
    const regions: number[] = [];
    for (const region of game.view.regions) {
      const mine = region.holdings?.find((holding) => holding.owner === game.seat);
      if (region.estate === null || mine === undefined) {
        continue;
      }
      const { muster, garrison } = region.estate;
      sum.force += mine.force;
      sum.garrison += muster.garrison;
      sum.front += muster.front;
      sum.reserve += muster.reserve;
      if (mine.force < SHOWN && garrison <= 0 && muster.duties.length === 0) {
        continue;
      }
      regions.push(region.id);
      const texts = [
        amount(mine.force),
        share(muster.garrison, garrison),
        share(muster.front, muster.need),
        muster.reserve < SHOWN ? "—" : amount(muster.reserve),
        reasonsOf(game, region.id, region.estate).join("\n"),
      ];
      const { cells } = lineOf(region.id);
      texts.forEach((text, index) => {
        write(cells[index], text);
      });
    }
    if (regions.join(",") !== shownRegions) {
      shownRegions = regions.join(",");
      body.replaceChildren(...regions.map((region) => lineOf(region).row));
    }
    write(
      totals,
      `Total ${amount(sum.force)} · garrison ${amount(sum.garrison)} · ` +
        `front ${amount(sum.front)} · reserve ${amount(sum.reserve)}`,
    );
    const upkeep = amount(sum.force * game.constants.upkeepPerForce, 2);
    write(
      yards,
      `${
        game.view.arming
          ? "Shipyards are building: a pressure order stands or a cell is short of force."
          : "Shipyards are idle: no pressure is ordered and no cell is short of force."
      } Keeping this force takes ${upkeep} energy a tick.`,
    );
  };

  return {
    open() {
      if (!root.open) {
        root.showModal();
      }
      if (latest !== null) {
        render(latest);
      }
    },
    show(game) {
      latest = game;
      if (root.open) {
        render(game);
      }
    },
  };
}
