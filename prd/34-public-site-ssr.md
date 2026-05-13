# PRD 34: Public Site SSR

Status: ready
Current chunk: PSSR-04 ready
Last updated: 2026-05-13

## Goal

Render published Site pages on the server so first paint does not wait for the browser SPA boot, route chunk load, and public tree fetch.

The first version should:

- SSR published Site pages only;
- keep generated admin routes client-rendered;
- reuse the existing public Site tree projection;
- hydrate the server-rendered Site page in the browser;
- keep preview routes working at `/pages/*`;
- preserve schema-keyed API paths and authority storage;
- add explicit Worker document-route behavior for published Site pages;
- define cache behavior for rendered HTML and public tree reads.

This PRD owns published Site SSR.
It does not own generated app SSR, Site authoring, link target semantics, media upload, or a general full-stack routing framework.

## Problem Statement

The deployed Site currently behaves like an SPA.

Current behavior:

- `index.html` contains an empty app root.
- The browser entry mounts React with `createRoot`.
- Cloudflare assets use SPA not-found fallback.
- The Worker runs first only for `/api/*`.
- Non-API document routes are served by static assets.
- Published Site route matching happens in the browser runtime profile.
- Published Site pages render a loading state first.
- The browser then fetches `/api/site/tree/:slug`.
- The public renderer renders after that fetch returns.

This delays useful first paint for published Site pages.
It also means crawlers and no-JavaScript clients do not receive the page content in the initial document.

The public Site already has a clean server-readable boundary:

- the authority builds the public `SitePageTree`;
- the renderer consumes `SitePageTree`;
- public chrome work kept browser-only behavior out of the initial render path.

The missing piece is route-level Worker SSR and browser hydration.

## Solution

Add a published Site document-rendering path in the Cloudflare Worker.

For published Site requests, the Worker resolves the slug, reads the Site public tree through the same authority-backed projection, renders the public Site renderer to HTML, and returns a full HTML document.

The browser then hydrates that document instead of replacing an empty root.
The server embeds the initial `SitePageTree` in the document so the client does not need an immediate duplicate tree fetch before first paint.

Preview routes stay client-rendered for now.
Generated app routes stay client-rendered for now.
Schema-keyed API paths stay unchanged.

## Source Map

Existing anchors:

- Current runtime docs: `doc/current.md`.
- Release target docs: `doc/roadmap.md`.
- Runtime profile PRD: `prd/17-runtime-profiles-and-screen-routes.md`.
- Public Site chrome PRD: `prd/24-public-site-chrome-polish.md`.
- Site editing/publish workflow PRD: `prd/26-site-editing-publish-workflow.md`.
- Current HTML shell: `index.html`.
- Vite and Cloudflare plugin config: `vite.config.ts`.
- Cloudflare deploy config: `wrangler.jsonc`.
- Browser entry: `src/main.tsx`.
- App route shell: `src/app.tsx`.
- Runtime profile resolver: `src/app/runtime-profile.ts`.
- Public Site route: `src/app/routes/site-page.tsx`.
- Public Site renderer: `src/app/site-renderer/renderer.tsx`.
- Public Site link helpers: `src/app/site-renderer/links.ts`.
- Public Site tree projection: `src/site/tree.ts`.
- Site route resolver: `src/site/route-resolver.ts`.
- Worker dispatch: `src/worker/index.ts`.
- Authority route handling: `src/worker/authority.ts`.
- Authority operation module: `src/worker/authority-operations.ts`.
- Public tree response types: `src/shared/protocol.ts`.
- App tests: `src/app.test.tsx`.
- Site route tests: `src/app/routes/site-page.test.tsx`.
- Site tree tests: `src/site/tree.test.ts`.
- Authority tests: `src/worker/authority.test.ts`.

Owned files:

- `prd/34-public-site-ssr.md`.

Likely changed files:

