# PRD 33: Site link targets

Status: ready
Current chunk: SLT-06 ready
Last updated: 2026-05-13

## Goal

Make Site link blocks distinguish internal and external targets.

The first version should:

- keep Site records flat as `block` and `blockPlacement`;
- keep `blockPlacement` as composition only;
- let internal links point at a target `block` record;
- let external links store an absolute URL;
- keep page, post, and project route ownership on the target block's own `href`;
- preserve public preview and published link modes;
- keep existing legacy `link` records rendering during migration.

This PRD owns Site link target semantics.
It does not own navigation IA, page creation, post/project authoring, media upload, or a general URL-routing DSL.

## Problem Statement

The Site app currently stores link destinations as freeform `block.href` strings.
That works for rendering, but it makes internal navigation fragile.

Current behavior:

- page, post, project, image, and link blocks all reuse `block.href`;
- link blocks do not distinguish internal and external destinations;
- public rendering infers external links from `http://` or `https://`;
- public rendering rewrites relative link strings for preview and published modes;
- an internal navigation link to `/blog` is just text, not a reference to the Blog page block;
- if a page or post route changes, link blocks that point at the old string do not follow;
- external link values are not structurally different from internal path values;
- the authoring UI cannot offer a focused page/post/project picker for internal links.

The author needs two different concepts:

- internal links point to content in this Site;
- external links point to another absolute URL.

Those concepts should be explicit in the Site schema without turning a link target into a child placement.

## Solution

Keep links as `block` records.
Do not model an internal link target as a single child block.

A child placement means composition: render a block inside another block.
A link target means navigation: clicking this block goes to another block's route.
Those are different relationships.

Use flat fields on `block`:

- an internal link stores a reference to the target block;
- an external link stores an absolute URL in `href`;
- legacy link blocks without the new target fields continue to use current `href` behavior.

The public tree projection resolves link targets before the renderer consumes them.
For internal links, the projection reads the target block's `href` and projects that as the link block's rendered `href`.
For external links, the projection validates and projects the external URL.
The public tree response can keep the existing `SiteBlockNode.href` shape for the first slice.

The renderer then keeps using the same preview/published link-mode helper.
When a target page/post/project route changes, internal links follow because they resolve through the target block.

## Source Map

Existing anchors:

- Current runtime docs: `doc/current.md`.
- Release target docs: `doc/roadmap.md`.
- Site source schema: `schema/apps/site/schema.json`.
- Site source seed records: `schema/apps/site/seed-records.json`.
- Site tree projection: `src/site/tree.ts`.
- Site route resolver: `src/site/route-resolver.ts`.
- Public Site renderer: `src/app/site-renderer/renderer.tsx`.
- Public link mode helpers: `src/app/site-renderer/links.ts`.
- Public tree response types: `src/shared/protocol.ts`.
- Field behavior module: `src/shared/field-types.ts`.
- Schema field parser: `src/shared/schema-fields.ts`.
- Generated field adapters: `src/app/generated/field-ui-adapters.ts`.
- Generated inline editor: `src/app/generated/record-field-editor.tsx`.
- Generated create renderer: `src/app/generated/create.tsx`.
- Client store reference options: `src/client/store.ts`, `src/client/projections.ts`.
- Public renderer tests: `src/app.test.tsx`, `src/app/site-renderer/links.test.ts`.
- Site tree tests: `src/site/tree.test.ts`.
- Schema parser tests: `src/shared/schema.test.ts`.

Owned files:

- `prd/33-site-link-targets.md`.

Likely changed files:

- `schema/apps/site/schema.json`.
- `schema/apps/site/seed-records.json`.
- `src/site/tree.ts`.
- `src/site/link-targets.ts`.
- `src/app/site-renderer/links.ts`.
- `src/app/site-renderer/renderer.tsx`.
- `src/shared/protocol.ts` only if unresolved target metadata must be exposed.
- `src/shared/schema.test.ts`.
- `src/site/tree.test.ts`.
- `src/app/site-renderer/links.test.ts`.
- `src/app.test.tsx`.

Possible changed files:

- `src/shared/schema-types.ts`.
- `src/shared/schema-fields.ts`.
- `src/client/projections.ts`.
- `src/client/store.ts`.
- `src/app/generated/record-field-editor.tsx`.
- `src/app/generated/create.tsx`.
- `src/app/generated/field-ui-adapters.ts`.

