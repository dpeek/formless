# Local Git-backed Change Implement

Implement one ready task section from Git-backed Formless change `{{change_id}}`.

Worker: `{{worker_name}}`.

You are one local Git-backed worker session. Ship exactly one ready task section from the change commit metadata, then stop.
This rendered prompt is self-contained for this session.
Skill-owned instruction source: `.agents/skills/change-apply/templates/local-implement.md`.

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

- Validate the completion gate: `devstate check`.

## Assignment

- Change: `{{change_id}}`.
- Review branch: `changes/{{change_id}}`.
- Worker branch: `agents/{{worker_name}}`.
- Worker worktree: `./tmp/worktree/{{worker_name}}`.
- Queue source: local `changes/{{change_id}}` branch tip commit metadata.
- Update the branch tip with implementation, task state, evidence, blockers if any, and trailers.
- Do not use external systems as queue, lock, or status store.

## Workflow

1. Read `AGENTS.md`.
2. Use the selected task section above before broad context reads. The selected section includes that heading and its task checkboxes.
3. After selecting the section, read only the commit metadata, canonical specs, docs, and code needed for that section.
4. If the worktree is already mid-rebase, resolve clear structural conflicts, continue the rebase, and stop with `<blocked/>` only for semantic conflicts.
5. Implement only the selected task section. Do not cross into another task section.
6. If the selected task section is too large, internally inconsistent, or crosses an unclear architecture, security, storage, public API, or design boundary, stop with `<blocked/>` and record blocker evidence plus split guidance in commit metadata.
7. Preserve user changes. Keep data model flat; compose in view/query/projection/action layer.
8. Mark only completed task checkboxes from the selected section complete in commit metadata.
9. Record changed files, `devstate check` evidence, browser smoke evidence when app behavior changed, blockers, and split guidance in structured commit metadata.
10. Run `devstate check`. Current clean `devstate check` output is required for done evidence; read `./.devstate/status.md` after failures, stale output, conflict resolution, or exact evidence-copy needs. If the completion gate is red, diagnose and fix reasonably actionable failures before deciding whether you are blocked. Do not run `vp test`, `vp check`, `bun test`, or `bun check` manually.
11. If app behavior changed, smoke with `bun browser ...` and record evidence.
12. Amend the branch tip so the commit message contains updated task state, evidence, blockers if any, and trailers. Do not merge into `main`.
13. Do not perform automatic finalization, archive, spec promotion, or ready-for-review work in this implementation session.
14. Final response must include changed files, checks, change metadata status, and exactly one signal: `<task-done/>`, `<plan-done/>`, or `<blocked/>`.

## Completion Gate

- A done signal requires the latest `devstate check` from this worker worktree to exit 0 and show checks and services clean. This applies even when failures appear pre-existing, unrelated, flaky, or outside the selected task section.
- If `devstate check` fails, times out, or `.devstate/status.md` shows failed or timed-out checks/services, do not emit `<task-done/>` or `<plan-done/>`. Read the status/logs, identify the failing checks or services, and fix them when there is a reasonable path forward without user input.
- Treat clean `devstate check` as part of shipping the selected section, including failures that appear pre-existing, unrelated, flaky, or outside the selected task section. Do not ignore or merely relabel red checks.
- Stop with `<blocked/>` only when there is no reasonable way forward without user input or a product, architecture, storage, security, public API, or task-scope decision. Record the exact failing tests or services, the fix attempts made, and why further progress needs input. Do not mark the selected task section complete while the completion gate is red.

## Signals

- Output `<task-done/>` only when one task section shipped, tasks remain, and the completion gate is clean.
- Output `<plan-done/>` only when required tasks are shipped or intentionally closed, the change is ready for a finalization pass, and the completion gate is clean.
- Output `<blocked/>` only when there is no reasonable way forward without user input; include blocker evidence, fix attempts, and likely next focus.

## Rebase Conflict Policy

- Resolve clear structural conflicts: additive imports, adjacent types or helpers, docs evidence merges, test expectation updates, formatting, and both sides coexisting without invariant changes.
- Preserve both sides when possible. Keep the smallest merge that maintains existing behavior and new branch behavior.
- Block only on semantic conflicts: incompatible behavior choices, storage schema or migration ordering uncertainty, auth/security boundary changes, public API shape changes, deletion versus edit, or unclear failing checks after resolution.
- Do not discard user work or invent product/spec decisions to finish a rebase.
- After resolving conflicts, run `devstate check`, read `.devstate/status.md`, and record conflict files plus resolution evidence.
