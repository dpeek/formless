# PRD 37: Single Site project and CLI loop

Status: ready
Current chunk: SSP-05
Last updated: 2026-05-15

Start after PRD 31, PRD 34, PRD 35, and PRD 36 shipped behavior is stable on the active branch.

## Goal

Make Formless usable for one personal website without asking the user to understand the multi-app development shell.

The first version should:

- make `site` the only runnable app in the user-facing flow;
- keep the internal `site` schema key and schema-keyed APIs;
- add a single-Site authoring runtime profile with admin and public preview routes;
- package a small project format that stores Site records and source media outside the Formless repo;
- expose `npx formless init`, `npx formless dev`, `npx formless save`, and `npx formless publish`;
- make deployment configuration remove manual env toggling from the normal publish path;
- prove the flow by migrating one real personal site.

This PRD owns the single-Site project and CLI loop.
It does not own arbitrary schema packaging, a schema marketplace, multi-tenant hosting, production login, or a general CMS product.

## Problem Statement

Formless can now author and publish a personal Site, but the loop is still repo-shaped.

Current behavior:

- the normal dev loop runs the multi-app shell with Tasks, Estii, and Site;
- `site` is one schema key among several source apps;
- the generated Site admin lives at `/site`;
- local public preview lives at `/pages/*`;
- published Site pages live at top-level paths only in `publishedSite` runtime profile;
- Site source data lives in repo paths such as `schema/apps/site/seed-records.json`;
- source media sidecars live under `schema/apps/site/media/`;
- saving authored data uses `bun run site:pull-seed`;
- publishing uses `bun run site:publish --apply` plus deployment-specific environment;
- production authoring writes are protected by `FORMLESS_ADMIN_TOKEN`, but there is no product auth UI;
- deploy and publish details are still operator knowledge.

That is workable for the runtime author, but too much ceremony for another person who just wants a personal website.

The first real onboarding target is a single personal Site for the author's brother.
The author is willing to migrate the initial content, but after that the project should have a narrow, repeatable loop:

1. create or open a Formless Site project;
2. run a local editor and preview;
3. save reviewed records and media to source files;
4. publish to Cloudflare with one configured command.

## Solution

Add a Site-focused product path over the existing runtime.

The internal runtime should stay schema-keyed:

- `site` remains the schema key;
- `/api/site/*` remains the API surface;
- the Authority remains the source of local edited state;
- the browser replica remains local-first but not authoritative;
- Site records stay flat `block` and `blockPlacement` records;
- media stays in image block `href` fields and source media sidecars.

The user-facing project should not expose the multi-app shell.
Add a single-Site authoring profile:

- public preview at `/`;
- generated Site admin at `/admin`;
- generated Site admin screen routes under `/admin`;
- optional developer schema route under `/admin/schema` only when explicitly enabled;
- no Tasks or Estii navigation;
- no route prefix required for the public Site preview;
- no generated admin shell on published public routes.

Add a project format:

```txt
my-site/
  formless.config.json
  site.records.json
  media/
    site/
      images/
        ...
```

The first slice treats the Site schema as package-owned.
The project owns records, source media, and deploy config.

Add a CLI:

```sh
npx formless init my-site
cd my-site
npx formless dev
npx formless save
npx formless publish
```

The CLI should reuse the existing Site source seed, source media, snapshot, publish, SSR, and admin guard modules where possible.
It should hide repo-only command names such as `site:pull-seed`, `site:publish`, runtime profile env vars, and seed-record paths.

## Source Map

Existing anchors:

- Current runtime docs: `doc/current.md`.
- Release target docs: `doc/roadmap.md`.
- Runtime profile PRD: `prd/17-runtime-profiles-and-screen-routes.md`.
- Site publish workflow PRD: `prd/26-site-editing-publish-workflow.md`.
- Site media upload PRD: `prd/31-site-media-upload.md`.
- Public Site SSR PRD: `prd/34-public-site-ssr.md`.
- Site regular pages/list PRD: `prd/35-site-regular-pages-and-content-lists.md`.
- Site slotted media/editorial blocks PRD: `prd/36-site-slotted-media-and-editorial-blocks.md`.
- Runtime profile resolver: `src/app/runtime-profile.ts`.
- App route shell: `src/app.tsx`.
- Generated Home route: `src/app/routes/home.tsx`.
- Generated schema route: `src/app/routes/schema.tsx`.
- Public Site route: `src/app/routes/site-page.tsx`.
- Public Site renderer: `src/app/site-renderer/renderer.tsx`.
- Public Site SSR worker path: `src/worker/site-ssr.tsx`.
- Worker routing: `src/worker/routing.ts`.
- Worker dispatch: `src/worker/index.ts`.
- Site tree projection: `src/site/tree.ts`.
- Site source snapshot builder: `src/site/source-snapshot.ts`.
- Site seed promotion adapter: `src/site/seed-promotion.ts`.
- Site source media adapter: `src/site/source-media.ts`.
- Site publish orchestration: `src/site/publish.ts`.
- Existing repo scripts: `scripts/site-pull-seed.ts`, `scripts/site-publish.ts`.
- Site source schema: `schema/apps/site/schema.json`.
- Site source records: `schema/apps/site/seed-records.json`.
- Site source media: `schema/apps/site/media/`.
- Package scripts: `package.json`.
- Worker deploy config: `wrangler.jsonc`.

Owned files:

- `prd/37-single-site-project-cli-loop.md`.

Likely changed files:

- `src/app/runtime-profile.ts`.
- `src/app.tsx`.
- `src/app/routes/home.tsx`.
- `src/app/routes/schema.tsx`.
- `src/app/routes/site-page.tsx`.
- `src/worker/routing.ts`.
- `src/worker/index.ts`.
- `src/worker/site-ssr.tsx`.
- `src/site/project-source.ts`.
- `src/site/project-config.ts`.
- `src/site/publish.ts`.
- `src/site/seed-promotion.ts`.
- `src/site/source-media.ts`.
- `scripts/`.
- `package.json`.
- `wrangler.jsonc` only if package or deploy config needs a new build shape.
- Tests near changed modules.

Possible changed files:

- `schema/apps/site/seed-records.json` only for starter project seed cleanup.
- `schema/apps/site/media/` only for starter media cleanup.
- `doc/current.md` and `doc/roadmap.md` only in a later docs steward pass.

## User Stories

1. As a new Site owner, I want to create a Formless Site project with one command, so that I can start without cloning the Formless repo.
2. As a new Site owner, I want the generated project to contain readable content files, so that I can review what will publish.
3. As a new Site owner, I want to run a local editor with one command, so that I can edit and preview the Site.
4. As a new Site owner, I want the local browser to open the public Site at `/`, so that preview looks like the published Site.
5. As a new Site owner, I want the local admin at `/admin`, so that authoring is easy to find.
6. As a new Site owner, I do not want to see Tasks or Estii, so that the product feels like a Site tool.
7. As a new Site owner, I do not want to understand schema keys, so that I can focus on content.
8. As a new Site owner, I do not want to understand Durable Objects, so that publishing feels like a normal website flow.
9. As a new Site owner, I want images to work in local preview and publish, so that my Site can include real media.
10. As a new Site owner, I want saved media to live beside the project files, so that the project is portable.
11. As a new Site owner, I want to save local edits back to source files, so that the project can be versioned.
12. As a new Site owner, I want save output to be deterministic, so that source diffs are reviewable.
13. As a new Site owner, I want publish to deploy code, media, and records in the correct order, so that one command updates the live Site.
14. As a new Site owner, I want publish to back up the live Site before replacing data, so that mistakes are recoverable.
15. As a new Site owner, I want publish failures to show what happened and where the backup is, so that I can recover.
16. As a new Site owner, I want deployment details remembered after setup, so that I do not edit env files before every publish.
17. As a new Site owner, I want secrets kept out of committed project files, so that the project can be shared safely.
18. As a new Site owner, I want the public Site to be SSR-rendered after publish, so that visitors see content quickly.
19. As a new Site owner, I want missing pages to render normal public not-found pages, so that broken links are readable.
20. As a Site author, I want local preview to update after admin edits, so that I can keep editor and preview side by side.
21. As a Site author, I want post and project lists to keep using Site records, so that content created in admin renders publicly.
22. As a Site author, I want slotted media to keep working in the project flow, so that primary post and project images publish.
23. As a Site author, I want feature blocks to keep working in the project flow, so that migrated pages can use editorial layouts.
24. As a Site author, I want internal links to publish as clean top-level links, so that navigation matches a normal website.
25. As a Site author, I want the admin route to stay local in the first slice, so that production does not need a login product yet.
26. As a Site author, I want an optional local admin publish action later, so that publishing can become one button after CLI publish is stable.
27. As a runtime developer, I want the `site` schema key to remain internal, so that Authority, sync, and API code stay stable.
28. As a runtime developer, I want the single-Site profile to reuse runtime profile routing, so that route behavior stays explicit.
29. As a runtime developer, I want project source loading isolated in one module, so that repo source files and user project files do not fork the runtime.
30. As a runtime developer, I want project save to reuse snapshot export, so that the Authority remains the edited source of truth.
31. As a runtime developer, I want project publish to reuse source snapshot restore, so that data publish stays compatible with existing safety checks.
32. As a runtime developer, I want CLI commands to share parser and planner modules with tests, so that command behavior is not trapped in process code.
33. As a runtime developer, I want deploy setup to separate secrets from non-secret config, so that checked-in config stays safe.
34. As a runtime developer, I want package-owned starter schema and records, so that the first release does not need arbitrary app schema loading.
35. As a runtime developer, I want room for custom schemas later, so that this Site product path does not block the larger Formless runtime.
36. As the author migrating a real Site, I want a concrete import playbook, so that the first migrated Site proves the project model.
37. As the author's brother, I want the first version built for me, so that I can start from migrated content instead of a blank tool.
38. As the author's brother, I want to make small content edits locally, so that maintenance does not require a developer.
39. As the author's brother, I want the published Site to be a normal Cloudflare-hosted site, so that I can use normal domains later.
40. As the author's brother, I want no Formless branding or workbench chrome on the public Site, so that it feels like my own website.

