## ADDED Requirements

### Requirement: Local Gateway Deployment Operations

The deployment runtime SHALL allow local workspace gateway deploy operations to
plan and apply deployment state while preserving exact-version and credential
boundaries.

#### Scenario: Browser starts credential setup

- **WHEN** a browser starts Cloudflare credential setup through the local
  workspace gateway before deploy planning
- **THEN** the gateway may run the trusted local Alchemy profile adapter and
  return display-safe authorization URL events
- **AND** deployment intent records store only provider references, account
  facts, and validation status after credentials are validated
- **AND** the first browser onboarding flow does not create Cloudflare API
  tokens or request token-management credentials from browser input

#### Scenario: Browser starts deploy plan

- **WHEN** a browser starts a deploy plan through the local workspace gateway
- **THEN** the gateway reads schema-owned deployment intent records, resolves
  local credential context outside browser-visible responses, and reads the
  exact desired-state version
- **AND** the browser receives display-safe plan output without provider API
  tokens, Alchemy passwords, Alchemy state tokens, raw lease tokens, or runtime
  secrets

#### Scenario: Browser starts deploy apply

- **WHEN** a browser starts deploy apply through the local workspace gateway
- **THEN** the gateway applies provider mutations as a trusted local deployer
  and writes deployment attempt, success, failure, evidence, or drift results
  for the exact desired-state version
- **AND** the deployment runtime rejects stale desired-state version or hash
  writeback
- **AND** the gateway returns display-safe attempt, evidence, drift, cleanup,
  and writeback summaries through operation status or completion responses
- **AND** deployment execution history is not written as schema-owned workspace
  source records

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
