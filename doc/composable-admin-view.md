# Composable Generated Admin Views

Last updated: 2026-07-22

Status: proposal for iteration.

This is not a shipped behavior contract. Shipped behavior belongs in
`openspec/specs/app-schema/spec.md` and
`openspec/specs/generated-ui/spec.md`.

## Purpose

Make generated admin screens composable from query results, named record
selections, result presentations, and typed bindings.

A query result should be usable as a selectable collection. The selected
record ids should be reusable as inputs to dependent queries, record results,
create defaults, and operation inputs. Selected state may optionally be encoded
in the URL.

The primitive should support interfaces such as:

- tabs selecting a project and a table showing that project's tasks;
- a list selecting a customer and a record result showing customer detail;
- a selector choosing one or more audiences and a table showing matching
  subscriptions;
- a URL that restores the selected query preset and records after navigation or
  reload.

Tabs, lists, and selectors are presentations of selection. They are not
separate dataflow concepts.

## Summary

Introduce screen-scoped, named record selections.

Each selection has:

- a source query result;
- an entity;
- cardinality of one or many;
- an explicit default policy;
- zero or more presentations;
- optional URL persistence.

Queries declare typed inputs. A screen binds query inputs to selections or
literal values. Results may consume a query result, a selection, or both.

The generated runtime resolves the resulting screen dependency graph against
the browser replica. The Presentation boundary receives complete selectable and
result contracts. The renderer displays those contracts and dispatches
semantic intents without reading schema, evaluating queries, or owning durable
selection policy.

## Existing Vertical Slice

`CollectionContextSchema` already implements a constrained form of this model.

Current flow:

1. `CollectionContextSchema.query` selects context records.
2. `createEntityRecordOptionsMatchingQuerySelector` projects record ids and
   labels.
3. `selectGeneratedContextSelectionFacts` chooses one record, falling back to
   the first available option.
4. The runtime exposes that id in `QueryEvaluationContext.values` under the
   context name.
5. The collection query evaluates against that context.
6. The selected record may also drive context detail, create defaults, and
   collection operations.

The Site editor proves the model with `blockSiteRoots` and
`placementsForSelectedBlock`. The rate-card fixture proves the same model with
card selection and a dependent rate table.

Relevant implementation boundaries:

- schema contracts: `lib/schema/src/types.ts`;
- context and query validation:
  `lib/schema/src/schema-collection-contexts.ts`;
- portable query parsing and evaluation: `lib/schema/src/query.ts`;
- collection model selection:
  `lib/formless/src/client/collection-shell-model.ts`;
- replica query selectors: `lib/formless/src/client/projections.ts`;
- active context selection: `lib/formless/src/client/generated-authoring.ts`;
- screen evaluation:
  `lib/formless/src/app/generated/generated-workspace-foundation.ts`;
- route-owned state: `lib/formless/src/app/routes/home-selection.tsx`;
- renderer-neutral workspace contracts: `lib/presentation/src/contract.ts`;
- collection rendering:
  `lib/renderer/src/components/workspace-collection-renderer.tsx`.

The proposal generalizes this path. It does not introduce a second selection
system beside collection context.

## Current Constraints

The current behavior is coupled to one collection view:

- a collection has at most one context;
- the context supplies only that collection's query context;
- selection is always one record;
- an absent or invalid selection falls back to the first available record;
- context query values are scalar record ids;
- context predicates apply to reference fields with `eq`;
- presentation is limited to context-specific tabs, list-detail, singleton, or
  external navigation behavior;
- query, context, tree, and record selections use separate runtime state and
  intents;
- screen sections cannot declare dependencies on another section's selection;
- selection state is in-memory React state keyed by screen and section;
- screen paths are static and selection is not encoded in route or search
  state.

The main record result can accept a selected record id, but a screen cannot bind
that id to an independently presented collection selection. Without such a
binding it selects the first record returned by its query.

## Terminology

### Query

An existing schema-declared record filter over one entity. A query may declare
typed inputs referenced by its expression.

### Query result

The ordered record ids produced by evaluating a query with complete inputs
against the current browser replica.

### Record selection

Screen state containing zero, one, or multiple record ids from one source query
result. Selections store ids, not nested records.

This proposal's record selection is UI and query state. It does not introduce
the reserved `selection` operation scope or define bulk-operation semantics.

