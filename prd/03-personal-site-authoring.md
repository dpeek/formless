# PRD 03: Personal site content authoring

Status: shipped
Current chunk: none
Last updated: 2026-05-05

## Goal

Add a schema-backed personal site authoring app.

This PRD is only about:

- content schema;
- source schema and seed records;
- admin/editorial generated surfaces;
- authoring validation;
- future handoff shape for a rendered site.

This PRD is not about rendering the public website.

The schema should support a personal website with:

- header and footer navigation;
- grouped navigation sections and items;
- social links;
- copyright line;
- reusable editorial blocks;
- long-form markdown content;
- pages such as home, blog, resume, and projects;
- project pages such as Estii, OpenSurf, and Formless;
- query-backed lists such as recent posts and featured projects.

The schema should stay generic enough for other content-heavy sites.

## Problem

A domain-specific schema like `post`, `project`, `page`, `homeHero`, and `footerCta` is easy to understand at first, but it locks the app into one website shape.

A single generic record can also go too far. If every concept is one sparse record with unrelated fields, the admin gets noisy and validation gets weak.

The first useful model should split the difference:

- generic content records for editorial things;
- small relationship records for ordered placement, navigation, and media;
- schema-declared views for authoring workflows;
- no public renderer or layout DSL yet.

## Source map

Existing anchors:

- Schema parser: `src/shared/schema.ts`.
- Schema field parser: `src/shared/schema-fields.ts`.
- Schema view parser: `src/shared/schema-views.ts`.
- Schema types: `src/shared/schema-types.ts`.
- Field behavior: `src/shared/field-types.ts`.
- Generated field editors: `src/app/generated/record-field-editor.tsx`.
- Generated create editors: `src/app/generated/create.tsx`.
- Generated table renderer: `src/app/generated/table.tsx`.
- View model selection: `src/client/views.ts`.
- Query evaluator: `src/shared/query.ts`.
- App route registry: `src/shared/schema-apps.ts`.
- App shell route generation: `src/app.tsx`.
- Schema editor route: `src/app/routes/schema.tsx`.
- Worker source schema registry: `src/worker/schema-apps.ts`.
- Keyed authority routes: `src/worker/authority.ts`.
- Current source apps: `schema/apps/tasks/`, `schema/apps/rates/`.
- Shipped route workstream: `prd/01-schema-routes.md`.

New files:

- `schema/apps/site/schema.json`.
- `schema/apps/site/seed-records.json`.

Likely changed files:

- `src/shared/schema-types.ts`.
- `src/shared/schema-fields.ts`.
- `src/shared/schema-views.ts`.
- `src/shared/field-types.ts`.
- `src/app/generated/field-ui-adapters.ts`.
- `src/app/generated/record-field-editor.tsx`.
- `src/app/generated/create.tsx`.
- `src/shared/schema-apps.ts`.
- `src/worker/schema-apps.ts`.
- `src/shared/schema-apps.test.ts`.
- `src/worker/schema-apps.test.ts`.
- `src/test/schema-apps.ts`.
- `src/shared/schema.test.ts`.
- `src/shared/field-types.test.ts`.
- `src/client/views.test.ts`.
- `src/app.test.tsx`.

## Requirements

### Content model

- Records stay flat.
- Use `contentItem` as the main reusable editorial entity.
- Use `contentItem.kind` to discriminate pages, posts, projects, links, blocks, and profile content.
- Do not split `post`, `project`, and `page` into separate entities in the first version.
- Split out entities only when authoring rules become meaningfully different.
- Keep media as its own entity.
- Keep people/authors as their own entity.
- Keep navigation and ordered composition as relationship entities.

### Long-form content

- Store markdown as text in the first version.
- Markdown should support source text for headings, links, code fences, diagrams, and media references.
- Do not parse or render markdown in the authority.
- Do not require Cloudflare asset upload in this PRD.
- Store Cloudflare-ready media metadata in `mediaAsset`.
- Use stable media keys and alt text now so a later renderer can resolve Cloudflare URLs.

### Admin/editorial surfaces

