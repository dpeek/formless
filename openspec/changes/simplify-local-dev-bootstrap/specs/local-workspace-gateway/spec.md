## MODIFIED Requirements

### Requirement: Workspace Gateway Security Baseline

The system SHALL protect local workspace gateway routes with local route policy,
same-origin browser authorization, CSRF protection, internal sidecar proxy
authorization, operation-scoped input validation, and a separate local session
bootstrap boundary.

#### Scenario: Pre-owner bootstrap operation

- **WHEN** `formless dev` starts a local workspace runtime before owner setup is
  complete
- **THEN** the runtime may issue a process-scoped, unguessable bootstrap
  capability to the same-origin browser shell
- **AND** that capability can authorize gateway status reads and workspace
  initialization only for the resolved workspace root
- **AND** that capability cannot authorize save, pull, push, credential setup,
  deploy plan, deploy apply, cleanup, arbitrary control-plane writes,
  arbitrary filesystem access, Cloudflare mutation, Alchemy mutation, or
  provider mutation
- **AND** proxied bootstrap requests sent to the sidecar include only
  display-safe actor and operation intent facts plus internal proxy
  authorization
- **AND** the capability expires when the local runtime process exits or owner
  setup completes

#### Scenario: Local session bootstrap

- **WHEN** `formless dev` starts a local workspace runtime with a CLI-minted
  local session bootstrap token
- **THEN** the same-origin browser can exchange that token only through the
  local session bootstrap endpoint
- **AND** the endpoint issues an owner session cookie for the local runtime and
  redirects to the instance shell
- **AND** the token cannot authorize gateway operations, control-plane writes,
  app installs, arbitrary filesystem access, Cloudflare mutation, Alchemy
  mutation, or provider mutation
- **AND** the token expires when the local runtime process exits or after a
  successful exchange
- **AND** the local session bootstrap endpoint is unavailable outside local
  workspace runtime profiles

#### Scenario: Browser starts mutating operation

- **WHEN** a browser starts save, pull, push, credential setup, deploy plan,
  deploy apply, cleanup, or another post-bootstrap mutating gateway operation
- **THEN** the request must be served by a local workspace runtime profile with
  a configured local gateway sidecar target
- **AND** the request must have a same-origin `Origin` header for the local
  workspace origin
- **AND** the request must include a valid owner session cookie
- **AND** the request must include a same-origin CSRF token or equivalent
  double-submit/header proof issued by the local runtime
- **AND** the sidecar must receive an internal proxy authorization token before
  filesystem, Cloudflare, Alchemy, or provider mutation begins
- **AND** admin bearer tokens are not accepted through browser login or exposed
  to browser state

#### Scenario: CLI or automation starts operation

- **WHEN** a non-browser CLI or automation caller starts a gateway operation
- **THEN** the sidecar may authorize through the admin bearer boundary or a
  local runtime proxy may forward an already authorized automation actor
- **AND** the request still must target the resolved local workspace sidecar and
  operation allowlist
- **AND** browser-visible responses do not expose whether an admin token exists
  or reveal token values

#### Scenario: Operation scope validation

- **WHEN** any caller starts or reads a gateway operation
- **THEN** the operation kind, operation id, and input shape are allowlisted
- **AND** operation ids are unguessable and scoped to the current workspace
- **AND** arbitrary filesystem paths, path traversal, shell commands, raw logs,
  raw adapter output, raw provider state, and secret-looking values are rejected
  or redacted

#### Scenario: Cross-origin or deployed request blocked

- **WHEN** a deployed runtime, mapped host, cross-origin browser request, or
  request without required bootstrap or owner/CSRF proof calls the gateway API
  family
- **THEN** the local runtime refuses the request before proxying to the sidecar
- **AND** the sidecar refuses direct requests without internal proxy
  authorization or accepted automation authorization before workspace
  filesystem, Authority, Cloudflare, Alchemy, or provider mutation
- **AND** the response remains display-safe
