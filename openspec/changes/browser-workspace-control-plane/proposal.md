## Why

`formless.json` currently duplicates instance intent that owners can edit through the admin UI, including app installs, routes, domains, and deployment facts. Moving that intent fully into schema-owned records gives Formless one runtime-editable source of truth and lets local onboarding, save, check, push, and deploy workflows run from the browser instead of requiring the CLI to own workspace mutation.

## What Changes

- **BREAKING** Replace manifest-owned app, route, domain, deploy target, and deployment intent fields with schema-owned control-plane records and deterministic workspace record source.
- **BREAKING** Keep `formless.json` at manifest version `1`, focused on workspace layout and local configuration only, and remove the existing v1 parsing for manifest `apps`, `domains`, targets, default app policy, or deploy intent as source.
- Add a browser-safe local workspace gateway that exposes semantic workspace operations for init, status, save, check, pull, push, deploy planning, deploy apply, and operation progress.
- Let the browser initiate Cloudflare credential setup while the local gateway runs a Formless-owned Alchemy OAuth profile adapter, returns the Cloudflare authorization URL as a display-safe operation event, and stores only profile/account references in browser-visible state.
- Let browser onboarding create the local workspace, install the first app, edit routes/domains/deploy intent, save reviewable source, and run deploy through the local gateway.
- Rework CLI workspace commands to call the same workspace operation layer used by the gateway instead of directly owning the manifest app/domain/deploy source shape.
- Keep provider credentials, local secrets, raw filesystem access, and provider state outside browser-visible schema records and workspace archives.

## Capabilities

### New Capabilities

- `local-workspace-gateway`: Browser-safe local workspace operation API and filesystem boundary for local Formless workspaces.

### Modified Capabilities

- `portable-archives`: Workspace source moves from manifest app/domain/deploy declarations to schema-owned record files and app archives.
- `site-cli-publish`: CLI commands operate on layout-only `formless.json` workspaces and share browser workspace operation behavior.
- `instance-control-plane`: App install, route, domain, and deployment intent records become the canonical workspace and runtime source for browser onboarding.
- `installed-apps`: App install declarations are no longer read from `formless.json` as source; installs are created and restored from control-plane records.
- `deployment-runtime`: Local deploy plan/apply can be driven through the workspace gateway while preserving credential and runner boundaries.
- `runtime-topology`: Workspace gateway routes are available only in local workspace runtime profiles.
- `generated-ui`: Browser instance management surfaces can invoke workspace operations and show local operation state without arbitrary filesystem access.

## Impact

- Affected code: `src/site/instance-workspace*`, `src/site/cli*`, archive workflows, local dev startup, instance control-plane helpers, generated instance shell, worker/local runtime routes, and tests.
- Affected APIs: new local-only workspace operation API; existing CLI command names remain but source semantics change.
- Affected files: `formless.json` schema, workspace record source layout, instance archive composition, app archive paths, ignored `.formless/` state, and deployment secret state.
- Security boundary: browser requests can trigger named workspace operations but cannot read or write arbitrary filesystem paths or receive provider credentials.
