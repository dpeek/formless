# Portable Archives Specification

## Purpose

Portable archives move Formless app and instance data through reviewable save,
pull, push, deploy, backup, restore, import, and ejection workflows. They are
internal data-movement plumbing, not a separate public CLI command family.

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

### Requirement: Current Archive Input Only

The system SHALL reject non-current portable archive envelopes before restore,
import, or workspace validation.

#### Scenario: Reject non-current archive input

- WHEN archive restore, restore dry-run planning, import validation, or
  workspace archive checks read an unsupported archive kind, archive version
  older or newer than the current archive version, missing package fact fields,
  or unsupported entity-name spelling
- THEN the archive is rejected before mutation
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
- THEN instance control-plane storage snapshots, app storage snapshots, and
  referenced core media are read from the target
- AND archive media files are written at manifest archive paths
- AND protected target reads use owner session or admin bearer authorization
  supplied by the caller

#### Scenario: App export

- GIVEN one installed app is selected
- WHEN an app archive is exported
- THEN one app archive directory is written
- AND referenced core image media objects are included when records reference
  them
- AND protected target reads use owner session or admin bearer authorization
  supplied by the caller

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
- AND instance control-plane data is restored through `instance:control-plane`
  storage identity when the archive includes it

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
- WHEN a workspace or restore workflow applies the archive with a target
  install id
- THEN the app archive can be restored to that install id
- AND install-scoped storage and routes use the target install id

### Requirement: Archive Package Boundary

The system SHALL expose reusable portable archive contracts, current-envelope
parsing, restore planning, and local archive file adapters through the Archive
package slice.

#### Scenario: Package owns portable archive contracts

- **WHEN** CLI, Site runtime, Worker restore APIs, Workspace operations,
  upgrade planning, tests, or package slices need archive envelope kinds,
  archive version constants, archive capability parsing, archive formatting,
  restore dry-run planning, media manifest validation, or deterministic local
  archive directory IO
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
  deterministic planning, and local archive filesystem adapters rather than
  owning app records, runtime storage, media storage, deployed runtime records,
  provider credentials, Cloudflare resources, or Alchemy resources

#### Scenario: Current archive version only

- **GIVEN** archive parsing, restore dry-run planning, or workspace archive
  checks read an archive envelope
- **WHEN** the archive version differs from the current portable archive version
- **THEN** the archive is rejected with an unsupported archive version error
- **AND** package facts are not filled from bundled defaults or other
  compatibility paths

### Requirement: Workspace Source Of Truth

The system SHALL treat layout-only `formless.json`, optional workspace package
links, workspace storage snapshots, and media payloads as the reviewable local
source of truth for local-first Formless workspaces.

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
- **AND** the CLI does not create empty storage snapshot or media directories
- **AND** no app install, route, deployment config, Cloudflare resource,
  Alchemy resource, provider credential, or remote instance is created by fresh
  local workspace bootstrap

#### Scenario: Save from local Authority

- **WHEN** workspace save runs against local Authority state containing active
  app records, control-plane intent, and referenced core media
- **THEN** the system writes deterministic storage snapshots and referenced
  media payloads from Authority-backed state
- **AND** instance control-plane records are written to `state/instance.json`
- **AND** installed app records are written to `state/apps/<installId>.json`
- **AND** browser replica state is not used as the source of truth
- **AND** secret-looking fields are rejected from reviewable workspace state

#### Scenario: Rebuild local runtime state

- **WHEN** workspace-local runtime state under `.formless/local` is reset
- **THEN** the next local dev run can rebuild runtime state from workspace
  storage snapshots and media payloads
- **AND** reviewable workspace source remains unchanged by the reset

#### Scenario: Empty workspace runtime state

- **WHEN** workspace-local dev starts after fresh CLI bootstrap with a
  layout-only manifest and no storage snapshots
- **THEN** the local product instance starts with no installed apps
- **AND** the user can install the first app through local Authority-backed
  browser actions

### Requirement: Workspace Storage Snapshot State

The system SHALL store workspace state as storage snapshots and media payloads,
not portable archive directories.

#### Scenario: Workspace snapshot files

- **WHEN** workspace source is written
- **THEN** instance control-plane state is written to `state/instance.json`
- **AND** each installed app's Authority storage state is written to
  `state/apps/<installId>.json`
- **AND** each snapshot declares kind `formless.storageSnapshot`, version,
  storage identity, schema key, exported timestamp, schema timestamp, source
  cursor, schema, and records
- **AND** `state/instance.json` uses storage identity `instance:control-plane`
- **AND** app snapshot files use storage identity `app:<installId>`

#### Scenario: Auto-save uses compact workspace state

