---
name: Declarative app runtime
description: "Exploration notes for modeling Estii-sized apps as schema and JSON-backed screens."
last_updated: 2026-05-05
---

# Declarative app runtime

Status: exploration.
Not a PRD.

Source:

- Estii app browser exploration at `https://app.estii.local`, signed in as `david@estii.com`.
- Formless current schema runtime: `doc/current.md`, `src/shared/schema-types.ts`, `schema/apps/tasks/schema.json`, `schema/apps/rates/schema.json`.

## Question

Can Formless describe an Estii-sized app as runtime data without baking in Estii nouns?

Working answer:

- Yes for app shape, screens, queries, forms, lists, tables, boards, tabs, dialogs, modes, permissions, and most action wiring.
- No for all domain behavior as plain JSON.
- Domain behavior should sit behind named, typed extensions.
- JSON should compose the app.
- Code should provide generic primitives and extension contracts.

## What Estii showed

Observed screens:

- Pipeline board: `/estii`.
- Forecast dashboard: `/estii/forecasts`.
- Resource tables: `/estii/roles`, `/estii/streams`, `/estii/products`.
- Theme editor: `/estii/themes`.
- Settings forms: `/estii/settings`, `/estii/settings/estimation`, `/estii/settings/features`, `/estii/settings/members`.
- Workflow settings: `/estii/settings/workflow/automations`.
- Deal detail tabs: `/estii/deals/iRi5Jpwl`.
- Create deal wizard from `/estii`.
- Stream and product edit dialogs.

Repeated screen parts:

- App shell with primary nav, account menu, help links, mode controls.
- Settings shell with secondary nav and account links.
- Banner/header rows with title, summary fields, status, primary action, more menu.
- Query tabs with counts.
- Board columns grouped by status.
- Inline editable table/list rows.
- Row actions, add-row affordances, subtotals.
- Dialog detail editors over index screens.
- Wizard-style create flow with defaults and validation-gated progress.
- Record detail tabs with nested tabs.
- Summary panels, charts, timelines, funnels, and activity feeds.
- Help footer links.

Mode behavior:

- Pipeline and deal screens have Sales and Delivery modes.
- Deal detail also has Client mode.
- Mode changes alter visible values, available actions, and warnings.
- Client mode asks for confirmation before entering.

## What Formless already has

Current runtime data:

- Entities, fields, mutations, queries, item views, table views, and views: `src/shared/schema-types.ts`.
- Schema parsing: `src/shared/schema.ts`.
- Generic app UI routes and renderers: `src/app.tsx`, `src/app/generated/collection.tsx`, `src/app/generated/table.tsx`, `src/app/generated/create.tsx`.
- Generic create and patch policies: `schema/apps/tasks/schema.json`, `schema/apps/rates/schema.json`.
- Context-scoped collection view: `rateHome` in `schema/apps/rates/schema.json`.
- Named entity actions: `clearCompletedTasks`, `regenerateMissingRates`.
- Flat records and view/query composition: `doc/current.md`.

Current gap:

- Formless has collection and create views.
- Estii needs screen composition, nested views, mode projections, richer result types, computed values, and plugin views.

## Proposed model

Keep the data model flat.
Compose in query and view layers.

Top-level schema areas:

- `entities`: record types, fields, constraints, generic mutations.
- `queries`: named record selections, joins, filters, sort, context input.
- `computes`: named derived values and aggregates.
- `actions`: generic mutations and named commands.
- `views`: reusable visual definitions over records or computed data.
- `screens`: routes, shells, headers, tabs, panes, dialogs, and command bars.
- `modes`: named projections such as Sales, Delivery, Client.
- `policies`: field, action, route, and mode access rules.
- `workflows`: event, condition, and action definitions.
- `extensions`: registered custom renderers, editors, validators, actions, and engines.

Small shape:

```json
{
  "screens": {
    "dealDetail": {
      "route": "/deals/:dealId",
      "layout": "recordDetail",
      "record": { "entity": "deal", "id": "$route.dealId" },
      "header": "dealHeader",
      "tabs": ["overview", "estimate", "scope", "schedule", "proposal", "settings"],
      "modes": ["sales", "delivery", "client"]
    }
  }
}
```

