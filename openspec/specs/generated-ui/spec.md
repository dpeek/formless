# Generated UI Specification

## Purpose

Generated UI renders React app surfaces selected from app schema models and
runtime profiles. It turns screens, views, fields, read models, operation
bindings, and app storage identity into browser behavior for records without
requiring custom app code.

## Requirements

### Requirement: Runtime Profile Routing

The system SHALL select generated surfaces from the active runtime profile and route policy.

#### Scenario: Dev workbench routes

- **GIVEN** the dev workbench profile
- **WHEN** the user visits `/tasks`, `/site`, `/crm`, installed app admin
  routes, or installed Site public routes
- **THEN** the matching generated app, admin, or public Site surface mounts

#### Scenario: Installed workspace package admin routes

- **GIVEN** an enabled installed app admin route targets an app install whose
  package app key is present only in the active workspace package resolver
- **WHEN** the browser visits `/apps/<installId>` or an app screen path under
  that route
- **THEN** generated UI mounts the installed app using package metadata from the
  active install registry response
- **AND** the source schema key can be a resolved package source schema key
  outside the bundled `tasks`, `site`, and `crm` source app set
- **AND** app bootstrap, sync, operations, reset, and schema reads use the
  install-scoped app API prefix for that app install
- **AND** generated UI does not require the package source schema to be bundled
  into the browser build before the installed route can mount

#### Scenario: App custom-domain host

- **GIVEN** an app custom-domain host mapped to an app install
- **WHEN** the user visits `/` or an app screen path such as `/schema`
- **THEN** the installed app mounts through normal generated app routing
- **AND** `/schema` is treated as an app screen path when the active source
  schema declares it
- **AND** the instance shell is not exposed

#### Scenario: Package-owned public surface

- **GIVEN** a browser route targets an installed app whose resolved package
  declares public Site runtime support
- **WHEN** React routing selects the public surface for that route
- **THEN** generated UI discovers the public route component from the package
  runtime React registry using the target package app key
- **AND** the public component receives route base, app storage identity,
  runtime profile, and package metadata from Formless core
- **AND** generated admin screens, sync, field editors, and operation behavior
  remain schema-driven core generated UI behavior
- **AND** React routing does not hard-code the bundled Site route component
  when the selected package has no registered public adapter

#### Scenario: Published public Site avoids generated admin entrypoint

- **GIVEN** the runtime renders a published Site page, mapped public Site host,
  or installed public Site route for anonymous visitors
- **WHEN** browser assets are selected for that public route
- **THEN** the selected assets do not require the generated admin `HomeRoute`,
  instance shell, app settings shell, owner setup or login routes, workspace
  gateway controls, or generated field editor modules to load
- **AND** generated app and instance management routes continue to mount through
  their own generated UI entrypoint when an admin or owner visits those routes
- **AND** public Site browser behavior is limited to the package public route
  component, configured public renderer, read-only markdown display, and public
  form behavior needed by the rendered tree

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
- **THEN** install controls support Site, Tasks, and CRM packages by
  default
- **AND** custom domain management shows desired route state and provider applied
  evidence separately
- **AND** instance-level navigation does not include a standalone deployments,
  provider, or workspace sync destination
- **AND** deployed instance profiles or profiles without an available local
  workspace gateway proxy do not show workspace operation controls
- **AND** Cloudflare API tokens and Alchemy secret values are not exposed to the
  browser

#### Scenario: Minimal instance rail navigation

- **GIVEN** an owner is using the product instance shell on the instance or dev
  workbench profile
- **WHEN** installed app navigation links are available
- **THEN** the shell renders a persistent narrow rail before the generated app
  sidebar
- **AND** the rail contains one rounded-square instance settings tile
- **AND** each installed app admin link is a rounded-square tile displaying the
  first display letter from the app install label
- **AND** each installed public Site link is a rounded-square tile displaying a
  public Site icon rather than a repeated app initial
- **AND** every tile has an accessible name that includes the destination label
  and surface such as admin or public Site
- **AND** the current tile is selected from the active browser path without
  changing generated app screen selection
- **AND** app install and route configuration tables remain available through
  instance settings rather than being the primary launch surface
- **AND** mapped app hosts, mapped public Site hosts, published Site profiles,
  anonymous owner-login routes, and anonymous owner-setup routes do not render
  the instance rail

#### Scenario: Local workspace save status

- **GIVEN** the product instance shell renders in a local workspace profile with
  workspace gateway auto-save available
- **WHEN** workspace source is clean, dirty, queued, saving, saved, or failed
- **THEN** the shell shows display-safe workspace save state without manual
  browser save or retry controls
- **AND** CLI save remains the fallback for explicit flush or retry behavior
- **AND** raw filesystem paths, provider credentials, admin tokens, and secret
  state are not exposed

#### Scenario: App-local settings

- **GIVEN** app settings are opened for the active app
- **WHEN** settings render
- **THEN** sync status and source seed reset are available where supported
- **AND** frontend Schema links and schema editor controls are not shown
- **AND** portable archive backup, restore, or import controls are not shown

#### Scenario: Instance management provider controls

- **GIVEN** the product instance shell renders domain, route, deployment,
  provider observation, or provider evidence state
