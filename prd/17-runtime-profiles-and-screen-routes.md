# PRD 17: Runtime profiles and screen routes

Status: active
Current chunk: RPS-05
Last updated: 2026-05-07

## Goal

Separate schema identity, app screen routing, and published route shape.

The first slice should:

- rename the current Rates schema app to Estii;
- keep Estii's current flat rate-card model intact;
- let source schemas assign static paths to workspace screens;
- render app screen navigation from declared screens;
- keep schema-keyed authority, storage, sync, and local DB isolation;
- add a runtime profile seam for dev multi-app, generated app, and published site behavior;
- serve the Site public example at top-level published paths where `/` is home;
- keep cookie-selected worlds out of the canonical routing model.

This PRD is about routing shape and runtime profile selection. It is not about Estii domain expansion, screen params, users, permissions, or a full layout DSL.

## Problem

The current multi-schema web app is convenient for development because `/tasks`, `/rates`, and `/site` make schema selection explicit.

That shape is starting to carry too many meanings:

- path prefixes select the schema app;
- path prefixes select the authority instance;
- path prefixes select the browser local DB;
- path prefixes decide which shell renders;
- path prefixes decide whether a route is generated admin or public Site;
- Site public pages live under `/pages/*`, not normal published URLs.

That makes quick schema exploration easy, but it is not the long-term shape for generated apps or published sites.

Estii also needs to stop being named Rates at the app level. The current schema starts with rate cards, but it will slowly take on more Estii product surface. That needs screen navigation and screen routes, not a single `/rates` home tab.

The useful distinction is:

- a **world** is one schema app instance with its own authority and browser replica;
- a **screen** is a route inside one app world;
- a **runtime profile** decides how worlds and screens are mounted in the browser.

## Source map

Existing anchors:

- Current runtime docs: `doc/current.md`.
- Release target docs: `doc/roadmap.md`.
- Declarative app exploration: `doc/explorations/declarative-app-runtime.md`.
- Schema-backed app routes PRD: `prd/01-schema-routes.md`.
- Declarative screen runtime PRD: `prd/10-declarative-screen-runtime.md`.
- Site tree renderer PRD: `prd/09-site-tree-renderer.md`.
- Site editor PRD: `prd/13-site-editor-list-detail.md`.
- Shared app registry: `src/shared/schema-apps.ts`.
- Worker app registry: `src/worker/schema-apps.ts`.
- App shell and browser routes: `src/app.tsx`.
- Home route: `src/app/routes/home.tsx`.
- Schema route: `src/app/routes/schema.tsx`.
- Site public route: `src/app/routes/site-page.tsx`.
- Site public renderer: `src/app/site-renderer/renderer.tsx`.
- Screen parser: `src/shared/schema-screens.ts`.
- Screen schema types: `src/shared/schema-types.ts`.
- Screen and view model selection: `src/client/views.ts`.
- Client sync paths: `src/client/sync.ts`.
- Browser local DB naming: `src/client/db.ts`.
- Worker dispatch: `src/worker/index.ts`.
- Authority routes: `src/worker/authority.ts`.
- Rate-card source schema: `schema/apps/estii/schema.json`.
- Rate-card seed records: `schema/apps/estii/seed-records.json`.
- Site source schema: `schema/apps/site/schema.json`.
- Site seed records: `schema/apps/site/seed-records.json`.
- App tests: `src/app.test.tsx`.
- Shared schema app tests: `src/shared/schema-apps.test.ts`.
- Worker schema app tests: `src/worker/schema-apps.test.ts`.
- Screen parser tests: `src/shared/schema.test.ts`.
- Screen model tests: `src/client/views.test.ts`.
- Sync tests: `src/client/sync.test.ts`.
- Authority tests: `src/worker/authority.test.ts`.

Owned files:

- `prd/17-runtime-profiles-and-screen-routes.md`.

Likely changed files:

