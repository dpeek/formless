# Instance Auth Specification

## Purpose

Instance auth owns product instance passkey credentials, WebAuthn challenge
ceremonies, canonical auth origin policy, principal-backed owner session
issuance, central auth sessions, host-local sessions, cross-domain handoff
grants, collaborator invitation token state, logout, and admin bearer recovery
boundaries. Reviewable owner identity, owner authority, and pending invitation
facts are stored as identity control-plane principal, principal-email,
invitation, membership, app-registration, and role-assignment records.

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

### Requirement: Collaborator Invitation Token State

The system SHALL store collaborator invitation token secrets as private
instance auth state bound to reviewable identity invitation records.

#### Scenario: Create invitation token

- GIVEN a grant-authorized collaborator invitation request is accepted
- WHEN the runtime creates the invite token
- THEN private auth state stores only a token hash, invitation id, normalized
  target email, target surface facts, created timestamp, expiry, and consumed or
  revoked status
- AND the token expiry matches the pending identity `invitation` record expiry
- AND the raw invite token is only available to the delivery path that renders
  the invitation link
- AND the raw invite token and token hash are not stored in identity
  control-plane records, email-delivery records, queue messages, workspace
  state, archives, sync payloads, or reviewable snapshots
- AND creating an invitation token does not issue a passkey credential, central
  auth session, host-local session, or cross-domain handoff grant

#### Scenario: Reject unauthorized invitation token creation

- GIVEN a collaborator invitation request asks for identity records outside the
  current browser principal's invitation grant authority
- WHEN the runtime evaluates the request
- THEN it rejects the request before creating private invite token state
- AND no invitation token hash, raw invite token, rendered invitation link,
  email delivery request, passkey challenge, central session, host-local
  session, or cross-domain handoff grant is created

#### Scenario: Revoke invitation token

- GIVEN a pending identity collaborator invitation has matching private
  invitation token state
- WHEN grant-authorized access management revokes the collaborator invitation
- THEN private auth state records the token as revoked
- AND later invitation acceptance eligibility and completion reject the
  invitation as revoked
- AND token revocation does not expose the raw invite token, token hash,
  credential material, passkey challenge secrets, central session ids,
  host-local session cookies, handoff grant secrets, provider responses, or
  recovery material
- AND token revocation does not issue credentials, central auth sessions,
  host-local sessions, or cross-domain handoff grants

#### Scenario: Reject invalid invitation token revocation

- WHEN invitation token revocation targets missing, consumed, expired, or
  already revoked private token state
- THEN the revocation request is rejected or reported as not applied without
  issuing credentials, sessions, or handoff grants
- AND raw invite tokens, token hashes, credential material, passkey challenge
  secrets, central session ids, host-local session cookies, handoff grant
  secrets, provider responses, and recovery material remain private auth state

#### Scenario: Invitation link origin

- GIVEN a collaborator invitation email is rendered
- WHEN the runtime builds the invitation link
- THEN the link uses the configured auth origin
- AND the auth origin is selected by instance auth configuration rather than an
  arbitrary mapped app or public Site request host
- AND the link target does not expose owner setup, passkey ceremony internals,
  central session ids, host session cookies, or app-controlled redirect targets

### Requirement: Collaborator Invitation Acceptance

The system SHALL accept collaborator invitations on the configured auth origin
by verifying private invite token state, registering passkeys for new
principals, committing identity acceptance, and issuing central auth sessions.

#### Scenario: Invitation acceptance eligibility

- GIVEN a browser opens `/_formless/auth/invitations/accept` on the configured
  auth origin with an invitation id and raw invite token
- WHEN the runtime checks acceptance eligibility
- THEN it hashes the raw token and verifies it against private invitation token
  state
- AND it requires a matching pending identity invitation with the same target
  email, target surface, target app install, or target organization facts
- AND it rejects missing, expired, revoked, consumed, accepted, wrong-token,
  wrong-email, and wrong-target invitations without revealing whether an
  unrelated principal exists for the same email
- AND eligibility checks do not consume the token, create a passkey challenge,
  activate identity records, create credentials, issue sessions, or mint
  handoff grants

#### Scenario: Invitation-bound passkey registration options

- GIVEN an invitation is eligible for acceptance on the configured auth origin
- WHEN passkey registration options are requested for the invitation
- THEN the runtime creates a one-time registration challenge scoped to the
  instance, invitation id, token hash, invited principal, canonical auth
  origin, and relying-party id
- AND the response contains only browser-safe WebAuthn creation options for
  the accepted principal
- AND mapped app hosts and mapped public Site hosts do not start the
  invitation passkey ceremony unless they are also the configured auth origin
- AND requesting options does not consume the invite token, activate identity
  records, store credentials, issue sessions, or mint handoff grants

#### Scenario: Complete invitation acceptance

