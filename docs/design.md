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

## Nature

A body has a nature of its own, apart from how the game divides it.

- The relief of a body is one continuous field over its whole surface, fixed by the body itself. It does not depend on cells or regions, so the map can be cut anew without moving a coast.
- A cell takes its nature from the relief at its place. Land is where the relief rises above the sea, and the highest land is mountain.
- Two cells are joined by land where they meet on dry ground. Where only water lies between them, a strait may join them.
- The relief is no secret. Every power sees the coasts and mountains of a whole body from the start.
- A star system holds a star, sometimes two, and bodies on orbits around them, some with moons of their own, and the place of each follows from the tick.
- Two bodies of like mass circle the point between them. Most stars are alone, about a quarter are pairs, and a few in a hundred stand in nested groups of three and more: a pair with a far third star, a star with a far pair, two pairs. Planets circle one star, a pair or a whole group, wherever an orbit can last, and every star of the system lights them. A planet with a moon of like mass is a double planet, common among small icy bodies far from the star and rare among rocky ones. Two bodies may share one orbit: a small one keeps sixty degrees ahead of or behind a larger, as small moons close to a giant often do and a planet rarely, and two small moons of like mass at the rim of a dense ring chase each other round one orbit and trade places each time they near, never passing. The home body may see two suns or more, and is itself never one of a pair.
- An orbit is an oval in a plane of its own. Most orbits are near circles close to one plane. One system in five with no home was stirred long ago, as its giants threw each other about, and kept a handful of bodies on long ovals far apart. A moon close to its body circles in the plane of its equator, where its ring lies, and a moon farther out in the plane of the orbit of its body, where the star has more say than the body. A small body caught later may circle at any angle close in, even backward, and farther out only near that plane.
- A system is made to last. Neighbors keep apart by the reach of their pull, so heavy planets stand far from each other and a long oval has empty room beside it. A moon stays well inside the hold of its body, and a body shares the orbit of a moon only close to the planet. With every body pulling on every other, one or two systems in a hundred still lose a body within ten thousand of its turns.
- A body on an oval orbit is warmer near its star and colder far from it. Bare ground follows the light at once. Air, and a sea most of all, hold heat and even the year out. Lava, ice and glow follow the temperature of the moment, and the light on a body follows its distance of the moment.
- A body close to what it circles turns one face to it always: every moon, and a planet near its star. A planet with a moon heavy enough ends turned to that moon as the moon is to it. The home body is never held so.
- A body is described by its physics in real units: its mass, what it is made of as shares of iron, rock, ice and gas, its radius, its temperature, the light it gives off and the light and heat that reach it, its age, the pressure of its air and the gases in it, its orbit and its spin. There are no kinds of body. A name such as gas giant or ice world is read off the physics for the player, and no rule depends on it.
- Physics sets the limits and the seed chooses within them. The mass of a body and its distance from the star give what it can be made of, how large it is, how warm it is and whether it can hold air. Its history, such as how much water and air it kept, how fast it turns and when a moon of it was broken into a ring, is drawn inside those limits.
- The air of a body is what it gathered and kept. A gas too light for the pull of the body has left it, a gas that freezes at its temperature lies on the ground, a sea binds carbon dioxide and only life makes oxygen. The pressure and the warmth of the body follow from the gases that remain.
- A system is made around the home body. The mass of the star gives its light, and the home stands where that light keeps water liquid. Other bodies form closer in and farther out: rock inside the frost line, giants with gas beyond it and ice farther still. Moons form the same way around their planets, where the pull of the planet outweighs that of the star.
- Bodies run without a break from a lump of rock to a star. A body too small to pull itself round keeps the shape of a lump, and small moons are such lumps. A body heavy enough to hold a thousand bar of hydrogen is wrapped in gas and shows no ground, a thin wrap on a body of a few Earths and nearly the whole of a giant. Above thirteen Jupiters it is a brown dwarf, and above 0.075 of a Sun a star.
- A system has an age. A body wrapped in gas keeps heat from its making and loses it over that age, the more slowly the heavier it is, so a brown dwarf or a young giant glows dull red with a light of its own. A brown dwarf may stand far out in a system as a companion of the star, and a system with no home may have one at its centre in place of a star, with small cold worlds close around it. A glowing body warms its moons, far from a star more than the star does.
- A star has a life, set by its mass and read off the age of its system. It burns evenly for most of it, ten billion years for a Sun and a few million for the heaviest, then swells into a giant, or a supergiant above eight Suns, and ends. A star of up to eight Suns leaves a white dwarf as wide as the Earth that cools for good, a heavier one explodes and leaves a neutron star twenty kilometers across, and one above twenty Suns leaves a black hole. A home always has a star in its prime. Of the other systems about one in fourteen has a white dwarf at its centre, one in forty a giant, one in fifty a hot blue star, and a few in a thousand a supergiant, a neutron star or a black hole.
- A system is born in a disk of gas and dust around a young star that is wider and cooler than it will be. Its bodies gather out of the disk, the near ones first and the giants while the gas lasts, a few million years. Each clears a lane as it grows, a body still gathering is small and hot, and when the gas has gone from the inside out the dust that is left thins into the belts the system keeps. A young disk is opaque and flares outward like a shallow bowl: its upper and lower faces are lit, bright near the star and dim far from it, and from the side it is a dark lane between two bands of light that hides its star and all that lies in it. It begins where the light of the star no longer turns dust to gas, and toward its edge it thins and flattens until nothing is left, so it ends as a lens does and has no wall. Its lit faces carry faint streaks that turn with it, faster near the star and drawn out into arcs: they are there to show the motion, and a real disk has shown nothing so fine. While the star still takes in gas from it, in its first million years or two, a thin red jet with knots that travel outward stands on each face of the disk, seen from outside the system. A planet inside it is in the dark and shows only by its own heat, and dust heaps into a bright ring beyond the lane of a heavy one, brighter along one side in a crescent that goes round with the ring. In an open lane the rubble a planet still gathers shows as a swarm of points that pass it on both sides, a heavy planet holds two camps of them on its own orbit, sixty degrees ahead and behind, and one of several Jupiters draws a spiral through the disk that turns with it. A giant that still takes gas has such a disk of its own, within four tenths of its hold and lit by its own dull glow, and its moons gather in lanes of it as planets do around the star. While the gas lasts it stands upright, its disk in the plane of the disk around it, and every planet circles in that plane: orbits are tipped and giants lean only later, as the system settles in its first hundred million years. That disk goes with the gas. About half the giants with large moons are then left a heavy ring, the wreck of the last moon the disk dragged down. About three systems in a hundred with no home are met that young, and a home never is.
- What circles a star shares its life, and a system is the same system at every age: the seed gives what was born around the star and the age only what the star and the tides have done to it since, so no body lost comes back and none appears but a moon gathered from the ring of a broken one. The tide a planet raises on its star draws it in, and the star swallows it when it comes near enough to touch it or tear it apart. On the main sequence this takes only the nearest giants, those that circle in a day or two; once the star swells the tide reaches far, so a giant takes a Jupiter from within about four of its widest radii and an Earth from within two, its oval rounding as it falls. The pull of the star tears the outer moons from a planet drawn that near, and they circle the star on their own until it swells over them; the inner ones go in with their planet. What falls in gives its turning to the star, which spins faster for it and brakes again as stars do. A giant star warms what circles it, so ice far out melts: a small body loses it for good and a heavy one keeps it as steam. As a star sheds its mass the orbits around it widen, and a white dwarf keeps cold worlds far out and nothing near. A star heavier than eight Suns never had planets, a neutron star is alone, since the explosion scattered its companions, and a black hole keeps its companion stars. Of two stars the lighter is counted as circling the heavier, whichever was heavier at birth.
- Two stars that stand close share their lives. Each turns with their orbit, one face to the other, and an oval orbit rounds as either swells. When a star swells to the edge of the room it has beside its companion, its gas spills over. Beside a companion of like mass the gas passes for millions of years: the taker keeps half and shines as a heavier and younger star, the rest leaves the pair, the orbit widens, and the giver ends as a small white dwarf that never reached its full size. Beside a light companion, or one that a giant cannot shrink fast enough to stay clear of, the companion sinks into the envelope and throws it off: it comes out a few radii from the bared core, or it does not come out and the two are one star, which turns fast and lists the other as swallowed. Two white dwarfs left that near spiral together and merge. No mass is lost without a trace: what one star gave, the other took or the pair shed, and the orbits around them widen or close by it. A star that swells beside a pair, or as the outer star around one, throws its envelope off where its room ends and stays on its orbit.
- What passes between stars is seen. A star that fills its room is the drop it is, its tip toward the companion, and the gas it gives runs from that tip in a stream that curves with the orbit into a glowing disk around the taker. An envelope thrown off, by two stars or by one that ends as a white dwarf, is a thin shell of green and red light that grows for fifty thousand years and fades.
- Tides move a moon. One that circles faster than its planet turns is drawn in and one that circles slower is pushed out, the faster the heavier and the nearer it is, and the planet turns faster or slower by what the moon lost or gained. Rock gives way to a tide far more than a giant does, and a large body more than a small one. A moon drawn down to where the planet tears it apart is gone. So a planet that turns slowly, as one held by its star does, keeps only light moons far out, and a moon, which turns no faster than it circles, loses a moon of its own within a few million years. A moon pushed outward drives the lighter moons beyond it ahead of itself, in step with it. A moon heavy enough ends by holding its planet, and the two then keep one face to each other.
- The ground of a solid body keeps its past. A body with no air, a still inside and no sea carries the craters of its whole age, from basins a quarter of its radius wide down to pits a step across, deep bowls on a small body and wide flat floors on a heavy one. Air, a sea, lava, ice that flows and a lively inside wear them away, and the home body has none. The relief stands higher the weaker the pull of the body.
- Close to a star rock melts. A solid body there has seas of lava on the side turned to the star, and a giant there swells and glows.
- A ring is the wreck of a moon and does not last. It lies inside the distance at which the pull of its body would tear a moon apart, ice where it is cold and dark dust where it is warm. It comes when a moon is broken there: one that tides drew down, or one of the small moons that about half the giants and a few rocky bodies keep close in, of which one is broken every billion years or so. A heavy ring spreads at once, falls onto its body and thins to about the weight of the rings of Saturn whatever it began with, and every ring is worn away in a few hundred million years more. A heavy ring gathers a fifth of its matter into a moon at its outer edge. Around a planet that turns fast that moon stays and drifts outward. Around one that turns slowly tides bring it back down to be torn into a lighter ring, time after time, until the ring is too light to gather a moon. So a ring has an age and a time left, a system read at another age may show a ring where there was none, and at any one time about one giant in five has a dense ring and one in four a thin or a faint one.
- A ring and a belt are one thing, a disk of small matter around a body. Around a planet it is dense and close, and is a ring. Around a star it is sparse and wide, a belt of small bodies in an orbit that no planet took, of rock inside the frost line and of ice beyond it. Most systems have a belt or two. A disk is as thick as its grains are fast: dust in gas stands as high as the gas holds it, a belt is as thick as the planets have stirred it, and a ring, which nothing stirs, is a few of its grains deep. One becomes the other as the gas leaves and the grains grow. Collisions wear the dust of a belt away, near the star first and everywhere as the inverse of its age, and a belt is empty where its bodies would keep time with a giant planet outside it.
- The game shows a conventional scale. Sizes, distances and periods are compressed so that a system fits a screen and a turn of a far body takes hours and not years, and they keep the order and the nesting of the real ones. The home body always has radius 1, a year of 9600 ticks and a day of 1200.
- Light is on a conventional scale as well, and it is light as an eye sees it. A body is lit by its star and by whatever it circles that glows, and where nothing lights it, by the stars of the sky. How bright a body is drawn falls with the light that reaches it far more gently than that light does: a body thirty times farther from its star than the home is half as bright. Of the lights of one body, its own glow among them, the strongest is drawn in full and the others by a gentler share of what they are, so what is brighter stays brighter and nothing that shines is lost.

