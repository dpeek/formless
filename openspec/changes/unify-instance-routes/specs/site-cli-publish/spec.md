## MODIFIED Requirements

### Requirement: Instance Workspace

The system SHALL manage reviewable Formless workspaces whose `formless.json`
manifests describe workspace layout and local configuration while instance
intent lives in schema-owned record source.

#### Scenario: Pull and check

- **GIVEN** an instance workspace targets a remote Formless instance
- **WHEN** `formless instance pull` runs and then `formless instance check`
  runs
- **THEN** target instance archives, app archives, and control-plane record
  source are written into the workspace
- **AND** check reports app, route, domain, redirect, deployment, app record,
  and media drift against the selected target from schema-owned records

#### Scenario: Push apply

- **GIVEN** workspace source is ready and target drift is acknowledged when
  needed
- **WHEN** `formless instance push --apply` runs
- **THEN** the workflow takes a fresh whole-instance backup
- **AND** dry-runs before applying the composed instance archive restore

### Requirement: Domain And Deploy Commands

The system SHALL keep deployment, destroy, remote provider apply, and fallback
Cloudflare domain mutations explicit and credential-scoped while using route
records for domain and redirect intent.

#### Scenario: First workspace deploy

- **GIVEN** a local Formless workspace has saved source and no remote target
- **WHEN** `formless deploy` runs with Cloudflare credentials available to the
  CLI or local workspace gateway
- **THEN** the deployment uses the instance runtime profile
- **AND** deploy metadata is verified after upload
- **AND** target, deploy, domain, and redirect intent are written to
  schema-owned control-plane record source, not duplicated in `formless.json`
- **AND** domain and redirect intent is written as `instance:route` records
- **AND** display-safe Cloudflare target facts are copied to ignored
  `.formless/` deploy state
- **AND** Cloudflare API tokens, Alchemy secrets, automation admin tokens, and
  owner setup tokens are stored only under ignored `.formless/` state
- **AND** saved workspace source is dry-run restored before remote data
  mutation is applied
- **AND** saved workspace source is pushed after deploy verification unless
  target identity or remote drift requires explicit acknowledgement

#### Scenario: Instance deploy

- **GIVEN** a claimed instance workspace is configured
- **WHEN** `formless instance deploy` runs
- **THEN** the deployment uses the instance runtime profile
- **AND** deploy metadata is verified after upload
- **AND** custom-domain, DNS, and redirect desired resources are projected from
  enabled `instance:route` records

#### Scenario: Workspace destroy

- **GIVEN** a local Formless workspace targets a Cloudflare-backed instance
- **WHEN** `formless destroy --confirm <workerName>` runs with Cloudflare
  credentials and ignored deploy state available to the CLI
- **THEN** the selected target's Worker, Durable Object namespace, R2 media
  bucket, Worker assets, Worker secrets, custom-domain provider resources, DNS
  provider resources, redirect provider resources, and Alchemy deploy state are
  destroyed
- **AND** custom-domain, DNS, and redirect desired resources are derived from
  enabled `instance:route` records instead of separate domain or redirect
  records
- **AND** reviewable workspace source remains unchanged
- **AND** provider credentials and admin tokens remain outside workspace
  manifests, record source, portable archives, browser responses, and spec
  artifacts

#### Scenario: Instance destroy

- **GIVEN** a workspace has a configured remote target
- **WHEN** `formless instance destroy --confirm <workerName>` runs with
  Cloudflare credentials and ignored deploy state available to the CLI
- **THEN** the selected target's Worker, Durable Object namespace, R2 media
  bucket, Worker assets, Worker secrets, custom-domain provider resources, DNS
  provider resources, redirect provider resources, and Alchemy deploy state are
  destroyed
- **AND** custom-domain, DNS, and redirect desired resources are derived from
  enabled `instance:route` records instead of separate domain or redirect
  records
- **AND** reviewable workspace source remains unchanged

#### Scenario: Domain apply

- **GIVEN** workspace route intent contains enabled exact-host mount routes or
  redirect routes and Cloudflare credentials are available to the CLI or
  provider runner
- **WHEN** a domain apply command runs
- **THEN** preflight checks run before mutation
- **AND** domain provider resources for the selected target are recorded under
  the same Alchemy app, stage, and deploy state root as the selected instance
  Worker, Durable Object namespace, and R2 media bucket
- **AND** browser clients, portable archives, record source, and workspace
  manifests do not receive Cloudflare API credentials

#### Scenario: Automation admin token

- **GIVEN** an instance workspace needs automation write access
- **WHEN** `formless instance token adopt` or `rotate` runs
- **THEN** ignored workspace secret state stores the automation admin token
- **AND** the reviewable workspace manifest and record source do not store the
  secret

### Requirement: Schema Control-Plane Protocol

The Site CLI SHALL use the instance protocol and local workspace operation
layer to query, write, save, and compare schema-owned app install, route, and
deployment records when the target supports them.

#### Scenario: CLI reads deployment records

- **GIVEN** a claimed instance workspace targets a runtime with schema-owned
  control-plane records
- **WHEN** CLI status, check, pull, push, plan, deploy, or domain workflows need
  instance control-plane state
- **THEN** they read allowed app install, route, and deployment records through
  the instance control-plane protocol or workspace record source
- **AND** provider credentials remain in CLI, gateway, or runner-held secret
  locations

#### Scenario: CLI binds exact desired-state version

- **GIVEN** `formless instance domains run-apply` or a deployment command starts
  against a schema-owned target
- **WHEN** the command reads desired deployment state
- **THEN** it binds existing deployment-runtime attempt and writeback calls to
  the exact desired-state version and idempotency key
- **AND** runner-held credentials remain outside browser, archive, record
  source, and workspace manifest responses

#### Scenario: CLI reads app routes

- **GIVEN** an instance workspace needs installed app, public Site, exact-host,
  or redirect route state
- **WHEN** route state is available as schema-owned records
- **THEN** the CLI reads `app-install` and `route` records
- **AND** route drift is reported by comparing route records rather than
  hand-derived install route strings, domain mapping records, redirect records,
  or manifest route summaries

### Requirement: Compatible Domain Commands

The Site CLI SHALL keep existing domain command surfaces stable while domain
and redirect intent moves to `route` records.

#### Scenario: Existing command output

- **GIVEN** users run existing domain remote-plan, run-apply, run-delete,
  forget, manual cleanup, or direct fallback commands
- **WHEN** those commands execute
- **THEN** command names and credential boundaries remain stable
- **AND** output may include schema-owned route and deployment record ids when
  available
