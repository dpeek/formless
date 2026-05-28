## MODIFIED Requirements

### Requirement: Versioned Desired Deployment State

The system SHALL expose immutable desired deployment state versions for a
supported deployment target.

#### Scenario: Read latest desired state

- WHEN a client reads desired deployment state for a target backed by
  schema-owned control-plane records
- THEN the response includes a desired-state version id, monotonic revision,
  stable hash, schema version, target id, resource graph, and display summary
- AND the resource graph is projected from app route, domain mapping, redirect,
  provider config reference, and desired resource records for that target
- AND the response does not include provider credentials, Alchemy passwords,
  state tokens, raw lease tokens, or runtime secrets
- AND the response is not cached

#### Scenario: Desired state hash stability

- WHEN user-authored control-plane intent has not changed
- THEN repeated desired-state reads for the same target produce the same hash
- AND timestamps, attempt history, evidence summaries, drift reports, and
  status display data do not change the desired-state hash

### Requirement: Deployment Runtime API

The system SHALL expose instance deployment runtime reads and writeback through
the `/api/formless/deployments` API family.

#### Scenario: Read deployment state

- WHEN a client reads `/api/formless/deployments/desired-state` or
  `/api/formless/deployments/status`
- THEN the runtime reads the requested supported target
- AND the desired-state projection may be materialized from schema-owned
  control-plane records when that target supports them
- AND the response uses `Cache-Control: no-store`
