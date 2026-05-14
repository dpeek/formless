# PRD 35: Site regular pages and content lists

Status: ready
Current chunk: SCL-05 ready
Last updated: 2026-05-14

## Goal

Make Blog and Projects regular Site pages composed from blocks.

The first slice should:

- keep Site records flat as `block` and `blockPlacement`;
- keep `/blog/:slug` as post detail routing;
- remove the special generated `/blog` post-index page behavior;
- add public list block types for posts and projects;
- use `block.date` as publish/sort state for posts and projects;
- stop rendering page root `label` and `body` as public page intro copy;
- keep post detail rendering `post.label` but not `post.body`;
- split header navigation into primary and secondary child blocks;
- show active header navigation subtly;
- remove the tree child delete action from placement cards;
- render placement remove as a top-right icon button;
- remove primary Site editor `Add placement` actions;
- let footer links inherit the target page icon when the link has no own icon.

This PRD owns public Site list blocks, Blog/Projects regular-page rendering, public navigation polish, and the narrow tree placement action cleanup.
It does not own page sidebar creation/deletion/ordering, project detail routes, automatic orphan deletion, hero semantics, tags, search, RSS, or a general query block DSL.

## Problem Statement

The Site app now has first-class Posts and Projects authoring, but the public page composition still mixes two models.

Current behavior:

- `/blog` is a generated route that lists posts without a placed page block;
- `/projects` is a regular page with manually placed project blocks;
- Home uses ordinary groups with manually placed recent posts and featured projects;
- page root `label` and `body` can render as page intro copy when no body placements exist;
- post `body` is used as summary copy but can leak into detail rendering when there are no child placements;
- public post ordering falls back to record `createdAt`;
- projects have no simple publish/sort field outside manual placement order;
- header navigation treats the first placement as primary by convention;
- active public routes are not reflected in header navigation;
- Site tree placement cards show both Remove and Delete child actions;
- the primary Site editor still exposes broad `Add placement` actions;
- footer social links render their own `icon` field but internal links cannot inherit icon data from target pages.

The author needs Blog and Projects to behave like normal editable pages while still listing the right content automatically.
The visitor should see only published dated content.
The generated authoring UI should avoid destructive ambiguity until removal and deletion business rules are designed properly.

## Solution

Keep pages as blocks and make list rendering explicit.

Add two Site block types:

- `postList`;
- `projectList`.

Each list block renders public content from flat `block` records:

- `postList` queries live `post` blocks with `date` present;
- `projectList` queries live `project` blocks with `date` present;
- lists sort by `date` descending, then deterministic fallback;
- list cards use `label`, `body`, `href`, and optional `date`;
- missing `date` means unpublished and hidden from public lists.

Keep post detail routing:

- `/blog/:slug` resolves a `post` by `href`;
- missing `date` makes the post unavailable publicly;
- post detail renders `post.label`;
- post detail does not render `post.body`;
- long-form post content still comes from child placements.

Make `/blog` regular:

- the Blog page is a `page` block at `/blog`;
- its body content comes from child placements;
- the seed can place a `postList` block under Blog;
- `/blog` no longer needs generated post-index route projection.

Make `/projects` regular and query-backed:

- the Projects page stays a `page` block at `/projects`;
- its body content comes from child placements;
- the seed can place a `projectList` block under Projects;
- project blocks stay outbound links for now;
- no `/projects/:slug` route is generated.

Clean public page rendering:

- page roots render only their child placements;
- `page.label` and `page.body` remain authoring metadata unless a child block renders them explicitly;
- empty pages render an empty main area or a minimal non-content state only where needed for diagnostics.

Split header navigation:

- the header root contains a primary child block and a secondary child block;
- the primary block contains the home link;
- the secondary block contains the other nav links;
- the public renderer lays the primary group left and the secondary group centered;
- mobile keeps the primary link visible and puts secondary links in overflow when needed;
- active route styles use subtle dashed underline treatment distinct from hover.

Clean tree placement actions:

