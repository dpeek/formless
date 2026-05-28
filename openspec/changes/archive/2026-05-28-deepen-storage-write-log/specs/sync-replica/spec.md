## ADDED Requirements

### Requirement: Write Outcome Push Notifications

The system SHALL use Authority storage write outcomes as the source of push sync
notification policy.

#### Scenario: Committed write notifies

- **WHEN** a create, patch, delete, action, schema write, reset schema, reset
  seed, or snapshot restore write returns a committed storage outcome
- **THEN** the Authority broadcasts a push sync message for that committed write
- **AND** connected browser replicas can catch up from their stored cursors

#### Scenario: Replay or failed write does not notify

- **WHEN** a mutation or action write returns a replayed storage outcome
- **THEN** the Authority does not broadcast a committed-write push notification
- **AND** no duplicate local replica merge is caused by that replay

- **WHEN** a write fails validation before storage commit
- **THEN** the Authority does not broadcast a committed-write push notification

### Requirement: Write Log Cursor Catch-Up

The system SHALL catch browser replicas up from Authority write-log changes for
the matching app storage identity.

#### Scenario: HTTP catch-up reads write-log changes

- **WHEN** a browser replica requests HTTP sync after a stale cursor
- **THEN** the Authority returns committed write-log changes after that cursor
- **AND** the response cursor advances to the latest committed cursor for that
  app storage identity

#### Scenario: Push catch-up reads write-log changes

- **WHEN** a browser replica opens a push sync socket and sends a cursor
- **THEN** the Authority reads committed write-log changes after that cursor
- **AND** the socket catch-up omits duplicate changes already covered by the
  client's cursor