## Time

- The game advances in ticks, and all orders resolve simultaneously.
- The player can pause and choose among several speeds.
- Orders are standing states that hold until changed. They can be given while time is paused and take effect at once.
- Time pauses automatically when a rival announces an attack on the player, when the player takes a first cell in a node or loses the last one there, and when the player discovers a new node. Each trigger can be switched off.
- A game starts paused, and it pauses whenever no player is present.

## Resources

| Resource  | Behavior                                             | Source                                               | Use                                                                                         |
| --------- | ---------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Matter    | a stock: accumulates and moves slowly                | deposits such as mountains, asteroids and gas giants | building levels, roads and force                                                            |
| Energy    | a capacity: cannot be stored and fades with distance | bright and hot nodes, orbits close to the star       | upkeep of flags, levels and force                                                           |
| Knowledge | a field: never spent, spreads to neighbors           | the science branch                                   | output multiplier; thresholds unlock abilities such as the spaceport and interstellar edges |
| Force     | a stock that needs energy upkeep                     | built from matter at shipyards                       | pressure, defense, holding nodes                                                            |

Matter sets the speed of growth and energy sets its ceiling. When energy falls short, cells work at reduced output, force decays, and only the power branch keeps growing.

Only levels yield. A cell without a level makes neither matter nor energy, so new land is an investment and not an income.