## User Stories

1. As a Site author, I want to choose an internal page as a link target, so that links follow route changes.
2. As a Site author, I want to choose an internal post as a link target, so that blog links do not depend on copied path strings.
3. As a Site author, I want to choose an internal project when a project route exists, so that project navigation can stay referential.
4. As a Site author, I want external links to require absolute URLs, so that outgoing links are not confused with Site routes.
5. As a Site author, I want header navigation links to target blocks directly, so that main navigation stays maintainable.
6. As a Site author, I want footer navigation links to target blocks directly, so that repeated chrome does not duplicate route strings.
7. As a Site author, I want social links to stay external links, so that GitHub, LinkedIn, and similar links keep opening off-site.
8. As a Site author, I want invalid internal targets to be visible as warnings, so that broken navigation is easy to fix.
9. As a Site author, I want missing external URLs to be visible as incomplete links, so that the editor does not silently publish dead links.
10. As a Site visitor, I want internal links to use the preview route while previewing, so that `/pages/*` navigation works locally.
11. As a Site visitor, I want internal links to use top-level published paths in published mode, so that published navigation is clean.
12. As a Site visitor, I want external links to keep existing external-link behavior, so that off-site links open with the expected target and rel attributes.
13. As a schema author, I want link target fields to stay flat on `block`, so that no nested stored value or child-only shortcut is introduced.
14. As a schema author, I want `blockPlacement` to remain the composition edge, so that navigation does not overload tree containment.
15. As a schema author, I want legacy link records to keep rendering, so that existing Site data is not broken by the new schema.
16. As a runtime developer, I want link target resolution isolated in a small module, so that tree projection and renderer behavior remain testable.
17. As a runtime developer, I want public tree shape to stay stable if possible, so that renderers still consume one projected `href`.
18. As a runtime developer, I want target resolution warnings to use existing Site tree warning metadata, so that diagnostics stay in one place.
19. As a runtime developer, I want tests around target resolution instead of ad hoc string checks in components, so that future route changes do not break navigation.
20. As a runtime developer, I want this work to coordinate with post/project authoring, so that new routable content can become link targets without another rewrite.

## Requirements

### Stored Records

- Site records stay flat as `block` and `blockPlacement`.
- `blockPlacement.parent` remains the parent block composition edge.
- `blockPlacement.block` remains the child block composition edge.
- Internal link targets must not be stored as single child placements.
- Link target fields live on `block`.
- Page, post, and project blocks keep using their own `href` as route ownership.
- Image blocks keep using `href` as the media source.
- External link blocks keep using `href` as their destination URL.
- Internal link blocks use a reference field to point at the target block.
- Existing legacy link blocks with only `href` keep rendering through current string behavior.
- No nested object fields are introduced.
- No array fields are introduced.
- No new stored route table is introduced.

### Schema Behavior

- The Site schema distinguishes internal and external link target modes.
- The first implementation should prefer explicit link variants or target-mode fields over path-shape inference.
- Internal link authoring exposes a target block reference.
- External link authoring exposes an `href` editor.
- External link authoring requires an absolute URL.
- Internal link authoring should not require authors to copy `/pages/*` or published route strings.
- Link icons and labels keep existing field behavior.
- Legacy `link` records remain supported during migration.
- Source seed links should be migrated to the new explicit target mode where practical.
- Header and footer seeded navigation links should become internal links.
- Social seeded links should become external links.

### Internal Link Resolution

- Internal link target resolution reads the referenced target block.
- A target block is routable when it has a non-empty route `href`.
- The first routable targets are page, post, and project blocks.
- If the target block is missing, tombstoned, or not routable, the public tree emits a warning.
- A broken internal link projects no rendered `href`.
- A valid internal link projects the target block's route `href`.
- The renderer then applies preview or published link-mode rewriting to that projected route.
- Internal links to `/` resolve through the Home page block's `href`.
- Internal links to `/blog` resolve through the Blog page block's `href`.
- Internal links to `/blog/<slug>` resolve through the target post block's `href`.
- Query suffixes and hash fragments can stay out of the first slice unless the stored target model explicitly adds them.

