# Rules for agents

Barycenter is developed solo by AI agents that work with high autonomy. These rules apply to every change.

## Autonomy

- Decide implementation details yourself and keep working until the step is complete.
- Ask the user only when a choice changes the agreed game design, cannot be undone, or reaches outside this repository.

## Commits

- Commit directly to `main`. There are no feature branches and no pull requests.
- Commit after each completed step, and only when `pnpm check` passes.
- Do not push unless the user asks.
- Write commit messages in English: an imperative subject of at most 72 characters, and a body only when the reason for the change is not obvious.
- Do not add git hooks. Following these rules is the agent's responsibility.

## Code

- TypeScript in strict mode.
- No comments. Names and types carry the meaning. The one exception is a single line where the reason cannot be expressed in code, such as a workaround with a link to its cause.
- English for identifiers and for all text shown in the game.
- Runtime dependencies are limited to `three` and `ws`. Add another only when it is necessary, and justify it in the commit message.
- Never commit personal data, machine-specific paths, secrets or save files.

## Documentation

- English only, and compact.
- No pseudocode in documents.
- Each document is the source of truth for its part. Update it in the same commit as the change it describes.
  - `docs/design.md`: the rules of the game.
  - `docs/architecture.md`: decisions shared by all packages, the protocol, the server, the flight and the stability runner.
  - `docs/client.md`: the browser client.
  - `docs/nature.md`: the model of nature behind the generator of star systems.
  - `docs/sources.md`: the published works the documents rest on.
- When a rule in `docs/nature.md` is added or changed, each of its numbers says where it comes from, as the top of that document explains: a published work, a check against named known bodies, or "chosen for play". A number whose origin has not been checked is marked "unchecked" and is never given a likely source.
- Cite a work in the text by its authors and year, with "and others" for more than two. Add it to `docs/sources.md` in the same commit: authors, year, title, where it was published, what is taken from it and where.
- Do not add other documents unless the user asks.

## Verification

- `pnpm check` does not open the client in a browser. After changing the client, run it in a real browser, headless if there is no display, and look at a screenshot before committing.
- Stop only the processes you started. Other projects may be running on the same machine.