- Authors can manage content items from generated collection/table views.
- Authors can filter content by kind and status.
- Authors can edit long-form body content in a multiline editor.
- Authors can manage media records and alt text.
- Authors can manage people/authors.
- Authors can manage header and footer navigation sections.
- Authors can manage ordered navigation items inside a selected section.
- Authors can manage ordered page/content placements inside a selected content item.
- Authors can create draft posts, projects, pages, links, blocks, media, people, nav sections, nav items, and placements.

### Validation

- Authority validation stays generic.
- The first version should validate field types, references, required fields, enum values, and existing supported constraints.
- Publish-readiness checks can be client/editorial warnings.
- Publish-readiness checks must not become a hidden public renderer.
- Missing public renderer behavior is not a failure for this PRD.

### Portability

- `contentItem` should not encode one person's site as a hard-coded domain.
- Use generic kinds and reusable placements.
- Use records and schema views that could also support a portfolio, consultancy site, product-marketing site, or knowledge base.
- Public renderer templates can later map generic records to site-specific UI.

## Decisions

| ID    | Decision                                                                                           | Reason                                                                                        | Evidence                                     |
| ----- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------- |
| PS-D1 | Use a generic `contentItem` entity for pages, posts, projects, links, blocks, and profile content. | Reduces early domain lock-in while preserving one main authoring collection.                  | `doc/overview.md`, `src/shared/schema.ts`    |
| PS-D2 | Keep `mediaAsset`, `person`, `navSection`, `navItem`, and `contentPlacement` separate.             | These are relationships or reusable records with different authoring workflows.               | `schema/apps/rates/schema.json` references   |
| PS-D3 | Store long-form markdown in text fields at first.                                                  | Avoids creating a rendered content engine before the admin workflow exists.                   | Existing `text` field behavior               |
| PS-D4 | Add text editor variants before adding new persisted field types.                                  | `markdown`, `textarea`, `href`, `slug`, `color`, and `icon` are string authoring needs first. | `src/shared/field-types.ts`                  |
| PS-D5 | Use `contentPlacement` for ordered page composition.                                               | Repeated blocks need order, slot, optional item/query binding, and overrides.                 | Flat-record rule in `doc/overview.md`        |
| PS-D6 | Keep public render templates out of the first schema.                                              | The user asked for schema and admin/editorial surfaces only.                                  | This PRD                                     |
| PS-D7 | Use queries for authoring scopes, not persisted aggregate data.                                    | Counts and lists should derive from records locally.                                          | `src/shared/query.ts`, `src/client/views.ts` |
| PS-D8 | Use source-owned seed JSON for sample site content.                                                | Seeds should stay close to future import/export snapshot shape.                               | `schema/apps/*/seed-records.json`            |
| PS-D9 | Add site as a first-class schema app with `/site` and `/site/schema`.                              | Schema-backed app routes have shipped and app routes are generated from `schemaApps`.         | `prd/01-schema-routes.md`, `src/app.tsx`     |

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
- Do not make `post`, `project`, or `page` separate entities unless a later PRD proves the generic model is too weak.

## Schema direction

### Entity: `contentItem`

Purpose: reusable editorial content.

Fields:

- `kind`: enum, required.
  - `page`
  - `post`
  - `project`
  - `link`
  - `block`
  - `profile`
- `title`: text, required.
- `subtitle`: text, optional.
- `body`: text, optional, markdown editor.
- `slug`: text, optional, slug editor.
- `href`: text, optional, href editor.
- `icon`: text, optional, icon editor.
- `color`: text, optional, color editor.
- `status`: enum, required, default `draft`.
  - `draft`
  - `published`
  - `archived`
- `featured`: boolean, required, default `false`.
- `publishedAt`: date, optional.
- `order`: number, optional, integer, min `0`.
- `templateKey`: text, optional.
- `primaryMedia`: reference to `mediaAsset`, optional, display field `label`.
- `author`: reference to `person`, optional, display field `name`.

Notes:

- `kind` describes what the record means.
- `profile` records can hold site owner, intro, newsletter, copyright, and other site-wide copy.
- `templateKey` is an authoring hint for future renderers.
- `body` is markdown source text, not a parsed content tree.
- `href` can be internal or external.
- `slug` is source data for later route generation.
- `featured` supports home/project/post selections without a specialized entity.

### Entity: `mediaAsset`

Purpose: media library metadata.

Fields:

- `label`: text, required.
- `kind`: enum, required.
  - `image`
  - `video`
  - `file`
