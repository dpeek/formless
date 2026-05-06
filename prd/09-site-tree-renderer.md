# PRD 05: Block tree projection and renderer

Status: shipped
Current chunk: none
Last updated: 2026-05-06

## Goal

Move the site app to a block model, then turn flat block records into a nested tree that a frontend can render.

The first version should:

- rename `contentItem` to `block`;
- rename `contentPlacement` to `blockPlacement`;
- fold media into `block`;
- use `block.type` as the renderer-facing discriminator;
- use `blockPlacement.parent` as the containment edge;
- use `blockPlacement.block` as the child block reference;
- support named placement slots and numeric order;
- expose a filtered public read model for one page;
- render the first public site route with a small custom renderer;
- keep stored records flat.

This PRD is about the site block model, public read model, and first renderer. It is not a general layout DSL.

## Problem

The site authoring app currently has three entities:

- `contentItem`
- `contentPlacement`
- `mediaAsset`

That worked as a first authoring shape, but the terms are now fighting the model.

The thing being composed is a block. Pages, posts, groups, links, markdown, images, videos, query lists, heroes, and CTAs are all renderable blocks. A placement says where one block appears under another block.

The current split creates awkward cases:

- Media is reusable and renderable, but it is not a block.
- `contentItem.kind = block` is too vague when every renderable thing is a block.
- `contentPlacement.item` points at renderable content, but the field name hides the child-block relationship.
- Slot values are enum-bound today, but templates may need named slots like `header`, `main`, `footer`, `social`, `lead`, or `sidebar`.
- The frontend still needs a nested tree, not raw admin records.

The storage model should stay flat. The names should match the actual model.

## Existing support

### Site authoring model

Status: shipped.

Evidence:

- Site schema: `schema/apps/site/schema.json`.
- Site seeds: `schema/apps/site/seed-records.json`.
- Site PRD: `prd/03-personal-site-authoring.md`.

Current behavior:

- `contentItem` stores pages, posts, projects, links, blocks, groups, and profile records.
- `contentPlacement` stores ordered composition rows.
- `contentPlacement.parent` points at the content item being composed.
- `contentPlacement.item` can point at another content item.
- `contentPlacement.media` can point at a media asset.
- `mediaAsset` stores image/video/file metadata.
- Header and footer navigation are represented as groups plus placements.
- The site admin route is `/site`.
- The site schema editor route is `/site/schema`.

### Relationship metadata

Status: shipped through REL-04.

Evidence:

- Relationship PRD: `prd/04-relationships.md`.
- Relationship parser: `src/shared/schema-relationships.ts`.
- Site relationship names in `schema/apps/site/schema.json`.
- View model relationship support in `src/client/views.ts`.

Current behavior:

- `placementParent` names `contentPlacement.parent`.
- `contentPlacements` names the inverse from `contentItem` to child placements.
- The Blocks workspace uses `contentPlacements`.
- Related placement counts render in admin.
- Related create defaults still use context defaults.

Needed after the rename:

- Rename relationship metadata to the block terms.
- Keep the relationship shape the same: one `block` has many `blockPlacement` rows through `blockPlacement.parent`.
- Keep related collection behavior in admin.

### Public routes

Status: missing.

Current behavior:

- The worker only routes `/api/:schemaKey/...` to the authority.
- The React app only has generated admin routes.
- There is no public site page route.
- There is no public page tree endpoint.

## Requirements

### Data model

- Keep records flat.
- Do not add array fields to `block`.
- Do not materialize child IDs on parent blocks.
- Replace `contentItem` with `block`.
- Replace `contentPlacement` with `blockPlacement`.
- Remove `mediaAsset`; media records become `block` records.
- Use `blockPlacement.parent` for containment.
- Use `blockPlacement.block` for the child block.
- Ordering is derived from `blockPlacement.slot`, then `blockPlacement.order`, then stable record creation order or id.

### Block entity

Entity: `block`.

Fields:

