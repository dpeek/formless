# PRD 23: Site authoring simplification

Status: planned
Current chunk: SAS-01 ready
Last updated: 2026-05-12

## Goal

Simplify Site authoring so authors create fixed block types, compose content in the tree, and rely on generated routing/layout behavior for repeated chrome and posts.

The workstream should:

- keep Site records flat as `block` and `blockPlacement`;
- keep `blockPlacement` as the composition edge;
- stop exposing edit-time block type changes;
- stop exposing `templateKey` in authoring views;
- remove low-confidence block types from the first-release authoring vocabulary;
- make page content come only from child blocks;
- let tree editors add and remove child blocks at every allowed parent;
- model reusable Header/Footer as global Site frame roots, not repeated per-page placements;
- model posts as routable content with a generated `/blog` index;
- keep the public Site renderer site-specific for first release.

## Problem Statement

The current Site editor has a solid flat storage model, but authoring still exposes too much implementation detail.

Current behavior:

- `block.type` is editable after creation.
- Generated block editors can show `templateKey`.
- Page blocks can show a `body` editor even though page content should be child blocks.
- The Site source schema still includes `contentList`, `contentGrid`, `video`, `file`, `cta`, and `subscribe` block types.
- Query list blocks use `templateKey` to find content queries.
- Header and Footer are placed into pages even though they are shared site chrome.
- New child creation in the tree still flows through placement creation and existing block selection.
- Empty parent blocks do not yet have an obvious inline add flow.
- Removing a child from a tree is not yet a first-class authoring action.
- Posts are `block` records, but routing and `/blog` listing still need a clearer generated model.

Authors should not need to understand storage terms, reusable block internals, or template keys to build a page. They should choose a block type when adding content, edit fields relevant to that fixed type, and let the system handle composition, routing, and shared page chrome.

## Solution

Use the existing flat model, but move authoring behavior into clearer generated policies:

- **Fixed block variants:** `block.type` stays stored, required, and used by unions, but generated edit/tree/detail views do not present it. Create flows choose a type first and submit it as a hidden literal default.
- **Hidden template keys:** `templateKey` stops rendering in block authoring views. Renderer and routing behavior move to schema-level route/layout policy or concrete block variants.
- **Smaller block vocabulary:** remove `contentList`, `contentGrid`, `video`, `file`, `cta`, and `subscribe` from the first-release block type enum, union variants, create/edit views, public renderer branches, readiness checks, and source seeds. Use `group` for generic composition until a richer specialized block earns its place.
- **Page-as-container:** page blocks keep title/route metadata but do not render a `body` editor. Page body content is represented by child blocks only.
- **Tree composition controls:** tree results declare allowed child block types per parent variant. The generated tree shows add controls for any parent that allows children, including empty parents and the selected root. Add creates both a child block and its placement. Remove removes the placement edge.
- **Site frame roots:** Header and Footer remain block roots editable under Navigation, but public rendering injects them as a Site frame around every rendered page/post. Pages no longer store Header/Footer placements.
- **Content routes:** posts become routable content records. The generated Site route layer resolves `/blog/:slug` to post blocks and renders `/blog` from the post collection without requiring content-list blocks.

This is a Site authoring and public Site routing slice. It should not become a general layout DSL, full CMS, visual builder, or generic delete system.

## Source Map

Existing anchors:

- Current runtime docs: `doc/current.md`.
- Release target docs: `doc/roadmap.md`.
- Site tree renderer PRD: `prd/09-site-tree-renderer.md`.
- Site editor list/detail PRD: `prd/13-site-editor-list-detail.md`.
- Workbench/Site layout PRD: `prd/18-workbench-frame-and-site-authoring-layout.md`.
- Site root nav/tree PRD: `prd/19-site-editor-root-nav-and-tree.md`.
- Discriminated entity union PRD: `prd/20-discriminated-entity-unions.md`.
- Tree variant branch policy PRD: `prd/22-tree-variant-branch-policy.md`.
- Site source schema: `schema/apps/site/schema.json`.
- Site source seed records: `schema/apps/site/seed-records.json`.
- Schema parser and schema types: `src/shared/schema.ts`, `src/shared/schema-types.ts`.
- View parser and view model selection: `src/shared/schema-views.ts`, `src/client/views.ts`.
- Generated create and tree renderers: `src/app/generated/create.tsx`, `src/app/generated/tree.tsx`.
- Generated collection renderer: `src/app/generated/collection.tsx`.
- Entity action parser/runtime: `src/shared/schema-actions.ts`, `src/worker/actions.ts`.
- Site tree projection: `src/site/tree.ts`.
- Public Site route and renderer: `src/app/routes/site-page.tsx`, `src/app/site-renderer/renderer.tsx`.
- Site readiness warnings: `src/client/readiness.ts`.
- App tests: `src/app.test.tsx`.
- Site tree tests: `src/site/tree.test.ts`.
- Schema parser tests: `src/shared/schema.test.ts`.
- View model tests: `src/client/views.test.ts`.
- Authority/action tests: `src/worker/authority.test.ts`.

