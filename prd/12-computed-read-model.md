# PRD 12: Computed and aggregate read model

Status: in progress
Current chunk: CR-02 numeric expression evaluator
Last updated: 2026-05-06

## Goal

Add a narrow read-model layer for derived display values.

The first version should:

- keep stored records flat;
- keep generic writes unchanged;
- keep query filtering over stored fields only;
- add schema-declared, read-only computed values over one record;
- add schema-declared aggregates over query result records;
- render computed values and aggregates through existing generated view surfaces;
- prove the model with the rate-card app;
- stay small enough to avoid a full computed graph engine.

This PRD is about display-time read models. It is not about persisted derived state,
dependency tracking, workflow automation, or authority-side computed invariants.

## Problem

Formless can model flat records, queries, views, generic mutations, and named actions.

That is enough to edit records, but not enough to show basic business output without
duplicating data or hard-coding app logic into generated React.

Current examples:

- Rate records store `cost`, `price`, `costUnit`, and `currency`.
- The rate table can show stored cost and price with suffixes.
- The rate table cannot show read-only margin or markup.
- A rate-card workspace cannot show cost total, price total, average margin, or rate count
  except for the existing count badge path.
- Future Estii-sized screens need totals, subtotals, status summaries, and simple arithmetic
  before they need a general compute engine.

The missing layer is a schema-backed read model:

- schema declares derived values;
- runtime validates references;
- browser evaluates against local replica records;
- generated views render read-only outputs;
- authority writes and storage remain unchanged.

## Source map

Existing anchors:

- Current runtime docs: `doc/current.md`.
- Release target docs: `doc/roadmap.md`.
- Declarative runtime exploration: `doc/explorations/declarative-app-runtime.md`.
- App schema types: `src/shared/schema-types.ts`.
- App schema parser: `src/shared/schema.ts`.
- View parser: `src/shared/schema-views.ts`.
- Query parser/evaluator: `src/shared/query.ts`.
- Field display behavior: `src/shared/field-types.ts`.
- View model selection: `src/client/views.ts`.
- Client store query selectors: `src/client/store.ts`.
- Generated table renderer: `src/app/generated/table.tsx`.
- Generated field display: `src/app/generated/record-field-display.tsx`.
- Generated formatting helpers: `src/app/generated/format.ts`.
- Rate-card source schema: `schema/apps/rates/schema.json`.
- Schema parser tests: `src/shared/schema.test.ts`.
- Query tests: `src/shared/query.test.ts`.
- View model tests: `src/client/views.test.ts`.
- Store tests: `src/client/store.test.ts`.
- App tests: `src/app.test.tsx`.

Owned files:

- `prd/12-computed-read-model.md`.

Likely changed files:

- `src/shared/schema-types.ts`.
- `src/shared/schema.ts`.
- `src/shared/schema-views.ts`.
- `src/shared/read-model.ts`.
- `src/shared/read-model.test.ts`.
- `src/shared/schema.test.ts`.
- `src/client/views.ts`.
- `src/client/views.test.ts`.
- `src/client/store.ts`.
- `src/client/store.test.ts`.
- `src/app/generated/table.tsx`.
- `src/app/generated/collection.tsx`.
- `src/app/generated/format.ts`.
- `src/app.test.tsx`.
- `schema/apps/rates/schema.json`.

## Requirements

### Runtime behavior

- Existing source schemas parse unchanged.
- Existing active schemas without read-model declarations keep rendering unchanged.
- Stored record values stay unchanged.
- Generic create, patch, action, schema, reset, sync, and push-sync paths stay unchanged.
- Computed values are read-only.
- Aggregates are read-only.
- Computed values and aggregates evaluate against the browser local replica.
- Missing records, missing references, invalid arithmetic, and divide-by-zero render empty or warning-safe output instead of crashing.
- Computed display updates when pushed sync or local broadcast changes the underlying records.
- Query count badges keep working.
- Table suffixes and number formats keep working.
- No storage, authority write, sync protocol, or mutation shape changes.

### Schema behavior

- Add an optional top-level map for read-model declarations.
- Initial computed values are entity-scoped.
- Initial computed values return scalar display values.
- Initial computed value type is `number`.
- Initial computed expressions can reference number fields on the same record.
- Initial arithmetic operators are add, subtract, multiply, and divide.
- Literal number values are supported.
- Bad field references fail at schema parse time.
- Non-number field references in numeric expressions fail at schema parse time.
- Unsupported operators fail at schema parse time.
- Cycles are rejected if computed values can reference other computed values.
- Initial aggregates are query-scoped.
- Initial aggregate functions are count, sum, average, min, and max.
- Aggregates can read a number field or a number computed value from each record in the query result.
- Aggregates using a query with context evaluate with the active collection context.
- Bad aggregate query references fail at schema parse time.
- Bad aggregate value references fail at schema parse time.
- `stringifySchema` preserves read-model declarations.

