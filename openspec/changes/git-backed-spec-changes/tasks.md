## 1. Change Metadata Model

- [x] 1.1 Add a typed parser for Formless change commit messages with proposal, design, tasks, evidence, blocker, and trailer fields.
- [x] 1.2 Add a formatter that preserves unchanged sections while updating task state, evidence, blockers, and machine-readable trailers.
- [x] 1.3 Add tests for valid metadata, missing trailers, branch/change-id mismatch, malformed task sections, and non-authoritative Git notes or untracked files.
- [x] 1.4 Add JSON query helpers or `bun agents` commands that list valid change branches and report invalid metadata with actionable errors.

Evidence:

- Changed `scripts/agents.ts` to parse and format structured Formless change commit metadata, query local `changes/*` branch tip messages with `git log --no-notes`, and expose `bun agents changes --json` / `bun agents change <change-id> --json`.
- Changed `scripts/agents.test.ts` to cover valid metadata, missing trailers, branch/change-id mismatch, malformed task sections, formatter preservation, non-authoritative notes or worktree files, query helper output, and JSON command output.
- `devstate check` at 2026-06-03T02:01:18.169Z: checks ok; services running; web ready; test watcher pass.

## 2. Branch Queue Discovery

- [x] 2.1 Replace committed `openspec/changes/*` discovery with local `changes/*` branch discovery backed by parsed change metadata.
- [x] 2.2 Update claimability rules for remaining task work, completed branches needing finalization, blocked branches, invalid metadata, and active or ready-for-review leases.
- [x] 2.3 Preserve deterministic ordering, worker branch reset behavior, and one active writer per change.
- [x] 2.4 Update supervisor, status, dry-run, and discovery tests to cover Git-backed branch queue behavior.

Evidence:

- Changed `scripts/agents.ts` so claimable discovery scans local `changes/*` branches, parses tip commit messages with Formless change metadata, ignores invalid metadata branches, and no longer discovers queue items from committed `openspec/changes/*` files. Kept the legacy OpenSpec apply lookup as transitional downstream compatibility for prompt/finalization tasks.
- Changed `scripts/agents.test.ts` discovery and supervisor fixtures to provide `changes/*` refs plus `git log --no-notes` commit metadata instead of `git ls-tree main -- openspec/changes`.
- `devstate check` at 2026-06-03T02:08:04.602Z: checks ok; services running; web ready; test watcher pass.
- Browser smoke not run; this section changes agent queue discovery and tests only.
- Changed `scripts/agents.ts` so claimability is driven by parsed branch metadata: `ready` and `working` changes are claimable, completed changes produce finalization apply state, `draft` / `blocked` / `ready-for-review` metadata is skipped, invalid metadata is skipped, and lease classification blocks active, blocked, and ready-for-review leases while allowing stale or released leases through the recovery path.
- Changed `scripts/agents.ts` dry-run and claimed-change handoff to use metadata-derived task summaries and to switch explicitly from implementation to finalization after a `plan-done` implementation signal.
- Changed `scripts/agents.test.ts` to cover completed metadata finalization claims, non-claimable metadata states, active/blocked/review-ready/stale/released lease filtering, deterministic branch ordering, worker status output, dry-run metadata prompts, stale lease recovery, and completed-branch supervisor finalization.
- `devstate check` at 2026-06-03T02:18:36.558Z: checks ok; services running; web ready; test watcher pass.
- Browser smoke not run; this section changes agent queue discovery and tests only.

## 3. Worker Prompts and Implementation Loop

- [x] 3.1 Replace OpenSpec apply/status prompt context with known parsed change metadata, selected task section, branch diff, and concrete Git-backed helper commands.
- [x] 3.2 Update the implementation loop so one session ships one ready task section from commit metadata and updates the branch tip with task and evidence changes.
- [x] 3.3 Record blockers, split guidance, check evidence, and browser smoke evidence in structured commit metadata.
- [x] 3.4 Update implementation prompt tests and worker session tests to prove workers no longer depend on `proposal.md`, `design.md`, `tasks.md`, or `openspec instructions apply`.

Evidence:

- Changed `doc/agents/local-openspec-implement.md` so rendered implementation prompts use parsed Git-backed change metadata, selected task section, branch diff, and concrete Git-backed helper commands instead of OpenSpec apply/status context or `openspec/changes/*` artifact paths.
- Changed `scripts/agents.ts` so implementation sessions receive parsed commit metadata, selected task section, and branch diff; implementation mode no longer calls `openspec instructions apply`; and implementation `plan-done` publishes the branch tip without same-pass automatic finalization.
- Changed `scripts/agents.test.ts` to cover metadata-backed implementation prompts, worker session metadata handoff, no implementation dependency on OpenSpec artifact files or `openspec instructions apply`, and direct completed-branch finalization setup.
- `devstate check` at 2026-06-03T02:29:04.632Z: checks ok; services running; web ready; test watcher pass.
- Browser smoke not run; this section changes agent prompt rendering, supervisor control flow, and tests only.

## 4. Git-backed Finalization

- [ ] 4.1 Replace `openspec validate <change-id>` and `openspec archive <change-id> --yes` finalization with metadata validation and `openspec validate --specs --strict --no-interactive`.
- [ ] 4.2 Preserve finalization rebase handling, structural conflict resolution, semantic conflict blocking, and check evidence reuse or rerun rules.
- [ ] 4.3 Mark review-ready branches with structured metadata and ready-for-review leases without committing archived change files.
- [ ] 4.4 Update finalization and maintenance tests to prove no archive command runs and review-ready branches include code, canonical specs, task evidence, and metadata.

## 5. Skills and Instruction Source

- [ ] 5.1 Add repo-owned Git-backed change skills for propose, apply, finalize, and exploration, with concrete branch metadata commands and worker guardrails.
- [ ] 5.2 Move implementation and finalization prompt rules from `doc/agents/local-openspec-implement.md` and `doc/agents/local-openspec-finalize.md` into the new skill-owned instruction source or skill-local templates.
- [ ] 5.3 Bound or retire `.agents/skills/openspec-*` so they are clearly legacy OpenSpec-directory workflows and route new Formless work to the Git-backed skills.
- [ ] 5.4 Update prompt rendering tests to prove worker prompts come from the Git-backed skill instruction source and no longer depend on duplicate `doc/agents/local-openspec-*` docs.

## 6. Documentation and Specs

- [ ] 6.1 Update `AGENTS.md` to describe Git-backed workstreams, branch metadata, direct canonical spec edits, and the removal of OpenSpec archive output from future worker changes.
- [ ] 6.2 Update `doc/agents/local-agent-workers.md` with the branch queue, metadata schema, helper commands, leases, implementation loop, finalization, feedback behavior, and pointer to the skill-owned workflow instructions.
- [ ] 6.3 Remove obsolete standalone prompt docs when their content is represented in repo-owned skills, or replace them with minimal generated-reference pointers if supervisor code still needs stable paths during migration.
- [ ] 6.4 Update `openspec/specs/local-agent-workers/spec.md` through this change's spec delta and record implementation evidence in this task file.
