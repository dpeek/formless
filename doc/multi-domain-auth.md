# Multi-Domain Auth Architecture

Last updated: 2026-06-29

Purpose: architecture direction for collaborator auth, app user auth, and
multi-domain session handoff in Formless.

This is not shipped behavior. Shipped behavior lives in
`openspec/specs/*/spec.md`.

## Source Anchors

- `openspec/specs/instance-auth/spec.md` defines current owner passkey setup,
  canonical auth origin policy, owner sessions, logout, and admin bearer
  recovery boundaries.
- `openspec/specs/runtime-topology/spec.md` defines runtime profiles, route
  access, exact-host mapped app and public Site hosts, and the rule that mapped
  app/public hosts do not become WebAuthn relying parties.
- `openspec/specs/custom-domains/spec.md` defines exact-host mappings as
  schema-owned `route` records.
- `openspec/specs/instance-control-plane/spec.md` defines `instance-settings`,
  primary route, auth route/origin facts, email domains, and email senders as
  flat control-plane records.
- `openspec/specs/app-schema/spec.md` and `doc/operations.md` define operations
  as the interaction model and actor policy as operation policy.
- `openspec/specs/public-actions/spec.md` defines anonymous public operation
  bindings and target-scoped public operation routes.
- `openspec/specs/email-runtime/spec.md` defines instance-scoped outbound email
  delivery, idempotent delivery records, and default sender selection.
- `src/worker/owner-session.ts` currently signs instance-bound owner cookies
  named `formless_owner_session`.
- `src/worker/instance-auth-runtime.ts` currently derives passkey auth config
  from explicit env, dev origin, or control-plane production identity.
- `lib/schema/src/types.ts` currently supports operation actors `admin`,
  `cliDeployer`, `owner`, `runner`, and `anonymous`.
- `src/shared/operation-invocation.ts` currently stores only actor kind in the
  operation invocation envelope.

## Recommendation

Use one instance-scoped identity system with one central auth origin. Mapped app
and public Site domains are clients of that auth origin. They receive host-local
sessions through one-time grants; they do not run independent WebAuthn
ceremonies and they do not share the central auth cookie.

Represent people, groups, organizations, memberships, roles, and app
registrations as common instance identity records. App schemas extend those
records by storing normal flat app records that reference identity records.
Credentials, challenges, recovery tokens, grant secrets, and raw session
material remain private runtime auth state, not app records.

The first owner becomes a principal with an `instance.owner` role assignment.
Collaborators and later external app users are principals with narrower role or
membership assignments.

## Principles

- Instance identity is common. Apps do not get separate user tables for auth.
- App data stays flat. App-specific profile and account records reference
  identity records by id.
- Authentication and authorization are separate. Credentials prove a principal;
  role, group, organization, route, and operation policy decide access.
- The auth origin is explicit. It is selected from `instance-settings.authRoute`
  or `instance-settings.authOrigin`, never inferred from arbitrary mapped hosts.
- Mapped hosts get host-local sessions. Browser cookies are scoped to the host
  that serves the app or Site surface.
- Email verification is a recovery and invitation primitive, not the primary
  credential.
- Public anonymous operations remain available without auth. Authenticated
  users are a new actor mode, not a replacement for public operation policy.
- Provider state remains separate. Domains and email deployment continue to
  flow through control-plane route and email records.

## Core Model

Recommended reviewable identity records live in a new runtime-owned storage
identity, tentatively `instance:identity`, backed by a normal App schema source.
Use a separate identity control-plane package slice rather than adding broad
people and role records to the existing instance control-plane, which already
owns installs, routes, deployments, production identity, and email intent.

Private auth state remains outside reviewable identity records. It can stay in
Durable Object SQL tables owned by the auth runtime.

Reviewable records:

- `principal`: instance-local subject. Human users and future service actors
  are principals.
- `principal-email`: normalized email address, verification status, primary and
  recovery flags, and principal reference.
- `group`: named permission group within the instance.
- `organization`: named tenant or account boundary within the instance.
- `membership`: principal membership in a group or organization.
- `role`: named permission bundle or runtime-known role key.
- `role-assignment`: assigns a role to a principal, group, or organization
  scope.
- `app-registration`: optional principal or organization registration for one
  app install.
- `invitation`: display-safe pending invite facts.

Private auth state:

