import type { Order } from "@barycenter/protocol";
import { ROLES, type Role } from "@barycenter/sim";
import { amount, button, el, percent } from "./dom.ts";
import { expansionCostOf, type Game, levelCostOf, nameOf, reachOf } from "./model.ts";
import { css, powerColor } from "./palette.ts";

export interface PanelActions {
  order(order: Order): void;
  select(node: number): void;
}

export interface Panel {
  show(game: Game, selected: number | null): void;
}

type Refresh = (game: Game) => void;

const ROLE_HINTS: Record<Role, string> = {
  extraction: "Extraction: produces matter",
  power: "Power: produces energy",
  shipyard: "Shipyard: turns matter into force",
};

function ownerChip(game: Game, owner: number | null | undefined): HTMLElement {
  if (owner === undefined) {
    return el("span", { class: "chip unknown" }, "out of sight");
  }
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

function pressureBetween(game: Game, from: number, to: number) {
  return game.view.pressures.find((pressure) => pressure.from === from && pressure.to === to);
}

function signatureOf(game: Game, selected: number | null): string {
  const { view, outline } = game;
  const facts: unknown[] = [selected, view.pressures.map((p) => [p.from, p.to, p.power])];
  if (selected !== null) {
    const node = view.nodes[selected];
    facts.push(node.nature !== null, node.status?.owner, node.status?.role, node.holding !== null);
    for (const link of outline.links[selected]) {
      const edge = view.edges[link.edge];
      facts.push(view.nodes[link.node].status?.owner, edge.kind, edge.expanding, edge.expansions);
    }
  }
  return JSON.stringify(facts);
}

export function createPanel(root: HTMLElement, actions: PanelActions): Panel {
  let signature = "";
  let refreshers: Refresh[] = [];

  const live = (read: (game: Game) => string): HTMLElement => {
    const span = el("span", { class: "value" });
    refreshers.push((game) => {
      const text = read(game);
      if (span.textContent !== text) {
        span.textContent = text;
      }
    });
    return span;
  };

  const nodeLink = (node: number): HTMLElement => {
    const link = el("a", { href: "#", class: "node-link" }, `Region ${node}`);
    link.addEventListener("click", (event) => {
      event.preventDefault();
      actions.select(node);
    });
    return link;
  };

  const buildHoldings = (game: Game, id: number): HTMLElement => {
    const section = el("section", {}, el("h3", {}, "Orders"));
    const node = () => game.view.nodes[id];

    const dial = el("input", { type: "range", min: "0", max: "1", step: "0.05" });
    const dialValue = el("span", { class: "value" });
    dial.addEventListener("input", () => {
      dialValue.textContent = percent(Number(dial.value));
    });
    dial.addEventListener("change", () => {
      actions.order({ kind: "dial", node: id, value: Number(dial.value) });
    });
    refreshers.push((current) => {
      const value = current.view.nodes[id].holding?.dial ?? 0;
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
            "How much of its building capacity the region uses and how strongly it attracts matter",
        },
        el("span", { class: "name" }, "Development priority"),
        dial,
        dialValue,
      ),
      el("div", { class: "hint" }, "0% gives everything to the network, 100% pulls toward itself"),
    );

    const roles = el("div", { class: "choices" });
    for (const role of ROLES) {
      const choice = button(role, ROLE_HINTS[role], () => {
        actions.order({ kind: "role", node: id, role });
      });
      if (node().status?.role === role) {
        choice.classList.add("active");
      }
      roles.append(choice);
    }
    section.append(row("Role", roles));
    if (node().status?.role !== null) {
      const loss = percent(game.constants.roleChangeLevelLoss);
      section.append(
        el("div", { class: "hint" }, `Changing an established role costs ${loss} of the levels`),
      );
    }

    const garrison = el("input", { type: "number", min: "0", step: "0.5" });
    garrison.addEventListener("change", () => {
      actions.order({ kind: "garrison", node: id, value: Math.max(0, Number(garrison.value)) });
    });
    refreshers.push((current) => {
      if (document.activeElement !== garrison) {
        garrison.value = String(current.view.nodes[id].holding?.garrison ?? 0);
      }
    });
    section.append(
      el(
        "label",
        { class: "control", title: "How much force stays in this region" },
        el("span", { class: "name" }, "Garrison"),
        garrison,
      ),
    );

    section.append(
      row(
        "Matter held",
        live((current) => amount(current.view.nodes[id].holding?.matter ?? 0)),
      ),
      row(
        "Next level",
        live((current) => {
          const now = current.view.nodes[id];
          if (now.status === null || now.nature === null || now.holding === null) {
            return "";
          }
          if (now.status.level >= now.nature.levelCap) {
            return "at the cap";
          }
          const cost = levelCostOf(current, now.status.level);
          return `${amount(now.holding.progress)} of ${amount(cost, 0)} matter`;
        }),
      ),
    );
    return section;
  };

  const buildNeighbor = (game: Game, selected: number, neighbor: number, edgeId: number) => {
    const me = game.seat;
    const edge = game.view.edges[edgeId];
    const other = game.view.nodes[neighbor];
    const mineHere = game.view.nodes[selected].status?.owner === me;
    const mineThere = other.status?.owner === me;

    const entry = el("div", { class: "neighbor" });
    const head = el(
      "div",
      { class: "row" },
      nodeLink(neighbor),
      ownerChip(game, other.status?.owner),
    );
    entry.append(head);

    if (edge.kind !== null) {
      const route = el(
        "div",
        { class: "row" },
        el("span", { class: "name" }, edge.kind),
        live((current) => {
          const now = current.view.edges[edgeId];
          const flows = [
            Math.abs(now.matterFlow) > 0.005 ? `matter ${amount(Math.abs(now.matterFlow), 2)}` : "",
            Math.abs(now.forceFlow) > 0.005 ? `force ${amount(Math.abs(now.forceFlow), 2)}` : "",
          ].filter((text) => text !== "");
          const load = flows.length > 0 ? `, carrying ${flows.join(" and ")}` : "";
          return `capacity ${amount(now.capacity ?? 0)}${load}`;
        }),
      );
      entry.append(route);

      const expandable = (edge.expansions ?? 0) < game.constants.maxExpansions;
      if ((mineHere || mineThere) && expandable) {
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
      }
    }

    const offer = (from: number, to: number) => {
      const existing = pressureBetween(game, from, to);
      if (existing !== undefined) {
        entry.append(
          el(
            "div",
            { class: "row" },
            live((current) => {
              const now = pressureBetween(current, from, to);
              if (now === undefined) {
                return "";
              }
              const wait = now.activeAt - current.view.tick;
              return wait > 0
                ? `Attack starts in ${wait} ticks`
                : `Pressing with ${amount(now.commit)}`;
            }),
            button("Withdraw", "Stop pressing this region", () => {
              actions.order({ kind: "pressure", from, to, active: false });
            }),
          ),
        );
        return;
      }
      const label = from === selected ? "Press this neighbor" : `Press from region ${from}`;
      entry.append(
        el(
          "div",
          { class: "row" },
          live((current) => {
            const defense = current.view.nodes[to].status?.defense ?? 0;
            return `reach ${amount(reachOf(current, edgeId), 0)} against defense ${amount(defense)}`;
          }),
          button(label, "Direct force at this region", () => {
            actions.order({ kind: "pressure", from, to, active: true });
          }),
        ),
      );
    };
    if (mineHere && other.status !== null && !mineThere) {
      offer(selected, neighbor);
    }
    if (mineThere && !mineHere && game.view.nodes[selected].status !== null) {
      offer(neighbor, selected);
    }

    const incoming = game.view.pressures.find(
      (pressure) => pressure.from === neighbor && pressure.to === selected && pressure.power !== me,
    );
    if (incoming !== undefined) {
      entry.append(
        el(
          "div",
          { class: "row threat" },
          live((current) => {
            const now = pressureBetween(current, neighbor, selected);
            if (now === undefined) {
              return "";
            }
            const wait = now.activeAt - current.view.tick;
            return wait > 0
              ? `Attacks from here in ${wait} ticks`
              : `Pressing with ${amount(now.commit)}`;
          }),
        ),
      );
    }
    return entry;
  };

  const buildNode = (game: Game, id: number): HTMLElement[] => {
    const node = game.view.nodes[id];
    const header = el("h2", {}, `Region ${id}`);
    if (node.nature === null) {
      return [
        header,
        el("p", { class: "hint" }, "Unexplored. Take a neighboring region to see it."),
      ];
    }
    const parts: HTMLElement[] = [header];
    parts.push(
      el(
        "section",
        {},
        row("Owner", ownerChip(game, node.status?.owner)),
        row("Terrain", node.nature.terrain),
        row("Matter richness", amount(node.nature.matterRichness, 2)),
        row("Energy richness", amount(node.nature.energyRichness, 2)),
        row("Level cap", String(node.nature.levelCap)),
      ),
    );
    if (node.status !== null) {
      parts.push(
        el(
          "section",
          {},
          row(
            "Level",
            live((current) => String(current.view.nodes[id].status?.level ?? "")),
          ),
          row(
            "Force",
            live((current) => amount(current.view.nodes[id].status?.force ?? 0)),
          ),
          row(
            "Defense",
            live((current) => amount(current.view.nodes[id].status?.defense ?? 0)),
          ),
          row(
            "Energy supply",
            live((current) => percent(current.view.nodes[id].status?.supply ?? 1)),
          ),
        ),
      );
    }
    if (node.holding !== null) {
      parts.push(buildHoldings(game, id));
    }
    const neighbors = el("section", {}, el("h3", {}, "Neighbors"));
    for (const link of game.outline.links[id]) {
      neighbors.append(buildNeighbor(game, id, link.node, link.edge));
    }
    parts.push(neighbors);
    return parts;
  };

  const buildCampaigns = (game: Game): HTMLElement | null => {
    const me = game.seat;
    const relevant = game.view.pressures.filter(
      (pressure) => pressure.power === me || game.view.nodes[pressure.to].status?.owner === me,
    );
    if (relevant.length === 0) {
      return null;
    }
    const section = el("section", {}, el("h3", {}, "Attacks"));
    for (const pressure of relevant) {
      const mine = pressure.power === me;
      const line = el("div", { class: mine ? "row" : "row threat" });
      line.append(
        el("span", {}, mine ? "You press " : `${nameOf(game, pressure.power)} presses `),
        nodeLink(pressure.to),
        live((current) => {
          const now = pressureBetween(current, pressure.from, pressure.to);
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
      parts.push(...buildNode(game, selected));
    }
    parts.push(buildCampaigns(game));
    root.replaceChildren(...parts.filter((part): part is HTMLElement => part !== null));
  };

  return {
    show(game, selected) {
      const next = signatureOf(game, selected);
      if (next !== signature) {
        signature = next;
        rebuild(game, selected);
      }
      for (const refresh of refreshers) {
        refresh(game);
      }
    },
  };
}
