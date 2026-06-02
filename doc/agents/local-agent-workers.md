# Local Agent Workers

Local agent workers pull ready OpenSpec changes from local Git state.

## Command

- Start one worker: `bun agents watch <worker-name>`.
- Dry-run one pass: `bun agents watch <worker-name> --once --dry-run`.
- Worker names are runtime metadata. They do not affect branch names.

## Queue

- Queue source: committed `openspec/changes/<change-id>/` directories on local `main`.
- Claimable changes must have committed apply artifacts: `proposal.md`, `design.md`, `tasks.md`, and at least one `specs/**/*.md`.
- Claimable changes must have remaining OpenSpec work; `all_done` changes are skipped unless they already have an active worker lease.
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
- Rendered implementation prompts include known OpenSpec state, concrete commands, task state, and relevant file paths.
- Implementation prompts select the active `##` section before broad context reads and then load only section-relevant artifacts, specs, docs, and code.
- Prompt source docs are templates and human reference, not required per-session context after `bun agents` injects a rendered prompt.
- If the selected section is too large, internally inconsistent, or crosses an unclear architecture, security, storage, public API, or design boundary, the worker records blocker evidence and split guidance.
- The section session runs `devstate check`, commits the section, and records evidence from current devstate output or `.devstate/status.md` when exact status-file evidence is needed.
- Implementation section commits do not rebase by default.
- If a worker resumes a worktree already mid-rebase, it follows the rebase conflict policy before selecting more work.
- When all required tasks are shipped or closed, the worker runs finalization before review.
- Finalization rebases on local `main`, reconciles changed OpenSpec artifacts from `main`, runs `openspec validate <change-id> --strict --no-interactive`, runs `openspec archive <change-id> --yes`, commits archive output, detaches the worker worktree at the final branch tip, and marks the branch ready for review.
- Finalization reuses latest implementation `devstate check` evidence when rebase, archive, and artifact reconciliation do not invalidate it.
- Finalization reruns `devstate check` when rebase changes code, conflicts are resolved, code or generated output is edited, or evidence validity is unclear.
- Review-ready means the branch is a clean merge candidate with code changes, completed task evidence, canonical specs, and archived change files included.
- Review-ready branches must not remain checked out by worker worktrees.
- Review-ready branches retain their lease until branch merge, branch deletion, or explicit release.
- Workers do not merge review-ready branches into `main`.

## Rebase Conflict Policy

- Resolve clear structural conflicts instead of blocking.
- Clear conflicts include additive imports, adjacent types or helpers, docs evidence merges, test expectation updates, formatting, and both sides coexisting without invariant changes.
- Preserve both sides when possible. Keep the smallest merge that maintains existing behavior and new branch behavior.
- Block only on semantic conflicts: incompatible behavior choices, storage schema or migration ordering uncertainty, auth/security boundary changes, public API shape changes, deletion versus edit, or unclear failing checks after resolution.
- Do not discard user work or invent product/spec decisions to finish a rebase.
- After resolving conflicts, run `devstate check`, read `.devstate/status.md`, and record conflict files plus resolution evidence.

## Feedback Loop

- Humans may provide implementation feedback by editing the committed change artifacts on local `main`.
- The worker rebases the change branch on local `main`, reads the updated change artifacts, and updates implementation, task evidence, OpenSpec artifacts, and any archive output to match.
- If feedback has semantic conflicts with shipped behavior, the worker records blocker evidence instead of guessing.

## Idle Maintenance

- Each watch pass first scans `ready-for-review` leases.
- If a review-ready branch does not contain local `main`, the worker adopts the lease, runs finalization maintenance, rebases on local `main`, runs checks only when evidence is invalidated or unclear, detaches the worktree, and marks the branch ready again.
- If no change can be claimed or refreshed, the worker scans unleased local `changes/*` branches.
- Eligible unleased branches with remaining OpenSpec work are rebased on local `main`.
- Semantic rebase conflicts are recorded as blocked status with evidence.

## Human Boundary

- Workers leave review-ready `changes/<change-id>` branches.
- Workers detach from review-ready branches after finalization.
- Workers do not merge into `main`.
