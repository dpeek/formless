# Site CLI Publish Specification

## Purpose

Site CLI publish behavior lets a local Formless workspace run, save, sync, and
manage selected instance access.

## Requirements

### Requirement: CLI Command Families

The package SHALL expose one top-level `formless` command spelling for each
normal workspace operation and SHALL keep raw archive movement, instance
aliases, status, check, refresh, init, reset, and domain repair commands out of
the public CLI surface.

#### Scenario: Local workspace commands

- **GIVEN** the package CLI is installed
- **WHEN** a user runs `formless dev`, `formless save`, `formless pull`,
  `formless push`, or `formless destroy`
- **THEN** the command operates on the local Formless workspace selected by
  `formless.json`
- **AND** `formless dev`, `formless save`, and `formless pull` do not mutate
  remote instance data or Cloudflare resources unless `formless pull` is run
  without `--dry-run`, in which case it rewrites reviewable workspace source
- **AND** `formless push` is the only normal command that reconciles a deployed
  instance from local workspace source, including runtime code, provider
  resources, control-plane records, app records, schema, and media
- **AND** `formless destroy` remains the explicit Cloudflare teardown boundary

#### Scenario: Sync dry-runs

- **GIVEN** the package CLI is installed
- **WHEN** a user runs `formless push --dry-run` or `formless pull --dry-run`
- **THEN** the command reports the source, target, and high-level changes that
  would be synchronized
- **AND** it does not mutate local source, remote instance data, Cloudflare
  resources, or Alchemy state
- **AND** if source and target are already equivalent, it reports
  `Everything up to date.`
- **AND** the no-op message is the exact command output and is not accompanied
  by sync plan, drift, deploy, migration, retry, or warning text

#### Scenario: Removed command families

- **GIVEN** the package CLI is installed
- **WHEN** a user runs a removed archive, deploy, instance alias, status,
  check, refresh, init, reset, or domain command
- **THEN** the command is handled by ordinary unsupported-command behavior
- **AND** provider, Authority, filesystem, deploy adapter, command, and state
  mutation code is not run for the removed command name

#### Scenario: Owner setup command

- **GIVEN** the package CLI is installed and a Formless instance workspace has a
  selected deployed target
- **WHEN** a user runs `formless owner setup ... [--open]`
- **THEN** the CLI reads the selected target owner setup status before minting a
  setup capability
- **AND** if owner setup is incomplete, the CLI uses the selected admin token
  source to create one owner setup capability and displays the intended
  `/setup?token=...` URL
- **AND** if `--open` is present, the CLI opens only that intended setup URL
  after capability creation succeeds
- **AND** if owner setup is already complete, the CLI reports the existing owner
  state without minting a setup token, creating a capability, or opening a
  browser
- **AND** the admin token is not displayed and the setup token is displayed only
  as part of the intended setup URL

#### Scenario: Token commands

- **GIVEN** an instance workspace needs automation write access
- **WHEN** a user runs `formless token adopt` or `formless token rotate`
- **THEN** ignored workspace secret state stores the automation admin token
- **AND** reviewable workspace source does not store the secret

### Requirement: Workspace Operation Definitions

The workspace package SHALL own runtime-neutral workspace operation definitions
that describe the operation contract before any CLI, browser gateway, runner, or
local execution binding handles it.

#### Scenario: Operation definition source

- **WHEN** the workspace package declares a workspace operation
- **THEN** the definition includes a target-prefixed canonical key, label, input
  fields, defaults, actor policy, read or write mode, bootstrap availability,
  display-safe input summary, CLI binding, gateway binding, and required
  execution capability
- **AND** the definition includes a stable execution handler key that may match
  the canonical operation key
- **AND** operation kind allowlists, browser-visible operation sets, gateway
  mutating intent, bootstrap intent, and display input summaries are derived from
  the definitions
- **AND** duplicated per-surface operation metadata is not maintained separately
  in CLI, gateway, or instance shell code

#### Scenario: Definition and handler boundary

- **WHEN** a workspace operation is executed locally or through a gateway actor
- **THEN** the operation definition remains the source of metadata, bindings,
  input shape, actor policy, mode, and required execution capability
