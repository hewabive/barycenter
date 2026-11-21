import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import { parseArgs } from "node:util";
import { CAUSES, type Cause, type MishapKind, surveySystem, trial } from "../src/index.ts";

interface Fall {
  name: string;
  against: string;
  kind: MishapKind;
  turns: number;
  cause: Cause;
  home: boolean;
}

interface Verdict {
  seed: number;
  settled: boolean;
  bodies: number;
  falls: Fall[];
}

const { values } = parseArgs({
  options: {
    seed: { type: "string", default: "1" },
    systems: { type: "string", default: "100" },
    turns: { type: "string", default: "10000" },
    home: { type: "string", default: "both" },
    jobs: { type: "string", default: String(availableParallelism()) },
    list: { type: "boolean", default: false },
    part: { type: "string" },
  },
});

const first = Number(values.seed);
const systems = Number(values.systems);
const turns = Number(values.turns);
const jobs = Math.max(1, Math.min(Number(values.jobs), systems));
const plans = { yes: [true], no: [false], both: [true, false] }[values.home];
if (plans === undefined || ![first, systems, turns, jobs].every(Number.isFinite)) {
  throw new Error("Use --seed N --systems N --turns N --home yes|no|both --jobs N [--list].");
}

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

function cell(value: string | number, width: number): string {
  return String(value).padStart(width);
}

function judge(seed: number, settled: boolean): Verdict {
  const system = surveySystem(seed, { settled, star: null });
  const { bodies, home } = system;
  const falls = trial(system, turns).losses.map((loss) => ({
    name: bodies[loss.body].name,
    against: bodies[loss.other].name,
    kind: loss.kind,
    turns: loss.turns,
    cause: loss.cause,
    home: loss.body === home,
  }));
  return { seed, settled, bodies: bodies.length - 1, falls };
}

function share(part: number, whole: number): string {
  return `${((100 * part) / Math.max(1, whole)).toFixed(1)}%`;
}

function report(verdicts: Verdict[], settled: boolean): void {
  const mine = verdicts.filter((verdict) => verdict.settled === settled);
  const broken = mine.filter((verdict) => verdict.falls.length > 0);
  const bodies = mine.reduce((sum, verdict) => sum + verdict.bodies, 0);
  const falls = mine.flatMap((verdict) => verdict.falls);
  const homes = falls.filter((fall) => fall.home).length;
  print("");
  print(
    `${mine.length} systems ${settled ? "with a home" : "with no home"}, seeds ${first}..` +
      `${first + systems - 1}, every body followed for ${turns / 8} to ${turns} of its turns`,
  );
  print(
    `a body is lost in ${broken.length} systems (${share(broken.length, mine.length)}), ` +
      `${falls.length} of ${bodies} bodies (${share(falls.length, bodies)})` +
      `${settled ? `, the home in ${homes}` : ""}`,
  );
  print(
    `${"cause".padEnd(30)}${cell("systems", 9)}${cell("bodies", 8)}${cell("half by turn", 14)}`,
  );
  for (const cause of CAUSES) {
    const lost = falls.filter((fall) => fall.cause === cause);
    if (lost.length === 0) {
      continue;
    }
    const hit = mine.filter((verdict) => verdict.falls.some((fall) => fall.cause === cause));
    const sorted = lost.map((fall) => fall.turns).sort((left, right) => left - right);
    print(
      `${cause.padEnd(30)}${cell(share(hit.length, mine.length), 9)}${cell(lost.length, 8)}` +
        `${cell(sorted[sorted.length >> 1].toFixed(0), 14)}`,
    );
  }
  if (values.list) {
    for (const verdict of broken) {
      for (const fall of verdict.falls) {
        print(
          `seed ${verdict.seed}: ${fall.name} against ${fall.against}, ${fall.kind} after ` +
            `${fall.turns.toFixed(0)} turns, ${fall.cause}`,
        );
      }
    }
  }
}

function work(part: number): Verdict[] {
  const verdicts: Verdict[] = [];
  for (let seed = first + part; seed < first + systems; seed += jobs) {
    for (const settled of plans ?? []) {
      verdicts.push(judge(seed, settled));
    }
  }
  return verdicts;
}

function hire(part: number): Promise<Verdict[]> {
  return new Promise((resolve, reject) => {
    const passed = process.argv.slice(2).filter((word) => word !== "--list");
    const child = spawn(process.execPath, [process.argv[1], ...passed, "--part", String(part)], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    let text = "";
    child.stdout.on("data", (chunk: Buffer) => {
      text += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(JSON.parse(text) as Verdict[]);
      } else {
        reject(new Error(`A worker stopped with code ${code}.`));
      }
    });
  });
}

if (values.part !== undefined) {
  process.stdout.write(JSON.stringify(work(Number(values.part))));
} else {
  const parts = await Promise.all(Array.from({ length: jobs }, (_, part) => hire(part)));
  const verdicts = parts.flat().sort((left, right) => left.seed - right.seed);
  for (const settled of plans) {
    report(verdicts, settled);
  }
}
