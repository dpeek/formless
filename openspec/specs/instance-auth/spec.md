# Instance Auth Specification

## Purpose

Instance auth owns product instance passkey credentials, WebAuthn challenge
ceremonies, canonical auth origin policy, central auth sessions, local-dev
owner session issuance, host-local sessions, cross-domain handoff grants,
account completion gates, collaborator invitation token state, logout, and
admin bearer recovery boundaries. Reviewable owner identity, owner
authority, pending invitation facts, and policy acceptance facts are stored as
identity control-plane principal, principal-email, invitation, membership,
app-registration, role-assignment, account-policy, and
principal-policy-acceptance records.

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

#### Scenario: Owner setup status reports configured origins

- GIVEN first-owner setup is incomplete
- WHEN a trusted CLI reads owner setup status from a deployed instance
- THEN the status response includes `authOrigin` with the effective auth origin when instance
  auth configuration selects one
- AND the status response includes `adminOrigin` with the preferred admin origin when instance
  control-plane settings or route records select one
- AND if no effective auth origin is configured, the status response does not
  invent one from the workers.dev deployment host
- AND if no preferred custom admin route exists, the status response may report
  the deployment target URL as the admin fallback without treating it as the
  auth origin

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
- AND a central auth session cookie is issued for that principal on the
  configured auth origin
- AND when a valid admin target exists, the response includes a display-safe
  continuation target that moves the browser through the account continuation
  or mapped-admin entry flow instead of leaving a durable setup-complete surface
- AND deployed passkey setup does not issue a host-local session cookie

#### Scenario: Reject setup without valid passkey

- GIVEN a valid owner setup capability exists for the instance
- WHEN setup completion omits the passkey registration response or submits an
  invalid registration response
- THEN setup completion is rejected
- AND no owner principal or owner role assignment is stored
- AND no setup capability is consumed
- AND no central auth session, owner session, or host-local session cookie is
  issued

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

- GIVEN a browser opens `/formless/auth/invitations/accept` on the configured
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
- AND it returns a display-safe continuation target when the accepted invitation
  targets a same-origin route, mapped app, mapped public Site, or mapped
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

- GIVEN a browser navigates to `/formless/auth/invitations/accept` on the
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
  principal, session-expiry, and optional continuation target facts
- AND mapped app hosts and mapped public Site hosts do not render or start the
  passkey ceremony unless they are also the configured auth origin

#### Scenario: Continue after accepted invitation

- GIVEN invitation acceptance completes successfully
- WHEN the accepted invitation has a mapped app, mapped public Site, or mapped
  instance target
- THEN the browser surface continues through the target-bound cross-domain
  handoff flow
- AND it follows only the runtime-returned continuation target instead of
  synthesizing a cross-origin redirect target from raw URL search parameters
- AND mapped instance targets use the preferred admin origin resolved from the
  selected admin route, eligible primary route, or one unambiguous enabled
  custom admin route
- AND mapped instance continuations enter the `/formless/auth` continuation
  contract with target-bound handoff facts and a path-only return target
- AND the redirect target remains path-only for the target origin
- AND the auth origin does not issue a host-local session cookie directly for
  the target host
- AND when no handoff target is available, the surface remains on the auth
  origin and renders a display-safe accepted state

### Requirement: Passkey Login

The system SHALL issue central auth sessions after successful passkey assertion
verification.

#### Scenario: Successful passkey login

- GIVEN owner setup is complete
- AND an active principal has an active `instance.owner` role assignment at
  instance scope
- AND a passkey credential exists for that principal
- WHEN the owner submits a valid assertion for the active login challenge,
  canonical origin, relying-party id, and stored credential public key
- THEN the system updates the stored credential verification facts
- AND the system issues a central auth session cookie for that principal scoped
  to the configured auth origin
- AND the response includes a display-safe continuation target back through
  `/formless/auth`
- AND deployed passkey login does not issue a host-local session cookie

#### Scenario: Reject invalid passkey login

- WHEN a passkey login assertion has the wrong challenge, origin, relying-party
  id, credential id, principal, signature, or authenticator counter
- THEN login is rejected
- AND no central auth session, owner session, or host-local session cookie is
  issued
- AND stored credential verification facts are not advanced

### Requirement: Auth Session Status And Logout

The system SHALL expose account session status and logout for central auth
sessions, local-dev owner sessions, and mapped host-local sessions.

#### Scenario: Session status after central passkey login