- `type`: enum, required.
- `title`: text, required.
- `label`: text, optional.
- `subtitle`: text, optional.
- `body`: text, optional, markdown-capable.
- `slug`: text, optional.
- `href`: text, optional.
- `icon`: text, optional.
- `color`: text, optional.
- `status`: enum, required.
- `featured`: boolean, required.
- `publishedAt`: date, optional.
- `templateKey`: text, optional.
- `assetKey`: text, optional.
- `alt`: text, optional.
- `width`: number, optional.
- `height`: number, optional.
- `meta`: optional, if implementation chooses a text-backed JSON field first.

Initial `block.type` values:

- `page`
- `post`
- `project`
- `profile`
- `group`
- `link`
- `markdown`
- `hero`
- `contentList`
- `contentGrid`
- `image`
- `video`
- `file`
- `cta`
- `subscribe`
- `custom`

Notes:

- `type` is a field name inside the `block` entity. The JSON will contain `"type": { "type": "enum" }`; tests should cover this so it does not regress.
- Media block fields can stay empty for non-media blocks.
- `assetKey` replaces `mediaAsset.key`.
- `href` can hold external links and file URLs.
- `meta` should not block the rename. True JSON storage requires protocol and field-type work because record values currently store strings, booleans, and numbers only.

### Block placement entity

Entity: `blockPlacement`.

Fields:

- `parent`: reference to `block`, required.
- `block`: reference to `block`, required.
- `slot`: text, required, slug-like.
- `order`: number, required.
- `visible`: boolean, required.
- `variant`: text, optional.
- `label`: text, optional.
- `meta`: optional, if implementation chooses a text-backed JSON field first.

Notes:

- `slot` is a named slot, not an enum.
- Templates and renderers can look for slots by name.
- `order` controls sibling order inside a slot.
- Placement-level `variant` and `meta` are optional renderer hints.
- Placement-level title/subtitle overrides should wait until the first renderer proves they are needed.

### Tree projection

- Build a `SitePageTree` from active site records.
- Root lookup starts from a published `block` where `type = page` and `slug` matches the route.
- The root node includes the page block and child placements.
- Each placement node includes:
  - the placement record;
  - the child block;
  - child placements for the child block;
  - query results for `contentList` and `contentGrid` blocks.
- Invisible placements are excluded.
- Draft and archived blocks are excluded from public output unless preview support lands in a later PRD.
- Tombstoned records are excluded.
- Missing child references are skipped with warnings in tree metadata, not thrown as 500s.
- Cycles are cut and reported in tree metadata.
- Recursion has a hard depth limit.

### Public API

- Add a public page tree endpoint for the site app.
- The first endpoint should be narrow and explicit, for example:

```text
GET /api/site/tree/:slug
```

- The endpoint returns the tree, not raw bootstrap data.
- The endpoint does not expose draft records.
- The endpoint initializes source schema and seed data the same way current authority routes do.
- The endpoint can live behind the same Durable Object as the site app.
- Mutations, schema edits, reset, and sync stay on the existing API paths.

### Renderer

- Add a public route for rendered site pages.
- The first route should render the home page and simple slug pages.
- The renderer consumes `SitePageTree`.
- The renderer maps block types and placement slots to local React components.
- Unknown block types render nothing and add no browser error.
- The first renderer covers:
  - header slot;
  - footer slot;
  - `hero`;
  - `markdown`;
  - `link`;
  - `contentList`;
  - `contentGrid`;
  - `image`;
  - `video`;
  - `cta`.
- The renderer is allowed to be site-specific.
- The renderer should not change generated admin styling or routes.

### Query-backed blocks

- `contentList` and `contentGrid` blocks use query metadata.
- Query metadata can start as `block.templateKey` or text-backed `block.meta`.
- The query key must point to a schema query on `block`.
- Query results are filtered through public visibility.
- `limit` can live in explicit fields if added, or in text-backed `meta` if implementation chooses that path.
- Result order uses `publishedAt` or stable `order` where available, with deterministic fallback.
- The first version does not need a general query traversal engine.

### Safety

