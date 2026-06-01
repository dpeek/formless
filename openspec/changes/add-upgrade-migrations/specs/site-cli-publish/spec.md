## ADDED Requirements

### Requirement: CLI Upgrade Planning

The Site CLI SHALL plan runtime and data upgrades before mutating remote
Formless instances.

#### Scenario: Plan instance upgrade

- **WHEN** a user runs an upgrade-aware CLI command against a target instance
- **THEN** the CLI compares local package metadata with deployed runtime
  metadata, app install package facts, archive state when relevant, and
  deployment status
- **AND** the CLI reports code deploy, SQL migration, package app migration,
  archive normalization, backup, and browser reload requirements

#### Scenario: Dry-run remains non-mutating

- **WHEN** an upgrade-aware CLI command runs without its required apply input
- **THEN** it performs planning and validation only
- **AND** remote runtime, app data, media, archives, and provider resources are
  not mutated

### Requirement: CLI Upgrade Apply Boundary

The Site CLI SHALL apply migrations only through deployed runtime or Authority
APIs.

#### Scenario: Apply data upgrade

- **WHEN** a CLI command applies an upgrade that requires storage or app data
  migration
- **THEN** it invokes deployed runtime or Authority APIs for the mutation
- **AND** it does not directly access Durable Object SQLite

#### Scenario: Backup before user-data migration

- **WHEN** an upgrade plan includes an `auto-with-backup` migration
- **THEN** CLI apply requires backup evidence before applying the migration
- **AND** the command reports the backup in its apply output
- **AND** backup evidence includes backup kind, scope, artifact path, completion
  timestamp, and target when available

#### Scenario: Manual approval before manual migration

- **WHEN** an upgrade plan includes a `manual-approval` migration
- **THEN** CLI apply requires approval evidence matching that migration approval
  key before applying the migration
- **AND** manual approval evidence includes approval kind, approval key, approval
  timestamp, and optional approver or reason

### Requirement: Deploy Verification Uses Upgrade Metadata

Instance deploy and publish workflows SHALL verify upgrade metadata after code
deploy.

#### Scenario: Verify deployed metadata

- **WHEN** `formless instance deploy` or code-aware publish deploys runtime code
- **THEN** it verifies package version, runtime protocol, storage migration set,
  and package app revision/hash facts from deployed metadata
- **AND** verification failure stops subsequent data migration steps
