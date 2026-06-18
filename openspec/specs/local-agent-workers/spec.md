# local-agent-workers Specification

## Purpose

Define local pull-based Git-backed worker coordination, branch lifecycle, leases, status, idle maintenance, and finalization rules.

## Requirements

### Requirement: Git-backed change branch queue

The system SHALL discover worker-claimable work from local `changes/<change-id>` branches whose tip commit contains valid Formless change metadata.

#### Scenario: Worker finds a ready change branch

- **WHEN** local branch `changes/add-thing` exists from local `main`
- **AND** its tip commit contains valid Formless change metadata for `add-thing`
- **AND** its task metadata has remaining work
- **THEN** the worker supervisor lists `add-thing` as claimable work

#### Scenario: Worker ignores branches without valid metadata

- **WHEN** local branch `changes/draft-thing` exists
- **AND** its tip commit is missing required Formless change metadata
- **THEN** the worker supervisor does not list `draft-thing` as claimable work

#### Scenario: Worker prioritizes change branches

- **WHEN** multiple unleased change branches are claimable
- **THEN** the worker supervisor orders branches with existing unmerged implementation first
- **AND** orders remaining branches by deterministic change id order

#### Scenario: Worker targets one change branch

- **WHEN** a worker runs `bun agents watch igor --change add-thing`
- **THEN** the worker supervisor considers only `changes/add-thing` for claim, resume, or ready-for-review maintenance
- **AND** it does not claim another available change branch

#### Scenario: Worker skips completed branch work

- **WHEN** local branch `changes/add-thing` has valid metadata with no remaining task work
- **THEN** the worker supervisor does not start a fresh implementation session for `add-thing`
- **AND** it starts finalization when no active or ready-for-review lease already covers the branch

### Requirement: Structured change commit metadata

The system SHALL store proposal, design, task state, evidence, blocker, and machine-readable status data in the `changes/<change-id>` branch tip commit message.

#### Scenario: Metadata includes human-readable change memory

- **WHEN** a worker reads change `add-thing`
- **THEN** the tip commit message exposes proposal, design, tasks, evidence, and blocker sections
- **AND** the worker can use those sections as the change-scoped working memory

#### Scenario: Metadata includes machine-readable trailers

- **WHEN** the worker supervisor parses change `add-thing`
- **THEN** the tip commit message contains trailers for change id, metadata version, state, affected capabilities, and latest evidence time
- **AND** the parsed change id matches branch `changes/add-thing`

#### Scenario: Commit message is authoritative state

- **WHEN** Git notes or untracked files contain additional change information
- **THEN** the worker supervisor does not treat that information as authoritative proposal, design, task, evidence, blocker, or status state

#### Scenario: Branch diff is the review delta

- **WHEN** a human reviews `changes/add-thing`
- **THEN** the implementation delta is the Git diff from local `main` to the branch tip
- **AND** shipped spec facts appear as direct edits to canonical `openspec/specs/*/spec.md` files on the branch

### Requirement: Change metadata query API

The system SHALL expose Bun agent commands or exported helpers that parse, validate, list, and update structured change commit metadata without requiring ad hoc message parsing by worker prompts.

#### Scenario: Query lists local changes

- **WHEN** a human or supervisor requests local change status as JSON
- **THEN** the query API returns one entry per valid `changes/<change-id>` branch
- **AND** each entry includes change id, branch, state, remaining task count, latest evidence, and blocker summary when present

#### Scenario: Query reports invalid change metadata

- **WHEN** `changes/add-thing` exists but its tip commit metadata is invalid
- **THEN** the query API reports the validation failure
- **AND** the worker supervisor does not claim the branch as implementation work

#### Scenario: Helper updates evidence

- **WHEN** a worker records new check evidence for `add-thing`
- **THEN** the helper updates the evidence section and machine-readable latest evidence trailer in the tip commit message
- **AND** preserves proposal, design, task, and blocker content that it did not modify

### Requirement: Repo-owned workflow skills

The system SHALL define the Git-backed change workflow in repo-owned agent skills instead of split prompt docs under `doc/agents/local-openspec-*`.

#### Scenario: Agent selects Git-backed skill for new work

