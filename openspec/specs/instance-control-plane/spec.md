# Instance Control Plane Specification

## Purpose

Instance control plane models Formless instance management data as runtime-owned
schema records. It keeps app installs, app routes, domain intent, and deployment
configuration in flat Authority records. Deployment config records may include a
display-safe latest deployment observation cache while installed app data,
provider secrets, raw operation tokens, projected deployment resource graphs,
deployment history, and provider resource truth stay outside those records.

## Requirements

### Requirement: Schema-Owned Instance Control Plane

The system SHALL model owner-authored instance management intent as
schema-owned control-plane records while keeping deployment execution history
outside reviewable control-plane storage snapshots.

#### Scenario: Control-plane records

- **GIVEN** the instance control-plane schema is loaded
- **WHEN** its storage identity is selected
- **THEN** it uses schema key `instance-control-plane`, storage identity
  `instance:control-plane`, and API prefix `/api/formless/control-plane`
- **AND** it defines flat records for app installs, unified routes, and
  deployment configs
- **AND** each deployment config stores the target identity, display-safe
  `targetUrl` origin facts, provider family, provider account, worker name, and
  optional display-safe credential reference used for that deployment target
- **AND** each deployment config may store display-safe latest deployment
  observation fields such as status, observed time, desired-state hash, summary,
  error, and runner
- **AND** it does not define separate `deploy-target`,
  `provider-config-ref`, or `deploy-desired-resource` entities
- **AND** it does not define `deploy-attempt`, `deploy-evidence-summary`, or
  `deploy-drift-report` as schema-owned control-plane record entities
- **AND** deployment attempt history, evidence history, drift history, cleanup
  audit summaries, raw operation tokens, and provider resource truth are not
  schema-owned control-plane record entities

### Requirement: App Install Records

The system SHALL represent installed app metadata as `app-install` control-plane
records.

#### Scenario: App install identity record

- GIVEN an app install is created
- WHEN the control-plane write commits
- THEN the `app-install` record stores stable install identity, package app key,
  label, status, created time, and updated time
- AND install identity, package app key, and storage identity are immutable
  after creation
- AND the record stores display-safe storage identity such as `app:<installId>`
  without embedding installed app records

#### Scenario: Installed app data boundary

- GIVEN an `app-install` record exists
- WHEN installed app records, active schema, changes, action executions,
  snapshots, or sync state are read or written
- THEN those facts remain in that install's app storage identity
- AND the `app-install` record does not contain the installed app's data records

### Requirement: Deployment Projection Boundary

The system SHALL build deployment runtime desired-state projections from
schema-owned control-plane intent records.

#### Scenario: Project desired state

- **GIVEN** desired deployment state is read for a supported target
- **WHEN** schema-owned control-plane records are read for that target
- **THEN** the resource graph is projected from the current control-plane
  records
- **AND** enabled `route` records provide app mount, custom-domain, DNS, and
  redirect desired route resources
- **AND** `deployment-config` records provide the target URL, provider account,
  worker name, and credential reference needed to project provider-facing
  resources
- **AND** deployment projection does not fall back to legacy domain-mapping or
  redirect-intent storage when control-plane records are present or absent
- **AND** no projected `DeploymentResourceGraph` resource is stored as
  schema-owned source intent
- **AND** the desired-state hash is computed from canonical projected content
- **AND** latest deployment observation fields do not affect the desired-state
  hash

#### Scenario: Projection omits operational secrets

- **GIVEN** control-plane records are projected into desired state
- **WHEN** the projection is returned to clients or deployers
- **THEN** provider API tokens, Alchemy passwords, Alchemy state tokens, raw
  lease tokens, and runtime secrets are omitted
- **AND** display-safe secret references may be included when needed

### Requirement: Deployment Observation Boundary

The system SHALL keep provider execution and deployment history outside
reviewable source while storing only the latest display-safe deployment
observation cache on `deployment-config` records.

#### Scenario: Display-safe latest observation

- **GIVEN** a CLI deployer, local workspace gateway, or explicit refresh
  observes deployment state