- Do not expose raw schema editing routes as public page data.
- Do not rely on client-side filtering to hide drafts.
- Do not require Cloudflare R2 or image transforms.
- Do not add permissions.
- Do not add preview tokens.
- Do not add true JSON stored values unless that becomes an explicit field-type chunk.

## Proposed read model

```ts
type SitePageTree = {
  page: SiteBlockNode;
  meta: {
    slug: string;
    generatedAt: string;
    warnings: SiteTreeWarning[];
  };
};

type SiteBlockNode = {
  id: string;
  type: string;
  title: string;
  label?: string;
  subtitle?: string;
  body?: string;
  slug?: string;
  href?: string;
  icon?: string;
  color?: string;
  templateKey?: string;
  assetKey?: string;
  alt?: string;
  width?: number;
  height?: number;
  placements: SitePlacementNode[];
  query?: {
    key: string;
    items: SiteBlockNode[];
  };
};

type SitePlacementNode = {
  id: string;
  slot: string;
  order: number;
  visible: boolean;
  variant?: string;
  label?: string;
  block: SiteBlockNode;
};

type SiteTreeWarning = {
  code: string;
  recordId: string;
  message: string;
};
```

Notes:

- The tree copies public fields needed by renderers.
- `SiteBlockNode.placements` is derived. It is not stored.
- Media is represented by blocks where `type` is `image`, `video`, or `file`.
- The first version can include text-backed JSON metadata, but should not leak draft-only records.

## Example

The source records should be able to project this tree:

```text
Home page block
  header slot
    Header group block
      header slot
        Home link block
        Blog link block
        Projects link block
        Resume link block
  main slot
    Hero block
    Recent posts contentList block
    Featured projects contentGrid block
  footer slot
    Footer group block
      footer slot
        Explore group block
          link slot
            Projects link block
            Resume link block
        Social group block
          link slot
            GitHub link block
            LinkedIn link block
```

The exact slot names can change during implementation. The important rule is that nested composition uses `blockPlacement.parent`, not a stored array.

## Decisions

| ID      | Decision                                                | Reason                                                              | Evidence                                               |
| ------- | ------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------ |
| STR-D1  | Rename `contentItem` to `block`.                        | Every renderable site record is a block.                            | `schema/apps/site/schema.json`                         |
| STR-D2  | Rename `contentPlacement` to `blockPlacement`.          | The row places one child block under one parent block.              | `contentPlacement.parent`, `contentPlacement.item`     |
| STR-D3  | Fold `mediaAsset` into `block`.                         | Images, videos, and files are renderable blocks too.                | Current `mediaAsset` is only used by site content.     |
| STR-D4  | Use `block.type` as the renderer discriminator.         | `kind = block` becomes meaningless once everything is a block.      | User direction 2026-05-06.                             |
| STR-D5  | Use text-backed named slots on `blockPlacement`.        | Templates can look up named slots without schema enum churn.        | User direction 2026-05-06.                             |
| STR-D6  | Keep stored composition flat.                           | Flat records are a project rule.                                    | `doc/overview.md`, `prd/03-personal-site-authoring.md` |
| STR-D7  | Add a projection layer before adding a renderer.        | The frontend needs filtered nested data, not raw bootstrap records. | Current `/api/site/bootstrap` shape                    |
| STR-D8  | Keep the first renderer site-specific.                  | A general layout DSL is outside current release scope.              | `doc/roadmap.md`                                       |
| STR-D9  | Defer true JSON stored values unless explicitly scoped. | `RecordValues` currently stores string, boolean, and number values. | `src/shared/protocol.ts`                               |
| STR-D10 | Do not wait for REL-05.                                 | The page tree uses one-to-many containment, not many-to-many joins. | `prd/04-relationships.md`                              |
| STR-D11 | Put page shell composition in source seeds.             | The source app should prove the tree shape without local fixtures.  | `schema/apps/site/seed-records.json`                   |
| STR-D12 | Hide the seeded related-post placement for now.         | Query exclusion is not available, so visible self-query recurses.   | `rec_site_place_post_related.visible = false`          |
| STR-D13 | Use `/pages/*` for public site rendering.               | `/site` remains generated admin and site slugs can contain slashes. | `src/app.tsx`, `src/app/routes/site-page.tsx`          |

