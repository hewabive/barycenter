import { warmthOf } from "./heat.ts";
import { wrapped } from "./interior.ts";
import { classOf, columnOf, holdsSteam, moltenOf, seaCover, shareOf, starborn } from "./physics.ts";
import { sectionOf } from "./section.ts";
import type { Physics, Sketch } from "./types.ts";

export const FLAWS = [
  "ice at a ground above melting",
  "bare ice above 200 K on a body too light to hold steam",
  "a solid lid on molten ground",
  "ice on molten ground",
  "a sea world with no sea in section",
  "a sea in section with no sea in the air",
  "a sea under ice below a ground above melting",
  "a steam world with little steam",
  "more water in the air than in the body",
] as const;

export type Flaw = (typeof FLAWS)[number];

export interface Found {
  body: number;
  flaw: Flaw;
}

const MELTING = 273.16;
const BARE_ICE = 200;
const MOLTEN = 0.5;
const STEAMY = 0.5;
const ROUNDED = 3e-4;

export function groundedOf(physics: Physics): boolean {
  return !starborn(physics) && !wrapped(physics);
}

export function flawsOfBody(physics: Physics, host: Physics | null): Flaw[] {
  if (!groundedOf(physics)) {
    return [];
  }
  const flaws: Flaw[] = [];
  const zones = sectionOf(physics, host)?.zones ?? [];
  const top = zones[zones.length - 1];
  const rock = zones.filter((zone) => zone.stuff === "rock");
  const ground = rock[rock.length - 1];
  const iced = zones.some((zone) => zone.stuff === "ice");
  const kind = classOf(physics);
  const cover = seaCover(physics);
  const molten = moltenOf(physics) >= MOLTEN;
  const water = shareOf(physics, "water") * physics.air;
  if (top?.stuff === "ice" && physics.heat > MELTING) {
    flaws.push("ice at a ground above melting");
  }
  const light = !holdsSteam(physics.mass, physics.radius, physics.heat);
  if (iced && physics.air === 0 && physics.heat > BARE_ICE && light) {
    flaws.push("bare ice above 200 K on a body too light to hold steam");
  }
  if (molten && ground !== undefined && ground === top && ground.solid && !ground.stirred) {
    flaws.push("a solid lid on molten ground");
  }
  if (molten && iced) {
    flaws.push("ice on molten ground");
  }
  if (/sea|ocean|living/.test(kind) && top?.stuff !== "sea") {
    flaws.push("a sea world with no sea in section");
  }
  if (top?.stuff === "sea" && cover === 0) {
    flaws.push("a sea in section with no sea in the air");
  }
  if (physics.heat > MELTING && warmthOf(physics, host)?.sea) {
    flaws.push("a sea under ice below a ground above melting");
  }
  if (kind.startsWith("steam") && water < STEAMY * physics.air) {
    flaws.push("a steam world with little steam");
  }
  if (water > physics.ice * columnOf(physics.mass, physics.radius) * (1 + ROUNDED)) {
    flaws.push("more water in the air than in the body");
  }
  return flaws;
}

export function flawsOf(system: Sketch): Found[] {
  return system.bodies.flatMap((body) =>
    flawsOfBody(body.physics, body.parent === null ? null : system.bodies[body.parent].physics).map(
      (flaw) => ({ body: body.id, flaw }),
    ),
  );
}