- GIVEN an owner principal has logged in with a passkey
- WHEN the browser requests `/api/formless/session`
- THEN the response reports the owner as authenticated
- AND the response includes the display-safe owner identity from the principal
  records and central session expiry
- AND the response is available only on the configured auth origin for the
  central auth session cookie

#### Scenario: Session status after local dev bootstrap

- GIVEN the browser has completed local dev owner session bootstrap
- WHEN the browser requests `/api/formless/session`
- THEN the response reports the local owner as authenticated
- AND the response includes the display-safe owner identity from the principal
  records and session expiry

#### Scenario: Logout clears auth-origin session

- GIVEN a browser has a central auth session cookie or local-dev owner session
  cookie
- WHEN the browser posts to the logout endpoint
- THEN the runtime revokes any matching central auth session row
- AND the response clears the matching auth-origin session cookie
- AND the response includes a path-only continuation target for the
  runtime-owned sign-in route
- AND later session status requests without a valid cookie report
  unauthenticated state

#### Scenario: Mapped admin host session status and logout

- GIVEN a mapped instance admin host has completed cross-domain auth handoff
  for an owner principal
- WHEN the browser requests `/api/formless/session` from that mapped host with
  the host-local session cookie
- THEN the response reports the owner as authenticated without requiring a
  central auth-origin owner cookie on that host
- WHEN the browser posts to `/api/formless/session/logout` from that mapped
  host
- THEN the response clears the host-local session cookie
- AND the response does not issue a central auth session cookie on the mapped
  host

### Requirement: Account Auth Continuations

The system SHALL preserve safe account return targets for protected browser
routes through `/formless/auth` as the runtime-owned continuation contract.

#### Scenario: Account continuation completes with return target

- GIVEN an anonymous browser was redirected from a protected route to
  `/formless/auth` with a same-origin `returnTo` path and query
- WHEN passkey login succeeds
- THEN a central auth session cookie is issued on the configured auth origin
- AND `/formless/auth` validates route access and account completion for the
  target before continuing
- AND the browser is returned to the requested route only through the validated
  continuation target
- AND browser client code does not synthesize the final post-login destination
  from raw URL search parameters after login succeeds
- AND the return target is not exposed to passkey challenge verification as an
  authorization input

#### Scenario: Unsafe return target rejected

- GIVEN an account continuation URL contains an absolute, protocol-relative,
  cross-origin, malformed, or unsupported `returnTo` value
- WHEN login renders or completes
- THEN the unsafe return target is ignored
- AND `/formless/auth` uses the product instance root as the continuation
  target after successful login

#### Scenario: Account continuation may enter auth handoff

- GIVEN an anonymous browser was redirected to `/formless/auth` with
  target-bound handoff facts
- WHEN passkey login succeeds
- THEN `/formless/auth` follows the continuation with document navigation so
  the runtime-owned handoff route can issue a target-bound one-time grant
- AND gate completion, signup completion, and handoff continuation clients use
  the runtime-returned continuation target rather than constructing
  cross-origin handoff URLs from raw account URL parameters
- AND no absolute, protocol-relative, cross-origin, malformed, or unsupported
  handoff target is accepted

### Requirement: Central Auth And Host Sessions

The system SHALL keep passkey login and central auth sessions on the configured
auth origin while issuing host-local sessions for other instance hosts through
one-time grants.

#### Scenario: Central auth session origin

- GIVEN passkey setup, passkey login, or invitation acceptance succeeds on the
  configured auth origin
- WHEN the runtime issues browser session state for that principal
- THEN the central auth session is scoped to the auth origin host
- AND the session is signed, instance-bound, principal-bound, and expires
- AND mapped instance admin hosts, mapped app hosts, and mapped public Site
  hosts do not receive the central auth session cookie through shared cookie
  scope
- AND mapped instance admin hosts, mapped app hosts, and mapped public Site
  hosts do not start passkey registration or login ceremonies unless they are
  also the configured auth origin
- AND the owner session cookie is accepted only for local-dev bootstrap flows,
  not for normal deployed passkey login, setup, invitation acceptance, or
  account continuation

#### Scenario: Non-auth admin host protected entry starts handoff

- GIVEN an enabled exact-host route mounts the instance admin surface
- AND the mapped admin host is not the configured auth origin
- AND a browser navigates to a protected admin route on that admin host with an
  optional safe path-only target