## Chunks

| ID     | Status  | Depends on     | Main files                                                                          | Acceptance                                                                         |
| ------ | ------- | -------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| STR-01 | shipped | PRD 03, REL-04 | `schema/apps/site/*`, `src/client/readiness.ts`, source/view/app tests              | Site source model uses `block` and `blockPlacement`; media is a block.             |
| STR-02 | shipped | STR-01         | `src/site/tree.ts`, `src/site/tree.test.ts`, site fixtures                          | Flat block records project into a public nested tree with warnings.                |
| STR-03 | shipped | STR-02         | `src/worker/authority.ts`, `src/worker/index.ts`, `src/shared/protocol.ts`, tests   | `GET /api/site/tree/:slug` returns filtered tree data for published pages.         |
| STR-04 | shipped | STR-03         | `schema/apps/site/seed-records.json`, source tests                                  | Seeds express Header, Home, nested footer sections, media blocks, and page blocks. |
| STR-05 | shipped | STR-04         | `src/app.tsx`, `src/app/routes/site-page.tsx`, `src/app/site-renderer/*`, app tests | Public site routes render the tree without changing `/site` admin.                 |
| STR-06 | shipped | STR-05         | Browser smoke, PRD promote notes                                                    | Browser smoke covers rendered home, nested header/footer, media, and admin.        |

## Chunk details

### STR-01 block schema model

Outcome:

- Shipped 2026-05-06.
- Site source schema entities are `block` and `blockPlacement`.
- `mediaAsset` is removed; media fields live on `block`.
- `block.type` is the discriminator and includes media, hero, markdown, list/grid, CTA, subscribe, and custom values.
- `blockPlacement.block` is the child reference.
- `blockPlacement.slot` is text with slug format.
- Relationship metadata names `blockPlacements` and `blockUsedInPlacements`.
- Site admin primary views are `blockHome` and `blockCompositionHome`.
- Site seeds contain 22 `block` records and 15 `blockPlacement` records.
- The former avatar media seed is now a `block` with `type = image`.
- Former semantic placements became hero, list, grid, and markdown blocks where needed.
- Readiness warnings now use `block.type` and visible `blockPlacement.block`.

Evidence:

- Source schema: `schema/apps/site/schema.json`.
- Seed records: `schema/apps/site/seed-records.json`.
- Readiness code: `src/client/readiness.ts`.
- Source/app/view tests updated in `src/shared/schema.test.ts`, `src/worker/schema-apps.test.ts`, `src/worker/authority.test.ts`, `src/client/views.test.ts`, `src/client/readiness.test.ts`, and `src/app.test.tsx`.
- `bun run test` passed 2026-05-06: 21 files, 383 tests.
- `bun run check` passed 2026-05-06: no warnings, lint errors, or type errors.
- Browser Use attempted 2026-05-06 for `/site` and `/site/schema`; backend was unavailable with no Codex IAB session metadata.
- HTTP bootstrap smoke passed 2026-05-06: `/api/site/bootstrap` returned entities `block`, `blockPlacement`, views `blockHome`, `blockCreate`, `blockCompositionHome`, `blockPlacementCreate`, and 37 records.

### STR-02 site tree read model

Outcome:

- Shipped 2026-05-06.
- Added public site tree types and pure builder in `src/site/tree.ts`.
- Builder accepts schema, flat records, slug, and options.
- Builder returns `SitePageTreeProjection` with `tree` or `null` plus shared metadata.
- Root lookup uses published `block` records where `type = page` and `slug` matches.
- Placement children resolve through `blockPlacement.parent` and `blockPlacement.block`.
- Placement order is deterministic by slot, order, createdAt, then id.
- Public output filters tombstones, non-published blocks, and invisible placements.
- Query-backed `contentList` and `contentGrid` blocks use `block.templateKey`.
- Query results run through schema queries on `block`, public filtering, deterministic ordering, and `limit`.
- Cycle detection, max-depth protection, missing child warnings, bad query warnings, and skipped root warnings are covered.
- Tests use current site seed records plus local fixture overlays for header/footer shell records that STR-04 will move into source seeds.
- Browser Use not run because STR-02 changed no app route or rendered browser behavior.