- **AND** operation handler implementations remain grouped by execution domain
  such as workspace status, workspace source sync, credential setup, and
  deployment
- **AND** the first implementation does not require moving all operation bodies
  into one shared operation module

#### Scenario: CLI binding from operation definition

- **WHEN** the CLI exposes a workspace command for a defined operation
- **THEN** command arguments and defaults are selected from the operation input
  contract and CLI binding
- **AND** each public workspace operation has one CLI binding name
- **AND** the command invokes the operation through the local workspace
  operation runner with actor `cli`
- **AND** execution may continue to dispatch to existing local workspace
  functions while the operation definition remains the source of command shape,
  actor policy, and display-safe input facts
- **AND** public push and pull bindings expose only `--workspace`, `--target`,
  and `--dry-run` inputs
- **AND** public workspace operation definitions do not expose apply, replace,
  stale acknowledgement, install-set replacement, deploy plan/apply, or
  migration policy inputs
- **AND** removed deploy, drift, apply, replace, stale acknowledgement,
  install-set replacement, and migration policy inputs are deleted rather than
  translated into push or pull through compatibility aliases or gateway shims

#### Scenario: Gateway binding from operation definition

- **WHEN** a browser or automation caller starts a workspace operation through
  the same-origin gateway API
- **THEN** the gateway parses allowed request fields, defaults, read/write mode,
  bootstrap eligibility, and required actor policy from the operation definition
- **AND** forbidden secret-looking, path-like, raw provider state, or shell
  command inputs remain rejected before execution
- **AND** unsupported operations are rejected because no browser gateway binding
  is declared, not because a separate gateway-only enum omits them

### Requirement: Local First Onboarding

The CLI SHALL start the local Formless workspace runtime through `formless dev`
before any Cloudflare account or deployment mutation, while the CLI owns fresh
workspace bootstrap and browser onboarding owns local session bootstrap,
optional first app install, credential setup, and push operations.

#### Scenario: Start local workspace runtime

- **WHEN** `formless dev` runs for an empty workspace root
- **THEN** the CLI writes a layout-only `formless.json`, prepares ignored
  `.formless/local` state, persists local dev secrets, and mints process-scoped
  local session, gateway proxy, gateway CSRF, and sidecar tokens before the
  product instance runtime starts
- **AND** the CLI does not create empty storage snapshot or media directories
- **AND** no app install, route, deployment config, Cloudflare resource,
  Alchemy resource, provider credential, or remote instance is created
- **AND** the workspace name defaults from the selected directory unless
  interactive confirmation supplies another valid name

#### Scenario: Start existing local workspace runtime

- **WHEN** `formless dev` runs for a layout-only workspace or workspace source
  with storage snapshots and media payloads
- **THEN** the product instance runtime starts with workspace-local persistence
- **AND** the CLI builds the active package resolver from bundled packages plus
  linked packages declared in `formless.packages.json` when present
- **AND** installable package lists shown before the workspace has installed
  apps come from that active resolver
- **AND** first-run local runtime state starts from workspace storage snapshots
  and media payloads when present
- **AND** the browser can complete onboarding before any Cloudflare deploy
- **AND** before a local owner session is established, the browser can only read
  gateway status through bootstrap authorization and exchange a CLI-minted local
  session bootstrap token for an owner session
- **AND** app install, save, credential setup, push dry-run, and push apply
  entry points are available through browser-owned local runtime flows
  after local session bootstrap

#### Scenario: Open authenticated local session

- **WHEN** a user runs `formless dev --open`
- **THEN** the CLI opens a same-origin local session bootstrap URL for the
  running local workspace runtime
- **AND** successful bootstrap issues an owner session cookie and redirects the
  browser to the instance shell
- **AND** the instance shell can install the first package app through the
  normal app install flow without passkey setup

#### Scenario: Install first app locally

- **WHEN** the user installs a package app through the local web UI
- **THEN** the local Authority records schema-owned `app-install` and `route`
  records and initializes install-scoped app state from the active package
  resolver
- **AND** no Cloudflare resource is mutated

#### Scenario: Install linked private app locally

