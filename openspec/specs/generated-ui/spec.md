# Generated UI Specification

## Purpose

Generated UI renders React app surfaces selected from app schema models and runtime profiles. It turns screens, views, fields, read models, actions, and app storage identity into browser behavior for records without requiring custom app code.

## Requirements

### Requirement: Runtime Profile Routing

The system SHALL select generated surfaces from the active runtime profile and route policy.

#### Scenario: Dev workbench routes

- **GIVEN** the dev workbench profile
- **WHEN** the user visits `/tasks`, `/estii`, `/site`, `/crm`, their `/schema` routes, or installed app routes
- **THEN** the matching generated app, schema editor, admin, or public Site surface mounts
- **AND** legacy `/rates` routes redirect to `/estii` routes

#### Scenario: App custom-domain host

- **GIVEN** an app custom-domain host mapped to an app install
- **WHEN** the user visits `/` or `/schema`
- **THEN** the installed app mounts at `/`
- **AND** the mapped install schema editor mounts at `/schema`
- **AND** the instance shell is not exposed

### Requirement: App Frame And Settings

The system SHALL render app chrome according to profile and SHALL expose app-local controls through the app settings surface.

#### Scenario: Profile-specific chrome

- **GIVEN** a generated app is opened in the dev workbench profile
- **WHEN** the app renders
- **THEN** workbench chrome wraps the generated app
- **AND** the workbench runtime shell can switch between App management, bundled source apps, and supported installed apps
- **AND** the app profile renders generated app chrome without the workbench runtime shell

#### Scenario: Instance management shell

- **GIVEN** the product instance shell renders
- **WHEN** bundled app packages and custom domains are available
- **THEN** install controls support Site, Tasks, Estii, and CRM packages
- **AND** custom domain management shows desired route state and provider applied
  evidence separately
- **AND** Cloudflare API tokens and Alchemy secret values are not exposed to the
  browser

#### Scenario: App-local settings

- **GIVEN** app settings are opened for the active app
- **WHEN** settings render
- **THEN** sync status, a profile-exposed Schema link, and source seed reset are
  available where supported
- **AND** legacy store snapshot Export or Restore controls are not shown
- **AND** portable archive backup, restore, or import controls are not shown

#### Scenario: Instance management provider actions

- **GIVEN** the product instance shell renders domain, route, deployment, drift,
  or provider evidence state
- **WHEN** the user reviews provider resources
- **THEN** supported explicit provider delete, manual cleanup, or evidence repair
  controls may remain available for selected recorded evidence
- **AND** provider mutation guidance points to workspace deploy

### Requirement: Screen Workspaces

The system SHALL render generated screens from screen models and collection sections.

#### Scenario: Multi-section workspace

- GIVEN a workspace screen with multiple collection sections
- WHEN the screen is opened
- THEN sections render in schema order
- AND query and context state is keyed by screen and section
- AND the screen body does not repeat the active screen heading

#### Scenario: Generated app navigation

- GIVEN primary screen models are available
- WHEN generated app chrome renders
- THEN the sidebar lists the app screens
- AND the sidebar title is the app label

### Requirement: Collection Rendering

The system SHALL render collection views with query tabs, context selection, summary slots, actions, and schema-declared result types.

#### Scenario: Collection model selection

- GIVEN collection models are selected in `src/client/views.ts`
- WHEN `HomeViewModel.collection` builds a `HomeCollectionConfig`
- THEN the model selects entity, context, query tabs, default query, result, actions, and summaries before rendering
- AND it composes shell facts from `src/client/collection-shell-model.ts` with result facts from `src/client/collection-result-model.ts`
- AND shell selection owns query tabs, default query, context, summaries, actions, related collections, and create facts

#### Scenario: Result model ownership

- GIVEN collection result selection dispatches from `src/client/collection-result-model.ts`
- WHEN a `list`, `record`, `table`, or `tree` result model is selected
- THEN `src/client/list-result-model.ts` owns list and record result facts
- AND `src/client/table-model.ts` owns table result and footer facts
- AND `src/client/tree-result-model.ts` owns tree result facts
- AND `src/client/result-ordering-model.ts` owns shared result ordering facts

#### Scenario: Selected result renderer handoff

- GIVEN the generated collection renderer in `src/app/generated/collection.tsx`
- WHEN it renders selected `list`, `record`, `table`, or `tree` result models
- THEN it passes selected result models to `RecordList`, record detail, `RecordTable`, or `RecordTree`
- AND `RecordList` consumes list result facts from `src/client/list-result-model.ts`
- AND record detail consumes record result facts from `src/client/list-result-model.ts`
- AND `RecordTable` consumes table result facts selected through `src/client/collection-result-model.ts`
- AND `RecordTree` consumes tree result facts from `src/client/tree-result-model.ts`
- AND generated ordering UI consumes result ordering facts from `src/client/result-ordering-model.ts`

#### Scenario: List-detail context

- GIVEN a collection context uses `listDetail` presentation
- WHEN a context record is selected
- THEN the selected context fields render above related results
- AND related context counts derive from local records

#### Scenario: Ordered list result

