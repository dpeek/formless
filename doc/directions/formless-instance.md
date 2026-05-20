# Formless Instance Direction

Last updated: 2026-05-20

Purpose: product direction before the first onboarding PRD.

This is not shipped behavior. Shipped behavior lives in `doc/current.md` and
`doc/topics/*.md`.

This is not a backlog. Work starts when a GitHub PRD issue owns the chunk.

## Current Anchors

- Formless is a schema-as-data app runtime. See `CONTEXT.md`.
- Current source app schema keys are `tasks`, `estii`, and `site`. See `doc/topics/schema-runtime.md`.
- Current Authority storage is Durable Object backed and routed by schema key. See `doc/topics/authority-storage-sync.md`.
- Current browser replica is IndexedDB keyed by schema key. See `doc/topics/authority-storage-sync.md`.
- Current Site project CLI supports init, dev, save, deploy setup, and publish. See `doc/topics/site-cli-publish.md`.
- Current Site publish can deploy code/assets and restore source Site data to a remote target. See `doc/topics/site-cli-publish.md`.
- Current generated app shell can mount different runtime profiles. See `doc/topics/generated-ui.md`.

## Direction

Make Formless installable and deployable as one self-owned runtime:

```sh
npm i -g formless
formless onboard
```

`formless onboard` should guide the user through Cloudflare authorization,
account selection, deployment target selection, and first launch.

The first target should be a single `workers.dev` deployment. Custom domains and
subdomains should come later.

The first deployed runtime should be a Formless instance, not only a Site
project. A Formless instance can host multiple installed apps from one UI.

## Draft Vocabulary

- Formless instance: one runtime boundary for apps, data, media, auth, and deploy config.
- Remote instance: a Formless instance deployed to Cloudflare.
- Local instance: a Formless instance running from local durable state.
- App: an installed schema bundle such as Tasks, Site, or Estii.
- Schema key: app storage and route key such as `tasks`, `site`, or `estii`.
- Surface: a route, host, or subdomain that opens a selected instance shell or app profile.
- Main shell: the instance UI for managing apps, settings, and cross-app work.
- App surface: a focused surface for one app, such as Site admin or public Site.
- Owner: the first admin identity created during browser onboarding.
- Instance sync: future data movement between local and remote instances.

Avoid overloading `profile`. Cloudflare and Alchemy already use profile for
credentials. Use `surface`, `runtime profile`, or `deployment target` where that
is the actual meaning.

## Product Shape

The user should be able to create one Formless instance without writing
Cloudflare config by hand.

The CLI should own infrastructure setup:

- authenticate with Cloudflare;
- select account;
- default to a `workers.dev` URL;
- create or update the Worker;
- upload Assets;
- create or bind R2 media storage;
- configure Durable Object storage;
- set deploy metadata;
- create any required bootstrap secret;
- open the deployed instance.

The browser should own product setup:

- create owner identity;
- collect owner name, email, and avatar when needed;
- set initial instance name;
- install or enable starter apps;
- land in the main shell.

## First Slice

First PRD candidate:

`formless onboard` deploys one Cloudflare `workers.dev` Formless instance and
opens it.

Good first-slice constraints:

- one Cloudflare account;
- one Alchemy or Cloudflare credential profile;
- one remote Formless instance;
- `workers.dev` only;
- no custom domain;
- no app marketplace;
- no multi-user roles;
- package-bundled apps only;
- no instance-to-instance sync;
- no local/offline instance UX beyond preserving current local Site workflow.

The first PRD should prove the deployment path and instance boundary. Browser
owner setup can be the next PRD if needed.

## Alchemy And Cloudflare Boundary

Use Alchemy for declared infrastructure resources.

Use direct Cloudflare API reads where the CLI needs product discovery or
preflight checks, such as:

- listing accounts;
- listing zones;
- checking custom domain availability;
- checking existing Worker routes;
- checking existing Worker custom domains;
- warning before taking over a host.

Do not make domain takeover implicit. Existing routes or custom domains should
block by default and require a later explicit adopt or override flow.

Pin the exact Alchemy API in the PRD. The repo currently depends on `alchemy` in
`package.json`, but the implementation should verify the current package API
before committing to a state-store or deploy wrapper shape.

## Local And Offline Direction

Long term, a local Formless instance should be a real instance, not only a cache
or a static project folder.

The user should be able to:

- run Formless locally;
- use it offline;
- keep local data as the primary working copy;
- publish or sync selected changes to a remote instance;
- pull remote changes back when desired.

Current shipped pieces already point in this direction:

- browser replica keeps local IndexedDB copies;
- Site project dev runs a local authority-backed workflow;
- Site publish can push source data to a remote target;
- snapshot export and restore exist for authority storage.

Those pieces are not yet instance sync. Snapshot restore is an authoritative
replace operation, not collaborative bidirectional sync.

Future local/offline work should introduce an instance identity and sync model
before calling it sync.

Likely future concepts:

- stable instance id;
- stable app install id or schema key policy;
- portable local instance state;
- remote connection config;
- change exchange between instances;
- media object exchange;
- conflict detection;
- explicit publish, pull, and sync commands.

The first onboarding PRD should keep this future open by avoiding names like
`remoteOnly`, `siteDeployOnly`, or config fields that assume Cloudflare is the
only source of truth.

## Instance Sync Direction

Instance sync should be designed as data movement between peers with clear
authority rules.

Near term, unidirectional publish is enough:

- local instance to remote instance;
- selected app data first;
- guarded backup before remote mutation;
- clear target deploy metadata.

Later, bidirectional sync can build on:

- change logs;
- sync cursors;
- record tombstones;
- media manifests;
- schema version checks;
- conflict reports.

Do not present bidirectional sync as a simple extension of current snapshot
restore. It needs its own PRD.

## Deferred Scope

Defer:

- custom domains during first onboarding;
- app-specific subdomains;
- multiple remote deployments;
- multiple Cloudflare credential profiles;
- multiple owners;
- admin/editor/viewer roles;
- public signups;
- app marketplace;
- third-party app packages;
- cross-app references;
- bidirectional instance sync;
- local/offline instance UX;
- billing.

## Open Questions

- Does first browser onboarding use passkeys, email/password, admin token, or a one-time setup link?
- Does the first instance install every bundled app or only a default starter set?
- Where does instance config live for the global CLI?
- What is the exact Alchemy state-store API to use for the pinned package version?
- Does the first deploy use Alchemy only, Wrangler only, or Alchemy plus selected Cloudflare API calls?
- How does the instance shell name and expose apps without turning app install into a marketplace?
- What minimum route/domain preflight is required before custom domain work starts?
- What existing local Site workflow should stay untouched during the first instance PRD?

## First PRD Notes

The first PRD should be small and vertical:

- add `formless onboard`;
- authenticate or reuse Cloudflare credentials;
- select account;
- deploy one instance to `workers.dev`;
- output the deployed URL;
- open the browser when requested;
- record local deploy state without storing secrets in project config;
- leave current `formless init`, `formless dev`, `formless save`, and `formless publish` behavior intact.

Promotion notes after the PRD lands should update topic docs with shipped facts.
