## 1. Schema Model

- [ ] 1.1 Add the `route` entity to the instance control-plane schema using kebab-case field names and qualified boundary name `instance:route`.
- [ ] 1.2 Remove app route, domain mapping, and redirect intent desired-state entities from new control-plane source paths.
- [ ] 1.3 Define route field metadata for enabled state, match host, match path, match prefix, kind, target profile, app install, surface, provider config, redirect fields, and timestamps.
- [ ] 1.4 Update read models and relationships so app installs, provider configs, deployment projection, and generated views reference route records.

## 2. Validation

- [ ] 2.1 Validate normalized exact hosts, hostless route scope, absolute match paths, and optional prefix shape.
- [ ] 2.2 Validate `mount` routes by target profile, required app install target, surface, package capability, and provider config eligibility.
- [ ] 2.3 Validate `redirect` routes by target host or URL, status code, preserve-path policy, preserve-query-string policy, and absence of app-only target fields.
- [ ] 2.4 Reject conflicting enabled routes for the same host scope and path or prefix match.
- [ ] 2.5 Preserve host-mounted public Site blocking for generated admin shell, owner auth, schema-key routes, and installed app admin routes on that host.

## 3. Migration And Backfill

- [ ] 3.1 Backfill existing app route records into hostless mount route records.
- [ ] 3.2 Backfill existing exact-host domain mapping records into host mount route records.
- [ ] 3.3 Backfill existing redirect intent records into redirect route records.
- [ ] 3.4 Preserve provider evidence, cleanup history, deployment attempts, and drift reports outside route records.
- [ ] 3.5 Detect conflicting legacy desired records and report migration blockers before route records become active.

## 4. Runtime Topology

- [ ] 4.1 Resolve installed app admin and schema routes from enabled route records.
- [ ] 4.2 Resolve installed Site public routes from enabled route records.
- [ ] 4.3 Resolve exact-host public Site and app mappings from enabled route records before ordinary host profile behavior.
- [ ] 4.4 Resolve redirect routes with configured status code, target, preserve-path policy, and preserve-query-string policy.
- [ ] 4.5 Add deterministic match ordering for exact host, hostless, exact path, prefix path, redirect, and mount selection.

## 5. App Install Compatibility

- [ ] 5.1 Create default admin, schema, and supported public Site route records when an app install is created.
- [ ] 5.2 Derive existing app install API route summaries from route records.
- [ ] 5.3 Keep create app install request validation compatible while rejecting invalid generated route records before app storage initialization.
- [ ] 5.4 Prove installed app storage identity remains based on app install id, not route path or host.

## 6. Domain API Compatibility

- [ ] 6.1 Adapt existing custom-domain mapping APIs to read and write host mount route records.
- [ ] 6.2 Adapt existing redirect APIs to read and write redirect route records.
- [ ] 6.3 Keep existing domain command and API response shapes compatible where callers still depend on them.
- [ ] 6.4 Keep provider evidence, cleanup, forget, manual cleanup, and delete workflows separate from route writes.

## 7. Deployment Projection

- [ ] 7.1 Project custom-domain and DNS desired resources from enabled host mount route records.
- [ ] 7.2 Project redirect rule and redirect DNS desired resources from enabled redirect route records.
- [ ] 7.3 Exclude disabled routes, timestamps outside intent, evidence summaries, cleanup history, attempts, and drift reports from desired-state hashes.
- [ ] 7.4 Keep provider credentials, Alchemy secrets, raw lease tokens, and full provider truth outside desired-state responses.

## 8. Workspace And Archives

- [ ] 8.1 Write route intent in deterministic workspace record source as `instance:route` records.
- [ ] 8.2 Restore route records from workspace source and instance archives through Authority validation.
- [ ] 8.3 Compare workspace and remote route records for app path, exact-host, redirect, and deploy-resource drift.
- [ ] 8.4 Reject secret-looking values from route record source, archive payloads, and drift output.

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

## 12. Verification And Spec Promotion

- [ ] 12.1 Run `devstate start` before implementation work and fix red status in `./.devstate/status.md`.
- [ ] 12.2 Run `devstate check` after each shipped implementation section and use `./.devstate/status.md` as evidence.
- [ ] 12.3 Smoke changed browser-visible route, domain, and deploy UI with `bun browser ...` when app behavior changes.
- [ ] 12.4 Record implementation evidence, decisions, blockers, and promotion notes in this change.
- [ ] 12.5 Promote shipped facts into `instance-control-plane`, `installed-apps`, `runtime-topology`, `custom-domains`, `deployment-runtime`, `portable-archives`, `generated-ui`, and `site-cli-publish`.
