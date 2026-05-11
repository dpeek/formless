# PRD 21: View result ordering

Status: ready
Current chunk: VRO-02
Last updated: 2026-05-11

## Goal

Make ordering a generic collection result capability instead of a table-only feature.

The first slice should:

- keep records flat;
- keep table ordering behavior working for existing schemas;
- move ordering facts toward collection result models;
- share sparse rank planning, scope checks, drag facts, and patch submission across result renderers;
- let table, tree, and list presentations opt into the same ordering contract;
- add drag-and-drop support to non-table collection results where sibling order is meaningful;
- keep storage, authority, sync, and protocol shape unchanged.

This PRD is about generated view behavior over flat records. It is not about nested storage, batch mutations, tree reparenting, boards, or generalized layout.

## Problem Statement

Generated tables already support row ordering, but the support is only partly generic.

Current behavior:

- Table views can declare `ordering`.
- Table ordering uses sparse numeric ranks.
- Table ordering can render move menu controls and drag handles.
- Table drag reorder uses `@dnd-kit/react`.
- Shared rank helpers live outside the table renderer.
- Collection result models can carry an `ordering` fact for tables and trees.
- Tree results infer placement ordering from an `order` field convention.
- Tree results render up/down placement controls, not drag-and-drop.
- List results have no ordering support.

This leaves Formless with two concepts mixed together:

- ordering as data behavior over a flat entity result set;
- table-specific rendering of ordering controls.

The runtime needs the first concept to become generic so collection result presentations can reuse it without duplicating table assumptions.

## Solution

Add a generic view-result ordering model.

Collection results should be able to declare ordering directly. The ordering model should resolve a numeric rank field, optional scope fields, presentations, permissions, ordered record ids, drag facts, and patch plans through one shared path.

Table rendering should keep current behavior by consuming the generic ordering model. Existing table view ordering remains accepted as compatibility input.

Tree rendering should stop relying on an implicit `order` field convention for new schema behavior. Site tree results should declare ordering explicitly and use shared ordering helpers for sibling move and drag reorder.

List rendering should gain the same basic ordered rendering and drag reorder affordance when a list result declares ordering.

## Source Map

Existing anchors:

- Current runtime docs: `doc/current.md`.
- Release target docs: `doc/roadmap.md`.
- Table actions and ordering PRD: `prd/14-table-actions-and-ordering.md`.
- Post-table architecture PRD: `prd/16-post-tao-architecture-efficiency.md`.
- Site editor root nav and tree PRD: `prd/19-site-editor-root-nav-and-tree.md`.
- Schema types: `src/shared/schema-types.ts`.
- General view parser: `src/shared/schema-views.ts`.
- Table view parser: `src/shared/schema-table-views.ts`.
- Shared ordering rank helpers: `src/shared/table-ordering.ts`.
- View and screen model selection: `src/client/views.ts`.
- Table result model: `src/client/table-model.ts`.
- Generated collection renderer: `src/app/generated/collection.tsx`.
- Generated table renderer: `src/app/generated/table.tsx`.
- Generated table ordering helper: `src/app/generated/table-ordering-ui.ts`.
- Generated tree renderer: `src/app/generated/tree.tsx`.
- Sync client mutations: `src/client/sync.ts`.
- Site source schema: `schema/apps/site/schema.json`.
- Schema parser tests: `src/shared/schema.test.ts`.
- Table parser tests: `src/shared/schema-table-views.test.ts`.
- View model tests: `src/client/views.test.ts`.
- Table model tests: `src/client/table-model.test.ts`.
- Shared ordering tests: `src/shared/table-ordering.test.ts`.
- Generated table tests: `src/app/generated/table.test.tsx`.
- App tests: `src/app.test.tsx`.

Owned files:

- `prd/21-view-result-ordering.md`.

Likely changed files:

- `src/shared/schema-types.ts`.
- `src/shared/schema-views.ts`.
- `src/shared/schema-table-views.ts`.
- `src/shared/schema.test.ts`.
- `src/shared/table-ordering.ts` or successor generic module.
- `src/shared/table-ordering.test.ts` or successor generic tests.
- `src/client/views.ts`.
- `src/client/table-model.ts`.
- new client ordering model helper if extraction improves locality.
- `src/client/views.test.ts`.
- `src/client/table-model.test.ts`.
- `src/app/generated/collection.tsx`.
- `src/app/generated/table.tsx`.
- `src/app/generated/table-ordering-ui.ts` or successor generic module.
- `src/app/generated/tree.tsx`.
- generated list ordering helper if extraction improves locality.
- `src/app/generated/table.test.tsx`.
- `src/app.test.tsx`.
- `schema/apps/site/schema.json`.