- passkey credential public key and verification counters;
- auth method binding facts for future OAuth, password, magic link, or SSO;
- passkey challenge rows;
- email verification challenge rows with token hashes;
- invite token hashes;
- central auth session rows;
- one-time cross-domain grant rows;
- host session revocation or session-version rows.

Keep ids instance-local. Do not create a global Formless account model until a
separate product requirement needs cross-instance identity.

## Principal Shape

`principal` should be the stable identity reference used by app records and
operation actors.

Fields:

- `displayName`
- `kind`: `human` first, `service` later
- `status`: `active`, `invited`, `disabled`
- `createdAt` and `updatedAt` through record system fields

Owner is not a separate identity class. Owner is a role assignment:

- role key: `instance.owner`
- assignment target: principal
- scope: instance

This keeps first-owner setup, collaborators, and external users on the same
identity path.

## Roles And Authorization

Start with a small runtime role vocabulary:

- `instance.owner`: full instance management, auth management, deploy, app
  install, route, and data access.
- `instance.admin`: instance management without owner recovery authority.
- `app.admin`: generated admin and app data management for one app install.
- `app.editor`: app data writes for one app install.
- `app.viewer`: app data reads for one app install.
- `app.user`: authenticated app user for one app install.

Role assignments should have flat scope fields:

- `scopeKind`: `instance`, `app-install`, or `organization`
- `scopeId`: record id or install id for the scope
- `role`
- one target reference: `principal`, `group`, or `organization`

Groups are permission containers. Organizations are tenant/account containers.
An organization may receive role assignments, and principals may become
organization members. Apps can then reference the organization from their own
records without duplicating organization auth state.

Do not make record-level ACLs a first primitive. Let app schemas model record
ownership and organization references as fields, then let operation policy and
query/projection layers use actor context to filter or authorize records.

These role keys are intentionally small and runtime-owned. App packages can
model richer domain roles in app records later, but the base runtime should only
ship roles it can enforce directly.

### Instance Management Boundary

`instance.owner` is the recovery and authority root. It should be required for:

- granting, revoking, or disabling `instance.owner` assignments;
- owner recovery, owner setup replacement, and high-risk credential recovery;
- changing auth origin, relying-party, or owner-session signing policy;
- creating or rotating admin-bearer recovery material;
- destructive identity actions that would remove the last active owner.

`instance.admin` is operational administration. It should be enough for:

- managing app installs, app routes, domains, deploy intent, email sender intent,
  and generated app administration surfaces;
- reading owner/admin management APIs that do not expose recovery material;
- inviting and revoking non-owner collaborators, including other
  `instance.admin` principals when owner policy allows admin delegation;
- assigning app-scoped roles such as `app.admin`, `app.editor`, `app.viewer`,
  and `app.user`.

`instance.admin` must not grant `instance.owner`, remove the last owner, mint
owner recovery capabilities, or convert admin-bearer authorization into browser
login. `instance.owner` should satisfy any `instance.admin` check unless a path
explicitly needs owner-only recovery authority.

The runtime should make the permission check explicit. Owner-management guards
should resolve the authenticated principal and recheck current role assignments;
the cookie name alone must not imply owner or admin authority. Admin bearer
authorization stays a separate trusted CLI/automation path.

## App Schema Interface

App schemas need a way to reference common identity records without owning auth.

Preferred schema direction:

- allow reference targets such as `auth:principal`, `auth:organization`, and
  `auth:group`;
- store those references as normal flat record ids;
- validate them against the identity control-plane storage identity at write
  time when the runtime can resolve that storage identity;
- expose identity references to generated UI through normal reference
  presentations;
- let app packages define app-specific profile records that reference
  `auth:principal` or `auth:organization`.

Example app records:

```json
{
  "customer-profile": {
    "fields": {
      "principal": {
        "type": "reference",
        "required": true,
        "to": "auth:principal"
      },
      "organization": {
        "type": "reference",
        "required": false,
        "to": "auth:organization"
      },
      "crmContact": {
        "type": "reference",
        "required": false,
        "to": "contact"
      }
    }
  }
}
```

This is an extension model, not inheritance. The app profile is app data. The
principal, email verification, credentials, and role assignments remain runtime
identity data.

## Operation Actor Policy

Add authenticated actor support to operation policy after the identity runtime
exists.

Recommended actor modes:

- `anonymous`: current public operation actor.
- `authenticated`: any active principal with a valid app or instance session.
- `owner`: principal with `instance.owner`.
- `admin`, `cliDeployer`, and `runner`: current runtime actors.

