# PRD 36: Site slotted media and editorial blocks

Status: ready
Current chunk: SME-05 ready
Last updated: 2026-05-14

## Goal

Add slotted Site block composition for media and editorial content after PRD 35 lands.

The first slice should:

- keep Site records flat as `block` and `blockPlacement`;
- add named placement slots on `blockPlacement`;
- support primary post images through slotted image child blocks;
- support primary project images through slotted image child blocks;
- render post primary images in post lists and post detail headers;
- render project primary images in project lists;
- add a reusable `feature` block for left/right image plus label, markdown body, and optional CTA links;
- keep `hero` separate from the reusable feature/editorial block;
- avoid template-specific media fields such as `block.primaryImage`;
- avoid a general layout DSL, carousel model, or configurable grid system in this PRD.

This PRD owns named placement slots, primary image projection/rendering for posts and projects, and the first reusable feature/editorial block type.
It depends on PRD 35 making Blog and Projects regular pages with `postList` and `projectList` blocks.
It does not own general media library work, image transforms, project detail pages, grids, rows, carousels, tags, search, RSS, or a full template slot schema.

## Problem Statement

After PRD 35, Blog and Projects become regular pages and list rendering becomes explicit through `postList` and `projectList` blocks.
That gives the public Site a better content structure, but rich summary cards and article headers still need a way to select a specific image for a post or project.

Current Site content already uses blocks and placements for composition.
Image media is represented as `block.type = image`.
Posts and projects are also `block` records.
The existing placement edge can order child content, but it cannot name why a child is attached.
Without named roles, renderers have to infer special media from child order or block type, and authoring cannot clearly distinguish a post's primary image from inline article images.

The author also needs a reusable editorial block that can render a left/right media layout with a label, markdown body, and optional links.
The existing `hero` block has page-level weight and should not become the generic feature/popupout/content-promo primitive.

The model pressure is real, but the desired behavior still fits the block model if role information lives on the placement edge.

## Solution

Add a named slot field to `blockPlacement`.

Use the placement edge as the role-bearing relationship:

- empty or missing `slot` means normal body/default composition;
- `slot = "primaryImage"` marks the image used by post/project cards and post detail headers;
- `slot = "media"` marks feature block media;
- `slot = "actions"` marks feature block CTA/link children.

Post primary images:

- a post's primary image is an `image` block placed under the post with `slot = "primaryImage"`;
- the post list card uses the first visible primary image if present;
- the post detail header uses the first visible primary image if present;
- post article body rendering ignores primary image placements so the image does not render twice;
- default-slot post child placements remain long-form article content.

Project primary images:

- a project's primary image is an `image` block placed under the project with `slot = "primaryImage"`;
- the project list card uses the first visible primary image if present;
- project detail pages remain out of scope;
- default-slot project child placements remain unsupported unless a later PRD gives project detail pages or richer project composition semantics.

Feature blocks:

- add `block.type = feature`;
- a feature block uses `label` as the heading;
- a feature block uses markdown `body` as its main copy;
- a feature block supports one or more `media` slot image placements;
- a feature block supports `actions` slot link placements for CTA links;
- a feature block uses a small flat field to choose media side, likely `alignment = left | right`;
- on mobile, feature block media and text stack;
- unrecognized/default child placements can continue rendering after the main feature content if needed.

Named slots are intentionally simple in the first slice.
The schema does not need a general slot registry yet.
The public tree can project placement slots directly, and site-specific renderer helpers can select known slots for known block types.

## Source Map

Existing anchors:

- Current runtime docs: `doc/current.md`.
- Release target docs: `doc/roadmap.md`.
- Site media upload PRD: `prd/31-site-media-upload.md`.
- Site posts/projects authoring PRD: `prd/32-site-posts-projects-authoring.md`.
- Site regular pages/list PRD: `prd/35-site-regular-pages-and-content-lists.md`.
- Site source schema: `schema/apps/site/schema.json`.
- Site source seed records: `schema/apps/site/seed-records.json`.
- Site tree projection: `src/site/tree.ts`.
- Public tree response types: `src/shared/protocol.ts`.
- Public Site renderer: `src/app/site-renderer/renderer.tsx`.
- Generated tree renderer: `src/app/generated/tree.tsx`.
- Generated collection renderer: `src/app/generated/collection.tsx`.
- Generated create renderer: `src/app/generated/create.tsx`.
- Site tree tests: `src/site/tree.test.ts`.
- Public renderer tests: `src/app.test.tsx`.
- Schema parser tests: `src/shared/schema.test.ts`.
- View model tests: `src/client/views.test.ts`.

Owned files:

- `prd/36-site-slotted-media-and-editorial-blocks.md`.

Likely changed files:

- `schema/apps/site/schema.json`.
- `schema/apps/site/seed-records.json`.
- `src/shared/protocol.ts`.
- `src/site/tree.ts`.
- `src/app/site-renderer/renderer.tsx`.
- `src/app/generated/tree.tsx`.
- `src/shared/schema.test.ts`.
- `src/site/tree.test.ts`.
- `src/app.test.tsx`.
- `src/client/views.test.ts`.

Possible changed files:

- `src/shared/schema-types.ts`.
- `src/shared/schema-fields.ts`.
- `src/shared/schema-views.ts`.
- `src/app/generated/create.tsx`.
- `src/app/generated/record-field-editor.tsx`.

## User Stories

1. As a Site author, I want to attach a primary image to a post, so that post cards can show visual context.
2. As a Site author, I want a post primary image to appear in the post detail header, so that articles have a clear visual lead.
3. As a Site author, I want primary post images to be normal image blocks, so that upload and image editing reuse existing media behavior.
4. As a Site author, I want primary post images not to appear again in the body flow, so that article pages do not duplicate the same image.
5. As a Site author, I want inline article images to remain normal child blocks, so that article content can still include images wherever needed.
6. As a Site author, I want to attach a primary image to a project, so that project list cards can be more useful and scannable.
7. As a Site author, I want project primary images to be normal image blocks, so that project media does not need a special field editor.
8. As a Site author, I want project primary images to affect list cards only, so that project detail routes are not implied.
9. As a Site author, I want the editor to distinguish primary image placement from body placement, so that media roles are clear.
10. As a Site author, I want primary image creation to create the image block and placement together, so that I do not manage raw placement records.
11. As a Site author, I want to replace the image file without changing the post/project relationship, so that content structure stays stable.
12. As a Site author, I want to remove a primary image placement without deleting the image block, so that composition removal and block lifecycle stay separate.
13. As a Site visitor, I want post cards to show primary images when present, so that Blog is easier to scan.
14. As a Site visitor, I want post cards without images to still render cleanly, so that older content does not look broken.
15. As a Site visitor, I want post detail pages to show the primary image in the header when present, so that the post feels complete.
16. As a Site visitor, I want post detail pages without primary images to keep the existing title/content flow, so that images remain optional.
17. As a Site visitor, I want project cards to show primary images when present, so that Projects has useful visual summaries.
18. As a Site visitor, I want project cards to keep linking through the project `href`, so that project links behave as they did after PRD 35.
19. As a Site author, I want to add a feature block to a page, so that I can create reusable editorial sections.
20. As a Site author, I want a feature block to have a heading and markdown body, so that its copy is easy to author.
21. As a Site author, I want a feature block to accept an image, so that I can create image/text editorial layouts.
22. As a Site author, I want to choose whether feature media is left or right on desktop, so that page composition can vary.
23. As a Site author, I want feature media and text to stack on mobile, so that the layout stays readable.
24. As a Site author, I want a feature block to accept CTA links, so that a feature can point to related pages or external targets.
25. As a Site author, I want CTA links to be normal link blocks, so that internal/external link behavior and icons stay reusable.
26. As a Site author, I want the existing `hero` block to remain page-level, so that feature blocks do not change hero semantics.
27. As a Site author, I want named slots to be visible in authoring where they matter, so that I can understand why a child block is attached.
28. As a runtime developer, I want placement slots to be stored on `blockPlacement`, so that records stay flat and role information lives on the composition edge.
29. As a runtime developer, I want public tree projection to include placement slots, so that renderers can select primary/media/action children without querying raw records.
30. As a runtime developer, I want post and project image selection isolated in a renderer/tree helper, so that list rendering does not infer media from arbitrary order.
31. As a runtime developer, I want unknown slots to degrade safely, so that bad content does not crash public rendering.
32. As a runtime developer, I want duplicate primary images to resolve deterministically, so that public output is stable.
33. As a runtime developer, I want duplicate or ignored slots to produce warnings where useful, so that authoring/debugging has evidence.
34. As a runtime developer, I want the first slot model to avoid a full template schema, so that the release does not grow a general layout DSL.
35. As a runtime developer, I want tests around tree projection and public rendering, so that slot behavior is verified at the public boundary.

