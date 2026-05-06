# PRD 06: Home view model module

Status: active
Current chunk: none
Last updated: 2026-05-06

## Goal

Deepen generated home view models.

The first version should:

- keep existing collection schema syntax;
- keep existing routes;
- keep existing generated UI behavior;
- keep relationship-backed context behavior;
- keep query tabs and counts working;
- move home workspace behavior behind a smaller model seam;
- make future screen, grouped table, board, and related collection work easier.

This PRD is about generated home workspace locality, not about a new screen schema.

## Problem

Generated home workspace behavior is spread across parser validation, model selection, store selectors, and React rendering.

Current behavior spans:

- collection view parsing;
- context relationship validation;
- query context validation;
- create default validation;
- home model selection;
- selected view state;
- selected query state;
- selected context state;
- relationship-backed count badges;
- collection result rendering;
- create dialog defaults.

The module is shallow because callers and tests must know too many details.
The deletion test shows the issue: removing the current model selector would push relationship metadata, query context, result selection, action shape, and related collection knowledge into multiple renderers.

The generated home view model should be the place where collection schema becomes a render-ready workspace model.

## Source map

Existing anchors:

- Schema view parser: `src/shared/schema-views.ts`.
- Schema types: `src/shared/schema-types.ts`.
- View model selection: `src/client/views.ts`.
- Store selectors: `src/client/store.ts`.
- Generated collection renderer: `src/app/generated/collection.tsx`.
- Generated table renderer: `src/app/generated/table.tsx`.
- Generated create renderer: `src/app/generated/create.tsx`.
- Home route state: `src/app/routes/home.tsx`.
- View model tests: `src/client/views.test.ts`.
- App tests: `src/app.test.tsx`.

Owned files:

- `prd/06-home-view-model.md`.

Likely changed files:

- `src/client/views.ts`.
- `src/client/views.test.ts`.
- `src/shared/schema-views.ts`.
- `src/shared/schema.test.ts`.
- `src/app/generated/collection.tsx`.
- `src/app/routes/home.tsx`.
- `src/app.test.tsx`.

## Requirements

### Runtime behavior

- `/tasks` keeps rendering task home.
- `/rates` keeps rendering rate-card home.
- `/site` keeps rendering site authoring home.
- Route-local selected view state stays route-local.
- Route-local selected query state stays route-local.
- Route-local selected context state stays route-local.
- Query tabs keep derived counts.
- Relationship-backed context tabs keep derived inverse counts.
- Related child create keeps hidden parent reference defaults.
- Existing collection/list/table rendering stays visually equivalent.
- No storage, sync, or authority behavior changes.

### Model behavior

- The home view model should expose render-ready collection state.
- The model should name the entity, result, query tabs, context, actions, and related collection facts.
- Relationship-backed context data should be represented once.
- Query context requirements should remain parser-validated.
- The generated UI should not reconstruct schema relationships by hand.
- Store selectors should stay reusable and not become schema parsers.

### Future fit

- The model should leave room for screen schema.
- The model should leave room for grouped table and board result types.
- The model should leave room for mode and policy projections.
- The model should leave room for richer relationship panels.

## Decisions

| ID     | Decision                                                        | Reason                                                           | Evidence                                         |
| ------ | --------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------ |
| HVM-D1 | Keep collection view schema syntax unchanged in the first pass. | This PRD deepens the module before broadening schema.            | `src/shared/schema-types.ts`                     |
| HVM-D2 | Keep context validation in the schema parser.                   | Bad schema should fail before generated UI renders.              | `src/shared/schema-views.ts`                     |
| HVM-D3 | Make `src/client/views.ts` the primary model seam.              | The client already converts schema data into generated UI facts. | `src/client/views.ts`                            |
| HVM-D4 | Keep store selectors focused on local records.                  | Store selectors should not know schema authoring rules.          | `src/client/store.ts`                            |
| HVM-D5 | Avoid screen schema in this PRD.                                | Screen schema is broader than home view model locality.          | `doc/explorations/declarative-app-runtime.md`    |
| HVM-D6 | Keep relationship counts derived.                               | Parent-side relationship values must not be stored.              | `prd/04-relationships.md`, `src/client/store.ts` |

## Chunks

