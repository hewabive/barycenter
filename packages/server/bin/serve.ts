import { parseArgs } from "node:util";
import { startServer } from "../src/index.ts";

const { values } = parseArgs({
  options: {
    port: { type: "string", default: "8787" },
    host: { type: "string", default: "127.0.0.1" },
    saves: { type: "string", default: "saves" },
    "tick-rate": { type: "string", default: "2" },
    seed: { type: "string" },
    tuning: { type: "boolean", default: false },
  },
});

const server = await startServer({
  port: Number(values.port),
  host: values.host,
  tuning: values.tuning,
  saves: values.saves === "" ? null : values.saves,
  tickRate: Number(values["tick-rate"]),
  seed: values.seed === undefined ? null : Number(values.seed),
});

process.stdout.write(`Barycenter server listening on ws://${values.host}:${server.port}\n`);
if (values.tuning) {
  process.stdout.write("Live tuning of constants is enabled\n");
}

let closing = false;
async function shutdown(): Promise<void> {
  if (closing) {
    return;
  }
  closing = true;
  await server.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