### External Link Resolution

- External link targets must parse as absolute URLs.
- The first allowed external schemes are `http:` and `https:`.
- Invalid external URLs emit a public tree warning.
- Invalid external URLs project no rendered `href`.
- Valid external URLs pass through unchanged.
- External links keep existing `target="_blank"` behavior.
- External links keep existing `rel="noreferrer"` behavior.
- Protocol-relative URLs are not valid external URLs in the first slice.
- `mailto:` and `tel:` are out of scope unless a chunk explicitly adds an allowed-scheme decision.

### Public Tree

- Public tree response shape should stay unchanged for the first slice if the projection can resolve links to `SiteBlockNode.href`.
- `SiteBlockNode.href` remains the renderer-facing href.
- Link target fields do not need to be exposed in public tree output unless unresolved-target diagnostics require them.
- Existing page, post, project, image, and markdown projection behavior stays unchanged.
- Existing missing-child and cycle warnings stay unchanged.
- New warnings should use the existing `SiteTreeWarning` list.
- Public tree projection should stay deterministic.

### Public Renderer

- `LinkBlock` keeps rendering one anchor when a projected `href` exists.
- `ContentSummary` keeps linking page/post/project/project-like summaries through projected `href`.
- `profileAwareSiteHref` keeps owning preview/published rewriting.
- `isExternalSiteHref` keeps owning external-link detection for rendered hrefs.
- The renderer should not need to know whether a link came from a target block or an external URL if the tree projection resolves it.
- Missing or invalid link targets should render no anchor, not a broken `href`.
- Existing public header and footer layout behavior stays unchanged.

### Generated Authoring UI

- Internal link authoring should show a reference selector for target block.
- External link authoring should show a URL input.
- Link target mode should be visible enough that authors know which destination kind they are editing.
- The UI should avoid showing unrelated target fields where existing variant presentation can hide them.
- If generic reference option filtering is not available in the first chunk, the resolver must still reject or warn on non-routable targets.
- A later chunk may add filtered reference options for routable Site blocks.
- Existing link icon editing keeps working.
- Existing link label editing keeps working.
- Existing tree add controls keep working.

### Backward Compatibility

- Existing records with `type = link` and only `href` keep rendering.
- Existing internal relative `href` strings keep preview/published rewriting.
- Existing external absolute `href` strings keep external behavior.
- New source seed data should prefer explicit target mode.
- Runtime schema reset should not make existing local records unreadable.
- Source seed promotion should preserve explicit link target fields after they ship.

### Future Fit

- Project detail route generation can later make project blocks stronger internal targets.
- A filtered reference picker can later use a query such as routable blocks.
- Conditional authority validation can later hard-reject invalid internal/external link records.
- More external schemes can be added later through an allowlist decision.
- Query strings, fragments, and anchor targets can be added later as separate flat fields.

## Implementation Decisions

