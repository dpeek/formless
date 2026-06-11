# Deployment Runtime Specification

## Purpose

Deployment runtime projects Formless deployment intent for supported instance
targets and derives display status from schema-owned deployment config
observation cache. Deployers declare tracked Alchemy desired state, Alchemy owns
provider reconciliation and provider resource state, and `deployment-config`
records store only the latest display-safe observation.

## Requirements

### Requirement: Normal Provider Mutation Path

The system SHALL use projected deployment resource graphs as the normal provider
mutation input without storing deployment attempts in runtime SQL tables.

#### Scenario: Apply projected deployment resources

- **WHEN** a CLI, browser workspace gateway, CI job, or trusted deploy node
  applies deployment intent
- **THEN** it reads the current desired-state projection for the target
- **AND** provider mutation is performed by declaring the desired resource graph
  in tracked Alchemy state or an equivalent provider reconciler
- **AND** successful or failed results may patch the target deployment config's
  latest display-safe observation cache

#### Scenario: Route-derived resources share projected deploy graph

- **WHEN** route records project DNS, custom-domain, or redirect resources
- **THEN** those resources are applied through the same projected resource graph
  as Worker and R2 resources
- **AND** latest deployment status remains a cache on the target
  `deployment-config` record, not separate attempt, lease, evidence, or drift
  records

#### Scenario: Removed route resources reconcile through deploy

- **GIVEN** a previous successful deploy tracked route-derived DNS,
  custom-domain, or redirect resources in Alchemy state
- **WHEN** the next desired-state projection omits those resources because a
  route was disabled or deleted
- **THEN** the deployer declares the new desired resource graph in the same
  tracked Alchemy app, stage, and state scope
- **AND** Alchemy destroys the omitted tracked provider resources during deploy
  reconciliation
- **AND** deployment observation records only display-safe latest status and
  summary fields on the deployment config

#### Scenario: Repair cleanup can remain explicit

- **GIVEN** provider evidence exists for a resource that cannot be reconciled
  from tracked Alchemy state because state is missing, stale, manually changed,
  or out-of-band repair is required
- **WHEN** an authorized cleanup workflow selects that evidence
- **THEN** cleanup may mutate the selected provider resource or evidence outside
  normal deploy reconciliation
- **AND** cleanup does not change control-plane deployment intent unless a
  separate authorized intent write is submitted

### Requirement: Read-Only Desired Deployment State

The system SHALL expose a read-only desired deployment state projection for a
supported deployment target.

#### Scenario: Read latest desired state

- **WHEN** a client reads desired deployment state for a target
- **THEN** the response includes a stable hash, schema version, target id,
  resource graph, and display summary
- **AND** targets backed by schema-owned control-plane records project the
  resource graph from enabled route records, deployment config records, and
  higher-level runtime intent for that target
- **AND** host mount routes project custom-domain and DNS resources
- **AND** redirect routes project redirect and redirect DNS resources
- **AND** raw desired resource rows are not schema-owned control-plane source
  records
- **AND** the response does not include provider credentials, Alchemy
  passwords, state tokens, raw lease tokens, or runtime secrets
- **AND** the response is not cached

#### Scenario: Desired state hash stability

- **WHEN** user intent has not changed
- **THEN** repeated desired-state reads for the same target produce the same
  hash
- **AND** timestamps, attempt history, evidence summaries, cleanup history,
  drift reports, deployment config observation cache fields, and status display
  data do not change the desired-state hash

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

The deployment runtime SHALL keep deployment desired-state projection separate
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
  deployment config intent

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
- AND deployment desired state, observation cache, status, metadata, and public
  artifacts do not include raw Turnstile secret values

### Requirement: Deployment Observation Cache

The system SHALL store latest display-safe deployment observation on the target
`deployment-config` record instead of runtime attempt, lease, evidence, or drift
tables.

#### Scenario: Successful observation

- WHEN a deployer successfully applies deployment intent
- THEN it may patch the target deployment config with latest status, observed
  time, desired-state hash, summary, and runner
