## ADDED Requirements

### Requirement: Local Workspace Gateway Route Policy

The system SHALL expose workspace gateway API routes only for local workspace
runtime profiles.

#### Scenario: Local dev gateway route

- **WHEN** a local workspace runtime handles a request for the workspace gateway
  API family
- **THEN** the route is eligible only when the runtime is serving a local
  workspace with filesystem adapters configured
- **AND** the route can call semantic workspace operations for that workspace
  root

#### Scenario: Deployed runtime blocks gateway route

- **WHEN** an instance, app, site-authoring, or published Site runtime without
  local workspace filesystem adapters handles a request for the workspace
  gateway API family
- **THEN** the route is unavailable
- **AND** the runtime does not expose workspace filesystem operation behavior

#### Scenario: Gateway does not affect app routing

- **WHEN** installed app browser routes, installed Site public routes, schema-key
  routes, or static assets are resolved
- **THEN** workspace gateway route policy is evaluated separately
- **AND** app route resolution continues to use runtime profile and
  schema-owned `route` records
