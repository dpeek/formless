# Formless Agent

Read `/Users/dpeek/code/llm/formless/*.md`. Keep it current.
Current focus: `focus.md`. Future work: `backlog.md`.
Use `./llm/*` only for ignored worktree scratch.

## Work

- worktree per task: `codex/<topic>` -> `../formless-<slug>`
- install: `bun i`
- dev: `bun run dev` bg -> `./llm/dev.log`; tail startup/errors only
- URL: `https://<slug>.formless.local`
- change code
- verify until green: `bun run test`; `bun run check`
- end turn: what changed, tests

## Done

Only after user says `done`:

- kill dev server
- update tracked docs
- update `/Users/dpeek/code/llm/formless/*`
- commit
- merge to main
- cleanup worktree/branch

## Rules

- Bun scripts only
- preserve user changes
- write short: facts, paths, status
