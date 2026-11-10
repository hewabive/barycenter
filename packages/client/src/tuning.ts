import type { Constants } from "@barycenter/sim";
import { el } from "./dom.ts";

export interface Tuning {
  show(constants: Constants): void;
}

export function createTuning(
  root: HTMLElement,
  constants: Constants,
  onChange: (changes: Partial<Constants>) => void,
): Tuning {
  const names = Object.keys(constants) as (keyof Constants)[];
  const inputs = new Map<keyof Constants, HTMLInputElement>();
  const grid = el("div", { class: "grid" });
  for (const name of names) {
    const input = el("input", { type: "number", step: "any" });
    input.addEventListener("change", () => {
      const value = Number(input.value);
      if (Number.isFinite(value)) {
        onChange({ [name]: value });
      }
    });
    inputs.set(name, input);
    grid.append(el("label", {}, el("span", { class: "name" }, name), input));
  }
  root.replaceChildren(el("summary", {}, "Constants"), grid);
  root.hidden = false;

  const show = (current: Constants) => {
    for (const [name, input] of inputs) {
      if (document.activeElement !== input) {
        input.value = String(current[name]);
      }
    }
  };
  show(constants);
  return { show };
}