| ID      | Decision                                                            | Reason                                                                                     | Evidence                                                                 |
| ------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| SLT-D1  | Do not model internal link targets as child placements.             | Placements compose blocks into a tree; link targets are navigation metadata.               | `blockPlacement.parent`, `blockPlacement.block`                          |
| SLT-D2  | Keep link target data flat on `block`.                              | Flat records are a core Formless bet and Site already stores renderable content as blocks. | `doc/overview.md`, `schema/apps/site/schema.json`                        |
| SLT-D3  | Use a reference field for internal link targets.                    | A target page/post/project is a record identity, not a copied path string.                 | Existing reference field support                                         |
| SLT-D4  | Keep external destinations in `href`.                               | Existing external link behavior and seed social links already use `href`.                  | `schema/apps/site/seed-records.json`                                     |
| SLT-D5  | Keep page/post/project `href` as route ownership.                   | Route resolver already uses target block hrefs to find pages and posts.                    | `src/site/route-resolver.ts`                                             |
| SLT-D6  | Resolve internal targets in the public tree projection.             | The renderer should consume one projected `href` and stay layout-focused.                  | `src/site/tree.ts`, `src/app/site-renderer/renderer.tsx`                 |
| SLT-D7  | Keep public tree shape unchanged if possible.                       | The existing renderer and tests already consume `SiteBlockNode.href`.                      | `src/shared/protocol.ts`                                                 |
| SLT-D8  | Preserve legacy string-link behavior during migration.              | Existing local and seed data use plain `href` strings today.                               | Current Site seed data                                                   |
| SLT-D9  | Start with `http:` and `https:` as external URL schemes.            | Current external Site links are web links; broader URI schemes need explicit product work. | Current social seed links                                                |
| SLT-D10 | Add target warnings to Site tree metadata.                          | Missing children and cycles already report through tree warnings.                          | `src/site/tree.ts`, `SiteTreeWarning`                                    |
| SLT-D11 | Coordinate schema-file edits with PRD 31 and PRD 32.                | Media upload and posts/projects authoring also touch Site schema and seed files.           | `prd/31-site-media-upload.md`, `prd/32-site-posts-projects-authoring.md` |
| SLT-D12 | Treat hard conditional authority validation as later unless needed. | Generic conditional validation is broader than Site link target resolution.                | Current field validation validates scalar/reference shape                |
| SLT-D13 | Use `linkTargetMode` and `linkTargetBlock` for explicit link data.  | The fields are flat on `block` and keep external destinations in existing `href`.          | `src/site/link-targets.ts`, `src/site/link-targets.test.ts`              |
| SLT-D14 | Keep migrated internal seed link `href` values for now.             | Target projection is not wired until SLT-04, so legacy `href` values preserve rendering.   | `schema/apps/site/seed-records.json`, `src/site/tree.test.ts`            |
| SLT-D15 | Use view-level `visibleWhen` for link target authoring fields.      | Target-specific fields are view composition, not stored shape.                             | `schema/apps/site/schema.json`, `src/shared/schema-views.ts`             |

### Deep Modules

- **Site link target resolver:** takes a block record, Site block index, and link-mode-independent rules; returns a projected href or warning facts. It owns internal target lookup, external URL validation, legacy fallback, and deterministic warning codes.
- **Public tree link projection adapter:** calls the resolver while projecting `SiteBlockNode.href`, without leaking storage-only target fields into the public renderer.
- **Link authoring schema slice:** declares the fields, variants, editor presentation, seed migration, and create/edit behavior for explicit internal and external links.
- **Optional reference option filter:** if needed, narrows internal link target choices to routable blocks while keeping the generic reference editor reusable.

## Testing Decisions

- Site tree tests should cover internal links resolving through target page hrefs.
- Site tree tests should cover internal links resolving through target post hrefs.
- Site tree tests should prove internal links follow target href changes.
- Site tree tests should cover missing target block warnings.
- Site tree tests should cover target blocks with missing href warnings.
- Site tree tests should cover external absolute URL pass-through.
- Site tree tests should cover invalid external URL warnings.
- Site tree tests should cover legacy `link.href` behavior.
- Public link helper tests should keep preview and published rewriting coverage.
- Public renderer tests should assert header/footer internal links still render preview `/pages/*` hrefs in preview mode.
- Public renderer tests should assert published mode still emits top-level paths for internal links.
- Public renderer tests should assert external links keep `target` and `rel`.
- Schema tests should assert Site source schema exposes explicit internal and external link authoring fields.
- Schema tests should assert seed links use explicit target fields where practical.
- Generated UI tests should assert internal link fields show target selection and external link fields show href editing if the implementation changes generated behavior.
- Browser smoke should cover `/site` link editing and `/pages/home` navigation rendering if app behavior changes.
- Use `devstate check` as final check evidence.
- Do not run raw `bun test`, `bun check`, `vp test`, or `vp check` manually during normal agent work.

## Chunks

| ID     | Status  | Depends on | Main files                      | Acceptance                                                                                                       |
| ------ | ------- | ---------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| SLT-01 | shipped | none       | PRD                             | PRD defines internal/external link target model, resolution rules, compatibility, tests, and coordination notes. |
| SLT-02 | shipped | SLT-01     | tests, tree/link resolver       | Current string-link behavior is characterized and new target resolver tests are added before implementation.     |
| SLT-03 | shipped | SLT-02     | Site schema, seed, schema tests | Site source schema and seeds distinguish internal and external links while preserving legacy rendering.          |
| SLT-04 | shipped | SLT-03     | tree projection, renderer tests | Public tree resolves internal target blocks and validates external URLs with warnings and unchanged tree shape.  |
| SLT-05 | shipped | SLT-04     | generated UI, app tests         | Site authoring exposes clear internal target and external URL editing paths for link blocks.                     |
| SLT-06 | ready   | SLT-05     | browser smoke, PRD              | `/site` and `/pages/home` smoke pass; PRD evidence, blockers, and promotion notes update.                        |

