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

## Decisions

1. **The core is a pure function.** It turns a state and a list of commands into the next state. State is plain data and randomness comes from a seed. Saves, replays, tests and headless bot matches follow from this.
2. **A player is a seat in a room.** A human takes it over a socket, a bot takes it inside the process. Both send the same commands, and the core validates every one.
3. **The server computes each player's view.** Fog and the private data of other players are cut out before anything is sent.
4. **Time is server state.** Pause and speed are commands, not client settings.
5. **Static data is separate from dynamic data.** The map is sent once on joining. After that the player's full view of the arena is sent every tick, so reconnecting needs only one snapshot.
6. **The core has no notion of a planet.** It knows nodes, edges, owners and a link to a parent node. Geometry belongs to the client.
7. **The client decides nothing.** It draws and interpolates between snapshots. The motion of flows is cosmetic and derived from numbers the server sends.

Because orders are standing states and ticks are slow, the game needs neither client-side prediction nor lockstep synchronization.

## Deferred

A database, accounts, a delta or binary protocol, a thread per room and an interface framework. Each can be added later without changing the core.

## Build order

1. The core and a headless match between bots.
2. The server and the protocol.
3. The client with a globe.
