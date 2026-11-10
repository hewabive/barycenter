import assert from "node:assert/strict";
import { test } from "node:test";
import type { ServerMessage } from "@barycenter/protocol";
import { Room, type RoomOptions } from "../src/index.ts";

type Sent = { seat: number; message: ServerMessage };
type Typed<Type extends ServerMessage["type"]> = Extract<ServerMessage, { type: Type }>;

const options: RoomOptions = {
  id: "test",
  seed: 1,
  humans: 1,
  rivals: ["aggressor", "builder"],
  tuning: true,
  tickRate: 2,
};

function open(overrides: Partial<RoomOptions> = {}) {
  const sent: Sent[] = [];
  const room = new Room({ ...options, ...overrides }, (seat, message) => {
    sent.push({ seat, message });
  });
  const last = <Type extends ServerMessage["type"]>(type: Type): Typed<Type> => {
    const found = sent.findLast((item) => item.message.type === type);
    assert.ok(found, `no ${type} message was sent`);
    return found.message as Typed<Type>;
  };
  return { room, sent, last };
}

function seated(overrides: Partial<RoomOptions> = {}) {
  const context = open(overrides);
  const joined = context.room.join(null, null);
  assert.ok("token" in joined);
  return { ...context, token: joined.token };
}

function capitalOf(room: Room, seat: number): number {
  return room.save().state.powers[seat].capital;
}

test("the first player takes the open seat and receives a secret token", () => {
  const { room } = open();
  const joined = room.join(null, null);
  assert.ok("token" in joined);
  assert.equal(joined.seat, 0);
  assert.ok(joined.token.length >= 32);
});

test("a taken seat can be reclaimed only with its token", () => {
  const { room, token } = seated();
  assert.deepEqual(room.join(0, null), { error: "seat is taken" });
  assert.deepEqual(room.join(0, "guess"), { error: "seat is taken" });
  assert.deepEqual(room.join(null, null), { error: "no open seat" });
  assert.deepEqual(room.join(0, token), { seat: 0, token });
});

test("seats played by bots cannot be joined", () => {
  const { room } = open();
  assert.deepEqual(room.join(1, null), { error: "no open seat" });
  assert.deepEqual(room.join(7, null), { error: "no open seat" });
});

test("the welcome carries the map, the constants and the first view", () => {
  const { room } = seated();
  const welcome = room.welcome(0);
  assert.equal(welcome.type, "welcome");
  assert.ok(welcome.type === "welcome");
  assert.equal(welcome.seat, 0);
  assert.equal(welcome.view.power, 0);
  assert.equal(welcome.time.paused, true);
  assert.equal(welcome.outline.nodes.length, welcome.view.nodes.length);
  assert.deepEqual(
    welcome.seats.map((seat) => seat.label),
    ["human", "aggressor", "builder"],
  );
  for (const node of welcome.view.nodes) {
    assert.equal(node.holding !== null, node.status?.owner === 0);
  }
});

test("a room starts paused and time runs only after it is resumed", () => {
  const { room, last } = seated();
  assert.equal(room.pump(5000), 0);
  assert.equal(room.tick, 0);

  room.handle(0, { type: "time", paused: false, speed: null });
  assert.equal(last("room").time.paused, false);
  assert.equal(room.pump(1000), 2);
  assert.equal(last("view").view.tick, 2);
});

test("speed multiplies the tick rate and only listed speeds are accepted", () => {
  const { room, last } = seated();
  room.handle(0, { type: "time", paused: false, speed: 4 });
  assert.equal(room.pump(1000), 8);
  room.handle(0, { type: "time", paused: null, speed: 3 });
  assert.equal(last("error").reason, "unsupported speed");
  assert.equal(last("room").time.speed, 4);
});

test("a long stall is not replayed as a burst of ticks", () => {
  const { room } = seated();
  room.handle(0, { type: "time", paused: false, speed: 8 });
  assert.ok(room.pump(60_000) <= 32);
});

test("orders take effect while the room is paused", () => {
  const { room, last } = seated();
  const capital = capitalOf(room, 0);
  room.handle(0, { type: "orders", orders: [{ kind: "dial", node: capital, value: 0.25 }] });
  const view = last("view").view;
  assert.equal(view.tick, 0);
  assert.equal(view.nodes[capital].holding?.dial, 0.25);
});

