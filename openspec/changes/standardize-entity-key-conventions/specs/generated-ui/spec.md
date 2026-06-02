## ADDED Requirements

### Requirement: Builder Kebab-Case Entity Keys

Generated UI SHALL let Builder author schema entities with canonical kebab-case
entity keys and render clean human labels for those entities.

#### Scenario: Create builder-owned kebab-case entity

- **WHEN** a user creates a Builder-owned entity with a key such as
  `app-install`, `project-note`, or `block-placement`
- **THEN** Builder accepts the key when the schema parser accepts it
- **AND** the emitted schema stores that key locally in the `entities` object
  without a namespace prefix

#### Scenario: Reject non-canonical entity key in Builder

- **WHEN** a user enters an entity key with camelCase, uppercase characters,
  underscores, dots, slashes, colons, leading digits, leading hyphens, trailing
  hyphens, or double hyphens
- **THEN** Builder reports validation feedback before save
- **AND** Save schema remains unavailable until the draft parses

#### Scenario: Render entity labels from kebab-case keys

- **WHEN** generated UI renders an entity whose source key is `app-install`,
  `domain-mapping`, or `deploy-drift-report`
- **THEN** human-facing labels are derived from words such as `App install`,
  `Domain mapping`, or `Deploy drift report`
- **AND** generated UI does not treat hyphens as namespace separators

#### Scenario: Preserve saved key locking

- **WHEN** a kebab-case entity key has been saved
- **THEN** Builder keeps the saved entity key locked under the existing schema
  authoring rules
- **AND** this change does not rename saved field keys, query keys, view keys,
  action keys, or screen keys