- WHEN the browser does not include a valid host-local session for that admin
  route and `instance:control-plane` target
- THEN the admin host redirects to the configured auth origin through the
  cross-domain handoff start flow
- AND the handoff target origin is the admin host origin
- AND the handoff target route is the matched instance admin route
- AND the handoff target storage identity is `instance:control-plane`
- AND the return target is the original protected path and query when safe, or
  the admin route root when no safe target is available
- AND the admin host does not render account sign-in UI, start a passkey ceremony,
  issue a central auth session cookie, or silently mint credentials for its own
  host

#### Scenario: Non-auth admin host account gates redirect to auth origin

- GIVEN a configured auth origin exists
- AND an enabled exact-host route mounts the instance admin surface on another
  host
- WHEN a browser navigates to the account sign-in or setup gate route on the
  admin host
- THEN the admin host redirects to the same path and query on the configured
  auth origin
- AND setup status, setup capability creation, owner passkey registration, and
  setup completion remain accepted only on the configured auth origin when
  production auth is configured
- AND the admin host does not render account setup UI or start passkey
  registration unless it is also the configured auth origin

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

### Requirement: Auth Origin Account Orchestrator

The system SHALL expose `/formless/auth` on the configured auth origin as the
runtime-owned account orchestrator for protected browser continuations and
account completion gates.

#### Scenario: Resolve account continuation

- GIVEN a browser navigates to `/formless/auth` on the configured auth origin
- AND the request identifies a runtime-owned target through path-only return
  target facts or target-bound handoff facts
- AND the browser has an active central auth session for a principal that
  satisfies the target route access requirement
- WHEN account completion for that principal and target is complete
- THEN the orchestrator redirects to the validated path-only same-origin
  continuation or to the target-bound cross-domain handoff start path
- AND the redirect target is derived from runtime route resolution, setup state,
  invitation state, signup state, or app registration state
- AND absolute, protocol-relative, malformed, unsupported, or app-controlled
  redirect targets are rejected before redirecting
- AND no credential material, challenge secrets, token hashes, central session
  ids, host session cookies, handoff grant secrets, provider responses, recovery
  material, or app-private profile values are exposed in the response

#### Scenario: Render next blocking account gate

- GIVEN `/formless/auth` resolves a principal and target whose account
  completion result is blocked
- WHEN the request accepts HTML
- THEN the orchestrator renders an auth-origin browser surface for the next
  blocking gate
- AND the rendered gate includes only display-safe gate kind, target facts,
  route facts, and operation or policy references needed to render or launch the
  next step
- AND the surface does not issue a host-local session, mint a handoff grant, or
  redirect to the target while a blocking gate remains
- AND gates that do not yet have first-pass completion UI render a display-safe
  blocked state rather than falling through to the protected target

#### Scenario: Browser surface reads account status

- GIVEN a browser surface is rendering `/formless/auth` on the configured auth
  origin
- WHEN the surface reads the account status with `Accept: application/json`
- THEN the runtime returns the existing account completion result contract
- AND blocked results use the existing display-safe 409 account completion
  response
- AND complete results use a display-safe 200 account completion response whose
  continuation is the validated same-origin target or the target-bound
  cross-domain handoff path
- AND the status response does not issue a host-local session cookie, mint a
  handoff grant, or expose credential material, challenge secrets, token hashes,
  raw invite tokens, central session ids, host session cookies, handoff grant
  secrets, provider responses, recovery material, or app-private profile values

#### Scenario: Redirect unauthenticated account browser

- GIVEN a browser navigates to `/formless/auth` with a protected target
- WHEN the browser has no active central auth session for a principal that can
  evaluate that target
- THEN the orchestrator starts the configured credential entry path with a safe
  path-only return target back to `/formless/auth`
- AND the credential entry path remains on the configured auth origin
- AND no target host receives a central auth session cookie before the browser
  returns through the account orchestrator or handoff flow

#### Scenario: Account sign-in and setup gates use account orchestrator

- GIVEN a browser navigates to `/formless/auth/sign-in` or
  `/formless/auth/setup` on the configured auth origin
- WHEN the runtime can express the requested work as a `/formless/auth`
  continuation, credential, or setup gate
- THEN the runtime redirects or renders through the `/formless/auth`
  orchestrator contract
- AND sign-in and setup gates do not become durable logged-in account surfaces
- AND passkey ceremonies remain scoped to the configured auth origin and
  relying-party id

