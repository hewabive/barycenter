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
- `docs/design.md` is the source of truth for game rules and `docs/architecture.md` for technical decisions. Update them in the same commit as the change they describe.
- Do not add other documents unless the user asks.
