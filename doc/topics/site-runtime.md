# Site Runtime

Last updated: 2026-05-19

## Current Facts

- Site source schema: `schema/apps/site/schema.json`.
- Site source seed records: `schema/apps/site/seed-records.json`.
- Site entities include `site`, `block`, and `blockPlacement`.
- Site data model is flat records.
- Dev admin route: `/site`.
- Dev schema route: `/site/schema`.
- Dev public page routes: `/pages`, `/pages/*`.
- `/pages` redirects to `/pages/home`.
- Site authoring profile uses generated admin at `/admin`.
- Published Site profile renders public pages at top-level routes.
- Public tree endpoint: `/api/site/tree/:slug`.
- Tree projection: `src/site/tree.ts`.
- Tree response types: `src/shared/protocol.ts`.
- Public route source: `src/app/routes/site-page.tsx`.
- Renderer source: `src/app/site-renderer/renderer.tsx`.
- Published Worker SSR source: `src/worker/site-ssr.tsx`.

## Records And Tree

- `block.type` drives public rendering and generated editor variants.
- `blockPlacement.parent` is the parent block.
- `blockPlacement.block` is the child block.
- `blockPlacement.slot`, `order`, and `visible` control placement.
- Public tree excludes drafts, archived blocks, invisible placements, and tombstoned records.
- Missing children and cycles become tree metadata warnings.
- Header and footer use nested groups and reusable link blocks.
- Public Site tree responses can include frame roots, route facts, public metadata, and indexing facts.
- Site link blocks distinguish internal and external targets.
- Internal Site links resolve through target block references.
- External Site links require absolute URLs.

## Site Authoring

- Primary Site admin screens are `siteEditor` and `siteSettings`.
- `siteCompositionHome` sidebar groups root selection by Pages, Posts, Projects, and Navigation.
- Site editor root selection uses generated list/detail context presentation.
- Raw Blocks and Placements stay non-primary admin/setup views.
- Site placement table can edit referenced child blocks.
- Site placement table supports generated ordering controls.
- Tree placement cards remove placements without deleting child blocks.
- Generated view fields can declare `visibleWhen` conditions for target-specific editing.

## Media And Icons

- Site media route code: `src/worker/media.ts`.
- Site client media helper: `src/client/media.ts`.
- Source media helpers: `src/site/source-media.ts`.
- Media records are `block` records.
- Image blocks store the served media URL in `block.href`.
- Public image rendering uses the same Site tree and renderer path as authored image URLs.
- Site icon source helpers: `src/site/site-icon-source.ts`.
- Dynamic Worker icon routes: `src/worker/site-icons.ts`.
- ICO encoding: `src/site/ico.ts`.

## Public Output

- Public route resolution: `src/site/route-resolver.ts`.
- Public document metadata: `src/site/public-document-metadata.ts`.
- Public indexing: `src/site/public-indexing.ts`, `src/worker/public-indexing.ts`.
- Public SSR uses embedded initial `SitePageTree` for hydration.
- Generated admin routes remain client-rendered.

## Key Tests

- Site tree tests: `src/site/tree.test.ts`.
- Public Site route tests: `src/app/routes/site-page.test.tsx`.
- Public renderer tests: `src/app.test.tsx`.
- Site renderer link tests: `src/app/site-renderer/links.test.ts`.
- Worker SSR tests: `src/worker/site-ssr.test.ts`.
- Site media tests: `src/worker/media.test.ts`, `src/client/media.test.ts`.
- Source media tests: `src/site/source-media.test.ts`.
- Site link target tests: `src/site/link-targets.test.ts`.
- Public indexing tests: `src/site/public-indexing.test.ts`, `src/worker/public-indexing.test.ts`.
- Public document metadata tests: `src/site/public-document-metadata.test.ts`.
- Site icon tests: `src/site/site-icon-source.test.ts`, `src/site/ico.test.ts`.
