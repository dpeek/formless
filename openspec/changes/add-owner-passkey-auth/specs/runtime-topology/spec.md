## ADDED Requirements

### Requirement: Canonical Instance Auth Routes

The system SHALL run owner passkey setup and login ceremonies on the canonical
instance auth origin.

#### Scenario: Instance profile auth route

- **GIVEN** a browser is on the canonical instance origin
- **WHEN** it navigates to `/setup` or `/login`
- **THEN** the client shell is eligible to render the owner setup or owner login
  route
- **AND** passkey ceremony API calls use the canonical instance auth origin

#### Scenario: Mapped app host is not passkey relying party

- **GIVEN** an enabled mapped `app` host targets an installed app
- **WHEN** that mapped host receives owner setup, owner login, or passkey
  ceremony requests
- **THEN** the mapped app host does not act as a WebAuthn relying party
- **AND** schema-key admin APIs remain unavailable on the mapped app host

#### Scenario: Mapped public Site host is not passkey relying party

- **GIVEN** an enabled mapped `publicSite` host targets an installed Site app
- **WHEN** that mapped host receives owner setup, owner login, or passkey
  ceremony requests
- **THEN** the mapped public Site host does not act as a WebAuthn relying party
- **AND** public Site document behavior remains separate from owner auth
