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
6. **The rules know no geometry.** They see cells and the joints between neighboring cells, regions that group cells, edges that group the joints between two regions, and owners. Positions and bodies are made with the map, and only map generation and the client read them.
7. **Rules run on cells and orders name regions.** Only the aim of a pressure names a cell. A view therefore has two layers: a summary per region, from which bots decide and panels are drawn, and compact lists per cell and per flow, from which the globe is drawn.
8. **The client decides nothing.** It draws the latest view. The motion of flows between ticks is cosmetic and derived from numbers the server sends, and smoothing of other values can be added without touching the server.
9. **A body is a description, and look and rules meet only there.** A body is its kind, a seed, a radius, an orbit, a spin and five numbers of relief. The relief is a function of a point on the body. Map generation samples it where cells stand and the client draws it for every pixel, so neither depends on how the other works: cells can be cut another way without changing the look of a body, and the look can change without touching a rule.

Because orders are standing states and ticks are slow, the game needs neither client-side prediction nor lockstep synchronization.

## Protocol

Messages are JSON over one WebSocket. A client first joins a room. A room that does not exist yet is created, from its save if there is one.

| From client | Meaning                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------ |
| `join`      | take a seat in a room; a setup with a seed and rival doctrines applies only when the room is new |
| `orders`    | orders for the seat's own power; the server stamps the seat on them                              |
| `time`      | pause, resume or change speed                                                                    |
| `triggers`  | which events pause time for this seat                                                            |
| `report`    | which report to send with this seat's views, the force report or the economy report, or none     |
| `snapshot`  | write the whole room to a file on the server, for debugging                                      |
| `tune`      | change constants, where the server allows it                                                     |

| From server | Meaning                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------ |
| `welcome`   | seat, seat token, map outline, constants, room status and the first view                         |
| `view`      | the seat's view and the events it can see; sent after every tick and after every batch of orders |
| `room`      | time and seats, sent when either changes                                                         |
| `constants` | the constants after tuning                                                                       |
| `rejected`  | orders the core refused, with reasons                                                            |
| `snapshot`  | the name of the snapshot that was written                                                        |
| `error`     | a message the server could not act on                                                            |

- A `view` also goes out at once when a seat asks for a report, and every view carries that report until the seat asks for the other one or for none. A request for the economy report may name one region, and the report then lists the cells the seat holds there.
- For every pressure a view gives the force committed and its breaches: the contacts that carry force into a cell whose siege has begun, each with the progress of that siege. The force is worked out for the coming tick with the function the tick uses, so the map and the force report agree. Breaches that start in a region the seat cannot see are left out.
- The first join of a seat returns a secret token. Rejoining that seat requires the token, and the newer connection replaces the older one.
- Everything a client sends is parsed field by field, and unknown fields are dropped. The core then checks ownership and ranges.
- Messages are compressed by the WebSocket extension. A view of the first planet is 11 to 23 KB of JSON and 1 to 6 KB on the wire. The map sent on joining is 58 KB and 13 KB on the wire, of which the star system is 2 KB and under 1 KB. No image of a body is ever sent.

## Server

- The server listens on the local machine unless a host is given. It has no accounts yet, so a seat token is the only protection.
- A room is saved when its last player leaves, every thousand ticks while it runs, and on shutdown. A save holds the whole state, so a restored room continues identically.
- A save written by another version of the format is set aside under another name, and a fresh game starts in its place.
- A snapshot is a debugging aid that keeps the moment a question came up. On request the server writes the room as it stands to `snapshots/<room>-<tick>.json` inside the saves folder and answers with that name. The file is a save without seat tokens, plus the seat that asked, the region it had selected and the state of the clock. It holds everything, with no fog. Copied into a saves folder, it opens as a room of its own.
- Live tuning is off unless the server is started with the tuning flag.
- The server also hands out the built client, so one process and one address are enough to play. Text files are sent gzipped, 155 KB instead of 611 KB for the script, and files with a hash in their name are cached for good.

## Client

