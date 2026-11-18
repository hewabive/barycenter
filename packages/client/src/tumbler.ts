import { el, write } from "./dom.ts";

export interface Place {
  step: number;
  within: number;
  title: string;
}

export interface Tumbler {
  frame: HTMLElement;
  show(value: number): void;
}

interface Press {
  pointer: number;
  step: number;
  way: number;
  from: number;
  given: number;
  dragged: boolean;
  repeated: boolean;
  wait: number;
  pace: number;
}

const HOLD_WAIT = 400;
const HOLD_PACE = 80;
const DRAG_SLACK = 6;
const DRAG_NOTCH = 14;
const WHEEL_NOTCH = 100;
const WHEEL_LEAST = 30;
const LINE_HEIGHT = 33;

export function createTumbler(
  pieces: (Place | string)[],
  grain: number,
  solid: number,
  onStep: (by: number) => void,
  onFlip: (() => void) | null,
): Tumbler {
  const sign =
    onFlip === null
      ? null
      : el("button", { class: "sign", type: "button", title: "Turn it the other way" }, "+");
  sign?.addEventListener("click", () => onFlip?.());
  const frame = el("span", { class: "tumbler" }, sign);
  const places: { place: Place; cell: HTMLElement }[] = [];
  for (const piece of pieces) {
    if (typeof piece === "string") {
      frame.append(el("span", { class: "gap" }, piece));
      continue;
    }
    const cell = el("span", { class: "digit", title: piece.title }, "0");
    cell.dataset.place = String(places.length);
    places.push({ place: piece, cell });
    frame.append(cell);
  }
  const placeOf = (event: Event) => {
    const cell =
      event.target instanceof HTMLElement ? event.target.closest<HTMLElement>(".digit") : null;
    return cell === null ? null : places[Number(cell.dataset.place)];
  };

  let spin = 0;
  frame.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const found = placeOf(event);
      if (found === null) {
        return;
      }
      const turned = event.deltaY || event.deltaX;
      const delta = event.deltaMode === 0 ? turned : turned * LINE_HEIGHT;
      let notches = 0;
      if (Math.abs(delta) >= WHEEL_LEAST) {
        notches = Math.sign(delta) * Math.max(1, Math.round(Math.abs(delta) / WHEEL_NOTCH));
        spin = 0;
      } else {
        spin += delta;
        if (Math.abs(spin) >= WHEEL_LEAST) {
          notches = Math.sign(spin);
          spin = 0;
        }
      }
      if (notches !== 0) {
        onStep(-notches * found.place.step);
      }
    },
    { passive: false },
  );

  let press: Press | null = null;
  const still = (held: Press) => {
    window.clearTimeout(held.wait);
    window.clearInterval(held.pace);
  };
  frame.addEventListener("pointerdown", (event) => {
    const found = placeOf(event);
    if (found === null || event.button !== 0) {
      return;
    }
    event.preventDefault();
    const bounds = found.cell.getBoundingClientRect();
    const held: Press = {
      pointer: event.pointerId,
      step: found.place.step,
      way: event.clientY < bounds.top + bounds.height / 2 ? 1 : -1,
      from: event.clientY,
      given: 0,
      dragged: false,
      repeated: false,
      wait: 0,
      pace: 0,
    };
    held.wait = window.setTimeout(() => {
      held.pace = window.setInterval(() => {
        if (!frame.isConnected) {
          still(held);
          return;
        }
        held.repeated = true;
        onStep(held.way * held.step);
      }, HOLD_PACE);
    }, HOLD_WAIT);
    frame.setPointerCapture(event.pointerId);
    press = held;
  });
  frame.addEventListener("pointermove", (event) => {
    if (press === null || press.pointer !== event.pointerId) {
      return;
    }
    const lift = press.from - event.clientY;
    if (!press.dragged && Math.abs(lift) < DRAG_SLACK) {
      return;
    }
    if (!press.dragged) {
      press.dragged = true;
      still(press);
    }
    const wanted = Math.trunc(lift / DRAG_NOTCH);
    if (wanted !== press.given) {
      onStep((wanted - press.given) * press.step);
      press.given = wanted;
    }
  });
  const release = (event: PointerEvent, stepped: boolean) => {
    if (press === null || press.pointer !== event.pointerId) {
      return;
    }
    const held = press;
    press = null;
    still(held);
    if (stepped && !held.dragged && !held.repeated) {
      onStep(held.way * held.step);
    }
  };
  frame.addEventListener("pointerup", (event) => release(event, true));
  frame.addEventListener("pointercancel", (event) => release(event, false));

  return {
    frame,
    show(value) {
      const count = Math.round(Math.abs(value) / grain);
      if (sign !== null) {
        write(sign, value < 0 && count > 0 ? "−" : "+");
      }
      let leading = true;
      places.forEach(({ place, cell }, index) => {
        const part = Math.floor(
          (count % Math.round(place.within / grain)) / Math.round(place.step / grain),
        );
        const shown = index === 0 ? part : part % 10;
        leading = leading && shown === 0 && place.step > solid;
        write(cell, String(shown));
        cell.classList.toggle("lead", leading);
      });
    },
  };
}