## Parallel Shipping

Can ship in parallel with:

- docs steward work that does not edit this PRD;
- public renderer polish that avoids link target semantics;
- worker media upload route work from PRD 31 before it edits Site schema fields.

Should coordinate with:

- PRD 31 Site media upload, because both may edit `block.href` presentation and Site source schema;
- PRD 32 Site posts and projects authoring, because internal link targets should include post and project records where routable;
- PRD 30 SVG icon support, because link icons should keep working while link target fields change.

Should not ship in parallel with:

- broad Site source schema rewrites;
- public route resolver rewrites;
- generated reference editor rewrites unless the write scope is explicitly split;
- seed promotion runs that overwrite link target fields.

## Dependencies

- Current Site app uses flat `block` and `blockPlacement` records.
- Current route resolver uses page and post block `href` values.
- Current public renderer applies preview/published rewriting from rendered href strings.
- Current generated field editors can edit reference fields, but reference option filtering may need extra work.
- PRD 32 may add stronger post/project authoring surfaces that become useful internal link targets.

## Blockers

- None known.

## Out of Scope

- Do not add a general route registry.
- Do not add nested link target objects.
- Do not store internal link targets as child placements.
- Do not add a visual navigation builder.
- Do not add breadcrumbs.
- Do not add menus beyond existing header/footer link blocks.
- Do not add project detail route generation.
- Do not add sitemap, RSS, analytics, or redirects.
- Do not add generic conditional authority validation unless a later chunk explicitly expands scope.
- Do not add `mailto:` or `tel:` external schemes in the first slice unless required by seed data.
- Do not change public Site route paths.
- Do not edit `doc/current.md` or `doc/roadmap.md` during normal PRD agent work.

## Status Notes

- 2026-05-13: PRD created from design discussion about distinguishing internal and external Site links. Product direction: internal links should reference target page/post/project blocks; external links should use absolute URLs; internal targets should not be modeled as child placements.
- 2026-05-13: SLT-01 shipped. PRD locks the flat link target model, internal/external resolution rules, compatibility requirements, test plan, and coordination notes. No app behavior changed. Next ready chunk is SLT-02.
- 2026-05-13: SLT-02 shipped. Added `src/site/link-targets.ts` and focused tests for legacy string href fallback, internal page/post/project target resolution, target href changes, broken target warnings, and explicit external URL validation. Added `src/site/tree.test.ts` coverage proving current public tree legacy link href passthrough stays unchanged. Resolver is not wired into Site schema or tree projection yet. No app behavior changed. Next ready chunk is SLT-03.
- 2026-05-13: SLT-03 shipped. Site source schema now adds flat `block.linkTargetMode` and `block.linkTargetBlock` fields and exposes them in link create/edit/item presentations. Source seed internal nav links now set `linkTargetMode = internal` and `linkTargetBlock` while retaining legacy `href` values; social links set `linkTargetMode = external`. Resolver is still not wired into tree projection. Next ready chunk is SLT-04.
- 2026-05-13: SLT-04 shipped. Public tree projection now resolves `type = link` hrefs through `resolveSiteLinkHref`, so explicit internal links project the target block route href, explicit external links must be valid absolute `http`/`https` URLs, broken explicit links emit Site tree warnings with no rendered href, and legacy link hrefs still pass through. Renderer tests cover preview/published output from projected internal hrefs and omitted anchors for invalid external links. Next ready chunk is SLT-05.
- 2026-05-13: SLT-05 shipped. Generated view fields now support `visibleWhen` conditions. Site link create, edit, root-detail, and tree-node presentations show `linkTargetBlock` only for internal links and `href` only for external or legacy blank-mode links. Create value resolution ignores hidden link target fields. Next ready chunk is SLT-06.

## Evidence

