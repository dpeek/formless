# PRD 10: Declarative screen runtime

Status: complete
Current chunk: complete
Last updated: 2026-05-06

## Goal

Add a source-first screen schema on top of existing generated views.

The first version should:

- keep records flat;
- keep app routes owned by the schema app registry;
- keep existing collection and create view schema valid;
- add top-level `screens`;
- let screens point at existing collection views;
- let screens own primary navigation;
- add one predefined stack layout for screen sections;
- render screen sections with existing collection renderers;
- keep schemas without `screens` working through legacy collection navigation;
- prove the model with Tasks and Rates before Estii-sized screens.

This PRD is about app screens and a small predefined layout. It is not a full layout DSL.

## Problem

Formless can describe fields, queries, item views, table views, collection views, create views, and actions.

The route-level app surface is still implicit.

Current behavior spans:

- app route selection;
- primary collection view selection;
- collection navigation hints;
- route header labels;
- selected collection state;
- selected query state;
- selected context state;
- generated collection rendering.

That keeps simple apps working, but it makes the next app-runtime step awkward:

- a collection view is both reusable view definition and screen entry point;
- `navigation.primary` lives on collection views;
- the generated route can render one selected collection workspace, not a declared screen;
- future screens need named sections before they need arbitrary layout;
- Estii-sized app composition needs screens without baking in Estii nouns.

The first screen runtime should separate "what a view is" from "where it appears as an app screen."

## Source map

Existing anchors:

- Exploration: `doc/explorations/declarative-app-runtime.md`.
- Current runtime docs: `doc/current.md`.
- Release target docs: `doc/roadmap.md`.
- App schema types: `src/shared/schema-types.ts`.
- App schema parser: `src/shared/schema.ts`.
- View parser: `src/shared/schema-views.ts`.
- View model selection: `src/client/views.ts`.
- Home route: `src/app/routes/home.tsx`.
- Generated collection renderer: `src/app/generated/collection.tsx`.
- Schema editor route: `src/app/routes/schema.tsx`.
- Task source schema: `schema/apps/tasks/schema.json`.
- Rate-card source schema: `schema/apps/rates/schema.json`.
- Schema parser tests: `src/shared/schema.test.ts`.
- View model tests: `src/client/views.test.ts`.
- App tests: `src/app.test.tsx`.

Owned files:

- `prd/10-declarative-screen-runtime.md`.

Likely changed files:

- `src/shared/schema-types.ts`.
- `src/shared/schema.ts`.
- `src/shared/schema-views.ts`.
- `src/shared/schema-screens.ts`.
- `src/shared/schema.test.ts`.
- `src/client/views.ts`.
- `src/client/views.test.ts`.
- `src/app/routes/home.tsx`.
- `src/app/generated/screen.tsx`.
- `src/app/generated/collection.tsx`.
- `src/app.test.tsx`.
- `schema/apps/tasks/schema.json`.
- `schema/apps/rates/schema.json`.

## Requirements

### Runtime behavior

- `/tasks` keeps rendering task home.
- `/rates` keeps rendering rate-card home.
- Existing schema editor save/reset flows keep working.
- Existing source schemas parse before migration.
- Active schemas without `screens` keep rendering from primary collection views.
- Active schemas with `screens` render from primary screens.
- One primary screen renders without visible screen tabs.
- Multiple primary screens render as route-local screen tabs.
- Each screen section owns independent selected query state.
- Each screen section owns independent selected context state.
- Query count badges keep working.
- Relationship-backed context tabs keep working.
- Context create defaults keep working.
- Collection actions keep working.
- No storage, sync, authority, mutation, action, or protocol shape changes.

### Schema behavior

