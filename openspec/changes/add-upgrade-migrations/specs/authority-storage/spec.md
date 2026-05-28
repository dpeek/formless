## ADDED Requirements

### Requirement: SQL Migration Runner
The system SHALL run registered Durable Object SQLite migrations before upgraded
code depends on migrated table shape.

#### Scenario: Apply pending SQL migration
- **WHEN** Authority or instance storage initializes for a storage identity with
  pending SQL migrations
- **THEN** the migration runner applies migrations in registry order
- **AND** each applied migration records its id, checksum, package version, and
  applied timestamp for that storage identity

#### Scenario: Skip applied SQL migration
- **WHEN** storage initializes for a storage identity whose migration id and
  checksum are already recorded as applied
- **THEN** the migration runner skips that migration
- **AND** storage initialization continues without duplicate table rewrites

### Requirement: Introspective SQL Migrations
SQL migrations MUST be idempotent and inspect current SQLite metadata before
rewriting storage.

#### Scenario: Existing legacy table shape
- **WHEN** a migration sees a legacy table shape through `sqlite_master` or
  `PRAGMA table_info`
- **THEN** it can rewrite the table into the current shape while preserving
  compatible rows
- **AND** rerunning the same migration after success is a no-op

### Requirement: Authority Record Migrations
The system SHALL execute package app record migrations through Authority storage
semantics.

#### Scenario: Migrate records
- **WHEN** a package app migration creates, patches, or tombstones records
- **THEN** Authority validation, flat record materialization, write-log append,
  idempotency, and monotonic cursor behavior are preserved
- **AND** browser replicas can catch up through existing sync changes

#### Scenario: Reject invalid migrated data
- **WHEN** a record migration would produce records that fail schema field,
  reference, unique constraint, or delete-blocker validation
- **THEN** the migration fails before commit
- **AND** existing stored records remain unchanged
