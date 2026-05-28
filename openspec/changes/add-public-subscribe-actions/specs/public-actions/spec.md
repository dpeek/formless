## ADDED Requirements

### Requirement: Action Access Policy

The system SHALL let schema-declared actions opt in to public execution through
an explicit access policy.

#### Scenario: Reject action without public policy

- **WHEN** an anonymous request targets a schema action that has no public access policy
- **THEN** the request is rejected
- **AND** no action effects are committed

#### Scenario: Anonymous action is eligible

- **WHEN** an anonymous request targets a schema action whose access policy allows anonymous public execution
- **THEN** the public action executor evaluates the request through the public action path
- **AND** the executor does not require owner session or admin bearer authorization for that request

### Requirement: Target-Scoped Public Action API

The system SHALL expose public action execution through target-scoped public
action endpoints instead of generic mutation or action endpoints.

#### Scenario: Installed app public action route

- **WHEN** a visitor posts to `/api/app-installs/:packageAppKey/:installId/public/actions/:actionName`
- **THEN** the runtime resolves the matching installed app storage identity
- **AND** public action effects are committed only to that app storage identity

#### Scenario: Schema-key public action route

- **WHEN** a visitor posts to `/api/:schemaKey/public/actions/:actionName`
- **THEN** the runtime resolves the matching schema-key storage identity
- **AND** public action effects are committed only to that schema-key storage identity

#### Scenario: Generic write routes stay protected

- **WHEN** a visitor without owner session or admin bearer authorization posts to generic `/mutations` or `/actions`
- **THEN** the request is rejected by the write guard
- **AND** the public action policy is not evaluated through those generic routes

### Requirement: Public Action Execution Envelope

The system SHALL normalize each public action request into an execution envelope
before validating input or committing effects.

#### Scenario: Anonymous execution envelope

- **WHEN** an anonymous public action request is accepted for evaluation
- **THEN** the envelope includes actor mode `anonymous`, target app storage identity, action name, request host, request path, source block id when supplied, public input, proof data, idempotency key, and received timestamp

#### Scenario: Source context is preserved

- **WHEN** a public action commits records
- **THEN** committed records or action response metadata include enough source context to identify the action, target app storage identity, host, path, and Site block that caused the write

### Requirement: Public Input Validation

The system MUST validate public action input against the action's public input
contract before challenge verification commits records.

#### Scenario: Unknown public input field

- **WHEN** a public action request includes a field not declared by the action public input contract
- **THEN** the request is rejected
- **AND** no action effects are committed

#### Scenario: Invalid public input field

- **WHEN** a public action request includes a declared field with an invalid value
- **THEN** the request is rejected with a public-safe validation error
- **AND** no action effects are committed

### Requirement: Turnstile Challenge

The system SHALL support Turnstile as an anonymous public action challenge.

#### Scenario: Verify Turnstile before write

- **WHEN** a public action access policy requires Turnstile
- **THEN** the executor validates the submitted Turnstile token server-side before committing action effects
- **AND** failed, missing, expired, or replayed verification rejects the request without committing records

#### Scenario: Keep Turnstile secrets server-side

- **WHEN** Site trees, public HTML, browser state, snapshots, archives, or bootstrap data are produced
- **THEN** Turnstile secret values are not included
- **AND** only public widget site keys required for rendering may reach the browser

### Requirement: Public Action Idempotency

The system SHALL make public action execution replay-safe for client retries.

#### Scenario: Replay same idempotency key

- **WHEN** the same public action request is replayed with the same idempotency key for the same target storage identity and action
- **THEN** the runtime returns the existing accepted outcome
- **AND** duplicate records are not created

#### Scenario: Failed request does not reserve successful outcome

- **WHEN** a public action request fails input validation or challenge validation
- **THEN** a later valid request with the same visitor input can still commit normally