Owned files:

- `prd/23-site-authoring-simplification.md`.

## User Stories

1. As a Site author, I want to choose a block type when I add content, so that the editor starts with the right fields.
2. As a Site author, I want a block type to stay fixed after creation, so that I do not accidentally turn a link into a page or a group into a post.
3. As a Site author, I want Link blocks to show only link-relevant fields, so that navigation editing stays compact.
4. As a Site author, I want Markdown blocks to focus on writing, so that content editing is the main task.
5. As a Site author, I want Page blocks to avoid a body editor, so that all page content is visible in the child tree.
6. As a Site author, I want `templateKey` hidden, so that I do not need to know renderer internals.
7. As a Site author, I want a small block type list, so that choosing a block does not feel like choosing from unfinished features.
8. As a Site author, I want to use Group for generic sections, so that I can still compose layouts without specialized block types.
9. As a Site author, I want to add a child block inside any group that supports children, so that nested content is not limited to existing populated nodes.
10. As a Site author, I want empty groups to show an add control, so that I can build a section from scratch.
11. As a Site author, I want pages to show an add control even when they have no child blocks, so that blank pages are easy to start.
12. As a Site author, I want Header to allow Link children, so that site navigation stays editable in one place.
13. As a Site author, I want Footer to allow groups and links, so that footer sections stay editable in one place.
14. As a Site author, I want child type choices to be constrained by parent type, so that invalid page structures are harder to create.
15. As a Site author, I want to remove a child from a tree, so that I can clean up a page without raw placement tables.
16. As a Site author, I want removing a child to remove it from that parent, so that reused blocks are not destroyed unexpectedly.
17. As a Site author, I want Header and Footer edited once, so that shared navigation does not have to be repeated across pages.
18. As a Site author, I want every public page to include Header and Footer automatically, so that pages have a consistent frame.
19. As a Site author, I want a page tree to contain only page-specific content, so that shared chrome does not clutter page editing.
20. As a Site author, I want to create posts from a Posts area, so that writing is separate from page layout.
21. As a Site author, I want post routes generated for me, so that I do not manually maintain `/blog/...` links.
22. As a Site author, I want `/blog` to list posts automatically, so that I do not add a query-list block by hand.
23. As a Site author, I want editing a post to focus on title and body content, so that route mechanics stay out of the way.
24. As a Site visitor, I want `/blog` to show the post list, so that I can browse posts.
25. As a Site visitor, I want `/blog/:slug` to render a post page with site chrome, so that posts feel like normal site pages.
26. As a Site visitor, I want existing page routes to keep working, so that the authoring simplification does not break navigation.
27. As a schema author, I want child allowances declared in schema data, so that the tree renderer remains generic.
28. As a schema author, I want literal create defaults, so that generated create flows can hide fixed fields safely.
29. As a runtime developer, I want route/content resolution isolated in a testable module, so that `/blog` and page lookup rules are not scattered through the renderer.
30. As a runtime developer, I want tree composition commands isolated in a testable module, so that two-record create/remove behavior has one authority-owned path.

## Requirements

### Authoring Field Behavior

- Generated edit views for `block` must not render `type`.
- Generated context/detail/tree item views for `block` must not render `type`.
- Generated create flows may present block type as an initial chooser, but not as an editable field inside the form after a type is chosen.
- Create submission must still include a valid `block.type`.
- `block.type` remains a required enum field in storage.
- Existing discriminated union selection still reads `block.type`.
- Hidden fields must not be cleared just because they are hidden.
- `templateKey` must not render in generated Site block authoring views.
- Page block authoring must not render `body`.
- Post block authoring should render `body` as the main writing field.
- Post root body content is allowed because posts are content records; page root body content is not allowed because pages are containers.
- Header and Footer root authoring must remain available through the Site root sidebar.

