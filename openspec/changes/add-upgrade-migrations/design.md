## Context

Formless currently has several versioned surfaces but no single upgrade model.
Deployed Workers expose a package version at `/api/formless/deploy`, app schemas
carry schema language `version: 1`, snapshots and archives reject unsupported
envelope versions, browser replicas use IndexedDB database version `1`, and
some Durable Object SQLite migrations are local introspective table rewrites.

Those pieces are useful but separate. As public instances start holding user
data, upgrades must cover deployed runtime code, DO SQLite tables, bundled app
package schema revisions, record backfills, browser cache compatibility, and
archive compatibility without asking users to perform manual migration steps.

## Goals / Non-Goals

**Goals:**

- Make normal CLI flows able to plan, apply, and verify runtime and data
  upgrades.
- Keep migration execution inside the deployed runtime or existing Authority
  APIs; the CLI must not mutate Durable Object SQLite directly.
- Track applied SQL and package app migrations per affected storage identity.
- Add package app revision and schema hash facts separately from app schema
  language version.
- Use code-backed migrations first, with manifest metadata for ordering,
  checksums, safety, dry-run display, and evidence.
- Preserve Authority validation, write-log, snapshot, and sync invariants for
  record migrations.
- Export archives in the latest format while accepting older supported formats
  through explicit normalizers.

**Non-Goals:**

- No browser upgrade management UI.
- No arbitrary user-authored migration scripts.
- No migration DSL before code-backed migrations prove the needed shape.
- No direct CLI access to Durable Object SQLite.
- No promise that old browser bundles can keep writing after runtime upgrades.
- No replacement for deployment desired-state or schema-owned control-plane
  changes already in progress.

## Decisions

### Use code-backed migrations with manifest metadata

Package app and storage migrations are TypeScript functions registered through a
manifest. The manifest records stable id, owner, affected package or storage
family, from/to revisions when relevant, checksum, safety class, and display
summary. The function owns the actual transform.

Alternative: start with a declarative migration DSL. That looks cleaner for
simple field additions, but the first real migrations will include record
backfills, field splits, join-record creation, media reference normalization,
and control-plane backfills. Those need code and tests.

### Separate schema language version, package revision, and schema hash

`schema.version` remains the app schema language version. Bundled package apps
receive a monotonic `packageRevision`, starting current Site, Tasks, and Estii
packages at `1`. A deterministic `schemaHash` records the exact package source
schema content for drift detection and provenance.

Git commit hashes are not migration keys. They are build provenance, not data
contracts: docs-only commits can change them, npm installs may not preserve
them, and they do not define migration order.

### Classify migration safety

Migrations use three safety classes:

- `auto-safe`: additive SQL tables/indexes, metadata rows, optional schema
  fields, and cache-only browser changes.
- `auto-with-backup`: record backfills, package app schema revisions, source
  schema resets, archive restores, and other user-data changes.
- `manual-approval`: destructive or irreversible data loss and provider
  resource replacement.

Existing remote mutation commands already require explicit apply inputs. Those
flows can run `auto-with-backup` migrations after taking the same backup style
used by publish, archive restore, and instance workspace push.

### Run SQL migrations lazily and record applied state

Each relevant Durable Object storage identity gets a small applied-migrations
table. Storage initialization runs registered SQL migrations for that storage
family before upgraded code depends on new table shape. Migrations are
idempotent and introspective through SQLite metadata such as `sqlite_master` and
`PRAGMA table_info`.

CLI upgrade can proactively touch known app installs and instance storage, but
lazy runtime execution remains required because not every storage identity is
globally enumerable.

### Run app data migrations through Authority semantics

Package app migrations that change records or active schema execute inside the
Authority storage boundary. They validate against the target schema, materialize
flat records or tombstones, append normal change rows, advance sync cursors, and
clear replay/action state only when the operation semantics require it.

Alternative: rewrite rows directly in SQLite. That would be shorter but would
bypass validation and leave browser replicas unable to catch up through normal
sync.

### Keep upgrade planning CLI-only for now

The CLI reads deployed metadata, local package metadata, app install facts,
archive state, and deployment status to produce an upgrade plan. Apply runs
inside existing explicit commands such as deploy, publish, archive restore, and
instance workspace push, or through a narrow admin apply hook if an Authority
migration cannot be expressed by an existing endpoint.

Alternative: add a broad browser upgrade UI and `/api/formless/upgrade/plan`
surface now. That adds product surface before the runtime contracts are proven.

### Treat stale browser clients as reload-required for writes

The supported pair is the latest deployed Worker and latest static client
bundle. Stale browser reads can continue when response protocols remain
compatible. Stale writes that target an incompatible runtime, schema package
revision, or protocol are rejected with a reload-required error. Old browser
bundles do not block server-side migration.

### Normalize old archives on import and export latest

Archive writers emit only the latest supported envelope. Archive readers accept
older supported envelopes through version-specific normalizers that produce the
current internal restore model before validation and dry-run planning.

Alternative: require users to run conversion commands before restore. That
pushes tedious migration work to users and increases backup/restore failure
risk.

## Risks / Trade-offs

- Code-backed migrations can become ad hoc -> require manifest metadata,
  stable ids, checksums, safety classes, tests, and applied-state evidence.
- Lazy storage migrations can surprise request latency -> keep migrations small,
  deterministic, and idempotent; CLI upgrade should warm known identities.
- Package revision can drift from schema hash -> treat revision as ordering and
  hash as content provenance; verify both in tests.
- Record migrations can duplicate reset/restore behavior -> route through
  Authority helpers and write-log contracts instead of direct row mutation.
- Stale browser rejection can interrupt editing -> use explicit reload-required
  errors and preserve read compatibility when cheap.
- Archive normalizers can hide lossy upgrades -> normalizers must be explicit,
  tested, and included in dry-run evidence.

## Migration Plan

1. Add shared upgrade contract types, safety classes, package revision facts,
   schema hash helpers, and migration manifest parsing.
2. Extend deploy metadata and CLI target status reads with runtime protocol,
   storage migration set, and package app revision/hash facts.
3. Add shared Durable Object SQLite migration applied-state tables and runner.
4. Register current storage migrations, including existing one-off table shape
   migrations, behind the shared runner.
5. Add package app revision/hash facts to bundled package definitions and app
   install metadata.
6. Add package app migration registry and Authority-backed migration execution
   for schema/data changes.
7. Update browser sync/write handling for reload-required stale client errors
   and cache-only IndexedDB migration fallback.
8. Add archive normalizer registry for older supported archive envelope
   versions and keep writers on the latest version.
9. Add CLI upgrade plan/check/apply reporting around deploy, publish, archive,
   and instance workspace flows.
10. Verify with focused storage, Authority, CLI, browser replica, and archive
    tests.

Rollback keeps old code readable for already-applied additive SQL changes and
uses backups for user-data migrations. Destructive migrations require explicit
manual approval and documented backup evidence before apply.

## Open Questions

- Whether the first CLI entrypoint is an explicit `formless instance upgrade`
  command or upgrade planning embedded only in existing deploy/publish/push
  commands.
- Whether a narrow admin migration apply endpoint is needed immediately or all
  first package app migrations can use existing schema/reset/snapshot APIs.
- How many prior archive envelope versions the first public release commits to
  supporting.