- **WHEN** the user reviews provider resources
- **THEN** supported explicit provider delete, manual cleanup, or evidence repair
  controls may remain available for selected recorded evidence
- **AND** provider change guidance points to workspace push

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

#### Scenario: Schema path app screen

- GIVEN an app schema declares a screen with path `/schema`
- WHEN the generated app is mounted at a route where `/schema` is reachable
- THEN generated UI renders the declared app screen
- AND no frontend schema editor route takes precedence over that screen path

#### Scenario: Owner screen route guard

- GIVEN a generated app route has effective access `owner` from its mounted
  route, selected schema screen, or both
- WHEN an anonymous browser navigates to that route
- THEN generated UI does not render the screen workspace
- AND the runtime owner-login redirect handles the browser route
- AND app record sync or owner-only screen data loading does not start before
  the owner access check resolves

#### Scenario: Anonymous screen route

- GIVEN a generated app route has effective access `anonymous`
- WHEN an anonymous browser navigates to that route
- THEN generated UI can render the selected screen without an owner session
- AND operation and management controls still use their existing write and
  authorization contracts

### Requirement: Collection Rendering

The system SHALL render collection views with query tabs, context selection,
summary slots, operation controls, and schema-declared result types.

#### Scenario: Collection model selection

- GIVEN collection models are selected in `src/client/views.ts`
- WHEN `HomeViewModel.collection` builds a `HomeCollectionConfig`
- THEN the model selects entity, context, query tabs, default query, result,
  operation controls, and summaries before rendering
- AND it composes shell facts from `src/client/collection-shell-model.ts` with result facts from `src/client/collection-result-model.ts`
- AND shell selection owns query tabs, default query, context, summaries,
  operation controls, related collections, and create facts

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

The system SHALL render generated table results with field, reference-field,
computed, operation-control, and ordering-handle columns.

#### Scenario: Table operation dialog

- GIVEN a table row operation opens an edit dialog
- WHEN the user edits fields and closes with Done
- THEN edits submit through the declared update operation and field editors
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

#### Scenario: Markdown source editor

- GIVEN text fields use `markdown` editor metadata
- WHEN generated editors render
- THEN markdown fields use the shared `MarkdownEditor` component boundary with
  a controlled textarea source editor
- AND the source editor uses monospace text styling, disables spellcheck, and
  stores and commits the field value as flat Markdown text
- AND generated markdown editing does not require Plate, Slate, or other rich
  text editor runtime modules

#### Scenario: Presentation fallbacks

- GIVEN enum `iconOnly`, boolean `completion`, and optional date `valueOrInteraction` presentations
- WHEN fields render
- THEN known icon and color tokens render visual controls
- AND unknown tokens fall back to visible text or neutral styling
- AND empty `valueOrInteraction` date controls stay quiet until hover or focus

#### Scenario: System field display

- GIVEN a generated table, detail, list, or record surface includes a record
  system field
- WHEN generated UI renders the field
- THEN it resolves the value from record metadata such as `id`, `createdAt`,
  `updatedAt`, or `deletedAt`
- AND it uses the same display formatting and layout pipeline as schema value
  fields
- AND it treats the field as read-only regardless of table display metadata,
  field editor metadata, or operation availability

#### Scenario: Identity reference field fallback

- GIVEN a generated field display or editor renders a reference field targeting
  `auth:principal`, `auth:organization`, or `auth:group`
- WHEN display-safe identity target records are not loaded in the active app
  browser replica
- THEN generated UI keeps the stored flat record id visible as the fallback
  reference label
- AND it does not query unrelated app storage, expose the raw generated
  identity-control-plane record editor, or require credentials, challenge
  secrets, token hashes, sessions, grants, recovery material, or provider
  responses
- AND when display-safe identity reference options are available through a
  runtime-owned client path, generated UI may use those options without
  changing the stored app record value shape

#### Scenario: Astryx field primitive boundary

- GIVEN generated UI renders create forms, record editors, table cells, detail
  fields, Site block authoring fields, or public operation input fields with
  Astryx view primitives
- WHEN the foundation model prepares field data for the view layer
- THEN it projects each renderable field as plain field-shaped data with a
  stable field id, field or input name, label, required state, surface, density,
  access mode, editor or display kind, draft value, committed display value,
  options, presentation metadata, commit policy, pending state, and
  display-safe field error
- AND hidden fields are omitted before they reach Astryx, except hidden literal
  create defaults remain foundation-owned operation input
- AND `visibleWhen`, union discriminator variants, create defaults,
  non-writable fields, system fields, state-machine-owned fields, reference
  option loading, missing reference fallbacks, media upload state, value
  coercion, validation, operation submission, sync status, and local auto-save
  remain foundation behavior
- AND Astryx receives only projected field data and intent callbacks such as
  draft change, commit, revert, picker open, or upload file
- AND Astryx field primitives remain controlled value components whose core
  contract does not require browser form names, hidden inputs, or `FormData`
  extraction
- AND browser submit-form adapters may project HTML field names and hidden
  inputs from Astryx field data only at the submit-form boundary
- AND Astryx does not import schema parser internals, browser replica APIs,
  app target selectors, write option hooks, `submitOperation`, media clients,
  sync status hooks, or generated UI storage helpers
