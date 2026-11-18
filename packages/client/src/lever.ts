import { el } from "./dom.ts";

export interface Lever {
  frame: HTMLElement;
  show(value: number): void;
}

const THUMB = 12;
const LEAST = 0.05;
const FINEST = 0.1;

function rough(value: number): number {
  const size = Math.abs(value);
  if (size < LEAST) {
    return 0;
  }
  const step = Math.max(FINEST, 10 ** (Math.floor(Math.log10(size)) - 1));
  return Math.round(value / step) * step;
}

export function createLever(
  decades: number,
  marks: [value: number, label: string][],
  title: string,
  onSet: (value: number) => void,
): Lever {
  const seat = (value: number): number =>
    Math.max(-1, Math.min(1, (Math.sign(value) * Math.log10(Math.abs(value) + 1)) / decades));
  const field = el("input", {
    type: "range",
    min: "-1",
    max: "1",
    step: "0.002",
    value: "0",
    title,
  });
  const ticks = el(
    "div",
    { class: "ticks" },
    ...marks.map(([value, label]) => {
      const tick = el("span", {}, label);
      tick.style.left = `calc(50% + ${seat(value).toFixed(4)} * (50% - ${THUMB / 2}px))`;
      return tick;
    }),
  );
  let held = false;
  field.addEventListener("pointerdown", () => {
    held = true;
  });
  for (const kind of ["pointerup", "pointercancel", "change", "blur"]) {
    field.addEventListener(kind, () => {
      held = false;
    });
  }
  field.addEventListener("input", () => {
    const pull = Number(field.value);
    onSet(rough(Math.sign(pull) * (10 ** (decades * Math.abs(pull)) - 1)));
  });
  return {
    frame: el("div", { class: "lever" }, field, ticks),
    show(value) {
      if (!held) {
        field.value = String(seat(value));
      }
    },
  };
}
