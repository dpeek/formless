# PRD 12: Computed and aggregate read model

Status: shipped
Current chunk: CR-08 shipped
Last updated: 2026-05-07

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

| ID     | Decision                                                        | Reason                                                                 | Evidence                                                         |
| ------ | --------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| CR-D1  | Keep computed values read-only and display-time first.          | Flat stored records and generic writes are core runtime bets.          | `doc/overview.md`, `doc/current.md`                              |
| CR-D2  | Do not add a full computed graph engine.                        | The first release needs simple derived display, not dependency graphs. | `doc/roadmap.md`                                                 |
| CR-D3  | Start with numeric same-record expressions.                     | Rate margins and markups prove value without cross-record traversal.   | `schema/apps/rates/schema.json`                                  |
| CR-D4  | Start aggregates over existing query outputs.                   | Queries already define collection membership and context behavior.     | `src/shared/query.ts`, `src/client/store.ts`                     |
| CR-D5  | Render through table and collection summary surfaces first.     | PRD 10 owns screen composition; this PRD should not compete with it.   | `prd/10-declarative-screen-runtime.md`                           |
| CR-D6  | Keep React out of the read-model evaluator.                     | The evaluator should be testable and reusable by view models.          | `src/shared/query.ts`, `src/shared/field-types.ts`               |
| CR-D7  | Treat invalid runtime arithmetic as empty display output.       | Existing records may have zeros or missing optional values.            | `src/app/generated/record-field-display.tsx`                     |
| CR-D8  | Use existing number formatting options where possible.          | Table columns already support number, currency, and percent display.   | `src/app/generated/format.ts`, `src/shared/schema-types.ts`      |
| CR-D9  | Return `number \| undefined` from numeric read-model eval.      | It gives generated UI a narrow empty-output signal without throwing.   | `src/shared/read-model.ts`, `src/shared/read-model.test.ts`      |
| CR-D10 | Use `readModels.computedValues` and `readModels.aggregates`.    | It keeps derived read declarations separate from stored entity fields. | `prd/12-computed-read-model.md`                                  |
| CR-D11 | Computed table columns are render-only, never editor-backed.    | Computed values must not enter generic patch paths.                    | `src/client/views.ts`, `src/app/generated/table.tsx`             |
| CR-D12 | Summary slots render for the active query tab only.             | Query-scoped aggregate definitions should follow active collection UI. | `src/shared/schema-views.ts`, `src/app/generated/collection.tsx` |
| CR-D13 | Empty count and sum render zero; empty average/min/max empty.   | Totals stay useful while undefined reducers avoid misleading values.   | `src/shared/read-model.ts`, `src/shared/read-model.test.ts`      |
| CR-D14 | Table footer aggregate slots align read-model output by column. | Rate-card averages belong in the table flow, not in detached cards.    | `src/shared/schema-views.ts`, `src/app/generated/table.tsx`      |

## Chunks

| ID    | Status  | Depends on   | Main files                                                      | Acceptance                                                                                                      |
| ----- | ------- | ------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| CR-01 | shipped | none         | tests, PRD                                                      | Current rate table display, query count, context query, and missing derived values are characterized.           |
| CR-02 | shipped | CR-01        | `src/shared/read-model.ts`, tests                               | Numeric expression evaluator supports fields, literals, arithmetic, invalid math, and deterministic formatting. |
| CR-03 | shipped | CR-02        | schema types/parser, schema tests                               | Optional read-model declarations parse, validate references, reject bad shapes, and stringify.                  |
| CR-04 | shipped | CR-03        | view model selection, generated table, tests                    | Read-only computed table columns render for records and update when records change.                             |
| CR-05 | shipped | CR-03        | client store/read model selectors, collection summary UI, tests | Aggregate summary slots evaluate over current query results and active collection context.                      |
| CR-06 | shipped | CR-04, CR-05 | `schema/apps/rates/schema.json`, app tests                      | Rate-card source schema shows margin and totals without storage or write changes.                               |
| CR-07 | shipped | CR-06        | Browser smoke, `prd/12-computed-read-model.md`                  | Rates smoke passes; PRD status, decisions, blockers, and promote notes are current.                             |
| CR-08 | shipped | CR-05        | schema result parser, view model, generated table, rate schema  | Rate-card averages render in the table footer under cost, price, and margin columns.                            |

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

