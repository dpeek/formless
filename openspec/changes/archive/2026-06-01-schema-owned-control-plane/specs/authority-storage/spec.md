## ADDED Requirements

### Requirement: Instance Control-Plane Storage

The system SHALL store runtime-owned instance control-plane schema records in an
Authority-backed app storage identity separate from installed app data.

#### Scenario: Control-plane identity

- **WHEN** instance control-plane storage is initialized
- **THEN** committed records, changes, active schema, and action executions
  belong to the instance control-plane storage identity
- **AND** installed app records remain scoped to their app storage identities
- **AND** app install and route records remain metadata about installed apps,
  not the installed apps' own record storage

#### Scenario: Control-plane API

- **WHEN** owner, admin, CLI deployer, or runner callers query or write allowed
  control-plane records
- **THEN** the request targets the instance control-plane storage identity
- **AND** writes use Authority validation and write-log idempotency

#### Scenario: App install creation transaction

- **WHEN** a package app install is created through the control-plane API
- **THEN** the app install and default route records are committed in the
  control-plane storage identity
- **AND** package source schema and source seed records initialize the
  install-scoped app storage identity
- **AND** a failure in either part leaves no partially usable installed app
  route

### Requirement: Control-Plane Secret Boundary

Authority storage SHALL keep installed app data, deployment secrets, and
canonical provider state out of control-plane records and change rows.

#### Scenario: Secret values are excluded

- **WHEN** control-plane records are stored, synced, snapshotted, or exported
- **THEN** provider API tokens, Alchemy passwords, Alchemy state tokens, raw
  lease tokens, and runtime secrets are not included
- **AND** display-safe secret references may be stored

#### Scenario: Installed app data is excluded

- **WHEN** app install or route metadata records are stored, synced,
  snapshotted, or exported as control-plane records
- **THEN** the installed app's records, changes, active schema, and action
  executions are not nested into those records
- **AND** app data continues to move through installed app storage snapshots

#### Scenario: Provider truth remains external

- **WHEN** deployment evidence is recorded
- **THEN** Authority records store summaries and ids needed for display, audit,
  and cleanup
- **AND** Alchemy or provider storage remains the canonical provider resource
  state

### Requirement: Legacy Instance State Migration

The system SHALL migrate existing app install, custom-domain, and
deployment-runtime intent facts into control-plane records without changing
route behavior.

#### Scenario: Backfill legacy state

- **WHEN** legacy app install, domain mapping, redirect, attempt, evidence, or
  drift tables exist during migration
- **THEN** equivalent schema-owned control-plane records are created
- **AND** compatibility reads can verify old and new state before legacy writes
  are retired