- GIVEN a list result declares ordering and generated drag handles
- WHEN the user reorders records
- THEN generated UI patches the declared rank field
- AND field editors, delete controls, readiness warnings, visible union fields, and ordering behavior remain available in the list

### Requirement: Table Surfaces

The system SHALL render generated table results with field, reference-field, computed, invoke-action, and ordering-handle columns.

#### Scenario: Table edit dialog

- GIVEN a table row action opens an edit dialog
- WHEN the user edits fields and closes with Done
- THEN edits live-patch through field editors
- AND active union variant fields can render in row and reference-field dialogs

#### Scenario: Table ordering and aggregates

- GIVEN a table result declares ordering and aggregate footer slots
- WHEN the table renders and the user moves rows
- THEN aggregate footers display read-model values
- AND move menus or drag drops patch sparse numeric ranks

### Requirement: Field Editing And Presentation

The system SHALL render generated field displays and editors from field behavior and presentation metadata.

#### Scenario: Rich text-backed editors

- GIVEN text fields use `icon`, `image`, or `media` editor metadata
- WHEN generated editors render
- THEN icon fields use a catalog-first picker with custom SVG mode
- AND image fields support upload with preview and manual URL fallback
- AND media fields select or upload core image media assets

#### Scenario: Presentation fallbacks

- GIVEN enum `iconOnly`, boolean `completion`, and optional date `valueOrInteraction` presentations
- WHEN fields render
- THEN known icon and color tokens render visual controls
- AND unknown tokens fall back to visible text or neutral styling
- AND empty `valueOrInteraction` date controls stay quiet until hover or focus

### Requirement: Media Field Package Adapter

The system SHALL keep generated field layout and commit behavior in generated UI
while delegating media-specific controls to the Media React adapter.

#### Scenario: Media editor uses package control

- GIVEN a text field declares the `media` editor
- WHEN generated UI renders the field
- THEN generated UI uses the Media React adapter for asset selection, upload,
  preview, and broken-asset behavior
- AND the field value remains a flat text value committed by generated UI

#### Scenario: Image editor preserves fallback input

- GIVEN a text field declares the `image` editor
- WHEN generated UI renders the field
- THEN generated UI preserves upload with preview and manual URL fallback
  behavior
- AND generic field labels, validation placement, layout, and commit policy
  remain owned by generated UI

### Requirement: Create Edit And Delete Flows

The system SHALL honor generated create, edit, `visibleWhen`, create default, union variant, and delete policies across record surfaces.

#### Scenario: Create form submission

- GIVEN a create form has hidden literal defaults and `visibleWhen` fields
- WHEN the user submits the form
- THEN hidden literal defaults are submitted
- AND hidden `visibleWhen` fields are not submitted
- AND active union variant fields follow draft discriminator values

#### Scenario: Delete control availability

- GIVEN an entity delete policy is enabled
- WHEN records render in collection contexts, list rows, table rows, or tree child nodes
- THEN delete controls can render with destructive confirmation
- AND tree placement removal stays separate from child record deletion

### Requirement: Actions And Tree Composition

The system SHALL render schema actions through generated action UI and SHALL use relationship context and readiness facts to shape command inputs.

#### Scenario: Many-to-many selection action

- GIVEN a selected join action targets a `manyToMany` relationship
- WHEN the user submits selected related records
- THEN explicit join records are created or removed
- AND generic field defaults fill other required through fields when join records are created

#### Scenario: Tree add and remove controls

- GIVEN a tree result declares allowed child variants and literal placement values
- WHEN the user opens the add child menu and submits a child
- THEN one child record and one placement edge are created
- AND leaf policy renders leaf children without descendants
- AND remove-placement controls tombstone placement edges without showing child delete controls on placement cards

### Requirement: Schema Authoring Surface

The system SHALL provide a generated schema authoring surface with Builder mode and Source mode over the same draft.

#### Scenario: Invalid Source mode

- GIVEN Source mode JSON becomes invalid
- WHEN the user views Builder mode or Save schema
- THEN Builder mode and Save schema are disabled until JSON parses
- AND draft status remains accessible as saved, dirty, invalid, or saving

#### Scenario: Builder-owned model editing

- GIVEN the user creates entities and fields in Builder mode
- WHEN those entities and fields have been saved
- THEN saved entity keys, saved field keys, saved field types, and reference targets are locked
- AND builder-owned create and inline field presentation can still be edited

#### Scenario: Source and Builder share one draft

- GIVEN the schema route is open
- WHEN Builder mode or Source mode changes the draft
- THEN both modes edit the same local draft
- AND Save schema uses the existing schema parser before committing the active
  schema

### Requirement: Builder Kebab-Case Entity Keys

Generated UI SHALL let Builder author schema entities with canonical kebab-case
entity keys and render clean human labels for those entities.

#### Scenario: Create builder-owned kebab-case entity

- WHEN a user creates a Builder-owned entity with a key such as `app-install`,
  `project-note`, or `block-placement`
- THEN Builder accepts the key when the schema parser accepts it
- AND the emitted schema stores that key locally in the `entities` object
  without a namespace prefix

