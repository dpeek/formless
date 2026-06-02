## MODIFIED Requirements

### Requirement: Local Workspace Runtime

The CLI SHALL start the local Formless workspace runtime through `formless dev`
before any Cloudflare account or deployment mutation, while browser onboarding
owns workspace initialization and first app install.

#### Scenario: Start local workspace runtime

- **WHEN** `formless dev` runs for an empty or layout-only workspace
- **THEN** the product instance runtime starts with workspace-local persistence
- **AND** first-run local runtime state starts from workspace control-plane
  record source and app archives
- **AND** the browser can complete onboarding before any Cloudflare deploy
- **AND** before owner setup is complete, the browser can use only the local
  bootstrap capability needed to read workspace status and initialize the
  resolved workspace root
- **AND** workspace initialization, first app install, save, check, credential
  setup, and deploy entry points are available through browser-owned local
  gateway operations

#### Scenario: Onboard command removed

- **WHEN** a user invokes `formless onboard`
- **THEN** the command is not exposed as a supported workspace command
- **AND** if a retained parser path sees the command during transition, it
  fails before filesystem, Authority, Cloudflare, Alchemy, or provider mutation
- **AND** output directs the user to run `formless dev` and complete setup in
  the browser

#### Scenario: Install first app locally

- **WHEN** the user installs a package app through the local web UI
- **THEN** the local Authority records schema-owned `app-install` and `route`
  records and initializes install-scoped app state
- **AND** no Cloudflare resource is mutated

### Requirement: Workspace Save From Local Authority

The CLI SHALL save local workspace runtime state from Authority-backed instance
state back to reviewable workspace record source and app archives.

#### Scenario: Save local workspace state

- **WHEN** `formless save` runs for a local Formless workspace
- **THEN** active installed app records, media payloads, and schema-owned
  control-plane intent are written to deterministic workspace record source and
  app archives
- **AND** browser IndexedDB state is not used as the source of truth
- **AND** secrets are not written to `formless.json`, record source, or archive
  files

#### Scenario: Check workspace source

- **WHEN** a user runs `formless save --check` and local Authority state differs
  from the reviewable workspace source
- **THEN** the command fails and reports that workspace source must be refreshed
- **AND** it does not rewrite record source or archive files

### Requirement: Instance Workspace

The system SHALL manage reviewable Formless workspaces whose `formless.json`
manifests describe workspace layout and local configuration while instance
intent lives in schema-owned record source.

#### Scenario: Pull and check

- **WHEN** `formless instance pull` runs and then `formless instance check` runs
  for a workspace targeting a remote Formless instance
- **THEN** target control-plane records, app archives, and media payloads are
  written into workspace source
- **AND** check reports archive and control-plane record drift against the
  selected target

#### Scenario: Push apply

- **WHEN** `formless instance push --apply` runs with ready workspace source and
  target drift acknowledged when needed
- **THEN** the workflow takes a fresh whole-instance backup
- **AND** dry-runs before applying the composed instance archive restore

### Requirement: Domain And Deploy Commands

The system SHALL keep deployment, remote provider apply, and fallback Cloudflare
domain mutations explicit and credential-scoped while using schema-owned
records for deploy and domain intent.

#### Scenario: First workspace deploy

- **WHEN** `formless deploy` runs with Cloudflare credentials available to the
  CLI or local workspace gateway
- **THEN** the deployment uses the instance runtime profile
- **AND** deploy metadata is verified after upload
- **AND** display-safe target and deploy intent are written to schema-owned
  control-plane record source, not `formless.json`
- **AND** display-safe Cloudflare target facts are copied to ignored
  `.formless/` deploy state when needed
- **AND** Cloudflare API tokens, Alchemy secrets, automation admin tokens, and
  owner setup tokens are stored only under ignored `.formless/` state
- **AND** saved workspace source is dry-run restored before remote data mutation
  is applied
- **AND** saved workspace source is pushed after deploy verification unless
  target identity or remote drift requires explicit acknowledgement

#### Scenario: Instance deploy

- **WHEN** `formless instance deploy` runs for a claimed instance workspace
- **THEN** the deployment uses the instance runtime profile
- **AND** deploy metadata is verified after upload

#### Scenario: Domain apply

- **WHEN** a domain apply command runs for enabled exact-host profile mapping
  records and Cloudflare credentials are available to the CLI, local gateway, or
  provider runner
- **THEN** preflight checks run before mutation
- **AND** browser clients, portable archives, record source, and workspace
  manifests do not receive Cloudflare API credentials

#### Scenario: Automation admin token

- **WHEN** `formless instance token adopt` or `rotate` runs for an instance
  workspace needing automation write access
- **THEN** ignored workspace secret state stores the automation admin token
- **AND** the reviewable workspace manifest and record source do not store the
  secret

### Requirement: Schema Control-Plane Protocol

The Site CLI SHALL use the instance protocol and local workspace operation layer
to query, write, save, and compare schema-owned `app-install`, `route`, and
deployment intent records.

#### Scenario: CLI reads deployment records

- **WHEN** CLI status, check, pull, push, plan, deploy, or domain workflows need
  instance control-plane state
- **THEN** they read allowed `app-install`, `route`, `deploy-target`,
  `provider-config-ref`, and `deploy-desired-resource` records through the
  instance control-plane protocol or workspace record source
- **AND** provider credentials remain in CLI, local gateway, or runner-held
  secret locations
- **AND** deployment attempt, evidence, drift, cleanup, and status summaries are
  read through deployment runtime or local gateway operation responses rather
  than control-plane record source

#### Scenario: CLI binds exact desired-state version

- **WHEN** `formless instance domains run-apply` or a deployment command starts
  against a schema-owned target
- **THEN** it binds deployment-runtime attempt and writeback calls to the exact
  desired-state version and idempotency key
- **AND** runner-held credentials remain outside browser, archive, record
  source, and workspace manifest responses

#### Scenario: CLI reads app routes

- **WHEN** an instance workspace needs installed app or public Site route state
- **THEN** the CLI reads `app-install` and `route` records
- **AND** route drift is reported by comparing route records rather than
  hand-derived install route strings or manifest route summaries