### Block Vocabulary

- Remove `contentList` from the source Site block type enum.
- Remove `contentGrid` from the source Site block type enum.
- Remove `video` from the source Site block type enum.
- Remove `file` from the source Site block type enum.
- Remove `cta` from the source Site block type enum.
- Remove `subscribe` from the source Site block type enum.
- Remove those variants from `blockByType`.
- Remove those variants from Site create, edit, root detail, and tree item views.
- Remove those block branches from the public renderer.
- Remove those readiness checks.
- Source seeds must not create blocks of removed types.
- Existing source seed content that used removed types must be expressed as `group`, `markdown`, `image`, route-generated content, or removed from the seed.
- Raw debug/admin views may still expose all stored scalar fields, but they should not reintroduce removed block types.

### Literal Create Defaults

- Create views can declare literal defaults for scalar fields.
- Literal defaults are validated against the target field type.
- Context defaults keep existing behavior.
- A create field must not be both visible and defaulted.
- Hidden literal defaults are included in submitted create values.
- Site child block creation uses a literal default for `block.type`.
- Literal defaults should be parsed and resolved by the existing create-default path rather than special-cased in Site UI.

### Tree Child Policy

- Tree results can declare allowed child block variants for each parent block variant.
- The first Site policy should allow page roots to contain page-content blocks, not Header/Footer chrome.
- The first Site policy should allow Header to contain Link blocks.
- The first Site policy should allow Footer to contain Group and Link blocks.
- The first Site policy should allow Group to contain useful generic content children.
- Leaf-like blocks such as Link, Markdown, and Image should not show add controls unless the schema explicitly allows children.
- The policy must validate referenced variants against the child item view union.
- The policy must expose render-ready facts through view models.
- The generated tree renderer must not inspect raw schema.
- Add controls must render for a selected root with no current children when its type allows children.
- Add controls must render for nested child records with no current children when their type allows children.
- Add controls must be hidden when a parent type allows no children.
- Existing tree branch leaf policy for Header/Footer context links must keep working until Site frame removes repeated Header/Footer page placements.

### Tree Add And Remove

- Adding a new child from the tree chooses an allowed block type first.
- The create form for that child type does not render `type`.
- Adding a new child creates a `block` record and a `blockPlacement` record.
- The new placement parent is the selected parent block.
- The new placement order is stable and places the child at the end of the parent by default.
- The add path should be authority-owned so it does not leave orphan child blocks if placement creation fails.
- Removing a child from the tree removes or tombstones the `blockPlacement` edge.
- Removing a child from a tree does not delete the child block in the first slice.
- Removing a child should not remove the same block from another parent.
- Proper generic delete mutations stay out of scope.
- Tree drag ordering keeps working for visible siblings.
- Missing-child and cycle warnings keep working for expanded branches.

### Site Frame

- Header remains a `block` root with `type = header`.
- Footer remains a `block` root with `type = footer`.
- Header and Footer remain editable in the Site sidebar under Navigation.
- Public rendering should include Header and Footer through a Site frame, not through per-page placements.
- Page source seeds should not need Header/Footer placements.
- Site frame resolution should be deterministic when multiple Header or Footer roots exist.
- Public tree metadata should warn when no Header or Footer root exists if the frame expects one.
- Public tree metadata should warn when duplicate Header or Footer roots exist and choose one deterministically.
- Public rendering should still work without a Header or Footer root.
- The Site frame should not become a general layout DSL.
- Site frame behavior should not affect generated admin routes.

### Posts And Blog Routing

- Posts remain flat `block` records.
- Post records use `block.type = post`.
- Post authoring should focus on title and content.
- Post creation should derive a stable route under `/blog`.
- Generated route values should avoid collisions.
- Route generation should be authority-owned or otherwise deterministic.
- Public route lookup should resolve existing page routes.
- Public route lookup should resolve post routes.
- `/blog` should render a generated post index.
- `/blog/:slug` should render a post detail page.
- Post detail pages should use the Site frame.
- The generated `/blog` index should not require `contentList` or `contentGrid` blocks.
- The generated `/blog` index should use a deterministic post order.
- The generated `/blog` index should omit tombstoned records.
- The generated `/blog` index should not require cross-app queries.

## Implementation Decisions

