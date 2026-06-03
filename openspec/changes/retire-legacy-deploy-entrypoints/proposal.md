## Why

After `browser-workspace-control-plane` lands, Formless has one reviewable
source of deploy intent, browser workspace operations, and one generic
deployment path. Keeping standalone Site publish commands and direct domain
fallback commands preserves old product vocabulary and leaves provider mutation
split across parallel entrypoints.
Browser-side local Site publish controls and domain-provider apply APIs carry
the same legacy story even when the CLI surface is cleaned up.

## What Changes

- **BREAKING** Remove standalone Site publish as a normal package workflow.
  `bun run site:publish` no longer deploys Site code or data.
- Remove standalone Site project publish wrappers, local Site publish broker
  code, browser local Site publish controls, and client helpers that invoke
  Site publish outside workspace deploy.
- Preserve `bun run site:pull-seed` as the source Site seed promotion tool.
- Preserve `formless archive import-site` as the explicit migration path for
  legacy standalone Site projects.
- **BREAKING** Remove domain-specific provider apply entrypoints as normal
  mutation paths, including direct local Cloudflare fallback and
  `formless instance domains run-apply`.
- Remove browser/client and Worker domain-provider apply-job mutation surfaces
  that create or poll domain-specific apply jobs.
- Keep provider mutation behind the generic deployment attempt path. Domain,
  DNS, redirect, Worker, R2, and other provider resources are planned and
  applied from control-plane desired resources.
- Keep explicit cleanup and delete workflows for recorded provider evidence
  where generic deployment destroy cannot infer the intended cleanup target.
- Simplify the public CLI surface around top-level workspace commands:
  `formless dev`, `save`, `check`, `deploy`, and `destroy`.
- Keep advanced archive and cleanup commands only where they still expose unique
  behavior not available through workspace deploy or browser workspace
  operations.
- Update CLI help, parser errors, specs, and docs so deploy has one product
  story: workspace source plus control-plane intent feeds deployment.
- Remove retired publish/apply vocabulary from tests, generated UI, client
  protocol helpers, runtime response types, and spec language except where
  historical archives or explicit migration docs require it.
- Treat this change as a follow-up cleanup gate. If
  `browser-workspace-control-plane` already removes some legacy code paths, this
  change should shrink to verification, command rejection, docs, and spec
  promotion for the remaining surface.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `site-cli-publish`: Retire standalone Site publish and simplify public CLI
  deploy command families around workspace deploy.
- `custom-domains`: Remove direct Cloudflare fallback mutation and keep domain
  provider mutation behind generic deployment or explicit evidence cleanup.
- `deployment-runtime`: Establish generic deployment attempts as the only normal
  provider mutation path for control-plane desired resources.
- `generated-ui`: Remove browser local Site publish controls and
  domain-provider apply controls that expose retired mutation paths.

## Impact

- Affected code: `package.json`, `scripts/site-publish.ts`,
  `src/site/publish.ts`, `src/site/project-publish.ts`, `src/site/cli*`,
  `src/site/local-publish-broker.ts`, `src/client/local-publish.ts`,
  `src/app/local-site-publish.tsx`, generated app settings, workspace operation
  helpers, domain provider runners, domain provider client helpers,
  `src/app/routes/instance-shell.tsx`, Worker domain provider apply APIs,
  deployment runtime adapters, CLI tests, Site publish tests, generated UI tests,
  and domain provider API tests.
- Affected APIs and commands: public CLI help, `formless instance domains
plan/apply`, `formless instance domains remote-plan/run-apply`,
  `bun run site:publish`, local Site publish broker routes, browser
  domain-provider apply controls, Worker domain-provider apply job routes, and
  any compatibility errors for removed command shapes.
- Preserved boundaries: `site:pull-seed`, `archive import-site`, portable
  archives, explicit provider cleanup/delete/manual cleanup/forget, non-mutating
  route/domain/deployment inspection where still useful, local secret storage,
  provider credentials, and display-safe deployment evidence.
- Prerequisites: `browser-workspace-control-plane` is shipped or otherwise
  equivalent behavior is present: layout-only `formless.json`, unified
  `instance:route` records, browser/local workspace operations, and
  route-derived desired resources for Worker, R2, DNS, custom domains, and
  redirects are treated as shipped behavior.
