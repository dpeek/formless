## 1. CLI Product Surface

- [ ] 1.1 Update `formless` CLI usage so top-level workspace commands are the normal deploy path.
- [ ] 1.2 Remove domain-specific provider apply commands from public help output.
- [ ] 1.3 Keep archive commands, Site project import, token commands, and explicit cleanup commands where they still expose unique behavior.
- [ ] 1.4 Add parser tests proving removed deploy entrypoints fail before provider, Authority, or filesystem mutation.

## 2. Standalone Site Publish Retirement

- [ ] 2.1 Remove `site:publish` from the normal package script surface.
- [ ] 2.2 Remove or guard `scripts/site-publish.ts` so invocation fails with guidance to use `formless deploy`.
- [ ] 2.3 Retire standalone Site publish workflow code that is no longer imported by package or CLI entrypoints.
- [ ] 2.4 Preserve `site:pull-seed` and update tests proving seed promotion remains source-only.
- [ ] 2.5 Preserve `formless archive import-site` tests for legacy standalone Site project migration.

## 3. Domain Apply Retirement

- [ ] 3.1 Remove direct local Cloudflare domain fallback mutation from CLI command handling.
- [ ] 3.2 Remove domain-specific remote apply mutation as a normal CLI deploy entrypoint.
- [ ] 3.3 Keep non-mutating domain, route, deployment, drift, or provider evidence inspection behavior where supported.
- [ ] 3.4 Keep explicit provider delete, manual cleanup, and evidence cleanup behavior scoped to selected recorded resources.
- [ ] 3.5 Add tests proving removed domain apply commands do not create provider jobs, deployment attempts, or provider mutations.

## 4. Generic Deployment Coverage

- [ ] 4.1 Prove `formless deploy` applies Worker, R2, DNS, custom-domain, and redirect desired resources through generic deployment attempts.
- [ ] 4.2 Prove deployment attempts bind to exact desired-state version, target, idempotency key, and writeback status.
- [ ] 4.3 Prove provider credentials and Alchemy secrets remain outside browser responses, workspace source, portable archives, and command errors.
- [ ] 4.4 Prove cleanup/delete workflows do not mutate route intent or app data.

## 5. Documentation And Spec Promotion

- [ ] 5.1 Update README and package command documentation to remove standalone Site publish and domain apply fallback language.
- [ ] 5.2 Update canonical `site-cli-publish`, `custom-domains`, and `deployment-runtime` specs after implementation.
- [ ] 5.3 Record implementation evidence, decisions, blockers, and promotion notes in this change.

## 6. Verification

- [ ] 6.1 Run `devstate start` before implementation work and fix red status in `./.devstate/status.md`.
- [ ] 6.2 Run `devstate check` after each shipped implementation section and use `./.devstate/status.md` as evidence.
- [ ] 6.3 Smoke changed browser-visible workspace deploy or cleanup behavior with `bun browser ...` when app behavior changes.
