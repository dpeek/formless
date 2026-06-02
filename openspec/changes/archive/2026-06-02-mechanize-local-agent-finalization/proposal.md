## Why

Local OpenSpec workers currently make too many finalization decisions by hand: they duplicate finalization work in `tasks.md`, manually promote shipped facts, rerun checks even when nothing invalidated prior evidence, and can remain trapped by stale `.git/agent-state` leases after crashes or blocks.

OpenSpec CLI already owns strict validation and archive-time spec delta application, so the local worker workflow should delegate those mechanics to the CLI and keep agents focused on one implementation section at a time.

## What Changes

- Keep implementation workers scoped to one ready `##` section at a time.
- Keep `devstate check` evidence required for each shipped implementation section.
- Change automatic finalization to rebase on local `main`, run strict non-interactive OpenSpec validation, and archive the completed change on the review branch before marking it ready.
- Reuse the latest implementation `devstate check` during finalization unless the rebase, conflict resolution, code edits, or other finalization changes invalidate that evidence.
- Use `openspec archive <change-id> --yes` to apply spec deltas and move the change into the archive before review readiness.
- Remove agent-authored promotion of shipped facts when OpenSpec archive can apply the deltas.
- Keep `tasks.md` free of a final `##` section that duplicates automatic finalization or archive behavior.
- Add explicit recovery semantics for stale `.git/agent-state` leases, while preserving valid `ready-for-review` leases until merge, branch deletion, or explicit release.
- Make rendered worker prompts self-contained for the concrete change id and mode so agents use OpenSpec CLI commands directly instead of generic skills or repeated doc reads.
- Select the active `##` task section before broad context loading, then read only section-relevant change artifacts, specs, and code.
- Reuse OpenSpec CLI state and current devstate output already known to the supervisor or session instead of forcing immediate duplicate reads.
- Reduce duplicated instructions across `AGENTS.md`, `doc/agents/local-agent-workers.md`, and rendered worker prompts.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `local-agent-workers`: update worker finalization, archive, validation, check reuse, task-shape, review-ready lease, stale lease recovery, and context-efficient prompt requirements.

## Impact

- `scripts/agents.ts`: worker finalization mode selection, lease state handling, stale lease detection/release, ready-for-review maintenance, prompt packet rendering, OpenSpec state reuse, and likely tests around local agent state.
- `doc/agents/local-agent-workers.md`: human and supervisor workflow documentation.
- `doc/agents/local-openspec-implement.md`: self-contained implementation prompt guidance for section selection, focused context, task evidence, and no finalization section.
- `doc/agents/local-openspec-finalize.md`: self-contained finalization prompt guidance for rebase, validation, archive, conditional checks, and ready state.
- `openspec/specs/local-agent-workers/spec.md`: canonical worker workflow requirements after this change is archived.
