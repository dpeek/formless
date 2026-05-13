# PRD 32: Site posts and projects authoring

Status: ready
Current chunk: PPA-02 ready
Last updated: 2026-05-13

## Goal

Make Posts and Projects first-class authoring areas inside the Site editor.

The first slice should:

- keep Site records flat as `block` and `blockPlacement`;
- expose Posts and Projects in the primary `/site` authoring sidebar;
- let authors create post and project root blocks without using the raw Blocks table;
- keep `/blog` as a generated post index;
- keep `/blog/:slug` as generated post detail routes from post `href` values;
- let post detail content be authored with child markdown placements;
- let project blocks use `label`, `href`, and markdown `body`;
- let authors add project blocks and placements to the existing `/projects` page;
- keep project page ordering manual through placements.

This PRD owns Site admin authoring for posts and projects.
It does not own project detail route generation, rich publishing states, tags, search, RSS, or a general CMS taxonomy.

## Problem Statement

The Site data model already has post and project blocks, but the authoring UI does not make them obvious.

Current behavior:

- `blockPosts` and `blockProjects` queries exist in the Site source schema.
- The primary Site editor sidebar exposes Pages and Navigation, not Posts or Projects.
- Creating a post or project requires falling back to lower-level block authoring paths.
- The Blog page is already a generated post index in public rendering, but the admin UI does not explain that posts are authored separately from the Blog page.
- Post detail routes already resolve from `block.type = post` and `href = /blog/...`, but authors do not get a focused post writing surface.
- Project blocks already render as content summaries when placed in a public tree.
- The Projects page exists at `/projects`, but the primary tree child policy does not clearly support adding project blocks as curated child content.
- Authors need to add project entries with `label`, `href`, and `body` without understanding raw placements.

The author should see Posts and Projects as content collections, not as implementation detail inside the generic block database.

## Solution

Use the existing generated authoring primitives and Site block model.

Add Posts and Projects to the primary Site editor record navigation.
Each section selects root `block` records filtered by the existing post/project queries.
Each section gets a fixed-type create action:

- create Post submits `block.type = post`;
- create Project submits `block.type = project`;
- the type field stays hidden after creation;
- create/edit fields focus on `label`, `href`, and `body`.

Posts:

- A post block is the routable content record.
- `label` is the title.
- `href` is the public route, normally `/blog/<slug>`.
- `body` is the excerpt or card summary.
- Full long-form post content is authored as child markdown placements under the post.
- `/blog` lists post blocks automatically.
- `/blog/<slug>` resolves the matching post block and renders its child placements.
- The Blog page record remains index-shell metadata, not the place where individual posts are written.

Projects:

- A project block is a reusable project summary.
- `label` is the project name.
- `href` is the project target link.
- `body` is markdown-capable project summary copy.
- The `/projects` page is a manually curated page.
- Authors can add project child blocks under the `/projects` page through the generated tree add flow.
- Adding a project through the tree creates both the project block and its placement.
- Existing public rendering can render placed project blocks as content summaries.

The user said `/project page`; the current source route is `/projects`, so this PRD targets `/projects` unless the route is renamed in a separate product decision.

## Source Map

Existing anchors:

- Current runtime docs: `doc/current.md`.
- Release target docs: `doc/roadmap.md`.
- Site source schema: `schema/apps/site/schema.json`.
- Site source seed records: `schema/apps/site/seed-records.json`.
- Generated authoring primitives PRD: `prd/27-generated-authoring-primitives.md`.
- Site authoring simplification PRD: `prd/23-site-authoring-simplification.md`.
- Site tree projection: `src/site/tree.ts`.
- Site route resolver: `src/site/route-resolver.ts`.
- Public Site renderer: `src/app/site-renderer/renderer.tsx`.
- Generated collection renderer: `src/app/generated/collection.tsx`.
- Generated tree renderer: `src/app/generated/tree.tsx`.
- Generated create renderer: `src/app/generated/create.tsx`.
- Create defaults primitive: `src/shared/create-defaults.ts`.
- Generated authoring primitive: `src/client/generated-authoring.ts`.
- Schema/view parser: `src/shared/schema-views.ts`.
- View model selection: `src/client/views.ts`.