- **WHEN** a user asks an agent to propose, implement, continue, or finalize a new Formless change
- **THEN** the available repo-owned skills direct the agent to the Git-backed change workflow
- **AND** they do not direct the agent to create or archive an OpenSpec change directory

#### Scenario: Skill owns implementation prompt rules

- **WHEN** the worker supervisor renders an implementation or finalization prompt
- **THEN** the rendered prompt is generated from Git-backed workflow instructions owned by the repo skill definitions or skill-local templates
- **AND** equivalent operational rules are not maintained separately in `doc/agents/local-openspec-implement.md` or `doc/agents/local-openspec-finalize.md`

#### Scenario: Legacy OpenSpec skills are clearly bounded

- **WHEN** repo `.agents/skills/openspec-*` skills remain during migration
- **THEN** their descriptions and bodies identify them as legacy OpenSpec-directory workflows
- **AND** they instruct agents to use the Git-backed Formless change skills for new work

### Requirement: Shared local coordination state

The system SHALL store worker runtime state under Git's common directory so all worktrees from the same clone share leases, worker status, and logs.

#### Scenario: Worker resolves shared state root

- **WHEN** a worker runs from any worktree in the clone
- **THEN** it resolves the state root from `git rev-parse --path-format=absolute --git-common-dir`

#### Scenario: Worker status is visible across worktrees

- **WHEN** `igor` writes status under the shared state root
- **THEN** another worktree from the same clone can read that status from the same path

### Requirement: Atomic change leases

The system SHALL use an atomic local lease to claim one Git-backed change for one active worker, while allowing stale active leases to be recovered and preserving valid review-ready leases.

#### Scenario: Worker claims unowned change

- **WHEN** no lease exists for `add-thing`
- **THEN** `igor` can create the lease and becomes the owner of `add-thing`

#### Scenario: Second worker cannot claim valid leased change

- **WHEN** `igor` holds a valid active lease for `add-thing`
- **THEN** another worker cannot claim `add-thing`

#### Scenario: Targeted worker does not retarget active lease

- **WHEN** `igor` holds a valid active lease for `add-thing`
- **AND** `igor` runs `bun agents watch igor --change other-thing`
- **THEN** the worker supervisor refuses to start `other-thing`
- **AND** it leaves the `add-thing` lease intact

#### Scenario: Lease records ownership metadata

- **WHEN** a worker claims `add-thing`
- **THEN** the lease records the change id, owner name, branch name, state, heartbeat time, and available process identity

#### Scenario: Worker recovers stale active lease

- **WHEN** `add-thing` has a `claiming`, `working`, or `finalizing` lease whose process is dead or whose heartbeat is older than the configured stale heartbeat window
- **THEN** another worker can recover or release that stale lease before claiming `add-thing`

#### Scenario: Valid review-ready lease is retained

- **WHEN** `add-thing` has a `ready-for-review` lease and `changes/add-thing` still exists as an unmerged local branch
- **THEN** the worker supervisor does not auto-release the lease
- **AND** the worker supervisor does not reclaim `add-thing` as fresh implementation work

#### Scenario: Review-ready lease can be released after branch completion

- **WHEN** `changes/add-thing` has been merged into local `main`, deleted, or explicitly released
- **THEN** the worker supervisor can release the `ready-for-review` lease for `add-thing`

#### Scenario: Blocked lease has explicit recovery

- **WHEN** `add-thing` has a `blocked` lease
- **THEN** worker status exposes blocker evidence
- **AND** an explicit release or recovery path can clear the blocked lease so future workers are not trapped forever

### Requirement: Stable review branches

The system SHALL use `changes/<change-id>` as the stable review branch and queue identity for a Git-backed Formless change.

#### Scenario: Worker resumes review branch

- **WHEN** `changes/add-thing` exists and `add-thing` is claimable or assigned to the worker
- **THEN** the supervisor uses `changes/add-thing` as the review branch for the claimed change

#### Scenario: Worker publishes review branch

- **WHEN** a worker session completes successfully on `agents/igor`
- **THEN** the supervisor updates `changes/add-thing` to the `agents/igor` branch tip

### Requirement: Named worker worktrees

The system SHALL use `./tmp/worktree/<worker-name>` as the default local worktree path for a worker and `agents/<worker-name>` as the checked-out worker branch.

