import { type Ask, shapeTile } from "./tile.ts";

const answer = postMessage as (message: unknown, transfer: Transferable[]) => void;

addEventListener("message", (event: MessageEvent<Ask>) => {
  const made = shapeTile(event.data);
  answer(made, [made.position.buffer, made.normal.buffer, made.heading.buffer, made.grit.buffer]);
});
