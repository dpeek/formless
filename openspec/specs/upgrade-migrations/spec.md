# Upgrade Migrations Specification

## Purpose

Upgrade migrations coordinate deployed runtime metadata, migration registration,
applied-state tracking, migration safety policy, CLI upgrade flow, and stale
client compatibility for Formless instances.

## Requirements

### Requirement: Upgrade Metadata

The system SHALL expose deployed runtime upgrade facts that CLI workflows can
compare before mutating a Formless instance.

#### Scenario: Read deployed upgrade facts

- WHEN a CLI reads deployed runtime metadata from a target instance
- THEN the response includes package version, runtime protocol version, storage
  migration set identity, and bundled package app revision/hash facts
- AND the response uses `Cache-Control: no-store`
- AND the response does not include provider credentials, admin tokens, Alchemy
  passwords, raw lease tokens, or storage secrets

#### Scenario: Compare local and deployed facts

- WHEN a CLI has local package metadata and deployed runtime metadata
- THEN it can derive whether code deploy, storage migration, package app
  migration, archive compatibility, or browser reload behavior is required

### Requirement: Migration Registry

The system SHALL register code-backed migrations through manifest metadata.

#### Scenario: Register migration

- WHEN a migration is registered
- THEN it declares a stable id, owner, affected storage or package app family,
  checksum, safety class, display summary, and execution function
- AND package app migrations declare from/to package revisions when they
  transform package app schema or data

#### Scenario: Reject duplicate migration id

- WHEN two registered migrations share the same stable id for the same
  migration family
- THEN migration registry validation fails before any migration is applied

### Requirement: Migration Safety Policy

The system SHALL classify migrations by safety before apply.

#### Scenario: Auto-safe migration

- WHEN a migration is additive or cache-only and classified `auto-safe`
- THEN upgrade apply can run it without a user-data backup requirement
- AND the migration still records applied-state evidence

#### Scenario: Auto-with-backup migration

- WHEN a migration changes user data or package app schema and is classified
  `auto-with-backup`
- THEN upgrade apply requires backup evidence before mutation
- AND dry-run output includes the affected storage identities or package app
  installs
- AND CLI backup evidence identifies `kind: "backup"`, the backup scope,
  artifact path, completion timestamp, and target when available

#### Scenario: Manual-approval migration

- WHEN a migration is destructive, irreversible, or replaces provider resources
  and is classified `manual-approval`
- THEN upgrade apply refuses to run it without explicit manual approval
- AND dry-run output reports the destructive or provider-impacting behavior
- AND CLI manual approval evidence identifies `kind: "manual-approval"`, the
  approval key, approval timestamp, and optional approver or reason

### Requirement: CLI Upgrade Flow

The system SHALL keep upgrade planning and apply user-facing through CLI
workflows.

#### Scenario: Plan upgrade

- WHEN a CLI plans an upgrade for a target instance
- THEN it reads local metadata, deployed runtime metadata, app install facts,
  archive state when relevant, and deployment status
- AND it reports required code deploy, SQL migration, package app migration,
  archive normalization, browser reload, and backup steps without mutating data

#### Scenario: Apply upgrade

- WHEN a CLI applies an upgrade
- THEN it uses deployed runtime or Authority APIs to perform storage and app
  data migrations
- AND it does not mutate Durable Object SQLite directly
- AND it verifies deployed metadata and migration applied state after apply

### Requirement: Stale Runtime Compatibility

The system SHALL prefer reload-required behavior over blocking server-side
migrations for stale browser clients.

#### Scenario: Compatible stale read

- WHEN a stale browser bundle reads data through a still-compatible protocol
- THEN the runtime can continue returning read responses
- AND the stale browser does not block pending migrations

#### Scenario: Incompatible stale write

- WHEN a stale browser bundle attempts a write against an incompatible runtime
  protocol, package app revision, or schema contract
- THEN the runtime rejects the write with a reload-required error
- AND no partial mutation is committed