- `wrangler.jsonc`.
- `src/worker/index.ts`.
- `src/main.tsx`.
- `src/app/routes/site-page.tsx`.
- `src/app/site-renderer/renderer.tsx`.
- `src/app/runtime-profile.ts`.
- `src/app.test.tsx`.
- `src/app/routes/site-page.test.tsx`.
- `src/worker/authority.test.ts`.

Possible changed files:

- `index.html`.
- `vite.config.ts`.
- `src/worker/site-ssr.tsx`.
- `src/worker/site-document.ts`.
- `src/app/site-renderer/initial-tree.ts`.
- `src/site/tree.ts` only if a tiny SSR adapter is needed.
- `src/shared/protocol.ts` only if the initial payload needs an explicit envelope type.

## User Stories

1. As a Site visitor, I want the page content in the first HTML response, so that the page paints before JavaScript finishes loading.
2. As a Site visitor on a slow connection, I want useful content before route chunks execute, so that the Site feels responsive.
3. As a Site visitor with JavaScript disabled, I want readable published page content, so that the Site is not blank.
4. As a Site visitor, I want `/` to render the Home page on the server, so that the published root is fast.
5. As a Site visitor, I want nested paths to render the matching Site route on the server, so that direct links are fast.
6. As a Site visitor, I want missing pages to return a real not-found document, so that broken links are clear.
7. As a Site visitor, I want server-rendered links to use published paths, so that navigation stays clean.
8. As a Site visitor, I want client navigation after hydration to keep working, so that the Site still behaves like a React app.
9. As a Site author, I want published pages to use the same public tree projection as preview, so that SSR does not publish different content.
10. As a Site author, I want drafts, archived blocks, invisible placements, and tombstoned records excluded from SSR output, so that public visibility rules stay intact.
11. As a Site author, I want recent writes to become visible on published pages according to a defined cache policy, so that updates are predictable.
12. As a Site author, I want preview routes to keep using current live preview behavior, so that editing feedback is not slowed by published cache decisions.
13. As a runtime developer, I want SSR to reuse `SitePageRenderer`, so that browser and server markup do not drift.
14. As a runtime developer, I want the initial `SitePageTree` serialized once into the document, so that hydration does not refetch before first paint.
15. As a runtime developer, I want hydration mismatch tests, so that server and client render the same public markup.
16. As a runtime developer, I want Worker document routing isolated from API routing, so that schema-keyed API paths stay stable.
17. As a runtime developer, I want static assets to keep bypassing SSR, so that JS, CSS, images, and favicon responses stay efficient.
18. As a runtime developer, I want cache headers covered by tests, so that SSR does not silently add stale or uncached behavior.
19. As a runtime developer, I want generated admin routes out of this scope, so that IndexedDB bootstrap and authoring state do not block the first SSR slice.
20. As a runtime developer, I want browser smoke against the published Site profile, so that deployed route shape and hydration are verified together.

## Requirements

### Published Route SSR

- Published Site profile renders documents through the Worker.
- `/` resolves to slug `home`.
- Non-API, non-asset top-level paths resolve to public Site slugs.
- Server slug normalization matches the browser public Site route.
- Server rendering uses the existing public Site tree projection.
- Server rendering uses the existing public Site renderer.
- Server rendering uses published link mode.
- Missing public pages return a not-found HTML document.
- Missing public pages use the same not-found copy as the current public route where practical.
- Server errors return readable error HTML without exposing sensitive details.
- `/api/:schemaKey/*` routes keep their current authority dispatch behavior.
- Static assets keep serving as static assets.
- Dev preview routes at `/pages/*` keep current client-rendered behavior unless a later chunk explicitly changes them.

### HTML Document

- The server returns a complete HTML document.
- The document includes the rendered public Site markup inside the app root.
- The document includes the client module needed for hydration.
- The document includes the current CSS asset links.
- The document keeps the existing favicon.
- The document includes viewport metadata.
- The document title can stay generic in the first slice unless route metadata already exists.
- The document serializes the initial `SitePageTree` safely.
- Serialized initial data must not allow script injection through Site content.
- The serialized initial data format is versioned or narrowly scoped enough to change later.

### Hydration