### Generated UI behavior

- Table views can include read-only computed columns.
- Computed table columns use existing width, alignment, suffix, and format options where possible.
- Collection views can include summary display slots for aggregates.
- Aggregate summary slots render near the collection result, not inside editable rows.
- One aggregate failure does not prevent the rest of the collection from rendering.
- Empty aggregate inputs render predictably.
- Computed and aggregate outputs are not editable.
- Generated UI does not know arithmetic details; it consumes render-ready read-model configs.

### Future fit

- Future screens can place aggregate summary slots without changing aggregate definitions.
- Future grouped tables can reuse aggregate evaluation per group.
- Future boards can reuse count and sum aggregates per column.
- Future dashboards can reuse aggregate definitions.
- Future extension-backed computes can sit behind the same read-model boundary.
- Future authority invariants can choose explicit named computes, but this PRD does not add them.

## Proposed schema shape

Initial rate-card shape:

```json
{
  "readModels": {
    "computedValues": {
      "rateMargin": {
        "entity": "rate",
        "type": "number",
        "expression": {
          "kind": "binary",
          "op": "divide",
          "left": {
            "kind": "binary",
            "op": "subtract",
            "left": { "kind": "field", "field": "price" },
            "right": { "kind": "field", "field": "cost" }
          },
          "right": { "kind": "field", "field": "price" }
        }
      }
    },
    "aggregates": {
      "selectedCardCostTotal": {
        "query": "ratesForSelectedCard",
        "function": "sum",
        "value": { "kind": "field", "field": "cost" }
      },
      "selectedCardPriceTotal": {
        "query": "ratesForSelectedCard",
        "function": "sum",
        "value": { "kind": "field", "field": "price" }
      },
      "selectedCardAverageMargin": {
        "query": "ratesForSelectedCard",
        "function": "average",
        "value": { "kind": "computed", "computedValue": "rateMargin" }
      }
    }
  }
}
```

Initial table column shape:

```json
{
  "type": "computed",
  "computedValue": "rateMargin",
  "label": "Margin",
  "align": "end",
  "width": "sm",
  "format": "percent",
  "display": "readOnly"
}
```

Initial collection summary shape:

```json
{
  "summary": [
    {
      "type": "aggregate",
      "aggregate": "selectedCardCostTotal",
      "label": "Cost total",
      "format": "currency"
    },
    {
      "type": "aggregate",
      "aggregate": "selectedCardAverageMargin",
      "label": "Average margin",
      "format": "percent"
    }
  ]
}
```

Notes:

- The exact key names can change during implementation if parser ergonomics prove a better shape.
- Read-model declarations stay separate from stored entity fields.
- Query filters do not reference computed values in this PRD.
- Aggregates evaluate over the records selected by existing queries.

## Decisions

| ID    | Decision                                                    | Reason                                                                 | Evidence                                                    |
| ----- | ----------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| CR-D1 | Keep computed values read-only and display-time first.      | Flat stored records and generic writes are core runtime bets.          | `doc/overview.md`, `doc/current.md`                         |
| CR-D2 | Do not add a full computed graph engine.                    | The first release needs simple derived display, not dependency graphs. | `doc/roadmap.md`                                            |
| CR-D3 | Start with numeric same-record expressions.                 | Rate margins and markups prove value without cross-record traversal.   | `schema/apps/rates/schema.json`                             |
| CR-D4 | Start aggregates over existing query outputs.               | Queries already define collection membership and context behavior.     | `src/shared/query.ts`, `src/client/store.ts`                |
| CR-D5 | Render through table and collection summary surfaces first. | PRD 10 owns screen composition; this PRD should not compete with it.   | `prd/10-declarative-screen-runtime.md`                      |
| CR-D6 | Keep React out of the read-model evaluator.                 | The evaluator should be testable and reusable by view models.          | `src/shared/query.ts`, `src/shared/field-types.ts`          |
| CR-D7 | Treat invalid runtime arithmetic as empty display output.   | Existing records may have zeros or missing optional values.            | `src/app/generated/record-field-display.tsx`                |
| CR-D8 | Use existing number formatting options where possible.      | Table columns already support number, currency, and percent display.   | `src/app/generated/format.ts`, `src/shared/schema-types.ts` |

## Chunks