This should name app parts, not render React trees.

## Boilerplate to remove

Likely declarative:

- Routes and nav items.
- Shell selection.
- Header fields and actions.
- Tabs and selected tab state.
- Query tabs, counts, and filters.
- Lists, tables, boards, trees, and empty states.
- Form fields, defaults, validation, save/revert buttons.
- Dialogs and create wizards.
- Help links.
- Simple confirmation dialogs.
- Mode-specific visibility.
- Per-field display, edit, commit policy.
- Per-row add, duplicate, delete, archive, move, and link actions.
- Aggregates such as count, sum, average, min, max, percent, and status totals.

Likely extension-backed:

- Pricing engines.
- Schedule engines.
- Forecast generation.
- Proposal pagination and rendering.
- Rich text document blocks.
- Timeline and chart renderers.
- Workflow connector auth and execution.
- Importers.
- Presence and collaborative cursors.

## Generic view primitives

Needed view types:

- `collection.list`
- `collection.table`
- `collection.board`
- `collection.tree`
- `record.detail`
- `form`
- `wizard`
- `dialog`
- `dashboard`
- `chart`
- `timeline`
- `activity`
- `document`
- `settingsGroup`
- `workflowBuilder`
- `pluginView`

Each view should declare:

- Data source.
- Context inputs.
- Columns, fields, or slots.
- Editors and display formatters.
- Actions.
- Visibility rules.
- Empty state.
- Help link.

## Modes and projections

Modes should be first-class runtime data.

Examples from Estii:

- Sales mode shows customer-facing value and approval actions.
- Delivery mode shows internal cost and resource values.
- Client mode hides sensitive navigation and asks for confirmation.

Declarative pieces:

- Allowed modes per screen.
- Default mode.
- Confirmation when entering a mode.
- Field visibility by mode.
- Action availability by mode.
- Value projection by mode.
- Route and nav visibility by mode.

Mode rules should affect generated UI and server-side action authorization.

## Extension contract

Plain JSON should not encode complex business math.

Use named extensions:

```json
{
  "type": "pluginView",
  "plugin": "pricing.tierEditor",
  "inputs": {
    "product": "$route.productId"
  }
}
```

Extension types:

- `editor`: custom field or row editor.
- `display`: custom read-only value.
- `view`: custom rendered region.
- `compute`: derived value or aggregate.
- `action`: command executed by authority.
- `validator`: rule checked before commit.
- `workflowConnector`: external trigger or action.

Extension rules:

- Extensions receive typed inputs.
- Extensions return typed outputs.
- Extensions cannot mutate records directly unless registered as actions.
- Authority rechecks invariants.
- Schema stores extension names and input wiring, not implementation code.

## Authoring model

Two authoring levels:

- JSON/source schema for agents and version control.
- Generated editor UI for humans.

Good authoring path:

- Start with entity fields and generic collection views.
- Add computed fields and aggregates.
- Add screen layout.
- Add modes and policies.
- Add extensions only where generic primitives run out.

## Possible PRDs later

Do not start with one PRD called "make Estii declarative."

Likely split:

- Layout and screen schema.
- Rich collection result types: board, tree, grouped table.
- Mode and policy projections.
- Computed values and aggregate query outputs.
- Extension registry and plugin contracts.
- Dialog and wizard schema.
- Workflow action contract.
- Document/proposal view contract.
- Schema authoring UI.

First good PRD:

- Add screen/layout schema on top of existing collection/create views.
- Keep it source-only at first.
- Prove it with Tasks and Rates before modeling Estii.

## Open questions

- How much layout should JSON own before it becomes React by another name?
- Should computed values live in schema, extension code, or both?
- How are schema migrations versioned?
- How are extension inputs typechecked?
- How are mode policies enforced on the authority, not only in UI?
- How are custom views tested without snapshot-heavy brittle tests?
- Can the schema editor stay generic once screens have nested layout and plugins?
- What is the minimum useful screen schema after current collection/create views?

## Near-term stance

Keep current first-release roadmap intact.

Use this document as a map for later PRDs.
The near-term Formless path is still:

- Flat records.
- Query/view composition.
- Generic mutations.
- Named authority actions.
- Small schema additions proven by current sample apps.
