## MODIFIED Requirements

### Requirement: Schema-Owned Instance Control Plane

The system SHALL model owner-authored instance management intent as
schema-owned control-plane records while keeping deployment execution history
outside control-plane source records.

#### Scenario: Control-plane records

- **GIVEN** the instance control-plane schema is loaded
- **WHEN** its storage identity is selected
- **THEN** it uses schema key `instance-control-plane`, storage identity
  `instance:control-plane`, and API prefix `/api/formless/control-plane`
- **AND** it defines flat records for app installs, unified routes, deploy
  targets, provider config references, and desired resources
- **AND** it does not define `deploy-attempt`, `deploy-evidence-summary`, or
  `deploy-drift-report` as schema-owned control-plane record entities
- **AND** deployment attempts, evidence summaries, drift reports, cleanup audit
  summaries, and raw leases remain deployment runtime or local gateway
  operation state

### Requirement: Deployment Execution Boundary

The system SHALL keep provider execution and execution history outside
schema-owned source records while returning display-safe deployment summaries
through runtime and gateway channels.

#### Scenario: Display-safe history

- **GIVEN** a CLI deployer, local workspace gateway, CI job, or trusted deploy
  node writes plan, success, failure, cleanup, or drift results
- **WHEN** the writeback is accepted
- **THEN** the writeback binds to an exact desired-state version and actor
- **AND** display-safe attempt, evidence, drift, cleanup, and status summaries
  may be stored by deployment runtime state or local gateway operation state
- **AND** those summaries are not mirrored as schema-owned control-plane
  records and are not written to reviewable workspace source

## ADDED Requirements

### Requirement: Workspace Canonical Control-Plane Source

The system SHALL use schema-owned instance control-plane records as the
canonical source for workspace-authored instance intent.

#### Scenario: Save control-plane records to workspace source

- **WHEN** local Authority control-plane state is saved to workspace source
- **THEN** `app-install`, `route`, `deploy-target`, `provider-config-ref`, and
  `deploy-desired-resource` records are written as schema-owned record source
- **AND** workspace and archive boundaries identify those records with
  qualified entity names such as `instance:app-install` and
  `instance:route`
- **AND** `formless.json` does not duplicate those records as app, route,
  domain, or deploy intent
- **AND** `deploy-attempt`, `deploy-evidence-summary`, and
  `deploy-drift-report` records are not written as workspace source

#### Scenario: Restore control-plane records from workspace source

- **WHEN** local dev, push, or deploy composes runtime state from workspace
  source
- **THEN** control-plane record source is restored through the
  `instance:control-plane` Authority storage identity
- **AND** Authority validation rejects invalid references, immutable field
  changes, route conflicts, secret values, and unsupported control-plane
  entities before behavior changes

### Requirement: Browser-Owned Instance Intent

The system SHALL allow browser owner/admin flows to author instance intent by
writing schema-owned control-plane records.

#### Scenario: Browser edits app and route intent

- **WHEN** a browser owner or admin creates an app install or edits route
  configuration
- **THEN** the write commits `app-install` and `route` records through
  Authority validation
- **AND** saved workspace source is later generated from those records rather
  than from manifest declarations

#### Scenario: Browser edits deploy and domain intent

- **WHEN** a browser owner or admin edits domain or deployment configuration
- **THEN** the write commits unified `route`, `deploy-target`,
  `provider-config-ref`, or `deploy-desired-resource` records through
  Authority validation
- **AND** provider credentials, raw provider state, and runtime secrets remain
  outside control-plane records
