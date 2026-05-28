## ADDED Requirements

### Requirement: Site media package boundary

The system SHALL render Site images through Media package public contracts while keeping Site usage metadata in Site records.

#### Scenario: Site resolves core media through Media helpers

- **WHEN** a Site image block references a core media asset id
- **THEN** Site runtime resolves delivery facts through Media package public helpers or adapters
- **AND** public rendering continues to prefer core media delivery before manual href fallback

#### Scenario: Site usage metadata stays outside Media

- **WHEN** Site authoring or public rendering uses alt text, caption, crop, slot, focal point, poster override, width, height, or fallback href
- **THEN** those facts remain Site-owned flat record values
