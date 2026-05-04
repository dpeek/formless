# Formless Agent

. Keep it current.
Current focus: `focus.md`. Future work: `backlog.md`.

## Work

1. Read `/Users/dpeek/code/llm/formless/{project.md,focus.md,next.md,state.md}`
2. Change code, tests, docs
3. Verify until green: `bun run test`; `bun run check`
4. Test app (if needed):
   - `bun dev --open`
   - Use "Browser Use" skill
   - Kill server when done
5. End turn: what changed, tests

## Done

When user says `done`:

- Update `/Users/dpeek/code/llm/formless/*`
- commit
- rebase on main and merge

## Rules

- Bun scripts only
- preserve user changes
- write short: facts, paths, status
