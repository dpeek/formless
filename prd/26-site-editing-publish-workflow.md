# PRD 26: Site editing preview and publish workflow

Status: in progress
Current chunk: SWF-02 planned
Last updated: 2026-05-12

Start after PRD 25 authority operation module.

## Goal

Make personal Site editing flow from generated editor to live preview, source seed, and live Worker publish without manual snapshot handling.

This PRD owns:

- live-updating public Site preview for local editing;
- local authority-to-source-seed promotion;
- source seed validation;
- safer live Worker data publishing;
- deploy workflow documentation and scripts.

This PRD does not own public header/footer polish, first-class media upload, or a general import/export product feature.

## Problem

The Site can already be edited and snapshots can already be exported, but the editing workflow is still manual.

Current behavior:

- The Site editor writes records to the local authoritative Durable Object.
- Public preview routes fetch `/api/site/tree/:slug` once on route load.
- Opening `/site` in one browser and `/pages/home` in another does not live-update the preview.
- Snapshot export and restore are developer controls, not a source seed workflow.
- `schema/apps/site/seed-records.json` exists, but there is no command that promotes local edited authority state back to that file.
- `bun run deploy` deploys code/assets, but live Durable Object data persists separately.
- Source seed changes do not automatically update an already-initialized live Worker authority instance.
- Live snapshot restore/reset routes need production safety before they become part of a publish workflow.
- Authority operation metadata exists before production guard work starts.

The author wants a simpler loop:

1. Edit the Site in one browser.
2. Preview the Site in another browser and see changes live.
3. Promote the edited Site into a reviewable seed file on disk.
4. Deploy code and publish the reviewed Site data to the live Worker safely.

## Source Map

Existing anchors:

- Current runtime docs: `doc/current.md`.
- Release target docs: `doc/roadmap.md`.
- Snapshot export/restore PRD: `prd/15-store-snapshot-export-restore.md`.
- Public Site renderer PRD: `prd/24-public-site-chrome-polish.md`.
- Authority operation module PRD: `prd/25-authority-operation-module.md`.
- Client sync: `src/client/sync.ts`.
- Client local DB: `src/client/db.ts`.
- Client store: `src/client/store.ts`.
- Authority routes: `src/worker/authority.ts`.
- Authority validation: `src/worker/authority-validation.ts`.
- Storage snapshot writer: `src/worker/storage.ts`.
- Public route source: `src/app/routes/site-page.tsx`.
- Public renderer: `src/app/site-renderer/renderer.tsx`.
- Site tree projection: `src/site/tree.ts`.
- Source app registry: `src/shared/schema-apps.ts`.
- Worker source app registry: `src/worker/schema-apps.ts`.
- Site source schema: `schema/apps/site/schema.json`.
- Site source seed records: `schema/apps/site/seed-records.json`.
- Worker deploy config: `wrangler.jsonc`.
- Package scripts: `package.json`.

Owned files:

- `prd/26-site-editing-publish-workflow.md`.

Likely changed files:

- `src/app/routes/site-page.tsx`.
- `src/client/sync.ts`.
- `src/shared/protocol.ts`.
- `src/worker/authority.ts`.
- `src/worker/authority-validation.ts`.
- `src/worker/storage.ts`.
- `scripts/site-pull-seed.ts`.
- `scripts/site-publish.ts`.
- `package.json`.
- `schema/apps/site/seed-records.json`.
- Tests near changed modules.

## Requirements

### Live Preview Sync

- Local public Site preview routes can live-update from Site authority writes.
- `/pages/*` preview pages refetch the current tree after committed Site writes.
- Preview sync uses the existing site-keyed push sync route when possible.
- Preview sync must preserve route isolation.
- Preview sync must not make public tree fetches a write path.
- Preview sync must not require opening the generated Site editor in the same browser profile.
- Preview sync must not show generated admin navigation on public routes.
- Preview sync must abort stale tree fetches when the slug changes.
- Preview sync must stop when the public Site route unmounts.
- Preview sync must handle reconnects consistently with existing push sync behavior.
- Preview sync status can be quiet; it should not clutter public Site chrome.
- Published visitors do not need live edit sync.
- Production live preview behavior must be explicitly enabled if ever needed later.

### Source Seed Promotion

