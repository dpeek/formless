# PRD 38: Public Site cutover cleanup

Status: ready
Current chunk: PSC-04 ready
Last updated: 2026-05-15

Start after PRD 34, PRD 35, PRD 36, and PRD 37 shipped behavior is stable on the active branch.

## Goal

Clean up the published public Site before swapping `https://dpeek.com` to `https://dpeek.twitchy.workers.dev/`.

The first version should:

- render route-specific document titles and metadata from existing Site tree data;
- avoid adding new Site block fields;
- keep `og:image` out of scope for now;
- serve favicon and touch icon assets correctly;
- serve package launch assets correctly when Formless runs outside the monorepo;
- serve real `robots.txt` and `sitemap.xml` responses;
- make public route behavior match a normal top-level website;
- keep generated app/admin shells off the public published host;
- make `HEAD` responses match public `GET` routing without a response body;
- preserve the old `/work` route with a redirect.

This PRD owns the final public-site launch hygiene pass.
It does not own content editing, new schema fields, image alt copy cleanup, project-owned static asset publishing, auth, or broader SEO tooling.

## Problem Statement

The published Site now SSR-renders real public content at top-level routes, but the surrounding document and routing behavior still look like a development runtime.

Current deployed behavior observed before this PRD:

- Public SSR pages render `<title>formless</title>`.
- Public SSR pages lack description, canonical, OpenGraph, and Twitter metadata.
- The static SPA shell still uses `<title>formless</title>`.
- `/robots.txt` and `/sitemap.xml` return HTML instead of text/XML resources.
- `/favicon.ico` and `/apple-touch-icon.png` return the SPA shell instead of icon assets.
- `/pages/home` returns the old preview SPA shell instead of redirecting to `/`.
- Published-profile app routes such as `/site`, `/tasks`, `/estii`, and `/schema` return a client shell instead of staying off the public host.
- `HEAD /` returns `404` while `GET /` returns the public Site document.
- The old live site has `/work`; the replacement Site uses `/projects`.

The domain cutover should not expose implementation names, stale preview routes, or missing launch files.

## Landed Context Since Draft

PRD 37 has shipped the first single-Site project loop.

Current shipped facts:

- The public package is `@dpeek/formless`.
- The shared UI package is `@dpeek/formless-ui`.
- The package exposes `bin/formless.js`.
- The package includes `index.html`, `public/`, `schema/`, `src/`, `vite.config.ts`, and `wrangler.jsonc`.
- `formless init <dir>` creates `formless.config.json`, `site.records.json`, and starter media.
- `formless dev` runs the package-owned Site authoring profile from the package root.
- `formless dev` sets `FORMLESS_SITE_PROJECT_ROOT` and `FORMLESS_SITE_PROJECT_ID`.
- `vite.config.ts` allows the package root, installed package `node_modules`, and the active Site project root.
- `formless publish` deploys code from the package root, restores project media, restores project records, and runs public smoke checks.
- Site project source media lives under project `media/`.
- Site project records live in project `site.records.json`.
- Project-owned general static asset directories are not part of the shipped project format.
- Repo `public/` currently contains `favicon.svg`; `favicon.ico` and `apple-touch-icon.png` still need this PRD.

This PRD must therefore avoid monorepo-only path assumptions.
Default launch assets should resolve from the package-owned `public/` directory, whether the package root is the repo root during development or an installed package under `node_modules`.
Project media remains separate and continues to flow through `media/` and `/api/site/media/*`.

## Solution

Use the existing public `SitePageTree` as the metadata source.

For successful public documents:

- the page title comes from `tree.page.label`;
- the meta description comes from `tree.page.body`;
- markdown is stripped before metadata is emitted;
- descriptions are normalized and truncated to a short search/social-friendly length;
- the home route uses only the Site name as the title;
- non-home routes use `<page label> | <site name>`;
- the Site name comes from existing public frame content, not a new field.

The first Site name source is the first primary header link label in the public frame.
The current content makes that `David Peek`.
If that lookup fails, fall back to the page label, then a generic `Site` title.

