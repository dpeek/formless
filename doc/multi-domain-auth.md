# Multi-Domain Auth Remaining Work

Last updated: 2026-07-17

Purpose: describe only the remaining unshipped work for owner setup, account
orchestration, identity authorization, access management, app registration, and
recovery across Formless domains.

This is not a shipped behavior contract. Shipped behavior lives in
`openspec/specs/*/spec.md`. Update or remove this document as the remaining
behavior moves into canonical specs.

Passkeys are the only supported credential method. Other authentication methods
are out of scope.

## Common Account Journey

Converge owner setup, sign in, invitation acceptance, account completion, and
recovery on one runtime-owned journey at the configured auth origin.

`/formless/auth` should orchestrate the journey. It should resolve the current
principal session, requested target, setup or invitation grant, route policy,
account gates, and next step. Specialized entry routes may collect grant-specific
input, but they should use the same gate and continuation machinery rather than
owning separate account flows.

### Production Owner Setup

Replace the current passkey-first owner bootstrap with this production sequence:

1. Validate the owner setup capability.
2. Collect the owner's display name and required primary email.
3. Verify control of that email.
4. Register the owner's passkey on the configured auth origin.
5. Atomically create the active principal, verified primary `principal-email`,
   passkey credential, and active `instance.owner` role assignment.
6. Consume the setup capability.
7. Issue the central auth session.
8. Continue to the preferred instance administration target through the common
   continuation flow.

No durable owner authority should exist before email and passkey verification
both succeed. A failure must not leave a partially active principal, verified
email, credential, role assignment, session, or consumed setup capability.

Local development may retain an explicit trusted bootstrap shortcut. It must
not become the production browser setup path.

### Shared Entry Flows

Move these entrypoints onto the common journey:

- owner setup;
- owner sign in;
- collaborator invitation acceptance;
- recovery.

Invitation acceptance should use the shared email, credential, gate, session,
and continuation behavior after validating its invitation grant. It should not
remain a parallel passkey and navigation implementation.

### Direct Auth Entry

A direct visit to the configured auth origin without a target should resolve a
useful destination:

- unauthenticated browser: show eligible sign-in or setup choices;
- authenticated owner or instance admin: continue to the preferred instance
  administration origin;
- authenticated principal with one available app destination: continue to it;
- authenticated principal with multiple destinations: render a destination
  picker;
- authenticated principal with no destination: render account status and sign
  out only.

Organization selection must be explicit when more than one active organization
can satisfy a target.

### Runtime-Owned Continuations

Move successful setup, sign-in, invitation, gate, recovery, and logout
navigation onto one runtime-owned continuation contract.

- Continuation targets must come from runtime route, setup, invitation,
  registration, or recovery state.
- Return targets must remain path-only for their target origin.
- Browser code may perform passkey ceremonies and follow returned continuation
  targets, but it must not construct cross-origin destinations.
- Successful auth views must exit to the resolved target, destination picker, or
  signed-out state.
- Separate React routes must not own final destination policy.

## Authorization Completion

Finish the principal-backed authorization model so app roles, memberships, and
organization context can govern operations rather than serving only as identity
and account-gate facts.

### Operation Actor Facts

Extend the operation invocation envelope with the current facts used for the
authorization decision:

- principal id;
- central or host session identity when needed for audit or revocation;
- target app install or storage identity;
- applicable role assignments and scopes;
- applicable group and organization memberships;
- explicitly selected organization context;
- authentication method `passkey` and assurance facts when required.

Signed session claims must not replace current identity reads for privileged
writes or management access.

### Operation Policy

Add coarse role-aware operation requirements:

- any authenticated principal;
- a named role at instance, app-install, or organization scope;
- owner-only;
- instance-admin-or-owner.

Actor context expressions should support:

- `mode`;
- `principalId`;
- `organizationId`, only when explicitly selected;
- verified primary `email`, only when policy permits exposing it.

Record-level authorization can remain app-owned through flat ownership or
organization reference fields. Do not add nested ACL state.

### Delegated App Administration

Allow an active `app.admin` to invite and manage app-scoped collaborators only
for its app install when that install permits delegated access management.

An app admin must not grant instance roles, owner authority, access to another
app install, or organization authority outside its current grant scope.

## Access Management Lifecycle

Expand the dedicated access surface beyond invitation creation and pending
invitation revocation.

Remaining actions:

- resend an eligible pending invitation through the email runtime;
- disable a principal;
- remove or replace role assignments;
- add or remove group and organization memberships;
- manage app registrations and app-scoped roles after invitation acceptance;
- transfer owner authority;
- remove owner authority while preserving at least one active owner.

