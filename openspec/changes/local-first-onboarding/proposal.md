## Why

`formless onboard` currently mutates Cloudflare before a user has explored the product or committed to adopting an instance. The first-run flow should create a local Formless workspace that is reviewable, runnable, and deployable later, with the workspace becoming the source of truth for the instance.

## What Changes

- Change `formless onboard` to initialize a local Formless workspace in the current empty directory without Cloudflare account discovery, deployment, remote setup capability creation, or global instance state writes.
- Write the reviewable workspace manifest as `formless.json` and use it as the default CLI discovery file for workspace commands.
- Initialize the local workspace with no installed apps or default app archives; `formless dev` runs the product instance locally and the user installs the first app through the local web UI.
- Promote workspace-local `formless dev`, `formless save`, `formless check`, `formless deploy`, and related commands to the top-level onboarding path while preserving advanced `formless instance ...` operations where needed.
- Make Cloudflare mutation explicit and later: `formless deploy` deploys the workspace to Cloudflare, records display-safe target and deploy intent in `formless.json`, stores materialized provider credential state only under ignored `.formless/`, verifies the deployed runtime, and pushes saved workspace archives.
- **BREAKING** Remove the old standalone single Site project happy path from the CLI: `formless init`, Site-project `formless dev`, Site-project `formless save`, `formless deploy setup`, and `formless publish` no longer define onboarding.
- **BREAKING** Replace legacy workspace manifest names with `formless.json` and do not keep read compatibility for `formless.instance-workspace.json` or `formless-workspace.json`.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `site-cli-publish`: Change CLI command-family requirements from standalone Site project onboarding to local-first Formless workspace onboarding and deployment.
- `portable-archives`: Change workspace requirements so reviewable workspace archives and `formless.json` are the local source of truth, including saving local Authority state back to archives.

## Impact

- CLI parser, usage text, command dispatch, onboarding, workspace init, workspace dev, local web app install flow, workspace save/check/deploy, and tests under `src/site/`.
- Workspace manifest parsing/formatting and file discovery.
- Existing standalone Site project files and docs: `formless.config.json`, `site.records.json`, Site-project deploy setup, and publish paths are removed from the main CLI surface.
- README and OpenSpec specs must describe the new first-run command sequence and the explicit Cloudflare deployment boundary.