### Selection presentation

A renderer-neutral projection of selectable records and current selected state.
Examples include tabs, list, select control, and selectable table rows.

### Binding

A schema declaration connecting a selection or literal to a typed consumer
input. Bindings carry values. They do not contain query, result, or operation
behavior.

### Persistence

The policy for initializing and updating selection state from memory, URL
search parameters, or a future route path binding.

## Design Principles

### Keep records flat

Selection state contains record ids. Query evaluation resolves records from the
browser replica. No selected record is nested into another stored record or
schema object.

### Separate source, state, presentation, and consumption

A query selects available records. A record selection owns selected ids. A
presentation exposes interaction. Bindings pass selected ids to consumers.

Changing tabs to a list must not change query or selection semantics. Showing
the same selection in two places must not create two independent selections.

### Keep query-preset selection distinct

Existing query tabs choose one query definition from a collection's configured
query slots. Record selection chooses records returned by a query.

Both may render as tabs and use the same URL-state infrastructure, but a
selected query key is not a record id and cannot satisfy a record input.

### Make dependencies explicit

Screens declare which selection supplies each query or result input. Generated
runtime must not infer dataflow from section order, matching names, entity
relationships, or presentation type.

### Keep policy in runtime

Schema declares selection and persistence policy. Runtime validates current
state, applies defaults, evaluates dependencies, and owns navigation effects.
Presentation receives resolved data and emits intents.

### Avoid a general reactive language

The first contract should support typed query inputs, named record selections,
result bindings, and URL state. It should not introduce arbitrary expressions,
event handlers, component graphs, or executable schema callbacks.

## Proposed Model

The exact JSON grammar remains open. This sketch shows the intended ownership
and type relationships.

```json
{
  "queries": {
    "projectAll": {
      "label": "All projects",
      "entity": "project",
      "expression": { "kind": "all" }
    },
    "tasksForProject": {
      "label": "Project tasks",
      "entity": "task",
      "inputs": {
        "project": {
          "type": "recordId",
          "entity": "project",
          "cardinality": "one"
        }
      },
      "expression": {
        "kind": "where",
        "ref": { "kind": "value", "name": "project" },
        "op": "eq",
        "value": { "kind": "input", "name": "project" }
      }
    }
  },
  "screens": {
    "projectWorkspace": {
      "type": "workspace",
      "label": "Projects",
      "path": "/",
      "selections": {
        "project": {
          "entity": "project",
          "source": { "query": "projectAll" },
          "cardinality": "one",
          "default": "first",
          "persistence": {
            "kind": "search",
            "key": "project"
          }
        }
      },
      "layout": {
        "type": "stack",
        "sections": [
          {
            "id": "project-selector",
            "type": "selection",
            "selection": "project",
            "presentation": "tabs",
            "itemView": "projectTab"
          },
          {
            "id": "project-detail",
            "type": "record",
            "selection": "project",
            "itemView": "projectDetail"
          },
          {
            "id": "tasks",
            "type": "collection",
            "view": "projectTasks",
            "inputs": {
              "project": { "kind": "selection", "selection": "project" }
            }
          }
        ]
      }
    }
  }
}
```

This produces one named `project` selection. The tab presentation updates it.
The record section reads the selected project id. The task collection binds it
to the `tasksForProject.project` query input. URL search state restores it.

The final grammar should reuse existing collection views and canonical result
models where possible. It should not duplicate item, record, list, table, or
tree view declarations inside screen sections.

## Query Inputs

Replace context-only dynamic values with typed query inputs.

Each input declares:

- value type, initially `recordId` or scalar;
- referenced entity for `recordId`;
- cardinality of one or many;
- whether an absent value is allowed.

The parser validates:

- every expression input reference has a declaration;
- every declared input is used;
- a record-id input targets the entity expected by the filtered reference
  field;
- `eq` consumes one value;
- a future `in` operator consumes many values;
- a binding supplies the declared type and cardinality.

`QueryEvaluationContext` should become an evaluated input map rather than a
collection-context-specific transport. `today` remains a runtime input with its
existing date semantics.

An unresolved required input does not broaden a query to all records. The query
result is unavailable until the input resolves. An optional absent input needs
explicit expression semantics before it is supported.

## Record Selection

A record selection declares:

- stable screen-local name;
- entity;
- source query and its input bindings;
- cardinality;
- default policy;
- optional persistence policy.

Single-selection default policies:

- `first`: select the first available source record;
- `none`: remain unselected;
- `required`: remain unavailable until the user selects a record.

Many-selection default policies should initially be `none` or `all`. A maximum
selection count may be added only for a concrete UI or operation requirement.

When records or upstream inputs change:

- retain selected ids still present in the source result;
- remove selected ids no longer present;
- apply the declared default only after reconciliation;
- preserve source query ordering when projecting selected records;
- expose empty or unavailable state explicitly when no valid selection exists.

Selection state is screen-scoped in the first version. Cross-screen or
cross-app selection is out of scope.

## Result Bindings

Results consume resolved values without owning selection state.

Supported first-pass bindings:

- collection query input from one selection;
- record result record id from a single selection;
- create default from a single selection;
- operation input from a single selection where the operation input already
  declares the matching record-id type.

Multiple consumers may bind to one selection. One consumer may bind inputs from
multiple selections when that does not create a dependency cycle.

Many-selection input to bulk operations is out of scope. That requires the
separate reserved selection-scoped operation contract.

## Presentation

Presentation should be orthogonal to selection behavior.

Initial presentations:

- `tabs`: compact single selection from a small result;
- `list`: visible single or many selection;
- `select`: compact single selection using a select or combobox control;
- `table`: row selection composed with a canonical table result.

Schema chooses the semantic presentation. Runtime projects:

- stable selection and option identities;
- labels and optional count text;
- selected state;
- availability;
- cardinality;
- semantic selection intents.

Renderer chooses concrete controls and responsive layout. It must not infer
cardinality, default policy, persistence, query bindings, or selected records
from presentation names.

`listDetail` should become composition rather than a special collection
context: one list presentation of a selection, one record result bound to that
selection, and any dependent collection results. A layout preset may preserve
the common arrangement without retaining separate dataflow semantics.

Query-preset navigation remains a distinct contract. It may share visual tabs
and common selection-control leaves with record-selection presentation.

## Screen Dataflow

The schema parser builds and validates a directed dependency graph.

Possible nodes:

- query evaluation;
- record selection reconciliation;
- query-preset state;
- result projection;
- create or operation input projection.

Possible edges are declared bindings. The parser rejects:

- unknown selections, queries, views, or inputs;
- entity or cardinality mismatches;
- duplicate persistence keys in one route;
- direct or transitive cycles;
- a result requiring an unresolved input without an unavailable presentation.

Runtime evaluates nodes in dependency order against one browser-replica
snapshot and the current route state. Section order remains layout order and
does not determine evaluation order.

## URL State

Phase one should support URL search parameters.

Example:

```text
/projects?project=project-123&taskQuery=active
```

Runtime behavior:

1. Parse search state at route entry and on browser history navigation.
2. Validate record ids against the selection's current source query result.
3. Reconcile invalid or deleted ids using the selection's default policy.
4. Project canonical state back to the URL when required.
5. Update the URL after selection intents without remounting the app or losing
   unrelated search parameters.

Persistence should declare history behavior:

- `push` for navigational state that should participate in Back and Forward;
- `replace` for ephemeral or canonicalization updates.

Many-selection search encoding should use repeated parameters in canonical
source order:

```text
?audience=audience-a&audience=audience-b
```

Parameterized screen paths require a separate routing extension because screen
paths are currently static. The selection and binding model should not depend
on path parameters. A later path persistence policy can reuse the same runtime
selection state.

## Migration From Collection Context

Replace current context behavior rather than retain a compatibility layer.

Current declarations map as follows:

| Current context fact | Proposed owner |
| --- | --- |
| `name` | screen selection name |
| `entity` | selection entity |
| `query` | selection source query |
| `labelField` | selection item projection |
| `presentation` | selection presentation or layout preset |
| `itemView` | record result or selection item presentation |
| selected context id | screen selection state |
| query `{ kind: "context" }` | typed query input binding |
| create default `{ kind: "context" }` | selection binding |
| `contextLink` target | generic set-selection intent |

Context navigation groups require grouped selection sources or multiple source
queries presented as one selection. The selected record ids still belong to
one entity and one named selection.

