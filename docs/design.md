# Game design

Barycenter is a space strategy sandbox with no victory condition. A civilization grows from the regions of one planet to its star system and on to neighboring stars. The number of decisions the player faces depends on the length of the frontier, not on the size of the territory.

## Principles

1. The player manages the frontier, and the rear runs itself.
2. Delegation has a price: whatever is released gains a will of its own.
3. There is one language: matter, force, loyalty and knowledge all move along the same edges.
4. Nothing happens suddenly: causes and intentions are visible in advance.
5. Orders are coarser than the world: the player commands one level, and the simulation works out the result on the level below.

## World

The world is nested. A star cluster holds systems, a system holds bodies, a body is divided into regions and a region into cells. Neighboring units of one level are joined by edges.

At every scale the player commands the units of one level and the simulation runs on the units inside them. Anything deeper is kept only as totals. The same rules apply at every scale. A scale differs only in its geometry and in one rule of its own.

| Scale        | The player commands | The simulation runs on | Own rule                                                         |
| ------------ | ------------------- | ---------------------- | ---------------------------------------------------------------- |
| Planet       | regions             | cells                  | geography: mountains and straits narrow the way, oceans close it |
| Star system  | bodies              | regions                | orbits: distances change over time and open approach windows     |
| Star cluster | systems             | bodies                 | lanes with chokepoints                                           |

In the rest of this document a node is a unit the player commands and a cell is a unit the simulation runs on.

- A cell is neutral or belongs to a power.
- A node can be shared. The cells one power owns in a node are its holding there, and the border between holdings runs inside the node.
- The number of cells in a node is not fixed. A wide plain has many, and a small island is a single cell.
- Two nodes share an edge where their cells touch. A power reaches a neighboring node only through the cells it owns on their common boundary, and the more of them it owns, the wider the way.

Nodes of the next scale are on the map from the start. A sufficiently developed node gains an edge to them, so resources can go to the moon while the planet is still contested.

## Time

- The game advances in ticks, and all orders resolve simultaneously.
- The player can pause and choose among several speeds.
- Orders are standing states that hold until changed. They can be given while time is paused and take effect at once.
- Time pauses automatically when a rival announces an attack on the player, when the player gains or loses a node, and when the player discovers a new node. Each trigger can be switched off.
- A game starts paused, and it pauses whenever no player is present.

## Resources

| Resource  | Behavior                                             | Source                                               | Use                                                                                         |
| --------- | ---------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Matter    | a stock: accumulates and moves slowly                | deposits such as mountains, asteroids and gas giants | building levels, edge capacity and force                                                    |
| Energy    | a capacity: cannot be stored and fades with distance | bright and hot nodes, orbits close to the star       | upkeep of levels and force                                                                  |
| Knowledge | a field: never spent, spreads to neighbors           | science nodes                                        | output multiplier; thresholds unlock abilities such as the spaceport and interstellar edges |
| Force     | a stock that needs energy upkeep                     | built from matter at shipyards                       | pressure, defense, holding nodes                                                            |

Matter sets the speed of growth and energy sets its ceiling. When energy falls short, holdings work at reduced output, force decays, and only power holdings keep growing.

Every owned cell yields a little matter and energy whatever the role of its holding.

## Nodes and cells

A cell has:

- natural data from world generation: matter richness, energy richness and a level cap;
- an owner;
- a level, raised by invested matter, with every level needing energy.

A holding has:

- a role, one of extraction, power, shipyard or science, chosen on settlement and costly to change: a change costs levels;
- a level, the sum of the levels of its cells;
- knowledge and cohesion.

Stocks of matter and force lie in cells, and the network moves them from cell to cell. The player sees them summed by holding.

## Orders

Every order names a node or an edge between nodes. No order names a cell: which cells receive matter, hold force or are attacked next is decided by the simulation.

| Target | Order                | Effect                                                                   |
| ------ | -------------------- | ------------------------------------------------------------------------ |
| Node   | development priority | one dial from "gives everything to the network" to "pulls toward itself" |
| Node   | role                 | what the holding produces                                                |
| Node   | garrison             | how much force stays in the holding                                      |
| Node   | pressure             | directs force at the foreign cells of the node                           |
| Edge   | expand               | raises capacity                                                          |
| Edge   | border               | closed, or trade: exchange of surpluses and spread of knowledge          |
| Edge   | gift                 | a flow into a foreign node, to aid an ally or to feed a rival's colony   |
| Power  | fold                 | hands a body over to self-rule                                           |
| Power  | release              | lets a node go peacefully                                                |

Development priority, role and garrison apply to the player's own holding in the node.

The dial sets how much of its building capacity a holding uses and how strongly it attracts matter. A holding that has enough for its own work stops attracting, so the strongest pull is served first and the rest goes on to weaker ones.

One expand order adds one step of capacity.

The player does not draw routes. Orders create demand, and the network carries matter and force to it. The player's concern is bottlenecks, which are edges of low capacity. Flows must always be visible on the map.

## Conflict