- **GIVEN** `formless.packages.json` links a private local app package manifest
- **WHEN** `formless dev` starts and an owner opens the app install flow
- **THEN** the linked package appears in the installable package list for that
  workspace
- **AND** installing it initializes app storage from the linked source schema
  and seed records
- **AND** the generated `app-install` and `route` records do not store the
  package link path or package source repository facts

#### Scenario: Reject missing linked package source

- **GIVEN** `formless.packages.json` points at a missing or invalid package
  manifest, source schema, or seed record file
- **WHEN** `formless dev`, `formless push`, or a workspace
  operation builds the active package resolver
- **THEN** the command fails before starting local runtime mutation, remote
  mutation, sync planning, or provider mutation
- **AND** the error identifies the invalid package link path and validation
  reason without exposing secrets

#### Scenario: Push before installing an app

- **WHEN** a local owner opens the sync flow before any app install exists
- **THEN** credential setup, push dry-run, and push apply remain available
  through the browser-owned local runtime flow
- **AND** push can publish the instance runtime with zero
  `app-install` records and no app storage snapshots
- **AND** app installation remains a separate optional local Authority write
  before or after the first push

### Requirement: Workspace Save From Local Authority

The CLI SHALL save local workspace runtime state from Authority-backed instance
state back to reviewable workspace storage snapshots and media payloads.

#### Scenario: Save local workspace state

- **WHEN** `formless save` runs for a local Formless workspace
- **THEN** active installed app records, media payloads, and schema-owned
  control-plane intent are written to deterministic workspace storage snapshots
- **AND** browser IndexedDB state is not used as the source of truth
- **AND** secrets are not written to `formless.json`, storage snapshots, or
  media files

#### Scenario: Auto-save local workspace state

- **WHEN** a local workspace runtime with a gateway sidecar receives a
  committed browser-originated local write
- **THEN** workspace auto-save writes the same deterministic storage snapshots
  and referenced media payloads as `formless save`
- **AND** browser IndexedDB state is not used as the source of truth
- **AND** `formless save` remains available as an explicit flush or retry
  action
- **AND** remote pull, push, and destroy remain explicit CLI or gateway
  operations

#### Scenario: Workspace operation state vocabulary

- **WHEN** CLI output, gateway operation state, browser workspace status, or
  tests report workspace save, check, pull, or push results
- **THEN** reviewable workspace source paths and counts are reported with
  workspace state, storage state, app state, instance state, storage snapshot,
  or media payload terminology
- **AND** archive terminology is used only when the operation exports, imports,
  restores, backs up, or composes a portable archive envelope

#### Scenario: Check workspace source

- **WHEN** a user runs `formless save --check` and local Authority state differs
  from the reviewable workspace source
- **THEN** the command fails and reports that workspace source must be refreshed
- **AND** it does not rewrite storage snapshot or media files

### Requirement: Sync Omits Upgrade Planning

The Site CLI SHALL keep push and pull focused on synchronizing current
workspace and target state rather than running upgrade or migration policy.

#### Scenario: Push does not run upgrade planning

- WHEN `formless push` or `formless push --dry-run` runs
- THEN it does not build a CLI upgrade plan, require migration policy input,
  require backup evidence for migrations, require manual migration approval, or
  apply package app or storage migrations
- AND unsupported schema, package, runtime, or archive facts fail through the
  ordinary sync validation path
- AND migration and upgrade policy can be reintroduced later as a new explicit
  capability without preserving the removed push/deploy flags

### Requirement: Site CLI Media Package Boundary

The system SHALL keep Site CLI save, pull, and push behavior stable
while consuming Media contracts from public package subpaths.

#### Scenario: Archive workflows use Media contract

- GIVEN Site CLI save, pull, or push workflows validate or
  move core media payloads
- WHEN they need media asset, storage key, delivery, or restore result shapes
- THEN they use public Media package contracts

#### Scenario: Existing archive behavior remains stable

- GIVEN Site CLI workflows move referenced owned image media
- WHEN media is represented in workspace source or sync payloads
- THEN media is represented with core media objects and the `core-media-assets`
  capability
- AND records do not receive provider-specific URLs

