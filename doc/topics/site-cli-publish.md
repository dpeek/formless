# Site CLI And Publish

Last updated: 2026-05-26

## Current Facts

- Package name: `@dpeek/formless`.
- Shared UI package name: `@dpeek/formless-ui`.
- Package CLI bin: `bin/formless.js`.
- Package CLI entrypoint source: `src/site/cli.ts`.
- CLI parser source: `src/site/cli-command.ts`.
- Site project config source: `src/site/project-config.ts`.
- Site project source helpers: `src/site/project-source.ts`.
- Core media helpers: `src/media/core.ts`.
- Site source snapshot helpers: `src/site/source-snapshot.ts`.
- Site seed promotion helpers: `src/site/seed-promotion.ts`.
- Site seed promotion script: `scripts/site-pull-seed.ts`.
- Site project archive import source: `src/site/project-archive.ts`.
- Portable archive disk workflow source: `src/site/archive-workflows.ts`.
- Formless instance workspace workflow source: `src/site/instance-workspace.ts`.
- Formless instance workspace manifest source: `src/site/instance-workspace-config.ts`.
- Formless instance workspace secret source: `src/site/instance-workspace-secrets.ts`.
- Formless instance target status source: `src/site/instance-target-client.ts`.
- Site publish workflow source: `src/site/publish.ts`.
- Site publish script: `scripts/site-publish.ts`.
- Formless instance onboarding source: `src/site/instance-onboarding.ts`.
- Cloudflare custom-domain client source: `src/site/cloudflare-domain-client.ts`.
- Editing and publish workflow source: `src/site/editing-publish-workflow.test.ts`.
- Local browser publish client: `src/client/local-publish.ts`.
- Local publish UI: `src/app/local-site-publish.tsx`.
- Site project files: `formless.config.json`, `site.records.json`, and `media/`.
- Package Site source media files live under `schema/apps/site/media/`.
- Standalone Site project media files live under the configured project `media/` root.
- Site project dev env sets `FORMLESS_SITE_PROJECT_ROOT`, `FORMLESS_SITE_PROJECT_ID`, and `VITE_FORMLESS_SITE_PROJECT_ID`.

## CLI Commands

- `formless init <dir>` creates `formless.config.json` and `site.records.json`.
- `formless onboard` creates one remote Formless instance.
- Default `formless init` writes no starter media files and no project `media/` tree.
- `formless dev` runs the local public preview and `/admin` editor.
- `formless save` writes local Site edits back to project source files.
- `formless deploy setup` stores deploy config and local admin token.
- `formless publish` deploys code, media, and records.
- `formless archive export --target <url> --out <dir>` writes an instance archive directory.
- `formless archive export-app --target <url> --install <id> --out <dir>` writes one app archive directory.
- `formless archive restore --target <url> --archive <dir>` dry-runs instance archive restore.
- `formless archive restore --target <url> --archive <dir> --apply` applies instance archive restore.
- `formless archive restore-app --target <url> --archive <dir> --install <id>` dry-runs app archive restore to an install id.
- `formless archive restore-app --target <url> --archive <dir> --install <id> --apply` applies app archive restore.
- `formless archive import-site --project <path> --install <id> --out <dir>` writes a standalone Site project as an installed Site app archive.
- `formless instance init-workspace` creates or adopts a Formless instance workspace.
- `formless instance status` reports workspace target, credential, setup, install, and drift-adjacent state.
- `formless instance pull` writes target instance and app archives into the workspace.
- `formless instance check` compares workspace archives with the selected target.
- `formless instance push` dry-runs workspace archive restore to the selected target.
- `formless instance push --apply` backs up, dry-runs, and applies workspace archive restore.
- `formless instance dev` runs a local product instance profile from workspace archive state.
- `formless instance reset-local` clears workspace-local runtime state only.
- `formless instance deploy` deploys code and assets for a claimed instance workspace.
- `formless instance domains plan` dry-runs exact-host Worker Custom Domain changes.
- `formless instance domains apply` applies exact-host Worker Custom Domain changes.
- `formless instance token adopt` stores an automation admin token in ignored workspace secret state.
- `formless instance token rotate` uploads a new automation admin token and updates ignored workspace secret state.
- `bun run site:pull-seed` promotes local Site authority state into `schema/apps/site/seed-records.json`.
- `bun run site:publish` validates and publishes source Site data.

## Publish Rules

