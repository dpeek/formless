## Context

Current Ralph usage is push-based: a human starts a loop for a PRD issue or path, and the loop ships one chunk at a time. The OpenSpec direction changes the source of work. A human and interactive Codex session should create OpenSpec changes on `main`; long-lived local workers should discover those changes, claim one, implement it in a worktree, finalize specs, and leave a branch for human review.

The first version is local-only. GitHub can remain available for discussion or remote backup, but it is not the queue, lock service, or required status store.

## Goals / Non-Goals

**Goals:**

- Let named workers, starting with `igor`, pull ready OpenSpec changes from local `main`.
- Coordinate across worktrees without GitHub.
- Keep branch names tied to workstreams: `changes/<change-id>`.
- Keep worker identity in leases, status, and logs.
- Preserve Ralph's quality loop: one ready chunk at a time, `devstate check`, browser smoke when behavior changes, rebase on local `main`, commit.
- Include finalization before review so shipped facts are promoted into `openspec/specs/*/spec.md`.
- Rebase existing local change branches when no implementation work is available.

**Non-Goals:**

- No task-sharing within one OpenSpec change in the first version.
- No merge automation into `main`.
- No required GitHub issue, label, comment, or PR workflow.
- No distributed lock across multiple clones or machines.
- No replacement for interactive OpenSpec authoring.

## Decisions

### Use local `main` as the queue

Workers discover work by reading committed `openspec/changes/<change-id>/` directories from local `main`. This keeps work creation local and reviewable. A worker MUST NOT treat uncommitted files in a human worktree as claimable work.

Alternative considered: GitHub issues and labels. Rejected for the local-first goal.

### Store runtime state in Git common dir

Worker state lives under:

```txt
<git-common-dir>/agent-state/
  leases/
  workers/
  logs/
```

The common dir is resolved with:

```sh
git rev-parse --path-format=absolute --git-common-dir
```

This is shared by all worktrees from the same clone and never tracked.

Alternative considered: `.agent-state/` in the repo root. Rejected because each worktree would get its own untracked directory.

### Use leases for ownership

Claiming a change uses an atomic filesystem operation, such as creating a lease directory. The lease records change id, owner name, branch, process id when available, heartbeat time, state, and latest evidence. Branch names are not locks.

Alternative considered: infer ownership from `changes/<change-id>` branch existence. Rejected because branch inspection is not an atomic claim.

### Use `changes/<change-id>` branches

Implementation output goes to `changes/<change-id>`, independent of the current worker. This keeps handoff clean and makes review branches stable.

Alternative considered: `codex/<worker>/<change-id>`. Rejected because worker ownership can change while the workstream remains the same.

### Prefer a supervisor process

The first implementation should add a Bun-driven supervisor, for example `bun agents watch igor`. The supervisor owns discovery, leases, worktree setup, branch selection, idle rebase, and launching the existing implementation/finalization loop in the worker worktree.

Self-contained workers can come later, but the supervisor gives one enforcement point for local rules.

### One active writer per change branch

The first version allows only one active lease for a change. If a change is too large for one worker, split it into multiple OpenSpec changes before workers claim it.

Task-level branch fanout can be added later with integration branches if needed.

## Risks / Trade-offs

- Stale lease blocks work -> Provide heartbeat status and an explicit release command before adding aggressive automatic stealing.
- Branch rebase conflicts during idle work -> Mark branch blocked with conflict evidence; do not resolve unclear conflicts automatically.
- Workers implement stale changes -> Rebase branch on local `main` before work and before final review-ready state.
- Human creates too-large changes -> Keep chunking pressure in `tasks.md`; workers can stop blocked and request split.
- Local-only state is not shared across clones -> Accept for v1; remote coordination can be added later if needed.

## Migration Plan

1. Add the local-agent worker capability and docs.
2. Add a supervisor command that can run one named worker.
3. Run `igor` against local OpenSpec changes.
4. Keep current Ralph commands available for GitHub PRD work until the local worker loop is trusted.
5. Add more workers after status, lease release, and idle rebase are stable.

Rollback is stopping the supervisor and deleting `<git-common-dir>/agent-state/`; existing `changes/<change-id>` branches remain normal Git branches.

## Open Questions

- What exact timeout should mark a heartbeat stale?
- Should the worker auto-finalize as soon as all tasks are done, or require an explicit review-ready state before finalization?
- Should the supervisor fetch a remote before reading `main` when a remote is configured, or stay strictly local by default?