- remove Delete child from tree placement cards;
- keep Remove placement;
- render Remove placement as an `x` icon button at the top right of the placement card;
- do not auto-delete orphaned blocks in this PRD;
- remove primary Site editor `Add placement` collection actions because tree add controls should be the normal composition flow.

Resolve footer icons through link targets:

- a link's own `icon` wins;
- if an internal link has no own `icon`, the public tree may project the target block's `icon`;
- footer rendering can use the projected icon without knowing target internals.

## Source Map

Existing anchors:

- Current runtime docs: `doc/current.md`.
- Release target docs: `doc/roadmap.md`.
- Site posts/projects authoring PRD: `prd/32-site-posts-projects-authoring.md`.
- Site link targets PRD: `prd/33-site-link-targets.md`.
- Public Site chrome polish PRD: `prd/24-public-site-chrome-polish.md`.
- Site source schema: `schema/apps/site/schema.json`.
- Site source seed records: `schema/apps/site/seed-records.json`.
- Site tree projection: `src/site/tree.ts`.
- Site route resolver: `src/site/route-resolver.ts`.
- Site link target resolver: `src/site/link-targets.ts`.
- Public Site renderer: `src/app/site-renderer/renderer.tsx`.
- Public Site link helpers: `src/app/site-renderer/links.ts`.
- Public tree response types: `src/shared/protocol.ts`.
- Generated tree renderer: `src/app/generated/tree.tsx`.
- Generated collection renderer: `src/app/generated/collection.tsx`.
- Generated delete UI: `src/app/generated/record-delete.tsx`.
- Field behavior module: `src/shared/field-types.ts`.
- Schema field parser: `src/shared/schema-fields.ts`.
- Schema parser tests: `src/shared/schema.test.ts`.
- Site tree tests: `src/site/tree.test.ts`.
- Public renderer tests: `src/app.test.tsx`.
- View model tests: `src/client/views.test.ts`.

Owned files:

- `prd/35-site-regular-pages-and-content-lists.md`.

Likely changed files:

- `schema/apps/site/schema.json`.
- `schema/apps/site/seed-records.json`.
- `src/shared/protocol.ts`.
- `src/site/tree.ts`.
- `src/site/route-resolver.ts`.
- `src/site/link-targets.ts`.
- `src/app/site-renderer/renderer.tsx`.
- `src/app/generated/tree.tsx`.
- `src/shared/schema.test.ts`.
- `src/site/tree.test.ts`.
- `src/app.test.tsx`.
- `src/client/views.test.ts`.

Possible changed files:

- `src/shared/schema-types.ts`.
- `src/shared/schema-fields.ts`.
- `src/app/generated/field-ui-adapters.ts`.
- `src/app/generated/record-field-editor.tsx`.
- `src/app/generated/create.tsx`.
- `src/app/site-renderer/links.test.ts`.

## User Stories

