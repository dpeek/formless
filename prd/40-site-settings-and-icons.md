# PRD 40: Site settings and icons

Status: ready
Current chunk: SSI-01 ready
Last updated: 2026-05-18

Start after PRD 30, PRD 31, PRD 38, and PRD 39 shipped behavior is stable on the active branch.

## Goal

Add a Site settings singleton to the Site app.

The first version should:

- add one `site` entity to the Site schema;
- store public Site-wide `label`, `description`, and `icon`;
- keep `label` aligned with `block.label`;
- keep `icon` as canonical SVG source;
- derive browser favicon, PNG, and ICO assets from that SVG;
- keep generated PNG and ICO artifacts out of editable record data;
- keep page, post, project, block, and placement records flat;
- keep all Site content implicitly scoped to the current Site schema instance;
- preserve package fallback launch icons when no valid Site icon exists.

This PRD owns Site settings data, public tree metadata, and dynamic Site icon routes.
It does not own multi-site scoping, a media library, editable PNG/ICO fields, general static asset publishing, SEO image metadata, or broader generated settings abstractions.

## Problem Statement

The public Site has no authored record for Site-wide identity.

Current behavior:

- public document metadata derives the Site name from header/page data;
- package `public/` owns `favicon.svg`, `favicon.ico`, and `apple-touch-icon.png`;
- public pages always link to root favicon paths;
- authors can edit block icons as SVG source, but cannot edit the public Site icon;
- generated Site admin has Pages, Posts, Projects, and Navigation roots, but no settings area;
- sitemap route discovery is based on routable block records.

This makes the public Site identity implicit and package-owned.
The Site owner needs one flat settings record that controls the public Site name, description, and icon without turning launch assets into independent authored fields.

## Solution

Add a new `site` entity to `schema/apps/site/schema.json`.

The entity stores one active record:

- `key`: required text; seed value `"primary"`;
- `label`: required text; public Site label/name;
- `description`: optional text or long-text;
- `icon`: optional text with `format: "icon"`; canonical SVG source.

The `site` entity uses a unique constraint over `key`.
`create` and `delete` are disabled.
`patch` is enabled.
The source seed includes exactly one active `site` record with `key = "primary"`.

Public tree output gains a top-level `site` object.
Successful public metadata prefers `tree.site.label` and `tree.site.description`.
If the singleton is missing or invalid, public metadata falls back to the current header/page-derived behavior and the tree emits a warning.

Dynamic icon serving owns the root browser convention paths:

- `/favicon.svg`;
- `/favicon.ico`;
- `/apple-touch-icon.png`;
- optional `/favicon-32x32.png` if the implementation adds a linked PNG favicon.

The SVG favicon serves sanitized SVG source.
PNG and ICO responses are derived from the SVG on demand.
Generated artifacts may be cached, but they are not editable fields and are not source seed facts.

## Source Map

Existing anchors:

- Current runtime docs: `doc/current.md`.
- Release target docs: `doc/roadmap.md`.
- Site source schema: `schema/apps/site/schema.json`.
- Site source records: `schema/apps/site/seed-records.json`.
- Test Site records fixture: `src/test/site-records.ts`.
- Site tree projection: `src/site/tree.ts`.
- Site route resolver: `src/site/route-resolver.ts`.
- Public tree response types: `src/shared/protocol.ts`.
- Public document metadata: `src/site/public-document-metadata.ts`.
- Worker dispatch: `src/worker/index.ts`.
- Worker routing: `src/worker/routing.ts`.
- Worker public SSR: `src/worker/site-ssr.tsx`.
- Worker indexing routes: `src/worker/public-indexing.ts`.
- Sitemap route builder: `src/site/public-indexing.ts`.
- Public cache policy: `src/worker/site-cache.ts`.
- Site media Worker module: `src/worker/media.ts`.
- Site source media helpers: `src/site/source-media.ts`.
- Static launch asset tests: `src/worker/static-assets.test.ts`.
- Current package fallback assets: `public/favicon.svg`, `public/favicon.ico`, `public/apple-touch-icon.png`.
- SVG icon primitive: `lib/ui/src/svg-icon.tsx`.
- Generated field editor: `src/app/generated/record-field-editor.tsx`.
- Generated create renderer: `src/app/generated/create.tsx`.
- Generated collection renderer: `src/app/generated/collection.tsx`.
- Generated screen renderer: `src/app/generated/screen.tsx`.
- Generated authoring facts: `src/client/generated-authoring.ts`.
- View model selection: `src/client/views.ts`.
- Unique constraints: `src/worker/constraints.ts`.
- Source seed parsing: `src/worker/schema-apps.ts`.
- SVG icon PRD: `prd/30-svg-icon-field-renderer-editor.md`.
- Site media PRD: `prd/31-site-media-upload.md`.
- Public cutover PRD: `prd/38-public-site-cutover-cleanup.md`.
- Minimal starter seed PRD: `prd/39-minimal-site-starter-seed.md`.