Owned files:

- `prd/32-site-posts-projects-authoring.md`.

Likely changed files:

- `schema/apps/site/schema.json`.
- `schema/apps/site/seed-records.json`.
- `src/shared/schema.test.ts`.
- `src/client/views.test.ts`.
- `src/app.test.tsx`.
- `src/site/tree.test.ts`.
- `src/app/site-renderer/renderer.tsx`.

## User Stories

1. As a Site author, I want a Posts section in `/site`, so that writing is separate from page layout.
2. As a Site author, I want to create a post from the Posts section, so that I do not use the raw Blocks table.
3. As a Site author, I want post creation to set the block type automatically, so that I do not choose implementation values.
4. As a Site author, I want a post title field, so that I can name the public post.
5. As a Site author, I want a post route field, so that I can choose `/blog/<slug>`.
6. As a Site author, I want a post summary field, so that `/blog` and cards can show excerpt text.
7. As a Site author, I want to add markdown blocks under a post, so that long-form writing is composed from content blocks.
8. As a Site author, I want the Blog page to stay an index shell, so that I do not manually place each post under it.
9. As a Site visitor, I want `/blog` to list authored posts, so that posts are browsable.
10. As a Site visitor, I want `/blog/<slug>` to render the post detail page, so that direct post links work.
11. As a Site author, I want a Projects section in `/site`, so that project entries are easy to maintain.
12. As a Site author, I want to create a project from the Projects section, so that project records are not hidden in raw blocks.
13. As a Site author, I want project creation to set the block type automatically, so that every created item is a Project.
14. As a Site author, I want project fields to be `label`, `href`, and `body`, so that project entries stay simple.
15. As a Site author, I want project body editing to use markdown, so that project summaries can contain links and emphasis.
16. As a Site author, I want to select the Projects page and add project blocks to it, so that `/projects` is manually curated.
17. As a Site author, I want adding a project to `/projects` to create the project block and placement together, so that I do not create orphan records.
18. As a Site author, I want to place an existing project on `/projects`, so that reusable project records can appear in multiple curated sections.
19. As a Site author, I want to order projects on `/projects`, so that the public page reflects my chosen sequence.
20. As a Site visitor, I want `/projects` to render placed project summaries, so that project entries are visible from the public page.
21. As a runtime developer, I want this behavior expressed in schema data where possible, so that generated authoring remains generic.
22. As a runtime developer, I want posts and projects to stay flat `block` records, so that the public tree projection does not gain nested storage.
23. As a runtime developer, I want Blog route resolution to stay in the Site route resolver, so that renderer components do not own routing rules.
24. As a runtime developer, I want project page curation to use placements, so that order and reuse stay explicit.
25. As a runtime developer, I want focused tests around root navigation, create defaults, tree child policy, and public rendering, so that the admin behavior is AFK-ready.

## Requirements

### Site Editor Navigation

- The primary Site editor keeps one `/site` workspace.
- The Site editor sidebar includes Pages.
- The Site editor sidebar includes Posts.
- The Site editor sidebar includes Projects.
- The Site editor sidebar includes Navigation.
- Posts use the existing `blockPosts` query.
- Projects use the existing `blockProjects` query.
- Pages keep using page block records.
- Navigation keeps using header and footer root records.
- Raw Blocks and Placements remain non-primary debug/admin views.
- Existing generated app routes stay unchanged.

### Root Create Actions

- Posts can be created from the Posts section.
- Projects can be created from the Projects section.
- Post create uses a fixed literal default for `block.type = post`.
- Project create uses a fixed literal default for `block.type = project`.
- Fixed type defaults stay hidden from the form.
- Created root records are selected after successful create.
- Create forms must not require context defaults.
- The implementation should reuse existing `context.createView` and create-default primitives if possible.
- No authority storage shape change is required.

### Post Authoring