1. As a Site author, I want Blog to be a normal page, so that I can compose its intro and list content with blocks.
2. As a Site author, I want Projects to be a normal page, so that it behaves like Blog and other pages.
3. As a Site author, I want to add a post list block to a page, so that posts can render without manual placement.
4. As a Site author, I want to add a project list block to a page, so that projects can render without manual placement.
5. As a Site author, I want post and project list blocks to be explicit block types, so that the schema stays understandable.
6. As a Site author, I want post ordering controlled by a date field, so that I can choose public order without rewriting record history.
7. As a Site author, I want project ordering controlled by the same date field for now, so that Projects can be ordered without manual placements.
8. As a Site author, I want missing dates to hide posts and projects from public lists, so that drafts stay unpublished.
9. As a Site author, I want missing dates to hide post detail pages, so that drafts cannot leak through direct URLs.
10. As a Site author, I want manually placed posts and projects to still require a date, so that unpublished content does not leak through curation.
11. As a Site author, I want post `body` to be summary copy, so that list cards can show descriptions.
12. As a Site author, I want post detail pages not to render `body`, so that summary copy does not appear as article content.
13. As a Site author, I want post detail pages to render `label`, so that direct post pages still have a title.
14. As a Site author, I want page root `label` and `body` not to render automatically, so that visible page content is controlled by blocks.
15. As a Site author, I want page titles to be authored through explicit content blocks, so that page chrome and page content are separate.
16. As a Site visitor, I want `/blog` to load as a regular page, so that Blog can contain custom content around the post list.
17. As a Site visitor, I want `/blog/:slug` to keep working, so that post permalinks remain stable.
18. As a Site visitor, I want unpublished posts to return not found, so that draft URLs are not public.
19. As a Site visitor, I want `/projects` to list dated projects, so that the page shows current project links.
20. As a Site visitor, I want project cards to link to their `href`, so that projects can point off-site.
21. As a Site visitor, I want no generated project detail pages, so that project links behave predictably for now.
22. As a Site visitor, I want active header navigation to be visible, so that I know which section I am reading.
23. As a Site visitor, I want Blog active on post detail routes, so that `/blog/:slug` keeps the Blog section highlighted.
24. As a Site visitor, I want Projects active on project section routes if those exist later, so that section matching stays consistent.
25. As a Site visitor, I want Home active only on the home route, so that the brand link does not look active everywhere.
26. As a Site author, I want the home header link separated from secondary navigation, so that the renderer can treat it as the site identity.
27. As a Site author, I want the primary header group left aligned, so that the personal-site name reads like the site anchor.
28. As a Site author, I want secondary header links centered, so that navigation has a stable visual structure.
29. As a Site author, I want the header split represented as blocks, so that layout intent is visible in content data.
30. As a Site author, I want the footer to use a target page icon when a link has no icon, so that social/page links can share target metadata.
31. As a Site author, I want `link.icon` to override target icons, so that special link presentations remain possible.
32. As a Site author, I want page icons to be editable, so that target links can inherit them.
33. As a Site author, I want tree placement cards to show one remove action, so that composition editing is not confused with deletion.
34. As a Site author, I want the remove action shown as an `x` icon in the card corner, so that it behaves like removing the placement.
35. As a Site author, I do not want a Delete child action in tree placement cards, so that block lifecycle rules are not implied by composition removal.
36. As a Site author, I want broad Add placement actions removed from the primary editor, so that tree add controls are the normal path.
37. As a runtime developer, I want list block projection isolated from renderer markup, so that query behavior is testable.
38. As a runtime developer, I want date-based public filtering in the route/tree layer, so that renderers do not decide publish state ad hoc.
39. As a runtime developer, I want link icon inheritance isolated near link target resolution, so that public components consume projected data.
40. As a runtime developer, I want header active-state matching in one small helper, so that preview and published paths stay consistent.

## Requirements

### Stored Records

- Site records stay flat as `block` and `blockPlacement`.
- `block.type` gains `postList`.
- `block.type` gains `projectList`.
- `block.date` is added as an optional date field.
- `block.icon` remains an optional text icon field.
- Post blocks use `date` as publish date and sort date.
- Project blocks use `date` as publish/sort date for now.
- List block records do not store arrays of target records.
- List block records do not store nested query objects in this PRD.
- No new stored route table is introduced.
- No project detail route records are introduced.

### Schema Authoring

- Site schema exposes `date` for post editing.
- Site schema exposes `date` for project editing.
- Site schema exposes `icon` for page editing.
- Site schema exposes `postList` as an addable tree child where page/group content can be composed.
- Site schema exposes `projectList` as an addable tree child where page/group content can be composed.
- Site schema keeps list block authoring small, likely `label` only for the first slice.
- Site schema hides irrelevant list block fields from normal editing.
- Header child policy allows the explicit primary and secondary header grouping blocks.
- Footer/internal link editing keeps existing link target behavior.
- Raw block views can still show low-level fields for diagnostics.

### Public Routing

- `/blog` resolves through the normal page route path.
- `/blog` no longer uses generated post-index projection.
- `/blog/:slug` keeps resolving post detail routes.
- Post detail resolution requires a live `post` block.
- Post detail resolution requires the post to have `date`.
- Post detail resolution requires matching `href`.
- Duplicate post route warning behavior remains deterministic.
- Missing or unpublished post detail routes return the existing not-found behavior.
- `/projects` resolves through the normal page route path.
- `/projects/:slug` is not generated in this PRD.

