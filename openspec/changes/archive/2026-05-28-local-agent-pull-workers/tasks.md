## 1. Worker Model

- [x] 1.1 Add local-agent worker docs covering queue source, state root, leases, branch names, worker names, and human merge boundary.
- [x] 1.2 Update existing agent/Ralph docs so GitHub PRD loops and local OpenSpec worker loops are distinct.
- [x] 1.3 Add `.gitignore` or docs updates only if any runtime state path could otherwise appear in a worktree.

## 2. Supervisor Foundation

- [x] 2.1 Add a Bun script entrypoint for local workers, for example `bun agents watch <worker-name>`.
- [x] 2.2 Implement Git common-dir state root resolution and create shared `agent-state` subdirectories.
- [x] 2.3 Implement worker status read/write with owner name, state, branch, current change, heartbeat, and latest evidence.
- [x] 2.4 Implement atomic lease create/read/release helpers with tests.

## 3. Work Discovery and Branch Lifecycle

- [x] 3.1 Discover claimable OpenSpec changes from committed local `main`, ignoring uncommitted worktree files.
- [x] 3.2 Filter claimable changes to those with required apply artifacts complete.
- [x] 3.3 Create or resume `changes/<change-id>` branches from local `main`.
- [x] 3.4 Ensure only one active writer can claim a change branch.

## 4. Implementation and Finalization Loop

- [x] 4.1 Adapt or wrap the Ralph implementation prompt so a local OpenSpec change can ship one ready task per session.
- [x] 4.2 Record task evidence in the owning change artifacts after implementation.
- [x] 4.3 Adapt or wrap finalization so completed changes promote shipped facts into `openspec/specs/*/spec.md`.
- [x] 4.4 Mark completed branches ready for review without merging to `main`.

## 5. Idle Maintenance

- [x] 5.1 Add idle scan for existing `changes/*` branches when no work can be claimed.
- [x] 5.2 Rebase eligible change branches on local `main`.
- [x] 5.3 Record blocked status and conflict evidence when an idle rebase cannot be safely resolved.

## 6. Verification

- [x] 6.1 Add unit tests for state root resolution, lease contention, work discovery, and branch naming.
- [x] 6.2 Add a dry-run or fixture-backed smoke path for `igor` that demonstrates claim, branch selection, and status output.
- [x] 6.3 Run `devstate check` and record evidence in this change.

## Evidence

- 2026-05-28: `bun agents watch igor --once --dry-run` showed claim, branch selection, status output, and Codex command for `local-agent-pull-workers`.
- 2026-05-28: `devstate check` passed. `.devstate/status.md` shows checks ok, web service ready, and watch tests passing.