- **WHEN** the observation is persisted
- **THEN** the observation patches the matching `deployment-config` record with
  display-safe latest state such as status, observed time, desired-state hash,
  summary, error, and runner
- **AND** the observation does not store provider credentials, raw provider
  state, raw operation tokens, or full execution logs
- **AND** previous observations are replaced rather than appended as
  schema-owned history records
- **AND** provider reality remains owned by the provider and tracked Alchemy
  state

### Requirement: Deploy Vertical Slice

The system SHALL provide deployment schema contracts and projection helpers from
a deploy package slice.

#### Scenario: Deploy package owns contracts

- GIVEN runtime, UI, CLI, or tests need deployment schema or projection
  contracts
- WHEN they consume deploy capability behavior
- THEN they import public declarations or helpers from `lib/deploy`
- AND they do not redefine compatible deployment record shapes locally

#### Scenario: Shared route projection module

- GIVEN runtime, CLI, workspace, or tests need route-derived deployment
  projection from control-plane records
- WHEN app-install, route, and deployment-config records are projected for a
  target
- THEN the records are adapted into public Deploy package projection input
- AND provider resource graphs, route target projections, source fingerprints,
  stable logical ids, and canonical hash inputs derive from the Deploy package
  projection helper
- AND runtime code does not maintain a separate route-to-provider-resource
  projection implementation

#### Scenario: Shared desired-state and observation module

- GIVEN runtime, CLI, workspace, gateway, UI, or tests need deployment
  desired-state version, latest status, or observation patch behavior
- WHEN control-plane route and deployment-config records are interpreted for a
  supported deployment target
- THEN desired-state response refs, canonical graph hashes, display summaries,
  latest status interpretation, and display-safe observation patch payloads
  derive from Deploy package helpers
- AND Worker runtime adapts schema-owned control-plane records into Deploy
  package inputs instead of redefining compatible deployment state, status, or
  observation payload shapes locally
- AND provider execution, credential resolution, raw provider state, Alchemy
  state, and runtime secrets remain outside the Deploy package boundary

### Requirement: Route Records

The system SHALL represent all desired route behavior as `route` control-plane
records.

#### Scenario: Route record shape

- **GIVEN** the instance control-plane schema is loaded
- **WHEN** the `route` entity is inspected
- **THEN** each route record can store camelCase fields for enabled state,
  optional match host, match path, optional match prefix, kind, optional target
  profile, optional app install reference, optional surface, optional access
  policy, optional deployment config reference, redirect target fields,
  redirect policy fields, created time, and updated time
- **AND** route records remain flat schema records

#### Scenario: Mount route

- **GIVEN** an owner or admin creates a mount route
- **WHEN** the route is accepted
- **THEN** `kind` is `mount`
- **AND** app and public Site mounts set `appInstall` to reference an
  `app-install` record
- **AND** the route records the selected target profile and surface without
  duplicating installed app data or storage state

#### Scenario: Public Site mount package capability

- **GIVEN** an owner or admin creates a public Site mount route for an app
  install
- **WHEN** the route is validated
- **THEN** the referenced app install package app key is resolved through the
  active package resolver for the current runtime or workspace
- **AND** the route is accepted only when the resolved package declares public
  Site route capability
- **AND** the validator does not fall back to bundled-only package lookups or
  package key special cases

#### Scenario: Mount route access

- **GIVEN** an owner or admin creates a mount route
- **WHEN** the route includes access policy
- **THEN** `access` is either `anonymous` or `owner`
- **AND** `anonymous` means the route can be read without an owner session
- **AND** `owner` means browser reads require an owner session and management
  API reads require an owner session or admin bearer authorization
- **AND** omitted access defaults to `owner` for instance, app admin, and app
  schema mounts
- **AND** omitted access defaults to `anonymous` for public Site mounts

#### Scenario: Redirect route

- **GIVEN** an owner or admin creates a redirect route
- **WHEN** the route is accepted
- **THEN** `kind` is `redirect`
- **AND** the route stores the source match, target host or URL, status code,
  preservePath policy, and preserveQueryString policy
- **AND** the route does not require an app install target

#### Scenario: Desired route write