Add a small document metadata module so public SSR, not-found documents, and tests share one source of truth.
Do not add `seoTitle`, `seoDescription`, `seoImage`, or any other new Site block field in this PRD.

Serve launch assets and indexing resources deliberately:

- package-owned `public/` owns default `favicon.svg`, `favicon.ico`, and `apple-touch-icon.png` for this pass;
- in repo development, package-owned `public/` is repo `public/`;
- in `npx @dpeek/formless` use, package-owned `public/` is the installed package `public/`;
- launch asset serving, build, and publish paths resolve from the package root or deployed asset binding, not from the Site project cwd;
- Site project `media/` remains the source for authored image media and does not own launch icons in this PRD;
- `robots.txt` returns a plain text policy;
- `sitemap.xml` returns XML for public routable Site pages and posts;
- route redirects are handled by the Worker before static SPA fallback;
- generated admin/app routes return public 404 responses or are redirected only where explicitly listed.

## Source Map

Existing anchors:

- Current runtime docs: `doc/current.md`.
- Release target docs: `doc/roadmap.md`.
- Public Site SSR PRD: `prd/34-public-site-ssr.md`.
- Single Site project CLI PRD: `prd/37-single-site-project-cli-loop.md`.
- Current HTML shell: `index.html`.
- Static assets: `public/`.
- Cloudflare deploy config: `wrangler.jsonc`.
- Worker dispatch: `src/worker/index.ts`.
- Worker published document rendering: `src/worker/site-ssr.tsx`.
- Worker routing: `src/worker/routing.ts`.
- Published Site cache policy: `src/worker/site-cache.ts`.
- Public Site tree projection: `src/site/tree.ts`.
- Site route resolver: `src/site/route-resolver.ts`.
- Public Site route: `src/app/routes/site-page.tsx`.
- Public Site renderer: `src/app/site-renderer/renderer.tsx`.
- Public Site link helpers: `src/app/site-renderer/links.ts`.
- Public tree response types: `src/shared/protocol.ts`.
- Site project CLI: `src/site/cli.ts`.
- Site project config: `src/site/project-config.ts`.
- Site project source adapter: `src/site/project-source.ts`.
- Site project publish flow: `src/site/publish.ts`.
- Site project source media adapter: `src/site/source-media.ts`.
- Package build script: `scripts/build-package.ts`.
- Package CLI bin source: `scripts/formless-bin.ts`.
- Package manifest: `package.json`.
- UI package manifest: `lib/ui/package.json`.
- Vite package/project path config: `vite.config.ts`.
- SSR characterization tests: `src/site/public-site-ssr-characterization.test.tsx`.
- Site CLI tests: `src/site/cli.test.ts`.
- Worker routing tests: `src/worker/routing.test.ts`.
- Worker SSR tests: `src/worker/site-ssr.test.ts`.
- App render tests: `src/app.test.tsx`.

Owned files:

- `prd/38-public-site-cutover-cleanup.md`.

Likely changed files:

- `src/worker/site-ssr.tsx`.
- `src/worker/routing.ts`.
- `src/worker/index.ts`.
- `src/worker/site-cache.ts`.
- `src/site/tree.ts`.
- `src/shared/protocol.ts`.
- `src/site/cli.ts`.
- `src/site/publish.ts`.
- `index.html`.
- `wrangler.jsonc`.
- `package.json`.
- `scripts/build-package.ts`.
- `public/favicon.svg`.
- `public/favicon.ico`.
- `public/apple-touch-icon.png`.
- Tests near changed modules.

Possible changed files:

- `src/site/route-resolver.ts` only if sitemap route enumeration needs route normalization helpers.
- `src/app/site-renderer/renderer.tsx` only for the dark footer note contrast cleanup.
- `src/site/source-media.ts` only if favicon generation or restore support needs asset classification.
- `doc/current.md` and `doc/roadmap.md` only in a later docs steward pass.

## User Stories

