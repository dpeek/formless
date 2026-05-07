# PRD 14: Table actions and ordering

Status: in progress
Current chunk: TAO-02
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
| TAO-02 | planned | TAO-01     | schema types/parser, view model, generated table/action UI  | Table-local actions parse; `invokeAction` column renders single action button/dropdown facts.        |
| TAO-03 | planned | TAO-02     | edit view parser/model, generated edit dialog, Site schema  | `edit` views parse; Site placement rows open child block edit dialog through `editRecord`.           |
| TAO-04 | planned | TAO-03     | ordering parser/model, rank module, move menu, Site schema  | Table ordering sorts rows; move top/up/down/bottom patches sparse ranks within scope.                |
| TAO-05 | planned | TAO-04     | dnd-kit dependency, generated table drag UI, tests, browser | Drag handle reorders rows within scope using dnd-kit; data patches on drop; browser smoke passes.    |
| TAO-06 | planned | TAO-05     | browser smoke, PRD                                          | `/site`, `/tasks`, and `/rates` smoke pass; PRD status, blockers, and promote notes are current.     |

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

- `./tmp/agent-dev.json`: dev ready, tests pass, checks pass, updated `2026-05-07T03:39:55.864Z`.
- `./tmp/test.txt`: final post-rebase rerun passed 3 files and 190 tests.
- `./tmp/check.txt`: formatting, lint, and type checks pass.

### TAO-02 table action model and invoke column

Status: planned.

Goal: add table-local named actions and an action cell column without edit dialogs or ordering yet.

Tasks:

- Add table-local `actions`.
- Add `invokeAction` table column schema.
- Validate action references.
- Select render-ready action column facts in the view model.
- Render single action as a button by default.
- Render multiple actions as a dropdown.
- Use dropdown-menu primitives from `lib/ui`.
- Add hidden/disabled availability model shape if it fits cleanly, but keep first behavior minimal.
- Keep existing collection actions unchanged.

Acceptance:

- Existing schemas without table actions parse unchanged.
- A table action registry with one valid action parses.
- An `invokeAction` column referencing one action parses.
- An `invokeAction` column referencing missing actions fails.
- Single action renders as a button by default.
- Multiple actions render as a dropdown.
- The action column has an inferred accessible header label and blank visual header by default.
- No edit dialog or ordering behavior is required in this chunk.

Evidence to record:

- Parser tests.
- View model tests.
- Generated table render tests.
- `./tmp/agent-dev.json`.
- `./tmp/test.txt`.
- `./tmp/check.txt`.

### TAO-03 edit view and editRecord action

Status: planned.

Goal: add a full edit dialog action for table row and reference targets.

Tasks:

- Add top-level `edit` views.
- Parse edit view fields with `editor` and `commit`.
- Select edit view field configs.
- Add `editRecord` table action kind.
- Validate row targets.
- Validate reference targets.
- Validate target entity matches edit view entity.
- Render an edit dialog from `RecordFieldEditor`.
- Use a wider dialog layout for markdown and long text.
- Use live per-field patch semantics.
- Add Site `blockEdit`.
- Add Site placement `editChildBlock`.
- Add a Site placement `invokeAction` column for Edit block.

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

Evidence to record:

- Parser tests.
- View model tests.
- Generated app render tests.
- Browser smoke for `/site`.
- `./tmp/agent-dev.json`.
- `./tmp/test.txt`.
- `./tmp/check.txt`.

### TAO-04 ordering model and move menu

Status: planned.

Goal: add table-local sparse rank ordering and generated move menu controls.

Tasks:

- Add table `ordering`.
- Validate ordering field exists.
- Validate ordering field is a number field.
- Reject `integer: true` ordering fields.
- Validate ordering scope fields exist.
- Add ordering facts to table view model.
- Add isolated rank calculation helper.
- Sort table rows by rank inside table renderer.
- Add generated move to top, move up, move down, and move to bottom controls.
- Merge ordering controls into `invokeAction` dropdown when `includeOrdering` is true.
- Auto-insert menu column only when needed and not explicit.
- Change Site `blockPlacement.order` to non-integer number.
- Seed or normalize sparse order values if needed.
- Hide or remove raw editable `order` column from Site placement table.

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

Evidence to record:

- Parser tests.
- Rank helper unit tests.
- Generated table render/action tests.
- Browser smoke for `/site`.
- `./tmp/agent-dev.json`.
- `./tmp/test.txt`.
- `./tmp/check.txt`.

### TAO-05 drag reorder

Status: planned.

Goal: add dnd-kit drag handle ordering.

Tasks:

- Add `@dnd-kit/react`.
- Add explicit `orderingHandle` column.
- Auto-insert handle column only when ordering asks for drag handle and no column exists.
- Wire dnd-kit sortable rows.
- Use a dedicated drag handle ref.
- Use dnd-kit grouping by ordering scope.
- Validate scope again on drop.
- Patch only on drop.
- Keep row menu move commands as keyboard-friendly ordering controls.
- Prevent cross-scope drag/drop.
- Preserve table footer and readiness warning row behavior.

Acceptance:

- Drag handle renders when declared.
- Drag handle and row menu are separate utility columns.
- Dragging within one scope visually reorders rows.
- Dropping within one scope patches the moved row rank.
- Cross-scope drop is rejected or ignored.
- Dragging does not patch during hover.
- Move menu still works without pointer drag.
- Browser smoke verifies `/site` drag behavior if feasible through `bun browser`.

Evidence to record:

- Generated table tests.
- Browser smoke for `/site`.
- `./tmp/agent-dev.json`.
- `./tmp/test.txt`.
- `./tmp/check.txt`.

### TAO-06 closeout

Status: planned.

Goal: smoke the shipped table action and ordering work and prepare promotion notes.

Tasks:

- Smoke `/site`.
- Smoke `/tasks`.
- Smoke `/rates`.
- Verify public pages still render if Site schema changed.
- Update PRD status and chunk table.
- Record blockers.
- Record promote notes.

Acceptance:

- `./tmp/agent-dev.json` shows dev ready, tests pass, and checks pass.
- `./tmp/test.txt` shows passing tests after `bun start`.
- `./tmp/check.txt` shows passing checks after `bun start`.
- `/site` browser smoke covers edit child block and ordering controls.
- `/tasks` browser smoke confirms existing collection actions still work/render.
- `/rates` browser smoke confirms existing table editing still works/renders.
- Public site route smoke passes if source Site schema or seeds changed.
- PRD status is current.
- Promote notes are ready for docs/steward pass.

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

| ID     | Status | Blocks | Notes                                                              |
| ------ | ------ | ------ | ------------------------------------------------------------------ |
| TAO-B1 | open   | TAO-05 | `@dnd-kit/react` must be added before drag reorder implementation. |

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
- docs/steward promotion work that coordinates roadmap/current updates.

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
- PRD 14 is ready for docs/steward promotion.

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
