## ADDED Requirements

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

## MODIFIED Requirements

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

#### Scenario: Disabled or conflicting route

- **GIVEN** a route record is disabled or conflicts with a reserved or
  already-enabled route
- **WHEN** runtime topology selects mountable routes
- **THEN** the route is not eligible for runtime mounting
- **AND** route validation prevents the conflict from becoming active