| ID      | Decision                                                                | Reason                                                                         | Evidence                                               |
| ------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------ |
| SAS-D1  | Keep `block` and `blockPlacement` as the Site storage model.            | Flat records are a core runtime bet and existing Site code uses them.          | `CONTEXT.md`, prior Site PRDs                          |
| SAS-D2  | Treat block type as create-time authoring input.                        | Type switching after creation makes editors unstable and unsafe.               | User direction 2026-05-12                              |
| SAS-D3  | Use hidden literal defaults for fixed block type creation.              | The stored discriminator is still required, but authors need not edit it.      | Existing create defaults already resolve hidden values |
| SAS-D4  | Hide `templateKey` before removing the storage field.                   | Existing seeds/rendering may still depend on it during migration.              | Current Site renderer and tree projection              |
| SAS-D5  | Remove unfinished block types from first-release authoring vocabulary.  | A smaller set makes authoring clearer and avoids supporting weak abstractions. | User direction 2026-05-12                              |
| SAS-D6  | Use `group` as the generic fallback composition block.                  | It preserves composition without speculative specialized types.                | User direction 2026-05-12                              |
| SAS-D7  | Keep page content in child blocks only.                                 | Page roots should own route/container identity, not body content.              | User direction 2026-05-12                              |
| SAS-D8  | Add child allowance as tree result/view-model policy.                   | Parent-child authoring rules belong to the generated tree view.                | Existing tree result branch policy                     |
| SAS-D9  | Add/remove tree commands should write placement edges, not nested data. | The data model stays flat and public tree projection remains reusable.         | `blockPlacement` relationship model                    |
| SAS-D10 | Remove from tree means remove the placement edge first.                 | Blocks can be reused; deleting the child would be destructive.                 | Existing reusable Header/Footer/link records           |
| SAS-D11 | Model Header/Footer as a Site frame.                                    | Shared chrome should be edited once and rendered everywhere.                   | User question about repeated Header/Footer             |
| SAS-D12 | Do not use visible page templates for first release.                    | A full template system would become a layout DSL too early.                    | Roadmap excludes full layout DSL                       |
| SAS-D13 | Model posts as content routes rather than query-list blocks.            | Authors should write posts; the system should own `/blog` routing/listing.     | User question about posts and `/blog`                  |
| SAS-D14 | Keep the public renderer site-specific.                                 | This simplification should not generalize renderer layout too early.           | Roadmap and PRD 09 direction                           |

### Deep Modules

- **Create default resolver:** extend the existing create default path to support literal values beside context values. Its interface stays small: parse defaults, validate defaults, resolve defaults for a query context/form submission.
- **Tree child policy selector:** given a tree result model and a parent record, return allowed child variants. This keeps add-control rendering independent from raw schema.
- **Tree composition action module:** given a parent block, child type, child values, and desired order, create the child block and placement edge atomically. Given a placement id, remove that edge.
- **Site route resolver:** given Site records and a slug/path, return page, post detail, or post index data plus Site frame roots. This concentrates `/blog`, Header/Footer frame, duplicate route, and missing-route rules.

## Testing Decisions

- Parser tests should cover literal create defaults, including valid scalar defaults, bad field names, wrong field types, duplicate visible/default fields, and stringify preservation.
- Parser tests should cover tree child policy validation against union variants.
- View model tests should cover render-ready child allowance facts and hidden fixed-type create actions.
- Generated create tests should prove fixed block type forms do not render `type` but submit it.
- Generated tree tests should prove add controls appear on empty allowed parents and not on disallowed parents.
- Generated tree tests should prove remove controls submit a placement-edge removal command.
- Action/runtime tests should cover atomic child block plus placement creation.
- Action/runtime tests should cover placement-edge removal without deleting the child block.
- Site tree tests should cover public frame resolution for Header/Footer.
- Site tree tests should cover route resolution for pages, post detail routes, and `/blog`.
- Public renderer tests should cover `/blog`, `/blog/:slug`, normal pages, and missing Header/Footer roots.
- Readiness tests should remove warnings for removed block types.
- Source schema tests should prove removed block types no longer parse from the Site source schema.
- Browser smoke should reset Site schema and seed, open `/site`, add a child to an empty allowed parent, remove a placement, open `/pages/home`, `/pages/blog`, and a post route, then check browser errors.
- Tests should assert behavior through parser, view model, action, tree, and public route interfaces, not helper implementation details.

