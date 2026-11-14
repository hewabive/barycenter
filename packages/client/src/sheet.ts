import { el, write } from "./dom.ts";

export interface Line {
  row: HTMLElement;
  cells: HTMLElement[];
}

export interface Sheet {
  block: HTMLElement;
  line(key: string): Line;
  arrange(keys: string[]): void;
}

export function createSheet(
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

export function fill(line: Line, texts: string[]): void {
  texts.forEach((text, index) => {
    write(line.cells[index], text);
  });
}