## Requirements

### Single-Site Runtime Profile

- Add a runtime profile for local Site authoring.
- The profile runs exactly one world.
- The world uses schema key `site`.
- The world uses generated Site admin routes.
- The world uses public Site preview routes.
- The public preview root is `/`.
- Public preview nested routes are top-level page slugs.
- The generated admin root is `/admin`.
- Generated admin screen routes mount under `/admin`.
- Generated admin schema route is hidden by default.
- A developer option may expose schema editing at `/admin/schema`.
- The profile does not mount Tasks.
- The profile does not mount Estii.
- The profile does not show multi-app navigation.
- The profile does not expose dev reset controls unless explicitly enabled.
- Generated admin writes still use `/api/site/mutations` and `/api/site/actions`.
- Public preview reads still use `/api/site/tree/:slug`.
- Local public preview can live-update from Site writes.
- Published visitors do not use this authoring profile.

### Project Source Format

- A Formless Site project has a root `formless.config.json`.
- A Formless Site project has a root Site records file.
- The first records file name is `site.records.json`.
- The records file stores active Site records close to `StoredRecord` shape.
- The records file does not store change rows.
- The records file does not store action replay rows.
- The records file does not store read-model output.
- The records file omits tombstoned records by default.
- The records file preserves record IDs.
- The records file preserves `createdAt`.
- The records file uses deterministic formatting and order.
- Source media files live under project `media/`.
- Source media paths mirror the same-origin media key after `/api/site/media/`.
- External image URLs stay record-only.
- Data URL images stay record-only.
- The first project format uses the package-owned Site schema.
- The project format includes a version field.
- Unknown future project format versions fail with a clear error.
- Project config stores non-secret deploy details only.
- Project config does not store `FORMLESS_ADMIN_TOKEN`.
- Project config does not store Cloudflare API tokens.

### CLI Init

- `npx formless init <dir>` creates a new Site project.
- Init fails when the target directory contains conflicting files.
- Init can create the target directory when it does not exist.
- Init writes `formless.config.json`.
- Init writes `site.records.json`.
- Init writes starter media files when the starter records reference source media.
- Init uses the package-owned Site schema.
- Init should support a minimal starter template.
- Init may later support named starter templates.
- Init output tells the user the next command to run.
- Init does not require Cloudflare credentials.

### CLI Dev

- `npx formless dev` runs the local Site authoring profile.
- Dev reads project config from the current directory or an explicit `--project` path.
- Dev loads project `site.records.json` as the source seed.
- Dev loads project `media/` as source media.
- Dev starts a local Worker and browser app with Site authoring routes.
- Dev prints the local public preview URL.
- Dev prints the local admin URL.
- Dev keeps local Authority storage separate per project.
- Dev should not reuse one browser local DB across unrelated Site projects unless the project identity is part of the local DB key.
- Dev keeps local writes no-token by default.
- Dev does not require deploy setup.
- Dev supports a clean reset from project source records.
- Dev can report when local authority state differs from project source.

