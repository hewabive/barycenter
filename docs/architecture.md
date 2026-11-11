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
6. **The core has no notion of a planet.** It knows cells and the joints between neighboring cells, regions that group cells, edges that group the joints between two regions, and owners. Positions are generated with the map but only the client uses them.
7. **Rules run on cells and orders name regions.** A view therefore has two layers: a summary per region, from which bots decide and panels are drawn, and compact lists per cell and per flow, from which the globe is drawn.
8. **The client decides nothing.** It draws the latest view. The motion of flows between ticks is cosmetic and derived from numbers the server sends, and smoothing of other values can be added without touching the server.

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
- Messages are compressed by the WebSocket extension. A view of the first planet is 12 to 18 KB of JSON and 2 to 4 KB on the wire. The map sent on joining is 45 KB and 9 KB on the wire.

## Server

- The server listens on the local machine unless a host is given. It has no accounts yet, so a seat token is the only protection.
- A room is saved when its last player leaves, every thousand ticks while it runs, and on shutdown. A save holds the whole state, so a restored room continues identically.
- A save written by another version of the format is set aside under another name, and a fresh game starts in its place.
- Live tuning is off unless the server is started with the tuning flag.
- The server also hands out the built client, so one process and one address are enough to play.

## Client

- Cell shapes are the Voronoi cells of the same points the core used to generate the map, so the globe needs no geometry from the server beyond those points.
- The surface is one mesh with a color per cell: the owner's color, brighter as the cell is built up. Dark lines separate regions and bright lines separate holdings. The line where a power presses is drawn in its color, dashed while the attack is only announced.
- Flows are particles moving between the centers of neighboring cells. A strait is a dashed arc over the water.
- Labels and panels are plain HTML over the canvas. A panel is rebuilt only when its structure changes; between rebuilds only its numbers are updated.
- The seat token is kept in the browser's local storage, so reloading the page returns to the same seat.
- In development the client runs on Vite at port 5183 and connects through its proxy to the game server on port 8787. Vite listens on 0.0.0.0 and proxies WebSocket connections on `/socket` to the game server, which stays on localhost.

## Cell level

- A map is made from 400 points on the sphere: about 250 land cells, joined into regions by growing them outward from seeds at uneven speeds, with mountains slowing the growth so that ranges tend to become borders.
- Neighbors come from the hull of the points, built point by point: 6 ms for 400 points and 15 ms for 800. Testing every triple of points took 46 s for 680.
- With 250 cells a tick takes 0.8 ms and the three bots another 0.1 ms. At the top speed of 16 ticks a second this is under 2% of one processor core. A save is about 215 KB.
- A series of 12 bot matches of 6000 ticks takes about 50 s on one thread. The match runner accepts changed constants, so a tuning idea can be tried on a whole series.
- A full view every tick stays affordable, but the compact or delta encoding listed under Deferred comes closer as maps grow.

Deposits and stocks are stored by kind from the start, with a single kind until matter is split in stage 4. Once kinds multiply, only the dear ones should be carried from cell to cell and the rest counted as totals per power: by estimate, thirty kinds carried in full would make a tick about ten times slower.

## Deferred

A database, accounts, spectators, more than one human seat per room, a delta or binary protocol, a thread per room and an interface framework. Each can be added later without changing the core.