1. As a visitor, I want each browser tab title to describe the current page, so that the Site feels finished.
2. As a visitor, I want shared links to show the right page title, so that the link preview is useful.
3. As a visitor, I want shared links to show a useful description, so that I know what I am opening.
4. As a visitor, I want the home page title to be the Site name, so that it does not say `Home | David Peek`.
5. As a visitor, I want subpage titles to include the page label and Site name, so that multiple tabs are easy to distinguish.
6. As a visitor, I want `/about`, `/blog`, `/projects`, `/resume`, and blog post routes to be clean top-level URLs, so that the Site behaves like a normal website.
7. As a visitor following old links, I want `/work` to redirect to the replacement work page, so that old `dpeek.com` links do not break.
8. As a visitor following old preview links, I want `/pages/home` to redirect to `/`, so that stale preview URLs recover cleanly.
9. As a visitor following old preview links, I want `/pages/<slug>` to redirect to `/<slug>`, so that stale preview URLs recover cleanly.
10. As a visitor, I want missing pages to return a real 404 document, so that broken links are clear.
11. As a visitor, I do not want public admin or generated app shells to appear on the public domain, so that implementation routes stay private.
12. As a visitor, I want a favicon in browser tabs, so that the Site is identifiable.
13. As a visitor on a mobile device, I want a touch icon, so that saved bookmarks look intentional.
14. As a crawler, I want `robots.txt` to be plain text, so that crawl policy is machine-readable.
15. As a crawler, I want `sitemap.xml` to be XML, so that public routes are discoverable.
16. As a link checker, I want `HEAD` to return the same status and headers as `GET`, so that health checks are accurate.
17. As the Site owner, I want metadata to use existing page content, so that I do not need extra SEO fields before launch.
18. As the Site owner, I want image metadata left alone for now, so that I can clean image labels through content editing.
19. As the runtime developer, I want metadata generation isolated in a testable module, so that later schema-backed SEO fields can plug in cleanly.
20. As the runtime developer, I want route hygiene isolated from the renderer, so that public routing remains easy to test.
21. As the runtime developer, I want favicon/static launch assets handled by the package static path, so that this PRD works in repo development and installed-package Site projects.
22. As the runtime developer, I want no new block fields in this PRD, so that the current flat content model stays stable for cutover.
23. As a Site project owner, I want `npx @dpeek/formless dev` and `npx @dpeek/formless publish` to serve launch assets without a monorepo checkout, so that the CLI path matches the product path.
24. As the runtime developer, I want launch assets and authored Site media to stay on separate paths, so that favicon handling does not disturb `/api/site/media/*`.

## Requirements

### Public Document Metadata

- Successful public SSR documents include a route-specific `<title>`.
- Successful public SSR documents include `<meta name="description">`.
- Successful public SSR documents include `<link rel="canonical">`.
- Successful public SSR documents include `og:title`.
- Successful public SSR documents include `og:description`.
- Successful public SSR documents include `og:type`.
- Successful public SSR documents include `og:url`.
- Successful public SSR documents include `og:site_name`.
- Successful public SSR documents include `twitter:card`.
- Successful public SSR documents do not include `og:image` in this PRD.
- Home title is the Site name.
- Non-home title is `<page label> | <site name>`.
- Not-found title is `Page not found | <site name>`.
- Error title is `Site page failed to load | <site name>`.
- Description text comes from the public page body when present.
- Description text strips markdown syntax before rendering in HTML metadata.
- Description text collapses whitespace.
- Description text is truncated deterministically.
- Missing page body falls back to a short Site default.
- Metadata values are HTML-escaped.
- Canonical URLs use the request origin and the published clean route.
- Canonical home URL ends at `/`.
- Canonical URLs do not use `/pages/*`.
- `og:type` is `article` for post detail routes and `website` for other public routes.
- Twitter card is `summary` until image metadata is added.

### Site Name Source

- The first Site name source is existing public frame content.
- The preferred source is the first primary header link label.
- The current content should resolve to `David Peek`.
- If no primary header label exists, fall back to the page label.
- If no page label exists, fall back to `Site`.
- No new Site block fields are added for Site name in this PRD.
- No environment variable is required for Site name in this PRD.

### Static Launch Assets

