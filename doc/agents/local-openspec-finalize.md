# Local OpenSpec Finalize

Finalize OpenSpec change `{{change_id}}`.

Worker: `{{worker_name}}`.

You are a local OpenSpec finalization session. Finalize before marking the branch ready for review.
This rendered prompt is self-contained for this session.

## Known OpenSpec State

{{known_openspec_state}}

## Known Task State

{{known_task_state}}

## Known File Paths

{{known_file_paths}}

## Assignment

- Change: `{{change_id}}`.
- Branch: `changes/{{change_id}}`.
- Worker worktree: `./tmp/worktree/{{worker_name}}`.
- Update owning change artifacts under `openspec/changes/{{change_id}}/` and canonical specs changed by OpenSpec archive.
- Do not use external systems as queue, lock, or status store.

## Concrete Commands

- Refresh apply state if known state is absent or stale: `openspec instructions apply --change "{{change_id}}" --json`.
- Strict validation before archive: `openspec validate {{change_id}} --strict --no-interactive`.
- Archive and apply spec deltas: `openspec archive {{change_id}} --yes`.
- Rebase on local main: `git rebase main`.
- Run checks only when finalization invalidates current implementation evidence: `devstate check`.

## Workflow

1. Run `devstate start`. Current green `devstate start` output can satisfy setup evidence; read `./.devstate/status.md` after failures, stale output, conflict resolution, or exact evidence-copy needs.
2. Read `AGENTS.md`.
3. Verify required tasks are shipped or intentionally closed. Stop with `<blocked/>` if the change is not ready.
4. Rebase current branch on local `main`. Use `git rebase main`; resolve clear structural conflicts and stop with `<blocked/>` only for semantic conflicts.
5. Read updated change artifacts after the rebase only when local `main` changed them. Reconcile implementation to match updated artifacts before continuing.
6. Run `openspec validate {{change_id}} --strict --no-interactive` before archive; block with command evidence on failure.
7. Run `openspec archive {{change_id}} --yes`; use archive output for canonical spec updates and block with command evidence on failure.
8. Treat OpenSpec archive output as the spec promotion path. Do not manually promote shipped facts into `openspec/specs/*/spec.md` when OpenSpec archive can apply the change deltas.
9. Reuse latest implementation `devstate check` evidence when finalization did not change code, resolve conflicts, edit generated output, or otherwise invalidate the checked tree.
10. Run `devstate check` only when finalization invalidates prior evidence or evidence validity is unclear. Current green `devstate check` output can satisfy check evidence; read `./.devstate/status.md` after failures, stale output, conflict resolution, or exact evidence-copy needs. Do not run `vp test`, `vp check`, `bun test`, or `bun check` manually.
11. Update owning change artifacts so finalization status and latest evidence are recorded.
12. Commit finalization changes with a concise message when files changed. Do not create an empty commit only for a clean rebase. Do not amend existing commits.
13. Detach the worker worktree at the final `changes/{{change_id}}` branch tip before marking ready.
14. Do not merge into `main`.
15. Final response must include changed files, checks, OpenSpec change status, and exactly one signal: `<plan-done/>` or `<blocked/>`.

## Signals

- Output `<plan-done/>` when finalization is complete and the branch is ready for review.
- Output `<blocked/>` when blocked; include blocker evidence and likely next focus.

## Rebase Conflict Policy

- Resolve clear structural conflicts: additive imports, adjacent types or helpers, docs evidence merges, test expectation updates, formatting, and both sides coexisting without invariant changes.
- Preserve both sides when possible. Keep the smallest merge that maintains existing behavior and new branch behavior.
- Block only on semantic conflicts: incompatible behavior choices, storage schema or migration ordering uncertainty, auth/security boundary changes, public API shape changes, deletion versus edit, or unclear failing checks after resolution.
- Do not discard user work or invent product/spec decisions to finish a rebase.
- After resolving conflicts, run `devstate check`, read `.devstate/status.md`, and record conflict files plus resolution evidence.
