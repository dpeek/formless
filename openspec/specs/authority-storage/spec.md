# Authority Storage Specification

## Purpose

Authority storage owns committed app data, instance control-plane records,
active schemas, operation invocations, write invariants, and server API
contracts for each storage identity. It is the durable source of truth that
browser replicas, storage snapshots, portable archive envelopes, workspace
state, and installed apps read from or write through.

## Requirements

### Requirement: Storage Identity

The system SHALL isolate Authority storage by storage identity.

#### Scenario: Schema-key app identity

- GIVEN a schema-key app such as `tasks`, `site`, or `crm`
- WHEN the app uses its schema-key API prefix
- THEN committed records, changes, schema, operation invocations, and action
  executions belong to the Authority for that schema key
- AND writes for another schema key are not visible in this app storage identity

#### Scenario: Installed app identity

- GIVEN an installed app with an app install id
- WHEN the app uses the installed app API prefix for its package app key and install id
- THEN committed records, changes, schema, operation invocations, and action
  executions belong to `app:<installId>` storage
- AND the installed app storage is separate from package-level schema-key storage

#### Scenario: Instance control-plane identity

- GIVEN instance control-plane storage is initialized
- WHEN instance management records are stored, snapshotted, restored, or synced
- THEN committed records, changes, schema, operation invocations, and action
  executions belong to `instance:control-plane` storage
- AND installed app records remain scoped to their app storage identities

### Requirement: App Storage API

The system SHALL expose app storage operations through schema-key and installed-app API prefixes.

#### Scenario: Shared app API paths

- GIVEN a valid app storage identity
- WHEN a client calls app storage API paths for bootstrap, schema, tree reads,
  sync, operations, reset schema, or reset seed
- THEN the system resolves the operation for that app storage identity
- AND read and write responses use the same durable Authority state for that identity

#### Scenario: Product instance route policy

- GIVEN the product instance runtime profile blocks schema-key API routes
- WHEN a client calls an installed app API route
- THEN the installed app API route remains available
- AND schema-key API routes remain blocked by the profile policy

### Requirement: Storage Snapshot Contract Boundary

The system SHALL expose storage snapshot contracts and parsing through the
Storage package while keeping Authority storage execution in runtime modules.

#### Scenario: Runtime code consumes storage snapshot contracts

- GIVEN Authority storage, browser replicas, portable archive workflows,
  workspace source, Site runtime, Worker runtime, or tests need storage
  snapshot kind constants, version constants, stored-record contracts,
  flat record value contracts, or snapshot parsing
- WHEN those contracts are imported
- THEN they come from `@dpeek/formless-storage`
- AND they do not come from root runtime protocol modules

#### Scenario: Storage package stays execution-free

- GIVEN storage snapshot contracts are provided by the Storage package
- WHEN Authority bootstrap, schema storage, change rows, operation invocations,
  sync protocol, mutation routes, reset, restore, or Durable Object storage is
  implemented
- THEN those behaviors remain owned by Authority storage runtime modules
- AND the Storage package does not own runtime protocol routes, app records,
  browser replica persistence, or restore execution

### Requirement: Instance Management APIs

The system SHALL expose instance-level management APIs separately from app
storage APIs.

#### Scenario: Instance app installs

- GIVEN the product instance shell reads or writes installed app metadata
- WHEN it calls `/api/formless/app-installs`
- THEN the request targets instance metadata storage
- AND installed app data remains scoped to each app storage identity

#### Scenario: Instance setup and passkey session

- GIVEN owner setup or passkey login runs for a product instance
- WHEN `/api/formless/setup`, `/api/formless/passkeys/*`, or
  `/api/formless/session` is used
- THEN owner identity, passkey credentials, passkey challenges, and owner
  session state are established independently from app install metadata
- AND write operations can be guarded by owner session cookies
- AND admin bearer authorization remains available for bootstrap, automation,
  and recovery-sensitive write paths

### Requirement: Media Storage Adapter Boundary

The system SHALL keep Authority app storage separate from instance media storage
while consuming Media package Worker adapters through public subpaths.

#### Scenario: App storage avoids media internals