- `favicon.svg` continues to serve as an SVG favicon.
- `favicon.ico` returns icon bytes, not HTML.
- `apple-touch-icon.png` returns PNG bytes, not HTML.
- Launch icons live in package-owned `public/` for this PRD.
- Repo development uses repo `public/` as the package-owned static source.
- Installed package usage uses the installed package `public/` as the static source.
- Package publishing includes launch icon assets.
- `formless dev` serves launch icon assets when run from a Site project outside the monorepo.
- `formless publish` deploys launch icon assets from the package root when run from a Site project outside the monorepo.
- Static launch asset resolution does not depend on `process.cwd()` being the repo root.
- `FORMLESS_SITE_PROJECT_ROOT` is used for project access, not for default launch icon lookup.
- Project `media/` remains for authored Site media under `/api/site/media/*`.
- Project-owned custom `public/` overrides are out of scope for this PRD.
- The static asset routing path must not send these icon requests through Site document SSR.

### Robots And Sitemap

- `/robots.txt` returns `Content-Type: text/plain`.
- `/robots.txt` does not return the SPA shell.
- `/sitemap.xml` returns `Content-Type: application/xml` or `text/xml`.
- `/sitemap.xml` does not return the SPA shell.
- Sitemap entries use the public canonical origin.
- Sitemap entries include `/`.
- Sitemap entries include public page routes.
- Sitemap entries include dated public post routes.
- Sitemap entries exclude generated admin/app routes.
- Sitemap entries exclude `/pages/*` preview routes.
- Sitemap entries exclude drafts, unpublished dated content, deleted records, and non-routable blocks.
- Sitemap generation uses the same public visibility rules as public Site rendering.
- Sitemap generation is deterministic.
- Sitemap and robots responses have explicit cache headers.

### Public Route Hygiene

- `/` serves the Home page.
- `/about`, `/blog`, `/projects`, and `/resume` serve public SSR pages when those routes exist.
- `/blog/*` serves public post detail SSR pages when those routes exist.
- `/pages` redirects to `/`.
- `/pages/` redirects to `/`.
- `/pages/home` redirects to `/`.
- `/pages/home/` redirects to `/`.
- `/pages/*` redirects to the matching top-level route.
- `/work` redirects to `/projects`.
- `/work/` redirects to `/projects`.
- Generated app routes do not serve the static client shell on the public published host.
- `/site`, `/tasks`, `/estii`, `/rates`, `/schema`, and matching nested app routes return a public 404 unless a specific redirect is listed.
- Static assets continue to serve normally.
- API routes continue to dispatch normally.
- Non-HTML requests do not receive public document HTML unless they explicitly target a document route with an acceptable `Accept` header.

### HEAD Behavior

- Public document `HEAD` requests return the same status as matching `GET` requests.
- Public document `HEAD` responses include the same important headers as matching `GET` responses.
- Public document `HEAD` responses have an empty body.
- Media `HEAD` requests return the same status and headers as matching media `GET` requests.
- Missing route `HEAD` requests return 404 without a body.
- Redirect route `HEAD` requests return the matching redirect status and location without a body.

### Small Visual Cleanup

- Footer note text remains readable in dark mode.
- Image labels and alt text are not handled by this PRD; content cleanup owns descriptive image labels.

## Implementation Decisions

