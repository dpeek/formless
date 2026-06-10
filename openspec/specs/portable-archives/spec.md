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
  `instance:domain-mapping`, and `instance:deployment-config` before
  validation
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

### Requirement: Archive Package Boundary

The system SHALL expose reusable portable archive contracts, parsing,
normalization, restore planning, and local archive file adapters through the
Archive package slice.

#### Scenario: Package owns portable archive contracts

- **WHEN** CLI, Site runtime, Worker restore APIs, Workspace operations,
  upgrade planning, tests, or package slices need archive envelope kinds,
  archive version constants, archive capability parsing, archive formatting,
  compatibility normalizers, restore dry-run planning, media manifest
  validation, or deterministic local archive directory IO
- **THEN** they import that behavior from `@dpeek/formless-archive` or
  `@dpeek/formless-archive/node`
- **AND** they do not import package-owned archive behavior from old
  `src/shared/archive*` modules or unexported package internals

#### Scenario: Package does not own archive execution

- **WHEN** archive export, archive restore apply, app install mutation,
  Authority reads or writes, Durable Object storage, browser replica state,
  media object mutation, provider mutation, workspace save/check/pull/push,
  deploy, or CLI command policy is needed
- **THEN** those behaviors remain owned by CLI, Site runtime, Archive workflows,
  Workspace runtime, Worker runtime, Authority, Media runtime, Deploy runtime,
  or provider adapters
- **AND** the Archive package supplies contracts, parser/formatter behavior,
  compatibility normalization, deterministic planning, and local archive
  filesystem adapters rather than owning app records, runtime storage, media
  storage, deployed runtime records, provider credentials, Cloudflare
  resources, or Alchemy resources

### Requirement: Workspace Source Of Truth

The system SHALL treat layout-only `formless.json`, workspace control-plane
record source, app archives, and media payloads as the reviewable local source
of truth for local-first Formless workspaces.

#### Scenario: Fresh local workspace bootstrap

- **WHEN** `formless dev` starts for a selected workspace root without
  `formless.json`
- **THEN** the CLI writes a layout-only manifest with the workspace name
  defaulted from the selected directory or confirmed interactive input
- **AND** the CLI prepares ignored local state and `.gitignore` coverage for
  `.formless/`
- **AND** local admin tokens, owner session signing secrets, local session
  bootstrap tokens, gateway proxy tokens, and CSRF tokens are kept under ignored
  local state or process environment
- **AND** the CLI does not create empty app archive, control-plane record
  source, or media directories
- **AND** no app install, route, deployment config, Cloudflare resource,
  Alchemy resource, provider credential, or remote instance is created by fresh
  local workspace bootstrap

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

- **WHEN** workspace-local dev starts after fresh CLI bootstrap with a
  layout-only manifest, no control-plane `app-install` records, and no app
  archives
- **THEN** the local product instance starts with no installed apps
- **AND** the user can install the first app through local Authority-backed
  browser actions

### Requirement: Workspace Package Boundary

The system SHALL expose reusable Formless workspace source, local state, and
semantic operation contracts through the Workspace package slice.

#### Scenario: Package owns workspace source contracts

- **WHEN** CLI, Site runtime, Gateway runtime adapters, archive workflows,
  tests, or local agent workflows need `formless.json` manifest parsing,
  workspace path defaults, workspace target URL normalization, reviewable
  control-plane record-source file contracts, ignored local state contracts,
  ignored secret state contracts, semantic workspace operation input shapes,
  display-safe operation state, operation result shapes, operation redaction,
  or deterministic local filesystem workspace IO
- **THEN** they import that behavior from `@dpeek/formless-workspace` or
  `@dpeek/formless-workspace/node`
- **AND** they do not import package-owned workspace behavior from old
  `src/site` workspace modules or unexported package internals

#### Scenario: Package does not own runtime mutation

- **WHEN** workspace save, check, pull, push, deploy, credential setup, export,
  restore, app install, control-plane mutation, Authority reads, provider
  mutation, Gateway authorization, or runtime topology selection is needed
- **THEN** those behaviors remain owned by CLI, Site runtime, Archive
  workflows, Deploy runtime, Worker runtime, Gateway runtime adapters, or
  provider adapters
- **AND** the Workspace package supplies source/state contracts, pure helpers,
  display-safe state handling, and local filesystem adapters rather than
  owning app records, deployed runtime records, provider credentials, or
  Cloudflare and Alchemy execution
- **AND** display-safe operation state persists under ignored local workspace
  state, not reviewable record source, app archives, or media payloads

### Requirement: Instance Workspaces