- GIVEN Authority storage handles bootstrap, schema, sync, operations, reset,
  snapshot, or record restore
- WHEN storage code needs media object handling
- THEN it does not deep-import Media package internals
- AND media object handling stays behind public Media package Worker/runtime
  contracts

#### Scenario: Media remains outside Authority records

- GIVEN app records are committed or restored through Authority storage
- WHEN owned media exists for the instance
- THEN owned media object bytes and provider storage metadata remain outside
  Authority app records

### Requirement: Source Bootstrap

The system SHALL initialize an empty Authority from the source schema and source seed records.

#### Scenario: Fresh bootstrap

- GIVEN no active schema is stored for an app storage identity
- WHEN the app is bootstrapped
- THEN the active schema is initialized from the source schema
- AND source seed records are committed as stored records
- AND the seed records produce create changes for sync catch-up

#### Scenario: Installed app creation

- GIVEN a bundled package app is installed
- WHEN the installed app storage identity is initialized
- THEN storage starts from the package source schema
- AND package source seed records are committed for that install id

### Requirement: Schema Reset

The system MUST protect stored records during normal schema changes and SHALL support explicit source schema reset.

#### Scenario: Normal schema update rejects destructive field changes

- GIVEN records exist under the active schema
- WHEN a normal schema update removes or renames a field
- THEN the update is rejected
- AND stored records keep their current values

#### Scenario: Source schema reset prunes retired fields

- GIVEN stored records contain fields no longer present in the source schema
- WHEN reset schema runs
- THEN the source schema becomes active
- AND existing records are preserved
- AND stored values for retired fields are pruned with patch changes

### Requirement: Write Invariants

The system MUST commit writes only when Authority validation succeeds.

#### Scenario: Operation replay

- GIVEN an operation write was already committed with a client-provided identity
- WHEN the same write is replayed
- THEN the stored response is returned
- AND duplicate changes are not inserted
- AND no push notification is emitted for the replay

#### Scenario: Committed write classification

- GIVEN a local workspace runtime needs to decide whether workspace source is
  dirty
- WHEN an app operation, schema save, reset schema, reset seed, snapshot
  restore, app install, or control-plane write commits through Authority
- THEN the committed storage outcome is the write classification boundary
- AND the local runtime may enqueue workspace auto-save for the affected storage
  identity
- AND failed validation, failed authorization, read-only requests, and replayed
  writes do not classify as new workspace source changes

#### Scenario: Delete with active references

- GIVEN an active record references a target record through a schema reference field
- WHEN a client tries to delete the target record
- THEN the delete is rejected
- AND the target record remains active

#### Scenario: State machine field patch guard

- GIVEN an active record belongs to an entity with a state machine
- WHEN a generic update operation or internal patch materializer attempts to
  change the machine-owned enum field directly
- THEN the write is rejected before commit
- AND the field can change only through a declared transition operation, source
  bootstrap, reset, restore, or migration path

#### Scenario: State machine transition operation

- GIVEN an authorized caller invokes a declared transition operation for an active
  record
- WHEN the record's current enum state is accepted by that transition
- THEN Authority commits the enum field patch through the operation write path
- AND any declared transition event record is committed in the same operation
  outcome
- AND operation idempotency and write-log cursor behavior match other committed
  operation writes

#### Scenario: Invalid state machine transition

- GIVEN a caller invokes a transition operation for a missing, tombstoned, or
  incompatible-state record
- WHEN Authority validates the operation
- THEN the operation is rejected before materialization
- AND no partial record patch, event record, write-log change, or action
  execution is stored

### Requirement: Operation Invocation Boundary

The system SHALL normalize operation calls into one invocation envelope before
authorization, validation, execution, replay classification, audit, or
materialization.

#### Scenario: Build operation invocation envelope

- GIVEN generated UI, protocol, public, automation, CLI, or runner callers invoke
  an entity operation
- WHEN Authority accepts the request for evaluation
- THEN the envelope includes invocation id, canonical operation key, app storage
  identity, entity, record id or selection when relevant, actor, source
  protocol, source route or UI surface when relevant, input, idempotency key
  when required, and received timestamp
- AND generic mutation and action protocol routes do not select Authority write
  operations after the operation migration
