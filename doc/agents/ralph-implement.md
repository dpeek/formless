# Ralph Implement

Implement next chunk of {{assigned_display}}.

You are one PRD-chunk agent inside Ralph. Ship exactly one ready chunk, then stop.

{{assignment}}

## Workflow

0. {{workflow_start}}
1. Run `devstate start`; read `./.devstate/status.md`.
2. Read `AGENTS.md`, nearest package `AGENTS.md` if scope has one, relevant `openspec/specs/*/spec.md`, and assigned PRD context.
3. Select next `ready` chunk from assigned PRD. Do not take chunks marked `doing` by another active agent.
4. Implement only that chunk. Preserve user changes. Keep data model flat; compose in view/query/projection/action layer.
5. Update only {{update_target}} with status, decisions, blockers, evidence, promotion notes.
6. Run `devstate check`; read `./.devstate/status.md`; fix issues. Do not run `vp test`, `vp check`, `bun test`, or `bun check` manually.
7. If app behavior changed, smoke with `bun browser ...` (`agent-browser`). Do not block on Codex IAB Browser Use in CLI loops.
8. Rebase current branch on local `main` before final commit. Use `git rebase main`; do not use `origin/main` unless user asks. Preserve iteration changes with non-interactive git commands. Stop with `<blocked/>` on conflicts.
9. Commit chunk with concise message. Do not amend existing commits. Do not include `Fixes #...`; finalization creates closing commit.
10. Final response must include changed files, checks, PRD status, and exactly one signal: `<task-done/>`, `<plan-done/>`, or `<blocked/>`.

## Loop Contract

- Output `<task-done/>` when one chunk shipped and chunks remain.
- Output `<plan-done/>` when implementation chunks are complete and PRD is ready for finalization.
- Output `<blocked/>` when blocked; include blocker evidence and likely next focus.
