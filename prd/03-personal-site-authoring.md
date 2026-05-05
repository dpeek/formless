# PRD 03: Personal site content authoring

Status: shipped
Current chunk: none
Last updated: 2026-05-05

## Goal

Add a schema-backed personal site authoring app.

This PRD owns:

- source schema and seed records;
- admin/editorial generated surfaces;
- authoring validation;
- future handoff shape for a rendered site.

This PRD does not own the public rendered website.

## Current model

The site schema is intentionally small.

Entities:

- `contentItem`
- `contentPlacement`
- `mediaAsset`

Removed entities:

- no `person`;
- no `navSection`;
- no `navItem`.

Middle-ground shape:

- `contentItem` is the reusable editorial record.
- `contentItem.kind` discriminates pages, posts, projects, links, blocks, groups, and profile content.
- `contentPlacement` is the flat ordered relationship that stands in for `blocks: string[]`.
- `mediaAsset` stays separate because media has different metadata and later Cloudflare/R2 concerns.

This keeps the author's mental model close to:

```ts
type Block = {
  id: string;
  kind: string;
  title?: string;
  label?: string;
  body?: string;
  href?: string;
};
```

But the runtime still gets:

- flat records;
- scalar fields;
- reference validation;
- ordered composition records;
- generated create/table/editor views.

## Source map

Existing anchors:

- Schema parser: `src/shared/schema.ts`.
- Schema field parser: `src/shared/schema-fields.ts`.
- Schema view parser: `src/shared/schema-views.ts`.
- Schema types: `src/shared/schema-types.ts`.
- Field behavior: `src/shared/field-types.ts`.
- Generated editors: `src/app/generated/`.
- View model selection: `src/client/views.ts`.
- Readiness warnings: `src/client/readiness.ts`.
- App route registry: `src/shared/schema-apps.ts`.
- Worker source registry: `src/worker/schema-apps.ts`.

Owned files:

- `schema/apps/site/schema.json`.
- `schema/apps/site/seed-records.json`.
- `prd/03-personal-site-authoring.md`.

Likely changed files:

- `src/client/readiness.ts`.
- `src/shared/schema.test.ts`.
- `src/client/views.test.ts`.
- `src/client/readiness.test.ts`.
- `src/app.test.tsx`.
- `src/worker/schema-apps.test.ts`.
- `src/worker/authority.test.ts`.

## Requirements

### Content model

- Records stay flat.
- Use `contentItem` as the main reusable editorial entity.
- Use `contentItem.kind` to discriminate:
  - `page`
  - `post`
  - `project`
  - `link`
  - `block`
  - `group`
  - `profile`
- Do not split `post`, `project`, or `page` into separate entities in the first version.
- Do not keep a `person` entity for the personal site.
- Do not keep navigation-specific entities.
- Represent header, footer, social, and nav groups as `contentItem.kind = group`.
- Represent items inside those groups as `contentPlacement` rows.
- Keep media as its own entity.

### Long-form content

- Store markdown as text in the first version.
- Markdown supports source text for headings, links, code fences, diagrams, and media references.
- Do not parse or render markdown in the authority.
- Do not require Cloudflare asset upload in this PRD.
- Store Cloudflare-ready media metadata in `mediaAsset`.
- Use stable media keys and alt text now so a later renderer can resolve Cloudflare URLs.

### Admin/editorial surfaces

- Authors can manage content items from generated collection/table views.
- Authors can filter content by kind and status.
- Authors can edit long-form body content in a multiline editor.
- Authors can manage media records and alt text.
- Authors can select a content item and manage ordered block placements under it.
- Authors can create draft posts, projects, pages, links, blocks, groups, profile records, media, and placements.
- Header/footer/social editing happens through content groups plus placements.

### Validation

