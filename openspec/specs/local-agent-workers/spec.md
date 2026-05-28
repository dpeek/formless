# local-agent-workers Specification

## Purpose

Define local pull-based OpenSpec worker coordination, branch lifecycle, leases, status, idle maintenance, and finalization rules.

## Requirements

### Requirement: Local main work queue

The system SHALL discover worker-claimable work from committed `openspec/changes/<change-id>/` directories on local `main`.

#### Scenario: Worker finds a ready change

- **WHEN** local `main` contains a committed `openspec/changes/add-thing/` directory with required apply artifacts complete
- **THEN** the worker supervisor lists `add-thing` as claimable work

#### Scenario: Worker ignores uncommitted change files

- **WHEN** a human worktree has uncommitted files under `openspec/changes/draft-thing/`
- **THEN** the worker supervisor does not list `draft-thing` as claimable work

### Requirement: Shared local coordination state

The system SHALL store worker runtime state under Git's common directory so all worktrees from the same clone share leases, worker status, and logs.

#### Scenario: Worker resolves shared state root

- **WHEN** a worker runs from any worktree in the clone
- **THEN** it resolves the state root from `git rev-parse --path-format=absolute --git-common-dir`

#### Scenario: Worker status is visible across worktrees

- **WHEN** `igor` writes status under the shared state root
- **THEN** another worktree from the same clone can read that status from the same path

### Requirement: Atomic change leases

The system SHALL use an atomic local lease to claim one OpenSpec change for one active worker.

#### Scenario: Worker claims unowned change

- **WHEN** no lease exists for `add-thing`
- **THEN** `igor` can create the lease and becomes the owner of `add-thing`

#### Scenario: Second worker cannot claim leased change

- **WHEN** `igor` holds the active lease for `add-thing`
- **THEN** another worker cannot claim `add-thing`

#### Scenario: Lease records ownership metadata

- **WHEN** a worker claims `add-thing`
- **THEN** the lease records the change id, owner name, branch name, state, and heartbeat time

### Requirement: Stable change branches

The system SHALL use `changes/<change-id>` as the implementation branch for a claimed OpenSpec change.

#### Scenario: Worker creates change branch

- **WHEN** `igor` claims `add-thing` and no `changes/add-thing` branch exists
- **THEN** the supervisor creates `changes/add-thing` from local `main`

#### Scenario: Worker resumes change branch

- **WHEN** `changes/add-thing` exists and `add-thing` is claimable or assigned to the worker
- **THEN** the supervisor checks out that branch in the worker worktree instead of creating a worker-named branch

### Requirement: Named worker worktrees

The system SHALL use `./tmp/worktree/<worker-name>` as the default local worktree path for a worker.

#### Scenario: Worker prepares a claimed change

- **WHEN** `igor` claims `add-thing` without a worktree override
- **THEN** the supervisor uses `./tmp/worktree/igor` and checks out `changes/add-thing`

#### Scenario: Worker reuses its worktree

- **WHEN** `igor` later works on `other-thing`
- **THEN** the supervisor reuses `./tmp/worktree/igor` and checks out `changes/other-thing`

### Requirement: Worker identity stays runtime metadata

The system SHALL record worker names in runtime status, leases, and logs, not in the required branch name.

#### Scenario: Named worker owns a branch temporarily

- **WHEN** `igor` works on `add-thing`
- **THEN** the branch remains `changes/add-thing` and the lease records `igor` as the current owner

#### Scenario: Change can be handed off

- **WHEN** `igor` releases `add-thing` and another worker later claims it
- **THEN** the other worker continues on `changes/add-thing`

### Requirement: One active writer per change

The system SHALL allow only one active worker lease for a change branch.

#### Scenario: Task sharing is not enabled

- **WHEN** a change contains multiple ready tasks
- **THEN** only the lease owner can write to `changes/<change-id>` for that change

### Requirement: Local OpenSpec implementation loop

The system SHALL run each claimed change through a local OpenSpec loop that ships one ready `##` task section at a time and preserves existing quality gates.

#### Scenario: Worker ships one task section

- **WHEN** a claimed change has a ready task
- **THEN** the worker implements the `##` section containing the first unchecked task, runs `devstate check`, reads `.devstate/status.md`, commits the section, and updates the change artifacts with evidence

#### Scenario: Worker stays inside task section

- **WHEN** the selected `##` section is being implemented
- **THEN** the worker does not implement tasks from another `##` section

#### Scenario: Worker blocks on oversized section

- **WHEN** the selected `##` section is too large, internally inconsistent, or crosses an unclear architecture, security, storage, public API, or design boundary
- **THEN** the worker records blocker evidence and split guidance

#### Scenario: Worker smokes app behavior

- **WHEN** a task section changes app behavior
- **THEN** the worker runs the configured browser smoke command and records the evidence

### Requirement: Finalization before review

The system SHALL finalize a completed change branch before marking it ready for human review.

#### Scenario: Worker finalizes completed change

- **WHEN** all required tasks are shipped or intentionally closed
- **THEN** the worker rebases on local `main`, reconciles updated change artifacts, promotes shipped facts into `openspec/specs/*/spec.md`, runs `devstate check`, commits finalization, and marks the branch ready for review

#### Scenario: Review-ready branch includes promoted specs

- **WHEN** a worker marks `changes/add-thing` ready for review
- **THEN** the branch includes any promoted `openspec/specs/*/spec.md` changes required by the shipped behavior

#### Scenario: Worker leaves archiving to a separate process

- **WHEN** a worker finalizes a completed change
- **THEN** the worker does not archive the OpenSpec change

### Requirement: Idle branch maintenance

The system SHALL rebase existing local change branches on local `main` when no implementation work is claimable.

#### Scenario: Worker has no claimable work

- **WHEN** no OpenSpec change can be claimed
- **THEN** the worker scans existing `changes/*` branches and attempts to rebase eligible branches on local `main`

#### Scenario: Idle rebase conflict blocks branch

- **WHEN** an idle rebase has conflicts the worker cannot clearly resolve
- **THEN** the worker records blocker evidence and leaves the branch unmerged for human review

### Requirement: Human merge boundary

The system SHALL leave review-ready change branches for a human to inspect and merge into `main`.

#### Scenario: Worker completes branch

- **WHEN** a worker marks `changes/add-thing` ready for review
- **THEN** the worker does not merge `changes/add-thing` into `main`

### Requirement: Main-authored feedback

The system SHALL use rebases on local `main` to carry human-authored change feedback into active change branches.

#### Scenario: Worker receives changed docs from main

- **WHEN** local `main` changes the OpenSpec artifacts for a claimed change
- **THEN** the worker rebases the change branch, reads the updated artifacts, and updates implementation and promoted specs to match

#### Scenario: Worker cannot reconcile feedback

- **WHEN** updated change artifacts conflict with shipped behavior and the resolution is unclear
- **THEN** the worker records blocker evidence and leaves the branch unmerged
