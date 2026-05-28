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
