## 1. Protocol And Dependency Boundary

- [x] 1.1 Add the selected WebAuthn browser/server dependency after proving it bundles in the Worker test runtime.
- [x] 1.2 Add shared protocol types and parsers for registration options, registration verify, login options, login verify, session status, and logout responses.
- [x] 1.3 Add shared parser tests for valid WebAuthn ceremony payloads, malformed payloads, unsupported keys, and public-safe error shapes.
- [x] 1.4 Add canonical instance auth origin and relying-party id parsing helpers without deriving auth identity from arbitrary mapped hosts.

Evidence:

- Files changed: `package.json`, `bun.lock`, `src/shared/instance-auth.ts`, `src/shared/instance-auth.test.ts`, `src/worker/passkey-dependency.test.ts`.
- Checks: `devstate check` passed; `./.devstate/status.md` shows checks ok and services running at 2026-05-28T06:44:10.367Z.
- Dependency decision: selected `@simplewebauthn/server@13.3.1` and `@simplewebauthn/browser@13.3.0`; worker harness proves server registration/authentication option generation and verify primitive imports bundle and run in Miniflare.
- Browser smoke: not run; this section added dependencies and shared parsers only, with no app route behavior changed.
- Promotion note: finalization should promote instance-auth protocol and canonical origin/RP parsing facts.

## 2. Instance Auth Storage

- [x] 2.1 Add durable instance auth tables for auth configuration, passkey credentials, and one-time WebAuthn challenges.
- [x] 2.2 Add storage functions for reading/writing auth config with canonical origin, relying-party id, relying-party name, and timestamps.
- [x] 2.3 Add storage functions for creating, reading, consuming, expiring, and deleting registration and login challenges.
- [x] 2.4 Add storage functions for creating passkey credentials, preventing duplicate credential ids, and updating verification counters/facts.
- [x] 2.5 Add worker storage tests for config validation, challenge replay, challenge expiry, duplicate credentials, and credential counter updates.

Evidence:

- Files changed: `src/worker/instance-auth-state.ts`, `src/worker/instance-auth-state.test.ts`.
- Checks: `devstate check` passed; `./.devstate/status.md` shows checks ok and services running at 2026-05-28T06:55:37.498Z.
- Storage decision: instance auth storage owns `instance_auth_config`, `instance_auth_challenges`, and `instance_auth_passkey_credentials`; WebAuthn public keys are stored as base64url public material and converted back to `WebAuthnCredential` bytes for verification.
- Challenge decision: registration challenges store setup token hash scope, login challenges store owner id scope, and consumption sets `consumed_at`; replay, expiry, explicit delete, and expired-row cleanup are covered by worker storage tests.
- Credential decision: duplicate credential ids are rejected without mutating the existing record; verification updates reject counter regression and persist user verification, origin, RP id, device type, backup state, counter, and timestamps.
- Browser smoke: not run; this section added storage functions and worker storage tests only, with no app route behavior changed.
- Promotion note: finalization should promote instance-auth storage tables, one-time challenge behavior, duplicate credential id behavior, and counter/fact update behavior.

## 3. WebAuthn Ceremony APIs

- [x] 3.1 Add registration options and registration verify handlers under `/api/formless/passkeys/register/*`.
- [x] 3.2 Require valid setup capability before first-owner registration options are created.
- [x] 3.3 Verify registration responses against the stored challenge, canonical origin, relying-party id, and setup capability.
- [x] 3.4 Add login options and login verify handlers under `/api/formless/passkeys/login/*`.
- [x] 3.5 Verify login assertions against the stored challenge, canonical origin, relying-party id, owner id, credential public key, and authenticator counter.
- [x] 3.6 Add worker API tests for successful registration, invalid registration, successful login, invalid login, challenge replay, wrong origin, wrong RP id, and wrong credential id.

Evidence:

- Files changed: `src/worker/owner-passkeys.ts`, `src/worker/owner-passkeys.test.ts`, `src/worker/index.ts`, `src/worker/authority.ts`.
- Checks: `devstate check` passed; `./.devstate/status.md` shows checks ok and services running at 2026-05-28T07:06:45.587Z.
- API decision: passkey ceremony paths forward to the instance Authority; missing auth config fails closed, registration options require a valid setup capability, registration/login verify consume stored one-time challenges before WebAuthn verification, and login verify issues the existing owner session cookie after credential counter/fact updates.
- Registration decision: registration verify completes the owner and first credential from the verified registration response; default app install initialization and setup-route/session integration remain in section 4.
- Worker API tests: `src/worker/owner-passkeys.test.ts` uses a signed virtual WebAuthn authenticator and covers successful registration, invalid registration, successful login, invalid login, challenge replay, wrong origin, wrong RP id, and wrong credential id.
- Browser smoke: `bun browser --session ooga-passkey-smoke --ignore-https-errors open https://add-owner-passkey-auth.formless.local` and `bun browser --session ooga-passkey-smoke --ignore-https-errors snapshot -i` loaded the instance shell; full first-owner passkey setup/login browser smoke remains section 7 after browser routes and mapped-host behavior ship.
- Promotion note: finalization should promote passkey ceremony endpoints, one-time challenge verification, login credential verification, and owner session issuance facts.

