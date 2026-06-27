# Instance Auth Specification

## Purpose

Instance auth owns product instance passkey credentials, WebAuthn challenge
ceremonies, canonical auth origin policy, principal-backed owner session
issuance, logout, and admin bearer recovery boundaries. Reviewable owner
identity and owner authority are stored as identity control-plane principal,
principal-email, and role-assignment records.

## Requirements

### Requirement: Instance Auth Configuration

The system SHALL store explicit instance auth configuration for passkey
ceremonies.

#### Scenario: Canonical auth origin

- GIVEN a Formless instance has auth configured
- WHEN a passkey registration or login ceremony is started
- THEN the ceremony options use the configured canonical origin and WebAuthn
  relying-party id
- AND the relying-party id is not inferred from an arbitrary mapped request host

#### Scenario: Production auth uses primary route identity

- GIVEN an instance has selected a primary route as its production identity
- WHEN production passkey registration or login ceremonies are configured
- THEN canonical origin and relying-party id are derived from that selected
  route or explicit instance settings
- AND workers.dev origin remains a bootstrap or preview identity unless the
  owner explicitly selects it as production identity

#### Scenario: Missing auth configuration

- GIVEN owner setup or passkey login requires instance auth configuration
- WHEN canonical origin or relying-party id is missing
- THEN the ceremony request is rejected with a configuration error
- AND no principal, role assignment, credential, challenge, or session state is
  written

#### Scenario: Primary domain activation before production owner credentials

- GIVEN a deployed instance has only a workers.dev bootstrap origin
- WHEN the owner principal attempts to create production owner passkey
  credentials
- THEN the runtime requires configured canonical auth origin and relying-party
  id before accepting the ceremony
- AND local-dev bootstrap sessions and preview deployment remain available
  without creating production passkey credentials

### Requirement: First Owner Passkey Setup

The system SHALL register the first owner passkey as part of passkey-backed
first-owner setup.

#### Scenario: Complete setup with passkey

- GIVEN a valid owner setup capability exists for the instance
- WHEN setup completion submits owner identity and a valid passkey registration
  response for the active registration challenge
- THEN the system stores an active principal for the owner identity
- AND if the setup request includes an owner email, the system stores a primary
  principal-email record for that principal
- AND the system stores an active `instance.owner` role assignment for that
  principal at instance scope
- AND the system stores the passkey credential for that principal
- AND the setup capability is consumed
- AND no app install metadata or route record is created by owner setup
- AND an owner session cookie is issued for that principal

#### Scenario: Reject setup without valid passkey

- GIVEN a valid owner setup capability exists for the instance
- WHEN setup completion omits the passkey registration response or submits an
  invalid registration response
- THEN setup completion is rejected
- AND no owner principal or owner role assignment is stored
- AND no setup capability is consumed
- AND no owner session cookie is issued

### Requirement: Passkey Credential Storage

The system SHALL store passkey credentials as private instance auth metadata
bound to identity principals without storing private authenticator material.

#### Scenario: Store verified credential

- WHEN a passkey registration response is verified
- THEN the credential record stores principal id, credential id, public key,
  sign counter, credential device facts needed for later verification, created
  timestamp, and updated timestamp
- AND the credential record does not store a private key, raw setup token, or
  raw challenge secret

#### Scenario: Prevent duplicate credential id

- GIVEN a passkey credential id is already stored for the instance
- WHEN another registration attempts to store the same credential id
- THEN the registration is rejected
- AND the existing credential remains unchanged

### Requirement: Passkey Challenge Ceremonies

The system MUST make passkey registration and login challenges one-time and
instance-scoped.

#### Scenario: Registration options

- GIVEN first-owner setup is not complete and a valid setup capability is
  supplied
- WHEN registration options are requested
- THEN the system stores a one-time registration challenge scoped to the
  instance and setup capability
- AND the response contains only browser-safe WebAuthn creation options

#### Scenario: Login options

- GIVEN owner setup is complete with an active principal that has an active
  `instance.owner` role assignment
- AND at least one passkey credential is stored for that principal
- WHEN login options are requested
- THEN the system stores a one-time login challenge scoped to the instance
- AND the challenge is bound to the principal id selected for the eligible
  owner credential set
- AND the response contains only browser-safe WebAuthn request options for
  eligible owner credentials

#### Scenario: Challenge replay

- GIVEN a registration or login challenge has already been verified or has
  expired
- WHEN the same challenge is submitted again
- THEN verification is rejected
- AND no credential, principal, role assignment, or session state is written

### Requirement: Passkey Login

The system SHALL issue owner sessions after successful passkey assertion
verification.

#### Scenario: Successful passkey login

- GIVEN owner setup is complete
- AND an active principal has an active `instance.owner` role assignment at
  instance scope
- AND a passkey credential exists for that principal
- WHEN the owner submits a valid assertion for the active login challenge,
  canonical origin, relying-party id, and stored credential public key
- THEN the system updates the stored credential verification facts
- AND the system issues the existing owner session cookie for that principal

#### Scenario: Reject invalid passkey login

- WHEN a passkey login assertion has the wrong challenge, origin, relying-party
  id, credential id, principal, signature, or authenticator counter
- THEN login is rejected
- AND no owner session cookie is issued
- AND stored credential verification facts are not advanced

### Requirement: Owner Session Status And Logout

The system SHALL expose owner session status and logout for passkey-backed and
local-dev owner sessions.

#### Scenario: Session status after passkey login

- GIVEN an owner principal has logged in with a passkey
- WHEN the browser requests `/api/formless/session`
- THEN the response reports the owner as authenticated
- AND the response includes the display-safe owner identity from the principal
  records and session expiry

