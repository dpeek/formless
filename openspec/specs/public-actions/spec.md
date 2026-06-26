# Public Operations Specification

## Purpose

Public operation bindings execute schema-declared entity operations for public
callers through narrow target-scoped routes while preserving protected operation
write APIs.

## Requirements

### Requirement: Public Operation Policy

The system SHALL let schema-declared operations opt in to public execution
through an explicit actor policy and public binding.

#### Scenario: Public exposure is a binding

- GIVEN a schema-declared operation can be invoked by an anonymous actor
- WHEN public execution models are selected
- THEN the public form, target-scoped route, challenge requirement, origin rule,
  and response filtering are public bindings or operation policy facts
- AND those facts do not redefine the operation input, output, effect,
  idempotency, audit, or app storage identity
- AND public access remains part of the operation interaction model

#### Scenario: Reject operation without public policy

- GIVEN an anonymous request targets a schema operation that has no public
  actor policy or public binding
- WHEN the public operation executor evaluates the request
- THEN the request is rejected
- AND no operation effects are committed
- AND the rejection is recorded as an operation invocation only after the
  target-scoped public operation route and declared operation are resolved

#### Scenario: Resolve declared public operation

- GIVEN a public form targets an entity operation key
- WHEN the schema or public Site tree is selected for public execution
- THEN the operation key resolves to one source-declared public operation on the
  target app storage identity
- AND anonymous callers invoke that operation through the public operation
  executor

#### Scenario: Anonymous operation is eligible

- GIVEN a schema operation policy allows anonymous public execution
- WHEN an anonymous request targets that operation
- THEN the public operation executor evaluates the request through the public
  operation path
- AND the executor does not require owner session or admin bearer authorization
  for that request

#### Scenario: Executor uses schema-owned eligibility

- GIVEN an anonymous public operation route resolves to a declared operation
- WHEN the public operation executor evaluates operation eligibility
- THEN it consumes the schema-owned public operation eligibility facts for the
  declared operation
- AND target route resolution, request origin evaluation, Turnstile secret
  verification, app storage identity selection, Authority writes, audit rows,
  idempotency, and post-commit delivery side effects remain runtime-owned

#### Scenario: Execute public operations

- GIVEN an entity operation declares anonymous public policy
- WHEN public execution models are selected
- THEN public execution invokes the operation envelope and policy model
- AND public command execution returns operation-native public output rather
  than adapter-private materialization metadata

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

#### Scenario: Public contact notification side effect

- GIVEN a Site contact message public operation commits successfully
- WHEN instance email defaults and a contact notification recipient are
  configured
- THEN post-commit email notification scheduling may create or update platform
  email delivery records outside the target app storage identity
- AND the public operation response remains the operation-native create output
- AND provider delivery status, sender verification facts, and notification
  recipient configuration are not returned in the public response
- AND retries use the public operation idempotency key and contact notification
  purpose to avoid duplicate sends

#### Scenario: Public operation input notification side effect

- GIVEN a public operation form submission commits successfully
- WHEN the form binding or target configuration enables an operation input
  notification and instance email defaults and a recipient are configured
- THEN post-commit email notification scheduling may create or update platform
  email delivery records outside the target app storage identity
- AND the notification message is rendered from the submitted operation input,
  public-safe field labels, canonical operation key, target storage identity,
  request host and path, and Site block id when supplied
- AND the HTML notification body renders operation facts and submitted input as
  key-value tables
- AND configured reply-to fields may use submitted scalar input values but
  missing or invalid reply-to values do not block the committed operation
- AND the public operation response remains the operation-native create or
  command output
- AND provider delivery status, sender verification facts, notification
  recipient configuration, Turnstile proof values, and private notification
  errors are not returned in the public response
- AND retries use the public operation idempotency key and notification purpose
  to avoid duplicate sends

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

#### Scenario: Execute public operation handler command

- GIVEN a Site app declares an anonymous public command operation with an
  `operationHandler` effect whose handler is public-eligible
- WHEN a visitor posts declared input and proof data to the target-scoped public
  operation route
- THEN the executor validates the operation input contract before challenge
  verification or handler materialization
- AND successful execution commits only records planned or written by that
  operation handler for the target app storage identity
- AND handler execution receives operation source facts such as host, path,
  canonical operation key, and Site block id through the operation envelope
- AND public execution tests, fixtures, and response helpers use operation names
  consistently

