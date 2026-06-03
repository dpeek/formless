## MODIFIED Requirements

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
