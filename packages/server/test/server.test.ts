import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { type ClientMessage, PROTOCOL, type ServerMessage } from "@barycenter/protocol";
import { type RunningServer, type ServerOptions, startServer } from "../src/index.ts";

type Typed<Type extends ServerMessage["type"]> = Extract<ServerMessage, { type: Type }>;

const WAIT = 5000;

const base: ServerOptions = {
  port: 0,
  host: "127.0.0.1",
  tuning: false,
  saves: null,
  client: null,
  tickRate: 100,
  seed: 1,
};

interface Client {
  send(message: ClientMessage | string): void;
  next<Type extends ServerMessage["type"]>(type: Type): Promise<Typed<Type>>;
  closed: Promise<number>;
  close(): void;
}

function connect(server: RunningServer): Promise<Client> {
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}`);
  const inbox: ServerMessage[] = [];
  const waiting: { type: string; resolve: (message: ServerMessage) => void }[] = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as ServerMessage;
    const index = waiting.findIndex((waiter) => waiter.type === message.type);
    if (index >= 0) {
      waiting.splice(index, 1)[0].resolve(message);
    } else {
      inbox.push(message);
    }
  });
  const closed = new Promise<number>((resolve) => {
    socket.addEventListener("close", (event) => resolve(event.code));
  });
  const client: Client = {
    send(message) {
      socket.send(typeof message === "string" ? message : JSON.stringify(message));
    },
    next(type) {
      const index = inbox.findIndex((message) => message.type === type);
      if (index >= 0) {
        return Promise.resolve(inbox.splice(index, 1)[0] as Typed<typeof type>);
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no ${type} message arrived`)), WAIT);
        waiting.push({
          type,
          resolve: (message) => {
            clearTimeout(timer);
            resolve(message as Typed<typeof type>);
          },
        });
      });
    },
    closed,
    close: () => socket.close(),
  };
  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve(client));
    socket.addEventListener("error", () => reject(new Error("could not connect")));
  });
}

function joining(room: string, seat: number | null = null, token: string | null = null) {
  return { type: "join", protocol: PROTOCOL, room, seat, token, setup: null } as const;
}

async function viewAt(client: Client, tick: number) {
  for (;;) {
    const message = await client.next("view");
    if (message.view.tick >= tick) {
      return message;
    }
  }
}

test("a client joins, runs time and receives one view per tick", async () => {
  const server = await startServer(base);
  try {
    const client = await connect(server);
    client.send(joining("alpha"));
    const welcome = await client.next("welcome");
    assert.equal(welcome.seat, 0);
    assert.equal(welcome.view.tick, 0);
    assert.equal(welcome.time.paused, true);
    const { system } = welcome.outline;
    assert.ok(system.bodies[system.home].physics.ice > 0);
    const fine = (part: number) => Math.abs(part * 1e4 - Math.round(part * 1e4)) > 1e-6;
    assert.ok(system.bodies[system.home].physics.gases.some(fine));
    assert.ok(system.bodies[0].physics.mass > 1e29);

    client.send({ type: "time", paused: false, speed: 1 });
    const first = await client.next("view");
    const second = await client.next("view");
    assert.equal(second.view.tick, first.view.tick + 1);
    client.close();
  } finally {
    await server.close();
  }
});

test("the force report comes over the socket when a client asks for it", async () => {
  const server = await startServer(base);
  try {
    const client = await connect(server);
    client.send(joining("report"));
    const welcome = await client.next("welcome");
    const home = welcome.view.regions.findIndex((region) => region.estate !== null);

    client.send({ type: "orders", orders: [] });
    assert.equal((await client.next("view")).force, null);
    client.send({ type: "report", watch: { subject: "force" } });
    const report = (await client.next("view")).force;
    assert.ok(report);
    assert.ok(report.musters[home]);
    assert.deepEqual(report.battles, []);
    client.close();
  } finally {
    await server.close();
  }
});