Notes:

- There is no `src/worker/static-assets.ts` module today.
- Static fallback handling currently lives in `src/worker/index.ts`, `src/worker/routing.ts`, the `ASSETS` binding, `wrangler.jsonc`, and `src/worker/static-assets.test.ts`.

Owned files:

- `prd/40-site-settings-and-icons.md`.

Likely changed files:

- `schema/apps/site/schema.json`.
- `schema/apps/site/seed-records.json`.
- `src/shared/protocol.ts`.
- `src/site/tree.ts`.
- `src/site/public-document-metadata.ts`.
- `src/worker/index.ts`.
- `src/worker/routing.ts`.
- `src/worker/site-ssr.tsx`.
- `src/worker/site-cache.ts`.
- `src/worker/static-assets.test.ts`.
- `src/worker/site-ssr.test.ts`.
- `src/worker/routing.test.ts`.
- `src/site/tree.test.ts`.
- `src/app.test.tsx`.
- `src/shared/schema.test.ts`.
- `src/worker/schema-apps.test.ts`.

Possible changed files:

- `lib/ui/src/svg-icon.tsx` if the sanitizer/parser needs extraction.
- `lib/ui/src/index.ts` if a non-React SVG sanitizer export is added.
- `src/site/site-settings.ts` for singleton selection.
- `src/site/site-icon-assets.ts` for SVG sanitization, raster render inputs, and ICO encoding.
- `src/worker/site-icons.ts` for dynamic root icon routes.
- `src/site/source-media.ts` only if icon cache/source helpers need shared key rules.
- `package.json` if a Worker-compatible SVG-to-PNG dependency is added.
- `wrangler.jsonc` if `run_worker_first` must route dynamic favicon paths through the Worker before `ASSETS`.

Do not edit:

- `doc/current.md` or `doc/roadmap.md` in this PRD pass.
- PNG or ICO fields in `site` records.
- page/post/project/block scoping fields.
- a generic media library.

## User Stories

1. As a Site author, I want to edit the public Site label, so that browser metadata and public identity do not depend on header links.
2. As a Site author, I want the setting field to be named `label`, so that Site records match the existing `block.label` language.
3. As a Site author, I want to edit a public Site description, so that default page metadata has authored copy.
4. As a Site author, I want to paste SVG source for the Site icon, so that one canonical field controls launch icons.
5. As a Site author, I want invalid or empty SVG to fall back to package icons, so that a bad paste does not break public pages.
6. As a Site author, I do not want PNG and ICO fields, so that generated browser assets are not mistaken for source content.
7. As a Site author, I want Site settings inside the generated Site editor, so that I do not need a custom admin page.
8. As a Site author, I do not want a normal create/delete workflow for the Site settings record, so that there is only one settings record.
9. As a Site visitor, I want browser tabs and bookmarks to use the authored Site name and icon, so that the Site feels owned.
10. As a Site visitor, I want touch icons to load from the normal root path, so that saved mobile bookmarks use the Site icon.
11. As a crawler, I want stable favicon URLs, so that the Site icon is discoverable and cacheable.
12. As a runtime developer, I want the public tree to expose a top-level `site` object, so that metadata and rendering stop deriving Site facts from content chrome.
13. As a runtime developer, I want sitemap discovery to stay based on routable blocks, so that settings do not change public route semantics.
14. As a runtime developer, I want favicon `HEAD` to match `GET` headers with no body, so that icon routes follow existing Worker route behavior.
15. As a runtime developer, I want generated PNG and ICO artifacts cached by SVG content hash, so that expensive rasterization is not repeated unnecessarily.
16. As a runtime developer, I want a small internal ICO encoder over PNG buffers, so that adding ICO support does not add another dependency.
17. As a runtime developer, I want Cloudflare-compatible SVG-to-PNG conversion, so that published Workers can derive icons at runtime.
18. As a runtime developer, I want bundle size and startup time measured before ship, so that Wasm icon rendering does not break Worker limits.
19. As a maintainer, I want old databases with no `site` record to keep rendering, so that introducing settings is not a hard migration break.
20. As a maintainer, I want source seed/reset to guarantee the singleton for new or reset Site stores, so that the normal path always has one settings record.