#### Scenario: Preserve machine-readable account gate responses

- GIVEN protected browser APIs, installed app APIs, operation requests, or
  non-HTML handoff requests encounter a blocking account completion gate
- WHEN the request does not accept an HTML account surface
- THEN the runtime returns the existing display-safe account completion result
  as a machine-readable `409` response
- AND the response does not include credential material, challenge secrets,
  token hashes, raw invite tokens, central session ids, host session cookies,
  handoff grant secrets, provider responses, recovery material, or app-private
  profile values

### Requirement: Account Completion Gate Resolution

The system SHALL evaluate target-scoped account completion gates before issuing
or using browser access for an authenticated target.

#### Scenario: Resolve next blocking account gate

- GIVEN an active principal has a central auth session or matching host-local
  session
- AND the runtime has resolved a requested target with target origin, route id,
  target profile, target app install or storage identity, path-only return
  target, and optional selected organization context
- WHEN the auth runtime evaluates account completion for that target
- THEN it returns either a display-safe continuation target or the next blocking
  gate for that principal and target
- AND supported first-pass gate kinds are `email-verification`, `credential`,
  `invitation`, `app-registration`, `profile-completion`,
  `terms-acceptance`, and `role-review`
- AND the gate response includes only display-safe gate kind, target facts,
  route facts, and operation or policy references needed to render or launch the
  next step
- AND it does not expose credential material, challenge secrets, token hashes,
  raw invite tokens, central session ids, host session cookies, handoff grant
  secrets, provider responses, recovery material, or app-private profile values

#### Scenario: Gate satisfaction reads current target state

- GIVEN account completion evaluates a target for an active principal
- WHEN the runtime checks gate satisfaction
- THEN `email-verification` requires a verified primary `principal-email`
  record for the principal
- AND `credential` requires an accepted credential method in private auth state
  for the principal
- AND `invitation` requires the target invitation to be accepted or no longer
  blocking the requested target
- AND `app-registration` requires an active `app-registration` record for the
  requested app install, principal or selected organization, and target context
- AND for app installs whose registration policy is `closed`, a missing
  `app-registration` remains a blocking `app-registration` gate that cannot be
  self-service completed by the authenticated principal
- AND `profile-completion` is satisfied only by app-owned records or explicit
  app operations declared for that target, not by arbitrary auth-runtime writes
  to app storage
- AND `terms-acceptance` requires an accepted
  `principal-policy-acceptance` record for each active account policy whose
  scope applies to the target
- AND `role-review` requires the current identity-control-plane role,
  membership, or approval records that authorize the requested high-privilege
  target
- AND stale signed session facts do not satisfy gates after principal status,
  role assignments, memberships, app registrations, policy records, or policy
  acceptances change

#### Scenario: Gate completion writes through owning records

- GIVEN the browser completes a blocking account gate on the configured auth
  origin
- WHEN the runtime commits the completion
- THEN it writes only the flat identity-control-plane, instance control-plane,
  private auth, or app-owned records that own that gate
- AND app profile completion uses explicit app operations or app-owned records
  rather than direct auth-runtime materialization of arbitrary app data
- AND terms acceptance writes `principal-policy-acceptance` records rather than
  changing credential or session state
- AND invitation completion continues to consume private invite token state and
  commit identity invitation acceptance atomically with the existing invitation
  acceptance contract
- AND gate completion returns a path-only continuation target or a display-safe
  cross-domain handoff target only after all earlier blocking gates for the same
  requested target are satisfied
- AND no host-local session or handoff grant is issued while a blocking gate
  remains

#### Scenario: Target-scoped gates remain isolated

- GIVEN a principal can access one app install, organization, or route target
- AND another target has a missing app registration, profile completion, terms
  acceptance, invitation, or role-review gate
- WHEN account completion evaluates either target
- THEN satisfied gates for the first target do not satisfy unrelated gates for
  the second target
- AND selected organization context is explicit when it affects app
  registration, role, profile, or terms gates
- AND app-private profile fields for one app install or organization are not
  exposed through another target's gate response
- AND public anonymous operations remain available through their public action
  policy without creating account completion gates

#### Scenario: Closed app registration gate

- GIVEN account completion evaluates an app target whose app install has
  registration policy `closed`
- AND the active principal has no active identity `app-registration` record for
  the requested app install and current principal or selected organization
  context