- `key`: text, required.
- `alt`: text, required.
- `href`: text, optional, href editor.
- `credit`: text, optional.
- `width`: number, optional, integer, min `0`.
- `height`: number, optional, integer, min `0`.

Notes:

- `key` should be stable and Cloudflare-ready.
- `href` is optional until upload/serving exists.
- `alt` is required so authoring starts accessible.

### Entity: `person`

Purpose: authors and profile records.

Fields:

- `name`: text, required.
- `role`: text, optional.
- `bio`: text, optional, markdown editor.
- `avatar`: reference to `mediaAsset`, optional, display field `label`.
- `href`: text, optional, href editor.
- `email`: text, optional.

Notes:

- `person` can represent the site owner or later guest authors.
- Social links can be `contentItem.kind = "link"` records placed near a person/profile.

### Entity: `navSection`

Purpose: header/footer navigation grouping.

Fields:

- `area`: enum, required.
  - `header`
  - `footer`
- `label`: text, required.
- `order`: number, required, integer, min `0`, default `0`.
- `visible`: boolean, required, default `true`.

Notes:

- Header and footer can share the same entity.
- Footer columns are sections.

### Entity: `navItem`

Purpose: ordered navigation links inside a section.

Fields:

- `section`: reference to `navSection`, required, display field `label`.
- `item`: reference to `contentItem`, optional, display field `title`.
- `label`: text, optional.
- `href`: text, optional, href editor.
- `icon`: text, optional, icon editor.
- `order`: number, required, integer, min `0`, default `0`.
- `visible`: boolean, required, default `true`.

Notes:

- Use `item` for internal content.
- Use `href` for external or custom links.
- `label` overrides the referenced item title when present.
- Publish-readiness should warn when both `item` and `href` are empty.

### Entity: `contentPlacement`

Purpose: ordered composition records for pages, posts, projects, and reusable blocks.

Fields:

- `parent`: reference to `contentItem`, required, display field `title`.
- `slot`: enum, required.
  - `main`
  - `aside`
  - `footer`
  - `meta`
- `kind`: enum, required.
  - `hero`
  - `markdown`
  - `contentCard`
  - `contentList`
  - `contentGrid`
  - `media`
  - `cta`
  - `subscribe`
  - `author`
  - `nav`
- `item`: reference to `contentItem`, optional, display field `title`.
- `media`: reference to `mediaAsset`, optional, display field `label`.
- `title`: text, optional.
- `subtitle`: text, optional.
- `queryKey`: text, optional.
- `limit`: number, optional, integer, min `0`.
- `color`: text, optional, color editor.
- `order`: number, required, integer, min `0`, default `0`.
- `visible`: boolean, required, default `true`.

Notes:

- `parent` selects the page/content item being composed.
- `kind` selects an abstract block role.
- `item` points to a featured record when the block is record-backed.
- `queryKey` points to a named schema query for list/grid blocks.
- `limit` is authoring metadata for future list/grid renderers.
- `title` and `subtitle` are overrides.
- No renderer is required in this PRD.

## Text format and editor direction

The first authoring work should extend text authoring without changing storage.

Preferred schema addition:

```json
{
  "type": "text",
  "required": false,
  "label": "Body",
  "format": "markdown"
}
```

Preferred view/editor addition:

```json
{
  "editor": "markdown",
  "commit": "field-commit"
}
```

Text formats:

- `plain`: default single-line text.
- `longText`: multiline prose without markdown assumptions.
- `markdown`: multiline markdown source.
- `href`: internal or external link target.
- `slug`: route/source slug.
- `color`: color token or hex value.
- `icon`: icon token.

Editor behavior:

- `text`: current single-line editor.
- `textarea`: multiline editor for `longText`.
- `markdown`: multiline editor for markdown source.
- `href`: text editor with link-focused label/help in future.
- `slug`: text editor with slug-focused label/help in future.
- `color`: text editor first, visual swatch later.
- `icon`: text editor first, icon picker later.

Rules:

- All text formats store strings.
- Authority validation should keep formats permissive in the first chunk.
- Format-specific strict validation can land later after export/import and editing flows are clearer.
- Markdown preview is optional in the first chunk.

## Queries

Initial content queries:

