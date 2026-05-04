# Formless Agent

. Keep it current.
Current focus: `focus.md`. Future work: `backlog.md`.

## Work

1. Read `/Users/dpeek/code/llm/formless/{project.md,focus.md,next.md,state.md}`
2. Dev server is running at `https://branch.formless.local`
3. Launch app with Browser Use skill
4. Change code, tests, docs
5. Verify until green: `bun run test`; `bun run check`
6. End turn: what changed, tests

## Done

When user says `done`:

- Update `/Users/dpeek/code/llm/formless/*`
- commit
- rebase on main and merge

## Rules

- Bun scripts only
- preserve user changes
- write short: facts, paths, status
