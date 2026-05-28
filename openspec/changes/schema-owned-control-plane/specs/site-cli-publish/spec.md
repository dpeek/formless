## ADDED Requirements

### Requirement: Schema Deployment Protocol

The Site CLI SHALL use the instance protocol to query schema-owned app install,
route, and deployment records and invoke deployment actions when the target
supports them.

#### Scenario: CLI reads deployment records

- **WHEN** a claimed instance workspace targets a runtime with schema-owned
  control-plane records
- **THEN** CLI status, check, pull, push, plan, deploy, and domain workflows read
  allowed app install, route, and deployment records through the instance
  control-plane protocol
- **AND** provider credentials remain in CLI or runner-held secret locations

#### Scenario: CLI invokes deployment action

- **WHEN** `formless instance domains run-apply` or a deployment command starts
  an attempt
- **THEN** the CLI invokes the schema-declared deployment action for the target
  actor
- **AND** the action binds to the exact desired-state version and idempotency key

#### Scenario: CLI reads app routes

- **WHEN** an instance workspace needs installed app or public Site route state
- **THEN** the CLI reads schema-owned `appInstall` and `appRoute` records
- **AND** route drift is reported by comparing route records rather than
  hand-derived install route strings

### Requirement: Compatible Domain Commands

The Site CLI SHALL keep existing domain command surfaces stable while
deployment intent moves to schema-owned records.

#### Scenario: Existing command output

- **WHEN** users run existing domain remote-plan, run-apply, run-delete,
  forget, manual cleanup, or direct fallback commands
- **THEN** command names and credential boundaries remain stable
- **AND** output may include schema-owned deployment record ids when available