- **WHEN** local workspace auto-save persists source from local Authority
- **THEN** it writes the same `state/instance.json`, `state/apps/<installId>.json`,
  and `state/media` source shape as manual workspace save
- **AND** it does not write portable archive envelopes as workspace source
- **AND** it does not read browser IndexedDB as source

#### Scenario: Workspace media state

- **WHEN** workspace source contains core media referenced by app records
- **THEN** media payloads are stored under `state/media`
- **AND** media bytes, object metadata, and provider storage metadata are not
  nested into storage snapshots

#### Scenario: Portable archive envelope composition

- **WHEN** workspace export, push, restore, or backup needs a portable archive
- **THEN** the workflow composes a portable archive envelope from workspace
  storage snapshots, media payloads, and explicit restore policy
- **AND** workspace `state/instance.json`, `state/apps/<installId>.json`, and
  `state/media` files are not themselves portable archive envelopes

### Requirement: Workspace App Package Links

The system SHALL allow a local Formless workspace to link private filesystem app
package manifests through a reviewable package resolver source file without
storing package links in instance control-plane records.

#### Scenario: Workspace package link source

- **GIVEN** a workspace contains optional `formless.packages.json`
- **WHEN** the package link source is read
- **THEN** the file declares kind `formless.workspacePackages`, version `1`,
  and an ordered list of app package manifest links
- **AND** each link points to a local relative `formless.app.json` path such as
  `../app/formless.app.json`
- **AND** absolute paths, URL-like values, home-relative paths, empty paths,
  duplicate links, and secret-looking fields are rejected
- **AND** omitting `formless.packages.json` means the active resolver contains
  only bundled app packages

#### Scenario: Resolve linked package source

- **GIVEN** a workspace package link points at a local app package manifest
- **WHEN** the workspace package resolver is built
- **THEN** the linked package manifest is parsed
- **AND** the linked package source schema and seed records are read relative
  to the package manifest directory
- **AND** the source schema parses as an app schema
- **AND** the seed records validate as stored-record shaped data for that
  source schema
- **AND** the computed source schema hash matches the package manifest
  `sourceSchemaHash`
- **AND** the resolved package is added to the active workspace resolver
  without writing package source paths to `app-install`, `route`, or
  `deployment-config` records

#### Scenario: Package link source is dependency config

- **WHEN** workspace source is saved, checked, pushed, deployed, exported, or
  restored
- **THEN** `formless.packages.json` is treated as reviewable dependency
  configuration for resolving package app source
- **AND** package links are not app install intent, route intent, app data,
  media payloads, provider config, deployment observation, or runtime secret
  state
- **AND** `formless.json` remains layout-only and does not duplicate package
  links

### Requirement: Workspace Package Boundary

The system SHALL expose reusable Formless workspace source, local state, and
semantic operation contracts through the Workspace package slice.

#### Scenario: Package owns workspace source contracts

- **WHEN** CLI, Site runtime, Gateway runtime adapters, archive workflows,
  tests, or local agent workflows need `formless.json` manifest parsing,
  workspace path defaults, workspace target URL normalization, workspace
  storage snapshot contracts, ignored local state contracts,
  ignored secret state contracts, semantic workspace operation input shapes,
  display-safe operation state, operation result shapes, operation redaction,
  or deterministic local filesystem workspace IO
- **THEN** they import that behavior from `@dpeek/formless-workspace` or
  `@dpeek/formless-workspace/node`
- **AND** they do not import package-owned workspace behavior from old
  `src/site` workspace modules or unexported package internals

#### Scenario: Package does not own runtime mutation

- **WHEN** workspace save, pull, push, deploy, credential setup, app install,
  control-plane mutation, Authority reads, provider mutation, Gateway
  authorization, or runtime topology selection is needed
- **THEN** those behaviors remain owned by CLI, Site runtime, Archive
  workflows, Deploy runtime, Worker runtime, Gateway runtime adapters, or
  provider adapters
- **AND** the Workspace package supplies source/state contracts, pure helpers,
  display-safe state handling, and local filesystem adapters rather than
  owning app records, deployed runtime records, provider credentials, or
  Cloudflare and Alchemy execution
- **AND** display-safe operation state persists under ignored local workspace
  state, not reviewable storage snapshots or media payloads

### Requirement: Instance Workspaces

The system SHALL let a local Formless workspace save, pull, push, dev, and
deploy instance state without storing instance intent or secrets in the
manifest.

#### Scenario: Workspace manifest

- **WHEN** a Formless workspace manifest is written
- **THEN** `formless.json` remains manifest version `1` and stores only layout
  and local configuration such as kind, name, workspace state root, media root,
  ignored local state root, and ignored secret state root