These actions need purpose-built APIs and explicit confirmation. Do not expose a
generic identity-control-plane record editor.

Owner-sensitive actions must recheck the current principal and role assignments.
Only an active `instance.owner` may grant or remove owner authority, recover an
owner credential, or perform an action that affects the last-owner boundary.
An active `instance.admin` may manage operational and app-scoped access but must
not receive owner recovery authority.

## Remaining Account Gates And Registration

### Role Review

Add a completion path for `role-review` gates. A high-privilege request should
create or reference reviewable pending approval state, expose it through access
management, and continue only after a currently authorized owner or admin grants
the required role.

The requester must not be able to satisfy its own role-review gate unless it
already has grant authority for that role and scope.

### Destination And Organization Selection

Add runtime-owned selection when a principal has multiple valid app,
administration, or organization destinations. Selection must use current
registrations, memberships, roles, routes, and account gates. It must not accept
arbitrary app-controlled origins or paths.

The selected organization becomes explicit target context for app registration,
profile completion, terms, role checks, host sessions, and operation actor
facts.

### Domain-Allowlist Registration

Add `domain-allowlist` as an app-install registration policy.

- Eligibility must use the principal's verified primary email.
- Allowed domains must be explicit app-install or control-plane policy data.
- Domain comparison must use normalized email-domain values.
- A match may permit app registration but must not grant instance or owner
  authority.
- Registration must still evaluate profile, terms, role, and target gates before
  browser access.

## Passkey Recovery

Add recovery without allowing email verification alone to restore privileged
access.

### External App User

A verified email challenge may authorize registration of a replacement passkey
for a low-privilege app user. Recovery must revoke or supersede affected browser
sessions and continue through normal app account gates.

### Collaborator

A verified email challenge may start collaborator recovery. Restoring privileged
instance or app roles additionally requires current owner or authorized admin
approval, or an explicit delayed recovery policy with notifications.

### Instance Owner

Owner recovery requires all of:

- verified control of an existing recovery email;
- registration of a replacement passkey on the configured auth origin;
- another active owner approval, an admin-bearer recovery capability, or an
  explicit delayed recovery policy;
- notification to existing verified owner recovery addresses;
- last-owner and current-role checks before authority is restored.

Email verification alone must never restore `instance.owner` or
`instance.admin` authority.

### Recovery State

Private recovery state should include:

- purpose;
- principal and normalized email target;
- token hash;
- expiry and attempt timestamps;
- status;
- approval or delay state;
- affected credential and session revocation facts.

Raw tokens, passkey material, session ids, provider responses, and recovery
capabilities must remain outside identity records, app records, archives, sync
payloads, and browser presentation contracts.

## Security Requirements For Remaining Work

- Email, setup, invitation, approval, and recovery challenges are one-time,
  short-lived, purpose-bound, target-bound, and stored by hash.
- Passkey ceremonies remain on the configured auth origin and relying-party id.
- Mutating cookie-authorized APIs require same-origin validation and CSRF
  protection or an equivalent operation-bound request token.
- Privileged writes recheck current principal status, role assignments,
  memberships, selected organization context, and session revocation state.
- Disabled principals and removed authority invalidate or narrow future browser
  authorization.
- Auth pages must not render app-controlled HTML or follow app-controlled
  redirects.
- Remaining flows must preserve the existing separation between reviewable
  identity records and private auth state.

## Implementation Sequence

1. Move production owner setup onto verified-email-first common account gates.
2. Converge owner sign-in and invitation acceptance on the common account
   journey.
3. Complete direct `/formless/auth` destination resolution and remove per-route
   destination policy.
4. Expand operation actor facts and add role-aware operation policy.
5. Add delegated app administration and the remaining access lifecycle actions.
6. Add role-review approval and explicit destination or organization selection.
7. Add `domain-allowlist` app registration.
8. Add passkey recovery for app users, collaborators, and owners with increasing
   approval requirements.

## Decisions

- Passkeys are the only credential method.
- Production owner email verification happens before passkey registration and
  before granting `instance.owner`.
- `/formless/auth` is the common account orchestrator; specialized routes do not
  own separate account state machines or destination policy.
- Owner authority remains an `instance.owner` role assignment, not a separate
  identity class or cookie kind.
- Organization context is explicit.
- App-specific profile and authorization fields remain flat app records that
  reference common identity records.
- Operation authorization uses current principal, role, membership, target, and
  revocation state.
- Recovery email verification is necessary but insufficient for privileged
  recovery.