- Authority validation stays generic.
- The first version validates field types, references, required fields, enum values, and existing supported constraints.
- Publish-readiness checks are client/editorial warnings.
- Publish-readiness checks do not become a hidden public renderer.
- Published posts warn for missing route, body, or date.
- Published projects warn for missing summary/body.
- Link/header/footer/markdown/content-card/CTA placements warn when missing content item references.
- Query-backed content list/grid placements warn when missing `queryKey`.
- Media assets warn when missing alt text.

### Portability

- `contentItem` should not encode one person's site as a hard-coded domain.
- Use generic kinds and reusable placements.
- Public renderer templates can later map generic records to site-specific UI.

## Decisions

| ID     | Decision                                                                                  | Reason                                                                                 | Evidence                                     |
| ------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------- |
| PS-D1  | Use `contentItem` for pages, posts, projects, links, blocks, groups, and profile content. | Keeps the model close to editable block records without separate domain entities.      | `schema/apps/site/schema.json`               |
| PS-D2  | Remove `person`.                                                                          | The first site is one person; author/profile data can be `contentItem.kind = profile`. | `schema/apps/site/schema.json`               |
| PS-D3  | Remove `navSection` and `navItem`.                                                        | Header/footer/social navigation can be content groups plus ordered placements.         | `schema/apps/site/seed-records.json`         |
| PS-D4  | Keep `contentPlacement`.                                                                  | Current field system has scalar references, not arrays; placements preserve order.     | `schema/apps/site/schema.json`               |
| PS-D5  | Keep `mediaAsset`.                                                                        | Media metadata, alt text, and future asset serving are distinct from editorial blocks. | `schema/apps/site/schema.json`               |
| PS-D6  | Store markdown in text fields.                                                            | Avoids a rendered content engine before the admin workflow exists.                     | `src/shared/schema-fields.ts`                |
| PS-D7  | Treat text formats as editor hints first.                                                 | `markdown`, `href`, `slug`, `color`, and `icon` still store strings.                   | `src/shared/field-types.ts`                  |
| PS-D8  | Use queries for authoring scopes, not persisted aggregate data.                           | Counts and lists derive locally from records.                                          | `src/shared/query.ts`, `src/client/views.ts` |
| PS-D9  | Add site as a first-class schema app with `/site` and `/site/schema`.                     | Schema-backed routes are generated from `schemaApps`.                                  | `src/shared/schema-apps.ts`, `src/app.tsx`   |
| PS-D10 | Keep public render templates out of the first schema.                                     | This PRD is admin/editorial authoring only.                                            | This PRD                                     |

## Non-goals

- Do not build the public rendered site.
- Do not implement a full layout DSL.
- Do not implement a public route matcher for site pages.
- Do not implement Cloudflare upload, image transforms, R2, or CDN serving.
- Do not implement markdown rendering for public visitors.
- Do not implement rich text blocks as nested database records.
- Do not implement comments, likes, analytics, search, RSS, or sitemap generation.
- Do not implement multi-author permissions.
- Do not implement import/export UI.
- Do not implement cross-app references.

## Schema direction

### Entity: `contentItem`

Purpose: reusable editorial content.

Fields:

- `kind`: enum, required.
- `title`: text, required.
- `label`: text, optional.
- `subtitle`: text, optional, long-text editor.
- `body`: text, optional, markdown editor.
- `slug`: text, optional, slug editor.
- `href`: text, optional, href editor.
- `icon`: text, optional, icon editor.
- `color`: text, optional, color editor.
- `status`: enum, required, default `draft`.
- `featured`: boolean, required, default `false`.
- `publishedAt`: date, optional.
- `order`: number, optional.
- `templateKey`: text, optional.
- `primaryMedia`: reference to `mediaAsset`, optional.

Notes:

- `group` records represent header, footer, social, and other reusable groups.
- `profile` records hold site-owner/profile/copyright copy.
- `body` is markdown source text, not a parsed content tree.
- `href` can be internal or external.

### Entity: `contentPlacement`

Purpose: ordered composition records.

