## Why

Formless needs a low-friction upgrade path before public users depend on
deployed instances, bundled app schemas, Durable Object SQLite state, browser
replicas, and archives. Users should be able to move forward through normal CLI
commands without hand-running SQL, editing records, or reading per-release
migration notes.

## What Changes

- Add a runtime upgrade and migration capability that plans and applies deployed
  runtime, Authority SQL, package app schema/data, browser replica, and archive
  compatibility changes.
- Extend deployed runtime metadata so CLI workflows can compare package version,
  runtime protocol, storage migration set, and bundled app package revision
  facts before mutating an instance.
- Add a shared Durable Object SQLite migration runner that records applied
  migrations per storage identity and runs idempotent, introspective migrations
  before upgraded code depends on new table shape.
- Add package app revision and schema hash facts separate from app schema
  language version, starting current bundled apps at revision `1`.
- Add code-backed package app migrations with manifest metadata for ordering,
  safety class, dry-run display, and audit evidence.
- Require package app data migrations to write through Authority semantics and
  append normal change rows so browser replicas catch up through existing sync.
- Keep upgrade planning CLI-only for now; no new broad browser upgrade UI in
  this change.
- Define stale browser client behavior: stale reads may continue when protocol
  compatible, stale writes can be rejected with reload-required errors, and
  server-side migrations are not blocked by old browser bundles.
- Keep archive export on the latest supported format while allowing restore and
  import of older supported archive formats through compatibility normalizers.

## Capabilities

### New Capabilities

- `upgrade-migrations`: Runtime upgrade planning, migration registration,
  applied-state tracking, migration safety policy, CLI upgrade flow, and stale
  client compatibility behavior.

### Modified Capabilities

- `app-schema`: Distinguish schema language version from package app revision
  and schema hash, and support code-backed package app schema/data migrations.
- `authority-storage`: Run shared SQL and record migrations per storage
  identity while preserving Authority validation, write-log, sync cursor, and
  snapshot invariants.
- `sync-replica`: Define stale browser client and IndexedDB migration behavior
  during runtime and package app upgrades.
- `installed-apps`: Store package app revision and schema hash facts for
  installed package apps without changing stable install identity.
- `site-cli-publish`: Add CLI-only upgrade planning and apply behavior around
  deploy, publish, archive, and instance workspace flows.
- `portable-archives`: Export the latest archive shape and import older
  supported archive shapes through explicit compatibility normalization.
- `deployment-runtime`: Include upgrade-relevant runtime and migration facts in
  deployed metadata and exact-version deploy checks.

## Impact

- Affects deployed metadata, Site CLI deploy/publish/instance workflows,
  bundled app package definitions, app install metadata, Authority storage
  initialization, Durable Object SQLite migrations, schema update/reset paths,
  record migration write-log behavior, browser sync error handling, and archive
  parse/restore paths.
- Coordinates with active deployment and schema-owned control-plane work but
  does not replace those changes.
- Does not add a browser upgrade UI, arbitrary user-authored migration scripts,
  direct CLI access to Durable Object SQLite, or manual migration instructions
  as the primary user path.
