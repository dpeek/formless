## MODIFIED Requirements

### Requirement: CLI Command Families

The package SHALL expose local workspace onboarding, workspace operation,
archive, advanced instance, domain, token, and destroy command families from the
`formless` CLI.

#### Scenario: Local workspace commands

- GIVEN the package CLI is installed
- WHEN a user runs `formless onboard`, `formless dev`, `formless save`,
  `formless check`, `formless deploy`, or `formless destroy`
- THEN the command operates on the local Formless workspace selected by
  `formless.json`
- AND `formless onboard`, `formless dev`, `formless save`, and
  `formless check` do not mutate Cloudflare resources
- AND `formless deploy` and `formless destroy` are explicit Cloudflare
  deployment boundaries

#### Scenario: Instance commands

- GIVEN a Formless workspace exists
- WHEN a user runs `formless instance status`, `pull`, `check`, `push`, `dev`,
  `reset-local`, `deploy`, or `destroy`
- THEN the command operates on the selected instance workspace
- AND workspace-local runtime state stays separate from remote instance state

### Requirement: Domain And Deploy Commands

The system SHALL keep deployment, destroy, remote provider apply, and fallback
Cloudflare domain mutations explicit and credential-scoped.

#### Scenario: First workspace deploy

- GIVEN a local Formless workspace has saved archive source and no remote target
- WHEN `formless deploy` runs with Cloudflare credentials available to the CLI
- THEN the deployment uses the instance runtime profile
- AND deploy metadata is verified after upload
- AND target and deploy intent are written to `formless.json`
- AND display-safe Cloudflare target facts are copied to ignored `.formless/`
  deploy state
- AND Cloudflare API tokens, Alchemy secrets, automation admin tokens, and owner
  setup tokens are stored only under ignored `.formless/` state
- AND saved workspace archives are dry-run restored before remote data mutation
  is applied
- AND saved workspace archives are pushed after deploy verification unless
  target identity or remote drift requires explicit acknowledgement

#### Scenario: Instance deploy

- GIVEN a workspace has a configured remote target
- WHEN `formless instance deploy` runs
- THEN the deployment uses the instance runtime profile
- AND deploy metadata is verified after upload

#### Scenario: Workspace destroy

- GIVEN a local Formless workspace targets a Cloudflare-backed instance
- WHEN `formless destroy --confirm <workerName>` runs with Cloudflare
  credentials and ignored deploy state available to the CLI
- THEN the selected target's Worker, Durable Object namespace, R2 media bucket,
  Worker assets, Worker secrets, custom-domain provider resources, DNS provider
  resources, redirect provider resources, and Alchemy deploy state are destroyed
- AND `formless.json`, instance archives, and app archives remain in place
- AND ignored deploy state for the selected target is removed or marked
  destroyed only after provider destroy succeeds
- AND provider credentials and admin tokens remain outside workspace manifests,
  portable archives, browser responses, and spec artifacts

#### Scenario: Instance destroy

- GIVEN a workspace has a configured remote target
- WHEN `formless instance destroy --confirm <workerName>` runs with Cloudflare
  credentials and ignored deploy state available to the CLI
- THEN the selected target's Worker, Durable Object namespace, R2 media bucket,
  Worker assets, Worker secrets, custom-domain provider resources, DNS provider
  resources, redirect provider resources, and Alchemy deploy state are destroyed
- AND reviewable workspace source remains unchanged

#### Scenario: Destroy confirmation

- GIVEN a workspace targets a Cloudflare-backed instance
- WHEN `formless destroy` or `formless instance destroy` runs without
  `--confirm <workerName>` matching the selected deployment Worker name
- THEN the command fails before Cloudflare or Alchemy mutation

#### Scenario: Destroy with enabled domain intent

- GIVEN a workspace contains enabled domain intent for the selected target
- WHEN `formless destroy --confirm <workerName>` or
  `formless instance destroy --confirm <workerName>` runs with default Alchemy
  Cloudflare credentials available to the CLI
- THEN the command destroys the enabled domain provider resources in the same
  Alchemy app and stage as the selected instance Worker, Durable Object
  namespace, and R2 media bucket
- AND no separate domain delete command is required for resources owned by that
  instance Alchemy app

#### Scenario: Domain apply

- GIVEN workspace domain intent contains enabled exact-host profile mappings and Cloudflare credentials are available to the CLI or provider runner
- WHEN a domain apply command runs
- THEN preflight checks run before mutation
- AND domain provider resources for the selected target are recorded under the
  same Alchemy app, stage, and deploy state root as the selected instance Worker,
  Durable Object namespace, and R2 media bucket
- AND browser clients, portable archives, and workspace manifests do not receive Cloudflare API credentials

#### Scenario: Automation admin token

- GIVEN an instance workspace needs automation write access
- WHEN `formless instance token adopt` or `rotate` runs
- THEN ignored workspace secret state stores the automation admin token
- AND the reviewable workspace manifest does not store the secret
