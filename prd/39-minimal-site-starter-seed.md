# PRD 39: Minimal Site starter seed

Status: ready
Current chunk: MSS-05 ready
Last updated: 2026-05-15

Start after PRD 37 shipped behavior is stable on the active branch.

## Goal

Make `formless init` create a neutral starter Site instead of a personal-site example.

The first version should:

- keep the package-owned Site schema;
- replace the default Site seed records with minimal neutral content;
- keep Home, About, Blog, Projects, and Resume as the starter public pages;
- keep one starter blog post and one starter project;
- keep a minimal Home page with only a hero;
- keep header and footer composition data-driven;
- keep footer social links for GitHub, LinkedIn, and X;
- remove default media references from the starter records;
- make `formless init` write no starter media files by default;
- avoid project-owned `public/` or asset scaffolding in this slice.

This PRD owns the default package Site starter data used by source reset/bootstrap and `formless init`.
It does not own media upload, project static assets, public launch icons, route cleanup, renderer redesign, schema marketplace work, or richer named templates.

## Problem Statement

Formless can now run as a Site project through the CLI, but the package-owned default records still look like the author's personal website.

Current default behavior:

- `formless init` copies `schema/apps/site/seed-records.json` into a new project's `site.records.json`;
- the current Site source seed contains personal labels, real projects, real posts, and personal social links;
- the current Site source seed contains media records and same-origin media references;
- init therefore writes starter media files into new projects;
- new users start by deleting somebody else's content before creating their own;
- tests and examples risk treating personal seed content as product behavior.

The starter should teach the record shape without making the user inherit a finished personal website.

## Solution

Replace the package-owned Site source seed with a compact neutral starter.

The starter should model the core Site concepts only:

- pages;
- page composition through `blockPlacement`;
- public header navigation;
- public footer social links;
- one post;
- one project;
- post and project list blocks;
- a simple hero on Home.

The seed remains normal `StoredRecord` data. Records stay flat. Composition stays in `blockPlacement`. The Site schema stays package-owned. The CLI continues to use the existing project source adapter and media asset discovery.

No new asset contract is introduced. A starter with zero media references should naturally make `siteProjectMediaAssetsFromRecords` return an empty list, so `formless init` creates `formless.config.json` and `site.records.json` without writing starter media files.

Home keeps the existing route model. In the public route resolver, the `home` slug maps to the published `/` href. This PRD should not add a new `/home` published route unless a separate route-cleanup PRD already owns that behavior.

## Source Map

Existing anchors:

- Current runtime docs: `doc/current.md`.
- Release target docs: `doc/roadmap.md`.
- Single Site project CLI PRD: `prd/37-single-site-project-cli-loop.md`.
- Public Site cutover cleanup PRD: `prd/38-public-site-cutover-cleanup.md`.
- Site source schema: `schema/apps/site/schema.json`.
- Site source records: `schema/apps/site/seed-records.json`.
- Site source media sidecars: `schema/apps/site/media/`.
- Site project CLI: `src/site/cli.ts`.
- Site project source adapter: `src/site/project-source.ts`.
- Site project config: `src/site/project-config.ts`.
- Site source media adapter: `src/site/source-media.ts`.
- Site route resolver: `src/site/route-resolver.ts`.
- Site tree projection: `src/site/tree.ts`.
- Public Site renderer: `src/app/site-renderer/renderer.tsx`.
- Test Site records fixture: `src/test/site-records.ts`.
- CLI tests: `src/site/cli.test.ts`.
- Site tree tests: `src/site/tree.test.ts`.
- App render tests: `src/app.test.tsx`.
- Schema parser tests: `src/shared/schema.test.ts`.
- Worker schema source tests: `src/worker/schema-apps.test.ts`.

Owned files:

- `prd/39-minimal-site-starter-seed.md`.

Likely changed files:

- `schema/apps/site/seed-records.json`.
- `src/site/cli.test.ts`.
- Tests that assert exact default Site seed labels, counts, or media count.

Possible changed files:

- `src/test/site-records.ts` if current richer renderer coverage needs a test-only fixture update.
- `src/site/tree.test.ts` if tests accidentally depend on default source seed content.
- `src/app.test.tsx` if tests accidentally depend on default source seed content.
- `src/worker/schema-apps.test.ts` if source seed count or media assertions change.
- `prd/37-single-site-project-cli-loop.md` only for status notes or promote notes after implementation ships.

Do not edit:

- `doc/current.md` or `doc/roadmap.md` in a normal PRD agent pass.
- `schema/apps/site/schema.json` unless seed validation exposes an actual schema mismatch.
- `schema/apps/site/media/` for this slice unless implementation removes only now-unreferenced default starter coupling.

## User Stories

1. As a new Site owner, I want `formless init` to create neutral starter content, so that I do not start by deleting someone else's site.
2. As a new Site owner, I want a Home page, so that the first preview has an obvious landing page.
3. As a new Site owner, I want an About page, so that I have a place to describe myself or the project.
4. As a new Site owner, I want a Blog page, so that I can see how posts are listed.
5. As a new Site owner, I want a Projects page, so that I can see how projects are listed.
6. As a new Site owner, I want a Resume page, so that a personal-site use case is available without personal copy.
7. As a new Site owner, I want only minimal boilerplate text, so that replacing the starter is quick.
8. As a new Site owner, I want one starter post, so that the Blog page is not empty.
9. As a new Site owner, I want one starter project, so that the Projects page is not empty.
10. As a new Site owner, I want the Home page to contain only a hero block, so that the first page is easy to understand.
11. As a new Site owner, I want no starter media, so that I am not managing unused files on day one.
12. As a new Site owner, I want GitHub, LinkedIn, and X footer links, so that common personal-site social links are easy to edit.
13. As a new Site owner, I want placeholder social URLs, so that I can see where to put my own profiles.
14. As a new Site owner, I want header navigation to include the starter pages, so that public preview feels complete.
15. As a new Site owner, I want footer links to be data records, so that I can edit them in the generated admin.
16. As a Site author, I want the starter records to remain flat, so that they match the rest of the Site data model.
17. As a Site author, I want page composition to use placements, so that starter data demonstrates the real authoring model.
18. As a Site author, I want Blog and Projects to use list blocks, so that dynamic public list behavior remains visible.
19. As a runtime developer, I want source reset/bootstrap to still validate the seed, so that storage initialization remains reliable.
20. As a runtime developer, I want media discovery to return zero starter assets, so that no special-case CLI branch is needed.
21. As a runtime developer, I want tests to stop depending on exact starter content, so that seed copy can evolve.
22. As a runtime developer, I want richer renderer fixtures to stay test-only, so that product starter data stays small.
23. As a runtime developer, I want the starter to avoid project-specific names, so that published packages are neutral.
24. As a runtime developer, I want route behavior unchanged, so that seed cleanup does not become routing work.
25. As a runtime developer, I want no project `public/` scaffold in this slice, so that we do not imply an unsupported static asset contract.
26. As a maintainer, I want init output to make sense with zero media files, so that CLI messaging stays polished.
27. As a maintainer, I want package dry-run/init tests to prove no default media files are written, so that regressions are caught.
28. As a maintainer, I want the old personal-site content removed from the default seed, so that future users do not inherit private or branded assumptions.

## Requirements

### Starter Content

- Default Site source records include a Home page.
- Default Site source records include an About page.
- Default Site source records include a Blog page.
- Default Site source records include a Projects page.
- Default Site source records include a Resume page.
- Home uses the existing public home route model.
- Home published href remains `/` unless a separate route PRD changes home route semantics.
- About published href is `/about`.
- Blog published href is `/blog`.
- Projects published href is `/projects`.
- Resume published href is `/resume`.
- Home has one hero block.
- Home does not include starter recent-posts or featured-projects sections.
- Blog includes one post list block.
- Projects includes one project list block.
- Starter data includes exactly one published post.
- Starter data includes exactly one published project.
- Starter post href is under `/blog/`.
- Starter project may omit `href` until project detail routes exist.
- Starter project must not point at a real personal/project URL.
- Starter project must not point at an internal route that the current public route resolver cannot render.
- Starter copy is short, neutral, and replaceable.
- Starter copy does not include the author's name.
- Starter copy does not include the author's projects.
- Starter copy does not include real personal profile URLs.

