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
- External systems are not the queue, lock, or status store for local workers.

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
- Only the active lease owner writes to `changes/<change-id>`.
- Branch existence is not ownership.
- A review-ready branch keeps a `ready-for-review` lease so workers do not reclaim the committed change from local `main`.
- An idle worker may adopt a `ready-for-review` lease only to refresh a branch that no longer contains local `main`; use `bun agents release <change-id>` only when intentionally reopening implementation ownership.

## Branches

- Default worker worktree: `./tmp/worktree/<worker-name>`.
- Implementation branch: `changes/<change-id>`.
- If the branch does not exist, the supervisor creates it from local `main`.
- If the branch exists, the supervisor resumes it in the worker worktree.
- A worker reuses its named worktree across changes by checking out the active `changes/<change-id>` branch.
- A handoff keeps the same branch and changes only lease/status owner metadata.

## Work Loop

- The worker runs a local OpenSpec prompt.
- One implementation session ships one ready `##` section from `openspec/changes/<change-id>/tasks.md`.
- The section includes that `##` heading and its task checkboxes until the next `##` heading or end of file.
- A section session does not cross into another `##` section.
- If the selected section is too large, internally inconsistent, or crosses an unclear architecture, security, storage, public API, or design boundary, the worker records blocker evidence and split guidance.
- The section session runs `devstate check`, reads `.devstate/status.md`, commits the section, and records evidence in the owning change artifacts.
- Implementation section commits do not rebase by default.
- If a worker resumes a worktree already mid-rebase, it follows the rebase conflict policy before selecting more work.
- When all required tasks are shipped or closed, the worker runs finalization before review.
- Finalization rebases on local `main`, reconciles changed OpenSpec artifacts from `main`, promotes shipped facts into `openspec/specs/*/spec.md`, runs `devstate check`, commits, detaches the worker worktree at the final branch tip, and marks the branch ready for review.
- Review-ready means the branch is a clean merge candidate with promoted specs included.
- Review-ready branches must not remain checked out by worker worktrees.
- Review-ready branches retain their lease until manual release or repository cleanup removes the local worker state.
- Workers do not archive OpenSpec changes. Archiving is a separate process after review and merge.

## Rebase Conflict Policy

- Resolve clear structural conflicts instead of blocking.
- Clear conflicts include additive imports, adjacent types or helpers, docs evidence merges, test expectation updates, formatting, and both sides coexisting without invariant changes.
- Preserve both sides when possible. Keep the smallest merge that maintains existing behavior and new branch behavior.
- Block only on semantic conflicts: incompatible behavior choices, storage schema or migration ordering uncertainty, auth/security boundary changes, public API shape changes, deletion versus edit, or unclear failing checks after resolution.
- Do not discard user work or invent product/spec decisions to finish a rebase.
- After resolving conflicts, run `devstate check`, read `.devstate/status.md`, and record conflict files plus resolution evidence.

## Feedback Loop

- Humans may provide implementation feedback by editing the committed change artifacts on local `main`.
- The worker rebases the change branch on local `main`, reads the updated change artifacts, and updates implementation and promoted spec diffs to match.
- If feedback has semantic conflicts with shipped behavior, the worker records blocker evidence instead of guessing.

## Idle Maintenance

- Each watch pass first scans `ready-for-review` leases.
- If a review-ready branch does not contain local `main`, the worker adopts the lease, runs a finalization session, rebases on local `main`, runs checks, detaches the worktree, and marks the branch ready again.
- If no change can be claimed or refreshed, the worker scans unleased local `changes/*` branches.
- Eligible unleased branches are rebased on local `main`.
- Semantic rebase conflicts are recorded as blocked status with evidence.

## Human Boundary

- Workers leave review-ready `changes/<change-id>` branches.
- Workers detach from review-ready branches after finalization.
- Workers do not merge into `main`.