- `contentAll`: all content items.
- `contentDraft`: `status = draft`.
- `contentPublished`: `status = published`.
- `contentPages`: `kind = page`.
- `contentPosts`: `kind = post`.
- `contentProjects`: `kind = project`.
- `contentLinks`: `kind = link`.
- `contentBlocks`: `kind = block`.
- `featuredContent`: `featured = true`.
- `publishedPosts`: `kind = post` and `status = published`.
- `featuredProjects`: `kind = project` and `featured = true`.

Initial relationship queries:

- `mediaAll`: all media assets.
- `peopleAll`: all people.
- `navSectionsAll`: all navigation sections.
- `navItemsForSelectedSection`: `section = context.section`.
- `placementsForSelectedContent`: `parent = context.content`.

Notes:

- Sorting is not a query feature today.
- Store `order` now and show it in tables.
- A later table/query PRD can add sort order.
- Counts should be host-level displays over queries, not persisted fields.

## Admin surfaces

### Content workspace

View: `contentHome`.

Entity: `contentItem`.

Queries:

- all;
- draft;
- published;
- pages;
- posts;
- projects;
- links;
- blocks;
- featured.

Result:

- table view.

Columns:

- `kind`;
- `title`;
- `status`;
- `featured`;
- `slug`;
- `href`;
- `publishedAt`;
- `order`.

Actions:

- create content item.

Create fields:

- `kind`;
- `title`;
- `subtitle`;
- `status`;
- `featured`;
- `slug`;
- `href`;
- `templateKey`;
- `author`;
- `primaryMedia`.

Notes:

- Body editing can happen in row detail or inline once markdown editor layout exists.
- The first version can include body in create if the UI handles multiline fields well.

### Composition workspace

View: `contentCompositionHome`.

Context:

- selected `contentItem`.

Entity:

- `contentPlacement`.

Query:

- `placementsForSelectedContent`.

Result:

- table view.

Columns:

- `slot`;
- `kind`;
- `item`;
- `media`;
- `title`;
- `queryKey`;
- `limit`;
- `order`;
- `visible`.

Actions:

- create placement with selected `contentItem` as context default.

Notes:

- This is the admin surface for home sections, project sections, post CTAs, and footer/meta blocks.
- It does not render the final page.

### Navigation workspace

View: `navigationHome`.

Context:

- selected `navSection`.

Entity:

- `navItem`.

Query:

- `navItemsForSelectedSection`.

Result:

- table view.

Columns:

- `item`;
- `label`;
- `href`;
- `icon`;
- `order`;
- `visible`.

Actions:

- create nav section.
- create nav item for selected section.

Notes:

- Header and footer use the same workflow.
- Footer columns are `navSection` records.

### Media workspace

View: `mediaHome`.

Entity:

- `mediaAsset`.

Query:

- `mediaAll`.

Result:

- table view.

Columns:

- `label`;
- `kind`;
- `key`;
- `alt`;
- `href`;
- `width`;
- `height`;

Actions:

- create media asset.

### People workspace

View: `peopleHome`.

Entity:

- `person`.

Query:

- `peopleAll`.

Result:

- list or table view.

Fields:

- `name`;
- `role`;
- `bio`;
- `avatar`;
- `href`;
- `email`.

Actions:

- create person.

## Sample seed records

Seed records should include enough content to exercise the admin workflows:

- one profile/person for the site owner;
- one media asset for an avatar or hero;
- one home page content item;
- one blog index page content item;
- one resume page content item;
- one projects page content item;
- three project content items:
  - Estii;
  - OpenSurf;
  - Formless;
- two draft/published post content items;
- header nav section;
- footer nav sections;
- header nav items;
- footer nav items;
- social link content items;
- copyright/profile content item;
- home placements:
  - hero;
  - recent posts list;
  - projects grid;
- post template/example placements:
  - markdown body;
  - author;
  - related/recent posts.

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
| PS-03 | shipped | PS-02      | `schema/apps/site/schema.json`, `src/client/views.ts`, app tests | Content, composition, navigation, media, and people workspaces are usable.        |
| PS-04 | shipped | PS-03      | generated UI, client validation helpers, tests                   | Editorial publish-readiness warnings identify incomplete records.                 |
| PS-05 | shipped | PS-04      | tests and browser smoke                                          | Full admin/editorial smoke passes and docs promotion notes are ready.             |

