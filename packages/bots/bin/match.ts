import { parseArgs } from "node:util";
import { type Constants, defaultConstants } from "@barycenter/sim";
import { type Doctrine, doctrines, type MatchSummary, runMatch } from "../src/index.ts";

const { values } = parseArgs({
  options: {
    seed: { type: "string", default: "1" },
    ticks: { type: "string", default: "6000" },
    matches: { type: "string", default: "1" },
    doctrines: { type: "string", default: "aggressor,builder,opportunist" },
    set: { type: "string", default: "" },
  },
});

const seed = Number(values.seed);
const ticks = Number(values.ticks);
const matches = Number(values.matches);
const lineup = values.doctrines.split(",").map((name) => {
  const doctrine = doctrines[name];
  if (doctrine === undefined) {
    throw new Error(`Unknown doctrine "${name}". Known: ${Object.keys(doctrines).join(", ")}`);
  }
  return doctrine;
});

const constants: Constants = { ...defaultConstants };
for (const pair of values.set.split(",").filter((item) => item !== "")) {
  const [name, value] = pair.split("=");
  if (!Object.hasOwn(constants, name) || !Number.isFinite(Number(value))) {
    throw new Error(`Cannot set "${pair}". Use name=value with the name of a constant.`);
  }
  constants[name as keyof Constants] = Number(value);
}

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

function cell(value: string | number, width: number): string {
  return String(value).padStart(width);
}

function rotate(items: Doctrine[], shift: number): Doctrine[] {
  return items.map((_, index) => items[(index + shift) % items.length]);
}

function printMatch(summary: MatchSummary): void {
  print(`seed ${summary.seed}, ${summary.ticks} ticks`);
  print(`${cell("tick", 6)}${summary.doctrines.map((name) => cell(name, 36)).join("")}`);
  const columns = "cells regions levels  force supply";
  print(`${cell("", 6)}${summary.doctrines.map(() => cell(columns, 36)).join("")}`);
  for (const sample of summary.samples) {
    const cells = sample.standings.map((standing) =>
      cell(
        [
          cell(standing.cells, 5),
          cell(standing.regions, 7),
          cell(standing.levels, 6),
          cell(standing.force.toFixed(1), 6),
          cell(standing.supply.toFixed(2), 6),
        ].join(" "),
        36,
      ),
    );
    print(`${cell(sample.tick, 6)}${cells.join("")}`);
  }
  summary.doctrines.forEach((name, power) => {
    const fate = summary.eliminatedAt[power];
    print(
      `${name}: settled ${summary.settled[power]} cells, seized ${summary.seized[power]}, ` +
        `ceded ${summary.ceded[power]}, lost ${summary.lapsed[power]} to fallen flags` +
        `${fate === null ? "" : `, eliminated at ${fate}`}`,
    );
  });
  print(
    `attacks ${summary.attacks} (late ${summary.lateAttacks}), cells seized late ${summary.lateSeized}, ` +
      `regions shared at the end ${summary.sharedRegions}, rejected commands ${summary.rejections}`,
  );
}

function printSeries(summaries: MatchSummary[]): void {
  const totals = new Map<
    string,
    { share: number; leads: number; out: number; seized: number; lapsed: number }
  >();
  let claimed = 0;
  for (const summary of summaries) {
    const held = summary.standings.reduce((sum, standing) => sum + standing.cells, 0);
    claimed += held;
    const most = Math.max(...summary.standings.map((standing) => standing.cells));
    summary.doctrines.forEach((name, power) => {
      const total = totals.get(name) ?? { share: 0, leads: 0, out: 0, seized: 0, lapsed: 0 };
      total.share += summary.standings[power].cells / Math.max(1, held);
      total.leads += summary.standings[power].cells === most ? 1 : 0;
      total.out += summary.eliminatedAt[power] === null ? 0 : 1;
      total.seized += summary.seized[power];
      total.lapsed += summary.lapsed[power];
      totals.set(name, total);
    });
  }
  const count = summaries.length;
  print(`${count} matches of ${ticks} ticks, seeds ${seed}..${seed + count - 1}`);
  print(
    `${cell("doctrine", 14)}${cell("share", 8)}${cell("leads", 8)}${cell("out", 6)}` +
      `${cell("seized", 9)}${cell("flags fallen", 14)}`,
  );
  for (const [name, total] of totals) {
    print(
      `${cell(name, 14)}${cell(`${((100 * total.share) / count).toFixed(0)}%`, 8)}` +
        `${cell(total.leads, 8)}${cell(total.out, 6)}${cell((total.seized / count).toFixed(1), 9)}` +
        `${cell((total.lapsed / count).toFixed(1), 14)}`,
    );
  }
  const decided = summaries.filter((summary) => summary.ticks < ticks);
  const lasting = summaries.filter((summary) => summary.ticks >= ticks);
  const quiet = lasting.filter((summary) => summary.lateAttacks === 0).length;
  const frozen = lasting.filter((summary) => summary.lateSeized === 0).length;
  const rejected = summaries.reduce((sum, summary) => sum + summary.rejections, 0);
  print(`one power left in ${decided.length} of ${count}`);
  print(
    `of ${lasting.length} lasting matches: no late attacks in ${quiet}, no late border shifts in ${frozen}`,
  );
  const shared = summaries.reduce((sum, summary) => sum + summary.sharedRegions, 0);
  print(`regions shared at the end: ${(shared / count).toFixed(1)} per match`);
  print(`cells held at the end: ${(claimed / count).toFixed(0)} per match`);
  print(`rejected commands ${rejected}`);
}

if (matches <= 1) {
  printMatch(runMatch({ seed, ticks, doctrines: lineup, constants }));
} else {
  const summaries: MatchSummary[] = [];
  for (let index = 0; index < matches; index++) {
    summaries.push(
      runMatch({ seed: seed + index, ticks, doctrines: rotate(lineup, index), constants }),
    );
  }
  printSeries(summaries);
}
