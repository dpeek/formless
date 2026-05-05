# PRD 04: Relationship model

Status: ready
Current chunk: REL-04 generated related collections
Last updated: 2026-05-06

## Goal

Make relationships between entities first-class schema concepts.

The first version should:

- keep records flat;
- keep direct references as scalar fields;
- name inverse and many-side relationships in schema data;
- use explicit join entities for many-to-many;
- keep authority validation generic;
- make generated views easier to define for related records.

This PRD is about schema/runtime relationship support, not about one app's domain model.

## Problem

Formless already supports direct reference fields.

That covers the child-side relationship:

- `rate.resource` references `resource`.
- `rate.card` references `card`.
- `contentItem.author` references `person`.
- `contentPlacement.parent` references `contentItem`.

The missing shape is the parent-side relationship.

Schema authors need to say:

- a card has many rates;
- a resource has many rates;
- a content item has many placements;
- a nav section has many nav items;
- a card has many resources through rates;
- a resource has many cards through rates;
- these are inverses of existing reference fields, not duplicated stored data.

Without named relationships, every inverse is rebuilt by hand with queries, context defaults, labels, and generated collection views.

## Estii exploration notes

Source:

- Browser sandbox: `https://app.estii.local/estii`, explored 2026-05-05.
- Estii code/docs: `/Users/dpeek/code/estii`.
- Domain docs: `doc/domain/features.md`, `doc/domain/roles-and-rate-cards.md`, `doc/domain/streams.md`, `doc/domain/products.md`, `doc/domain/scoping.md`, `doc/domain/schedules.md`, `doc/domain/proposals.md`.
- Code anchors: `packages/lib/src/deal/schema.ts`, `packages/lib/src/deal/query.ts`, `packages/lib/src/resource/schema.ts`.

Patterns visible in Estii:

| Pattern                   | Estii evidence                                                                                  | Formless implication                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Record-scoped workspaces  | Deal route has Overview, Estimate, Scope, Schedule, Proposal, Settings tabs.                    | Views need route/context state, selected records, tab sets, and mode switches.                                   |
| Ordered relationship tree | Deal -> Phase -> Category -> Section -> Feature -> Task -> Estimate.                            | Relationship metadata must name ordered child collections over flat records.                                     |
| Contextual create/edit    | Add item under a section, add line item under a feature, assign resource.                       | Related create actions need hidden defaults from selected parent context.                                        |
| Join records with payload | Streams use allocation rows; rate cards use role/card rates; estimates link resources to tasks. | Many-to-many support must keep explicit join entities because joins carry quantities, flags, and pricing fields. |
| Variant entity behavior   | `resource.kind`, product `model`, category `allow_fixed`, estimate `period`.                    | Schema needs enum-driven view variants and capability gates after relationship metadata exists.                  |
| Derived read models       | Budget, scope, schedule, forecasts, and proposal are computed from records.                     | Keep derived metrics/query outputs host-side; do not store inverse counts or aggregate rows.                     |
| Grouped analytic views    | Pipeline columns, scope breakdowns, forecast filters, schedule resource groups.                 | Table/list views need declarative grouping, sorting, filters, and summary metrics.                               |
| Editable projections      | Resource tables and estimate rows mix inputs, selectors, derived totals, chips.                 | Generated views need editable cells plus read-only computed cells in the same row.                               |
| Document assembly         | Proposal deck is built from deal stats, category flags, themes, and params.                     | Later view definitions should describe output sections over query/stat data, not custom page code.               |
| Library snapshot drift    | Deals snapshot roles/cards/products and surface update drift.                                   | Later app schemas may need library-to-instance snapshot/update workflows; not in REL-01.                         |

Important translation:

- Estii sometimes stores nested arrays, such as `resource.rates`.
- Formless should translate those as flat records, such as `rate(resource, card)`.
- The user-facing pattern is the same matrix; the persisted shape stays flat.

Implications for this PRD:

- REL-01 should stay narrow: parse and validate optional relationship metadata only.
- Relationship definitions should leave room for ordered children, labels, inverse names, through aliases, and generated create defaults.
- Relationship metadata is necessary for Estii-shaped apps, but not enough by itself.
- Follow-on PRDs should cover workspace layout, grouped table views, variant forms, derived metrics, charts, and document/output views.