- AND Alchemy remains the owner of canonical provider resource state
- AND full provider current state is not stored in the observation cache

#### Scenario: Failed observation

- WHEN a deployer fails while applying deployment intent
- THEN it may patch the target deployment config with failed status,
  desired-state hash, observed time, display-safe error, and runner
- AND provider credentials, raw provider state, raw operation tokens, and full
  execution logs are not stored

#### Scenario: Observation replacement

- WHEN a newer deploy or explicit refresh writes an observation
- THEN it replaces the previous observation fields on the deployment config
- AND the runtime does not append deployment history records

### Requirement: Deployment Status

The system SHALL derive display-friendly deployment status from the current
desired-state projection and the target deployment config's latest observation
cache.

#### Scenario: No target state

- WHEN no enabled deployment config exists for a target
- THEN latest deployment status reports `no-target`

#### Scenario: Pending changes

- WHEN the current desired-state hash differs from the deployment config's last
  observed successful hash
- THEN latest deployment status reports desired changes pending

#### Scenario: Deployed current version

- WHEN the deployment config's last observed successful hash matches the current
  desired-state hash
- THEN latest deployment status reports the target deployed
- AND the deployed status includes the latest observed time and runner when
  available

#### Scenario: Failed current version

- WHEN the deployment config's latest failed observation hash matches the
  current desired-state hash
- THEN latest deployment status reports that the current desired state failed
- AND the last error details are available for display

#### Scenario: Stale failure

- WHEN the deployment config's latest failed observation hash differs from the
  current desired-state hash
- THEN latest deployment status reports desired changes pending and may show the
  stale failure separately

#### Scenario: Local active operation

- WHEN a local workspace gateway operation is actively deploying a target
- THEN browser UI may show in-progress state from gateway operation status
- AND the deployment config observation cache is updated only when deploy or
  refresh writes an observation

### Requirement: Drift Observations

The system SHALL allow deployers or refresh workflows to record latest
display-safe drift observation without treating it as canonical provider truth.

#### Scenario: Record drift observation

- WHEN a deployer compares desired state with Alchemy/provider state and
  persists the observation
- THEN it patches the deployment config with drift status, display-safe summary,
  desired-state hash, runner, and observed time
- AND full provider current state is not stored on the deployment config

#### Scenario: Drift does not mutate desired state

- WHEN a drift observation is recorded
- THEN user intent and desired-state projection are not changed
- AND future deploys still project provider resources from current schema-owned
  intent records

### Requirement: Deployer Protocol Boundary

The system SHALL keep deployer execution outside the runtime while exposing
read-only deployment projection and display status.

#### Scenario: External deployer apply

- **WHEN** a CLI, browser workspace gateway, CI job, or trusted deploy node
  applies desired state
- **THEN** it fetches the desired-state projection, resolves provider context
  and secrets outside the runtime desired-state response, declares the desired
  graph in tracked Alchemy state or another provider reconciler, and may patch
  the latest deployment observation cache
- **AND** Worker, R2, DNS, custom-domain, redirect, and other projected
  provider resources use the same deployer protocol boundary

#### Scenario: Route deletion is not provider mutation

- **WHEN** route intent is disabled or deleted
- **THEN** the route write changes desired deployment state only
- **AND** provider resources are created, updated, or deleted only when a
  deployer reconciles the projected desired state

#### Scenario: Runtime does not expose mutation secrets

- **WHEN** browser clients, workspace manifests, portable archives, or
  desired-state reads inspect deployment state
- **THEN** provider API tokens, Alchemy passwords, and Alchemy state tokens are
  not returned

#### Scenario: Repair cleanup stays selected

- **GIVEN** provider evidence requires repair cleanup outside normal deploy
  reconciliation
- **WHEN** a cleanup workflow writes a display-safe cleanup observation
- **THEN** the observation identifies the selected resource or evidence summary
- **AND** the runtime does not treat repair cleanup as the normal route-removal
  path

### Requirement: Deployment Runtime API

The system SHALL expose instance deployment runtime reads through the
`/api/formless/deployments` API family.

