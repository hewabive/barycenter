import type { Order } from "@barycenter/protocol";
import { BRANCHES, type Branch, type HoldingView } from "@barycenter/sim";
import { amount, button, el, percent } from "./dom.ts";
import { expansionCostOf, type Game, nameOf, pressureOn, summarize } from "./model.ts";
import { css, powerColor } from "./palette.ts";

export interface PanelActions {
  order(order: Order): void;
  select(region: number): void;
}

export interface Panel {
  show(game: Game, selected: number | null): void;
}

type Refresh = (game: Game) => void;

const BRANCH_LABELS: Record<Branch, string> = {
  extraction: "Extraction",
  power: "Power",
  shipyard: "Shipyards",
};

function ownerChip(game: Game, owner: number | null): HTMLElement {
  if (owner === null) {
    return el("span", { class: "chip neutral" }, "neutral");
  }
  const chip = el("span", { class: "chip" }, nameOf(game, owner));
  chip.style.background = css(powerColor(owner));
  return chip;
}

function row(label: string, value: Node | string): HTMLElement {
  return el("div", { class: "row" }, el("span", { class: "name" }, label), value);
}

function profileText(profile: number[]): string {
  const built = profile.reduce((sum, value) => sum + value, 0);
  if (built <= 0) {
    return "nothing built";
  }
  return BRANCHES.map(
    (branch, index) => `${BRANCH_LABELS[branch].toLowerCase()} ${percent(profile[index] / built)}`,
  ).join(" · ");
}

function holdingIn(game: Game, region: number, owner: number | null): HoldingView | undefined {
  return game.view.regions[region].holdings?.find((holding) => holding.owner === owner);
}

function signatureOf(game: Game, selected: number | null): string {
  const { view, outline } = game;
  const facts: unknown[] = [selected, view.pressures.map((p) => [p.power, p.region, p.target])];
  if (selected !== null) {
    const region = view.regions[selected];
    facts.push(
      region.nature !== null,
      region.estate !== null,
      region.holdings?.map((holding) => [holding.owner, holding.contact > 0]),
    );
    for (const neighbor of outline.neighbors[selected]) {
      const edge = view.edges[neighbor.edge];
      facts.push(
        view.regions[neighbor.region].holdings?.map((holding) => holding.owner),
        view.regions[neighbor.region].estate !== null,
        edge.kind,
        edge.open,
        edge.expanding,
        edge.expansions,
      );
    }
  }
  return JSON.stringify(facts);
}

