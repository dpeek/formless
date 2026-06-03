## MODIFIED Requirements

### Requirement: Browser Workspace Operation Controls

Generated instance management UI SHALL expose local workspace operations when a
workspace gateway proxy is available through the local runtime.

#### Scenario: Local workspace controls

- **WHEN** the product instance shell renders in a local workspace runtime with
  gateway proxy status available
- **THEN** the UI can start workspace init, save, check, pull, push, deploy
  credential setup, deploy plan, and deploy apply operations through the
  same-origin gateway API family
- **AND** the UI does not expose arbitrary filesystem path inputs or raw file
  read/write controls
- **AND** the UI does not receive or render the sidecar loopback URL or internal
  proxy token

#### Scenario: Operation status display

- **WHEN** a workspace operation is running or completed
- **THEN** the UI can display operation status, progress, summaries, and
  display-safe errors returned through the local runtime gateway proxy
- **AND** provider credentials, local secret values, raw provider state, and
  disallowed filesystem paths are not rendered

#### Scenario: External authorization prompt

- **WHEN** a workspace credential setup operation reports a display-safe
  external authorization URL through the local runtime gateway proxy
- **THEN** the UI can render an action to open that URL and continue polling the
  operation
- **AND** raw adapter or tool output, provider tokens, refresh tokens, Alchemy
  passwords, and local secret values are not rendered

#### Scenario: Gateway proxy unavailable

- **WHEN** the product instance shell renders without local gateway proxy status
  available
- **THEN** the UI treats workspace gateway operations as unavailable
- **AND** it does not offer controls that would imply workspace filesystem,
  credential setup, deploy plan, or deploy apply execution is available