#### Scenario: Read deployment state

- WHEN a client reads `/api/formless/deployments/desired-state` or
  `/api/formless/deployments/status`
- THEN the runtime reads the requested supported target
- AND the desired-state projection may be materialized from schema-owned
  control-plane records when that target supports them
- AND status reads derive from desired-state projection and the target
  deployment config observation cache
- AND the response uses `Cache-Control: no-store`

#### Scenario: Runtime deployment API is read-only

- WHEN a client sends attempt, lease, plan, success, failure, or drift mutation
  requests through the deployment API
- THEN the runtime rejects the request
- AND persisted deployment observations must be written as authorized
  deployment-config cache field patches instead of runtime table writes

### Requirement: Local Gateway Deployment Operations

The deployment runtime SHALL allow local workspace gateway sidecar deploy
operations to plan and apply deployment state while preserving projection and
credential boundaries.

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
  and reads the current desired-state projection
- **AND** the browser receives display-safe plan output without provider API
  tokens, Alchemy passwords, Alchemy state tokens, raw lease tokens, or runtime
  secrets
- **AND** Worker runtime code does not read workspace source, ignored secret
  state, or provider credentials to produce the plan

#### Scenario: Browser starts deploy apply

- **WHEN** a browser starts deploy apply through the local workspace gateway
  proxy
- **THEN** the local gateway sidecar applies provider mutations as a trusted
  local deployer and patches the target deployment config's latest observation
  cache after deploy or failure
- **AND** the local gateway rejects stale desired-state observations before
  patching the cache when the current projection hash changed during deploy
- **AND** the gateway returns display-safe operation, evidence, drift, cleanup,
  and observation summaries through operation status or completion responses
- **AND** deployment execution history is not written as schema-owned workspace
  source records
- **AND** Worker runtime code does not perform provider mutation for local
  workspace gateway deploy apply

### Requirement: Workspace Deploy Source Boundary

The deployment runtime SHALL keep deployment intent reviewable as schema-owned
record source and deployment observation cache display-safe but outside
reviewable source.

#### Scenario: Save deployment intent

- **WHEN** deployment intent is saved from Authority to workspace source
- **THEN** `route` and `deployment-config` records are written as
  schema-owned record source
- **AND** workspace and archive boundaries identify those records with
  qualified entity names such as `instance:route` and
  `instance:deployment-config`
- **AND** projected deployment resource graph entries are runtime desired-state
  content, not reviewable control-plane source records
- **AND** `formless.json` does not store deployment intent or target facts
- **AND** `deploy-attempt`, `deploy-evidence-summary`,
  `deploy-drift-report`, cleanup audit summaries, raw leases, and provider
  state payloads are not written as workspace source
- **AND** deployment config observation cache fields are not written as
  workspace source

#### Scenario: Worker name source

- **WHEN** local workspace deploy planning resolves the provider worker name
- **THEN** a schema-owned deployment config worker-name value is used when
  present
- **AND** otherwise the deployment plan may default the worker name from the
  layout manifest workspace name
- **AND** `formless.json` does not store a separate worker-name override

#### Scenario: Exclude execution secrets

- **WHEN** browser clients, workspace manifests, record source, portable
  archives, or desired-state reads inspect deployment state
- **THEN** provider API tokens, Alchemy passwords, Alchemy state tokens, raw
  lease tokens, and runtime secrets are not returned
- **AND** display-safe secret references and operation summaries may be returned

#### Scenario: Gateway returns operation summaries

- **WHEN** browser clients inspect local deploy plan, apply, cleanup, or drift
  operation status through the workspace gateway
- **THEN** responses may include display-safe operation ids, desired-state
  hashes, plan counts, evidence counts, affected logical ids, cleanup results,
  drift counts, runner ids, timestamps, and user-facing errors
- **AND** those responses do not require `deploy-attempt`,
  `deploy-evidence-summary`, or `deploy-drift-report` control-plane records
- **AND** provider credentials, raw provider state, raw lease tokens, Alchemy
  state tokens, and runtime secrets are omitted