Evidence:

- Tree builder: `src/site/tree.ts`.
- Tree tests: `src/site/tree.test.ts`.
- `bun run test` passed 2026-05-06: 22 files, 390 tests.
- `bun run check` passed 2026-05-06: no warnings, lint errors, or type errors.

### STR-03 public page tree endpoint

Outcome:

- Shipped 2026-05-06.
- Added `GET /api/site/tree/:slug`.
- The endpoint initializes the active site schema and seed records before projecting.
- The endpoint calls `buildSitePageTree` with active records and active schema.
- The endpoint returns projected tree data, not bootstrap records or schema.
- Missing or draft-only page slugs return 404.
- Non-site tree routes return 400.
- Site tree response types live in `src/shared/protocol.ts`.
- Existing sync, mutation, schema, reset, and bootstrap routes are unchanged.
- Browser Use not run because STR-03 changed API behavior only, not rendered app behavior.

Evidence:

- Authority route: `src/worker/authority.ts`.
- Protocol response types: `src/shared/protocol.ts`.
- Tree builder still lives in `src/site/tree.ts`.
- Worker harness tests: `src/worker/authority.test.ts`.
- `bun run test` passed 2026-05-06: 22 files, 396 tests.
- `bun run check` passed 2026-05-06: no warnings, lint errors, or type errors.

### STR-04 nested source seed shape

Outcome:

- Shipped 2026-05-06.
- Site source seeds now contain 28 `block` records and 20 `blockPlacement` records.
- Home contains Header, Hero, Recent posts, Featured projects, and Footer through placements.
- Header navigation uses reusable internal `link` blocks.
- Footer has a root group with nested Explore and Social section groups.
- Footer section groups use reusable `link` block placements.
- Hero media uses `image` and `video` blocks.
- Seed records stay flat; no parent stores child arrays.
- `rec_site_place_post_related` is hidden until query-backed related posts can exclude the current post.
- Site admin views were unchanged.

Evidence:

- Source seeds: `schema/apps/site/seed-records.json`.
- Source seed count test: `src/worker/schema-apps.test.ts`.
- Tree source-shape test: `src/site/tree.test.ts`.
- Endpoint expectation: `src/worker/authority.test.ts`.
- Admin count expectations: `src/app.test.tsx`.
- `bun run test` passed 2026-05-06: 22 files, 396 tests.
- `bun run check` passed 2026-05-06: no warnings, lint errors, or type errors.

### STR-05 first custom renderer

Outcome:

- Shipped 2026-05-06.
- Added public site routes at `/pages` and `/pages/*`.
- `/pages` redirects to `/pages/home`.
- `/pages/*` fetches `/api/site/tree/:slug`.
- Public site routes hide generated admin navigation.
- `/site` still opens the generated admin app.
- `/site/schema` still opens the schema editor.
- Added loading, 404, and error states for public site pages.
- Added a site-specific renderer under `src/app/site-renderer/`.
- Renderer supports header, main, footer, media, and link slots.
- Renderer supports `group`, `hero`, `markdown`, `link`, `contentList`, `contentGrid`, `image`, `video`, `cta`, `post`, `project`, and `profile` blocks.
- Media blocks render from `href` when present and from public metadata placeholders otherwise.
- Query-backed list and grid blocks render public query results from the projected tree.
- Unknown block types render nothing.
- Rendered Home shows header navigation, hero content, recent posts, featured projects, media metadata, and nested footer links.
- Browser smoke was deferred to STR-06.

Evidence:

- App route shell: `src/app.tsx`.
- Public route state and fetch code: `src/app/routes/site-page.tsx`.
- Public renderer: `src/app/site-renderer/renderer.tsx`.
- App and renderer tests: `src/app.test.tsx`.
- `bun run test` passed 2026-05-06: 22 files, 403 tests.
- `bun run check` passed 2026-05-06: no warnings, lint errors, or type errors.

