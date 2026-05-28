## ADDED Requirements

### Requirement: Storage Write Log Boundary

The system SHALL keep committed Authority write facts behind a storage write-log
boundary that owns write outcome classification, mutation and action
idempotency, change-row append, cursor calculation, and committed change
readback.

#### Scenario: Committed write facts

- **WHEN** a mutation, action, schema reset, seed reset, or snapshot restore
  commits storage changes
- **THEN** the storage write outcome identifies the result as committed
- **AND** committed change rows are appended once for that write identity
- **AND** the returned cursor reflects the committed change rows

#### Scenario: Replayed write facts

- **WHEN** a mutation or action with a previously committed client-provided
  identity is replayed
- **THEN** the storage write outcome identifies the result as replayed
- **AND** the original stored response is returned
- **AND** duplicate change rows or action execution rows are not inserted

#### Scenario: Change readback

- **WHEN** sync reads committed changes after a cursor
- **THEN** Authority storage returns change rows from the write log for that
  app storage identity
- **AND** changes from other app storage identities are not visible

### Requirement: Record Materialization Boundary

The system SHALL keep stored record materialization explicit and separate from
write-log append behavior.

#### Scenario: Mutation materialization

- **WHEN** create, patch, delete, action-created record, or action tombstone
  effects are committed
- **THEN** record materializers write flat stored records or tombstones
- **AND** write-log change payloads describe the committed stored records
- **AND** schema validation, value validation, reference validation, and delete
  blocker checks happen before mutation

#### Scenario: Reset and restore materialization

- **WHEN** source schema reset, seed reset, snapshot restore, or archive app data
  restore runs
- **THEN** the reset or restore plan remains explicit before durable mutation
- **AND** action executions are cleared only by operations whose storage
  semantics require clearing them
- **AND** sync cursors remain monotonic after the operation

### Requirement: Authority Write Outcome Consumption

The system SHALL make Authority operation adapters consume storage write
outcomes instead of deriving write mode from protocol response shapes.

#### Scenario: Committed outcome consumed

- **WHEN** an Authority write operation receives a committed storage outcome
- **THEN** the operation returns the protocol response from that outcome
- **AND** the committed outcome is available for push sync notification policy

#### Scenario: Replay outcome consumed

- **WHEN** an Authority write operation receives a replayed storage outcome
- **THEN** the operation returns the protocol response from that outcome
- **AND** the replay outcome is distinguishable from a committed write without
  inspecting response payload shape