### Requirement: Instance Workspace

The system SHALL manage reviewable Formless workspaces whose `formless.json`
manifests describe workspace layout and local configuration while instance
intent lives in schema-owned storage snapshots.

#### Scenario: Pull from remote target

- **WHEN** `formless pull` runs for a workspace targeting a remote Formless
  instance
- **THEN** target control-plane records, app storage snapshots, and media
  payloads are written into workspace source
- **AND** app storage snapshot files and media payloads absent from the target
  are removed from workspace source
- **AND** target schema, app install records, routes, deployment config intent,
  and other schema-owned control-plane records replace the corresponding local
  workspace source
- **AND** raw provider state, Alchemy state, deployment observation cache fields,
  deployment execution history, and provider evidence are not written into
  reviewable workspace source
- **AND** `formless pull --dry-run` reports the local source changes that would
  be written without rewriting workspace source
- **AND** if local workspace source already matches the target, pull reports
  `Everything up to date.`
- **AND** the no-op message is exact and is not accompanied by sync plan, drift,
  deploy, migration, retry, or warning text
- **AND** pull and push select the remote HTTP origin from an enabled
  `deployment-config.targetUrl` record rather than `formless.json`

#### Scenario: Push to remote target

- **WHEN** `formless push` runs with ready workspace source
- **THEN** it reconciles the selected remote target so remote runtime code,
  provider resources, control-plane records, app records, schema, and media
  match local workspace source
- **AND** if the target already matches workspace source and deployment desired
  state, push exits without restore or provider mutation and reports
  `Everything up to date.`
- **AND** the no-op message is exact and is not accompanied by sync plan, drift,
  deploy, migration, retry, or warning text
- **AND** `formless push --dry-run` reports the sync plan without mutating local
  source, remote data, Cloudflare resources, or Alchemy state
- **AND** push trusts the local workspace as the selected source and does not
  refuse because the remote target differs from it

### Requirement: Push Provider Reconciliation

The system SHALL keep push and destroy credential-scoped while making projected
deployment resource graphs the only normal provider mutation input for
workspace-controlled deployment intent.

#### Scenario: First workspace push

- **GIVEN** a local Formless workspace has saved workspace source and no remote
  target
- **WHEN** `formless push` runs with a validated Formless-owned Cloudflare
  OAuth credential reference available to the CLI or trusted local deployer
- **THEN** the deployment uses the instance runtime profile
- **AND** the deployment does not require installed app records or app storage
  snapshots
- **AND** display-safe target facts are copied to ignored `.formless/` deploy
  state
- **AND** the deployer refreshes the Formless-owned Cloudflare OAuth access
  token just in time before provider mutation
- **AND** the fresh access token is passed to Alchemy as an external bearer
  token through `apiToken` or `CLOUDFLARE_API_TOKEN`
- **AND** Formless-owned OAuth credentials are not written to Alchemy OAuth
  profiles or browser-visible records
- **AND** provider credentials, OAuth refresh tokens, Alchemy secrets,
  automation admin tokens, and owner setup tokens are stored only under ignored
  secret state
- **AND** when push creates an owner setup capability, CLI output displays
  the intended owner setup URL for passkey-backed first-owner setup
- **AND** workspace source is restored or pushed through runtime APIs before
  remote data mutation is considered complete
- **AND** Worker, Durable Object, R2, DNS, and custom-domain resources are
  reconciled through tracked Alchemy desired state as an internal push deploy
  step
- **AND** Worker upload, R2, Turnstile, route-derived custom-domain resources,
  DNS resources, tracked Alchemy state, and domain cleanup runners receive the
  refreshed token through explicit provider options when a Formless-owned
  credential reference is used
- **AND** redirect source hosts are reconciled as Worker custom-domain
  resources in the internal push deploy step

#### Scenario: Route removal pushes provider deletion

- **GIVEN** workspace source no longer contains an enabled route that previously
  projected custom-domain or DNS provider resources
- **WHEN** `formless push` runs with a validated Formless-owned Cloudflare
  OAuth credential reference and ignored deploy state available
- **THEN** the CLI or trusted local deployer omits those resources from tracked
  Alchemy desired state
