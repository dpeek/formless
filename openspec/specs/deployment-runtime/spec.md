# Deployment Runtime Specification

## Purpose

Deployment runtime versions Formless deployment intent for supported instance
targets, coordinates exact-version deployment attempts, and stores audit/status
summaries while deployers declare tracked Alchemy desired state and Alchemy owns
provider reconciliation and provider resource state.

## Requirements

### Requirement: Normal Provider Mutation Path

The system SHALL use generic deployment attempts as the only normal provider
mutation path for control-plane desired resources.

#### Scenario: Apply control-plane desired resources

- **WHEN** a CLI, browser workspace gateway, CI job, or trusted deploy node
  applies control-plane desired resources
- **THEN** it starts or reuses a deployment attempt for the exact desired-state
  version and target
- **AND** provider mutation is performed by declaring the desired resource graph
  in tracked Alchemy state or an equivalent provider reconciler
- **AND** successful or failed results are written back to the deployment
  runtime for that exact desired-state version

#### Scenario: Route-derived resources share deployment attempts

- **WHEN** route records project DNS, custom-domain, or redirect resources
- **THEN** those resources are applied through the same deployment attempt model
  as Worker and R2 resources
- **AND** deployment attempts, leases, evidence, drift, and status remain the
  shared provider mutation record

#### Scenario: Removed route resources reconcile through deploy

- **GIVEN** a previous successful deploy tracked route-derived DNS,
  custom-domain, or redirect resources in Alchemy state
- **WHEN** the next desired-state version omits those resources because a route
  was disabled or deleted
- **THEN** the deployer declares the new desired resource graph in the same
  tracked Alchemy app, stage, and state scope
- **AND** Alchemy destroys the omitted tracked provider resources during deploy
  reconciliation
- **AND** deployment writeback records non-secret delete evidence for the exact
  desired-state version

#### Scenario: Repair cleanup can remain explicit

- **GIVEN** provider evidence exists for a resource that cannot be reconciled
  from tracked Alchemy state because state is missing, stale, manually changed,
  or out-of-band repair is required
- **WHEN** an authorized cleanup workflow selects that evidence
- **THEN** cleanup may mutate the selected provider resource or evidence outside
  normal deploy reconciliation
- **AND** cleanup does not change control-plane desired resources unless a
  separate authorized intent write is submitted

### Requirement: Versioned Desired Deployment State

The system SHALL expose immutable desired deployment state versions for a
supported deployment target.

#### Scenario: Read latest desired state

- **WHEN** a client reads desired deployment state for a target
- **THEN** the response includes a desired-state version id, monotonic
  revision, stable hash, schema version, target id, resource graph, and display
  summary
- **AND** targets backed by schema-owned control-plane records project the
  resource graph from enabled route, provider config reference, deploy target,
  and desired resource records for that target
- **AND** host mount routes project custom-domain and DNS resources
- **AND** redirect routes project redirect and redirect DNS resources
- **AND** the response does not include provider credentials, Alchemy
  passwords, state tokens, raw lease tokens, or runtime secrets
- **AND** the response is not cached

#### Scenario: Desired state hash stability

- **WHEN** user intent has not changed
- **THEN** repeated desired-state reads for the same target produce the same
  hash
- **AND** timestamps, attempt history, evidence summaries, cleanup history,
  drift reports, and status display data do not change the desired-state hash

### Requirement: Runtime Upgrade Facts

The deployment runtime SHALL expose upgrade-relevant runtime facts for exact
deploy and upgrade planning.

#### Scenario: Metadata includes upgrade facts

- WHEN a client reads deploy metadata for a Formless instance
- THEN the response includes package version, runtime protocol version, storage
  migration set identity, and bundled package app revision/hash facts
- AND the response does not expose provider credentials, admin tokens, Alchemy
  state, raw lease tokens, or runtime secrets
- AND the response is not cached

#### Scenario: Exact deploy verifies upgrade facts

- WHEN a CLI deploys runtime code for an instance
- THEN post-deploy verification compares expected upgrade facts with the
  deployed metadata response
- AND data migrations do not run when metadata verification fails

### Requirement: Upgrade-Aware Desired State

The deployment runtime SHALL keep deployment desired-state versioning separate
from runtime upgrade metadata while allowing CLI workflows to display both.

#### Scenario: Desired state remains provider intent