## User Stories

1. As a schema author, I want ordering to be declared on a collection result, so that ordering applies to the result presentation rather than only to tables.
2. As a schema author, I want existing table ordering declarations to keep working, so that shipped schemas do not break.
3. As a schema author, I want bad ordering fields to fail during schema parsing, so that generated views do not render broken move controls.
4. As a schema author, I want ordering scope fields to be explicit, so that records cannot move across unrelated groups.
5. As a Site author, I want to drag sibling placements in the tree, so that reordering page sections feels direct.
6. As a Site author, I want Header and Footer sibling placement ordering to use the same behavior as page placement ordering, so that navigation editing is consistent.
7. As a Site author, I want tree drag reorder to reject cross-parent moves, so that dragging cannot accidentally reparent content.
8. As a Site author, I want move controls to remain available where drag is awkward, so that keyboard and precise ordering workflows still work.
9. As a table user, I want current row drag handles to keep working, so that table behavior does not regress.
10. As a table user, I want current row action dropdown ordering controls to keep working, so that move menu behavior does not regress.
11. As a list user, I want ordered lists to render in rank order, so that item order is stable outside tables.
12. As a list user, I want optional drag handles for list items, so that simple ordered collections do not need a table view.
13. As a runtime developer, I want sparse rank calculation in one shared module, so that table, tree, and list reordering use the same patch plan.
14. As a runtime developer, I want drag group and scope facts in one shared module, so that cross-scope moves are guarded consistently.
15. As a runtime developer, I want patch submission and sync status wording localized behind a small interface, so that renderers do not duplicate mutation plumbing.
16. As a runtime developer, I want table-specific columns to stay table-specific, so that generic ordering does not pull table utility columns into list or tree code.
17. As a runtime developer, I want generated DnD code to stay in generated app modules, so that shared UI primitives remain presentation-neutral.
18. As a runtime developer, I want authority, storage, and sync to remain unchanged, so that ordering is still ordinary generic patch behavior.
19. As a future view author, I want the ordering model to be independent of table rows, so that board or grouped-result work can reuse the data behavior later.
20. As a future agent, I want docs and PRD notes to name the generic ordering modules, so that later work does not reintroduce table-only assumptions.

## Implementation Decisions

| ID      | Decision                                                                    | Reason                                                                             | Evidence                                                                        |
| ------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| VRO-D1  | Treat ordering as a collection result capability.                           | Tables, trees, and lists all render ordered record sets.                           | Current `HomeResultConfig` already carries ordering for table and tree results. |
| VRO-D2  | Keep table view ordering as compatibility input.                            | Existing table schemas should parse and render unchanged.                          | PRD 14 shipped `tableViews.*.ordering`.                                         |
| VRO-D3  | Prefer result-level ordering for new schemas.                               | Collection views own scope, query, context, and result selection.                  | PRD 16 keeps collection views as scope/query/context controllers.               |
| VRO-D4  | Reject conflicting table-level and result-level ordering declarations.      | Two incompatible ordering sources would make reorder behavior unclear.             | Parser already validates bad table ordering at schema parse time.               |
| VRO-D5  | Keep ordering writes as generic patch mutations.                            | Storage, authority, sync, and protocol do not need new write paths.                | Table row reordering already patches one numeric rank field.                    |
| VRO-D6  | Keep sparse numeric ranks and existing rank planning behavior.              | It minimizes writes and preserves current table semantics.                         | Shared rank helpers already cover move, drag, scope, and rebalance plans.       |
| VRO-D7  | Keep ordering fields as non-integer number fields.                          | Fractional ranks need safe gaps between neighbors.                                 | Current table parser rejects integer ordering fields.                           |
| VRO-D8  | Keep ordering scope field-based first.                                      | Scope by flat record fields is enough for table rows and tree siblings.            | Current table ordering scope uses field references.                             |
| VRO-D9  | Do not allow drag reorder across scope boundaries.                          | Cross-scope moves imply relationship changes or reparenting.                       | Current table drag already guards dnd-kit groups and Formless scope.            |
| VRO-D10 | Make Site tree ordering explicit in the source schema.                      | Implicit `order` field inference is not a durable generic contract.                | Current tree model hardcodes `order` when present.                              |
| VRO-D11 | Keep an implicit tree ordering fallback only as a short compatibility path. | Existing behavior should not disappear before source schemas migrate.              | Current Site root tree already relies on inferred placement order.              |
| VRO-D12 | Extract generic generated ordering helpers before adding tree/list drag.    | Table drag code already contains reusable scope, drag data, and submit plumbing.   | Current `table-ordering-ui` is table-named but partly generic.                  |
| VRO-D13 | Keep result renderers responsible for presentation-specific markup.         | Table rows, tree nodes, and list items have different DOM and accessibility needs. | Current table and tree renderers already have different structures.             |
| VRO-D14 | Keep dnd-kit usage in generated app code.                                   | The shared UI package should stay primitive and presentation-neutral.              | PRD 16 explicitly kept dnd-kit in generated app code.                           |
| VRO-D15 | Treat rebalance as a visible blocker, not an automatic multi-patch write.   | Atomic batch mutation transport is out of first-release scope.                     | Roadmap keeps atomic batch mutations later.                                     |
| VRO-D16 | Resolve result-level ordering before table-level or implicit tree fallback. | Result schemas should own new ordering declarations while old table schemas work.  | VRO-01 model selectors prefer collection result ordering when present.          |