### CLI Save

- `npx formless save` promotes local Authority state into project source files.
- Save fetches the local Site authority snapshot.
- Save writes `site.records.json`.
- Save writes referenced same-origin media files under project `media/`.
- Save validates the snapshot schema key is `site`.
- Save validates records against the package-owned Site schema.
- Save preserves IDs and `createdAt`.
- Save writes deterministic output.
- Save supports `--check`.
- Save check exits non-zero when records or media are stale.
- Save does not mutate the local Authority.
- Save does not read browser IndexedDB directly.
- Save does not publish anything.

### Deploy Setup

- `npx formless deploy setup` records publish configuration.
- Setup can configure a Cloudflare Worker name.
- Setup can configure a Cloudflare account or use Wrangler defaults.
- Setup can configure the live publish target URL.
- Setup can configure the R2 bucket name for Site media.
- Setup can create or verify the R2 bucket when credentials are available.
- Setup can create or update the Worker secret for `FORMLESS_ADMIN_TOKEN`.
- Setup generates an admin token when the user does not provide one.
- Setup stores non-secret deployment config in project config.
- Setup stores local secrets in an ignored local env file or delegates to Wrangler secrets.
- Setup does not require editing `.env` by hand.
- Setup does not require manually setting `VITE_FORMLESS_RUNTIME_PROFILE`.
- Setup sets the deployed server runtime profile to `publishedSite`.
- Setup output states which files changed and which secrets were stored externally.

### CLI Publish

- `npx formless publish` is the normal publish command after setup.
- Publish builds the package in published Site mode.
- Publish deploys the Worker and assets.
- Publish restores source media before data restore.
- Publish builds a Site source snapshot from the package-owned Site schema and project records.
- Publish backs up the live Site snapshot before restore.
- Publish stores backups under an ignored project backup directory unless overridden.
- Publish restores live Site data through guarded snapshot restore.
- Publish sends the configured admin bearer token for protected writes.
- Publish smokes the live public root after restore.
- Publish smokes at least one nested public route when records contain one.
- Publish prints the live URL after success.
- Publish reports backup paths when data publish fails after backup.
- Publish supports `--dry-run`.
- Publish supports non-interactive `--yes` for CI or scripted use.
- In an interactive terminal, `npx formless publish` may ask for confirmation before mutating live data.
- Publish does not require uncommenting env variables.
- Publish does not require the user to know `bun run site:publish --apply`.

### Local Admin Publish Action

- The first reliable publish path is CLI.
- A later local admin publish action can call the same publish planner.
- The local admin publish action must not require storing Cloudflare secrets in browser storage.
- The local admin publish action should run only when the local CLI dev server can broker the operation.
- A hosted production admin publish action is out of scope for this PRD.

### Brother Site Migration

- The first migrated Site should use the same project format as generated Site projects.
- Migration starts from existing content supplied by the author.
- Pages become Site `page` blocks.
- Posts become Site `post` blocks with publish dates.
- Projects become Site `project` blocks with publish dates where list visibility is desired.
- Markdown content becomes markdown or feature blocks.
- Images become image blocks plus source media files where possible.
- Navigation becomes internal and external link blocks.
- Composition uses `blockPlacement`.
- Primary images use `blockPlacement.slot = "primaryImage"`.
- Feature media uses `blockPlacement.slot = "media"`.
- Feature actions use `blockPlacement.slot = "actions"`.
- Migration should prefer authored records over custom code.
- Migration should not add brother-specific behavior to the runtime.
- Private content should not be committed unless the author explicitly asks.
- The migration smoke should prove init, dev, save check, and publish dry-run against the migrated project.

### Future Fit

- The project format should leave room for custom schemas later.
- The CLI should leave room for multiple Formless project kinds later.
- The runtime profile should leave room for production admin routes later, but must not expose them now.
- The project source adapter should leave room for migrations between Site schema versions.
- Deploy setup should leave room for custom domains later.
- Publish should leave room for active cache purge later.
- The Site authoring profile should leave room for preview-only draft behavior later.

## Implementation Decisions