## Current support map

### To-one reference fields

Status: shipped.

Evidence:

- Schema type: `ReferenceFieldSchema` in `src/shared/schema-types.ts`.
- Schema parser: `src/shared/schema-fields.ts`.
- Authority validation: `validateRecordValues` in `src/worker/authority.ts`.
- Field behavior: `reference` in `src/shared/field-types.ts`.
- Reference editors: `src/app/generated/create.tsx`, `src/app/generated/record-field-editor.tsx`.
- Reference options: `src/client/store.ts`.

Current behavior:

- A field can declare `{ "type": "reference", "to": "entityName" }`.
- References can be required or optional.
- `displayField` can point at a text field on the target entity.
- Authority create validates referenced record existence.
- Authority patch validates referenced record existence.
- Referenced records must belong to the declared target entity.
- Tombstoned targets are rejected.
- Schema updates cannot change an existing reference target.
- Query equality works on reference fields.

### One-to-one

Status: partly supported.

Current behavior:

- A required or optional reference field can express the direct link.
- A `unique` constraint on that reference field can enforce at most one active source record per target.

Missing behavior:

- No relationship metadata names the inverse.
- No generated UI knows that the target side is singular.
- No delete or cascade policy exists.

### Many-to-one

Status: shipped as direct references.

Current behavior:

- Many source records can point at one target record unless a unique constraint prevents it.
- This is how `rate.card`, `rate.resource`, `navItem.section`, and `contentPlacement.parent` work.

Missing behavior:

- The target side has no named `hasMany` relationship.
- Schema authors must hand-write the inverse query and collection context.

### One-to-many inverse

Status: partly supported through queries and collection context.

Evidence:

- Context query values: `QueryDynamicValue = { kind: "context"; name }` in `src/shared/query.ts`.
- Collection context: `CollectionContextSchema` in `src/shared/schema-types.ts`.
- Context validation: `validateCollectionQueryContextRequirements` in `src/shared/schema-views.ts`.
- Scoped create defaults: `CreateDefaultValueSchema` and `resolveCreateValues`.
- Site examples: `navItemsForSelectedSection`, `placementsForSelectedContent`.
- Rate-card example: `ratesForSelectedCard`.

Current behavior:

- A collection can choose a context record.
- A query can filter child records where a reference field equals the selected context value.
- A create view can hide that reference field and default it from context.

Missing behavior:

- The relationship is implicit.
- The same inverse shape has to be repeated across `queries`, `views`, and `defaults`.
- Generated UI cannot list all relationships for one entity.
- There is no reusable relationship name for counts, related panels, schema editor help, or later query builders.

### Many-to-many

Status: partly supported through explicit join records.

Evidence:

- `rate` is a join record for `resource` and `card` in `schema/apps/rates/schema.json`.
- `rate.uniqueRatePair` enforces one active pair.
- `rate.regenerateMissingRates` uses `create-missing-join-records`.
- `create-missing-join-records` lives in `src/shared/schema-actions.ts` and `src/worker/actions.ts`.

Current behavior:

- A join entity can hold two required reference fields.
- A unique constraint can enforce one active join record per pair.
- A generic action can create missing join records for all pairs from two queries.
- Join records can hold relationship attributes such as cost, unit, price, currency, label, order, or visibility.

Missing behavior:

- The many-to-many relationship itself is not named.
- The two inverse many-to-many directions are not named.
- Generated UI works with the join records, not a declared relationship.
- There is no generic add/remove related item action.
- There is no relationship-level policy for whether all pairs should exist, only selected pairs should exist, or joins should be created on demand.

## Requirements

### Data model

- Records stay flat.
- Do not add array fields for relationships.
- Do not materialize inverse values on parent records.
- A to-one relationship stays a reference field.
- A one-to-many relationship is the inverse of a reference field.
- A many-to-many relationship uses an explicit join entity.
- Join entities remain normal entities with fields, views, mutations, constraints, and actions.

### Schema API