### Header And Footer

- Header remains a `header` block composed through placements.
- Header navigation includes Home, About, Blog, Projects, and Resume.
- Footer remains a `footer` block composed through placements.
- Footer includes GitHub, LinkedIn, and X social links.
- Footer social links use normal link records.
- Footer social URLs are placeholders that are safe for users to edit.
- Footer social presentation keeps using existing renderer behavior.
- The starter does not require new icon fields or renderer code.

### No Default Media

- Default Site source records contain no `image` block records.
- Default Site source records contain no same-origin `/api/site/media/*` hrefs.
- Default Site source records contain no data URL media.
- `siteProjectMediaAssetsFromRecords` returns an empty list for the default starter.
- `formless init` writes zero starter media files by default.
- `formless init` does not scaffold a project `public/` directory in this slice.
- This PRD does not require deleting package-owned media sidecar files if they are no longer referenced.

### Data Model

- Records stay in the existing `StoredRecord` shape.
- Entities stay `block` and `blockPlacement`.
- Records do not store change rows.
- Records do not store read-model output.
- Records do not store action replay rows.
- Records do not include tombstones.
- Record IDs are deterministic and readable enough for seed maintenance.
- `createdAt` values are deterministic.
- Placements use numeric `order` values that leave room for inserted content.
- The seed validates against the package-owned Site schema.

### CLI Behavior

- `formless init <dir>` still writes `formless.config.json`.
- `formless init <dir>` still writes `site.records.json`.
- `formless init <dir>` succeeds with the no-media starter.
- Init result `mediaCount` is `0`.
- CLI output is acceptable when media count is `0`.
- `formless dev` can restore the starter records into local authority state.
- `formless save --check` can compare the starter project without stale media noise.
- `formless publish --dry-run` can validate the starter project without missing media files.

## Implementation Decisions

| ID      | Decision                                                              | Reason                                                                          | Evidence                                     |
| ------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------- |
| MSS-D1  | Make the package-owned Site seed neutral and minimal.                 | `formless init` copies this data into new user projects.                        | `src/site/cli.ts`, PRD 37                    |
| MSS-D2  | Keep the package-owned Site schema unchanged.                         | The request changes starter data, not the content model.                        | `schema/apps/site/schema.json`               |
| MSS-D3  | Keep Home on the existing normalized `home` route with href `/`.      | The route resolver maps slug `home` to published `/`, not `/home`.              | `src/site/route-resolver.ts`                 |
| MSS-D4  | Keep one post and one project in the default starter.                 | Blog and Projects should demonstrate list behavior without personal content.    | `src/site/tree.ts`, public renderer behavior |
| MSS-D5  | Remove default media references rather than adding asset scaffolding. | User explicitly scoped assets/media out except for no default media.            | User direction 2026-05-15                    |
| MSS-D6  | Let media count become zero through existing media discovery.         | A data-only change should not need a special CLI branch.                        | `src/site/project-source.ts`                 |
| MSS-D7  | Keep richer personal/editorial examples in test fixtures if needed.   | Renderer coverage can stay broad without making product starter data personal.  | `src/test/site-records.ts`                   |
| MSS-D8  | Update brittle tests away from exact source-seed copy.                | Project rules already say tests should not depend on exact source seed content. | `AGENTS.md`                                  |
| MSS-D9  | Do not create project `public/` in init.                              | Project-owned static assets are not a shipped format contract.                  | PRD 38 landed context, user direction        |
| MSS-D10 | Leave named templates for a later PRD.                                | This slice only changes the default starting point.                             | PRD 37 future template note                  |
| MSS-D11 | Let the starter project omit `href` if needed.                        | Project detail routes are not currently resolved like blog post routes.         | `src/site/route-resolver.ts`                 |

## Deep Modules

- **Starter seed record set:** the package-owned source records become a compact product fixture for new Site projects.
- **Project media discovery:** the existing adapter remains the contract for deciding whether init writes media files.
- **Test Site fixture:** richer Site records used for renderer and tree behavior stay outside the default package starter.

No new deep module is required for this PRD unless implementation reveals repeated seed-construction logic that should be isolated.

