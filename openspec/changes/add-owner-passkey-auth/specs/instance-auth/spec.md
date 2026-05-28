## ADDED Requirements

### Requirement: Instance Auth Configuration

The system SHALL store explicit instance auth configuration for passkey
ceremonies.

#### Scenario: Canonical auth origin

- **GIVEN** a Formless instance has auth configured
- **WHEN** a passkey registration or login ceremony is started
- **THEN** the ceremony options use the configured canonical origin and
  WebAuthn relying-party id
- **AND** the relying-party id is not inferred from an arbitrary mapped request
  host

#### Scenario: Missing auth configuration

- **GIVEN** owner setup or passkey login requires instance auth configuration
- **WHEN** canonical origin or relying-party id is missing
- **THEN** the ceremony request is rejected with a configuration error
- **AND** no owner, credential, challenge, or session state is written

### Requirement: First Owner Passkey Setup

The system SHALL register the first owner passkey as part of first-owner setup.

#### Scenario: Complete setup with passkey

- **GIVEN** a valid owner setup capability exists for the instance
- **WHEN** setup completion submits owner identity and a valid passkey
  registration response for the active registration challenge
- **THEN** the system stores the owner identity and passkey credential
- **AND** the setup capability is consumed
- **AND** the default app install policy runs
- **AND** an owner session cookie is issued

#### Scenario: Reject setup without valid passkey

- **GIVEN** a valid owner setup capability exists for the instance
- **WHEN** setup completion omits the passkey registration response or submits
  an invalid registration response
- **THEN** setup completion is rejected
- **AND** no owner identity is stored
- **AND** no setup capability is consumed
- **AND** no owner session cookie is issued

### Requirement: Passkey Credential Storage

The system SHALL store owner passkey credentials as instance metadata without
storing private authenticator material.

#### Scenario: Store verified credential

- **WHEN** a passkey registration response is verified
- **THEN** the credential record stores owner id, credential id, public key,
  sign counter, credential device facts needed for later verification, created
  timestamp, and updated timestamp
- **AND** the credential record does not store a private key, raw setup token, or
  raw challenge secret

#### Scenario: Prevent duplicate credential id

- **GIVEN** a passkey credential id is already stored for the instance
- **WHEN** another registration attempts to store the same credential id
- **THEN** the registration is rejected
- **AND** the existing credential remains unchanged

### Requirement: Passkey Challenge Ceremonies

The system MUST make passkey registration and login challenges one-time and
instance-scoped.

#### Scenario: Registration options

- **GIVEN** first-owner setup is not complete and a valid setup capability is
  supplied
- **WHEN** registration options are requested
- **THEN** the system stores a one-time registration challenge scoped to the
  instance and setup capability
- **AND** the response contains only browser-safe WebAuthn creation options

#### Scenario: Login options

- **GIVEN** owner setup is complete and at least one owner passkey credential is
  stored
- **WHEN** login options are requested
- **THEN** the system stores a one-time login challenge scoped to the instance
- **AND** the response contains only browser-safe WebAuthn request options for
  eligible owner credentials

#### Scenario: Challenge replay

- **GIVEN** a registration or login challenge has already been verified or has
  expired
- **WHEN** the same challenge is submitted again
- **THEN** verification is rejected
- **AND** no credential, owner, or session state is written

### Requirement: Passkey Login

The system SHALL issue owner sessions after successful passkey assertion
verification.

#### Scenario: Successful passkey login

- **GIVEN** owner setup is complete and an owner passkey credential exists
- **WHEN** the owner submits a valid assertion for the active login challenge,
  canonical origin, relying-party id, and stored credential public key
- **THEN** the system updates the stored credential verification facts
- **AND** the system issues the existing owner session cookie for that owner

#### Scenario: Reject invalid passkey login

- **WHEN** a passkey login assertion has the wrong challenge, origin,
  relying-party id, credential id, owner, signature, or authenticator counter
- **THEN** login is rejected
- **AND** no owner session cookie is issued
- **AND** stored credential verification facts are not advanced

### Requirement: Owner Session Status And Logout

The system SHALL expose owner session status and logout for passkey-backed owner
sessions.

#### Scenario: Session status after passkey login

- **GIVEN** an owner has logged in with a passkey
- **WHEN** the browser requests `/api/formless/session`
- **THEN** the response reports the owner as authenticated
- **AND** the response includes the owner identity and session expiry

#### Scenario: Logout clears owner session

- **GIVEN** a browser has an owner session cookie
- **WHEN** the browser posts to the logout endpoint
- **THEN** the response clears the owner session cookie
- **AND** later session status requests without a valid cookie report
  unauthenticated state

### Requirement: Admin Bearer Boundary

The system MUST keep admin bearer authorization separate from passkey browser
login.

#### Scenario: Admin bearer remains write authorization

- **GIVEN** an admin bearer token is configured
- **WHEN** a protected write request supplies the valid admin bearer token
- **THEN** the request is authorized without requiring a passkey owner session

#### Scenario: Browser login does not accept admin token

- **GIVEN** owner setup is complete and passkey login is available
- **WHEN** a browser attempts normal owner login by submitting only an admin
  token
- **THEN** browser login is rejected
- **AND** no owner session cookie is issued from that token-only login attempt
