## MODIFIED Requirements

### Requirement: Atomic change leases

The system SHALL use an atomic local lease to claim one OpenSpec change for one active worker, while allowing stale active leases to be recovered and preserving valid review-ready leases.

#### Scenario: Worker claims unowned change

- **WHEN** no lease exists for `add-thing`
- **THEN** `igor` can create the lease and becomes the owner of `add-thing`

#### Scenario: Second worker cannot claim valid leased change

- **WHEN** `igor` holds a valid active lease for `add-thing`
- **THEN** another worker cannot claim `add-thing`

#### Scenario: Lease records ownership metadata

- **WHEN** a worker claims `add-thing`
- **THEN** the lease records the change id, owner name, branch name, state, heartbeat time, and available process identity

#### Scenario: Worker recovers stale active lease

- **WHEN** `add-thing` has a `claiming`, `working`, or `finalizing` lease whose process is dead or whose heartbeat is older than the configured stale heartbeat window
- **THEN** another worker can recover or release that stale lease before claiming `add-thing`

#### Scenario: Valid review-ready lease is retained

- **WHEN** `add-thing` has a `ready-for-review` lease and `changes/add-thing` still exists as an unmerged local branch
- **THEN** the worker supervisor does not auto-release the lease
- **AND** the worker supervisor does not reclaim `add-thing` from local `main` as fresh implementation work

#### Scenario: Review-ready lease can be released after branch completion

- **WHEN** `changes/add-thing` has been merged into local `main`, deleted, or explicitly released
- **THEN** the worker supervisor can release the `ready-for-review` lease for `add-thing`

#### Scenario: Blocked lease has explicit recovery

- **WHEN** `add-thing` has a `blocked` lease
- **THEN** worker status exposes blocker evidence
- **AND** an explicit release or recovery path can clear the blocked lease so future workers are not trapped forever

### Requirement: Local OpenSpec implementation loop

The system SHALL run each claimed change through a local OpenSpec loop that ships one ready `##` task section at a time and preserves existing implementation quality gates.

#### Scenario: Worker ships one task section

- **WHEN** a claimed change has a ready task
- **THEN** the worker implements the `##` section containing the first unchecked task, runs `devstate check`, commits the section, and updates the change artifacts with evidence from current devstate output or `.devstate/status.md` when the file is needed

#### Scenario: Worker stays inside task section

- **WHEN** the selected `##` section is being implemented
- **THEN** the worker does not implement tasks from another `##` section

#### Scenario: Worker selects section before broad context

- **WHEN** an implementation session starts for a claimed change
- **THEN** the worker selects the next ready `##` section from `openspec/changes/<change-id>/tasks.md` before reading all change context
- **AND** after selecting the section, the worker reads only the change artifacts, specs, docs, and code needed for that section

#### Scenario: Worker blocks on oversized section

- **WHEN** the selected `##` section is too large, internally inconsistent, or crosses an unclear architecture, security, storage, public API, or design boundary
- **THEN** the worker records blocker evidence and split guidance

#### Scenario: Worker smokes app behavior

- **WHEN** a task section changes app behavior
- **THEN** the worker runs the configured browser smoke command and records the evidence

#### Scenario: Task plan excludes automatic finalization

- **WHEN** `tasks.md` is prepared for local OpenSpec worker implementation
- **THEN** its `##` sections describe implementation work and section evidence
- **AND** it does not require a final `##` section for automatic rebase, validation, archive, spec promotion, or ready-for-review marking

### Requirement: Finalization before review

The system SHALL finalize a completed change branch through OpenSpec CLI validation and archive before marking it ready for human review.

#### Scenario: Worker finalizes completed change

- **WHEN** all required tasks are shipped or intentionally closed
- **THEN** the worker rebases on local `main`, reconciles updated change artifacts, runs `openspec validate <change-id> --strict --no-interactive`, runs `openspec archive <change-id> --yes`, commits resulting changes, detaches the worker worktree at the final branch tip, and marks the branch ready for review

#### Scenario: Finalization reuses valid implementation check

- **WHEN** finalization does not change code, resolve conflicts, or otherwise invalidate the latest recorded implementation `devstate check`
- **THEN** the worker does not run `devstate check` again
- **AND** the worker records which implementation check evidence was reused

#### Scenario: Finalization reruns invalidated check

