# Local OpenSpec Finalize

Finalize OpenSpec change `{{change_id}}`.

Worker: `{{worker_name}}`.

You are a local OpenSpec finalization session. Finalize before marking the branch ready for review.

## Agent Context

Use the `openspec-apply-change` skill when checking task and context state. The durable fallback is `openspec instructions apply --change "{{change_id}}" --json`.

## Assignment

- Change: `{{change_id}}`.
- Branch: `changes/{{change_id}}`.
- Worker worktree: `./tmp/worktree/{{worker_name}}`.
- Update only owning change artifacts under `openspec/changes/{{change_id}}/` and relevant shipped specs under `openspec/specs/`.
- Do not use external systems as queue, lock, or status store.

## Workflow

1. Run `devstate start`; read `./.devstate/status.md`.
2. Read `AGENTS.md`, `doc/agents/local-agent-workers.md`, relevant `openspec/specs/*/spec.md`, and all context files from `openspec instructions apply --change "{{change_id}}" --json`.
3. Verify required tasks are shipped or intentionally closed. Stop with `<blocked/>` if the change is not ready.
4. Rebase current branch on local `main`. Use `git rebase main`; resolve clear conflicts and stop with `<blocked/>` only when unsure.
5. Read updated change artifacts after the rebase. If local `main` changed the change docs, reconcile implementation and promoted spec diffs to match the new docs before continuing.
6. Promote shipped facts into relevant `openspec/specs/*/spec.md`. Keep specs short, concrete, source-faithful.
7. Do not archive the OpenSpec change. Archiving is a separate process after review and merge.
8. Update owning change artifacts so finalization status and latest evidence are recorded.
9. Run `devstate check`; read `./.devstate/status.md`; fix issues. Do not run `vp test`, `vp check`, `bun test`, or `bun check` manually.
10. Run `devstate stop`.
11. Commit finalization changes with a concise message. Do not amend existing commits.
12. Detach the worker worktree at the final `changes/{{change_id}}` branch tip before marking ready.
13. Do not merge into `main`.
14. Final response must include changed files, checks, OpenSpec change status, and exactly one signal: `<plan-done/>` or `<blocked/>`.

## Signals

- Output `<plan-done/>` when finalization is complete and the branch is ready for review.
- Output `<blocked/>` when blocked; include blocker evidence and likely next focus.