Fields:

- `parent`: reference to `contentItem`, required.
- `slot`: enum, required.
  - `header`
  - `main`
  - `aside`
  - `footer`
  - `meta`
- `kind`: enum, required.
  - `header`
  - `footer`
  - `hero`
  - `markdown`
  - `link`
  - `contentCard`
  - `contentList`
  - `contentGrid`
  - `media`
  - `cta`
  - `subscribe`
  - `custom`
- `item`: reference to `contentItem`, optional.
- `media`: reference to `mediaAsset`, optional.
- `title`: text, optional.
- `subtitle`: text, optional.
- `queryKey`: text, optional.
- `limit`: number, optional.
- `color`: text, optional.
- `order`: number, required, default `0`.
- `visible`: boolean, required, default `true`.

Notes:

- `parent` selects the page, group, post, project, or block being composed.
- `item` points to another content item when the placement is record-backed.
- `queryKey` points to a named schema query for list/grid blocks.
- No renderer is required in this PRD.

### Entity: `mediaAsset`

Purpose: media library metadata.

Fields:

- `label`: text, required.
- `kind`: enum, required.
- `key`: text, required.
- `alt`: text, required.
- `href`: text, optional.
- `credit`: text, optional.
- `width`: number, optional.
- `height`: number, optional.

## Queries

Content queries:

- `contentAll`
- `contentDraft`
- `contentPublished`
- `contentPages`
- `contentPosts`
- `contentProjects`
- `contentLinks`
- `contentBlocks`
- `contentGroups`
- `featuredContent`
- `publishedPosts`
- `featuredProjects`

Other queries:

- `mediaAll`
- `placementsForSelectedContent`: `parent = context.content`.

## Admin surfaces

### Content workspace

View: `contentHome`.

- Entity: `contentItem`.
- Result: `contentTable`.
- Actions: create content item.
- Primary navigation: yes.

### Blocks workspace

View: `contentCompositionHome`.

- Context: selected `contentItem`.
- Entity: `contentPlacement`.
- Query: `placementsForSelectedContent`.
- Result: `contentPlacementTable`.
- Actions: create placement with selected content as `parent`.
- Primary navigation: yes.

### Media workspace

View: `mediaHome`.

- Entity: `mediaAsset`.
- Query: `mediaAll`.
- Result: `mediaTable`.
- Actions: create media asset.
- Primary navigation: yes.

## Seed records

Seed records exercise the model without extra entities.

Records include:

- one media asset;
- one profile intro content item;
- home, blog, resume, and projects page content items;
- Estii, OpenSurf, and Formless project content items;
- published and draft post content items;
- GitHub and LinkedIn link content items;
- copyright/profile content item;
- header, footer main, and footer social group content items;
- link placements inside header/footer groups;
- home and post placements.

Rules:

- Seed records stay close to `StoredRecord`.
- Do not store change rows.
- Do not include public HTML.
- Do not include generated Cloudflare URLs unless they are stable source data.

## Chunks

| ID    | Status  | Depends on | Main files                                                       | Acceptance                                                                        |
| ----- | ------- | ---------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| PS-01 | shipped | none       | `src/shared/*`, `src/app/generated/*`, tests                     | Text formats and multiline/markdown-style editors parse and work in generated UI. |
| PS-02 | shipped | PS-01      | `schema/apps/site/*`, app registries, route tests                | Site source schema and seed records parse, bootstrap, and expose `/site` routes.  |
| PS-03 | shipped | PS-02      | `schema/apps/site/schema.json`, `src/client/views.ts`, app tests | Content, block placement, and media workspaces are usable.                        |
| PS-04 | shipped | PS-03      | generated UI, client validation helpers, tests                   | Editorial publish-readiness warnings identify incomplete records.                 |
| PS-05 | shipped | PS-04      | site schema, seeds, readiness, tests                             | Site model has only content items, placements, and media assets.                  |
| PS-06 | shipped | PS-05      | tests and browser smoke                                          | Full simplified authoring smoke passes and docs promotion notes are ready.        |

