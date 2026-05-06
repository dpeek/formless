# PRD 13: Site editor list/detail

Status: ready
Current chunk: SED-01
Last updated: 2026-05-06

## Goal

Make the Site editor feel like an authoring tool instead of a raw block database.

The first slice should:

- keep site records flat;
- keep `block` and `blockPlacement` as the storage model;
- keep the public page tree and renderer unchanged;
- add a generated list/detail context presentation;
- use that presentation for Site Pages, Header, and Footer workspaces;
- make Pages, Header, and Footer the primary top-level Site editor surfaces;
- hide raw Blocks and Placements from primary Site navigation;
- keep child block creation and scoped create dialogs for a later PRD.

This PRD is about the first usable Site editor shape. It is not about a full visual page builder.

## Problem

The Site app now has a good flat model and a public tree projection, but the generated admin UI exposes too much storage detail.

Current behavior:

- `/site` shows a primary Blocks workspace.
- Blocks includes pages, posts, projects, groups, links, markdown blocks, media blocks, heroes, query blocks, and CTAs.
- `/site` also shows a primary Placements workspace.
- Placement editing is scoped by a selected block, but the selected block is chosen through horizontal tabs.
- Creating a block shows fields for every block type.
- Creating a placement requires choosing an existing child block from the full block set.

That is accurate to the storage model, but it is not the author's mental model.

The author thinks in roots:

- Pages;
- Header;
- Footer.

Everything else is child content inside one of those roots.

## Source map

Existing anchors:

- Current runtime docs: `doc/current.md`.
- Release target docs: `doc/roadmap.md`.
- Site source schema: `schema/apps/site/schema.json`.
- Site seed records: `schema/apps/site/seed-records.json`.
- Site tree projection: `src/site/tree.ts`.
- Public renderer: `src/app/site-renderer/renderer.tsx`.
- Screen runtime: `prd/10-declarative-screen-runtime.md`.
- Home view model: `prd/06-home-view-model.md`.
- Collection view parser: `src/shared/schema-views.ts`.
- Screen parser: `src/shared/schema-screens.ts`.
- View model selection: `src/client/views.ts`.
- Generated screen renderer: `src/app/generated/screen.tsx`.
- Generated collection renderer: `src/app/generated/collection.tsx`.
- Generated table renderer: `src/app/generated/table.tsx`.
- Generated create renderer: `src/app/generated/create.tsx`.
- Schema parser tests: `src/shared/schema.test.ts`.
- View model tests: `src/client/views.test.ts`.
- App tests: `src/app.test.tsx`.
- Site tree tests: `src/site/tree.test.ts`.

Owned files:

- `prd/13-site-editor-list-detail.md`.

Likely changed files:

- `src/shared/schema-types.ts`.
- `src/shared/schema-views.ts`.
- `src/shared/schema.test.ts`.
- `src/client/views.ts`.
- `src/client/views.test.ts`.
- `src/app/generated/collection.tsx`.
- `src/app/generated/screen.tsx`.
- `src/app.test.tsx`.
- `schema/apps/site/schema.json`.
- `schema/apps/site/seed-records.json` only if singleton root seed cleanup is required.

## Requirements

### Runtime behavior

- `/site` loads as a Site editor.
- The primary Site editor surfaces are Pages, Header, and Footer.
- The Site editor no longer opens with an all-block table as the primary experience.
- Page selection uses list/detail, not one tab per page.
- Header editing uses the existing Header group as the selected root.
- Footer editing uses the existing Footer group as the selected root.
- A selected root shows its editable root fields.
- A selected root shows child placements for that root.
- Placement editing still uses the existing flat `blockPlacement` records.
- Existing inline field patch behavior keeps working.
- Existing create actions keep working where they remain exposed.
- Existing readiness warnings keep rendering.
- Existing query count badges keep rendering where still used.
- `/pages` and `/pages/*` keep rendering from the public tree endpoint.
- Missing-child and cycle warning behavior in the public tree stays unchanged.
- No storage, authority, sync, mutation, action, or protocol shape changes.

### Schema behavior

- Existing schemas without list/detail context presentation keep rendering unchanged.
- Add an optional context presentation hint for collection views.
- Default context presentation remains the current tab behavior.
- Initial context presentations are:
  - `tabs`;
  - `listDetail`.
- `listDetail` is valid only for collection views with context.
- Bad presentation values fail at schema parse time.
- `stringifySchema` preserves the new presentation hint.
- Site source schema can define primary screens for Pages, Header, and Footer.
- Site source schema can keep raw Blocks and Placements views for debug/admin use.
- Raw Blocks and Placements do not appear as primary Site screens after this PRD.

