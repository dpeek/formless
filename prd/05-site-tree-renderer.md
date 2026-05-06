# PRD 05: Block tree projection and renderer

Status: draft
Current chunk: STR-01 block schema model
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

## Chunks

| ID     | Status  | Depends on     | Main files                                                                          | Acceptance                                                                         |
| ------ | ------- | -------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| STR-01 | ready   | PRD 03, REL-04 | `schema/apps/site/*`, `src/client/readiness.ts`, source/view/app tests              | Site source model uses `block` and `blockPlacement`; media is a block.             |
| STR-02 | planned | STR-01         | `src/site/tree.ts`, `src/site/tree.test.ts`, site fixtures                          | Flat block records project into a public nested tree with warnings.                |
| STR-03 | planned | STR-02         | `src/worker/authority.ts`, `src/worker/index.ts`, `src/shared/protocol.ts`, tests   | `GET /api/site/tree/:slug` returns filtered tree data for published pages.         |
| STR-04 | planned | STR-03         | `schema/apps/site/seed-records.json`, source tests                                  | Seeds express Header, Home, nested footer sections, media blocks, and page blocks. |
| STR-05 | planned | STR-04         | `src/app.tsx`, `src/app/routes/site-page.tsx`, `src/app/site-renderer/*`, app tests | Public site routes render the tree without changing `/site` admin.                 |
| STR-06 | planned | STR-05         | Browser Use, PRD promote notes                                                      | Browser smoke covers rendered home, nested header/footer, media, and admin.        |

## Chunk details

### STR-01 block schema model

Goal: rename the source model before building the tree.

Tasks:

- Rename `contentItem` entity to `block`.
- Rename `contentPlacement` entity to `blockPlacement`.
- Remove `mediaAsset`.
- Add media block types and fields to `block`.
- Rename placement child field from `item` to `block`.
- Change `blockPlacement.slot` from enum to text/slug.
- Keep `blockPlacement.order`.
- Update relationship metadata for `blockPlacements`.
- Update site queries, item views, table views, create views, and collection views.
- Update seed records to use `block` and `blockPlacement`.
- Convert media seed records into `block` records with `type = image`.
- Update readiness warnings for block types.
- Update parser, view model, app, worker, and authority tests that assert site shape.

Acceptance:

- Source schema entities are `block` and `blockPlacement`.
- No `contentItem`, `contentPlacement`, or `mediaAsset` entity remains in the site source schema.
- Media seed data is stored as `block` records.
- Placements use `parent`, `block`, `slot`, `order`, and `visible`.
- The Blocks workspace still scopes placements by selected parent block.
- Header/footer/social editing still works through group blocks and placements.
- `/site` still loads generated admin.
- `/site/schema` shows the renamed schema.
- `bun run test` passes.
- `bun run check` passes.

### STR-02 site tree read model

Goal: make the projection pure and testable.

Tasks:

- Add public site tree types.
- Add a pure tree builder that accepts schema, records, slug, and options.
- Index blocks and placements.
- Resolve the root published page block by slug.
- Resolve placement children by `parent`.
- Sort placements deterministically.
- Resolve query-backed list/grid items.
- Filter drafts, archived blocks, invisible placements, and tombstones.
- Add cycle detection.
- Add max-depth protection.
- Add warnings for missing references, bad query keys, cycles, and skipped roots.
- Add tests using current site seed records.

Acceptance:

- Home projects to a tree with header, hero, recent posts, featured projects, and footer.
- Draft posts do not appear in public query results.
- Invisible placements do not appear.
- Missing child block references produce warnings.
- Cycles produce warnings and stop recursion.
- `image` blocks project width, height, alt, and asset key.
- `bun run test` passes.
- `bun run check` passes.

### STR-03 public page tree endpoint

Goal: expose the read model without exposing admin bootstrap data.

Tasks:

- Add a route for `GET /api/site/tree/:slug`.
- Initialize site storage from source before projecting.
- Call the STR-02 tree builder with active records and active schema.
- Return 404 when no published page matches the slug.
- Return 400 for unsupported schema keys if the route is accidentally called for non-site apps.
- Add response protocol types.
- Add authority/worker tests.
- Keep existing sync, mutation, schema, and reset routes unchanged.

Acceptance:

- `GET /api/site/tree/home` returns the Home tree.
- A draft-only slug returns 404.
- Returned JSON excludes draft blocks.
- Existing `/api/site/bootstrap` behavior stays unchanged.
- `bun run test` passes.
- `bun run check` passes.

### STR-04 nested source seed shape

Goal: prove block containment with the source app.

Tasks:

- Add page placements that include the Header group and Footer group.
- Add a Footer root group if needed.
- Nest footer section groups under the Footer root group.
- Keep header/footer link blocks reusable.
- Keep block and placement records flat.
- Add media block examples.
- Update source schema tests for record count and expected relationships if needed.
- Keep admin views unchanged unless a small table column helps authoring.

Acceptance:

- Home contains Header, Hero, Recent posts, Featured projects, and Footer through placements.
- Header contains link block placements.
- Footer contains section/group block placements.
- Footer section groups contain link block placements.
- Media examples are blocks.
- Seed records still parse as `StoredRecord`.
- `bun run test` passes.
- `bun run check` passes.

### STR-05 first custom renderer

Goal: render the public site tree with local React components.

Tasks:

- Add public site routes outside the generated admin route.
- Keep `/site` as the admin route.
- Pick a public route shape, likely `/pages/:slug` while admin still owns `/site`.
- Fetch the site tree from the new endpoint.
- Render a loading state and 404 state.
- Add block renderers for the first supported block types.
- Render slots by name.
- Render links from `href` or `slug`.
- Render media blocks without requiring real image storage.
- Add app tests for home, header links, footer sections, list/grid content, media blocks, and 404.

Acceptance:

- Rendered Home shows header navigation, hero content, recent posts, featured projects, media where present, and footer links.
- `/site` still opens the generated admin app.
- `/site/schema` still opens the schema editor.
- Unknown block types do not crash rendering.
- `bun run test` passes.
- `bun run check` passes.

### STR-06 browser smoke and promotion notes

Goal: prove the first public rendering path in browser.

Tasks:

- Smoke test rendered Home in Browser Use.
- Smoke test a second slug page.
- Smoke test `/site` admin still works.
- Smoke test `/site/schema` still works.
- Update this PRD with shipped facts.
- Add global doc promotion notes under `Promote after ship`.

Acceptance:

- Rendered Home loads from the public route.
- Header and footer come from nested block records.
- Content list/grid blocks show published records only.
- Media blocks render public metadata.
- Admin route still edits blocks and placements.
- No blocker remains in this PRD.

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
| STR-O2 | What public route should render site pages while `/site` is admin?       | Use `/pages/:slug` until a broader route ownership decision exists.             |
| STR-O3 | Should Home render at `/`?                                               | Not in the first chunk; `/` currently redirects to the default schema app.      |
| STR-O4 | Should tree output include raw records or projected public fields?       | Use projected public fields and include warnings for missing data.              |
| STR-O5 | Should query-backed lists include nested placement trees per result?     | Include block nodes with their own placements, subject to cycle and depth caps. |
| STR-O6 | Should markdown be rendered as HTML in this PRD?                         | Start with plain text or minimal rendering; richer markdown can follow.         |
| STR-O7 | Should slug uniqueness be enforced before public routes ship?            | Warn or choose deterministic first match; sparse unique constraints can follow. |
| STR-O8 | Should header/footer be selected by template key or explicit placements? | Use explicit placements first because authors can see and edit them.            |

## Blockers

| ID     | Status | Blocks | Notes                                              |
| ------ | ------ | ------ | -------------------------------------------------- |
| STR-B1 | closed | STR-01 | PRD 04 REL-04 shipped before this PRD was drafted. |

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

When STR-01 ships, update `doc/current.md`:

- Site source schema uses `block` and `blockPlacement`.
- Media is stored as blocks with media types.
- Block placements use parent block, child block, named slot, order, and visibility.
- Site admin route still works at `/site`.

When this PRD ships, update `doc/current.md`:

- Site public tree projection exists.
- Site tree projection source: `src/site/tree.ts`.
- Site public tree endpoint exists at the chosen route.
- Public tree output excludes drafts, archived blocks, invisible placements, and tombstoned records.
- Site renderer route exists at the chosen public route.
- `/site` and `/site/schema` remain generated admin routes.
- Header and footer can be nested blocks/groups through `blockPlacement.parent`.

When this PRD ships, update `doc/roadmap.md` only if public site rendering becomes release scope.

## PRD status notes

- PRD drafted 2026-05-06.
- Updated 2026-05-06 to make `block` and `blockPlacement` the target source model.
- Updated 2026-05-06 to fold `mediaAsset` into `block`.
- Draft assumes PRD 03 is shipped.
- Draft assumes PRD 04 REL-04 has landed before implementation starts.
- REL-05 is not required for this work.
- True JSON `meta` is optional and not required for STR-01.
- No implementation has started.
- Done pass 2026-05-06: PRD drafted and updated for the `block` and `blockPlacement` model; no blockers.