## Requirements

### Data Model

- Add a top-level Site schema entity named `site`.
- `site` fields are flat scalar fields.
- `site.key` is required text.
- The only source seed value for `site.key` is `"primary"`.
- `site.label` is required text.
- `site.description` is optional text.
- `site.icon` is optional text with `format: "icon"`.
- `site.icon` stores canonical SVG source.
- `site` has a unique constraint over `key`.
- `site.create.enabled` is `false`.
- `site.patch.enabled` is `true`.
- `site.delete.enabled` is `false`.
- Source seed records include exactly one active `site` record.
- Reset seed restores exactly one active `site` record.
- Page, post, project, block, and placement records do not gain a `site` reference.
- Current Site schema instance remains the implicit site scope.
- Multi-site routing and cross-site references stay out of scope.
- PNG and ICO values are not stored as editable fields.
- Generated derived icon bytes are not source seed records.

### Missing Singleton

- Missing `site` must not make public pages fail.
- Missing `site` must produce a tree warning.
- Missing `site` falls back to the current metadata Site-name behavior.
- Missing `site.description` falls back to current page-body/default description behavior.
- Missing or invalid `site.icon` falls back to package launch icon assets.
- Generated admin does not expose a normal `Create Site` action.
- The missing-record repair path is reset seed or project restore in the first slice.

### Public Tree And Metadata

- `SitePageTree` gains a top-level `site` object.
- `tree.site.label` is the public Site name.
- `tree.site.description` is optional public Site description.
- `tree.site.icon` is optional SVG source.
- `tree.site` should include the selected record id when the record exists.
- `tree.site` should not expose `key` unless implementation proves it is needed.
- Public document metadata prefers `tree.site.label` for site name.
- Public document metadata prefers `tree.site.description` for description.
- Page metadata may still use page body when `tree.site.description` is absent.
- Home title uses the Site label.
- Non-home title uses `<page label> | <site label>`.
- Not-found and error documents can keep current `Site` fallback unless implementation also fetches settings for them.
- Existing header/page-derived fallback remains for old stores and missing singleton cases.
- Sitemap route discovery stays "all routable blocks in this Site schema instance".
- `robots.txt` behavior does not change.
- `sitemap.xml` entries do not include `site` settings.

### Favicon And Icon Serving

- Serve dynamic Site icon routes only for `GET` and `HEAD`.
- Dynamic routes are root browser convention paths.
- `/favicon.svg` returns sanitized SVG when `site.icon` is valid.
- `/favicon.ico` returns an ICO container derived from generated PNG buffers.
- `/apple-touch-icon.png` returns a generated PNG, target size 180x180.
- Optional `/favicon-32x32.png` may be added if the HTML document links a PNG favicon.
- The SSR document keeps stable root icon URLs.
- The SSR document may add a PNG favicon link only if the route is implemented.
- Empty `site.icon` delegates to package fallback assets.
- Invalid `site.icon` delegates to package fallback assets.
- SVG-to-PNG failure delegates to package fallback assets.
- Package fallback assets remain `public/favicon.svg`, `public/favicon.ico`, and `public/apple-touch-icon.png`.
- Dynamic icon routes must run before `ASSETS` fallback in published profile.
- Non-published app/static behavior should keep using `ASSETS` fallback unless the route is explicitly dynamic.
- `HEAD` responses match `GET` status and headers and return no body.
- Successful generated icon responses set correct `Content-Type`.
- SVG favicon content type is `image/svg+xml; charset=utf-8`.
- PNG content type is `image/png`.
- ICO content type is `image/x-icon` or `image/vnd.microsoft.icon`.
- Generated responses set `ETag` from canonical SVG source plus output kind.
- Generated dynamic icon responses do not use immutable cache headers.
- Use stable root URLs and moderate HTTP caching because favicons are aggressively cached.
- Suggested first cache header: `public, max-age=3600, stale-while-revalidate=86400`.
- Cached generated artifacts should be keyed by SVG content hash and output kind.
- Cache API is the preferred first cache for generated bytes.
- R2 storage for derived icon bytes is out of scope unless Cache API testing or Worker limits prove it is required.
- Publish-time generation is out of scope for the first slice.