- GIVEN an invitation-bound passkey registration challenge is active
- AND the browser submits a valid registration response for the challenge,
  canonical auth origin, relying-party id, and accepted principal
- WHEN the runtime completes invitation acceptance
- THEN it stores the passkey credential as private auth state for the accepted
  principal
- AND it consumes the matching invitation token
- AND it commits the identity-control-plane invitation acceptance changes for
  the same principal and target facts
- AND it issues a central auth session scoped to the configured auth origin
- AND it redirects through the normal cross-domain grant flow when the
  accepted invitation targets a mapped app, mapped public Site, or mapped
  instance host
- AND raw invite tokens, token hashes, passkey challenge secrets, credential
  material, central session ids, host session cookies, and handoff grant
  secrets are not stored in identity records, email-delivery records, queue
  messages, workspace state, archives, sync payloads, or reviewable snapshots

#### Scenario: Reject invalid invitation acceptance completion

- WHEN invitation acceptance completion uses a missing, expired, already
  consumed, revoked, wrong-token, wrong-target, wrong-challenge, malformed, or
  duplicate passkey credential
- THEN acceptance is rejected
- AND the invite token is not consumed before the matching identity acceptance
  commit is durable
- AND failed or retried completion attempts do not authorize an invited
  principal, issue a central auth session, issue a host-local session, or mint a
  handoff grant from stale or partial state

### Requirement: Collaborator Invitation Acceptance Browser Surface

The system SHALL render collaborator invitation acceptance as an auth-origin
browser surface that drives the invitation acceptance APIs without depending on
an installed app route or generated app UI.

#### Scenario: Render eligible invitation

- GIVEN a browser navigates to `/_formless/auth/invitations/accept` on the
  configured auth origin with an invitation id and raw invite token
- WHEN the invitation acceptance eligibility check succeeds
- THEN the browser surface renders display-safe invitation facts needed to
  continue acceptance, including target email, target surface, expiry, and
  invited principal display name when available
- AND it does not render or persist raw invite tokens, token hashes, passkey
  challenge secrets, credential material, central session ids, host session
  cookies, or handoff grant secrets
- AND the surface is served by instance auth runtime behavior rather than by an
  installed app, public Site document, source app screen, or generated
  identity-control-plane record editor

#### Scenario: Render ineligible invitation safely

- GIVEN a browser opens an invitation acceptance URL whose token, target,
  invitation, auth configuration, or origin is invalid or unavailable
- WHEN the eligibility check fails
- THEN the browser surface renders a display-safe failure state
- AND it does not reveal whether an unrelated principal exists for the same
  email address
- AND it does not start passkey registration, activate identity records, create
  credentials, issue sessions, mint handoff grants, or redirect to an
  app-controlled target

#### Scenario: Complete passkey-backed invitation acceptance

- GIVEN the browser surface has an eligible invitation
- WHEN the invited user starts passkey registration and submits the resulting
  registration response from the configured auth origin
- THEN the surface requests invitation-bound registration options and verifies
  the registration through the invitation acceptance APIs
- AND successful completion stores the credential, consumes the invite token,
  commits identity acceptance, and receives only display-safe accepted
  principal, session-expiry, and optional handoff target facts
- AND mapped app hosts and mapped public Site hosts do not render or start the
  passkey ceremony unless they are also the configured auth origin

#### Scenario: Continue after accepted invitation

- GIVEN invitation acceptance completes successfully
- WHEN the accepted invitation has a mapped app, mapped public Site, or mapped
  instance target
- THEN the browser surface continues through the target-bound cross-domain
  handoff flow
- AND the redirect target remains path-only for the target origin
- AND the auth origin does not issue a host-local session cookie directly for
  the target host
- AND when no handoff target is available, the surface remains on the auth
  origin and renders a display-safe accepted state

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

### Requirement: Central Auth And Host Sessions

The system SHALL keep passkey login and central auth sessions on the configured
auth origin while issuing host-local sessions for other instance hosts through
one-time grants.

#### Scenario: Central auth session origin

- GIVEN a passkey login succeeds on the configured auth origin
- WHEN the runtime issues browser session state for that login
- THEN the central auth session is scoped to the auth origin host
- AND the session is signed, instance-bound, principal-bound, and expires
- AND mapped app hosts and mapped public Site hosts do not receive the central
  auth session cookie through shared cookie scope
- AND mapped app hosts and mapped public Site hosts do not start passkey
  registration or login ceremonies unless they are also the configured auth
  origin

#### Scenario: One-time grant issuance

- GIVEN a browser without a valid host-local session requests an
  authenticated or owner-only route on a host that is not the configured auth
  origin
- AND the target host starts auth handoff with a host-local nonce cookie,
  target origin, route id, target profile, target app install or storage
  identity, path-only redirect target, and state
- WHEN the auth origin verifies or creates a central auth session for an active
  principal that satisfies the target route access requirement
