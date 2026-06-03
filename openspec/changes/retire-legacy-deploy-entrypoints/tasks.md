## 0. Follow-Up Readiness Gate

- [ ] 0.1 Verify `browser-workspace-control-plane` or equivalent behavior has landed: layout-only workspace source, browser/local workspace operations, unified `route` records, and generic deployment from route-derived desired resources.
- [ ] 0.2 Prove generic deploy covers Worker, R2, DNS, custom-domain, and redirect desired resources before removing legacy mutation entrypoints.
- [ ] 0.3 Inventory standalone Site publish, standalone project publish, local Site publish broker/client/UI, domain apply, direct fallback, Worker/browser apply-job, and provider cleanup code paths still present after the prerequisite change.
- [ ] 0.4 Shrink this change to remaining command rejection, verification, docs, and spec promotion work when prerequisite implementation already removed legacy paths.

## 1. CLI Product Surface

- [ ] 1.1 Update `formless` CLI usage so top-level workspace commands are the normal deploy path.
- [ ] 1.2 Remove domain-specific provider apply commands from public help output.
- [ ] 1.3 Keep archive commands, Site project import, token commands, and explicit cleanup commands where they still expose unique behavior.
- [ ] 1.4 Add parser tests proving removed deploy entrypoints fail before provider, Authority, or filesystem mutation and are not reused as status aliases.

## 2. Standalone Site Publish Retirement

- [ ] 2.1 Remove `site:publish` from the normal package script surface.
- [ ] 2.2 Remove or guard `scripts/site-publish.ts` so invocation fails with guidance to use `formless deploy`.
- [ ] 2.3 Retire standalone Site publish workflow code that is no longer imported by package or CLI entrypoints.
- [ ] 2.4 Retire standalone Site project publish wrappers and tests while preserving `formless archive import-site` as the legacy project migration path.
- [ ] 2.5 Remove local Site publish broker, browser local publish client helpers, generated app settings publish controls, and tests.
- [ ] 2.6 Preserve `site:pull-seed` and update tests proving seed promotion remains source-only.
- [ ] 2.7 Preserve `formless archive import-site` tests for legacy standalone Site project migration.

## 3. Domain Apply Retirement

- [ ] 3.1 Remove direct local Cloudflare domain fallback mutation from CLI command handling.
- [ ] 3.2 Remove domain-specific remote apply mutation as a normal CLI deploy entrypoint.
- [ ] 3.3 Remove browser/client domain-provider apply controls, apply client helpers, and apply job polling state.
- [ ] 3.4 Remove Worker domain-provider apply job creation/completion APIs as mutation paths.
- [ ] 3.5 Keep non-mutating domain, route, deployment, drift, or provider evidence inspection behavior where supported.
- [ ] 3.6 Keep explicit provider delete, manual cleanup, forget, and evidence cleanup behavior scoped to selected recorded resources.
- [ ] 3.7 Add tests proving removed domain apply commands, browser controls, client helpers, and Worker apply routes do not create provider jobs, deployment attempts, Authority writes, filesystem writes, or provider mutations.

## 4. Legacy Code And Vocabulary Cleanup

- [ ] 4.1 Keep pure domain provider planning helpers only where generic deployment, destroy, inspection, or explicit cleanup still imports them.
- [ ] 4.2 Remove retired publish/apply names from current implementation types, result formatters, client protocol helpers, UI state, docs, and tests except for intentional rejection messages.
- [ ] 4.3 Add an inventory check proving current product-facing code no longer contains `site:publish`, `site-publish`, local publish broker/control names, domain apply fallback names, `run-apply`, or apply-job vocabulary outside retained explicit cleanup/delete, import-site, archive history, or rejection tests.

## 5. Generic Deployment Coverage

- [ ] 5.1 Prove `formless deploy` applies Worker, R2, DNS, custom-domain, and redirect desired resources through generic deployment attempts.
- [ ] 5.2 Prove deployment attempts bind to exact desired-state version, target, idempotency key, and writeback status.
- [ ] 5.3 Prove provider credentials and Alchemy secrets remain outside browser responses, workspace source, portable archives, and command errors.
- [ ] 5.4 Prove cleanup/delete workflows do not mutate route intent or app data.
- [ ] 5.5 Update README and package command documentation to remove standalone Site publish, local Site publish broker/control, domain apply,
