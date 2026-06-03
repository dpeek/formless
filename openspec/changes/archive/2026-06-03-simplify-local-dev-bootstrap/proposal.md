## Why

`formless dev` currently starts a local runtime that can initialize workspace files, but it does not give the browser an authenticated owner session. This makes the first normal app install fail behind the write guard and leaves local onboarding dependent on hidden owner setup steps.

Local development should be foolproof: `formless dev --open` should land the user in an authenticated local instance, and blank instances should not auto-create a Site app outside the normal app install flow.

## What Changes

- Add local dev session bootstrap for `formless dev`, backed by ignored workspace-local secrets and a one-time browser bootstrap URL.
- Add `formless dev --open` so the CLI can open a URL that mints a local owner session, creates local owner state if needed, and redirects to the instance shell.
- Keep local dev bootstrap separate from passkey owner setup; passkeys remain the deployed/remote owner auth path.
- Persist local dev root secrets before launching the runtime so owner sessions survive dev restarts for the same workspace.
- Keep per-run gateway, CSRF, sidecar proxy, and browser bootstrap tokens unpersisted.
- Remove automatic default Site install creation from owner setup.
- Require the normal app install flow to create the first Site, Tasks, Estii, or CRM install in blank instances.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `site-cli-publish`: `formless dev` local onboarding and `--open` behavior change so browser startup can establish a local authenticated session before app installs.
- `local-workspace-gateway`: local workspace runtime authorization gains a local-only browser session bootstrap path while preserving gateway operation scoping.
- `instance-auth`: local dev can issue owner sessions through a CLI-minted local bootstrap path without passkey registration, while deployed owner auth remains passkey-backed.
- `installed-apps`: owner setup no longer creates a default Site install; blank instances stay app-less until an authorized install action runs.

## Impact

- CLI parsing and runtime launch for `formless dev`.
- Workspace ignored local secret state under `.formless/local`.
- Local runtime owner/session API surface for a local-only bootstrap endpoint.
- Owner setup and passkey completion paths that currently run the default app install policy.
- Installed app tests and specs that expect a starter Site after blank owner setup.
- Browser onboarding flow and tests for first app install in local development.