## Nodes and cells

A cell has:

- natural data from world generation: matter richness, energy richness and a level cap;
- an owner;
- a level, raised by invested matter, with every level needing energy;
- a profile: the shares of its level that work in the four branches, which are extraction, power, shipyards and science.

Every cell holds all four branches, and no cell is a single mine or school. A node shows the combined profile of its cells, and so does every larger unit, so specialization looks the same at every scale.

The simulation decides what a cell builds from its natural data, from what is short nearby and from the leaning of its power. New levels follow that choice at once. Levels already built change branch only slowly, so a cell full of mines cannot quickly become a center of science, and the priorities of the past stay on the map.

Matter goes first to where a level is cheapest. A cell holds back from its own next level while a cheaper one nearby waits for matter, and that pull fades with distance like everything that moves. A new cell therefore gets its first level before an old one gets a dear one.

A holding has:

- a level, the sum of the levels of its cells;
- a profile, the sum of the profiles of its cells;
- knowledge and cohesion.

Stocks of matter and force lie in cells, and the network moves them from cell to cell. The player sees them summed by holding.

## Orders

Every order names a node or an edge between nodes, and the simulation decides which cells receive matter and hold force. One order reaches a level lower: the aim of a pressure names a cell.

| Target | Order                | Effect                                                                   |
| ------ | -------------------- | ------------------------------------------------------------------------ |
| Node   | development priority | one dial from "gives everything to the network" to "pulls toward itself" |
| Node   | garrison             | fixes the room for force in one holding, which the army places otherwise |
| Node   | reinforcement        | keeps force in the field in the holding beyond what its garrison houses  |
| Node   | pressure             | directs force at one holder's cells in the node                          |
| Node   | aim                  | gives a pressure one cell to break through to                            |
| Edge   | road                 | lays a trunk road between the holdings on its two sides                  |
| Edge   | border               | closed, or trade: exchange of surpluses and spread of knowledge          |
| Edge   | gift                 | a flow into a foreign node, to aid an ally or to feed a rival's colony   |
| Power  | army                 | how much force the power means to house in its garrisons                 |
| Power  | forward              | one dial from "garrisons in the rear" to "garrisons at the frontier"     |
| Power  | leaning              | one dial per branch: how far that branch is built ahead of need          |
| Power  | fold                 | hands a body over to self-rule                                           |
| Power  | release              | lets a node go peacefully                                                |

