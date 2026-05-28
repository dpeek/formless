# Runtime Topology Specification

## Purpose

Runtime topology defines the observable profile, route policy, mapped host, and request routing contracts for a Formless instance. It keeps product instance, dev workbench, app, Site authoring, and published Site behavior coherent across browser shells, APIs, static assets, SSR documents, indexing, icons, and public Site compatibility routes.

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
- WHEN a browser navigates to `/`, `/setup`, `/login`, `/apps/<installId>`, `/sites/<installId>`, or `/sites/<installId>/*`
- THEN the request is eligible for the client shell
- AND source schema routes such as `/tasks`, `/estii/setup`, `/site/schema`, and `/pages/home` are not eligible instance browser routes

#### Scenario: App profile mounts one app

- GIVEN the runtime profile is `app`
- WHEN a browser navigates to `/` or `/schema`
- THEN the selected installed app is mounted as the app surface

#### Scenario: Site authoring profile mounts preview and admin

- GIVEN the runtime profile is `siteAuthoring`
- WHEN a browser navigates to `/` or `/admin`
- THEN the public Site preview and generated Site admin are mounted in the same profile

### Requirement: Published Site Documents

The system MUST route public Site documents through published Site behavior only when the request is a read request that accepts HTML and the published Site profile owns the path.

#### Scenario: Public document SSR

- GIVEN the runtime profile is `publishedSite`
- WHEN a `GET` or `HEAD` request for `/`, `/blog/post`, or another public Site document path accepts HTML
- THEN the request is handled as a published Site document
- AND the response uses public Site SSR instead of the client shell

#### Scenario: Non-document paths stay out of SSR

- GIVEN the runtime profile is `publishedSite`
- WHEN a request targets `/api/*`, `/tasks`, `/estii/setup`, `/site/schema`, `/schema`, `/apps/<installId>`, `/sites/<installId>`, static asset-like paths, dynamic root icon paths, or a non-HTML request
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

The system SHALL route enabled exact-host profile mappings before ordinary host profile behavior.

#### Scenario: Mapped public Site host

- GIVEN an enabled `publicSite` mapping targets an installed Site app
- WHEN the mapped host receives a public document request for `/` or a nested page path
- THEN the response is rendered from that installed Site storage
- AND public links, indexing resources, root icons, and core media use top-level mapped-host paths

#### Scenario: Mapped app host

- GIVEN an enabled `app` mapping targets an installed app
- WHEN the mapped host receives browser requests for `/` or `/schema`
- THEN the client shell is served with runtime profile, package app key, and app install id hints for that install
- AND schema-key API routes are not exposed on the mapped app host while the matching installed app API route remains available
