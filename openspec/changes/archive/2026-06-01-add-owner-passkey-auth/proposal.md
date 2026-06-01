## Why

Formless needs a browser-native owner login path before more public or
multi-app write surfaces appear. Passkeys are the narrowest useful first slice:
they remove human admin-token login while keeping auth instance-scoped and
compatible with existing owner session write guards.

## What Changes

- Add instance owner passkey registration during first-owner setup.
- Add passkey login that creates the existing owner session cookie for protected
  instance writes.
- Add explicit instance auth configuration for canonical origin and WebAuthn RP
  identity instead of deriving auth identity from every request host.
- Keep admin bearer authorization as the bootstrap, automation, and recovery
  credential.
- Keep app installs protected by the instance owner session on the canonical
  instance origin.
- Defer Formless cloud accounts, organizations, roles, app memberships,
  multi-user collaboration, OAuth, email magic links, and cross-origin SSO.
- Defer using mapped app or public Site hosts as passkey relying parties.

## Capabilities

### New Capabilities

- `instance-auth`: Instance owner identity, passkey credentials, WebAuthn
  challenge ceremonies, canonical auth origin, owner session issuance, logout,
  and recovery boundaries.

### Modified Capabilities

- `authority-storage`: Owner setup and owner session behavior changes from
  admin-token browser login to passkey-backed session issuance while preserving
  admin bearer write authorization.
- `runtime-topology`: Instance auth routes use the canonical instance origin;
  mapped app and public Site hosts do not become passkey relying parties in this
  slice.

## Impact

- Affects owner setup, owner login, owner session status, and protected write
  authorization paths.
- Adds WebAuthn request/response protocol types and server-side ceremony
  validation.
- Adds durable storage for instance auth configuration, passkey credentials, and
  one-time login/registration challenges.
- Updates `/setup` and `/login` browser surfaces to use passkey registration and
  assertion.
- Keeps generic app mutations/actions, schema writes, snapshots, media writes,
  app install management, domains, archives, and deployment APIs behind the
  existing owner session or admin bearer guard.
- Requires browser smoke because setup/login flows and app write access change.