- Post root records use `block.type = post`.
- Post authoring exposes `label`, `href`, and `body`.
- Post `label` is the title.
- Post `href` is the route, normally `/blog/<slug>`.
- Post `body` is the excerpt or summary.
- Post long-form content can be composed from child markdown placements.
- Post child policy allows at least markdown children.
- Post child policy may allow image and group children if existing tree policy supports them cleanly.
- Post child creation must create both the child block and placement in one action.
- Blog index authoring does not require manual placement of post records under the Blog page.

### Blog Routes

- `/blog` stays a generated post index.
- `/blog` uses live post blocks with `/blog/...` hrefs.
- `/blog` orders posts deterministically.
- `/blog` omits tombstoned post records.
- `/blog/<slug>` resolves the matching post block by href.
- Duplicate post routes keep deterministic first-match and warning behavior.
- Public post detail pages keep the Site frame.
- Public post detail pages render child placements when present.
- Public post detail pages may fall back to root body text when no child placements exist.
- This PRD does not add tags, dates, RSS, or full publish state.

### Project Authoring

- Project root records use `block.type = project`.
- Project authoring exposes `label`, `href`, and `body`.
- Project `label` is the project name.
- Project `href` is the project target.
- Project `body` is markdown-capable summary copy.
- Project summary rendering should parse markdown body content through the shared read-only markdown renderer.
- Projects can be created independently of page placement.
- Project blocks can be reused in more than one placement.
- Project deletion behavior stays whatever generic soft-delete behavior currently provides.

### Projects Page Composition

- The existing public Projects page route is `/projects`.
- The `/projects` page remains a page block.
- The `/projects` page body content comes from child placements.
- Authors can add project blocks under the `/projects` page.
- Adding a new project from the `/projects` page tree creates both the project block and placement.
- Adding an existing project placement to `/projects` remains possible through the placement table/create flow if supported by current generated UI.
- Project placements on `/projects` use `blockPlacement.order` for manual ordering.
- The public `/projects` page renders placed project blocks as project summaries.
- The public `/projects` page renders project body markdown as formatted content, not literal markdown syntax.
- Project page rendering should not require a generated project-index route resolver in this PRD.

### Tree Child Policy

- Site tree child policy allows post roots to contain markdown content.
- Site tree child policy allows page or group contexts used by project pages to contain project blocks.
- If the policy is variant-only, allowing `project` under generic `page` and `group` parents is acceptable for the first slice.
- Leaf blocks such as links and images should not gain children unless already allowed.
- Tree add controls should show the Project option where authors can add project content to `/projects`.
- Tree add controls should show the Markdown option where authors can add long-form content under posts.
- Tree remove continues to remove only the placement edge.
- Existing tree drag/reorder behavior keeps working for post and project placements.

### Public Rendering

- Existing public Site preview route `/pages/*` keeps working.
- Published Site profile routes keep using top-level paths.
- Project summaries render from placed project blocks.
- Project summary body markdown renders through the shared read-only markdown renderer.
- Post summaries render from generated Blog index records.
- Public links keep preview/published href rewriting.
- Project `href` values may be internal or external.
- No project detail route is generated in this PRD.
- No new public renderer branch is required if existing `ContentSummary` covers project blocks.

## Implementation Decisions

