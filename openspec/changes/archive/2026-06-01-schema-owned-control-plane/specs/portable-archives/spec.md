## ADDED Requirements

### Requirement: Schema-Owned Control-Plane Archives

The system SHALL represent app install, route, and deployment intent in instance
archives and workspaces as schema-owned control-plane records without storing
secrets.

#### Scenario: Instance archive includes control-plane intent

- **WHEN** an instance archive includes instance control-plane configuration
- **THEN** app installs, app routes, deploy targets, domain mappings, redirect
  intent, desired resources, and display-safe deployment history are represented
  as control-plane schema records
- **AND** provider API tokens, Alchemy passwords, Alchemy state tokens, raw
  lease tokens, and full provider resource JSON are excluded
- **AND** installed app data remains represented through app snapshots scoped by
  app install identity

#### Scenario: Workspace manifest remains reviewable

- **WHEN** an instance workspace manifest or archive is written
- **THEN** app install, route, domain, and deployment intent is reviewable as
  schema-owned records or record files
- **AND** secret-looking fields are rejected from reviewable workspace state

### Requirement: Schema Control-Plane Drift

The system SHALL compare workspace control-plane intent against remote
schema-owned control-plane records.

#### Scenario: Check control-plane drift

- **WHEN** `formless instance check` compares instance control-plane state
- **THEN** drift is reported from schema-owned app install, app route, deploy
  target, domain mapping, redirect, and desired resource records
- **AND** provider drift summaries remain separate from desired intent drift
