## MODIFIED Requirements

### Requirement: Workspace Source Of Truth

The system SHALL treat layout-only `formless.json`, workspace control-plane
record source, app archives, and media payloads as the reviewable local source
of truth for local-first Formless workspaces.

#### Scenario: Save from local Authority

- **WHEN** workspace save runs against local Authority state containing active
  app records, control-plane intent, and referenced core media
- **THEN** the system writes deterministic control-plane record source,
  deterministic app archives, and referenced media payloads from
  Authority-backed state
- **AND** browser replica state is not used as the source of truth
- **AND** secret-looking fields are rejected from reviewable workspace state

#### Scenario: Rebuild local runtime state

- **WHEN** workspace-local runtime state under `.formless/local` is reset
- **THEN** the next local dev run can rebuild runtime state from workspace
  control-plane record source and app archives
- **AND** reviewable workspace source remains unchanged by the reset

#### Scenario: Empty workspace runtime state

- **WHEN** workspace-local dev starts with a layout-only manifest, no
  control-plane `app-install` records, and no app archives
- **THEN** the local product instance starts with no installed apps
- **AND** the user can install the first app through local Authority-backed
  browser actions

### Requirement: Instance Workspaces

The system SHALL let a local Formless workspace review, save, pull, check,
push, dev, and deploy instance state without storing instance intent or secrets
in the manifest.

#### Scenario: Workspace manifest

- **WHEN** a Formless workspace manifest is written
- **THEN** `formless.json` remains manifest version `1` and stores only layout
  and local configuration such as kind, name, control-plane record source path,
  app archive root, media root, local state root, and ignored secret state root
- **AND** `app-install`, `app-route`, `domain-mapping`, `deploy-target`,
  `provider-config-ref`, `redirect-intent`, and `deploy-desired-resource`
  intent, remote target facts, and default app policy are not stored in
  `formless.json`
- **AND** secret-looking fields are rejected

#### Scenario: Workspace push apply

- **WHEN** `formless instance push --apply` runs
- **THEN** the workflow composes an instance archive from workspace
  control-plane record source, app archives, and media payloads
- **AND** a fresh whole-instance backup is taken
- **AND** the workflow dry-runs before applying the composed instance archive
  restore

### Requirement: Workspace Drift

The system SHALL require explicit acknowledgement before applying stale
workspace source.

#### Scenario: Check drift

- **WHEN** a workspace targeting a remote instance runs `formless instance check`
- **THEN** remote target archive state is compared with local app archives and
  local schema-owned control-plane record source
- **AND** `app-install`, `app-route`, `domain-mapping`, `deploy-target`,
  `provider-config-ref`, `redirect-intent`, `deploy-desired-resource`, app
  record, and media drift are reported without deriving intent from
  `formless.json`

#### Scenario: Refuse stale push

- **WHEN** current target state has drifted from the workspace source and
  `formless instance push --apply` runs without stale acknowledgement
- **THEN** the push is refused
- **AND** target data remains unchanged

### Requirement: Schema-Owned Control-Plane Archives

The system SHALL represent `app-install`, `app-route`, `domain-mapping`,
`redirect-intent`, and deployment intent in workspace record source and
instance archives as schema-owned control-plane records without storing secrets.

#### Scenario: Instance archive includes control-plane intent

- **WHEN** an instance archive includes instance control-plane configuration
- **THEN** `app-install`, `app-route`, `deploy-target`,
  `provider-config-ref`, `domain-mapping`, `redirect-intent`,
  `deploy-desired-resource`, and display-safe deployment history records are
  represented as control-plane schema records with qualified entity names such
  as `instance:app-install`, `instance:app-route`,
  `instance:deploy-target`, `instance:provider-config-ref`,
  `instance:domain-mapping`, `instance:redirect-intent`, and
  `instance:deploy-desired-resource`
- **AND** provider API tokens, Alchemy passwords, Alchemy state tokens, raw lease
  tokens, and full provider resource JSON are excluded
- **AND** installed app data remains represented through app snapshots scoped by
  app install identity

#### Scenario: Workspace record source remains reviewable

- **WHEN** workspace source is written
- **THEN** `app-install`, `app-route`, `domain-mapping`, `redirect-intent`, and
  deployment intent is reviewable as schema-owned record files
- **AND** those record files identify control-plane records with qualified
  kebab-case entity names at the workspace boundary
- **AND** `formless.json` does not duplicate that intent
- **AND** secret-looking fields are rejected from reviewable workspace state
