## 1. Lease Recovery

- [x] 1.1 Add lease classification helpers for valid active, stale active, blocked, released, and ready-for-review lease states.
- [x] 1.2 Detect stale `claiming`, `working`, and `finalizing` leases from dead recorded PIDs or heartbeat age older than the configured stale heartbeat window.
- [x] 1.3 Allow a worker to recover or release a stale active lease before claiming the change.
- [x] 1.4 Preserve valid `ready-for-review` leases while the review branch is unmerged and still exists.
- [x] 1.5 Release `ready-for-review` leases only after branch merge, branch deletion, or explicit release.
- [x] 1.6 Keep blocked leases visible with blocker evidence and an explicit recovery or release path.
- [x] 1.7 Add tests for stale active lease recovery, blocked lease release, ready-for-review retention, and ready-for-review cleanup after merge or branch deletion.
- [x] 1.8 Run `devstate check` and record evidence for this section from current devstate output or `./.devstate/status.md` when the file is needed.

Evidence:

- Changed `scripts/agents.ts` to classify leases, release stale active leases before claim discovery, release review-ready leases only after branch deletion or merge into `main`, and print blocked lease evidence during idle output.
- Changed `scripts/agents.test.ts` to cover PID and heartbeat staleness, stale active recovery, blocked lease release, ready-for-review retention, and cleanup after branch deletion or merge.
- `devstate check` at 2026-06-02T02:27:30.413Z: checks ok; `vp check --fix` pass; web service ready; test service pass.
- App behavior unchanged; browser smoke not needed.

## 2. CLI-Owned Finalization

- [x] 2.1 Update automatic finalization to rebase `changes/<change-id>` on local `main` before validation and archive.
- [x] 2.2 Run `openspec validate <change-id> --strict --no-interactive` during finalization and block with command evidence on failure.
- [x] 2.3 Run `openspec archive <change-id> --yes` on the review branch and use the archive output for canonical spec updates.
- [x] 2.4 Remove agent-authored manual spec promotion from finalization when OpenSpec archive can apply the change deltas.
- [x] 2.5 Reuse the latest implementation `devstate check` evidence when finalization does not change code, resolve conflicts, or otherwise invalidate that evidence.
- [x] 2.6 Rerun `devstate check` during finalization when rebase changes code, conflicts are resolved, code or generated output is edited, or evidence validity is unclear.
- [x] 2.7 Keep the ready-for-review branch self-contained with code changes, completed tasks/evidence, canonical specs, and archived change files.
- [x] 2.8 Add tests for validate/archive command sequencing, check reuse, invalidated-check reruns, archive failure blocking, and ready-for-review branch state.
- [x] 2.9 Run `devstate check` and record evidence for this section from current devstate output or `./.devstate/status.md` when the file is needed.

Evidence:

- Changed `scripts/agents.ts` so supervisor-owned finalization rebases on local `main`, runs strict non-interactive OpenSpec validation, runs `openspec archive <change-id> --yes`, commits resulting archive/spec changes, detaches at branch tip, and marks the lease ready for review.
- Changed `scripts/agents.ts` to reuse the latest implementation `devstate check` evidence when rebase/archive changes are docs/spec-only, rerun `devstate check` when finalization changes code or evidence is missing/unclear, and block with command evidence on finalization command failures.
- Changed `scripts/agents.test.ts` to cover validate/archive sequencing, reused check evidence, invalidated-check reruns, archive failure blocking, ready-for-review branch state, and already-archived maintenance.
- `devstate check` at 2026-06-02T02:37:06.972Z: checks ok; `vp check --fix` pass; web service ready; test service pass.
- App behavior unchanged; browser smoke not needed.

## 3. Context-Efficient Prompt Packets

