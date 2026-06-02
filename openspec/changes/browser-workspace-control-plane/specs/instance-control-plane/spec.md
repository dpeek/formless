## ADDED Requirements

### Requirement: Workspace Canonical Control-Plane Source

The system SHALL use schema-owned instance control-plane records as the
canonical source for workspace-authored instance intent.

#### Scenario: Save control-plane records to workspace source

- **WHEN** local Authority control-plane state is saved to workspace source
- **THEN** `app-install`, `app-route`, `deploy-target`,
  `provider-config-ref`, `domain-mapping`, `redirect-intent`, and
  `deploy-desired-resource` records are written as schema-owned record source
- **AND** workspace and archive boundaries identify those records with
  qualified entity names such as `instance:app-install` and
  `instance:app-route`
- **AND** `formless.json` does not duplicate those records as app, route,
  domain, or deploy intent

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
- **THEN** the write commits `app-install` and `app-route` records through
  Authority validation
- **AND** saved workspace source is later generated from those records rather
  than from manifest declarations

#### Scenario: Browser edits deploy and domain intent

- **WHEN** a browser owner or admin edits domain or deployment configuration
- **THEN** the write commits `domain-mapping`, `redirect-intent`,
  `deploy-target`, `provider-config-ref`, or `deploy-desired-resource` records
  through Authority validation
- **AND** provider credentials, raw provider state, and runtime secrets remain
  outside control-plane records
