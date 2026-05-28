## ADDED Requirements

### Requirement: Schema-Driven Instance Management UI

The system SHALL render instance management in the instance shell from
schema-owned app install, route, domain, and deployment entities, views,
screens, read models, and actions.

#### Scenario: Instance management surface

- **WHEN** the product instance shell renders instance management
- **THEN** app installs, app routes, deploy targets, domain mappings, redirect
  intent, desired resources, attempt status, evidence summaries, and drift
  summaries come from the instance control-plane schema
- **AND** custom-domain desired state and provider applied evidence remain
  visually separate

#### Scenario: Browser secret boundary

- **WHEN** deployment management UI reads control-plane records or desired state
- **THEN** Cloudflare API tokens, Alchemy passwords, Alchemy state tokens, raw
  lease tokens, and runtime secrets are not exposed to the browser

### Requirement: App Install Editor

The generated instance UI SHALL provide an editor experience for app install
records that matches current table-driven install management behavior.

#### Scenario: Install list

- **WHEN** owner or admin users open app management
- **THEN** app installs render in a scannable table or collection with package,
  label, status, admin route, schema route, and public route summary fields
- **AND** install controls support Site, Tasks, and Estii package creation

#### Scenario: Create install

- **WHEN** owner or admin users create an app install
- **THEN** the editor provides package selection, route-safe install id input,
  label input, and validation feedback for duplicate or reserved install ids
- **AND** successful creation shows the generated admin, schema, and public Site
  route records for that install

#### Scenario: Edit install metadata

- **WHEN** owner or admin users edit an existing app install
- **THEN** label and supported display metadata are editable
- **AND** install identity, package app key, storage identity, and package source
  initialization facts render as read-only

### Requirement: App Route Editor

The generated instance UI SHALL provide an editor experience for app route
records that keeps route behavior understandable and validates conflicts before
commit.

#### Scenario: Route list

- **WHEN** owner or admin users inspect routes
- **THEN** app routes render with referenced app install, route kind, path or
  prefix, enabled state, surface, and package capability
- **AND** routes are grouped or filterable by app install

#### Scenario: Edit route

- **WHEN** owner or admin users edit an allowed route field
- **THEN** the editor validates route-safe shape, reserved path conflicts,
  package capability, route kind, and enabled-route uniqueness
- **AND** route edits do not change the app install's storage identity or app
  data

#### Scenario: Unsupported route edit

- **WHEN** a route field is derived, package-owned, or not editable in the
  current implementation
- **THEN** the editor renders that field read-only
- **AND** it does not expose misleading controls that appear to retarget app
  storage

### Requirement: Actor-Safe Deployment Actions

Generated UI SHALL render only deployment actions exposed to browser actor kinds.

#### Scenario: Browser-visible actions

- **WHEN** an owner or admin views deployment configuration
- **THEN** generated UI renders only actions exposed to owner or admin browser
  actors
- **AND** CLI deployer or runner actions are hidden from the browser surface

#### Scenario: Read-only history

- **WHEN** deployment attempt, evidence, or drift history records render
- **THEN** generated UI treats append-only history as read-only unless the
  schema exposes a specific browser action for that record
