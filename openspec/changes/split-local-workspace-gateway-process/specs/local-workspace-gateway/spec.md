## MODIFIED Requirements

### Requirement: Local Workspace Gateway

The system SHALL expose browser-safe workspace operations from local workspace
runtime profiles through a filesystem-capable local gateway sidecar process.

#### Scenario: Gateway availability

- **WHEN** `formless dev` starts for a local Formless workspace
- **THEN** a local gateway sidecar is started with the resolved workspace root
  and ignored workspace state configuration
- **AND** workspace gateway operations are available to the browser under a
  same-origin, local-only API family served by the local runtime
- **AND** local runtime gateway routes proxy authorized requests to the sidecar
  over HTTP
- **AND** the same API family is unavailable in deployed instance, app,
  site-authoring, and published Site profiles

#### Scenario: Gateway operation surface

- **WHEN** a browser calls the workspace gateway through the local runtime
- **THEN** it can request semantic operations for workspace init, status, save,
  check, pull, push, credential setup, deploy plan, and deploy apply
- **AND** it cannot request arbitrary filesystem reads, arbitrary filesystem
  writes, shell commands, or path traversal

#### Scenario: Sidecar owns local execution

- **WHEN** a workspace gateway operation reads or writes workspace source,
  persists operation state, reads ignored secret state, runs local credential
  setup, invokes local tools, or applies provider mutations
- **THEN** that work is executed by the local gateway sidecar process
- **AND** Worker runtime code only performs route policy, browser
  authorization, operation intent validation, display-safe response forwarding,
  and HTTP proxying

### Requirement: Workspace Gateway Security Baseline

The system SHALL protect local workspace gateway routes with local route policy,
same-origin browser authorization, CSRF protection, internal sidecar proxy
authorization, and operation-scoped input validation.

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

## ADDED Requirements

### Requirement: Worker Gateway Implementation Boundary

The system MUST keep workspace gateway execution implementation out of Worker
runtime code and bundles.

#### Scenario: Worker source dependency boundary

- **WHEN** Worker source modules are checked
- **THEN** they do not import the local gateway sidecar implementation,
  workspace filesystem operation modules, local credential setup adapters,
  shell/tool execution helpers, or Node filesystem/path/process APIs for
  workspace gateway execution

#### Scenario: Worker gateway route behavior

- **WHEN** a local Worker runtime receives a workspace gateway API request and
  `FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL` and
  `FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN` are present
- **THEN** the Worker authorizes the browser or automation request, classifies
  the operation intent, and proxies the request to the configured sidecar over
  HTTP
- **AND** the Worker does not read or write workspace source files, ignored
  gateway state, local secret state, or provider credentials

#### Scenario: Worker gateway unavailable without sidecar

- **WHEN** a Worker runtime receives a workspace gateway API request without
  `FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL` and
  `FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN`
- **THEN** the gateway route is unavailable
- **AND** no workspace filesystem, credential, Cloudflare, Alchemy, or provider
  mutation behavior is reachable