- There are no tactical battles.
- Force directed at a node becomes pressure along the whole line where the attacker's cells touch foreign cells of that node.
- A cell changes owner once pressure on it has exceeded its defense for long enough, so a border moves cell by cell and can come to rest inside a node.
- Pressure consumes force on both sides, the attacker's faster.
- Pressure is limited by the width of the line of contact. A strong holding has to be pressed on a wide front or through a widened edge.
- An attack on a holding is announced to everyone who sees it and takes effect only after a delay. This binds the player as much as the rivals.
- A neutral cell has a small defense of its own and is taken by the same pressure. Powers that enter a neutral node from different sides each keep the cells they take.
- A captured cell loses part of its level.

## Fog

The natural data of a node is revealed next to the player's territory and stays known afterwards. Owners, levels and force are visible only next to that territory. Farther away only outlines are known.

## Rivals

- Rivals follow the same rules and act through the same orders as the player.
- Each rival is driven by a doctrine: a few parameters such as aggression, preferred direction of expansion and what it retaliates against.
- A rival's next target is shown on the map in advance, as is the force it masses at the border.
- Stage 1 has three doctrines: aggressor, builder and opportunist.
- Rivals fight each other as well as the player.
- The powers of the home planet expand into space too, so rivals inside the home system are those powers and seceded colonies.
- Powers beyond the home system grow as a function of time until first contact and do not adapt to the player.

## Folding

- The player may hand all holdings on one body over to self-rule. From then on the player commands that body as a single node of the next scale.
- The body is not flattened. Its regions stay in the simulation, their cells are reduced to totals, and a governor gives the orders that the player gave before.
- Other powers on the body remain and can grow. The governor resists them with what the player leaves on the body, so a body drained for expansion can be lost from within and become the player's concern again.
- Folding is never reversed, and the player cannot take back direct command of a lower scale.
- Direct control is limited to about 10–12 nodes. Beyond the limit nodes secede more readily.

Much later the reverse may be added: a power whose holdings become too small for its scale is thrown back to the scale below.

## Cohesion

Every node except the capital has cohesion.

- It rises with foreign force at the node's borders, with its garrison and with its dependence on supplies from the rest of the power.
- It falls with how much the center extracts and with the node's weight relative to the capital.

Because energy fades with distance, a remote colony must power itself, which makes it self-sufficient and inclined to independence. A specialized colony that lives on imported energy stays.

A node with low cohesion announces secession in advance and then becomes a new power. The player may instead release it peacefully and gain an ally and trading partner. Such events are rare and large: one or two nodes are at risk at a time.

Since an outside threat holds a power together, eliminating the last enemy is unprofitable.

## Knowledge

Knowledge flows from a node with more to a neighbor with less, inside a power and across an open border alike, and faster when the gap and the trade volume are larger. A laggard can catch up this way but can overtake only through its own investment.

## Balance

Two brakes act on every power, rivals included: size breeds discord, and lag breeds catch-up. They make leadership more expensive, but leading must always remain better than lagging.

## Deliberately absent

Population, food, money, a technology tree, unit types, treaties, random events and characters.

## Roadmap

Stage 1 tested whether managing flows on one arena is interesting. It is built.

- One planet of about 20 regions with two rivals of different doctrines. Each region is a single unit with one owner.
- Matter, energy and force, with the roles extraction, power and shipyard.
- Orders: development priority, role, garrison, expand, pressure.
- Geography, fog, energy shortage, visible intentions and automatic pause.
- Tools: a live panel for tuning constants, seeded world generation, and a headless match between bots.

The first play session found the simple controls right and the game too flat. Ownership is all or nothing, so a contested neutral region goes whole to one power, a war shows nothing on the map until a region falls, and little resembles the growth of real states.

Stage 2 moves the simulation onto cells: regions of varying size, shared regions, borders that move inside them and flows computed from cell to cell, all under the orders of stage 1. It tests whether the game gains depth without the player gaining work. It is not started: further changes of similar weight are still being discussed, and the core should be reworked once.

Stage 3 adds knowledge, cohesion, borders and trade, gifts, the moon and folding with governors. It tests whether the game stays manageable as it grows.

## Open questions

- The prototype is stage 1 as built. It simulates whole regions, and nothing of the cell level exists yet. The findings below come from that prototype.
- The constants are preliminary. They were adjusted only until bots played sensibly, and real tuning needs play with the constants panel.
- In a series of 24 bot matches of 6000 ticks the aggressor ended with about half of all regions and led in most matches, and the builder was the weakest. Stage 1 gives an economic lead nothing to turn into.
- In about a fifth of those matches a single power was left. Nothing slows a leader until the brakes of stage 3 exist.
- The late game goes quiet: a developed region cannot be taken through one edge, and bots widen edges slowly.
- The client shows regions by number, lets values other than flows jump between ticks, and applies a change of role without asking.
- Not designed on the cell level: how the capacity of an edge and the expand order follow from the cells on a boundary, and whether pressure on a shared node can single out one of the powers in it.
- The governor is not designed, and its logic may be simple. It is also undecided how a body is simulated when only some of the powers on it have folded.
- Cohesion, knowledge, border and gift are stated for whole nodes and must be restated for holdings and for borders that run inside a node.