### SVG To PNG Dependency

- Do not use native Node packages such as `sharp` for Worker icon generation.
- Preferred lead is `@cf-wasm/resvg/workerd`.
- The implementation must import the workerd entrypoint, not the Node entrypoint.
- The implementation must measure Worker bundle size and startup impact before ship.
- If `@cf-wasm/resvg` exceeds Worker limits or startup budget, stop and record a blocker before adding a custom renderer.
- Use `@resvg/resvg-wasm` APIs through the compatibility wrapper unless direct Wasm import proves smaller.
- Disable system font loading for favicon rendering unless tests prove text icons need it.
- Treat external asset loading in SVG as unsupported for Site icons.

### ICO Encoding

- Generate PNG buffers first.
- Build ICO bytes with a small internal encoder.
- The encoder writes an ICO header, one directory entry per PNG, and the PNG payloads.
- Include at least 16x16 and 32x32 PNG entries.
- A 48x48 entry may be included if generated size remains small.
- Do not add a PNG-to-ICO dependency in the first slice.
- Unit test the ICO byte header and entry offsets.

### Authoring

- Site settings appear in the generated Site admin.
- First implementation uses a generated Settings collection section.
- Settings section appears before the existing Site composition section.
- Existing sidebar root navigation for Pages, Posts, Projects, and Navigation stays driven by `siteCompositionHome`.
- Settings should not become a root navigation group inside the block context sidebar.
- `site.key` is hidden from the generated settings authoring surface.
- `site.label` is editable.
- `site.description` is editable with a textarea or long-text editor.
- `site.icon` uses the existing `editor: "icon"` behavior.
- No generated create action is shown for `site`.
- No generated delete button is shown for `site`.
- Empty settings state does not show a generic create workflow.
- If the generated table section is too awkward, a later chunk may extract a generated singleton/detail section, but the first slice should not start with custom Site-only UI.

## Implementation Decisions

| ID      | Decision                                                           | Reason                                                                                            | Evidence                                                                        |
| ------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| SSI-D1  | Name the entity `site`.                                            | The record owns Site-wide facts and should match the app/domain term.                             | `CONTEXT.md`, `doc/current.md`                                                  |
| SSI-D2  | Use `key = "primary"` with a unique constraint.                    | Current schema constraints can enforce one logical settings record without changing storage.      | `src/shared/schema-fields.ts`, `src/worker/constraints.ts`                      |
| SSI-D3  | Disable create and delete for `site`.                              | The singleton should be seed/project-owned, not normal content created from the admin list.       | Existing entity mutation model in `schema/apps/site/schema.json`                |
| SSI-D4  | Keep page/post/project blocks implicitly scoped to the schema app. | One schema key maps to one Site instance today; multi-site scoping is not first-release scope.    | `doc/roadmap.md`, `src/shared/schema-apps.ts`                                   |
| SSI-D5  | Tolerate a missing singleton with public fallbacks and warnings.   | Existing stores may not have the new seed record until reset or project restore.                  | `src/site/tree.ts`, `src/site/public-document-metadata.ts`                      |
| SSI-D6  | Add `tree.site` to `SitePageTree`.                                 | Public metadata and icon logic need explicit Site facts instead of deriving identity from chrome. | `src/shared/protocol.ts`, `src/site/tree.ts`                                    |
| SSI-D7  | Keep sitemap discovery based on routable block records.            | Settings do not represent public routes.                                                          | `src/site/public-indexing.ts`, `src/site/route-resolver.ts`                     |
| SSI-D8  | Serve dynamic icons at root favicon convention paths.              | Browsers and crawlers already request those paths and SSR already links them.                     | `src/worker/site-ssr.tsx`, `src/worker/routing.ts`                              |
| SSI-D9  | Preserve package assets as fallback.                               | Empty, invalid, or failed generated icons must not break launch asset behavior.                   | `public/`, `src/worker/static-assets.test.ts`                                   |
| SSI-D10 | Generate PNG and ICO from canonical SVG on demand.                 | PNG/ICO are derived browser fallbacks, not author-editable facts.                                 | User direction 2026-05-18                                                       |
| SSI-D11 | Prefer Cache API over R2 for generated icon artifacts.             | The artifacts are deterministic from `site.icon` and can be regenerated.                          | Existing R2 media module stores authored originals, not derived output.         |
| SSI-D12 | Use a content hash in generated-artifact cache keys.               | Root favicon URLs stay stable while generated bytes change when SVG source changes.               | Google favicon stability requirement from user direction                        |
| SSI-D13 | Use a short/moderate cache header for dynamic root icons.          | Favicons are browser-cached aggressively and root URLs cannot be content-hashed.                  | Existing `site-cache.ts` route-specific cache ownership                         |
| SSI-D14 | Evaluate `@cf-wasm/resvg/workerd` first.                           | The package has an explicit workerd entrypoint and wraps `@resvg/resvg-wasm`.                     | `@cf-wasm/resvg` README and package metadata                                    |
| SSI-D15 | Do not use `sharp` for Worker icon generation.                     | `sharp` is a native Node/libvips package shape, not a direct workerd runtime fit.                 | `sharp` package metadata                                                        |
| SSI-D16 | Build ICO internally from generated PNG buffers.                   | ICO container writing is small and avoids another dependency.                                     | PNG buffers from SVG renderer are enough for browser favicon fallback.          |
| SSI-D17 | Use generated settings UI before custom UI.                        | Existing table/edit/icon controls can edit one flat record with no custom screen.                 | `src/app/generated/collection.tsx`, `src/app/generated/record-field-editor.tsx` |
| SSI-D18 | Keep global docs untouched until ship.                             | Normal PRD agents write promotion notes, not `doc/current.md` or `doc/roadmap.md`.                | `AGENTS.md`                                                                     |

