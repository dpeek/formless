## ADDED Requirements

### Requirement: Domain Intent As Deployment Records

The system SHALL represent custom-domain mappings and redirect intent as
schema-owned control-plane records.

#### Scenario: Mapping record

- **WHEN** an authorized owner or admin creates an exact-host mapping
- **THEN** the mapping is stored as a control-plane record with host,
  profile, optional target install id, enabled state, and timestamps
- **AND** route behavior matches existing custom-domain mapping semantics
- **AND** app and public Site mappings reference the target app install or app
  route record

#### Scenario: Redirect record

- **WHEN** redirect intent is created or updated
- **THEN** the redirect is stored as a control-plane record with source host,
  target, status code, path/query policy, enabled state, and timestamps
- **AND** provider resources are not mutated by the intent write

### Requirement: Custom-Domain Compatibility Surface

Existing custom-domain APIs SHALL remain compatible while reading and writing
schema-owned control-plane records.

#### Scenario: Existing API delegates to schema records

- **WHEN** existing custom-domain mapping or redirect APIs are called during
  migration
- **THEN** they read or write the corresponding deployment schema records
- **AND** their response shape remains compatible for existing clients

#### Scenario: Cleanup evidence remains separate

- **WHEN** provider cleanup, manual cleanup, or forget workflows run
- **THEN** desired route records, provider evidence summaries, and cleanup
  history remain separate records or projections
- **AND** deleting desired route intent does not delete provider evidence unless
  an explicit cleanup action records that result