## Requirements

### Stored Records

- Site records stay flat as `block` and `blockPlacement`.
- `blockPlacement.slot` is added as an optional text field.
- Missing `slot` means the default/body slot.
- Slot values are plain strings in this PRD.
- This PRD recognizes at least `primaryImage`, `media`, and `actions`.
- `block.type` gains `feature`.
- Feature blocks reuse existing `label` and markdown `body` fields.
- Feature blocks use a flat field for desktop media side, likely `alignment`.
- Image media remains on image block `href`, `width`, and `height`.
- Posts and projects do not gain `primaryImage`, `imageHref`, or nested media fields.
- List blocks do not store arrays of projected card items.
- No media asset entity is introduced.
- No nested object fields are introduced.

### Schema Authoring

- Site schema exposes slot-aware tree child creation for post primary images.
- Site schema exposes slot-aware tree child creation for project primary images.
- Site schema exposes `feature` as an addable child under page and group content.
- Feature blocks can add image children into the `media` slot.
- Feature blocks can add link children into the `actions` slot.
- Feature blocks can edit label, markdown body, and alignment.
- Slot-specific creation should create the child block and placement together.
- Normal post body child creation remains available for markdown and body images as default-slot placements if supported by tree policy.
- Normal page/group composition remains default-slot unless an action explicitly creates a named slot.
- Raw block and placement views may expose `slot` for diagnostics.
- Primary authoring views should avoid broad manual placement forms where PRD 35 already removed them.

### Public Tree Projection

- Public tree placement nodes include `slot` when present.
- Default-slot placements can omit `slot` from the protocol or project it as an empty/default value; behavior must be consistent.
- Slot projection does not change the parent/child record shape.
- Public tree projection keeps placement ordering inside each slot.
- Public tree projection keeps cycle and missing-child protections.
- Public tree projection still excludes tombstoned records and invisible/unpublished content according to PRD 35 behavior.
- Post/project primary image helpers select the first visible `primaryImage` image placement by placement order.
- Duplicate primary image placements use deterministic first-match behavior.
- Duplicate or unsupported primary image placements may create tree warnings.
- Feature media helpers select visible `media` image placements by order.
- Feature action helpers select visible `actions` link placements by order.
- Unknown slot values remain available in the tree but are ignored by first-slice renderers unless they also render as default content by explicit decision.

### Public Rendering

- `postList` cards render primary image media when present.
- `postList` cards render cleanly when no primary image exists.
- `projectList` cards render primary image media when present.
- `projectList` cards render cleanly when no primary image exists.
- Post detail pages render the primary image in the detail header when present.
- Post detail pages do not render the primary image again in body placements.
- Post detail pages continue rendering default-slot child placements as article content.
- Post detail pages continue rendering `post.label`.
- Post detail pages continue not rendering `post.body` as article content after PRD 35.
- Project cards continue using project `href` as the link target.
- Feature blocks render media and text in a two-column layout on desktop.
- Feature blocks stack media and text on mobile.
- Feature block alignment controls whether media appears left or right on desktop.
- Feature block markdown body renders through the shared markdown renderer.
- Feature block CTA links use normal link rendering behavior.
- The existing `hero` block continues rendering as its own block type.
- Existing pages without slots continue rendering.

