## 1. Schema Model

- [x] 1.1 Add the `route` entity to the instance control-plane schema using kebab-case field names and qualified boundary name `instance:route`.
- [x] 1.2 Remove app route, domain mapping, and redirect intent desired-state entities from new control-plane source paths.
- [x] 1.3 Define route field metadata for enabled state, match host, match path, match prefix, kind, target profile, app install, surface, provider config, redirect fields, and timestamps.
- [x] 1.4 Update read models and relationships so app installs, provider configs, deployment projection, and generated views reference route records.

Evidence 2026-06-02 grug:

- Changed `src/shared/instance-control-plane.ts` to make `route` the desired route entity, expose `instance:route`, use kebab-case route fields, and point generated route/deploy views and relationships at route records.
- Changed worker control-plane adapters so default app install routes and synced domain/redirect intent records write `route` records while app install API summaries still derive hostless installed-app routes.
- Updated direct schema/view/worker tests for the unified route model.
- `devstate start`: pass, services running.
- `devstate check`: pass, checks ok and services running.
- Browser smoke: `bun browser` opened `https://unify-instance-routes.formless.local/`; App management rendered `Routes` and desired resources with route columns, with no browser errors.

## 2. Validation

- [x] 2.1 Validate normalized exact hosts, hostless route scope, absolute match paths, and optional prefix shape.
- [x] 2.2 Validate `mount` routes by target profile, required app install target, surface, package capability, and provider config eligibility.
- [x] 2.3 Validate `redirect` routes by target host or URL, status code, preserve-path policy, preserve-query-string policy, and absence of app-only target fields.
- [x] 2.4 Reject conflicting enabled routes for the same host scope and path or prefix match.
- [x] 2.5 Preserve host-mounted public Site blocking for generated admin shell, owner auth, schema-key routes, and installed app admin routes on that host.

Evidence 2026-06-02 grug:

- Changed `src/worker/authority-validation.ts` to validate unified `route` records in Authority writes: canonical exact hosts, hostless scope, normalized absolute paths and prefixes, mount target/surface/app capability, redirect target and policy shape, provider-config eligibility, enabled-route overlaps, and host public Site root-prefix blocking.
- Added focused Authority coverage in `src/worker/control-plane-schema-validation.test.ts` for unified `route` validation while preserving the legacy generic `app-route` metadata test.
- `devstate start`: pass, services running.
- `devstate check`: pass, checks ok and services running.
- Browser smoke: not run; this section changes Authority write validation only and does not change browser-visible UI behavior.

## 3. Migration And Backfill

- [x] 3.1 Backfill existing app route records into hostless mount route records.
- [x] 3.2 Backfill existing exact-host domain mapping records into host mount route records.
- [x] 3.3 Backfill existing redirect intent records into redirect route records.
- [x] 3.4 Preserve provider evidence, cleanup history, deployment attempts, and drift reports outside route records.
- [x] 3.5 Detect conflicting legacy desired records and report migration blockers before route records become active.

Evidence 2026-06-02 grug:

- Changed `src/worker/instance-control-plane.ts` to initialize control-plane storage with legacy route-intent backfill, convert active legacy `app-route`, `domain-mapping`, and `redirect-intent` records into deterministic `route` records, and preflight enabled route conflicts before sync writes.
- Changed compatibility readers in `src/worker/instance-domain-mappings.ts` and `src/worker/domain-provider-api.ts` to reconstruct existing response shapes from synced `route` records while leaving provider evidence, cleanup events, deployment attempts, and drift reports in their separate stores.
- Changed workspace/archive route source paths and affected tests to use canonical `route` records for app routes and exact-host mappings.
- `devstate start`: pass, services running.
- `devstate check`: pass, checks ok and services running.
- Browser smoke: not run; this section changes backfill, API compatibility, and workspace/archive route records, not browser-visible UI.

## 4. Runtime Topology

- [x] 4.1 Resolve installed app admin and schema routes from enabled route records.
- [x] 4.2 Resolve installed Site public routes from enabled route records.
- [x] 4.3 Resolve exact-host public Site and app mappings from enabled route records before ordinary host profile behavior.
- [x] 4.4 Resolve redirect routes with configured status code, target, preserve-path policy, and preserve-query-string policy.
- [x] 4.5 Add deterministic match ordering for exact host, hostless, exact path, prefix path, redirect, and mount selection.