- `screens` is an optional top-level schema map.
- Screen names are non-empty.
- Initial screen type is `workspace`.
- A workspace screen has a label.
- A workspace screen has optional navigation metadata.
- A workspace screen has a stack layout.
- A stack layout has one or more sections.
- Section ids are non-empty and unique within the screen.
- Initial section type is `collection`.
- A collection section references an existing collection view.
- A section can override the rendered section label.
- A screen can be primary or non-primary.
- When `screens` exists, primary screen validation replaces primary collection validation.
- When `screens` is absent, existing primary collection validation remains.
- Bad screen references fail at schema parse time.

### Generated UI behavior

- Screen selection happens before collection rendering.
- A screen model exposes render-ready section facts.
- A screen section reuses the existing home collection model.
- A one-section screen stays visually equivalent to today's home workspace.
- A stack screen renders sections in schema order.
- Section state is keyed by screen name and section id.
- Generated collection renderers do not parse screen schema directly.

### Future fit

- Screens should leave room for route params later.
- Screens should leave room for modes and policies later.
- Screens should leave room for board, tree, grouped table, dashboard, and plugin sections later.
- Views should stay reusable outside one screen.
- The first layout should be a named primitive, not React encoded as JSON.

## Proposed schema shape

Initial Tasks shape:

```json
{
  "screens": {
    "taskHome": {
      "type": "workspace",
      "label": "Tasks",
      "navigation": {
        "primary": true
      },
      "layout": {
        "type": "stack",
        "sections": [
          {
            "id": "tasks",
            "type": "collection",
            "view": "taskHome"
          }
        ]
      }
    }
  }
}
```

Initial Rates shape:

```json
{
  "screens": {
    "rateHome": {
      "type": "workspace",
      "label": "Rates",
      "navigation": {
        "primary": true
      },
      "layout": {
        "type": "stack",
        "sections": [
          {
            "id": "rates",
            "type": "collection",
            "view": "rateHome"
          }
        ]
      }
    },
    "rateSetup": {
      "type": "workspace",
      "label": "Rate setup",
      "navigation": {
        "primary": false
      },
      "layout": {
        "type": "stack",
        "sections": [
          {
            "id": "cards",
            "type": "collection",
            "view": "cardHome"
          },
          {
            "id": "resources",
            "type": "collection",
            "view": "resourceHome"
          }
        ]
      }
    }
  }
}
```

Notes:

- App route paths stay outside screen schema in this PRD.
- `views.*.navigation` remains supported as a legacy fallback.
- `rateSetup` can ship as non-primary until a product decision exposes it.

## Decisions

| ID     | Decision                                                                    | Reason                                                                   | Evidence                                           |
| ------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------- |
| SCR-D1 | Add optional top-level `screens`.                                           | Existing schemas and saved active schemas must keep parsing.             | `src/shared/schema.ts`                             |
| SCR-D2 | Keep app routes in the schema app registry.                                 | Current release scope keeps direct routes `/tasks` and `/rates`.         | `doc/roadmap.md`, `src/shared/schema-apps.ts`      |
| SCR-D3 | Let screens reference existing collection views.                            | Views stay reusable; screens compose them.                               | `doc/explorations/declarative-app-runtime.md`      |
| SCR-D4 | Add only `stack` layout in this PRD.                                        | It proves section composition without becoming a full layout DSL.        | `doc/explorations/declarative-app-runtime.md`      |
| SCR-D5 | Move primary navigation ownership to screens when screens exist.            | Collection views should not be route entry points forever.               | `src/client/views.ts`, `src/app/routes/home.tsx`   |
| SCR-D6 | Preserve collection navigation as the fallback for schemas without screens. | Runtime-edited schemas may not have the new top-level key yet.           | `src/app/routes/schema.tsx`                        |
| SCR-D7 | Keep screen behavior client-side only.                                      | Screens compose existing runtime data; authority invariants do not move. | `doc/current.md`                                   |
| SCR-D8 | Prove with Tasks and Rates first.                                           | The exploration explicitly avoids modeling Estii first.                  | `doc/explorations/declarative-app-runtime.md`      |
| SCR-D9 | Keep one-section screens unwrapped.                                         | Existing home spacing should remain visually equivalent.                 | `src/app/generated/screen.tsx`, `src/app.test.tsx` |

