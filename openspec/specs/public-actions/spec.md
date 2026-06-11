# Public Actions Specification

## Purpose

Public operation bindings execute schema-declared entity operations for public
callers through narrow target-scoped routes while preserving protected generic
write APIs.

## Requirements

### Requirement: Public Operation Policy

The system SHALL let schema-declared operations opt in to public execution
through an explicit actor policy and public binding.

#### Scenario: Reject operation without public policy

- GIVEN an anonymous request targets a schema operation that has no public
  actor policy or public binding
- WHEN the public operation executor evaluates the request
- THEN the request is rejected
- AND no operation effects are committed
- AND the rejection is recorded as an operation invocation only after the
  target-scoped public operation route and declared operation are resolved

#### Scenario: Reject legacy action-only public metadata

- GIVEN an entity action or Site form still exposes legacy public action
  metadata without a matching source-declared operation binding
- WHEN public execution models are selected
- THEN the metadata does not create a public execution route
- AND anonymous callers cannot invoke the action through the public operation
  executor

#### Scenario: Anonymous operation is eligible

- GIVEN a schema operation policy allows anonymous public execution
- WHEN an anonymous request targets that operation
- THEN the public operation executor evaluates the request through the public
  operation path
- AND the executor does not require owner session or admin bearer authorization
  for that request

#### Scenario: Execute public operations

- GIVEN an entity operation declares anonymous public policy
- WHEN public execution models are selected
- THEN public execution invokes the operation envelope and policy model
- AND entity action metadata does not synthesize public operation bindings

#### Scenario: Execute public create operation

- GIVEN the Site schema declares `contact-message.submit` as an anonymous
  Turnstile-protected create operation
- WHEN a visitor posts declared contact message input to the target-scoped
  public operation route
- THEN the executor validates `operation.input.fields` before Turnstile
  verification
- AND successful execution commits one flat `contact-message` record
- AND the public response returns create-shaped operation output
- AND Turnstile proof values are not stored in the created record or returned in
  the public response

#### Scenario: Execute public record-plan command operation

- GIVEN a non-Site app declares an anonymous public command operation with a
  `recordPlan` effect
- WHEN a visitor posts declared input and proof data to the target-scoped public
  operation route
- THEN the executor validates the operation input contract before challenge
  verification or record materialization
- AND successful execution commits only the flat records declared by the
  operation record plan for that target app storage identity
- AND the public response exposes only the command output fields, record ids, or
  metadata allowed by the operation policy
- AND challenge proof values, provider secrets, and protected internal fields
  are not stored in committed app records or returned in the public response

### Requirement: Target-Scoped Public Operation API

The system SHALL expose public operation execution through target-scoped public
operation endpoints instead of generic mutation or action endpoints.

#### Scenario: Installed app public operation route

- GIVEN a visitor posts to `/api/app-installs/:packageAppKey/:installId/public/operations/:entityKey/:operationKey`
- WHEN the route resolves
- THEN the runtime resolves the matching installed app storage identity
- AND public operation effects are committed only to that app storage identity

#### Scenario: Schema-key public operation route

- GIVEN a visitor posts to `/api/:schemaKey/public/operations/:entityKey/:operationKey`
- WHEN the route resolves
- THEN the runtime resolves the matching schema-key storage identity
- AND public operation effects are committed only to that schema-key storage identity

#### Scenario: Generic write routes stay protected

- GIVEN a visitor lacks owner session or admin bearer authorization
- WHEN the visitor posts outside a target-scoped public operation route
- THEN the request does not evaluate public operation policy through retired
  mutation or action routes
- AND protected mutation, action, operation, schema reset, seed reset, snapshot
  restore, and package migration write routes return the configured
  unauthorized response before parsing JSON or initializing app storage
- AND no public operation invocation row is recorded for those protected generic
  write attempts

#### Scenario: Public operation route stays narrow

- GIVEN a visitor posts to a target-scoped public operation route
- WHEN the route does not resolve a declared public operation on the target app
  storage identity
- THEN the runtime returns a public-safe unavailable response
- AND no mutation, action, or operation effect is committed
- AND the unavailable response does not expose whether a protected generic write
  route exists for the same entity