- AND foundation code does not render Astryx components or decide field group,
  form, table, detail, picker, popover, or compact cell layout

#### Scenario: Astryx field primitive coverage

- GIVEN generated UI projects supported field display and editor kinds to
  Astryx
- WHEN Astryx renders the projected fields
- THEN text, long text, number, date, boolean, enum, reference, markdown
  display, icon display, source SVG icon display, color, image, and media
  fields share Astryx field framing, labels, status, density, and keyboard
  behavior
- AND markdown editing uses a plain text area while markdown display uses the
  Astryx Markdown component
- AND source SVG icon rendering uses an Astryx SourceIcon primitive that wraps
  the Astryx Icon public props and accepts a display-safe SVG source supplied by
  generated UI
- AND SourceIcon preserves Astryx icon sizing, color, accessibility, and layout
  semantics without importing `@dpeek/formless-ui` icon components
- AND color fields use an Astryx ColorInput primitive whose public props follow
  Astryx input conventions while generated UI owns validation, draft value
  preservation, and commit policy
- AND when the color picker control can only represent valid opaque hex colors,
  invalid, alpha, missing, or unknown stored text values remain visible as
  field draft or display text rather than being coerced by Astryx

#### Scenario: Astryx generated-field vertical slice

- GIVEN the standalone Astryx package renders a generated-field migration slice
- WHEN the slice renders one coherent record workflow and one public operation
  form workflow
- THEN create form fields, record edit fields, table-cell fields, detail or
  read-only fields, and public-action form fields are composed from the same
  projected Astryx field data contract
- AND a package-local generated foundation fixture owns shared draft state,
  validation errors, pending state, baseline values, commit, revert, missing
  reference fallback, and submit readiness for the slice
- AND text, long text, boolean, enum, reference, number, markdown, source SVG
  icon, color, image-shaped, and media-shaped values are represented without
  importing Formless storage, browser replica, generated write hooks, operation
  executors, or media clients into Astryx
- AND field-commit interactions invoke commit and revert intents, immediate
  fields commit on change, and submit fields resolve through a submit-form
  adapter boundary
- AND invalid number draft text, missing reference ids, alpha or unknown color
  values, markdown source, source icon SVG, media asset ids, media preview hrefs,
  and display-safe field errors remain visible instead of being coerced by
  Astryx primitives

#### Scenario: Astryx public Site rendering vertical slice

- GIVEN the standalone Astryx package renders a public Site migration slice
- WHEN the slice renders a package-local projected `SitePageTree` fixture
- THEN the fixture includes Site settings with source SVG icon, header and
  footer frame roots, a page/root block tree, and ordered placement output
  rendered as nested public layout
- AND markdown content, image/media display, section, card grid, card, metric
  grid, metric, `contactForm`, `subscribeForm`, and `publicOperationForm`
  blocks are represented from projected block facts
- AND fixed public forms and generic public operation forms cover valid,
  warning or unavailable, submitting, success, and display-safe failure states
- AND generic public operation form controls cover projected text, long text,
  boolean, date, number, enum, email-formatted text, phone-formatted text, and
  suggested text input fields through Astryx-compatible field data
- AND desktop and mobile viewport checks verify the public header, footer,
  nested placement layout, media, generic blocks, and form states without
  depending on generated admin chrome
- AND the slice does not include the full Site editor, placement drag and drop,
  app admin chrome, generated field editors, browser replica sync, raw storage
  records, app target selectors, write hooks, operation executors, media
  clients, or real Turnstile execution

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

#### Scenario: Shared authoring session foundation

- GIVEN generated create forms, record update/edit surfaces, public operation
  forms, or generated Astryx projections author field-shaped values
- WHEN the user changes authored values
- THEN a generated authoring session owns typed draft values, visible field
  selection, field errors, submit or commit readiness, and optional baseline
  values for future save/cancel behavior
- AND generated controls and Astryx projections read from and write to that
  session as the source of truth instead of reading values back from browser
  form controls
- AND schema-owned or generated-ui-owned resolvers convert typed drafts into
  flat `RecordValues`, flat patch values, or declared operation input before
  operation submission
- AND `FormData`, browser field names, hidden submit inputs, and native form
  extraction are adapter-only concerns at submit boundaries
- AND shared draft resolution preserves boolean `false`, invalid number raw
  draft text, reference ids with missing-option fallback, text-backed markdown,
  icon, image, media, and color values, and display-safe field errors
- AND public operation forms use the same controlled field authoring and
  validation projection as generated admin forms for supported scalar operation
  input fields
- AND the foundation may carry baseline and revert facts needed by later
  save/cancel edit sessions without requiring this flow to expose a full
  cancelable edit mode

#### Scenario: Create form submission

- GIVEN a create form has hidden literal defaults and `visibleWhen` fields
- WHEN the user submits the form
- THEN generated UI resolves operation input from a foundation-owned create
  draft session rather than treating DOM `FormData` as the source of truth
- AND hidden literal defaults are submitted through the declared create
  operation