#### Scenario: Session status after local dev bootstrap

- GIVEN the browser has completed local dev owner session bootstrap
- WHEN the browser requests `/api/formless/session`
- THEN the response reports the local owner as authenticated
- AND the response includes the display-safe owner identity from the principal
  records and session expiry

#### Scenario: Logout clears owner session

- GIVEN a browser has an owner session cookie
- WHEN the browser posts to the logout endpoint
- THEN the response clears the owner session cookie
- AND later session status requests without a valid cookie report
  unauthenticated state

### Requirement: Owner Login Redirects

The system SHALL preserve safe owner-login return targets for browser routes
that require an owner session.

#### Scenario: Login completes with return target

- GIVEN an anonymous browser was redirected from an owner-only route to
  `/login` with a same-origin `redirectTo` path and query
- WHEN passkey login succeeds
- THEN an owner session cookie is issued
- AND the browser is returned to the requested route
- AND the return target is not exposed to passkey challenge verification as an
  authorization input

#### Scenario: Unsafe return target rejected

- GIVEN an owner login URL contains an absolute, protocol-relative,
  cross-origin, malformed, or unsupported `redirectTo` value
- WHEN login renders or completes
- THEN the unsafe return target is ignored
- AND the browser falls back to the product instance root after successful
  login

### Requirement: Principal-Backed Owner Authorization

The system SHALL authorize browser owner access through an active principal
with active `instance.owner` authority.

#### Scenario: Owner session resolves to active owner principal

- GIVEN a browser request includes a valid owner session cookie
- WHEN the session principal is active
- AND the principal has an active `instance.owner` role assignment at instance
  scope
- THEN owner-only browser routes and owner-protected management reads and writes
  accept the request as owner-authorized

#### Scenario: Owner session without active owner authority

- GIVEN a browser request includes a valid owner session cookie
- WHEN the session principal is missing, disabled, or no longer has an active
  `instance.owner` role assignment at instance scope
- THEN owner-only browser routes and owner-protected management reads and writes
  reject the request as unauthenticated owner access
- AND privileged writes do not rely only on stale role facts in the signed
  cookie payload

### Requirement: Admin Bearer Boundary

The system MUST keep admin bearer authorization separate from passkey browser
login.

#### Scenario: Admin bearer remains write authorization

- GIVEN an admin bearer token is configured
- WHEN a protected write request supplies the valid admin bearer token
- THEN the request is authorized without requiring a principal-backed owner
  session

#### Scenario: Admin bearer authorizes protected management reads

- GIVEN an admin bearer token is configured
- WHEN a trusted CLI or automation request reads an owner-protected management
  endpoint with the valid admin bearer token
- THEN the request is authorized without requiring a principal-backed owner
  session
- AND the token is not accepted as a browser owner-login credential

#### Scenario: Admin bearer mints owner setup capability

- GIVEN owner setup is incomplete and an admin bearer token is configured
- WHEN a trusted CLI or automation request creates an owner setup capability
  with a setup token and the valid admin bearer token
- THEN the runtime stores a hashed setup capability scoped to the requested
  instance and reports that setup remains incomplete
- AND the raw setup token and admin bearer token are not returned in the
  response
- AND if owner setup is already complete, the request reports the existing
  display-safe owner identity and does not replace the existing owner principal
  or store a new setup capability

#### Scenario: Owner setup bootstrap does not require owner-protected app state

- GIVEN owner setup is incomplete and an admin bearer token is available to a
  trusted CLI
- WHEN the CLI prepares an owner setup URL
- THEN it may read owner setup status and create the setup capability without
  first reading installed app, route, deployment, archive, or browser session
  state
- AND protected management reads remain separately authorized by owner session
  or admin bearer authorization

#### Scenario: Browser login does not accept admin token

- GIVEN owner setup is complete and passkey login is available
- WHEN a browser attempts normal owner login by submitting only an admin token
- THEN browser login is rejected
- AND no owner session cookie is issued from that token-only login attempt

### Requirement: Local Dev Owner Session Bootstrap

The system SHALL support owner session bootstrap for local workspace runtimes
without requiring passkey registration.

#### Scenario: Bootstrap local owner session

- **GIVEN** `formless dev` starts a local workspace runtime with a
  CLI-generated local session bootstrap token
- **WHEN** the same-origin browser requests the local session bootstrap endpoint
  with that token
- **THEN** the runtime creates a local active owner principal and active
  `instance.owner` role assignment if no owner principal exists
- **AND** the runtime issues the existing owner session cookie for that
  principal
- **AND** no passkey credential, passkey challenge, setup capability, app
  install, route record, Cloudflare resource, Alchemy resource, or provider
  resource is created

#### Scenario: Fresh local workspace does not require passkey setup

- **GIVEN** `formless dev` starts a fresh local workspace after CLI-owned
  workspace bootstrap
- **WHEN** browser onboarding needs an owner session for app install or local
  workspace gateway mutations
- **THEN** local session bootstrap is the owner-session setup path
- **AND** first-owner passkey setup is not required for local dev onboarding
- **AND** deployed or remote instance owner setup still uses the passkey-backed
  first-owner setup flow

#### Scenario: Reject local bootstrap outside local dev

- **WHEN** a deployed instance, mapped host, app profile, site-authoring
  profile, published Site profile, cross-origin browser, or request without the
  active local bootstrap token calls the local session bootstrap endpoint
- **THEN** the request is rejected
- **AND** no principal, role assignment, credential, challenge, setup
  capability, app install, session, or provider state is written