### Generated UI behavior

- `listDetail` renders context records as a scannable list.
- The selected context record renders as the detail target.
- Detail includes the context item view fields when configured.
- Detail includes the related collection result for the selected context.
- List/detail works with one selected context record and with many records.
- List/detail has stable selection state keyed by screen and section.
- List/detail can stack responsively on narrow viewports.
- A one-item Header or Footer context should not feel like a noisy tab strip.
- Generated collection rendering consumes view-model facts, not raw schema.

### Site authoring behavior

- Pages screen selects `block` records with `type = page`.
- Pages screen edits placements where `blockPlacement.parent` is the selected page block.
- Header screen selects the existing group block with `templateKey = header`.
- Header screen edits placements where `blockPlacement.parent` is the Header group block.
- Footer screen selects the existing group block with `templateKey = footer`.
- Footer screen edits placements where `blockPlacement.parent` is the Footer group block.
- Header navigation keeps using link blocks rather than placed page blocks.
- Footer navigation keeps using link blocks and nested footer group blocks.
- The editor does not introduce page/header/footer cycles.

### Future fit

- Inline child creation can reuse the selected root context.
- Scoped create dialogs can later hide fields through literal create defaults.
- A future outline/tree section can reuse the same selected root.
- A future preview pane can reuse the same selected root.
- A future Site-specific editor can still sit on top of the same flat model.

## Proposed schema shape

Initial context presentation shape:

```json
{
  "context": {
    "name": "block",
    "entity": "block",
    "query": "blockPages",
    "labelField": "title",
    "relationship": "blockPlacements",
    "itemView": "blockContextItem",
    "presentation": "listDetail"
  }
}
```

Initial Site screen shape:

```json
{
  "screens": {
    "sitePages": {
      "type": "workspace",
      "label": "Pages",
      "navigation": { "primary": true },
      "layout": {
        "type": "stack",
        "sections": [
          {
            "id": "pages",
            "type": "collection",
            "view": "pageCompositionHome"
          }
        ]
      }
    },
    "siteHeader": {
      "type": "workspace",
      "label": "Header",
      "navigation": { "primary": true },
      "layout": {
        "type": "stack",
        "sections": [
          {
            "id": "header",
            "type": "collection",
            "view": "headerCompositionHome"
          }
        ]
      }
    },
    "siteFooter": {
      "type": "workspace",
      "label": "Footer",
      "navigation": { "primary": true },
      "layout": {
        "type": "stack",
        "sections": [
          {
            "id": "footer",
            "type": "collection",
            "view": "footerCompositionHome"
          }
        ]
      }
    }
  }
}
```

Notes:

- Exact view names can change during implementation.
- Raw `blockHome` can stay in the schema as a non-primary/debug collection view.
- The old `blockCompositionHome` can be replaced or kept as a debug view.
- Literal create defaults are out of scope for this PRD, so scoped child creation stays limited.

## Decisions

| ID     | Decision                                                      | Reason                                                               | Evidence                                            |
| ------ | ------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------- |
| SED-D1 | Keep `block` and `blockPlacement` flat.                       | Flat records are a core runtime bet and the public tree already projects nesting. | `doc/overview.md`, `src/site/tree.ts`               |
| SED-D2 | Add list/detail as a generic context presentation.            | Pages, Header, Footer need the same selection pattern without a Site-only fork. | `src/app/generated/collection.tsx`, `src/client/views.ts` |
| SED-D3 | Default context presentation stays tabs.                      | Existing Tasks, Rates, and saved active schemas must not change silently. | `prd/10-declarative-screen-runtime.md`              |
| SED-D4 | Put Site top-level authoring in screens, not entity splits.   | PRD 10 already owns route-level workspace composition.               | `schema/apps/site/schema.json`, `prd/10-declarative-screen-runtime.md` |
| SED-D5 | Header and Footer are selected root groups.                   | Current seeds already model them as reusable group blocks.           | `schema/apps/site/seed-records.json`                |
| SED-D6 | Header nav uses link blocks, not page blocks.                 | Placing pages under Header creates page/header/page recursion risk.  | `src/site/tree.ts`, `src/app/site-renderer/renderer.tsx` |
| SED-D7 | Defer scoped create forms.                                    | Create views only support context defaults today, not literal `type` defaults. | `src/shared/schema-views.ts`, `src/app/generated/create.tsx` |
| SED-D8 | Keep raw admin views available but non-primary.               | Debug access stays possible while the authoring surface gets simpler. | `schema/apps/site/schema.json`                      |

## Chunks

