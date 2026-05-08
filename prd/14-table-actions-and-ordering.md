# PRD 14: Table actions and ordering

Status: shipped
Current chunk: complete
Last updated: 2026-05-07

## Goal

Make generated tables support consistent record actions and row ordering.

The first slice should:

- keep collection views as scope/query/context controllers;
- keep table views as record interaction surfaces;
- add table-local action definitions;
- add an `invokeAction` table column for row action cells;
- add generated edit views and live-patch edit dialogs;
- prove row actions on Site placement rows with Edit child block;
- add table-local ordering with sparse numeric ranks;
- support move menu and drag handle ordering controls;
- use `@dnd-kit/react` for drag sorting;
- keep storage, authority, sync, and protocol shape unchanged.

This PRD is about generated table behavior. It is not about general permissions, draft forms, delete, column header tools, or batch mutation transport.

## Problem

Generated tables can edit scalar and reference fields inline, but actions are scattered.

Current behavior:

- Collection actions render below the result.
- Create actions are collection-scoped.
- Entity actions submit named authority actions.
- Table columns render field, reference-field, value/unit, and computed cells.
- A referenced-record edit button exists as one-off table code.
- Table rows cannot expose a configurable row action menu.
- Table rows cannot be dragged or moved with generated ordering controls.
- Site placements expose the raw `order` field as a number cell.

This makes future table interactions hard to keep consistent. Actions can appear on table, row, cell, or column surfaces, but the runtime does not yet have one action descriptor model or one UX pattern for action buttons/dropdowns.

## Source map

Existing anchors:

- Current runtime docs: `doc/current.md`.
- Release target docs: `doc/roadmap.md`.
- Source schemas: `schema/apps/tasks/schema.json`, `schema/apps/rates/schema.json`, `schema/apps/site/schema.json`.
- Generated table renderer: `src/app/generated/table.tsx`.
- Generated collection renderer: `src/app/generated/collection.tsx`.
- Generated collection action renderer: `src/app/generated/actions.tsx`.
- Generated create renderer: `src/app/generated/create.tsx`.
- Generated field editor: `src/app/generated/record-field-editor.tsx`.
- Generated field display: `src/app/generated/record-field-display.tsx`.
- View model selection: `src/client/views.ts`.
- Schema view parser: `src/shared/schema-views.ts`.
- Schema types: `src/shared/schema-types.ts`.
- Field behavior module: `src/shared/field-types.ts`.
- Sync client mutations: `src/client/sync.ts`.
- Site list/detail PRD: `prd/13-site-editor-list-detail.md`.
- UI dropdown primitive: `lib/ui/src/dropdown-menu.tsx`.
- UI table primitive: `lib/ui/src/table.tsx`.
- UI dialog primitive: `lib/ui/src/dialog.tsx`.

Owned files:

- `prd/14-table-actions-and-ordering.md`.

Likely changed files:

- `package.json`.
- `bun.lock`.
- `src/shared/schema-types.ts`.
- `src/shared/schema-views.ts`.
- `src/shared/schema.test.ts`.
- `src/client/views.ts`.
- `src/client/views.test.ts`.
- `src/app/generated/table.tsx`.
- `src/app/generated/create.tsx` only if edit dialog code shares create helpers.
- `src/app/generated/actions.tsx` only if action rendering is extracted.
- `src/app.test.tsx`.
- `schema/apps/site/schema.json`.
- `schema/apps/site/seed-records.json` if sparse placement ranks need seed cleanup.

Possible extracted modules:

- Table action parser/model module.
- Table action availability evaluator.
- Table ordering rank calculator.
- Generated action menu renderer.
- Generated edit dialog renderer.

## Requirements

### Runtime behavior

- Existing collection views keep owning context, query tabs, summaries, and collection-level actions.
- Existing table views keep rendering current field, reference-field, value/unit, and computed columns.
- Table views can declare row-local actions.
- Table views can render action cells through an `invokeAction` column.
- A single non-destructive action can render as a button.
- Multiple actions render as a dropdown menu from `lib/ui`.
- A row action can open an edit dialog for the current row record.
- A row action can open an edit dialog for a referenced record.
- Site placement rows can open the full edit dialog for their child block.
- Boolean fields that are normal editable state remain checkbox fields, not row actions.
- Generated edit dialogs use existing per-field patch semantics.
- Edit dialogs use `Done`, not draft `Save`/`Cancel`.
- Row action pending state is per row/action, not table-global.
- Hidden actions disappear from menus.
- Disabled actions remain visible with a reason available for later tooltip/ARIA.
- Empty action cells disappear when all actions are hidden.
- Dropdown triggers remain available if visible menu items are disabled so reasons can be exposed later.
- Destructive variants can be represented but are not used for destructive behavior in this PRD.