- The browser entry uses `hydrateRoot` when server-rendered markup is present.
- The browser entry can still use client rendering for non-SSR shells if needed.
- Hydrated public Site pages start from the embedded `SitePageTree`.
- Hydrated public Site pages do not show the loading state before using embedded data.
- Hydrated public Site pages do not refetch the active tree before first paint.
- Hydrated public Site pages may refetch later if the route changes or a refresh policy requires it.
- Theme initial render stays deterministic on the server.
- Browser-only theme persistence still runs after hydration.
- Public Site interactions, including theme toggle and links, still work after hydration.

### Cache Behavior

- Published SSR HTML has explicit cache headers.
- Public tree reads keep explicit cache behavior compatible with SSR.
- Cache behavior must account for Site writes and source resets.
- The first slice may use a short TTL instead of active purge.
- Cache policy must be documented in this PRD before implementation ships.
- 404 responses have explicit cache behavior.
- Error responses are not cached as successful page content.
- API write responses are not cached.
- Preview routes are not governed by published SSR HTML cache policy.

### Deployment Behavior

- Cloudflare routing sends published document routes to the Worker before SPA fallback.
- Worker routing distinguishes API requests, assets, and published Site document requests.
- Existing local dev through `devstate` keeps working.
- Existing deploy script remains `vp build && wrangler deploy` unless build output requires a small script change.
- SSR should not require a Node server.
- SSR must run in the Cloudflare Workers runtime.

### Performance Behavior

- First HTML response contains meaningful page content.
- Initial published Site paint does not require `/api/site/tree/:slug` from the browser.
- Hydration should avoid loading generated admin route chunks for published Site pages where practical.
- SSR should not make every static asset request touch Durable Object storage.
- SSR should not add a second authority read when the Worker can already build or fetch the tree once.
- Performance evidence should compare current SPA first paint against SSR first paint with a simple repeatable measurement.

## Implementation Decisions

