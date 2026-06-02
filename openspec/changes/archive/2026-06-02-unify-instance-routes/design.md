## Context

The promoted control-plane specs model app routes, exact-host custom-domain
mappings, and provider redirects as separate records. The active
`browser-workspace-control-plane` change moves those records into deterministic
workspace source, and `standardize-entity-key-conventions` is expected to land
first with kebab-case entity names and qualified boundary names.

All three route-intent record families describe one domain concept:
`match address -> behavior -> target/provider projection`. Keeping them split
forces generated admin UI, workspace source, drift reporting, deployment
projection, and browser onboarding to special-case app paths, host mappings,
and redirects even when validation and provider projection need the same facts.

## Goals / Non-Goals

**Goals:**

- Replace app route, domain mapping, and redirect intent desired-state records
  with one flat `route` entity in the instance control-plane schema.
- Use `instance:route` at archive, workspace source, drift, log, and diagnostic
  boundaries.
- Keep route behavior composed in runtime topology, deployment projection,
  generated UI read models, and action handlers.
- Preserve app install id as the installed app storage identity.
- Keep provider evidence, deployment attempts, cleanup history, drift reports,
  and full provider truth outside route records.
- Keep existing app install and custom-domain APIs as compatibility adapters
  during migration.
- Make `destroy-instance` derive custom-domain, DNS, and redirect desired
  resources from enabled `instance:route` records.

**Non-Goals:**

- Do not mutate provider resources when route intent is written.
- Do not store provider current state, cleanup history, deployment attempts, or
  drift reports in route records.
- Do not change app install storage identity or move installed app data into
  the instance control plane.
- Do not redesign page routing inside the Site app.
- Do not solve entity key naming beyond assuming the prerequisite kebab-case
  convention.
- Do not expose secrets through browser responses, workspaces, archives, or
  specs.

## Decisions

### Model all desired route intent as `route`

The instance control-plane schema should define one local `route` entity with
these fields:

- `enabled`
- `matchHost`
- `matchPath`
- `matchPrefix`
- `kind`
- `targetProfile`
- `appInstall`
- `surface`
- `providerConfig`
- `toHost`
- `toUrl`
- `statusCode`
- `preservePath`
- `preserveQueryString`
- `createdAt`
- `updatedAt`

`matchHost` is optional. An absent host means the instance host or active
profile host. A present host is an exact normalized host. `matchPath` is the
exact path to match. `matchPrefix`, when present, is an additional normalized
path prefix for subtree matches, for example `matchPath: "/sites/site"` and
`matchPrefix: "/sites/site/"`.

Alternative: keep separate route, mapping, and redirect entities and add a
shared read model. That improves generated display but leaves workspace source,
archives, deployment projection, and drift with three desired-state shapes.

### Use two route kinds

`kind: "mount"` selects a runtime surface. Mount routes can target
`targetProfile: "instance"`, `"app"`, or `"public-site"`. App and public Site
mounts require an `appInstall` reference to an `app-install` record. Supported
surfaces are `admin`, `schema`, and `public-site`.

`kind: "redirect"` returns a redirect and generally does not target an app
install. Redirects require `statusCode` and either `toHost` or `toUrl`.
`preservePath` and `preserveQueryString` control how request path and query
are carried to the destination.

Alternative: encode redirects as a mount target profile. That makes redirect
logic look like a runtime profile even though it has no installed app or shell
target.

### Validate routes by behavior and match scope

Validation should reject route records before they affect runtime behavior when:

- `matchHost` is not a normalized exact host.
- `matchPath` or `matchPrefix` is not a normalized absolute path.
- `matchPrefix` does not represent a subtree beginning at or below
  `matchPath`.
- two enabled routes conflict for the same host scope and path/prefix match.
- a mount route lacks required target fields for its `targetProfile` or
  `surface`.
- an app or public Site route references a missing or unsupported app install.
- a redirect route includes app-only target fields or lacks redirect target
  fields.
- provider config is attached to a route that cannot produce provider
  resources.
- a host-mounted public Site route would expose generated admin shell,
  owner-auth, schema-key, or installed app admin routes on that host.

Alternative: allow broad route records and rely on runtime resolution to ignore
bad combinations. That makes workspace source and deployment projection accept
records that cannot be safely applied.

### Keep route resolution deterministic

Runtime topology should resolve enabled routes in a deterministic order:
exact-host routes before hostless routes, more specific exact paths before
prefix matches, and redirects before mounts within the same match specificity.
Host-mounted public Site routes keep the existing boundary: the host serves the
selected public Site and blocks generated admin shell and schema-key routes on
that host.

