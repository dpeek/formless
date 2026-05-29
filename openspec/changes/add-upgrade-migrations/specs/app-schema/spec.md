## ADDED Requirements

### Requirement: Package App Revision Facts

The system SHALL distinguish app schema language version from bundled package
app revision and source schema hash.

#### Scenario: Parse schema language version

- **WHEN** an app schema is parsed
- **THEN** `schema.version` continues to represent the schema language version
- **AND** package app revision is not read from `schema.version`

#### Scenario: Describe bundled package app revision

- **WHEN** bundled Site, Tasks, or Estii package metadata is read
- **THEN** the package declares a monotonic package revision and deterministic
  source schema hash
- **AND** current bundled packages can start at package revision `1`

### Requirement: Package App Schema Migrations

The system SHALL support code-backed package app migrations between package
app revisions.

#### Scenario: Migrate package app schema

- **WHEN** an installed package app is behind the current package revision
- **THEN** matching package app migrations can update the active schema and
  package revision facts
- **AND** the schema remains a valid parsed app schema before it is stored

#### Scenario: Preserve schema hash provenance

- **WHEN** a package app migration completes
- **THEN** stored package facts identify the applied package revision and source
  schema hash
- **AND** the hash is used for drift/provenance checks, not migration ordering
