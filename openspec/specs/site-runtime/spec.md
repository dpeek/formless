# Site Runtime Specification

## Purpose

Site runtime turns flat Site app records into authorable admin surfaces, nested public trees, and public documents for preview, installed, and published Site profiles.

## Requirements

### Requirement: Site Records

The system SHALL model Site content as flat records and use Site scope from the schema key or app install id instead of storing a Site reference on content records.

#### Scenario: Settings singleton exists

- GIVEN active Site settings exist for the current Site scope
- WHEN the runtime reads the public Site tree
- THEN the response includes the Site settings
- AND the settings provide editable Site label, description, and SVG icon values

#### Scenario: Content records stay flat

- GIVEN page, post, project, block, and placement records exist
- WHEN those records are stored
- THEN they do not store a Site reference
- AND the current schema key or app install id supplies the Site scope

### Requirement: Public Tree Projection

The system SHALL project live Site block and block placement records into a nested public tree ordered by placement order and grouped by placement slot.

#### Scenario: Page tree renders children

- GIVEN a live page block has child placements
- WHEN the public tree is requested for the page route
- THEN the response contains the page root and its child block nodes
- AND default-slot child placements appear in placement order

#### Scenario: Invalid structure warns

- GIVEN tree projection encounters missing children, cycles, duplicate roots, or maximum-depth cuts
- WHEN the public tree is built
- THEN the response includes metadata warnings
- AND page rendering is not blocked only because warnings exist

#### Scenario: Dynamic list blocks

- GIVEN `postList` or `projectList` blocks exist in a public tree
- WHEN the tree is projected
- THEN live dated post or project items are attached under query output
- AND items are ordered by descending date

### Requirement: Site App Runtime Adapter

The system SHALL select Site-specific public runtime behavior through a
package-owned runtime adapter for the resolved Site app package.

#### Scenario: Adapter owns public tree behavior

- GIVEN an installed app uses a package app key whose resolved package declares
  public Site runtime support
- WHEN the runtime receives a public tree read for that install
- THEN the runtime dispatches to that package's registered public Site adapter
- AND the adapter builds the public tree from flat app records and placement
  edges in the selected app storage identity
- AND the core Authority route does not branch on a hard-coded package app key
  to call Site tree projection behavior
- AND a package app key other than `site` can use public Site tree behavior when
  its resolved package declares public Site support and a matching adapter is
  registered

#### Scenario: Adapter owns public document behavior

- GIVEN a preview route, installed public route, mapped host, or published Site
  profile targets a Site-capable installed app
- WHEN the runtime handles a public document, metadata, indexing, or root icon
  request for that target
- THEN Worker dispatch selects the public Site adapter for the target package
  app key
- AND the adapter supplies document rendering, metadata, sitemap, robots, SVG
  icon, PNG icon, and ICO icon behavior
- AND request routing, route access, app storage identity, and core media
  delivery remain owned by Formless core runtime boundaries
- AND mapped public Site hosts select the adapter from the resolved route target
  package app key rather than assuming package app key `site`

#### Scenario: Adapter absence is unsupported

- GIVEN a package manifest declares public Site runtime support but the current
  runtime environment has no registered public Site adapter for that package
  app key
- WHEN a route, public tree read, document render, indexing resource, root icon,
  or generated public surface requires that adapter
- THEN the runtime rejects the request as an unsupported package capability
- AND it does not fall back to the built-in Site implementation by package name

#### Scenario: Source Site fallback is limited to source preview

- GIVEN the dev workbench exposes the bundled source Site app through schema-key
  routes such as `/site` and `/api/site`
- WHEN preview public Site rendering has no install-scoped target
- THEN the runtime may read the schema-key Site storage identity for source
  preview only
- AND installed, mapped-host, and published Site rendering do not silently fall
  back to `/api/site` when their install-scoped target or adapter is missing

### Requirement: Workspace Site Renderer Extension

The system SHALL allow trusted workspace deploy code to replace the bundled
Site public page renderer without changing Site records, public tree
projection, routes, media delivery, or public action storage contracts.

#### Scenario: Renderer input stays projection based

- GIVEN a workspace declares a `site.publicRenderer` extension
- WHEN preview, installed, mapped-host, or published Site rendering needs a
  public page body
- THEN the extension renderer receives a stable Site public projection such as
  `SitePageTree`
- AND the renderer receives route rendering facts such as link mode and route
  base needed to produce public links
- AND the renderer does not receive raw Authority storage internals, browser
  replica internals, private Turnstile secrets, provider credentials, or app
  install records as renderer input