| ID       | Decision                                                                                                 | Reason                                                                                                                       | Evidence                                                                |
| -------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| PSSR-D1  | Create a new PRD for SSR.                                                                                | SSR changes Worker routing, response shape, hydration, and cache behavior.                                                   | `prd/24-public-site-chrome-polish.md` deferred SSR to a future PRD.     |
| PSSR-D2  | SSR published Site pages first.                                                                          | Public Site already has a server-readable tree and renderer boundary.                                                        | `src/site/tree.ts`, `src/app/site-renderer/renderer.tsx`                |
| PSSR-D3  | Keep generated admin routes client-rendered.                                                             | Admin routes depend on IndexedDB, browser replica bootstrap, generated state, and push sync.                                 | `src/app/routes/home.tsx`, `src/client/db.ts`, `src/client/sync.ts`     |
| PSSR-D4  | Reuse `SitePageTree` as the SSR data contract.                                                           | The public route already fetches this shape and the renderer already consumes it.                                            | `src/app/routes/site-page.tsx`, `src/shared/protocol.ts`                |
| PSSR-D5  | Hydrate instead of replacing server markup.                                                              | Replacing the markup would lose the first-paint benefit and risk visible layout churn.                                       | `src/main.tsx` currently uses `createRoot`.                             |
| PSSR-D6  | Embed initial tree data in the document.                                                                 | The browser should not refetch the same tree before first paint.                                                             | Current public route fetches `/api/site/tree/:slug` after mount.        |
| PSSR-D7  | Keep schema-keyed API routes unchanged.                                                                  | API route stability protects storage, sync, writes, and existing clients.                                                    | `doc/current.md`, `src/worker/index.ts`                                 |
| PSSR-D8  | Keep preview live behavior out of the first SSR slice.                                                   | Preview uses push-sync invalidation and should remain optimized for editing feedback.                                        | `prd/26-site-editing-publish-workflow.md`                               |
| PSSR-D9  | Put document routing in a small Worker SSR adapter.                                                      | API dispatch, asset handling, slug resolution, and HTML rendering should stay separately tested.                             | `src/worker/index.ts`, `src/worker/authority-operations.ts`             |
| PSSR-D10 | Define cache policy before shipping SSR.                                                                 | SSR can improve paint while hurting freshness or TTFB if cache behavior is undefined.                                        | User direction 2026-05-13                                               |
| PSSR-D11 | Treat Cloudflare Worker compatibility as a requirement.                                                  | The deploy target is Workers with Durable Objects, not a Node SSR server.                                                    | `wrangler.jsonc`, `src/worker/authority.ts`                             |
| PSSR-D12 | Leave route metadata and SEO enrichment for later unless trivial.                                        | The first value is first paint; richer metadata can build on the SSR document later.                                         | Current public tree has route/page facts but no full metadata contract. |
| PSSR-D13 | Load SSR page data through the existing Site authority tree route.                                       | This keeps SSR on the same `SitePageTree` projection as preview and avoids duplicating storage reads outside the authority.  | `src/worker/site-ssr.tsx`, `src/worker/site-ssr.test.ts`                |
| PSSR-D14 | Render Worker SSR with `react-dom/server.edge` stream rendering.                                         | React string rendering falls back to a browser legacy renderer; the edge stream API matches the Cloudflare runtime.          | `src/worker/site-ssr.tsx`, `src/worker/site-ssr.test.ts`                |
| PSSR-D15 | Keep `/api/*`, `/pages/*`, asset-like paths, and non-HTML requests outside the PSSR-02 document adapter. | API dispatch, preview routes, and static asset routing must stay isolated until the explicit Worker routing chunk.           | `src/worker/site-ssr.tsx`                                               |
| PSSR-D16 | Hydrate when the browser app root already contains SSR markup; keep `createRoot` for empty SPA shells.   | Published pages must preserve server markup, while generated admin and preview shells still need the old client-render path. | `src/main.tsx`, `src/site/public-site-ssr-characterization.test.tsx`    |
| PSSR-D17 | Embed a narrowly scoped `formless.sitePageTree` JSON payload in successful SSR documents.                | The route can start from the exact tree the Worker rendered and avoid the first duplicate public tree fetch.                 | `src/app/site-renderer/initial-tree.ts`, `src/worker/site-ssr.test.ts`  |
| PSSR-D18 | Load the public Site route eagerly in the default app route components.                                  | Hydration should render `SitePageRoute` immediately instead of showing a Suspense loading fallback over SSR markup.          | `src/app.tsx`, `src/app.test.tsx`                                       |

### Deep Modules

- **Published Site document renderer:** accepts a URL, environment bindings, and asset manifest facts; returns an HTML `Response`.
- **Site SSR tree loader:** resolves a published slug and returns either a `SitePageTree`, not-found state, or error state.
- **Initial Site tree handoff:** owns safe serialization and browser readback of the embedded `SitePageTree`.
- **Published Site cache policy:** maps successful pages, not-found pages, and errors to headers in one testable place.

These modules should expose small interfaces and keep authority storage details outside the React renderer.

## Testing Decisions

- Test SSR through Worker responses, not by asserting private helper call order.
- Test HTML contains page content, header, footer, and no initial loading message for a successful page.
- Test `/` renders the home tree in published mode.
- Test nested public slugs render their matching tree.
- Test missing pages return a not-found status and readable not-found HTML.
- Test server-rendered links use published paths.
- Test serialized initial tree data escapes hostile text safely.
- Test hydration uses embedded initial data and does not immediately call `/api/site/tree/:slug`.
- Test theme render has deterministic server markup and still updates from browser preference after hydration.
- Test API routes still dispatch to the authority.
- Test static assets do not render Site HTML.
- Test cache headers for successful pages, not-found pages, and errors.
- Reuse existing app rendered-markup tests for public renderer behavior.
- Reuse existing Site tree tests for projection and visibility behavior.
- Add Worker route tests near existing authority route coverage.
- Browser smoke should open the published Site root, verify visible content before hydration settles where practical, check no page errors, and confirm hydration leaves interactions working.

## Chunks