- **GIVEN** an owner or admin writes route intent
- **WHEN** the write commits
- **THEN** the write stores desired route state only
- **AND** no installed app data, provider resource, runtime secret, provider
  evidence, cleanup history, deployment attempt, or drift report is mutated by
  the route write itself

### Requirement: Deployment Config Records

The system SHALL represent deploy target and provider selection as one
`deployment-config` control-plane record.

#### Scenario: Deployment config shape

- **GIVEN** the instance control-plane schema is loaded
- **WHEN** the `deployment-config` entity is inspected
- **THEN** each record stores camelCase fields for target id, target kind,
  display label, enabled state, display-safe target URL, provider family,
  provider account id, worker name, optional display-safe credential reference,
  created time, updated time, and optional latest deployment observation fields
- **AND** the target id and provider family are immutable after creation
- **AND** provider API tokens, Alchemy passwords, Alchemy state tokens, raw
  lease tokens, and runtime secrets are not stored on the record
- **AND** latest deployment observation fields are runtime-observed cache fields
  rather than deploy intent fields

#### Scenario: Route deployment selection

- **GIVEN** a route needs provider-managed DNS, custom-domain, or redirect
  resources
- **WHEN** the route omits an explicit deployment config reference
- **THEN** projection uses the enabled primary instance deployment config
- **AND** a route may reference a specific deployment config only when the
  instance has multiple enabled deployment configs

#### Scenario: Deployment config write

- **GIVEN** an owner, admin, local workspace gateway, or CLI writes deployment
  setup
- **WHEN** the write commits
- **THEN** the write stores deployment intent as a `deployment-config` record
- **AND** no provider resource, deployment attempt, evidence summary, drift
  report, cleanup history, or projected desired resource row is written by the
  deployment config write itself

#### Scenario: Deployment observation cache write

- **GIVEN** a local workspace gateway, CLI deploy, or explicit refresh observes
  deployment state for a deployment config
- **WHEN** it writes the observation
- **THEN** it patches only the deployment config's runtime-observed cache fields
- **AND** source intent fields such as provider family, account id, worker name,
  target URL, route intent, and credential reference remain unchanged unless a
  separate authorized intent write is submitted

### Requirement: Workspace Canonical Control-Plane Source

The system SHALL use schema-owned instance control-plane records as the
canonical source for workspace-authored instance intent.

#### Scenario: Save control-plane records to workspace state

- **WHEN** local Authority control-plane state is saved to workspace source
- **THEN** `app-install`, `route`, and `deployment-config` records are written
  to the schema-owned `state/instance.json` storage snapshot
- **AND** enabled `deployment-config` records include the display-safe
  deployed HTTP origin in `targetUrl`
- **AND** workspace and archive boundaries identify those records with
  qualified entity names such as `instance:app-install` and
  `instance:route`
- **AND** `state/instance.json` declares kind `formless.storageSnapshot`,
  version `1`, storage identity `instance:control-plane`, schema key
  `instance-control-plane`, schema metadata, source cursor, and records
- **AND** `formless.json` does not duplicate those records as app, route,
  domain, or deploy intent
- **AND** `deploy-target`, `provider-config-ref`,
  `deploy-desired-resource`, `deploy-attempt`, `deploy-evidence-summary`, and
  `deploy-drift-report` records are not written as workspace source
- **AND** runtime-observed deployment cache fields on `deployment-config`
  records are omitted from reviewable workspace storage state

#### Scenario: Restore control-plane records from workspace state

- **WHEN** local dev, push, or deploy composes runtime state from workspace
  source
- **THEN** the control-plane storage snapshot is restored through the
  `instance:control-plane` Authority storage identity
- **AND** Authority validation rejects invalid references, immutable field
  changes, route conflicts, secret values, and unsupported control-plane
  entities before behavior changes
- **AND** workspace state containing runtime-observed deployment cache fields is
  rejected or stripped before restore

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
- **THEN** the write commits unified `route` or `deployment-config` records
  through Authority validation
- **AND** provider credentials, raw provider state, and runtime secrets remain
  outside control-plane records
