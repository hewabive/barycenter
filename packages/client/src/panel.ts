import type { Order } from "@barycenter/protocol";
import { BRANCHES, type Branch, type HoldingView } from "@barycenter/sim";
import { amount, button, el, percent } from "./dom.ts";
import { type Aiming, type Game, nameOf, pressureOn, summarize } from "./model.ts";
import { css, powerColor } from "./palette.ts";

export interface PanelActions {
  order(order: Order): void;
  select(region: number): void;
  aim(request: Aiming | null): void;
}

export interface Panel {
  show(game: Game, selected: number | null, aiming: Aiming | null): void;
}

type Refresh = (game: Game) => void;

const BRANCH_LABELS: Record<Branch, string> = {
  extraction: "Extraction",
  power: "Power",
  shipyard: "Shipyards",
};

const LEANING_HINT = "50% builds a branch as the need appears, more builds it ahead of need";
const GARRISON_HINT =
  "Room for force to build in this region. Force rests in its garrisons, and their sum caps your force";
const AIM_HINT =
  "Pick one of its cells on the globe. The attack then presses only where it is nearest to that cell";
const ROAD_HINT =
  "Build a trunk road between your land on the two sides. A road loses less on the way and carries more";

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

function signatureOf(game: Game, selected: number | null, aiming: Aiming | null): string {
  const { view, outline } = game;
  const facts: unknown[] = [
    selected,
    aiming,
    view.pressures.map((p) => [p.power, p.region, p.target, p.aim !== null]),
  ];
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
        edge.road,
      );
    }
  }
  return JSON.stringify(facts);
}

export function createPanel(root: HTMLElement, actions: PanelActions): Panel {
  let signature = "";
  let shown: number | null | undefined;
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
        { class: "control", title: LEANING_HINT },
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
    el("div", { class: "hint touch" }, LEANING_HINT),
    el(
      "div",
      { class: "hint" },
      "What is built follows the land, what is short nearby and this leaning. Built levels change slowly.",
    ),
  );
  leaning.classList.add("leaning");
  const details = el("div", { class: "details" });
  const body = el("div", { class: "body" }, leaning, details);
  const heading = el("span", {});
  const handle = el("button", { type: "button", class: "handle" }, heading);
  handle.addEventListener("click", () => root.classList.toggle("folded"));
  root.replaceChildren(handle, body);

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

    const garrison = el("input", {
      type: "number",
      min: "0",
      step: "0.5",
      inputmode: "decimal",
    });
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
        { class: "control", title: GARRISON_HINT },
        el("span", { class: "name" }, "Garrison"),
        garrison,
      ),
      el("div", { class: "hint touch" }, GARRISON_HINT),
      row(
        "Room built",
        live((current) => {
          const estate = current.view.regions[id].estate;
          if (estate === null) {
            return "";
          }
          const ordered = Math.min(estate.garrison, estate.quartersLimit);
          return `${amount(estate.quarters)} of ${amount(ordered)}`;
        }),
      ),
      el(
        "div",
        { class: "hint" },
        live((current) => {
          const limit = current.view.regions[id].estate?.quartersLimit ?? 0;
          return `The hub of your land here can house ${amount(limit)}, more as its level grows`;
        }),
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

  const buildHolder = (
    game: Game,
    id: number,
    holding: HoldingView,
    aiming: Aiming | null,
  ): HTMLElement => {
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

    const mine = pressureOn(game, me, id, owner);
    if (mine !== undefined) {
      const picking = aiming !== null && aiming.region === id && aiming.target === owner;
      const aim = el("div", { class: "row" });
      if (picking) {
        aim.append(
          el("span", { class: "name" }, "Click one of its cells on the globe"),
          button("Cancel", "Keep the attack as it is", () => actions.aim(null)),
        );
      } else {
        aim.append(
          el(
            "span",
            { class: "name" },
            mine.aim === null ? "Presses along the whole line" : "Aimed at ✛",
          ),
          button(mine.aim === null ? "Aim" : "Aim again", AIM_HINT, () => {
            actions.aim({ region: id, target: owner });
          }),
        );
        if (mine.aim !== null) {
          aim.append(
            button("Clear aim", "Press along the whole line again", () => {
              actions.order({ kind: "aim", region: id, target: owner, cell: null });
            }),
          );
        }
      }
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
        aim,
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
    if (!edge.open) {
      return entry;
    }
    if (edge.road) {
      entry.append(
        button("Stop the road", "Stop building and keeping the road across this border", () => {
          actions.order({ kind: "road", edge: edgeId, active: false });
        }),
      );
    } else {
      entry.append(
        button("Lay a road", ROAD_HINT, () => {
          actions.order({ kind: "road", edge: edgeId, active: true });
        }),
      );
    }
    return entry;
  };

  const buildRegion = (game: Game, id: number, aiming: Aiming | null): HTMLElement[] => {
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
        holders.append(buildHolder(game, id, holding, aiming));
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

  const rebuild = (game: Game, selected: number | null, aiming: Aiming | null) => {
    refreshers = [];
    const parts: (HTMLElement | null)[] = [];
    if (selected === null) {
      parts.push(el("p", { class: "hint" }, "Select a region on the globe."));
    } else {
      parts.push(...buildRegion(game, selected, aiming));
    }
    parts.push(buildCampaigns(game));
    details.replaceChildren(...parts.filter((part): part is HTMLElement => part !== null));
  };

  return {
    show(game, selected, aiming) {
      if (selected !== shown) {
        shown = selected;
        heading.textContent = selected === null ? "Your power" : `Region ${selected}`;
        root.classList.toggle("folded", selected === null);
        body.scrollTop = 0;
      }
      const next = signatureOf(game, selected, aiming);
      if (next !== signature) {
        signature = next;
        rebuild(game, selected, aiming);
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