- [x] 3.1 Remove generic `openspec-apply-change` skill instructions from rendered worker prompts when the prompt has a concrete change id and mode.
- [x] 3.2 Render concrete OpenSpec CLI commands, task state, change state, and relevant file paths into implementation and finalization prompts when `scripts/agents.ts` already knows them.
- [x] 3.3 Stop requiring workers to reread `doc/agents/local-openspec-implement.md`, `doc/agents/local-openspec-finalize.md`, or `doc/agents/local-agent-workers.md` after `bun agents` injects the rendered prompt.
- [x] 3.4 Update implementation prompts to select the next ready `##` section from `tasks.md` before broad context reads, then load only files needed for that section.
- [x] 3.5 Allow current green `devstate start` or `devstate check` output to satisfy check evidence without immediate `.devstate/status.md` reread, while still reading the file after failures, stale output, conflict resolution, or exact evidence-copy needs.
- [x] 3.6 Add or update tests for prompt rendering, known OpenSpec state injection, no generic skill instruction, section-first context loading, and devstate evidence reuse.
- [x] 3.7 Run `devstate check` and record evidence for this section from current devstate output or `./.devstate/status.md` when the file is needed.

Evidence:

- Changed `scripts/agents.ts` to retain parsed `openspec instructions apply --change "<change-id>" --json` state during claim discovery and mode selection, pass known state into Codex session and dry-run prompt rendering, and render task state, change state, concrete commands, and OpenSpec file paths.
- Changed `doc/agents/local-openspec-implement.md` and `doc/agents/local-openspec-finalize.md` rendered prompt templates to remove generic `openspec-apply-change` and source-doc reread instructions, select implementation sections before broad context reads, and allow current green devstate output as evidence with status-file reads reserved for failures, stale output, conflict resolution, or exact evidence-copy needs.
- Changed `scripts/agents.test.ts` to cover known OpenSpec state injection, dry-run prompt state rendering, no generic skill instruction, section-first context loading, CLI-owned finalization commands, and devstate evidence reuse wording.
- `devstate check` at 2026-06-02T02:47:57.806Z: checks ok; `vp check --fix` pass; web service ready; test service pass.
- App behavior unchanged; browser smoke not needed.

## 4. Worker Docs Alignment

- [x] 4.1 Update `doc/agents/local-agent-workers.md` as human and supervisor reference for CLI-owned validation/archive, conditional finalization checks, self-contained review branches, lease recovery, and context-efficient prompts.
- [x] 4.2 Update `doc/agents/local-openspec-finalize.md` to be a self-contained rendered prompt template with no manual spec promotion, strict validation, archive, conditional checks, and no instruction to reread itself.
- [x] 4.3 Update `doc/agents/local-openspec-implement.md` to be a self-contained rendered prompt template with one-section implementation, section-first context loading, focused context reads, evidence requirements, and no finalization/archive `##` task section.
- [x] 4.4 Update `AGENTS.md` local finalization and worker wording if needed so it keeps repo rules but no longer duplicates detailed workflow mechanics owned by supervisor code or rendered prompts.
- [x] 4.5 Add or update documentation-adjacent tests for the revised worker instructions and duplicated-instruction reduction.
- [x] 4.6 Run `devstate check` and record evidence for this section from current devstate output or `./.devstate/status.md` when the file is needed.

Evidence:

- Changed `doc/agents/local-agent-workers.md` to document CLI-owned validation/archive, conditional finalization checks, self-contained review branches, ready-for-review lease retention, and context-efficient rendered prompts.
- Changed `doc/agents/local-openspec-finalize.md` and `doc/agents/local-openspec-implement.md` to mark rendered prompts self-contained, keep implementation sessions away from finalization/archive work, and keep finalization on strict validation plus OpenSpec archive output.
- Changed `AGENTS.md` to keep repo rules while moving per-session mechanics to rendered prompts and supervisor-owned finalization.
- Changed `scripts/agents.test.ts` to assert prompt self-containment, CLI-owned finalization wording, context-efficient worker docs, and removal of stale manual-promotion/post-review archive instructions.
- `devstate check` at 2026-06-02T02:54:08.457Z: checks ok; `vp check --fix` pass; web service ready; test service pass.
- App behavior unchanged; browser smoke not needed.