The operation invocation envelope should expand from actor kind only to actor
facts:

- actor kind;
- principal id when present;
- central auth session id or host session id when present;
- app install id or storage identity scope;
- role and membership evidence used for the decision;
- authentication method and assurance when needed.

Actor context expressions should grow beyond `mode` so operation record plans
can write source facts:

- `principalId`
- `organizationId`, only when the request selected one active organization
  context;
- `email`, only for verified primary email when policy permits exposing it;
- `mode`

Policy should first support coarse requirements:

- any authenticated principal;
- a named role in an instance or app-install scope;
- owner-only.

Record-level predicates can come later. They should reference flat fields on
the target record, such as `createdBy`, `organization`, or `assignedTo`, rather
than nested ACL state.

Organization context is explicit. When a principal belongs to more than one
organization, the selected organization must be chosen as part of the host
session or request flow. Operation policy should not infer the active
organization from an arbitrary app record.

## Route Access

Current route access is `anonymous` or `owner`.

Add `authenticated` before adding broader route policy expressions. It is enough
for app-login gates and self-service app surfaces. Owner-only management routes
continue to require `instance.owner` or admin bearer authorization.

Route access remains a coarse browser and management API gate. Operation policy
is still the write/read command authority for generated app behavior.

## Central Auth Origin

The auth origin is an instance route, not a property of each mapped app host.

Resolution order:

1. `instance-settings.authOrigin`, when explicit.
2. `instance-settings.authRoute`, resolved to an enabled exact-host route.
3. `instance-settings.primaryRoute`, if it can safely serve the instance auth
   surface.

The auth origin must be an HTTPS origin, except localhost/dev. The WebAuthn
relying-party id must match the auth origin host or a parent domain of that
host. A mapped app host or published Site host must not start passkey
ceremonies unless it is also the configured auth origin.

This keeps current passkey origin policy and makes app domains independent of
WebAuthn relying-party constraints.

## Cross-Domain Session Handoff

Use top-level browser redirects and one-time grants.

Flow:

1. Browser requests an authenticated app route on `https://app.example.net`.
2. Runtime sees no valid host session for that host, route, and app install.
3. Target host creates a short-lived auth-start nonce, stores it in a
   host-local nonce cookie, and redirects to
   `https://auth.example.com/login?client=<route-id>&redirectTo=<path>&state=<state>`.
4. Auth origin verifies or creates the central auth session through passkey.
5. Auth origin creates a short-lived one-time grant bound to:
   - instance id;
   - principal id;
   - target origin;
   - target route id;
   - target profile;
   - target app install id or storage identity;
   - redirect path;
   - nonce/state;
   - expiry.
6. Auth origin redirects back to
   `https://app.example.net/_formless/auth/callback?grant=<grant>&state=<state>`.
7. Target host verifies and consumes the grant through the same instance
   Authority/auth runtime, and requires returned state to match the host-local
   auth-start nonce cookie.
8. Target host sets a host-local session cookie and redirects to the original
   app path.

The host session cookie should be:

- `HttpOnly`
- `Secure`
- `SameSite=Lax`
- path scoped to `/`
- signed and instance-bound
- host-bound through the browser cookie scope and signed payload target origin
- app-install or route scoped in the payload
- short enough to reduce stale authorization risk
- revocable through central auth session version or server-side host session
  rows

Do not depend on third-party cookies or credentialed CORS. APIs on the mapped
host should be same-origin with the app surface.

## Session Types

Central auth session:

- set only on the auth origin;
- proves the browser has authenticated as a principal for the instance;
- used to mint host-local grants;
- can manage credentials, email verification, invites, and account settings.

Host session:

- set on an instance, app, or public Site host;
- scoped to one route/app install/profile;
- authorizes browser and API requests on that host;
- carries enough actor facts to build an operation invocation envelope;
- includes session version facts for the principal, role assignments, and
  selected organization context;
- checks current role state or server-side revocation before privileged writes.

Host sessions may cache read authorization for their short lifetime. Mutating
operations and owner/admin management reads must recheck current principal
status, role assignment state, and selected organization context.

Owner session:

- current `formless_owner_session` can be retired into the central/host session
  model;
- owner authority comes from `instance.owner`, not from the cookie name.

Admin bearer:

- stays separate from browser login;
- remains a trusted CLI/automation recovery and write boundary;
- may mint owner or recovery capabilities but is not accepted as a browser
  credential.

## Collaborator Invites

Invites are operations on the identity control plane.

Invite creation:

- requires `instance.owner`, `instance.admin`, or another explicit
  auth-management permission scoped to the roles being granted;
- stores display-safe `invitation` facts;
- stores token hash and expiry in private auth state;
- optionally preassigns roles, groups, organization membership, or app-install
  registration;
- schedules email through the email runtime using configured sender defaults.

Invite authority rules:

- `instance.owner` may invite principals with any runtime role, including
  `instance.owner`, subject to last-owner safety checks.
- `instance.admin` may invite `instance.admin` and app-scoped roles only when
  admin delegation is enabled for the instance; it must never grant
  `instance.owner`.
- `app.admin` may invite app-scoped collaborators only for its app install when
  the app install allows delegated app access management.
- Invite creation must reject role assignments outside the inviter's current
  grant authority before writing the invitation record or private token hash.

Invite acceptance:

- runs on the auth origin;
- verifies the invite token and email address;
- creates a principal if needed;
- requires passkey registration for a new principal;
- records verified email;
- applies memberships and role assignments atomically with invite acceptance;
- issues a central auth session;
- redirects through the normal cross-domain grant flow to the target surface.

Invite policy:

- expired and revoked invites cannot be accepted;
- accepting an invite must not reveal whether an unrelated principal exists for
  the same email;
- email control proves delivery address ownership, not authorization beyond the
  invite scope.

## Access Management UI

Do not expose the identity control plane as a raw generated record editor for
normal administrators. Build a dedicated instance access surface backed by the
identity APIs.

Recommended first UI:

- route: an owner/admin instance shell route such as `/access` or
  `/settings/access`;
- people list: active and invited principals, primary email, status, current
  instance/app roles, and selected organization/app registrations;
- invitations list: pending, accepted, expired, and revoked invitations with
  target email, target surface, granted roles, expiry, delivery status, inviter,
  and resend/revoke actions;
- invite flow: email, display name, role, app install or organization scope when
  needed, expiry, and optional delivery preview;
- role picker: offers only roles the current actor may grant, with owner-only
  roles hidden or disabled for non-owner actors;
- destructive actions: revoke invitation, disable principal, remove role
  assignment, and transfer/remove owner remain owner-confirmed when they affect
  owner or recovery authority.

Invite acceptance needs its own auth-origin browser surface. A request to
`/_formless/auth/invitations/accept` should render status, start passkey
registration for eligible pending invitations, verify the passkey response,
issue the central session, and follow any returned handoff target. This surface
must not depend on an installed app route or generated app UI.

## External App Registration

External users use the same principal model with app-scoped registration.

Each app install can choose a registration policy:

- `closed`: invite or owner-created assignment only.
- `email-verified`: self-registration allowed after email verification.
- `domain-allowlist`: self-registration allowed for verified email domains.
- `custom-operation`: app declares a registration operation or handler that can
  create app profile records after the principal is authenticated.

Registration creates or reuses:

- `principal`;
- verified `principal-email`;
- `app-registration` for the target app install;
- optional `app.user` role assignment;
- optional app-specific profile record through an operation binding.

The app-specific profile creation must be operation-owned. The auth runtime
creates or reuses identity records and app registration records, then invokes or
offers an explicit app registration operation. It must not directly materialize
arbitrary app records outside the operation model.

## Email Verification And Recovery

Email verification is required for:

- invite acceptance;
- recovery contact setup;
- future email-link auth methods;
- account notifications;
- high-risk credential changes.

Email-only recovery should not directly restore high-privilege access.

Recommended recovery tiers:

- External app user: verified email can authorize registering a replacement
  passkey after challenge verification.
- Collaborator: verified email can start recovery, but privileged role recovery
  requires owner/admin approval or delayed recovery with notification.
- Instance owner: email verification is necessary but not sufficient. Recovery
  requires an admin bearer recovery capability, another owner approval, or a
  delayed recovery policy with notifications to existing verified recovery
  addresses.

Recovery records should store:

- purpose;
- principal or email target;
- token hash;
- expiry;
- status;
- challenge attempt timestamps;
- display-safe outcome.

Raw tokens and provider responses remain private auth state.

## Future Auth Methods

Passkeys remain the first credential method.

Add future methods as auth method bindings on the same principal model:

- email magic link;
- OAuth/OIDC provider;
- password, only if a concrete product requirement appears;
- SAML or enterprise SSO;
- service credentials for automation.

Each method should produce the same central auth session shape with method and
assurance facts. Operation policy should depend on actor, role, scope, and
assurance, not on method-specific session formats.

## Public And Authenticated Operations

Anonymous public operations remain unchanged. A Site contact form can still
write through a target-scoped public operation without a user account.

Authenticated operations add a new path:

- route or public page may be anonymous;
- a specific operation binding may require authenticated actor policy;
- invoking that operation redirects through auth if no valid host session
  exists;
- the operation envelope records the principal and source host/path;
- response filtering can differ for `anonymous`, `authenticated`, and owner
  actors.

This allows public pages to contain both anonymous forms and account-backed
actions.

## Security Rules

- One-time grants are single-use, short-lived, target-origin-bound, route-bound,
  and nonce/state-bound.
- Host sessions must not be accepted on a different host, route, app install, or
  instance.
- Auth callback routes should be reserved runtime paths and unavailable to app
  schemas.
- Auth callback routes on mapped hosts may consume grants, but they must not
  expose passkey ceremony, owner setup, or central account-management behavior.
- Credentialed cross-origin API calls are not a default auth mechanism.
- Mutating browser APIs authorized by cookies need same-origin checks and CSRF
  protection or an equivalent operation-bound request token.
- Central auth pages must not use app-controlled HTML or app-controlled
  redirects.
- Return targets must remain path-only for the target origin, following the
  current owner login redirect safety rule.
- Passkey challenges remain one-time and scoped to canonical auth origin and
  relying-party id.
- Disabled principals, revoked memberships, and changed role assignments must
  invalidate or narrow future host-session authorization.

## Implementation Sequence

1. Add an identity control-plane spec and schema source.
   Define principal, email, group, organization, membership, role,
   role-assignment, app-registration, and invitation records in a separate
   package slice from `instance-control-plane`.

2. Move owner identity to the principal model.
   First owner setup creates a principal, passkey credential, and
   `instance.owner` role assignment. Existing owner-only checks become role
   checks.

3. Add central auth session and host session contracts.
   Keep passkey ceremonies on the canonical auth origin. Add one-time
   cross-domain grant issuance and callback consumption. Include session
   version and revocation checks for privileged host-session use.

4. Expand route access and operation actor policy.
   Add `authenticated` route access and authenticated operation actor facts in
   the invocation envelope.

5. Add role-aware management authorization.
   Add explicit checks for `instance.owner`, `instance.admin`, and app-scoped
   roles. Keep owner-only recovery paths separate from operational admin paths.
   Ensure mutating management requests recheck current principal status and role
   assignments.

6. Add collaborator invitations.
   Use email runtime for invite delivery. Accept invites on auth origin and
   apply role/group/org assignments atomically. Enforce inviter grant authority
   before writing invitations or private token hashes.

7. Add access management UI.
   Build a dedicated instance shell surface for people, roles, invitations,
   invite creation, resend, revoke, and principal disablement. Build the
   auth-origin invite acceptance surface separately from generated app UI.

8. Add identity references in app schemas.
   Support `auth:principal`, `auth:organization`, and `auth:group` references
   from app records.

9. Add external app registration policies.
   Support closed and email-verified registration first. Add custom operation
   provisioning through explicit app registration operations.

10. Add recovery flows.
    Start with verified email challenge plus replacement passkey for low-risk
    users. Add high-privilege recovery approval before owner/admin email-only
    recovery.

11. Add future auth method adapters.
    Keep sessions and principal records stable while methods vary.

## Decisions

- `instance:identity` is a separate runtime-owned schema and package slice from
  `instance-control-plane`.
- First-pass runtime roles are `instance.owner`, `instance.admin`, `app.admin`,
  `app.editor`, `app.viewer`, and `app.user`.
- `instance.owner` is the recovery authority root. `instance.admin` is
  operational administration and cannot grant owner authority.
- Organization context is explicit when a principal belongs to multiple
  organizations.
- Email verification is required for recovery setup but cannot restore
  owner/admin access by itself.
- App registration provisioning goes through explicit app operations, not
  direct auth-runtime app record materialization.
- Host sessions may cache read authorization briefly, but privileged writes and
  owner/admin management reads recheck current role, principal, organization,
  and revocation state.