#### Scenario: Worker prepares a claimed change

- **WHEN** `igor` claims `add-thing` without a worktree override
- **THEN** the supervisor uses `./tmp/worktree/igor`
- **AND** checks out `agents/igor`
- **AND** resets `agents/igor` to `changes/add-thing` before starting the worker session

#### Scenario: Worker reuses its worktree

- **WHEN** `igor` later works on `other-thing`
- **THEN** the supervisor reuses `./tmp/worktree/igor`
- **AND** resets `agents/igor` to `changes/other-thing`

### Requirement: Worker identity stays separate from review branch identity

The system SHALL use worker names for runtime status, leases, logs, and checked-out worker branches while keeping `changes/<change-id>` as the stable review branch.

#### Scenario: Named worker owns the writable branch temporarily

- **WHEN** `igor` works on `add-thing`
- **THEN** the worker writes on `agents/igor`
- **AND** the lease records `igor` as the current owner
- **AND** review output is published to `changes/add-thing`

#### Scenario: Change can be handed off

- **WHEN** `igor` releases `add-thing` and another worker later claims it
- **THEN** the other worker resets its `agents/<worker-name>` branch to `changes/add-thing`

### Requirement: One active writer per change

The system SHALL allow only one active worker lease to publish to a change review branch.

#### Scenario: Task sharing is not enabled

- **WHEN** a change contains multiple ready tasks
- **THEN** only the lease owner can publish to `changes/<change-id>` for that change

### Requirement: Git-backed implementation loop

The system SHALL run each claimed change through a local Git-backed loop that ships one ready task section from the change commit message at a time and preserves existing implementation quality gates.

#### Scenario: Worker ships one task section

- **WHEN** a claimed change branch has a ready task section in its tip commit message
- **THEN** the worker implements that task section, runs `devstate check`, updates task and evidence metadata in the commit message, and updates the branch tip

#### Scenario: Worker stays inside task section

- **WHEN** the selected task section is being implemented
- **THEN** the worker does not implement tasks from another task section

#### Scenario: Worker selects section before broad context

- **WHEN** an implementation session starts for a claimed change
- **THEN** the worker selects the next ready task section from the parsed change commit metadata before broad context reads
- **AND** after selecting the section, the worker reads only the commit metadata, canonical specs, docs, and code needed for that section

#### Scenario: Worker records blocker in commit metadata

- **WHEN** the selected task section is too large, internally inconsistent, or crosses an unclear architecture, security, storage, public API, or design boundary
- **THEN** the worker records blocker evidence and split guidance in the change commit metadata

#### Scenario: Worker smokes app behavior

- **WHEN** a task section changes app behavior
- **THEN** the worker runs the configured browser smoke command and records the evidence in the change commit metadata

#### Scenario: Task plan excludes automatic finalization

- **WHEN** change commit metadata is prepared for local worker implementation
- **THEN** its task sections describe implementation work and section evidence
- **AND** it does not require a final task section for automatic rebase, metadata validation, spec validation, or ready-for-review marking

### Requirement: Finalization before review

The system SHALL finalize a completed Git-backed change branch through metadata validation, canonical spec validation, rebase maintenance, and check evidence before publishing the review branch for human review.

#### Scenario: Worker finalizes completed change

- **WHEN** all required tasks are shipped or intentionally closed
- **THEN** the worker rebases `agents/<worker-name>` on local `main`, validates structured change metadata, validates canonical specs, publishes the worker branch tip to `changes/<change-id>`, and marks the branch ready for review
- **AND** the worker does not run `openspec archive <change-id> --yes`
- **AND** the worker does not commit archived change files

#### Scenario: Finalization validates canonical specs

- **WHEN** finalization validates `changes/add-thing`
- **THEN** it runs strict validation for canonical specs
- **AND** it blocks with command evidence when canonical spec validation fails

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

#### Scenario: Review-ready branch is self-contained

- **WHEN** a worker marks `changes/add-thing` ready for review
- **THEN** the branch includes code changes, completed task evidence, updated canonical specs, and structured change commit metadata
- **AND** the branch does not include a newly archived change directory

#### Scenario: Review-ready branch is not checked out by worker