Development priority, garrison and reinforcement apply to the player's own holding in the node. A garrison is built in the hub of the holding.

Pressure names a node and whose cells in it to press: neutral ground or one power. It can be ordered wherever the player's cells touch such cells, from a neighboring node or from inside the same one, and it lapses when that holder has no cells left there.

A pressure may be given an aim: one cell of the pressed holder in that node. The attack then presses only where its line is nearest to the aim, so it drives a wedge toward that cell instead of pushing along the whole line. The aim lapses when its cell changes hands. At every scale the aim lies one level below the node, a cell on a planet and a region in a star system.

No order sets what a node specializes in. The leaning is the only say the player has in it: with all dials level the economy answers shortages as they appear, and a raised dial builds that branch ahead of need across the whole power.

The dial sets how much of its building capacity a holding uses and how strongly it attracts matter. A holding that has enough for its own work stops attracting, so the strongest pull is served first and the rest goes on to weaker ones.

The player does not draw routes. Orders create demand, and the network carries matter and force to it. The player's concern is bottlenecks and long poor ways. Flows must always be visible on the map.

## Logistics

Matter, energy and force move from cell to cell, and every hop loses a share of what moves. The road between the two cells sets that share and how much can pass in one tick.

- A road belongs to the joint between two cells. It has a grade: each grade halves the loss and adds capacity. Open ground is grade zero, and mountains and straits carry less at any grade.
- A flow takes the way that loses least, so roads draw traffic to themselves.
- The simulation builds a road where traffic presses against capacity. The cells at both ends pay for it in matter.
- A road needs energy upkeep, and a road that nothing uses wears away. The top grade is too dear to build everywhere, so a network forms.
- The road order names an edge. The simulation then builds a trunk of the top grade between the hubs of the player's holdings in the two nodes, ahead of any traffic, and keeps it while the order stands. A chain of such orders is a road to a far province. The hub of a holding is the capital or, where there is none, its cell with the highest level cap.
- A road outlasts a change of owner. Pressure across a joint is as wide as its road, so a road that leads to a border also leads an attack in.

