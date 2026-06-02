## ADDED Requirements

### Requirement: Routes Editor

The generated instance UI SHALL provide one editor experience for route records
that covers instance paths, host mappings, public Site routes, and redirects.

#### Scenario: Route list

- **GIVEN** owner or admin users inspect routes
- **WHEN** route records render
- **THEN** routes show match host, match path, match prefix, kind, target
  profile, app install target, surface, redirect target, provider config,
  enabled state, and timestamps where applicable
- **AND** routes are grouped or filterable by instance paths, host mappings,
  public Site routes, redirects, app install, and provider config

#### Scenario: Edit mount route

- **GIVEN** owner or admin users edit an allowed mount route field
- **WHEN** the edit is submitted
- **THEN** the editor validates route-safe match shape, reserved path
  conflicts, package capability, target profile, surface, app install target,
  and enabled-route uniqueness
- **AND** route edits do not change the app install's storage identity or app
  data

#### Scenario: Edit redirect route

- **GIVEN** owner or admin users edit a redirect route
- **WHEN** the edit is submitted
- **THEN** the editor validates match host, match path, redirect target, status
  code, preservePath policy, and preserveQueryString policy
- **AND** the redirect route does not require an app install target

#### Scenario: Evidence remains separate

- **GIVEN** provider evidence, cleanup history, deployment attempts, or drift
  summaries exist for a route
- **WHEN** the route editor renders
- **THEN** desired route fields remain visually separate from provider evidence
  and cleanup state
- **AND** route edits do not imply provider mutation

## MODIFIED Requirements

### Requirement: Schema-Driven Instance Management UI

The system SHALL render instance management in the instance shell from
schema-owned app install, route, deployment, provider evidence, view, screen,
read model, and action models.

#### Scenario: Instance management surface

- **GIVEN** the product instance shell renders instance management
- **WHEN** control-plane records are available
- **THEN** app installs, routes, deploy targets, desired resources, attempt
  status, evidence summaries, and drift summaries come from the instance
  control-plane schema
- **AND** custom-domain desired route state and provider applied evidence remain
  visually separate

#### Scenario: Browser secret boundary

- **GIVEN** deployment management UI reads control-plane records or desired
  state
- **WHEN** browser responses are returned
- **THEN** Cloudflare API tokens, Alchemy passwords, Alchemy state tokens, raw
  lease tokens, and runtime secrets are not exposed to the browser

### Requirement: App Install Editor

The generated instance UI SHALL provide an editor experience for app install
records that matches current table-driven install management behavior.

#### Scenario: Install list

- **GIVEN** owner or admin users open app management
- **WHEN** installed apps are rendered
- **THEN** app installs render in a scannable collection with package, label,
  status, and route summary fields derived from `route` records
- **AND** install controls support Site, Tasks, and Estii package creation

#### Scenario: Create install

- **GIVEN** owner or admin users create an app install
- **WHEN** the create flow is submitted
- **THEN** the editor provides package selection, route-safe install id input,
  label input, and validation feedback for duplicate or reserved install ids
- **AND** successful creation shows the generated admin, schema, and public Site
  route records for that install when those routes are supported

#### Scenario: Edit install metadata

- **GIVEN** owner or admin users edit an existing app install
- **WHEN** metadata fields render
- **THEN** label and supported display metadata are editable
- **AND** install identity, package app key, storage identity, and package
  source initialization facts render as read-only

## REMOVED Requirements

### Requirement: App Route Editor

**Reason**: App routes, exact-host domain mappings, and redirects are unified as
`route` records, so a dedicated app-route-only editor no longer covers the
desired route model.

**Migration**: Replace the app route editor with the unified Routes editor.
Existing install summaries continue to show admin, schema, and public Site
routes by deriving them from `route` records.