| ID      | Decision                                                                                      | Reason                                                                                    | Evidence                                             |
| ------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| SSP-D1  | Keep `site` as the internal schema key.                                                       | Authority, sync, browser replica, and API routes already depend on schema-key isolation.  | PRD 17, `src/shared/schema-apps.ts`                  |
| SSP-D2  | Add a Site authoring profile instead of removing the dev shell.                               | Repo development still needs multi-app routes; users need a separate product shell.       | PRD 17 runtime profile seam                          |
| SSP-D3  | Use `/` for local public preview in the Site project flow.                                    | Local preview should match published route shape.                                         | PRD 34 published Site top-level route behavior       |
| SSP-D4  | Use `/admin` for local generated Site authoring.                                              | It is recognizable and avoids exposing the schema key in user-facing paths.               | Current `/site` admin route is dev-shell terminology |
| SSP-D5  | Keep `/api/site/*` as the internal API surface.                                               | Changing browser route shape should not churn Authority, storage, sync, or media paths.   | PRD 17 and PRD 26                                    |
| SSP-D6  | Keep the first project format Site-specific.                                                  | Onboarding one personal website does not require arbitrary schema packaging.              | Roadmap excludes app marketplace/import-export       |
| SSP-D7  | Make the Site schema package-owned in the first slice.                                        | It avoids schema migration and compatibility work before the Site product path is proven. | Existing Site schema under `schema/apps/site`        |
| SSP-D8  | Store user records in `site.records.json`.                                                    | The user project should own content as a reviewable JSON source artifact.                 | PRD 26 seed promotion contract                       |
| SSP-D9  | Store source media under project `media/`.                                                    | R2-backed media needs source bytes for repeatable publish.                                | PRD 31 source media sidecar follow-up                |
| SSP-D10 | Save from the Authority snapshot, not browser IndexedDB.                                      | The Authority is authoritative; browser storage is a local replica.                       | PRD 15 and PRD 26                                    |
| SSP-D11 | Reuse source snapshot restore for publish.                                                    | Existing publish safety already validates, backs up, restores, and smokes data.           | `src/site/publish.ts`, PRD 26                        |
| SSP-D12 | Treat `npx formless publish` as the user-facing one-command action.                           | The user should not toggle env vars or remember repo script flags.                        | User direction 2026-05-15                            |
| SSP-D13 | Keep production admin UI out of the first slice.                                              | Production auth and hosted secret handling are separate product problems.                 | Roadmap excludes users and permissions               |
| SSP-D14 | Allow a local admin publish action only after CLI publish is stable.                          | Browser-only admin cannot safely own Cloudflare secrets.                                  | Existing `FORMLESS_ADMIN_TOKEN` admin guard behavior |
| SSP-D15 | Prove the flow with one real migrated Site project.                                           | The first target is a specific personal website, and migration will expose product gaps.  | User direction 2026-05-15                            |
| SSP-D16 | Use `siteAuthoring` as the local single-Site runtime profile kind.                            | It keeps the profile explicit while reusing generated app chrome for `/admin`.            | `src/app/runtime-profile.ts`                         |
| SSP-D17 | Keep project format v1 fixed to Site records and media paths.                                 | The first project format should be predictable before custom schema or path support.      | `src/site/project-config.ts`                         |
| SSP-D18 | Parse project records against the package-owned Site schema.                                  | User project records must stay compatible with the shipped Site runtime and publish path. | `src/site/project-source.ts`                         |
| SSP-D19 | Load project dev data by restoring project records and media after the local server is ready. | The Worker stays package-owned and does not need filesystem reads for user project files. | `src/site/cli.ts`                                    |
| SSP-D20 | Scope browser DB and broadcast names with the Site project identity when present.             | Two local Site projects should not share one browser replica namespace.                   | `src/client/db.ts`, `src/client/broadcast.ts`        |

### Deep Modules

- **Site project source adapter:** reads and writes project records and source media through a small API independent of repo paths.
- **Site project config parser:** parses `formless.config.json`, validates version and deploy config, and keeps secrets out of checked-in files.
- **Single Site runtime profile:** maps one `site` world to `/` preview and `/admin` authoring while preserving schema-keyed APIs.
- **CLI command planner:** parses `init`, `dev`, `save`, `deploy setup`, and `publish` commands into testable operations.
- **Project publish adapter:** adapts existing Site publish orchestration from repo source paths to project source paths.
- **Migration playbook:** maps external personal-site content into flat Site records, placements, and media sidecars.

## Testing Decisions