### Schema behavior

- Table action definitions are table-local first.
- A global action registry stays out of this PRD.
- Table action definitions are named.
- `invokeAction` columns reference named table actions.
- `invokeAction` columns are table column types, even though UX calls them action cells.
- `editRecord` actions require an explicit `editView`.
- `editRecord` targets support `row` and `reference` first.
- Context/current-selection edit targets stay out of this PRD.
- Edit views are top-level views with `type: "edit"`.
- Edit view fields require `editor` and `commit`.
- Edit views reuse item-view field validation where possible.
- Existing schemas without edit views or table actions parse unchanged.
- Existing table column types parse unchanged.
- Bad action references fail at schema parse time.
- Bad edit view references fail at schema parse time.
- Bad edit target fields fail at schema parse time.
- Bad ordering fields fail at schema parse time.
- `stringifySchema` preserves new table action, edit view, and ordering shapes.

### Ordering behavior

- Table views can declare table-local ordering.
- Ordering is not query-level in this PRD.
- Ordering sorts table rows at render time.
- Ordering uses a numeric rank field.
- Ordering fields must be number fields.
- Ordering fields must not be integer fields.
- Ordering fields may have `min: 0`.
- Ordering uses sparse/fractional ranks.
- Normal reorder patches only the moved row.
- Local rebalance is allowed only when no safe rank gap remains.
- Rebalance is rare and scoped to the ordering group.
- Ordering scope is declared through row fields first.
- Context-based ordering scope stays out of this PRD.
- Rows cannot move across ordering scope boundaries.
- Move to top, move up, move down, and move to bottom are generated ordering controls.
- Ordering controls are generated from table ordering, not normal table action definitions.
- Ordering move controls can merge into the same row action dropdown as declared actions.
- Drag reorder patches data only on drop.
- Drag reorder does not patch during hover.
- Drag reorder uses `@dnd-kit/react`.
- Drag reorder uses dnd-kit group guards and Formless scope validation.
- Drag handles and row menus are separate utility columns when both exist.
- Utility columns are explicit by default.
- Renderer may auto-insert utility columns only as fallback.
- Declared order fields are hidden from normal editing by default.
- If the order field appears as a visible column, it should be read-only or hidden.

### Site proving behavior

- Site `blockPlacementTable` is the proving table.
- `blockPlacement.order` should become a non-integer number field.
- Site placement rank seeds should use sparse values if source seeds need cleanup.
- Site placement rows should keep `visible` as a checkbox field.
- Site placement rows should add an Edit child block action.
- Site placement table should add an explicit action cell column.
- Site placement table should add ordering controls.
- Site placement table should stop exposing raw editable `order` once generated ordering controls exist.
- Public site tree and renderer behavior must stay unchanged.
- Site records remain flat `block` and `blockPlacement`.

## Proposed schema shape

Initial edit view shape:

```json
{
  "views": {
    "blockEdit": {
      "type": "edit",
      "entity": "block",
      "fields": {
        "type": { "editor": "enum", "commit": "immediate" },
        "title": { "editor": "text", "commit": "field-commit" },
        "label": { "editor": "text", "commit": "field-commit" },
        "subtitle": { "editor": "textarea", "commit": "field-commit" },
        "body": { "editor": "markdown", "commit": "field-commit" },
        "href": { "editor": "href", "commit": "field-commit" },
        "status": { "editor": "enum", "commit": "immediate" }
      }
    }
  }
}
```

Initial table action shape:

```json
{
  "tableViews": {
    "blockPlacementTable": {
      "entity": "blockPlacement",
      "actions": {
        "editChildBlock": {
          "type": "editRecord",
          "label": "Edit block",
          "target": { "kind": "reference", "field": "block" },
          "editView": "blockEdit"
        }
      },
      "columns": [
        { "type": "field", "field": "slot" },
        { "type": "field", "field": "block" },
        {
          "type": "invokeAction",
          "action": "editChildBlock",
          "width": "xs",
          "align": "end"
        }
      ]
    }
  }
}
```

Initial ordering shape:

```json
{
  "tableViews": {
    "blockPlacementTable": {
      "entity": "blockPlacement",
      "ordering": {
        "field": "order",
        "scope": [
          { "kind": "field", "field": "parent" },
          { "kind": "field", "field": "slot" }
        ],
        "presentations": ["dragHandle", "moveMenu"]
      },
      "columns": [
        { "type": "orderingHandle", "width": "xs" },
        { "type": "field", "field": "slot" },
        { "type": "field", "field": "block" },
        {
          "type": "invokeAction",
          "actions": ["editChildBlock"],
          "includeOrdering": true,
          "presentation": "dropdown",
          "width": "xs",
          "align": "end"
        }
      ]
    }
  }
}
```