#### Scenario: Renderer output stays page scoped

- GIVEN a workspace renderer is active
- WHEN Worker SSR renders a successful public Site document
- THEN the workspace renderer returns a React page element or component output
  for the public page body
- AND Formless remains responsible for the HTTP `Response`, document shell,
  cache headers, runtime metadata hints, initial tree hydration script, client
  asset injection, default metadata, not-found documents, and error documents
- AND the first renderer extension contract does not allow workspace code to
  return a complete HTML document or `Response`

#### Scenario: Browser and Worker entrypoints are explicit

- GIVEN a workspace configures `site.publicRenderer`
- WHEN the runtime builds browser preview assets and the deployed Worker bundle
- THEN the config supplies explicit browser and Worker renderer entrypoints
- AND both entrypoints may re-export the same shared renderer component
- AND each entrypoint exports the renderer component as a default export or
  named `SitePublicRenderer` export
- AND the browser entrypoint is treated as public client asset code
- AND the Worker entrypoint is treated as trusted owner-authored deploy code
- AND server-only imports, Worker bindings, runtime secrets, and provider
  credentials do not enter the browser renderer bundle

#### Scenario: Default renderer fallback

- GIVEN no workspace `site.publicRenderer` extension is configured
- WHEN Site preview, installed, mapped-host, or published rendering runs
- THEN the bundled Site renderer remains the default renderer
- AND the default renderer continues to consume the same public Site projection
  contract used by workspace renderers

### Requirement: Subscribe Form Public Tree Projection

The system SHALL project subscribe form blocks into public Site trees without exposing private challenge or runtime secrets.

#### Scenario: Project subscribe form operation facts

- GIVEN the public Site tree includes a `subscribeForm` block
- WHEN the block references a publicly executable operation
- THEN the projected block includes the operation key and target public operation route
- AND the referenced operation is a public-eligible create, record-plan, or
  subscribe operation handler
- AND the projected block does not include Turnstile secrets or subscriber data

#### Scenario: Warn for missing public operation

- GIVEN a `subscribeForm` block references an operation that is missing or not publicly executable
- WHEN the public tree is projected
- THEN the public tree includes a warning
- AND public rendering does not expose a working form for that block

### Requirement: Contact Form Public Tree Projection

The system SHALL project contact form blocks into public Site trees without
exposing private challenge, email provider, or runtime secrets.

#### Scenario: Project contact form operation facts

- GIVEN the public Site tree includes a `contactForm` block
- WHEN the block references a publicly executable contact message operation
- THEN the projected block includes the operation key and target public
  operation route
- AND the referenced operation is a public-eligible create, record-plan, or
  operation handler command that stores flat contact message data
- AND the projected block does not include Turnstile secrets, email provider
  credentials, sender verification facts, or private notification recipients

#### Scenario: Warn for missing contact operation

- GIVEN a `contactForm` block references an operation that is missing or not
  publicly executable
- WHEN the public tree is projected
- THEN the public tree includes a warning
- AND public rendering does not expose a working form for that block

### Requirement: Public Operation Form Public Tree Projection

The system SHALL project generic public operation form blocks into public Site
trees without exposing private challenge, app storage, email provider, or
runtime secrets.

#### Scenario: Project public operation form facts

- GIVEN the public Site tree includes a `publicOperationForm` block
- WHEN the block references one publicly executable anonymous operation on a
  target app storage identity
- THEN the projected block includes the canonical operation key, target public
  operation route, challenge facts required for browser rendering, and
  public-safe operation input field metadata
- AND the target may be a schema-key app route or an installed app route
- AND projected field metadata is derived from `operation.input.fields` and
  includes only field names, labels, required flags, supported scalar control
  types, and enum option labels
- AND the projected block does not include Turnstile secrets, raw Authority
  storage records, app install records, private app records, email provider
  credentials, sender verification facts, or private notification recipients

#### Scenario: Warn for unavailable public operation form

- GIVEN a `publicOperationForm` block references an operation that is missing,
  not publicly executable, targets an unavailable app storage identity, lacks
  challenge configuration, or has required input outside the generic form field
  subset
- WHEN the public tree is projected
- THEN the public tree includes a warning
- AND public rendering does not expose a working form for that block

### Requirement: Site Authoring

The system SHALL expose Site authoring through generated admin screens that edit Site settings and tree-structured block composition without exposing raw implementation-only fields as primary controls.

#### Scenario: Settings edit hides key