The system SHALL let a local Formless workspace review, save, pull, check,
push, dev, and deploy instance state without storing instance intent or secrets
in the manifest.

#### Scenario: Workspace manifest

- **WHEN** a Formless workspace manifest is written
- **THEN** `formless.json` remains manifest version `1` and stores only layout
  and local configuration such as kind, name, control-plane record source path,
  app archive root, media root, local state root, and ignored secret state root
- **AND** `app-install`, unified `route`, `deployment-config` intent, remote
  target facts, deployment execution history, and default app policy are not
  stored in `formless.json`
- **AND** provider worker-name overrides are deployment intent stored in
  schema-owned deployment config records, not in `formless.json`
- **AND** deployed remote target origin facts are stored on
  `deployment-config` records as display-safe `targetUrl` values
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
- **AND** `app-install`, unified `route`, `deployment-config`, app record, and
  media drift are reported without deriving intent from `formless.json`
- **AND** remote drift checks select the deployed instance origin from enabled
  `deployment-config.targetUrl` record source
- **AND** deployment attempt, evidence, drift, cleanup, and status summaries are
  treated as runtime execution state rather than source drift

#### Scenario: Refuse stale push

- **WHEN** current target state has drifted from the workspace source and
  `formless instance push --apply` runs without stale acknowledgement
- **THEN** the push is refused
- **AND** target data remains unchanged

### Requirement: Qualified Archive And Workspace Record Entity Names

The system SHALL identify records with qualified entity names at archive and
workspace record-source boundaries.

#### Scenario: Write qualified control-plane record entity

- WHEN instance control-plane records are written to an instance archive or
  workspace record source
- THEN the record boundary identifies entity names as `instance:app-install`,
  `instance:app-route`, `instance:deployment-config`,
  `instance:domain-mapping`, `instance:redirect-intent`, or
  `instance:route`
- AND restore maps the qualified entity name back to the schema-local entity key
  before Authority validation

#### Scenario: Keep app data outside control-plane records

- WHEN a workspace or instance archive includes installed app data
- THEN installed app records remain scoped by app install identity through app
  archives or app snapshots
- AND installed app records are not stored as instance control-plane records

### Requirement: Schema-Owned Control-Plane Archives

The system SHALL represent `app-install`, unified `route`, and deployment
intent in workspace record source and instance archives as schema-owned
control-plane records without storing secrets or deployment execution history.

#### Scenario: Instance archive includes control-plane intent

- **WHEN** an instance archive includes instance control-plane configuration
- **THEN** `app-install`, `route`, and `deployment-config` records are
  represented as control-plane schema records with qualified entity names such
  as `instance:app-install`, `instance:route`, and
  `instance:deployment-config`
- **AND** provider API tokens, Alchemy passwords, Alchemy state tokens, raw lease
  tokens, and full provider resource JSON are excluded
- **AND** `deploy-attempt`, `deploy-evidence-summary`,
  `deploy-drift-report`, cleanup audit summaries, and provider state payloads
  are excluded from instance archives and workspace record source
- **AND** installed app data remains represented through app snapshots scoped by
  app install identity

#### Scenario: Workspace record source remains reviewable

- **WHEN** workspace source is written
- **THEN** `app-install`, unified `route`, and deployment intent is reviewable
  as schema-owned record files
- **AND** those record files identify control-plane records with qualified
  kebab-case entity names at the workspace boundary
- **AND** record source is rooted at manifest `source.records`, defaults to
  `records/instance-control-plane`, and writes deterministic entity files for
  `instance:app-install`, `instance:route`, and
  `instance:deployment-config`
- **AND** each entity file declares kind
  `formless.instanceControlPlaneRecordSource`, version `1`, schema key
  `instance-control-plane`, a `schemaUpdatedAt` timestamp, the qualified
  entity name, and records for only that entity
- **AND** `formless.json` does not duplicate that intent
- **AND** deployment attempts, evidence summaries, drift reports, and cleanup
  audit summaries are available only through deployment runtime or gateway
  operation status, not reviewable source records
- **AND** secret-looking fields are rejected from reviewable workspace state

### Requirement: Schema Control-Plane Drift

The system SHALL compare workspace control-plane intent against remote
schema-owned control-plane records.

#### Scenario: Check control-plane drift

- **GIVEN** `formless instance check` compares instance control-plane state
- **WHEN** remote and local control-plane records differ
- **THEN** drift is reported from schema-owned app install, route, and
  deployment config records
- **AND** app path, exact-host mapping, and redirect drift are compared through
  `instance:route` records
- **AND** provider drift summaries remain separate from desired intent drift