- AND hidden `visibleWhen` fields are not submitted
- AND active union variant fields follow draft discriminator values
- AND unresolved context defaults, invalid draft values, and required field
  errors prevent submit with display-safe field errors before the operation is
  invoked
- AND Authority validation remains the source of record validation for submitted
  create operation input

#### Scenario: Create draft value resolution

- GIVEN a generated create session contains visible draft values, hidden draft
  values, create defaults, and optional union presentation metadata
- WHEN generated UI prepares create operation input
- THEN the schema-owned create value resolver selects the active union fields
  from the draft discriminator, filters fields by `visibleWhen`, coerces visible
  drafts to flat record values, and then applies hidden create defaults
- AND hidden draft values remain available in the local session when fields are
  hidden and later revealed, but they are not included in operation input while
  hidden
- AND boolean, date, enum, text, reference, markdown, icon, image, media, color,
  and scalar text-backed editors resolve to flat field values through generated
  field behavior
- AND number editors preserve invalid raw draft text in the session and expose a
  field error instead of submitting `NaN` or coercing the invalid draft to an
  empty value
- AND a FormData-based submit path, when needed by a public or native form
  adapter, first converts HTML form values into the same typed draft shape and
  then uses the same schema-owned create value resolver

#### Scenario: Update draft patch resolution

- GIVEN an existing record edit session contains committed baseline values and
  typed draft values for writable generated fields
- WHEN a field commit, edit dialog submit, or generated Astryx record intent
  prepares an update
- THEN generated UI resolves the draft through a generated patch resolver before
  invoking the declared update operation
- AND the resolver selects visible fields from draft-aware `visibleWhen` and
  union discriminator state where a session is active
- AND the resolver omits hidden fields, unchanged values, record system fields,
  non-writable fields, and state-machine-owned fields from patch input
- AND hidden drafts may remain available in the local session when fields are
  hidden and later revealed, but they are not included in patch input while
  hidden
- AND invalid number drafts remain visible as raw text with a display-safe field
  error instead of submitting `NaN` or reverting the draft
- AND grouped generated adapters such as value-unit controls and media upload
  controls resolve to flat patch values while media upload, picker, and preview
  state remain generated or runtime adapter behavior outside schema storage
- AND Authority validation remains the source of record validation for submitted
  update operation input

#### Scenario: Non-writable fields stay out of authoring

- GIVEN a generated create form, edit form, inline table editor, or row edit
  dialog resolves field configs
- WHEN a field is a record system field or otherwise non-writable
- THEN generated UI does not render a user-editable control for that field
- AND generated UI does not include that field in operation input
- AND read-only metadata display remains available through display-only
  surfaces

#### Scenario: Local workspace auto-save after generated writes

- GIVEN generated UI runs in a local workspace profile with auto-save available
- WHEN a generated create, update, delete, command, ordering, media-backed
  patch, schema edit, or control-plane edit commits successfully
- THEN generated UI reports the committed write to the local workspace
  auto-save client hook
- AND generated UI does not write workspace files or read browser IndexedDB as
  workspace source

#### Scenario: Delete control availability

- GIVEN an entity delete policy is enabled
- WHEN records render in collection contexts, list rows, table rows, or tree child nodes
- THEN delete controls can render with destructive confirmation
- AND tree placement removal stays separate from child record deletion

### Requirement: Operation Presentation

The system SHALL render generated record and collection controls from available
entity operations and view operation bindings.

#### Scenario: Select available operations for surface scope

- GIVEN a generated collection, list, table, tree, record, or detail surface
  renders an entity
- WHEN the surface model is selected
- THEN generated UI asks for available operations for the entity and current
  scope
- AND collection-scoped operations can render in collection toolbars
- AND record-scoped operations can render in record menus, table row controls,
  list rows, tree nodes, or detail operation controls
- AND operations hidden from the browser actor are not rendered as controls

#### Scenario: Bind operation placement from view schema

- GIVEN a collection view declares operation bindings
- WHEN generated UI selects the collection model
- THEN each binding references a canonical operation key such as `task.create`
  or `task.clearCompletedTasks`
- AND the binding can provide placement and ordering hints without redefining
  the operation input, effect, policy, or audit behavior

#### Scenario: Project operation controls

- GIVEN a source schema or view declares operation bindings
- WHEN generated UI selects presentation models
- THEN generated controls are selected from source-declared operations and
  operation bindings
- AND generated controls invoke source-declared operations as the primary
  browser interaction model

#### Scenario: Operation is the control contract

- GIVEN generated UI renders create dialogs, edit dialogs, delete controls,
  table row controls, tree controls, ordering controls, state transition
  controls, public form controls, or instance management controls
- WHEN the user submits the control
- THEN generated UI invokes a source-declared operation or a runtime-declared
  workspace operation
- AND generated UI submits operation invocation requests through operation
  endpoints or runtime operation adapters
- AND operation response shape drives progress, success, failure, replay, local
  auto-save, and compact status presentation

#### Scenario: Project operation control bindings

- GIVEN generated UI selects operation controls for collection toolbars, record
  menus, form submits, table rows, tree nodes, state transitions, ordering
  controls, public forms, or workspace controls