Outcome:

- Added shared numeric expression types and evaluator in `src/shared/read-model.ts`.
- Field references read finite number values from a stored record.
- Literal number expressions evaluate.
- Add, subtract, multiply, and divide evaluate.
- Divide-by-zero returns no value, not `Infinity`.
- Missing, non-number, and non-finite runtime values return no value.
- Nested expressions are covered.
- Evaluator output is deterministic and side-effect free.
- Default read-model number formatting returns empty text for no value and stable plain-number text for finite values.

Evidence:

- `./tmp/test.txt`: `src/shared/read-model.test.ts` passed, 8 tests passed.
- `./tmp/check.txt`: formatting, lint, and type checks passed for 151 files.

### CR-03 parser and schema surface

Outcome:

- `AppSchema` includes optional `readModels`.
- `readModels.computedValues` and `readModels.aggregates` parse.
- Schemas without `readModels` still parse unchanged.
- Numeric computed values validate same-record number field references.
- Computed values reject missing fields, non-number fields, unsupported types, bad operators, and non-finite literals.
- Aggregates validate query references.
- Aggregate values validate number field refs and computed value refs.
- Aggregate parser accepts count, sum, average, min, and max.
- Count aggregates parse without value refs.
- `stringifySchema` preserves parsed read-model declarations.

Evidence:

- `./tmp/test.txt`: `src/shared/schema.test.ts` passed, 65 tests passed.
- `./tmp/check.txt`: formatting, lint, and type checks passed for 153 files.

### CR-04 computed table columns

Outcome:

- Table views accept a `computed` column type.
- Computed table columns validate against `readModels.computedValues`.
- Computed table columns must reference a computed value for the table entity.
- Computed table columns can carry label, width, alignment, suffix, and format.
- Computed table columns default to `readOnly`; `editor` display is rejected.
- View models expose computed columns without editor or commit config.
- Generated tables evaluate numeric computed expressions against the current record.
- Computed table cells reuse existing number, currency, and percent formatting.
- Computed cells update after source record patches through the client store.
- Existing field and reference-field table behavior remains covered.

Evidence:

- `./tmp/test.txt`: 23 files passed, 423 tests passed.
- `./tmp/check.txt`: formatting, lint, and type checks passed for 154 files.
- `bun browser --session cr-04-rates --ignore-https-errors open https://12-computed-read-model.formless.local/rates` and `snapshot -i`: `/rates` rendered the rate table.

### CR-05 aggregate summary slots

Outcome:

- Collection views accept `summary` slots with `type: "aggregate"`.
- Summary slots validate against `readModels.aggregates`.
- Summary slot aggregate queries must be one of the collection query slots.
- `evaluateAggregate` supports count, sum, average, min, and max.
- Aggregates read number fields or number computed values.
- Aggregate selectors evaluate over current query-matching local records.
- Aggregate selectors respect active collection context.
- Generated collections render summary slots near the result.
- Generated collections render only summary slots for the active query tab.
- Empty count and sum render `0`.
- Empty average, min, and max render empty output.
- Bad runtime aggregate values are skipped instead of crashing.
- Existing count badge behavior stayed covered.
- No storage, authority, sync, mutation, or source schema files changed.

Evidence:

- `./tmp/agent-dev.json`: `testStatus` pass, `checkStatus` pass.
- `./tmp/test.txt`: latest affected reruns passed, including `src/app.test.tsx` 64 tests, `src/shared/schema.test.ts` 67 tests, `src/client/views.test.ts` 23 tests, `src/client/store.test.ts` 23 tests, and `src/shared/read-model.test.ts` 12 tests.
- `./tmp/check.txt`: formatting, lint, and type checks passed for 154 files.
- `bun browser --session cr-05-rates --ignore-https-errors open https://12-computed-read-model.formless.local/rates` and `snapshot -i`: `/rates` rendered the rate table.

### CR-06 rate-card proof

Outcome:

- Rate-card source schema declares `readModels.computedValues.rateMargin`.
- `rateTable` renders read-only `Margin` with percent format.
- `rateHome` renders `Cost total`, `Price total`, and `Average margin` summary slots.
- Summary slots use the existing `ratesForSelectedCard` context query.
- Rate records remain flat; no rate fields were added.
- No authority write, storage, sync, mutation, or action files changed.
- Source-schema, view-model, and app tests cover the rate-card proof.

Evidence:

- `./tmp/agent-dev.json`: `testStatus` pass, `checkStatus` pass.
- `./tmp/test.txt`: 23 files passed, 437 tests passed.
- `./tmp/check.txt`: formatting, lint, and type checks passed for 154 files.
- `bun browser --session cr-06-rates --ignore-https-errors open https://12-computed-read-model.formless.local/rates`; source reset in schema UI; `snapshot -i`: `/rates` rendered `Margin` column and rate rows.
- `bun browser --session cr-06-rates snapshot --selector 'section[aria-label="Collection summary"]'`: rendered `Cost total`, `Price total`, and `Average margin`.

### CR-07 closeout

Outcome:

- `bun start` reports dev ready, tests pass, and checks pass.
- `/rates` browser smoke renders the rate-card workspace.
- `/rates` browser smoke renders the `Margin` computed table column.
- `/rates` browser smoke renders `Cost total`, `Price total`, and `Average margin` aggregate summaries.
- `tmp/state.txt` is not present in this workspace; harness state is tracked in `./tmp/agent-dev.json`.
- No blockers remain open.
- Promote notes are ready for a docs/steward pass.
- PRD status reflects shipped chunks, blockers, and decisions.

Evidence:

- `./tmp/agent-dev.json`: `devStatus` ready, `testStatus` pass, `checkStatus` pass.
- `./tmp/test.txt`: 23 files passed, 437 tests passed.
- `./tmp/check.txt`: formatting, lint, and type checks passed for 154 files.
- `bun browser --session cr-07-rates --ignore-https-errors open https://12-computed-read-model.formless.local/rates`
- `bun browser --session cr-07-rates snapshot --selector 'main' --max-output 30000`: `/rates` rendered the `Margin` column, rate rows, and `Collection summary` with `Cost total`, `Price total`, and `Average margin`.

### CR-08 table footer aggregates

Outcome:

- Table collection results can declare `footer` aggregate slots.
- Footer slots validate the referenced aggregate.
- Footer slots validate the aggregate query against the collection query slots.
- Footer slots validate a visible table column target.
- View models expose footer slots with render-ready table column keys.
- Generated tables render aggregate footer values under their target columns.
- Generated tables render footer slots only for the active query tab.
- Rate-card source schema now declares average cost, average price, and average margin aggregates.
- Rate-card source schema renders those averages in the `rateTable` footer.
- Rate-card source schema no longer renders detached rate aggregate summary cards.
- Rate records stay flat; no authority write, storage, sync, mutation, or action code changed.

Evidence:

- `./tmp/agent-dev.json`: dev ready, tests pass, check pass.
- `./tmp/test.txt`: latest watcher reruns passed `src/app.test.tsx` and `src/client/views.test.ts`; full agent state reports `testStatus: "pass"`.
- `./tmp/check.txt`: formatting pass; no warnings, lint errors, or type errors in 164 files.
- `bun browser eval "fetch(\"/api/rates/reset/seed\", { method: \"POST\", headers: { \"content-type\": \"application/json\" }, body: \"{}\" }).then((response) => response.status)"`: reset source rate schema and seed data.
- `bun browser batch --bail "reload" "wait 1000" "get text body"`: `/rates` rendered no collection summary cards, no `Cost total`, and footer values `$565.00 / day`, `$848.00 / day`, and `33.39%`.

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

| ID    | Status | Blocks | Notes                                                                    |
| ----- | ------ | ------ | ------------------------------------------------------------------------ |
| CR-B1 | closed | none   | Chosen shape is `readModels.computedValues` and `readModels.aggregates`. |

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

CR-02:

- Read-model numeric evaluator lives under shared runtime code at `src/shared/read-model.ts`.
- Numeric evaluator has no React dependency.
- Invalid numeric evaluation returns empty output through `undefined`.

CR-03:

- App schemas can optionally declare `readModels.computedValues` and `readModels.aggregates`.
- Read-model parser lives at `src/shared/schema-read-models.ts`.
- `AppSchema.readModels` preserves parsed read-model declarations.
- Parser validates numeric computed field refs and aggregate query/value refs.
- `stringifySchema` preserves read-model declarations.

CR-04:

- Table views can declare read-only computed columns with `type: "computed"`.
- Computed table columns reference `readModels.computedValues`.
- Computed table cells render through `src/app/generated/table.tsx`.
- Computed table cells reuse generated number formatting from `src/app/generated/format.ts`.
- Computed table output updates when source record values change in the client store.

CR-05:

- Collection views can declare read-only aggregate summary slots with `type: "aggregate"`.
- Aggregate summary slots reference `readModels.aggregates`.
- Aggregate summary slots render through `src/app/generated/collection.tsx`.
- Aggregate summary slots render only for the active query tab.
- Aggregate selectors evaluate against local query-matching records in `src/client/store.ts`.
- Aggregate evaluation lives in `src/shared/read-model.ts`.
- Empty count and sum render `0`; empty average, min, and max render empty output.
- Runtime bad aggregate values are skipped instead of crashing the collection.

CR-06:

- Rate-card source schema declares `readModels.computedValues.rateMargin`.
- Rate-card source schema declares `selectedCardCostTotal`, `selectedCardPriceTotal`, and `selectedCardAverageMargin` aggregates.
- Rate-card `rateTable` renders read-only margin as a computed percent column.
- Rate-card `rateHome` renders cost total, price total, and average margin summary slots.
- Rate-card stored records stay flat; no authority write, storage, sync, mutation, or action code changed.

CR-07:

- `/rates` browser smoke verifies rate-card read-model output renders after `bun start`.
- PRD 12 is shipped and ready for docs/steward promotion.

CR-08:

- Table collection results can declare aggregate footer slots.
- Table footer aggregate slots reference `readModels.aggregates`.
- Table footer aggregate slots render through `src/app/generated/table.tsx`.
- Table footer aggregate slots render only for the active query tab.
- Rate-card source schema declares average cost, average price, and average margin aggregates.
- Rate-card `rateTable` renders those averages in the table footer.
- Rate-card detached aggregate summary cards are no longer used in the primary view.

When this PRD ships, update `doc/current.md`:

- Schema can declare read-model computed values and aggregates.
- Computed values are read-only display values over flat records.
- Aggregates are read-only display values over query results.
- Generated tables can render computed columns.
- Generated collections can render aggregate summary slots.
- Generated tables can render aggregate footer slots.
- Rate-card source schema uses read-model output for margin and averages.
- Stored records, authority writes, sync, and mutation paths remain unchanged.
- Read-model evaluator lives under shared runtime code and has tests.

When this PRD ships, update `doc/roadmap.md` only if derived display values remain first-release scope:

- Derived rate display values are covered by read-model computed values and aggregates.
- Full computed graph engine remains out of first release.

## PRD status notes

- PRD drafted 2026-05-06 from roadmap rate-card derived display need and declarative runtime exploration.
- Scope is intentionally narrower than a full compute engine.
- CR-01 shipped 2026-05-06 with characterization tests only.
- CR-02 shipped 2026-05-06 with shared numeric expression evaluator and tests.
- CR-03 shipped 2026-05-06 with parser and schema tests.
- CR-04 shipped 2026-05-06 with schema-backed computed table columns and generated table rendering.
- CR-05 shipped 2026-05-06 with aggregate summary slots, client aggregate selectors, and generated collection rendering.
- CR-06 shipped 2026-05-06 with rate-card source schema margin and aggregate totals.
- CR-07 shipped 2026-05-06 with `/rates` browser smoke and PRD closeout.
- CR-08 shipped 2026-05-07 with aggregate table footer slots.
- CR-08 moved rate-card average cost, price, and margin output into the table footer.
- CR-08 removed rate-card detached aggregate summary cards from the primary view.
