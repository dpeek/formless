## Context

The local agent worker flow is specified in `openspec/specs/local-agent-workers/spec.md`, implemented by `scripts/agents.ts`, and explained to agent sessions through `doc/agents/local-openspec-implement.md` and `doc/agents/local-openspec-finalize.md`.

Current finalization asks agents to manually promote shipped facts into canonical specs and always run `devstate check`. OpenSpec CLI exposes the mechanical commands needed here: `openspec validate <change-id> --strict --no-interactive` for validation and `openspec archive <change-id> --yes` to archive a completed change and update main specs.

Recent worker logs also show avoidable context load: prompts tell workers to use generic skills even when a concrete change id is known, reread injected prompt source docs, read broad context before selecting a task section, rerun OpenSpec state commands already executed by the supervisor, and reread `.devstate/status.md` immediately after devstate already printed current green status.

## Goals / Non-Goals

**Goals:**

- Keep implementation sessions limited to one ready `##` section and one `devstate check` evidence record per shipped section.
- Move mechanical finalization to CLI-backed validation and archive.
- Make review-ready branches self-contained: implementation, completed tasks/evidence, canonical spec updates, and archived change files.
- Avoid rerunning `devstate check` in finalization when the last implementation check remains valid.
- Recover stale `claiming`, `working`, `finalizing`, and `blocked` leases without reclaiming valid `ready-for-review` leases.
- Render concise, self-contained worker prompt packets that include known change id, mode, task state, and relevant OpenSpec file paths.
- Reduce repeated context reads by selecting the active task section first and loading only section-relevant artifacts, specs, and code.
- Keep duplicated workflow mechanics out of `AGENTS.md` and human docs where the injected worker prompt or supervisor code can own them.

**Non-Goals:**

- Changing OpenSpec CLI behavior.
- Merging review-ready branches into `main`.
- Replacing local Git state as the worker queue or lock store.
- Adding task sharing inside a single change branch.

## Decisions

1. Use OpenSpec archive as the spec promotion mechanism.

   Finalization runs `openspec validate <change-id> --strict --no-interactive`, then `openspec archive <change-id> --yes`. Agents no longer edit `openspec/specs/*/spec.md` by interpreting shipped facts when the change has spec deltas that archive can apply. This keeps canonical spec updates mechanical and tied to OpenSpec's delta model.

2. Archive on the review branch before marking ready.

   The worker archives on `changes/<change-id>` after implementation tasks are complete and after rebasing on local `main`. The branch remains for human review and is not merged by the worker. This makes the review branch contain code changes, completed evidence, archive output, and canonical specs.

3. Make finalization checks conditional.

   Implementation sections still run `devstate check` and record evidence. Finalization reuses that evidence unless its rebase, conflict resolution, code edits, generated files, or other changes invalidate the checked tree. A conservative implementation can rerun `devstate check` whenever it cannot prove the latest implementation evidence still covers the final branch state.

4. Keep automatic finalization out of task sections.

   `tasks.md` describes implementation work only. Workers trigger finalization when OpenSpec apply state reports all required tasks shipped or intentionally closed. A final `##` section for validation/archive is duplicate workflow and should not be generated.

5. Classify leases before blocking claims.

   The supervisor treats `claiming`, `working`, and `finalizing` leases as recoverable when their recorded PID is dead or their heartbeat is older than the configured stale heartbeat window. `ready-for-review` leases are retained unless the branch has been merged, the branch has been deleted, or a human explicitly releases them. `blocked` leases remain visible and releasable through an explicit recovery path instead of trapping future workers indefinitely.

6. Render section-focused prompt packets.

   `scripts/agents.ts` should pass already-known OpenSpec status or instructions state into the rendered prompt when that state was used to choose implement versus finalize. The prompt should name concrete CLI commands and file paths for the concrete change id, not tell the worker to use a generic `openspec-apply-change` skill. Implementation prompts should select the next ready `##` section from `tasks.md` before broad context loading, then load only the specs, change artifacts, docs, and code needed for that section. Finalization prompts should be self-contained and should not require rereading `doc/agents/local-openspec-finalize.md`; implementation prompts should not require rereading `doc/agents/local-openspec-implement.md`.

7. Keep docs layered.

   `AGENTS.md` should retain non-negotiable repo rules. `doc/agents/local-agent-workers.md` should remain human and supervisor reference. Rendered worker prompts and supervisor code should own concrete operational mechanics for each session. This avoids forcing every worker to consume multiple overlapping docs before doing the assigned section.

## Risks / Trade-offs

- Conditional checks can skip useful signal if evidence tracking is too loose -> Mitigation: rerun `devstate check` whenever finalization cannot prove the prior evidence is still valid.
- `openspec archive` may fail on malformed deltas -> Mitigation: strict non-interactive validation runs before archive, and archive failures leave the lease in `blocked` with command evidence.
- Stale PID detection is local-machine specific -> Mitigation: pair PID checks with heartbeat age, and keep explicit release for ambiguous cases.
- Ready-for-review leases can persist while `main` still has the active change dir -> Mitigation: release them only on merge, branch deletion, or explicit human release so unmerged branches are not reclaimed as fresh work.
- Prompt packets can omit context a section actually needs -> Mitigation: include OpenSpec-provided file paths and task state, and allow workers to read additional files when the selected section makes them relevant.
