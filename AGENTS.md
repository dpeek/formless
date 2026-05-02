# Formless Agent

Read `/Users/dpeek/code/llm/formless/*.md`. Keep it current.
Current focus: `focus.md`. Future work: `backlog.md`.
Use `./llm/*` only for ignored worktree scratch.

## Work

- current cwd is the Codex worktree
- start every chat:
  1. read `/Users/dpeek/code/llm/formless/*.md`
  2. inspect: `git status --short --branch`
  3. if detached, create branch before dev: `git switch -c codex/<topic>`
  4. `bun i`
  5. `mkdir -p ./llm`
  6. if `./llm/dev.pid` is live, reuse dev server
  7. otherwise: `nohup bun run dev > ./llm/dev.log 2>&1 & echo $! > ./llm/dev.pid`
  8. tail startup/errors only: `tail -80 ./llm/dev.log`
  9. open `https://<slug>.formless.local`
- slug = branch with `codex/` stripped and `/` replaced by `-`
- `codex/topic` -> `https://topic.formless.local`
- never start portless from detached HEAD
- if no topic is obvious, use `codex/smoke`
- change code
- verify until green: `bun run test`; `bun run check`
- end turn: what changed, tests

## Done

Only after user says `done`:

- kill dev server from `./llm/dev.pid`
- update tracked docs if behavior changed
- update `/Users/dpeek/code/llm/formless/*`
- commit
- merge to main

## Rules

- Bun scripts only
- preserve user changes
- write short: facts, paths, status
