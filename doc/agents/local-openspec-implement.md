# Local OpenSpec Implement

Implement one ready `##` task section from OpenSpec change `{{change_id}}`.

Worker: `{{worker_name}}`.

You are one local OpenSpec worker session. Ship exactly one ready `##` task section from `tasks.md`, then stop.
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
- Queue source: committed `openspec/changes/{{change_id}}/` on local `main`.
- Update only owning change artifacts under `openspec/changes/{{change_id}}/`.
- Do not use external systems as queue, lock, or status store.

## Concrete Commands

- Refresh apply state if known state is absent or stale: `openspec instructions apply --change "{{change_id}}" --json`.
- Check artifact readiness if needed: `openspec status --change "{{change_id}}" --json`.
- Start repo services and checks: `devstate start`.
- Validate the shipped section: `devstate check`.

## Workflow

1. Run `devstate start`. Current green `devstate start` output can satisfy setup evidence; read `./.devstate/status.md` after failures, stale output, conflict resolution, or exact evidence-copy needs.
2. Read `AGENTS.md`.
3. Open `openspec/changes/{{change_id}}/tasks.md` and select the next ready `##` section before broad context reads. Start with the `##` section containing the first unchecked task.
4. The section includes that `##` heading and its task checkboxes until the next `##` heading or end of file.
5. After selecting the section, read only the change artifacts, specs, docs, and code needed for that section. Use the known file paths above as candidates, not as a requirement to read every file.
6. If the worktree is already mid-rebase, resolve clear structural conflicts, continue the rebase, and stop with `<blocked/>` only for semantic conflicts.
7. Implement only that `##` section. Do not cross into another `##` section.
8. If the selected `##` section is too large, internally inconsistent, or crosses an unclear architecture, security, storage, public API, or design boundary, stop with `<blocked/>` and record split guidance.
9. Preserve user changes. Keep data model flat; compose in view/query/projection/action layer.
10. Mark only completed task checkboxes in the selected `##` section complete.
11. Record evidence in `openspec/changes/{{change_id}}/tasks.md` or the owning change artifact: files changed, checks, smoke if needed, blockers if any.
12. Run `devstate check`. Current green `devstate check` output can satisfy check evidence; read `./.devstate/status.md` after failures, stale output, conflict resolution, or exact evidence-copy needs. Do not run `vp test`, `vp check`, `bun test`, or `bun check` manually.
13. Do not perform automatic finalization, archive, spec promotion, or ready-for-review work in this implementation session.
14. If app behavior changed, smoke with `bun browser ...` and record evidence.
15. Commit the `##` section with a concise message. Do not amend existing commits. Do not merge into `main`.
16. Final response must include changed files, checks, OpenSpec change status, and exactly one signal: `<task-done/>`, `<plan-done/>`, or `<blocked/>`.

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
