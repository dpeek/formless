# Local Git-backed Change Implement

Implement one ready task section from Git-backed Formless change `{{change_id}}`.

Worker: `{{worker_name}}`.

You are one local Git-backed worker session. Ship exactly one ready task section from the change commit metadata, then stop.
This rendered prompt is self-contained for this session.
Skill-owned instruction source: `.agents/skills/formless-git-change-apply/templates/local-implement.md`.

## Known Parsed Change Metadata

{{known_change_metadata}}

## Known Task State

{{known_task_state}}

## Selected Task Section

{{selected_task_section}}

## Branch Diff

{{known_branch_diff}}

## Concrete Commands

{{git_backed_helper_commands}}

- Start repo services and checks: `devstate start`.
- Validate the shipped section: `devstate check`.

## Assignment

- Change: `{{change_id}}`.
- Review branch: `changes/{{change_id}}`.
- Worker branch: `agents/{{worker_name}}`.
- Worker worktree: `./tmp/worktree/{{worker_name}}`.
- Queue source: local `changes/{{change_id}}` branch tip commit metadata.
- Update the branch tip with implementation, task state, evidence, blockers if any, and trailers.
- Do not use external systems as queue, lock, or status store.

## Workflow

1. Run `devstate start`. Current green `devstate start` output can satisfy setup evidence; read `./.devstate/status.md` after failures, stale output, conflict resolution, or exact evidence-copy needs.
2. Read `AGENTS.md`.
3. Use the selected task section above before broad context reads. The selected section includes that heading and its task checkboxes.
4. After selecting the section, read only the commit metadata, canonical specs, docs, and code needed for that section.
5. If the worktree is already mid-rebase, resolve clear structural conflicts, continue the rebase, and stop with `<blocked/>` only for semantic conflicts.
6. Implement only the selected task section. Do not cross into another task section.
7. If the selected task section is too large, internally inconsistent, or crosses an unclear architecture, security, storage, public API, or design boundary, stop with `<blocked/>` and record blocker evidence plus split guidance in commit metadata.
8. Preserve user changes. Keep data model flat; compose in view/query/projection/action layer.
9. Mark only completed task checkboxes from the selected section complete in commit metadata.
10. Record changed files, `devstate check` evidence, browser smoke evidence when app behavior changed, blockers, and split guidance in structured commit metadata.
11. Run `devstate check`. Current green `devstate check` output can satisfy check evidence; read `./.devstate/status.md` after failures, stale output, conflict resolution, or exact evidence-copy needs. Do not run `vp test`, `vp check`, `bun test`, or `bun check` manually.
12. If app behavior changed, smoke with `bun browser ...` and record evidence.
13. Amend the branch tip so the commit message contains updated task state, evidence, blockers if any, and trailers. Do not merge into `main`.
14. Do not perform automatic finalization, archive, spec promotion, or ready-for-review work in this implementation session.
15. Final response must include changed files, checks, change metadata status, and exactly one signal: `<task-done/>`, `<plan-done/>`, or `<blocked/>`.

## Signals

- Output `<task-done/>` when one task section shipped and tasks remain.
- Output `<plan-done/>` when required tasks are shipped or intentionally closed and the change is ready for a finalization pass.
- Output `<blocked/>` when blocked; include blocker evidence and likely next focus.

## Rebase Conflict Policy

- Resolve clear structural conflicts: additive imports, adjacent types or helpers, docs evidence merges, test expectation updates, formatting, and both sides coexisting without invariant changes.
- Preserve both sides when possible. Keep the smallest merge that maintains existing behavior and new branch behavior.
- Block only on semantic conflicts: incompatible behavior choices, storage schema or migration ordering uncertainty, auth/security boundary changes, public API shape changes, deletion versus edit, or unclear failing checks after resolution.
- Do not discard user work or invent product/spec decisions to finish a rebase.
- After resolving conflicts, run `devstate check`, read `.devstate/status.md`, and record conflict files plus resolution evidence.