### Public Tree Projection

- Page nodes are projected without automatic page intro behavior.
- List blocks are projected as renderable block nodes.
- `postList` projection selects live dated post blocks.
- `projectList` projection selects live dated project blocks.
- List items sort by `date` descending.
- List item sort uses deterministic fallback when dates match.
- List projection omits tombstoned records.
- List projection omits records without `date`.
- List projection omits unpublished manually placed post/project blocks when they would otherwise render publicly.
- Projected post and project nodes include `date` only when present if the public protocol needs it.
- Projected links may include inherited target icons.
- Tree warnings remain the diagnostic channel for skipped invalid content.

### Public Rendering

- Page routes render page child placements only.
- Page routes do not render `page.label`.
- Page routes do not render `page.body`.
- Post detail routes render `post.label`.
- Post detail routes do not render `post.body`.
- Post detail routes render child placements as article content.
- Post cards render `label`, `body`, `href`, and optionally `date`.
- Project cards render `label`, `body`, `href`, and optionally `date`.
- Project cards treat `href` as the project link.
- List blocks render empty states only when useful and not as authoring instructions.
- Header active route styling is subtle and distinct from hover.
- Header active route styling can use dashed underline treatment.
- Header primary group renders left.
- Header secondary group renders centered.
- Header mobile keeps primary visible.
- Header mobile can put secondary navigation in overflow.
- Footer links use `link.icon` before inherited target icon.

### Generated Tree UI

- Tree placement cards do not render Delete child.
- Tree placement cards keep Remove placement when a remove action exists.
- Remove placement appears as an icon-size `x` button in the top-right card area.
- Remove placement keeps an accessible label.
- Remove placement still invokes the existing remove placement action.
- Remove placement does not delete the child block.
- Primary Site composition views remove broad collection-level `Add placement` actions.
- Tree add controls remain the way to compose new children.
- Existing ordering controls remain available.

## Implementation Decisions

| ID      | Decision                                                                       | Reason                                                                                             | Evidence                                                               |
| ------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| SCL-D1  | Keep posts, projects, pages, lists, header groups, and links as block records. | The Site model is flat and block-type driven.                                                      | `doc/overview.md`, `schema/apps/site/schema.json`                      |
| SCL-D2  | Add specific `postList` and `projectList` block types.                         | The first slice needs clear authoring semantics, not a general query DSL.                          | User decision 2026-05-14                                               |
| SCL-D3  | Make `/blog` a normal page route.                                              | Blog needs page composition like Projects and Home.                                                | Current `/projects` behavior, user decision 2026-05-14                 |
| SCL-D4  | Keep `/blog/:slug` special post detail routing.                                | Post permalinks should remain stable and not require manual page records per post.                 | User decision 2026-05-14, current route resolver behavior              |
| SCL-D5  | Do not add project detail routing.                                             | Project blocks are outbound/current-work links for now.                                            | User decision 2026-05-14                                               |
| SCL-D6  | Use `block.date` as publish and sort state for posts and projects.             | A missing date should hide drafts and avoid another publish-state field in the first slice.        | User decision 2026-05-14, existing date field support                  |
| SCL-D7  | Hide undated content from lists, manual placements, and post detail routes.    | If date is publish state, direct URL and curated placement leaks must be blocked too.              | User confirmation 2026-05-14                                           |
| SCL-D8  | Treat post `body` as list description only.                                    | Post detail content is authored through child blocks, while cards need summary copy.               | PRD 32 post authoring model, user decision 2026-05-14                  |
| SCL-D9  | Stop auto-rendering page root `label` and `body`.                              | Pages should be regular block containers; visible title/subtitle should come from explicit blocks. | User direction 2026-05-14                                              |
| SCL-D10 | Represent header primary/secondary navigation as separate child blocks.        | The renderer should not infer identity/navigation split from placement order.                      | User decision 2026-05-14                                               |
| SCL-D11 | Keep active navigation matching in public renderer/link helpers.               | Active state depends on route mode and normalized public paths, not stored content alone.          | `src/app/site-renderer/links.ts`, `src/app/site-renderer/renderer.tsx` |
| SCL-D12 | Remove Delete child from tree placement cards.                                 | Composition removal and block lifecycle need separate business-logic design.                       | User decision 2026-05-14                                               |
| SCL-D13 | Do not auto-delete orphan blocks in this PRD.                                  | Safe orphan cleanup needs reference and lifecycle rules.                                           | User decision 2026-05-14                                               |
| SCL-D14 | Remove primary broad Add placement actions.                                    | Tree add controls are the intended composition path until create/select-at-any-level ships.        | User decision 2026-05-14                                               |
| SCL-D15 | Let link icons override inherited target icons.                                | Explicit link presentation should win over target metadata.                                        | User decision 2026-05-14, PRD 33 link target semantics                 |
| SCL-D16 | Project `postList` and `projectList` blocks as tree query items.               | List queries should stay testable in the tree layer before renderer markup ships.                  | `src/site/tree.ts`, `src/site/tree.test.ts`                            |

