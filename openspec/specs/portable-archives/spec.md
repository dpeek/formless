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

### Requirement: Instance Workspaces

The system SHALL let a local instance workspace review, pull, check, push, and
deploy instance archive state without storing secrets in the manifest.

#### Scenario: Workspace manifest

- GIVEN an instance workspace is initialized
- WHEN the manifest is written
- THEN it stores reviewable target, archive, deploy, local state, app, default
  app policy, and domain intent
- AND secret-looking fields are rejected

#### Scenario: Workspace push apply

- GIVEN workspace archives are ready
- WHEN `formless instance push --apply` runs
- THEN a fresh whole-instance backup is taken
- AND the workflow dry-runs before applying the composed instance archive
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

### Requirement: Schema-Owned Control-Plane Archives

The system SHALL represent app install, route, and deployment intent in instance
archives and workspaces as schema-owned control-plane records without storing
secrets.

#### Scenario: Instance archive includes control-plane intent

- GIVEN an instance archive includes instance control-plane configuration
- WHEN the archive is parsed or restored
- THEN app installs, app routes, deploy targets, domain mappings, redirect
  intent, desired resources, and display-safe deployment history are represented
  as control-plane schema records
- AND provider API tokens, Alchemy passwords, Alchemy state tokens, raw lease
  tokens, and full provider resource JSON are excluded
- AND installed app data remains represented through app snapshots scoped by app
  install identity

#### Scenario: Workspace manifest remains reviewable

- GIVEN an instance workspace manifest or archive is written
- WHEN app install, route, domain, or deployment intent is included
- THEN that intent is reviewable as schema-owned records or record files
- AND secret-looking fields are rejected from reviewable workspace state

### Requirement: Schema Control-Plane Drift

The system SHALL compare workspace control-plane intent against remote
schema-owned control-plane records.

#### Scenario: Check control-plane drift

- GIVEN `formless instance check` compares instance control-plane state
- WHEN remote and local control-plane records differ
- THEN drift is reported from schema-owned app install, app route, deploy
  target, domain mapping, redirect, and desired resource records
- AND provider drift summaries remain separate from desired intent drift