- THEN the runtime stores a one-time grant bound to the instance, principal,
  target origin, route id, target profile, target app install or storage
  identity, redirect target, nonce, state, and expiry
- AND the raw grant secret is not stored in identity control-plane records,
  workspace state, archives, sync payloads, or reviewable snapshots
- AND absolute, protocol-relative, cross-origin, malformed, or unsupported
  redirect targets are rejected before grant issuance

#### Scenario: Host session callback

- GIVEN a target host receives the reserved auth callback route with a grant and
  state
- WHEN the target host validates the host-local nonce cookie and consumes a
  matching unexpired grant through the instance auth runtime
- THEN the grant cannot be used again
- AND the target host issues a host-local session cookie scoped to that request
  host
- AND the host session is signed, instance-bound, principal-bound,
  target-origin-bound, route-bound, target-profile-bound, and app-install or
  storage-identity-bound
- AND the host session includes issued time, expiry, and revocation or session
  version facts
- AND the browser redirects only to the path-only redirect target recorded in
  the consumed grant

#### Scenario: Reject invalid host session handoff

- WHEN a callback attempts to consume a missing, expired, already-used,
  wrong-state, wrong-nonce, wrong-origin, wrong-route, wrong-profile,
  wrong-install, or wrong-instance grant
- THEN the callback is rejected
- AND no host-local session cookie is issued
- AND the callback does not expose passkey ceremony, owner setup, central
  account-management behavior, or app-controlled redirects

#### Scenario: Host session authorization remains current

- GIVEN a host-local session exists for a principal
- WHEN an authenticated browser route, operation, privileged write, or
  protected management read or write is authorized from that session
- THEN the runtime rechecks current principal status and host session
  revocation or version facts
- AND owner-only routes and owner-only management reads or writes also recheck
  active `instance.owner` authority
- AND instance-admin management reads or writes recheck active
  `instance.admin` authority or active `instance.owner` authority according to
  the path's required management role
- AND disabled principals, removed owner authority, changed role assignments, or
  revoked session versions invalidate or narrow future authorization
- AND host sessions are not accepted on a different host, route, app install,
  storage identity, target profile, or instance

### Requirement: Principal-Backed Authenticated Authorization

The system SHALL authorize authenticated browser access through an active
principal with a valid instance or host-local browser session.

#### Scenario: Session resolves to active authenticated principal

- GIVEN a browser request includes a valid owner session or host-local session
- WHEN the session principal is active
- AND the session target matches the request host, route, target profile, and
  target app install or storage identity
- THEN authenticated browser routes and operations accept the request as
  authenticated
- AND the resulting operation invocation envelope includes actor kind
  `authenticated`, the principal id, and the route or storage target facts used
  for authorization

#### Scenario: Session without active authenticated principal

- GIVEN a browser request includes a valid owner session or host-local session
- WHEN the session principal is missing, disabled, revoked, or scoped to a
  different host, route, profile, app install, storage identity, or instance
- THEN authenticated browser routes and operations reject the request as
  unauthenticated
- AND the runtime does not build an authenticated operation invocation envelope
  from stale signed session facts

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

### Requirement: Principal-Backed Instance Admin Authorization

The system SHALL authorize operational instance management through active
principals with active `instance.admin` authority while preserving owner-only
recovery authority.

#### Scenario: Instance admin session resolves to management authority

- GIVEN a browser request includes a valid owner session or matching
  host-local session
- WHEN the session principal is active
- AND the principal has an active `instance.admin` role assignment at instance
  scope
- THEN operational instance management reads and writes accept the request as
  instance-admin-authorized
- AND an active `instance.owner` role assignment at instance scope also
  satisfies instance-admin authorization
- AND authorization is based on current identity-control-plane principal and
  role-assignment records rather than stale role facts in signed cookies

#### Scenario: Instance admin session without active admin authority

- GIVEN a browser request includes a valid owner session or matching
  host-local session
- WHEN the session principal is missing, disabled, or no longer has active
  `instance.admin` or `instance.owner` authority at instance scope
- THEN operational instance management reads and writes reject the request as
  unauthorized management access
- AND removed admin authority, disabled principals, or changed role assignments
  invalidate or narrow future management authorization

#### Scenario: Instance admin does not receive owner recovery authority

- GIVEN a browser request is authorized only by active `instance.admin`
  authority
- WHEN the request attempts owner-only recovery or auth-sensitive management
- THEN the request is rejected unless the principal also has active
  `instance.owner` authority or the request uses valid admin bearer
  authorization where that path explicitly allows it
- AND owner-only recovery includes granting, revoking, or disabling
  `instance.owner`, removing the last active owner, owner setup replacement,
  owner credential recovery, changing auth origin or relying-party policy,
  rotating owner-session signing policy, and creating or rotating admin-bearer
  recovery material

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
