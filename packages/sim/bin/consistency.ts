import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import { parseArgs } from "node:util";
import {
  FLAWS,
  type Flaw,
  flawsOf,
  GIGAYEAR,
  groundedOf,
  sketchSystem,
  YEAR,
} from "../src/index.ts";

interface Seen {
  name: string;
  young: boolean;
  flaws: Flaw[];
}

interface Verdict {
  seed: number;
  settled: boolean;
  solids: number;
  young: number;
  seen: Seen[];
}

const YOUNG = 1e8 * YEAR;

const { values } = parseArgs({
  options: {
    seed: { type: "string", default: "1" },
    systems: { type: "string", default: "1000" },
    home: { type: "string", default: "both" },
    age: { type: "string" },
    jobs: { type: "string", default: String(availableParallelism()) },
    list: { type: "boolean", default: false },
    part: { type: "string" },
  },
});

const first = Number(values.seed);
const systems = Number(values.systems);
const age = values.age === undefined ? null : Number(values.age) * GIGAYEAR;
const jobs = Math.max(1, Math.min(Number(values.jobs), systems));
const plans = { yes: [true], no: [false], both: [true, false] }[values.home];
if (plans === undefined || ![first, systems, jobs, age ?? 0].every(Number.isFinite)) {
  throw new Error(
    "Use --seed N --systems N --home yes|no|both --age <billions of years> --jobs N [--list].",
  );
}

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

function cell(value: string | number, width: number): string {
  return String(value).padStart(width);
}

function share(part: number, whole: number): string {
  return `${((100 * part) / Math.max(1, whole)).toFixed(1)}%`;
}

function judge(seed: number, settled: boolean): Verdict {
  const system = sketchSystem(seed, { settled, star: null, age: settled ? null : age });
  const found = flawsOf(system);
  const solids = system.bodies.filter((body) => groundedOf(body.physics));
  const seen = solids
    .map((body) => ({
      name: body.name,
      young: body.physics.age < YOUNG,
      flaws: found.filter((each) => each.body === body.id).map((each) => each.flaw),
    }))
    .filter((each) => each.flaws.length > 0);
  const young = solids.filter((body) => body.physics.age < YOUNG).length;
  return { seed, settled, solids: solids.length, young, seen };
}

function report(verdicts: Verdict[], settled: boolean): void {
  const mine = verdicts.filter((verdict) => verdict.settled === settled);
  const solids = mine.reduce((sum, verdict) => sum + verdict.solids, 0);
  const young = mine.reduce((sum, verdict) => sum + verdict.young, 0);
  const seen = mine.flatMap((verdict) => verdict.seen);
  print("");
  print(
    `${mine.length} systems ${settled ? "with a home" : "with no home"}, seeds ${first}..` +
      `${first + systems - 1}${age === null || settled ? "" : `, read at ${values.age} billion years`}: ` +
      `${solids} solid bodies, ${young} of them younger than 100 million years`,
  );
  print(
    `flawed: ${seen.length} (${share(seen.length, solids)}), ` +
      `${seen.filter((each) => each.young).length} of them young`,
  );
  print(`${"flaw".padEnd(48)}${cell("bodies", 8)}${cell("share", 8)}${cell("young", 7)}`);
  for (const flaw of FLAWS) {
    const hit = seen.filter((each) => each.flaws.includes(flaw));
    if (hit.length > 0) {
      print(
        `${flaw.padEnd(48)}${cell(hit.length, 8)}${cell(share(hit.length, solids), 8)}` +
          `${cell(hit.filter((each) => each.young).length, 7)}`,
      );
    }
  }
  if (values.list) {
    for (const verdict of mine) {
      for (const each of verdict.seen) {
        print(`seed ${verdict.seed}: ${each.name}, ${each.flaws.join("; ")}`);
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
