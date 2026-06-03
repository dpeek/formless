## MODIFIED Requirements

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
