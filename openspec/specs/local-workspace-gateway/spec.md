# local-workspace-gateway Specification

## Purpose

Local workspace gateway exposes browser-safe workspace operation requests from
local runtime profiles through a same-origin proxy and a filesystem-capable
loopback sidecar. It keeps browser, Worker, and sidecar wire behavior
display-safe while local workspace operations, owner sessions, runtime
topology, provider credentials, and app records stay owned by their existing
runtime modules.

## Requirements

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
- **THEN** it can request semantic operations for workspace status, save, check,
  pull, push, credential setup, deploy plan, and deploy apply
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

### Requirement: Gateway Package Boundary

The system SHALL expose reusable local workspace gateway contracts and adapters
through the Gateway package slice.

#### Scenario: Package owns gateway interface

- **WHEN** runtime-neutral, browser, Worker, sidecar, CLI, Site runtime, or
  tests need workspace gateway route constants, gateway proxy header
  contracts, operation intent helpers, browser fetch behavior, Worker proxy
  behavior, or sidecar HTTP routing helpers
- **THEN** they import those contracts and adapters from
  `@dpeek/formless-gateway`, `@dpeek/formless-gateway/client`,
  `@dpeek/formless-gateway/worker`, or `@dpeek/formless-gateway/sidecar`
- **AND** they do not import package-owned gateway behavior from old
  `src/shared`, `src/client`, `src/worker`, or `src/site` gateway modules or
  from unexported package internals
- **AND** Site runtime adapter modules may supply non-package-owned operation
  execution, Workspace package operation state, owner session, and runtime
  topology dependencies to the package sidecar adapter

#### Scenario: Workspace package owns semantic operation contracts

- **WHEN** Gateway browser, Worker, sidecar, Site runtime, or tests need
  semantic workspace operation input shapes, display-safe operation state,
  operation result shapes, operation state redaction, or operation persistence
- **THEN** those contracts and local state adapters come from
  `@dpeek/formless-workspace` or `@dpeek/formless-workspace/node`
- **AND** Gateway adapters treat those shapes as injected workspace operation
  contracts rather than Gateway-owned contracts
- **AND** Gateway response types may alias those Workspace contracts for
  transport callers without redefining compatible local operation shapes

#### Scenario: Package does not own runtime operations

- **WHEN** a gateway adapter needs owner session validation, runtime topology
  eligibility, owner setup status, workspace save, workspace check, workspace
  pull, workspace push, deploy plan, deploy apply, credential setup, operation
  persistence, filesystem access, or provider mutation
- **THEN** those behaviors are supplied through Formless runtime adapters or
  Workspace package local state adapters
- **AND** the Gateway package does not own app records, Authority storage,
  owner session cookies, runtime topology records, provider credentials,
  Alchemy state, Cloudflare mutation, workspace source records, semantic
  operation contracts, or operation state storage

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
- **AND** that capability can authorize gateway status reads only for the
  resolved workspace root
- **AND** that capability cannot authorize save, pull, push, credential setup,
  deploy plan, deploy apply, cleanup, workspace initialization, arbitrary
  control-plane writes, arbitrary filesystem access, Cloudflare mutation,
  Alchemy mutation, or provider mutation
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

### Requirement: Workspace Operation Progress

The system SHALL track local workspace operations with display-safe progress.

#### Scenario: Operation state package boundary

- **WHEN** a local workspace operation starts, updates, completes, fails, or is
  read through Gateway
- **THEN** semantic operation input, result, event, log, error, summary, and
  display-safe state contracts are owned by the Workspace package
- **AND** Gateway transports those operation states without redefining
  compatible local response shapes
- **AND** operation persistence stays under ignored Workspace package local
  state adapters, not Gateway storage

#### Scenario: Start operation

- **WHEN** a browser starts a long-running workspace operation
- **THEN** the gateway returns an operation id and initial status
- **AND** the operation records display-safe kind, status, started time, updated
  time, actor, summary, and error fields

#### Scenario: Read operation progress

- **WHEN** a browser reads operation progress
- **THEN** the gateway returns display-safe progress, logs, and completion
  summary for the requested operation id
- **AND** provider credentials, local secret values, raw filesystem paths outside
  the workspace root, and provider state payloads are omitted

#### Scenario: Read deployment operation summaries

- **WHEN** a browser reads progress for deploy plan, deploy apply, cleanup, or
  drift operations
- **THEN** the gateway may return display-safe operation ids, desired-state
  hashes, plan counts, evidence counts, affected logical ids, cleanup results,
  drift counts, runner ids, timestamps, and user-facing errors
- **AND** those summaries are operation/runtime data, not workspace record
  source
- **AND** the response does not depend on `deploy-attempt`,
  `deploy-evidence-summary`, or `deploy-drift-report` schema-owned records

#### Scenario: Read deployment step progress

- **WHEN** a browser reads progress for a deploy plan or deploy apply operation
- **THEN** the gateway can return ordered display-safe steps for credential
  resolution, account selection, desired-state planning, Worker deployment,
  health check, owner setup, workspace push or writeback, and deployment
  observation refresh
- **AND** each step includes a stable step id, display label, status, optional
  timestamps, and optional display-safe summary or error
- **AND** health check failures include expected target URL and retry-safe
  diagnostic text without exposing provider credentials, admin tokens, raw
  Alchemy state, or raw provider responses
- **AND** operation logs remain display-safe summaries rather than raw adapter
  stdout, stderr, or provider state payloads

#### Scenario: Persist operation progress

- **WHEN** a workspace operation starts, updates, or completes
- **THEN** Workspace package local state adapters persist display-safe operation
  state under ignored workspace state
