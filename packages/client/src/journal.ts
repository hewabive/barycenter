import { button, el } from "./dom.ts";
import type { Report } from "./model.ts";

export interface Journal {
  add(reports: Report[]): void;
}

const KEPT = 80;

export function createJournal(
  root: HTMLElement,
  folded: boolean,
  onSelect: (region: number) => void,
): Journal {
  const list = el("div", { class: "entries" });
  const header = button("Events", "Show or hide earlier events", () => {
    root.classList.toggle("folded");
    list.scrollTop = 0;
  });
  header.classList.add("fold");
  root.classList.toggle("folded", folded);
  root.replaceChildren(header, list);

  return {
    add(reports) {
      for (const report of reports) {
        const entry = el(
          "div",
          { class: report.urgent ? "entry urgent" : "entry" },
          el("span", { class: "name" }, String(report.tick)),
          report.text,
        );
        if (report.region !== null) {
          const region = report.region;
          entry.classList.add("clickable");
          entry.addEventListener("click", () => onSelect(region));
        }
        list.prepend(entry);
      }
      while (list.childElementCount > KEPT) {
        list.lastElementChild?.remove();
      }
    },
  };
}
