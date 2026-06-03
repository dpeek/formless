# Local Agent Workers

Local agent workers pull Git-backed Formless changes from local Git state.

## Commands

- Start one worker: `bun agents watch <worker-name>`.
- Dry-run one pass: `bun agents watch <worker-name> --once --dry-run`.
- List local change metadata: `bun agents changes --json`.
- Inspect one change: `bun agents change <change-id> --json`.
- Inspect worker state: `bun agents status [worker-name]`.
- Release a lease: `bun agents release <change-id> [--owner <worker-name>]`.
- Worker names determine the checked-out `agents/<worker-name>` branch. Review output lands on `changes/<change-id>`.

## Queue

- Queue source: local `changes/<change-id>` branches.
- A claimable branch tip must contain valid Formless change metadata.
- Metadata sections are `Proposal`, `Design`, `Tasks`, `Evidence`, and `Blockers`.
- Required trailers are `Formless-Change-Id`, `Formless-Change-Version`, `Formless-Change-State`, `Formless-Capabilities`, and `Formless-Last-Evidence-At`.
- Supported states are `draft`, `ready`, `working`, `blocked`, and `ready-for-review`.
- Worker implementation claims `ready` or `working` branches. Branches with no remaining tasks move to finalization when no active or ready-for-review lease blocks them.
- Invalid metadata, non-claimable states, Git notes, and untracked files are not authoritative queue state.
- When multiple unleased branches are claimable, workers prefer branches with unmerged implementation, then deterministic change id order.
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
- The lease record stores change id, owner, branch, state, heartbeat time, process identity, and latest evidence.
- Only the active lease owner publishes to `changes/<change-id>`.
- Branch existence is not ownership.
- Active `claiming`, `working`, and `finalizing` leases block other workers until stale or released.
- A `blocked` lease exposes blocker evidence and requires explicit release or recovery.
- A `ready-for-review` lease is retained while `changes/<change-id>` exists as an unmerged local branch.
- A `ready-for-review` lease can be released after branch merge, branch deletion, or explicit release.

## Branches

- Default worker worktree: `./tmp/worktree/<worker-name>`.
- Review branch and queue item: `changes/<change-id>`.
- Checked-out worker branch: `agents/<worker-name>`.
- The supervisor checks out `agents/<worker-name>` in the worker worktree and resets it to `changes/<change-id>` before a claim or maintenance pass.
- A worker reuses its named worktree across changes by resetting `agents/<worker-name>` to the active review branch.
- After a successful implementation or finalization session, the supervisor publishes the worker branch tip back to `changes/<change-id>`.
- A handoff keeps the same review branch and changes only lease/status owner metadata.

## Workflow Instructions

- Repo-owned skills are the authored workflow source for Git-backed changes.
- Implementation prompt template: `.agents/skills/formless-git-change-apply/templates/local-implement.md`.
- Finalization prompt template: `.agents/skills/formless-git-change-finalize/templates/local-finalize.md`.
- `doc/agents/local-openspec-implement.md` and `doc/agents/local-openspec-finalize.md` are legacy stable pointers only.
- Rendered worker prompts are self-contained for the session and include known metadata, task state, branch diff, concrete commands, and relevant paths.
- Worker sessions still read `AGENTS.md`; prompt source docs are reference and not required per-session reads.

## Implementation Loop

- One implementation session ships one ready task section from the change commit metadata.
- The selected section includes the heading and task checkboxes until the next task section or end of metadata.
- A section session does not cross into another task section.
- Workers select the active section before broad context reads and then load only section-relevant metadata, canonical specs, docs, and code.
- The branch diff from local `main` is the implementation and review delta.
- Shipped spec facts are direct edits to canonical `openspec/specs/*/spec.md` files on the branch.
- The section session runs `devstate check` and records evidence from current devstate output or `.devstate/status.md` when exact status-file evidence is needed.
- App behavior changes require configured browser smoke evidence.
- Task state, evidence, blockers, and trailers are recorded in the branch tip commit message.
- Git-backed implementation updates the branch tip, usually with `git add -A` and `git commit --amend`.
- Implementation does not perform automatic finalization, archive, spec promotion, or ready-for-review work.

## Finalization

- Finalization runs after all required metadata tasks are shipped or intentionally closed.
- The finalizer rebases `agents/<worker-name>` on local `main`.
- It validates structured commit metadata from the rebased tip.
- It runs `openspec validate --specs --strict --no-interactive`.
- It does not run `openspec archive` and does not commit archived change files.
- It reuses latest implementation `devstate check` evidence when rebase, conflict resolution, code edits, generated output edits, and evidence ambiguity do not invalidate it.
- It reruns `devstate check` when finalization invalidates prior evidence or cannot prove coverage.
- Review-ready means the branch is a clean merge candidate with code changes, completed task evidence, canonical specs, and structured commit metadata.
- Review-ready `changes/<change-id>` branches must not remain checked out by worker worktrees.
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

- Humans provide implementation feedback by updating structured change metadata on `changes/<change-id>`.
- The worker refreshes or rebases `agents/<worker-name>` from `changes/<change-id>`, reads the updated metadata, and updates implementation, task evidence, and canonical specs to match.
- If feedback has semantic conflicts with shipped behavior, the worker records blocker evidence instead of guessing.

## Idle Maintenance

- Each watch pass first scans `ready-for-review` leases.
- If a review-ready branch does not contain local `main`, the worker adopts the lease, runs finalization maintenance on `agents/<worker-name>`, rebases on local `main`, runs checks only when evidence is invalidated or unclear, publishes to `changes/<change-id>`, and marks the branch ready again.
- If no change can be claimed or refreshed, the worker scans unleased local `changes/*` branches.
- Eligible unleased branches are rebased through `agents/<worker-name>` and published back to `changes/<change-id>`.
- Semantic rebase conflicts are recorded as blocked status with evidence.

## Human Boundary

- Workers leave review-ready `changes/<change-id>` branches.
- Workers do not check out review-ready `changes/<change-id>` branches after finalization.
- Workers do not merge into `main`.
