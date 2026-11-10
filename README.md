# Barycenter

A browser space strategy sandbox in which attention stays on the frontier. Territory that has matured is handed over to self-rule and becomes a single node of a larger map: the regions of a planet, then the worlds of a star system, then neighboring stars.

Status: the simulation core runs and bots play full matches against each other. There is no server or client yet.

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

## License

[MIT](LICENSE)
