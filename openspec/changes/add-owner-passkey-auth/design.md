## Context

Formless currently has first-owner setup, HMAC-signed owner session cookies, and
write guards that accept either owner session cookies or an admin bearer token.
Browser login still asks for the admin token and posts it to
`/api/formless/session`.

Passkeys change the trust boundary. WebAuthn credentials are bound to an origin
and relying-party id, while a Formless instance can also expose mapped app hosts,
mapped public Site hosts, and workers.dev hosts. The first auth slice needs a
stable canonical instance origin so one instance owner can sign in without
turning every routed host into an auth origin.

## Goals / Non-Goals

**Goals:**

- Register the first owner passkey during owner setup.
- Let an owner log in with a passkey and receive the existing owner session
  cookie.
- Store passkey credentials and one-time WebAuthn challenges in instance
  metadata storage.
- Make auth identity explicit through canonical origin and WebAuthn RP
  configuration.
- Keep admin bearer authorization for bootstrap, automation, and emergency
  recovery.
- Preserve existing protected write behavior for app, media, domain, archive,
  install, and deployment APIs.

**Non-Goals:**

- No Formless cloud account system.
- No organizations, roles, invitations, teams, app memberships, or per-record
  permissions.
- No OAuth, email magic links, passwords, or recovery email.
- No cross-origin SSO for mapped app or public Site hosts.
- No use of public Site hosts as passkey relying parties.
- No public visitor auth.

## Decisions

### Instance auth has a canonical origin

Store instance auth configuration in the instance Authority metadata:

- canonical origin;
- WebAuthn relying-party id;
- relying-party name;
- created and updated timestamps.

Passkey registration and login ceremonies validate against this configuration.
The runtime must not derive the auth instance id from arbitrary request hosts.

Alternative: keep using `request.url.hostname` as the instance identity. That is
simple for a single host, but it breaks once the same instance is reachable from
workers.dev, custom app hosts, and public Site hosts.

### Owner setup creates the first passkey

Owner setup remains a one-time capability-token flow, but completion also
registers the first owner passkey. The setup request includes owner identity and
the registration response. The server verifies the challenge, writes owner and
credential records in one durable transaction, consumes the setup capability,
ensures default app installs, and issues the owner session cookie.

Alternative: create the owner first, then ask for a passkey. That can leave an
owned instance with no usable browser login if the second step fails.

### Login uses WebAuthn challenge endpoints

Use explicit ceremony endpoints:

- `POST /api/formless/passkeys/register/options`;
- `POST /api/formless/passkeys/register/verify`;
- `POST /api/formless/passkeys/login/options`;
- `POST /api/formless/passkeys/login/verify`;
- `POST /api/formless/session/logout`.

Registration options require a valid setup capability before the owner exists.
Login options require setup to be complete. Verify endpoints consume one-time
challenges and fail closed when the challenge, origin, RP id, credential id,
owner id, or authenticator counter is invalid.

Alternative: overload `/api/formless/setup/complete` and
`/api/formless/session` with ceremony stages. Dedicated paths keep protocol
errors and tests clearer while preserving the existing session status route.

### Use maintained WebAuthn verification primitives

Add a WebAuthn server/browser dependency such as `@simplewebauthn/server` and
`@simplewebauthn/browser` if worker tests prove compatibility with Cloudflare
Worker crypto and bundling. Keep the Formless-owned code responsible for
storage, origin/RP policy, response shaping, and session issuance.

If the dependency is incompatible with the Worker runtime, stop and choose a
supported verification path before implementing custom cryptographic checks.

Alternative: hand-roll attestation and assertion validation with Web Crypto and
CBOR parsing. That reduces dependency count but is the wrong risk trade-off for
auth correctness.

### Admin bearer is not human browser login

The admin bearer token remains accepted by write guards and setup-capability
creation. The owner login route stops asking humans to paste it into the browser
for normal login after a passkey exists.

Alternative: keep admin-token login as a fallback in the browser. That weakens
the value of passkeys and keeps the highest-power secret in routine browser use.

### Mapped hosts stay outside v1 auth ceremonies

Passkey ceremonies run on the canonical instance origin. Mapped app hosts and
mapped public Site hosts may serve their existing app or public surfaces, but
they do not mint owner sessions with their own RP ids in this slice.

Alternative: register passkeys for every mapped host. That creates confusing
credential duplication and makes domain mapping changes part of the auth model
before roles or app memberships exist.

## Risks / Trade-offs

- WebAuthn origin mistakes can reject valid owners or accept the wrong host →
  store explicit canonical origin/RP config and test workers.dev, instance
  profile, mapped app host, and mapped public Site host behavior.
- A setup flow can create owner data without a passkey → verify the registration
  response and write owner, credential, capability consumption, app install
  initialization, and session issuance as one successful flow.
- Browser and Worker WebAuthn JSON shapes can drift → keep shared protocol
  parsers and focused tests around options and verify payloads.
- Dependency compatibility can fail in Cloudflare Workers → prove it in worker
  tests before broad integration.
- Passkey loss can lock out browser ownership → keep admin bearer write access
  and document recovery as admin-token/ops owned until a later recovery UX.
- Existing tests may assume admin-token browser login → update those tests to
  assert admin bearer remains machine authorization while browser login uses
  passkey assertion.

## Migration Plan

1. Add shared instance-auth protocol types and parsers for registration options,
   registration verify, login options, login verify, session status, and logout.
2. Add durable instance auth tables for auth config, passkey credentials, and
   one-time WebAuthn challenges.
3. Add WebAuthn ceremony route handling under `/api/formless/passkeys/*`.
4. Update owner setup to start registration, verify the first passkey, and issue
   the existing session cookie.
5. Update owner login to request passkey assertion and stop accepting browser
   admin-token login as the normal path.
6. Preserve admin bearer authorization in all existing write guards and
   setup-capability APIs.
7. Add canonical-origin routing behavior and mapped-host tests.
8. Run `devstate check`; run browser smoke for setup, login, app write access,
   logout, and mapped host non-auth behavior.

Rollback leaves existing instances able to use admin bearer writes. Instances
created during the change may have passkey metadata that older code ignores;
owner session cookies remain HMAC cookies with the existing name.

## Open Questions

- Exact source of canonical origin in local dev and deployed instances:
  environment variable, persisted setup value, or deploy metadata.
- Whether logout should revoke only the current cookie or also rotate a session
  generation stored in durable metadata.
- Whether the first recovery UX should be a CLI/admin-token command or a
  browser route guarded by admin bearer.