The capacity of an edge is the sum of its crossings, the places where a cell of one node touches a cell of the other.

## Flags

Holding land has a price, and land that is not held goes back to nobody.

- Every owned cell flies a flag, and a flag needs as much energy as one level.
- A cell with at least one level keeps its flag whatever happens. The flag of a cell without a level falls while energy does not reach it, the faster the less of it arrives, and rises again once it does.
- When a flag has fallen, the cell turns neutral, and the matter and force on it are lost.
- A falling flag is shown on the map long before the cell is lost: the owner's color drains from the edges of the cell toward its middle.
- A cell short of energy builds its power level before force, so a cell that gets matter can raise its own flag.
- A taken cell starts with its flag raised.

Energy fades with distance, so far land is dearer to hold than near land, and a strip of empty cells is a standing cost.

## Garrisons

Force is tied to the land through garrisons.

- The army order names a size for the whole power. The simulation places room for that much force in the hubs of the power's holdings. Room costs matter, takes time to build and needs energy upkeep even when empty. A hub can house more as its level grows. Room that is no longer wanted is slowly run down.
- The forward dial says where the room goes. In the middle every hub gets the same share of what it can house. Toward one end a hub's share doubles with every cell it stands nearer to the frontier, and toward the other with every cell it stands farther from it. The frontier is where the power's land touches another power or, until it meets one, free land.
- The garrison order names a node and a size and fixes the room in the player's holding there. The army then places only the rest, in the other holdings. A holding without that order follows the army.
- The room in all garrisons of a power caps its force. Shipyards build up to the cap, and force above it melts away, so a lost garrison shrinks the army it housed.
- Force that no front asks for rests in a garrison. A front draws force from the nearest garrisons that have it, for attack and for defense alike. Force stays at its front while the order stands and moves only to another front that is short. Once the order is gone it returns to a garrison with room.
- The reinforcement order names a node and a size. That much force stands in the field in the player's holding there, on top of what attack and defense call for. It stands on the cells that face other powers, more of it where the contact is wider, and in the hub where no other power is near. It comes from the garrisons and adds no room, so its price is the upkeep of force in the field and the loss on the way. The same order masses force at a border ahead of an attack.
- Force at rest needs a fraction of the energy of force in the field, and force on the move loses a share on every hop like everything else. A far front reached over poor ground is dear.
- A cell cut off from its capital is stranded, and force there melts quickly. A strip one cell wide is a supply line that one captured cell cuts.
- A captured cell loses part of its garrison room along with its level.
- A power starts with a garrison in its capital.

## Conflict

- There are no tactical battles.
- Force directed at a node becomes pressure along the whole line where the attacker's cells touch foreign cells of that node, or along the part of that line nearest to the aim.
- A cell changes owner once pressure on it has exceeded its defense for long enough, so a border moves cell by cell and can come to rest inside a node.
- Pressure consumes force on both sides, the attacker's faster.
- Pressure is limited by the width of the line of contact. A strong holding has to be pressed on a wide front or along a road.
- Along that line the simulation concentrates force. An attacking cell presses its weakest neighbor first and holds back from neutral ground it cannot take, and a cell under attack draws force from the garrisons nearby.
- An attack on a holding is announced to everyone who sees it and takes effect only after a delay. This binds the player as much as the rivals.
- A neutral cell has a small defense of its own and is taken by the same pressure. Powers that enter a neutral node from different sides each keep the cells they take.
- A captured cell loses part of its level.

## Fog

What lies in the ground of a node, its richness and how far it can be built up, is revealed next to the player's territory and stays known afterwards. Owners, levels and force are visible only next to that territory. Farther away only the relief is known.

## Rivals