## 4. Owner Setup And Session Integration

- [x] 4.1 Update first-owner setup so owner identity, first passkey credential, setup capability consumption, default app install initialization, and session issuance complete as one successful flow.
- [x] 4.2 Reject setup completion when the passkey registration response is missing or invalid without storing owner state or consuming the setup capability.
- [x] 4.3 Keep owner session cookie creation and validation compatible with the existing write guard.
- [x] 4.4 Add logout handling that clears the owner session cookie.
- [x] 4.5 Preserve admin bearer authorization for setup-capability creation and protected write APIs.
- [x] 4.6 Remove browser admin-token login as the normal owner login path after passkey setup is complete.
- [x] 4.7 Add owner setup/session tests for atomic setup, session status, logout, admin bearer writes, and token-only browser login rejection.

Evidence:

- Files changed: `src/worker/instance-setup-state.ts`, `src/worker/instance-auth-state.ts`, `src/worker/instance-app-installs-state.ts`, `src/worker/default-app-installs.ts`, `src/worker/owner-passkeys.ts`, `src/worker/owner-passkeys.test.ts`, `src/worker/owner-session.ts`, `src/worker/owner-setup.ts`, `src/worker/owner-setup.test.ts`.
- Checks: `devstate check` passed; `./.devstate/status.md` shows checks ok and services running at 2026-06-01T01:39:34.135Z.
- Setup decision: passkey registration verification now completes owner setup, first credential storage, setup capability consumption, default app install initialization, and session cookie issuance in one storage transaction before returning the setup response.
- Failure decision: configured passkey setup completion rejects missing registration responses before consuming setup state; duplicate credential storage rolls back owner/capability writes and leaves the setup capability usable.
- Session decision: `/api/formless/session/logout` clears the owner session cookie; `POST /api/formless/session` no longer mints browser owner sessions from an admin bearer token and returns passkey-required failure without `Set-Cookie`.
- Authorization decision: admin bearer authorization remains accepted for setup-capability creation and protected instance writes; owner session cookies from passkey setup remain accepted by the existing write guard.
- Worker API tests: `src/worker/owner-passkeys.test.ts` covers passkey setup/session issuance, missing registration response, duplicate credential rollback, session status, logout, owner-session writes, admin bearer writes, and token-only login rejection; `src/worker/owner-setup.test.ts` covers token-only session rejection and logout method handling.
- Browser smoke: `bun browser --session igor-owner-passkey-section4 --ignore-https-errors open https://add-owner-passkey-auth.formless.local/setup`, `bun browser --session igor-owner-passkey-section4 snapshot -i`, `bun browser --session igor-owner-passkey-section4 open https://add-owner-passkey-auth.formless.local/login`, and `bun browser --session igor-owner-passkey-section4 snapshot -i` loaded `/setup` and `/login`; `/setup` reported missing setup token and `/login` reported setup incomplete. Full passkey browser ceremony smoke remains section 7 after browser routes ship.
- Promotion note: finalization should promote atomic first-owner passkey setup, passkey-backed setup session issuance, logout cookie clearing, admin bearer preservation, and token-only browser login rejection.

## 5. Browser Routes

- [x] 5.1 Update `/setup` to request passkey registration options, call browser credential creation, submit owner identity plus registration response, and handle setup errors.
- [x] 5.2 Update `/login` to request passkey login options, call browser credential assertion, submit the assertion, and handle login errors.
- [x] 5.3 Keep setup and login route views usable when WebAuthn is unavailable, setup is incomplete, setup is already complete, or auth configuration is missing.
- [x] 5.4 Add React route tests for setup passkey states, login passkey states, logout affordance, and no admin-token input in normal login.

Evidence:

- Files changed: `src/app/routes/passkey-browser.ts`, `src/app/routes/owner-setup.tsx`, `src/app/routes/owner-login.tsx`, `src/app/routes/owner-setup.test.tsx`, `src/app/routes/owner-login.test.tsx`, `src/app/routes/owner-setup-browser-write.test.ts`.
- Checks: `devstate start` passed before edits; `./.devstate/status.md` showed checks ok and services running at 2026-06-01T01:43:11.396Z. `devstate check` passed after edits; `./.devstate/status.md` shows checks ok and services running at 2026-06-01T01:50:56.863Z.
- Setup route decision: `/setup` loads setup status, rejects unavailable WebAuthn as a visible route state, requests `/api/formless/passkeys/register/options`, invokes browser passkey registration, and submits owner identity plus registration response to `/api/formless/setup/complete` without admin bearer authorization.
- Login route decision: `/login` no longer renders or submits an admin-token field; it requests `/api/formless/passkeys/login/options`, invokes browser passkey assertion, submits `/api/formless/passkeys/login/verify`, and exposes logout through `/api/formless/session/logout`.
- React route tests: `src/app/routes/owner-setup.test.tsx` covers setup passkey states, unavailable WebAuthn, auth-configuration error handling, and no admin authorization; `src/app/routes/owner-login.test.tsx` covers passkey login states, unavailable WebAuthn, logout affordance, auth-configuration error handling, and no admin-token input.
- Browser smoke: `bun browser --session igor-owner-passkey-section5 --ignore-https-errors open 'https://add-owner-passkey-auth.formless.local/setup?token=abcDEF0123456789_-abcDEF0123456789_-'`, `bun browser --session igor-owner-passkey-section5 snapshot -i`, `bun browser --session igor-owner-passkey-section5-login --ignore-https-errors open https://add-owner-passkey-auth.formless.local/login`, and `bun browser --session igor-owner-passkey-section5-login --ignore-https-errors snapshot -i` loaded `/setup` and `/login`; `/setup` rendered the passkey owner form and `/login` rendered setup-incomplete state. Full first-owner passkey ceremony smoke remains section 7.
- Promotion note: finalization should promote browser setup/login use of passkey ceremony endpoints, removal of admin-token normal login UI, unavailable-WebAuthn route states, and logout UI behavior.

## 6. Runtime Topology And Host Boundaries

- [x] 6.1 Add runtime behavior for canonical instance auth origin in local dev and deployed instance profiles.
- [x] 6.2 Ensure mapped app hosts do not act as passkey relying parties and do not expose schema-key admin APIs.
- [x] 6.3 Ensure mapped public Site hosts do not act as passkey relying parties and continue serving public Site documents.
- [x] 6.4 Add routing tests for canonical instance auth routes, mapped app host non-auth behavior, and mapped public Site host non-auth behavior.

Evidence:

- Files changed: `src/shared/instance-auth.ts`, `src/worker/instance-auth-runtime.ts`, `src/worker/authority.ts`, `src/worker/index.ts`, `src/worker/custom-domain-routing.test.ts`, `src/site/instance-onboarding.ts`, `src/site/instance-onboarding.test.ts`, `src/site/cli.test.ts`, `vite.config.ts`.
- Checks: `devstate start` passed before edits; `./.devstate/status.md` showed checks ok and services running at 2026-06-01T01:52:56.981Z. `devstate check` passed after edits; `./.devstate/status.md` shows checks ok and services running at 2026-06-01T02:00:45.458Z.
- Runtime decision: the instance Authority seeds missing instance auth config only for `dev` and `instance` runtime profiles. Deployed instance plans now pass `FORMLESS_INSTANCE_AUTH_ORIGIN` as the workers.dev origin; local dev falls back to the request origin when it is a valid WebAuthn origin. Optional RP id/name env vars are passed through Vite Worker vars for explicit overrides.
- Host-boundary decision: mapped `app` and `publicSite` hosts return 404 for `/setup`, `/login`, `/api/formless/setup/*`, `/api/formless/session/*`, and `/api/formless/passkeys/*`; mapped app/public Site hosts also block schema-key Authority APIs while installed app APIs remain available.
- Worker routing tests: `src/worker/custom-domain-routing.test.ts` covers canonical auth config seeding for local dev and deployed instance origins, mapped app host auth-route rejection, mapped app schema-key API rejection, mapped installed app API availability, mapped public Site auth-route rejection, mapped public Site schema-key API rejection, and continued mapped public Site document rendering.
- Browser smoke: `bun browser --session igor-owner-passkey-section6 --ignore-https-errors open https://add-owner-passkey-auth.formless.local/setup`, `bun browser --session igor-owner-passkey-section6 --ignore-https-errors snapshot -i`, `bun browser --session igor-owner-passkey-section6 --ignore-https-errors open https://add-owner-passkey-auth.formless.local/login`, and `bun browser --session igor-owner-passkey-section6 --ignore-https-errors snapshot -i` loaded `/setup` and `/login`; `/setup` reported missing setup token and `/login` reported setup incomplete. Mapped-host browser smoke remains section 7 because local dev has no custom-domain mapping configured.
- Promotion note: finalization should promote runtime auth config seeding, deployed `FORMLESS_INSTANCE_AUTH_ORIGIN`, and mapped-host owner-auth/schema-key API boundary facts.