## Dependency Research

Primary sources checked:

- Cloudflare Workers WebAssembly docs: <https://developers.cloudflare.com/workers/runtime-apis/webassembly/>
- Cloudflare Workers Wasm in JavaScript docs: <https://developers.cloudflare.com/workers/runtime-apis/webassembly/javascript/>
- Cloudflare Workers non-JavaScript module docs: <https://developers.cloudflare.com/workers/vite-plugin/reference/non-javascript-modules/>
- Cloudflare Workers Web standards docs: <https://developers.cloudflare.com/workers/runtime-apis/web-standards/>
- Cloudflare Workers limits docs: <https://developers.cloudflare.com/workers/platform/limits/>
- `@cf-wasm/resvg` package README: <https://github.com/fineshopdesign/cf-wasm/blob/main/packages/resvg/README.md>
- `@cf-wasm/resvg` package metadata: <https://raw.githubusercontent.com/fineshopdesign/cf-wasm/main/packages/resvg/package.json>
- `@cf-wasm/resvg` workerd source: <https://raw.githubusercontent.com/fineshopdesign/cf-wasm/main/packages/resvg/src/workerd.ts>
- `@cf-wasm/resvg` wrapper source: <https://raw.githubusercontent.com/fineshopdesign/cf-wasm/main/packages/resvg/src/resvg.ts>
- `resvg-js` README: <https://raw.githubusercontent.com/yisibl/resvg-js/main/README.md>
- `resvg` project README: <https://github.com/linebender/resvg>

Findings:

- Workers support Wasm through imported `.wasm` modules and `WebAssembly.instantiate()`.
- Workers do not support `WebAssembly.instantiateStreaming()`.
- Workers disallow `WebAssembly.compile`, `compileStreaming`, and `WebAssembly.instantiate` with a buffer parameter.
- Workers run each Worker in a single thread.
- Web Worker threading is not available.
- Workers have 128 MB memory per isolate.
- Worker startup must complete within 1 second.
- Worker size limits are 3 MB free and 10 MB paid.
- Cloudflare recommends top-level Wasm instantiation to avoid per-request instantiation.
- `@cf-wasm/resvg` README documents `import { Resvg } from "@cf-wasm/resvg/workerd"` for Cloudflare Workers/Pages with Wrangler.
- `@cf-wasm/resvg` package metadata exposes `./workerd` and default workerd ESM exports.
- `@cf-wasm/resvg` workerd source imports `./lib/resvg.wasm` and calls `initResvg(resvgWasmModule)`.
- `@cf-wasm/resvg` 0.3.4 depends on `@resvg/resvg-wasm` 2.6.2 and a legacy alias.
- Registry metadata from `bun pm view` reports `@cf-wasm/resvg` 0.3.4 unpacked size as 24,484,929 bytes.
- Registry metadata from `bun pm view` reports `@resvg/resvg-wasm` 2.6.2 unpacked size as 2,526,600 bytes.
- The package size requires an implementation spike to verify actual bundled Worker size and startup before merge.
- `resvg-js` documents SVG to PNG rendering and a pure WebAssembly backend.
- `resvg` is intended for static SVG rendering and does not support dynamic SVG features such as scripts, events, or animations.

