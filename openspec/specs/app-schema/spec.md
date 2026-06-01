# App Schema Specification

## Purpose

App schema is runtime data that defines how a schema key stores flat records and exposes queries, read models, views, screens, actions, and mutations. It is the durable contract for source schemas, seed records, generated UI, Authority storage, and browser replicas.

## Requirements

### Requirement: Bundled Source Apps

The system SHALL provide source schemas for the current bundled schema keys `tasks`, `estii`, and `site`, and SHALL treat source seed records as stored-record shaped data.

#### Scenario: Load current source app

- GIVEN a current schema key `tasks`, `estii`, or `site`
- WHEN the runtime loads the source schema
- THEN the app schema is available for that schema key
- AND seed records can initialize records without being interpreted as change rows

### Requirement: Schema Parsing

The system MUST parse app schemas into validated runtime models before use.

#### Scenario: Reject conflicting ordering

- GIVEN an app schema with conflicting result-level and table-level ordering declarations
- WHEN the schema is parsed
- THEN parsing fails
- AND the invalid app schema is not used for generated UI or writes

#### Scenario: Reject invalid screen paths

- GIVEN a screen path that is relative, parameterized, duplicate, or `/schema`
- WHEN the schema is parsed
- THEN parsing fails
- AND the screen is not made available for app navigation

### Requirement: Flat Record Model

The system SHALL store entity records as flat values and SHALL keep relationships as schema metadata over reference fields.

#### Scenario: Preserve flat records with relationships

- GIVEN an app schema declares `toOne`, `toMany`, or `manyToMany` relationships
- WHEN records are stored or synced
- THEN records keep flat field values
- AND no nested relationship value is persisted for the relationship itself

#### Scenario: Represent many-to-many membership

- GIVEN a `manyToMany` relationship uses a through entity with reference fields for both sides
- WHEN relationship membership is created
- THEN through entity records represent the membership
- AND the endpoint references remain normal flat field values

### Requirement: Query And Collection Results

The system SHALL let collection views select records through schema-declared queries and result types `list`, `record`, `table`, and `tree`.

#### Scenario: Ordered collection result

- GIVEN a collection result with ordering over a non-integer number field and optional field scopes
- WHEN the result model is selected
- THEN matching records can be ordered through the declared rank field
- AND `list`, `table`, and `tree` results honor result-level ordering

### Requirement: Screens And Navigation

The system SHALL let app schemas define workspace screens that compose collection views and own app-relative navigation when primary screens exist.

#### Scenario: Root screen fallback

- GIVEN screens exist and no explicit root screen is declared
- WHEN the first pathless primary screen is selected
- THEN it receives the app-relative `/` path
- AND collection primary navigation is used only when no screens exist

#### Scenario: Screen section references collection view

- GIVEN a workspace screen with collection sections
- WHEN the schema is parsed
- THEN each section references an existing collection view
- AND valid sections are available in schema order

### Requirement: Entity Unions

The system SHALL model unions as schema metadata over flat entity records.

#### Scenario: Discriminator-backed union

- GIVEN an entity union declares a discriminator field
- WHEN the schema is parsed
- THEN the discriminator is a required enum field on the union entity
- AND variant keys match discriminator enum values
- AND no separate union value is stored in Authority storage or sync

#### Scenario: Variant coverage

- GIVEN a union has no fallback variant
- WHEN the schema is parsed
- THEN every discriminator enum value must be represented by a variant
- AND variant fields and required fields must reference fields on the same
  entity

### Requirement: Read Models

The system SHALL compute read-model values for display and SHALL NOT persist read-model values in records, writes, storage, or sync.

#### Scenario: Aggregate display output

- GIVEN aggregate read models over query results
- WHEN matching records are empty or contain bad aggregate values
- THEN empty `count` and `sum` render `0`
- AND empty `average`, `min`, and `max` render empty output
- AND bad runtime aggregate values are skipped

### Requirement: Field Behavior And Presentation

The system SHALL use field behavior to define validation, defaults, conversion, display, and editor metadata for scalar and reference fields.

#### Scenario: Preserve typed scalar values

- GIVEN date and number fields receive create or inline inputs
- WHEN values are accepted
- THEN date fields preserve `YYYY-MM-DD` values
- AND number fields store numbers

#### Scenario: Validate presentation modes

- GIVEN presentation mode `iconOnly`, `completion`, or `valueOrInteraction`
- WHEN the schema is parsed
- THEN `iconOnly` requires an enum field
- AND `completion` requires a boolean field
- AND `valueOrInteraction` requires an optional date field

### Requirement: Schema Builder

The system SHALL provide a Builder surface that emits normal app schema and
preserves advanced source-owned schema sections.

#### Scenario: Create builder-owned entity

- GIVEN a user creates an entity in Builder mode
- WHEN the draft is saved
- THEN the emitted schema enables create and patch mutations for the entity
- AND the entity receives a simple generated surface with all-records query,
  item view, create view, collection view, and workspace screen

#### Scenario: Preserve advanced schema

- GIVEN a source schema contains sections not owned by Builder
- WHEN Builder edits supported entity or field metadata
- THEN advanced source-owned sections are preserved
- AND saved entity keys, field keys, field types, and reference targets remain
  locked in Builder

### Requirement: Mutations And Actions

The system SHALL declare generic mutations and schema action kinds as data-owned commands over flat records.

#### Scenario: Submit delete mutation

- GIVEN an entity has delete mutations enabled
- WHEN a delete mutation is submitted for a record
- THEN the request carries `mutationId`, `entity`, `op: "delete"`, and `recordId`
- AND the request does not require field values