- Add a top-level relationship registry.
- Relationship names must be stable schema keys.
- Relationship definitions must validate against entities, fields, queries, views, and constraints.
- Relationship metadata must not change stored record shape.
- Existing schemas without `relationships` must keep parsing.
- Source app schemas can adopt relationships incrementally.

### Runtime behavior

- Authority remains the source of referential integrity.
- Direct reference validation stays on create and patch.
- Existing unique constraints keep enforcing one-to-one and unique join pairs.
- Relationship metadata can drive generated view models, but storage must not depend on it.
- Relationship selectors must ignore tombstoned records through existing query/store behavior.

### Generated UI

- Generated views should be able to show related collections from relationship metadata.
- A relationship-backed create action should default the linking reference field from the selected parent context.
- Relationship labels should drive UI copy where a view does not override them.
- Relationship counts should remain derived host values, not stored aggregates.
- Existing collection views must keep working.

### Query and view authoring

- Existing explicit query expressions stay valid.
- A to-many relationship should be able to validate that a collection context and query match its inverse reference field.
- A later shorthand may generate the inverse query from the relationship definition.
- Many-to-many views should start by showing join records.
- Direct target lists through many-to-many can come later after query traversal exists.

## Proposed schema shape

Add `relationships` next to `entities`, `queries`, `itemViews`, `tableViews`, and `views`.

```json
{
  "relationships": {
    "rateCard": {
      "kind": "toOne",
      "label": "Rate card",
      "from": {
        "entity": "rate",
        "field": "card"
      },
      "to": {
        "entity": "card"
      },
      "inverse": "cardRates"
    },
    "cardRates": {
      "kind": "toMany",
      "label": "Rates",
      "from": {
        "entity": "card"
      },
      "to": {
        "entity": "rate",
        "field": "card"
      },
      "inverse": "rateCard"
    },
    "cardResources": {
      "kind": "manyToMany",
      "label": "Resources",
      "from": {
        "entity": "card"
      },
      "to": {
        "entity": "resource"
      },
      "through": {
        "entity": "rate",
        "fromField": "card",
        "toField": "resource",
        "uniqueConstraint": "uniqueRatePair"
      },
      "inverse": "resourceCards"
    }
  }
}
```

Rules:

- `toOne.from.field` must be a reference field.
- `toOne.to.entity` must match that reference field's `to`.
- `toMany.to.field` must be a reference field.
- `toMany.to.field` must reference `toMany.from.entity`.
- `toOne.inverse` and `toMany.inverse` must point at each other when both are present.
- `manyToMany.through.entity` must exist.
- `manyToMany.through.fromField` must reference `from.entity`.
- `manyToMany.through.toField` must reference `to.entity`.
- `manyToMany.through.uniqueConstraint` is optional but recommended.
- If `uniqueConstraint` is present, it must cover the two through fields.
- A self relationship is valid if the same entity appears on both sides.

## Relationship kinds

### `toOne`

Meaning: one source record stores one target record ID.

Storage:

- Stored as the source entity reference field.

Examples:

- `rate.card`.
- `rate.resource`.
- `contentItem.author`.
- `person.avatar`.

First-class support needed:

- schema relationship metadata;
- inverse link validation;
- generated labels;
- schema editor awareness.

### `toMany`

Meaning: one target record has many source records through a source reference field.

Storage:

- Not stored.
- Evaluated as child records where `child.referenceField == parent.id`.

Examples:

- `card.rates` inverse of `rate.card`.
- `resource.rates` inverse of `rate.resource`.
- `navSection.items` inverse of `navItem.section`.
- `contentItem.placements` inverse of `contentPlacement.parent`.

First-class support needed:

- relationship metadata;
- collection context validation;
- related collection model selection;
- create default from parent context;
- derived counts.

### `oneToOne`

Meaning: one source record points at one target record, and at most one active source record can point at the same target.

Storage:

- Same as `toOne`.
- Enforced by a unique constraint on the source reference field.

Schema expression:

- Do not add a separate field type.
- Use `toOne` relationship metadata plus a unique constraint.

First-class support needed:

- parser helper that can recognize the unique constraint;
- generated UI hint that the inverse is singular;
- later delete policy if deletes become enabled.

### `manyToMany`

Meaning: two entities are connected through a join entity.

Storage:

- Stored as explicit join records.
- Join records can carry relationship attributes.

Examples:

- `card.resources` through `rate`.
- `resource.cards` through `rate`.
- Future `contentItem.tags` through a `contentTag` join entity.

First-class support needed:

- relationship metadata;
- join field validation;
- unique-pair validation helper;
- generated related join-record collections;
- later add/remove actions.

## Decisions

| ID      | Decision                                                                                         | Reason                                                                              | Evidence                                                             |
| ------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| REL-D1  | Keep relationship data flat.                                                                     | Flat records are a core project rule and match existing source schemas.             | `doc/overview.md`, `doc/current.md`, `schema/apps/rates/schema.json` |
| REL-D2  | Keep `reference` as the only stored to-one primitive.                                            | It is already parsed, validated, queried, edited, and smoke-tested.                 | `src/shared/schema-types.ts`, `src/worker/authority.ts`              |
| REL-D3  | Add a top-level `relationships` registry instead of inferring everything.                        | Inverse names, labels, order, UI hints, and through aliases need names.             | `schema/apps/rates/schema.json`, `schema/apps/site/schema.json`      |
| REL-D4  | Model one-to-many as inverse metadata over a child reference field.                              | Parent arrays would duplicate state and break the flat-record rule.                 | `src/shared/query.ts`, `src/shared/schema-views.ts`                  |
| REL-D5  | Model many-to-many through explicit join entities.                                               | Join records can hold attributes and already power the rate-card app.               | `rate` entity, `create-missing-join-records`, `uniqueRatePair`       |
| REL-D6  | Treat one-to-one as to-one plus a unique constraint.                                             | Cardinality is a constraint, not a new persisted field type.                        | `src/worker/constraints.ts`, `src/shared/schema-fields.ts`           |
| REL-D7  | Show join records first for many-to-many UI.                                                     | Traversing directly to target records needs query traversal work.                   | Current query support is direct field equality only.                 |
| REL-D8  | Keep relationship counts derived in the host.                                                    | Counts already work as query-derived display values.                                | `src/client/store.ts`, `src/client/views.ts`                         |
| REL-D9  | Do not add cascade behavior in this PRD.                                                         | Delete is disabled today and relationship metadata should not imply it.             | `doc/current.md`, `EntityMutationPolicy.delete`                      |
| REL-D10 | Keep REL-01 to metadata parsing after Estii exploration.                                         | Estii proves broader app patterns, but parser support is still the next safe slice. | Estii exploration notes, `packages/lib/src/deal/schema.ts`           |
| REL-D11 | Treat workspace layout, grouped analytics, variant forms, and proposal output as follow-on PRDs. | Those patterns need more than relationship metadata and would blur this PRD.        | Estii exploration notes                                              |

## Chunks

| ID     | Status  | Depends on | Main files                                                                              | Acceptance                                                                  |
| ------ | ------- | ---------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| REL-01 | shipped | none       | `src/shared/schema-types.ts`, `src/shared/schema.ts`, `src/shared/schema.test.ts`       | Schemas can declare validated `toOne`, `toMany`, and `manyToMany` metadata. |
| REL-02 | shipped | REL-01     | `schema/apps/rates/schema.json`, `schema/apps/site/schema.json`, source schema tests    | Rates and site source schemas name their existing relationships.            |
| REL-03 | shipped | REL-02     | `src/client/views.ts`, `src/shared/schema-views.ts`, `src/client/views.test.ts`         | Collection contexts can be validated against relationship metadata.         |
| REL-04 | ready   | REL-03     | `src/app/generated/collection.tsx`, `src/client/store.ts`, `src/app.test.tsx`           | Generated UI can show relationship-backed related collections and counts.   |
| REL-05 | planned | REL-04     | `src/shared/schema-actions.ts`, `src/worker/actions.ts`, `src/worker/authority.test.ts` | Many-to-many join helpers support add missing, add selected, and remove.    |
| REL-06 | planned | REL-05     | Browser Use, source schemas, PRD promote notes                                          | Relationship flows are smoke-tested in rates and site apps.                 |

## Chunk details

### REL-01 relationship registry

Goal: parse and validate relationship metadata without changing runtime behavior.

