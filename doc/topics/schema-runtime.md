# Schema Runtime

Last updated: 2026-05-26

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
- Source seed records are stored-record shaped data, not stored change rows.
- Schema parser: `src/shared/schema.ts`.
- Schema types: `src/shared/schema-types.ts`.
- Schema parse helpers: `src/shared/schema-parse-helpers.ts`.
- Field parser: `src/shared/schema-fields.ts`.
- Icon catalog source: `src/shared/icon-catalog.ts`.
- Relationship parser: `src/shared/schema-relationships.ts`.
- View parser: `src/shared/schema-views.ts`.
- View field parser: `src/shared/schema-view-fields.ts`.
- Table view parser: `src/shared/schema-table-views.ts`.
- Union parser: `src/shared/schema-unions.ts`.
- Screen parser: `src/shared/schema-screens.ts`.
- Read-model parser: `src/shared/schema-read-models.ts`.
- Action parser: `src/shared/schema-actions.ts`.
- Mutation parser: `src/shared/schema-mutations.ts`.
- Schema parts: entities, relationships, queries, unions, read models, item views, table views, views, screens.
- Generic mutation policies cover `create`, `patch`, and `delete`.
- View types: `collection`, `create`, `edit`.
- Collection result types: `list`, `record`, `table`, `tree`.
- Result ordering parser: `src/shared/schema-ordering.ts`.
- Collection result ordering works for `list`, `table`, and `tree` results.
- Result ordering uses a non-integer number field, optional field scopes, and `moveMenu` or `dragHandle` presentations.
- Table view ordering remains compatibility input.
- Conflicting result-level and table-level ordering fails schema parsing.
- Tree results use a relationship, child reference field, child item view, optional branch variant policy, and optional composition actions.
- Tree branch variant policy can mark child variants as `leaf`.
- Tree branch variant policy can declare allowed child variants for add controls.
- Tree branch child options can declare literal placement values for composition actions.
- Tree branch variant policy requires the child item view to define a union.
- Collection context presentations: `tabs`, `listDetail`.
- Missing collection context presentation defaults to `tabs`.
- Edit view fields use field editors and commit policies.
- View fields can declare `visibleWhen` conditions keyed to field values.
- Table views can declare table-local actions and result ordering.
- Table action type: `editRecord`.
- Table action targets: row record and reference field target.
- Table utility column types: `invokeAction`, `orderingHandle`.
- Table ordering uses a numeric rank field, optional row-field scope, and `moveMenu` or `dragHandle` presentations.

## Schema Builder

- Schema Builder draft module: `src/client/schema-builder.ts`.
- Schema route draft module: `src/app/routes/schema-draft.ts`.
- Schema Builder emits normal app schema.
- Schema Builder save path uses the existing schema parser and schema save endpoint.
- Builder mode and Source mode edit the same local draft.
- Source mode is the raw JSON escape hatch.
- Invalid Source mode disables Builder and Save until JSON parses again.
- Builder can create entities.
- Builder-created entities get create and patch mutations enabled.
- Builder-created entities get a simple generated surface.
- Simple generated surface parts: all-records query, item view, create view, collection view, workspace screen.
- Builder can add text, boolean, date, number, enum, and reference fields.
- Builder can edit common field metadata.
- Builder can edit builder-owned create and inline field presentation.
- Builder preserves enum option presentation metadata when enum labels change.
- Builder editor options come from field behavior.
- Builder preserves source-owned advanced schema sections.
- Saved entity keys are locked in Builder.
- Saved field keys, field types, and reference targets are locked in Builder.

## Relationships

- App schemas can declare optional top-level `relationships`.
- Relationship kinds: `toOne`, `toMany`, `manyToMany`.
- Relationship metadata does not change stored record shape.
- `toOne` relationships point at stored reference fields.
- `toMany` relationships are inverse metadata over child reference fields.
- `manyToMany` relationships use explicit through entities and reference fields.
- `manyToMany.through.uniqueConstraint`, when present, must cover both through fields.
- One-to-one cardinality uses `toOne` plus an entity unique constraint.
- There is no separate one-to-one relationship kind.
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
- Screen paths are optional static app-relative paths.
- Screen paths start with `/`.
- Screen paths cannot use params, wildcards, or relative paths.
- Screen paths are unique inside one schema.
- Screen paths cannot be `/schema`.
- First pathless primary screen gets `/` when no explicit root screen exists.
- Screens with `navigation.primary` own route workspace selection when `screens` exists.
- Collection `navigation.primary` remains the fallback when `screens` is absent.
- Screen model selection: `src/client/views.ts`.
- Task source schema defines `screens.taskHome` at `/`.
- Estii source schema defines `screens.rateHome` at `/` and `screens.rateSetup` at `/setup`.
- Site source schema defines `screens.siteEditor` at `/` and `screens.siteSettings` at `/settings`.