| ID      | Decision                                                                                | Reason                                                                                       |
| ------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| PSC-D1  | Do not add SEO-specific Site block fields in this PRD.                                  | The cutover needs launch hygiene, not content-model expansion.                               |
| PSC-D2  | Use the public page label for the page title source.                                    | The label already names the route for visitors and authors.                                  |
| PSC-D3  | Use the public page body for the description source.                                    | The body already stores concise page summary copy for regular pages.                         |
| PSC-D4  | Strip markdown and collapse whitespace before using body copy in metadata.              | Metadata should be plain text, not markdown or rendered HTML.                                |
| PSC-D5  | Use the first primary header link label as the Site name source.                        | The current content already stores `David Peek` there and no new field is needed.            |
| PSC-D6  | Fall back from header label to page label, then `Site`.                                 | Broken or minimal content should still produce valid documents.                              |
| PSC-D7  | Render no `og:image` until image metadata has a real content policy.                    | The user will first fix descriptive image labels, and no image field should be added yet.    |
| PSC-D8  | Keep Twitter cards as `summary`.                                                        | Without an image, large image cards would be misleading.                                     |
| PSC-D9  | Put default launch favicon assets in package-owned static assets for now.               | The same static source must work in repo development and installed-package Site projects.    |
| PSC-D10 | Leave custom Site-project-owned static asset overrides to a later PRD.                  | The shipped project format owns records and media, not a general public asset directory.     |
| PSC-D11 | Handle old preview routes with redirects instead of rendering preview shells publicly.  | The public domain should expose clean top-level URLs.                                        |
| PSC-D12 | Redirect old `/work` to `/projects`.                                                    | The existing `dpeek.com` route should survive the domain swap.                               |
| PSC-D13 | Return public 404s for generated app/admin routes on the published host.                | Implementation shells should not be discoverable as public pages.                            |
| PSC-D14 | Generate robots and sitemap responses through the Worker, not the SPA fallback.         | These are machine resources with specific content types.                                     |
| PSC-D15 | Build sitemap entries from public routable Site records.                                | Sitemap should reflect authored Site content and public visibility rules.                    |
| PSC-D16 | Support `HEAD` at the routing layer by reusing `GET` status/header decisions.           | Link checkers and monitors should see accurate status without downloading full documents.    |
| PSC-D17 | Keep schema-keyed API paths unchanged.                                                  | Cutover cleanup should not disturb authority, sync, media upload, or generated write routes. |
| PSC-D18 | Keep route metadata generation independent of React rendering.                          | Metadata should be testable without rendering the full page tree.                            |
| PSC-D19 | Treat dark footer note contrast as opportunistic cleanup inside this PRD.               | It is a small shipped public-site polish issue found during the cutover audit.               |
| PSC-D20 | Resolve launch assets from the package root or deployed asset binding, not project cwd. | `npx @dpeek/formless` now runs from external Site projects without a monorepo checkout.      |
| PSC-D21 | Keep launch icons separate from project source media.                                   | Project media restore/publish already owns `/api/site/media/*`; favicons are site chrome.    |

### Deep Modules

- **Published document metadata:** accepts public tree facts and request URL facts; returns title, description, canonical URL, OpenGraph tags, and Twitter tags.
- **Public launch route policy:** classifies public document, redirect, machine resource, API, asset, and blocked generated-app paths.
- **Public sitemap builder:** accepts routable public Site facts; returns deterministic sitemap entries and XML.
- **Head response adapter:** reuses document/media route decisions and strips response bodies for `HEAD`.
- **Package launch asset source:** ensures default public assets come from the Formless package static output in both monorepo and installed-package CLI flows.

## Testing Decisions

- Test external HTTP behavior, not private helper implementation.
- Metadata tests should assert the rendered document head for home, normal pages, posts, not-found pages, and error pages.
- Metadata tests should include markdown body stripping and whitespace normalization.
- Metadata tests should assert that `og:image` is absent.
- Route tests should assert redirect status and `Location` for `/pages`, `/pages/home`, `/pages/*`, and `/work`.
- Route tests should assert public 404 behavior for generated app/admin routes in the published profile.
- Static asset tests should assert favicon and touch icon routes do not return HTML.
- Robots and sitemap tests should assert content type, body shape, and route inclusion/exclusion.
- Sitemap tests should assert preview routes, app routes, drafts/unpublished posts, deleted records, and non-routable blocks are excluded.
- `HEAD` tests should assert status/header parity and empty bodies for success, redirect, not-found, and media routes.
- Package/outside-monorepo tests should assert launch icon assets are served or deployed from the package root when the cwd is an external Site project.
- Package/outside-monorepo tests should assert project `media/` is still used only for `/api/site/media/*`.
- Prior art exists in public SSR, worker routing, app render, and Site tree tests.
- Browser smoke with `bun browser ...` is required if public app behavior changes visibly.

## Dependencies

- PRD 34 public Site SSR must stay stable.
- PRD 35 regular pages and content lists must stay stable.
- PRD 36 slotted media and editorial blocks must stay stable.
- PRD 37 single-Site published profile behavior must stay stable.
- PRD 37 package/outside-monorepo CLI behavior must stay stable.
- Package publish surface must keep `public/`, `index.html`, `wrangler.jsonc`, `src/`, and `schema/` available to the CLI.
- Content image label cleanup is owned outside this PRD.

