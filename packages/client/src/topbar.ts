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

const STATS = ["tick", "regions", "cells", "levels", "force", "matter"] as const;

export function createTopbar(root: HTMLElement, actions: TopbarActions): Topbar {
  let paused = true;
  let shownSeats = "";
  const pause = button("Resume", "Space", () => actions.time(!paused, null));
  pause.classList.add("primary");
  const speeds = SPEEDS.map((speed) => {
    const choice = button(`${speed}×`, `Speed ${speed}`, () => actions.time(null, speed));
    return { speed, choice };
  });
  const stats = STATS.map((name) => {
    const value = el("span", { class: "value" });
    return {
      value,
      item: el("span", { class: "stat" }, el("span", { class: "name" }, name), value),
    };
  });
  const seats = el("span", { class: "seats" });
  const notice = el("span", { class: "notice" });
  const status = el("span", { class: "status" });
  const room = el("span", { class: "name room" });
  const restart = button("New game", "Start a fresh game in a new room", actions.restart);
  restart.classList.add("restart");
  const menu = button("☰", "More", () => root.classList.toggle("open"));
  menu.classList.add("menu");

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
    menu,
    el("span", { class: "summary" }, ...stats.map((stat) => stat.item)),
    el(
      "span",
      { class: "more" },
      seats,
      el("span", { class: "name" }, "pause on"),
      ...boxes.map((item) => item.wrapper),
      room,
      restart,
    ),
    el("span", { class: "alerts" }, notice, status),
  );

  document.addEventListener(
    "pointerdown",
    (event) => {
      const inside = event.target instanceof Node && root.contains(event.target);
      if (!inside && root.classList.contains("open")) {
        root.classList.remove("open");
        event.stopPropagation();
      }
    },
    { capture: true },
  );

  const write = (target: HTMLElement, text: string) => {
    if (target.textContent !== text) {
      target.textContent = text;
    }
  };

  return {
    show(game, text) {
      paused = game.time.paused;
      write(pause, paused ? "Resume" : "Pause");
      pause.classList.toggle("active", paused);
      for (const item of speeds) {
        item.choice.classList.toggle("active", item.speed === game.time.speed);
      }
      const totals = summarize(game.view);
      const values = [
        String(game.view.tick),
        String(totals.regions),
        String(totals.cells),
        String(totals.levels),
        amount(totals.force),
        amount(totals.matter),
      ];
      stats.forEach((stat, index) => {
        write(stat.value, values[index]);
      });
      const seated = JSON.stringify([game.seat, game.seats, game.view.alive]);
      if (seated !== shownSeats) {
        shownSeats = seated;
        seats.replaceChildren(
          ...game.seats.map((seat, power) => {
            const chip = el("span", { class: "chip" }, power === game.seat ? "you" : seat.label);
            chip.style.background = css(powerColor(power));
            chip.classList.toggle("dead", !game.view.alive[power]);
            return chip;
          }),
        );
      }
      for (const item of boxes) {
        if (document.activeElement !== item.box) {
          item.box.checked = game.triggers[item.name];
        }
      }
      write(notice, text);
      write(room, `room ${game.room}`);
    },
    status(text) {
      write(status, text);
    },
  };
}
