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

- [ ] 2.1 Add durable instance auth tables for auth configuration, passkey credentials, and one-time WebAuthn challenges.
- [ ] 2.2 Add storage functions for reading/writing auth config with canonical origin, relying-party id, relying-party name, and timestamps.
- [ ] 2.3 Add storage functions for creating, reading, consuming, expiring, and deleting registration and login challenges.
- [ ] 2.4 Add storage functions for creating passkey credentials, preventing duplicate credential ids, and updating verification counters/facts.
- [ ] 2.5 Add worker storage tests for config validation, challenge replay, challenge expiry, duplicate credentials, and credential counter updates.

## 3. WebAuthn Ceremony APIs

- [ ] 3.1 Add registration options and registration verify handlers under `/api/formless/passkeys/register/*`.
- [ ] 3.2 Require valid setup capability before first-owner registration options are created.
- [ ] 3.3 Verify registration responses against the stored challenge, canonical origin, relying-party id, and setup capability.
- [ ] 3.4 Add login options and login verify handlers under `/api/formless/passkeys/login/*`.
- [ ] 3.5 Verify login assertions against the stored challenge, canonical origin, relying-party id, owner id, credential public key, and authenticator counter.
- [ ] 3.6 Add worker API tests for successful registration, invalid registration, successful login, invalid login, challenge replay, wrong origin, wrong RP id, and wrong credential id.

## 4. Owner Setup And Session Integration

- [ ] 4.1 Update first-owner setup so owner identity, first passkey credential, setup capability consumption, default app install initialization, and session issuance complete as one successful flow.
- [ ] 4.2 Reject setup completion when the passkey registration response is missing or invalid without storing owner state or consuming the setup capability.
- [ ] 4.3 Keep owner session cookie creation and validation compatible with the existing write guard.
- [ ] 4.4 Add logout handling that clears the owner session cookie.
- [ ] 4.5 Preserve admin bearer authorization for setup-capability creation and protected write APIs.
- [ ] 4.6 Remove browser admin-token login as the normal owner login path after passkey setup is complete.
- [ ] 4.7 Add owner setup/session tests for atomic setup, session status, logout, admin bearer writes, and token-only browser login rejection.

## 5. Browser Routes

- [ ] 5.1 Update `/setup` to request passkey registration options, call browser credential creation, submit owner identity plus registration response, and handle setup errors.
- [ ] 5.2 Update `/login` to request passkey login options, call browser credential assertion, submit the assertion, and handle login errors.
- [ ] 5.3 Keep setup and login route views usable when WebAuthn is unavailable, setup is incomplete, setup is already complete, or auth configuration is missing.
- [ ] 5.4 Add React route tests for setup passkey states, login passkey states, logout affordance, and no admin-token input in normal login.

## 6. Runtime Topology And Host Boundaries

- [ ] 6.1 Add runtime behavior for canonical instance auth origin in local dev and deployed instance profiles.
- [ ] 6.2 Ensure mapped app hosts do not act as passkey relying parties and do not expose schema-key admin APIs.
- [ ] 6.3 Ensure mapped public Site hosts do not act as passkey relying parties and continue serving public Site documents.
- [ ] 6.4 Add routing tests for canonical instance auth routes, mapped app host non-auth behavior, and mapped public Site host non-auth behavior.

## 7. Verification And Promotion

- [ ] 7.1 Run `devstate start` and read `./.devstate/status.md`; record any pre-existing red status before implementation checks.
- [ ] 7.2 Run `devstate check` and read `./.devstate/status.md`; fix new red status before finishing.
- [ ] 7.3 Run browser smoke with `bun browser ...` for first-owner setup, passkey login, app write access, logout, and mapped-host non-auth behavior.
- [ ] 7.4 Record evidence, decisions, blockers, and promotion notes in this OpenSpec change.
- [ ] 7.5 During finalization, promote shipped instance-auth, authority-storage, and runtime-topology facts into `openspec/specs/`; do not archive the change.