## Out Of Scope

- New Site block fields such as `seoTitle`, `seoDescription`, `seoImage`, or `noIndex`.
- `og:image`.
- Image alt text/content label cleanup.
- General SEO UI.
- RSS feeds.
- Search.
- Structured data / JSON-LD.
- Custom project-owned `public/` directory support.
- Custom per-project favicon upload.
- Production admin auth.
- Changing public page content.
- Changing the flat Site data model.
- Changing schema-keyed API paths.
- Changing the public renderer layout except the footer note contrast cleanup.

## Chunks

| ID     | Status  | Depends on           | Main files                                                             | Acceptance                                                                                                                                         |
| ------ | ------- | -------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| PSC-01 | shipped | none                 | metadata and SSR document code, SSR tests                              | Public SSR documents have route-specific title, description, canonical, OG, and Twitter tags from existing tree data; `og:image` is absent.        |
| PSC-02 | shipped | none                 | routing code, Worker dispatch, routing tests                           | Public profile redirects `/pages*` and `/work`, blocks generated app/admin shells, and keeps API/assets working.                                   |
| PSC-03 | shipped | PSC-02               | robots/sitemap code, Site tree/route helpers, tests                    | `/robots.txt` and `/sitemap.xml` return correct content types and public route data.                                                               |
| PSC-04 | ready   | PSC-02               | package static assets, Worker/static routing tests, package path tests | `favicon.svg`, `favicon.ico`, and `apple-touch-icon.png` return real icon assets from the package asset source in repo and external project flows. |
| PSC-05 | ready   | PSC-01 PSC-02 PSC-04 | HEAD response adapter and media/document tests                         | `HEAD` status/header behavior matches public `GET` routes without response bodies.                                                                 |
| PSC-06 | ready   | none                 | public renderer CSS/classes, app render tests                          | Footer note text is readable in dark mode.                                                                                                         |

## Status Notes

- 2026-05-15: PSC-01 shipped. `src/site/public-document-metadata.ts` builds public document metadata from `SitePageTree` facts and request origin. `src/worker/site-ssr.tsx` renders title, description, canonical URL, OG title/description/type/url/site_name, and Twitter card metadata for public SSR documents.
- 2026-05-15: PSC-01 keeps `og:image` absent and adds no Site block fields.
- 2026-05-15: PSC-02 shipped. Worker dispatch now redirects published `/pages`, `/pages/home`, `/pages/*`, and `/work` routes before API/static/document fallback.
- 2026-05-15: PSC-02 blocks generated app/admin client shell routes from published static fallback; API routes and asset-like paths still bypass Site document SSR.
- 2026-05-15: PSC-03 shipped. `src/site/public-indexing.ts` builds deterministic public route entries from live page blocks and dated post blocks, canonicalizes old `/pages/*` hrefs to clean public paths, validates candidates through `resolveSiteRoute`, and excludes API, generated app, and static-like paths.
- 2026-05-15: PSC-03 serves `/robots.txt` as plain text and `/sitemap.xml` as XML from current Site bootstrap records before static asset fallback.
- Decisions: no new PSC-03 decisions. Implementation follows PSC-D14 and PSC-D15.
- Blockers: none.

## Acceptance Checks

- `GET /` returns public HTML with title `David Peek`.
- `GET /projects` returns public HTML with title `Projects | David Peek`.
- `GET /blog/the-schema-is-the-app` returns public HTML with article metadata.
- `GET /pages/home` redirects to `/`.
- `GET /pages/projects` redirects to `/projects`.
- `GET /work` redirects to `/projects`.
- `GET /site` does not return the generated app shell on the published host.
- `GET /robots.txt` returns text, not HTML.
- `GET /sitemap.xml` returns XML, not HTML.
- `GET /favicon.svg` returns SVG from package static assets, not HTML.
- `GET /favicon.ico` returns icon bytes, not HTML.
- `GET /apple-touch-icon.png` returns PNG bytes, not HTML.
- `npx @dpeek/formless dev` from a Site project outside the monorepo can serve favicon and touch icon assets.
- `npx @dpeek/formless publish` from a Site project outside the monorepo deploys the package launch assets.
- `HEAD /` returns the same status and important headers as `GET /` with no body.
- Existing API routes keep working.
- Existing `/api/site/media/*` project media restore and serving keep working.
- Existing public SSR hydration keeps working.
- `.devstate/status.md` shows checks passing after implementation.

