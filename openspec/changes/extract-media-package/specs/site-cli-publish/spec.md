## ADDED Requirements

### Requirement: Site CLI media package boundary

The system SHALL keep Site CLI save, publish, import, and archive behavior stable while consuming Media contracts from public package subpaths.

#### Scenario: Archive workflows use Media contract

- **WHEN** Site CLI publish, save, import, export, or restore workflows validate or move core media payloads
- **THEN** they use public Media package contracts for media asset, storage key, delivery, and restore result shapes

#### Scenario: Existing archive behavior remains stable

- **WHEN** Site CLI workflows move referenced owned image media
- **THEN** media is represented with core media objects and the `core-media-assets` capability
- **AND** records do not receive provider-specific URLs