- GIVEN an author opens Site settings
- WHEN the generated settings form renders
- THEN label, description, and icon are editable
- AND key is hidden
- AND create and delete controls for Site settings are unavailable

#### Scenario: Tree child creation

- GIVEN an author selects a Site tree root
- WHEN they add an allowed child variant
- THEN the runtime creates a child block and a block placement
- AND the available child variants follow the parent block type and slot policy

#### Scenario: Root selection groups

- GIVEN the Site editor renders the primary composition workspace
- WHEN root context navigation is shown
- THEN roots are grouped for Pages, Posts, Projects, Header, and Footer
- AND raw Blocks and Placements remain non-primary admin or setup views

### Requirement: Subscribe Form Block

The system SHALL support a Site `subscribeForm` block that binds public page content to a schema-declared public subscribe operation.

#### Scenario: Author subscribe form block

- GIVEN a Site author creates a `subscribeForm` block
- WHEN the block is stored
- THEN the block stores normal flat block fields for label, body, operation name, and button label
- AND the block can be placed under public page and group composition branches

#### Scenario: Subscribe form variant is parsed

- GIVEN the Site source schema declares the `subscribeForm` block type
- WHEN the schema is parsed
- THEN `subscribeForm` is a valid block type and union variant
- AND its stored operation reference resolves through source-declared operation
  keys and operation handler capability facts
- AND generated Site authoring exposes the fields needed to configure the form

### Requirement: Contact Form Block

The system SHALL support a Site `contactForm` block that binds public page
content to a schema-declared public contact message operation.

#### Scenario: Author contact form block

- GIVEN a Site author creates a `contactForm` block
- WHEN the block is stored
- THEN the block stores normal flat block fields for label, body, operation
  name, button label, success label, and field labels
- AND the block can be placed under public page and group composition branches

#### Scenario: Contact form variant is parsed

- GIVEN the Site source schema declares the `contactForm` block type
- WHEN the schema is parsed
- THEN `contactForm` is a valid block type and union variant
- AND its stored operation reference resolves through source-declared operation
  keys and operation handler capability facts
- AND generated Site authoring exposes the fields needed to configure the form

### Requirement: Public Operation Form Block

The system SHALL support a Site `publicOperationForm` block that binds public
page content to a schema-declared anonymous public operation without
special-casing the submitted input fields in Site records.

#### Scenario: Author public operation form block

- GIVEN a Site author creates a `publicOperationForm` block
- WHEN the block is stored
- THEN the block stores normal flat block fields for label, body, canonical
  operation key, target app route identity, button label, success label, and
  optional operation input notification configuration
- AND the block does not store per-customer form field definitions that
  duplicate the target operation input contract
- AND the block can be placed under public page and group composition branches

#### Scenario: Public operation form variant is parsed

- GIVEN the Site source schema declares the `publicOperationForm` block type
- WHEN the schema is parsed
- THEN `publicOperationForm` is a valid block type and union variant
- AND its stored operation reference resolves through source-declared operation
  keys, target app route facts, operation policy, and operation input contracts
- AND generated Site authoring exposes the fields needed to configure the form

### Requirement: Generic Site Content Blocks

The system SHALL support generic Site content block variants for visually structured page sections, card grids, and metric grids without storing nested content.

#### Scenario: Author generic content blocks

- GIVEN the Site source schema declares block variants for `section`, `cardGrid`, `card`, `metricGrid`, and `metric`
- WHEN generated Site authoring parses the schema
- THEN each variant is a valid Site block type
- AND authors can edit the label and markdown body fields for content-bearing variants
- AND card blocks can edit icon and color fields
- AND metric blocks can edit color fields

#### Scenario: Compose generic content blocks

- GIVEN an author edits a public page or group in the Site composition workspace
- WHEN the author adds generic content blocks
- THEN page, group, and section parents allow section, card grid, metric grid, and existing public content children
- AND card grid parents allow card children
- AND metric grid parents allow metric children
- AND stored content remains flat block and block placement records

#### Scenario: Render generic content blocks

- GIVEN a public Site page contains section, card grid, card, metric grid, and metric blocks
- WHEN the default public Site renderer renders the page
- THEN sections render their heading, markdown intro, and ordered children as a visually separated page region
- AND card grids render card children in a responsive grid
- AND metric grids render metric children in a compact responsive proof-point layout
- AND the renderer uses the public tree projection rather than nested stored data

### Requirement: Public Routes