- WHEN the foundation model prepares data for the view layer
- THEN it projects each renderable control as plain operation-shaped data with a
  stable binding id, shared execution key, canonical operation key, scope, kind,
  label, visual intent, availability state, optional disabled reason, optional
  destructive confirmation, and compact feedback labels
- AND hidden controls are omitted before they reach the view layer
- AND disabled, destructive, confirmation, ordering, menu placement, edit-dialog,
  public-safe field, and reference-target facts remain presentation facts derived
  from source operations, operation bindings, runtime operation definitions, or
  public operation projections
- AND the projected data does not expose app targets, schema parser internals,
  browser replica internals, write options, local auto-save hooks, operation
  handler internals, or auth policy internals

#### Scenario: Execute through operation controller

- GIVEN multiple generated controls are bound to the same operation execution key
- WHEN the user invokes one of those controls
- THEN generated UI submits a binding id and caller input to a foundation-owned
  operation controller
- AND the controller builds the operation invocation request, calls the
  Authority operation endpoint or runtime operation adapter, applies materialized
  changes to the browser replica, reports committed writes to local workspace
  auto-save where available, and returns a normalized committed, replayed, or
  failed result
- AND pending, success, replay, and failure state is shared across all controls
  that use the same execution key
- AND created record ids, affected counts, replay status, and display-safe error
  messages come from the normalized operation result rather than from view
  component-specific response parsing

#### Scenario: Operation progress is generic execution state

- GIVEN a generated operation may take long enough to need more than a spinner
- WHEN the foundation operation controller reports execution state
- THEN the state can include optional display-safe progress with a title, detail,
  updated timestamp, and ordered steps
- AND each progress step has a stable id, label, optional detail, and status of
  pending, running, succeeded, failed, or skipped
- AND compact generated UI can render the active progress step while the
  operation is pending
- AND richer progress views such as a popover or overlay use the same operation
  progress state rather than a workspace-specific panel contract
- AND progress state does not expose app targets, gateway proxy details,
  filesystem paths, provider secrets, raw logs, or internal tokens

#### Scenario: Astryx operation primitive boundary

- GIVEN generated UI renders operation controls with Astryx view primitives
- WHEN buttons, menu items, submit buttons, confirmation dialogs, progress
  indicators, compact status, or toast feedback render
- THEN Astryx consumes only projected operation control data, current execution
  state, and callback functions supplied by generated UI
- AND Astryx does not import or call `submitOperation`, app target selectors,
  schema parsing helpers, browser replica APIs, write option hooks, local
  auto-save hooks, operation handler helpers, or auth policy helpers
- AND foundation code does not render Astryx components or decide page, table,
  row, tree, dialog, menu, or toast layout

#### Scenario: Specialized controls use adapters

- GIVEN create dialogs, edit dialogs, delete confirmations, table row menus,
  state transition menus, ordering moves, tree child add or remove controls,
  public operation forms, or workspace controls need specialized input
- WHEN the user submits the specialized control
- THEN a foundation adapter builds the operation input from form values, record
  ids, transition facts, ordering move plans, tree parent and variant facts,
  public proof fields, or workspace operation fields
- AND the adapter invokes the same operation controller contract used by simple
  operation buttons and menu items
- AND adapters do not redefine operation input, output, effect, actor policy,
  idempotency policy, audit policy, or storage target semantics

#### Scenario: Public operation form authoring controls

- GIVEN generated Site authoring renders a `publicOperationForm` block editor
- WHEN the author configures the block
- THEN the editable controls cover the block label, body, target app route
  identity, canonical operation key, button label, success label, and optional
  operation input notification configuration
- AND generated UI does not ask the author to manually define submitted form
  fields that duplicate `operation.input.fields`
- AND generated UI surfaces unavailable target operations, missing Turnstile
  configuration, unsupported required input fields, and invalid target route
  facts as configuration feedback instead of rendering a working public form

#### Scenario: Public operation form runtime authoring

- GIVEN a public Site renders a working public operation form from
  `operation.input.fields`
- WHEN a visitor edits and submits the form
- THEN generated UI uses a client-side controlled generated operation draft
  session as the source of truth for submitted input values
- AND the public form reuses generated field projection, editor selection,
  display-safe validation, and Astryx-compatible field data for supported text,
  long text, boolean, date, number, and enum input fields
- AND generated validation owns required, type, enum, text format, and invalid
  number errors before submission while the public operation executor remains
  authoritative for server-side validation
- AND native browser validation does not decide whether the generated public
  form can submit
- AND the resolved public input stays keyed by declared operation input names
  until the operation execution boundary maps entity-backed inputs for
  materialization
- AND Turnstile proof values, source block ids, route facts, and idempotency
  keys remain public operation adapter facts outside field authoring state
- AND a native `FormData` path, when present, is only a submit adapter that
  converts browser form values into the same typed operation draft shape before
  resolution

#### Scenario: Ordering stays direct operation input

- GIVEN generated ordering controls prepare a sparse rank move for an ordered
  result
- WHEN the user moves a row, list item, or tree placement
- THEN generated UI may continue to send the declared ordering patch value
  directly through the operation controller
- AND ordering moves do not require a generated authoring session unless a
  future operation form explicitly exposes user-authored ordering input fields

#### Scenario: Table controls bind operations directly

