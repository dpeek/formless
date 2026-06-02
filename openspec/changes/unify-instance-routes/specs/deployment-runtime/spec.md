## MODIFIED Requirements

### Requirement: Versioned Desired Deployment State

The system SHALL expose immutable desired deployment state versions for a
supported deployment target.

#### Scenario: Read latest desired state

- **WHEN** a client reads desired deployment state for a target
- **THEN** the response includes a desired-state version id, monotonic
  revision, stable hash, schema version, target id, resource graph, and display
  summary
- **AND** targets backed by schema-owned control-plane records project the
  resource graph from enabled route, provider config reference, deploy target,
  and desired resource records for that target
- **AND** host mount routes project custom-domain and DNS resources
- **AND** redirect routes project redirect and redirect DNS resources
- **AND** the response does not include provider credentials, Alchemy
  passwords, state tokens, raw lease tokens, or runtime secrets
- **AND** the response is not cached

#### Scenario: Desired state hash stability

- **WHEN** user intent has not changed
- **THEN** repeated desired-state reads for the same target produce the same
  hash
- **AND** timestamps, attempt history, evidence summaries, cleanup history,
  drift reports, and status display data do not change the desired-state hash

### Requirement: Deployment Resource Graph

The system SHALL represent deployment-facing intent as a resource graph with
stable logical ids and provider resource declarations.

#### Scenario: Graph resource identity

- **WHEN** desired state contains provider-managed resources
- **THEN** each graph resource has a stable logical id, kind, target id,
  provider family, inputs, and dependency metadata
- **AND** logical ids are deterministic for the same enabled route and provider
  config intent

#### Scenario: Graph is not provider truth

- **WHEN** the resource graph is stored or returned
- **THEN** it represents desired resources for planning
- **AND** it does not claim to be the current provider resource state
