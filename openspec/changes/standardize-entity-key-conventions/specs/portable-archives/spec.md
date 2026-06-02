## ADDED Requirements

### Requirement: Qualified Archive And Workspace Record Entity Names

The system SHALL identify records with qualified entity names at archive and
workspace record-source boundaries.

#### Scenario: Write qualified control-plane record entity

- **WHEN** instance control-plane records are written to an instance archive or
  workspace record source
- **THEN** the record boundary identifies entity names as `instance:app-install`,
  `instance:app-route`, `instance:deploy-target`,
  `instance:provider-config-ref`, `instance:domain-mapping`,
  `instance:redirect-intent`, `instance:deploy-desired-resource`,
  `instance:deploy-attempt`, `instance:deploy-evidence-summary`, or
  `instance:deploy-drift-report`
- **AND** restore maps the qualified entity name back to the schema-local entity
  key before Authority validation

#### Scenario: Keep app data outside control-plane records

- **WHEN** a workspace or instance archive includes installed app data
- **THEN** installed app records remain scoped by app install identity through
  app archives or app snapshots
- **AND** installed app records are not stored as instance control-plane records

## MODIFIED Requirements

### Requirement: Archive Compatibility Normalization

The system SHALL normalize older supported archive versions before restore or
import validation.

#### Scenario: Restore older supported archive

- WHEN archive restore reads an older supported app or instance archive envelope
- THEN a version-specific normalizer converts it into the current internal
  restore model before validation
- AND restore planning reports normalization evidence in dry-run output
- AND version `1` app and instance archive envelopes are normalized to the
  latest archive envelope before validation

#### Scenario: Normalize legacy control-plane entity names

- WHEN a supported archive or workspace record-source reader encounters older
  camelCase instance control-plane entity names
- THEN the reader normalizes those names to canonical qualified names such as
  `instance:app-install`, `instance:app-route`,
  `instance:domain-mapping`, and `instance:deploy-target` before validation
- AND dry-run or check output reports the normalization evidence
- AND canonical output is written with kebab-case qualified entity names

#### Scenario: Reject unsupported archive version

- WHEN archive restore reads an unsupported archive kind, unsupported version,
  archive version without a registered normalizer, or unsupported entity-name
  spelling
- THEN restore is rejected before mutation
- AND target app, instance, and media data remain unchanged

### Requirement: Schema-Owned Control-Plane Archives

The system SHALL represent app install, route, and deployment intent in instance
archives and workspaces as schema-owned control-plane records without storing
secrets.

#### Scenario: Instance archive includes control-plane intent

- GIVEN an instance archive includes instance control-plane configuration
- WHEN the archive is parsed or restored
- THEN app installs, app routes, deploy targets, provider config references,
  domain mappings, redirect intent, desired resources, and display-safe
  deployment history are represented as control-plane schema records with
  qualified entity names such as `instance:app-install`,
  `instance:app-route`, `instance:deploy-target`,
  `instance:provider-config-ref`, `instance:domain-mapping`,
  `instance:redirect-intent`, `instance:deploy-desired-resource`,
  `instance:deploy-attempt`, `instance:deploy-evidence-summary`, and
  `instance:deploy-drift-report`
- AND provider API tokens, Alchemy passwords, Alchemy state tokens, raw lease
  tokens, and full provider resource JSON are excluded
- AND installed app data remains represented through app snapshots scoped by app
  install identity

#### Scenario: Workspace manifest remains reviewable

- GIVEN `formless.json` or workspace archive source is written
- WHEN app install, route, domain, or deployment intent is included
- THEN that intent is reviewable as schema-owned records or record files using
  qualified kebab-case entity names at the workspace boundary
- AND secret-looking fields are rejected from reviewable workspace state

### Requirement: Schema Control-Plane Drift

The system SHALL compare workspace control-plane intent against remote
schema-owned control-plane records.

#### Scenario: Check control-plane drift

- GIVEN `formless instance check` compares instance control-plane state
- WHEN remote and local control-plane records differ
- THEN drift is reported from schema-owned `instance:app-install`,
  `instance:app-route`, `instance:deploy-target`,
  `instance:provider-config-ref`, `instance:domain-mapping`,
  `instance:redirect-intent`, and `instance:deploy-desired-resource` records
- AND provider drift summaries remain separate from desired intent drift
