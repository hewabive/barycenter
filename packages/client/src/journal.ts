import { el } from "./dom.ts";
import type { Report } from "./model.ts";

export interface Journal {
  add(reports: Report[]): void;
}

const KEPT = 80;

export function createJournal(root: HTMLElement, onSelect: (node: number) => void): Journal {
  const list = el("div", { class: "entries" });
  root.replaceChildren(el("h3", {}, "Events"), list);

  return {
    add(reports) {
      for (const report of reports) {
        const entry = el(
          "div",
          { class: report.urgent ? "entry urgent" : "entry" },
          el("span", { class: "name" }, String(report.tick)),
          report.text,
        );
        if (report.node !== null) {
          const node = report.node;
          entry.classList.add("clickable");
          entry.addEventListener("click", () => onSelect(node));
        }
        list.prepend(entry);
      }
      while (list.childElementCount > KEPT) {
        list.lastElementChild?.remove();
      }
    },
  };
}