- `src/shared/schema-apps.ts`.
- `src/worker/schema-apps.ts`.
- `src/app.tsx`.
- `src/app/routes/home.tsx`.
- `src/app/routes/schema.tsx`.
- `src/app/routes/site-page.tsx`.
- `src/shared/schema-types.ts`.
- `src/shared/schema-screens.ts`.
- `src/client/views.ts`.
- `src/client/sync.ts`.
- `src/client/db.ts`.
- `src/worker/index.ts`.
- `src/worker/authority.ts`.
- `src/shared/schema-apps.test.ts`.
- `src/worker/schema-apps.test.ts`.
- `src/shared/schema.test.ts`.
- `src/client/views.test.ts`.
- `src/client/sync.test.ts`.
- `src/worker/authority.test.ts`.
- `src/app.test.tsx`.
- `schema/apps/estii/schema.json`.
- `schema/apps/estii/seed-records.json`.
- `schema/apps/site/schema.json`.

## Requirements

### Naming behavior

- Rename schema key `rates` to `estii`.
- Rename app label `Rates` to `Estii`.
- Rename app route `/rates` to `/estii`.
- Rename schema editor route `/rates/schema` to `/estii/schema`.
- Rename source folder `schema/apps/rates` to `schema/apps/estii`.
- Rename browser local DB from `formless:rates` to `formless:estii`.
- Rename broadcast channel from `formless:rates` to `formless:estii`.
- Rename seed mutation prefix from `seed-rate-card` only if the prefix is visible in tests or debug output.
- Keep rate-card entity names where they still describe the data: `resource`, `card`, `rate`.
- Keep rate-card relationship, query, view, and action names unless a name is app-level.
- Do not add cross-app migration from the old `rates` authority instance.
- Old browser route `/rates` redirects to `/estii`.
- Old browser route `/rates/schema` redirects to `/estii/schema`.
- Old `/api/rates/*` should not remain a read or write path.

### Screen path behavior

- Add a static app-relative path to workspace screens.
- A screen path starts with `/`.
- A screen path is unique inside one schema.
- A screen path has no params in this PRD.
- A screen path has no wildcard in this PRD.
- A screen path must not collide with the schema editor path.
- A screen path can be omitted for saved-schema compatibility.
- When screen paths are missing, the first primary screen uses the app root path.
- Source schemas should declare paths explicitly after migration.
- Estii home screen should mount at `/estii`.
- Estii setup screen should mount at `/estii/setup`.
- Task home screen should mount at `/tasks`.
- Site editor screens should mount at `/site`, `/site/header`, and `/site/footer`.
- Selected query and context state stays keyed by screen and section.
- One-screen apps stay visually equivalent.
- Multiple primary screens render as app screen navigation, not as unrelated collection tabs.

### Generated app shell behavior

- The dev shell keeps top-level app navigation for Tasks, Estii, and Site.
- The active app sidebar can list that app's primary screens.
- The active app keeps a Schema entry for dev editing.
- Screen navigation loads the screen at its declared path.
- Browser back/forward uses real screen paths.
- Generated create, patch, and action calls still submit to the active schema key.
- Reset controls remain route-scoped to the active schema app.
- Public Site routes do not show generated admin navigation.

### Runtime profile behavior

- Introduce an explicit runtime profile resolver.
- A runtime profile decides how routes mount worlds and screens.
- Initial runtime profiles:
  - `dev`: multi-app Formless shell with Tasks, Estii, Site, schema editors, reset controls, and public preview paths.
  - `app`: one generated app mounted at normal app paths without the multi-app Formless switcher.
  - `publishedSite`: one Site public renderer mounted at top-level paths.
- Dev profile keeps `/tasks`, `/estii`, `/site`, and schema editor routes.
- App profile mounts one app's screens without requiring the schema key in every browser path.
- Published Site profile maps `/` to the `home` page and `/*` to public page slugs.
- Published Site profile keeps generated admin routes out of the public shell.
- Runtime profile selection can come from build config, worker env, or host.
- Do not use a cookie as the canonical world selector.
- A cookie may be considered later as a dev-only preference, after URL/host/profile resolution is explicit.