#### Scenario: Reject non-canonical entity key in Builder

- WHEN a user enters an entity key with camelCase, uppercase characters,
  underscores, dots, slashes, colons, leading digits, leading hyphens, trailing
  hyphens, or double hyphens
- THEN Builder reports validation feedback before save
- AND Save schema remains unavailable until the draft parses

#### Scenario: Render entity labels from kebab-case keys

- WHEN generated UI renders an entity whose source key is `app-install`,
  `domain-mapping`, or `deploy-drift-report`
- THEN human-facing labels are derived from words such as `App install`,
  `Domain mapping`, or `Deploy drift report`
- AND generated UI does not treat hyphens as namespace separators

#### Scenario: Preserve saved key locking

- WHEN a kebab-case entity key has been saved
- THEN Builder keeps the saved entity key locked under the existing schema
  authoring rules
- AND this change does not rename saved field keys, query keys, view keys,
  action keys, or screen keys

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

### Requirement: Actor-Safe Deployment Actions

Generated UI SHALL render only deployment actions exposed to browser actor
kinds.

#### Scenario: Browser-visible actions

- GIVEN an owner or admin views deployment configuration
- WHEN generated UI renders actions
- THEN it renders only actions exposed to owner or admin browser actors
- AND CLI deployer or runner actions are hidden from the browser surface

#### Scenario: Read-only history

- GIVEN deployment attempt, evidence, or drift history records render
- WHEN the schema marks those records as append-only or action-created
- THEN generated UI treats the history as read-only unless the schema exposes a
  specific browser action for that record

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

### Requirement: Browser Workspace Operation Controls

Generated instance management UI SHALL expose local workspace operations when a
workspace gateway proxy is available through the local runtime.

#### Scenario: Local workspace controls

- **WHEN** the product instance shell renders in a local workspace runtime with
  gateway proxy status available
- **THEN** the UI can start workspace init, save, check, pull, push, deploy
  credential setup, deploy plan, and deploy apply operations through the
  same-origin gateway API family
- **AND** the UI does not expose arbitrary filesystem path inputs or raw file
  read/write controls
- **AND** the UI does not receive or render the sidecar loopback URL or internal
  proxy token

#### Scenario: Operation status display

- **WHEN** a workspace operation is running or completed
- **THEN** the UI can display operation status, progress, summaries, and
  display-safe errors returned through the local runtime gateway proxy
- **AND** provider credentials, local secret values, raw provider state, and
  disallowed filesystem paths are not rendered

#### Scenario: External authorization prompt

- **WHEN** a workspace credential setup operation reports a display-safe
  external authorization URL through the local runtime gateway proxy
- **THEN** the UI can render an action to open that URL and continue polling the
  operation
- **AND** raw adapter or tool output, provider tokens, refresh tokens, Alchemy
  passwords, and local secret values are not rendered

#### Scenario: Gateway proxy unavailable

- **WHEN** the product instance shell renders without local gateway proxy status
  available
- **THEN** the UI treats workspace gateway operations as unavailable
- **AND** it does not offer controls that would imply workspace filesystem,
  credential setup, deploy plan, or deploy apply execution is available

### Requirement: Browser-First Onboarding UI

Generated instance management UI SHALL support onboarding a local workspace from
the browser.

#### Scenario: Empty workspace onboarding

- **WHEN** the browser opens a local runtime before workspace source has been
  initialized
- **THEN** the UI can invoke workspace initialization through the gateway
- **AND** after initialization the UI can create package app installs through
  Authority-backed app install actions

#### Scenario: Save after browser edits

- **WHEN** a browser owner or admin edits app install, route, domain, or deploy
  intent records
- **THEN** the UI can invoke workspace save through the gateway
- **AND** the saved workspace source is generated from Authority-backed records,
  not from manifest app, route, domain, or deploy fields

### Requirement: Onboarding Form Reuse

Generated instance management UI SHALL reuse generated field and validation
behavior for onboarding steps that write schema records.

#### Scenario: Onboarding record form

- **WHEN** a browser onboarding step creates or edits app install, route,
  provider config, deploy target, or desired resource records
- **THEN** field rendering reuses generated create/edit field controls, field
  editor selection, defaults, `visibleWhen`, and union variant behavior where
  the step is backed by schema view facts
- **AND** submit behavior writes through Authority-backed mutations or actions
  so Authority validation remains the source of record validation
- **AND** onboarding-specific React code does not duplicate schema field
  validation rules

#### Scenario: Gateway operation step

- **WHEN** an onboarding step initializes a workspace, starts credential setup,
  runs save/check, or starts deploy plan/apply
- **THEN** the step invokes the workspace gateway operation model and renders
  operation progress
- **AND** schema field controls are used only for schema-record inputs, not for
  arbitrary filesystem paths, credentials, raw provider state, or shell output

#### Scenario: Future schema-defined setup flows

- **WHEN** app-specific setup flows such as a newly installed Site app template
  flow are considered in a later change
- **THEN** the existing onboarding UI structure keeps step orchestration
  separate from generated field rendering and mutation submission
- **AND** this change does not add a schema-declared onboarding or setup-flow
  language