### STR-06 browser smoke and promotion notes

Outcome:

- Shipped 2026-05-06.
- Browser smoke passed for `/pages`, `/pages/home`, `/pages/blog`, `/site`, and `/site/schema`.
- `/pages` redirects to `/pages/home`.
- Rendered Home loads from the public route.
- Home shows header navigation, hero content, recent posts, featured projects, image/video media metadata, and nested footer links.
- `/pages/blog` renders a second published slug.
- Query-backed list/grid blocks show published records only.
- `/site` still opens generated admin with the Blocks workspace and Placements tab.
- `/site/schema` still opens the schema editor with `block` and `blockPlacement` schema JSON.
- Browser console showed no errors during the smoke paths.
- `doc/current.md` and `doc/roadmap.md` now include shipped site tree and renderer facts.

Evidence:

- Browser smoke: Codex Browser Use against `http://127.0.0.1:4677`.
- Dev state: `./tmp/state.txt`.
- Test output: `./tmp/test.txt`.
- Check output: `./tmp/check.txt`.
- Public route source: `src/app/routes/site-page.tsx`.
- Renderer source: `src/app/site-renderer/renderer.tsx`.
- Tree projection source: `src/site/tree.ts`.

## Non-goals

- Do not add array-valued block fields.
- Do not change the core `StoredRecord` shape.
- Do not add a general layout DSL.
- Do not add cross-app references.
- Do not add permissions or preview tokens.
- Do not add R2 upload or image transforms.
- Do not build RSS, sitemap, analytics, comments, search, or likes.
- Do not add true JSON stored values unless implementation explicitly scopes a JSON field type.
- Do not make public routes edit blocks.
- Do not remove or redesign the generated admin UI.

## Open questions

| ID     | Question                                                                 | Default for implementation                                                      |
| ------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| STR-O1 | Should `meta` be a text-backed JSON field or a true JSON field type?     | Use explicit fields first; add text-backed JSON only if needed.                 |
| STR-O2 | What public route should render site pages while `/site` is admin?       | Resolved by STR-D13: use `/pages/*`.                                            |
| STR-O3 | Should Home render at `/`?                                               | Not in the first chunk; `/` currently redirects to the default schema app.      |
| STR-O4 | Should tree output include raw records or projected public fields?       | Use projected public fields and include warnings for missing data.              |
| STR-O5 | Should query-backed lists include nested placement trees per result?     | Include block nodes with their own placements, subject to cycle and depth caps. |
| STR-O6 | Should markdown be rendered as HTML in this PRD?                         | Start with plain text or minimal rendering; richer markdown can follow.         |
| STR-O7 | Should slug uniqueness be enforced before public routes ship?            | Warn or choose deterministic first match; sparse unique constraints can follow. |
| STR-O8 | Should header/footer be selected by template key or explicit placements? | Use explicit placements first because authors can see and edit them.            |

## Blockers

| ID     | Status | Blocks | Notes                                                                                             |
| ------ | ------ | ------ | ------------------------------------------------------------------------------------------------- |
| STR-B1 | closed | STR-01 | PRD 04 REL-04 shipped before this PRD was drafted.                                                |
| STR-B2 | closed | STR-06 | Closed 2026-05-06. Node REPL browser control was exposed in this session and browser smoke passed. |

## Cross-PRD dependencies

| Dependency                          | Direction    | Notes                                                                  |
| ----------------------------------- | ------------ | ---------------------------------------------------------------------- |
| PRD 03 site authoring               | required     | Provides current site source schema, seeds, admin views, and warnings. |
| PRD 04 relationships through REL-04 | required     | Provides named to-many relationship support for block placements.      |
| PRD 04 REL-05                       | not required | Many-to-many helper work does not block block tree projection.         |
| JSON field type                     | optional     | Needed only if `meta` becomes a true structured value.                 |
| WebSocket push sync                 | not required | Public tree endpoint can use current HTTP reads.                       |
| Declarative app runtime             | later input  | This PRD should not become screen/layout schema.                       |
| Cloudflare media serving            | downstream   | Renderer can use block media metadata before real asset URLs exist.    |