## Testing Decisions

- Test starter behavior through public contracts, not exact full-file snapshots.
- Test that default source records validate against the package-owned Site schema.
- Test that default source records contain the expected public starter pages.
- Test that default source records contain one post and one project.
- Test that default source records contain no media asset references.
- Test that `siteProjectMediaAssetsFromRecords(defaultStarter)` returns an empty list.
- Test that `initSiteProject` reports `mediaCount: 0`.
- Test that `initSiteProject` does not write project media files for the default starter.
- Keep existing renderer behavior tests on `src/test/site-records.ts` or purpose-built fixtures.
- Do not assert exact record counts unless the test is specifically guarding the intended starter size.
- Use `devstate check` as final check evidence.
- Browser smoke is not required for PRD-only work.
- Browser smoke is required if implementation changes public renderer behavior.

Prior art:

- `src/site/cli.test.ts` covers project init behavior.
- `src/site/project-source.test.ts` covers media path extraction and deterministic records.
- `src/site/tree.test.ts` covers public tree projection.
- `src/app.test.tsx` covers public renderer behavior.
- `src/shared/schema.test.ts` covers schema and source compatibility.

## Chunks

| ID     | Status  | Depends on | Main files                          | Acceptance                                                                                                     |
| ------ | ------- | ---------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| MSS-01 | shipped | none       | PRD                                 | PRD captures seed scope, no-media decision, route decision, chunks, blockers, tests, and promote notes.        |
| MSS-02 | shipped | MSS-01     | site seed records, seed tests       | Default Site seed is neutral, minimal, validates, has no media references, and includes starter pages/content. |
| MSS-03 | shipped | MSS-02     | CLI tests, project source tests     | `formless init` creates a no-media starter project and reports `mediaCount: 0`.                                |
| MSS-04 | shipped | MSS-03     | affected renderer/tree/schema tests | Tests use fixtures for rich Site behavior and no longer depend on personal default seed content.               |
| MSS-05 | ready   | MSS-04     | PRD                                 | Closeout records checks, decisions, blockers, and promote notes after implementation ships.                    |

## Out of Scope

- Do not scaffold project `public/`.
- Do not add project static asset publishing.
- Do not add default media files.
- Do not delete or redesign media upload behavior.
- Do not change the Site schema unless validation proves the seed cannot express the requested starter.
- Do not change public route semantics for `/home`.
- Do not add named starter templates.
- Do not add import/export UI.
- Do not add a template selector to `formless init`.
- Do not change the generated Site admin layout.
- Do not redesign the public renderer.
- Do not change publish, deploy setup, or Cloudflare config behavior.
- Do not edit `doc/current.md` or `doc/roadmap.md` in a normal PRD agent pass.

## Dependencies

| Workstream | Type     | Need                                                                                         |
| ---------- | -------- | -------------------------------------------------------------------------------------------- |
| PRD 37     | upstream | `formless init` copies package-owned Site seed records into new project `site.records.json`. |
| PRD 38     | adjacent | Route/static launch cleanup may affect public URLs, but this PRD should not depend on it.    |

## Blockers

- None known.

## Promote after ship

- MSS-02: source Site seed is neutral and no-media; promote after init/project-source chunks verify CLI output.
- MSS-03: project media discovery returns zero assets for the default starter, and init reports `mediaCount: 0` without creating a project `media/` tree.
- MSS-04: published Site SSR source-seed tests use neutral starter route/record IDs, while richer public tree and renderer coverage stays on `src/test/site-records.ts`.
- `doc/current.md`: note default `formless init` creates a neutral no-media Site starter.
- `doc/current.md`: note starter pages are Home, About, Blog, Projects, and Resume with one post and one project.
- `doc/current.md`: note init writes zero starter media files for the default starter.
- `prd/37-single-site-project-cli-loop.md`: update any shipped facts that still say init writes starter media files by default.

## Evidence

