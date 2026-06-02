## MODIFIED Requirements

### Requirement: CLI Command Families

The package SHALL expose local workspace onboarding, workspace operation,
archive, explicit cleanup, token, and destroy command families from the
`formless` CLI while keeping top-level workspace commands as the normal product
path.

#### Scenario: Local workspace commands

- **GIVEN** the package CLI is installed
- **WHEN** a user runs `formless onboard`, `formless dev`, `formless save`,
  `formless check`, `formless deploy`, or `formless destroy`
- **THEN** the command operates on the local Formless workspace selected by
  `formless.json`
- **AND** `formless onboard`, `formless dev`, `formless save`, and
  `formless check` do not mutate Cloudflare resources
- **AND** `formless deploy` and `formless destroy` are explicit Cloudflare
  deployment boundaries

#### Scenario: Archive and import commands

- **GIVEN** the package CLI is installed
- **WHEN** a user runs archive export, restore, or `archive import-site`
- **THEN** portable archive and legacy standalone Site import behavior remains
  available
- **AND** those commands do not present standalone Site publish as a deploy path

#### Scenario: Removed deploy entrypoint commands

- **GIVEN** a user runs `bun run site:publish`,
  `formless instance domains apply`, or
  `formless instance domains run-apply`
- **WHEN** the command is parsed or invoked
- **THEN** the command fails before Cloudflare, Alchemy, Authority, or provider
  mutation
- **AND** output directs the user to `formless deploy` for workspace-controlled
  provider mutation

#### Scenario: Explicit cleanup commands

- **GIVEN** recorded provider evidence exists
- **WHEN** a user runs a supported explicit cleanup or delete command with the
  required host, resource kind, logical id, target, and authorization inputs
- **THEN** the command targets recorded provider evidence only
- **AND** route intent, workspace source, and app data are not mutated by the
  cleanup command

### Requirement: Domain And Deploy Commands

The system SHALL keep deployment, destroy, and explicit provider cleanup
credential-scoped while making generic deployment attempts the only normal
provider mutation path for workspace-controlled deploy intent.

#### Scenario: First workspace deploy

- **GIVEN** a local Formless workspace has saved workspace source and no remote
  target
- **WHEN** `formless deploy` runs with required provider credentials available
  to the CLI or trusted local deployer
- **THEN** the deployment uses the instance runtime profile
- **AND** deploy metadata is verified after upload
- **AND** display-safe target facts are copied to ignored `.formless/` deploy
  state
- **AND** provider credentials, Alchemy secrets, automation admin tokens, and
  owner setup tokens are stored only under ignored secret state
- **AND** workspace source is restored or pushed through runtime APIs before
  remote data mutation is considered complete
- **AND** Worker, Durable Object, R2, DNS, custom-domain, and redirect resources
  are applied through the generic deployment path

#### Scenario: Workspace destroy

- **GIVEN** a local Formless workspace targets a Cloudflare-backed instance
- **WHEN** `formless destroy --confirm <workerName>` runs with provider
  credentials and ignored deploy state available
- **THEN** the selected target's Worker, Durable Object namespace, R2 media
  bucket, Worker assets, Worker secrets, custom-domain provider resources, DNS
  provider resources, redirect provider resources, and Alchemy deploy state are
  destroyed through selected deploy state
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

#### Scenario: Domain apply removed

- **GIVEN** workspace route records create DNS, custom-domain, or redirect
  desired resources
- **WHEN** a user attempts a domain-specific provider apply command
- **THEN** the command fails before provider mutation
- **AND** output directs the user to run `formless deploy`
- **AND** browser clients, portable archives, workspace manifests, and command
  errors do not receive Cloudflare API credentials

#### Scenario: Automation admin token

- **GIVEN** an instance workspace needs automation write access
- **WHEN** a supported token adopt or rotate command runs
- **THEN** ignored workspace secret state stores the automation admin token
- **AND** reviewable workspace source does not store the secret

### Requirement: Deployment-Aware Domain Runner CLI

The Site CLI SHALL retire domain-specific provider apply commands once generic
deployment attempts cover route-derived provider resources, while keeping
explicit provider cleanup available for recorded evidence.

#### Scenario: Domain runner apply removed

- **GIVEN** a claimed instance workspace has route-derived domain intent
- **WHEN** `formless instance domains run-apply` is invoked
- **THEN** the command fails before creating a provider apply job or mutating
  provider resources
- **AND** output directs the user to `formless deploy`

#### Scenario: Domain cleanup remains explicit

- **GIVEN** recorded provider evidence exists for a host, resource kind, and
  logical id
- **WHEN** a supported explicit provider delete or manual cleanup command runs
- **THEN** the command mutates only the selected provider evidence or selected
  recorded provider resource
- **AND** cleanup output includes the deployment or provider evidence ids needed
  for audit when available

### Requirement: Compatible Domain Commands

The Site CLI SHALL keep domain inspection and explicit cleanup command surfaces
available where they expose behavior not replaced by workspace deploy.

#### Scenario: Domain inspection output

- **GIVEN** users inspect domain, route, deployment, drift, or provider evidence
  state
- **WHEN** a supported non-mutating command executes
- **THEN** output may include schema-owned route, desired resource, deployment
  attempt, evidence, and drift record ids
- **AND** the command does not mutate provider resources

#### Scenario: Removed direct fallback output

- **GIVEN** users run a removed direct fallback or domain apply command
- **WHEN** the command executes
- **THEN** output identifies the command as retired
- **AND** output points to `formless deploy` for provider mutation or explicit
  cleanup commands for selected recorded evidence