## Chunks

| ID     | Status  | Depends on | Main files                                                                           | Acceptance                                                                                                                |
| ------ | ------- | ---------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| SCR-01 | shipped | none       | tests                                                                                | Current task and rate home route, collection selection, query state, context state, and counts are characterized.         |
| SCR-02 | shipped | SCR-01     | `src/shared/schema-types.ts`, `src/shared/schema-screens.ts`, `src/shared/schema.ts` | Optional `screens` parses, validates references, rejects bad layouts, and preserves schemas without screens.              |
| SCR-03 | shipped | SCR-02     | `src/client/views.ts` or `src/client/screens.ts`                                     | Screen model selection returns primary screen models and legacy fallback models with render-ready collection sections.    |
| SCR-04 | shipped | SCR-03     | `src/app/routes/home.tsx`, `src/app/generated/screen.tsx`                            | Home route renders through screen models with no behavior change for one-section task and rate screens.                   |
| SCR-05 | shipped | SCR-04     | `schema/apps/tasks/schema.json`, `schema/apps/rates/schema.json`, tests              | Task and rate source schemas define explicit screens; reset/bootstrap/schema editor flows keep working.                   |
| SCR-06 | shipped | SCR-05     | `src/app/generated/screen.tsx`, `src/app/routes/home.tsx`, tests                     | Stack layout renders multiple collection sections with independent query and context state.                               |
| SCR-07 | shipped | SCR-06     | `src/client/views.ts`, `src/app/routes/home.tsx`, source schemas                     | Primary app workspace selection uses screen navigation when screens exist; collection navigation remains legacy fallback. |
| SCR-08 | shipped | SCR-07     | tests, `bun browser` smoke, `prd/10-declarative-screen-runtime.md`                   | Tasks and Rates pass app smoke; PRD status, decisions, blockers, and promote notes are current.                           |

## Chunk details

### SCR-01 screen runtime characterization

Characterize the current behavior before adding schema surface.

Acceptance:

- Task primary collection model is characterized.
- Rate primary collection model is characterized.
- Rate non-primary collection models are characterized.
- Home route query tab state stays route-local.
- Rate context state stays view-local.
- Existing count badge coverage remains.
- Evidence is recorded in PRD status notes.

### SCR-02 screen parser

Add the schema surface and parser validation.

Acceptance:

- `AppSchema` includes optional `screens`.
- A screen with one collection section parses.
- A screen with duplicate section ids fails.
- A screen referencing a missing view fails.
- A screen referencing a create view fails.
- A schema with `screens` and no primary screen fails.
- A schema without `screens` still validates primary collection views.
- `stringifySchema` includes parsed screens.

### SCR-03 screen model

Build a deep model seam for screens.

Acceptance:

- `selectScreenModels` returns screen models in schema order.
- `selectPrimaryScreenModels` returns primary screens.
- A screen section exposes `HomeCollectionConfig`.
- A legacy schema without `screens` produces fallback screen models from primary collection models.
- Screen model tests do not duplicate parser validation.

### SCR-04 route integration

Move the generated home route from collection models to screen models.

Acceptance:

- `/tasks` renders through a screen model.
- `/rates` renders through a screen model.
- One-section screens preserve current layout.
- Selected screen state resets when schema key changes.
- Selected query and context state are keyed by screen section.
- No storage, sync, authority, or protocol files change.

### SCR-05 source schema migration

Add explicit screens to the sample source schemas.

Acceptance:

- Task source schema has one primary workspace screen.
- Rate source schema has one primary rates workspace screen.
- Rate source schema can define non-primary setup/admin screen sections for `cardHome` and `resourceHome`.
- Reset schema restores source screens.
- Schema editor can save a schema containing screens.
- Legacy collection navigation is still accepted.