- `schema/apps/site/seed-records.json` remains the canonical source seed file for the personal Site.
- The seed file stores seed records close to `StoredRecord` shape.
- The seed file does not store change rows.
- The seed file does not store action replay rows.
- The seed file does not store read-model output.
- A command can export the local Site authority state and write `schema/apps/site/seed-records.json`.
- The command defaults to the local dev URL from `devstate`.
- The command can accept an explicit source URL.
- The command validates the exported snapshot before writing.
- The command writes only active records by default.
- The command omits tombstoned records from the source seed by default.
- The command preserves record IDs.
- The command preserves record `createdAt` values.
- The command writes deterministic JSON formatting.
- The command writes deterministic record order.
- The command fails when the snapshot schema key is not `site`.
- The command fails when the snapshot schema is incompatible with the source Site schema unless an explicit migration path exists.
- The command can run in check mode to report whether the seed file is current.
- Manual snapshot export stays available as a backup tool, not the normal seed workflow.

### Source Seed Restore Locally

- Existing source reset remains the local way to restore source schema and seed data.
- After seed promotion, resetting local Site seed should restore the promoted seed.
- Seed promotion must not mutate the local authority store by itself.
- Seed promotion must not touch browser IndexedDB directly.

### Live Publish

- A publish command can deploy code and publish reviewed Site source data to the live Worker.
- Code deploy and data publish are both explicit steps in the command output.
- The command runs project checks through `devstate check` before publishing unless explicitly skipped for a dry run.
- The command builds through existing Bun scripts.
- The command uses Wrangler for Worker deploy.
- The command creates a live Site snapshot backup before data restore.
- The command writes live backups to a local ignored backup directory or explicit output path.
- The command restores live Site data through the authority snapshot restore path.
- The restore payload is built from source schema and source seed records, not from browser IndexedDB.
- The command validates restore input locally before calling the live Worker.
- The command validates the live response after restore.
- The command smokes public live routes after restore.
- The command clearly separates dry-run output from mutating publish output.
- The command can publish data without deploying code only when explicitly requested.
- The command can deploy code without publishing data only when explicitly requested.
- Failed data publish must leave a backup artifact when a backup was possible.

### Production Safety

- Live mutating developer endpoints need an authorization guard before they are used by publish scripts.
- The guard covers snapshot restore.
- The guard covers reset schema and reset seed.
- The guard covers schema writes.
- The guard covers generated mutations and actions when the live Worker should be public-only.
- The guard should allow local development without extra ceremony.
- The guard should be environment-controlled for deployed Workers.
- Unauthorized requests must fail before reading or mutating storage.
- Public tree reads stay publicly accessible.
- Public page rendering stays publicly accessible.
- The guard must be covered by worker tests.

### Workflow Documentation

- The workflow should be documented in the PRD while in progress.
- A short command summary can move to global docs after ship.
- The docs should state that deploy alone does not replace live Durable Object data.
- The docs should state that source seed promotion is the reviewable checkpoint.
- The docs should state where live backups are written.

## Implementation Decisions

| ID      | Decision                                                             | Reason                                                                                  | Evidence                                                                     |
| ------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| SWF-D1  | Keep the authority as the source of edited local Site records.       | Browser IndexedDB is a replica; snapshots already export from authority.                | `prd/15-store-snapshot-export-restore.md`                                    |
| SWF-D2  | Keep `seed-records.json` as the reviewed source artifact.            | Source app seeds already bootstrap and reset schema-keyed authorities.                  | `doc/roadmap.md`                                                             |
| SWF-D3  | Add seed promotion as a script, not a product UI.                    | This is developer workflow, not general import/export.                                  | `doc/roadmap.md` Not First Release                                           |
| SWF-D4  | Use push sync as preview invalidation, not as a second public store. | Public tree projection should remain authority-backed.                                  | `src/app/routes/site-page.tsx`, `src/site/tree.ts`                           |
| SWF-D5  | Keep public preview tree fetches HTTP read-only.                     | HTTP tree reads already own public projection and warning behavior.                     | `src/worker/authority.ts`                                                    |
| SWF-D6  | Build live data restore from source schema plus source seed records. | Deploying source code does not reset an existing Durable Object instance.               | `src/worker/storage.ts`                                                      |
| SWF-D7  | Back up live authority state before restore.                         | Snapshot restore is intentionally whole-store for one schema key.                       | `prd/15-store-snapshot-export-restore.md`                                    |
| SWF-D8  | Add production auth before relying on live restore.                  | Current developer endpoints are too powerful for an unauthenticated public Worker flow. | User workflow requirement 2026-05-12, `prd/25-authority-operation-module.md` |
| SWF-D9  | Use `devstate` as check evidence.                                    | Repo instructions say `devstate` owns dev, test, and check output.                      | `AGENTS.md`                                                                  |
| SWF-D10 | Keep this workflow Site-specific first.                              | General app marketplace/import/export is out of first-release scope.                    | `doc/roadmap.md`                                                             |

