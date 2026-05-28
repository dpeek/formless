# Authority Storage Specification

## Purpose

Authority storage owns committed app data, active schemas, write invariants, and server API contracts for each app storage identity. It is the durable source of truth that browser replicas, snapshots, archives, and installed apps read from or write through.

## Requirements

### Requirement: Storage Identity

The system SHALL isolate Authority storage by app storage identity.

#### Scenario: Schema-key app identity

- GIVEN a schema-key app such as `tasks`, `estii`, or `site`
- WHEN the app uses its schema-key API prefix
- THEN committed records, changes, schema, and action executions belong to the Authority for that schema key
- AND writes for another schema key are not visible in this app storage identity

#### Scenario: Installed app identity

- GIVEN an installed app with an app install id
- WHEN the app uses the installed app API prefix for its package app key and install id
- THEN committed records, changes, schema, and action executions belong to `app:<installId>` storage
- AND the installed app storage is separate from package-level schema-key storage

### Requirement: App Storage API

The system SHALL expose app storage operations through schema-key and installed-app API prefixes.

#### Scenario: Shared app API paths

- GIVEN a valid app storage identity
- WHEN a client calls app storage API paths for bootstrap, schema, tree reads, sync, mutations, actions, reset schema, or reset seed
- THEN the system resolves the operation for that app storage identity
- AND read and write responses use the same durable Authority state for that identity

#### Scenario: Product instance route policy

- GIVEN the product instance runtime profile blocks schema-key API routes
- WHEN a client calls an installed app API route
- THEN the installed app API route remains available
- AND schema-key API routes remain blocked by the profile policy

### Requirement: Instance Management APIs

The system SHALL expose instance-level management APIs separately from app
storage APIs.

#### Scenario: Instance app installs

- GIVEN the product instance shell reads or writes installed app metadata
- WHEN it calls `/api/formless/app-installs`
- THEN the request targets instance metadata storage
- AND installed app data remains scoped to each app storage identity

#### Scenario: Instance setup and session

- GIVEN owner setup or login runs for a product instance
- WHEN `/api/formless/setup` or `/api/formless/session` is used
- THEN owner session state is established independently from app install
  metadata
- AND write operations can be guarded by owner session cookies

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

#### Scenario: Mutation replay

- GIVEN a mutation or action write was already committed with a client-provided identity
- WHEN the same write is replayed
- THEN the stored response is returned
- AND duplicate changes are not inserted
- AND no push notification is emitted for the replay

#### Scenario: Delete with active references

- GIVEN an active record references a target record through a schema reference field
- WHEN a client tries to delete the target record
- THEN the delete is rejected
- AND the target record remains active

### Requirement: Tombstone Deletes

The system SHALL represent record deletes as tombstones.

#### Scenario: Delete commits a tombstone

- GIVEN a target record has no active referencing records
- WHEN a delete mutation commits
- THEN the stored record row remains with its id, entity, values, and created timestamp
- AND the record has a deleted timestamp
- AND a delete change is appended with the tombstoned record payload

#### Scenario: Tombstoned references do not block delete

- GIVEN a tombstoned record references a target record
- WHEN a client deletes the target record
- THEN the tombstoned referencing record does not block validation
- AND the target delete can commit if no active record references it

### Requirement: Reset And Snapshot

The system SHALL provide reset and snapshot operations that preserve Authority storage invariants.

#### Scenario: Reset seed

- GIVEN an app storage identity has existing records, changes, action executions, and an active schema
- WHEN reset seed runs
- THEN records, changes, action executions, and the active schema are cleared
- AND the source schema and source seed records are written back as the new durable state

#### Scenario: Snapshot export

- GIVEN snapshot export is requested for an app storage identity
- WHEN the Authority reads durable storage
- THEN the snapshot is built from Authority storage, not browser IndexedDB
- AND the envelope includes kind, version, schema key, exported timestamp,
  schema timestamp, source cursor, schema, and records

#### Scenario: Snapshot restore

- GIVEN a snapshot envelope for the same schema key
- WHEN snapshot restore validates its schema, records, references, timestamps, and unique constraints
- THEN the restore commits as an Authority write
- AND the response has bootstrap shape
- AND sync cursors remain monotonic
- AND action executions are cleared

### Requirement: Write Guard And Cache Policy

The system MUST guard writes when owner or admin protection is configured and SHALL prevent Authority response caching by default.

#### Scenario: Unauthorized write

- GIVEN write protection is configured
- WHEN a request without a valid owner session cookie or admin bearer token attempts a write
- THEN the response is `401`
- AND JSON body parsing, storage setup, and operation execution do not run

#### Scenario: Public read cache headers

- GIVEN an Authority read operation does not set a more specific cache policy
- WHEN the read response is returned
- THEN the response uses `Cache-Control: no-store`
- AND public Site tree API reads also use `Cache-Control: no-store`