- A body is drawn from its description alone. On joining, the client works out the relief of every body once on the graphics card and keeps it as a cube map of heights and slopes: 512 texels a side for the home body, 256 on a handheld, and 128 or 64 for another body until it is visited. A pixel of a body then costs two reads of that map, three on a gas giant, and four on the home body from orbit, where clouds are added.
- The relief exists twice, in the core in TypeScript and in the client in GLSL, built on an integer hash that both compute alike. Measured on every face of the cube for every body, the two agreed within 0.0003 of a height.
- The home body has two looks, and the distance of the camera blends one into the other. Near it the client shows a chart: colors by height and a hillshade lit from the north-west, with no night side. From farther away the star lights it, with day and night, clouds drifting over it and an atmosphere at its limb. The other kinds of body, barren, desert, ice and gas, and the star have a look each and no chart.
- The state of cells lies over the chart as a veil: one mesh with a color and an opacity per cell. An owned cell takes the owner's color, brighter as it is built up and slightly transparent, with the hillshade kept, so the relief shows through. Unexplored land is veiled dark, and explored land out of sight is dimmed. The veil reads the cube map of the body, so it covers land only and ends at the coast. A cell whose flag is falling keeps its veil only around its middle, a smaller patch the lower the flag. A view carries the flag of every cell the seat can see.
- A cell on screen is the land nearest to its point, as far as a reach of about two cell widths. Cell shapes are the Voronoi cells of the land points, which the client builds from those points alone. A line between two cells is drawn only where it runs on dry ground. The client finds that with the relief function of the core, sampled along the side as map generation samples it, so a line stands exactly where the map has a land joint.
- Dark lines separate regions and bright lines separate holdings. A coast needs no line, so a selected region is also shown lighter. The line where a power presses is drawn in its color, dashed while the attack is only announced. White teeth along that line mark the contacts where a siege is under way. They point into the besieged cell and reach deeper as the siege nears its end. Where force presses a cell that holds, the line stays smooth and only the force on its label tells of it. Across a strait the line is an arc from the attacker's cell to the far shore, ending in a short bar on which the teeth stand.
- The scene is the whole star system: the star, the bodies on their orbits and a sky of stars. The camera always circles the origin and the world is moved around it. Near a body the frame is fixed to that body and turns with it, and farther out it blends into a frame fixed to the star, so one zoom leads from a cell to the whole system. A click on a body or on its name flies to it. The veil, the lines and the labels of the chart fade as the camera leaves the home body.
- The place and the spin of a body come from the tick through functions of the core. Between ticks the client moves them on by the time since the last view.
- Clouds and the bands of a gas giant move with the tick as well. Clouds are two layers read from the cube map of the body that slide along the latitudes in opposite directions at different speeds, so their shapes change as they pass each other. A gas giant has a flow: jets that run east and west by turns, eddies that circle the highs and lows of a coarse level of its cube map, taken from the slopes stored there, and four storms that turn around their own middles and drift slowly round the body. A pixel reads the map at two places carried back along that flow, half a cycle apart, and fades from one to the other, so the bands seem to stream and curl without anything being carried forward from frame to frame. Nothing is stored or sent, any tick can be drawn at once, and a paused game stays still.
- The star is drawn hot and not lit. Its surface is two layers of its cube map that turn about different axes: where the two are equal a net of darker lanes forms and shifts as they pass. Spots come from a coarse, slowly turning level of the same map, inside a belt on either side of the equator. They swell and fade in turn around the star, one of the moving layers frays their edges, the net of lanes bends toward them, and brighter ground rings them. The corona is one square that always faces the camera. For a pixel of that square the map is read where the line from the middle of the star meets its limb, so its faint streamers turn with the star and its flames stand only over the spots that are at the edge. A pixel of the star or of its corona costs three reads. A star has one of four colors by its seed, from white to red, and that color tints the light on every body.
- Flows are particles moving between the centers of neighboring cells. A particle stands for a fixed portion of cargo, so their number on a joint shows the volume. A strait is a dashed arc over the water.
- A garrison is a white square on its cell, and the top bar shows the force of the player against the room in all their garrisons.
- The panel holds the orders for the whole power, the army with its forward dial and the leaning, next to those for the selected region. A view carries, for each holding of the seat, the room the simulation is building toward, so the panel shows it whether the army placed it or the player fixed it. The garrison field of a region is empty while the army places its room.
- Roads are sand-colored lines between the centers of neighboring cells, wider with every grade. A view carries the grade of every joint the seat can see. A strait shows its road by the width of its arc.
- Labels and panels are plain HTML over the canvas. A panel is rebuilt only when its structure changes; between rebuilds only its numbers are updated.
- A region's label stands on the center cell of the region. Where the player holds cells in the region it stands on one of them instead: the cell nearest the middle of the largest connected group of the player's cells. A pressure label that would cover the label of its region is moved just above or below it.
- The force total in the top bar opens a report meant for debugging. One table lists the player's regions with the force resting in the garrison, standing at a front and on the move, the orders that ask for it and the region the moving force is heading to. The other lists, for every line of pressure the player takes part in, each pressed cell with its defense, the attacker's force facing it, the pressure on it and the most its contacts can carry, the progress of the siege and whether the cell can fall. The server works both out with the functions the tick uses, only for a seat that has the report open: the client asks when the dialog opens and tells the server to stop when it closes. An open report adds about 3 KB of JSON to each view of that seat.
- The matter total in the top bar opens the economy report, also meant for debugging. Three tables give one tick of the whole power: matter made and what it was built into, energy made, needed and met, force built and lost, each with what was lost on the way and with fallen flags. A table of branches shows the levels built, the share the cells would build now and what each branch makes. A table of regions shows for each the matter and energy made and used, what it builds, what building waits for matter, and what it sends to and gets from other regions. Picking a region lists its cells in the same way, with the progress of the next level. A region or a cell whose flag is falling says how many ticks are left, and the panel of a region says the same.
- The tick can keep a ledger: what every cell made, spent, needed and lost, and every hop of matter, energy and force. For the economy report the server runs the coming tick on a copy of the state with a ledger and sums it by cell, region and power, so the report shows the effect of an order at once, also while time is paused. A normal tick keeps no ledger. A report costs about as much as a tick. It adds 9 to 12 KB of JSON to a view, and about 0.9 KB more for every cell of the region picked.
- The `Snapshot` button in the top bar asks the server for a snapshot and shows the name it was given.
- The scene is drawn on demand: after a new view, a camera move or a resize, and continuously only while time runs and something on screen moves, flows on the chart or bodies seen from orbit. A paused game with a still camera draws nothing.
- On the chart a frame is about 32 draw calls and 65,000 triangles. The cube maps take about 17 MB for the home body and 1 MB for every other body on a desktop, 4 MB and 0.3 MB on a handheld, and a visited body takes as much as the home body while it is in focus. Where the graphics card cannot draw into float textures the maps fall back to 8 bits a channel. The speed of the shaders on a real phone has not been measured: the development machine draws in software, where a frame takes seven times longer than before bodies had a look.
- One page serves desktop and handheld. On a narrow upright screen the panel becomes a sheet under the globe that opens on selecting a region, and on any small screen the top bar keeps time controls and totals and moves the rest into a menu. Targets grow where the pointer is coarse.
- The `Aim` button of an attack makes the next tap on the globe pick a cell instead of a region. The aim is marked with a cross in the attacker's color.
- Dragging turns the globe at the speed of the surface under the pointer at any zoom. A tap selects only when a single pointer went down and came up in place, so a pinch never changes the selection.
- On a handheld the client pauses the game when the page is hidden and caps the motion of flows at 30 frames a second. On returning after half a minute or more it opens a fresh connection before dropping the old one, because a suspended page can keep a dead socket that still looks open.
- The seat token is kept in the browser's local storage, so reloading the page returns to the same seat.
- In development the client runs on Vite at port 5183 and connects through its proxy to the game server on port 8787. Vite listens on 0.0.0.0 and proxies WebSocket connections on `/socket` to the game server, which stays on localhost.

