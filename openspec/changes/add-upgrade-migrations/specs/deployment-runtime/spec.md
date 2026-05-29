## ADDED Requirements

### Requirement: Runtime Upgrade Facts

The deployment runtime SHALL expose upgrade-relevant runtime facts for exact
deploy and upgrade planning.

#### Scenario: Metadata includes upgrade facts

- **WHEN** a client reads deploy metadata for a Formless instance
- **THEN** the response includes package version, runtime protocol version,
  storage migration set identity, and bundled package app revision/hash facts
- **AND** the response does not expose provider credentials, admin tokens,
  Alchemy state, raw lease tokens, or runtime secrets
- **AND** the response is not cached

#### Scenario: Exact deploy verifies upgrade facts

- **WHEN** a CLI deploys runtime code for an instance
- **THEN** post-deploy verification compares expected upgrade facts with the
  deployed metadata response
- **AND** data migrations do not run when metadata verification fails

### Requirement: Upgrade-Aware Desired State

The deployment runtime SHALL keep deployment desired-state versioning separate
from runtime upgrade metadata while allowing CLI workflows to display both.

#### Scenario: Desired state remains provider intent

- **WHEN** a client reads deployment desired state
- **THEN** desired-state hash and revision still describe deployment-facing
  resource intent
- **AND** runtime package version, migration set, and package app revisions do
  not change the desired-state hash unless they change resource intent
