# Portable Archives Specification

## Purpose

Portable archives move Formless app and instance data through reviewable export,
restore, import, and workspace workflows. They are backup, restore, import, and
ejection plumbing, not bidirectional instance sync.

## Requirements

### Requirement: Archive Kinds And Capabilities

The system SHALL encode app and instance archives with explicit kind, version,
capability, metadata, app data, and media payload information.

#### Scenario: Archive kinds

- GIVEN a portable archive is parsed
- WHEN the archive kind is read
- THEN supported kinds are `formless.instanceArchive` and
  `formless.appArchive`
- AND unsupported kinds are rejected before mutation

#### Scenario: Media capability

- GIVEN an archive includes owned media
- WHEN capabilities are parsed
- THEN `core-media-assets` is accepted
- AND `app-scoped-media` is rejected

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

### Requirement: Export Latest Archive Format

The system SHALL write portable archives using the latest supported archive
envelope.

#### Scenario: Export app or instance archive

- WHEN an app or instance archive is exported
- THEN the archive uses the latest supported archive version
- AND the archive records enough package app revision and schema hash facts for
  future compatibility planning
- AND each archived app install records package revision and source schema hash
  facts

### Requirement: Archive Export

The system SHALL export archives from Authority-backed source of truth, not
browser replica state.

#### Scenario: Instance export

- GIVEN a target Formless instance has app installs and app data
- WHEN an instance archive is exported
- THEN installed app registry state, app snapshots, and referenced core media
  are read from the target
- AND archive media files are written at manifest archive paths

#### Scenario: App export

- GIVEN one installed app is selected
- WHEN an app archive is exported
- THEN one app archive directory is written
- AND referenced core image media objects are included when records reference
  them

### Requirement: Restore Planning

The system MUST validate an archive before mutating Authority storage or media
state.

#### Scenario: Restore dry-run

- GIVEN a portable archive directory exists
- WHEN restore runs without `--apply`
- THEN validation and planning run as a dry-run
- AND no remote app, instance, or media data is mutated

#### Scenario: Validate before apply

- GIVEN restore is requested with `--apply`
- WHEN the archive contains schemas, records, install metadata, or media
- THEN schema, records, references, unique constraints, app install policy,
  media metadata, and media files are validated before mutation

### Requirement: Restore Execution

The system SHALL restore media before app records and SHALL keep restore policy
explicit.

#### Scenario: Apply restore

- GIVEN restore validation succeeds and mutation is explicitly requested
- WHEN restore applies
- THEN core media objects are written before app records
- AND app data is restored through installed app storage identity

#### Scenario: Replacement policy

- GIVEN restore would collide with existing install metadata
- WHEN replacement was not explicitly requested
- THEN restore refuses the collision
- AND existing target data remains unchanged

### Requirement: App Archive Retargeting

The system SHALL allow app archives to restore to a selected install id when the
restore command supports retargeting.

#### Scenario: Retarget Site app archive

- GIVEN a Site app archive exists
- WHEN `restore-app` runs with a target install id
- THEN the app archive can be restored to that install id
- AND install-scoped storage and routes use the target install id

### Requirement: Site Project Import

The system SHALL import standalone Site projects as installed Site app archives.

#### Scenario: Import standalone Site project

- GIVEN a standalone Site project has source records and project media
- WHEN `formless archive import-site` runs
- THEN an installed Site app archive is written
- AND project media is represented as core media objects with the
  `core-media-assets` capability

#### Scenario: Preserve external URLs

- GIVEN a standalone Site project uses external media URLs
- WHEN the project is imported
- THEN external URLs are preserved as authored values
- AND no provider media object is created for those URLs

### Requirement: Workspace Source Of Truth

The system SHALL treat layout-only `formless.json`, workspace control-plane
record source, app archives, and media payloads as the reviewable local source
of truth for local-first Formless workspaces.

#### Scenario: Save from local Authority

- **GIVEN** local workspace runtime state contains active app records,
  control-plane intent, and referenced core media
- **WHEN** workspace save runs
- **THEN** the system writes deterministic app archive and control-plane
  workspace source from Authority-backed state
- **AND** route intent is written as `instance:route` records
- **AND** browser replica state is not used as the source of truth
- **AND** secret-looking fields are rejected from reviewable workspace state

#### Scenario: Rebuild local runtime state

- **GIVEN** a local workspace has reviewable archive source
- **WHEN** workspace-local runtime state under `.formless/local` is reset
- **THEN** the next local dev run can rebuild runtime state from the workspace
  control-plane record source and app archives
