## 1. Manifest Rename And Discovery

- [x] 1.1 Rename the instance workspace manifest constant and generated file name to `formless.json`.
- [x] 1.2 Update workspace manifest parse, format, validation, and error text to use `formless.json`.
- [x] 1.3 Add workspace discovery helpers that resolve the nearest `formless.json` for top-level commands.
- [x] 1.4 Remove legacy manifest read compatibility and fail precisely when `formless.instance-workspace.json` or `formless-workspace.json` is present.
- [x] 1.5 Update manifest unit tests for new file name, secret rejection, path validation, deploy settings, apps, and domains.

Evidence:

- Files changed: `src/site/instance-workspace-config.ts`, `src/site/instance-workspace.ts`, `src/site/cli.ts`, `src/site/instance-workspace-config.test.ts`, `src/site/cli.test.ts`, `src/shared/instance-control-plane.test.ts`, `src/site/upgrade-plan.test.ts`.
- Checks: `devstate check` passed on 2026-06-01; `.devstate/status.md` reports checks ok, web ready, test service pass.
- Smoke: not run; section changes CLI workspace manifest/discovery behavior only, with no browser-visible app behavior.
- Baseline red status fixed first: package app revision/hash expectations in `src/shared/instance-control-plane.test.ts` and `src/site/upgrade-plan.test.ts` now match shipped schema behavior.

## 2. Local-Only Onboard

- [x] 2.1 Replace remote `formless onboard` behavior with local workspace initialization in the current directory.
- [x] 2.2 Guard onboarding against conflicting existing workspace, Site project, archive, and `.formless` files.
- [x] 2.3 Generate the default reviewable `formless.json` manifest with no remote targets, no declared apps, and `defaultAppPolicy: "none"`.
- [x] 2.4 Create empty reviewable archive roots without generating default app archive source.
- [x] 2.5 Ensure `.formless/` is ignored and no Cloudflare account discovery, deploy, setup capability, browser open, or global state write occurs.
- [x] 2.6 Update onboard CLI output to show local workspace paths, next local commands, and local web app installation as the first app step.

Evidence:

- Files changed: `src/site/instance-workspace.ts`, `src/site/cli.ts`, `src/site/cli.test.ts`.
- Checks: `devstate check` passed on 2026-06-01; `.devstate/status.md` reports checks ok, web ready, test service pass.
- Smoke: not run; section changes CLI onboarding behavior only, with no browser-visible app behavior.

## 3. Top-Level Workspace Commands

- [x] 3.1 Update CLI usage and argument parsing around the local-first command sequence.
- [x] 3.2 Route top-level `formless dev` to workspace-local instance dev selected by `formless.json`.
- [x] 3.3 Route top-level `formless check` to workspace source and remote drift checks when a target exists.
- [x] 3.4 Preserve advanced `formless instance ...` command behavior against the renamed manifest.
- [x] 3.5 Ensure empty workspace dev starts an empty product instance and does not require archives before the first local web app install.
- [x] 3.6 Update command parser and CLI tests for removed standalone Site project command shapes.

Evidence:

- Files changed: `src/site/cli-command.ts`, `src/site/cli.ts`, `src/site/instance-workspace.ts`, `src/site/cli.test.ts`.
- Checks: `devstate check` passed on 2026-06-01; `.devstate/status.md` reports checks ok, web ready, test service pass.
- Smoke: `bun browser --ignore-https-errors open https://local-first-onboarding.formless.local` and `bun browser snapshot --compact --depth 3` passed; snapshot showed runtime shell navigation for App management, Tasks, Estii, and Site.
- Notes: top-level `formless save` now parses as a workspace command but still blocks with the OpenSpec task 4 implementation message; top-level `formless deploy` routes to existing claimed-workspace deploy behavior until task 5 adds first deploy planning.

## 4. Workspace Save Source

- [x] 4.1 Implement workspace save from local instance Authority state into deterministic app archives.
- [x] 4.2 Include reviewable schema-owned control-plane intent in saved workspace source.
- [x] 4.3 Persist referenced core media payloads through archive media files without provider-specific URLs.
- [x] 4.4 Implement `formless save --check` for stale workspace source detection without rewriting files.
- [x] 4.5 Add tests proving save reads locally installed app state from Authority, rejects secret-looking fields, and does not read browser replica state.