Notes:

- Exact property names can change during implementation if tests show a clearer shape.
- `invokeAction.action` is shorthand for one action; `invokeAction.actions` is used for multiple actions.
- `presentation` can be inferred when omitted.
- `includeOrdering` merges generated ordering menu items into the same row dropdown.
- If ordering asks for move menu and no action dropdown includes ordering, the renderer can auto-insert a row menu column at the end.
- If ordering asks for drag handle and no handle column exists, the renderer can auto-insert a handle column at the start.

## Decisions

| ID      | Decision                                                              | Reason                                                                                  | Evidence                                                     |
| ------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| TAO-D1  | Keep collection views separate from table views.                      | Collections own scope/query/context; tables own row interaction.                        | `doc/current.md`, `src/client/views.ts`                      |
| TAO-D2  | Make table the first record interaction surface.                      | Tables are where row/cell actions and ordering are needed now.                          | `src/app/generated/table.tsx`                                |
| TAO-D3  | Model action scope first and rendering second.                        | Button/dropdown/hover can change without changing action semantics.                     | User design discussion                                       |
| TAO-D4  | Use a shared UI action descriptor backed by separate execution kinds. | Open dialogs, create, patch, and authority actions should render consistently.          | `src/app/generated/actions.tsx`, `src/client/sync.ts`        |
| TAO-D5  | Keep table action definitions table-local first.                      | Row target resolution depends on local table context.                                   | `src/shared/schema-views.ts`, `src/client/views.ts`          |
| TAO-D6  | Add `invokeAction` as a table column type.                            | Current schema renders cells from column definitions.                                   | `src/shared/schema-types.ts`, `src/app/generated/table.tsx`  |
| TAO-D7  | Use named action references in `invokeAction` columns.                | Actions can later be reused by row menus, keyboard affordances, or mobile presentation. | User design discussion                                       |
| TAO-D8  | Add explicit `edit` views.                                            | Full edit dialogs should not overload create, item, or table column schemas.            | `src/shared/schema-views.ts`, `src/app/generated/create.tsx` |
| TAO-D9  | Edit view fields require `editor` and `commit`.                       | Edit dialogs patch existing records like inline editors.                                | `src/app/generated/record-field-editor.tsx`                  |
| TAO-D10 | Edit dialogs live-patch fields and close with Done.                   | Draft save/cancel is future roadmap scope.                                              | `doc/roadmap.md`                                             |
| TAO-D11 | First `editRecord` targets are row and reference.                     | Site placement rows need referenced child block editing.                                | `schema/apps/site/schema.json`                               |
| TAO-D12 | Keep normal booleans as field editors, not actions.                   | `visible` is better as a checkbox than Hide/Show row actions.                           | `src/app/generated/record-field-editor.tsx`                  |
| TAO-D13 | Use Site `blockPlacementTable` as proving table.                      | It needs referenced edit, visible checkbox, and scoped ordering.                        | `schema/apps/site/schema.json`                               |
| TAO-D14 | Use table-local ordering, not query-level ordering.                   | Current queries filter records; table drag only needs render-time ordering.             | `src/shared/query.ts`, `src/client/store.ts`                 |
| TAO-D15 | Use sparse/fractional numeric ranks.                                  | Avoids dense multi-row rewrites for normal drag reorder.                                | User design discussion                                       |
| TAO-D16 | Ordering fields must be non-integer number fields.                    | Fractional ranks cannot use integer fields.                                             | `src/shared/schema-fields.ts`                                |
| TAO-D17 | Allow `min: 0` ordering fields.                                       | Rebalance can keep ranks inside positive range.                                         | User design discussion                                       |
| TAO-D18 | Declare ordering scope through row fields first.                      | Site placement scope is already `parent` and `slot`.                                    | `schema/apps/site/schema.json`                               |
| TAO-D19 | Disallow cross-scope drag/move first.                                 | Moving across scope implies patching other fields, not just ordering.                   | User design discussion                                       |
| TAO-D20 | Generate move top/up/down/bottom controls from ordering.              | Move availability depends on scoped sorted rows, not just row record state.             | User design discussion                                       |
| TAO-D21 | Merge generated ordering controls into row action menus.              | One row menu is better UX than separate action affordances.                             | User design discussion                                       |
| TAO-D22 | Keep drag handle and row menu as separate utility columns.            | Drag and dropdown have different pointer and keyboard semantics.                        | User design discussion                                       |
| TAO-D23 | Make utility columns explicit, with auto-insert fallback.             | Column order should stay schema-owned.                                                  | User design discussion                                       |
| TAO-D24 | Use `@dnd-kit/react` for drag sorting.                                | It provides React sortable hooks, handles, grouping, and accessibility support.         | dnd-kit docs                                                 |
| TAO-D25 | Keep dnd-kit in the generated app layer, not `lib/ui`.                | Drag reorder depends on schema, records, sync, and ordering rules.                      | `lib/ui/src/table.tsx`, `src/app/generated/table.tsx`        |
| TAO-D26 | Patch data only on drop, not hover.                                   | Avoids sync noise and half-committed drag state.                                        | User design discussion                                       |
| TAO-D27 | Represent but do not ship destructive behavior.                       | Proper delete and confirmation flows are future roadmap scope.                          | `doc/roadmap.md`                                             |
| TAO-D28 | Infer icons first; schema icons later.                                | Standard action icons can be chosen by action type.                                     | Existing `lucide-react` usage                                |