- **AND** browser refreshes can recover active or recently completed operation
  status
- **AND** secret material, raw adapter or tool output, and provider state payloads
  are not persisted in operation state

### Requirement: Alchemy Credential Setup

The system SHALL use local Alchemy credentials as the browser onboarding path
for Cloudflare credential setup.

#### Scenario: Existing Alchemy profile credentials

- **WHEN** a browser starts Cloudflare credential setup and the local gateway can
  resolve existing default or named Alchemy profile credentials
- **THEN** the gateway validates the credentials and returns display-safe
  account options
- **AND** no Cloudflare token is requested from browser input

#### Scenario: Create Alchemy OAuth profile

- **WHEN** a browser starts Cloudflare credential setup without usable existing
  Alchemy credentials
- **THEN** the gateway starts a trusted local Alchemy OAuth profile creation
  flow
- **AND** any created Cloudflare credential uses Alchemy's default OAuth scopes
  for the current deploy resource set
- **AND** after authorization the gateway resolves accessible Cloudflare
  accounts and either selects the only available account or returns
  display-safe account options for browser selection
- **AND** the selected account is stored as Alchemy provider metadata for the
  profile
- **AND** secret material is stored only under ignored workspace secret state

#### Scenario: API token creation excluded from first onboarding

- **WHEN** browser onboarding needs Cloudflare credentials
- **THEN** the gateway does not request a Cloudflare Global API Key, pasted API
  token, or token-management API token from the browser
- **AND** Cloudflare API token creation remains outside the first browser
  onboarding flow

#### Scenario: Browser token paste unavailable

- **WHEN** browser onboarding needs Cloudflare credentials
- **THEN** the gateway does not expose a browser token paste operation
- **AND** credential setup proceeds through existing Alchemy credentials or
  Alchemy-backed OAuth profile creation

### Requirement: External Authorization URL Handoff

The system SHALL allow browser-initiated credential setup operations to surface
provider authorization URLs from trusted local credential adapters.

#### Scenario: Alchemy adapter provides Cloudflare authorization URL

- **WHEN** a browser starts Cloudflare credential setup through the workspace
  gateway and the trusted Alchemy profile adapter provides an external
  authorization URL
- **THEN** the gateway returns a display-safe operation event containing the URL,
  credential profile label, provider, and waiting status
- **AND** raw adapter or tool output is not returned to the browser
- **AND** provider tokens, refresh tokens, Alchemy passwords, and local secret
  values are redacted from operation events

#### Scenario: Complete external authorization

- **WHEN** the user completes the external Cloudflare authorization in the
  browser and the Alchemy profile adapter finishes locally
- **THEN** the gateway validates the resulting Cloudflare credentials, resolves
  accessible accounts, and stores any secret material only under ignored
  workspace secret state
- **AND** browser-visible records and responses contain only display-safe
  credential references, account facts, and validation status

#### Scenario: Authorization URL validation

- **WHEN** trusted local credential setup produces an authorization URL or
  diagnostic output
- **THEN** the gateway extracts only allowlisted Cloudflare or Alchemy
  authorization URLs expected for the current operation
- **AND** unexpected URLs, raw logs, and secret-looking values are not exposed to
  browser clients

### Requirement: Browser Workspace Onboarding

The system SHALL allow a browser to complete local workspace onboarding through
the local gateway and Authority-backed control-plane writes after CLI-owned
workspace bootstrap.

#### Scenario: Start from CLI-initialized workspace

- **WHEN** a browser opens a fresh local workspace runtime started by
  `formless dev`
- **THEN** the workspace already has layout source and ignored local state
  prepared by the CLI before the runtime starts
- **AND** the browser is not offered a workspace initialization action

#### Scenario: Install first app from browser

- **WHEN** a browser installs the first package app in a fresh local workspace
- **THEN** the runtime creates schema-owned `app-install` and `route` records
  through Authority validation
- **AND** installed app data is initialized in the install-scoped app storage
  identity

### Requirement: Gateway Secret Boundary

The system MUST keep workspace secrets and provider credentials outside browser
responses and reviewable source.

#### Scenario: Deploy through gateway

- **WHEN** a browser starts a deploy plan or deploy apply operation
- **THEN** the gateway resolves provider credentials from environment or ignored
  workspace secret state
- **AND** existing deployed instance targets are resolved from enabled
  `deployment-config.targetUrl` workspace record source
- **AND** the browser receives only display-safe plan, operation, health check,
  restore, and observation summaries
- **AND** deploy apply patches the target deployment config's latest
  display-safe observation cache after deploy or failure
- **AND** deployment operation evidence summaries, drift reports, cleanup audit
  summaries, and deployment observation cache fields are returned through
  gateway operation status/results rather than reviewable workspace source

#### Scenario: Check stays read-only

- **WHEN** a browser starts a check operation through the gateway
- **THEN** the gateway reports fresh deployment and drift observations through
  operation status/results
- **AND** it does not patch deployment config observation cache fields

#### Scenario: Refresh persists observation

- **WHEN** a browser starts an explicit deployment refresh operation through the
  gateway
- **THEN** the gateway may persist the latest display-safe deployment
  observation by patching the target deployment config cache fields
- **AND** source intent fields remain unchanged

#### Scenario: Secret rejection

- **WHEN** workspace source, operation input, or operation output includes
  provider API tokens, Alchemy passwords, Alchemy state tokens, raw lease tokens,
  owner setup tokens, or automation admin tokens
- **THEN** Workspace package local state adapters or runtime operation adapters
  reject or redact the secret values before writing reviewable source
- **AND** Gateway rejects or redacts the secret values before returning
  browser-visible data

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