| ID      | Decision                                                             | Reason                                                                                      | Evidence                                                                                  |
| ------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| PPA-D1  | Keep posts and projects as `block` records.                          | The Site app's content model is already flat and block-based.                               | `doc/overview.md`, `schema/apps/site/schema.json`                                         |
| PPA-D2  | Expose Posts and Projects in the primary Site editor sidebar.        | Authors should not use raw block views for normal content writing.                          | User direction 2026-05-13, current `siteCompositionHome` navigation groups                |
| PPA-D3  | Use fixed-type create views for Posts and Projects.                  | `block.type` is storage metadata; authors need focused create forms.                        | PRD 27 create-default primitive, current fixed-discriminator create behavior              |
| PPA-D4  | Treat post root `body` as summary copy.                              | Blog lists and cards need short text, while long-form detail content belongs in blocks.     | Current renderer `ContentSummary`, current post detail placement behavior                 |
| PPA-D5  | Keep `/blog` generated from post records.                            | Blog should not depend on manual placement under the Blog page.                             | `src/site/route-resolver.ts`, `src/site/tree.ts`                                          |
| PPA-D6  | Keep `/projects` manually curated through placements.                | Project order and selection are editorial choices, and project detail routes are later.     | User direction 2026-05-13, existing `blockPlacement.order` model                          |
| PPA-D7  | Allow project blocks as tree children where needed for `/projects`.  | The author needs one flow that creates the project block and placement.                     | Existing `create-tree-child` action and generated tree add flow                           |
| PPA-D8  | Do not add project route generation yet.                             | The immediate need is curated project blocks on `/projects`, not `/projects/:slug`.         | Current `src/site/route-resolver.ts` only has page, post-index, and post detail routes    |
| PPA-D9  | Reuse existing public content summary rendering.                     | The renderer already treats `post`, `project`, and `profile` blocks as summaries.           | `src/app/site-renderer/renderer.tsx`                                                      |
| PPA-D10 | Render project summary body as markdown.                             | The authoring model says project body is markdown, so public output should not leak syntax. | Shared markdown renderer already serves public markdown blocks                            |
| PPA-D11 | Prefer schema-only implementation except markdown summary rendering. | Context create actions, literal defaults, and tree add already exist as primitives.         | `src/client/generated-authoring.ts`, `src/shared/create-defaults.ts`, generated tree code |

### Deep Modules

- **Site source authoring schema:** declares the post/project context groups, fixed create views, root detail fields, and tree child policy. It should carry most of this feature.
- **Generated authoring primitives:** existing create-default and context selection modules should handle fixed-type root creation and selecting the created record.
- **Site route resolver:** remains the owner of Blog index and post detail route resolution. This PRD should not move route rules into renderer components.
- **Public tree projection:** remains the public data boundary from flat records to nested page/post/project output.

## Testing Decisions

- Schema tests should assert Site source includes Posts and Projects navigation groups.
- Schema tests should assert post/project context create views use fixed literal `block.type` defaults.
- Schema tests should assert post/project create forms expose `label`, `href`, and `body`, not mutable `type`.
- View-model tests should assert the generated Site editor exposes Posts and Projects in root navigation facts.
- View-model tests should assert created post/project context records are selectable through existing context-create facts.
- Tree policy tests should assert posts can add markdown children.
- Tree policy tests should assert project blocks can be added where the Projects page composition needs them.
- App tests should assert `/site` renders Posts and Projects navigation entries.
- App tests should assert the post/project create dialogs render focused fields.
- Site tree tests should assert `/blog` still resolves generated post index records.
- Site tree tests should assert `/blog/<slug>` still resolves post detail records and child placements.
- Site tree tests should assert `/projects` can project placed project blocks.
- Public renderer tests should assert `/projects` renders project labels, hrefs, and formatted markdown summary body from placed project blocks.
- Browser smoke should cover `/site`, creating or opening the post/project authoring affordance, `/pages/blog`, and `/pages/projects` if app behavior changes.
- Use `devstate check` as final check evidence.
- Do not run raw `bun test`, `bun check`, `vp test`, or `vp check` manually during normal agent work.

## Chunks

| ID     | Status  | Depends on | Main files                              | Acceptance                                                                                                                |
| ------ | ------- | ---------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| PPA-01 | shipped | none       | tests, PRD                              | Current Site editor gaps for hidden Posts/Projects and missing project tree add policy are characterized.                 |
| PPA-02 | ready   | PPA-01     | Site source schema, schema/view tests   | `/site` exposes Posts and Projects groups with fixed-type root create actions and focused root edit fields.               |
| PPA-03 | ready   | PPA-02     | Site source schema, tree/view tests     | Post roots can add markdown body blocks; Projects page contexts can add project blocks and placements.                    |
| PPA-04 | ready   | PPA-03     | Site seeds, renderer, tree/public tests | Source seed proves `/projects` can render placed project summaries with label, href, and formatted markdown body content. |
| PPA-05 | ready   | PPA-04     | browser smoke, PRD                      | `/site`, `/pages/blog`, and `/pages/projects` smoke pass; PRD evidence, blockers, and promotion notes update.             |

## Out of Scope