Dependency decision:

- Use `@cf-wasm/resvg/workerd` only after a focused bundle/startup check passes.
- Keep the renderer behind a small module so the dependency can be replaced or deferred without changing Site records or icon routes.

## Deep Modules

- **Site settings selector:** selects the active `site` record, validates `key = "primary"`, returns public settings, and emits warnings for missing or duplicate records.
- **Public Site tree settings projection:** adds `tree.site` without changing block/placement projection.
- **Public metadata adapter:** consumes `tree.site` first, then preserves existing fallback behavior.
- **SVG icon source sanitizer:** reuses or extracts current SVG icon parsing/sanitization so Worker and UI icon behavior stay aligned.
- **Site icon asset renderer:** turns one sanitized SVG string into SVG, PNG sizes, and ICO bytes.
- **Generated icon artifact cache:** caches generated PNG/ICO bytes by SVG content hash and output kind.
- **Dynamic Site icon Worker route:** owns root favicon paths, fallback to package assets, cache headers, and `HEAD` behavior.
- **Generated settings section:** adapts the singleton record to existing generated collection/table/edit controls.

## Testing Decisions

- Test behavior through public contracts, not implementation details.
- Schema tests should assert `site` entity fields, mutations, and unique constraint parse.
- Source schema tests should assert the Site seed includes exactly one active `site` record with `key = "primary"`.
- Authority tests should cover unique constraint rejection if a duplicate `site.key` can be created through direct mutation fixtures.
- Tree tests should assert `tree.site` projects label, description, and icon.
- Tree tests should assert missing `site` emits a warning and still returns a public page tree.
- Metadata tests should assert `tree.site.label` drives home and subpage titles.
- Metadata tests should assert `tree.site.description` drives descriptions before page body fallback.
- Routing tests should assert root icon paths are handled by the dynamic icon route in published profile.
- Static asset tests should assert empty/invalid `site.icon` still serves package fallback assets.
- Worker icon tests should assert `GET` and `HEAD` parity for SVG, PNG, and ICO routes.
- Worker icon tests should assert generated SVG responses do not include unsafe SVG features.
- Worker icon tests should assert PNG responses have a PNG signature.
- Worker icon tests should assert ICO responses have an ICO header and valid image offsets.
- Worker icon tests should assert generation failure falls back to package assets.
- Cache tests should assert generated icon responses use content-hash-derived ETags.
- Generated UI tests should assert Settings appears before the Site composition section.
- Generated UI tests should assert no create action and no delete control appear for `site`.
- Generated UI tests should assert `site.icon` uses the icon editor.
- Sitemap tests should assert route entries remain page/post block based.
- Use `src/test/site-records.ts` fixtures for Site record shape where possible.
- Tests must not depend on exact source `schema/apps/site/seed-records.json` content except tests specifically guarding singleton seed facts.
- Use `devstate check` as final check evidence.
- Browser smoke is required if app behavior changes.
- Do not run raw `bun test`, `bun check`, `vp test`, or `vp check`.

Prior art:

- `src/site/tree.test.ts` covers public tree projection and warnings.
- `src/worker/site-ssr.test.ts` covers metadata and favicon links in SSR HTML.
- `src/worker/static-assets.test.ts` covers package launch asset fallback.
- `src/worker/media.test.ts` covers same-origin asset serving and `HEAD` behavior.
- `src/worker/public-indexing.test.ts` covers robots/sitemap and `HEAD`.
- `src/client/generated-authoring.test.ts` covers singleton/list-detail selection facts.
- `src/app.test.tsx` covers generated Site admin and public renderer behavior.
- `lib/ui/src/svg-icon.test.tsx` covers SVG icon sanitization and fallback rendering.

## Chunks