### Deep Modules

- **Site preview invalidation client:** opens or reuses a Site push-sync subscription and exposes a small callback when the current public tree should refetch.
- **Site seed snapshot adapter:** converts a validated Site store snapshot into deterministic source seed records.
- **Site source snapshot builder:** builds a restore-ready Site snapshot envelope from source schema and seed files.
- **Authority admin guard:** uses PRD 25 operation metadata to centralize production authorization checks for developer write endpoints.
- **Site publish client:** orchestrates check, build/deploy, backup, restore, and smoke with explicit dry-run behavior.

### SWF-01 Baseline

- Public preview route `src/app/routes/site-page.tsx` fetches `/api/site/tree/:slug` on route load.
- Public preview route aborts stale tree fetches when the route slug changes or unmounts.
- Public preview route does not start Site push sync yet.
- Public tree fetches stay read-only and do not broadcast sync messages.
- Manual snapshot export uses `GET /api/site/snapshot`.
- Manual snapshot restore uses `POST /api/site/snapshot/restore`.
- Source seed reset uses `schema/apps/site/seed-records.json`.
- Source seed file stores active flat `StoredRecord` rows only.
- Source seed file does not store change rows, action replay rows, tombstones, or read-model output.
- No source seed promotion command exists yet.
- `bun run deploy` runs `vp build && wrangler deploy`.
- Deploy does not reset or replace live Durable Object data.

### Script Contracts

#### `site:pull-seed`

- Package script: `bun run site:pull-seed`.
- Entrypoint: `scripts/site-pull-seed.ts`.
- Default source: local dev URL from devstate status.
- Source override: `--source <url>`.
- Check mode: `--check`.
- Output path: `schema/apps/site/seed-records.json`.
- Snapshot source: `GET <source>/api/site/snapshot`.
- Required snapshot key: `site`.
- Validation: parse snapshot envelope, parse source Site schema, validate records against source Site schema.
- Default output records: active `block` and `blockPlacement` records only.
- Omit from output: tombstones, change rows, action replay rows, read-model output, snapshot envelope metadata.
- Preserve: record IDs and `createdAt`.
- Sort order: source schema entity order, then `createdAt`, then record ID.
- JSON format: two-space indentation, trailing newline.
- Check exit: `0` when output matches; non-zero when stale or invalid.
- Write exit: `0` after writing current output; non-zero on fetch, parse, validation, or filesystem failure.

#### `site:publish`

- Package script: `bun run site:publish`.
- Entrypoint: `scripts/site-publish.ts`.
- Default behavior: dry run.
- Mutating mode: `--apply` required.
- Target override: `--target <url>`.
- Mode flags: default apply mode deploys code and publishes data; `--code-only` deploys without data; `--data-only` publishes data without deploy.
- Check behavior: run `devstate check` before mutating unless `--skip-check` is explicitly provided.
- Build/deploy: use existing Bun build/deploy path and Wrangler.
- Restore input: build a Site store snapshot from source Site schema plus `schema/apps/site/seed-records.json`.
- Backup: fetch live `GET <target>/api/site/snapshot` before data restore.
- Backup path: `tmp/site-publish-backups/` unless `--backup-dir <path>` is provided.
- Restore path: `POST <target>/api/site/snapshot/restore`.
- Validation: validate source snapshot before restore and validate live response after restore.
- Auth: when the production guard ships, send the admin token from `FORMLESS_ADMIN_TOKEN`.
- Smoke: after data restore, fetch live public routes including `/pages/home` or the published root profile equivalent.
- Failure rule: if backup succeeds and restore fails, keep the backup artifact and print its path.

## Testing Decisions

- Preview sync tests should assert route behavior: a pushed Site write triggers a tree refetch for the active slug.
- Preview sync tests should not assert raw WebSocket helper call order.
- Preview sync tests should cover unmount cleanup and slug changes.
- Seed adapter tests should cover deterministic output from a snapshot.
- Seed adapter tests should reject wrong schema keys.
- Seed adapter tests should omit tombstones by default.
- Seed adapter tests should preserve IDs and `createdAt`.
- Seed adapter tests should reject schema/record inconsistencies through existing protocol/schema validators.
- Source snapshot builder tests should produce a restore envelope from source schema plus seed records.
- Authority guard tests should cover allowed local/dev behavior.
- Authority guard tests should cover rejected production writes without mutating storage.
- Publish script tests can isolate command planning from actual Wrangler deploy.
- Publish script smoke should be manual or browser-based only after core unit tests pass.
- Browser smoke should open `/site` and `/pages/home` in separate contexts if the browser tool supports it.
- Browser smoke should edit a Site field and verify preview updates without route reload.
- Live publish should have a dry-run acceptance check before mutating live data.