| ID     | Status | Depends on | Main files | Acceptance |
| ------ | ------ | ---------- | ---------- | ---------- |
| SED-01 | ready  | none       | tests, PRD | Current Site admin surfaces, context tab behavior, and public route behavior are characterized. |
| SED-02 | ready  | SED-01     | schema types/parser, view model, tests | Collection context presentation parses, defaults to tabs, exposes render-ready facts, and rejects bad values. |
| SED-03 | ready  | SED-02     | generated collection/screen UI, app tests | `listDetail` context presentation renders a selectable list plus selected-record detail without changing tab presentation behavior. |
| SED-04 | ready  | SED-03     | Site source schema, view tests, app tests | Site source schema defines primary Pages, Header, and Footer screens that use list/detail root selection. |
| SED-05 | ready  | SED-04     | browser smoke, PRD | `/site`, `/pages`, and representative public page routes smoke pass; PRD status, decisions, blockers, and promote notes are current. |

## Chunk details

### SED-01 characterization

Acceptance:

- Current Site primary screen behavior is characterized.
- Current Blocks and Placements collection behavior is characterized.
- Current context tab selection behavior is characterized.
- Current page tree/public renderer behavior is protected from editor changes.
- Current all-fields create dialog behavior is documented as a baseline.
- No runtime behavior changes.

Evidence to record:

- `./tmp/agent-dev.json`.
- `./tmp/test.txt`.
- `./tmp/check.txt`.

### SED-02 context presentation model

Acceptance:

- `CollectionContextSchema` accepts optional `presentation`.
- Missing `presentation` defaults to `tabs`.
- Valid values are `tabs` and `listDetail`.
- `listDetail` on a collection without context is rejected if schema shape permits that case.
- `HomeContextConfig` exposes the selected presentation.
- Existing view model tests for Tasks, Rates, and Site keep passing.
- `stringifySchema` preserves explicit presentation values.
- No generated UI behavior changes yet unless a test schema opts in.

### SED-03 generated list/detail renderer

Acceptance:

- A context collection with `presentation = tabs` renders as today.
- A context collection with `presentation = listDetail` renders context records in a list.
- Selecting a context record changes the active detail record.
- The detail record shows configured context item view fields.
- The related collection result renders for the selected context.
- Create context action still works if configured.
- Create child action still receives context defaults.
- Query count and relationship count badges still work.
- Empty context records render an empty state.
- Narrow viewport markup remains coherent.

### SED-04 Site source schema

Acceptance:

- Site source schema defines `screens`.
- Primary Site screens are Pages, Header, and Footer.
- Pages screen uses a page-root composition collection.
- Pages root query selects `block.type = page`.
- Header screen uses a header-root composition collection.
- Header root query selects the Header group block.
- Footer screen uses a footer-root composition collection.
- Footer root query selects the Footer group block.
- Raw Blocks and Placements are not primary Site screens.
- Existing site source schema still parses after reset.
- Existing public page tree tests keep passing.
- `/site` route tests show Pages/Header/Footer primary screen labels.

### SED-05 closeout

Acceptance:

- `./tmp/agent-dev.json` shows dev ready, tests pass, and checks pass.
- `./tmp/test.txt` shows passing tests after `bun start`.
- `./tmp/check.txt` shows passing checks after `bun start`.
- `bun browser` smoke covers `/site`.
- `bun browser` smoke covers `/pages` and `/pages/home`.
- Smoke confirms `/site` exposes Pages, Header, and Footer as primary editor surfaces.
- Smoke confirms public site rendering is unchanged.
- No blockers remain open.
- Promote notes are ready for a docs/steward pass.

## Non-goals

- Do not build a drag/drop block outline.
- Do not build inline child block creation.
- Do not add literal create defaults.
- Do not hide fields by block type in create forms.
- Do not add a Site-only custom editor route.
- Do not add route params to screens.
- Do not add arbitrary layout DSL.
- Do not change public tree projection.
- Do not change public renderer semantics.
- Do not change storage shape.
- Do not change sync protocol shape.
- Do not change authority validation.
- Do not add delete/archive flows.
- Do not add page preview panes.
- Do not add media upload.
- Do not split pages, posts, projects, groups, links, and media into separate entities.

## Open questions