- Do not add project detail route generation.
- Do not add `/projects/:slug` resolver behavior.
- Do not add post tags.
- Do not add post dates unless a separate PRD scopes chronology/publish metadata.
- Do not add RSS, sitemap, comments, analytics, or search.
- Do not add rich text beyond existing markdown blocks.
- Do not add media upload.
- Do not add a separate `post` or `project` entity.
- Do not add a general CMS taxonomy.
- Do not change the authority storage model.
- Do not edit `doc/current.md` or `doc/roadmap.md` during normal PRD agent work.

## Dependencies

- PRD 23 shipped fixed block-type authoring, tree composition actions, and Site route simplification.
- PRD 27 shipped create-default and generated authoring primitives.
- Current Site schema already has `blockPosts` and `blockProjects` queries.
- Current public route resolver already supports `/blog` and `/blog/:slug`.
- Current public renderer already renders `project` blocks through content summary rendering.

## Blockers

- None known.

## Status Notes

- 2026-05-13: PRD created from authoring discussion. Product direction: Posts should be authored separately from the Blog page, `/blog` should list them automatically, `/blog/:slug` should resolve from post hrefs, and Projects should be addable as `label`/`href`/markdown `body` blocks placed on the existing `/projects` page.
- 2026-05-13: PPA-01 shipped as characterization only. No app behavior changed.
- 2026-05-13: PPA-01 added tests proving `blockPosts` and `blockProjects` queries exist while generated Site root navigation exposes only Pages and Navigation.
- 2026-05-13: PPA-01 added tests proving current Site tree add policy allows page/group children `group`, `hero`, `markdown`, `image`, and `link`, but not `project`, and has no `post` branch policy yet.
- 2026-05-13: No implementation decisions or blockers changed in PPA-01.

## Evidence

- `devstate start`: checks ok; services running at `https://formless.local`.
- Source schema inspection: `blockPosts` and `blockProjects` queries exist; current primary Site editor context navigation exposes Pages and Navigation only.
- Source schema inspection: existing tree branch policy omits `post` and `project` children from page/group parent variants.
- Code inspection: `src/site/route-resolver.ts` supports post index and post detail routes under `/blog`.
- Code inspection: `src/app/site-renderer/renderer.tsx` renders `post`, `project`, and `profile` blocks through `ContentSummary`.
- Code inspection: current `ContentSummary` uses plain text for body output; project markdown summary rendering remains part of this PRD.
- PPA-01 tests: `src/client/generated-authoring.test.ts` characterizes the generated root navigation gap for Posts and Projects.
- PPA-01 tests: `src/client/views.test.ts` characterizes current generated Site tree add policy facts for page/group/header/footer parents and the missing post/project affordances.
- PPA-01 tests: `src/shared/schema.test.ts` characterizes the source schema gap for Posts/Projects root navigation and project child policy.
- PPA-01 devstate: `.devstate/status.md` reports checks ok and services running; `.devstate/logs/service-test.txt` reports latest watcher rerun passed; `.devstate/logs/check-vite.txt` reports formatting, lint, and typecheck pass.
- PPA-01 devstate compatibility: `./tmp/devstate.json`, `./tmp/test.txt`, and `./tmp/check.txt` were absent; devstate evidence for this repo is under `.devstate/`.

## Promote after ship

- PPA-01 adds no global-doc promotion beyond existing planned bullets because it is characterization only.
- `doc/current.md`: add that the Site editor primary sidebar exposes Pages, Posts, Projects, and Navigation.
- `doc/current.md`: add that Posts are authored as `block.type = post` roots with `label`, `href`, summary `body`, and child markdown placements for long-form content.
- `doc/current.md`: add that `/blog` is generated from post blocks and `/blog/:slug` resolves post hrefs.
- `doc/current.md`: add that Projects are authored as `block.type = project` roots with `label`, `href`, and markdown-capable `body`.
- `doc/current.md`: add that `/projects` is manually curated with project block placements.
- `doc/roadmap.md`: update first-release Site editor surface from Pages/Header/Footer-era wording to Pages, Posts, Projects, and Navigation if this becomes release scope.