- Browser IndexedDB is not the source of truth for publish.
- Save and publish read from the local Authority state.
- Site seed promotion reads `GET /api/site/snapshot`.
- Site seed promotion writes active records only and omits tombstones.
- Site seed promotion preserves record IDs and `createdAt`.
- Site seed promotion validates schema key, source schema compatibility, record shape, references, and unique constraints.
- Site seed promotion writes deterministic record order and JSON formatting.
- Site seed promotion writes referenced core media files beside source records.
- Site seed promotion maps `/api/formless/media/media/images/example.png` to `schema/apps/site/media/media/images/example.png`.
- Site seed promotion includes media referenced by `mediaAssetId`.
- Site seed promotion rejects legacy same-origin Site media hrefs with a migration error.
- `bun run site:pull-seed --check` fails when source Site records or referenced source media files are stale.
- Site source snapshots are built from source schema plus source seed records.
- Source snapshot envelopes use `schemaKey: "site"` and `sourceCursor: 0`.
- `bun run site:publish` is dry-run by default.
- Mutating Site publish requires `--apply`.
- Data publish requires `--target <url>` or `FORMLESS_SITE_PUBLISH_TARGET`.
- Publish backs up live data before restore.
- Publish backups default under `tmp/site-publish-backups/`.
- Publish validates referenced source media files before mutation.
- Publish restores media before records.
- Publish restores core media asset files before records.
- Publish rejects legacy same-origin Site media hrefs with a migration error.
- Publish uses guarded snapshot restore.
- Publish sends `Authorization: Bearer <FORMLESS_ADMIN_TOKEN>` when the token is configured.
- Local Site admin publish is brokered by the CLI dev server.
- Browser publish receives only a localhost broker endpoint and token.
- Deploy metadata path: `GET /api/formless/deploy`.
- Deploy metadata source: `src/worker/deploy-metadata.ts`.
- Project deploy sets `FORMLESS_DEPLOY_VERSION`.
- Brokered Site admin publish can skip code/assets deploy when target deploy version matches the local package version.

## Instance And Archives

- `formless onboard` targets one Cloudflare `workers.dev` Formless instance.
- Onboard deployment runtime vars set `FORMLESS_RUNTIME_PROFILE=instance` and `VITE_FORMLESS_RUNTIME_PROFILE=instance`.
- Onboard deployment uses Worker-first asset routing for instance route policy paths.
- Onboard local state root: `.formless/instances/`.
- Instance archives and app archives are portable archive directories.
- Portable archive directory manifest file: `archive.json`.
- Portable archive capabilities include `core-media-assets`.
- Portable archive media files live at manifest `archivePath` values.
- Archive export reads installed app registry state, app snapshots, and referenced core image media over HTTP.
- Archive restore posts archive JSON and media payloads to `/api/formless/archive/restore`.
- Archive restore is dry-run by default.
- Mutating archive restore requires `--apply`.
- Archive replace behavior requires `--replace`.
- Archive restore sends `Authorization: Bearer <FORMLESS_ADMIN_TOKEN>` when an admin token is configured or passed.
- App archive restore can retarget a Site app archive to a new install id.
- Site project import preserves external URLs.
- Site project import writes core media objects and the `core-media-assets` capability when project media exists.
- Site project import rejects legacy same-origin Site media hrefs with a migration error.
- Portable archives include core image media objects and asset metadata for `mediaAssetId` references.
- Portable archives include core image media objects referenced by core media hrefs.
- New portable app, instance, and workspace archives do not emit app-scoped Site media objects.
- Old app-scoped Site media archives restore only through the compatibility normalizer.
- The compatibility normalizer converts matching legacy Site media objects to core media assets before mutation.
- The compatibility normalizer rejects unresolved legacy Site media references before mutation.
- Archive restore validates core media object keys, content types, byte sizes, asset metadata, and media files before mutation.
- Archive restore writes core media objects before app records.
- Standalone Site save, dev restore, and publish keep core media files explicit under project/source media roots.
- Standalone Site save, dev restore, and publish reject legacy `/api/site/media/...` hrefs instead of moving files.
- Portable archives are backup, restore, and import workflows, not bidirectional instance sync.

## Instance Workspaces