- `devstate start`: checks ok; watch tests pass; services running at `https://33-site-link-targets.formless.local`.
- 2026-05-13 loop status read: `./tmp/devstate.json`, `./tmp/test.txt`, and `./tmp/check.txt` were absent; current generated evidence is in `.devstate/status.md`.
- 2026-05-13 final `devstate check`: checks ok; watch tests pass; services running at `https://33-site-link-targets.formless.local`.
- SLT-01 acceptance: PRD defines internal links as flat `block` reference fields, external links as absolute `href` values, legacy string-link fallback, Site tree warning behavior, renderer compatibility, generated authoring expectations, test coverage, and PRD 31/32/30 coordination notes.
- SLT-01 browser smoke skipped: no app behavior changed.
- Source schema inspection: Site `block` currently has one `href` text field with `format = href`.
- Source schema inspection: Site links currently use `block.type = link`, `label`, `href`, and optional `icon`.
- Code inspection: public route resolver resolves page and post routes from target block `href` values.
- Code inspection: public tree projection currently projects `href` directly from each block record.
- Code inspection: public renderer currently rewrites non-external href strings for preview and published modes.
- Code inspection: generated reference editors can select records by entity and display field; filtered reference options are not currently field-level metadata.
- SLT-02 field-name decision: explicit link records use `linkTargetMode` with `internal` or `external`; internal links use `linkTargetBlock`; external links keep using `href`.
- SLT-02 resolver warnings: `missing-link-target`, `non-routable-link-target`, and `invalid-external-link`.
- SLT-02 test coverage: `src/site/link-targets.test.ts` covers legacy href fallback, internal page/post/project targets, target href changes, missing target warnings, non-routable target warnings, and external URL validation.
- SLT-02 tree characterization: `src/site/tree.test.ts` proves legacy relative and external link href strings are projected unchanged with no warnings.
- 2026-05-13 SLT-02 `./tmp/devstate.json`, `./tmp/test.txt`, and `./tmp/check.txt` read attempt: files absent; current generated evidence is in `.devstate/status.md`.
- 2026-05-13 SLT-02 `devstate start`: checks ok; watch tests pass; services running at `https://33-site-link-targets.formless.local`.
- 2026-05-13 SLT-02 final `devstate check`: checks ok; watch tests pass; services running at `https://33-site-link-targets.formless.local`.
- SLT-02 browser smoke skipped: no app behavior changed.
- SLT-03 schema fields: `schema/apps/site/schema.json` defines `block.linkTargetMode` as optional enum values `internal` and `external`, and `block.linkTargetBlock` as an optional reference to `block`.
- SLT-03 schema presentations: Site link variants expose `linkTargetMode`, `linkTargetBlock`, `href`, and `icon` in create, edit, root-detail, and tree-node presentations.
- SLT-03 seed migration: `schema/apps/site/seed-records.json` marks seeded Home, Blog, Projects, Resume, extra Home, and extra Blog links as internal references while keeping their legacy `href` values.
- SLT-03 seed migration: seeded GitHub, LinkedIn, Bluesky, and X links use `linkTargetMode = external` and keep absolute `href` values.
- SLT-03 test updates: `src/shared/schema.test.ts` covers link target field schema, link authoring presentations, and explicit source seed target modes; `src/app.test.tsx` and `src/client/views.test.ts` cover the updated generated create model.
- 2026-05-13 SLT-03 initial browser smoke found this shell exported `VITE_FORMLESS_RUNTIME_PROFILE=publishedSite`, so `/site` served published-site output; devstate was restarted with `VITE_FORMLESS_RUNTIME_PROFILE` unset before final smoke.
- 2026-05-13 SLT-03 `./tmp/devstate.json`, `./tmp/test.txt`, and `./tmp/check.txt` read attempt: `./tmp` files absent; current generated evidence is in `.devstate/status.md`.
- 2026-05-13 SLT-03 final `env -u VITE_FORMLESS_RUNTIME_PROFILE devstate check`: checks ok; watch tests pass; services running at `https://33-site-link-targets.formless.local`.
- 2026-05-13 SLT-03 browser smoke: reset Site source schema and seed returned 200; `/site` rendered the generated Site editor with Pages, Posts, Projects, Navigation, and synced status; `/pages/home` rendered public Home with header links, body content, and footer; `bun browser --session slt-03 errors` returned no page errors.
- SLT-04 tree projection: `src/site/tree.ts` calls `resolveSiteLinkHref` while projecting `type = link` blocks; non-link `href` projection stays unchanged and public output still uses `SiteBlockNode.href`.
- SLT-04 tree tests: `src/site/tree.test.ts` covers explicit internal links overriding stale stored link hrefs and following target page/post hrefs, missing internal targets warning with no projected href, invalid explicit external URLs warning with no projected href, valid external URL pass-through, and absence of storage-only link target fields in the public node.
- SLT-04 renderer tests: `src/app.test.tsx` covers explicit internal link targets rendering as `/pages/*` in preview mode and top-level paths in published mode, plus invalid explicit external links rendering no anchor.
- 2026-05-13 SLT-04 `./tmp/devstate.json`, `./tmp/test.txt`, and `./tmp/check.txt` read attempt: `./tmp` files absent; current generated evidence is in `.devstate/status.md`.
- 2026-05-13 SLT-04 `devstate check`: checks ok; watch tests pass; services running at `https://33-site-link-targets.formless.local`.
- 2026-05-13 SLT-04 browser smoke: `bun browser --session slt-04` reset Site source schema and seed with 200 responses; `/pages/home` rendered public Home; `/api/site/tree/home` returned no warnings and header link hrefs `/`, `/blog`, `/projects`, and `/resume`; browser link inspection showed preview `/pages/*` internal hrefs and external social links with `target="_blank"` and `rel="noreferrer"`; `bun browser --session slt-04 errors` returned no page errors.
- SLT-05 schema/UI fields: `schema/apps/site/schema.json` keeps `linkTargetMode` optional and default-free; `linkTargetBlock` has `visibleWhen` values `["internal"]`; `href` has `visibleWhen` values `["", "external"]` in Site link create, edit, root-detail, and tree-node presentations.
- SLT-05 generated UI plumbing: `src/shared/schema-views.ts` parses view-field `visibleWhen`; `src/client/union-presentation-model.ts` carries it into view models; `src/app/generated/union-presentation.ts` filters record edit fields; `src/shared/create-defaults.ts` and `src/app/generated/create.tsx` filter rendered and submitted create fields; `src/app/generated/tree.tsx` preserves visibility when deriving tree child create fields.
- SLT-05 app tests: `src/app.test.tsx` covers internal tree link records showing `Target block` instead of stale `href`, external tree link records showing URL editing, and create value resolution omitting hidden internal/external target fields.
- 2026-05-13 SLT-05 `./tmp/devstate.json`, `./tmp/test.txt`, and `./tmp/check.txt` read attempt: files absent; current generated evidence is in `.devstate/status.md`.
- 2026-05-13 SLT-05 `devstate check`: checks ok; watch tests pass; services running at `https://33-site-link-targets.formless.local`.
- 2026-05-13 SLT-05 browser smoke: `bun browser --session slt-05` reset Site seed with a 200 response; `/site` Header authoring showed internal link `Link target` and `Target block` controls with no URL field for header nav links; `/pages/home` rendered public Home; browser link inspection showed preview `/pages/*` internal hrefs and external social links with `target="_blank"` and `rel="noreferrer"`; `bun browser --session slt-05 errors` returned no page errors.

## Promote after ship

- `doc/current.md`: add that Site link blocks distinguish internal and external targets.
- `doc/current.md`: add that internal Site links resolve through target block references.
- `doc/current.md`: add that external Site links require absolute URLs.
- `doc/current.md`: add that public tree projection resolves link targets into renderer-facing hrefs.
- `doc/current.md`: add any new Site tree warning codes for broken link targets.
- `doc/current.md`: add that explicit Site link fields are `linkTargetMode` and `linkTargetBlock`.
- `doc/current.md`: add that migrated source seed internal links keep legacy `href` values for compatibility while public tree projection prefers explicit target fields.
- `doc/current.md`: add that generated view fields can declare `visibleWhen` conditions.
- `doc/current.md`: add that Site link authoring shows target-specific fields from `linkTargetMode`.
- `doc/roadmap.md`: add internal/external Site link targets to first-release Site scope if this becomes release scope.