export function createPanel(root: HTMLElement, actions: PanelActions): Panel {
  let signature = "";
  let refreshers: Refresh[] = [];
  const steady: Refresh[] = [];

  const live = (read: (game: Game) => string, into: Refresh[] = refreshers): HTMLElement => {
    const span = el("span", { class: "value" });
    into.push((game) => {
      const text = read(game);
      if (span.textContent !== text) {
        span.textContent = text;
      }
    });
    return span;
  };

  const regionLink = (region: number): HTMLElement => {
    const link = el("a", { href: "#", class: "node-link" }, `Region ${region}`);
    link.addEventListener("click", (event) => {
      event.preventDefault();
      actions.select(region);
    });
    return link;
  };

  const leaning = el("section", {}, el("h3", {}, "Leaning of your power"));
  BRANCHES.forEach((branch, index) => {
    const dial = el("input", { type: "range", min: "0", max: "1", step: "0.05" });
    const value = el("span", { class: "value" });
    dial.addEventListener("input", () => {
      value.textContent = percent(Number(dial.value));
    });
    dial.addEventListener("change", () => {
      actions.order({ kind: "lean", branch, value: Number(dial.value) });
    });
    steady.push((game) => {
      if (document.activeElement !== dial) {
        dial.value = String(game.view.lean[index]);
        value.textContent = percent(game.view.lean[index]);
      }
    });
    leaning.append(
      el(
        "label",
        {
          class: "control",
          title: "50% builds this branch as the need appears, more builds it ahead of need",
        },
        el("span", { class: "name" }, BRANCH_LABELS[branch]),
        dial,
        value,
      ),
    );
  });
  leaning.append(
    row(
      "Built so far",
      live((game) => profileText(summarize(game.view).profile), steady),
    ),
    el(
      "div",
      { class: "hint" },
      "What is built follows the land, what is short nearby and this leaning. Built levels change slowly.",
    ),
  );
  const details = el("div", {});
  root.replaceChildren(leaning, details);

  const buildOrders = (id: number): HTMLElement => {
    const section = el("section", {}, el("h3", {}, "Orders"));

    const dial = el("input", { type: "range", min: "0", max: "1", step: "0.05" });
    const dialValue = el("span", { class: "value" });
    dial.addEventListener("input", () => {
      dialValue.textContent = percent(Number(dial.value));
    });
    dial.addEventListener("change", () => {
      actions.order({ kind: "dial", region: id, value: Number(dial.value) });
    });
    refreshers.push((current) => {
      const value = current.view.regions[id].estate?.dial ?? 0;
      if (document.activeElement !== dial) {
        dial.value = String(value);
        dialValue.textContent = percent(value);
      }
    });
    section.append(
      el(
        "label",
        {
          class: "control",
          title:
            "How much of its building capacity your part of the region uses and how strongly it attracts matter",
        },
        el("span", { class: "name" }, "Development priority"),
        dial,
        dialValue,
      ),
      el("div", { class: "hint" }, "0% gives everything to the network, 100% pulls toward itself"),
    );

    const garrison = el("input", { type: "number", min: "0", step: "0.5" });
    garrison.addEventListener("change", () => {
      actions.order({ kind: "garrison", region: id, value: Math.max(0, Number(garrison.value)) });
    });
    refreshers.push((current) => {
      if (document.activeElement !== garrison) {
        garrison.value = String(current.view.regions[id].estate?.garrison ?? 0);
      }
    });
    section.append(
      el(
        "label",
        { class: "control", title: "How much force stays on the border cells of your part" },
        el("span", { class: "name" }, "Garrison"),
        garrison,
      ),
      row(
        "Matter held",
        live((current) => amount(current.view.regions[id].estate?.matter ?? 0)),
      ),
      row(
        "Energy supply",
        live((current) => percent(current.view.regions[id].estate?.supply ?? 1)),
      ),
      row(
        "Rival force at the border",
        live((current) => amount(current.view.regions[id].estate?.hostile ?? 0)),
      ),
    );
    return section;
  };

  const buildHolder = (game: Game, id: number, holding: HoldingView): HTMLElement => {
    const me = game.seat;
    const owner = holding.owner;
    const entry = el("div", { class: "neighbor" });
    entry.append(
      el(
        "div",
        { class: "row" },
        ownerChip(game, owner),
        live((current) => {
          const now = holdingIn(current, id, owner);
          if (now === undefined) {
            return "";
          }
          const cells = `${now.cells} ${now.cells === 1 ? "cell" : "cells"}`;
          return owner === null
            ? cells
            : `${cells} · level ${now.level} · force ${amount(now.force)}`;
        }),
      ),
    );
    if (owner !== null) {
      entry.append(
        el(
          "div",
          { class: "hint" },
          live((current) => profileText(holdingIn(current, id, owner)?.profile ?? [])),
        ),
      );
    }
    if (owner === me) {
      return entry;
    }

    const incoming = owner === null ? undefined : pressureOn(game, owner, id, me);
    if (incoming !== undefined && owner !== null) {
      entry.append(
        el(
          "div",
          { class: "row threat" },
          live((current) => {
            const now = pressureOn(current, owner, id, me);
            if (now === undefined) {
              return "";
            }
            const wait = now.activeAt - current.view.tick;
            return wait > 0
              ? `Attacks you here in ${wait} ticks`
              : `Presses you here with ${amount(now.commit)}`;
          }),
        ),
      );
    }

    if (pressureOn(game, me, id, owner) !== undefined) {
      entry.append(
        el(
          "div",
          { class: "row" },
          live((current) => {
            const now = pressureOn(current, me, id, owner);
            if (now === undefined) {
              return "";
            }
            const wait = now.activeAt - current.view.tick;
            return wait > 0
              ? `Attack starts in ${wait} ticks`
              : `Pressing with ${amount(now.commit)}`;
          }),
          button("Withdraw", "Stop pressing here", () => {
            actions.order({ kind: "pressure", region: id, target: owner, active: false });
          }),
        ),
      );
    } else if (holding.contact > 0) {
      const label = owner === null ? "Settle" : "Press";
      const hint =
        owner === null
          ? "Direct force at the neutral cells of this region"
          : "Direct force at this power's cells in the region";
      entry.append(
        el(
          "div",
          { class: "row" },
          live((current) => {
            const now = holdingIn(current, id, owner);
            return now === undefined
              ? ""
              : `defense ${amount(now.defense)} per cell, your reach ${amount(now.reach, 0)}`;
          }),
          button(label, hint, () => {
            actions.order({ kind: "pressure", region: id, target: owner, active: true });
          }),
        ),
      );
    } else {
      entry.append(el("div", { class: "hint" }, "Out of reach: none of your cells touch it"));
    }
    return entry;
  };

  const buildNeighbor = (game: Game, neighbor: number, edgeId: number) => {
    const me = game.seat;
    const edge = game.view.edges[edgeId];
    const other = game.view.regions[neighbor];
    const entry = el("div", { class: "neighbor" });
    const holders = el("span", { class: "choices" });
    for (const holding of other.holdings ?? []) {
      holders.append(ownerChip(game, holding.owner));
    }
    if (other.holdings === null) {
      holders.append(el("span", { class: "chip unknown" }, "out of sight"));
    }
    entry.append(el("div", { class: "row" }, regionLink(neighbor), holders));
    if (edge.kind === null) {
      return entry;
    }
    const crossings = game.outline.edges[edgeId].joints.length;
    entry.append(
      el(
        "div",
        { class: "row" },
        el("span", { class: "name" }, edge.kind),
        live((current) => {
          const now = current.view.edges[edgeId];
          const way = `${crossings} ${crossings === 1 ? "crossing" : "crossings"}`;
          const load = now.load > 0.01 ? `, ${percent(now.load)} busy` : "";
          return `${way}, capacity ${amount(now.capacity ?? 0)}${load}`;
        }),
      ),
    );
    const expandable = (edge.expansions ?? 0) < game.constants.maxExpansions;
    if (!edge.open || !expandable) {
      return entry;
    }
    if (edge.expanding === me) {
      entry.append(
        button("Stop widening", "Cancel the expansion of this edge", () => {
          actions.order({ kind: "expand", edge: edgeId, active: false });
        }),
      );
    } else if (edge.expanding === null) {
      const cost = amount(expansionCostOf(game, edge.expansions ?? 0), 0);
      entry.append(
        button(`Widen (${cost} matter)`, "Add one step of capacity to this edge", () => {
          actions.order({ kind: "expand", edge: edgeId, active: true });
        }),
      );
    } else {
      entry.append(el("div", { class: "hint" }, "Being widened by another power"));
    }
    return entry;
  };

  const buildRegion = (game: Game, id: number): HTMLElement[] => {
    const region = game.view.regions[id];
    const header = el("h2", {}, `Region ${id}`);
    if (region.nature === null) {
      return [
        header,
        el("p", { class: "hint" }, "Unexplored. Take land in a neighboring region to see it."),
      ];
    }
    const nature = region.nature;
    const mountains = nature.mountains > 0 ? `, ${nature.mountains} of them mountain` : "";
    const parts: HTMLElement[] = [
      header,
      el(
        "section",
        {},
        row("Land", `${nature.cells} ${nature.cells === 1 ? "cell" : "cells"}${mountains}`),
        row(
          "Matter richness",
          amount(
            nature.deposits.reduce((sum, value) => sum + value, 0),
            2,
          ),
        ),
        row("Energy richness", amount(nature.energyRichness, 2)),
        row(
          "Level",
          live((current) => {
            const now = current.view.regions[id];
            const built = now.holdings?.reduce((sum, holding) => sum + holding.level, 0);
            return built === undefined
              ? `cap ${nature.levelCap}`
              : `${built} of ${nature.levelCap}`;
          }),
        ),
      ),
    ];
    if (region.holdings !== null) {
      const holders = el("section", {}, el("h3", {}, "Holders"));
      const order = (holding: HoldingView) =>
        holding.owner === game.seat
          ? -1
          : holding.owner === null
            ? game.seats.length
            : holding.owner;
      for (const holding of region.holdings.slice().sort((a, b) => order(a) - order(b))) {
        holders.append(buildHolder(game, id, holding));
      }
      parts.push(holders);
    }
    if (region.estate !== null) {
      parts.push(buildOrders(id));
    }
    const neighbors = el("section", {}, el("h3", {}, "Neighbors"));
    for (const neighbor of game.outline.neighbors[id]) {
      neighbors.append(buildNeighbor(game, neighbor.region, neighbor.edge));
    }
    parts.push(neighbors);
    return parts;
  };

  const buildCampaigns = (game: Game): HTMLElement | null => {
    const me = game.seat;
    const relevant = game.view.pressures.filter(
      (pressure) => pressure.power === me || pressure.target === me,
    );
    if (relevant.length === 0) {
      return null;
    }
    const section = el("section", {}, el("h3", {}, "Attacks"));
    for (const pressure of relevant) {
      const mine = pressure.power === me;
      const line = el("div", { class: mine ? "row" : "row threat" });
      const subject = mine ? "You press" : `${nameOf(game, pressure.power)} presses`;
      line.append(
        el("span", {}, `${subject} ${nameOf(game, pressure.target)} in `),
        regionLink(pressure.region),
        live((current) => {
          const now = pressureOn(current, pressure.power, pressure.region, pressure.target);
          if (now === undefined) {
            return "";
          }
          const wait = now.activeAt - current.view.tick;
          return wait > 0 ? ` in ${wait} ticks` : ` with ${amount(now.commit)}`;
        }),
      );
      section.append(line);
    }
    return section;
  };

  const rebuild = (game: Game, selected: number | null) => {
    refreshers = [];
    const parts: (HTMLElement | null)[] = [];
    if (selected === null) {
      parts.push(el("p", { class: "hint" }, "Select a region on the globe."));
    } else {
      parts.push(...buildRegion(game, selected));
    }
    parts.push(buildCampaigns(game));
    details.replaceChildren(...parts.filter((part): part is HTMLElement => part !== null));
  };

  return {
    show(game, selected) {
      const next = signatureOf(game, selected);
      if (next !== signature) {
        signature = next;
        rebuild(game, selected);
      }
      for (const refresh of steady) {
        refresh(game);
      }
      for (const refresh of refreshers) {
        refresh(game);
      }
    },
  };
}
