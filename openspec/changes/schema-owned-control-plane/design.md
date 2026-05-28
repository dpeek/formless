## Context

`add-deployment-primitives` introduces a generic deployment runtime with
desired-state versions, attempts, leases, evidence summaries, drift reports, and
external deployer writeback. App installs already have a similar control-plane
shape: stable instance-local identity, package-backed initialization, route
metadata, owner/editor UI, archives, and CLI workflows. Both areas are currently
served by custom instance tables and hand-built protocol surfaces.

Formless already has a runtime schema language for flat records, relationships,
queries, read models, views, screens, mutations, actions, generated UI, and
Authority storage. Instance management data should use that language. App data
itself remains scoped to each installed app storage identity. Provider secrets,
Alchemy state, raw lease tokens, and full provider resources remain operational
facts outside schema records.

## Goals / Non-Goals

**Goals:**

- Make instance management intent schema-owned control-plane records.
- Model app installs as `appInstall` records with immutable install identity.
- Model app routes as `appRoute` records that reference `appInstall` records.
- Preserve install-scoped app data, Authority names, browser replicas,
  broadcast channels, and API prefixes derived from stable install identity.
- Use deployment runtime desired-state versions as projections over
  control-plane records.
- Give owner/admin UI, archive/workspace flows, and CLI workflows the same
  source schema for app installs, routes, domains, and deployment configuration.
- Keep provider secrets, Alchemy state, raw lease tokens, object bytes, and full
  provider resource JSON outside Authority records.
- Package deploy schema, projections, protocol helpers, and adapters under
  `lib/deploy`.
- Preserve current app install, custom-domain, deployment-runtime, archive, and
  CLI command/API surfaces during migration.

**Non-Goals:**

- Do not rewrite or block `add-deployment-primitives`.
- Do not remove direct Cloudflare fallback commands.
- Do not make arbitrary user-edited instance control-plane schemas in this
  change.
- Do not move installed app records into the control-plane storage identity.
- Do not make app install ids or package app keys mutable after creation.
- Do not move Alchemy's provider-state store into Formless records.
- Do not add new provider resource families beyond the contracts needed to model
  current domain and redirect intent.

## Decisions

### Add an instance control-plane schema

Introduce a runtime-owned instance control-plane app storage identity for
Formless-owned schema records. Its schema defines `appInstall`, `appRoute`, and
deployment entities such as deploy targets, provider config references, domain
mappings, redirect intent, desired resources, attempts, evidence summaries, and
drift reports. Records stay flat and use normal Authority write-log, query, read
model, action, and generated UI contracts.

Alternative: keep adding custom tables per resource family. That is quicker per
feature, but it duplicates schema capabilities and hides instance state from the
same protocols used by generated apps.

### Keep app install identity immutable

The `appInstall` record id, or an immutable `installId` field if the record id
must be separate, remains the stable app install identity. It continues to drive
installed app API prefix, Authority name, browser database, broadcast channel,
public Site scope, archives, and route target identity. Labels and route records
can change; install identity and package app key do not.

Alternative: allow install id edits and retarget app storage. That makes route
editing look simple but turns identity changes into data migration across
Authority, browser replica, sync, archive, media, and public route scopes.

### Make routes first-class records

Default install creation creates `appRoute` records for admin and schema routes,
plus public Site routes when the package supports public Sites. Each route
record references the `appInstall` record and owns route kind, path or prefix,
enabled state, and surface metadata. Runtime topology resolves enabled route
records to app installs before mounting app or public Site surfaces.

Alternative: derive all routes from install id forever. That is enough for the
current `/apps/<installId>` and `/sites/<installId>` paths, but it prevents route
records from becoming the common target for custom domains, deployment graphs,
archives, and future app route editing.

### Preserve installed app data boundaries

The control-plane schema owns install metadata and route bindings only.
Installed app records, active schema, changes, action executions, snapshots, and
sync state remain under the app storage identity such as `app:site`. App install
creation remains a two-part operation: create control-plane records, then
initialize the installed app storage from the package source schema and seed
records.

Alternative: store installed app data as nested control-plane records. That
violates the flat app storage model and mixes app lifecycle metadata with app
content records.

### Provide an editor-grade generated UI

The generated instance editor should cover current table-driven behavior:
package selection for Site, Tasks, and Estii; route-safe install id entry during
creation; editable labels; visible status and package facts; generated default
routes; route enabled/path editing where allowed; route conflict and reserved
path feedback; domain/deploy status; and read-only deployment history. Identity,
package key, storage identity, raw provider evidence, and runner-only actions
stay read-only or hidden.

Alternative: expose raw generated tables only. That would prove the schema
model, but it would regress the current instance shell by making common install
and route workflows less guided than the existing hand-built controls.

