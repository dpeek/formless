# Instance Control Plane Specification

## Purpose

Instance control plane models Formless instance management data as runtime-owned
schema records. It keeps app installs, app routes, domain intent, deployment
intent, and display-safe deployment history in flat Authority records while
installed app data, provider secrets, raw lease tokens, and provider resource
truth stay outside those records.

## Requirements

### Requirement: Schema-Owned Instance Control Plane

The system SHALL model instance management data as schema-owned control-plane
records.

#### Scenario: Control-plane records

- GIVEN the instance control-plane schema is loaded
- WHEN its storage identity is selected
- THEN it uses schema key `instance-control-plane`, storage identity
  `instance:control-plane`, and API prefix `/api/formless/control-plane`
- AND it defines flat records for app installs, app routes, deploy targets,
  provider config references, domain mappings, redirect intent, desired
  resources, deployment attempts, evidence summaries, and drift reports
- AND those records use entity keys `appInstall`, `appRoute`, `deployTarget`,
  `providerConfigRef`, `domainMapping`, `redirectIntent`,
  `deployDesiredResource`, `deployAttempt`, `deployEvidenceSummary`, and
  `deployDriftReport`
- AND relationships between those records are represented through normal
  reference fields

#### Scenario: User intent write

- GIVEN an owner or admin writes app install, route, domain, or deployment
  configuration
- WHEN the write is accepted
- THEN the write commits schema records through Authority validation
- AND no installed app data, provider resource, or runtime secret is mutated by
  the configuration record write itself

### Requirement: App Install Records

The system SHALL represent installed app metadata as `appInstall` control-plane
records.

#### Scenario: App install identity record

- GIVEN an app install is created
- WHEN the control-plane write commits
- THEN the `appInstall` record stores stable install identity, package app key,
  label, status, created time, and updated time
- AND install identity, package app key, and storage identity are immutable
  after creation
- AND the record stores display-safe storage identity such as `app:<installId>`
  without embedding installed app records

#### Scenario: Installed app data boundary

- GIVEN an `appInstall` record exists
- WHEN installed app records, active schema, changes, action executions,
  snapshots, or sync state are read or written
- THEN those facts remain in that install's app storage identity
- AND the `appInstall` record does not contain the installed app's data records

### Requirement: App Route Records

The system SHALL represent app route bindings as `appRoute` control-plane
records that reference `appInstall` records.

#### Scenario: Default route records

- GIVEN a package app install is created
- WHEN default routes are materialized
- THEN admin and schema route records are created for the `appInstall` record
- AND a public Site route record is created only when the package supports
  public Site routes
- AND each route record stores route kind, path, optional prefix, surface,
  package capability, enabled state, created time, and updated time

#### Scenario: Route targets app install

- GIVEN route resolution, custom-domain mapping, deployment projection, archive
  export, or generated UI needs an installed app target
- WHEN it resolves the target
- THEN it uses an `appRoute` record that references the `appInstall` record
- AND the route does not duplicate installed app data or storage state

#### Scenario: Route validation

- GIVEN an owner or admin creates or edits an app route record
- WHEN the route path or prefix is validated
- THEN validation checks runtime topology, reserved paths, route kind, package
  capability, and enabled-route uniqueness
- AND invalid route records are rejected before route behavior changes

### Requirement: Deployment Projection Boundary

The system SHALL build deployment runtime desired-state versions from
schema-owned control-plane intent records.

#### Scenario: Project desired state

- GIVEN desired deployment state is read for a supported target
- WHEN schema-owned control-plane records are available for that target
- THEN the resource graph is projected from the current control-plane records
- AND the desired-state hash is computed from canonical projected content

#### Scenario: Projection omits operational secrets

- GIVEN control-plane records are projected into desired state
- WHEN the projection is returned to clients or deployers
- THEN provider API tokens, Alchemy passwords, Alchemy state tokens, raw lease
  tokens, and runtime secrets are omitted
- AND display-safe secret references may be included when needed

### Requirement: Deployment Execution Boundary

The system SHALL keep provider execution outside schema records while recording
display-safe deployment history as schema-owned records.

#### Scenario: External deployer writeback

- GIVEN a CLI deployer or runner starts deployment work
- WHEN it writes plan, success, failure, or drift results
- THEN the writeback binds to an exact desired-state version and actor
- AND provider credentials are resolved outside the schema record response

#### Scenario: Display-safe history

- GIVEN deployment results are mirrored to control-plane records
- WHEN attempt, evidence summary, or drift records are stored
- THEN they store display-safe status, ids, counts, messages, actor, runner, and
  timestamps
- AND full provider current state remains outside schema records

### Requirement: Deploy Vertical Slice

The system SHALL provide deployment schema contracts and projection helpers from
a deploy package slice.

#### Scenario: Deploy package owns contracts

- GIVEN runtime, UI, CLI, or tests need deployment schema or projection
  contracts
- WHEN they consume deploy capability behavior
- THEN they import public declarations or helpers from `lib/deploy`
- AND they do not redefine compatible deployment record shapes locally
