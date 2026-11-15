import assert from "node:assert/strict";
import { test } from "node:test";
import { commandOf, orderOf, parseClientMessage } from "../src/index.ts";

function parse(value: unknown) {
  return parseClientMessage(JSON.stringify(value));
}

const join = { type: "join", protocol: 2, room: "home", seat: null, token: null, setup: null };

test("a well-formed join is accepted", () => {
  assert.deepEqual(parse(join), join);
  assert.deepEqual(parse({ ...join, seat: 0, token: "abc" }), { ...join, seat: 0, token: "abc" });
  const setup = { seed: 7, rivals: ["aggressor", "builder"] };
  assert.deepEqual(parse({ ...join, setup }), { ...join, setup });
});

test("a room name cannot leave the saves folder", () => {
  for (const room of ["../etc", "a/b", "A", "", "x".repeat(33), "name.json"]) {
    assert.equal(parse({ ...join, room }), null, room);
  }
});

test("malformed joins are refused", () => {
  assert.equal(parse({ ...join, protocol: "1" }), null);
  assert.equal(parse({ ...join, seat: -1 }), null);
  assert.equal(parse({ ...join, seat: 0.5 }), null);
  assert.equal(parse({ ...join, token: 5 }), null);
  assert.equal(parse({ ...join, setup: { seed: 1.5, rivals: ["builder"] } }), null);
  assert.equal(parse({ ...join, setup: { seed: 1, rivals: [] } }), null);
  assert.equal(parse({ ...join, setup: { seed: 1, rivals: [3] } }), null);
});

test("orders keep only the fields the core knows", () => {
  const parsed = parse({
    type: "orders",
    orders: [
      { kind: "dial", region: 2, value: 0.5, power: 9, extra: true },
      { kind: "lean", branch: "power", value: 0.8 },
      { kind: "garrison", region: 2, value: 4 },
      { kind: "garrison", region: 2, value: null },
      { kind: "reinforce", region: 2, value: 6, power: 1 },
      { kind: "army", value: 40, region: 2 },
      { kind: "forward", value: 0.8 },
      { kind: "road", edge: 3, active: true },
      { kind: "pressure", region: 5, target: null, active: false },
      { kind: "pressure", region: 5, target: 1, active: true },
      { kind: "aim", region: 5, target: 1, cell: 40, power: 3 },
      { kind: "aim", region: 5, target: null, cell: null },
    ],
  });
  assert.deepEqual(parsed, {
    type: "orders",
    orders: [
      { kind: "dial", region: 2, value: 0.5 },
      { kind: "lean", branch: "power", value: 0.8 },
      { kind: "garrison", region: 2, value: 4 },
      { kind: "garrison", region: 2, value: null },
      { kind: "reinforce", region: 2, value: 6 },
      { kind: "army", value: 40 },
      { kind: "forward", value: 0.8 },
      { kind: "road", edge: 3, active: true },
      { kind: "pressure", region: 5, target: null, active: false },
      { kind: "pressure", region: 5, target: 1, active: true },
      { kind: "aim", region: 5, target: 1, cell: 40 },
      { kind: "aim", region: 5, target: null, cell: null },
    ],
  });
});

test("malformed orders are refused as a whole", () => {
  const good = { kind: "dial", region: 2, value: 0.5 };
  assert.equal(
    parse({ type: "orders", orders: [good, { kind: "dial", region: "2", value: 1 }] }),
    null,
  );
  assert.equal(
    parse({ type: "orders", orders: [{ kind: "lean", branch: "science", value: 1 }] }),
    null,
  );
  assert.equal(
    parse({ type: "orders", orders: [{ kind: "pressure", region: 2, active: true }] }),
    null,
  );
  assert.equal(parse({ type: "orders", orders: [{ kind: "aim", region: 2, target: 1 }] }), null);
  assert.equal(parse({ type: "orders", orders: [{ kind: "teleport", region: 2 }] }), null);
  assert.equal(parse({ type: "orders", orders: [{ kind: "garrison", region: 2 }] }), null);
  assert.equal(parse({ type: "orders", orders: [{ kind: "army", value: null }] }), null);
  assert.equal(
    parse({ type: "orders", orders: [{ kind: "reinforce", region: 2, value: null }] }),
    null,
  );
  assert.equal(parse({ type: "orders", orders: "all" }), null);
  assert.equal(parse({ type: "orders", orders: new Array(257).fill(good) }), null);
});

test("time, triggers and tuning messages are checked", () => {
  assert.deepEqual(parse({ type: "time", paused: true }), {
    type: "time",
    paused: true,
    speed: null,
  });
  assert.deepEqual(parse({ type: "time", speed: 4 }), { type: "time", paused: null, speed: 4 });
  assert.equal(parse({ type: "time", paused: "yes" }), null);
  const triggers = { announced: true, territory: false, discovered: true };
  assert.deepEqual(parse({ type: "triggers", triggers }), { type: "triggers", triggers });
  assert.equal(parse({ type: "triggers", triggers: { announced: true } }), null);
  const force = { type: "report", watch: { subject: "force" } };
  assert.deepEqual(parse({ type: "report", watch: { subject: "force", region: 3 } }), force);
  assert.deepEqual(parse({ type: "report", watch: { subject: "economy", region: 3 } }), {
    type: "report",
    watch: { subject: "economy", region: 3 },
  });
  assert.deepEqual(parse({ type: "report", watch: { subject: "economy" } }), {
    type: "report",
    watch: { subject: "economy", region: null },
  });
  assert.deepEqual(parse({ type: "report", watch: null }), { type: "report", watch: null });
  assert.equal(parse({ type: "report" }), null);
  assert.equal(parse({ type: "report", watch: { subject: "weather" } }), null);
  assert.equal(parse({ type: "report", watch: { subject: "economy", region: -1 } }), null);
  assert.deepEqual(parse({ type: "tune", constants: { buildRate: 1 } }), {
    type: "tune",
    constants: { buildRate: 1 },
  });
  assert.equal(parse({ type: "tune", constants: { buildRate: "fast" } }), null);
});

test("a snapshot request names the selected region or none", () => {
  assert.deepEqual(parse({ type: "snapshot" }), { type: "snapshot", selected: null });
  assert.deepEqual(parse({ type: "snapshot", selected: 3 }), { type: "snapshot", selected: 3 });
  assert.equal(parse({ type: "snapshot", selected: -1 }), null);
  assert.equal(parse({ type: "snapshot", selected: 1.5 }), null);
  assert.equal(parse({ type: "snapshot", selected: "home" }), null);
});

test("anything that is not a known message is refused", () => {
  assert.equal(parseClientMessage("not json"), null);
  assert.equal(parseClientMessage("[]"), null);
  assert.equal(parseClientMessage("null"), null);
  assert.equal(parse({ type: "shutdown" }), null);
});

test("the server stamps the seat onto an order and strips it back", () => {
  const order = { kind: "pressure", region: 2, target: 1, active: true } as const;
  const command = commandOf(order, 3);
  assert.deepEqual(command, { ...order, power: 3 });
  assert.deepEqual(orderOf(command), order);
});
