## Context

`formless dev` starts an instance-profile runtime with workspace-local
persistence, a local gateway sidecar, and process-scoped gateway tokens. The
browser can currently read local workspace status and initialize workspace
files before owner setup, but normal protected writes such as package app
install still require an owner session or admin bearer token.

Owner sessions are signed with `FORMLESS_OWNER_SESSION_SECRET`. `formless dev`
currently generates that secret per process and does not persist it, so any
session would be invalidated by a dev restart. Owner setup is passkey-backed
when instance auth config exists and currently triggers the starter Site policy.

Local development is a different trust boundary from deployed owner auth. The
CLI is already a trusted local actor: it owns the workspace, starts the local
runtime, starts the gateway sidecar, and can hold ignored workspace-local
secrets. Browser-local dev should use that trust boundary to start
authenticated, while deployed instances should keep passkey owner auth.

## Goals / Non-Goals

**Goals:**

- Make `formless dev --open` land in an authenticated local browser session.
- Keep local browser session bootstrap same-origin, local-runtime-only, and
  token scoped.
- Persist only root local dev secrets needed across restarts.
- Keep gateway, CSRF, sidecar proxy, and browser bootstrap tokens per-run.
- Remove starter Site install creation from owner setup.
- Require blank instances to use the normal package app install action for the
  first app.

**Non-Goals:**

- Do not make passkeys the default local dev auth path.
- Do not require portless or a stable local domain for basic local dev auth.
- Do not expose admin bearer tokens to browser JavaScript.
- Do not change deployed owner passkey setup or login semantics except removing
  starter app creation.
- Do not create app installs from local session bootstrap.

## Decisions

### Persist local dev root secrets before runtime launch

`formless dev` will ensure ignored local dev secret state before spawning the
runtime. The state stores a local admin token and owner session signing secret.
The runtime receives those as worker vars for the local process.

Rationale: pre-launch persistence makes the runtime deterministic for the
whole dev run and allows owner session cookies to survive restarts for the same
workspace. Keeping this under the workspace local state boundary avoids
confusing it with deployed worker secrets.

Alternative considered: keep all local secrets process-only. That preserves the
current ephemeral model but makes authenticated browser sessions disappear on
every restart and blocks reliable `--open` behavior.

### Add a local-only browser session bootstrap endpoint

The local runtime will expose a local-profile-only endpoint such as
`/api/formless/local-session/bootstrap?token=...`. The CLI generates a per-run
unguessable browser bootstrap token after the root local secrets exist. The
endpoint validates the token, creates local owner state if no owner exists,
issues `formless_owner_session`, and redirects to the instance shell.

Rationale: this gives the browser the same end state it needs for normal app
install writes without requiring a passkey ceremony. The token is not an admin
bearer token and is not accepted by generic write endpoints.

Alternative considered: create a setup capability and send users through the
passkey setup route. That preserves a single owner setup model but makes local
dev depend on WebAuthn origin stability and extra user ceremony.

### Keep passkeys as deployed owner auth

Passkey registration and login remain the deployed/remote owner auth path. A
separate local dev bootstrap path avoids requiring portless or a stable local
domain for ordinary local dev.

Rationale: WebAuthn is origin-sensitive. Stable domains are useful for testing,
but local dev should work on the origin the dev server actually reports.

Alternative considered: require `formless dev` to run under portless and use
passkeys locally. That makes local auth more production-like but raises setup
cost and turns domain/cert availability into a prerequisite for first install.

### Do not create default Site installs during auth bootstrap

Owner setup, passkey registration, login, and local session bootstrap will not
create app installs. Blank instances stay blank until an authorized package app
install action runs.

Rationale: app install creation belongs to the installed app flow. Removing
starter Site policy avoids surprising app state, makes local onboarding
explicit, and keeps auth/session creation independent from app metadata.

Alternative considered: keep starter Site only for deployed first-owner setup.
That preserves current convenience but leaves two first-app models and keeps
auth coupled to app installation.

## Risks / Trade-offs

- Local bootstrap token leakage in terminal or browser history -> token is
  local-only, per-run, unguessable, and accepted only by the local session
  bootstrap endpoint.
- Local dev session does not exercise passkey UX -> keep passkey routes/tests
  for deployed owner auth and add an explicit passkey test mode later if needed.
- Removing starter Site breaks tests and scripts that expect `site` after owner
  setup -> update tests to create Site through the install API or explicit
  fixtures where a Site is part of the test setup.
- Persisted owner session secret means old local cookies remain valid until
  logout or secret rotation -> scope secrets to ignored workspace-local state
  and document deleting `.formless/local` as the reset path.
