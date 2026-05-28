# Local Agent Workers

Local agent workers pull ready OpenSpec changes from local Git state.

## Command

- Start one worker: `bun agents watch <worker-name>`.
- Dry-run one pass: `bun agents watch <worker-name> --once --dry-run`.
- Worker names are runtime metadata. They do not affect branch names.

## Queue

- Queue source: committed `openspec/changes/<change-id>/` directories on local `main`.
- Claimable changes must have committed apply artifacts: `proposal.md`, `design.md`, `tasks.md`, and at least one `specs/**/*.md`.
- Uncommitted OpenSpec files in any worktree are ignored.
- GitHub Issues are not the queue, lock, or status store for local workers.

## State

Runtime state lives under Git's common directory:

```txt
<git-common-dir>/agent-state/
  leases/
  workers/
  logs/
```

Resolve the common dir with:

```sh
git rev-parse --path-format=absolute --git-common-dir
```

The state root is shared by worktrees from the same clone and is not tracked.

## Leases

- A worker claims a change by atomically creating `leases/<change-id>/`.
- The lease record stores change id, owner, branch, state, heartbeat time, and latest evidence.
- Only the lease owner writes to `changes/<change-id>`.
- Branch existence is not ownership.

## Branches

- Default worker worktree: `./tmp/worktree/<worker-name>`.
- Implementation branch: `changes/<change-id>`.
- If the branch does not exist, the supervisor creates it from local `main`.
- If the branch exists, the supervisor resumes it in the worker worktree.
- A worker reuses its named worktree across changes by checking out the active `changes/<change-id>` branch.
- A handoff keeps the same branch and changes only lease/status owner metadata.

## Work Loop

- The worker runs a Ralph-compatible local OpenSpec prompt.
- One implementation session ships one ready task.
- The task session runs `devstate check`, reads `.devstate/status.md`, commits the task, and records evidence in the owning change artifacts.
- When all required tasks are shipped or closed, the worker runs finalization before review.
- Finalization rebases on local `main`, promotes shipped facts into `openspec/specs/*/spec.md`, runs `devstate check`, commits, and marks the branch ready for review.

## Idle Maintenance

- If no change can be claimed, the worker scans local `changes/*` branches.
- Eligible branches are rebased on local `main`.
- Unclear rebase conflicts are recorded as blocked status with evidence.

## Human Boundary

- Workers leave review-ready `changes/<change-id>` branches.
- Workers do not merge into `main`.
