## ADDED Requirements

### Requirement: Action Access Policy Schema

The system SHALL parse action access policy from app schema data.

#### Scenario: Parse anonymous action access

- **WHEN** an app schema declares an action with anonymous public access
- **THEN** schema parsing preserves the action access policy for runtime execution
- **AND** generated admin action behavior remains separate from public execution policy

#### Scenario: Reject unsupported public action policy

- **WHEN** an app schema declares a public action policy with an unsupported actor mode, challenge, or origin rule
- **THEN** schema parsing fails
- **AND** the invalid app schema is not used for generated UI or writes

### Requirement: Public Action Input Contract

The system SHALL let app schemas declare the public input accepted by public
actions.

#### Scenario: Parse public input fields

- **WHEN** an app schema declares public input fields for an action
- **THEN** schema parsing validates field names, scalar types, required flags, and labels
- **AND** the parsed action exposes that input contract to the public action executor

#### Scenario: Require public input for anonymous action

- **WHEN** an app schema declares anonymous public access for an action
- **THEN** schema parsing requires an explicit public input contract
- **AND** anonymous callers cannot submit undeclared record values directly

### Requirement: Public Action Kind Eligibility

The system MUST only expose action kinds that are safe for public execution
through public action policy.

#### Scenario: Reject ineligible action kind

- **WHEN** an action kind has no public execution module
- **THEN** schema parsing rejects anonymous public access for that action
- **AND** the action can still exist for generated admin use when its non-public schema is valid

#### Scenario: Subscribe action kind is eligible

- **WHEN** an app schema declares the subscribe action kind with anonymous public access and valid public input
- **THEN** schema parsing accepts the action
- **AND** the runtime can dispatch it through the public action executor