| ID      | Status  | Depends on | Main files                      | Acceptance                                                                                                    |
| ------- | ------- | ---------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| PSSR-01 | shipped | none       | tests, PRD                      | Characterize current SPA first-paint path and lock current published Site routing/loading behavior.           |
| PSSR-02 | shipped | PSSR-01    | worker SSR adapter, tests       | Worker can return server-rendered HTML for published `/` and nested Site slugs using the public tree.         |
| PSSR-03 | shipped | PSSR-02    | browser entry, route, tests     | Browser hydrates SSR markup from embedded `SitePageTree` without an immediate duplicate tree fetch.           |
| PSSR-04 | ready   | PSSR-03    | Worker routing, wrangler, tests | Cloudflare routing sends published documents to Worker while API routes and assets keep existing behavior.    |
| PSSR-05 | ready   | PSSR-04    | cache policy, tests             | Successful, not-found, and error SSR responses have explicit cache headers and documented freshness tradeoff. |
| PSSR-06 | ready   | PSSR-05    | browser smoke, PRD              | Published Site smoke confirms content, hydration, links, theme toggle, no page errors, and PRD evidence.      |

## Out of Scope

- Do not SSR generated admin routes.
- Do not SSR schema editor routes.
- Do not replace the browser replica model.
- Do not change Site storage shape.
- Do not change the public tree response shape unless initial data needs a narrow envelope.
- Do not add users, permissions, or tenant routing.
- Do not add a general full-stack router.
- Do not add a general metadata/SEO DSL.
- Do not add active cache purge unless short TTL is insufficient.
- Do not change Site link target semantics.
- Do not change media upload behavior.
- Do not change source schemas unless a minimal SSR test fixture requires it.

## Promote after ship

- PSSR-01: no global doc promotion; characterization-only baseline for later SSR chunks.
- `doc/current.md`: note published Site pages render through Worker SSR.
- PSSR-02: promote Worker SSR document adapter facts after hydration/routing chunks decide final route exposure.
- PSSR-03: promote public Site hydration facts after PSSR-04 exposes the document route through Cloudflare routing.
- `doc/current.md`: note public Site hydration uses embedded initial `SitePageTree`.
- `doc/current.md`: note published SSR cache policy and status behavior.
- `doc/current.md`: note generated admin routes remain client-rendered.
- `doc/roadmap.md`: note published Site pages should SSR in the first-release target if shipped before release.

## Blockers

- Need implementation-time confirmation of the Cloudflare asset binding or manifest shape produced by the current Vite/Cloudflare build.
- PSSR-02 did not close the asset manifest blocker; the first document shell still references the current dev client module path and PSSR-04 must confirm production asset routing.
- PSSR-03 browser smoke confirmed current dev asset routing still serves the SPA document without embedded tree data until PSSR-04 changes Worker-first document routing.
- Need cache policy choice before PSSR-05 ships: short TTL only, explicit purge, or no-store for the first release.

## Evidence

