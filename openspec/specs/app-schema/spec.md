# App Schema Specification

## Purpose

App schema is runtime data that defines how a schema key stores flat records and exposes queries, read models, views, screens, operations, actions, state machines, and mutations. It is the durable contract for source schemas, seed records, generated UI, Authority storage, and browser replicas.

## Requirements

### Requirement: Bundled Source Apps

The system SHALL provide source schemas for the current bundled schema keys `tasks`, `estii`, `site`, `crm`, and `cleartrace`, and SHALL treat source seed records as stored-record shaped data.

#### Scenario: Load current source app

- **GIVEN** a current schema key `tasks`, `estii`, `site`, `crm`, or `cleartrace`
- **WHEN** the runtime loads the source schema
- **THEN** the app schema is available for that schema key
- **AND** seed records can initialize records without being interpreted as change rows

### Requirement: App Package Source Manifests

The system SHALL represent installable app package source metadata as app
package manifest facts before exposing package metadata to install, upgrade,
archive, or deploy workflows.

#### Scenario: Parse app package manifest

- GIVEN an app package manifest declares kind `formless.appPackage` and version
  `1`
- WHEN the package source is resolved
- THEN the manifest declares a route-safe package app key, label, optional
  description, default install id, multiple-install policy, package revision,
  source schema location, seed records location, and runtime capabilities such
  as generated admin and optional public Site routes
- AND the manifest does not contain app install records, route records,
  deployment config, app records, media payloads, provider credentials, or
  workspace-local secrets
- AND the referenced source schema parses as an app schema
- AND referenced seed records validate as stored-record shaped data for that
  source schema

#### Scenario: Verify resolved package source hash

- GIVEN an app package manifest declares a source schema hash
- WHEN package source is resolved from local filesystem source
- THEN the resolver computes the deterministic source schema hash from the
  referenced source schema
- AND resolution fails when the computed hash differs from the manifest
  `sourceSchemaHash`
- AND the package is not exposed to install, upgrade, archive, or deploy
  workflows until the manifest and source schema agree

#### Scenario: Resolve bundled app packages from manifests

- GIVEN the current bundled package app keys `site`, `tasks`, `estii`, `crm`,
  and `cleartrace`
- WHEN package metadata is listed or read
- THEN each package is exposed as a resolved app package derived from app
  package manifest facts
- AND existing package app keys, labels, default install ids, package
  revisions, source schema hashes, source schema keys, and seed record keys
  remain stable unless the package source changes

### Requirement: Package App Revision Facts

The system SHALL distinguish app schema language version from app package
revision and source schema hash.

#### Scenario: Parse schema language version

- **WHEN** an app schema is parsed
- **THEN** `schema.version` continues to represent the schema language version
- **AND** package app revision is not read from `schema.version`

#### Scenario: Describe resolved package app revision

- **WHEN** resolved app package metadata is read
- **THEN** the package declares a monotonic package revision, deterministic
  source schema hash, package app key, source origin, and source schema key
- **AND** current bundled packages can remain at package revision `1`

### Requirement: Package App Schema Migrations

The system SHALL support code-backed package app migrations between package app
revisions.

#### Scenario: Migrate package app schema

- WHEN an installed package app is behind the current package revision
- THEN matching package app migrations can update the active schema and package
  revision facts
- AND the schema remains a valid parsed app schema before it is stored

#### Scenario: Preserve schema hash provenance

- WHEN a package app migration completes
- THEN stored package facts identify the applied package revision and source
  schema hash
- AND the hash is used for drift/provenance checks, not migration ordering

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

### Requirement: Schema Package Boundary

The system SHALL expose reusable App schema language contracts, parsers, and
pure helpers through the Schema package slice.

#### Scenario: Package owns app schema interface

- **WHEN** generated UI models, schema authoring state, Authority validation,
  browser replicas, archive planning, archive normalization, upgrade
  migrations, tests, or other package slices need App schema types, parse
  behavior, stringify behavior, schema-local entity key helpers, qualified
  entity name helpers, field behavior, query helpers, read model helpers,
  create-default helpers, runtime metadata helpers, operation capability facts,
  or action capability facts
- **THEN** they import those contracts and helpers from
  `@dpeek/formless-schema`
- **AND** they do not import package-owned schema behavior from old
  `src/shared/schema*`, `src/shared/field-types`, `src/shared/fields`,
  `src/shared/query`, `src/shared/read-model`, or unexported package internals
- **AND** old package-owned shared schema modules are not retained as
  compatibility re-export shims

#### Scenario: Package does not own runtime app records

