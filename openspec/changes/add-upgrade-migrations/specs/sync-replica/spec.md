## ADDED Requirements

### Requirement: Stale Browser Write Handling
The system SHALL reject incompatible stale browser writes with reload-required
errors.

#### Scenario: Reject stale write
- **WHEN** a browser replica sends a mutation or action using a stale runtime
  protocol, schema timestamp, or package app revision that is no longer write
  compatible
- **THEN** the Authority rejects the write with a reload-required error
- **AND** no committed change row is appended

#### Scenario: Read compatibility remains best effort
- **WHEN** a stale browser replica requests bootstrap or sync through a
  compatible read protocol
- **THEN** the runtime can return read data
- **AND** the response can include current schema facts needed for reload or
  re-bootstrap behavior

### Requirement: Browser Cache Migration
The system SHALL treat IndexedDB migrations as cache migrations, not source of
truth migrations.

#### Scenario: Local database migration succeeds
- **WHEN** browser replica storage opens with an older local database shape
- **THEN** local IndexedDB upgrade code can migrate cache metadata and records
- **AND** subsequent sync still uses Authority as source of truth

#### Scenario: Local database migration fails
- **WHEN** browser replica storage cannot safely migrate local IndexedDB state
- **THEN** the client can delete the local replica and re-bootstrap from
  Authority
- **AND** no Authority data is lost