| ID     | Status  | Depends on    | Main files                                                    | Acceptance                                                                                                |
| ------ | ------- | ------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| HVM-01 | shipped | PRD 04 REL-06 | tests                                                         | Existing task, rate, and site home model behavior is characterized.                                       |
| HVM-02 | shipped | HVM-01        | `src/client/views.ts`                                         | Home collection model exposes context, query, action, and result facts with less renderer reconstruction. |
| HVM-03 | shipped | HVM-02        | `src/app/generated/collection.tsx`, `src/app/routes/home.tsx` | Generated collection rendering consumes the deeper model without behavior changes.                        |
| HVM-04 | draft   | HVM-03        | tests, Browser Use if behavior changes                        | Tasks, rates, and site home flows still render and update counts.                                         |
| HVM-05 | draft   | HVM-04        | `prd/06-home-view-model.md`                                   | PRD status and promote notes reflect shipped behavior.                                                    |

## Non-goals

- Do not add a screen schema.
- Do not add board, tree, grouped table, or dashboard result types.
- Do not change storage shape.
- Do not change query expression syntax.
- Do not change relationship schema syntax.
- Do not change generated field editors.
- Do not change authority validation.
- Do not add permissions or mode policies.

## Parallel shipping

Can ship in parallel with:

- PRD 05 because this PRD is client/generated UI work and PRD 05 is worker authority work.

Can ship in limited parallel with:

- PRD 07 if PRD 06 avoids generated field editor and create-field internals.
- PRD 08 if PRD 06 avoids action button behavior and action config changes.

Should not share the same chunk ownership for:

- `src/client/views.ts`.
- `src/app/generated/collection.tsx`.
- `src/app/generated/actions.tsx`.
- `src/app/generated/create.tsx`.

Recommended order:

1. Finish PRD 04 REL-06 smoke.
2. Ship HVM-01 and HVM-02.
3. Let PRD 07 proceed only on field behavior files until HVM-03 lands.

## Promote after ship

- HVM-01: no global doc promotion; characterization tests only.
- HVM-02: generated home workspaces expose nested collection facts in `HomeViewModel.collection`; current renderer aliases remain until HVM-03.
- HVM-03: generated home route and collection renderer consume `HomeViewModel.collection` directly; top-level aliases remain for compatibility.
- `doc/current.md`: note that generated home workspaces use a deeper home view model module; relationship-backed context, counts, actions, and results are selected before rendering.
- `doc/roadmap.md`: no change unless screen schema becomes first-release scope.

## PRD status notes

- PRD drafted 2026-05-06 from architecture review.
- HVM-01 shipped 2026-05-06.
- HVM-01 added client view-model characterization tests for task, rate-card, and site primary home models.
- HVM-01 tests cover query tabs, count declarations, context relationship facts, related collection facts, result fields/columns, create defaults, and entity actions.
- HVM-01 changed no runtime behavior, source schemas, storage, sync, or generated UI.
- Evidence: `bun run test src/client/views.test.ts` passed 2026-05-06.
- Evidence: `bun run test` passed 2026-05-06.
- Evidence: `bun run check` passed 2026-05-06.
- No new decisions in HVM-01; HVM-D1 through HVM-D6 stand.
- No blockers.
- Blocks none.
- Depends on PRD 04 REL-06 for stable relationship-flow smoke evidence.
- HVM-02 shipped 2026-05-06.
- HVM-02 added `HomeCollectionConfig` and `HomeQueriesConfig` behind `HomeViewModel.collection`.
- HVM-02 resolves the default query tab in the model.
- HVM-02 keeps current top-level view-model aliases for the existing generated renderer.
- HVM-02 keeps relationship-backed context facts under `relatedCollection`; no separate context relationship copy.
- HVM-02 changed no schema syntax, generated UI behavior, storage, sync, or authority code.
- Evidence: `bun run test src/client/views.test.ts` passed 2026-05-06.
- Evidence: `bun run test` passed 2026-05-06.
- Evidence: `bun run check` passed 2026-05-06.
- No blockers.
- After HVM-02, next ready chunk was HVM-03.
- HVM-03 shipped 2026-05-06.
- HVM-03 changed `HomeCollection` to receive `HomeCollectionConfig` from `HomeViewModel.collection`.
- HVM-03 changed the home route to select query tabs, default query, result, context, and actions through `homeModel.collection`.
- HVM-03 updated generated collection tests to render through `model.collection`.
- HVM-03 changed no schema syntax, storage, sync, authority code, or generated visual behavior.
- Evidence: `bun run test src/app.test.tsx src/client/views.test.ts` passed 2026-05-06.
- Evidence: `bun run test` passed 2026-05-06.
- Evidence: `bun run check` passed 2026-05-06.
- No blockers.
- Next ready chunk: HVM-04.
