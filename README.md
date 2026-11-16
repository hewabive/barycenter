# Barycenter

A browser space strategy sandbox in which attention stays on the frontier. Territory that has matured is handed over to self-rule and becomes a single node of a larger map: the regions of a planet, then the worlds of a star system, then neighboring stars.

Status: the second stage is playable, with roads, garrisons and aimed attacks added after its first play. One player faces two bot rivals on a single planet. The player gives orders to regions, and the game works them out on the cells each region is made of.

## What makes it different

- One rule set at every scale: nodes produce, edges carry, pressure captures.
- Orders are coarser than the world: borders run inside regions and move cell by cell, and only the aim of an attack names a cell.
- Orders are standing states, and time runs in ticks at a speed the player chooses.
- Whatever the player delegates gains a will of its own and may secede.
- Rivals announce their intentions before they act.

## Documentation

- [Game design](docs/design.md)
- [Architecture](docs/architecture.md)
- [Rules for agents](AGENTS.md)

## Development

Requires Node.js 24 and pnpm 11.

    pnpm install
    pnpm check

Run one bot match and print its timeline, or a series with rotating seats and a summary per doctrine:

    pnpm match --seed 1 --ticks 6000
    pnpm match --seed 1 --ticks 6000 --matches 12

Add `--set name=value,name=value` to try other constants on a match or a series.

## Playing

Build the client once and start the server, then open `http://127.0.0.1:8787`:

    pnpm build
    pnpm serve

Add `--tuning` to change constants from the page while playing. Other options are `--port`, `--host`, `--saves`, `--client`, `--tick-rate` and `--seed`.

While developing, run the server and the client with live reload and open `http://localhost:5183`. The Vite server listens on all interfaces and forwards game traffic from `/socket` to the local game server, so only port 5183 needs to be reachable:

    pnpm dev

Three more pages need no game server. `http://localhost:5183/generator.html` makes star systems from a seed, with a home or lifeless, lists every number of a body and shows the system on the drawn scale or the real one. `http://localhost:5183/flight.html` flies a ship through such a system on its real scale, and takes the same `?seed=`, `?home=` and `?star=`. `http://localhost:5183/atlas.html` draws a sheet of bodies by mass and by distance from the star.

Click a region to select it, then settle its neutral land or press a rival from the panel. The same panel sets the garrison of the region, lays roads to its neighbors and aims an attack at one cell. The sliders in the panel set the leaning of the whole power. Space pauses and resumes, and the keys 1 to 4 set the speed. The address accepts `?room=name` to keep several games apart, and `?seed=` and `?rivals=` to set up a new one.

Zoom out to leave the chart of the home planet and see it from orbit, then its star system. Click a body or its name to fly to it, and the home planet to return.

The same page works on a phone or tablet: drag to turn the globe, pinch to zoom and tap a region to open its sheet. To reach the game from another device on the local network, open port 5183 of the development machine, or start the server with `--host 0.0.0.0`.

## License

[MIT](LICENSE)