Relationship validation remains schema relationship and query-input
validation. A relationship must not be required merely to connect a selection
to a query when the reference field and typed input already prove the target.

Bundled Site schema and the rate-card fixture should move to the new contract in
the same change. No deprecated context parser or renderer path should remain.

## Runtime And Package Boundaries

### Schema package

Own:

- query input, selection, binding, and persistence declarations;
- parse and static validation;
- dependency graph validation;
- runtime-neutral query input matching.

Do not own browser route state, replica subscriptions, or React behavior.

### Formless client and generated runtime

Own:

- evaluating queries against browser-replica snapshots;
- reconciling selected ids;
- evaluating the screen dependency graph;
- selecting result models;
- resolving create and operation inputs;
- projecting complete Presentation contracts;
- applying selection intents and reporting unavailable state.

### Application routing

Own:

- reading and writing URL state;
- Back and Forward synchronization;
- preserving unrelated route state;
- mapping route state to generated runtime selection state.

### Presentation package

Own:

- renderer-neutral selectable contracts;
- selected and available option facts;
- semantic record-selection intents;
- canonical result references and composition.

Do not expose schema queries, raw records, bindings, persistence policy, or
runtime callbacks.

### Renderer

Own:

- tabs, lists, select controls, and selectable table presentation;
- accessible selection interaction;
- dispatching projected intents.

Do not evaluate queries, mutate URLs, reconcile selected ids, or resolve
dependent results.

## Delivery Slices

### 1. Typed single-record inputs and selections

- Add query input, screen selection, and binding schema contracts.
- Validate single-record dependency graphs.
- Replace collection context in bundled schemas and fixtures.
- Evaluate named single selection and dependent collection queries.

This slice should preserve current Site and rate-card behavior through the new
primitive.

### 2. Composable result and selection presentations

- Project one canonical selectable contract.
- Bind record results and collection results to named selections.
- Render tabs, list, and select presentations.
- Replace special list-detail dataflow with ordinary composition.

### 3. URL search persistence

- Hydrate declared selection and query-preset state from search parameters.
- Update history from selection intents.
- Reconcile stale URL state and support Back and Forward.

### 4. Many selection

- Add list-valued query inputs and the `in` operator.
- Add many-selection reconciliation and URL encoding.
- Add many-selection list and table presentation.

This slice does not add selection-scoped operations.

### 5. Optional path persistence

- Define parameterized screen path grammar.
- Bind eligible single selections to path segments.
- Preserve the same selection reconciliation and result binding semantics.

This is independent of search-parameter persistence and may remain deferred.

## Non-Goals

- nested stored records;
- arbitrary client-side expression or component graphs;
- executable JavaScript callbacks in schema;
- custom React component names in app schema;
- cross-app or cross-instance selection state;
- server-owned durable UI selection state;
- selection-scoped bulk operations;
- workflow state;
- retaining deprecated collection-context aliases or compatibility shims;
- inferring dependencies from relationships, section order, or matching names.

## Open Questions

1. Should the schema term be `selection`, `recordSelection`, or `viewState` to
   avoid confusion with the reserved operation scope?
2. Should selections be declared directly on screens, or should a reusable view
   declare an unbound selection output that a screen names and binds?
3. Should query inputs replace `{ kind: "context" }` entirely, or should
   `context` remain the runtime-neutral term for all supplied query values?
4. Should selection item labels use a field declaration, an item view, or a
   small read-model projection?
5. Should `list`, `tabs`, and `select` be presentations of one item-result model,
   while table and tree remain distinct canonical results?
6. Should selecting a record default to URL `push` or `replace` history?
7. Should a `required` unselected state make only dependent results unavailable,
   or the complete screen?
8. Should grouped selection sources be part of the first contract because Site
   root navigation already needs them?
9. Should query-preset selection use the same screen-state declaration and URL
   codec while remaining a different value type?
10. Is many-selection query filtering sufficiently covered by `in`, or do
    concrete apps require `containsAll`, `containsAny`, or relationship-aware
    joins before that contract is introduced?

## Acceptance Direction

The design is successful when an app schema can declare one query-backed record
selection, present it as tabs or a list, bind it to both a record result and a
dependent collection query, and restore the selected record from the URL
without app-specific React code.

Changing the selection presentation must not change its source, selected state,
bindings, URL encoding, or dependent query behavior.