- **WHEN** finalization rebases code changes, resolves conflicts, edits code or generated outputs, or cannot prove the latest implementation check still covers the final branch state
- **THEN** the worker runs `devstate check`, reads `.devstate/status.md`, fixes issues, and records finalization check evidence before marking the branch ready

#### Scenario: Worker resolves clear structural rebase conflicts

- **WHEN** a finalization rebase has structural conflicts whose sides can coexist without changing runtime invariants
- **THEN** the worker preserves both sides, continues the rebase, runs `devstate check`, and records conflict resolution evidence

#### Scenario: Worker blocks on semantic rebase conflicts

- **WHEN** a finalization rebase requires choosing between incompatible behavior, storage order, auth/security boundaries, public API shape, deletion versus edit, or another unstated product decision
- **THEN** the worker records blocker evidence and leaves the branch unmerged for human review

#### Scenario: Worker delegates spec promotion to archive

- **WHEN** the completed change has OpenSpec spec deltas that `openspec archive` can apply
- **THEN** the worker does not manually author equivalent `openspec/specs/*/spec.md` promotion edits outside the archive command

#### Scenario: Review-ready branch is self-contained

- **WHEN** a worker marks `changes/add-thing` ready for review
- **THEN** the branch includes code changes, completed task evidence, updated canonical specs, and the archived change directory produced by OpenSpec archive

#### Scenario: Review-ready branch is not checked out by worker

- **WHEN** a worker marks `changes/add-thing` ready for review
- **THEN** the worker worktree is detached at the final branch tip
- **AND** `changes/add-thing` is free to check out from another worktree

### Requirement: Main-authored feedback

The system SHALL use rebases on local `main` to carry human-authored change feedback into active change branches.

#### Scenario: Worker receives changed docs from main

- **WHEN** local `main` changes the OpenSpec artifacts for a claimed change before archive
- **THEN** the worker rebases the change branch, reads the updated artifacts, and updates implementation, task evidence, and spec deltas to match

#### Scenario: Worker cannot reconcile feedback

- **WHEN** updated change artifacts conflict semantically with shipped behavior
- **THEN** the worker records blocker evidence and leaves the branch unmerged

## ADDED Requirements

### Requirement: Context-efficient worker prompts

The system SHALL render concise worker prompt packets that are self-contained for the concrete change id and mode and avoid duplicate context loading.

#### Scenario: Prompt uses concrete OpenSpec CLI commands

- **WHEN** `bun agents` renders an implementation or finalization prompt for `add-thing`
- **THEN** the prompt uses concrete OpenSpec CLI commands and file paths for `add-thing`
- **AND** the prompt does not tell the worker to use a generic OpenSpec apply skill instead of the concrete commands

#### Scenario: Prompt source docs are not reread by worker session

- **WHEN** `bun agents` injects a rendered implementation or finalization prompt
- **THEN** the worker prompt is operationally self-contained for that session
- **AND** the worker is not required to reread `doc/agents/local-openspec-implement.md` or `doc/agents/local-openspec-finalize.md`

#### Scenario: Human worker doc is not per-session context

- **WHEN** a worker session starts from an injected prompt
- **THEN** `doc/agents/local-agent-workers.md` is not required reading for that session
- **AND** the document remains available as human and supervisor reference

#### Scenario: Supervisor passes known OpenSpec state

- **WHEN** `scripts/agents.ts` has already run OpenSpec status or instructions commands to choose implementation versus finalization
- **THEN** the rendered prompt includes the already-known task state, change state, and relevant file paths needed by the worker
- **AND** the worker is not required to rerun those commands only to rediscover the same state

#### Scenario: Devstate output avoids immediate status reread

- **WHEN** `devstate start` or `devstate check` prints current green status for the session
- **THEN** the worker can use that output as check evidence
- **AND** the worker reads `.devstate/status.md` after failures, stale output, conflict resolution, or when exact status text must be copied into change artifacts

#### Scenario: Instructions remain layered

- **WHEN** worker instructions are maintained
- **THEN** non-negotiable repository rules remain in `AGENTS.md`
- **AND** concrete workflow mechanics live in supervisor code or the rendered worker prompt
- **AND** duplicated operational instructions across `AGENTS.md`, `doc/agents/local-agent-workers.md`, and rendered prompts are removed where possible
