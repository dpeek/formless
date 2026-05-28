## 1. Worker Model

- [ ] 1.1 Add local-agent worker docs covering queue source, state root, leases, branch names, worker names, and human merge boundary.
- [ ] 1.2 Update existing agent/Ralph docs so GitHub PRD loops and local OpenSpec worker loops are distinct.
- [ ] 1.3 Add `.gitignore` or docs updates only if any runtime state path could otherwise appear in a worktree.

## 2. Supervisor Foundation

- [ ] 2.1 Add a Bun script entrypoint for local workers, for example `bun agents watch <worker-name>`.
- [ ] 2.2 Implement Git common-dir state root resolution and create shared `agent-state` subdirectories.
- [ ] 2.3 Implement worker status read/write with owner name, state, branch, current change, heartbeat, and latest evidence.
- [ ] 2.4 Implement atomic lease create/read/release helpers with tests.

## 3. Work Discovery and Branch Lifecycle

- [ ] 3.1 Discover claimable OpenSpec changes from committed local `main`, ignoring uncommitted worktree files.
- [ ] 3.2 Filter claimable changes to those with required apply artifacts complete.
- [ ] 3.3 Create or resume `changes/<change-id>` branches from local `main`.
- [ ] 3.4 Ensure only one active writer can claim a change branch.

## 4. Implementation and Finalization Loop

- [ ] 4.1 Adapt or wrap the Ralph implementation prompt so a local OpenSpec change can ship one ready task per session.
- [ ] 4.2 Record task evidence in the owning change artifacts after implementation.
- [ ] 4.3 Adapt or wrap finalization so completed changes promote shipped facts into `openspec/specs/*/spec.md`.
- [ ] 4.4 Mark completed branches ready for review without merging to `main`.

## 5. Idle Maintenance

- [ ] 5.1 Add idle scan for existing `changes/*` branches when no work can be claimed.
- [ ] 5.2 Rebase eligible change branches on local `main`.
- [ ] 5.3 Record blocked status and conflict evidence when an idle rebase cannot be safely resolved.

## 6. Verification

- [ ] 6.1 Add unit tests for state root resolution, lease contention, work discovery, and branch naming.
- [ ] 6.2 Add a dry-run or fixture-backed smoke path for `igor` that demonstrates claim, branch selection, and status output.
- [ ] 6.3 Run `devstate check` and record evidence in this change.