The system SHALL resolve public Site routes from live routable block hrefs and render public documents outside generated admin chrome.

#### Scenario: Home route

- GIVEN a live home page block exists
- WHEN a visitor opens `/`
- THEN the runtime resolves the home route
- AND renders the page using the public Site renderer

#### Scenario: Blog detail route

- GIVEN a live dated post block has a routable href
- WHEN a visitor opens its `/blog/*` route
- THEN the runtime renders the post detail document
- AND the `/blog` page remains the post index page

#### Scenario: Project route shape

- GIVEN live project blocks are curated through the Projects page
- WHEN public routes are resolved
- THEN `/projects` is a normal page route
- AND no project detail route is generated

### Requirement: Subscribe Form Rendering

The system SHALL render subscribe form blocks as public forms on preview, installed, and mapped public Site routes.

#### Scenario: Render Turnstile-protected subscribe form

- GIVEN a public Site page renders a valid `subscribeForm` block whose operation requires Turnstile
- WHEN the public renderer renders the block
- THEN the page renders an email input, submit control, and Turnstile widget using the public site key
- AND form submission posts to the target public operation route with the email input, source block id, idempotency key, and Turnstile token

#### Scenario: Render successful subscribe outcome

- GIVEN a public subscribe form submission succeeds
- WHEN the public page handles the outcome
- THEN the page shows the configured success state
- AND the visitor is not shown admin-only subscriber records

### Requirement: Contact Form Rendering

The system SHALL render contact form blocks as public forms on preview,
installed, and mapped public Site routes.

#### Scenario: Render Turnstile-protected contact form

- GIVEN a public Site page renders a valid `contactForm` block whose operation
  requires Turnstile
- WHEN the public renderer renders the block
- THEN the page renders name, email, and message inputs, a submit control, and
  Turnstile widget using the public site key
- AND form submission posts to the target public operation route with the
  declared contact message input, source block id, idempotency key, and
  Turnstile token

#### Scenario: Render successful contact outcome

- GIVEN a public contact form submission succeeds
- WHEN the public page handles the outcome
- THEN the page shows the configured success state
- AND the visitor is not shown provider delivery state, notification recipient
  configuration, or admin-only contact message records

### Requirement: Public Operation Form Rendering

The system SHALL render public operation form blocks as schema-driven public
forms on preview, installed, and mapped public Site routes.

#### Scenario: Render Turnstile-protected public operation form

- GIVEN a public Site page renders a valid `publicOperationForm` block whose
  operation requires Turnstile
- WHEN the public renderer renders the block
- THEN the page renders one control for each projected public operation input
  field, a submit control, and a Turnstile widget using the public site key
- AND text, long text, enum, boolean, date, and number projected fields render
  with matching browser controls
- AND form submission posts to the target public operation route with the
  declared operation input values, source block id, idempotency key, and
  Turnstile token
- AND browser coercion preserves booleans as booleans, numbers as finite
  numbers, dates as `YYYY-MM-DD` strings, and enum values as declared strings

#### Scenario: Render successful public operation form outcome

- GIVEN a public operation form submission succeeds
- WHEN the public page handles the outcome
- THEN the page shows the configured success state
- AND the visitor is not shown operation-created records, provider delivery
  state, notification recipient configuration, or admin-only app records

### Requirement: Public Site Client Runtime

The system SHALL keep published, mapped, and installed public Site browser
assets scoped to public Site interactivity rather than the generated admin app
shell.

#### Scenario: Published documents inject public Site assets

- GIVEN a published Site document needs browser code for a workspace public
  renderer, read-only markdown rendering, public form submission, Turnstile, or
  public tree hydration
- WHEN Worker SSR injects browser assets into the document shell
- THEN the injected assets come from a public Site browser entrypoint or manifest
- AND the injected assets do not require the generated admin app shell entrypoint
  to boot on the public page
- AND public Site documents that do not need browser interactivity may omit
  public Site script assets

#### Scenario: Public Site assets exclude admin-only code

- GIVEN a visitor opens a published Site page, mapped public Site host, or
  installed public Site route
- WHEN the public Site browser assets load
- THEN generated admin screens, instance management shell, owner setup and login
  routes, workspace gateway controls, app replica sync for generated admin, and
  generated field editors are not part of the required public Site entrypoint
- AND public forms continue to post through public operation routes with
  projected operation facts, source block id, idempotency key, and Turnstile
  token
- AND read-only markdown rendering remains available without loading rich
  markdown editor modules

### Requirement: Links And Frames

