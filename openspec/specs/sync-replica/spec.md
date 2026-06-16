# Sync Replica Specification

## Purpose

Sync replica keeps browser state aligned with Authority storage for a
browser-backed storage identity. It stores a local IndexedDB replica, advances
sync cursors through HTTP or push sync, merges committed changes, and derives
local projections for generated UI surfaces. Authority storage remains the
source of truth; the browser replica remains a cache.

## Requirements

### Requirement: Replica Identity

The system SHALL key each browser replica by storage identity.

#### Scenario: Schema-key browser replica

- GIVEN a schema-key app such as `tasks`, `site`, or `crm`
- WHEN the browser opens the app
- THEN the local IndexedDB replica uses a schema-key-specific database name
- AND the matching broadcast channel is scoped to the same schema key

#### Scenario: Installed app browser replica

- GIVEN an installed app with an app install id
- WHEN the browser opens the installed app
- THEN the local IndexedDB replica uses `formless:app:<installId>`
- AND the matching broadcast channel uses the same app install id scope

#### Scenario: Instance control-plane browser replica

- GIVEN the browser opens the instance control-plane surface
- WHEN the client target is selected
- THEN the local IndexedDB replica uses `formless:instance:control-plane`
- AND the matching broadcast channel uses the same control-plane scope

### Requirement: Local Replica Stores

The system SHALL persist browser replica metadata and records locally.

#### Scenario: Browser replica storage shape

- GIVEN a browser replica database exists
- WHEN local sync state or records are saved
- THEN sync metadata is stored in the local `meta` store
- AND records are stored in the local `records` store

#### Scenario: Storage snapshot restore into local replica

- GIVEN a storage snapshot restore returns a bootstrap-shaped response
- WHEN the client accepts that restore for a matching storage identity
- THEN the selected local replica is saved from the restored bootstrap response
- AND later browser reads use that storage identity's local replica

### Requirement: Stale Browser Write Handling

The system SHALL reject incompatible stale browser writes with reload-required
errors.

#### Scenario: Reject stale write

- WHEN a browser replica sends a mutation or action using a stale runtime
  protocol, schema timestamp, or package app revision that is no longer write
  compatible
- THEN the Authority rejects the write with a reload-required error
- AND no committed change row is appended

#### Scenario: Read compatibility remains best effort

- WHEN a stale browser replica requests bootstrap or sync through a compatible
  read protocol
- THEN the runtime can return read data
- AND the response can include current schema facts needed for reload or
  re-bootstrap behavior

### Requirement: Browser Cache Migration

The system SHALL treat IndexedDB migrations as cache migrations, not source of
truth migrations.

#### Scenario: Local database migration succeeds

- WHEN browser replica storage opens with an older local database shape
- THEN local IndexedDB upgrade code can migrate cache metadata and records
- AND subsequent sync still uses Authority as source of truth

#### Scenario: Local database migration fails

- WHEN browser replica storage cannot safely migrate local IndexedDB state
- THEN the client can delete the local replica and re-bootstrap from Authority
- AND no Authority data is lost

### Requirement: HTTP Cursor Sync

The system SHALL use a sync cursor to catch up a browser replica from Authority storage.

#### Scenario: Catch up from stale cursor

- GIVEN a browser replica has an older sync cursor
- WHEN the client requests sync for its app storage identity
- THEN the Authority returns committed changes after that cursor
- AND the browser replica merges those changes into local records
- AND the local sync cursor advances

#### Scenario: Current cursor

- GIVEN a browser replica has a current sync cursor
- WHEN the client requests sync for its app storage identity
- THEN no older changes are replayed into the local replica
- AND the local cursor remains ready for future catch-up

### Requirement: Write Log Cursor Catch-Up

The system SHALL catch browser replicas up from Authority write-log changes for
the matching app storage identity.

#### Scenario: HTTP catch-up reads write-log changes

- WHEN a browser replica requests HTTP sync after a stale cursor
- THEN the Authority returns committed write-log changes after that cursor
- AND the response cursor advances to the latest committed cursor for that app
  storage identity

#### Scenario: Push catch-up reads write-log changes

- WHEN a browser replica opens a push sync socket and sends a cursor
- THEN the Authority reads committed write-log changes after that cursor
- AND the socket catch-up omits duplicate changes already covered by the
  client's cursor

### Requirement: Push Sync Connection

The system SHALL support push sync over hibernatable WebSockets for schema-key and installed app identities.

#### Scenario: Schema-key push sync route

- GIVEN a schema-key app storage identity
- WHEN the browser connects to `/api/:schemaKey/sync/ws`
- THEN the Authority accepts push sync messages for that schema key
- AND the socket can catch up from the client's cursor

#### Scenario: Installed app push sync route

- GIVEN an installed app storage identity
- WHEN the browser connects to the installed app sync WebSocket route
- THEN the Authority accepts push sync messages for that installed app
- AND the socket can catch up from the client's cursor

### Requirement: Push Sync Messages

The system SHALL use push sync messages to catch up clients and deliver committed writes.

#### Scenario: Hello catch-up

- GIVEN a browser replica opens a push sync socket with a cursor
- WHEN it sends `hello`
- THEN the Authority catches the socket up from that cursor
- AND schema data is omitted when the client's schema timestamp is current

#### Scenario: Committed write broadcast

- GIVEN a create, patch, delete, action, schema write, reset schema, or reset seed write commits
- WHEN push sync sockets are connected
- THEN the Authority broadcasts a sync message for the committed write
- AND one stale socket does not prevent later sockets from receiving the broadcast

### Requirement: Write Outcome Push Notifications

The system SHALL use Authority storage write outcomes as the source of push
sync notification policy.

#### Scenario: Committed write notifies

- WHEN a create, patch, delete, action, schema write, reset schema, reset seed,
  or snapshot restore write returns a committed storage outcome
- THEN the Authority broadcasts a push sync message for that committed write
- AND connected browser replicas can catch up from their stored cursors

#### Scenario: Replay or failed write does not notify

- WHEN a mutation or action write returns a replayed storage outcome
- THEN the Authority does not broadcast a committed-write push notification
- AND no duplicate local replica merge is caused by that replay

- WHEN a write fails validation before storage commit
- THEN the Authority does not broadcast a committed-write push notification

### Requirement: Push Sync Limits

The system MUST NOT depend on push sync for validation or replay behavior.

#### Scenario: Failed or replayed write

- GIVEN a write fails validation or replays an already committed mutation or action
- WHEN push sync sockets are connected
- THEN no committed-write push notification is broadcast for that request
- AND local replicas must wait for a later committed write or explicit sync request to change state

#### Scenario: No polling fallback

- GIVEN browser push sync is enabled for an app storage identity
- WHEN the push sync connection is unavailable
- THEN the browser does not switch to a polling fallback
- AND no automatic polling catch-up runs as a fallback

### Requirement: Local Projections

The system SHALL derive generated UI read state from browser replica records instead of storing read models as records.

#### Scenario: Projection selectors

- GIVEN browser replica records are available
- WHEN generated UI selectors evaluate queries, references, aggregates, or readiness
- THEN the selectors compute query ids, query options, query counts, reference options, reference counts, aggregate values, and readiness warnings from the local projection snapshot
- AND those computed outputs are not stored as Authority records

#### Scenario: Delete reconciliation

- GIVEN a synced change marks a record deleted
- WHEN the browser replica merges the change
- THEN local subscriptions receive reconciled record state for that app storage identity
- AND generated UI projections update from the reconciled local records