## Deep Modules

- **Site content list projection:** resolves `postList` and `projectList` blocks into deterministic public content lists from flat records.
- **Site public publish filter:** centralizes whether a public block can render based on type, tombstone state, and `date`.
- **Site route resolver:** keeps post detail route ownership and removes generated Blog index behavior.
- **Site link target projection:** resolves internal link hrefs and inherited icons while keeping renderer-facing link shape simple.
- **Public header navigation model:** partitions primary and secondary header groups and computes active state from the current route.
- **Generated tree placement actions:** owns remove-only placement action UI without implying delete semantics.

## Testing Decisions

- Test public behavior through tree projection and rendered markup, not private helper call order.
- Site tree tests should assert `/blog` resolves as a normal page with a placed `postList`.
- Site tree tests should assert `/blog/:slug` still resolves dated posts.
- Site tree tests should assert undated posts are omitted from lists and return not found for detail routes.
- Site tree tests should assert undated manually placed posts/projects do not render publicly.
- Site tree tests should assert `projectList` sorts dated projects by date descending.
- Site tree tests should assert link icon projection uses `link.icon` before target `icon`.
- Public renderer tests should assert page routes do not render root `page.label` or `page.body`.
- Public renderer tests should assert post detail renders `post.label` and not `post.body`.
- Public renderer tests should assert header active state marks Home, Blog, and Projects correctly.
- Public renderer tests should assert header primary and secondary groups render in their expected regions.
- Generated app tests should assert tree placement cards render Remove as an icon button and do not render Delete child.
- Generated app tests should assert primary Site composition no longer renders `Add placement`.
- Schema tests should assert Site source schema declares `date`, `postList`, `projectList`, and editable page `icon`.
- View model tests should assert primary Site editor tree add variants include list blocks where expected.
- Browser smoke should open `/pages/home`, `/pages/blog`, `/pages/blog/<slug>`, and `/pages/projects` after implementation.

## Chunks

| ID     | Status  | Depends on | Scope             | Summary                                                                                          |
| ------ | ------- | ---------- | ----------------- | ------------------------------------------------------------------------------------------------ |
| SCL-01 | shipped | none       | schema, tree      | Add `date`, `postList`, `projectList`; make `/blog` regular; keep dated post detail routing.     |
| SCL-02 | shipped | SCL-01     | renderer, tests   | Render list blocks, suppress page root label/body, keep post detail label-only heading behavior. |
| SCL-03 | shipped | SCL-01     | header, links     | Split header primary/secondary blocks, add active route styles, inherit target icons for links.  |
| SCL-04 | shipped | none       | generated tree UI | Remove Delete child, make Remove placement an `x` icon button, remove primary Add placement UI.  |
| SCL-05 | ready   | SCL-02     | seed, browser     | Update Site seed to use Blog/Projects list blocks and run public browser smoke.                  |

## Status Notes