- 2026-05-13: User asked what SSR would require to minimize time to first paint.
- 2026-05-13: Repo inspection found current deploy is SPA-shaped: empty `index.html` app root, `createRoot` browser entry, Cloudflare SPA fallback, and Worker-first only for `/api/*`.
- 2026-05-13: Repo inspection found public Site pages already use `SitePageTree` from `/api/site/tree/:slug` and render through `SitePageRenderer`.
- 2026-05-13: User asked whether this should be a new PRD or rolled into an existing one.
- 2026-05-13: Decision: make this a new PRD because SSR owns Worker route-level rendering, hydration, cache behavior, and response shape.
- 2026-05-13: PRD created as `prd/34-public-site-ssr.md`.
- 2026-05-13: PSSR-01 shipped. Added `src/site/public-site-ssr-characterization.test.tsx` to lock the current empty SPA document shell, `createRoot` browser mount, Cloudflare SPA fallback with Worker-first `/api/*` only, published Site loading shell for `/` and nested slugs, and the current single `/api/site/tree/:slug` read before public content renders.
- 2026-05-13: PSSR-01 check evidence: `devstate start` and final `devstate check` reported checks ok, web service ready at `https://34-public-site-ssr.formless.local`, and test watcher passing. `./tmp/devstate.json`, `./tmp/test.txt`, and `./tmp/check.txt` were absent in this checkout, so `.devstate/status.md`, `.devstate/status.json`, `.devstate/logs/service-test.txt`, and `.devstate/logs/check-vite.txt` were used. Watcher reran `src/site/public-site-ssr-characterization.test.tsx` with 5 tests passing. `check-vite` reported no formatting, lint, or type errors in 222 files.
- 2026-05-13: PSSR-02 shipped. Added `src/worker/site-ssr.tsx` and Worker dispatch integration so HTML document requests can fetch `/api/site/tree/:slug` through the Site authority, render `SitePageRenderer` in published link mode, and return a full HTML document for `/`, nested slugs, not-found, and error states.
- 2026-05-13: PSSR-02 tests added in `src/worker/site-ssr.test.ts`: published `/` returns server-rendered Home HTML with header/footer and no loading text; `/blog/shipping-schema-backed-authoring` returns nested published HTML with published links; a page created through `/api/site/mutations` is visible through SSR, proving the adapter reads the current authority tree.
- 2026-05-13: PSSR-02 check evidence: `devstate start` and `.devstate/status.md` reported checks ok, web service ready at `https://34-public-site-ssr.formless.local`, and test watcher passing. `.devstate/logs/service-test.txt` reported 49 files and 696 tests passing after restart, then reran affected Worker tests with 5 files and 131 tests passing. `.devstate/logs/check-vite.txt` reported no formatting, lint, or type errors in 224 files.
- 2026-05-13: PSSR-02 browser smoke: `bun browser --session pssr02 --ignore-https-errors open https://34-public-site-ssr.formless.local/` under the published Site profile showed David Peek, Code is magic, and Greetings, Robot content with no page errors. The smoke confirmed the explicit `streams_enable_constructors` Wrangler flag was wrong for the repo's 2026 compatibility date; the final implementation keeps Wrangler unchanged and passes that compatibility date only to the Miniflare SSR test harness.
- 2026-05-13: PSSR-03 shipped. Added `src/app/site-renderer/initial-tree.ts` for safely escaped, versioned initial `SitePageTree` handoff; `src/worker/site-ssr.tsx` embeds that payload in successful SSR documents; `src/main.tsx` hydrates non-empty app roots; `src/app/routes/site-page.tsx` starts published sessions from matching embedded tree data; `src/app.tsx` loads the public Site route eagerly for hydration.
- 2026-05-13: PSSR-03 tests added and updated in `src/app/routes/site-page.test.tsx`, `src/worker/site-ssr.test.ts`, `src/app.test.tsx`, and `src/site/public-site-ssr-characterization.test.tsx`. Coverage includes matching embedded tree readback, hostile `</script>` escaping, no duplicate initial fetch when a published session receives embedded tree data, SSR document payload embedding, and published route markup equality with hydrated ready state.
- 2026-05-13: PSSR-03 check evidence: `devstate start`, final `devstate check`, and `.devstate/status.md` reported checks ok, web service ready at `https://34-public-site-ssr.formless.local`, and test watcher passing. `./tmp/devstate.json`, `./tmp/test.txt`, and `./tmp/check.txt` were absent in this checkout. `.devstate/logs/service-test.txt` reran `src/app.test.tsx` with 1 file and 132 tests passing after the final markup alignment. `.devstate/logs/check-vite.txt` reported formatting complete and no warnings, lint errors, or type errors in 225 files.
- 2026-05-13: PSSR-03 browser smoke: `bun browser --session pssr03 --ignore-https-errors batch --bail ...` opened `https://34-public-site-ssr.formless.local/`, rendered David Peek, Code is magic, and Greetings, Robot content, and `bun browser --session pssr03 errors` returned no page errors. The smoke still saw `/api/site/tree/home` fetches because PSSR-04 has not yet changed Cloudflare routing to serve the Worker SSR document with embedded tree data.