| ID     | Question | Default for implementation |
| ------ | -------- | -------------------------- |
| SED-O1 | Should context presentation live on collection context or screen section? | Put it on collection context so the renderer can stay generic and view-owned. |
| SED-O2 | Should Header/Footer one-item contexts hide the list column? | Keep the generic list/detail layout first; polish only if it feels noisy in smoke. |
| SED-O3 | Should raw Blocks be reachable through a non-primary screen? | Keep raw views in schema, but do not expose them as primary Site tabs. |
| SED-O4 | Should Pages include posts/projects with slugs? | No. Pages means `block.type = page` for this PRD. Posts/projects can get their own authoring surface later. |
| SED-O5 | Should Header links reference page records instead of hrefs? | No. Keep links as link blocks with `href` to avoid recursion. |

## Blockers

| ID     | Status | Blocks | Notes |
| ------ | ------ | ------ | ----- |
| SED-B1 | open   | SED-04 | Need SED-02/SED-03 generic list/detail support before the Site schema can adopt it cleanly. |

## Cross-PRD dependencies

| Dependency | Direction | Notes |
| ---------- | --------- | ----- |
| PRD 06 home view model module | satisfied | `src/client/views.ts` is the existing model seam for generated collection facts. |
| PRD 09 site tree renderer | upstream | This PRD must preserve public tree and renderer behavior. |
| PRD 10 declarative screen runtime | upstream | Site Pages/Header/Footer should be modeled as screens. |
| PRD 11 field editor expansion | parallel input | This PRD should avoid changing field editor semantics. |
| Future scoped create PRD | downstream | Needs literal create defaults and type-scoped fields after this PRD simplifies root selection. |

## Parallel shipping

Can ship in parallel with:

- worker-only sync or authority chunks that avoid generated collection UI and Site schema;
- field editor chunks that avoid collection context presentation.

Should coordinate with:

- any PRD changing `src/client/views.ts`;
- any PRD changing `src/app/generated/collection.tsx`;
- any PRD changing `schema/apps/site/schema.json`;
- any PRD changing `src/shared/schema-views.ts`.

Avoid parallel edits with:

- PRD chunks owning the Site source schema;
- PRD chunks owning generated collection context rendering;
- PRD chunks changing screen model selection.

Recommended order:

1. Characterize current Site behavior.
2. Add context presentation parsing and view-model facts.
3. Render generic list/detail.
4. Move Site source schema to Pages/Header/Footer screens.
5. Browser smoke `/site` and public pages.

## Progress rules

- Mark exactly one SED chunk as `doing` when implementation starts.
- Do not mark a chunk `doing` if another active agent owns it.
- When a chunk ships, mark it `shipped`.
- Replace shipped task detail with outcome plus evidence.
- Keep runtime claims backed by code, schema, tests, or shipped behavior.
- Keep global-doc updates in `Promote after ship`.
- Update only this PRD during normal SED chunk work.
- Run `bun browser` smoke for SED-03, SED-04, and SED-05 because generated UI behavior changes.

## Promote after ship

SED-01:

- No global-doc promotion. Characterization tests only.

SED-02:

- Collection contexts can declare a generated presentation hint.
- Context presentation defaults to tab selection.
- Generated view models expose context presentation facts.

SED-03:

- Generated collection rendering supports context list/detail presentation.
- List/detail presentation keeps selected context record state.
- List/detail presentation renders selected context fields and related collection results.

SED-04:

- Site source schema defines primary Pages, Header, and Footer screens.
- Site Pages screen selects page blocks and edits their placements.
- Site Header screen selects the Header group block and edits its placements.
- Site Footer screen selects the Footer group block and edits its placements.
- Raw Blocks and Placements are no longer primary Site editor surfaces.
- Site records stay flat as `block` and `blockPlacement`.

SED-05:

- `/site` browser smoke verifies Pages, Header, and Footer are the primary Site editor surfaces.
- `/pages` and `/pages/home` browser smoke verify public rendering still works.
- PRD 13 is ready for docs/steward promotion.

When this PRD ships, update `doc/current.md`:

- Site admin primary screens are Pages, Header, and Footer.
- Site editor root selection uses generated list/detail context presentation.
- Site records still use flat `block` and `blockPlacement` records.
- Public site tree and renderer behavior are unchanged.

When this PRD ships, update `doc/roadmap.md` only if the first-release target should name the Site editor surface:

- Site first-release admin surface uses Pages, Header, and Footer roots.
- Inline scoped child creation remains later than this PRD.

## PRD status notes

- PRD drafted 2026-05-06 from editor UX discussion.
- First slice is option 2: generic list/detail workspace before a Site-specific editor.
- User direction: Pages, Header, and Footer should be the only top-level Site editor blocks.
- User direction: other block creation should move inline later.
- User direction: current UI is overwhelming and tabs are likely the wrong page selection control.
- Technical constraint: create views support context defaults but not literal `type` defaults today.
- SED-01 is the next ready chunk.
