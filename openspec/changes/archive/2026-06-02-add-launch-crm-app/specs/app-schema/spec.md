## MODIFIED Requirements

### Requirement: Bundled Source Apps

The system SHALL provide source schemas for the current bundled schema keys `tasks`, `estii`, `site`, and `crm`, and SHALL treat source seed records as stored-record shaped data.

#### Scenario: Load current source app

- **GIVEN** a current schema key `tasks`, `estii`, `site`, or `crm`
- **WHEN** the runtime loads the source schema
- **THEN** the app schema is available for that schema key
- **AND** seed records can initialize records without being interpreted as change rows

### Requirement: Package App Revision Facts

The system SHALL distinguish app schema language version from bundled package
app revision and source schema hash.

#### Scenario: Parse schema language version

- **WHEN** an app schema is parsed
- **THEN** `schema.version` continues to represent the schema language version
- **AND** package app revision is not read from `schema.version`

#### Scenario: Describe bundled package app revision

- **WHEN** bundled Site, Tasks, Estii, or CRM package metadata is read
- **THEN** the package declares a monotonic package revision and deterministic
  source schema hash
- **AND** current bundled packages can start at package revision `1`