- AND anonymous public callers can build an operation invocation envelope only
  through target-scoped public operation routes that resolve a declared entity
  operation on the target app storage identity

#### Scenario: Authorize operation before materialization

- GIVEN an operation invocation envelope has been built
- WHEN Authority evaluates the invocation
- THEN operation actor policy is evaluated before field validation and storage
  materialization
- AND rejected invocations do not create, patch, delete, tombstone, dispatch
  command effects, or run record plans
- AND operation policy becomes the primary authorization boundary for operation
  execution

#### Scenario: Operation idempotency

- GIVEN a create, update, delete, or command operation is invoked
- WHEN the request is evaluated
- THEN an idempotency key is required unless a trusted runtime actor supplies an
  explicit runtime-generated write identity
- AND replaying the same operation for the same app storage identity and
  idempotency key returns the stored outcome without duplicate change rows,
  command effect rows, or operation invocation rows
- AND list and get operations do not require idempotency keys

#### Scenario: Return operation output

- GIVEN an operation invocation is accepted
- WHEN Authority returns the operation result
- THEN list operations return records selected by the referenced query
- AND get operations return one active record selected by record id
- AND create operations return the created record plus affected change ids
- AND update operations return the updated record plus affected change ids
- AND delete operations return the tombstoned record id plus affected change ids
- AND command operations return operation-native command output plus affected
  change ids
- AND operation responses do not expose action response types as the command
  output contract
- AND replayed write or command operations return the original stored output

#### Scenario: Materialize record lifecycle timestamps

- GIVEN an operation invocation creates, updates, deletes, tombstones, or
  materializes a record-plan step
- WHEN Authority commits the write
- THEN create writes set record system `createdAt` and `updatedAt` to the
  invocation received timestamp
- AND update and patch writes preserve `createdAt` and set system `updatedAt` to
  the invocation received timestamp
- AND delete and tombstone writes preserve `createdAt`, set system `deletedAt`,
  and set system `updatedAt` to the deletion timestamp
- AND sync change payloads, snapshots, exports, and browser replicas carry those
  system fields outside record `values`

#### Scenario: Reject caller-owned system fields

- GIVEN generated UI, protocol, public, automation, CLI, or runner callers submit
  operation input
- WHEN the input attempts to create, patch, unset, or record-plan-target `id`,
  `createdAt`, `updatedAt`, or `deletedAt`
- THEN Authority rejects the write before materialization
- AND accepted write paths derive lifecycle metadata from Authority-owned write
  context, not caller-provided values

### Requirement: Operation Record Plan Materialization

The system SHALL materialize declarative command record plans through the same
Authority validation, idempotency, and write-log boundary as other operation
writes.

#### Scenario: Commit record plan atomically

- GIVEN an accepted command operation invocation has effect type `recordPlan`
- WHEN Authority materializes the plan
- THEN each plan step is validated against the active app schema before any
  step is committed
- AND create, patch, delete, and tombstone steps reuse the same field,
  reference, unique constraint, operation, and state-machine write protections
  as the equivalent single-record operation effects
- AND later steps can reference ids and scalar outputs from earlier successful
  steps in the same plan
- AND all committed steps share the invocation id, app storage identity, actor,
  source context, and idempotency key from the operation envelope
- AND if any step fails validation or materialization, no plan step writes an
  app record, tombstone, command effect row, or sync change row

#### Scenario: Return record plan outcome

- GIVEN a command record plan commits
- WHEN Authority records the operation outcome
- THEN one sync change row is appended for each committed app-record change
- AND the operation command output includes affected change ids and declared
  display-safe record identifiers or metadata for created plan steps
- AND operation invocation audit remains the semantic root for the multi-record
  write
- AND replaying the same operation for the same app storage identity and
  idempotency key returns the stored operation output without duplicate app
  records, tombstones, command effect rows, operation invocation rows, or sync
  change rows

### Requirement: Operation Invocation Audit

The system SHALL store operation invocation rows as Authority-owned system rows
separate from stored app records and sync change rows.

#### Scenario: Store operation invocation row

- GIVEN an operation invocation is accepted, rejected, committed, replayed,
  failed, or resumed