## Chunks

| ID     | Status  | Depends on | Main files                                                  | Acceptance                                                                                           |
| ------ | ------- | ---------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| TAO-01 | shipped | none       | PRD, characterization tests                                 | Current table action/create/edit/order behavior is characterized; PRD status and chunks are current. |
| TAO-02 | shipped | TAO-01     | schema types/parser, view model, generated table/action UI  | Table-local actions parse; `invokeAction` column renders single action button/dropdown facts.        |
| TAO-03 | shipped | TAO-02     | edit view parser/model, generated edit dialog, Site schema  | `edit` views parse; Site placement rows open child block edit dialog through `editRecord`.           |
| TAO-04 | shipped | TAO-03     | ordering parser/model, rank module, move menu, Site schema  | Table ordering sorts rows; move top/up/down/bottom patches sparse ranks within scope.                |
| TAO-05 | shipped | TAO-04     | dnd-kit dependency, generated table drag UI, tests, browser | Drag handle reorders rows within scope using dnd-kit; data patches on drop; browser smoke passes.    |
| TAO-06 | shipped | TAO-05     | browser smoke, PRD                                          | `/site`, `/tasks`, and `/rates` smoke pass; PRD status, blockers, and promote notes are current.     |

## Chunk details

### TAO-01 characterization

Status: shipped.

Goal: protect the current generated table behavior before adding actions and ordering.

Outcome:

- Source schemas parse and re-parse through `stringifySchema`.
- Current table column types remain characterized for field, reference-field, value/unit, and computed columns.
- Collection actions still render below generated table results.
- Current one-off referenced-record edit button renders for `referenceItemView` field columns.
- Site `blockPlacementTable` still exposes raw editable integer `order` and editable `visible`.
- No runtime behavior changed.

Acceptance:

- Existing table column behavior is protected by tests.
- Existing collection create/entity action behavior is protected by tests.
- Site placement table baseline is documented in tests or PRD evidence.
- No runtime behavior changes.

Evidence:

- `./tmp/devstate.json`: dev ready, tests pass, checks pass, updated `2026-05-07T03:39:55.864Z`.
- `./tmp/test.txt`: final post-rebase rerun passed 3 files and 190 tests.
- `./tmp/check.txt`: formatting, lint, and type checks pass.

### TAO-02 table action model and invoke column

Status: shipped.

Goal: add table-local named actions and an action cell column without edit dialogs or ordering yet.

Outcome:

- Table views can declare table-local named `actions`.
- Table action descriptors support label, destructive variant, and static hidden/disabled availability.
- `invokeAction` table columns parse with one `action` or multiple `actions`.
- Missing, empty, duplicate, and conflicting action refs fail at schema parse time.
- View models select render-ready action facts and hide columns when all referenced actions are hidden.
- Generated tables render one action as a button and multiple actions as a dropdown.
- Action columns default to a blank visual header with accessible header text.
- Existing collection actions stay unchanged.

Acceptance:

- Existing schemas without table actions parse unchanged.
- A table action registry with one valid action parses.
- An `invokeAction` column referencing one action parses.
- An `invokeAction` column referencing missing actions fails.
- Single action renders as a button by default.
- Multiple actions render as a dropdown.
- The action column has an inferred accessible header label and blank visual header by default.
- No edit dialog or ordering behavior is required in this chunk.

Evidence:

- Parser tests: `src/shared/schema.test.ts`.
- View model tests: `src/client/views.test.ts`.
- Generated table render tests: `src/app.test.tsx`.
- Browser smoke: `bun browser open https://14-table-actions-and-ordering.formless.local/rates`; `bun browser snapshot -i` showed the rate table and collection actions.
- `./tmp/devstate.json`: dev ready, tests pass, checks pass, updated `2026-05-07T03:48:16.104Z`.
- `./tmp/test.txt`: table render rerun passed 2 files and 85 tests; final schema/view reruns passed 12 files and 358 tests plus client view 33 tests.
- `./tmp/check.txt`: formatting, lint, and type checks pass.

### TAO-03 edit view and editRecord action

Status: shipped.

Goal: add a full edit dialog action for table row and reference targets.

Outcome:

- Top-level `edit` views parse and stringify with field `editor` and `commit`.
- `editRecord` table actions validate row and reference targets.
- `editRecord` actions validate target entity against the referenced edit view.
- View models select edit dialog facts for generated tables.
- Generated table action buttons open wider live-patch edit dialogs backed by `RecordFieldEditor`.
- Edit dialogs close with `Done`.
- Site schema adds `blockEdit`, `blockPlacementTable.actions.editChildBlock`, and an explicit `invokeAction` Edit block column.

Acceptance:

- `edit` views parse and stringify.
- Edit fields require valid editors and commit policies.
- `editRecord` row target validates.
- `editRecord` reference target validates.
- Mismatched reference target and edit view entity fails.
- Site placement rows expose Edit block.
- Edit block opens a dialog for the referenced child block.
- Dialog fields patch through existing generic patch flow.
- Dialog closes with Done.
- Existing create views keep working.

Evidence:

- Parser tests: `src/shared/schema.test.ts`.
- View model tests: `src/client/views.test.ts`.
- Generated app render tests: `src/app.test.tsx`.
- Browser smoke: `bun browser open https://14-table-actions-and-ordering.formless.local/site`; snapshot showed the Site placement table Edit block column and buttons; focused first Edit block and `bun browser press Enter`; snapshot showed the Edit block dialog with Header fields and Done.
- `./tmp/devstate.json`: dev ready, tests pass, checks pass, updated `2026-05-07T04:02:54.276Z`.
- `./tmp/test.txt`: full restart run passed 28 files and 495 tests; final source-schema rerun passed 12 files and 363 tests.
- `./tmp/check.txt`: formatting, lint, and type checks pass.

### TAO-04 ordering model and move menu

Status: shipped.

Goal: add table-local sparse rank ordering and generated move menu controls.

Outcome:

- Table views can declare `ordering` with a numeric rank field, row-field scope, and presentations.
- Ordering validation rejects missing fields, non-number fields, and integer rank fields.
- `invokeAction.includeOrdering` merges generated move menu items into row action dropdowns.
- The view model auto-inserts an ordering-only dropdown when move menus are requested and no explicit action column includes ordering.
- Generated tables sort rows by rank before rendering.
- Move to top/up/down/bottom computes sparse scoped ranks and patches only the moved row when a safe gap exists.
- Rebalance planning is isolated in the rank helper for no-gap cases.
- Site `blockPlacement.order` is a non-integer number field with sparse seed ranks.
- Site placement tables hide the raw editable `order` column and show ordering controls through `Actions`.

Acceptance:

- Existing tables without ordering render unchanged.
- Ordering field validation catches missing, non-number, and integer fields.
- Ordering scope validation catches missing fields.
- Rows sort by rank, then stable fallback.
- Move to top/up/down/bottom availability respects scope boundaries.
- Move controls patch only the moved row when a safe rank exists.
- Rebalance behavior is isolated and tested.
- Site placements are ordered by sparse rank.
- Site placement raw order is not a normal editable cell after controls exist.

Evidence:

- Parser tests: `src/shared/schema.test.ts`.
- Rank helper unit tests: `src/shared/table-ordering.test.ts`.
- View model tests: `src/client/views.test.ts`.
- Generated table render/action tests: `src/app.test.tsx`.
- Browser smoke: `bun browser open https://14-table-actions-and-ordering.formless.local/site`; reset source schema/seed; snapshot showed no raw `Order` column, an `Actions` column, and Site placement move menu items; `Move down` reordered a main-slot placement.
- `./tmp/devstate.json`: dev ready, tests pass, checks pass, updated `2026-05-07T04:30:55.805Z`.
- `./tmp/test.txt`: full restart run passed 29 files and 504 tests.
- `./tmp/check.txt`: formatting, lint, and type checks pass.

### TAO-05 drag reorder

Status: shipped.

Goal: add dnd-kit drag handle ordering.

Outcome:

- Added `@dnd-kit/react`.
- Added `orderingHandle` table column schema, parser, stringify, and view model facts.
- Auto-inserted handle columns only when ordering asks for `dragHandle` and no explicit handle column exists.
- Wired generated table rows through dnd-kit sortable groups when drag handles are active.
- Used a dedicated handle ref on the Reorder button.
- Grouped drag sorting by ordering scope key.
- Validated scope again on drop.
- Patched only from `onDragEnd`.
- Kept move-menu commands in the row action dropdown.
- Preserved table footer rendering and grouped readiness warning rows with their sortable record row.
- Site `blockPlacementTable` now declares drag handles plus move menus.

Acceptance:

- Drag handle renders when declared.
- Drag handle and row menu are separate utility columns.
- Dragging within one scope visually reorders rows.
- Dropping within one scope patches the moved row rank.
- Cross-scope drop is guarded by dnd-kit `accept` and checked again on drop.
- Dragging does not patch during hover.
- Move menu still works without pointer drag.
- Browser smoke verified `/site` drag behavior through `bun browser`.

Evidence:

- Parser tests: `src/shared/schema.test.ts`.
- Rank helper tests: `src/shared/table-ordering.test.ts`.
- View model tests: `src/client/views.test.ts`.
- Generated table render tests: `src/app.test.tsx`.
- Browser smoke: `bun browser open https://14-table-actions-and-ordering.formless.local/site/schema`; reset source schema/seed; `bun browser open https://14-table-actions-and-ordering.formless.local/site`; snapshot showed Reorder and Actions as separate columns; mouse drag of the Featured projects Reorder handle over the first `main` Reorder handle moved Featured projects to the top of the `main` scope and advanced cursor to 49.
- `./tmp/devstate.json`: dev ready, tests pass, checks pass, updated `2026-05-07T04:46:23.568Z`.
- `./tmp/test.txt`: full restart run passed 29 files and 506 tests.
- `./tmp/check.txt`: formatting, lint, and type checks pass.

### TAO-06 closeout

Status: shipped 2026-05-07.

Goal: smoke the shipped table action and ordering work and prepare promotion notes.

Tasks:

- Smoke `/site`.
- Smoke `/tasks`.
- Smoke `/rates`.
- Verify public pages still render if Site schema changed.
- Update PRD status and chunk table.
- Record blockers.
- Record promote notes.

Outcome:

- `/site` browser smoke verifies placement Reorder and Actions columns.
- `/site` browser smoke verifies Edit block opens the referenced child block edit dialog.
- `/site` browser smoke verifies Move down reorders a main-slot placement and advances sync cursor.
- `/tasks` browser smoke verifies existing task table and collection actions still render.
- `/rates` browser smoke verifies existing rate table editing surface still renders.
- `/pages` browser smoke redirects to `/pages/home` and renders the public Home page.
- PRD status is `shipped`.
- Chunk table marks TAO-01 through TAO-06 shipped.
- Blockers are clear.
- Promote notes are ready for a doc/steward pass.

Evidence:

- `./tmp/devstate.json`: `devStatus` ready, `testStatus` pass, `checkStatus` pass, updated `2026-05-07T04:51:04.896Z`.
- `./tmp/test.txt`: `29 passed (29)`, `506 passed (506)`.
- `./tmp/check.txt`: formatting pass; lint/type check pass for 166 files.
- Browser smoke: `bun browser --session tao-06 eval 'fetch("/api/site/reset/schema",{method:"POST",headers:{"content-type":"application/json"},body:"{}"}).then(r=>r.status)'` returned `200`.
- Browser smoke: `bun browser --session tao-06 eval 'fetch("/api/site/reset/seed",{method:"POST",headers:{"content-type":"application/json"},body:"{}"}).then(r=>r.status)'` returned `200`.
- Browser smoke: `bun browser --session tao-06 --ignore-https-errors batch --bail "open https://14-table-actions-and-ordering.formless.local/site" "wait 1000" "get text body"` returned the Site editor with `Pages`, placement table rows, `Reorder`, `Actions`, and `Create Block placement`.
- Browser smoke: `bun browser --session tao-06 snapshot -i` showed `Edit block`, `Move to top`, `Move up`, `Move down`, and `Move to bottom` in the placement row Actions menu.
- Browser smoke: focused `Move down` and pressed Enter; snapshot showed cursor advanced to 49 and `Recent posts` moved above `Schema-backed software for content-heavy products` in the `main` scope.
- Browser smoke: `bun browser --session tao-06 --ignore-https-errors batch --bail "open https://14-table-actions-and-ordering.formless.local/tasks" "wait 1000" "get text body"` returned the Tasks table with `Create Task` and `Clear completed`.
- Browser smoke: `bun browser --session tao-06 --ignore-https-errors batch --bail "open https://14-table-actions-and-ordering.formless.local/rates" "wait 1000" "get text body"` returned the Rates table with `Role`, `Cost`, `Price`, `Margin`, and `Create Resource`.
- Browser smoke: `bun browser --session tao-06 --ignore-https-errors batch --bail "open https://14-table-actions-and-ordering.formless.local/pages" "wait 1000" "get url" "get text body"` redirected to `/pages/home` and returned the public Home page with header navigation, recent posts, hero, featured projects, and footer.
- Browser smoke: `bun browser --session tao-06 errors` returned no page errors.