- WHEN the runtime resolves the next blocking account gate
- THEN it returns a display-safe `app-registration` gate with the target app
  install id, target facts, and registration policy `closed`
- AND the auth origin renders the gate as a blocked state rather than a signup
  or app profile form
- AND the runtime does not create or activate principal, principal-email,
  app-registration, role-assignment, app-owned profile, credential, central
  session, host session, or handoff grant state from that gate

#### Scenario: Closed app registration satisfied

- GIVEN account completion evaluates an app target whose app install has
  registration policy `closed`
- AND the active principal or selected organization has an active identity
  `app-registration` record for the requested app install
- WHEN the runtime resolves account completion for that target
- THEN the `app-registration` gate is satisfied
- AND later gates for verified email, credential, invitation, profile
  completion, terms acceptance, and role review still evaluate normally for
  the same target

#### Scenario: Email-verified app registration gate

- GIVEN account completion evaluates an app target whose app install has
  registration policy `email-verified`
- AND the active principal has a verified primary `principal-email` record and
  an accepted credential method
- AND the active principal or selected organization has no active identity
  `app-registration` record for the requested app install
- WHEN the runtime resolves the next blocking account gate
- THEN it returns a display-safe `app-registration` gate with the target app
  install id, target facts, registration policy `email-verified`, and a
  runtime-owned completion operation reference
- AND the gate response does not expose email challenge secrets, credential
  material, central session ids, host session cookies, handoff grant secrets,
  app-owned profile values, provider responses, or app-controlled redirect
  targets

#### Scenario: Complete email-verified app registration gate

- GIVEN a browser with an active central auth session completes an
  `email-verified` app-registration gate on the configured auth origin
- AND the principal still has active status, a verified primary email, an
  accepted credential, and a target whose app install still has registration
  policy `email-verified`
- WHEN the runtime commits the gate completion
- THEN identity storage creates or reuses one active `app-registration` record
  for the requested app install and principal or selected organization context
- AND the write is rejected without a partial commit when the target app
  install is missing, disabled, no longer `email-verified`, scoped to another
  target, or already has a conflicting active app-registration
- AND completion does not create role assignments, app-owned profile records,
  credentials, owner authority, host-local sessions, or cross-domain handoff
  grants
- AND the runtime re-evaluates account completion for the same target before
  returning a continuation target or starting target-bound handoff

#### Scenario: Custom operation app registration gate

- GIVEN account completion evaluates an app target whose app install has
  registration policy `custom-operation`
- AND the active principal has a verified primary `principal-email` record and
  an accepted credential method
- AND the active principal or selected organization has no active identity
  `app-registration` record for the requested app install
- WHEN the runtime resolves the next blocking account gate
- THEN it returns a display-safe `app-registration` gate with the target app
  install id, target facts, registration policy `custom-operation`, and a
  runtime-owned completion operation reference
- AND the operation reference is derived from the app install's
  `registrationOperation` metadata and includes only the target app install,
  canonical operation key, operation name, entity name, and display label needed
  to launch the next account step
- AND the gate response does not expose email challenge secrets, credential
  material, central session ids, host session cookies, handoff grant secrets,
  app-owned profile values, operation input values, provider responses, or
  app-controlled redirect targets

#### Scenario: Complete custom operation app registration gate

- GIVEN a browser with an active central auth session completes a
  `custom-operation` app-registration gate on the configured auth origin
- AND the principal still has active status, a verified primary email, an
  accepted credential, and a target whose app install still has registration
  policy `custom-operation`
- WHEN the runtime commits the app-registration part of the gate
- THEN identity storage creates or reuses one active `app-registration` record
  for the requested app install and principal or selected organization context
- AND completion does not create role assignments, app-owned profile records,
  credentials, owner authority, host-local sessions, or cross-domain handoff
  grants
- AND the runtime re-evaluates account completion for the same target and
  returns a `profile-completion` gate for the app-owned registration operation
  when the app profile requirement remains unsatisfied

#### Scenario: Complete operation-backed profile gate

- GIVEN account completion returns a `profile-completion` gate with an app-owned
  registration operation reference
- AND the gate includes only the display-safe operation input contract fields
  and unsupported required input field names needed to render or block the form
- AND the browser submits declared operation input for that gate on the
  configured auth origin
- WHEN the runtime validates the current central auth session, target facts,
  current gate, operation reference, and operation input
- THEN the runtime invokes the declared operation against the target app storage
  identity with authenticated actor facts for the active principal and target
  session
