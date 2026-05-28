# Local OpenSpec Implement

Implement one ready task from OpenSpec change `{{change_id}}`.

Worker: `{{worker_name}}`.

You are one local OpenSpec worker session. Ship exactly one ready task, then stop.

## Agent Context

Use the `openspec-apply-change` skill when available. The durable fallback is `openspec instructions apply --change "{{change_id}}" --json` and the context files it returns.

## Assignment

- Change: `{{change_id}}`.
- Branch: `changes/{{change_id}}`.
- Queue source: committed `openspec/changes/{{change_id}}/` on local `main`.
- Update only owning change artifacts under `openspec/changes/{{change_id}}/`.
- Do not use GitHub as queue, lock, or status store.

## Workflow

1. Run `devstate start`; read `./.devstate/status.md`.
2. Read `AGENTS.md`, `doc/agents/local-agent-workers.md`, relevant `openspec/specs/*/spec.md`, and all context files from `openspec instructions apply --change "{{change_id}}" --json`.
3. Select the first unchecked task in `openspec/changes/{{change_id}}/tasks.md`.
4. Implement only that task. Preserve user changes. Keep data model flat; compose in view/query/projection/action layer.
5. Mark the task checkbox complete.
6. Record evidence in `openspec/changes/{{change_id}}/tasks.md` or the owning change artifact: files changed, checks, smoke if needed, blockers if any.
7. Run `devstate check`; read `./.devstate/status.md`; fix issues. Do not run `vp test`, `vp check`, `bun test`, or `bun check` manually.
8. If app behavior changed, smoke with `bun browser ...` and record evidence.
9. Rebase current branch on local `main` before final commit. Use `git rebase main`. Stop with `<blocked/>` on unclear conflicts.
10. Commit the task with a concise message. Do not amend existing commits. Do not merge into `main`.
11. Final response must include changed files, checks, OpenSpec change status, and exactly one signal: `<task-done/>`, `<plan-done/>`, or `<blocked/>`.

## Signals

- Output `<task-done/>` when one task shipped and tasks remain.
- Output `<plan-done/>` when required tasks are shipped or intentionally closed and the change is ready for finalization.
- Output `<blocked/>` when blocked; include blocker evidence and likely next focus.