Evidence 2026-06-02 grug:

- Added `src/worker/instance-runtime-routes.ts` and a private control-plane runtime route resolver so Worker routing selects enabled `route` records directly without request-time domain mapping compatibility lookup.
- Changed `src/worker/index.ts`, `src/worker/mapped-app-host.ts`, and `src/worker/mapped-site-host.ts` so exact-host mount routes drive mapped public Site SSR, mapped app shell hints, instance profile host behavior, auth blocking, and schema-key API blocking before ordinary host profile inference.
- Added redirect route resolution with configured status code, `to-host`/`to-url` target, preserved path, and preserved query string handling.
- Added runtime route ordering coverage for exact-host before hostless, exact path before prefix, redirect before mount, disabled-hostless exclusion for mapped-host lookup, and direct route-record Worker routing coverage for public Site, app, and redirect hosts.
- `devstate start`: pass, services running.
- `devstate check`: pass, checks ok and services running.
- Browser smoke: `bun browser --ignore-https-errors --session grug-runtime-topology-smoke batch --bail "open https://unify-instance-routes.formless.local/" "wait 1000" "snapshot -i --max-output 6000" "errors"` loaded App management and the unified `Routes` surface with no browser errors.

## 5. App Install Compatibility

- [x] 5.1 Create default admin, schema, and supported public Site route records when an app install is created.
- [x] 5.2 Derive existing app install API route summaries from route records.
- [x] 5.3 Keep create app install request validation compatible while rejecting invalid generated route records before app storage initialization.
- [x] 5.4 Prove installed app storage identity remains based on app install id, not route path or host.

Evidence 2026-06-02 grug:

- Changed `src/worker/authority-validation.ts` so control-plane validation can preflight a pending record set, including route references and enabled-route conflicts among generated records before commit.
- Changed `src/worker/instance-control-plane.ts` so `createAppInstall` builds and validates generated app-install/admin/schema/public Site route records before installed app storage bootstrap, then commits the same records through existing Authority validation.
- Extended `src/worker/instance-app-installs.test.ts` to prove route-derived app install summaries include edited route paths and public Site prefixes, generated route conflicts reject legacy create-install requests without recording the install, and installed app storage identity remains `app:<installId>` after route path edits.
- `devstate start`: initial output had services starting; `.devstate/status.md` then showed checks ok and services running.
- `devstate check`: pass, checks ok and services running.
- Browser smoke: not run; this section changes app install API/storage compatibility and Authority validation, not browser-visible UI.

## 6. Domain API Compatibility

- [x] 6.1 Adapt existing custom-domain mapping APIs to read and write host mount route records.
- [x] 6.2 Adapt existing redirect APIs to read and write redirect route records.
- [x] 6.3 Keep existing domain command and API response shapes compatible where callers still depend on them.
- [x] 6.4 Keep provider evidence, cleanup, forget, manual cleanup, and delete workflows separate from route writes.

Evidence 2026-06-02 grug:

- Changed `src/worker/instance-domain-mappings.ts` so custom-domain compatibility reads merge route records with legacy rows, create/disable/forget writes sync host mount `route` records, and apply-evidence validation uses route-backed mappings while preserving existing response shapes.
- Changed `src/worker/domain-provider-api.ts` so redirect compatibility reads merge route records with legacy rows, create/disable/forget writes redirect `route` records, and provider apply evidence, cleanup, manual cleanup, and delete job state remain in their existing provider evidence tables.
- Added `readControlPlaneRecords` in `src/worker/deployment-control-plane-client.ts` and a desired-cleanup helper in `src/worker/instance-domain-mappings-state.ts` so compatibility APIs can read route state without moving provider evidence into route writes.
- `devstate start`: pass, services running.
- `devstate check`: pass, checks ok and services running.
- Browser smoke: not run; this section changes domain and redirect API compatibility paths, not browser-visible UI.

## 7. Deployment Projection

- [x] 7.1 Project custom-domain and DNS desired resources from enabled host mount route records.
- [x] 7.2 Project redirect rule and redirect DNS desired resources from enabled redirect route records.
- [x] 7.3 Exclude disabled routes, timestamps outside intent, evidence summaries, cleanup history, attempts, and drift reports from desired-state hashes.
- [x] 7.4 Keep provider credentials, Alchemy secrets, raw lease tokens, and full provider truth outside desired-state responses.