test("an order for a rival's node is rejected and changes nothing", () => {
  const { room, last } = seated();
  const foreign = capitalOf(room, 1);
  const before = JSON.stringify(room.save().state);
  room.handle(0, { type: "orders", orders: [{ kind: "garrison", node: foreign, value: 9 }] });
  assert.equal(last("rejected").rejections[0].reason, "node is not owned");
  assert.equal(JSON.stringify(room.save().state), before);
});

test("time pauses when the player takes a node", () => {
  const { room, last } = seated();
  const state = room.save().state;
  const capital = state.powers[0].capital;
  const target = state.map.links[capital][0].node;
  room.handle(0, {
    type: "orders",
    orders: [{ kind: "pressure", from: capital, to: target, active: true }],
  });
  room.handle(0, { type: "time", paused: false, speed: 8 });
  for (let second = 0; second < 60 && room.running; second++) {
    room.pump(1000);
  }
  assert.equal(room.running, false);
  assert.deepEqual(last("room").time, { paused: true, speed: 8, pausedFor: 0 });
  const captured = last("view").events.find((event) => event.kind === "captured");
  assert.deepEqual(captured, { kind: "captured", node: target, from: null, to: 0 });
});

test("a trigger that is switched off does not pause time", () => {
  const { room, sent } = seated();
  const state = room.save().state;
  const capital = state.powers[0].capital;
  const target = state.map.links[capital][0].node;
  room.handle(0, {
    type: "triggers",
    triggers: { announced: false, captured: false, discovered: false },
  });
  room.handle(0, {
    type: "orders",
    orders: [{ kind: "pressure", from: capital, to: target, active: true }],
  });
  room.handle(0, { type: "time", paused: false, speed: 8 });
  for (let second = 0; second < 20; second++) {
    room.pump(1000);
  }
  assert.equal(room.running, true);
  const taken = sent.some(
    ({ message }) =>
      message.type === "view" &&
      message.events.some(
        (event) => event.kind === "captured" && event.node === target && event.to === 0,
      ),
  );
  assert.ok(taken);
});

test("bots play their seats while time runs", () => {
  const { room } = seated();
  room.handle(0, {
    type: "triggers",
    triggers: { announced: false, captured: false, discovered: false },
  });
  room.handle(0, { type: "time", paused: false, speed: 8 });
  for (let second = 0; second < 40; second++) {
    room.pump(1000);
  }
  const nodes = room.save().state.nodes;
  assert.ok(nodes.filter((node) => node.owner === 1).length > 1);
  assert.ok(nodes.filter((node) => node.owner === 2).length > 1);
});

test("a room without players stops", () => {
  const { room } = seated();
  room.handle(0, { type: "time", paused: false, speed: null });
  room.leave(0);
  assert.equal(room.pump(5000), 0);
  assert.equal(room.occupied, false);
});

test("constants can be tuned only where tuning is enabled", () => {
  const locked = seated({ tuning: false });
  locked.room.handle(0, { type: "tune", constants: { buildRate: 2 } });
  assert.equal(locked.last("error").reason, "tuning is disabled");

  const { room, last } = seated();
  room.handle(0, { type: "tune", constants: { buildRate: 2 } });
  assert.equal(last("constants").constants.buildRate, 2);
  assert.equal(room.save().state.constants.buildRate, 2);

  room.handle(0, { type: "tune", constants: { matterReach: 1.5 } });
  assert.equal(last("error").reason, "constants are out of range");
  room.handle(0, { type: "tune", constants: { warpDrive: 1 } as never });
  assert.equal(last("error").reason, "constants are out of range");
});

test("a restored room continues exactly where the saved one stopped", () => {
  const original = seated();
  original.room.handle(0, { type: "time", paused: false, speed: 8 });
  original.room.pump(2000);
  const saved = JSON.parse(JSON.stringify(original.room.save()));

  const restored = Room.restore(saved, true, () => {});
  assert.ok(restored);
  assert.equal(restored.tick, original.room.tick);
  assert.deepEqual(restored.join(0, original.token), { seat: 0, token: original.token });

  for (let tick = 0; tick < 50; tick++) {
    original.room.advance();
    restored.advance();
  }
  assert.equal(JSON.stringify(restored.save().state), JSON.stringify(original.room.save().state));
});

test("a save from another format is not restored", () => {
  const { room } = seated();
  const saved = { ...room.save(), version: 99 };
  assert.equal(
    Room.restore(saved, true, () => {}),
    null,
  );
});