- Rivals follow the same rules and act through the same orders as the player.
- Each rival is driven by a doctrine: a few parameters such as aggression, preferred direction of expansion and what it retaliates against.
- A rival's next target is shown on the map in advance, as is the force it masses at the border.
- The prototype has three doctrines: aggressor, builder and opportunist.
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

## Kinds of matter

Matter is a single resource only in what the player commands. Inside the simulation it is many kinds, and the player is shown what they add up to.

- A cell holds deposits of several kinds.
- Every kind fills one of a few functions, such as structure or fuel. The rules name only functions. A kind is an entry in a table: its function, the knowledge at which it is in demand and how its deposits lie on the map.
- Each power has a price for every kind, which rises as its consumption outruns its extraction. A price is a signal inside the power and not money.
- The value of a cell to a power is its deposits weighted by that power's prices, so the same cell is worth more to one power than to another. The same prices tell a cell what is short when it chooses what to build.
- A shortage of a kind makes work dearer and slower. It never stops it.
- The player sees the value of a cell and the two or three kinds that are dearest to their power at the time. All other kinds merge into the rest: a new deposit of one of them adds a little value and is not worth a war.
- Knowledge shifts by degrees which kinds a function draws on, so eras of resources follow one another as a power grows through the scales. An old kind does not vanish: its share falls or it becomes plentiful, and it drops out of sight. A coming shift is shown before it raises a price. These are thresholds of the one knowledge value, not a technology tree.
- Kinds that matter lie in patches and the rest lie evenly, so that there is something to contend for.

Later mechanics build on prices. How well a power knows a rival's prices depends on intelligence. A threshold of knowledge makes deposits workable that gave nothing before. Trade moves a kind from where it is cheap to where it is dear.

## Balance

Two brakes act on every power, rivals included: size breeds discord, and lag breeds catch-up. They make leadership more expensive, but leading must always remain better than lagging.

## Flight

The strategy is set aside for a while. On the same star systems a second game is being built: one ship flown through a system on its real scale.

