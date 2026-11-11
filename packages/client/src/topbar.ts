import { SPEEDS, type Triggers } from "@barycenter/protocol";
import { amount, button, el } from "./dom.ts";
import { type Game, summarize } from "./model.ts";
import { css, powerColor } from "./palette.ts";

export interface TopbarActions {
  time(paused: boolean | null, speed: number | null): void;
  triggers(triggers: Triggers): void;
  restart(): void;
}

export interface Topbar {
  show(game: Game, notice: string): void;
  status(text: string): void;
}

const TRIGGER_LABELS: [keyof Triggers, string][] = [
  ["announced", "attack"],
  ["territory", "gain or loss"],
  ["discovered", "discovery"],
];

export function createTopbar(root: HTMLElement, actions: TopbarActions): Topbar {
  let paused = true;
  const pause = button("Resume", "Space", () => actions.time(!paused, null));
  pause.classList.add("primary");
  const speeds = SPEEDS.map((speed) => {
    const choice = button(`${speed}×`, `Speed ${speed}`, () => actions.time(null, speed));
    return { speed, choice };
  });
  const tick = el("span", { class: "value" });
  const summary = el("span", { class: "summary" });
  const seats = el("span", { class: "seats" });
  const notice = el("span", { class: "notice" });
  const status = el("span", { class: "status" });
  const room = el("span", { class: "name" });
  const restart = button("New game", "Start a fresh game in a new room", actions.restart);

  const boxes = TRIGGER_LABELS.map(([name, label]) => {
    const box = el("input", { type: "checkbox" });
    box.addEventListener("change", () => {
      actions.triggers({
        announced: boxes[0].box.checked,
        territory: boxes[1].box.checked,
        discovered: boxes[2].box.checked,
      });
    });
    return { name, box, wrapper: el("label", { class: "toggle" }, box, label) };
  });

  root.replaceChildren(
    el("strong", { class: "title" }, "Barycenter"),
    pause,
    el("span", { class: "speeds" }, ...speeds.map((item) => item.choice)),
    el("span", { class: "name" }, "tick"),
    tick,
    summary,
    seats,
    el("span", { class: "name" }, "pause on"),
    ...boxes.map((item) => item.wrapper),
    notice,
    status,
    room,
    restart,
  );

  return {
    show(game, text) {
      paused = game.time.paused;
      pause.textContent = paused ? "Resume" : "Pause";
      pause.classList.toggle("active", paused);
      for (const item of speeds) {
        item.choice.classList.toggle("active", item.speed === game.time.speed);
      }
      tick.textContent = String(game.view.tick);
      const totals = summarize(game.view);
      summary.textContent = `regions ${totals.regions} · cells ${totals.cells} · levels ${totals.levels} · force ${amount(totals.force)} · matter ${amount(totals.matter)}`;
      seats.replaceChildren(
        ...game.seats.map((seat, power) => {
          const chip = el("span", { class: "chip" }, power === game.seat ? "you" : seat.label);
          chip.style.background = css(powerColor(power));
          chip.classList.toggle("dead", !game.view.alive[power]);
          return chip;
        }),
      );
      for (const item of boxes) {
        if (document.activeElement !== item.box) {
          item.box.checked = game.triggers[item.name];
        }
      }
      notice.textContent = text;
      room.textContent = `room ${game.room}`;
    },
    status(text) {
      status.textContent = text;
    },
  };
}
