## ADDED Requirements

### Requirement: Normal Provider Mutation Path

The system SHALL use generic deployment attempts as the only normal provider
mutation path for control-plane desired resources.

#### Scenario: Apply control-plane desired resources

- **WHEN** a CLI, browser workspace gateway, CI job, or trusted deploy node
  applies control-plane desired resources
- **THEN** it starts or reuses a deployment attempt for the exact desired-state
  version and target
- **AND** provider mutation is performed through the deployer for the desired
  resource graph
- **AND** successful or failed results are written back to the deployment
  runtime for that exact desired-state version

#### Scenario: Domain-specific apply is not a normal mutation path

- **WHEN** route records project DNS, custom-domain, or redirect resources
- **THEN** those resources are applied through the same deployment attempt model
  as Worker and R2 resources
- **AND** domain-specific provider apply commands do not bypass deployment
  attempts, leases, evidence, drift, or status

#### Scenario: Cleanup can remain explicit

- **GIVEN** provider evidence exists for a resource that requires manual cleanup,
  explicit deletion, or out-of-band repair
- **WHEN** an authorized cleanup workflow selects that evidence
- **THEN** cleanup may mutate the selected provider resource or evidence outside
  normal deploy apply
- **AND** cleanup does not change control-plane desired resources unless a
  separate authorized intent write is submitted

## MODIFIED Requirements

### Requirement: Deployer Protocol Boundary

The system SHALL keep deployer execution outside the runtime while making
provider mutation, writeback, cleanup, and audit behavior exact.

#### Scenario: External deployer apply

- **WHEN** a CLI, browser workspace gateway, CI job, or trusted deploy node
  applies desired state
- **THEN** it fetches the desired-state version, resolves provider context and
  secrets outside the runtime desired-state response, plans and applies through
  Alchemy or another provider adapter, and writes back the result for the exact
  desired-state version
- **AND** Worker, R2, DNS, custom-domain, redirect, and other control-plane
  desired resources use the same deployer protocol boundary

#### Scenario: Runtime does not expose mutation secrets

- **WHEN** browser clients, workspace manifests, portable archives, or
  desired-state reads inspect deployment state
- **THEN** provider API tokens, Alchemy passwords, and Alchemy state tokens are
  not returned

#### Scenario: Explicit cleanup stays selected

- **GIVEN** recorded provider evidence requires cleanup outside normal deploy
  apply
- **WHEN** a cleanup workflow writes result evidence
- **THEN** the writeback identifies the selected resource or evidence row
- **AND** the runtime does not infer cleanup from route intent deletion alone
