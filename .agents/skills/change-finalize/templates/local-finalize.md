# Local Git-backed Finalize

Finalize Git-backed Formless change `{{change_id}}`.

Worker: `{{worker_name}}`.

You are a local Git-backed finalization session. Finalize before marking the branch ready for review.
This rendered prompt is self-contained for this session.
Skill-owned instruction source: `.agents/skills/change-finalize/templates/local-finalize.md`.

## Known Parsed Change Metadata

{{known_change_metadata}}

## Known Task State

{{known_task_state}}

## Known Branch Diff

{{known_branch_diff}}

## Assignment

- Change: `{{change_id}}`.
- Review branch: `changes/{{change_id}}`.
- Worker branch: `agents/{{worker_name}}`.
- Worker worktree: `./tmp/worktree/{{worker_name}}`.
- Queue source: local `changes/{{change_id}}` branch tip commit metadata.
- Update structured commit metadata and canonical specs already present on the branch.
- Do not use external systems as queue, lock, or status store.

## Concrete Commands

{{git_backed_helper_commands}}

- Rebase on local main: `git rebase main`.
- Validate structured metadata: `git log --no-notes -1 --format=%B HEAD`.
- Validate the finalization gate: `bun check:ready`.

## Workflow

1. Read `AGENTS.md`.
2. Verify all required metadata tasks are shipped or intentionally closed. Stop with `<blocked/>` if the change is not ready.
3. Rebase current branch on local `main`. Use `git rebase main`; resolve clear structural conflicts and stop with `<blocked/>` only for semantic conflicts.
4. Validate the rebased tip commit metadata. Stop with `<blocked/>` if required sections, trailers, branch id, or task state are invalid.
5. Run `bun check:ready`; block with command evidence on failure.
6. Do not run `openspec archive` and do not commit archived change files.
7. Update the tip commit metadata with finalization evidence, `Formless-Change-State: ready-for-review`, and latest evidence time using `git commit --amend --cleanup=verbatim`; re-run `bun agents change {{change_id}} --json` after the amendment.
8. Leave `changes/{{change_id}}` as the review branch and do not check it out in the worker worktree.
9. Do not merge into `main`.
10. Final response must include changed files, checks, OpenSpec change status, and exactly one signal: `<plan-done/>` or `<blocked/>`.

## Signals

- Output `<plan-done/>` when finalization is complete and the branch is ready for review.
- Output `<blocked/>` when blocked; include blocker evidence and likely next focus.

## Rebase Conflict Policy

- Resolve clear structural conflicts: additive imports, adjacent types or helpers, docs evidence merges, test expectation updates, formatting, and both sides coexisting without invariant changes.
- Preserve both sides when possible. Keep the smallest merge that maintains existing behavior and new branch behavior.
- Block only on semantic conflicts: incompatible behavior choices, storage schema or migration ordering uncertainty, auth/security boundary changes, public API shape changes, deletion versus edit, or unclear failing checks after resolution.
- Do not discard user work or invent product/spec decisions to finish a rebase.
- After resolving conflicts, run `bun check:ready` and record conflict files plus resolution evidence.