Acceptance:

- `./tmp/devstate.json` shows dev ready, tests pass, and checks pass.
- `./tmp/test.txt` shows passing tests after `bun start`.
- `./tmp/check.txt` shows passing checks after `bun start`.
- `/site` browser smoke covers edit child block and ordering controls.
- `/tasks` browser smoke confirms existing collection actions still work/render.
- `/rates` browser smoke confirms existing table editing still works/renders.
- Public site route smoke passes if source Site schema or seeds changed.
- PRD status is current.
- Promote notes are ready for doc/steward pass.

## Non-goals

- Do not merge collection views and table views.
- Do not add global app action registry.
- Do not add column header actions.
- Do not add list/item action slots.
- Do not add context-target edit actions.
- Do not add user/role/permission enforcement.
- Do not add draft save/cancel edit sessions.
- Do not add cross-field draft validation UI.
- Do not add proper delete mutations.
- Do not add destructive confirmation flow.
- Do not add atomic batch mutation endpoint.
- Do not add query-level `orderBy`.
- Do not allow cross-scope drag/move.
- Do not add grouped table or kanban lane moves.
- Do not add action icon schema.
- Do not add mobile-specific action sheets.
- Do not change storage table shape.
- Do not change sync protocol shape.
- Do not change authority write shape.
- Do not change public site tree semantics.

## Open questions

| ID     | Question                                                        | Default for implementation                                                                  |
| ------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| TAO-O1 | Should table action definitions later become globally reusable? | No for this PRD. Keep table-local until duplication appears.                                |
| TAO-O2 | Should availability support user/role/permission rules now?     | No. Reserve the concept; first implementation can use target resolution and mutation state. |
| TAO-O3 | Should edit views later support draft save/cancel?              | Yes later; first implementation live-patches fields.                                        |
| TAO-O4 | Should reorder use atomic batch mutations?                      | Later. Sparse ranks avoid making batch transport a prerequisite.                            |
| TAO-O5 | Should move across scope patch scope fields too?                | Later. Cross-scope movement is not just sorting.                                            |
| TAO-O6 | Should source schemas explicitly include utility columns?       | Yes. Auto-insert is fallback only.                                                          |

## Blockers

| ID     | Status | Blocks | Notes                                            |
| ------ | ------ | ------ | ------------------------------------------------ |
| TAO-B1 | closed | TAO-05 | `@dnd-kit/react` added and drag reorder shipped. |

## Cross-PRD dependencies

| Dependency                        | Direction  | Notes                                                                                       |
| --------------------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| PRD 06 home view model module     | upstream   | Table action and ordering facts should be selected in `src/client/views.ts`.                |
| PRD 08 entity action module       | adjacent   | Entity actions remain authority-backed; table UI actions are a separate generated UI model. |
| PRD 10 declarative screen runtime | upstream   | Site table work appears inside existing generated screen/collection rendering.              |
| PRD 11 field editor expansion     | upstream   | Edit dialogs reuse generated field editors and commit policies.                             |
| PRD 13 site editor list/detail    | upstream   | Site placement table lives inside Pages/Header/Footer list/detail screens.                  |
| Future delete PRD                 | downstream | Destructive delete actions need proper delete mutations and confirmation flows.             |
| Future draft validation PRD       | downstream | Edit views can later grow draft sessions and cross-field validation UI.                     |
| Future batch mutation PRD         | downstream | Ordering can later switch from single sparse rank patch to atomic batch/rebalance writes.   |

## Parallel shipping

Can ship in parallel with:

- worker-only sync or authority chunks that avoid generated table/action UI;
- public site renderer work that avoids Site source schema and placement table shape;
- doc/steward promotion work that coordinates roadmap/current updates.

Should coordinate with:

- any PRD changing `src/shared/schema-types.ts`;
- any PRD changing `src/shared/schema-views.ts`;
- any PRD changing `src/client/views.ts`;
- any PRD changing `src/app/generated/table.tsx`;
- any PRD changing `schema/apps/site/schema.json`.