Tasks:

- Add relationship schema types.
- Parse optional top-level `relationships`.
- Validate relationship names are non-empty.
- Validate `toOne` reference fields.
- Validate `toMany` inverse reference fields.
- Validate reciprocal `inverse` pointers.
- Validate `manyToMany` through entities and fields.
- Validate optional many-to-many unique constraints.
- Add parser tests for valid rates-shaped relationships.
- Add parser tests for malformed targets, fields, inverse links, and constraints.

Acceptance:

- Existing schemas parse unchanged.
- A rates-shaped relationship registry parses.
- Bad to-one target fails.
- Bad to-many inverse field fails.
- Bad many-to-many through field fails.
- Bad reciprocal inverse fails.
- `bun run test` passes.
- `bun run check` passes.

### REL-02 source schema adoption

Goal: name existing relationships in source schemas.

Tasks:

- Add relationships to `schema/apps/rates/schema.json`.
- Add relationships to `schema/apps/site/schema.json`.
- Keep existing queries and views unchanged.
- Add source schema tests proving both schemas parse.

Acceptance:

- `rate.card`, `rate.resource`, `card.rates`, `resource.rates`, `card.resources`, and `resource.cards` are named.
- `navSection.navItems` and `contentItem.placements` are named.
- No stored data shape changes.
- `bun run test` passes.
- `bun run check` passes.

### REL-03 relationship-aware collection validation

Goal: connect named relationships to existing scoped collections.

Tasks:

- Add optional relationship reference to collection context or query slot.
- Validate the collection entity and context entity match the relationship.
- Validate the selected query filters the child reference field against the context value.
- Validate create defaults use the same relationship field.
- Keep explicit query expressions working.

Acceptance:

- `rateHome` can identify `cardRates` as its backing relationship.
- `contentCompositionHome` can identify `contentPlacements` as its backing relationship.
- Bad context/query relationship pairings fail schema parsing.
- Existing views still work without relationship metadata.
- `bun run test` passes.
- `bun run check` passes.

### REL-04 generated related collections

Goal: let generated UI expose related records from relationship metadata.

Tasks:

- Select related relationship models for an entity.
- Add derived counts for related collections.
- Render related collection affordances without storing parent-side values.
- Reuse existing collection/table/create components.
- Keep one selected context value as the first UI path.

Acceptance:

- Selecting a card can show related rates through `cardRates`.
- Selecting a nav section can show related nav items through `sectionNavItems`.
- Creating a related child hides the parent reference and defaults it from context.
- Counts update from local records.
- Browser smoke covers rates and site relationship flows.
- `bun run test` passes.
- `bun run check` passes.

### REL-05 many-to-many join helpers

Goal: make many-to-many authoring less rate-card-specific while keeping join records explicit.

Tasks:

- Generalize selected-pair join creation.
- Add an action shape for creating one join record from two selected endpoints.
- Add an action shape for tombstoning selected join records after delete semantics exist or a join-remove action is explicitly allowed.
- Preserve `create-missing-join-records` for matrix-like relationships.
- Keep unique-pair constraints authority-enforced.

Acceptance:

- Rate-card matrix regeneration keeps working.
- A many-to-many relationship can create a selected join record without source-specific code.
- Duplicate active join pairs are rejected.
- Missing or tombstoned endpoints are rejected.
- `bun run test` passes.
- `bun run check` passes.

## Non-goals

- Do not add array-valued relationship fields.
- Do not persist inverse relationship values.
- Do not add cross-app references.
- Do not add polymorphic references.
- Do not add cascade delete.
- Do not add a graph query engine.
- Do not traverse arbitrary relationship paths in queries.
- Do not hide join records for many-to-many relationships in the first UI version.
- Do not add permissions or ownership rules.
- Do not change source seed record shape.

## Open questions

- Should relationship-backed collection views use a `relationship` key on `context`, on `query` slots, or both?
- Should one-to-one inverse UI be a related item panel, a link field, or a constrained collection with max one row?
- Should many-to-many direct target lists wait for a broader query traversal PRD?
- Should relationship metadata define display order for generated entity detail pages?
- Should relationship metadata name a default `order` field, or should order remain only on the query/view definition?
- Should related create defaults live on relationships, create views, or both?
- Should enum-driven variants be a view feature, a field feature, or a separate schema concept?

