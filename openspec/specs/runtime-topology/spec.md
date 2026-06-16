# Runtime Topology Specification

## Purpose

Runtime topology defines the observable profile, route policy, route access,
mapped host, and request routing contracts for a Formless instance. It keeps
product instance, dev workbench, app, Site authoring, and published Site
behavior coherent across browser shells, APIs, static assets, SSR documents,
indexing, icons, and public Site compatibility routes.

## Requirements

### Requirement: Profile Resolution

The system SHALL resolve each runtime request to one runtime profile kind: `instance`, `dev`, `app`, `siteAuthoring`, or `publishedSite`.

#### Scenario: Explicit profile wins

- GIVEN a request host that would otherwise infer `publishedSite`
- WHEN an explicit runtime profile of `instance` is configured
- THEN the request uses the `instance` profile
- AND route policy is selected from the `instance` profile

#### Scenario: Host convention infers profile

- GIVEN no explicit runtime profile is configured
- WHEN the hostname starts with `app.`, `instance.`, `site-authoring.`, or `published-site.`
- THEN the request resolves to the matching `app`, `instance`, `siteAuthoring`, or `publishedSite` profile
- AND a `*.workers.dev` host resolves to `publishedSite`

### Requirement: Profile Route Policy

The system MUST apply profile route policy before selecting browser shell, API, static asset, or SSR handling. Installed app API routes are always enabled; schema-key API routes are unavailable only in the product instance profile.

#### Scenario: Product instance route policy

- GIVEN the runtime profile is `instance`
- WHEN a request targets schema-key browser or schema-key API routes
- THEN those schema-key routes are not available
- AND installed app API routes, installed app browser routes, installed Site public routes, owner session browser routes, and instance browser routes remain available

#### Scenario: Dev route policy

- GIVEN the runtime profile is `dev`
- WHEN a request targets bundled source app, installed app, installed Site, instance, owner session, or schema-key API routes
- THEN those route families remain available
- AND the dev workbench can compose source app and product instance surfaces together

### Requirement: Browser Route Mounts

The system SHALL mount browser surfaces according to the active runtime profile.

#### Scenario: Product instance browser routes

- GIVEN the runtime profile is `instance`
- WHEN a browser navigates to `/`, `/deployments`, `/setup`, `/login`,
  `/apps/<installId>`, `/sites/<installId>`, or `/sites/<installId>/*`
- THEN the request is eligible for the client shell
- AND source schema routes such as `/tasks`, `/crm/audiences`, `/site/schema`, and `/pages/home` are not eligible instance browser routes

#### Scenario: Product instance deployment route

- GIVEN the runtime profile is `instance`
- WHEN a browser navigates to `/deployments`
- THEN the client shell is eligible to render the instance deployment surface
- AND the route is treated as an owner-only instance browser surface unless a
  narrower route access policy explicitly allows anonymous access
- AND installed app routing, public Site routing, owner setup, and owner login
  routes remain separate route families

#### Scenario: Product instance owner auth routes

- GIVEN a browser is on the canonical instance origin
- WHEN it navigates to `/setup` or `/login`
- THEN the client shell is eligible to render the owner setup or owner login
  route
- AND passkey ceremony API calls use the canonical instance auth origin

#### Scenario: App profile mounts one app

- GIVEN the runtime profile is `app`
- WHEN a browser navigates to `/` or `/schema`
- THEN the selected installed app is mounted as the app surface

#### Scenario: Site authoring profile mounts preview and admin

- GIVEN the runtime profile is `siteAuthoring`
- WHEN a browser navigates to `/` or `/admin`
- THEN the public Site preview and generated Site admin are mounted in the same profile

### Requirement: Route Access Policy

The system SHALL evaluate route access after runtime profile route eligibility
and enabled route-record resolution, and before serving owner-only browser
surfaces or owner-only management API data.

#### Scenario: Anonymous owner browser route

- GIVEN a runtime browser route has effective access `owner`
- AND the request is a `GET` or `HEAD` request that accepts HTML
- WHEN the request does not include a valid owner session
- THEN the runtime redirects to the owner login route with a safe same-origin
  return target for the original path and query
- AND the owner-only browser shell, instance dashboard, generated app surface,
  or schema editor is not served

#### Scenario: Authenticated owner browser route