- Test runtime profile route behavior through app-level rendered routes.
- Test Worker document routing for Site authoring profile separately from published Site profile.
- Test `/` local preview does not render generated admin chrome.
- Test `/admin` renders generated Site admin and submits writes to schema key `site`.
- Test Site authoring profile does not mount Tasks or Estii routes.
- Test project config parsing with valid config, unknown version, missing records, and forbidden secret fields.
- Test project source adapter output determinism.
- Test project source adapter media path mapping.
- Test save check detects stale records and stale media.
- Test CLI argument parsing without spawning long-running servers.
- Test CLI command planning separately from process entrypoints.
- Test publish planning with fake dependencies before invoking Wrangler.
- Test publish applies media restore before snapshot restore.
- Test publish forwards admin bearer auth when configured.
- Test init creates the expected files in a temp directory.
- Browser smoke should open `/` and `/admin` under the Site authoring profile after runtime behavior changes.
- Browser smoke should verify public preview updates after a local admin edit.
- Browser smoke should be skipped for PRD-only or parser-only chunks.
- Use `devstate check` as final check evidence.
- Do not run raw `bun test`, `bun check`, `vp test`, or `vp check` manually during normal agent work.

## Chunks

| ID     | Status  | Depends on | Main files                              | Acceptance                                                                                                       |
| ------ | ------- | ---------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| SSP-01 | shipped | none       | PRD                                     | PRD captures scope, decisions, chunks, blockers, and promote notes.                                              |
| SSP-02 | shipped | SSP-01     | runtime profile, app routes, worker     | Site authoring profile mounts `/` preview and `/admin` generated admin with no multi-app shell.                  |
| SSP-03 | shipped | SSP-02     | project source/config modules, tests    | Project records, media, and config parse/write deterministically and validate against package-owned Site schema. |
| SSP-04 | shipped | SSP-03     | CLI init/dev/save, package entry, tests | `npx formless init`, `dev`, and `save` work against a Site project without repo-specific paths.                  |
| SSP-05 | ready   | SSP-04     | CLI deploy setup/publish, publish tests | `npx formless publish` deploys code, media, and records from project config without manual env toggles.          |
| SSP-06 | pending | SSP-05     | local admin publish action, tests       | Local admin can trigger the configured publish flow only through the local CLI broker.                           |
| SSP-07 | pending | SSP-05     | migration project, smoke notes, PRD     | Brother-site migration proves init/dev/save/publish dry-run with real content and records follow Site schema.    |

## Out of Scope

- Do not support arbitrary user-defined schemas in the first slice.
- Do not build a schema marketplace.
- Do not build a general import/export UI.
- Do not add multi-tenant account routing.
- Do not add users, sessions, or production admin login.
- Do not expose hosted production authoring routes.
- Do not add custom domain setup unless it falls out trivially from Cloudflare config.
- Do not add project-level schema editing in the normal user flow.
- Do not change the flat Site record model.
- Do not change the public Site tree protocol.
- Do not add a media library, media search, transforms, or garbage collection.
- Do not add active cache purge unless publish needs it for correctness.
- Do not require the user to install Bun for the product CLI unless no Node-compatible packaging path exists.
- Do not commit private migrated content without explicit author approval.

## Dependencies

| Workstream | Type     | Need                                                                                 |
| ---------- | -------- | ------------------------------------------------------------------------------------ |
| PRD 17     | upstream | Runtime profile seam, schema-keyed worlds, app and published Site profile behavior.  |
| PRD 26     | upstream | Site preview sync, source seed promotion, source snapshot, guarded publish workflow. |
| PRD 31     | upstream | Site image upload, source media sidecars, guarded media restore.                     |
| PRD 34     | upstream | Published Site SSR, Worker route classification, published profile handoff.          |
| PRD 35     | upstream | Regular Blog/Projects pages, list blocks, public navigation behavior.                |
| PRD 36     | upstream | Placement slots, primary images, feature blocks.                                     |

## Blockers

- Package boundary is first-slice only: the package bin points at a Bun TypeScript entrypoint, so npm/Node packaging still needs hardening before external release.
- Secrets storage for `npx formless deploy setup` needs a concrete policy before implementation.

## Promote after ship

