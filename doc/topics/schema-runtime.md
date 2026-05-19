# Schema Runtime

Last updated: 2026-05-19

## Current Facts

- App schema is runtime data.
- Source schema files live under `schema/apps/<key>/schema.json`.
- Source seed files live under `schema/apps/<key>/seed-records.json`.
- Current schema keys: `tasks`, `estii`, `site`.
- Task source: `schema/apps/tasks/schema.json`.
- Task seed: `schema/apps/tasks/seed-records.json`.
- Estii source: `schema/apps/estii/schema.json`.
- Estii seed: `schema/apps/estii/seed-records.json`.
- Site source: `schema/apps/site/schema.json`.
- Site seed: `schema/apps/site/seed-records.json`.
- Source app registry: `src/shared/schema-apps.ts`.
- Worker source parsing: `src/worker/schema-apps.ts`.
- Schema parser: `src/shared/schema.ts`.
- Schema types: `src/shared/schema-types.ts`.
- Schema parse helpers: `src/shared/schema-parse-helpers.ts`.
- Field parser: `src/shared/schema-fields.ts`.
- Relationship parser: `src/shared/schema-relationships.ts`.
- View parser: `src/shared/schema-views.ts`.
- Table view parser: `src/shared/schema-table-views.ts`.
- Screen parser: `src/shared/schema-screens.ts`.
- Read-model parser: `src/shared/schema-read-models.ts`.
- Action parser: `src/shared/schema-actions.ts`.
- Mutation parser: `src/shared/schema-mutations.ts`.
- Schema parts: entities, relationships, queries, read models, item views, table views, views, screens.

## Relationships

- App schemas can declare optional top-level `relationships`.
- Relationship kinds: `toOne`, `toMany`, `manyToMany`.
- Relationship metadata does not change stored record shape.
- Collection contexts can name a `toMany` relationship.
- Relationship-backed context queries validate against relationship fields.
- Client view models expose relationship context facts.
- Related context counts derive from local records.
- Estii source relationships: `rateCard`, `cardRates`, `rateResource`, `resourceRates`, `cardResources`, `resourceCards`.
- Site source relationships: `placementParent`, `blockPlacements`, `placementBlock`, `blockUsedInPlacements`.

## Screens

- Top-level `screens` are optional.
- Screen type: `workspace`.
- Screen layout type: `stack`.
- Screen sections type: `collection`.
- Screen sections reference existing collection views.
- Screens with `navigation.primary` own route workspace selection when `screens` exists.
- Collection `navigation.primary` remains the fallback when `screens` is absent.
- Screen model selection: `src/client/views.ts`.
- Task source schema defines `screens.taskHome`.
- Estii source schema defines `screens.rateHome` and non-primary `screens.rateSetup`.
- Site source schema defines `screens.siteEditor` and `screens.siteSettings`.

## Read Models

- App schemas can declare optional `readModels.computedValues`.
- App schemas can declare optional `readModels.aggregates`.
- Read-model evaluator: `src/shared/read-model.ts`.
- Computed values are read-only display values over flat records.
- Computed values use numeric field, literal, and binary expressions.
- Invalid numeric evaluation returns empty output.
- Aggregates are read-only display values over query results.
- Aggregate functions: count, sum, average, min, max.
- Empty count and sum render `0`.
- Empty average, min, and max render empty output.
- Runtime bad aggregate values are skipped.
- Table views can declare computed columns with `type: "computed"`.
- Collection views can declare aggregate summary slots with `type: "aggregate"`.
- Collection table results can declare aggregate footer slots.
- Authority writes, storage, sync, and mutation paths do not store read-model values.

## Field Behavior

- Field behavior module: `src/shared/field-types.ts`.
- Field behavior owns scalar validation, defaults, conversion, display, and editor metadata.
- Date fields preserve `YYYY-MM-DD` values.
- Number fields store numbers.
- Text fields can use format metadata for generated editors and displays.
- Icon fields store SVG source as flat text values.

## Actions

- Action parser dispatches by action kind in `src/shared/schema-actions.ts`.
- Action runtime dispatches by action kind in `src/worker/actions.ts`.
- Action UI facts dispatch by action kind in `src/client/views.ts`.
- Action kinds: `clear-completed`, `create-missing-join-records`, `create-selected-join-record`, `remove-selected-join-records`.
- Action kind capabilities expose after-create hook eligibility.

## Key Tests

- Schema parser tests: `src/shared/schema.test.ts`.
- Schema app tests: `src/shared/schema-apps.test.ts`, `src/worker/schema-apps.test.ts`.
- Query tests: `src/shared/query.test.ts`.
- Read-model tests: `src/shared/read-model.test.ts`.
- Field behavior tests: `src/shared/field-types.test.ts`.
- Create defaults tests: `src/shared/create-defaults.test.ts`.
- Table schema tests: `src/shared/schema-table-views.test.ts`.
