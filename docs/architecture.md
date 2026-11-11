# Architecture

All game logic runs on the server. The browser draws the state and sends orders. This keeps multiplayer over the internet possible without rework.

## Stack

| Layer           | Choice                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------- |
| Language        | TypeScript everywhere, so server and client share the types of state and protocol              |
| Workspace       | pnpm workspaces                                                                                |
| Simulation core | a package with no dependencies that runs in Node, in tests and, if ever needed, in the browser |
| Server          | Node.js with `ws`                                                                              |
| Client          | Vite and Three.js, with the interface in plain HTML                                            |
| Saves           | a JSON snapshot of the state                                                                   |

## Packages

| Package             | Contents                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `packages/sim`      | the core: world generation, the tick, the per-player view; imports nothing from Node or the browser |
| `packages/bots`     | doctrines, the decision function that turns a view into commands, and the headless match runner     |
| `packages/protocol` | the messages between client and server, and the parser for what a client sends                      |
| `packages/server`   | rooms, seats, the clock, saves and the WebSocket endpoint                                           |
| `packages/client`   | the browser client: the globe, the panels and the connection                                        |

Tunable numbers live in one constants object inside the state, so they can be changed at run time and are saved with the game.

## Decisions

1. **The core is a pure function.** It turns a state and a list of commands into the next state. State is plain data and randomness comes from a seed. Saves, replays, tests and headless bot matches follow from this.
2. **A player is a seat in a room.** A human takes it over a socket, a bot takes it inside the process. Both send the same commands, and the core validates every one.
3. **The server computes each player's view.** Fog and the private data of other players are cut out before anything is sent.
4. **Time is server state.** Pause and speed are commands, not client settings.
5. **Static data is separate from dynamic data.** The map is sent once on joining. After that the player's full view of the arena is sent every tick, so reconnecting needs only one snapshot.
6. **The core has no notion of a planet.** It knows nodes, edges and owners. Positions are generated with the map but only the client uses them. A link from a unit to the one that contains it arrives with cells in stage 2.
7. **The client decides nothing.** It draws the latest view. The motion of flows between ticks is cosmetic and derived from numbers the server sends, and smoothing of other values can be added without touching the server.

Because orders are standing states and ticks are slow, the game needs neither client-side prediction nor lockstep synchronization.

## Protocol

Messages are JSON over one WebSocket. A client first joins a room. A room that does not exist yet is created, from its save if there is one.

| From client | Meaning                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------ |
| `join`      | take a seat in a room; a setup with a seed and rival doctrines applies only when the room is new |
| `orders`    | orders for the seat's own power; the server stamps the seat on them                              |
| `time`      | pause, resume or change speed                                                                    |
| `triggers`  | which events pause time for this seat                                                            |
| `tune`      | change constants, where the server allows it                                                     |

| From server | Meaning                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------ |
| `welcome`   | seat, seat token, map outline, constants, room status and the first view                         |
| `view`      | the seat's view and the events it can see; sent after every tick and after every batch of orders |
| `room`      | time and seats, sent when either changes                                                         |
| `constants` | the constants after tuning                                                                       |
| `rejected`  | orders the core refused, with reasons                                                            |
| `error`     | a message the server could not act on                                                            |

- The first join of a seat returns a secret token. Rejoining that seat requires the token, and the newer connection replaces the older one.
- Everything a client sends is parsed field by field, and unknown fields are dropped. The core then checks ownership and ranges.
- Messages are compressed by the WebSocket extension. A view of the first planet is about 7 KB of JSON and well under 1 KB on the wire.

## Server

- The server listens on the local machine unless a host is given. It has no accounts yet, so a seat token is the only protection.
- A room is saved when its last player leaves, every thousand ticks while it runs, and on shutdown. A save holds the whole state, so a restored room continues identically.
- Live tuning is off unless the server is started with the tuning flag.
- The server also hands out the built client, so one process and one address are enough to play.

## Client

- Region shapes are the Voronoi cells of the same points the core used to generate the map, so the globe needs no geometry from the server beyond those points.
- The surface is one mesh with a color per region. Edges are lines whose width follows capacity. Flows are particles moving along the edges, and attacks are raised arcs: dashed while announced, solid once active.
- Labels and panels are plain HTML over the canvas. A panel is rebuilt only when its structure changes; between rebuilds only its numbers are updated.
- The seat token is kept in the browser's local storage, so reloading the page returns to the same seat.
- In development the client runs on Vite at port 5183 and connects through its proxy to the game server on port 8787. Vite listens on 0.0.0.0 and proxies WebSocket connections on `/socket` to the game server, which stays on localhost.

## Cell level

Planned for stage 2 and not built. The core will run its rules on cells, each linked to the region that contains it. Orders, the view the bots decide from and the panels stay per region, and cells reach the client as a compact layer for drawing.

To estimate the cost, today's rules were run with three bots for 3000 ticks on finer maps:

| Land cells   | Tick    | View, compressed | Save   | World generation |
| ------------ | ------- | ---------------- | ------ | ---------------- |
| 21, as today | 0.05 ms | 1.5 KB           | 18 KB  | 7 ms             |
| 211          | 0.7 ms  | 10 KB            | 194 KB | 3 s              |
| 422          | 1.7 ms  | 14 KB            | 401 KB | 46 s             |

- Tick time is no obstacle. At the top speed of 16 ticks a second, 422 cells take about 3% of one processor core.
- World generation is the obstacle. Neighbors are found by testing every triple of points, in the core and again in the client, and this search must be replaced before the map grows.
- A full view every tick stays affordable, but the compact or delta encoding listed under Deferred comes closer.
- A series of 24 bot matches grows from seconds to minutes on one thread.

Deposits and stocks are stored by kind from the start, with a single kind until matter is split in stage 4. Once kinds multiply, only the dear ones should be carried from cell to cell and the rest counted as totals per power: by estimate, thirty kinds carried in full would make a tick about ten times slower.

## Deferred

A database, accounts, spectators, more than one human seat per room, a delta or binary protocol, a thread per room and an interface framework. Each can be added later without changing the core.