### API and authority behavior

- Keep schema-keyed API paths for mutations, actions, schema, sync, reset, and tree reads.
- Keep one schema key mapping to one source schema.
- Keep one schema key mapping to one authority instance.
- Keep one schema key mapping to one browser local DB.
- Keep HTTP as the write path.
- Keep push sync keyed by schema app.
- Keep `/api/:schemaKey/tree/:slug` as the public tree read endpoint.
- Published Site top-level routes should call the Site tree endpoint internally or through the existing client helper.
- Unknown schema keys should still return `404`.
- Old unkeyed API paths should still return `404`.

### Published Site behavior

- In dev profile, `/pages` redirects to `/pages/home`.
- In dev profile, `/pages/*` stays available as public Site preview.
- In published Site profile, `/` renders slug `home`.
- In published Site profile, `/*` renders the matching public page slug.
- Published Site top-level routes should use the same tree projection as `/pages/*`.
- Published Site top-level routes should not expose drafts, archived blocks, invisible placements, or tombstoned records.
- Missing public pages render the existing Site not-found behavior.
- Public renderer links should be profile-aware so header/home links do not force `/pages/home` in published mode.

### Future fit

- Screen paths should leave room for route params later.
- Runtime profiles should leave room for host-bound worlds later.
- Runtime profiles should leave room for preview vs published Site later.
- The world resolver should leave room for quickly exploring alternate app schemas without making cookies canonical.
- Estii screen routing should leave room for forecasts, roles, streams, products, themes, settings, and deal detail routes later.
- Modes such as Sales, Delivery, and Client stay out of this PRD.

## Proposed schema shape

Estii source shape:

```json
{
  "screens": {
    "rateHome": {
      "type": "workspace",
      "label": "Rates",
      "path": "/",
      "navigation": {
        "primary": true
      },
      "layout": {
        "type": "stack",
        "sections": [
          {
            "id": "rates",
            "type": "collection",
            "view": "rateHome"
          }
        ]
      }
    },
    "rateSetup": {
      "type": "workspace",
      "label": "Setup",
      "path": "/setup",
      "navigation": {
        "primary": true
      },
      "layout": {
        "type": "stack",
        "sections": [
          {
            "id": "cards",
            "type": "collection",
            "view": "cardHome"
          },
          {
            "id": "resources",
            "type": "collection",
            "view": "resourceHome"
          }
        ]
      }
    }
  }
}
```

Notes:

- `path` is app-relative.
- The mounted dev URL for `path: "/"` is `/estii`.
- The mounted dev URL for `path: "/setup"` is `/estii/setup`.
- Screen labels can evolve from rate-card labels before entities are renamed.
- This shape is static only; params wait.

## Decisions

| ID      | Decision                                                                  | Reason                                                                                  | Evidence                                                               |
| ------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| RPS-D1  | Keep schema identity explicit and schema-keyed.                           | Authority, sync, local DB, and reset isolation already depend on the schema key.        | `prd/01-schema-routes.md`, `src/shared/schema-apps.ts`                 |
| RPS-D2  | Add runtime profiles instead of making path prefixes do every job.        | Dev, generated app, and published site need different route shells.                     | `src/app.tsx`, `src/app/routes/site-page.tsx`                          |
| RPS-D3  | Do not use cookies as canonical world identity.                           | Cookie-selected worlds make URLs ambiguous and weaken link/debug behavior.              | current path-keyed API and app routes                                  |
| RPS-D4  | Allow host/config/profile resolution before any future cookie preference. | Host/config keep published behavior deterministic while still allowing local variants.  | `doc/explorations/declarative-app-runtime.md`                          |
| RPS-D5  | Rename Rates to Estii at the app boundary, not the whole data model.      | The current schema still models rate cards; entity names should change only with data.  | `schema/apps/estii/schema.json`, `src/shared/schema-apps.ts`           |
| RPS-D6  | Add static screen paths before route params.                              | Estii needs simple app navigation now; param routes need record-detail semantics later. | `prd/10-declarative-screen-runtime.md`                                 |
| RPS-D7  | Use screen navigation as sidebar route data.                              | Screens are now app entry points; collection navigation is legacy fallback.             | `src/client/views.ts`, `src/app/routes/home.tsx`                       |
| RPS-D8  | Keep schema editors as dev/app tooling, not published site routes.        | Public published pages should not expose generated admin or schema edit UI.             | `src/app.tsx`, `src/app/routes/schema.tsx`                             |
| RPS-D9  | Serve published Site at top-level paths through the existing tree model.  | The current tree projection already owns public visibility and block composition.       | `src/site/tree.ts`, `src/app/routes/site-page.tsx`                     |
| RPS-D10 | Keep `/api/:schemaKey/*` stable while route profiles change.              | Changing browser routes should not churn authority, storage, or sync behavior.          | `src/worker/index.ts`, `src/client/sync.ts`, `src/worker/authority.ts` |