- 2026-05-14 SCL-01 shipped.
- Changed schema source to expose optional `block.date`, `postList`, and `projectList`.
- Changed public route/tree projection so `/blog` resolves as a normal page route.
- Changed post detail route resolution to require a dated live post.
- Changed public tree projection so manually placed posts/projects and list items require `date`.
- Projected list block items through `SiteBlockNode.query.items`, sorted by `date` descending.
- 2026-05-14 SCL-02 shipped.
- Public renderer now renders `postList` and `projectList` query items as dated content cards.
- Public page routes now render only child placements, not root `page.label` or `page.body`.
- Public post detail routes render the post heading and child placements, not `post.body`.
- `post-index` renderer compatibility now falls through to normal page placement rendering.
- 2026-05-14 SCL-03 shipped.
- Site schema now defines `headerPrimary` and `headerSecondary` block variants and exposes editable page `icon`.
- Site source seed now places Header Primary and Header Secondary groups under the Header root, with Home in Primary and Blog/Projects/Resume in Secondary.
- Public renderer now lays header primary navigation left and secondary navigation centered on desktop, with secondary links in the mobile menu.
- Header links now mark active routes with dashed underline styling; Blog is active on `/blog/:slug`, Projects is active on project-section routes, and Home is active only on Home.
- Internal link projection now inherits the target block `icon` when the link has no own `icon`; explicit `link.icon` still wins.
- 2026-05-14 SCL-04 shipped.
- Generated tree placement cards now render only Remove placement as a top-right `x` icon button.
- Generated tree placement cards no longer render Delete child actions, even when child block delete is enabled.
- Primary Site composition no longer exposes the broad `Add placement` collection action; tree add controls remain available.
- Blockers: none.

## Evidence

- 2026-05-14 SCL-01 `devstate check`: checks ok, services running, tests pass.
- 2026-05-14 SCL-01 browser smoke reset Site schema and seed, then opened `/pages/home`, `/pages/blog`, `/pages/blog/agents-are-enablers`, and `/pages/projects`.
- 2026-05-14 SCL-01 browser smoke: `bun browser --session scl-01 errors` returned no page errors.
- 2026-05-14 SCL-02 `devstate check`: checks ok, services running, test watcher pass.
- 2026-05-14 SCL-02 test watcher: `src/app.test.tsx` passed 137 tests.
- 2026-05-14 SCL-02 browser smoke reset Site schema and seed with `200` responses, opened `/pages/blog`, `/pages/blog/agents-are-enablers`, and `/pages/projects`.
- 2026-05-14 SCL-02 browser smoke: `/pages/blog` did not include root body copy `Notes on product engineering`.
- 2026-05-14 SCL-02 browser smoke: `/pages/blog/agents-are-enablers` rendered `Agents are enablers` and child markdown `Test1`, and did not render post summary copy.
- 2026-05-14 SCL-02 browser smoke: `/pages/projects` rendered projects and did not include root body copy `Current and recent product work`.
- 2026-05-14 SCL-02 browser smoke: `bun browser --session scl-02 errors` returned no page errors.
- 2026-05-14 SCL-03 `devstate check`: checks ok, services running, test watcher pass.
- 2026-05-14 SCL-03 test watcher: `src/shared/schema.test.ts` passed 101 tests after the final schema rerun; status reported test service pass.
- 2026-05-14 SCL-03 browser smoke reset Site schema and seed with `200` responses, then opened `/pages/home`, `/pages/blog`, `/pages/blog/agents-are-enablers`, and `/pages/projects`.
- 2026-05-14 SCL-03 browser smoke: active header nav projected `Blog` on `/pages/blog/agents-are-enablers` and `Projects` on `/pages/projects`.
- 2026-05-14 SCL-03 browser smoke: `bun browser --session scl-03 errors` returned no page errors.
- 2026-05-14 SCL-04 `devstate` evidence: `.devstate/status.md` reported checks ok and services running; `.devstate/logs/service-test.txt` reported `src/shared/schema.test.ts` 101 passed after final rerun; `.devstate/logs/check-vite.txt` reported formatting, lint, and type checks passed.
- 2026-05-14 SCL-04 requested `tmp/devstate.json`, `tmp/test.txt`, and `tmp/check.txt` files were absent in this checkout; devstate wrote `.devstate/status.md` and `.devstate/logs/*`.
- 2026-05-14 SCL-04 browser smoke reset Site schema and seed with `200` responses, opened `/site`, found two `data-formless-tree-remove-placement` controls, found zero `data-formless-tree-delete-child` controls, verified first remove control text `x`, and verified primary `Add placement` text was absent.
- 2026-05-14 SCL-04 browser smoke: `bun browser --session scl-04 errors` returned no page errors.