Avoid parallel edits with:

- PRD chunks owning generated table rendering;
- PRD chunks owning Site placement source schema;
- PRD chunks changing generated field editor commit semantics.

Recommended order:

1. Characterize current table behavior.
2. Add table actions and `invokeAction` column.
3. Add edit views and Site Edit block action.
4. Add ordering model and move menu.
5. Add dnd-kit drag handle reorder.
6. Smoke and close out.

## Progress rules

- Mark exactly one TAO chunk as `doing` when implementation starts.
- Do not mark a chunk `doing` if another active agent owns it.
- When a chunk ships, mark it `shipped`.
- Replace shipped task detail with outcome plus evidence.
- Keep runtime claims backed by code, schema, tests, or shipped behavior.
- Keep global-doc updates in `Promote after ship`.
- Update only this PRD during normal TAO chunk work.
- Run `bun browser` smoke for TAO-03, TAO-04, TAO-05, and TAO-06 because generated UI behavior changes.

## Promote after ship

TAO-01:

- No global-doc promotion. Characterization tests only.

TAO-02:

- Table views can declare table-local row actions.
- Generated tables can render `invokeAction` action columns.
- Single row actions can render as buttons; multiple row actions can render as dropdown menus.

TAO-03:

- App schemas can declare `edit` views.
- Edit views use field editors with commit policies.
- Generated edit dialogs live-patch fields and close with Done.
- Site placement rows can edit their referenced child block through a generated row action.

TAO-04:

- Table views can declare table-local ordering.
- Ordering uses non-integer numeric rank fields.
- Ordering scope can be declared from row fields.
- Generated row menus can include move to top/up/down/bottom ordering controls.
- Site placements use generated ordering controls instead of raw editable order cells.

TAO-05:

- Generated tables can render drag handle ordering controls.
- Drag reorder uses dnd-kit in the generated app layer.
- Drag reorder patches only on drop and rejects cross-scope moves.

TAO-06:

- `/site` browser smoke verifies placement edit action and ordering controls.
- `/tasks` and `/rates` browser smoke verify existing generated UI behavior still works.
- PRD 14 is ready for doc/steward promotion.

When this PRD ships, update `doc/current.md`:

- Generated table renderer supports table-local row actions.
- Generated table renderer supports `invokeAction` columns.
- Generated schemas support edit views.
- Generated edit dialogs live-patch through existing field editors.
- Generated table renderer supports table-local ordering with sparse numeric ranks.
- Site placement table supports editing referenced child blocks.
- Site placement table supports generated ordering controls.

When this PRD ships, update `doc/roadmap.md` only if first-release target details changed:

- Generated table renderer owns row actions and ordering controls.
- Draft edit sessions, delete, destructive confirmations, and atomic batch mutations remain later unless separately shipped.

## PRD status notes

- PRD drafted 2026-05-07 from table actions and ordering design grilling.
- TAO-01 shipped 2026-05-07 with characterization tests only; no runtime behavior changed.
- TAO-02 shipped 2026-05-07 with table-local action descriptors and `invokeAction` columns; no edit dialog or ordering behavior added.
- TAO-03 shipped 2026-05-07 with edit views, `editRecord` table actions, generated edit dialogs, and Site placement Edit block actions; no ordering behavior added.
- TAO-04 shipped 2026-05-07 with table-local ordering, sparse rank moves, generated move menus, and Site placement ordering controls.
- TAO-05 shipped 2026-05-07 with `@dnd-kit/react`, generated drag handles, scoped sortable rows, and drop-time sparse rank patches.
- TAO-06 shipped 2026-05-07 with closeout browser smoke for `/site`, `/tasks`, `/rates`, and `/pages`; PRD 14 is complete and ready for doc/steward promotion.
- User direction: keep collection views as scope containers and make tables the first record interaction surface.
- User direction: use table-local named actions and an `invokeAction` table column.
- User direction: add proper edit views for edit dialogs.
- User direction: use per-field patching now; draft save/cancel and validation are future roadmap work.
- User direction: use Site placement rows as proving ground.
- User direction: keep `visible` as a checkbox, not Hide/Show actions.
- User direction: add ordering with fractional/sparse ranks instead of dense reindexing.
- User direction: use move top/up/down/bottom and drag reorder in this work.
- User direction: use `@dnd-kit/react` for drag sorting.
- User direction: keep destructive actions and proper delete future-scoped.
- Roadmap updated 2026-05-07 with future atomic batch mutations, draft edit sessions, validation, proper delete, and destructive confirmations.