- WHEN Authority records the invocation outcome
- THEN the row stores operation key and kind, actor and auth decision, source
  protocol and route context, target app storage identity, input hash, safe
  input summary or explicitly allowed safe snapshot, affected change ids,
  idempotency facts, status, and timestamps
- AND secret field values, challenge proofs, provider secrets, and runtime
  secrets are not stored in full input snapshots
- AND operation invocation rows are not emitted as browser replica sync changes

#### Scenario: Audit rejected public operation attempt

- GIVEN a target-scoped public operation route resolves a declared entity
  operation for an anonymous caller
- WHEN operation policy, public input validation, origin validation, or challenge
  verification rejects the request
- THEN Authority stores an operation invocation row with anonymous actor,
  rejected or failed status, public source protocol, source host and path,
  target app storage identity, canonical operation key, idempotency facts when
  available, input hash, and safe input audit metadata
- AND no sync change rows, command effect rows, stored app records, or
  tombstones are written for the rejected attempt

#### Scenario: Change rows remain materialization log

- GIVEN an operation commits record effects
- WHEN sync clients read committed changes
- THEN clients receive change rows from the existing write log
- AND the operation invocation row remains the semantic audit and replay root
  for that operation

### Requirement: Storage Write Log Boundary

The system SHALL keep committed Authority write facts behind a storage
write-log boundary that owns write outcome classification, operation
idempotency, change-row append, cursor calculation, and committed change
readback. Mutation and action materializers may remain internal implementation
helpers, but they are not Authority write interfaces for callers after the
operation migration.

#### Scenario: Materializers stay behind operation outputs

- GIVEN Authority uses internal record or command materializers to commit
  operation effects
- WHEN an operation is invoked through generated UI, protocol, public, CLI,
  runner, or automation surfaces
- THEN the caller submits an operation envelope and receives operation output
- AND internal mutation or action response types are not exported as the
  operation response contract
- AND replay storage is keyed by operation identity and returns the
  operation-native output shape

#### Scenario: Committed write facts

- WHEN an operation, schema reset, seed reset, or snapshot restore commits
  storage changes
- THEN the storage write outcome identifies the result as committed
- AND committed change rows are appended once for that write identity
- AND the returned cursor reflects the committed change rows

#### Scenario: Replayed write facts

- WHEN an operation with a previously committed client-provided
  identity is replayed
- THEN the storage write outcome identifies the result as replayed
- AND the original stored response is returned
- AND duplicate change rows or command effect rows are not inserted

#### Scenario: Change readback

- WHEN sync reads committed changes after a cursor
- THEN Authority storage returns change rows from the write log for that app
  storage identity
- AND changes from other app storage identities are not visible

### Requirement: Record Materialization Boundary

The system SHALL keep stored record materialization explicit and separate from
write-log append behavior.

#### Scenario: Operation materialization

- WHEN create, update, delete, command-created record, or command tombstone
  effects are committed through an operation invocation
- THEN record materializers write flat stored records or tombstones
- AND write-log change payloads describe the committed stored records
- AND schema validation, value validation, reference validation, and delete
  blocker checks happen before materialization

#### Scenario: Reset and restore materialization

- WHEN source schema reset, seed reset, snapshot restore, or archive app data
  restore runs
- THEN the reset or restore plan remains explicit before durable mutation
- AND command effect executions are cleared only by operations whose storage semantics
  require clearing them
- AND sync cursors remain monotonic after the operation

### Requirement: Tombstone Deletes

The system SHALL represent record deletes as tombstones.

#### Scenario: Delete operation commits a tombstone

- GIVEN a target record has no active referencing records
- WHEN a delete operation commits
- THEN the stored record row remains with its id, entity, values, created
  timestamp, and updated timestamp
- AND the record has a deleted timestamp
- AND a delete change is appended with the tombstoned record payload

#### Scenario: Tombstoned references do not block delete

- GIVEN a tombstoned record references a target record
- WHEN a client deletes the target record
- THEN the tombstoned referencing record does not block validation
- AND the target delete can commit if no active record references it

### Requirement: Reset And Storage Snapshot