- 2026-05-15: User asked to simplify default Site seed data now that Formless can run from other directories through the CLI.
- 2026-05-15: User requested Home, About, Blog, Projects, and Resume with minimal boilerplate, one blog post, one project, no media, footer social links for GitHub, LinkedIn, and X, and a minimal Home hero.
- 2026-05-15: User explicitly scoped assets/media out for this slice except for having no default media in starter data.
- 2026-05-15: Repo inspection found `formless init` reads package `schema/apps/site/seed-records.json`, parses project records, discovers media references, and copies starter media files only when records reference same-origin media.
- 2026-05-15: Current default Site seed has 92 records, 9 media/image blocks, 39 placements, personal links, personal posts, and personal projects.
- 2026-05-15: Current route resolver normalizes empty slug to `home` and treats published Home href as `/`.
- 2026-05-15: `devstate start` reported checks ok, web ready at `https://formless.local`, and watcher tests passing.
- 2026-05-15: MSS-02 replaced `schema/apps/site/seed-records.json` with 43 flat starter records: Home, About, Blog, Projects, Resume, one post, one project, header links, footer social links, Home hero, list blocks, and no image blocks.
- 2026-05-15: MSS-02 added `src/site/starter-seed.test.ts` for source snapshot validation, no media-like hrefs, no old personal content, starter pages/content, and data-driven header/footer links.
- 2026-05-15: MSS-02 `devstate check` passed; `.devstate/logs/check-vite.txt` reports formatting, lint, and type checks passing across 246 files; `.devstate/logs/service-test.txt` reports the starter seed test passing.
- 2026-05-15: MSS-02 browser smoke reset Site schema and seed, opened `/pages/home`, `/pages/blog`, and `/pages/projects`, verified the starter hero/post/project content, found no old personal starter content, and `bun browser --session mss-02 errors` returned no page errors.
- 2026-05-15: MSS-01 agent read `doc/overview.md`, `doc/current.md`, `doc/roadmap.md`, and this PRD; PRD already captured seed scope, no-media decision, route decision, chunks, blockers, tests, and promote notes.
- 2026-05-15: MSS-03 updated `src/site/project-source.test.ts` to assert `siteProjectMediaAssetsFromRecords(siteSeedRecords)` returns `[]`.
- 2026-05-15: MSS-03 updated `src/site/cli.test.ts` so `initSiteProject` asserts no discovered starter media, `mediaCount: 0`, and no generated project `media/` directory.
- 2026-05-15: MSS-03 `devstate check` passed; `.devstate/logs/check-vite.txt` reports formatting, lint, and type checks passing across 246 files, and `.devstate/logs/service-test.txt` reports the changed CLI test passing.
- 2026-05-15: MSS-04 updated `src/worker/site-ssr.test.ts` away from the old personal source seed route `/blog/agents-are-enablers` and record `rec_site_content_home`; the test now uses neutral starter route `/blog/starter-post` and record `rec_site_starter_page_home`.
- 2026-05-15: MSS-04 kept rich public tree and renderer behavior on `src/test/site-records.ts`; `src/site/tree.test.ts`, `src/app.test.tsx`, and source schema tests already use that fixture for old rich content examples.
- 2026-05-15: MSS-04 attempted to read `tmp/devstate.json`, `tmp/test.txt`, and `tmp/check.txt`; this repo currently exposes managed evidence under `.devstate/status.json`, `.devstate/logs/service-test.txt`, and `.devstate/logs/check-vite.txt` instead.
- 2026-05-15: MSS-04 watcher evidence: `.devstate/logs/service-test.txt` reports `src/worker/site-ssr.test.ts` passing with 10 tests.
- 2026-05-15: MSS-04 `devstate check` passed; `.devstate/status.json` reports checks ok, web ready, and watcher tests passing.

## Status Notes

- MSS-01 shipped 2026-05-15.
- MSS-02 shipped 2026-05-15.
- MSS-03 shipped 2026-05-15.
- MSS-04 shipped 2026-05-15.
- Current chunk: MSS-05 ready.
- Decision: this PRD is data/test cleanup, not asset scaffolding.
- Decision: default starter should have zero media references and let existing CLI media discovery report zero media files.
- Decision: MSS-03 stayed test-only because existing init/project-source code already supports zero media records through normal discovery.
- Decision: MSS-04 stayed test-only because production SSR already renders whatever source seed the authority exposes; the brittle part was the test's old default-seed assumptions.