| ID    | Status  | Depends on   | Main files                                                      | Acceptance                                                                                                      |
| ----- | ------- | ------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| CR-01 | shipped | none         | tests, PRD                                                      | Current rate table display, query count, context query, and missing derived values are characterized.           |
| CR-02 | draft   | CR-01        | `src/shared/read-model.ts`, tests                               | Numeric expression evaluator supports fields, literals, arithmetic, invalid math, and deterministic formatting. |
| CR-03 | draft   | CR-02        | schema types/parser, schema tests                               | Optional read-model declarations parse, validate references, reject bad shapes, and stringify.                  |
| CR-04 | draft   | CR-03        | view model selection, generated table, tests                    | Read-only computed table columns render for records and update when records change.                             |
| CR-05 | draft   | CR-03        | client store/read model selectors, collection summary UI, tests | Aggregate summary slots evaluate over current query results and active collection context.                      |
| CR-06 | draft   | CR-04, CR-05 | `schema/apps/rates/schema.json`, app tests                      | Rate-card source schema shows margin and totals without storage or write changes.                               |
| CR-07 | draft   | CR-06        | Browser smoke, `prd/12-computed-read-model.md`                  | Rates smoke passes; PRD status, decisions, blockers, and promote notes are current.                             |

## Chunk details

### CR-01 read-model characterization

Outcome:

- Rate table stored cost and price display behavior is characterized in `src/app.test.tsx`.
- Rate table number suffix and format behavior is characterized in `src/app.test.tsx` and `src/client/views.test.ts`.
- Rate context query behavior is characterized in `src/client/store.test.ts`.
- Query count badge behavior is characterized in `src/app.test.tsx`.
- Current absence of computed/aggregate read-model declarations is documented in `src/shared/schema.test.ts` and `src/client/views.test.ts`.
- No runtime behavior change.

Evidence:

- `./tmp/test.txt`: 22 files passed, 407 tests passed.
- `./tmp/check.txt`: formatting, lint, and type checks passed for 151 files.

### CR-02 numeric expression evaluator

Add a deep shared read-model evaluator with no React dependency.

Acceptance:

- Field references read number values from a stored record.
- Literal number expressions evaluate.
- Add, subtract, multiply, and divide evaluate.
- Divide-by-zero returns no value, not `Infinity`.
- Missing or non-number runtime values return no value.
- Evaluator output is deterministic and side-effect free.
- Tests cover nested expressions.

### CR-03 parser and schema surface

Add optional read-model declarations and parser validation.

Acceptance:

- `AppSchema` includes optional read-model declarations.
- A schema with no read-model declarations still parses.
- A numeric computed value over same-record fields parses.
- A computed value referencing a missing field fails.
- A computed value referencing a non-number field fails.
- An aggregate over a query parses.
- An aggregate referencing a missing query fails.
- An aggregate value referencing a missing field or computed value fails.
- `stringifySchema` includes parsed read-model declarations.

### CR-04 computed table columns

Render record-level computed values in existing generated tables.

Acceptance:

- Table views accept a `computed` column type.
- Computed columns are read-only.
- Computed columns expose label, width, alignment, suffix, and format to the renderer.
- Computed values update when a record patch changes source fields.
- Existing field and reference-field columns keep behavior.
- View model tests do not duplicate parser validation.

### CR-05 aggregate summary slots

Render collection-level aggregates over current query results.

Acceptance:

- Collection views accept summary slots for aggregate display.
- Count, sum, average, min, and max evaluate over query-matching records.
- Aggregates respect active query tab.
- Aggregates respect active collection context.
- Empty result sets render predictable empty or zero values by function.
- One bad runtime aggregate value does not crash the collection.
- Existing count badges keep behavior.

### CR-06 rate-card proof

Apply the read-model surface to the rate-card source schema.

Acceptance:

- Rate table shows read-only margin.
- Rate-card collection shows cost total.
- Rate-card collection shows price total.
- Rate-card collection can show average margin if runtime behavior is clear.
- Rate records remain flat.
- Rate create, patch, regenerate, reset, and sync flows keep passing.
- No authority write, storage, sync, mutation, or action files change unless implementation uncovers a real parser boundary need.

### CR-07 closeout

Verify behavior and update this PRD.

Acceptance:

- `./tmp/test.txt` shows passing tests after `bun start`.
- `./tmp/check.txt` shows passing checks after `bun start`.
- `bun browser` smoke covers `/rates`.
- `tmp/state.txt` has no unresolved issues.
- Promote notes are ready for a docs/steward pass.
- PRD status reflects shipped chunks, blockers, and decisions.

## Non-goals

- Do not store computed values on records.
- Do not add computed fields to entity field maps.
- Do not add computed query filters.
- Do not add dependency graph tracking.
- Do not add invalidation indexes.
- Do not add authority-side computed constraints.
- Do not add background recomputation.
- Do not add workflow triggers.
- Do not add custom extension-backed computes.
- Do not add cross-app aggregate queries.
- Do not add cross-app references.
- Do not add grouped tables.
- Do not add dashboards.
- Do not add charts.
- Do not add boards.
- Do not add screen placement semantics owned by PRD 10.
- Do not add editor behavior owned by PRD 11.