## Progress rules

- Mark exactly one chunk as `doing` when implementation starts.
- When a chunk ships, mark it `shipped`.
- Replace shipped task detail with outcome plus evidence.
- Do not append terminal logs.
- Keep decisions in `Decisions`.
- Put renderer scope changes in `Open questions` or `Decisions`.
- Put global-doc updates in `Promote after ship`.

## Promote after ship

Promoted 2026-05-06:

- `doc/current.md` includes site source schema, seed records, block model, public tree endpoint, tree projection, renderer route, renderer source, and current route list.
- `doc/current.md` records that public tree output excludes drafts, archived blocks, invisible placements, and tombstoned records.
- `doc/current.md` records nested Header/Footer seed composition through `blockPlacement.parent`.
- `doc/roadmap.md` includes public site rendering as first-release scope.
- `doc/roadmap.md` keeps the first public renderer site-specific and keeps the general layout DSL out of first release.

## PRD status notes

- PRD drafted 2026-05-06.
- Updated 2026-05-06 to make `block` and `blockPlacement` the target source model.
- Updated 2026-05-06 to fold `mediaAsset` into `block`.
- Draft assumes PRD 03 is shipped.
- Draft assumes PRD 04 REL-04 has landed before implementation starts.
- REL-05 is not required for this work.
- True JSON `meta` is optional and not required for STR-01.
- Done pass 2026-05-06: PRD drafted and updated for the `block` and `blockPlacement` model; no blockers.
- STR-01 shipped 2026-05-06.
- STR-01 changed no storage, sync, mutation, authority, or generated UI framework code.
- STR-01 changed the site source schema, seed records, readiness warnings, and characterization tests.
- STR-01 kept stored records flat.
- Browser Use smoke was attempted for STR-01 but blocked by missing IAB session metadata.
- HTTP dev smoke confirmed the site bootstrap serves the renamed block schema and seed records.
- STR-02 shipped 2026-05-06.
- STR-02 added no HTTP route, protocol response, source seed, generated UI, or renderer changes.
- STR-02 kept stored records flat and composes the nested tree in `src/site/tree.ts`.
- STR-02 tests fixture the nested header/footer shell locally because STR-04 owns the source seed shape.
- STR-03 shipped 2026-05-06.
- STR-03 added the public tree endpoint and shared response types.
- STR-03 kept stored records flat and composes the public tree at read time.
- STR-03 did not change source seeds, generated admin UI, sync, mutations, schema edits, or reset behavior.
- STR-04 shipped 2026-05-06.
- STR-04 moved the nested home shell from tree-test fixtures into source seed records.
- STR-04 added reusable internal link blocks for header and footer navigation.
- STR-04 added a Footer root group and nested footer section placements.
- STR-04 added an intro video media block and hero media placement.
- STR-04 kept stored records flat and did not change generated admin views.
- STR-05 shipped 2026-05-06.
- STR-05 added the public renderer route at `/pages/*` and redirect at `/pages`.
- STR-05 kept `/site` and `/site/schema` as generated admin routes.
- STR-05 reads the projected public tree from `/api/site/tree/:slug`.
- STR-05 added a site-specific renderer and did not change generated admin renderer components.
- STR-05 browser smoke was deferred to STR-06.
- STR-06 shipped 2026-05-06.
- STR-06 Browser Use smoke passed for `/pages`, `/pages/home`, `/pages/blog`, `/site`, and `/site/schema`.
- STR-06 confirmed Home renders nested header/footer, query-backed published records, and media metadata.
- STR-06 confirmed `/site` and `/site/schema` remain generated admin routes.
- `bun start` restored dev readiness at `https://pixel.formless.local`.
- `./tmp/test.txt` shows 22 test files and 403 tests passing.
- `./tmp/check.txt` shows formatting, lint, and type checks passing.
- Shipped facts were promoted to `doc/current.md` and `doc/roadmap.md`.
