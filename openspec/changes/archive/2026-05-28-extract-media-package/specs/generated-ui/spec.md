## ADDED Requirements

### Requirement: Media field package adapter

The system SHALL keep generated field layout and commit behavior in generated UI while delegating media-specific controls to the Media React adapter.

#### Scenario: Media editor uses package control

- **WHEN** a text field declares the `media` editor
- **THEN** generated UI uses the Media React adapter for asset selection, upload, preview, and broken-asset behavior
- **AND** the field value remains a flat text value committed by generated UI

#### Scenario: Image editor preserves fallback input

- **WHEN** a text field declares the `image` editor
- **THEN** generated UI preserves upload with preview and manual URL fallback behavior
- **AND** generic field labels, validation placement, layout, and commit policy remain owned by generated UI