- Instance workspace manifest file: `formless.instance-workspace.json`.
- Instance workspace manifests store reviewable target, archive, deploy, local state, app, default app policy, and domain intent.
- Instance workspace `domains` entries are reviewable exact-host profile mapping intent.
- Workspace domain intent stores `enabled`, `profile`, and optional `targetInstallId`.
- Workspace domain intent supports `instance`, `app`, and `publicSite` profiles.
- Workspace domain intent parses old Site-only `surface` and `installId` entries as `publicSite`.
- Instance workspace manifests reject secret-looking fields.
- Instance workspace ignored secret state file: `.formless/instance.env`.
- Instance workspace secret state can store the automation admin token.
- Environment variable `FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN` can provide the automation admin token.
- Cloudflare Worker secrets cannot be read back by workspace status.
- Workspace pull exports the selected target to `archives/instance` and app archives under `archives/apps/<installId>`.
- Workspace pull refreshes manifest `domains` from live desired domain mappings.
- Workspace check exports target archive state to ignored temporary state and reports drift after generated archive timestamp normalization.
- Workspace check reports domain desired-mapping drift across host, profile, target install id, and enabled state.
- Workspace push composes declared app archives into a temporary instance archive.
- Workspace push defaults to dry-run.
- Workspace push apply requires `--apply`, takes a fresh whole-instance backup, dry-runs, then applies in one process.
- Workspace push apply refuses current target drift unless `--allow-stale` acknowledges it.
- Workspace push apply treats desired-domain drift as remote drift unless `--allow-stale` acknowledges it.
- Workspace push requires `--replace` for app install collision replacement.
- Workspace `--replace-install-set` reports unsupported install pruning instead of deleting extra remote installs.
- Workspace local dev uses product instance runtime profile vars and the `empty` launch fixture.
- Workspace local dev uses workspace-local Wrangler persistence under the manifest local state root.
- Workspace local dev restores workspace archives only when the local installed app registry is empty.
- Workspace deploy sets `FORMLESS_RUNTIME_PROFILE=instance`, `VITE_FORMLESS_RUNTIME_PROFILE=instance`, and `FORMLESS_DEPLOY_VERSION`.
- Existing-instance workspace deploys use migration policy `existing`.
- New-instance workspace deploys use migration policy `new`.
- Workspace deploy refuses target URL changes returned by the deployment adapter.
- Workspace deploy verifies no-store deploy metadata after upload.
- Workspace deploy state and Alchemy local secrets live under ignored `.formless/deploy/<workerName>`.
- Instance workspace archive movement is explicit backup, restore, and import movement, not bidirectional instance sync.
- Workspace deploy does not write live domain mappings or provider apply state.
- Domain plan uses workspace domain intent when present and live enabled mappings when workspace intent is empty.
- Domain plan filters provider intents to enabled profile mappings.
- Domain plan uses CLI-side Cloudflare API reads for active zones, Worker Custom Domains, Worker Routes, and DNS records.
- Domain plan reports apex-host risk, DNS conflicts, Worker Route conflicts, and existing Worker Custom Domains.
- Domain plan treats exact-host `A`, `AAAA`, and `CNAME` records as Worker Custom Domain DNS conflicts; mail and verification records such as `MX` and `TXT` remain visible in the plan but do not block apply.
- Domain plan does not mutate Cloudflare provider state.
- Domain apply reruns preflight before provider mutation.
- Domain apply default policy is `create-only`.
- Domain apply `override` policy requires one explicit `--host`.
- Domain apply creates exact-host Cloudflare Worker Custom Domains.
- Domain apply can adopt equivalent same-worker Custom Domain bindings.
- Domain apply records applied Cloudflare state and audit evidence with profile vocabulary in instance domain metadata.
- Domain apply evidence for `instance` hosts stores no target install id.
- Domain apply refuses when workspace and live desired domain mappings drift.
- CLI domain plan/apply read Cloudflare credentials from `CLOUDFLARE_API_TOKEN` or `CF_API_TOKEN`.
- Product Workers do not need broad Cloudflare API credentials for domain apply.

## Key Tests

- CLI tests: `src/site/cli.test.ts`.
- Project config tests: `src/site/project-config.test.ts`.
- Project source tests: `src/site/project-source.test.ts`.
- Source snapshot tests: `src/site/source-snapshot.test.ts`.
- Seed promotion tests: `src/site/seed-promotion.test.ts`.
- Site source media tests: `src/site/source-media.test.ts`.
- Site project source media tests: `src/site/project-source.test.ts`.
- Project archive import tests: `src/site/project-archive.test.ts`.
- Portable archive CLI workflow tests: `src/site/cli.test.ts`.
- Archive API tests: `src/worker/archive-api.test.ts`.
- Instance workspace CLI workflow tests: `src/site/cli.test.ts`.
- Instance workspace manifest tests: `src/site/instance-workspace-config.test.ts`.
- Instance workspace secret tests: `src/site/instance-workspace-secrets.test.ts`.
- Cloudflare domain client tests: `src/site/cloudflare-domain-client.test.ts`.
- Instance onboarding tests: `src/site/instance-onboarding.test.ts`.
- Publish tests: `src/site/publish.test.ts`.
- Local publish client tests: `src/client/local-publish.test.ts`.
- Editing publish workflow tests: `src/site/editing-publish-workflow.test.ts`.
- Deploy metadata tests: `src/worker/deploy-metadata.test.ts`.