## Cell level

- A map is made from 400 points on the sphere. The 248 where the relief of the home body is highest become land cells, and the highest 45 of those are mountains. The sea level and the mountain level found this way are written into the description of the body. Cells are joined into regions by growing them outward from seeds at uneven speeds, with mountains slowing the growth so that ranges tend to become borders.
- Neighbors come from the hull of the land points, built point by point: 6 ms for 400 points and 15 ms for 800. Testing every triple of points took 46 s for 680. Two neighbors are joined by land when the side their Voronoi cells share has a dry point within reach of them, sampled every hundredth of a radian. The shortest of the other pairs become straits until all land is connected. Making a world takes about 20 ms.
- With 250 cells a tick takes 1.0 ms and the three bots another 0.2 ms. At the top speed of 16 ticks a second this is about 2% of one processor core. A save is about 250 KB.
- Almost half of a tick goes into finding the way that loses least: once for matter, twice for force, once for every round of energy and once for every road order.
- A series of 12 bot matches of 6000 ticks takes about 90 s on one thread. The match runner accepts changed constants, so a tuning idea can be tried on a whole series.
- A full view every tick stays affordable, but the compact or delta encoding listed under Deferred comes closer as maps grow.

Deposits and stocks are stored by kind from the start, with a single kind until matter is split in stage 4. Once kinds multiply, only the dear ones should be carried from cell to cell and the rest counted as totals per power: by estimate, thirty kinds carried in full would make a tick about ten times slower.

## Deferred

A database, accounts, spectators, more than one human seat per room, a delta or binary protocol, a thread per room and an interface framework. Each can be added later without changing the core.
