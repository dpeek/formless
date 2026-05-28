## ADDED Requirements

### Requirement: Schema-Owned Instance Control Plane

The system SHALL model instance management data as schema-owned control-plane
records.

#### Scenario: Control-plane records

- **WHEN** the instance control-plane schema is loaded
- **THEN** it defines flat records for app installs, app routes, deploy targets,
  provider config references, domain mappings, redirect intent, desired
  resources, deployment attempts, evidence summaries, and drift reports
- **AND** relationships between those records are represented through normal
  reference fields

#### Scenario: User intent write

- **WHEN** an owner or admin writes app install, route, domain, or deployment
  configuration
- **THEN** the write commits schema records through Authority validation
- **AND** no installed app data, provider resource, or runtime secret is mutated
  by the configuration record write itself

### Requirement: App Install Records

The system SHALL represent installed app metadata as `appInstall` control-plane
records.

#### Scenario: App install identity record

- **WHEN** an app install is created
- **THEN** the control-plane schema stores an `appInstall` record with stable
  install identity, package app key, label, status, created time, and updated
  time
- **AND** install identity and package app key are immutable after creation

#### Scenario: Installed app data boundary

- **WHEN** an `appInstall` record exists
- **THEN** installed app records, active schema, changes, action executions,
  snapshots, and sync state remain in that install's app storage identity
- **AND** the `appInstall` record does not contain the installed app's data
  records

### Requirement: App Route Records

The system SHALL represent app route bindings as `appRoute` control-plane
records that reference `appInstall` records.

#### Scenario: Default route records

- **WHEN** a package app install is created
- **THEN** admin and schema route records are created for the `appInstall`
  record
- **AND** a public Site route record is created only when the package supports
  public Site routes

#### Scenario: Route targets app install

- **WHEN** route resolution, custom-domain mapping, deployment projection,
  archive export, or generated UI needs an installed app target
- **THEN** it uses an `appRoute` record that references the `appInstall` record
- **AND** the route does not duplicate installed app data or storage state

#### Scenario: Route validation

- **WHEN** an owner or admin creates or edits an app route record
- **THEN** the route path or prefix is validated against runtime topology,
  reserved paths, route kind, package capability, and enabled-route uniqueness
- **AND** invalid route records are rejected before route behavior changes

### Requirement: Deployment Projection Boundary

The system SHALL build deployment runtime desired-state versions from
schema-owned control-plane intent records.

#### Scenario: Project desired state

- **WHEN** desired deployment state is read for a target
- **THEN** the resource graph is projected from the current control-plane
  records for that target
- **AND** the desired-state hash is computed from canonical projected content

#### Scenario: Projection omits operational secrets

- **WHEN** control-plane records are projected into desired state
- **THEN** provider API tokens, Alchemy passwords, Alchemy state tokens, raw
  lease tokens, and runtime secrets are omitted
- **AND** display-safe secret references may be included when needed

### Requirement: Deployment Execution Boundary

The system SHALL keep provider execution outside schema records while recording
display-safe deployment history as schema-owned records.

#### Scenario: External deployer action

- **WHEN** a CLI deployer or runner invokes a deployment action
- **THEN** the action binds to an exact desired-state version and actor
- **AND** provider credentials are resolved outside the schema record response

#### Scenario: Display-safe writeback

- **WHEN** a deployer writes plan, success, failure, or drift results
- **THEN** deployment attempt, evidence summary, and drift records store
  display-safe status, ids, counts, messages, actor, runner, and timestamps
- **AND** full provider current state remains outside schema records

### Requirement: Deploy Vertical Slice

The system SHALL provide deployment schema contracts and projection helpers from
a deploy package slice.

#### Scenario: Deploy package owns contracts

- **WHEN** runtime, UI, CLI, or tests need deployment schema or projection
  contracts
- **THEN** they import public declarations or helpers from `lib/deploy`
- **AND** they do not redefine compatible deployment record shapes locally
