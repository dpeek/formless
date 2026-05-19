# Site CLI And Publish

Last updated: 2026-05-19

## Current Facts

- Package name: `@dpeek/formless`.
- Shared UI package name: `@dpeek/formless-ui`.
- Package CLI bin: `bin/formless.js`.
- Package CLI entrypoint source: `src/site/cli.ts`.
- Site project config source: `src/site/project-config.ts`.
- Site project source helpers: `src/site/project-source.ts`.
- Site source snapshot helpers: `src/site/source-snapshot.ts`.
- Site seed promotion helpers: `src/site/seed-promotion.ts`.
- Site seed promotion script: `scripts/site-pull-seed.ts`.
- Site publish workflow source: `src/site/publish.ts`.
- Site publish script: `scripts/site-publish.ts`.
- Editing and publish workflow source: `src/site/editing-publish-workflow.test.ts`.
- Local browser publish client: `src/client/local-publish.ts`.
- Local publish UI: `src/app/local-site-publish.tsx`.
- Site project files: `formless.config.json`, `site.records.json`, and `media/`.
- Package Site source media files live under `schema/apps/site/media/`.
- Standalone Site project media files live under the configured project `media/` root.
- Site project dev env sets `FORMLESS_SITE_PROJECT_ROOT`, `FORMLESS_SITE_PROJECT_ID`, and `VITE_FORMLESS_SITE_PROJECT_ID`.

## CLI Commands

- `formless init <dir>` creates `formless.config.json` and `site.records.json`.
- Default `formless init` writes no starter media files and no project `media/` tree.
- `formless dev` runs the local public preview and `/admin` editor.
- `formless save` writes local Site edits back to project source files.
- `formless deploy setup` stores deploy config and local admin token.
- `formless publish` deploys code, media, and records.
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
- Site seed promotion writes referenced same-origin media files beside source records.
- Site seed promotion maps `/api/site/media/site/images/example.png` to `schema/apps/site/media/site/images/example.png`.
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
- Publish uses guarded snapshot restore.
- Publish sends `Authorization: Bearer <FORMLESS_ADMIN_TOKEN>` when the token is configured.
- Local Site admin publish is brokered by the CLI dev server.
- Browser publish receives only a localhost broker endpoint and token.
- Deploy metadata path: `GET /api/formless/deploy`.
- Deploy metadata source: `src/worker/deploy-metadata.ts`.
- Project deploy sets `FORMLESS_DEPLOY_VERSION`.
- Brokered Site admin publish can skip code/assets deploy when target deploy version matches the local package version.

## Key Tests

- CLI tests: `src/site/cli.test.ts`.
- Project config tests: `src/site/project-config.test.ts`.
- Project source tests: `src/site/project-source.test.ts`.
- Source snapshot tests: `src/site/source-snapshot.test.ts`.
- Seed promotion tests: `src/site/seed-promotion.test.ts`.
- Publish tests: `src/site/publish.test.ts`.
- Local publish client tests: `src/client/local-publish.test.ts`.
- Editing publish workflow tests: `src/site/editing-publish-workflow.test.ts`.
- Deploy metadata tests: `src/worker/deploy-metadata.test.ts`.
