## ADDED Requirements

### Requirement: Browser Workspace Operation Controls

Generated instance management UI SHALL expose local workspace operations when a
workspace gateway is available.

#### Scenario: Local workspace controls

- **WHEN** the product instance shell renders in a local workspace runtime with
  gateway status available
- **THEN** the UI can start workspace init, save, check, pull, push, deploy
  credential setup, deploy plan, and deploy apply operations through the gateway
- **AND** the UI does not expose arbitrary filesystem path inputs or raw file
  read/write controls

#### Scenario: Operation status display

- **WHEN** a workspace operation is running or completed
- **THEN** the UI can display operation status, progress, summaries, and
  display-safe errors from the gateway
- **AND** provider credentials, local secret values, raw provider state, and
  disallowed filesystem paths are not rendered

#### Scenario: External authorization prompt

- **WHEN** a workspace credential setup operation reports a display-safe
  external authorization URL
- **THEN** the UI can render an action to open that URL and continue polling the
  operation
- **AND** raw adapter or tool output, provider tokens, refresh tokens, Alchemy
  passwords, and local secret values are not rendered

### Requirement: Browser-First Onboarding UI

Generated instance management UI SHALL support onboarding a local workspace from
the browser.

#### Scenario: Empty workspace onboarding

- **WHEN** the browser opens a local runtime before workspace source has been
  initialized
- **THEN** the UI can invoke workspace initialization through the gateway
- **AND** after initialization the UI can create package app installs through
  Authority-backed app install actions

#### Scenario: Save after browser edits

- **WHEN** a browser owner or admin edits app install, route, domain, or deploy
  intent records
- **THEN** the UI can invoke workspace save through the gateway
- **AND** the saved workspace source is generated from Authority-backed records,
  not from manifest app, route, domain, or deploy fields