| ID     | Status | Depends on | Main files                                              | Acceptance                                                                                                                                 |
| ------ | ------ | ---------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| SSI-01 | ready  | none       | PRD                                                     | PRD captures data model, public tree, metadata, icon route, dependency, authoring, tests, blockers, and promotion notes.                   |
| SSI-02 | ready  | SSI-01     | schema, seed, schema tests                              | `site` entity exists, seed has one primary record, create/delete disabled, patch enabled, unique key constraint covered.                   |
| SSI-03 | ready  | SSI-02     | tree, protocol, metadata tests                          | `SitePageTree.site` projects settings; metadata prefers settings; missing singleton warns and falls back.                                  |
| SSI-04 | ready  | SSI-02     | generated Site schema/views, app tests                  | Generated Site admin shows Settings before Site composition, edits label/description/icon, and exposes no create/delete settings workflow. |
| SSI-05 | ready  | SSI-03     | dependency spike, package config, Worker build evidence | `@cf-wasm/resvg/workerd` or replacement path is proven against Worker bundle size, startup, and Miniflare/workerd import behavior.         |
| SSI-06 | ready  | SSI-05     | icon renderer/cache modules, Worker routes, tests       | `/favicon.svg`, `/favicon.ico`, and `/apple-touch-icon.png` derive from SVG, cache by content hash, and fall back to package assets.       |
| SSI-07 | ready  | SSI-06     | SSR/routing/indexing tests, browser smoke               | SSR icon links and Worker routing are correct; sitemap remains block-based; `HEAD` parity and browser smoke pass.                          |
| SSI-08 | ready  | SSI-07     | PRD                                                     | PRD closeout records checks, decisions, blockers, and promote notes after implementation ships.                                            |

## Acceptance Checks

- Source schema contains `entities.site`.
- Source seed contains exactly one active `site` record with `key = "primary"`.
- Creating another `site` through generic mutation is rejected because create is disabled.
- Deleting the `site` record through generic mutation is rejected because delete is disabled.
- Patching `site.label`, `site.description`, and `site.icon` works.
- `GET /api/site/tree/home` includes `site.label`.
- Successful public home SSR title is the Site label.
- Successful public subpage SSR title is `<page label> | <site label>`.
- Successful public metadata description prefers Site description when present.
- Missing `site` does not break public page tree or public SSR.
- Missing or invalid `site.icon` serves package fallback favicon assets.
- Valid `site.icon` serves dynamic `/favicon.svg`.
- Valid `site.icon` serves generated PNG for `/apple-touch-icon.png`.
- Valid `site.icon` serves generated ICO for `/favicon.ico`.
- `HEAD` for each dynamic icon path matches `GET` status and headers with no body.
- Icon routes do not change `/api/site/media/*` behavior.
- Sitemap output is unchanged except for unrelated route data changes.
- Generated Site admin shows Settings without a create button or delete button.
- Generated Site admin can edit the Site icon through the existing icon editor behavior.
- Worker bundle size and startup evidence are recorded before ship.
- `devstate check` passes.
- Browser smoke is run after app or Worker route behavior changes.

## Out of Scope

- Multi-site scoping.
- `siteId` fields on blocks, placements, pages, posts, or projects.
- Generic media library.
- Editable PNG favicon fields.
- Editable ICO favicon fields.
- Project-owned `public/` static asset publishing.
- User-uploaded SVG file media.
- SEO image metadata.
- Per-page SEO title/description fields.
- Touch icon customization separate from Site SVG.
- Publish-time icon generation unless runtime generation proves impossible.
- R2 storage for derived icon bytes unless Cache API proves insufficient.
- New generated singleton UI framework unless the generated settings table cannot satisfy the first slice.
- Updating `doc/current.md` or `doc/roadmap.md` before ship.

## Dependencies

| Workstream                   | Type       | Need                                                                                             |
| ---------------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| PRD 30                       | upstream   | Existing SVG icon editor/rendering behavior for text `format: "icon"`.                           |
| PRD 31                       | adjacent   | Same-origin media routes stay separate from derived Site icon routes.                            |
| PRD 38                       | upstream   | Public SSR, root favicon links, static fallback assets, robots, sitemap, and `HEAD` conventions. |
| PRD 39                       | upstream   | Neutral starter seed is the current default seed that should gain one settings record.           |
| Cloudflare Workers Wasm docs | dependency | Confirm Wasm import, no `instantiateStreaming`, no threads, bundle/startup/memory constraints.   |
| `@cf-wasm/resvg`             | dependency | Candidate workerd-compatible SVG-to-PNG renderer.                                                |