- `doc/current.md`: note the Site authoring runtime profile and its `/` and `/admin` route shape.
- `doc/current.md`: note Formless Site project source files: `formless.config.json`, `site.records.json`, and `media/`.
- `doc/current.md`: note `npx formless init`, `npx formless dev`, and `npx formless save`.
- `doc/current.md`: note `npx formless publish` after SSP-05 ships.
- `doc/current.md`: note project publish backs up live data, restores media before records, and uses guarded snapshot restore.
- `doc/roadmap.md`: replace repo-shaped Site authoring/publish language with the first-release single-Site project loop if this becomes release scope.
- `AGENTS.md`: add CLI command summary only after these commands become standard agent procedure.

## Evidence

- 2026-05-15: User asked what is needed to set up another person with a Formless personal website.
- 2026-05-15: Discussion concluded the next product slice should hide the multi-app shell and expose a single Site project/CLI loop.
- 2026-05-15: Repo inspection found existing support for runtime profiles, Site admin, public preview, source seed promotion, guarded publish, media source sidecars, published Site SSR, regular pages/lists, and slotted media.
- 2026-05-15: PRD created as `prd/37-single-site-project-cli-loop.md`.
- 2026-05-15: `devstate start` reported checks ok, web ready at `https://formless.local`, and watcher tests passing.
- 2026-05-15: SSP-02 shipped `siteAuthoring` runtime profile. App route tests cover `/` authoring preview, top-level authoring slugs, `/admin` generated Site admin without workbench chrome, hidden `/admin/schema` by default, and optional `/admin/schema` exposure through the profile factory.
- 2026-05-15: SSP-02 route/link tests cover authoring top-level Site links and live preview sync behavior while keeping `/api/site/*` unchanged.
- 2026-05-15: SSP-02 `devstate check` reported checks ok, web ready at `https://37-single-site-project-cli-loop.formless.local`, and watcher tests passing.
- 2026-05-15: SSP-02 browser smoke opened `https://37-single-site-project-cli-loop.formless.local/pages/home` and `/site`; both rendered and `bun browser --session ssp-02 errors` returned no page errors. Direct `site-authoring.*.formless.local` smoke was not possible because the hostname did not resolve in this devstate environment.
- 2026-05-15: SSP-03 shipped `src/site/project-config.ts` and `src/site/project-source.ts`. Config parsing fixes project format v1 to Site, `site.records.json`, and `media`; rejects checked-in secret fields; and formats deterministically. Source parsing validates records against the package-owned Site schema, omits tombstones from snapshot promotion, formats deterministic records, and maps same-origin Site media to project `media/` paths.
- 2026-05-15: SSP-03 tests added `src/site/project-config.test.ts` and `src/site/project-source.test.ts`. `devstate check` reported checks ok and watcher tests passing. Requested `tmp/devstate.json`, `tmp/test.txt`, and `tmp/check.txt` were absent in this devstate environment, so `.devstate/status.md`, `.devstate/logs/check-vite.txt`, and `.devstate/logs/service-test.txt` were used as check evidence.
- 2026-05-15: SSP-04 shipped `scripts/formless.ts`, package `bin.formless`, and `src/site/cli.ts`. CLI parsing supports `init`, `dev`, and `save`; init writes `formless.config.json`, `site.records.json`, and starter media; dev runs the Site authoring profile and restores project records/media into the local Site authority; save/check promotes a local Site authority snapshot back to project records and media.
- 2026-05-15: SSP-04 added project-scoped browser DB and broadcast names through `VITE_FORMLESS_SITE_PROJECT_ID`.
- 2026-05-15: SSP-04 tests added `src/site/cli.test.ts` and `src/client/broadcast.test.ts`; `src/client/db.test.ts` covers project-scoped DB names. `devstate check` reported checks ok and watcher tests passing. `bun run formless --help` printed the init/dev/save usage. Requested `tmp/devstate.json`, `tmp/test.txt`, and `tmp/check.txt` were absent, so `.devstate/status.md`, `.devstate/logs/check-vite.txt`, and `.devstate/logs/service-test.txt` were used as check evidence.

## Status Notes

- SSP-01 shipped 2026-05-15.
- SSP-02 shipped 2026-05-15.
- SSP-03 shipped 2026-05-15.
- SSP-04 shipped 2026-05-15.
- Current chunk: SSP-05.
- Current blocker: deploy setup must choose where local publish secrets live before `npx formless publish` can become the normal mutating path.
- Decision: the first user-facing product path is Site-only, even though the internal runtime remains schema-keyed.
- Decision: CLI publish is the first one-command publish path; admin publish follows only through a local CLI broker.