- The system is taken as it is made, with real sizes, distances and times. Its bodies keep to their orbits whatever the ship does.
- The ship is a point with a mass. Every body of the system pulls it at once, each from where it stands at that moment, and nothing is pieced together from orbits around one body at a time. A place sixty degrees ahead of a planet therefore holds a ship, and the point between a planet and its star holds it only for a while.
- The ship has one engine with a thrust and an exhaust speed, a mass of its own and tanks. The player may change all four at any time, refill the tanks or make them endless. A burn spends propellant as the rocket equation says.
- The player sets the throttle and a heading: along the path or against it, to either side of the plane of the orbit, outward or inward, or held against the stars and turned by hand. Turned by hand, the ship pitches, yaws and rolls about its own axes. A burn against the path eases off as the ship comes to rest. Headings and readings are counted from the body that holds the ship most closely, or from one the player picks.
- A ball shows where the nose points: the sky and the ground of that body as seen along the nose, with every heading, the next planned push and the target marked on it. Dragging the ball turns the ship.
- Time runs from real time to ten million times faster, and the engine works at any speed of time.
- There is no air. A round solid body has ground at its true heights, with its relief and its craters, and the ship meets that ground and not a smooth ball. A ship that touches it at 12 meters a second or slower has landed: it stands upright, turns with the body and lifts off again when the push of its engine exceeds its weight. A faster ship is lost and lies where it fell. A lump, a body wrapped in gas and a star have no ground to land on. The player may at any time set the ship into a round orbit of any body, or set it down on the sunlit ground of a round solid one.
- Within three hundredths of a radius of such a body, along the path and against it are counted against its turning ground, and the speed shown is the speed over that ground, so a burn against the path brings the ship to rest over one place.
- A landed ship carries a rover. Set down beside the ship, it is driven over the ground: it keeps to the ground, gains speed up to 22 meters a second, slows on a rise, cannot climb what its grip does not hold and rolls back down a steep wall. The player switches between the rover and the ship, and the view follows the one in hand. The rover stays where it was left when the ship flies on.
- The readings are the height of the ship over the ground, or over the mean radius where a body has none, its speed, the highest and lowest points of its orbit with the time to each, the period, stretch and lean of the orbit, the mass, the speed left in the tanks and the push of full thrust.
- The path ahead of the ship is worked out as the flight itself is, in the pull of every body, and drawn before it is flown. It runs a little over one turn of the orbit the ship is on, or, where the ship is leaving the body that holds it, out of that hold and round the next one, through up to four such changes. The player may ask for a fixed span from an hour to a hundred years instead.
- The player plans pushes on that path. A push has a moment and three parts in meters a second, along the path, across the plane of the orbit and outward, counted from the body holding the ship at that moment. The path past a push is drawn in another color, and shows the push as the engine will give it, over the whole length of its burn. A push is set by a click on the path or on one of its marks, or by a button ten minutes ahead or at the lowest or highest point of the orbit. Its moment and its parts are shown digit by digit, and each digit is turned by itself, with the wheel over it, by dragging it or by a click on its upper or lower half: a notch on the hundreds is a hundred meters a second, a notch on the tenths a tenth, and a notch back undoes it. Under each part lies a lever on a scale of tenfold steps, whose place is the size of the part, for a rough setting that the digits finish, and a button that returns the part to nothing. A push is also moved by dragging its mark along the path it lies on, or by a whole turn of the present orbit, and may be dropped.
- The player may run time to any point of the path or to the next push: time goes as fast as the way there allows and returns to its real speed on arrival.
- The player may ask for a way to another body by naming it and the height to pass it at. A push that takes the ship there is worked out, as the engine of the ship will burn it, and set into the plan after the pushes already there. A way is found to a body that circles what the ship circles, to a body beside the one the ship circles, down to the body that one circles, and for a ship already under way. Where a later moment would be much cheaper the player is told when, and may run time to it. No way is worked out from a moon to a body beyond its planet, and none is found where the burn would last a great part of a turn of the orbit the ship leaves.
- The ship flies the plan by itself unless the player switches that off: it turns to the push, slows time, burns from half the length of the burn before the moment and stops when the push is given. The player may also point the ship along the planned push and burn by hand, and the push shrinks by what was given.
- The path is drawn around the body that holds each part of it, or around one body the player picks. Around a picked body it may be drawn as it looks turning with that body about what it circles, and the five points of balance of the pair are then marked. On the path are marked the planned pushes, the lowest and highest points ahead, the nearest pass by a target the player picks, and the place where the path meets the ground.
- The view fills the screen and the instruments lie over it. The clock and the speed of time stand at the upper left with the readings of the orbit under them, the plan at the right, and at the bottom the height and speed, the throttle, the ball, the headings and the propellant. The settings of the path, the engine, the list of bodies and the keys open when asked for. One key shows the whole orbit and returns to the ship. Near a round solid body the view stands upright on its ground, and the ground is drawn around the eye in its full detail, down to half a meter.

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

Stage 2 moves the simulation onto cells. It is built.

- One planet of about 250 cells in about 22 regions of 1 to 30 cells, with two rivals.
- Shared regions, borders that move cell by cell, and flows computed from cell to cell.
- Profiles of three branches, extraction, power and shipyards, and a leaning for the whole power. Science waits for knowledge in stage 3.
- Orders: development priority, garrison, pressure, expand and leaning. None names a cell.
- Matter has one kind, stored as a list of kinds.

Stage 2 tests whether the game gains depth without the player gaining work.

Play of stage 2 found the game a race of expansion. Land cost nothing to hold, the shape of a power did not matter and a severed piece lived on as before, so the winning way was to grow in thin strips and fence rivals off. The economy ran itself and drew no attention, and the leaning stayed untouched, while the war asked for finer control. Three changes answer this. All three are built, and their constants are set only coarsely.

- Roads, as described under Logistics. Built.
- Garrisons that house force, cap it and make force in the field dearer. Built.
- An aim for pressure, one level below the node. Built.

Deferred with them: a travel time for what moves, to be designed together with orbits, where it is the main rule, and roads that improve with knowledge.

Play with these three found the economy still out of sight, and the report on it showed why. Land paid from the tick it was taken and cost nothing to hold: early in a game the land itself, apart from anything built on it, gave over half of the matter and four fifths of the energy, so energy limited nothing. Two changes answer this. Both are built, and their constants are set only coarsely.

- Land yields nothing until a level stands on it. A capital starts more developed instead.
- Flags, as described under Flags.

Play then found the size of the army tiring to set holding by holding, and found no way to send a holding under threat more force than its garrison houses. Two changes answer this. Both are built, and their constants are set only coarsely.