## Promote After Ship

- Public Site SSR documents include route metadata from existing Site tree facts: title, description, canonical URL, OG title/description/type/url/site_name, and Twitter card.
- Public Site SSR metadata uses the first primary header link label as the Site name when available, falls back through page label to `Site`, and does not emit `og:image`.
- Public Site uses clean top-level route redirects for old preview paths.
- Public Site serves `robots.txt` and `sitemap.xml` through Worker-generated indexing resources.
- Public Site serves favicon and touch icon assets.
- Package CLI Site projects outside the monorepo serve and publish default launch assets from package-owned `public/`.
- Published profile blocks generated app/admin shells from the public host.
- Public document and media routes support `HEAD`.

## Evidence

- 2026-05-15: `.devstate/status.md` reports checks ok and services running.
- 2026-05-15: `.devstate/logs/check-vite.txt` reports `vp check --fix` passed with no warnings, lint errors, or type errors.
- 2026-05-15: `.devstate/logs/service-test.txt` reports `src/worker/site-ssr.test.ts` passed, 11 tests.
- 2026-05-15: `./tmp/devstate.json`, `./tmp/test.txt`, and `./tmp/check.txt` were absent; devstate evidence is under `.devstate/`.
- 2026-05-15: `.devstate/status.md` reports checks ok and services running after PSC-02.
- 2026-05-15: `.devstate/logs/service-test.txt` reports `src/worker/site-ssr.test.ts` passed, 13 tests.
- 2026-05-15: `.devstate/logs/service-test.txt` reports `src/worker/routing.test.ts` passed, 10 tests.
- 2026-05-15: After rebase, `.devstate/logs/service-test.txt` reports 2 test files passed, 23 tests.
- 2026-05-15: `.devstate/logs/check-vite.txt` reports formatting completed and no warnings, lint errors, or type errors in 246 files.
- 2026-05-15: `./tmp/devstate.json`, `./tmp/test.txt`, and `./tmp/check.txt` were absent; devstate evidence is under `.devstate/`.
- 2026-05-15: Browser smoke `bun browser --session psc-02-dev --ignore-https-errors ... /pages/home` rendered the public preview with Home content and no page errors. Published-host browser smoke was unavailable because `published-site.*.formless.local` did not resolve locally; Worker routing and Miniflare tests cover published redirects and shell blocking.
- 2026-05-15: `.devstate/status.md` reports checks ok and services running after PSC-03.
- 2026-05-15: `.devstate/logs/service-test.txt` reports `src/worker/public-indexing.test.ts` passed, 2 tests.
- 2026-05-15: `.devstate/logs/check-vite.txt` reports formatting completed and no warnings, lint errors, or type errors in 250 files.
- 2026-05-15: `./tmp/devstate.json`, `./tmp/test.txt`, and `./tmp/check.txt` were absent; devstate evidence is under `.devstate/`.
- 2026-05-15: Browser smoke attempted `bun browser --session psc-03-indexing --ignore-https-errors open https://published-site.38-public-site-cutover-cleanup.formless.local/robots.txt`; local published-profile hostname failed with `net::ERR_NAME_NOT_RESOLVED`, so Miniflare Worker tests cover `/robots.txt` and `/sitemap.xml`.
- 2026-05-15: After rebase on local `main`, `.devstate/status.md` reports checks ok and services running.
- 2026-05-15: After rebase, `.devstate/logs/service-test.txt` reports 6 test files passed, 135 tests.
- 2026-05-15: After rebase, `.devstate/logs/check-vite.txt` reports formatting completed and no warnings, lint errors, or type errors in 250 files.
