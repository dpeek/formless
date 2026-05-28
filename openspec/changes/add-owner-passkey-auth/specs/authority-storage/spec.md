## MODIFIED Requirements

### Requirement: Instance Management APIs

The system SHALL expose instance-level management APIs separately from app
storage APIs.

#### Scenario: Instance app installs

- GIVEN the product instance shell reads or writes installed app metadata
- WHEN it calls `/api/formless/app-installs`
- THEN the request targets instance metadata storage
- AND installed app data remains scoped to each app storage identity

#### Scenario: Instance setup and passkey session

- GIVEN owner setup or passkey login runs for a product instance
- WHEN `/api/formless/setup`, `/api/formless/passkeys/*`, or
  `/api/formless/session` is used
- THEN owner identity, passkey credentials, passkey challenges, and owner
  session state are established independently from app install metadata
- AND write operations can be guarded by owner session cookies
- AND admin bearer authorization remains available for bootstrap, automation,
  and recovery-sensitive write paths