- GIVEN a generated table renders row edit, destructive, command, or ordering
  controls
- WHEN the table model is selected
- THEN table controls are selected from table `operations` bindings referenced
  by `operationControl` columns and available record-scoped operations
- AND edit dialogs, disabled reasons, destructive presentation, ordering menus,
  and reference-target editing remain presentation facts on the operation
  binding

#### Scenario: State transitions read operation handler facts

- GIVEN a state-machine field exposes transition controls
- WHEN generated UI selects transition operation configs
- THEN the machine, transition, availability, input, and response handling come
  from operation-native transition handler facts
- AND operation handler helpers expose operation-native selection contracts
- AND generated UI selects transition controls from operation handler facts

### Requirement: Operations And Tree Composition

The system SHALL render schema operations through generated operation UI and
SHALL use relationship context and readiness facts to shape command inputs.

#### Scenario: Many-to-many selection operation

- GIVEN a selected join command operation uses an operation handler targeting a
  `manyToMany` relationship
- WHEN the user submits selected related records
- THEN explicit join records are created or removed
- AND generic field defaults fill other required through fields when join records are created

#### Scenario: Tree add and remove controls

- GIVEN a tree result declares allowed child variants and literal placement values
- WHEN the user opens the add child menu and submits a child
- THEN one child record and one placement edge are created
- AND leaf policy renders leaf children without descendants
- AND remove-placement controls tombstone placement edges without showing child delete controls on placement cards
- AND tree controls are selected from operation handler capability facts

### Requirement: State Machine Controls

The system SHALL render state-machine lifecycle facts from schema models and
shall invoke transition operations instead of directly patching machine-owned
status fields.

#### Scenario: Render state badges

- GIVEN a table, list, record, or detail surface includes an enum field owned by
  a state machine
- WHEN generated UI renders the field
- THEN the current state is displayed with the enum label and presentation
  metadata where available
- AND terminal states are visually distinguishable from active states

#### Scenario: Render valid transition controls

- GIVEN a generated surface renders a record with transition-state operation
  handlers
- WHEN the record's current state allows one or more transitions
- THEN generated UI renders controls for the valid transition operations
- AND invalid transition operations are hidden or disabled with schema-derived
  reasons
- AND submitting a transition invokes the matching operation through the normal
  Authority operation boundary

#### Scenario: Render table state transition menu

- GIVEN a generated table includes a visible enum field owned by a state machine
- AND the table entity has record-scoped transition-state operations targeting
  that machine
- WHEN generated UI renders the state-machine field cell for a row
- THEN the current state is rendered as one cell control using the enum label and
  presentation metadata
- AND opening the control shows only transition operations valid for the row's
  current state
- AND selecting a transition invokes the matching operation through the normal
  Authority operation boundary
- AND generated UI does not add a separate lifecycle transition utility column
  for transition operations paired with a visible state-machine field column
- AND generated UI may keep separate lifecycle transition controls when the
  matching state-machine field is hidden or absent from the table

#### Scenario: Protect machine-owned field editors

- GIVEN a generated create, edit, table, or detail surface includes a field owned
  by a state machine
- WHEN the surface renders existing records
- THEN generated UI treats the field as read-only outside transition controls
- AND create forms allow the initial state behavior declared by the schema

### Requirement: Schema-Driven Instance Management UI

The system SHALL render instance management in the instance shell from
schema-owned app install, route, deployment config, deployment observation
cache, provider evidence, view, screen, read model, and operation models.

#### Scenario: Instance management surface

- **GIVEN** the product instance shell renders instance management
- **WHEN** control-plane records are available
- **THEN** app installs, routes, and deployment configs come from the instance
  control-plane schema
- **AND** latest deployment status comes from deployment config observation
  cache fields and read-only deployment projection
- **AND** active local operation progress, evidence summaries, and sync
  summaries may come from local gateway operation state
- **AND** custom-domain desired route state and provider applied evidence remain
  visually separate

#### Scenario: Instance overview surface

- **GIVEN** an owner opens `/` on the product instance shell
- **WHEN** app install, route, workspace gateway, deployment config,
  deployment observation, desired-state projection, and provider evidence data
  are available
- **THEN** the overview is titled `Instance Settings`
- **AND** the overview renders app install management and route management as
  table-backed sections
- **AND** route management uses the default route collection title, table, and
  `Create Route` control without route-category query tabs
- **AND** the overview renders one local workspace control, `Push`, only when
  the local workspace gateway proxy is available
- **AND** push completion or failure is shown as compact display-safe status or
  alert feedback instead of a workspace status panel
- **AND** the overview does not render deployment setup, deployment status,
  desired-state summaries, deployment operation controls, deployment config
  management tables, routes grouped by deployment config, primary instance
  target summaries, deployment target selectors, deployment target links,
  standalone workspace sync panels, workspace status panels, auto-save panels,
  local onboarding panels, overview navigation, brand eyebrow text, or
  standalone provider evidence cleanup panels
- **AND** deployment and provider runtime reads are not required to render the
  overview

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
- **AND** install controls support Site, Tasks, and CRM package creation
  by default
- **AND** workspace-linked packages returned by the active package resolver are
  selectable only in that resolver scope