- **WHEN** a worker marks `changes/add-thing` ready for review
- **THEN** the worker worktree remains on `agents/<worker-name>` at the final branch tip
- **AND** `changes/add-thing` is free to check out from another worktree

### Requirement: Idle branch maintenance

The system SHALL rebase existing local change review branches on local `main` through the worker branch when no implementation work is claimable.

#### Scenario: Worker has no claimable work

- **WHEN** no Git-backed change branch can be claimed for implementation
- **THEN** the worker scans existing `changes/*` branches and attempts to rebase eligible branches on local `main` through `agents/<worker-name>`
- **AND** publishes successful rebases back to `changes/<change-id>`

#### Scenario: Idle rebase structural conflict is resolved

- **WHEN** an idle rebase has structural conflicts whose sides can coexist without changing runtime invariants
- **THEN** the worker preserves both sides, continues the rebase, runs `devstate check`, and records conflict resolution evidence

#### Scenario: Idle rebase semantic conflict blocks branch

- **WHEN** an idle rebase has semantic conflicts that require choosing between incompatible behavior, storage order, auth/security boundaries, public API shape, deletion versus edit, or another unstated product decision
- **THEN** the worker records blocker evidence and leaves the branch unmerged for human review

### Requirement: Human merge boundary

The system SHALL leave review-ready change branches for a human to inspect and merge into `main`.

#### Scenario: Worker completes branch

- **WHEN** a worker marks `changes/add-thing` ready for review
- **THEN** the worker does not merge `changes/add-thing` into `main`

### Requirement: Change-branch feedback

The system SHALL use rebases and structured change commit metadata to carry human-authored feedback into active change branches.

#### Scenario: Worker receives changed metadata

- **WHEN** a human updates the structured commit metadata for a claimed change branch
- **THEN** the worker rebases or refreshes `agents/<worker-name>` from `changes/<change-id>`, reads the updated metadata, and updates implementation, task evidence, and canonical specs to match

#### Scenario: Worker cannot reconcile feedback

- **WHEN** updated change metadata conflicts semantically with shipped behavior
- **THEN** the worker records blocker evidence in the change commit metadata and leaves the branch unmerged

### Requirement: Context-efficient worker prompts

The system SHALL render concise worker prompt packets from the repo-owned Git-backed workflow skills that are self-contained for the concrete change id and mode and avoid duplicate context loading.

#### Scenario: Prompt uses concrete Git-backed change commands

- **WHEN** `bun agents` renders an implementation or finalization prompt for `add-thing`
- **THEN** the prompt uses concrete Git-backed change metadata commands and file paths for `add-thing`
- **AND** the prompt does not tell the worker to use a generic OpenSpec apply skill instead of the concrete commands

#### Scenario: Prompt source docs are not reread by worker session

- **WHEN** `bun agents` injects a rendered implementation or finalization prompt
- **THEN** the worker prompt is operationally self-contained for that session
- **AND** the worker is not required to reread the skill or prompt source docs

#### Scenario: Human worker doc is not per-session context

- **WHEN** a worker session starts from an injected prompt
- **THEN** `doc/agents/local-agent-workers.md` is not required reading for that session
- **AND** the document remains available as human and supervisor reference

#### Scenario: Supervisor passes known change metadata state

- **WHEN** `scripts/agents.ts` has already parsed change metadata to choose implementation versus finalization
- **THEN** the rendered prompt includes the already-known task state, change state, and relevant file paths needed by the worker
- **AND** the worker is not required to rerun those commands only to rediscover the same state

#### Scenario: Devstate output avoids immediate status reread

- **WHEN** `devstate start` or `devstate check` prints current green status for the session
- **THEN** the worker can use that output as check evidence
- **AND** the worker reads `.devstate/status.md` after failures, stale output, conflict resolution, or when exact status text must be copied into change metadata

#### Scenario: Instructions remain layered

- **WHEN** worker instructions are maintained
- **THEN** non-negotiable repository rules remain in `AGENTS.md`
- **AND** concrete workflow mechanics live in repo-owned skills, supervisor code, or the rendered worker prompt
- **AND** duplicated operational instructions across `AGENTS.md`, `doc/agents/local-agent-workers.md`, skill files, and rendered prompts are removed where possible
