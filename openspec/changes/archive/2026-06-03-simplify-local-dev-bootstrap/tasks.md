## 1. Local Dev Secret And CLI Plumbing

- [x] 1.1 Add ignored workspace-local dev secret state under `.formless/local` for a local admin token and owner session secret.
- [x] 1.2 Make `formless dev` ensure local dev secrets before spawning the runtime and pass them as local runtime worker vars.
- [x] 1.3 Keep workspace gateway bootstrap, workspace CSRF, sidecar proxy, and local browser session bootstrap tokens process-scoped.
- [x] 1.4 Add `formless dev --open` parsing and dispatch while keeping default `formless dev` non-opening.
- [x] 1.5 Update `formless instance dev` and top-level `formless dev` tests for persisted local dev secrets and `--open` parsing.

Evidence:

- 2026-06-03: Section 1 shipped with local dev secrets in `.formless/local/dev.env`, persisted admin/session worker vars, per-run local session bootstrap env, top-level `formless dev --open` parse/dispatch, and focused CLI/secret-state tests. `devstate check` passed with `vp check --fix`; services remained ready at `https://formless.local`; test watcher passed.

## 2. Local Session Bootstrap Runtime

- [x] 2.1 Add a local-runtime-only session bootstrap API route that accepts the active CLI-minted browser bootstrap token.
- [x] 2.2 Create local owner state when no owner exists and issue the existing owner session cookie without passkey challenge or setup capability state.
- [x] 2.3 Redirect successful local session bootstrap to the instance shell and reject invalid, replayed, cross-origin, mapped-host, or non-local-profile requests.
- [x] 2.4 Make `formless dev --open` open the local session bootstrap URL after the runtime is ready.
- [x] 2.5 Add worker and CLI tests proving local session bootstrap authenticates app-install writes and does not expose admin bearer tokens to browser state.

Evidence:

- 2026-06-03: Section 2 shipped local session bootstrap route `/api/formless/local-session/bootstrap`, local owner/session minting without passkey/setup/app side effects, one-time token replay rejection, same-origin/local-runtime/mapped-host rejection, and `formless dev --open` browser handoff. `devstate check` passed with `vp check --fix`; services were ready at `https://formless.local`; test watcher passed. Browser smoke: `bun browser --session simplify-local-dev-bootstrap-section2 --ignore-https-errors open https://formless.local` loaded the instance shell with App management, Tasks, Estii, Site, and CRM navigation.

## 3. Remove Starter Site Creation

- [x] 3.1 Remove default Site creation from passkey owner setup and legacy owner setup completion.
- [x] 3.2 Remove or reject the `default-site` launch fixture and update scripts/tests that currently select it.
- [x] 3.3 Update installed app, owner setup, passkey, launch fixture, and local onboarding tests to create required Site installs through the app install action.
- [x] 3.4 Verify blank owner setup and local session bootstrap leave app install and route records empty until an install action runs.

Evidence:

- 2026-06-03: Section 3 removed the starter Site helper and owner setup/passkey calls that created implicit app installs, removed `default-site` from the launch fixture registry, rejected configured `default-site` startup with a 400, and changed `dev:instance` to the `empty` fixture. Owner setup, passkey, launch fixture, and local session bootstrap tests now assert blank app-install/route state and create Site through `/api/formless/app-installs` when needed. `devstate check` passed with `vp check --fix`; services were ready at `https://formless.local`; test watcher passed. Browser smoke: `bun browser --session simplify-local-dev-bootstrap-section3 --ignore-https-errors open https://formless.local` loaded the instance shell.

## 4. Browser Onboarding Flow

- [x] 4.1 Update the instance shell to treat local dev authenticated blank state as ready for normal package app install.
- [x] 4.2 Ensure the first app install flow works after local session bootstrap with only same-origin browser credentials.
- [x] 4.3 Keep passkey setup and login routes available for deployed owner auth without making them part of default local dev onboarding.
- [x] 4.4 Smoke the local browser flow from `formless dev --open` through installing the first Site app.

Evidence:

- 2026-06-03: Section 4 kept blank authenticated local instance state install-ready, added browser credential tests for same-origin app-install reads/creates without admin bearer headers, kept deployed `/setup` and `/login` owner auth routes outside default local onboarding, and forwarded `FORMLESS_LOCAL_SESSION_BOOTSTRAP_TOKEN` into the Vite Cloudflare worker vars so real `formless dev --open` bootstrap URLs are accepted. `devstate check` passed with `vp check --fix`; services were ready at `https://formless.local`; test watcher passed. Browser smoke: intercepted a real `bun run formless dev --workspace <temp> --open` OS-open URL, opened the captured `/api/formless/local-session/bootstrap?token=...` URL with `bun browser --session simplify-local-dev-bootstrap-cli-open-2`, verified redirect to `http://localhost:5173/`, blank app-install and route records, installed the default Site app, and landed at `http://localhost:5173/apps/site` with the installed Site surface rendered. The dev server forwarded existing client console messages `You can only pass the action prop to <form>` during installed Site render.
