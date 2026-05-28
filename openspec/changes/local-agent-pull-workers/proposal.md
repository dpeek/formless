## Why

Ralph currently works best when a human explicitly starts a PRD or issue-backed loop. As OpenSpec becomes the planning source, we need local long-lived workers that pull ready changes from `main`, implement them on review branches, and keep specs current without requiring GitHub.

## What Changes

- Add a local pull-based worker workflow for OpenSpec changes.
- Use committed `openspec/changes/<change-id>/` directories on local `main` as the work queue.
- Use shared local leases in Git's common directory for coordination across worktrees.
- Use stable workstream branches named `changes/<change-id>` for implementation output and review.
- Add worker identity as runtime metadata, not branch naming.
- Add idle behavior that rebases existing change branches on local `main` when no implementation work is available.
- Keep finalization in the worker loop so shipped facts are promoted into `openspec/specs/*/spec.md` before review.
- Avoid GitHub as a required queue, lock, or status system.

## Capabilities

### New Capabilities

- `local-agent-workers`: Local pull-based OpenSpec worker coordination, branch lifecycle, leases, status, idle rebase, and finalization rules.

### Modified Capabilities

- None.

## Impact

- Adds documented contracts for local worker orchestration.
- Likely affects `scripts/` with a new Bun-driven worker supervisor or extensions to the Ralph loop.
- Likely adds ignored runtime state under Git common dir, for example `<git-common-dir>/agent-state/`.
- May update agent docs to distinguish GitHub PRD loops from local OpenSpec worker loops.
- No runtime app schema, storage, UI, media, or site behavior changes.