Evidence 2026-06-02 grug:

- Changed `src/worker/deployment-runtime-projection.ts` so primary desired-state projection reads control-plane `route` records, derives enabled exact-host mount routes into Cloudflare Worker custom-domain resources, derives enabled redirect routes into redirect DNS and redirect rule resources, uses display-safe provider config worker names, and keeps the generic desired-resource sync surface aligned with the route-derived graph.
- Excluded disabled/deleted route logical ids from active desired-resource projection so stale synced resources do not affect desired state after route disablement, and kept source fingerprints/hash inputs based on canonical route-derived resources rather than route timestamps, deployment attempts, evidence, drift, cleanup, or provider truth.
- Extended `src/worker/deployment-runtime-api.test.ts` for route-derived source fingerprints, direct route-record projection with provider config, disabled route exclusion, route timestamp hash stability, provider secret omission, Alchemy secret omission, and raw lease-token omission.
- `devstate start`: pass, services running.
- `devstate check`: pass, checks ok and services running.
- Browser smoke: not run; this section changes deployment desired-state API projection and tests, not browser-visible UI.

## 8. Workspace And Archives

- [x] 8.1 Write route intent in deterministic workspace record source as `instance:route` records.
- [x] 8.2 Restore route records from workspace source and instance archives through Authority validation.
- [x] 8.3 Compare workspace and remote route records for app path, exact-host, redirect, and deploy-resource drift.
- [x] 8.4 Reject secret-looking values from route record source, archive payloads, and drift output.

Evidence 2026-06-02 grug:

- Changed `src/site/instance-workspace.ts` so composed workspace control-plane archives preserve non-generated local `route` records, including redirect route source, while regenerating manifest-owned app/domain routes deterministically and validating the composed control-plane source through the portable archive parser before drift or restore.
- Added CLI coverage in `src/site/cli.test.ts` for redirect `instance:route` source records in workspace push archives, redirect drift reported through qualified route record keys, and secret-looking generated route source rejected before drift output.
- Added archive coverage in `src/shared/archive.test.ts` for secret-looking route field values and archive API coverage in `src/worker/archive-api.test.ts` for redirect route records restored through Authority snapshot validation.
- `devstate start`: pass, services running.
- `devstate check`: pass, checks ok and services running.
- Browser smoke: not run; this section changes workspace/archive CLI and archive restore behavior, not browser-visible UI.

## 9. Generated UI

- [ ] 9.1 Replace separate app route, domain mapping, and redirect intent lists with one Routes surface.
- [ ] 9.2 Add route filters or grouping for instance paths, host mappings, public Site routes, redirects, app installs, and provider configs.
- [ ] 9.3 Render mount and redirect edit controls from route kind, target profile, surface, app install, provider config, and redirect fields.
- [ ] 9.4 Render provider evidence, cleanup history, deployment attempts, and drift summaries separately from desired route fields.

## 10. Deploy And Destroy Reconciliation

- [ ] 10.1 Reconcile deploy planning so domain, DNS, and redirect resources are derived from enabled route records.
- [ ] 10.2 Reconcile `formless destroy` and `formless instance destroy` so custom-domain, DNS, and redirect provider resources are derived from enabled route records and selected deploy state.
- [ ] 10.3 Preserve explicit cleanup and destroy workflows for provider mutation after route disablement or deletion.
- [ ] 10.4 Keep route source language aligned with `browser-workspace-control-plane` before deterministic workspace record source is frozen.

## 11. Tests

- [ ] 11.1 Add schema and Authority validation tests for mount routes, redirect routes, conflicts, host normalization, path normalization, and provider config eligibility.
- [ ] 11.2 Add migration tests for app route, domain mapping, redirect intent, provider evidence separation, and conflict blockers.
- [ ] 11.3 Add runtime topology tests for app mounts, schema mounts, public Site mounts, exact-host mounts, redirects, disabled routes, and host-mounted Site route blocking.
- [ ] 11.4 Add deployment projection and desired-state hash tests for route-derived domain, DNS, and redirect resources.
- [ ] 11.5 Add workspace/archive drift tests for `instance:route` records and secret rejection.
- [ ] 11.6 Add generated UI tests for the unified Routes surface and separated provider evidence.
- [ ] 11.7 Add CLI compatibility tests for app install route summaries, domain APIs, deploy planning, destroy planning, and domain command output.
