## ADDED Requirements

### Requirement: Local Dev Owner Session Bootstrap

The system SHALL support owner session bootstrap for local workspace runtimes
without requiring passkey registration.

#### Scenario: Bootstrap local owner session

- **GIVEN** `formless dev` starts a local workspace runtime with a
  CLI-generated local session bootstrap token
- **WHEN** the same-origin browser requests the local session bootstrap endpoint
  with that token
- **THEN** the runtime creates local owner state if no owner exists
- **AND** the runtime issues the existing owner session cookie for that owner
- **AND** no passkey credential, passkey challenge, setup capability, app
  install, route record, Cloudflare resource, Alchemy resource, or provider
  resource is created

#### Scenario: Reject local bootstrap outside local dev

- **WHEN** a deployed instance, mapped host, app profile, site-authoring
  profile, published Site profile, cross-origin browser, or request without the
  active local bootstrap token calls the local session bootstrap endpoint
- **THEN** the request is rejected
- **AND** no owner, credential, challenge, setup capability, app install,
  session, or provider state is written

## MODIFIED Requirements

### Requirement: First Owner Passkey Setup

The system SHALL register the first owner passkey as part of passkey-backed
first-owner setup.

#### Scenario: Complete setup with passkey

- GIVEN a valid owner setup capability exists for the instance
- WHEN setup completion submits owner identity and a valid passkey registration
  response for the active registration challenge
- THEN the system stores the owner identity and passkey credential
- AND the setup capability is consumed
- AND no app install metadata or route record is created by owner setup
- AND an owner session cookie is issued

#### Scenario: Reject setup without valid passkey

- GIVEN a valid owner setup capability exists for the instance
- WHEN setup completion omits the passkey registration response or submits an
  invalid registration response
- THEN setup completion is rejected
- AND no owner identity is stored
- AND no setup capability is consumed
- AND no owner session cookie is issued

### Requirement: Owner Session Status And Logout

The system SHALL expose owner session status and logout for passkey-backed and
local-dev owner sessions.

#### Scenario: Session status after passkey login

- GIVEN an owner has logged in with a passkey
- WHEN the browser requests `/api/formless/session`
- THEN the response reports the owner as authenticated
- AND the response includes the owner identity and session expiry

#### Scenario: Session status after local dev bootstrap

- GIVEN the browser has completed local dev owner session bootstrap
- WHEN the browser requests `/api/formless/session`
- THEN the response reports the local owner as authenticated
- AND the response includes the owner identity and session expiry

#### Scenario: Logout clears owner session

- GIVEN a browser has an owner session cookie
- WHEN the browser posts to the logout endpoint
- THEN the response clears the owner session cookie
- AND later session status requests without a valid cookie report
  unauthenticated state