The system SHALL render header, footer, and links from Site records, resolving internal targets from block references and external targets from absolute URLs.

#### Scenario: Frame roots render

- GIVEN live header and footer roots exist
- WHEN a public page renders
- THEN header and footer content comes from their nested Site block trees
- AND missing frame roots warn without blocking the page document

#### Scenario: Link target resolution

- GIVEN a link block uses an internal target block reference
- WHEN the public tree resolves links
- THEN the link href is derived from the target block route
- AND broken explicit targets produce public tree warnings

#### Scenario: Header and footer rendering

- GIVEN live header and footer frame roots have child placements
- WHEN a public page renders
- THEN header and footer output comes from the nested frame trees
- AND public header active state is route-aware

### Requirement: Media And Icons

The system SHALL render Site images from core media assets when available, fall back to authored href values, and derive public Site icons from the Site SVG icon.

#### Scenario: Core media image

- GIVEN an image block references a valid core media asset id
- WHEN the public Site tree and renderer process the image
- THEN the image href uses core media delivery
- AND manual href values are only fallback input

#### Scenario: Root icon routes

- GIVEN Site settings contain an SVG icon
- WHEN a visitor requests `/favicon.svg`, `/favicon.ico`, or `/apple-touch-icon.png`
- THEN the response is derived from the Site icon
- AND generated PNG and ICO bytes are artifacts rather than stored record fields

#### Scenario: Safe SVG icon rendering

- GIVEN a stored SVG icon is missing, invalid, or unsafe
- WHEN Site or generated UI renders the SVG icon
- THEN rendering falls back to an empty outline
- AND scripts, event handlers, `javascript:` URLs, `foreignObject`, and external
  asset references are rejected

### Requirement: Site Media Package Boundary

The system SHALL render Site images through Media package public contracts while
keeping Site usage metadata in Site records.

#### Scenario: Site resolves core media through Media helpers

- GIVEN a Site image block references a core media asset id
- WHEN Site runtime resolves public image delivery
- THEN Site runtime resolves delivery facts through Media package public helpers
  or adapters
- AND public rendering continues to prefer core media delivery before manual
  href fallback

#### Scenario: Site usage metadata stays outside Media

- GIVEN Site authoring or public rendering uses alt text, caption, crop, slot,
  focal point, poster override, width, height, or fallback href
- WHEN Site records are stored or rendered
- THEN those facts remain Site-owned flat record values

### Requirement: Metadata And Indexing

The system SHALL generate public document metadata, robots output, and sitemap output from live public Site records.

#### Scenario: Public metadata

- GIVEN a public page renders successfully
- WHEN the document is produced
- THEN it includes title, description, canonical URL, OpenGraph metadata, and Twitter card metadata
- AND metadata prefers Site settings before page-derived fallbacks

#### Scenario: Sitemap output

- GIVEN live routable page and dated post blocks exist
- WHEN `/sitemap.xml` is requested
- THEN sitemap entries come from those routable blocks
- AND settings records, preview routes, generated app routes, tombstones, and non-routable blocks are excluded

### Requirement: Published And Installed Sites

The system SHALL support schema-key preview routes, installed Site routes, mapped public Site hosts, and published Site profile redirects with consistent public rendering.

#### Scenario: Public Site capability remains the route contract

- GIVEN a package app declares public Site route support in its package manifest
- WHEN the core runtime creates or resolves public routes for that package
- THEN the route contract remains the public Site contract
- AND the package adapter supplies Site-compatible tree, document, metadata,
  indexing, and icon behavior
- AND core runtime does not introduce a separate generic public-renderer
  contract until another shipped capability requires different public rendering
  semantics

#### Scenario: Installed Site fallback route

- GIVEN an installed Site app has install id `site`
- WHEN a visitor opens `/sites/site/*` on the instance host
- THEN public rendering reads the install-scoped tree
- AND public links keep the `/sites/site` route base

#### Scenario: Mapped public Site host

- GIVEN an enabled exact-host mapping uses profile `publicSite` and targets an installed Site
- WHEN a visitor opens the mapped host
- THEN top-level public routes render from the target installed Site
- AND generated admin and app shell routes are blocked on that host

#### Scenario: Published SSR response policy

- GIVEN a published Site document, redirect, indexing resource, icon, or media
  resource receives a `HEAD` request
- WHEN the matching `GET` request would have returned status and headers
- THEN `HEAD` returns matching status and headers without a body
- AND successful published SSR HTML can be cached while SSR errors use
  `Cache-Control: no-store`
