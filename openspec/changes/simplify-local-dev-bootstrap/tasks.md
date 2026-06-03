## 1. Local Dev Secret And CLI Plumbing

- [ ] 1.1 Add ignored workspace-local dev secret state under `.formless/local` for a local admin token and owner session secret.
- [ ] 1.2 Make `formless dev` ensure local dev secrets before spawning the runtime and pass them as local runtime worker vars.
- [ ] 1.3 Keep workspace gateway bootstrap, workspace CSRF, sidecar proxy, and local browser session bootstrap tokens process-scoped.
- [ ] 1.4 Add `formless dev --open` parsing and dispatch while keeping default `formless dev` non-opening.
- [ ] 1.5 Update `formless instance dev` and top-level `formless dev` tests for persisted local dev secrets and `--open` parsing.

## 2. Local Session Bootstrap Runtime

- [ ] 2.1 Add a local-runtime-only session bootstrap API route that accepts the active CLI-minted browser bootstrap token.
- [ ] 2.2 Create local owner state when no owner exists and issue the existing owner session cookie without passkey challenge or setup capability state.
- [ ] 2.3 Redirect successful local session bootstrap to the instance shell and reject invalid, replayed, cross-origin, mapped-host, or non-local-profile requests.
- [ ] 2.4 Make `formless dev --open` open the local session bootstrap URL after the runtime is ready.
- [ ] 2.5 Add worker and CLI tests proving local session bootstrap authenticates app-install writes and does not expose admin bearer tokens to browser state.

## 3. Remove Starter Site Creation

- [ ] 3.1 Remove default Site creation from passkey owner setup and legacy owner setup completion.
- [ ] 3.2 Remove or reject the `default-site` launch fixture and update scripts/tests that currently select it.
- [ ] 3.3 Update installed app, owner setup, passkey, launch fixture, and local onboarding tests to create required Site installs through the app install action.
- [ ] 3.4 Verify blank owner setup and local session bootstrap leave app install and route records empty until an install action runs.

## 4. Browser Onboarding Flow

- [ ] 4.1 Update the instance shell to treat local dev authenticated blank state as ready for normal package app install.
- [ ] 4.2 Ensure the first app install flow works after local session bootstrap with only same-origin browser credentials.
- [ ] 4.3 Keep passkey setup and login routes available for deployed owner auth without making them part of default local dev onboarding.
- [ ] 4.4 Smoke the local browser flow from `formless dev --open` through installing the first Site app.

## 5. Validation And Promotion

- [ ] 5.1 Run `devstate check` and record current evidence in this change.
- [ ] 5.2 Promote final shipped requirements into canonical specs for local workspace gateway, site CLI publish, instance auth, and installed apps.
- [ ] 5.3 Record decisions, changed files, checks, and browser smoke evidence in this change before finalization.