- **WHEN** App schema behavior is used to load bundled or resolved package
  source schemas, load source seed records, render generated React surfaces,
  edit Builder drafts, validate Authority writes, store active schemas, sync
  browser replicas, plan or apply archives, compose Workspace record source,
  build instance control-plane records, or apply package app migrations
- **THEN** those runtime behaviors remain owned by app, client, Worker,
  archive, Workspace, instance control-plane, migration, or generated UI modules
- **AND** the Schema package only owns runtime-neutral schema language
  contracts, parser/formatter behavior, field/query/read-model helpers, and
  package-local deterministic tests

### Requirement: Entity Key Grammar

The system SHALL validate schema-local entity keys as singular kebab-case data
identifiers.

#### Scenario: Parse schema-local entity key

- WHEN an app schema declares entity keys such as `block`, `app-install`, or
  `deployment-config`
- THEN schema parsing accepts those keys as local entity identifiers
- AND the entity keys remain unqualified inside the schema's `entities` object

#### Scenario: Reject non-canonical entity key

- WHEN an app schema declares an entity key with uppercase characters,
  camelCase, underscores, dots, slashes, colons, leading digits, leading
  hyphens, trailing hyphens, double hyphens, or an empty value
- THEN schema parsing rejects the schema before generated UI, Authority writes,
  or browser replicas use it

#### Scenario: Leave other schema keys unchanged

- WHEN an app schema declares fields, queries, read models, views, screens,
  operations, actions, or mutations
- THEN this entity-key grammar does not rename or normalize those keys
- AND existing validation for those schema sections remains separately owned by
  their current parser rules

### Requirement: Field Key Grammar

The system SHALL use camelCase field keys for entity field identifiers.

#### Scenario: Declare entity fields

- WHEN an app schema declares entity fields
- THEN field keys use lower camelCase identifiers such as `appInstall`,
  `matchPath`, `providerConfig`, and `createdAt`
- AND kebab-case remains reserved for entity keys, not field keys

#### Scenario: Reference kebab-case entity from camelCase field

- WHEN a field references an entity such as `app-install`
- THEN the field key remains camelCase
- AND the reference target remains the local kebab-case entity key

### Requirement: Qualified Entity Names

The system SHALL represent entity identity as `<schema-key>:<entity-key>` at
cross-schema and external boundaries while preserving local entity keys inside
the declaring schema.

#### Scenario: Emit external qualified entity name

- WHEN records are written to archives, workspace record source, drift reports,
  logs, diagnostic output, or another external boundary that combines schema
  record families
- THEN entity identity is represented with a qualified name such as
  `site:block` or `instance:app-install`
- AND the right-hand side uses the local kebab-case entity key

#### Scenario: Keep schema-internal references local

- WHEN a schema-internal reference field targets another entity in the same
  schema
- THEN the reference target uses the local entity key
- AND it does not store the schema namespace prefix in the reference target

#### Scenario: Cross-schema reference uses qualified target

- WHEN a schema explicitly introduces a reference to an entity owned by a
  different schema
- THEN the reference boundary identifies the target entity with a qualified
  entity name
- AND normal record values remain flat reference values

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

#### Scenario: Screen access policy

- GIVEN a workspace screen declares access policy
- WHEN the schema is parsed
- THEN `access` is either `anonymous` or `owner`
- AND `anonymous` means the screen does not require an owner session beyond the
  access required by its mounted route
- AND `owner` means the screen requires an owner session
- AND omitted screen access inherits the mounted route access

#### Scenario: Reject invalid screen access

- GIVEN a workspace screen declares an unsupported access value
- WHEN the schema is parsed
- THEN parsing fails
- AND the invalid screen is not made available for generated UI navigation

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
- THEN the emitted schema declares create and update operations for the entity
- AND the entity receives a simple generated surface with all-records query,
  item view, create view, collection view, and workspace screen

#### Scenario: Preserve advanced schema

- GIVEN a source schema contains sections not owned by Builder
- WHEN Builder edits supported entity or field metadata
- THEN advanced source-owned sections are preserved
- AND saved entity keys, field keys, field types, and reference targets remain
  locked in Builder

### Requirement: Action Kinds

The system SHALL declare schema action kinds as data-owned command effect
targets over flat records.

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

### Requirement: Entity Operations

The system SHALL let app schemas declare entity-local operations as the shared
interaction contract for generated UI, Authority execution, protocol bindings,
public forms, automation, audit, and authorization.

#### Scenario: Parse entity-local operation

- GIVEN an entity declares operations under `entities.<entityKey>.operations`
- WHEN the schema is parsed
- THEN each operation key is scoped to that containing entity
- AND the runtime derives a canonical operation key as
  `<entityKey>.<operationKey>`
