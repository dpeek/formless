# Formless Instance Direction

Last updated: 2026-05-26

Purpose: product direction for Formless instance work.

This is not shipped behavior. Shipped behavior lives in `doc/current.md` and
`doc/topics/*.md`.

This is not a backlog. Work starts when a GitHub PRD issue owns the chunk.

## Current Anchors

- Formless is a schema-as-data app runtime. See `CONTEXT.md`.
- Current source app schema keys are `tasks`, `estii`, and `site`. See `doc/topics/schema-runtime.md`.
- Current Authority storage is Durable Object backed and routed by app storage identity. See `doc/topics/authority-storage-sync.md`.
- Current browser replica is IndexedDB keyed by app storage identity. See `doc/topics/authority-storage-sync.md`.
- Current Site project CLI supports init, dev, save, deploy setup, and publish. See `doc/topics/site-cli-publish.md`.
- Current CLI supports `formless onboard` for a Cloudflare `workers.dev` product instance. See `doc/topics/site-cli-publish.md`.
- Current product instance profile uses installed app identity. See `doc/topics/generated-ui.md`.
- Current default product app is installed Site id `site`. See `doc/topics/site-runtime.md`.
- Current portable archives support installed app and instance backup/restore/import. See `doc/topics/site-cli-publish.md`.
- Current `formless instance` workspace commands support claim, pull, check, push, local dev, deploy, and token workflows. See `doc/topics/site-cli-publish.md`.
- Current Site publish can deploy code/assets and restore source Site data to a remote target. See `doc/topics/site-cli-publish.md`.
- Current generated app shell can mount different runtime profiles. See `doc/topics/generated-ui.md`.
- Core instance media direction lives in `doc/directions/instance-media.md`.

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
- Package app key: bundled schema package identity such as Site, Tasks, or Estii.
- App install id: stable instance-local id for one installed app.
- App install: flat instance metadata for package app key, install id, label, status, and routes.
- Schema key: bundled source schema key such as `tasks`, `site`, or `estii`.
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

## Shipped Slices

- `formless onboard` deploys one Cloudflare `workers.dev` Formless instance.
- Owner setup creates the default installed Site id `site`.
- Owner login can mint owner sessions from the configured admin token.
- Product instance route vocabulary is `/`, `/setup`, `/login`, `/apps/<installId>`, and `/sites/<installId>`.
- Development workbench keeps schema-key app routes for package development.
- Product instance profile blocks schema-key API routes.
- Installed app API routes stay available through `/api/app-installs/<packageAppKey>/<installId>`.
- Site, Tasks, and Estii are bundled installable packages.
- Installed app admin routes resolve package metadata from app install records.
- Installed Site public routes remain Site-only.
- Launch fixtures select initial installed app state without adding route shapes.
- Launch fixtures include `mixed-apps` with Site, Tasks, and Estii installed.
- Portable app and instance archives provide backup, restore, and import plumbing.
- Formless instance workspaces provide CLI claim, pull, check, push, local dev, deploy, and token workflows over portable archives.
- Workspace archive movement is explicit backup, restore, and import movement, not bidirectional instance sync.
- Workspace local dev can run a product instance profile from workspace archive state with workspace-local persistence.
- Workspace deploy sets both server and client runtime profile variables for instance builds.
- Owner setup uses `starter-site-if-empty` default app policy.

Current constraints still held:

- one Cloudflare account;
- one Alchemy or Cloudflare credential profile;
- `workers.dev` only;
- no custom domain;
- no app marketplace;
- no multi-user roles;
- package-bundled apps only;
- no instance-to-instance sync;
- no local/offline primary instance workflow beyond workspace-local dev and explicit archive movement.

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
- portable archives can export and restore installed app and instance state;
- instance workspaces can pull, check, push, and run local product instances from archive state;
- snapshot export and restore still exist as lower-level authority storage operations.

Those pieces are not yet instance sync. Archive restore and snapshot restore are
authoritative replace operations, not collaborative bidirectional sync.

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

Future instance work should keep this open by avoiding names like `remoteOnly`,
`siteDeployOnly`, or config fields that assume Cloudflare is the only source of
truth.

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

- custom domains during early instance work;
- app-specific subdomains;
- multiple remote deployments;
- multiple Cloudflare credential profiles;
- multiple owners;
- admin/editor/viewer roles;
- public signups;
- app marketplace;
- third-party app packages;
- cross-app references;
- broad media library and video platform work beyond the first media spine;
- bidirectional instance sync;
- local/offline primary instance workflow;
- billing.

## Open Questions

- What is the exact Alchemy state-store API to use for the pinned package version?
- Does the first deploy use Alchemy only, Wrangler only, or Alchemy plus selected Cloudflare API calls?
- How does core instance media install and expose the Media app without requiring general cross-app references?
- What browser management UI should expose portable archive and workspace operations safely?
- What minimum user and permission model follows first owner sessions?
- What minimum route/domain preflight is required before custom domain work starts?
- What existing local Site workflow should stay untouched during future instance work?