## Blockers

- Must measure actual Worker bundle size and startup time with `@cf-wasm/resvg/workerd`.
- `@cf-wasm/resvg` 0.3.4 package metadata reports 24,484,929 unpacked bytes, even though `@resvg/resvg-wasm` is 2,526,600 bytes; tree-shaken Worker output is unknown.
- Need to confirm Cache API support in local Miniflare tests for generated icon bytes.
- Need to decide whether the generated one-row settings table is acceptable after seeing it in the app.

## Promote after ship

- `doc/current.md`: Site source schema has `site` singleton with `key`, `label`, `description`, and SVG `icon`.
- `doc/current.md`: Site source seed includes one primary Site settings record.
- `doc/current.md`: Public Site tree includes top-level `site` settings.
- `doc/current.md`: Public document metadata prefers Site settings label and description.
- `doc/current.md`: Public root favicon and touch icon routes can derive SVG, PNG, and ICO assets from `site.icon`.
- `doc/current.md`: Empty or invalid `site.icon` falls back to package launch assets.
- `doc/current.md`: Generated Site admin includes a Settings section for the singleton record.
- `doc/roadmap.md`: First release includes authored Site label, description, and icon settings.

## Evidence

- 2026-05-18: `devstate start` reported checks ok and services running at `https://formless.local`.
- 2026-05-18: Read `.devstate/status.md`; checks were ok and watcher tests were passing.
- 2026-05-18: Read `doc/overview.md`, `doc/current.md`, and `doc/roadmap.md`.
- 2026-05-18: Read `CONTEXT.md`; records stay flat and public tree is the Site projection.
- 2026-05-18: Read `doc/adr/README.md`; no ADRs exist.
- 2026-05-18: Site schema currently has only `block` and `blockPlacement`.
- 2026-05-18: Site admin currently uses a generated `siteEditor` screen with one `siteCompositionHome` collection section.
- 2026-05-18: Existing generated screen renderer supports multiple stack sections.
- 2026-05-18: Existing generated collection/table/editor paths can patch flat fields and hide create/delete through entity mutation config.
- 2026-05-18: Existing icon editor uses text `format: "icon"` and `editor: "icon"` with SVG source.
- 2026-05-18: Public tree currently returns `page`, `frame`, `meta`, and `route`; there is no top-level `site`.
- 2026-05-18: Public metadata currently derives Site name from primary header link, then page label, then `Site`.
- 2026-05-18: Public SSR currently links `/favicon.svg`, `/favicon.ico`, and `/apple-touch-icon.png`.
- 2026-05-18: Worker routing currently treats those favicon paths as static assets in published profile.
- 2026-05-18: Package fallback icon assets exist under `public/`.
- 2026-05-18: Sitemap route discovery currently walks live routable page/post block records.
- 2026-05-18: Worker media routes already use same-origin routes, R2, immutable cache headers, and `HEAD` parity for authored media.
- 2026-05-18: Cloudflare Workers docs confirm Wasm import support, no `WebAssembly.instantiateStreaming()`, no threading, 128 MB memory, 3 MB/10 MB Worker size limits, and 1 second startup limit.
- 2026-05-18: `@cf-wasm/resvg` package README documents the `@cf-wasm/resvg/workerd` import path for Cloudflare Workers/Pages.
- 2026-05-18: `@cf-wasm/resvg` workerd source imports a Wasm module and initializes `resvg`.
- 2026-05-18: `bun pm view @cf-wasm/resvg --json` reported version `0.3.4` and unpacked size `24484929`.
- 2026-05-18: `bun pm view @resvg/resvg-wasm --json` reported version `2.6.2` and unpacked size `2526600`.
- 2026-05-18: `bun pm view sharp --json` showed `sharp` is a native Node/libvips-shaped package with many platform optional dependencies, so it is not the Worker dependency path for this PRD.

## Status Notes

- SSI-01 is ready.
- Current chunk: SSI-01 ready.
- Implementation has not started.
- PRD only changed in this pass.
- No app behavior changed, so browser smoke was not required for this pass.
- Blockers are dependency measurement and generated settings UX validation.