## Shipped chunks

### PS-01 text formats and editorial editors

Status: shipped 2026-05-05.

Outcome:

- `TextFieldSchema` has optional `format`.
- Supported text formats are `plain`, `longText`, `markdown`, `href`, `slug`, `color`, and `icon`.
- Text fields support matching editor hints.
- `markdown` and `textarea` render as multiline textareas.
- Text values still validate and store as plain strings.

Evidence:

- `src/shared/schema.test.ts`.
- `src/shared/field-types.test.ts`.
- `src/app.test.tsx`.
- `bun run test` passed.
- `bun run check` passed.

### PS-02 source site schema and routes

Status: shipped 2026-05-05.

Outcome:

- Added `schema/apps/site/schema.json`.
- Added `schema/apps/site/seed-records.json`.
- Added `site` to schema app metadata and worker source app registry.
- `/site` and `/site/schema` are generated from `schemaApps`.
- `/api/site/bootstrap` returns the site source schema and seed records.

Evidence:

- `src/shared/schema.test.ts`.
- `src/shared/schema-apps.test.ts`.
- `src/worker/schema-apps.test.ts`.
- `src/worker/authority.test.ts`.
- `src/app.test.tsx`.
- `bun run test` passed.
- `bun run check` passed.

### PS-03 editorial workspaces

Status: shipped 2026-05-05.

Outcome:

- `contentHome` uses `contentTable`.
- `contentCreate` includes editorial fields, markdown body, and media reference.
- `contentCompositionHome` scopes placements by selected `contentItem`.
- `contentPlacementCreate` defaults `parent` from selected content context.
- `mediaHome` manages `mediaAsset` records.

Evidence:

- `src/shared/schema.test.ts`.
- `src/client/views.test.ts`.
- `src/app.test.tsx`.
- `bun run test` passed.
- `bun run check` passed.

### PS-04 editorial readiness checks

Status: shipped 2026-05-05.

Outcome:

- Added client-side readiness warnings for site authoring records.
- Published page, post, and project content warns when route data is incomplete.
- Published posts warn when body or publish date is missing.
- Published projects warn when summary/body data is missing.
- Content placements warn when kind-specific source data is missing.
- Query-backed content list/grid placements warn when `queryKey` is missing.
- Media assets warn when alt text is missing.
- Generated rows render warnings without blocking create or patch editors.

Evidence:

- `src/client/readiness.test.ts`.
- `src/app.test.tsx`.
- `bun run test` passed.
- `bun run check` passed.

### PS-05 simplified content/block schema

Status: shipped 2026-05-05.

Outcome:

- Removed `person`, `navSection`, and `navItem` from the site schema.
- Removed `author` from `contentItem`.
- Added `contentItem.label`.
- Added `contentItem.kind = group`.
- Changed `contentPlacement` label to `Block placement`.
- Added placement slot `header`.
- Added placement kinds `header`, `footer`, `link`, and `custom`.
- Removed placement kinds `author` and `nav`.
- Replaced header/footer/social nav seed records with `contentItem.kind = group` records plus `contentPlacement.kind = link` rows.
- Reduced site source seed entities to `contentItem`, `contentPlacement`, and `mediaAsset`.
- Updated readiness warnings to validate link/header/footer placements instead of nav items.

Evidence:

- `schema/apps/site/schema.json`.
- `schema/apps/site/seed-records.json`.
- `src/client/readiness.ts`.
- `src/shared/schema.test.ts`.
- `src/client/views.test.ts`.
- `src/client/readiness.test.ts`.
- `src/app.test.tsx`.
- `src/worker/schema-apps.test.ts`.
- `src/worker/authority.test.ts`.
- `bun run test` passed.

### PS-06 browser smoke and cleanup

Status: shipped 2026-05-05.