### Requirement: Target-Scoped Public Operation API

The system SHALL expose public operation execution through target-scoped public
operation endpoints.

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

#### Scenario: Shared public operation route contract

- GIVEN public Site projection builds a target public operation route or Worker
  code parses an Authority-relative public operation path
- WHEN route construction or parsing evaluates the public operation suffix
- THEN one public operation route contract owns
  `/public/operations/:entityKey/:operationKey` path construction, segment
  encoding, segment decoding, and suffix shape validation
- AND target app storage identity resolution remains runtime-owned outside that
  route contract
- AND invalid public operation suffixes fail before public operation policy,
  JSON body parsing, or app storage initialization

#### Scenario: Generic write routes stay protected

- GIVEN a visitor lacks owner session or admin bearer authorization
- WHEN the visitor posts outside a target-scoped public operation route
- THEN protected operation, schema reset, seed reset, snapshot restore, and
  package migration write routes return the configured unauthorized response
  before evaluating public operation policy, parsing JSON, or initializing app
  storage
- AND no public operation invocation row is recorded for those protected generic
  write attempts

#### Scenario: Public operation route stays narrow

- GIVEN a visitor posts to a target-scoped public operation route
- WHEN the route does not resolve a declared public operation on the target app
  storage identity
- THEN the runtime returns a public-safe unavailable response
- AND no operation effect is committed
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
- AND source records identify the causing operation by canonical operation key
- AND source records are produced by operation-native create, record-plan, or
  operation handler execution

#### Scenario: Public operation contracts are operation-named

- GIVEN app, client, Worker, Site runtime, or tests import public execution
  protocol contracts
- WHEN those contracts describe public operation execution, storage targets,
  source facts, effects, audit facts, or responses
- THEN the exported names use `PublicOperation` terminology
- AND source records identify public writes by canonical operation key rather
  than display label

#### Scenario: Browser client request envelope

- GIVEN browser code submits a public operation from a public form
- WHEN the browser client helper builds the request body
- THEN the body contains submitted public input values, a
  `proof.turnstileToken` value, optional `source.siteBlockId`, and optional
  idempotency key using the public operation request envelope
- AND product-specific forms remain responsible for mapping their own UI fields
  into the submitted public input values

#### Scenario: Browser client response guards

- GIVEN browser code receives a public operation JSON response
- WHEN the browser client helper validates the response
- THEN it accepts committed or replayed public operation responses with command
  or create output shapes
- AND it rejects malformed responses before product-specific form UI treats the
  submission as successful
- AND public-safe `{ error: string }` response bodies are extracted through one
  browser-safe helper

#### Scenario: Rejected public attempt is auditable

- GIVEN a target-scoped public operation route resolves a declared operation
- WHEN anonymous policy, input validation, origin validation, or challenge
  validation rejects the request
- THEN the operation invocation audit records anonymous actor, rejected or
  failed status, target app storage identity, canonical operation key, source
  host and path, idempotency facts when available, and safe input metadata
- AND challenge proofs and Turnstile secret material are excluded from audit
  snapshots and summaries

#### Scenario: Public execution uses invocation lifecycle

- GIVEN a target-scoped public operation route resolves a declared operation
- WHEN the public runtime evaluates origin, input, challenge, replay, and
  operation execution
- THEN accepted, rejected, failed, replayed, and committed invocation statuses
  are recorded through the shared operation invocation lifecycle
- AND public route code remains responsible for target route resolution,
  request origin evaluation, challenge proof verification, verified-envelope
  construction, public response filtering, and after-commit side effects

### Requirement: Public Input Validation

The system MUST validate public operation input against the operation's public
input contract before challenge verification commits records.

#### Scenario: Public validation uses operation input names

- GIVEN an anonymous public operation request is accepted for evaluation
- WHEN the public operation executor validates submitted input
- THEN validation uses schema-owned operation input projection for the declared
  operation input field names from the source operation
- AND public create operations map validated entity-backed input to stored
  entity field names only for create materialization
- AND public record-plan and operation-handler commands keep validated input
  keyed by declared operation input field name
- AND storage-backed reference checks, challenge proof validation, idempotency
  reservation, audit rows, target app storage identity, and public response
  filtering remain public runtime or Authority-owned
- AND invalid public input is rejected before challenge verification or
  successful outcome reservation

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
