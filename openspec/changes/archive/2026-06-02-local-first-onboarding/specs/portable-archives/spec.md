## ADDED Requirements

### Requirement: Workspace Source Of Truth

The system SHALL treat `formless.json` and workspace archives as the reviewable local source of truth for local-first Formless workspaces.

#### Scenario: Save from local Authority

- GIVEN local workspace runtime state contains active app records, control-plane intent, and referenced core media
- WHEN workspace save runs
- THEN the system writes deterministic app archive and control-plane workspace source from Authority-backed state
- AND browser replica state is not used as the source of truth
- AND secret-looking fields are rejected from reviewable workspace state

#### Scenario: Rebuild local runtime state

- GIVEN a local workspace has reviewable archive source
- WHEN workspace-local runtime state under `.formless/local` is reset
- THEN the next local dev run can rebuild runtime state from the workspace archives
- AND archive source remains unchanged by the reset

#### Scenario: Empty workspace runtime state

- GIVEN a local workspace has no declared apps and no app archives
- WHEN workspace-local dev starts
- THEN the local product instance starts with no installed apps
- AND the user can install the first app through local Authority-backed web actions

## MODIFIED Requirements

### Requirement: Instance Workspaces

The system SHALL let a local Formless workspace review, save, pull, check, push, dev, and deploy instance archive state without storing secrets in the manifest.

#### Scenario: Workspace manifest

- GIVEN a Formless workspace is initialized
- WHEN the manifest is written
- THEN `formless.json` stores reviewable target, archive, deploy, local state, app, default app policy, and domain intent
- AND a newly onboarded workspace stores no target, no declared apps, and `defaultAppPolicy: "none"`
- AND secret-looking fields are rejected

#### Scenario: Workspace push apply

- GIVEN workspace archives are ready
- WHEN `formless instance push --apply` runs
- THEN a fresh whole-instance backup is taken
- AND the workflow dry-runs before applying the composed instance archive restore

### Requirement: Schema-Owned Control-Plane Archives

The system SHALL represent app install, route, and deployment intent in instance archives and workspaces as schema-owned control-plane records without storing secrets.

#### Scenario: Instance archive includes control-plane intent

- GIVEN an instance archive includes instance control-plane configuration
- WHEN the archive is parsed or restored
- THEN app installs, app routes, deploy targets, domain mappings, redirect intent, desired resources, and display-safe deployment history are represented as control-plane schema records
- AND provider API tokens, Alchemy passwords, Alchemy state tokens, raw lease tokens, and full provider resource JSON are excluded
- AND installed app data remains represented through app snapshots scoped by app install identity

#### Scenario: Workspace manifest remains reviewable

- GIVEN `formless.json` or workspace archive source is written
- WHEN app install, route, domain, or deployment intent is included
- THEN that intent is reviewable as schema-owned records or record files
- AND secret-looking fields are rejected from reviewable workspace state
