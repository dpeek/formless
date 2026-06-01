## 1. Manifest Rename And Discovery

- [ ] 1.1 Rename the instance workspace manifest constant and generated file name to `formless.json`.
- [ ] 1.2 Update workspace manifest parse, format, validation, and error text to use `formless.json`.
- [ ] 1.3 Add workspace discovery helpers that resolve the nearest `formless.json` for top-level commands.
- [ ] 1.4 Remove legacy manifest read compatibility and fail precisely when `formless.instance-workspace.json` or `formless-workspace.json` is present.
- [ ] 1.5 Update manifest unit tests for new file name, secret rejection, path validation, deploy settings, apps, and domains.

## 2. Local-Only Onboard

- [ ] 2.1 Replace remote `formless onboard` behavior with local workspace initialization in the current directory.
- [ ] 2.2 Guard onboarding against conflicting existing workspace, Site project, archive, and `.formless` files.
- [ ] 2.3 Generate the default reviewable `formless.json` manifest with no remote targets, no declared apps, and `defaultAppPolicy: "none"`.
- [ ] 2.4 Create empty reviewable archive roots without generating default app archive source.
- [ ] 2.5 Ensure `.formless/` is ignored and no Cloudflare account discovery, deploy, setup capability, browser open, or global state write occurs.
- [ ] 2.6 Update onboard CLI output to show local workspace paths, next local commands, and local web app installation as the first app step.

## 3. Top-Level Workspace Commands

- [ ] 3.1 Update CLI usage and argument parsing around the local-first command sequence.
- [ ] 3.2 Route top-level `formless dev` to workspace-local instance dev selected by `formless.json`.
- [ ] 3.3 Route top-level `formless check` to workspace source and remote drift checks when a target exists.
- [ ] 3.4 Preserve advanced `formless instance ...` command behavior against the renamed manifest.
- [ ] 3.5 Ensure empty workspace dev starts an empty product instance and does not require archives before the first local web app install.
- [ ] 3.6 Update command parser and CLI tests for removed standalone Site project command shapes.

## 4. Workspace Save Source

- [ ] 4.1 Implement workspace save from local instance Authority state into deterministic app archives.
- [ ] 4.2 Include reviewable schema-owned control-plane intent in saved workspace source.
- [ ] 4.3 Persist referenced core media payloads through archive media files without provider-specific URLs.
- [ ] 4.4 Implement `formless save --check` for stale workspace source detection without rewriting files.
- [ ] 4.5 Add tests proving save reads locally installed app state from Authority, rejects secret-looking fields, and does not read browser replica state.

## 5. Cloudflare Deploy Boundary

- [ ] 5.1 Implement top-level `formless deploy` from `formless.json` with Cloudflare account discovery or configured target inputs.
- [ ] 5.2 Plan deployment resources from workspace deploy intent and package version.
- [ ] 5.3 Store deploy, provider, Cloudflare credential, and automation secret state only under ignored `.formless/` state.
- [ ] 5.4 Copy materialized Cloudflare account id, credential profile, API token, Alchemy password/state token, admin token, and resource ids from Alchemy/env into ignored `.formless/` state when available.
- [ ] 5.5 Write display-safe target and deploy intent back to `formless.json` after successful deploy planning.
- [ ] 5.6 Verify deploy metadata and create owner setup capability when needed.
- [ ] 5.7 Dry-run restore saved workspace archives and then apply the remote data push after deploy verification.
- [ ] 5.8 Refuse deploy or push when target identity or remote drift requires explicit acknowledgement.
- [ ] 5.9 Add tests for first deploy, redeploy, missing secrets, target identity mismatch, copied ignored credential state, and no-secret manifest/archive output.

## 6. Remove Standalone Site Project Surface

- [ ] 6.1 Remove `formless init`, standalone Site-project `formless dev`, standalone Site-project `formless save`, `formless deploy setup`, and `formless publish` from top-level CLI usage.
- [ ] 6.2 Remove or isolate standalone Site project implementation modules that are no longer part of the CLI surface.
- [ ] 6.3 Keep only explicit migration/archive import coverage for legacy Site project data if still supported.
- [ ] 6.4 Update README and user-facing docs to describe `formless onboard`, `formless dev`, `formless save`, and `formless deploy`.

## 7. Verification And Promotion

- [ ] 7.1 Update CLI, workspace, archive, deploy, and manifest tests for the local-first flow.
- [ ] 7.2 Run `devstate check` and record `.devstate/status.md` evidence in this change.
- [ ] 7.3 Smoke the changed app behavior with `bun browser ...` if local dev or browser-visible behavior changed.
- [ ] 7.4 Promote shipped behavior into `openspec/specs/site-cli-publish/spec.md` and `openspec/specs/portable-archives/spec.md` before review.
