# Local OpenSpec Implement

Implement one ready `##` task section from OpenSpec change `{{change_id}}`.

Worker: `{{worker_name}}`.

You are one local OpenSpec worker session. Ship exactly one ready `##` task section from `tasks.md`, then stop.

## Agent Context

Use the `openspec-apply-change` skill when available. The durable fallback is `openspec instructions apply --change "{{change_id}}" --json` and the context files it returns.

## Assignment

- Change: `{{change_id}}`.
- Branch: `changes/{{change_id}}`.
- Worker worktree: `./tmp/worktree/{{worker_name}}`.
- Queue source: committed `openspec/changes/{{change_id}}/` on local `main`.
- Update only owning change artifacts under `openspec/changes/{{change_id}}/`.
- Do not use external systems as queue, lock, or status store.

## Workflow

1. Run `devstate start`; read `./.devstate/status.md`.
2. Read `AGENTS.md`, `doc/agents/local-agent-workers.md`, relevant `openspec/specs/*/spec.md`, and all context files from `openspec instructions apply --change "{{change_id}}" --json`.
3. If the worktree is already mid-rebase, resolve clear structural conflicts, continue the rebase, and stop with `<blocked/>` only for semantic conflicts.
4. Select the next ready `##` section from `openspec/changes/{{change_id}}/tasks.md`. Start with the `##` section containing the first unchecked task.
5. The section includes that `##` heading and its task checkboxes until the next `##` heading or end of file.
6. Implement only that `##` section. Do not cross into another `##` section.
7. If the selected `##` section is too large, internally inconsistent, or crosses an unclear architecture, security, storage, public API, or design boundary, stop with `<blocked/>` and record split guidance.
8. Preserve user changes. Keep data model flat; compose in view/query/projection/action layer.
9. Mark only completed task checkboxes in the selected `##` section complete.
10. Record evidence in `openspec/changes/{{change_id}}/tasks.md` or the owning change artifact: files changed, checks, smoke if needed, blockers if any.
11. Run `devstate check`; read `./.devstate/status.md`; fix issues. Do not run `vp test`, `vp check`, `bun test`, or `bun check` manually.
12. If app behavior changed, smoke with `bun browser ...` and record evidence.
13. Commit the `##` section with a concise message. Do not amend existing commits. Do not merge into `main`.
14. Final response must include changed files, checks, OpenSpec change status, and exactly one signal: `<task-done/>`, `<plan-done/>`, or `<blocked/>`.

## Signals

- Output `<task-done/>` when one `##` section shipped and tasks remain.
- Output `<plan-done/>` when required tasks are shipped or intentionally closed and the change is ready for automatic finalization.
- Output `<blocked/>` when blocked; include blocker evidence and likely next focus.

## Rebase Conflict Policy

- Resolve clear structural conflicts: additive imports, adjacent types or helpers, docs evidence merges, test expectation updates, formatting, and both sides coexisting without invariant changes.
- Preserve both sides when possible. Keep the smallest merge that maintains existing behavior and new branch behavior.
- Block only on semantic conflicts: incompatible behavior choices, storage schema or migration ordering uncertainty, auth/security boundary changes, public API shape changes, deletion versus edit, or unclear failing checks after resolution.
- Do not discard user work or invent product/spec decisions to finish a rebase.
- After resolving conflicts, run `devstate check`, read `.devstate/status.md`, and record conflict files plus resolution evidence.