### Generated Tree UI

- Tree add controls can create named-slot children where the selected parent supports them.
- Named-slot add controls should be specific, such as Add primary image, Add feature image, and Add action link.
- Slot-specific child creation uses the existing action/mutation path where possible.
- Placement cards can show slot information where it helps distinguish media/action/default content.
- Remove placement behavior continues to remove only the placement edge.
- Tree ordering remains available inside a slot when multiple children are allowed.
- Tree ordering across different slots should not be presented as meaningful unless the renderer consumes it.

## Implementation Decisions

| ID      | Decision                                                                  | Reason                                                                                        | Evidence                                                              |
| ------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| SME-D1  | Store slot names on `blockPlacement`.                                     | Slot roles describe why a child is attached to a parent, so the role belongs on the edge.     | Existing `blockPlacement` composition model, user decision 2026-05-14 |
| SME-D2  | Keep primary images as child image blocks.                                | Upload, image dimensions, and public rendering already use image block fields.                | PRD 31 media upload, current image block model                        |
| SME-D3  | Do not add post/project `primaryImage` fields.                            | Template-specific fields would weaken the flat block composition model.                       | User discussion 2026-05-14, Formless flat-record core bet             |
| SME-D4  | Recognize `primaryImage`, `media`, and `actions` slots first.             | These cover post/project cards, post detail headers, and feature block CTA layouts.           | User request 2026-05-14                                               |
| SME-D5  | Add a `feature` block instead of overloading `hero`.                      | Hero has page-level semantics; feature/editorial blocks are reusable content sections.        | User discussion 2026-05-14, PRD 35 deferred hero semantics            |
| SME-D6  | Use a flat alignment field for feature media side.                        | Left/right media is a small authored option and does not require a layout DSL.                | User request 2026-05-14                                               |
| SME-D7  | Keep CTA links as slotted link blocks.                                    | Link target behavior, icons, and internal/external handling already belong to link blocks.    | PRD 33 link target semantics, current link renderer                   |
| SME-D8  | Select the first ordered primary image when duplicates exist.             | Public output must be deterministic even when content has multiple primary image placements.  | Existing deterministic placement ordering                             |
| SME-D9  | Ignore primary image placements in default post body rendering.           | Primary image must not duplicate in the article body.                                         | User request 2026-05-14                                               |
| SME-D10 | Keep grids, rows, carousels, and general slot schemas out of this PRD.    | The first slice needs concrete post/project/feature semantics, not a general layout platform. | User discussion 2026-05-14, PRD 35 out-of-scope general layout DSL    |
| SME-D11 | Make slot-aware projection renderer-facing rather than renderer-inferred. | Renderers should consume explicit roles instead of guessing from child order and block type.  | Existing public tree protocol, renderer-specific block branches       |
| SME-D12 | Treat this PRD as dependent on PRD 35.                                    | Primary images need PRD 35's regular post/project list blocks to have a stable card surface.  | PRD 35 chunks SCL-01/SCL-02/SCL-05                                    |

## Deep Modules

- **Site placement slot projection:** projects optional `blockPlacement.slot` into public tree placement nodes and keeps ordering/warning behavior deterministic.
- **Site slotted child selectors:** selects first/multiple children for known slots such as `primaryImage`, `media`, and `actions` from projected placement nodes.
- **Post/project card media model:** adapts list item nodes into renderer facts with optional primary image media.
- **Post detail header model:** separates primary image/header facts from default article body placements.
- **Feature block renderer model:** maps a feature block's label, markdown body, alignment, media placements, and CTA placements into one responsive public section.
- **Slot-aware tree add model:** exposes allowed named-slot child creation actions without requiring authors to edit raw placements.

## Testing Decisions

