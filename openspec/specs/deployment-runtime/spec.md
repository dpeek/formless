# Deployment Runtime Specification

## Purpose

Deployment runtime versions Formless deployment intent for supported instance
targets, coordinates exact-version deployment attempts, and stores audit/status
summaries while deployers and Alchemy own provider mutation and provider
resource state.

## Requirements

### Requirement: Versioned Desired Deployment State

The system SHALL expose immutable desired deployment state versions for a
supported deployment target.

#### Scenario: Read latest desired state

- WHEN a client reads desired deployment state for a target
- THEN the response includes a desired-state version id, monotonic revision,
  stable hash, schema version, target id, resource graph, and display summary
- AND targets backed by schema-owned control-plane records project the resource
  graph from app route, domain mapping, redirect, provider config reference, and
  desired resource records for that target
- AND the response does not include provider credentials, Alchemy passwords,
  state tokens, raw lease tokens, or runtime secrets
- AND the response is not cached

#### Scenario: Desired state hash stability

- WHEN user intent has not changed
- THEN repeated desired-state reads for the same target produce the same hash
- AND timestamps, attempt history, evidence summaries, drift reports, and status
  display data do not change the desired-state hash

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

- WHEN desired state contains provider-managed resources
- THEN each graph resource has a stable logical id, kind, target id, provider
  family, inputs, and dependency metadata
- AND logical ids are deterministic for the same user intent

#### Scenario: Graph is not provider truth

- WHEN the resource graph is stored or returned
- THEN it represents desired resources for planning
- AND it does not claim to be the current provider resource state

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
writeback exact and auditable.

#### Scenario: External deployer apply

- WHEN a CLI, CI job, or trusted deploy node applies desired state
- THEN it fetches the desired-state version, resolves provider context and
  secrets outside the runtime desired-state response, plans and applies through
  Alchemy, and writes back the result for the exact desired-state version

#### Scenario: Runtime does not expose mutation secrets

- WHEN browser clients, workspace manifests, portable archives, or desired-state
  reads inspect deployment state
- THEN provider API tokens, Alchemy passwords, and Alchemy state tokens are not
  returned

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
