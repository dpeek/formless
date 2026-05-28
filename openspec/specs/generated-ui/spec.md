# Generated UI Specification

## Purpose

Generated UI renders React app surfaces selected from app schema models and runtime profiles. It turns screens, views, fields, read models, actions, and app storage identity into browser behavior for records without requiring custom app code.

## Requirements

### Requirement: Runtime Profile Routing

The system SHALL select generated surfaces from the active runtime profile and route policy.

#### Scenario: Dev workbench routes

- GIVEN the dev workbench profile
- WHEN the user visits `/tasks`, `/estii`, `/site`, their `/schema` routes, or installed app routes
- THEN the matching generated app, schema editor, admin, or public Site surface mounts
- AND legacy `/rates` routes redirect to `/estii` routes

#### Scenario: App custom-domain host

- GIVEN an app custom-domain host mapped to an app install
- WHEN the user visits `/` or `/schema`
- THEN the installed app mounts at `/`
- AND the mapped install schema editor mounts at `/schema`
- AND the instance shell is not exposed

### Requirement: App Frame And Settings

The system SHALL render app chrome according to profile and SHALL expose app-local controls through the app settings surface.

#### Scenario: Profile-specific chrome

- GIVEN a generated app is opened in the dev workbench profile
- WHEN the app renders
- THEN workbench chrome wraps the generated app
- AND the workbench runtime shell can switch between App management, bundled source apps, and supported installed apps
- AND the app profile renders generated app chrome without the workbench runtime shell

#### Scenario: Instance management shell

- GIVEN the product instance shell renders
- WHEN bundled app packages and custom domains are available
- THEN install controls support Site, Tasks, and Estii packages
- AND custom domain management shows desired route state and provider applied
  evidence separately
- AND Cloudflare API tokens and Alchemy secret values are not exposed to the
  browser

#### Scenario: App-local settings

- GIVEN app settings are opened for the active app
- WHEN settings render
- THEN sync status, a profile-exposed Schema link, source seed reset, and configured local Site publish controls are available
- AND legacy store snapshot Export or Restore controls are not shown
- AND portable archive backup, restore, or import controls are not shown

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