## Alternatives considered

### Path prefixes everywhere

Keep `/tasks`, `/rates`, `/site`, and `/pages/*` as the only shape.

Rejected as the long-term shape because it makes published sites abnormal and keeps app routing coupled to schema selection.

### Cookie-selected world

Use a cookie to pick the current schema while routes look normal.

Rejected as the canonical model because the same URL can mean different worlds in different browsers, links are ambiguous, and public caching/debugging get harder. This can be revisited as a dev-only preference after profile resolution is explicit.

### One merged schema

Merge Tasks, Estii, and Site into one schema and use screens to select areas.

Rejected because schema artifact names are app-local, the runtime treats one active schema as the app boundary, and cross-app references are outside first-release scope.

### Published-only rewrite

Special-case only the Site public renderer so `/` maps to home.

Rejected as incomplete because Estii screen routing and app/profile separation would remain unsolved.

## Chunks

| ID     | Status  | Depends on | Main files                            | Acceptance                                                                                                           |
| ------ | ------- | ---------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| RPS-01 | shipped | none       | PRD                                   | PRD captures runtime profile, Estii rename, screen path, published Site, decisions, dependencies, and promote notes. |
| RPS-02 | shipped | RPS-01     | app registries, source schema paths   | `rates` is renamed to `estii` at the app boundary while rate-card data behavior stays unchanged.                     |
| RPS-03 | shipped | RPS-02     | screen parser/types/model tests       | Workspace screens accept static app-relative paths and expose route-ready screen models.                             |
| RPS-04 | shipped | RPS-03     | app shell, home route, source schemas | Dev shell renders screen sidebar/navigation and routes Estii setup through `/estii/setup`.                           |
| RPS-05 | planned | RPS-04     | runtime profile resolver, app routes  | Dev, app, and published Site profiles mount routes through one explicit profile seam.                                |
| RPS-06 | planned | RPS-05     | Site public route and renderer        | Published Site profile serves `/` as home and `/*` as public page slugs with no generated admin shell.               |
| RPS-07 | planned | RPS-06     | browser smoke, PRD                    | Checks pass; browser smoke covers dev routes, Estii screen routes, and published Site routes; PRD notes are current. |

## Chunk details

### RPS-01 PRD draft

Status: shipped 2026-05-07.

Goal: capture the routing direction before implementation.

Outcome:

- Defined world, screen, and runtime profile terms.
- Captured the Rates to Estii rename scope.
- Captured static screen path behavior.
- Captured runtime profile behavior for dev, app, and published Site.
- Captured why cookies are not the canonical world selector.
- Split implementation into independently shippable chunks.

Evidence:

- `./tmp/agent-dev.json`: `devStatus` ready, `testStatus` pass, `checkStatus` pass.
- `./tmp/test.txt`: `29 passed (29)`, `506 passed (506)`.
- `./tmp/check.txt`: formatting pass; lint/type check pass for 166 files.