Goal: prove the simplified authoring workflow and document promotion facts.

Outcome:

- Browser smoke covered `/site`.
- Browser smoke covered `/site/schema`.
- `/site` shows primary workspaces Content, Blocks, and Media.
- `/site` no longer shows People or Navigation workspaces.
- Content loads seed content and group records.
- Header navigation is editable as link block placements under the Header group.
- `/site/schema` shows the simplified three-entity schema.
- `/site/schema` no longer contains `person`, `navItem`, or `navSection`.
- Promotion notes are ready in `Promote after ship`.

Evidence:

- Browser smoke on `http://127.0.0.1:4294/site`.
- Browser smoke on `http://127.0.0.1:4294/site/schema`.
- `bun run test` passed.
- `bun run check` passed.

## Current chunk

None.

## Open decisions

| ID    | Question                                                                | Default for implementation                                                                       |
| ----- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| PS-O1 | Should text `format` enforce URL, slug, color, or icon syntax?          | No. Treat format as an authoring/editor hint first.                                              |
| PS-O2 | Should `contentItem.kind` include `resume` separately from `page`?      | No. Use `kind = page` with `templateKey = resume`.                                               |
| PS-O3 | Should social links be a separate entity?                               | No. Use `contentItem.kind = link` and placements.                                                |
| PS-O4 | Should page composition be records or schema-only template definitions? | Use `contentPlacement` records first so authors can manage ordering without editing schema JSON. |
| PS-O5 | Should markdown media references be validated against `mediaAsset.key`? | Not in the first version. Add after markdown preview or renderer exists.                         |
| PS-O6 | Should slug uniqueness be authority-enforced now?                       | Not until sparse unique semantics are explicit. Warn in admin first.                             |

## Blockers

| ID    | Status | Blocks | Notes                                                                                    |
| ----- | ------ | ------ | ---------------------------------------------------------------------------------------- |
| PS-B1 | closed | PS-02  | `prd/01-schema-routes.md` shipped route-keyed app, schema, API, reset, and client paths. |

## Cross-PRD dependencies

| Dependency                        | Direction      | Notes                                                                                      |
| --------------------------------- | -------------- | ------------------------------------------------------------------------------------------ |
| PRD 01 schema-backed app routes   | satisfied      | Route-key support has shipped; `site` is available through `/site` and `/site/schema`.     |
| Declarative table/query evolution | optional input | Sorting/filter improvements can improve admin tables later. Do not block this PRD on them. |
| Cloudflare media serving          | downstream     | This PRD stores media metadata only. Upload/serving belongs in a later workstream.         |
| Public site renderer              | downstream     | This PRD leaves clean data for a renderer but does not implement one.                      |

## Progress rules

- Mark exactly one chunk as `doing` when implementation starts.
- When a chunk ships, mark it `shipped`.
- Replace shipped task detail with outcome plus evidence.
- Do not append terminal logs.
- Keep decisions in `Decisions`.
- Keep renderer questions in `Open decisions` or a future renderer PRD.
- Put global-doc updates in `Promote after ship`.

## Promote after ship

When this PRD ships, update `doc/current.md`:

- Site source schema exists under `schema/apps/site/`.
- Site source seed records exist under `schema/apps/site/seed-records.json`.
- Site route exists at `/site`.
- Site schema editor route exists at `/site/schema`.
- Site authoring app uses generic `contentItem` records.
- Site authoring app has `contentItem`, `contentPlacement`, and `mediaAsset` entities.
- Header, footer, and social navigation use content groups plus placements.
- Text fields support editorial formats and multiline markdown authoring.
- Site authoring surfaces are generated from schema views.
- Site authoring surfaces show non-blocking readiness warnings for incomplete publishable content.

When this PRD ships, update `doc/roadmap.md`:

- Personal site authoring schema is no longer target work.
- Public site rendering remains outside first authoring scope unless a later PRD adds it.