- GIVEN a runtime browser route has effective access `owner`
- WHEN the request includes a valid owner session
- THEN the route remains eligible for the matching instance dashboard,
  generated app surface, or schema editor

#### Scenario: Anonymous route remains public

- GIVEN a runtime browser route has effective access `anonymous`
- WHEN the request is otherwise eligible for the active runtime profile
- THEN the route can be served without an owner session
- AND owner setup, owner login, installed Site public routes, published Site
  documents, public Site resources, static assets, and public actions remain
  available according to their existing route policies

#### Scenario: Owner management API route

- GIVEN a management API route exposes owner-only instance dashboard or
  generated app administration data
- WHEN the request does not include a valid owner session or valid admin bearer
  authorization
- THEN the runtime returns an unauthorized JSON response
- AND public Site document reads, public Site indexing resources, public
  actions, and public route discovery needed for anonymous Site rendering are
  not made owner-only by that management API guard

### Requirement: Published Site Documents

The system MUST route public Site documents through published Site behavior only when the request is a read request that accepts HTML and the published Site profile owns the path.

#### Scenario: Public document SSR

- GIVEN the runtime profile is `publishedSite`
- WHEN a `GET` or `HEAD` request for `/`, `/blog/post`, or another public Site document path accepts HTML
- THEN the request is handled as a published Site document
- AND the response uses public Site SSR instead of the client shell

#### Scenario: Published document adapter selection

- GIVEN the runtime profile or a route record selects an installed app whose
  resolved package declares public Site runtime support
- WHEN a public Site document request is eligible for SSR
- THEN route topology selects the target app install and package app key before
  document rendering
- AND Worker document rendering is dispatched through the registered public Site
  adapter for that package app key
- AND no published document path is rendered by hard-coding the bundled `site`
  package implementation when the selected package has no adapter

#### Scenario: Non-document paths stay out of SSR

- GIVEN the runtime profile is `publishedSite`
- WHEN a request targets `/api/*`, `/tasks`, `/crm/audiences`, `/site/schema`, `/schema`, `/apps/<installId>`, `/sites/<installId>`, static asset-like paths, dynamic root icon paths, or a non-HTML request
- THEN the request is not handled as a published Site document

### Requirement: Static Assets And Dynamic Public Resources

The system SHALL distinguish static asset fallback from dynamic public Site resources.

#### Scenario: Static asset fallback

- GIVEN a browser-shell route or asset-like path is allowed by profile route policy
- WHEN the request is a `GET` or `HEAD` request
- THEN the request may fall back to static asset serving
- AND API requests and mutating requests do not fall back to static asset serving

#### Scenario: Dynamic public resources

- GIVEN the runtime profile is `publishedSite`
- WHEN a `GET` or `HEAD` request targets `/robots.txt`, `/sitemap.xml`, `/favicon.svg`, `/favicon.ico`, or `/apple-touch-icon.png`
- THEN the request is handled as a dynamic public Site resource
- AND dynamic root icon requests are not served from static asset fallback
- AND the resource body is produced by the public Site adapter selected for the
  target package app key

### Requirement: Preview Route Compatibility

The system MUST preserve published Site redirects from legacy preview paths to clean public paths.

#### Scenario: Clean published redirects

- GIVEN the runtime profile is `publishedSite`
- WHEN a read request targets `/pages`, `/pages/home`, or `/pages/blog/agents?ref=old`
- THEN the system redirects with status `308`
- AND the redirect locations are `/`, `/`, and `/blog/agents?ref=old`

#### Scenario: Non-published profiles do not apply preview redirects

- GIVEN the runtime profile is not `publishedSite`
- WHEN a request targets a `/pages/*` path
- THEN no published Site preview redirect is applied

#### Scenario: Ineligible published paths do not apply preview redirects

- GIVEN the runtime profile is `publishedSite`
- WHEN a request targets an API path, an asset-like preview path, or uses a mutating method
- THEN no published Site preview redirect is applied

### Requirement: Mapped Hosts

The system SHALL route enabled exact-host route records before ordinary host
profile behavior.

#### Scenario: Mapped public Site host

- **GIVEN** an enabled exact-host `route` mounts a public Site for an installed
  Site app
- **WHEN** the mapped host receives a public document request for `/` or a
  nested page path
- **THEN** the response is rendered from that installed Site storage
- **AND** public links, indexing resources, root icons, and core media use
  top-level mapped-host paths