- One army order and one forward dial for the whole power, as described under Garrisons. The garrison order stays as the exception for one holding.
- Reinforcement, as described under Garrisons.

The look of the game was then rebuilt apart from its rules, as described under Nature. The home body is drawn from its relief with the state of its cells laid over it, and the star system is on screen: a star and the bodies around it, which can be visited. No rule runs beyond the home body yet.

Stage 3 adds knowledge, cohesion, borders and trade, gifts, the moon and folding with governors. It tests whether the game stays manageable as it grows.

Stage 4 splits matter into kinds with prices and values. It is not designed in detail. Until then matter has one kind.

## Open questions

- No human has played with roads, garrisons and aims yet.
- No human has played with flags yet.
- No human has played with the army order, the forward dial and reinforcement yet.
- The army is a number, so the player raises it as the power grows. A share of what the power has built may be the coarser tool.
- A reinforcement is spread along the whole contact with other powers by its width. It does not gather where the rival's force stands.
- A flag has one price everywhere, so it slows expansion and does not limit size: built land still pays for itself, and the larger power stays the stronger. The brake meant for size is cohesion.
- Bot powers now reach about 23 cells by tick 1200 and 47 by tick 2500. Before flags it was 62 and 83.
- Energy now sets the ceiling through the first half of a game. Flags are a quarter to a third of the need, and one percent of the energy made finds no use. Late in a game a tenth to a quarter is idle again.
- Bare land cannot build itself, so matter has to travel to it, and the loss on the way takes 6 to 12 percent of what is produced.
- Bots settle land only while none of their flags is about to fall and few of their cells lack a level. The rule is coarse, and so is the size of the army each doctrine keeps.
- Bots set one army size and one forward dial by doctrine. They reinforce a holding under attack and the holding they stage an attack from, and never fix a garrison by hand.
- Bots do not aim their attacks and cut a supply line only by chance.
- Energy is not limited by capacity, so a strip one cell wide carries any amount of it.
- The hub of a holding, where its garrison stands and its trunk roads meet, is chosen by the simulation. The player may need a say in it.
- The leaning went untouched in play. Whether the player keeps it is undecided.
- The constants are preliminary. They were adjusted only until bots played sensibly, and real tuning needs play with the constants panel.
- In a series of 12 bot matches of 6000 ticks on maps made from the relief, the builder ended with 45 percent of the held cells, the opportunist with 31 and the aggressor with 24. Three powers were eliminated, one match was left with a single power, and five regions on average were shared at the end. About 42 cells a match changed hands between powers, and one or two were lost to fallen flags.
- In 2 of the 11 matches that lasted no cell changed hands in the last third.
- A power that has built every cell to its cap has nothing left to spend matter on. Its surplus then circulates and a tenth to a fifth of its output is lost on the way.
- The client shows regions by number and lets values other than flows jump between ticks.
- The star system is drawn ahead of its rules. The conventional scale was chosen for the look and not for play, and no rule reads an orbit or the physics of a body yet. The light of the star should come to set energy, and what a body is made of the matter taken from it.
- The temperature of a body is a mean with one swing over its year. It leaves out the beat of the light in a close pair of stars, the oval orbits of moons close to a glowing body and eclipses, and air and sea do not change with the season. The architecture document gives the sizes. None of it is worth counting until a rule reads temperature.
- The system has one star, round bodies and circular orbits in one plane. Bodies too small to be round, brown dwarfs that glow, two stars, stretched and tilted orbits and bodies that always turn one face to their star are possible in physics and not made yet. A planet near a faint star keeps its spin, though it would have lost it.
- The look that follows from the physics was judged on a sheet of bodies drawn by mass and by distance, and not yet in play.
- The relief is public, so the mountains and coasts of unexplored land are known. Whether exploration should reveal more than richness is undecided.
- A cell reaches to the coast however far that is from its middle, so cells by the sea differ much in size on the map while the rules count them alike.
- Kinds of matter: how many functions there are and which, and whether energy, force and knowledge are split in the same way. Kinds of force would be unit types and kinds of knowledge a technology tree, and both are absent so far.
- The governor is not designed, and its logic may be simple. It is also undecided how a body is simulated when only some of the powers on it have folded.
- Cohesion, knowledge, border and gift are stated for whole nodes and must be restated for holdings and for borders that run inside a node.
