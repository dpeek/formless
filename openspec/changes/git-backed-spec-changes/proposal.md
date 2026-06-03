## Why

The current local OpenSpec worker flow leaves archived change artifacts in the tracked filesystem after every completed change, which creates review and navigation noise without adding shipped runtime behavior. Git already stores the branch, diff, commit history, and merge boundary, so change-scoped planning state can move into Git-backed change metadata and leave canonical specs as the only lasting documentation.

## What Changes

- **BREAKING** Replace committed `openspec/changes/<change-id>/` queue items with Git-backed `changes/<change-id>` branches as the worker-claimable change source.
- Store proposal, design, task state, evidence, status, and machine-readable metadata in the change commit message instead of `proposal.md`, `design.md`, `tasks.md`, and spec delta files.
- Treat the branch diff against `main` as the spec and code delta for review.
- Edit canonical `openspec/specs/*/spec.md` files directly on the change branch instead of producing OpenSpec spec deltas and archived change directories.
- Finalize by validating structured commit metadata, rebasing on local `main`, running required checks when evidence is invalidated, and marking the branch ready for review without running `openspec archive`.
- Replace the split `doc/agents/local-openspec-*` prompt docs and repo `openspec-*` skills with repo-owned Git-backed change skills as the single workflow instruction source.
- Keep existing local Git common-dir leases, worker branches, review branches, idle maintenance, and human merge boundary.
- Do not use Git notes as primary state; reserve them only for optional non-authoritative logs if needed.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `local-agent-workers`: Change worker discovery, prompt context, implementation memory, finalization, review-ready contents, and feedback handling from OpenSpec artifact directories to structured Git-backed change branches.

## Impact

- Affected docs and skills: `AGENTS.md`, `doc/agents/local-agent-workers.md`, `doc/agents/local-openspec-*`, `.agents/skills/openspec-*`, new Git-backed change skills, and the `local-agent-workers` capability spec.
- Affected code: `scripts/agents.ts` queue discovery, status parsing, prompt rendering, finalization, branch maintenance, and tests.
- Affected workflow: humans create and review change branches instead of committed OpenSpec change directories; review-ready branches contain code, canonical spec edits, and structured commit metadata, but no archived change directory.
