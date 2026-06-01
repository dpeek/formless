## ADDED Requirements

### Requirement: Archive Compatibility Normalization

The system SHALL normalize older supported archive versions before restore or
import validation.

#### Scenario: Restore older supported archive

- **WHEN** archive restore reads an older supported app or instance archive
  envelope
- **THEN** a version-specific normalizer converts it into the current internal
  restore model before validation
- **AND** restore planning reports normalization evidence in dry-run output
- **AND** version `1` app and instance archive envelopes are normalized to the
  latest archive envelope before validation

#### Scenario: Reject unsupported archive version

- **WHEN** archive restore reads an unsupported archive kind, unsupported
  version, or archive version without a registered normalizer
- **THEN** restore is rejected before mutation
- **AND** target app, instance, and media data remain unchanged

### Requirement: Export Latest Archive Format

The system SHALL write portable archives using the latest supported archive
envelope.

#### Scenario: Export app or instance archive

- **WHEN** an app or instance archive is exported
- **THEN** the archive uses the latest supported archive version
- **AND** the archive records enough package app revision and schema hash facts
  for future compatibility planning
- **AND** each archived app install records package revision and source schema
  hash facts