- Test slot behavior through schema parsing, public tree projection, generated authoring facts, and rendered markup.
- Avoid tests that assert private helper call order.
- Schema tests should assert `blockPlacement.slot`, `block.type = feature`, and feature alignment field shape.
- Site tree tests should assert placement slots project into public tree nodes.
- Site tree tests should assert missing/default slot behavior remains backward compatible.
- Site tree tests should assert post primary image selection uses the first ordered `primaryImage` image placement.
- Site tree tests should assert project primary image selection uses the first ordered `primaryImage` image placement.
- Site tree tests should assert duplicate primary image selection is deterministic.
- Public renderer tests should assert post list cards render primary images when present.
- Public renderer tests should assert project list cards render primary images when present.
- Public renderer tests should assert post detail headers render primary images and body content does not duplicate them.
- Public renderer tests should assert cards and detail pages render cleanly when primary images are absent.
- Public renderer tests should assert feature blocks render media left and media right variants.
- Public renderer tests should assert feature blocks stack coherently in a narrow/mobile render if browser smoke covers layout.
- Public renderer tests should assert feature CTA links use existing link behavior.
- View model tests should assert tree add variants include slot-specific actions where expected.
- Browser smoke should open `/pages/blog`, `/pages/blog/<slug>`, `/pages/projects`, and a page with a feature block after implementation.
- Use `devstate check` as final check evidence.
- Do not run raw `bun test`, `bun check`, `vp test`, or `vp check` manually during normal agent work.

## Chunks

| ID     | Status  | Depends on     | Scope             | Summary                                                                                     |
| ------ | ------- | -------------- | ----------------- | ------------------------------------------------------------------------------------------- |
| SME-01 | shipped | PRD 35 SCL-01  | schema, protocol  | Add `blockPlacement.slot`, `feature` type, feature alignment, and public slot projection.   |
| SME-02 | shipped | SME-01, SCL-02 | tree, renderer    | Render post/project primary images in list cards and post primary images in detail headers. |
| SME-03 | shipped | SME-01         | renderer, schema  | Add feature block rendering with media/action slots and left/right desktop alignment.       |
| SME-04 | shipped | SME-01         | generated tree UI | Add slot-aware tree child creation for primary images, feature media, and feature actions.  |
| SME-05 | ready   | SME-02, SME-03 | seed, browser     | Update Site seed with primary images and at least one feature block; run browser smoke.     |

## Out of Scope

- General media library.
- Media asset records.
- Image transforms, cropping, focal points, or responsive image generation.
- Video upload.
- File upload.
- Project detail pages.
- Tags.
- Search.
- RSS.
- General query/list block configuration.
- General template slot registry.
- General layout DSL.
- Grids.
- Rows.
- Carousels.
- Rich draft edit sessions.
- Automatic orphan deletion.
- Atomic batch mutation endpoint.
- Cross-app media references.

## Promote after ship

- `doc/current.md`: note `blockPlacement.slot` names child roles for Site composition.
- `doc/current.md`: note post and project primary images are slotted image child blocks.
- `doc/current.md`: note post lists and detail headers render primary images when present.
- `doc/current.md`: note project lists render primary images when present.
- `doc/current.md`: note `feature` blocks render label, markdown body, slotted media, and slotted action links.
- `doc/roadmap.md`: mirror release-scope facts for slotted media and feature blocks if they remain in first-release scope.

## Notes