- WHEN a client reads deployment desired state
- THEN desired-state hash and revision still describe deployment-facing resource
  intent
- AND runtime package version, migration set, and package app revisions do not
  change the desired-state hash unless they change resource intent

### Requirement: Deployment Resource Graph

The system SHALL represent deployment-facing intent as a resource graph with
stable logical ids and provider resource declarations.

#### Scenario: Graph resource identity

- **WHEN** desired state contains provider-managed resources
- **THEN** each graph resource has a stable logical id, kind, target id,
  provider family, inputs, and dependency metadata
- **AND** logical ids are deterministic for the same enabled route and provider
  config intent

#### Scenario: Graph is not provider truth

- **WHEN** the resource graph is stored or returned
- **THEN** it represents desired resources for planning
- **AND** it does not claim to be the current provider resource state

### Requirement: Turnstile Challenge Deployment

The deployment runtime SHALL provision per-instance Turnstile challenge
configuration for deployed public action forms that require Turnstile.

#### Scenario: Declare Turnstile widget resource

- WHEN a deployer applies a Formless instance target whose public actions use
  Turnstile challenges
- THEN it declares a stable Cloudflare Turnstile widget resource in tracked
  Alchemy state with the Worker, Durable Object namespace, R2 bucket, and
  route-derived provider resources
- AND the widget inputs include a deterministic name, widget mode, and the
  deployed workers.dev host plus enabled public Site custom-domain hosts
- AND changed or removed widget host inputs reconcile through the next deploy
  without storing Turnstile provider state in app records

#### Scenario: Bind Turnstile runtime configuration

- GIVEN the Turnstile widget resource returns a public site key and server-side
  verification secret
- WHEN the Worker resource is declared
- THEN the deployer binds the site key to `FORMLESS_TURNSTILE_SITE_KEY`
- AND binds the verification secret to `FORMLESS_TURNSTILE_SECRET_KEY` as a
  Worker secret
- AND deployment desired state, result writeback, status, metadata, and public
  artifacts do not include raw Turnstile secret values

### Requirement: Deployment Attempts

The system SHALL record deployment attempts against one exact desired-state
version and target.

#### Scenario: Start attempt

- WHEN a deployer starts an attempt with target id, desired-state version id,
  desired-state hash, actor, mode, and idempotency key
- THEN the runtime records an attempt with status `started`
- AND replaying the same idempotency key for the same target and desired
  version returns the existing attempt

#### Scenario: Reject stale start

- WHEN a deployer starts an attempt with a desired-state version id or hash that
  does not match the runtime's stored latest version
- THEN the runtime rejects the attempt
- AND no deployment lease is acquired

#### Scenario: Complete exact version

- WHEN an attempt completes successfully
- THEN the result is recorded for the exact desired-state version and target
- AND the latest successful desired-state version is advanced only when the
  completed version is still the target's latest desired version

#### Scenario: Complete older version

- WHEN an older desired-state version completes after a newer desired-state
  version exists
- THEN the attempt remains historical evidence
- AND latest deployment status still reports desired changes pending

### Requirement: Deployment Lease

The system SHALL serialize mutating deployment attempts with a target-scoped
lease.

#### Scenario: Acquire lease for apply or destroy

- WHEN an apply or destroy attempt starts for a deployment target
- THEN the runtime acquires a lease with a lease id, token, acquired time, and
  expiry time
- AND another mutating attempt for the same target is rejected while the lease is
  active

#### Scenario: Plan attempts do not acquire leases

- WHEN a plan attempt starts for a deployment target
- THEN the runtime records the attempt without acquiring a deployment lease
- AND active mutating lease serialization remains scoped to apply and destroy
  attempts

#### Scenario: Heartbeat lease

- WHEN the actor holding a lease sends a valid heartbeat before expiry
- THEN the runtime extends the lease expiry
- AND the attempt status remains active

#### Scenario: Complete requires lease token

- WHEN a mutating attempt writes success or failure
- THEN the runtime requires the matching lease token
- AND a mismatched or expired lease token is rejected

### Requirement: Deployment Result Writeback

The system SHALL store deployment results, resource evidence summaries, and
errors without duplicating Alchemy's resource-state store.

#### Scenario: Plan writeback

- WHEN a deployer writes a plan result for an attempt
- THEN the runtime stores plan summary counts, blockers, warnings, and display
  text for that attempt
- AND full provider current state is not required in the writeback