- **AND** generated app routes, schema-key routes, instance shell routes, owner
  setup, owner login, and passkey ceremony requests are blocked on that host
- **AND** public Site document, indexing, and icon behavior is selected from the
  package runtime adapter registered for the route target's package app key

#### Scenario: Mapped app host

- **GIVEN** an enabled exact-host `route` mounts an app surface for an installed
  app
- **WHEN** the mapped host receives browser requests for `/` or `/schema`
- **THEN** the client shell is served with runtime profile, package app key,
  and app install id hints for that install
- **AND** schema-key API routes are not exposed on the mapped app host while
  the matching installed app API route remains available
- **AND** owner setup, owner login, and passkey ceremony requests do not treat
  the mapped app host as a WebAuthn relying party

### Requirement: Schema-Owned App Route Resolution

The system SHALL resolve installed app browser routes and installed Site public
routes from enabled schema-owned `route` records.

#### Scenario: Installed app browser route

- **GIVEN** a browser requests an enabled admin or schema app route
- **WHEN** runtime topology resolves the route
- **THEN** the route record resolves through `appInstall` to its referenced
  `app-install` record
- **AND** the selected installed app mounts with that app install identity

#### Scenario: Installed Site public route

- **GIVEN** a browser requests an enabled public Site route
- **WHEN** runtime topology resolves the route
- **THEN** the route record resolves through `appInstall` to its referenced
  Site `app-install` record
- **AND** public Site reads use the matching install-scoped app storage
  identity
- **AND** public Site runtime behavior is dispatched through the package
  adapter registered for that app install's package app key

#### Scenario: Disabled or conflicting route

- **GIVEN** a route record is disabled or conflicts with a reserved or
  already-enabled route
- **WHEN** runtime topology selects mountable routes
- **THEN** the route is not eligible for runtime mounting
- **AND** route validation prevents the conflict from becoming active

### Requirement: Unified Route Resolution

The system SHALL resolve enabled instance `route` records as the desired route
source for hostless mounts, exact-host mounts, and redirects.

#### Scenario: Route match selection

- **GIVEN** enabled route records exist
- **WHEN** runtime topology resolves a request
- **THEN** exact-host route matches are evaluated before hostless route matches
- **AND** more specific exact path matches are evaluated before prefix matches
- **AND** disabled route records are not eligible for runtime mounting or
  redirect handling

#### Scenario: Redirect route

- **GIVEN** an enabled redirect route matches the request host and path
- **WHEN** runtime topology resolves the request
- **THEN** the runtime returns the configured redirect status code and target
- **AND** preservePath and preserveQueryString policy are applied to the
  redirect location
- **AND** the redirect response is produced by the Worker when the request is
  delivered through the redirect source host custom domain

#### Scenario: Captured redirect host without matching path

- **GIVEN** an enabled redirect route captures a request host
- **AND** no enabled exact-host route matches the request path
- **WHEN** runtime topology resolves the request
- **THEN** the request does not fall through to hostless mounts or ordinary host
  profile behavior
- **AND** the runtime returns no route for normal not-found handling unless
  another exact-host route matches

### Requirement: Local Workspace Gateway Route Policy

The system SHALL expose workspace gateway API routes only for local workspace
runtime profiles that have local gateway sidecar proxy configuration.

#### Scenario: Local dev gateway route

- **WHEN** a local workspace runtime handles a request for the workspace gateway
  API family
- **THEN** the route is eligible only when the runtime is serving a local
  workspace with `FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL` and
  `FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN` configured
- **AND** the route can proxy semantic workspace operations for that workspace
  root to the local sidecar
- **AND** the Worker runtime does not require or receive filesystem adapters to
  make the route eligible

#### Scenario: Deployed runtime blocks gateway route

- **WHEN** an instance, app, site-authoring, or published Site runtime without
  `FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL` and
  `FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN` handles a request for the workspace
  gateway API family
- **THEN** the route is unavailable
- **AND** the runtime does not expose workspace filesystem operation behavior or
  sidecar proxy behavior

#### Scenario: Gateway does not affect app routing

- **WHEN** installed app browser routes, installed Site public routes,
  schema-key routes, or static assets are resolved
- **THEN** workspace gateway route policy is evaluated separately
- **AND** app route resolution continues to use runtime profile and
  schema-owned `route` records