## Chunks

| ID     | Status  | Depends on | Main files                                 | Acceptance                                                                                                            |
| ------ | ------- | ---------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| SWF-01 | shipped | PRD 25     | tests, PRD                                 | Current manual snapshot, preview, seed, and deploy workflow is characterized; script contracts are locked.            |
| SWF-02 | planned | SWF-01     | public route, sync client, app tests       | `/pages/*` local preview refetches active tree after pushed Site writes and cleans up on route changes/unmount.       |
| SWF-03 | planned | SWF-01     | seed adapter script, package script, tests | `bun run site:pull-seed` writes deterministic `schema/apps/site/seed-records.json` from local Site authority state.   |
| SWF-04 | planned | SWF-03     | source snapshot builder, tests             | Source schema plus source seed records produce a restore-ready Site snapshot envelope with validation.                |
| SWF-05 | planned | SWF-04     | authority guard, worker tests              | Production developer write endpoints require authorization while public tree reads remain public.                     |
| SWF-06 | planned | SWF-05     | publish script, package script, tests      | Publish command can dry-run, deploy code, back up live Site snapshot, restore source Site data, and smoke routes.     |
| SWF-07 | planned | SWF-06     | browser smoke, PRD                         | Separate editor/preview smoke passes; publish dry-run evidence is recorded; PRD status and promote notes are current. |

## Parallel Shipping

Can ship in parallel with:

- Public renderer work only after PRD 24 files are stable and ownership is clear.
- Docs steward work if it does not edit this PRD.

Should not ship in parallel with:

- PRD 25 authority operation module chunks.
- Snapshot export/restore route rewrites.
- Authority storage table rewrites.
- Push sync protocol rewrites.
- Site source schema simplification that changes `block` or `blockPlacement` semantics without coordination.

## Out of Scope

- Do not build general import/export UI.
- Do not add app marketplace export.
- Do not add cross-schema restore.
- Do not add multi-user publishing permissions.
- Do not add a visual page builder.
- Do not add media upload.
- Do not add a general CMS draft workflow.
- Do not change public header/footer polish here.
- Do not make WebSocket a write path.
- Do not reset live Durable Object data implicitly during ordinary deploy.

## Blockers

- None.

## Promote after ship

- `doc/current.md`: note public Site preview can live-update from Site push sync if shipped.
- `doc/current.md`: note `schema/apps/site/seed-records.json` can be promoted from local Site authority with a Bun script if shipped.
- `doc/current.md`: note live Site publish backs up and restores Site authority data through guarded snapshot APIs if shipped.
- `doc/roadmap.md`: add only if this workflow becomes first-release release scope.
- `AGENTS.md`: add command summary only if the workflow becomes standard agent procedure.

## Evidence

- 2026-05-12: PRD created from user direction to refine the personal Site editing workflow after public Site chrome polish.
- 2026-05-12: Renumbered from PRD 25 to PRD 26 after adding PRD 25 for the Authority operation module. Start condition now depends on PRD 25.
- 2026-05-12: PRD 25 is shipped; SWF-01 dependency satisfied.
- 2026-05-12: SWF-01 shipped. Added characterization coverage for current Site preview tree fetch behavior, manual Site snapshot versus source seed reset behavior, source seed artifact shape, and deploy-as-code-only behavior.
- 2026-05-12: SWF-01 evidence: `devstate check` passed; `.devstate/status.md` reports checks ok, web service ready at `https://26-site-editing-publish-workflow.formless.local`, and watcher tests passing.
- 2026-05-12: SWF-01 evidence: `.devstate/logs/check-vite.txt` reports formatting complete and no warnings, lint errors, or type errors across 195 files; `.devstate/logs/service-test.txt` reports the changed workflow tests passing.
- 2026-05-12: SWF-01 evidence: requested `tmp/devstate.json`, `tmp/test.txt`, and `tmp/check.txt` were not present; available devstate evidence lives in `.devstate/status.md`, `.devstate/status.json`, and `.devstate/logs/`.
- 2026-05-12: Browser smoke skipped because SWF-01 changed tests and PRD contracts only; no rendered app behavior changed.

## PRD status notes

- SWF-01 shipped 2026-05-12.
- Current chunk: SWF-02 planned.
- Current blocker: none.
- Decisions: script contracts above are locked for SWF-03 and SWF-06.
- Promote notes stay pending until live preview, seed promotion, guarded publish, and publish workflow ship.
