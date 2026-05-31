## 1. Schema And Shared Models

- [x] 1.1 Add shared schema types for action access policy, public input contracts, public action eligibility, and challenge policy.
- [x] 1.2 Extend schema parsing to preserve valid action access policies and reject unsupported actor modes, challenge kinds, origin rules, and public input fields.
- [x] 1.3 Add subscribe action kind metadata with public execution eligibility while keeping existing generated/admin action behavior stable.
- [x] 1.4 Add shared tests for valid anonymous subscribe action policy, invalid policy rejection, missing public input rejection, and ineligible public action kind rejection.

Evidence:

- Files changed: `src/shared/schema-types.ts`, `src/shared/schema-actions.ts`, `src/shared/schema.test.ts`, `src/client/action-ui.ts`, `src/worker/actions.ts`.
- Decision: action policy schema keys are `access` and `publicInput`; first supported public policy is `actor: "anonymous"`, `challenge.kind: "turnstile"`, and `origin.kind: "same-origin"`.
- Checks: `devstate check` passed; `./.devstate/status.md` read at `2026-05-28T05:58:46.511Z` with checks ok, web ready, and test watcher pass.
- Smoke: not run; this section changes shared schema parsing/action metadata only and does not add a public subscribe form route.

## 2. Public Action Runtime

- [x] 2.1 Add public action request and execution envelope types for actor, proof, source, input, idempotency, effects, and audit facts.
- [x] 2.2 Add target-scoped public action route selection for schema-key and installed-app API prefixes.
- [x] 2.3 Implement public action request parsing with public-safe validation errors and undeclared-field rejection.
- [x] 2.4 Add a Turnstile verification boundary that keeps secrets server-side and fails closed when verification or configuration fails.
- [x] 2.5 Add public action idempotency so replayed accepted requests return the existing outcome without duplicate records.
- [x] 2.6 Add worker tests proving generic `/mutations` and `/actions` remain protected while public action routes can execute only eligible actions.
- [x] 2.7 Add mapped public Site host tests for public action routing without exposing admin shell or schema-key admin APIs.

Evidence:

- Files changed: `src/shared/protocol.ts`, `src/worker/public-actions.ts`, `src/worker/actions.ts`, `src/worker/authority.ts`, `src/worker/index.ts`, `src/worker/public-actions.test.ts`.
- Decision: public action routes are `POST /api/:schemaKey/public/actions/:actionName` and `POST /api/app-installs/:packageAppKey/:installId/public/actions/:actionName`; generic `/mutations` and `/actions` still use the existing owner/admin write guard.
- Decision: public responses return only `{ actionId, cursor, status: "accepted" }`; committed record changes stay server-side so later subscription records are not exposed by the public submit response.
- Decision: this section commits an idempotent no-record public `subscribe` action execution; contact, email, audience, and subscription record effects are owned by section 3.
- Checks: `devstate check` passed; `./.devstate/status.md` read at `2026-05-28T06:13:03.822Z` with checks ok, web ready, and test watcher pass.
- Initial status: `devstate start` read at `2026-05-28T06:00:59.645Z` with checks ok, web ready, and test watcher pass; no pre-existing red service failure was present.
- Smoke: browser subscribe form smoke not run because this section adds the public action API runtime only; section 4 owns rendered subscribe form behavior.

## 3. Contact Subscription Model

- [x] 3.1 Add contact, email address, audience, and subscription entities to the first owning schema with flat reference relationships and minimal fields.
- [x] 3.2 Add unique constraints for normalized email address and email-address audience subscription membership.
- [x] 3.3 Seed or lazily create the default audience for Site subscribe forms.
- [x] 3.4 Implement subscribe action execution to normalize email, upsert contact/email/subscription records, resubscribe unsubscribed records, and preserve source context.
- [x] 3.5 Add generated admin views for email addresses, audiences, and subscription status inspection.
- [x] 3.6 Add tests for new email subscribe, duplicate subscribe, resubscribe, source context, and raw network data not being required.

Evidence:

- Files changed: `schema/apps/site/schema.json`, `src/worker/actions.ts`, `src/worker/storage.ts`, `src/worker/public-actions.test.ts`, `src/shared/schema.test.ts`, `src/client/views.test.ts`.
- Decision: the Site package schema owns the first contact subscription slice with flat `contact`, `emailAddress`, `audience`, and `subscription` records; `subscription.subscribe` is the schema-declared anonymous public action.
- Decision: the default Site audience is lazily created with key `default`; `emailAddress.normalizedAddress` and `subscription.emailAddress` plus `subscription.audience` enforce duplicate prevention.
- Decision: subscribe execution stores Site/action source context fields and does not require raw IP address or user-agent fields.
- Checks: `devstate check` passed; `./.devstate/status.md` read at `2026-05-28T06:25:09.713Z` with checks ok, web ready, and test watcher pass.
- Initial status: `devstate start` read at `2026-05-28T06:15:28.067Z` with checks ok, web ready, and test watcher pass; no pre-existing red service failure was present.
- Smoke: browser subscribe form smoke not run because this section adds the stored subscription model and public action record effects; section 4 owns rendered subscribe form behavior.

## 4. Site Subscribe Form

- [x] 4.1 Add `subscribeForm` to the Site block type enum, union variant, create/edit/root item views, and branch child policy.
- [x] 4.2 Add Site public tree projection for subscribe form action facts, target route, and warning behavior when the action is missing or not public.
- [x] 4.3 Add public renderer support for email input, submit state, Turnstile widget site key, success state, and failure state.
- [x] 4.4 Add client-side submit handling that posts email, source block id, idempotency key, and Turnstile token to the target public action route.
- [x] 4.5 Add renderer and Site tree tests proving secrets and subscriber data are not exposed in public output.
- [x] 4.6 Add generated Site authoring tests proving subscribe forms can be created under page and group branches.

Evidence:

- Files changed: `schema/apps/site/schema.json`, `src/shared/protocol.ts`, `src/site/tree.ts`, `src/worker/authority-operations.ts`, `src/app/site-renderer/blocks.tsx`, `src/app/site-renderer/subscribe-form.ts`, `src/site/tree.test.ts`, `src/app/site-renderer/renderer.test.tsx`, `src/app/site-renderer/subscribe-form.test.ts`, `src/shared/schema.test.ts`, `src/client/views.test.ts`, `src/client/collection-result-model.test.ts`, `src/app.test.tsx`.
- Decision: `subscribeForm` is a flat Site block variant with `label`, `body`, `actionName`, and `buttonLabel`; page and group branches may create it, and the variant is a leaf.
- Decision: Site public tree projection emits only public subscribe action facts: action name, target public action route, Turnstile challenge kind, and optional public site key. Turnstile configuration remains owned by section 5.
- Decision: missing action names, missing actions, and non-public action bindings add public tree warnings and omit working form action facts.
- Checks: `devstate check` passed after `git rebase main --autostash`; `./.devstate/status.md` read at `2026-05-28T06:40:13.662Z` with checks ok, web ready, and test watcher pass.
- Initial status: `devstate start` read at `2026-05-28T06:27:09.833Z` with checks ok, web ready, and test watcher pass; no pre-existing red service failure was present.
- Smoke: `bun browser open https://add-public-subscribe-actions.formless.local/pages/home` loaded the public Site preview; `bun browser get text body` returned Site body text including `Home`, `About`, `Blog`, `Projects`, `Resume`, and `Your site starts here`; `bun browser get count '[data-site-theme]'` returned `2`.

## 5. Configuration And Deployment Boundary

- [x] 5.1 Add runtime configuration for Turnstile site key and secret with server-only secret handling.
- [x] 5.2 Add clear behavior for missing Turnstile config in local/test and production-like runtimes.
- [x] 5.3 Keep automatic Cloudflare Turnstile widget provisioning out of this change unless existing deploy configuration already provides the required account/token boundary.
- [x] 5.4 Document promotion notes for public action routes, action access policy, contact subscription records, and Turnstile configuration.

Evidence:

- Files changed: `src/shared/turnstile-config.ts`, `src/worker/public-actions.ts`, `src/worker/index.ts`, `src/worker/authority.ts`, `src/worker/authority-operations.ts`, `src/site/tree.ts`, `src/site/tree.test.ts`, `src/worker/public-actions.test.ts`, `vite.config.ts`.
- Decision: `FORMLESS_TURNSTILE_SITE_KEY` is the public runtime widget key passed to Site tree projection and local worker dev vars; `FORMLESS_TURNSTILE_SECRET_KEY` is read only by the server-side public action verifier.
- Decision: missing or blank Site key configuration emits `missing-public-action-challenge-config` and omits working subscribe form action facts; missing or blank secret configuration continues to fail public action verification closed with 503 before writes.
- Decision: this section does not provision Cloudflare Turnstile widgets or call Cloudflare widget APIs; operators provide the site key and secret through runtime configuration.
- Promotion notes: public action routes remain `POST /api/:schemaKey/public/actions/:actionName` and `POST /api/app-installs/:packageAppKey/:installId/public/actions/:actionName`; anonymous public action policy stays action-owned through `access` plus `publicInput`; contact subscription records stay flat Site-owned records for the first slice; Turnstile configuration promotes as `FORMLESS_TURNSTILE_SITE_KEY` for public widget rendering and `FORMLESS_TURNSTILE_SECRET_KEY` for server-only verification.
- Checks: `devstate check` passed; `./.devstate/status.md` read at `2026-05-28T06:51:32.815Z` with checks ok, web ready, and test watcher pass.
- Initial status: `devstate start` read at `2026-05-28T06:42:18.814Z` with checks ok, web ready, and test watcher pass; no pre-existing red service failure was present.
- Smoke: `bun browser open https://add-public-subscribe-actions.formless.local/pages/home` loaded the public Site preview; `bun browser get text body` returned Site body text including `Home`, `About`, `Blog`, `Projects`, `Resume`, and `Your site starts here`; `bun browser get count '[data-site-theme]'` returned `2`.

## 6. Verification

- [x] 6.1 Run `devstate check` and read `./.devstate/status.md`; fix new red status before finishing.
- [x] 6.2 Run browser smoke with `bun browser ...` for the public subscribe form on a Site page.
- [x] 6.3 Record whether existing red devstate service failures were present before this change.
- [x] 6.4 Automatic finalization promotes shipped facts into shipped specs before the branch is marked ready for review; do not archive the change in the worker.

Evidence:

- Files changed: `openspec/changes/add-public-subscribe-actions/tasks.md`.
- Checks: `devstate check` passed with `FORMLESS_TURNSTILE_SITE_KEY=local-turnstile-site-key` and `FORMLESS_TURNSTILE_SECRET_KEY=local-turnstile-secret`; `./.devstate/status.md` read at `2026-05-28T07:00:16.245Z` with checks ok, web ready, and test watcher pass.
- Initial status: `devstate start` read at `2026-05-28T06:55:12.169Z` with checks ok, web ready, and test watcher pass; no pre-existing red devstate service failure was present.
- Smoke: restarted devstate with local Turnstile dev keys, reset the local Site source schema through `/api/site/reset/schema`, created and placed a smoke `subscribeForm` block under `rec_site_starter_page_home`, then ran `bun browser open https://add-public-subscribe-actions.formless.local/pages/home`; browser eval returned `formCount: 1`, `emailCount: 1`, `turnstileCount: 1`, `formAction: "/api/site/public/actions/subscribe"`, `siteKey: "local-turnstile-site-key"`, and `bodyIncludesSecret: false`.
- Smoke: `bun browser fill input[name=email] smoke@example.com`, `bun browser click button[type=submit]`, and `bun browser get text body` showed `Complete the email and challenge.`, proving the public form submit handler stayed on the page and required challenge proof before posting.
- Finalization: promoted shipped public action, contact subscription, app schema action policy, and Site subscribe form facts into `openspec/specs/*/spec.md` on `main`. This worker did not archive the change.
- Finalization checks: `devstate check` passed; `./.devstate/status.md` read at `2026-05-31T23:34:51.869Z` with checks ok, web ready, and test watcher pass.