## Promote after ship

- `doc/current.md`: add top-level relationship registry support. REL-01 shipped facts: `AppSchema.relationships` is optional; `toOne`, `toMany`, and `manyToMany` metadata parse in `src/shared/schema-relationships.ts`; metadata does not change stored record shape.
- `doc/current.md`: list source app relationships after REL-02 ships. REL-02 shipped facts: rates source names `rateCard`, `cardRates`, `rateResource`, `resourceRates`, `cardResources`, and `resourceCards`; site source names `contentPrimaryMedia`, `mediaPrimaryContentItems`, `placementParent`, `contentPlacements`, `placementItem`, `itemPlacements`, `placementMedia`, and `mediaPlacements`; queries, views, records, and storage shape are unchanged.
- `doc/current.md`: list relationship-backed collection context validation after REL-03 ships. REL-03 shipped facts: collection contexts can set `relationship` to a `toMany` relationship; parser validates the relationship from entity, target entity, context query field, and context create default field; `rateHome` uses `cardRates`; `contentCompositionHome` uses `contentPlacements`; client view models expose relationship name and metadata.
- `doc/current.md`: describe relationship-backed generated related collections after REL-04 ships.
- `doc/roadmap.md`: add first-release relationship scope only if this PRD becomes release-blocking.

## PRD status notes

- PRD created 2026-05-05.
- Estii browser and code exploration captured 2026-05-05.
- REL-01 shipped 2026-05-06.
- REL-01 added optional top-level relationship metadata only.
- REL-01 parser validates relationship names, reference fields, inverse pointers, through fields, and through unique constraints.
- REL-01 tests cover valid rates-shaped relationships and malformed targets, fields, inverse links, and constraints.
- REL-01 changed no storage, seed, sync, authority, or generated UI behavior.
- No new decisions in REL-01; REL-D3, REL-D4, and REL-D5 stand.
- No blockers.
- Global doc promotion is pending for REL-01 in a docs/steward pass.
- Current source apps already prove the storage model.
- Estii proves this PRD is necessary but not sufficient for full app generation.
- REL-02 should adopt relationship metadata in source schemas without changing queries or views.
- UI behavior should wait until source schemas name relationships.
- Keep later Estii-shaped work in follow-on PRDs unless the user explicitly broadens this PRD.
- Done pass 2026-05-06: Estii exploration is captured; PRD remains ready; no blockers.
- Done pass 2026-05-06: REL-01 stopped cleanly; tests and check pass; no blockers.
- REL-02 shipped 2026-05-06.
- REL-02 added relationship metadata to rates and site source schemas only.
- REL-02 source parser tests assert the rates and site relationship registries.
- REL-02 changed no queries, views, seed records, storage, sync, authority, or generated UI behavior.
- Site app has no `navSection` or `navItem`; `contentPlacements` names the current content-item-to-placement inverse.
- No new decisions in REL-02; REL-D3, REL-D4, and REL-D5 stand.
- No blockers.
- Done pass 2026-05-06: REL-02 stopped cleanly; tests and check pass; no blockers.
- REL-03 shipped 2026-05-06.
- REL-03 added optional `context.relationship` on collection views.
- REL-03 relationship-backed contexts require a `toMany` relationship.
- REL-03 parser validates context entity, collection entity, child query context predicate, and context create default field against the relationship.
- REL-03 wired rates `rateHome` to `cardRates`.
- REL-03 wired site `contentCompositionHome` to `contentPlacements`.
- REL-03 client home view models expose relationship name and metadata for scoped contexts.
- REL-03 changed no storage, seed record, sync, authority, or UI rendering behavior.
- REL-03 tests cover valid relationship-backed contexts, bad relationship names/kinds/entities, bad query fields, bad create default fields, and source view model selection.
- Browser smoke not run for REL-03 because the chunk changes schema validation and view model metadata only.
- No new decisions in REL-03; REL-D3 and REL-D4 stand.
- No blockers.
- Done pass 2026-05-06: REL-03 stopped cleanly; tests and check pass; no blockers.
