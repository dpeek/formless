## MODIFIED Requirements

### Requirement: App Frame And Settings

The system SHALL render app chrome according to profile and SHALL expose
app-local controls through the app settings surface.

#### Scenario: App-local settings

- **GIVEN** app settings are opened for the active app
- **WHEN** settings render
- **THEN** sync status, a profile-exposed Schema link, and source seed reset are
  available where supported
- **AND** local Site publish controls are not shown
- **AND** legacy store snapshot Export or Restore controls are not shown
- **AND** portable archive backup, restore, or import controls are not shown

#### Scenario: Instance management provider actions

- **GIVEN** the product instance shell renders domain, route, deployment, drift,
  or provider evidence state
- **WHEN** the user reviews provider resources
- **THEN** domain-provider apply controls and apply-job polling controls are not
  shown
- **AND** supported explicit provider delete, manual cleanup, or evidence repair
  controls may remain available for selected recorded evidence
- **AND** provider mutation guidance points to workspace deploy