#### Scenario: Create install

- **GIVEN** owner or admin users create an app install
- **WHEN** the create flow is submitted
- **THEN** the editor provides package selection, route-safe install id input,
  label input, and validation feedback for duplicate or reserved install ids
- **AND** successful creation shows the generated admin and public Site route
  records for that install when those routes are supported

#### Scenario: Edit install metadata

- **GIVEN** owner or admin users edit an existing app install
- **WHEN** metadata fields render
- **THEN** label and supported display metadata are editable
- **AND** install identity, package app key, storage identity, and package
  source initialization facts render as read-only

### Requirement: Actor-Safe Workspace Sync Operations

Generated UI SHALL render only workspace sync operations exposed to browser
actor kinds.

#### Scenario: Browser-visible operations

- GIVEN an owner or admin views workspace sync controls
- WHEN generated UI renders operations
- THEN it renders only the workspace push operation on the instance management
  surface
- AND standalone deploy, deploy plan, deploy apply, drift report, and provider
  runner operations are hidden from the browser surface
- AND workspace check, pull, credential setup, and save operations remain hidden
  from the instance overview controls

#### Scenario: Read-only deployment observation

- GIVEN deployment config observation cache fields render
- WHEN generated UI displays deployment state
- THEN generated UI treats those fields as read-only runtime-observed cache
- AND generated UI does not require `deploy-attempt` or
  `deploy-evidence-summary` collection views

### Requirement: Routes Editor

The generated instance UI SHALL provide one editor experience for route records
that covers instance paths, host mappings, public Site routes, and redirects.

#### Scenario: Route list

- **GIVEN** owner or admin users inspect routes
- **WHEN** route records render
- **THEN** routes show match host, match path, match prefix, kind, target
  profile, app install target, surface, redirect target, and enabled state
- **AND** routes render as a single all-routes collection with the default
  `Create Route` control
- **AND** route management does not render route-category query tabs for
  enabled routes, mounts, host mappings, redirects, instance paths, app install
  routes, or public Site routes
- **AND** route lifecycle timestamps may render only as read-only record metadata
  in surfaces that explicitly include them
- **AND** browser route management does not expose deployment config grouping,
  deployment config table columns, or target-selection controls

#### Scenario: Edit mount route

- **GIVEN** owner or admin users edit an allowed mount route field
- **WHEN** the edit is submitted
- **THEN** the editor validates route-safe match shape, reserved path
  conflicts, package capability, target profile, surface, app install target,
  and enabled-route uniqueness
- **AND** route edits do not change the app install's storage identity or app
  data
- **AND** the browser editor omits deployment config selection so route writes
  use the primary deployment target by default

#### Scenario: Edit redirect route

- **GIVEN** owner or admin users edit a redirect route
- **WHEN** the edit is submitted
- **THEN** the editor validates match host, match path, redirect target, status
  code, preservePath policy, and preserveQueryString policy
- **AND** the redirect route does not require an app install target

#### Scenario: Evidence remains separate

- **GIVEN** provider evidence, cleanup history, deployment attempts, or provider
  observations exist for a route
- **WHEN** the route editor renders
- **THEN** desired route fields remain visually separate from provider evidence
  and cleanup state
- **AND** route edits do not imply provider changes
- **AND** deployment config observation cache fields may be displayed for status
  but are not editable route intent
- **AND** route lifecycle timestamps are system-owned metadata, not editable
  route intent

#### Scenario: Primary deployment target default

- **GIVEN** a browser owner or admin creates or edits a route that needs
  provider-managed DNS, custom-domain, or redirect resources
- **WHEN** the route write commits without a deployment config field
- **THEN** deployment projection uses the enabled primary instance deployment
  config
- **AND** browser UI does not expose multiple deployment targets, target ids,
  enabled target counts, or route-to-target assignment controls

### Requirement: No Standalone Deployment Surface

The product instance shell SHALL not expose deployment as a standalone browser
destination or public workflow.

#### Scenario: Deployment route is unavailable

- **WHEN** an owner opens `/deployments` or reviews instance-level navigation
  and overview entry points
- **THEN** React routing does not select a deployment surface
- **AND** instance-level navigation and overview entry points do not link to
  `/deployments`
- **AND** deployment setup, deployment status, desired-state summaries,
  deployment operation controls, deployment config management tables, routes
  grouped by deployment config, primary instance target summaries, and provider
  cleanup panels are not rendered as standalone browser surfaces

#### Scenario: Sync controls stay local to workspace operations

- **GIVEN** the product instance shell renders in a local workspace runtime with
  gateway proxy status available
- **WHEN** workspace sync operations are available
- **THEN** only the `Push` control may render through the workspace operation
  controls
- **AND** app install management, route management, owner auth, and app-local
  navigation remain outside those controls
- **AND** deployment config records may exist as schema-owned intent, but the UI
  does not expose target selectors, enabled target counts, routes-by-target
  groupings, or raw generated `deployment-config` management tables

#### Scenario: Push progress may include internal deployment step

- **WHEN** a browser workspace operation displays push progress
- **THEN** progress is presented as one push operation with display-safe sync
  planning, optional runtime deploy/provider reconciliation, health check, owner
  setup when needed, remote data restore, and observation refresh steps