## Unions

- App schemas can declare optional top-level `unions`.
- Entity unions are metadata over flat records.
- First discriminator kind is a required enum field on the union entity.
- Union variant keys match discriminator enum values.
- Union fallback covers discriminator enum values not listed as variants.
- Unions without fallback must define every discriminator enum value.
- Union variant `fields` and `requiredFields` reference fields on the same entity.
- Variant presentation lives on item, edit, and create views.
- Static view fields remain valid beside union variants.
- Hidden fields are not cleared when the active variant changes.
- Authority writes, storage, sync, and public Site tree output do not store separate union values.
- Site source schema defines `blockByType` over `block.type`.

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
- Create default resolver: `src/shared/create-defaults.ts`.
- Field behavior owns scalar validation, defaults, conversion, display, and editor metadata.
- Icon catalog entries are grouped as Interface, Social, and Providers.
- Icon catalog helpers list entries, list groups, find entries by key, and resolve SVG source.
- Icon catalog aliases keep `flag`, `priority-flag`, `check`, and `twitter` compatible.
- Field behavior exports create input conversion, inline input conversion, input attributes, display helpers, and editor controls.
- Generated field UI adapters consume field behavior control, default, required, and input-attribute facts in `src/app/generated/field-ui-adapters.ts`.
- Create views can declare hidden literal defaults for scalar fields.
- Date fields preserve `YYYY-MM-DD` values.
- Number fields store numbers.
- Text fields can use format metadata for generated editors and displays.
- Icon fields store SVG source as flat text values.
- Text field `editor: "icon"` selects the generated icon control.
- Text field `editor: "image"` selects the generated image upload control.
- Text field `editor: "media"` selects the generated media asset control.
- Icon, image, and media editor values stay text-backed field values.
- Enum values can carry `presentation.icon` and `presentation.color` token metadata.
- Known enum presentation icon tokens resolve through the icon catalog.
- Unknown enum presentation icon tokens stay unresolved for visible text fallback.
- View fields can carry `presentation` metadata.
- Create view fields can carry `presentation` metadata.
- Field and reference table columns can carry `presentation` metadata.
- `presentation.mode = "iconOnly"` requires an enum field.
- `presentation.mode = "completion"` requires a boolean field.
- `presentation.visibility = "valueOrInteraction"` requires an optional date field.
- Task source priority values declare flag/color presentation tokens.
- Task item view renders priority with `iconOnly`, done with `completion`, and due date with `valueOrInteraction`.

## Mutations

- Generic mutation ops: `create`, `patch`, `delete`.
- Delete mutation type: `DeleteMutation` in `src/shared/protocol.ts`.
- Delete mutation requests carry `mutationId`, `entity`, `op: "delete"`, and `recordId`.
- Delete mutation requests do not carry field values.
- Delete enablement uses `entity.mutations.delete.enabled`.
- Delete policy parsing and stringify behavior is covered in `src/shared/schema.test.ts`.

## Actions

- Schema action kind modules: `entityActionKindModules` in `src/shared/schema-actions.ts`.
- Worker action kind runtime modules: `entityActionKindRuntimeModules` in `src/worker/actions.ts`.
- Generated action UI modules: `entityActionUiModules` in `src/client/views.ts`.
- Generated action renderer consumes `action.ui` in `src/app/generated/actions.tsx`.
- Action kinds: `clear-completed`, `create-missing-join-records`, `create-selected-join-record`, `remove-selected-join-records`, `create-tree-child`, `remove-tree-placement`.
- Action kind capabilities expose after-create hook eligibility.
- `create-missing-join-records` fills matrix-like explicit join records from two queries.
- `create-selected-join-record` and `remove-selected-join-records` require a `manyToMany` relationship.
- Selected join creation writes the relationship through fields and uses existing field defaults for other required fields.
- Selected join removal tombstones explicit join records.
- `create-tree-child` creates one child record and one placement edge.
- `remove-tree-placement` tombstones the placement edge and leaves the child record.

## Key Tests

- Schema parser tests: `src/shared/schema.test.ts`.
- Schema app tests: `src/shared/schema-apps.test.ts`, `src/worker/schema-apps.test.ts`.
- Query tests: `src/shared/query.test.ts`.
- Read-model tests: `src/shared/read-model.test.ts`.
- Field behavior tests: `src/shared/field-types.test.ts`.
- Create defaults tests: `src/shared/create-defaults.test.ts`.
- Result ordering tests: `src/shared/result-ordering.test.ts`.
- Table schema tests: `src/shared/schema-table-views.test.ts`.
- View model tests: `src/client/views.test.ts`.
- Table model tests: `src/client/table-model.test.ts`.
- Schema Builder tests: `src/client/schema-builder.test.ts`.
- Icon catalog tests: `src/shared/icon-catalog.test.ts`.