## Requirements

### Schema behavior

- Collection result schemas can declare optional ordering.
- Result ordering supports `field`, optional `scope`, and optional `presentations`.
- Result ordering field must reference a field on the collection entity.
- Result ordering field must be a number field.
- Result ordering field must not be integer.
- Result ordering scope fields must reference fields on the collection entity.
- Result ordering scope fields must not contain duplicates.
- Result ordering presentations use the existing first slice vocabulary.
- Existing table view ordering parses unchanged.
- Table results use result-level ordering when declared.
- Table results use table view ordering when result-level ordering is absent.
- Table results reject incompatible result-level and table-level ordering declarations.
- Tree results can declare ordering.
- List results can declare ordering.
- Existing schemas without result-level ordering parse unchanged.
- `stringifySchema` preserves result-level ordering.

### Model behavior

- Home result models expose one generic ordering config shape.
- Table result models consume the same generic ordering config shape.
- Tree result models consume the same generic ordering config shape.
- List result models consume the same generic ordering config shape.
- Ordering config includes field name, field metadata, scope fields, and presentations.
- Ordered record id selection uses shared sorting behavior.
- Missing rank values sort after finite rank values.
- Stable fallback order stays deterministic.
- Scoped ordering sorts within stable scope groups.
- Scope keys are stable across table, tree, and list drag.
- Patch permission uses the ordered entity's generic patch mutation setting.

### Rendering behavior

- Table rows render in the same order as today.
- Table drag handles render in the same place as today.
- Table move menu controls render in the same place as today.
- Table drag reorder keeps using dnd-kit.
- Table drag reorder patches only on drop.
- Table drag reorder ignores cross-scope moves.
- Tree siblings render in rank order when ordering is declared.
- Tree siblings can be moved with existing up/down controls.
- Tree siblings can be dragged within the same parent scope when drag handles are declared.
- Tree drag reorder does not reparent records.
- Tree drag reorder patches only the placement rank field.
- List records render in rank order when ordering is declared.
- List records can render drag handles when drag handles are declared.
- Empty result messages stay unchanged.
- Editing disabled messages stay consistent with current collection behavior.
- Rebalance-required states set sync status instead of silently doing nothing.

### Site proving behavior

- Site root tree declares ordering for `blockPlacement.order`.
- Site root tree scopes ordering by `blockPlacement.parent`.
- Site root tree supports sibling drag reorder.
- Site root tree still supports existing up/down placement controls or an equivalent move presentation.
- Public Site tree projection stays unchanged.
- Public Site renderer stays unchanged.
- Raw placement table keeps current ordering behavior.
- Header and Footer placement ordering follows the same generic tree ordering path as page placement ordering.

## Chunks

| ID     | Status  | Depends on     | Main files                                 | Acceptance                                                                                                     |
| ------ | ------- | -------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| VRO-01 | shipped | none           | schema parser, types, models               | Collection result ordering parses and resolves for table, tree, and list; existing table schemas keep working. |
| VRO-02 | ready   | VRO-01         | generated ordering helpers, table renderer | Table renderer uses generic ordering helpers with no intended behavior change.                                 |
| VRO-03 | ready   | VRO-02         | tree renderer, Site schema, tests          | Site tree sibling placements support explicit generic ordering and drag reorder without reparenting.           |
| VRO-04 | ready   | VRO-02         | list renderer, tests                       | Ordered list results render in rank order and can opt into drag handles.                                       |
| VRO-05 | ready   | VRO-03, VRO-04 | docs and cleanup                           | Legacy table/tree ordering names are documented or narrowed; promote notes are ready for steward docs.         |