#### Scenario: Compose tree child

- GIVEN a `create-tree-child` action for a relationship-backed tree result
- WHEN the action is invoked
- THEN one child record and one placement edge are created
- AND `remove-tree-placement` tombstones the placement edge without deleting the child record

#### Scenario: Action kind module dispatch

- GIVEN a schema action kind is parsed
- WHEN runtime and generated UI select behavior for the action
- THEN shared action kind capability facts drive runtime eligibility and UI
  input facts
- AND action writes remain schema-declared commands over flat records

### Requirement: Action Access Policy Schema

The system SHALL parse action access policy from app schema data.

#### Scenario: Parse anonymous action access

- GIVEN an app schema declares an action with anonymous public access
- WHEN the schema is parsed
- THEN the parsed action preserves the action access policy for runtime execution
- AND generated admin action behavior remains separate from public execution policy

#### Scenario: Reject unsupported public action policy

- GIVEN an app schema declares a public action policy with an unsupported actor mode, challenge, or origin rule
- WHEN the schema is parsed
- THEN parsing fails
- AND the invalid app schema is not used for generated UI or writes

### Requirement: Public Action Input Contract

The system SHALL let app schemas declare the public input accepted by public actions.

#### Scenario: Parse public input fields

- GIVEN an app schema declares public input fields for an action
- WHEN the schema is parsed
- THEN field names, scalar types, required flags, and labels are validated
- AND the parsed action exposes that input contract to the public action executor

#### Scenario: Require public input for anonymous action

- GIVEN an app schema declares anonymous public access for an action
- WHEN the schema is parsed
- THEN parsing requires an explicit public input contract
- AND anonymous callers cannot submit undeclared record values directly

### Requirement: Public Action Kind Eligibility

The system MUST only expose action kinds that are safe for public execution through public action policy.

#### Scenario: Reject ineligible action kind

- GIVEN an action kind has no public execution module
- WHEN the schema declares anonymous public access for that action
- THEN parsing rejects the public access policy
- AND the action can still exist for generated admin use when its non-public schema is valid

#### Scenario: Subscribe action kind is eligible

- GIVEN an app schema declares the subscribe action kind with anonymous public access and valid public input
- WHEN the schema is parsed
- THEN parsing accepts the action
- AND the runtime can dispatch it through the public action executor

### Requirement: Runtime-Owned Control-Plane Schemas

The system SHALL support runtime-owned control-plane app schemas that use normal
schema entities, fields, relationships, queries, read models, views, screens,
mutations, and actions.

#### Scenario: Parse control-plane schema

- GIVEN a runtime-owned control-plane schema
- WHEN the schema is parsed
- THEN it is validated with the same schema parser as other app schemas
- AND runtime-owned schema sections are preserved from Builder edits unless
  explicitly supported

#### Scenario: Control-plane records stay flat

- GIVEN control-plane records are stored or synced
- WHEN relationships between app install, route, provider, and deployment
  records exist
- THEN records keep flat field values
- AND relationships are represented by schema metadata over reference fields

### Requirement: Immutable Control-Plane Fields

The system SHALL let runtime-owned schemas mark identity fields as immutable
after record creation.

#### Scenario: Immutable install identity

- GIVEN an `appInstall` record has been created
- WHEN a patch targets install identity, package app key, or storage identity
- THEN generated UI, CLI, sync, and action writes reject the change
- AND mutable fields such as label can still be patched when schema policy
  allows

#### Scenario: Route target integrity

- GIVEN an `appRoute` record references an `appInstall`
- WHEN the route is created or patched
- THEN schema validation prevents the route from pointing at a missing,
  incompatible, or tombstoned app install record

### Requirement: Actor-Scoped Schema Actions

The system SHALL let schema actions declare actor exposure for owner, admin, CLI
deployer, and runner callers.

#### Scenario: Authorized actor invokes action

- GIVEN a caller invokes a schema action exposed to its actor kind
- WHEN auth, input, idempotency, and schema validation pass
- THEN the runtime accepts the action
- AND the action response includes only fields allowed for that actor

#### Scenario: Unexposed action is hidden

- GIVEN a generated browser surface renders schema actions
- WHEN an action is exposed only to CLI deployers or runners
- THEN the action is not rendered as a browser control
- AND direct browser invocation of that actor-only action is rejected

### Requirement: Secret Reference Fields

The system SHALL allow schema records to carry non-secret references to runtime
or provider secrets without storing secret values.

#### Scenario: Store secret reference

- GIVEN deployment configuration needs a credential or provider state secret
- WHEN the record is stored, changed, read, archived, or written to a workspace
- THEN the schema record stores a secret reference or requirement fact
- AND the secret value is excluded from record values, changes, read models,
  browser responses, archives, and workspace manifests

### Requirement: Route Field Validation

The system SHALL let runtime-owned schemas validate route path and route prefix
fields against runtime topology constraints.

#### Scenario: Validate app route path

- GIVEN an app route record is created or patched
- WHEN route validation runs
- THEN the route path or prefix is checked for route-safe shape, reserved path
  conflicts, package capability, route kind, and enabled-route uniqueness
- AND invalid route values are rejected before runtime route behavior changes

### Requirement: Append-Only Control-Plane History

The system SHALL let runtime-owned schemas mark control-plane history records as
append-only or action-created.

#### Scenario: Append-only evidence

- GIVEN deployment attempt, evidence, cleanup, or drift history is recorded
- WHEN the history record is created
- THEN it is created through an allowed action or runtime write path
- AND ordinary generated patch or delete controls are not exposed for that
  history record
