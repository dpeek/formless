# Instance Control Plane Specification

## Purpose

Instance control plane models Formless instance management data as runtime-owned
schema records. It keeps app installs, app routes, domain intent, deployment
intent, and display-safe deployment history in flat Authority records while
installed app data, provider secrets, raw lease tokens, and provider resource
truth stay outside those records.

## Requirements

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
- **AND** each deploy target stores display-safe `targetUrl` origin facts for
  commands that need to contact the deployed instance
- **AND** it does not define `deploy-attempt`, `deploy-evidence-summary`, or
  `deploy-drift-report` as schema-owned control-plane record entities
- **AND** deployment attempts, evidence summaries, drift reports, cleanup audit
  summaries, and raw leases remain deployment runtime or local gateway
  operation state

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

The system SHALL build deployment runtime desired-state versions from
schema-owned control-plane intent records.

#### Scenario: Project desired state

- **GIVEN** desired deployment state is read for a supported target
- **WHEN** schema-owned control-plane records are available for that target
- **THEN** the resource graph is projected from the current control-plane
  records
- **AND** enabled `route` records provide app mount, custom-domain, DNS, and
  redirect desired route resources
- **AND** the desired-state hash is computed from canonical projected content

#### Scenario: Projection omits operational secrets

- **GIVEN** control-plane records are projected into desired state
- **WHEN** the projection is returned to clients or deployers
- **THEN** provider API tokens, Alchemy passwords, Alchemy state tokens, raw
  lease tokens, and runtime secrets are omitted
- **AND** display-safe secret references may be included when needed

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

### Requirement: Deploy Vertical Slice

The system SHALL provide deployment schema contracts and projection helpers from
a deploy package slice.

#### Scenario: Deploy package owns contracts

- GIVEN runtime, UI, CLI, or tests need deployment schema or projection
  contracts
- WHEN they consume deploy capability behavior
- THEN they import public declarations or helpers from `lib/deploy`
- AND they do not redefine compatible deployment record shapes locally

### Requirement: Route Records

The system SHALL represent all desired route behavior as `route` control-plane
records.

#### Scenario: Route record shape

- **GIVEN** the instance control-plane schema is loaded
- **WHEN** the `route` entity is inspected
- **THEN** each route record can store camelCase fields for enabled state,
  optional match host, match path, optional match prefix, kind, optional target
  profile, optional app install reference, optional surface, optional provider
  config reference, redirect target fields, redirect policy fields, created
  time, and updated time
- **AND** route records remain flat schema records

#### Scenario: Mount route

- **GIVEN** an owner or admin creates a mount route
- **WHEN** the route is accepted
- **THEN** `kind` is `mount`
- **AND** app and public Site mounts set `appInstall` to reference an
  `app-install` record
- **AND** the route records the selected target profile and surface without
  duplicating installed app data or storage state

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

### Requirement: Workspace Canonical Control-Plane Source

The system SHALL use schema-owned instance control-plane records as the
canonical source for workspace-authored instance intent.

#### Scenario: Save control-plane records to workspace source

- **WHEN** local Authority control-plane state is saved to workspace source
- **THEN** `app-install`, `route`, `deploy-target`, `provider-config-ref`, and
  `deploy-desired-resource` records are written as schema-owned record source
- **AND** enabled `deploy-target` source records include the display-safe
  deployed HTTP origin in `targetUrl`
- **AND** workspace and archive boundaries identify those records with
  qualified entity names such as `instance:app-install` and
  `instance:route`
- **AND** the default workspace record source root is
  `records/instance-control-plane`
- **AND** record source under that root is stored as one deterministic JSON file
  per supported entity: `app-install.json`, `route.json`,
  `deploy-target.json`, `provider-config-ref.json`, and
  `deploy-desired-resource.json`
- **AND** each file declares kind
  `formless.instanceControlPlaneRecordSource`, version `1`, schema key
  `instance-control-plane`, a `schemaUpdatedAt` timestamp, the qualified
  entity name, and records for only that entity
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