The system SHALL provide reset and storage snapshot operations that preserve
Authority storage invariants.

#### Scenario: Reset seed

- GIVEN a storage identity has existing records, changes, action executions, and an active schema
- WHEN reset seed runs
- THEN records, changes, action executions, and the active schema are cleared
- AND the source schema and source seed records are written back as the new durable state

#### Scenario: Storage snapshot export

- GIVEN snapshot export is requested for a storage identity
- WHEN the Authority reads durable storage
- THEN the snapshot is built from Authority storage, not browser IndexedDB
- AND the envelope kind is `formless.storageSnapshot`
- AND the envelope includes version, storage identity, schema key, exported
  timestamp, schema timestamp, source cursor, schema, and records
- AND storage identity is the compact Authority storage name such as
  `app:<installId>`, `instance:control-plane`, or a schema key for source
  schema-key storage

#### Scenario: Storage snapshot restore

- GIVEN a storage snapshot envelope for the same storage identity and schema key
- WHEN snapshot restore validates its identity, schema, records, references,
  timestamps, and unique constraints
- THEN the restore commits as an Authority write
- AND the response has bootstrap shape
- AND sync cursors remain monotonic
- AND action executions are cleared

### Requirement: Authority Write Outcome Consumption

The system SHALL make Authority operation adapters consume storage write
outcomes instead of deriving write mode from protocol response shapes.

#### Scenario: Committed outcome consumed

- WHEN an Authority write operation receives a committed storage outcome
- THEN the operation returns the protocol response from that outcome
- AND the committed outcome is available for push sync notification policy

#### Scenario: Replay outcome consumed

- WHEN an Authority write operation receives a replayed storage outcome
- THEN the operation returns the protocol response from that outcome
- AND the replay outcome is distinguishable from a committed write without
  inspecting response payload shape

### Requirement: Write Guard And Cache Policy

The system MUST guard writes when owner or admin protection is configured and SHALL prevent Authority response caching by default.

#### Scenario: Unauthorized write

- GIVEN write protection is configured
- WHEN a request without a valid owner session cookie or admin bearer token attempts a write
- THEN the response is `401`
- AND JSON body parsing, storage setup, and operation execution do not run

#### Scenario: Public operation route bypasses only the generic write guard

- GIVEN write protection is configured
- WHEN an anonymous request targets a target-scoped public operation route
- THEN the owner or admin write guard does not reject the request before public
  operation policy is evaluated
- AND only declared operations with anonymous public policy and public bindings
  can commit effects through that route
- AND all other app storage write routes still return `401` before JSON body
  parsing, storage setup, operation envelope construction, or write
  materialization

#### Scenario: Public read cache headers

- GIVEN an Authority read operation does not set a more specific cache policy
- WHEN the read response is returned
- THEN the response uses `Cache-Control: no-store`
- AND public Site tree API reads also use `Cache-Control: no-store`

### Requirement: Instance Control-Plane Storage

The system SHALL store runtime-owned instance control-plane schema records in an
Authority-backed app storage identity separate from installed app data.

#### Scenario: Control-plane identity

- GIVEN instance control-plane storage is initialized
- WHEN committed records, changes, active schema, or action executions are
  stored
- THEN they belong to storage identity `instance:control-plane`
- AND installed app records remain scoped to their app storage identities
- AND app install and route records remain metadata about installed apps, not
  the installed apps' own record storage

#### Scenario: Control-plane API

- GIVEN owner, admin, CLI deployer, or runner callers query or write allowed
  control-plane records
- WHEN the request is accepted through `/api/formless/control-plane`
- THEN the request targets the instance control-plane storage identity
- AND writes use Authority validation and write-log idempotency

#### Scenario: App install creation transaction

- GIVEN a package app install is created through the control-plane API
- WHEN the create action commits
- THEN the app install and default route records are committed in the
  control-plane storage identity
- AND package source schema and source seed records initialize the
  install-scoped app storage identity
- AND a failure in either part leaves no partially usable installed app route

### Requirement: Active Schema Source Refresh

Authority storage SHALL keep the active schema aligned with resolved source
schema provenance without treating seed records or workspace state as the
source of schema truth.

