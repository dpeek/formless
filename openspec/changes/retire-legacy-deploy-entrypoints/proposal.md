## Why

After layout-only workspaces and unified route records are in place, Formless has
one reviewable source of deploy intent and one generic deployment path. Keeping
standalone Site publish commands and direct domain fallback commands preserves
old product vocabulary and leaves provider mutation split across parallel
entrypoints.

## What Changes

- **BREAKING** Remove standalone Site publish as a normal package workflow.
  `bun run site:publish` no longer deploys Site code or data.
- Preserve `bun run site:pull-seed` as the source Site seed promotion tool.
- Preserve `formless archive import-site` as the explicit migration path for
  legacy standalone Site projects.
- **BREAKING** Remove domain-specific provider apply entrypoints as normal
  mutation paths, including direct local Cloudflare fallback and
  `formless instance domains run-apply`.
- Keep provider mutation behind the generic deployment attempt path. Domain,
  DNS, redirect, Worker, R2, and other provider resources are planned and
  applied from control-plane desired resources.
- Keep explicit cleanup and delete workflows for recorded provider evidence
  where generic deployment destroy cannot infer the intended cleanup target.
- Simplify the public CLI surface around top-level workspace commands:
  `formless onboard`, `dev`, `save`, `check`, `deploy`, and `destroy`.
- Keep advanced archive and cleanup commands only where they still expose unique
  behavior not available through workspace deploy or browser workspace
  operations.
- Update CLI help, parser errors, specs, and docs so deploy has one product
  story: workspace source plus control-plane intent feeds deployment.

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

## Impact

- Affected code: `package.json`, `scripts/site-publish.ts`,
  `src/site/publish.ts`, `src/site/project-publish.ts`, `src/site/cli*`,
  workspace operation helpers, domain provider runners, deployment runtime
  adapters, CLI tests, and Site publish tests.
- Affected APIs and commands: public CLI help, `formless instance domains
plan/apply`, `bun run site:publish`, and any compatibility errors for removed
  command shapes.
- Preserved boundaries: `site:pull-seed`, `archive import-site`, portable
  archives, explicit provider cleanup/delete, local secret storage, provider
  credentials, and display-safe deployment evidence.
- Prerequisites: layout-only `formless.json`, unified `instance:route` records,
  and route-derived desired resources for Worker, R2, DNS, custom domains, and
  redirects are treated as shipped behavior.