Alternative: resolve by record creation order. That makes behavior depend on
write timing and makes workspace drift harder to review.

### Backfill old records into route records

Migration should create deterministic `route` records from existing
`app-route`, `domain-mapping`, and `redirect-intent` records, then stop treating
the old entities as desired-state sources.

- App routes become hostless mount routes.
- Domain mappings become host mount routes with `matchHost`.
- Redirect intent becomes redirect routes with host match and redirect fields.
- Existing provider evidence, cleanup records, deployment attempts, and drift
  summaries remain in their current evidence/history records or projections.
- Conflicting enabled old records are rejected or marked as migration blockers
  before route records become active.

Alternative: keep old records and have `route` duplicate them. That creates two
desired-state sources and reintroduces the stale-state problem this change is
removing.

### Keep compatibility APIs as adapters

Existing app install route summaries and custom-domain mapping/redirect APIs
can remain during migration. They should translate request and response shapes
to `route` records and use route validation. The adapters must not re-create old
desired-state entities or expose provider secrets.

Alternative: remove old API surfaces immediately. That reduces code paths but
widens the change beyond the record model and generated admin cleanup.

### Project deployment resources from routes

Deployment desired-state projection should read enabled `route` records. Host
mount routes produce custom-domain/DNS resources for the selected target and
provider config. Redirect routes produce redirect resources and redirect DNS
resources. Hostless app/admin/schema routes affect runtime topology but do not
produce provider custom-domain resources.

Desired-state hashes include canonical enabled route projection. Attempt
history, evidence summaries, cleanup history, drift reports, timestamps outside
intent, and provider current state do not affect the desired-state hash.

Alternative: keep deployment projection reading domain-specific records. That
keeps deploy code stable but leaves workspace source and destroy reconciliation
split from the unified route model.

### Preserve cleanup and evidence boundaries

Route records are desired intent only. Disabling or deleting a route does not
delete provider resources. Cleanup, manual removal, forget, deploy, and destroy
workflows remain explicit and record their results outside `route`.

`destroy-instance` should derive custom-domain, DNS, and redirect desired
resources from enabled `instance:route` records instead of separate domain or
redirect records. Provider-owned teardown still uses the selected deploy target,
Alchemy app/stage/state, and recorded display-safe evidence to avoid treating
routes as provider truth.

Alternative: store applied provider resource ids on route records. That would
make route intent carry provider truth and make ordinary route edits look like
provider cleanup.

### Make generated UI route-centric

Generated instance management should render one Routes surface. Filters and
grouping distinguish instance paths, host mappings, public Site routes, and
redirects. Provider evidence and cleanup history remain visually separate from
route intent.

Alternative: keep separate app route, domain mapping, and redirect screens. That
preserves current mental models but does not simplify browser onboarding or
workspace source review.

## Risks / Trade-offs

- Route entity becomes too broad -> validate by `kind`, `targetProfile`, and
  `surface`, and keep provider evidence out of the record.
- Host route conflicts become harder to reason about -> define deterministic
  match precedence and reject overlapping enabled routes at write time.
- Compatibility adapters can hide old source usage -> keep adapters thin and
  remove old desired-state entities from workspace/archive source and deploy
  projection.
- Disabled routes with old provider evidence can be misunderstood -> keep
  cleanup and evidence surfaces separate, and require explicit cleanup or
  destroy workflows for provider mutation.
- Active changes may conflict on source language -> finalization should align
  `browser-workspace-control-plane` and `destroy-instance` to route records
  after this proposal lands.

## Migration Plan

1. Land `standardize-entity-key-conventions` first so the route entity uses a
   kebab-case entity key, boundary name `instance:route`, and camelCase field
   keys.
2. Add `route` to the instance control-plane schema and validation model.
3. Add migration/backfill from `app-route`, `domain-mapping`, and
   `redirect-intent` records to deterministic `route` records.
4. Rewire runtime topology, deployment projection, workspace source, archives,
   generated UI, and CLI drift to read route records.
5. Keep app install and custom-domain APIs as adapters until callers no longer
   depend on old response shapes.
6. Reconcile `destroy-instance` to derive domain, DNS, and redirect provider
   resources from enabled `instance:route` records.
7. Promote shipped facts into the affected specs and remove old desired-state
   entity requirements.

Rollback during implementation is a code and spec revert before deterministic
workspace record source is frozen. After workspace source ships with
`instance:route`, rollback would require rewriting workspace source back to the
old entity split and is not preferred.

## Open Questions

- Should `providerConfig` be required for every host route and redirect, or
  only when multiple provider configs exist for one instance?
- Should route ids be semantic from match and behavior, or stable generated ids
  with uniqueness enforced by indexes?
