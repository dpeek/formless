## 1. Change Metadata Model

- [ ] 1.1 Add a typed parser for Formless change commit messages with proposal, design, tasks, evidence, blocker, and trailer fields.
- [ ] 1.2 Add a formatter that preserves unchanged sections while updating task state, evidence, blockers, and machine-readable trailers.
- [ ] 1.3 Add tests for valid metadata, missing trailers, branch/change-id mismatch, malformed task sections, and non-authoritative Git notes or untracked files.
- [ ] 1.4 Add JSON query helpers or `bun agents` commands that list valid change branches and report invalid metadata with actionable errors.

## 2. Branch Queue Discovery

- [ ] 2.1 Replace committed `openspec/changes/*` discovery with local `changes/*` branch discovery backed by parsed change metadata.
- [ ] 2.2 Update claimability rules for remaining task work, completed branches needing finalization, blocked branches, invalid metadata, and active or ready-for-review leases.
- [ ] 2.3 Preserve deterministic ordering, worker branch reset behavior, and one active writer per change.
- [ ] 2.4 Update supervisor, status, dry-run, and discovery tests to cover Git-backed branch queue behavior.

## 3. Worker Prompts and Implementation Loop

- [ ] 3.1 Replace OpenSpec apply/status prompt context with known parsed change metadata, selected task section, branch diff, and concrete Git-backed helper commands.
- [ ] 3.2 Update the implementation loop so one session ships one ready task section from commit metadata and updates the branch tip with task and evidence changes.
- [ ] 3.3 Record blockers, split guidance, check evidence, and browser smoke evidence in structured commit metadata.
- [ ] 3.4 Update implementation prompt tests and worker session tests to prove workers no longer depend on `proposal.md`, `design.md`, `tasks.md`, or `openspec instructions apply`.

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
