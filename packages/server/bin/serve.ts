import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { startServer } from "../src/index.ts";

const { values } = parseArgs({
  options: {
    port: { type: "string", default: "8787" },
    host: { type: "string", default: "127.0.0.1" },
    saves: { type: "string", default: "saves" },
    client: { type: "string" },
    "tick-rate": { type: "string", default: "2" },
    seed: { type: "string" },
    tuning: { type: "boolean", default: false },
  },
});

const built = fileURLToPath(new URL("../../client/dist", import.meta.url));
const client = values.client ?? (existsSync(built) ? built : null);

const server = await startServer({
  port: Number(values.port),
  host: values.host,
  tuning: values.tuning,
  saves: values.saves === "" ? null : values.saves,
  client: client === "" ? null : client,
  tickRate: Number(values["tick-rate"]),
  seed: values.seed === undefined ? null : Number(values.seed),
});

process.stdout.write(`Barycenter server listening on ws://${values.host}:${server.port}\n`);
if (client !== null && client !== "") {
  process.stdout.write(`Open http://${values.host}:${server.port}/strategy.html to play\n`);
}
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
