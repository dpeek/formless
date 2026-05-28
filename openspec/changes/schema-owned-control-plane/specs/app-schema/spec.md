## ADDED Requirements

### Requirement: Runtime-Owned Control-Plane Schemas

The system SHALL support runtime-owned control-plane app schemas that use normal
schema entities, fields, relationships, queries, read models, views, screens,
mutations, and actions.

#### Scenario: Parse control-plane schema

- **WHEN** the instance control-plane schema is parsed
- **THEN** it is validated with the same schema parser as other app schemas
- **AND** runtime-owned schema sections are preserved from Builder edits unless
  explicitly supported

#### Scenario: Control-plane records stay flat

- **WHEN** control-plane records are stored or synced
- **THEN** records keep flat field values
- **AND** app install, route, provider, and deployment relationships are
  represented by schema metadata over reference fields

### Requirement: Immutable Control-Plane Fields

The system SHALL let runtime-owned schemas mark identity fields as immutable
after record creation.

#### Scenario: Immutable install identity

- **WHEN** an `appInstall` record has been created
- **THEN** fields that define install identity, package app key, and storage
  identity cannot be patched by generated UI, CLI, sync, or action writes
- **AND** mutable fields such as label can still be patched when schema policy
  allows

#### Scenario: Route target integrity

- **WHEN** an `appRoute` record references an `appInstall`
- **THEN** schema validation prevents the route from pointing at a missing,
  incompatible, or tombstoned app install record

### Requirement: Actor-Scoped Schema Actions

The system SHALL let schema actions declare actor exposure for owner, admin, CLI
deployer, and runner callers.

#### Scenario: Authorized actor invokes action

- **WHEN** a caller invokes a schema action exposed to its actor kind
- **THEN** the runtime accepts the action only after normal auth, input,
  idempotency, and schema validation
- **AND** the action response includes only fields allowed for that actor

#### Scenario: Unexposed action is hidden

- **WHEN** a generated browser surface renders schema actions
- **THEN** actions exposed only to CLI deployers or runners are not rendered as
  browser controls
- **AND** direct browser invocation of those actor-only actions is rejected

### Requirement: Secret Reference Fields

The system SHALL allow schema records to carry non-secret references to runtime
or provider secrets without storing secret values.

#### Scenario: Store secret reference

- **WHEN** deployment configuration needs a credential or provider state secret
- **THEN** the schema record stores a secret reference or requirement fact
- **AND** the secret value is not stored in record values, changes, read models,
  browser responses, archives, or workspace manifests

### Requirement: Route Field Validation

The system SHALL let runtime-owned schemas validate route path and route prefix
fields against runtime topology constraints.

#### Scenario: Validate app route path

- **WHEN** an app route record is created or patched
- **THEN** the route path or prefix is validated for route-safe shape, reserved
  path conflicts, package capability, route kind, and enabled-route uniqueness
- **AND** invalid route values are rejected before runtime route behavior
  changes

### Requirement: Append-Only Control-Plane History

The system SHALL let runtime-owned schemas mark control-plane history records as
append-only or action-created.

#### Scenario: Append-only evidence

- **WHEN** deployment attempt, evidence, cleanup, or drift history is recorded
- **THEN** the record is created through an allowed action or runtime write path
- **AND** ordinary generated patch or delete controls are not exposed for that
  history record
