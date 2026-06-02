## Why

Formless currently stores instance route intent across app route, custom-domain
mapping, and redirect intent records even though all three describe the same
shape: match address, choose behavior, and project a target or provider result.
`browser-workspace-control-plane` is about to freeze deterministic workspace
record source, so route intent should become one control-plane entity before
that source format preserves unnecessary splits.

## What Changes

- **BREAKING** Replace separate desired-state `app-route`, `domain-mapping`,
  and `redirect-intent` control-plane records with one flat `route` entity in
  the instance control-plane schema.
- Add `instance:route` records for instance-path mounts, exact-host public Site
  mounts, and host redirects.
- Keep route writes as desired intent only. They do not mutate provider
  resources, installed app storage, Site page routing, provider evidence,
  cleanup history, drift reports, or full provider truth.
- Make runtime topology resolve enabled `route` records for generated admin
  routes, schema routes, public Site routes, mapped hosts, and redirects.
- Make deployment projection build custom-domain, DNS, and redirect desired
  resources from enabled `route` records plus provider config records.
- Make workspace source and portable archives store route intent as
  `instance:route` records.
- Make generated instance management UI show one Routes surface with filtering
  or grouping for instance paths, host mappings, and redirects.
- Keep existing app install and custom-domain API surfaces as compatibility
  adapters while they read and write `route` records during migration.
- Reconcile `destroy-instance` so destroy derives custom-domain, DNS, and
  redirect provider resources from enabled `instance:route` records instead of
  separate domain or redirect records.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `instance-control-plane`: Add `route` and remove separate app route, domain
  mapping, and redirect intent desired-state entities.
- `installed-apps`: Default install creation creates `route` records for admin,
  schema, and supported public Site surfaces.
- `runtime-topology`: Route resolution reads enabled `route` records for
  instance paths, mapped hosts, public Site mounts, and redirects.
- `custom-domains`: Exact-host mappings and redirects become `route` records
  while provider evidence and cleanup remain separate.
- `deployment-runtime`: Desired provider resources project from enabled route
  records instead of app route, domain mapping, and redirect records.
- `portable-archives`: Workspace and archive control-plane source stores
  `instance:route` records.
- `generated-ui`: Instance management renders one Routes editor instead of
  separate app route, domain mapping, and redirect intent lists.
- `site-cli-publish`: CLI domain, deploy, drift, workspace, and destroy
  workflows read and write route records while preserving command names and
  credential boundaries.

## Impact

- Affected schema contracts: instance control-plane entities, references,
  validation, route read models, generated views, actions, workspace record
  source, archives, desired-state projection, and drift reporting.
- Affected runtime behavior: instance-path app mounts, schema mounts, public
  Site mounts, exact-host mappings, redirects, host-level route blocking, and
  deployment/destroy resource derivation.
- Affected compatibility surfaces: app install APIs can continue to return
  route summaries, and custom-domain APIs can continue to expose mapping and
  redirect shapes while delegating to `instance:route`.
- Boundaries preserved: flat records, app install id storage identity, installed
  app data separation, explicit provider apply/delete/destroy workflows, and
  secret-free browser/workspace/archive responses.
- No runtime code is implemented by this proposal.