## Testing Decisions

- Test parser behavior through schema parse/stringify surfaces, not private helper call order.
- Test ordering rank behavior through the shared ordering interface.
- Test model behavior through selected collection result models.
- Test table behavior through rendered output and existing table test helpers.
- Test tree behavior through Site generated app rendering and focused tree renderer behavior.
- Test list behavior through generated collection rendering.
- Test drag behavior at the lowest stable interface possible: drag facts, target index planning, and patch submission effects.
- Browser smoke is required for chunks that change app behavior, especially Site tree drag.
- Do not test internal component state names.
- Do not duplicate dnd-kit internals in tests.

Prior test anchors:

- Shared ordering rank coverage exists in `src/shared/table-ordering.test.ts`.
- Table parser interface coverage exists in `src/shared/schema-table-views.test.ts`.
- Table model interface coverage exists in `src/client/table-model.test.ts`.
- Collection model coverage exists in `src/client/views.test.ts`.
- Generated table coverage exists in `src/app/generated/table.test.tsx`.
- Site generated workspace coverage exists in `src/app.test.tsx`.

## Out of Scope

- Do not change storage table shape.
- Do not change `StoredRecord`.
- Do not add nested record values.
- Do not add relationship reparenting through drag.
- Do not add cross-scope drag moves.
- Do not add atomic batch mutation transport.
- Do not auto-rebalance ranks with multiple patch writes.
- Do not add delete/archive flows.
- Do not add board ordering.
- Do not add grouped table ordering.
- Do not add column header sorting.
- Do not add server-side query ordering.
- Do not change public Site tree response shape.
- Do not change public Site renderer behavior.

## Dependencies And Coordination

| Workstream                              | Relationship | Notes                                                                               |
| --------------------------------------- | ------------ | ----------------------------------------------------------------------------------- |
| PRD 14 table actions and ordering       | upstream     | Defines shipped table ordering semantics that must stay compatible.                 |
| PRD 16 post-TAO architecture efficiency | upstream     | Defines table parser/model/render locality and dnd-kit placement.                   |
| PRD 19 Site editor root nav and tree    | upstream     | Provides the tree result presentation that should gain drag ordering.               |
| PRD 20 discriminated entity unions      | parallel     | May also touch generated tree rendering and Site schema; coordinate file ownership. |

Parallel-safe work:

- Parser/model work can proceed separately from tree visual polish.
- List renderer work can proceed separately from Site schema changes after generic helpers exist.

Coordinate before touching:

- `src/app/generated/tree.tsx` if PRD 20 is active.
- `schema/apps/site/schema.json` if PRD 20 is active.
- generated tree app tests if PRD 20 changes the same assertions.

## Promote After Ship

- `doc/current.md`: collection result schemas can declare ordering for list, table, and tree results.
- `doc/current.md`: result-level ordering resolves before table-level compatibility ordering and before the implicit tree `order` fallback.
- `doc/current.md`: collection result ordering is generic across table, tree, and list result presentations.
- `doc/current.md`: table ordering remains backward-compatible and uses generic ordering helpers.
- `doc/current.md`: Site tree sibling placements support generated drag reorder.
- `doc/roadmap.md`: generated collection result ordering is release scope; cross-scope reparenting and batch rebalance stay out of first release.

## Further Notes

- The current file name `table-ordering.ts` describes the original caller, not the real abstraction. Renaming can happen if it improves locality, but behavior should move first.
- The serialized presentation names can stay stable in the first slice. Internal names can become generic without forcing schema churn.
- Tree drag should treat a sibling list as the sortable group. Reparenting requires a separate relationship-editing design.
- A rank rebalance endpoint or atomic patch batch can be a later PRD if sparse gaps become a real operational problem.

## Status Notes

- 2026-05-11: Drafted from review of current table ordering, collection result models, and Site tree ordering behavior.
- 2026-05-11: VRO-01 shipped. Added result-level ordering schema/types/parser support, generic client ordering model selection, table compatibility fallback, and list/table/tree model coverage. Next ready chunk is VRO-02.

## Blockers

- None for VRO-01.

## Evidence

- `devstate start`: checks ok, services running.
- Current state review: table ordering has shared sparse rank helpers, table-local dnd-kit rendering, and tree-only inferred `order` move controls.
- `devstate check`: checks ok, services running.
- `.devstate/logs/service-test.txt`: 14 test files passed, 406 tests passed.
- `.devstate/logs/check-vite.txt`: formatting completed; no warnings, lint errors, or type errors in 186 files.