- 2026-05-14: SME-01 shipped. Added optional `blockPlacement.slot`, `block.type = feature`, flat `block.alignment`, public `SitePlacementNode.slot`, and public `SiteBlockNode.alignment`.
- 2026-05-14: SME-01 evidence: `devstate check` passed; `.devstate/logs/service-test.txt` reported `src/app.test.tsx` 139 passed after watcher rerun; `.devstate/logs/check-vite.txt` reported formatting plus lint/type checks passed.
- 2026-05-14: SME-01 browser smoke: `bun browser --ignore-https-errors open https://36-site-slotted-media-and-editorial-blocks.formless.local/site`; browser eval confirmed tree add variants include `group hero feature markdown image link project postList projectList`.
- 2026-05-14: SME-01 blockers: none.
- 2026-05-14: SME-01 promotion notes: promote `blockPlacement.slot` edge roles, `feature` block type, and `block.alignment` public projection before global docs are updated.
- 2026-05-14: SME-02 shipped. Public `postList` and `projectList` query items now project ordered slotted `primaryImage` image placements; cards render the first primary image; post detail headers render the first primary image and body flow renders only default-slot placements.
- 2026-05-14: SME-02 evidence: `devstate check` passed; `.devstate/logs/service-test.txt` reported 4 files and 163 tests passed; `.devstate/logs/check-vite.txt` reported formatting plus lint/type checks passed. Required `tmp/devstate.json`, `tmp/test.txt`, and `tmp/check.txt` were absent in this checkout; `devstate` wrote `.devstate/status.md` and `.devstate/logs/*`.
- 2026-05-14: SME-02 browser smoke: `bun browser --session sme-02` opened `/pages/blog`, `/pages/blog/agents-are-enablers`, and `/pages/projects`; pages rendered expected public content and `bun browser --session sme-02 errors` returned no page errors.
- 2026-05-14: SME-02 blockers: none.
- 2026-05-14: SME-02 promotion notes: promote post and project primary images as slotted image child blocks; promote post/project list cards and post detail headers rendering primary images when present.
- 2026-05-14: SME-03 shipped. Public `feature` blocks now render the block label, markdown body, ordered `media` slot image placements, ordered `actions` slot link placements, and left/right media alignment. Default-slot feature child placements render after the main feature content; unsupported named slots stay ignored by the first-slice renderer.
- 2026-05-14: SME-03 evidence: `devstate check` passed; `.devstate/logs/service-test.txt` reported `src/app.test.tsx` 142 passed; `.devstate/logs/check-vite.txt` reported formatting plus lint/type checks passed. Required `tmp/devstate.json`, `tmp/test.txt`, and `tmp/check.txt` were absent in this checkout; `devstate` wrote `.devstate/status.md` and `.devstate/logs/*`.
- 2026-05-14: SME-03 browser smoke: `bun browser --session sme-03` opened `/pages/home`, loaded public Site main content, and `bun browser --session sme-03 errors` returned no page errors.
- 2026-05-14: SME-03 blockers: none.
- 2026-05-14: SME-03 promotion notes: promote `feature` blocks rendering label, markdown body, slotted media images, slotted action links, and media-side alignment before global docs are updated.
- 2026-05-14: SME-04 shipped. Generated Site tree add controls now support branch child options with custom labels and literal `blockPlacement` values. Post and project roots expose slotted `primaryImage` image creation; feature roots expose slotted `media` image and `actions` link creation. Tree placement cards show a slot badge when `blockPlacement.slot` is set, and placement ordering scopes by `parent` plus `slot`.
- 2026-05-14: SME-04 evidence: `devstate check` passed; `.devstate/logs/service-test.txt` reported 5 files and 202 tests passed after watcher rerun; `.devstate/logs/check-vite.txt` reported formatting plus lint/type checks passed. Required `tmp/devstate.json`, `tmp/test.txt`, and `tmp/check.txt` were absent in this checkout; `devstate` wrote `.devstate/status.md` and `.devstate/logs/*`.
- 2026-05-14: SME-04 browser smoke: `bun browser --session sme-04` opened `/site`; after runtime source schema reset, post tree controls exposed `Markdown|Primary image` with slots `default primaryImage`, project tree controls exposed `Primary image` with slot `primaryImage`, and `bun browser --session sme-04 errors` returned no page errors.
- 2026-05-14: SME-04 blockers: none.
- 2026-05-14: SME-04 promotion notes: promote slot-aware generated tree add controls for post/project primary images and feature media/action children; promote placement ordering scoped by `parent` and `slot`.
- 2026-05-14: User asked for primary images on posts and projects.
- 2026-05-14: User asked for a generic left/right image plus label/body block with possible CTA links.
- 2026-05-14: User asked whether named template slots push beyond the everything-is-blocks model.
- 2026-05-14: Decision: named placement slots keep the model block-based because role belongs to the composition edge.
- 2026-05-14: Decision: create a follow-on PRD based on PRD 35 landing first.
- 2026-05-14: Decision: use `feature` as the generic editorial block name.