- **AND** any deploy wording is scoped to an internal push step rather than a
  standalone command, route, operation, or destination
- **AND** push progress maps into the same generic operation progress state used
  by other generated operations
- **AND** check operations can display fresh operation results without persisting
  observation fields

### Requirement: Browser Workspace Operation Controls

Generated instance management UI SHALL expose local workspace push when a
workspace gateway proxy is available through the local runtime.

#### Scenario: Local workspace controls

- **WHEN** the product instance shell renders in a local workspace runtime with
  gateway proxy status available
- **THEN** the UI can start workspace push through the same-origin gateway API
  family
- **AND** the UI does not expose workspace check, pull, credential setup, or
  save controls on the instance overview
- **AND** the browser UI does not expose a user-triggered workspace save control
  because browser writes enqueue workspace auto-save
- **AND** CLI save remains available outside the browser as an explicit flush or
  retry fallback
- **AND** the available controls are selected from workspace operation
  definitions that expose browser gateway bindings for the current actor and
  runtime capability
- **AND** the UI does not expose arbitrary filesystem path inputs or raw file
  read/write controls
- **AND** the UI does not receive or render the sidecar loopback URL or internal
  proxy token

#### Scenario: Workspace operation form facts

- **WHEN** a browser workspace control needs caller input
- **THEN** labels, defaults, required fields, option sets, and hidden
  non-browser fields come from the workspace operation definition
- **AND** the UI posts only the definition-declared gateway input fields
- **AND** workspace gateway operation state is mapped to generic generated
  operation progress before it reaches generated view primitives

#### Scenario: Operation status display

- **WHEN** a workspace operation is running or completed
- **THEN** the UI can display compact pending, completion, replay, and failure
  feedback from display-safe operation state returned through the local runtime
  gateway proxy
- **AND** pending feedback describes the active push progress step when one is
  available instead of showing only an indefinite spinner
- **AND** failure feedback uses a concise display-safe error message
- **AND** the instance overview does not require a separate workspace progress
  panel to render push progress or failure state
- **AND** provider credentials, local secret values, raw provider state, and
  disallowed filesystem paths are not rendered

#### Scenario: External authorization prompt

- **WHEN** a workspace credential setup operation reports a display-safe
  external authorization URL through the local runtime gateway proxy
- **THEN** the UI can render a control to open that URL and continue polling the
  operation
- **AND** raw adapter or tool output, provider tokens, refresh tokens, Alchemy
  passwords, and local secret values are not rendered

#### Scenario: Gateway proxy unavailable

- **WHEN** the product instance shell renders without local gateway proxy status
  available
- **THEN** the UI treats workspace gateway operations as unavailable
- **AND** it does not offer controls that would imply workspace filesystem,
  credential setup, push dry-run, or push apply execution is available

### Requirement: Local Workspace Onboarding UI

Generated instance management UI SHALL support onboarding a CLI-bootstrapped
local workspace from the browser.

#### Scenario: Empty workspace onboarding

- **WHEN** the browser opens a fresh local workspace runtime after CLI-owned
  workspace bootstrap
- **THEN** the UI can create package app installs through Authority-backed app
  install operations
- **AND** the UI does not invoke workspace initialization through the gateway

#### Scenario: Save after browser edits

- **WHEN** a browser owner or admin edits app install, route, domain, or deploy
  intent records
- **THEN** the UI enqueues workspace auto-save through the gateway after the
  Authority-backed write commits
- **AND** the saved workspace source is generated from Authority-backed records,
  not from manifest app, route, domain, or deploy fields
- **AND** the UI does not expose a separate user-triggered save control for the
  same committed browser edit

### Requirement: Onboarding Form Reuse

Generated instance management UI SHALL reuse generated field and validation
behavior for onboarding steps that write schema records.

#### Scenario: Onboarding record form

- **WHEN** a browser onboarding step creates or edits app install, route,
  or deployment config records
- **THEN** field rendering reuses generated create/edit field controls, field
  editor selection, defaults, `visibleWhen`, and union variant behavior where
  the step is backed by schema view facts
- **AND** submit behavior writes through Authority-backed operations so
  Authority validation remains the source of record validation
- **AND** onboarding-specific React code does not duplicate schema field
  validation rules

#### Scenario: Gateway operation step

- **WHEN** an onboarding step starts workspace push
- **THEN** the step invokes the workspace gateway operation model and renders
  display-safe completion or failure feedback
- **AND** push apply completion may refresh displayed deployment config
  observation cache fields after the authorized cache patch commits
- **AND** schema field controls are used only for schema-record inputs, not for
  arbitrary filesystem paths, credentials, raw provider state, or shell output
- **AND** local dev browser onboarding does not present a workspace
  initialization control because fresh workspace bootstrap is completed by the
  CLI before the runtime starts

#### Scenario: Future schema-defined setup flows

- **WHEN** app-specific setup flows such as a newly installed Site app template
  flow are considered in a later change
- **THEN** the existing onboarding UI structure keeps step orchestration
  separate from generated field rendering and operation submission
- **AND** this change does not add a schema-declared onboarding or setup-flow
  language