## Chunks

| ID     | Status  | Depends on | Main files                                                       | Acceptance                                                                                                                   |
| ------ | ------- | ---------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| SAS-01 | ready   | none       | PRD, schema tests                                                | Characterize current Site authoring behavior and lock planned simplification scope.                                          |
| SAS-02 | planned | SAS-01     | schema parser, create defaults, view models, generated create UI | Literal defaults parse/resolve, and fixed-type create forms hide `type` while submitting it.                                 |
| SAS-03 | planned | SAS-02     | Site source schema, generated block views, tests                 | Site block authoring hides `type`, hides `templateKey`, hides page `body`, and removes deprecated block variants from views. |
| SAS-04 | planned | SAS-03     | tree policy parser/view model/generated tree UI                  | Tree child policy controls add buttons for allowed parent variants, including empty parents.                                 |
| SAS-05 | planned | SAS-04     | authority actions/storage integration/generated tree UI          | Tree add creates block plus placement, and tree remove tombstones placement edges without deleting child blocks.             |
| SAS-06 | planned | SAS-03     | Site source schema/seeds/readiness/public renderer               | Removed block types are gone from source schema, seeds, readiness checks, and renderer branches.                             |
| SAS-07 | planned | SAS-06     | Site tree projection/protocol/renderer/tests                     | Header/Footer resolve as Site frame roots and page seeds no longer repeat Header/Footer placements.                          |
| SAS-08 | planned | SAS-07     | Site route resolver/tree projection/renderer/tests               | Posts route at `/blog/:slug`, and `/blog` renders a generated post index without query-list blocks.                          |
| SAS-09 | planned | SAS-08     | browser smoke, PRD                                               | `/site`, `/pages/home`, `/pages/blog`, and a post route smoke pass; PRD status/evidence are current.                         |

## Out of Scope

- Do not split `block` into separate stored entities.
- Do not add nested child arrays to `block`.
- Do not add a general layout DSL.
- Do not add a visual page builder.
- Do not add drag reparenting.
- Do not add full page template management.
- Do not add user-authored route templates.
- Do not add media upload.
- Do not add generic delete mutations.
- Do not delete child blocks when removing a placement in the first slice.
- Do not add draft/published workflows.
- Do not add permissions.
- Do not add cross-app queries.
- Do not add a generic CMS taxonomy system.
- Do not promote facts to `doc/current.md` or `doc/roadmap.md` until chunks ship.

## Promote After Ship

- `doc/current.md`: Site block type is fixed after creation in generated authoring views.
- `doc/current.md`: Site authoring hides `templateKey` and page `body` editors.
- `doc/current.md`: Site source block types exclude `contentList`, `contentGrid`, `video`, `file`, `cta`, and `subscribe`.
- `doc/current.md`: generated tree results can declare allowed child variants and render add controls for empty allowed parents.
- `doc/current.md`: Site tree add creates a child block plus placement edge.
- `doc/current.md`: Site tree remove removes placement edges without deleting child blocks.
- `doc/current.md`: Header/Footer render through a Site frame instead of repeated per-page placements.
- `doc/current.md`: Site posts route under `/blog`, and `/blog` renders a generated post index.
- `doc/roadmap.md`: Site authoring simplification is first-release scope if shipped before release.

## Further Notes

- The strongest design line is separating storage shape from authoring intent. `block.type` remains a real stored discriminator; the editor simply stops treating it as mutable content.
- `templateKey` should be considered an internal migration smell. Hiding it is the first step; later chunks should remove renderer dependence where practical.
- Site frame roots are a better fit than page templates for Header/Footer because the repeated thing is global chrome, not copied page content.
- If richer page templates become necessary later, they should assign route/layout behavior without cloning block trees across pages.
- Post route generation needs a clear stability rule. The recommended first rule is: derive the route from the title on create, keep it stable after creation, and resolve collisions deterministically.

## Status Notes

- 2026-05-12: Created PRD from user request to simplify Site authoring, fix block type after creation, hide template keys, remove unfinished block types, add tree child creation/removal, model Header/Footer as reusable frame roots, and model posts with generated blog routing.

## Blockers

- None.

## Evidence

- 2026-05-12: `devstate start` reports checks ok and services running at `https://formless.local`.
- 2026-05-12: `devstate check` reports checks ok and services running at `https://formless.local`.