- **AND** archive source remains unchanged by the reset

#### Scenario: Empty workspace runtime state

- **GIVEN** a local workspace has no declared apps and no app archives
- **WHEN** workspace-local dev starts
- **THEN** the local product instance starts with no installed apps
- **AND** the user can install the first app through local Authority-backed web
  actions

### Requirement: Instance Workspaces

The system SHALL let a local Formless workspace review, save, pull, check,
push, dev, and deploy instance archive state without storing secrets in the
manifest.

#### Scenario: Workspace manifest

- **GIVEN** a Formless workspace is initialized
- **WHEN** the manifest is written
- **THEN** `formless.json` stores reviewable workspace layout and local
  configuration paths
- **AND** app installs, routes, domain intent, deploy targets, provider
  references, redirect intent, desired resources, remote target facts, and app
  records are not duplicated as manifest intent
- **AND** secret-looking fields are rejected

#### Scenario: Workspace push apply

- **GIVEN** workspace source is ready
- **WHEN** `formless instance push --apply` runs
- **THEN** a fresh whole-instance backup is taken
- **AND** the workflow dry-runs before applying the composed instance archive
  restore

### Requirement: Workspace Drift

The system SHALL require explicit acknowledgement before applying stale
workspace state.

#### Scenario: Check drift

- GIVEN a workspace targets a remote instance
- WHEN `formless instance check` runs
- THEN remote target archive state is compared with local workspace archives
- AND desired-domain drift is reported across host, profile, target install id,
  and enabled state

#### Scenario: Refuse stale push

- GIVEN current target state has drifted from the workspace
- WHEN `formless instance push --apply` runs without stale acknowledgement
- THEN the push is refused
- AND target data remains unchanged

### Requirement: Qualified Archive And Workspace Record Entity Names

The system SHALL identify records with qualified entity names at archive and
workspace record-source boundaries.

#### Scenario: Write qualified control-plane record entity

- WHEN instance control-plane records are written to an instance archive or
  workspace record source
- THEN the record boundary identifies entity names as `instance:app-install`,
  `instance:app-route`, `instance:deploy-target`,
  `instance:provider-config-ref`, `instance:domain-mapping`,
  `instance:redirect-intent`, `instance:deploy-desired-resource`,
  `instance:deploy-attempt`, `instance:deploy-evidence-summary`, or
  `instance:deploy-drift-report`
- AND restore maps the qualified entity name back to the schema-local entity key
  before Authority validation

#### Scenario: Keep app data outside control-plane records

- WHEN a workspace or instance archive includes installed app data
- THEN installed app records remain scoped by app install identity through app
  archives or app snapshots
- AND installed app records are not stored as instance control-plane records

### Requirement: Schema-Owned Control-Plane Archives

The system SHALL represent app install, route, and deployment intent in
instance archives and workspaces as schema-owned control-plane records without
storing secrets.

#### Scenario: Instance archive includes control-plane intent

- **GIVEN** an instance archive includes instance control-plane configuration
- **WHEN** the archive is parsed or restored
- **THEN** app installs, routes, deploy targets, provider config references,
  desired resources, and display-safe deployment history are represented as
  control-plane schema records
- **AND** route intent is represented as `instance:route` records instead of
  separate app route, domain mapping, or redirect intent records
- **AND** provider API tokens, Alchemy passwords, Alchemy state tokens, raw
  lease tokens, and full provider resource JSON are excluded
- **AND** installed app data remains represented through app snapshots scoped by
  app install identity

#### Scenario: Workspace manifest remains reviewable

- **GIVEN** `formless.json` or workspace archive source is written
- **WHEN** app install, route, domain, redirect, or deployment intent is
  included
- **THEN** that intent is reviewable as schema-owned records or record files
- **AND** route intent uses qualified entity name `instance:route` at workspace
  and archive boundaries
- **AND** secret-looking fields are rejected from reviewable workspace state

### Requirement: Schema Control-Plane Drift

The system SHALL compare workspace control-plane intent against remote
schema-owned control-plane records.

#### Scenario: Check control-plane drift

- **GIVEN** `formless instance check` compares instance control-plane state
- **WHEN** remote and local control-plane records differ
- **THEN** drift is reported from schema-owned app install, route, deploy
  target, provider reference, and desired resource records
- **AND** app path, exact-host mapping, and redirect drift are compared through
  `instance:route` records
- **AND** provider drift summaries remain separate from desired intent drift