### Requirement: Public Operation Execution Envelope

The system SHALL normalize each public operation request into an operation
invocation envelope before validating input or committing effects.

#### Scenario: Anonymous execution envelope

- GIVEN an anonymous public operation request is accepted for evaluation
- WHEN the public operation executor builds the envelope
- THEN the envelope includes actor mode `anonymous`, target app storage identity,
  canonical operation key, request host, request path, source block id when
  supplied, public input, proof data, idempotency key, and received timestamp

#### Scenario: Source context is preserved

- GIVEN a public operation commits records
- WHEN operation effects are written
- THEN committed records or operation response metadata include enough source
  context to identify the operation, target app storage identity, host, path,
  and Site block that caused the write

#### Scenario: Rejected public attempt is auditable

- GIVEN a target-scoped public operation route resolves a declared operation
- WHEN anonymous policy, input validation, origin validation, or challenge
  validation rejects the request
- THEN the operation invocation audit records anonymous actor, rejected or
  failed status, target app storage identity, canonical operation key, source
  host and path, idempotency facts when available, and safe input metadata
- AND challenge proofs and Turnstile secret material are excluded from audit
  snapshots and summaries

### Requirement: Public Input Validation

The system MUST validate public operation input against the operation's public
input contract before challenge verification commits records.

#### Scenario: Unknown public input field

- GIVEN a public operation request includes a field not declared by the
  operation public input contract
- WHEN input is validated
- THEN the request is rejected
- AND no operation effects are committed

#### Scenario: Invalid public input field

- GIVEN a public operation request includes a declared field with an invalid value
- WHEN input is validated
- THEN the request is rejected with a public-safe validation error
- AND no operation effects are committed

### Requirement: Turnstile Challenge

The system SHALL support Turnstile as an anonymous public operation challenge.

#### Scenario: Verify Turnstile before write

- GIVEN a public operation access policy requires Turnstile
- WHEN a public operation request is evaluated
- THEN the executor validates the submitted Turnstile token server-side before
  committing operation effects
- AND failed, missing, expired, or replayed verification rejects the request without committing records

#### Scenario: Keep Turnstile secrets server-side

- GIVEN Site trees, public HTML, browser state, snapshots, archives, or bootstrap data are produced
- WHEN public artifacts are emitted
- THEN Turnstile secret values are not included
- AND only public widget site keys required for rendering may reach the browser

### Requirement: Turnstile Configuration

The system SHALL use separate runtime configuration for public Turnstile widget
keys and server-side verification secrets.

#### Scenario: Deployment-provided challenge configuration

- GIVEN a deployed instance provisions a Turnstile widget for public operations
- WHEN runtime bindings are configured
- THEN `FORMLESS_TURNSTILE_SITE_KEY` contains the public widget site key
- AND `FORMLESS_TURNSTILE_SECRET_KEY` contains the server-side verification
  secret
- AND public operation APIs, Site trees, snapshots, archives, and bootstrap data do
  not expose the verification secret

#### Scenario: Public site key reaches renderer

- GIVEN `FORMLESS_TURNSTILE_SITE_KEY` is configured
- WHEN a public Site tree projects a Turnstile-protected operation
- THEN the public widget site key may be included for browser rendering
- AND the secret key is not included

#### Scenario: Missing challenge configuration fails closed

- GIVEN a public operation requires Turnstile
- WHEN the public site key or secret key configuration is missing or blank
- THEN public rendering omits a working operation binding or public execution
  fails closed before records are written

### Requirement: Public Operation Idempotency

The system SHALL make public operation execution replay-safe for client retries.

#### Scenario: Replay same idempotency key

- GIVEN the same public operation request is replayed with the same idempotency
  key for the same target storage identity and operation
- WHEN the replay is accepted
- THEN the runtime returns the existing accepted outcome
- AND duplicate records are not created

#### Scenario: Failed request does not reserve successful outcome

- GIVEN a public operation request fails input validation or challenge validation
- WHEN a later valid request uses the same visitor input
- THEN the later request can still commit normally