## Open questions

| ID    | Question                                                                   | Default for implementation                                                           |
| ----- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| CR-O1 | Should empty sum render `0` or empty?                                      | Render `0` for count and sum; render empty for average, min, and max.                |
| CR-O2 | Should computed values be allowed to reference other computed values?      | Allow only if cycle detection stays small; otherwise defer to field/literal only.    |
| CR-O3 | Should aggregate summaries live on collection views or table views?        | Start on collection views so list and table results can reuse them.                  |
| CR-O4 | Should aggregate value refs allow reference-field traversal in first pass? | No. Start with same-entity stored fields and computed values.                        |
| CR-O5 | Should percent display multiply by 100 or assume stored decimal fractions? | Reuse existing percent formatter behavior; do not create a new semantic in this PRD. |
| CR-O6 | Should schema name be `readModels`, `computedValues`, or `computes`?       | Prefer `readModels` wrapping `computedValues` and `aggregates` for clarity.          |

## Blockers

| ID    | Status | Blocks | Notes                                                                 |
| ----- | ------ | ------ | --------------------------------------------------------------------- |
| CR-B1 | open   | CR-03  | Final schema key names should be chosen before parser implementation. |

## Cross-PRD dependencies

| Dependency                        | Direction      | Notes                                                                                       |
| --------------------------------- | -------------- | ------------------------------------------------------------------------------------------- |
| PRD 10 declarative screen runtime | parallel input | This PRD should not change screen routing or layout ownership.                              |
| PRD 11 field editor expansion     | parallel input | This PRD should not change editor controls or patch semantics.                              |
| PRD 06 home view model module     | satisfied      | Generated view model selection provides the render-ready seam for table and summary config. |
| PRD 04 relationship model         | satisfied      | Rate-card context queries and relationship-backed workspaces are already available.         |
| Future grouped table PRD          | downstream     | Grouped subtotals should reuse aggregate evaluation after this PRD ships.                   |
| Future dashboard PRD              | downstream     | Dashboard cards should reuse aggregate definitions after this PRD ships.                    |

## Parallel shipping

Can ship in parallel with:

- PRD 10 chunks that avoid generated table and collection summary rendering.
- PRD 11 chunks that avoid table column schema and generated display formatting.

Should coordinate with:

- PRD 10 if it changes collection model shape in `src/client/views.ts`.
- PRD 11 if it changes number formatting in `src/app/generated/format.ts`.

Avoid parallel edits with:

- any PRD changing `src/shared/schema-types.ts`;
- any PRD changing `src/shared/schema.ts`;
- any PRD changing `src/shared/schema-views.ts`;
- any PRD changing `src/client/views.ts`;
- any PRD changing `src/app/generated/table.tsx`;
- any PRD changing `schema/apps/rates/schema.json`.

Recommended order:

1. Ship CR-01 before adding read-model schema.
2. Add and test the evaluator before parser integration.
3. Add parser validation before generated UI rendering.
4. Ship computed table columns before aggregate summaries if file ownership conflicts.
5. Prove with the rate-card source schema only after parser and renderer behavior is stable.
6. Browser smoke `/rates` in closeout.

## Progress rules

- Mark exactly one chunk as `doing` when implementation starts.
- When a chunk ships, mark it `shipped`.
- Replace shipped task detail with outcome plus evidence.
- Do not append terminal logs.
- Keep decisions in `Decisions`.
- Keep unresolved schema choices in `Open questions`.
- Put global-doc updates in `Promote after ship`.
- Update only this PRD during normal CR chunk work.
- Run `bun browser` smoke for CR-04, CR-05, CR-06, and CR-07 if generated UI behavior changes.

## Promote after ship

CR-01:

- No global-doc promotion. Characterization tests only.

When this PRD ships, update `doc/current.md`:

- Schema can declare read-model computed values and aggregates.
- Computed values are read-only display values over flat records.
- Aggregates are read-only display values over query results.
- Generated tables can render computed columns.
- Generated collections can render aggregate summary slots.
- Rate-card source schema uses read-model output for margin and totals.
- Stored records, authority writes, sync, and mutation paths remain unchanged.
- Read-model evaluator lives under shared runtime code and has tests.

When this PRD ships, update `doc/roadmap.md` only if derived display values remain first-release scope:

- Derived rate display values are covered by read-model computed values and aggregates.
- Full computed graph engine remains out of first release.

## PRD status notes

- PRD drafted 2026-05-06 from roadmap rate-card derived display need and declarative runtime exploration.
- Scope is intentionally narrower than a full compute engine.
- CR-01 shipped 2026-05-06 with characterization tests only.
- Open schema naming blocker before CR-03.