### SCR-06 stack layout

Make the first layout primitive useful.

Acceptance:

- A synthetic multi-section screen renders sections in order.
- Each section can choose a different query tab without changing another section.
- Each section can choose a different context record without changing another section.
- Section labels render when a stack has more than one section.
- Existing one-section screen spacing stays visually equivalent.

### SCR-07 navigation ownership

Move app workspace selection to screens.

Acceptance:

- Primary screen tabs render when more than one primary screen exists.
- Non-primary screens do not appear in primary screen tabs.
- When `screens` exists, collection `navigation.primary` does not control route entry selection.
- When `screens` is absent, collection `navigation.primary` still controls legacy entry selection.
- Source schemas no longer rely on collection navigation for primary route behavior.

### SCR-08 closeout

Verify behavior and update this PRD.

Acceptance:

- `./tmp/test.txt` shows passing tests after `bun start`.
- `./tmp/check.txt` shows passing checks after `bun start`.
- `bun browser` smoke covers `/tasks` and `/rates`.
- `tmp/state.txt` has no unresolved issues.
- Promote notes are ready for a doc/steward pass.
- PRD status reflects shipped chunks, blockers, and decisions.

## Non-goals

- Do not add arbitrary route paths to screen schema.
- Do not add route params.
- Do not add nested routers.
- Do not add modes.
- Do not add policies or permissions.
- Do not add computed values.
- Do not add board, tree, grouped table, dashboard, chart, timeline, document, or plugin section types.
- Do not add dialogs or wizards.
- Do not change storage shape.
- Do not change sync protocol shape.
- Do not change authority invariants.
- Do not model Estii screens in this PRD.
- Do not build a visual screen authoring UI.
- Do not remove legacy collection navigation until saved-schema migration is solved.

## Parallel shipping

Can ship in parallel with:

- PRD 08 if PRD 08 avoids `src/client/views.ts` and generated action rendering during SCR-03 through SCR-07.
- Authority/storage PRDs because this PRD should not touch worker write behavior.

Should coordinate with:

- PRD 09 if it touches `schema/apps/site/schema.json` or generated home route behavior.

Should not share the same chunk ownership for:

- `src/shared/schema-types.ts`.
- `src/shared/schema.ts`.
- `src/client/views.ts`.
- `src/app/routes/home.tsx`.
- `src/app/generated/collection.tsx`.
- `src/app/generated/screen.tsx`.
- `schema/apps/tasks/schema.json`.
- `schema/apps/rates/schema.json`.

Recommended order:

1. Ship SCR-01 through SCR-04 before any source schema migration.
2. Migrate Tasks and Rates in SCR-05.
3. Add useful stack behavior in SCR-06.
4. Move navigation ownership in SCR-07 after fallback behavior is proven.
5. Smoke and close out in SCR-08.

## Open questions

- Should non-primary screens be addressable later through subroutes or only through generated navigation?
- Should `screen.navigation` grow ordering or grouping before first release?
- Should `views.*.navigation` be formally deprecated in schema version 1 or left as a compatibility hint?
- Should the Site app migrate to screens in this PRD or wait for PRD 09 block schema churn to settle?

## Blockers

- None.

## Cross-PRD dependencies

- Builds on PRD 06 home view model module.
- Coordinates with PRD 09 for Site source schema changes.
- Does not depend on PRD 08 entity action module.

## Progress rules

- One agent owns one SCR chunk.
- Do not mark a chunk `doing` if another active agent owns it.
- Keep runtime claims backed by code, schema, tests, or shipped behavior.
- Keep global-doc updates in `Promote after ship`.
- Update only this PRD during normal SCR chunk work.
- Run `bun browser` smoke for SCR-04, SCR-06, SCR-07, and SCR-08 if generated UI behavior changes.

## Promote after ship