## Out of Scope

- Page creation, deletion, and ordering in the Site sidebar.
- Create-or-select tree add flow at every tree level.
- Automatic child block deletion when removing the last placement.
- Project detail routes.
- Tags.
- Search.
- RSS.
- General query/list block configuration.
- General layout DSL.
- Hero/title semantics across pages and posts.
- Image support for post detail hero rendering.
- Draft edit sessions.
- New storage tables or nested record shapes.

## Promote after ship

- SCL-01 promote: Site schema defines optional `block.date`, `postList`, and `projectList`.
- SCL-01 promote: `/blog` resolves through the normal page route path; generated post-index route projection is no longer emitted by the tree layer.
- SCL-01 promote: `/blog/:slug` still resolves post detail routes and now requires a dated live post.
- SCL-01 promote: public tree list projection hides tombstoned or undated posts/projects and sorts dated items by `date` descending.
- SCL-02 promote: public renderer renders `postList` and `projectList` query items as content cards with optional dates.
- SCL-02 promote: public page routes render only child placements, not root `page.label` or `page.body`.
- SCL-02 promote: post detail routes render `post.label` and child placements, not `post.body`.
- SCL-03 promote: Site schema defines `headerPrimary` and `headerSecondary` block types for explicit header navigation groups.
- SCL-03 promote: Site schema exposes editable page `icon`.
- SCL-03 promote: source Header seed uses Primary and Secondary child groups; Primary contains Home and Secondary contains Blog, Projects, and Resume.
- SCL-03 promote: public header rendering lays primary navigation left, secondary navigation centered, and mobile secondary navigation in the menu.
- SCL-03 promote: public header links use active route dashed underline styling; Blog stays active on post detail routes and Home is active only on Home.
- SCL-03 promote: internal link projection inherits target block icons when a link has no own icon; explicit link icons override target icons.
- SCL-04 promote: generated tree placement cards show only a top-right `x` remove-placement control and no child delete action.
- SCL-04 promote: primary Site composition no longer exposes the broad `Add placement` collection action.
- `doc/current.md`: note Blog and Projects are regular pages composed from blocks.
- `doc/current.md`: note `postList` and `projectList` blocks render dated public content.
- `doc/current.md`: note `block.date` controls public post/project list visibility and order.
- `doc/current.md`: note `/blog/:slug` remains post detail routing and requires dated posts.
- `doc/current.md`: note public page roots do not render root `label` or `body`.
- `doc/current.md`: note header navigation uses primary/secondary groups and active route styling.
- `doc/current.md`: note tree placement cards remove placements without showing child delete.
- `doc/roadmap.md`: mirror release-scope facts for regular Site pages, list blocks, and date-published content.

## Notes

- 2026-05-14: User confirmed `/blog/:slug` stays special post detail routing.
- 2026-05-14: User confirmed no project detail pages for now.
- 2026-05-14: User confirmed specific `postList` and `projectList` block types.
- 2026-05-14: User confirmed `date` is acceptable as publish and sort state for now.
- 2026-05-14: User confirmed missing dates should hide public content, including direct post detail routes and manual placements.
- 2026-05-14: User confirmed post detail should render `post.label` but not `post.body`.
- 2026-05-14: User confirmed header primary/secondary should be separate blocks.
- 2026-05-14: User deferred hero/title semantics.
- 2026-05-14: User deferred page sidebar creation/deletion/ordering.
- 2026-05-14: User deferred auto-delete/orphan business logic.
- 2026-05-14: User confirmed `link.icon` overrides inherited target icon.