## Shipped chunks

### PS-01 text formats and editorial editors

Status: shipped 2026-05-05.

Outcome:

- `TextFieldSchema` has optional `format`.
- Supported text formats are `plain`, `longText`, `markdown`, `href`, `slug`, `color`, and `icon`.
- Unknown text formats are rejected during schema parse.
- Text fields support `text`, `textarea`, `markdown`, `href`, `slug`, `color`, and `icon` editors.
- `markdown` and `textarea` render as multiline textareas in generated create and record editors.
- Text values still validate and store as plain strings.

Evidence:

- Parser coverage: `src/shared/schema.test.ts`.
- Field behavior coverage: `src/shared/field-types.test.ts`.
- Generated UI coverage: `src/app.test.tsx`.
- Browser Use smoke verified temporary markdown inline and create textareas, then the dev session was restarted on `https://winter.formless.local`.
- `bun run test` passed.
- `bun run check` passed.

Tasks:

- [x] Add optional `format` to text field schema.
- [x] Parse supported text formats in `src/shared/schema-fields.ts`.
- [x] Extend `TextFieldSchema` in `src/shared/schema-types.ts`.
- [x] Add text-compatible editors:
  - `textarea`;
  - `markdown`;
  - `href`;
  - `slug`;
  - `color`;
  - `icon`.
- [x] Update field behavior in `src/shared/field-types.ts`.
- [x] Update generated record field editor for multiline text.
- [x] Update generated create editor for multiline text.
- [x] Keep field values as strings in protocol/storage.
- [x] Add parser and field behavior tests.
- [x] Add generated editor tests.

Acceptance checks:

- [x] Schema accepts `text` fields with `format: "markdown"`.
- [x] Schema rejects unknown text formats.
- [x] `markdown` editor is valid for text fields.
- [x] `markdown` editor is invalid for non-text fields.
- [x] Generated record editor renders a multiline input for markdown text.
- [x] Generated create editor renders a multiline input for markdown text.
- [x] Stored values stay plain strings.
- [x] `bun run test` passes.
- [x] `bun run check` passes.

### PS-02 source site schema and seed records

Status: shipped 2026-05-05.

Outcome:

- Added `schema/apps/site/schema.json`.
- Added `schema/apps/site/seed-records.json`.
- Site schema has `contentItem`, `mediaAsset`, `person`, `navSection`, `navItem`, and `contentPlacement`.
- Site seed has 32 source-owned `StoredRecord`-style records.
- Added `site` to schema app metadata and worker source app registry.
- `/site` and `/site/schema` are generated from `schemaApps`.
- Worker source app loading validates seed ids, entities, field values, and references against the parsed source schema.
- `/api/site/bootstrap` returns the site source schema and seed records.
- `/site` currently opens the minimal generated content collection. Richer editorial workspaces remain PS-03.

Evidence:

- Source schema parser coverage: `src/shared/schema.test.ts`.
- Shared app registry coverage: `src/shared/schema-apps.test.ts`.
- Worker source registry coverage: `src/worker/schema-apps.test.ts`.
- Worker bootstrap coverage: `src/worker/authority.test.ts`.
- Route and generated content coverage: `src/app.test.tsx`.
- Live bootstrap smoke: `https://paper.formless.local/api/site/bootstrap` returned status `200`, 6 entities, 32 records, and `rec_site_content_home`.
- `bun run test` passed.
- `bun run check` passed.

Tasks:

- [x] Add `schema/apps/site/schema.json`.
- [x] Add `schema/apps/site/seed-records.json`.
- [x] Add `site` to `src/shared/schema-apps.ts`.
- [x] Add parsed site source app to `src/worker/schema-apps.ts`.
- [x] Add `site` to `SchemaKey` and route metadata.
- [x] Confirm `src/app.tsx` renders `/site` and `/site/schema` from the registry.
- [x] Add parser tests for all site entities.
- [x] Add source registry tests for site schema and seeds.
- [x] Add route tests for `/site` and `/site/schema`.
- [x] Keep seed records close to `StoredRecord`.

Acceptance checks:

- [x] Site schema parses.
- [x] Site seed records parse against the source schema.
- [x] `/api/site/bootstrap` returns the site schema and seed records.
- [x] `/site` opens the site authoring app.
- [x] `/site/schema` opens the site schema editor.
- [x] `contentItem` supports generic kinds.
- [x] `contentPlacement` supports page composition.
- [x] `navSection` and `navItem` support header/footer navigation.
- [x] `mediaAsset` requires alt text.
- [x] `person` supports author/profile data.
- [x] `bun run test` passes.
- [x] `bun run check` passes.

### PS-03 editorial workspaces

Status: shipped 2026-05-05.

Outcome:

- `contentHome` uses `contentTable` with kind/status filters, markdown body editing, slugs, links, publish dates, and order.
- `contentCreate` includes editorial fields, markdown body, author reference, and primary media reference.
- Added primary site workspaces: Content, Composition, Navigation, Media, People.
- `contentCompositionHome` scopes placements by selected `contentItem`.
- `contentPlacementCreate` defaults `parent` from selected content context.
- `navigationHome` scopes nav items by selected `navSection`.
- `navSectionCreate` creates new header/footer sections from the Navigation context.
- `navItemCreate` defaults `section` from selected navigation context.
- Added media and people table/create views.

Evidence:

- Schema parser coverage: `src/shared/schema.test.ts`.
- View model coverage: `src/client/views.test.ts`.
- App/render coverage: `src/app.test.tsx`.
- Browser Use smoke on `https://ember.formless.local/site` verified Content tabs/tables/body editors, Composition with Home placement table, and Navigation with section/item tables.
- `bun run test` passed.
- `bun run check` passed.

Tasks:

- [x] Expand `contentHome` beyond the PS-02 minimal route view.
- [x] Add `contentTable` table view.
- [x] Expand `contentCreate` for editorial fields.
- [x] Add `contentCompositionHome` scoped collection view.
- [x] Add `contentPlacementTable` table view.
- [x] Add `contentPlacementCreate` create view with context default.
- [x] Add `navigationHome` scoped collection view.
- [x] Add `navItemTable` table view.
- [x] Add `navSectionCreate` and `navItemCreate` create views.
- [x] Add `mediaHome` collection view.
- [x] Add `peopleHome` collection view.
- [x] Mark primary navigation views intentionally.
- [x] Add app/render tests for visible workspaces.

Acceptance checks:

- [x] Authors can create content items.
- [x] Authors can filter content items by kind and status.
- [x] Authors can edit markdown body fields.
- [x] Authors can choose an author and media asset by reference.
- [x] Authors can select a content item and edit its placements.
- [x] Authors can select a nav section and edit its items.
- [x] Authors can create media assets with alt text.
- [x] Authors can create people/authors.
- [x] Site route stays isolated from `/tasks` and `/rates`.
- [x] `bun run test` passes.
- [x] `bun run check` passes.

### PS-04 editorial readiness checks

Status: shipped 2026-05-05.

Outcome:

- Added client-side readiness warnings for site authoring records.
- Published page, post, and project content warns when route data is incomplete.
- Published posts warn when body, publish date, or author data is missing.
- Published projects warn when summary/body data is missing.
- Navigation items warn when they do not resolve to an internal content item or link.
- Media assets warn when alt text is missing.
- Content placements warn when kind-specific source data is missing.
- Query-backed content list/grid placements warn when `queryKey` is missing.
- Generated list/table rows render warnings without blocking create or patch editors.

Evidence:

- Readiness helper coverage: `src/client/readiness.test.ts`.
- Generated UI coverage: `src/app.test.tsx`.
- `bun run test` passed.
- `bun run check` passed.

Tasks:

- [x] Add client-side readiness helper over schema records.
- [x] Surface warnings in relevant generated/admin views.
- [x] Keep warnings non-blocking.
- [x] Add tests for warning output.

Acceptance checks:

- [x] Draft records can stay incomplete.
- [x] Published incomplete records show warnings.
- [x] Warnings do not prevent generic create/patch mutations.
- [x] Warnings do not require a public renderer.
- [x] `bun run test` passes.
- [x] `bun run check` passes.

### PS-05 browser smoke and cleanup

Status: shipped 2026-05-05.

Outcome:

- Browser Use smoke proved `/site` and `/site/schema` load against the route-keyed site app.
- The Content workspace loaded source seed records.
- Created a draft post from generated UI.
- Edited the draft post body through the markdown textarea.
- Edited media alt text from the Media workspace.
- Selected the Home content item in Composition and added a recent-posts placement.
- Selected the Header nav section and added a nav item.
- Created incomplete published content and confirmed readiness warnings appeared.
- Reset site seed data after smoke.
- Stopped the dev server with `bun stop`.
- Cleaned up generated action row labeling so action regions use the active entity label instead of legacy task text.
- Made shared dialogs viewport-bounded and scrollable so long generated create forms can submit.
- Fixed dev-state inference so Vite `Local:` ready lines are not hidden by earlier SSL warning text.

Evidence:

- Browser Use smoke on `http://127.0.0.1:4984/site`.
- App route smoke covered `/site` and `/site/schema`.
- Generated create dialog submitted the full site content form after dialog overflow cleanup.
- Readiness smoke showed published post warnings for missing route and body data.
- `bun run test` passed: 19 files, 346 tests.
- `bun run check` passed.
- `bun stop` completed and left `./tmp/state.txt` with dev and supervisor stopped.

Tasks:

- [x] Start app with `bun start`.
- [x] Open `/site`.
- [x] Open `/site/schema`.
- [x] Confirm content workspace loads seed content.
- [x] Create a draft post.
- [x] Edit the post body in the markdown editor.
- [x] Create or edit a media asset.
- [x] Select a page/content item in the composition workspace.
- [x] Add a placement for recent posts.
- [x] Select a nav section.
- [x] Add a nav item.
- [x] Confirm readiness warnings appear for incomplete published content.
- [x] Kill the dev server.
- [x] Clean up legacy generated UI labels.
- [x] Fix dialog overflow found by smoke.
- [x] Fix false dev-state failure found in `./tmp/state.txt`.

Acceptance checks:

- [x] Full admin/editorial browser smoke passes.
- [x] Docs promotion notes are ready.
- [x] `bun run test` passes.
- [x] `bun run check` passes.

## Current chunk

None.

## Open decisions

| ID    | Question                                                                | Default for implementation                                                                       |
| ----- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| PS-O1 | Should text `format` enforce URL, slug, color, or icon syntax?          | No. Treat format as an authoring/editor hint first.                                              |
| PS-O2 | Should `contentItem.kind` include `resume` separately from `page`?      | No. Use `kind = page` with `templateKey = resume`.                                               |
| PS-O3 | Should social links be a separate entity?                               | No. Use `contentItem.kind = link` and placements/nav items.                                      |
| PS-O4 | Should page composition be records or schema-only template definitions? | Use `contentPlacement` records first so authors can manage ordering without editing schema JSON. |
| PS-O5 | Should markdown media references be validated against `mediaAsset.key`? | Not in the first version. Add after markdown preview or renderer exists.                         |
| PS-O6 | Should slug uniqueness be authority-enforced now?                       | Not until sparse unique semantics are explicit. Warn in admin first.                             |

## Blockers

| ID    | Status | Blocks | Notes                                                                                    |
| ----- | ------ | ------ | ---------------------------------------------------------------------------------------- |
| PS-B1 | closed | PS-02  | `prd/01-schema-routes.md` shipped route-keyed app, schema, API, reset, and client paths. |

## Cross-PRD dependencies

| Dependency                        | Direction      | Notes                                                                                                  |
| --------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------ |
| PRD 01 schema-backed app routes   | satisfied      | Route-key support has shipped; adding `site` to `schemaApps` should expose `/site` and `/site/schema`. |
| Declarative table/query evolution | optional input | Sorting/filter improvements can improve admin tables later. Do not block this PRD on them.             |
| Cloudflare media serving          | downstream     | This PRD stores media metadata only. Upload/serving belongs in a later workstream.                     |
| Public site renderer              | downstream     | This PRD should leave clean data for a renderer but should not implement one.                          |

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
- Site authoring app has media, people, navigation, and content placement entities.
- Text fields support editorial formats and multiline markdown authoring.
- Site authoring surfaces are generated from schema views.
- Site authoring surfaces show non-blocking readiness warnings for incomplete publishable content.

When this PRD ships, update `doc/roadmap.md`:

- Personal site authoring schema is no longer target work.
- Public site rendering remains outside first authoring scope unless a later PRD adds it.