#### Scenario: Success writeback

- WHEN a deployer writes a successful apply or destroy result
- THEN the runtime stores Alchemy app/stage/scope pointers, resource evidence
  summaries, provider ids needed for audit or cleanup, runner id, and completion
  time
- AND Alchemy remains the owner of canonical provider resource state
- AND evidence can include created, updated, no-change, adopted, or deleted
  resource summaries from the tracked provider reconciliation

#### Scenario: Failure writeback

- WHEN a deployer writes a failed result
- THEN the runtime stores the error code, display message, optional details,
  actor, runner id, and failed desired-state version
- AND the failure does not update the latest successful desired-state version

### Requirement: Deployment Status

The system SHALL derive display-friendly deployment status from desired-state
versions, attempts, leases, results, and drift reports.

#### Scenario: No target state

- WHEN no desired-state version has been recorded for a target
- THEN latest deployment status reports `no-target`

#### Scenario: Pending changes

- WHEN the latest desired-state version differs from the latest successful
  desired-state version
- THEN latest deployment status reports desired changes pending

#### Scenario: Deployed current version

- WHEN the latest successful attempt matches the latest desired-state version
- THEN latest deployment status reports the target deployed
- AND the deployed status includes the successful attempt id and deployed time

#### Scenario: Failed current version

- WHEN the latest desired-state version has a failed attempt and no later success
  for that version
- THEN latest deployment status reports that the current desired version failed
- AND the last error details are available for display

#### Scenario: Failed older version

- WHEN the last failed attempt belongs to an older desired-state version
- THEN latest deployment status reports the old failure separately from the
  current desired version

#### Scenario: Active attempt

- WHEN a deployment lease or plan attempt is active for a target
- THEN latest deployment status reports deploy in progress with actor, attempt
  id, started time, mode, and desired-state version

### Requirement: Drift Reports

The system SHALL accept runner-supplied drift summaries without treating them as
canonical provider truth.

#### Scenario: Record drift report

- WHEN a deployer compares desired state with Alchemy/provider state and writes a
  drift report
- THEN the runtime stores drift status, summary counts, affected logical ids,
  actor, and reported time
- AND the report is associated with the desired-state version and target

#### Scenario: Drift does not mutate desired state

- WHEN a drift report is recorded
- THEN user intent and desired-state versions are not changed
- AND future deploy attempts still bind to explicit desired-state versions

### Requirement: Deployer Protocol Boundary

The system SHALL keep deployer execution outside the runtime while making
provider mutation, writeback, repair cleanup, and audit behavior exact.

#### Scenario: External deployer apply

- **WHEN** a CLI, browser workspace gateway, CI job, or trusted deploy node
  applies desired state
- **THEN** it fetches the desired-state version, resolves provider context and
  secrets outside the runtime desired-state response, declares the exact desired
  graph in tracked Alchemy state or another provider reconciler, and writes back
  the result for the exact desired-state version
- **AND** Worker, R2, DNS, custom-domain, redirect, and other control-plane
  desired resources use the same deployer protocol boundary

#### Scenario: Route deletion is not provider mutation

- **WHEN** route intent is disabled or deleted
- **THEN** the route write changes desired deployment state only
- **AND** provider resources are created, updated, or deleted only when a
  deployer reconciles an exact desired-state version

#### Scenario: Runtime does not expose mutation secrets

- **WHEN** browser clients, workspace manifests, portable archives, or
  desired-state reads inspect deployment state
- **THEN** provider API tokens, Alchemy passwords, and Alchemy state tokens are
  not returned

#### Scenario: Repair cleanup stays selected

- **GIVEN** recorded provider evidence requires repair cleanup outside normal
  deploy reconciliation
- **WHEN** a cleanup workflow writes result evidence
- **THEN** the writeback identifies the selected resource or evidence row
- **AND** the runtime does not treat repair cleanup as the normal route-removal
  path

### Requirement: Deployment Runtime API

The system SHALL expose instance deployment runtime reads and writeback through
the `/api/formless/deployments` API family.

#### Scenario: Read deployment state

- WHEN a client reads `/api/formless/deployments/desired-state` or
  `/api/formless/deployments/status`
- THEN the runtime reads the requested supported target
- AND the desired-state projection may be materialized from schema-owned
  control-plane records when that target supports them
- AND the response uses `Cache-Control: no-store`