- **AND** `app-install`, unified `route`, `deployment-config` intent, remote
  target facts, deployment observation cache, deployment execution history, and
  default app policy are not stored in `formless.json`
- **AND** provider worker-name overrides are deployment intent stored in
  schema-owned deployment config records, not in `formless.json`
- **AND** deployed remote target origin facts are stored on
  `deployment-config` records as display-safe `targetUrl` values
- **AND** secret-looking fields are rejected

#### Scenario: Workspace push apply

- **WHEN** `formless push --apply` runs
- **THEN** the workflow composes an instance archive from workspace storage
  snapshots and media payloads
- **AND** a fresh whole-instance backup is taken
- **AND** the workflow dry-runs before applying the composed instance archive
  restore

### Requirement: Workspace Drift

The system SHALL require explicit acknowledgement before applying stale
workspace source.

#### Scenario: Check drift

- **WHEN** a workspace targeting a remote instance runs `formless deploy --dry-run`
- **THEN** remote target storage snapshots are compared with local workspace
  storage snapshots
- **AND** `app-install`, unified `route`, `deployment-config`, app record, and
  media drift are reported without deriving intent from `formless.json`
- **AND** remote drift checks select the deployed instance origin from enabled
  `deployment-config.targetUrl` workspace state
- **AND** deployment attempt, evidence, drift, cleanup, status summaries, and
  deployment config observation cache fields are treated as runtime observation
  state rather than source drift
- **AND** protected remote target reads use the workspace's resolved admin
  bearer authorization when no browser owner session is available to the CLI

#### Scenario: Refuse stale push

- **WHEN** current target state has drifted from the workspace source and
  `formless push --apply` runs without stale acknowledgement
- **THEN** the push is refused
- **AND** target data remains unchanged

### Requirement: Storage Snapshot Record Entity Names

The system SHALL keep storage snapshot record entity names aligned with the
snapshot's active schema.

#### Scenario: Write schema-local snapshot record entity

- WHEN app or instance control-plane records are written into a storage snapshot
- THEN record `entity` values use the entity keys from the snapshot schema
- AND portable archive envelopes do not rewrite storage snapshot records into a
  separate qualified entity-name format

#### Scenario: Keep app data outside control-plane records

- WHEN a workspace state or instance archive includes installed app data
- THEN installed app records remain scoped by app install identity through app
  storage snapshots
- AND installed app records are not stored as instance control-plane records

### Requirement: Schema-Owned Control-Plane Snapshots

The system SHALL represent `app-install`, unified `route`, and deployment
intent in workspace state and portable archive envelopes as schema-owned
control-plane records without storing secrets, deployment observation cache, or
deployment execution history.

#### Scenario: Instance archive includes control-plane intent

- **WHEN** an instance archive includes instance control-plane configuration
- **THEN** `app-install`, `route`, and `deployment-config` records are
  represented through an `instance:control-plane` storage snapshot
- **AND** provider API tokens, Alchemy passwords, Alchemy state tokens, raw lease
  tokens, and full provider resource JSON are excluded
- **AND** `deploy-attempt`, `deploy-evidence-summary`,
  `deploy-drift-report`, cleanup audit summaries, and provider state payloads
  are excluded from instance archives and workspace state
- **AND** runtime-observed deployment cache fields on `deployment-config`
  records are excluded from instance archives and workspace state
- **AND** installed app data remains represented through storage snapshots
  scoped by app install identity

#### Scenario: Workspace snapshot state remains reviewable

- **WHEN** workspace source is written
- **THEN** `app-install`, unified `route`, and deployment intent is reviewable
  in `state/instance.json`
- **AND** the file declares kind `formless.storageSnapshot`, version `1`,
  storage identity `instance:control-plane`, schema key
  `instance-control-plane`, schema timestamp, source cursor, schema, and
  records
- **AND** `formless.json` does not duplicate that intent
- **AND** deployment attempts, evidence summaries, drift reports, and cleanup
  audit summaries are available only through deployment runtime projection or
  gateway operation status, not reviewable workspace state
- **AND** deployment config observation cache fields are omitted from reviewable
  workspace state
- **AND** secret-looking fields are rejected from reviewable workspace state

### Requirement: Schema Control-Plane Drift

The system SHALL compare workspace control-plane intent against remote
schema-owned control-plane records.

#### Scenario: Check control-plane drift

- **GIVEN** `formless deploy --dry-run` compares instance control-plane state
- **WHEN** remote and local control-plane records differ
- **THEN** drift is reported from schema-owned app install, route, and
  deployment config records
- **AND** app path, exact-host mapping, and redirect drift are compared through
  `instance:route` records
- **AND** provider drift summaries remain separate from desired intent drift