test("orders sent over the socket reach the game", async () => {
  const server = await startServer(base);
  try {
    const client = await connect(server);
    client.send(joining("beta"));
    const welcome = await client.next("welcome");
    const home = welcome.view.regions.findIndex((region) => region.estate !== null);

    client.send({ type: "orders", orders: [{ kind: "garrison", region: home, value: 3.5 }] });
    const updated = await client.next("view");
    assert.equal(updated.view.regions[home].estate?.garrison, 3.5);

    client.send({
      type: "orders",
      orders: [
        { kind: "garrison", region: home, value: null },
        { kind: "army", value: 30 },
        { kind: "forward", value: 0.8 },
        { kind: "reinforce", region: home, value: 2 },
      ],
    });
    const placed = await client.next("view");
    assert.equal(placed.view.army, 30);
    assert.equal(placed.view.forward, 0.8);
    assert.equal(placed.view.regions[home].estate?.garrison, null);
    assert.equal(placed.view.regions[home].estate?.reinforcement, 2);

    const foreign = welcome.view.regions.findIndex((region) => region.estate === null);
    client.send({ type: "orders", orders: [{ kind: "garrison", region: foreign, value: 1 }] });
    assert.equal((await client.next("rejected")).rejections.length, 1);
    client.close();
  } finally {
    await server.close();
  }
});

test("the server refuses malformed messages and commands before joining", async () => {
  const server = await startServer(base);
  try {
    const client = await connect(server);
    client.send("{ not json");
    assert.equal((await client.next("error")).reason, "malformed message");
    client.send({ type: "time", paused: false, speed: null });
    assert.equal((await client.next("error")).reason, "join a room first");
    client.send({ ...joining("gamma"), protocol: 99 });
    assert.equal((await client.next("error")).reason, "unsupported protocol version");
    client.send({ ...joining("gamma"), setup: { seed: 1, rivals: ["pacifist"] } });
    assert.equal((await client.next("error")).reason, "unknown doctrine pacifist");
    client.close();
  } finally {
    await server.close();
  }
});

test("a seat is protected by its token and a reconnect replaces the old socket", async () => {
  const server = await startServer(base);
  try {
    const owner = await connect(server);
    owner.send(joining("delta"));
    const welcome = await owner.next("welcome");

    const intruder = await connect(server);
    intruder.send(joining("delta", 0));
    assert.equal((await intruder.next("error")).reason, "seat is taken");
    intruder.close();

    const returning = await connect(server);
    returning.send(joining("delta", 0, welcome.token));
    assert.equal((await returning.next("welcome")).token, welcome.token);
    assert.equal(await owner.closed, 4000);
    returning.close();
  } finally {
    await server.close();
  }
});

test("each room is a separate game", async () => {
  const server = await startServer(base);
  try {
    const first = await connect(server);
    const second = await connect(server);
    first.send(joining("one"));
    second.send(joining("two"));
    await first.next("welcome");
    await second.next("welcome");

    first.send({ type: "time", paused: false, speed: 1 });
    await viewAt(first, 5);
    second.send({ type: "orders", orders: [] });
    assert.equal((await second.next("view")).view.tick, 0);
    first.close();
    second.close();
  } finally {
    await server.close();
  }
});