- AND app profile records are created or updated only through the declared app
  operation effect, operation handler, or record plan
- AND operation record plans may write flat app records that reference
  `auth:principal`, `auth:organization`, or `auth:group` using normal identity
  reference validation
- AND the auth runtime does not directly materialize arbitrary app profile
  records outside the operation model
- AND after the operation commits, the runtime re-evaluates account completion
  for the same target before returning a continuation target or starting
  target-bound handoff
- AND the profile gate response does not expose credential material, challenge
  secrets, token hashes, central session ids, host session cookies, handoff
  grant secrets, provider responses, recovery material, app-private profile
  values beyond the operation's authenticated response contract, or
  app-controlled redirect targets

### Requirement: Email Verification Challenge State

The system SHALL store email verification challenge secrets as private
instance auth state bound to the configured auth origin and account target.

#### Scenario: Create email verification challenge

- GIVEN the account journey needs a verified email for owner setup, signup,
  invitation acceptance, recovery, or account completion
- WHEN the runtime creates an email verification challenge
- THEN private auth state stores only a token hash, normalized email, purpose,
  target facts, created timestamp, expiry, and consumed or revoked status
- AND the challenge email is scheduled through the email runtime with an
  idempotent source record or private challenge identifier
- AND the verification link uses the configured auth origin
- AND raw verification tokens and token hashes are not stored in identity
  control-plane records, email-delivery records, queue messages, workspace
  state, archives, sync payloads, or reviewable snapshots
- AND creating an email verification challenge does not verify an email, create
  an app-registration, issue credentials, issue sessions, or mint handoff
  grants

#### Scenario: Verify email challenge

- GIVEN a browser submits an email verification token on the configured auth
  origin for the matching account target
- WHEN private auth state verifies an unexpired, unrevoked, unconsumed token
- THEN identity storage creates or updates one `principal-email` record for the
  principal with normalized email, display email, verified status, primary flag,
  and verified timestamp according to the target flow
- AND the token is consumed only when the matching identity write is durable
- AND wrong-token, wrong-email, wrong-target, expired, revoked, consumed, or
  missing challenge attempts do not reveal whether an unrelated principal
  exists for the same email
- AND verification does not create app-registration records, role assignments,
  credentials, owner authority, host-local sessions, or handoff grants

### Requirement: Email-Verified App Signup

The system SHALL support self-service app signup for app installs whose
registration policy is `email-verified`.

#### Scenario: Start email-verified app signup

- GIVEN an anonymous browser requests an app route whose target app install has
  registration policy `email-verified`
- WHEN the route requires authenticated browser access and no valid principal
  session exists
- THEN the runtime redirects through `/formless/auth` on the configured auth
  origin with target-bound continuation facts
- AND the auth-origin signup surface may request a display name and email
  address for the target app install
- AND signup start rejects missing auth configuration, missing email delivery
  configuration, disabled app installs, unsupported registration policies,
  unsafe return targets, and app-controlled redirect targets before creating
  verification challenges or identity records

#### Scenario: Complete email-verified app signup

- GIVEN an email-verified signup flow has verified control of the requested
  primary email on the configured auth origin
- AND passkey registration has been verified for the signup principal on the
  configured auth origin and relying-party id
- WHEN the runtime commits signup for the requested app target
- THEN it stores or reuses an active principal, stores a verified primary
  `principal-email`, stores the passkey credential as private auth state,
  creates or reuses an active app-registration for the requested app install,
  and issues a central auth session on the configured auth origin
- AND duplicate normalized active emails, duplicate credentials, wrong-origin
  passkey ceremonies, wrong-target signup state, unsupported registration
  policy, and stale target facts reject signup without a partial commit
- AND signup does not grant owner authority, create `instance.admin` authority,
  create app-owned profile records, issue host-local sessions directly from the
  auth origin, or expose raw verification tokens, token hashes, credential
  material, central session ids, host session cookies, or handoff grant secrets
- AND after signup commits, the runtime re-evaluates account completion for the
  target before returning a path-only continuation or target-bound handoff

### Requirement: Terms Acceptance Completion

The system SHALL let authenticated principals complete target-scoped
terms-acceptance gates by writing reviewable identity policy acceptance records.

#### Scenario: Complete terms acceptance gate

- GIVEN account completion returns a `terms-acceptance` gate for an active
  principal and target
- WHEN the browser accepts the listed active policies on the configured auth
  origin