#### Scenario: Refresh compatible source schema

- GIVEN an Authority storage identity already has committed records and an
  active schema
- WHEN the resolved source schema hash for that storage identity differs from
  the stored source schema hash or runtime schema hash
- AND current active records validate against the resolved source schema without
  creates, patches, tombstones, or value pruning
- THEN Authority writes the resolved source schema as the active schema
- AND Authority records a new schema timestamp for sync, browser reload, and
  workspace state provenance
- AND committed records, source cursor, action executions, and change rows are
  not reset or reseeded

#### Scenario: Block incompatible schema refresh

- GIVEN current active records cannot validate against a resolved source schema
  without record materialization
- WHEN the package revision has not advanced to a matching package app migration
  or explicit reset path
- THEN Authority keeps the existing active schema and records unchanged
- AND the caller receives a schema refresh blocker that identifies the storage
  identity, package app key or control-plane schema key, current schema
  provenance, and target schema provenance

### Requirement: Control-Plane Secret Boundary

Authority storage SHALL keep installed app data, deployment secrets, and
canonical provider state out of control-plane records and change rows.

#### Scenario: Secret values are excluded

- GIVEN control-plane records are stored, synced, snapshotted, or exported
- WHEN record values and change rows are produced
- THEN provider API tokens, Alchemy passwords, Alchemy state tokens, raw lease
  tokens, and runtime secrets are not included
- AND display-safe secret references may be stored

#### Scenario: Installed app data is excluded

- GIVEN app install or route metadata records are stored, synced, snapshotted,
  or exported as control-plane records
- WHEN installed app data exists for those installs
- THEN the installed app's records, changes, active schema, and action
  executions are not nested into control-plane records
- AND app data continues to move through storage snapshots scoped to
  `app:<installId>` identities

#### Scenario: Provider truth remains external

- GIVEN deployment evidence is recorded
- WHEN Authority records store the displayable result
- THEN records store summaries and ids needed for display, audit, and cleanup
- AND Alchemy or provider storage remains the canonical provider resource state

### Requirement: Legacy Instance State Migration

The system SHALL migrate existing app install, custom-domain, and
deployment-runtime intent facts into control-plane records without changing
route behavior.

#### Scenario: Backfill legacy state

- GIVEN legacy app install, domain mapping, redirect, attempt, evidence, or
  drift tables exist during migration
- WHEN compatibility reads or writes touch those facts
- THEN equivalent schema-owned control-plane records are created
- AND compatibility reads can verify old and new state before legacy writes are
  retired

### Requirement: SQL Migration Runner

The system SHALL run registered Durable Object SQLite migrations before upgraded
code depends on migrated table shape.

#### Scenario: Apply pending SQL migration

- WHEN Authority or instance storage initializes for a storage identity with
  pending SQL migrations
- THEN the migration runner applies migrations in registry order
- AND each applied migration records its id, checksum, package version, and
  applied timestamp for that storage identity

#### Scenario: Skip applied SQL migration

- WHEN storage initializes for a storage identity whose migration id and checksum
  are already recorded as applied
- THEN the migration runner skips that migration
- AND storage initialization continues without duplicate table rewrites

### Requirement: Introspective SQL Migrations

SQL migrations MUST be idempotent and inspect current SQLite metadata before
rewriting storage.

#### Scenario: Existing legacy table shape

- WHEN a migration sees a legacy table shape through `sqlite_master` or
  `PRAGMA table_info`
- THEN it can rewrite the table into the current shape while preserving
  compatible rows
- AND rerunning the same migration after success is a no-op

### Requirement: Authority Record Migrations

The system SHALL execute package app record migrations through Authority storage
semantics.

#### Scenario: Migrate records

- WHEN a package app migration creates, patches, or tombstones records
- THEN Authority validation, flat record materialization, write-log append,
  idempotency, and monotonic cursor behavior are preserved
- AND browser replicas can catch up through existing sync changes

#### Scenario: Reject invalid migrated data

- WHEN a record migration would produce records that fail schema field,
  reference, unique constraint, or delete-blocker validation
- THEN the migration fails before commit
- AND existing stored records remain unchanged
