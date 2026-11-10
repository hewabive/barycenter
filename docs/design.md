# Game design

Barycenter is a space strategy sandbox with no victory condition. A civilization grows from the regions of one planet to its star system and on to neighboring stars. The number of decisions the player faces depends on the length of the frontier, not on the size of the territory.

## Principles

1. The player manages the frontier, and the rear runs itself.
2. Delegation has a price: whatever is released gains a will of its own.
3. There is one language: matter, force, loyalty and knowledge all move along the same edges.
4. Nothing happens suddenly: causes and intentions are visible in advance.

## World

The world is a graph of nodes joined by edges. A node is neutral or belongs to a power. The same rules apply at every scale. A scale differs only in its geometry and in one rule of its own.

| Scale        | Geometry                          | Own rule                                                              |
| ------------ | --------------------------------- | --------------------------------------------------------------------- |
| Planet       | dense grid of regions on a sphere | geography: mountains and straits narrow the edges, oceans remove them |
| Star system  | a few worlds and moons            | orbits: distances change over time and open approach windows          |
| Star cluster | sparse network of stars           | lanes with chokepoints                                                |

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
| Matter    | a stock: accumulates and moves slowly                | deposits such as mountains, asteroids and gas giants | building node levels, edge capacity and force                                               |
| Energy    | a capacity: cannot be stored and fades with distance | bright and hot nodes, orbits close to the star       | upkeep of node levels and force                                                             |
| Knowledge | a field: never spent, spreads to neighbors           | science nodes                                        | output multiplier; thresholds unlock abilities such as the spaceport and interstellar edges |
| Force     | a stock that needs energy upkeep                     | built from matter at shipyards                       | pressure, defense, holding nodes                                                            |

Matter sets the speed of growth and energy sets its ceiling. When energy falls short, nodes work at reduced output, force decays, and only power nodes keep growing.

Every owned node yields a little matter and energy whatever its role.

## Nodes

A node has:

- natural data from world generation: matter richness, energy richness and a level cap;
- a level, raised by invested matter, with every level needing energy;
- a role, one of extraction, power, shipyard or science, chosen on settlement and costly to change: a change costs levels;
- knowledge and cohesion.

## Orders

| Target | Order                | Effect                                                                   |
| ------ | -------------------- | ------------------------------------------------------------------------ |
| Node   | development priority | one dial from "gives everything to the network" to "pulls toward itself" |
| Node   | role                 | what the node produces                                                   |
| Node   | garrison             | how much force stays in place                                            |
| Edge   | expand               | raises capacity                                                          |
| Edge   | pressure             | directs force at a foreign node                                          |
| Edge   | border               | closed, or trade: exchange of surpluses and spread of knowledge          |
| Edge   | gift                 | a flow into a foreign node, to aid an ally or to feed a rival's colony   |
| Power  | fold                 | hands a body over to self-rule                                           |
| Power  | release              | lets a node go peacefully                                                |

The dial sets how much of its building capacity a node uses and how strongly it attracts matter. A node that holds enough for its own work stops attracting, so the strongest pull is served first and the rest goes on to weaker ones.

One expand order adds one step of capacity.

The player does not draw routes. Orders create demand, and the network carries matter and force to it. The player's concern is bottlenecks, which are edges of low capacity. Flows must always be visible on the map.

## Conflict

- There are no tactical battles.
- Force directed at a foreign node becomes pressure. The node changes owner once pressure has exceeded its defense for long enough.
- Pressure consumes force on both sides, the attacker's faster.
- Pressure through an edge is limited by its capacity. A strong node has to be pressed along several edges or along a widened one.
- An attack on an owned node is announced to everyone who sees it and takes effect only after a delay. This binds the player as much as the rivals.
- A neutral node has a small defense of its own and is taken by the same pressure.
- A captured node loses part of its levels.

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

- The player may hand all holdings on one body over to self-rule. They become a single node of the next scale.
- Folding is never reversed. A folded node is attacked and defended as a whole.
- Direct control is limited to about 10–12 nodes. Beyond the limit nodes secede more readily.

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

Stage 1 tests whether managing flows on one arena is interesting.

- One planet of about 20 regions with two rivals of different doctrines.
- Matter, energy and force, with the roles extraction, power and shipyard.
- Orders: development priority, role, garrison, expand, pressure.
- Geography, fog, energy shortage, visible intentions and automatic pause.
- Tools: a live panel for tuning constants, seeded world generation, and a headless match between bots.

Stage 1 succeeds if the player wants to pause and change something every minute or two, and if the reason for losing a region is always clear.

Stage 2 adds knowledge, cohesion, borders and trade, gifts, the moon and folding. It tests whether the game stays manageable as it grows.

## Open questions

- No human has judged yet whether stage 1 passes its test.
- The constants are preliminary. They were adjusted only until bots played sensibly, and real tuning needs play with the constants panel.
- In a series of 24 bot matches of 6000 ticks the aggressor ended with about half of all regions and led in most matches, and the builder was the weakest. Stage 1 gives an economic lead nothing to turn into.
- In about a fifth of those matches a single power was left. Nothing slows a leader until the brakes of stage 2 exist.
- The late game goes quiet: a developed region cannot be taken through one edge, and bots widen edges slowly.
- The client shows regions by number, lets values other than flows jump between ticks, and applies a change of role without asking.