### RPS-02 Rates to Estii rename

Status: shipped 2026-05-07.

Goal: rename the app boundary before adding more screens.

Tasks:

- Shipped: renamed `SchemaKey` member `rates` to `estii`.
- Shipped: renamed app metadata to label `Estii`, route `/estii`, schema route `/estii/schema`.
- Shipped: moved source files from `schema/apps/rates/` to `schema/apps/estii/`.
- Shipped: updated imports, tests, expected DB names, broadcast channels, and API paths.
- Shipped: redirected old browser routes `/rates` and `/rates/schema` to Estii routes.
- Shipped: kept old `/api/rates/*` unsupported.
- Shipped: kept rate-card schema contents behaviorally unchanged.

Acceptance:

- `/estii` opens the existing rate-card app behavior.
- `/estii/schema` edits the Estii runtime schema.
- `/rates` redirects to `/estii`.
- `/rates/schema` redirects to `/estii/schema`.
- `/api/estii/bootstrap` returns the current rate-card source schema.
- `/api/rates/bootstrap` returns `404`.
- `formless:estii` is the browser local DB name.
- Tasks and Site remain isolated.
- Existing rate-card tests pass with Estii app naming.

Evidence:

- `./tmp/agent-dev.json`: `devStatus` ready, `testStatus` pass, `checkStatus` pass.
- `./tmp/test.txt`: `29 passed (29)`, `506 passed (506)`; latest focused rerun `src/worker/authority.test.ts` passed `85 passed (85)`.
- `./tmp/check.txt`: formatting pass; lint/type check pass for 166 files.
- Browser smoke: `bun browser --session rps-02 open .../estii` loaded Estii shell with `Rates` workspace and `Cursor 17`.
- Browser smoke: `bun browser --session rps-02 open .../estii/schema` loaded `Estii Schema` with key `estii`.
- Browser smoke: `bun browser --session rps-02 open .../rates` redirected to `/estii`.
- Browser smoke: `bun browser --session rps-02 open .../rates/schema` redirected to `/estii/schema`.
- API smoke: `GET /api/estii/bootstrap` returned `200` with rate-card schema and 17 records.
- API smoke: `GET /api/rates/bootstrap` returned `404`.

### RPS-03 static screen path schema

Status: shipped 2026-05-07.

Goal: let screens own app-relative paths.

Tasks:

- Shipped: added optional `path` to workspace screen schema.
- Shipped: validated static app-relative path shape.
- Shipped: rejected duplicate screen paths inside one schema.
- Shipped: rejected schema-editor path collision at `/schema`.
- Shipped: kept schemas without paths parsing.
- Shipped: exposed path in screen models.
- Shipped: selected screen models by path.
- Shipped: added parser and view-model tests.

Acceptance:

- A screen with `path: "/"` parses.
- A screen with `path: "/setup"` parses.
- Duplicate screen paths fail.
- Empty, relative, wildcard, and param paths fail.
- Saved schemas without screen paths still render.
- Screen models expose route-ready path facts.

Evidence:

- `./tmp/agent-dev.json`: `devStatus` ready, `testStatus` pass, `checkStatus` pass.
- `./tmp/test.txt`: initial full watch `29 passed (29)`, `506 passed (506)`; latest affected reruns `src/shared/schema.test.ts` passed `85 passed (85)` and `src/client/views.test.ts` passed `38 passed (38)`.
- `./tmp/check.txt`: formatting pass; lint/type check pass for 166 files.

### RPS-04 generated screen navigation routes

Status: shipped 2026-05-07.

Goal: render declared app screens as real routes.

Tasks:

- Shipped: updated Tasks, Estii, and Site source schemas with explicit screen paths.
- Shipped: made Estii `rateSetup` primary, labeled `Setup`, and path-backed at `/setup`.
- Shipped: routed `/estii/setup` to the Estii setup screen.
- Shipped: routed Site editor screen paths `/site`, `/site/header`, and `/site/footer`.
- Shipped: rendered active app screen navigation from primary screen models in the dev shell sidebar.
- Shipped: kept Schema as a dev tooling route in the active app sidebar.
- Shipped: preserved selected query and context state keys by screen and section.

Acceptance:

- `/tasks` opens Tasks.
- `/estii` opens Estii rates.
- `/estii/setup` opens Estii setup.
- `/site`, `/site/header`, and `/site/footer` open Site editor screens.
- Screen navigation highlights the active screen.
- Schema editor routes still work.
- Generated mutations still submit with the active schema key.

Evidence:

- `./tmp/agent-dev.json`: `devStatus` ready, `testStatus` pass, `checkStatus` pass.
- `./tmp/test.txt`: full watcher run showed `29 passed (29)`, `511 passed (511)`; latest focused rerun `src/client/views.test.ts` passed `38 passed (38)`.
- `./tmp/check.txt`: formatting pass; lint/type check pass for 166 files.
- Browser smoke reset source schema and seed data for `tasks`, `estii`, and `site` through `/api/:schemaKey/reset/schema` and `/api/:schemaKey/reset/seed`; all six reset calls returned `200`.
- Browser smoke: `bun browser --session rps-04 batch --bail ...` opened `/tasks`, `/estii`, `/estii/setup`, `/site`, `/site/header`, `/site/footer`, and `/estii/schema`; each route rendered expected screen or schema content and browser errors were empty.

### RPS-05 runtime profile resolver

Status: planned.

Goal: make route mounting explicit.

Tasks:

- Add runtime profile types for `dev`, `app`, and `publishedSite`.
- Add a profile resolver.
- Move route construction behind the profile resolver.
- Keep dev profile behavior equivalent except for Estii and screen paths.
- Add app profile tests for one generated app mounted without a multi-app switcher.
- Keep API path generation schema-keyed.

Acceptance:

- Dev profile mounts Tasks, Estii, Site, schema editors, and public preview pages.
- App profile mounts one selected schema app without the Formless multi-app switcher.
- Profile resolution is deterministic from config or host.
- Cookies are not required for correct route behavior.
- Existing client sync URLs remain `/api/:schemaKey/*`.

Evidence to record:

- `./tmp/agent-dev.json`.
- `./tmp/test.txt`.
- `./tmp/check.txt`.

### RPS-06 published Site top-level routes

Status: planned.

Goal: make the Site example runnable like a published website.

Tasks:

- Mount Site public renderer at `/` in `publishedSite` profile.
- Map `/` to slug `home`.
- Map `/*` to public page slug.
- Keep dev preview at `/pages/*`.
- Make public renderer links profile-aware.
- Keep public visibility filtering in the existing tree projection.

Acceptance:

- Published Site `/` renders the home page tree.
- Published Site `/about` or another seeded slug renders that page when published.
- Published Site missing pages show not-found behavior.
- Draft, archived, invisible, and tombstoned content remains excluded.
- Dev `/pages/home` still renders public preview.
- Public routes do not show generated admin navigation.

Evidence to record:

- `./tmp/agent-dev.json`.
- `./tmp/test.txt`.
- `./tmp/check.txt`.
- Browser smoke for published Site `/`, one seeded slug, and a missing slug.

### RPS-07 closeout

Status: planned.

Goal: verify route profile behavior and update the PRD.

Tasks:

- Read `./tmp/agent-dev.json`, `./tmp/test.txt`, and `./tmp/check.txt`.
- Fix any issues from dev/test/check output.
- Run browser smoke because app behavior changes.
- Update PRD chunk statuses, decisions, blockers, and promote notes.

Acceptance:

- `./tmp/test.txt` shows passing tests.
- `./tmp/check.txt` shows passing checks.
- Browser smoke covers the changed route surfaces.
- PRD status reflects shipped chunks and remaining work.

Evidence to record:

- `./tmp/agent-dev.json`.
- `./tmp/test.txt`.
- `./tmp/check.txt`.
- Browser smoke command and result.

## Dependencies

| Workstream         | Type         | Need                                                                                   |
| ------------------ | ------------ | -------------------------------------------------------------------------------------- |
| PRD 10 screens     | upstream     | Existing `screens` parser, screen models, and generated screen rendering.              |
| PRD 13 Site editor | upstream     | Site editor primary screens and list/detail context presentation.                      |
| PRD 09 Site tree   | upstream     | Public tree projection and renderer used by published Site top-level routes.           |
| PRD 14 table work  | coordination | Route changes should preserve table action/order behavior if PRD 14 is in active work. |

## Blockers

- None known for RPS-05.
- Runtime profile source may need a small config convention before RPS-05 implementation.
- Published Site browser smoke needs a way to run the app under `publishedSite` profile.

## Non-goals

- Do not add users, accounts, or permissions.
- Do not add multi-tenant account routing.
- Do not add cross-app references.
- Do not add cross-app queries.
- Do not merge schemas.
- Do not add route params.
- Do not add wildcard screen routes.
- Do not add record detail screen routing.
- Do not add Sales, Delivery, or Client modes.
- Do not add mode-specific visibility or action policy.
- Do not add board, dashboard, chart, timeline, document, or plugin section types.
- Do not redesign the flat rate-card data model.
- Do not rename `rate`, `card`, or `resource` entities in this PRD.
- Do not add schema marketplace or dynamic app discovery.
- Do not make cookies part of canonical world identity.

## Promote after ship

- `doc/current.md`: RPS-02 shipped; rename Rate-Card app section to Estii.
- `doc/current.md`: RPS-02 shipped; update source schema paths from `schema/apps/rates` to `schema/apps/estii`.
- `doc/current.md`: RPS-02 shipped; update browser local DB and broadcast channel names to `formless:estii`.
- `doc/roadmap.md`: RPS-02 shipped; replace `/rates` release target with `/estii`.
- `doc/current.md`: RPS-03 shipped; workspace screens can declare optional static app-relative `path`.
- `doc/current.md`: RPS-03 shipped; screen path parser rejects duplicates, params, wildcards, non-root relative paths, and `/schema`.
- `doc/current.md`: RPS-03 shipped; screen models expose path facts and assign `/` to the first primary screen when paths are omitted.
- `doc/current.md`: RPS-04 shipped; source screens declare paths for Tasks `/`, Estii `/` and `/setup`, and Site `/`, `/header`, `/footer`.
- `doc/current.md`: RPS-04 shipped; dev shell sidebar renders active app screen navigation from primary screen models and keeps Schema as a dev tooling route.
- `doc/current.md`: RPS-04 shipped; app screen routes render through `HomeRoute` with app-relative screen paths while mutations keep the active schema key.
- `doc/current.md`: add runtime profile facts once RPS-05 ships.
- `doc/current.md`: add published Site top-level route facts once RPS-06 ships.
- `doc/roadmap.md`: add first-release screen-route scope only if this PRD is pulled into first-release work.

## Status notes

- 2026-05-07: PRD created from architecture discussion. User direction: rename Rates to Estii, add screen/sidebar/routing, support published Site top-level routes, and avoid making cookie-selected worlds the main model.
- 2026-05-07: RPS-02 shipped. App boundary is `estii`; route is `/estii`; schema route is `/estii/schema`; source folder is `schema/apps/estii`; old browser routes redirect; old `/api/rates/*` is unsupported.
- 2026-05-07: RPS-03 shipped. Workspace screens accept optional static app-relative paths; duplicate, dynamic, wildcard, relative, and `/schema` paths fail; screen models expose paths and path lookup.
- 2026-05-07: RPS-04 shipped. Dev shell active app navigation uses primary screen models; `/estii/setup`, `/site/header`, and `/site/footer` route to declared screens; Schema remains a dev tooling route.
