## ADDED Requirements

### Requirement: Local Workspace Gateway

The system SHALL expose browser-safe workspace operations from local workspace
runtime profiles.

#### Scenario: Gateway availability

- **WHEN** the runtime starts for a local Formless workspace
- **THEN** workspace gateway operations are available to the browser under a
  local-only API family
- **AND** the same API family is unavailable in deployed instance, app,
  site-authoring, and published Site profiles

#### Scenario: Gateway operation surface

- **WHEN** a browser calls the workspace gateway
- **THEN** it can request semantic operations for workspace init, status, save,
  check, pull, push, credential setup, deploy plan, and deploy apply
- **AND** it cannot request arbitrary filesystem reads, arbitrary filesystem
  writes, shell commands, or path traversal

### Requirement: Workspace Gateway Security Baseline

The system SHALL protect local workspace gateway routes with local route policy,
same-origin browser authorization, CSRF protection, and operation-scoped input
validation.

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
- **AND** the capability expires when the local runtime process exits or owner
  setup completes

#### Scenario: Browser starts mutating operation

- **WHEN** a browser starts save, pull, push, credential setup, deploy plan,
  deploy apply, cleanup, or another post-bootstrap mutating gateway operation
- **THEN** the request must be served by a local workspace runtime profile with
  filesystem adapters configured
- **AND** the request must have a same-origin `Origin` header for the local
  workspace origin
- **AND** the request must include a valid owner session cookie
- **AND** the request must include a same-origin CSRF token or equivalent
  double-submit/header proof issued by the local runtime
- **AND** admin bearer tokens are not accepted through browser login or exposed
  to browser state

#### Scenario: CLI or automation starts operation

- **WHEN** a non-browser CLI or automation caller starts a gateway operation
- **THEN** the gateway may authorize through the admin bearer boundary
- **AND** the request still must target the resolved local workspace runtime and
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
- **THEN** the gateway refuses the request before workspace filesystem,
  Authority, Cloudflare, Alchemy, or provider mutation
- **AND** the response remains display-safe

### Requirement: Workspace Operation Progress

The system SHALL track local workspace operations with display-safe progress.

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
- **THEN** the gateway may return display-safe attempt ids, desired-state
  versions, plan counts, evidence counts, affected logical ids, cleanup results,
  drift counts, runner ids, timestamps, and user-facing errors
- **AND** those summaries are operation/runtime data, not workspace record
  source
- **AND** the response does not depend on `deploy-attempt`,
  `deploy-evidence-summary`, or `deploy-drift-report` schema-owned records

#### Scenario: Persist operation progress

- **WHEN** a workspace operation starts, updates, or completes
- **THEN** the gateway persists display-safe operation state under ignored
  workspace state
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
the local gateway and Authority-backed control-plane writes.

#### Scenario: Initialize from browser

- **WHEN** a browser initializes an empty local workspace
- **THEN** the gateway writes a layout-only `formless.json`, creates configured
  source and ignored state directories, and starts local Authority state
- **AND** no Cloudflare resource, remote instance, or provider credential is
  created by initialization

#### Scenario: Install first app from browser

- **WHEN** a browser installs the first package app after workspace
  initialization
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
- **AND** the browser receives only display-safe plan, attempt, health check,
  restore, and writeback summaries
- **AND** deployment attempts, evidence summaries, drift reports, and cleanup
  audit summaries are returned through gateway operation status/results rather
  than reviewable workspace source

#### Scenario: Secret rejection

- **WHEN** workspace source, operation input, or operation output includes
  provider API tokens, Alchemy passwords, Alchemy state tokens, raw lease tokens,
  owner setup tokens, or automation admin tokens
- **THEN** the gateway rejects or redacts the secret values before writing
  reviewable source or returning browser-visible data
