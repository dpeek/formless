## ADDED Requirements

### Requirement: Entity Key Grammar

The system SHALL validate schema-local entity keys as singular kebab-case data
identifiers.

#### Scenario: Parse schema-local entity key

- **WHEN** an app schema declares entity keys such as `block`, `app-install`,
  or `deploy-desired-resource`
- **THEN** schema parsing accepts those keys as local entity identifiers
- **AND** the entity keys remain unqualified inside the schema's `entities`
  object

#### Scenario: Reject non-canonical entity key

- **WHEN** an app schema declares an entity key with uppercase characters,
  camelCase, underscores, dots, slashes, colons, leading digits, leading
  hyphens, trailing hyphens, double hyphens, or an empty value
- **THEN** schema parsing rejects the schema before generated UI, Authority
  writes, or browser replicas use it

#### Scenario: Leave other schema keys unchanged

- **WHEN** an app schema declares fields, queries, read models, views, screens,
  actions, or mutations
- **THEN** this entity-key grammar does not rename or normalize those keys
- **AND** existing validation for those schema sections remains separately
  owned by their current parser rules

### Requirement: Qualified Entity Names

The system SHALL represent entity identity as `<schema-key>:<entity-key>` at
cross-schema and external boundaries while preserving local entity keys inside
the declaring schema.

#### Scenario: Emit external qualified entity name

- **WHEN** records are written to archives, workspace record source, drift
  reports, logs, diagnostic output, or another external boundary that combines
  schema record families
- **THEN** entity identity is represented with a qualified name such as
  `site:block` or `instance:app-install`
- **AND** the right-hand side uses the local kebab-case entity key

#### Scenario: Keep schema-internal references local

- **WHEN** a schema-internal reference field targets another entity in the same
  schema
- **THEN** the reference target uses the local entity key
- **AND** it does not store the schema namespace prefix in the reference target

#### Scenario: Cross-schema reference uses qualified target

- **WHEN** a schema explicitly introduces a reference to an entity owned by a
  different schema
- **THEN** the reference boundary identifies the target entity with a qualified
  entity name
- **AND** normal record values remain flat reference values

## MODIFIED Requirements

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