### Split deploy intent from operational execution

Schema records own user intent and displayable history. Runtime/provider stores
own raw secrets, raw lease tokens, Alchemy state, object bytes, and canonical
provider resource state. Records may store secret references, evidence summaries,
provider ids needed for audit or cleanup, and display-safe status facts.

Alternative: store all deployment facts as records. That would simplify reads,
but it would expose secrets and provider internals to browser, archive, and
workspace paths that are intentionally reviewable.

### Make desired state a projection over control-plane records

Deployment desired-state versions continue to have stable hashes and exact
version ids, but their source fingerprint comes from schema-owned control-plane
records. The deployment runtime materializes or reads those versions through a
projection helper, not by treating deployment tables as user intent.

Alternative: let deployers query schema records and build desired state locally.
That would avoid server projection code, but it would make hash stability and
exact-version apply depend on each deployer implementation.

### Add actor-scoped action exposure

Control-plane schema actions need actor policy for owner/admin browser users,
CLI deployers, and external runners. CLI and runner actors can query allowed
records and invoke deployment actions through an instance protocol without
receiving provider secrets. Idempotency keys and exact desired-state references
remain part of action input.

Alternative: keep bespoke deployment endpoints only. That preserves current API
shape, but it prevents the schema language from describing the actors and
commands that make instance configuration usable across UI and CLI.

### Package deploy as a vertical slice

`lib/deploy` owns deploy schema definitions, public model types, projection
helpers, display summary helpers, client/CLI protocol helpers, React metadata,
and Worker adapters. App install and route core contracts remain part of the
instance control-plane model unless a later package boundary emerges.

Alternative: spread deploy schema, UI metadata, CLI types, and Worker helpers
across existing source folders. That minimizes package setup but keeps the
deployment domain difficult to move as one capability.

### Migrate through compatibility adapters

Existing app install, custom-domain, deployment-runtime, archive, and CLI APIs
stay stable. During rollout, legacy tables can be backfilled into control-plane
records, old endpoints can delegate to schema queries/actions, and compatibility
reads can compare old and new state until the migration is proven.

Alternative: cut over all command and API surfaces at once. That would reduce
bridging code, but it would create too much risk on top of the in-flight
deployment runtime change.

## Risks / Trade-offs

- Schema actions may not express every instance invariant yet -> add the
  smallest immutable-field, actor policy, idempotency, secret-reference, and
  append-only semantics needed for app installs and deployment.
- Route records can conflict with reserved instance paths -> validate route
  paths against runtime topology before commit and show conflicts in the editor.
- Migration can duplicate install and route status between legacy tables and
  records -> make control-plane records the write target after backfill and keep
  compatibility reads deterministic.
- Generated UI can expose runner-only commands or identity edits by accident ->
  require action exposure and immutable-field metadata tests.
- Desired-state hashes can churn after the projection moves -> keep canonical
  projection fixtures before and after migration.
- `lib/deploy` can become too broad -> keep it to public contracts, pure
  helpers, and surface adapters; provider SDK calls remain in provider runners.

## Migration Plan

1. Land after `add-deployment-primitives` has established deployment runtime
   desired-state, attempts, leases, writeback, and status contracts.
2. Add instance control-plane schema contracts for `appInstall`, `appRoute`, and
   deployment intent records.
3. Add `lib/deploy` with deploy schema definitions, public types, pure
   projection helpers, and deterministic hash fixtures.
4. Add instance control-plane storage bootstrap and schema API access.
5. Backfill current `app_installs` rows into `appInstall` and `appRoute`
   records.
6. Backfill current custom-domain mapping, redirect, deployment attempt,
   evidence, and drift facts into schema-owned records.
7. Resolve installed app and public Site routes from enabled `appRoute` records
   while preserving current route defaults.
8. Change deployment desired-state materialization to project from control-plane
   records.
9. Route existing app install, custom-domain, deployment-runtime, archive, and
   CLI endpoints through schema record queries/actions while preserving response
   shapes.
10. Update generated instance UI and Site CLI workflows to use schema-owned
    install, route, domain, and deployment records.
11. Keep rollback by leaving legacy tables readable until compatibility tests
    prove control-plane records are the source of truth.

## Open Questions

- Exact instance control-plane storage identity name.
- Whether `appInstall` record id equals install id or stores install id as an
  immutable field.
- Whether default route records are fully explicit or generated from install
  records until edited.
- Which route path edits are allowed in the first implementation.
- Whether raw lease tokens stay in a small runtime table or are stored only as
  hashes referenced by schema records.
- Whether deployment history records are append-only by schema metadata or by
  action-only write policy.
- Which control-plane entities are visible in Builder mode, if any.
