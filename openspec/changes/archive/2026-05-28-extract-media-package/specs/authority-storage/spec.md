## ADDED Requirements

### Requirement: Media storage adapter boundary

The system SHALL keep Authority app storage separate from instance media storage while consuming Media package Worker adapters through public subpaths.

#### Scenario: App storage avoids media internals

- **WHEN** Authority storage handles bootstrap, schema, sync, mutations, actions, reset, snapshot, or record restore
- **THEN** it does not deep-import Media package internals
- **AND** media object handling stays behind public Media package Worker/runtime contracts

#### Scenario: Media remains outside Authority records

- **WHEN** app records are committed or restored through Authority storage
- **THEN** owned media object bytes and provider storage metadata remain outside Authority app records