- SCR-01: no global doc promotion; characterization only.
- SCR-02: `doc/current.md` should note optional top-level `screens` parse when shipped.
- SCR-03: `doc/current.md` should note generated screen models select screen sections before rendering.
- SCR-04: `doc/current.md` should note home routes render through screen models.
- SCR-05: `doc/current.md` should note Tasks and Rates source schemas define screens.
- SCR-06: `doc/current.md` should note workspace screens support stack layout over collection sections.
- SCR-07: `doc/current.md` should note screen navigation owns primary route workspace selection when `screens` exists.
- SCR-08: doc/steward pass should promote shipped screen runtime facts into `doc/current.md` and keep `doc/roadmap.md` aligned with first-release screen scope.

## PRD status notes

- PRD drafted 2026-05-06 from `doc/explorations/declarative-app-runtime.md` and current Tasks/Rates runtime behavior.
- Scope sized for 6-8 implementation sessions.
- SCR-01 shipped 2026-05-06.
- SCR-01 evidence: `src/client/views.test.ts` characterizes task primary, rate primary, and rate non-primary collection models.
- SCR-01 evidence: `src/app.test.tsx` characterizes route-local query reset shape, collection-view-local context state, query count badges, action target count badges, and relationship count badges.
- SCR-01 note: `src/app/routes/home.tsx` selection helpers preserve existing local route state while making the behavior testable.
- SCR-01 promote: no global doc promotion; characterization only.
- SCR-02 shipped 2026-05-06.
- SCR-02 evidence: `src/shared/schema-screens.ts` parses optional workspace screens, stack layouts, collection sections, section labels, primary navigation, unique section ids, and collection view references.
- SCR-02 evidence: `src/shared/schema.test.ts` covers one-section screen parsing, stringify output, duplicate section ids, missing view references, create-view references, no-primary-screen failure, and legacy schemas without `screens`.
- SCR-02 note: `src/shared/schema-views.ts` keeps primary collection validation for legacy schemas and lets screen primary validation replace it when `screens` exists.
- SCR-02 promote: `doc/current.md` should note optional top-level `screens` parse.
- SCR-03 shipped 2026-05-06.
- SCR-03 evidence: `src/client/views.ts` adds `HomeScreenModel`, `selectScreenModels`, and `selectPrimaryScreenModels`.
- SCR-03 evidence: screen collection sections expose `HomeCollectionConfig` from existing collection models.
- SCR-03 evidence: `src/client/views.test.ts` covers screen order, primary screen filtering, render-ready collection section facts, and legacy fallback screens from primary collection models.
- SCR-03 note: schemas without `screens` produce one-section stack screens named after each primary collection view.
- SCR-03 promote: `doc/current.md` should note generated screen models select screen sections before rendering.
- SCR-04 shipped 2026-05-06.
- SCR-04 evidence: `src/app/routes/home.tsx` selects primary screen models and resets selected screen state on schema-key changes.
- SCR-04 evidence: `src/app/generated/screen.tsx` renders screen collection sections through the existing `HomeCollection` renderer.
- SCR-04 evidence: `src/app.test.tsx` covers screen-section keyed query/context state and explicit one-section task screen rendering.
- SCR-04 evidence: `./tmp/state.txt` shows tests pass and check idle after `bun start`.
- SCR-04 smoke: `bun browser` covered `/tasks` and `/rates` through `http://127.0.0.1:4580`.
- SCR-04 note: no storage, sync, authority, or protocol files changed.
- SCR-04 promote: `doc/current.md` should note home routes render through screen models.
- SCR-05 shipped 2026-05-06.
- SCR-05 evidence: `schema/apps/tasks/schema.json` defines primary `taskHome` workspace screen with a `tasks` collection section for `taskHome`.
- SCR-05 evidence: `schema/apps/rates/schema.json` defines primary `rateHome` workspace screen and non-primary `rateSetup` workspace sections for `cardHome` and `resourceHome`.
- SCR-05 evidence: `src/client/schema.test.ts` covers parsed Tasks and Rates source screens.
- SCR-05 evidence: `src/client/views.test.ts` selects screen models from the migrated Rates source schema.
- SCR-05 evidence: `src/app.test.tsx` shows schema editor routes render source schemas containing screens.
- SCR-05 evidence: `src/worker/authority.test.ts` covers saving a compatible schema containing screens and reset schema restoring source screens.
- SCR-05 note: legacy collection navigation remains in Rates source views and still parses as compatibility data.
- SCR-05 promote: `doc/current.md` should note Tasks and Rates source schemas define screens.
- SCR-06 shipped 2026-05-06.
- SCR-06 evidence: `src/app/generated/screen.tsx` renders section headings only for multi-section stack screens and leaves one-section screens unwrapped.
- SCR-06 evidence: `src/app.test.tsx` covers one-section screen markup equivalence, synthetic stack section order, independent selected query state, and independent selected context state.
- SCR-06 evidence: `./tmp/state.txt` shows tests pass and check idle after `bun start`.
- SCR-06 evidence: `./tmp/test.txt` shows the SCR-06 app test rerun passed with 65 tests.
- SCR-06 evidence: `./tmp/check.txt` shows formatting, lint, and type checks pass.
- SCR-06 smoke: `bun browser` covered `/tasks` and `/rates` through `http://127.0.0.1:4370`.
- SCR-06 promote: `doc/current.md` should note workspace screens support stack layout over collection sections.
- SCR-07 shipped 2026-05-06.
- SCR-07 evidence: `schema/apps/rates/schema.json` no longer carries collection `navigation` hints on `resourceHome`, `cardHome`, or `rateHome`.
- SCR-07 evidence: `src/client/schema.test.ts` and `src/shared/schema.test.ts` cover rate source collection views without route navigation hints.
- SCR-07 evidence: `src/client/views.test.ts` shows primary rate screen selection returns `rateHome` while rate collection views default to primary collection models.
- SCR-07 evidence: `src/app.test.tsx` covers primary screen tabs, hidden non-primary screens, and rendering despite a collection view marked non-primary.
- SCR-07 evidence: `./tmp/devstate.json` shows tests pass and checks pass after `bun start`; `./tmp/state.txt` was not generated by this repo loop.
- SCR-07 evidence: `./tmp/test.txt` shows 22 test files and 421 tests passed.
- SCR-07 evidence: `./tmp/check.txt` shows formatting, lint, and type checks pass.
- SCR-07 smoke: `bun browser` covered `/tasks` and `/rates` through `http://127.0.0.1:4582`.
- SCR-07 promote: `doc/current.md` should note screen navigation owns primary route workspace selection when `screens` exists.
- SCR-08 shipped 2026-05-06.
- SCR-08 evidence: `./tmp/devstate.json` shows dev ready, tests pass, and checks pass after `bun start`; this repo loop does not generate `./tmp/state.txt`.
- SCR-08 evidence: `./tmp/test.txt` shows 22 test files and 421 tests passed.
- SCR-08 evidence: `./tmp/check.txt` shows formatting, lint, and type checks pass.
- SCR-08 smoke: `bun browser` covered `/tasks` and `/rates` through `http://127.0.0.1:4369`.
- SCR-08 smoke: `/tasks` rendered the Tasks screen, query tabs, seeded task records, and task actions.
- SCR-08 smoke: `/rates` rendered the Rates screen, context tabs, rate table rows, and rate actions.
- SCR-08 note: no runtime code, source schema, storage, sync, authority, mutation, action, or protocol files changed.
- SCR-08 promote: doc/steward pass should promote shipped screen runtime facts into `doc/current.md` and keep `doc/roadmap.md` aligned with first-release screen scope.
- PRD complete 2026-05-06.
- No blockers.