- THEN identity storage creates accepted `principal-policy-acceptance` records
  for the principal and every required active policy whose scope applies to the
  target
- AND existing accepted records for the same principal and policy are reused
  rather than duplicated
- AND retired, wrong-scope, revoked, tombstoned, or app-controlled policies do
  not satisfy the target gate
- AND terms acceptance does not authenticate the principal, create credentials,
  create app-registration records, grant roles, issue host-local sessions, or
  mint handoff grants
- AND the runtime re-evaluates account completion for the same target before
  returning a continuation target or starting target-bound handoff

### Requirement: Principal-Backed Authenticated Authorization

The system SHALL authorize authenticated browser access through an active
principal with a valid central auth-origin, local-dev owner, or host-local
browser session.

#### Scenario: Session resolves to active authenticated principal

- GIVEN a browser request includes a valid central auth session for the
  configured auth origin, local-dev owner session, or host-local session
- WHEN the session principal is active
- AND central auth sessions are used only on the configured auth origin
- AND host-local sessions match the request host, route, target profile, and
  target app install or storage identity
- THEN authenticated browser routes and operations accept the request as
  authenticated
- AND the resulting operation invocation envelope includes actor kind
  `authenticated`, the principal id, and the route or storage target facts used
  for authorization

#### Scenario: Session without active authenticated principal

- GIVEN a browser request includes a valid central auth session, local-dev owner
  session, or host-local session
- WHEN the session principal is missing, disabled, revoked, or scoped to a
  different host, route, profile, app install, storage identity, or instance
- THEN authenticated browser routes and operations reject the request as
  unauthenticated
- AND the runtime does not build an authenticated operation invocation envelope
  from stale signed session facts

### Requirement: Principal-Backed Owner Authorization

The system SHALL authorize browser owner access through an active principal
with active `instance.owner` authority.

#### Scenario: Owner access resolves to active owner principal

- GIVEN a browser request includes a valid central auth session on the configured
  auth origin, local-dev owner session cookie, or matching host-local session
- WHEN the session principal is active
- AND the principal has an active `instance.owner` role assignment at instance
  scope
- THEN owner-only browser routes and owner-protected management reads and writes
  accept the request as owner-authorized

#### Scenario: Owner access without active owner authority

- GIVEN a browser request includes a valid central auth session, local-dev owner
  session cookie, or matching host-local session
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

- GIVEN a browser request includes a valid central auth session on the configured
  auth origin, local-dev owner session, or matching host-local session
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

- GIVEN a browser request includes a valid central auth session, local-dev owner
  session, or matching host-local session
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
  rotating browser session signing policy, and creating or rotating admin-bearer
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
- AND the requested instance identity is derived from the host that receives the
  setup capability request
- AND setup completion only accepts the setup token for the same host-derived
  instance identity
- AND the raw setup token and admin bearer token are not returned in the
  response
- AND if owner setup is already complete, the request reports the existing
  display-safe owner identity and does not replace the existing owner principal
  or store a new setup capability

#### Scenario: Trusted CLI uses configured auth origin for setup capability

- GIVEN owner setup is incomplete and an admin bearer token is available to a
  trusted CLI
- AND the deployed instance reports an effective auth origin in owner setup
  status
- WHEN the CLI prepares an owner account setup URL
- THEN the CLI creates the setup capability on that auth origin
- AND the browser account setup URL uses the same auth origin
- AND the runtime does not silently fall back to the workers.dev deployment host
  when the auth-origin capability request is unreachable or misconfigured

#### Scenario: Owner setup bootstrap does not require owner-protected app state

- GIVEN owner setup is incomplete and an admin bearer token is available to a
  trusted CLI
- WHEN the CLI prepares an owner account setup URL
- THEN it may read owner setup status and create the setup capability without
  first reading installed app, route, deployment, archive, or browser session
  state
- AND protected management reads remain separately authorized by central
  auth-origin session, local-dev owner session, host-local session, or admin
  bearer authorization

#### Scenario: Browser login does not accept admin token

- GIVEN owner setup is complete and passkey login is available
- WHEN a browser attempts normal browser passkey login by submitting only an
  admin token
- THEN browser login is rejected
- AND no central auth session or owner session cookie is issued from that
  token-only login attempt

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
- **AND** local dev bootstrap does not create a central auth session unless a
  configured local auth origin explicitly uses the normal deployed auth flow
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