- AND top-level or cross-entity operation declarations are rejected until a
  later schema contract introduces them

#### Scenario: Validate operation kind and scope

- GIVEN an entity operation is declared
- WHEN the schema is parsed
- THEN the operation kind is `list`, `get`, `create`, `update`, `delete`, or
  `command`
- AND the operation scope is `collection` or `record`
- AND `public` is rejected as an operation scope because public exposure is an
  actor policy and binding
- AND `selection` and `workflow` remain reserved until their contracts are
  introduced

#### Scenario: Reuse entity fields in operation input

- GIVEN an operation input field references an entity field
- WHEN the schema is parsed
- THEN the referenced field must exist on the containing entity
- AND field behavior, validation, labels, defaults, and generated editor facts
  can be reused for that operation input
- AND inline scalar input fields can be declared for command-only input that is
  not stored directly on the target record

#### Scenario: Validate operation effects

- GIVEN an entity operation declares an effect
- WHEN the schema is parsed
- THEN first-pass effects support creating one record, patching one record,
  deleting or tombstoning one record, dispatching one registered schema action
  kind, or executing a declarative record plan
- AND create, update, and delete effects target the containing entity
- AND command effects can reference schema action kinds and schema queries
  declared for the same schema

#### Scenario: Validate command record plan

- GIVEN a command operation declares effect type `recordPlan`
- WHEN the schema is parsed
- THEN the effect is valid only for command operations
- AND the plan contains an ordered list of named steps
- AND the effect declares steps under `steps[]` with step `name`, step `kind`,
  target `entity`, create or patch `values`, and patch, delete, or tombstone
  `recordId` expressions
- AND each step creates, patches, deletes, or tombstones one flat record in a
  declared entity from the same schema
- AND step values may reference operation input fields, literal scalar values,
  generated ids, generated timestamps, actor/source context, and outputs from
  earlier steps
- AND record id expressions use input, literal scalar, generated id, or earlier
  step id output expressions
- AND field values target declared fields on the step entity
- AND reference field values use a reference expression whose entity matches the
  declared reference target and whose id resolves to a flat record id
- AND references to earlier steps resolve through flat record ids, not nested
  record values
- AND plans that include loops, arbitrary code, provider calls, cross-app
  writes, or undeclared entity/field targets are rejected

#### Scenario: Validate operation output contract

- GIVEN an entity operation declares an output contract
- WHEN the schema is parsed
- THEN `list` operations return records selected by the referenced query
- AND `get` operations return one active record selected by record id
- AND `create` operations return the created record plus affected change ids
- AND `update` operations return the updated record plus affected change ids
- AND `delete` operations return the tombstoned record id plus affected change
  ids
- AND `command` operations return a typed command response plus affected change
  ids

#### Scenario: Require source-declared operations

- GIVEN an entity relies on generated UI, Authority execution, or public
  execution
- WHEN runtime models are selected
- THEN the runtime consumes source-declared entity operations
- AND mutation policy or entity actions do not synthesize operation bindings
- AND operation bindings use the same canonical operation key grammar as their
  source-declared operations

### Requirement: State Machines

The system SHALL let app schemas declare lifecycle state machines over enum
fields without adding nested stored workflow state.

#### Scenario: Parse enum-backed state machine

- GIVEN an entity declares a state machine over an enum field
- WHEN the schema is parsed
- THEN the machine field exists on the same entity
- AND the machine field is a required enum field
- AND machine state keys, initial state, terminal states, transition source
  states, and transition destination states all reference values declared by
  that enum field

#### Scenario: Parse transition action kind

- GIVEN an entity action declares transition-state behavior
- WHEN the schema is parsed
- THEN the action references a state machine on the same entity
- AND the action references one transition from that machine
- AND the action uses normal actor exposure metadata for owner, admin, CLI
  deployer, and runner callers
- AND anonymous public access is rejected for this action kind

#### Scenario: Preserve flat lifecycle records

- GIVEN a record belongs to an entity with a state machine
- WHEN the record is created, patched through transition actions, synced,
  snapshotted, archived, or restored
- THEN the current state is represented by the normal enum field value
- AND state machine metadata does not create nested record values

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
operations, mutations, and actions.

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

- GIVEN an `app-install` record has been created
- WHEN a patch targets install identity, package app key, or storage identity
- THEN generated UI, CLI, sync, and action writes reject the change
- AND mutable fields such as label can still be patched when schema policy
  allows

#### Scenario: Route target integrity

- GIVEN an `app-route` record references an `app-install`
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