- **AND** Alchemy removes the omitted tracked provider resources
- **AND** push may patch the target deployment config's latest observation
  cache with the exact desired-state hash and display-safe result summary

#### Scenario: Workspace destroy

- **GIVEN** a local Formless workspace targets a Cloudflare-backed instance
- **WHEN** `formless destroy --confirm <workerName>` runs with a validated
  Formless-owned Cloudflare OAuth credential reference and ignored deploy state
  available
- **THEN** the selected target's Worker, Durable Object namespace, R2 media
  bucket, Worker assets, Worker secrets, custom-domain provider resources, DNS
  provider resources, and Alchemy deploy state are
  destroyed through tracked selected deploy state
- **AND** `formless.json`, instance archives, and app archives remain in place
- **AND** ignored deploy state for the selected target is removed or marked
  destroyed only after provider destroy succeeds
- **AND** provider credentials and admin tokens remain outside workspace
  manifests, portable archives, browser responses, and spec artifacts

#### Scenario: Destroy confirmation

- **GIVEN** a workspace targets a Cloudflare-backed instance
- **WHEN** `formless destroy` runs without `--confirm <workerName>` matching the
  selected deployment Worker name
- **THEN** the command fails before Cloudflare or Alchemy mutation

#### Scenario: Authenticated instance target context

- **WHEN** CLI pull, push, push dry-run, pull dry-run, or owner setup workflows
  contact a selected deployed instance target
- **THEN** the CLI resolves one target context containing the normalized target
  URL, ignored local secret state, environment overrides, and optional explicit
  admin token
- **AND** protected management reads and writes use that resolved admin bearer
  authorization consistently
- **AND** logs and reviewable workspace source do not include admin bearer
  tokens, owner setup tokens, provider credentials, or other runtime secrets

#### Scenario: Owner setup command uses focused bootstrap reads

- **WHEN** owner setup is incomplete and the CLI prepares an owner setup URL
- **THEN** the command reads only the selected target, owner setup status, and
  resolved admin bearer authorization needed to create the setup capability
- **AND** it does not require installed app registry, route, deployment status,
  archive, or browser owner session reads before the first owner passkey exists

### Requirement: Schema Control-Plane Protocol

The Site CLI SHALL use the instance protocol and local workspace operation layer
to query, write, save, and compare schema-owned `app-install`, `route`, and
deployment intent records.

#### Scenario: CLI reads deployment records

- **WHEN** CLI pull, push, push dry-run, or pull dry-run workflows need instance
  control-plane state
- **THEN** they read allowed `app-install`, `route`, and
  `deployment-config` records through the instance control-plane protocol or
  workspace storage snapshots
- **AND** deployment config credential references remain display-safe pointers
  to CLI, local gateway, or runner-held Formless credential secret locations
- **AND** provider credentials remain in those secret locations
- **AND** deployment observation, evidence, cleanup, sync, and status summaries
  are read through read-only deployment runtime projection or local gateway
  operation responses rather than control-plane storage snapshots
- **AND** latest persisted deployment status is read from display-safe
  deployment config observation cache fields

#### Scenario: CLI push writes latest observation

- **WHEN** `formless push` starts against a schema-owned target
- **THEN** it reads the current desired-state projection and applies the
  projected resource graph through the local deployment adapter
- **AND** the local deployment adapter receives a fresh Formless-refreshed
  Cloudflare OAuth access token rather than resolving an Alchemy OAuth profile
- **AND** after provider reconciliation or failure it patches the target
  deployment config's display-safe latest observation cache
- **AND** runner-held credentials remain outside browser, archive, record
  source, and workspace manifest responses

#### Scenario: Push dry-run remains read-only

- **WHEN** `formless push --dry-run` compares local workspace source, remote
  instance source, or deployment projection
- **THEN** it reports a sync plan without patching deployment config
  observation cache fields

#### Scenario: CLI reads app routes

- **WHEN** an instance workspace needs installed app or public Site route state
- **THEN** the CLI reads `app-install` and `route` records
- **AND** route changes are reported by comparing route records rather than
  hand-derived install route strings or manifest route summaries
