# Barycenter

A browser space strategy sandbox in which attention stays on the frontier. Territory that has matured is handed over to self-rule and becomes a single node of a larger map: the regions of a planet, then the worlds of a star system, then neighboring stars.

Status: the first stage is playable. One player faces two bot rivals on a single planet.

## What makes it different

- One rule set at every scale: nodes produce, edges carry, pressure captures.
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
    pnpm match --seed 1 --ticks 6000 --matches 24

## Playing

Build the client once and start the server, then open `http://127.0.0.1:8787`:

    pnpm build
    pnpm serve

Add `--tuning` to change constants from the page while playing. Other options are `--port`, `--host`, `--saves`, `--client`, `--tick-rate` and `--seed`.

While developing, run the server and the client with live reload and open `http://localhost:5183`:

    pnpm dev

Click a region to select it. Space pauses and resumes, and the keys 1 to 4 set the speed. The address accepts `?room=name` to keep several games apart, and `?seed=` and `?rivals=` to set up a new one.

## License

[MIT](LICENSE)