## 7. Verification And Promotion

- [x] 7.1 Run `devstate start` and read `./.devstate/status.md`; record any pre-existing red status before implementation checks.
- [x] 7.2 Run `devstate check` and read `./.devstate/status.md`; fix new red status before finishing.
- [ ] 7.3 Run browser smoke with `bun browser ...` for first-owner setup, passkey login, app write access, logout, and mapped-host non-auth behavior.
- [x] 7.4 Record evidence, decisions, blockers, and promotion notes in this OpenSpec change.
- [ ] 7.5 During finalization, promote shipped instance-auth, authority-storage, and runtime-topology facts into `openspec/specs/`; do not archive the change.

Evidence:

- Files changed: `openspec/changes/add-owner-passkey-auth/tasks.md`.
- Pre-check: `devstate start` passed; `./.devstate/status.md` showed checks ok and services running at 2026-06-01T02:03:00.580Z.
- Check: `devstate check` passed; `./.devstate/status.md` shows checks ok and services running at 2026-06-01T02:29:04.407Z.
- Browser smoke setup: restarted devstate with `CLOUDFLARE_INCLUDE_PROCESS_ENV=true`, `FORMLESS_ADMIN_TOKEN=igor-section7-admin`, `FORMLESS_OWNER_SESSION_SECRET=igor-section7-session`, `FORMLESS_INSTANCE_AUTH_ORIGIN=https://add-owner-passkey-auth.formless.local`, and `FORMLESS_INSTANCE_AUTH_RELYING_PARTY_ID=add-owner-passkey-auth.formless.local`; cleared ignored local Wrangler Durable Object state at `.wrangler/state/v3/do/formless-FormlessAuthority` before the final clean first-owner smoke.
- Browser smoke: `bun browser --session igor-owner-passkey-section7-final --ignore-https-errors --args "--enable-features=WebAuthenticationVirtualAuthenticator" open https://add-owner-passkey-auth.formless.local`, `bun browser --session igor-owner-passkey-section7-final open 'https://add-owner-passkey-auth.formless.local/setup?token=abcDEF0123456789_-abcDEF0123456789_-'`, and `bun browser --session igor-owner-passkey-section7-final snapshot -i` loaded the first-owner setup form.
- Browser WebAuthn smoke: using the `bun browser ... get cdp-url` browser target with a CDP virtual authenticator, registration options returned RP id `add-owner-passkey-auth.formless.local`, browser registration produced a public-key credential, setup completion returned `setupComplete: true` with a session, `/api/tasks/mutations` accepted an owner-session browser write, logout returned unauthenticated state, login options returned one allowed credential for the canonical RP id, browser login assertion verified successfully, and the login route rendered `Owner signed in`.
- Logout UI smoke: `bun browser --session igor-owner-passkey-section7-final open https://add-owner-passkey-auth.formless.local/login`, `snapshot -i`, `click @e3`, `wait 1000`, and `snapshot -i` moved the login route from `Owner signed in` to `Owner sign in`.
- Mapped-host blocker: created mapped `app` and `publicSite` domain mappings during browser-context smoke, then `bun browser --session igor-owner-passkey-section7-mapped-app --args "--host-resolver-rules=MAP mapped-app.example.test 127.0.0.1" open http://mapped-app.example.test:4976/login` reached the Vite dev server but stopped before Worker routing with `Blocked request. This host ("mapped-app.example.test") is not allowed.` Restarting devstate with `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=mapped-app.example.test,mapped-site.example.test` and with the single host `mapped-app.example.test` did not change that behavior in this dev stack.
- Blocker guidance: finish 7.3 by either adding a source-faithful local browser smoke path that permits exact mapped hosts through the Vite dev-server host guard, or by using a committed smoke harness that drives the Worker with mapped request hosts while still recording browser route coverage for canonical setup/login/logout.
- Promotion note: finalization still needs to promote shipped `instance-auth`, `authority-storage`, and `runtime-topology` facts into `openspec/specs/`; this implementation session did not promote specs or archive the change.