test("a game survives a server restart", async () => {
  const folder = await mkdtemp(join(tmpdir(), "barycenter-saves-"));
  try {
    const before = await startServer({ ...base, saves: folder });
    const client = await connect(before);
    client.send(joining("epsilon"));
    const welcome = await client.next("welcome");
    client.send({
      type: "triggers",
      triggers: { announced: false, territory: false, discovered: false },
    });
    client.send({ type: "time", paused: false, speed: 1 });
    await viewAt(client, 20);
    await before.close();

    const saved = JSON.parse(await readFile(join(folder, "epsilon.json"), "utf8"));
    assert.ok(saved.state.tick >= 20);

    const after = await startServer({ ...base, saves: folder });
    try {
      const stranger = await connect(after);
      stranger.send(joining("epsilon"));
      assert.equal((await stranger.next("error")).reason, "no open seat");
      stranger.close();

      const returning = await connect(after);
      returning.send(joining("epsilon", 0, welcome.token));
      const resumed = await returning.next("welcome");
      assert.equal(resumed.view.tick, saved.state.tick);
      assert.equal(resumed.time.paused, true);
      returning.close();
    } finally {
      await after.close();
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("a save from another format is set aside and a fresh game starts", async () => {
  const folder = await mkdtemp(join(tmpdir(), "barycenter-saves-"));
  try {
    await writeFile(join(folder, "eta.json"), JSON.stringify({ version: 1, state: { tick: 9 } }));
    const server = await startServer({ ...base, saves: folder });
    try {
      const client = await connect(server);
      client.send(joining("eta"));
      assert.equal((await client.next("welcome")).view.tick, 0);
      client.close();
    } finally {
      await server.close();
    }
    const kept = JSON.parse(await readFile(join(folder, "eta.unsupported.json"), "utf8"));
    assert.equal(kept.state.tick, 9);
    const saved = JSON.parse(await readFile(join(folder, "eta.json"), "utf8"));
    assert.equal(saved.version, 10);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("a snapshot of a running game is written beside the saves", async () => {
  const folder = await mkdtemp(join(tmpdir(), "barycenter-saves-"));
  try {
    const server = await startServer({ ...base, saves: folder });
    try {
      const client = await connect(server);
      client.send(joining("theta"));
      await client.next("welcome");
      client.send({
        type: "triggers",
        triggers: { announced: false, territory: false, discovered: false },
      });
      client.send({ type: "time", paused: false, speed: 1 });
      await viewAt(client, 5);
      client.send({ type: "snapshot", selected: 2 });
      const { name } = await client.next("snapshot");

      const path = join(folder, "snapshots", `${name}.json`);
      const written = JSON.parse(await readFile(path, "utf8"));
      assert.ok(written.state.tick >= 5);
      assert.equal(name, `theta-${written.state.tick}`);
      assert.equal(written.options.id, name);
      assert.equal(written.seat, 0);
      assert.equal(written.selected, 2);
      assert.equal(written.time.paused, false);
      assert.deepEqual(written.tokens, [null, null, null]);
      client.close();
    } finally {
      await server.close();
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("a server without saves takes no snapshots", async () => {
  const server = await startServer(base);
  try {
    const client = await connect(server);
    client.send(joining("iota"));
    await client.next("welcome");
    client.send({ type: "snapshot", selected: null });
    assert.equal((await client.next("error")).reason, "snapshots are disabled");
    client.close();
  } finally {
    await server.close();
  }
});

test("the server hands out the built client and nothing outside it", async () => {
  const folder = await mkdtemp(join(tmpdir(), "barycenter-client-"));
  try {
    const site = join(folder, "site");
    await mkdir(join(site, "assets"), { recursive: true });
    await writeFile(join(site, "index.html"), "<p>globe</p>");
    await writeFile(join(site, "assets", "app.js"), "export {};");
    await writeFile(join(folder, "secret.txt"), "hidden");

    const server = await startServer({ ...base, client: site });
    try {
      const origin = `http://127.0.0.1:${server.port}`;
      const page = await fetch(`${origin}/`);
      assert.equal(page.headers.get("content-type"), "text/html; charset=utf-8");
      assert.equal(await page.text(), "<p>globe</p>");
      assert.equal(page.headers.get("content-encoding"), "gzip");
      assert.equal(page.headers.get("cache-control"), "no-cache");
      const script = await fetch(`${origin}/assets/app.js`);
      assert.equal(script.headers.get("content-type"), "text/javascript; charset=utf-8");
      assert.equal(script.headers.get("cache-control"), "public, max-age=31536000, immutable");
      assert.equal(await script.text(), "export {};");
      const plain = await fetch(`${origin}/`, { headers: { "accept-encoding": "identity" } });
      assert.equal(plain.headers.get("content-encoding"), null);
      assert.equal(await plain.text(), "<p>globe</p>");
      assert.equal((await fetch(`${origin}/room/home`)).status, 200);
      assert.equal((await fetch(`${origin}/assets/missing.js`)).status, 404);
      assert.equal((await fetch(`${origin}/..%2fsecret.txt`)).status, 403);
      assert.equal((await fetch(`${origin}/`, { method: "POST" })).status, 405);

      const client = await connect(server);
      client.send(joining("zeta"));
      assert.equal((await client.next("welcome")).seat, 0);
      client.close();
    } finally {
      await server.close();
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
