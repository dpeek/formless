## Why

Instance-owned configuration is spreading across custom SQLite tables and
hand-built UI: app installs, app routes, custom domains, and deployment intent
all behave like flat runtime data but sit beside the Formless schema model.
Modeling this state as schema-owned control-plane records keeps Formless
source-faithful and gives the same entities, views, actions, editor surfaces,
archives, and CLI protocols to instance management data.

## What Changes

- Add a schema-owned instance control-plane capability for app installs, app
  routes, domain mappings, deployment targets, provider config references,
  desired resources, attempts, evidence summaries, and drift reports.
- Represent app installs as `appInstall` records with immutable install
  identity and editable user-facing metadata such as label.
- Represent route bindings as `appRoute` records that reference an `appInstall`
  record, so admin, schema, public Site, and future custom app routes point to
  the app entity instead of duplicating install ids.
- Keep installed app data scoped to each install's existing app storage
  identity; control-plane records describe the install and routes, not the
  installed app's records.
- Move user-authored deployment configuration and desired resource intent toward
  schema entities while keeping provider secrets, Alchemy state, object bytes,
  raw lease tokens, and full provider resource truth outside app records.
- Extend schema actions enough for owner/admin editors, CLI deployers, and
  runners to query instance records and invoke exact-version deployment
  commands without receiving secrets.
- Provide generated editor surfaces for app installs, routes, domains, and
  deployment records that match current table-driven behavior while adding
  schema validation, immutable identity fields, route conflict feedback, and
  read-only history views.
- Treat the deployment runtime desired-state graph as a projection over
  schema-owned control-plane intent records instead of the owner of user intent.
- Package deployment contracts as a vertical slice under `lib/deploy`, including
  schema definitions, shared projection helpers, client/CLI protocol helpers,
  and generated UI metadata.
- Keep current app install, custom-domain, deployment-runtime, archive, and CLI
  APIs compatible during migration; no command removal in this change.

## Capabilities

### New Capabilities

- `instance-control-plane`: Schema-owned instance management records for app
  installs, app routes, deployment intent, editor contracts, protocol access,
  and control-plane projection boundaries.

### Modified Capabilities

- `installed-apps`: App installs and install route metadata become
  schema-owned control-plane records while preserving stable install-scoped
  storage and API identity.
- `runtime-topology`: Installed app and public Site route resolution can read
  enabled app route records that reference app install records.
- `deployment-runtime`: Desired-state projection reads schema-owned
  control-plane intent while preserving exact version, attempt, lease, evidence,
  drift, and no-secret runtime contracts.
- `app-schema`: Add schema contracts needed for runtime-owned control-plane
  schemas, immutable identity fields, privileged action exposure, append-only
  history records, and secret references.
- `authority-storage`: Add instance control-plane app storage semantics while
  keeping installed app data, provider secrets, and provider resource truth
  outside control-plane records.
- `generated-ui`: Expose app install, route, domain, and deployment
  configuration through generated instance UI from schema-owned entities and
  actions.
- `site-cli-publish`: Let CLI instance workflows query schema-owned app install,
  route, and deployment records and invoke deployment actions through the
  instance protocol.
- `custom-domains`: Re-home domain mappings and redirect intent as control-plane
  records while preserving existing route semantics and compatibility surfaces.
- `package-slices`: Define deployment as a vertical package slice that owns
  schema, shared model helpers, UI metadata, and CLI/runtime adapters.
- `portable-archives`: Represent schema-owned app install, route, and
  deployment intent in instance archives and workspaces without storing secrets
  or provider truth.

## Impact

- Affects instance metadata storage, app install reads/writes, route resolution,
  deployment-runtime projection inputs, custom-domain intent reads/writes,
  generated instance management UI, archive/workspace flows, and Site CLI target
  helpers.
- Adds or expands schema/action protocol support for owner, admin, CLI deployer,
  and runner actors.
- Requires migration from existing `app_installs`, custom-domain, and
  deployment-runtime tables to schema-owned control-plane records, with
  compatibility reads during rollout.
- Does not put installed app records, provider API tokens, Alchemy passwords,
  Alchemy state tokens, raw lease tokens, or canonical provider resource JSON
  into control-plane records, browser clients, portable archives, or workspace
  manifests.