Evidence:

- Files changed: `src/site/instance-workspace.ts`, `src/site/cli.ts`, `src/site/cli.test.ts`.
- Checks: `devstate check` passed on 2026-06-01; `.devstate/status.md` reports checks ok, web ready, test service pass.
- Smoke: not run; section changes CLI workspace save/check archive behavior only, with no browser-visible app behavior.
- Notes: `formless save` exports local Authority-backed instance state from the running local instance API, writes deterministic instance and app archives, refreshes manifest app/domain intent from schema-owned control-plane records, persists referenced core media files, rejects reviewable control-plane secret values through archive validation, and `formless save --check` reports stale reviewable source without rewriting workspace files.

## 5. Cloudflare Deploy Boundary

- [x] 5.1 Implement top-level `formless deploy` from `formless.json` with Cloudflare account discovery or configured target inputs.
- [x] 5.2 Plan deployment resources from workspace deploy intent and package version.
- [x] 5.3 Store deploy, provider, Cloudflare credential, and automation secret state only under ignored `.formless/` state.
- [x] 5.4 Copy materialized Cloudflare account id, credential profile, API token, Alchemy password/state token, admin token, and resource ids from Alchemy/env into ignored `.formless/` state when available.
- [x] 5.5 Write display-safe target and deploy intent back to `formless.json` after successful deploy planning.
- [x] 5.6 Verify deploy metadata and create owner setup capability when needed.
- [x] 5.7 Dry-run restore saved workspace archives and then apply the remote data push after deploy verification.
- [x] 5.8 Refuse deploy or push when target identity or remote drift requires explicit acknowledgement.
- [x] 5.9 Add tests for first deploy, redeploy, missing secrets, target identity mismatch, copied ignored credential state, and no-secret manifest/archive output.

Evidence:

- Files changed: `src/site/instance-workspace.ts`, `src/site/cli.ts`, `src/site/cli.test.ts`.
- Checks: `devstate check` passed on 2026-06-01; `.devstate/status.md` reports checks ok, web ready, test service pass.
- Smoke: not run; section changes CLI workspace deploy behavior only, with no browser-visible app behavior.
- Notes: top-level `formless deploy` now resolves the nearest `formless.json`, discovers a Cloudflare account when no deploy target is configured, plans instance resources from workspace deploy intent and package version, writes display-safe target/deploy intent to `formless.json`, stores admin/deploy/provider secret material under ignored `.formless/`, verifies deploy metadata, creates first-deploy owner setup capability, then dry-runs and applies workspace archive push. Existing-target deploy checks remote drift before Cloudflare mutation and refuses stale source.

## 6. Remove Standalone Site Project Surface

- [x] 6.1 Remove `formless init`, standalone Site-project `formless dev`, standalone Site-project `formless save`, `formless deploy setup`, and `formless publish` from top-level CLI usage.
- [x] 6.2 Remove or isolate standalone Site project implementation modules that are no longer part of the CLI surface.
- [x] 6.3 Keep only explicit migration/archive import coverage for legacy Site project data if still supported.
- [x] 6.4 Update README and user-facing docs to describe `formless onboard`, `formless dev`, `formless save`, and `formless deploy`.

Evidence:

- Files changed: `src/site/cli.ts`, `src/site/cli.test.ts`, `README.md`, `doc/vision.md`.
- Checks: `devstate check` passed on 2026-06-01; `.devstate/status.md` reports checks ok, web ready, test service pass.
- Smoke: not run; section removes CLI/docs surface only, with no browser-visible app behavior change.
- Notes: top-level CLI usage remains local-first and rejects removed standalone command shapes. Standalone Site project helpers are no longer exported through the CLI facade; legacy standalone Site project data remains available through the explicit `formless archive import-site` migration path and direct project modules.

## 7. Verification And Promotion

- [ ] 7.1 Update CLI, workspace, archive, deploy, and manifest tests for the local-first flow.
- [ ] 7.2 Run `devstate check` and record `.devstate/status.md` evidence in this change.
- [ ] 7.3 Smoke the changed app behavior with `bun browser ...` if local dev or browser-visible behavior changed.
- [ ] 7.4 Promote shipped behavior into `openspec/specs/site-cli-publish/spec.md` and `openspec/specs/portable-archives/spec.md` before review.
