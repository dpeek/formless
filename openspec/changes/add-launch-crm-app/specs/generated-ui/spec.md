## MODIFIED Requirements

### Requirement: Runtime Profile Routing

The system SHALL select generated surfaces from the active runtime profile and route policy.

#### Scenario: Dev workbench routes

- **GIVEN** the dev workbench profile
- **WHEN** the user visits `/tasks`, `/estii`, `/site`, `/crm`, their `/schema` routes, or installed app routes
- **THEN** the matching generated app, schema editor, admin, or public Site surface mounts
- **AND** legacy `/rates` routes redirect to `/estii` routes

#### Scenario: App custom-domain host

- **GIVEN** an app custom-domain host mapped to an app install
- **WHEN** the user visits `/` or `/schema`
- **THEN** the installed app mounts at `/`
- **AND** the mapped install schema editor mounts at `/schema`
- **AND** the instance shell is not exposed

### Requirement: App Frame And Settings

The system SHALL render app chrome according to profile and SHALL expose app-local controls through the app settings surface.

#### Scenario: Profile-specific chrome

- **GIVEN** a generated app is opened in the dev workbench profile
- **WHEN** the app renders
- **THEN** workbench chrome wraps the generated app
- **AND** the workbench runtime shell can switch between App management, bundled source apps, and supported installed apps
- **AND** the app profile renders generated app chrome without the workbench runtime shell

#### Scenario: Instance management shell

- **GIVEN** the product instance shell renders
- **WHEN** bundled app packages and custom domains are available
- **THEN** install controls support Site, Tasks, Estii, and CRM packages
- **AND** custom domain management shows desired route state and provider applied
  evidence separately
- **AND** Cloudflare API tokens and Alchemy secret values are not exposed to the
  browser

#### Scenario: App-local settings

- **GIVEN** app settings are opened for the active app
- **WHEN** settings render
- **THEN** sync status, a profile-exposed Schema link, source seed reset, and configured local Site publish controls are available
- **AND** legacy store snapshot Export or Restore controls are not shown
- **AND** portable archive backup, restore, or import controls are not shown