#### Scenario: Mutating writeback requires instance write authorization

- WHEN a client starts an attempt, heartbeats a lease, writes plan/success/failure
  results, or writes drift through the deployment API
- THEN the runtime requires instance owner or admin write authorization
- AND the write is validated against the exact desired-state version reference

### Requirement: Local Gateway Deployment Operations

The deployment runtime SHALL allow local workspace gateway sidecar deploy
operations to plan and apply deployment state while preserving exact-version
and credential boundaries.

#### Scenario: Browser starts credential setup

- **WHEN** a browser starts Cloudflare credential setup through the local
  workspace gateway proxy before deploy planning
- **THEN** the local gateway sidecar may run the trusted local Alchemy profile
  adapter and return display-safe authorization URL events through the proxy
- **AND** deployment intent records store only provider references, account
  facts, and validation status after credentials are validated
- **AND** the first browser onboarding flow does not create Cloudflare API
  tokens or request token-management credentials from browser input
- **AND** Worker runtime code does not run Alchemy credential setup or read
  local provider credential state

#### Scenario: Browser starts deploy plan

- **WHEN** a browser starts a deploy plan through the local workspace gateway
  proxy
- **THEN** the local gateway sidecar reads schema-owned deployment intent
  records, resolves local credential context outside browser-visible responses,
  and reads the exact desired-state version
- **AND** the browser receives display-safe plan output without provider API
  tokens, Alchemy passwords, Alchemy state tokens, raw lease tokens, or runtime
  secrets
- **AND** Worker runtime code does not read workspace source, ignored secret
  state, or provider credentials to produce the plan

#### Scenario: Browser starts deploy apply

- **WHEN** a browser starts deploy apply through the local workspace gateway
  proxy
- **THEN** the local gateway sidecar applies provider mutations as a trusted
  local deployer and writes deployment attempt, success, failure, evidence, or
  drift results for the exact desired-state version
- **AND** the deployment runtime rejects stale desired-state version or hash
  writeback
- **AND** the gateway returns display-safe attempt, evidence, drift, cleanup,
  and writeback summaries through operation status or completion responses
- **AND** deployment execution history is not written as schema-owned workspace
  source records
- **AND** Worker runtime code does not perform provider mutation for local
  workspace gateway deploy apply

### Requirement: Workspace Deploy Source Boundary

The deployment runtime SHALL keep deployment intent reviewable as schema-owned
record source and deployment execution state display-safe but outside
reviewable source.

#### Scenario: Save deployment intent

- **WHEN** deployment intent is saved from Authority to workspace source
- **THEN** `route`, `deploy-target`, `provider-config-ref`, and
  `deploy-desired-resource` records are written as schema-owned record source
- **AND** workspace and archive boundaries identify those records with
  qualified entity names such as `instance:deploy-target` and
  `instance:deploy-desired-resource`
- **AND** `formless.json` does not store deployment intent or target facts
- **AND** `deploy-attempt`, `deploy-evidence-summary`,
  `deploy-drift-report`, cleanup audit summaries, raw leases, and provider
  state payloads are not written as workspace source

#### Scenario: Worker name source

- **WHEN** local workspace deploy planning resolves the provider worker name
- **THEN** a schema-owned provider config worker-name value is used when present
- **AND** otherwise the deployment plan may default the worker name from the
  layout manifest workspace name
- **AND** `formless.json` does not store a separate worker-name override

#### Scenario: Exclude execution secrets

- **WHEN** browser clients, workspace manifests, record source, portable
  archives, or desired-state reads inspect deployment state
- **THEN** provider API tokens, Alchemy passwords, Alchemy state tokens, raw
  lease tokens, and runtime secrets are not returned
- **AND** display-safe secret references and operation summaries may be returned

#### Scenario: Gateway returns execution summaries

- **WHEN** browser clients inspect local deploy plan, apply, cleanup, or drift
  operation status through the workspace gateway
- **THEN** responses may include display-safe attempt ids, desired-state
  versions, plan counts, evidence counts, affected logical ids, cleanup results,
  drift counts, runner ids, timestamps, and user-facing errors
- **AND** those responses do not require `deploy-attempt`,
  `deploy-evidence-summary`, or `deploy-drift-report` control-plane records
- **AND** provider credentials, raw provider state, raw lease tokens, Alchemy
  state tokens, and runtime secrets are omitted
