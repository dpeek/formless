# PRD 11: Field editor expansion

Status: complete
Current chunk: FE-12 shipped
Last updated: 2026-05-07

## Goal

Expand Formless field support through better generated editors.

The first version should:

- keep stored record values flat;
- keep existing field schema valid;
- keep existing source schemas valid;
- wire current text editor hints to real shared UI primitives;
- make title-like text feel editable without looking like a form input;
- make numeric fields easier to edit and read;
- support value-plus-unit editing without introducing nested stored values;
- rationalize reusable Estii input patterns into `lib/ui`;
- defer new stored field types until editor behavior proves the need.

This PRD is about generated field editor capability and shared input primitives.
It is not a broad field type expansion yet.

## Problem

Formless already says field types own validation, editing, and display behavior.
PRD 07 shipped the field behavior module that gives future editor work a stable place to plug in.

Current generated editor support is still thin.

Examples:

- `markdown` stores text and renders as a textarea, even though `lib/ui` has a Plate-backed `MarkdownEditor`.
- `color` stores text and renders as a plain text input, even though `lib/ui` has `ColorInput`.
- `href`, `slug`, and `icon` are plain text inputs with no useful editor affordance.
- Title-like fields render as visible input boxes, not editable text.
- Number fields use native number inputs, so compact entry like `1.2k`, percent-style editing, and currency-style editing are not available.
- Rate-card cost and price display `/ day` suffixes, but the editor still treats amount and unit as separate scalar fields.
- Create date rendering uses a shared date picker, but field validation expects `YYYY-MM-DD` strings.

Estii has useful prior art:

- autosizing text inputs that render like normal text;
- list-cell text and number inputs;
- compact number parsing;
- percent and currency-style editors;
- time/data/amount editors that parse values with units.

The reusable pieces should move toward `lib/ui` without importing Estii domain semantics.

## Source map

Existing anchors:

- Field schema types: `src/shared/schema-types.ts`.
- Field parser: `src/shared/schema-fields.ts`.
- Field behavior: `src/shared/field-types.ts`.
- Generated editor adapter: `src/app/generated/field-ui-adapters.ts`.
- Generated create renderer: `src/app/generated/create.tsx`.
- Generated inline editor: `src/app/generated/record-field-editor.tsx`.
- Generated field display: `src/app/generated/record-field-display.tsx`.
- Generated table renderer: `src/app/generated/table.tsx`.
- Generated formatting helpers: `src/app/generated/format.ts`.
- View model selection: `src/client/views.ts`.
- Shared UI primitives: `lib/ui/src/input.tsx`, `lib/ui/src/textarea.tsx`, `lib/ui/src/input-group.tsx`, `lib/ui/src/color.tsx`, `lib/ui/src/markdown.tsx`, `lib/ui/src/date.tsx`.
- UI package export surface: `lib/ui/src/index.ts`.
- UI package docs: `lib/ui/README.md`, `lib/ui/doc/browser-primitives.md`.
- Field behavior tests: `src/shared/field-types.test.ts`.
- Generated adapter tests: `src/app/generated/field-ui-adapters.test.ts`.
- Generated formatting tests: `src/app/generated/format.test.ts`.
- App renderer tests: `src/app.test.tsx`.
- UI primitive tests: `lib/ui/src/index.test.ts`, `lib/ui/src/markdown.test.tsx`.
- Estii prior art: `/Users/dpeek/code/estii/packages/app/src/design/input.tsx`, `/Users/dpeek/code/estii/packages/app/src/design/text-input.tsx`, `/Users/dpeek/code/estii/packages/app/src/design/number-input.tsx`, `/Users/dpeek/code/estii/packages/app/src/components/list-cells.tsx`, `/Users/dpeek/code/estii/packages/app/src/input/amount.tsx`, `/Users/dpeek/code/estii/packages/app/src/input/time.tsx`, `/Users/dpeek/code/estii/packages/app/src/input/data.tsx`.

Owned files:

- `prd/11-field-editor-expansion.md`.

Likely changed files:

- `lib/ui/src/input.tsx`.
- `lib/ui/src/text-input.tsx`.
- `lib/ui/src/number-input.tsx`.
- `lib/ui/src/value-unit-input.tsx`.
- `lib/ui/src/index.ts`.
- `lib/ui/doc/browser-primitives.md`.
- `src/shared/schema-types.ts`.
- `src/shared/schema-fields.ts`.
- `src/shared/field-types.ts`.
- `src/shared/field-types.test.ts`.
- `src/shared/schema.test.ts`.
- `src/app/generated/field-ui-adapters.ts`.
- `src/app/generated/field-ui-adapters.test.ts`.
- `src/app/generated/format.ts`.
- `src/app/generated/format.test.ts`.
- `src/app/generated/create.tsx`.
- `src/app/generated/record-field-editor.tsx`.
- `src/app/generated/record-field-display.tsx`.
- `src/app/generated/table.tsx`.
- `src/app.test.tsx`.
- Source schemas only when proving editor hints in real apps.

## Requirements

### Runtime behavior

- Existing source schemas parse unchanged.
- Existing active schemas without new editor hints keep rendering unchanged except for intended editor quality improvements.
- Existing stored values stay the same shape.
- Text values stay strings.
- Number values stay numbers.
- Boolean values stay booleans.
- Date values stay `YYYY-MM-DD` strings.
- Enum values stay string keys.
- Reference values stay record IDs.
- Authority validation outcomes stay stable except where tests explicitly bless stricter editor-side normalization.
- Cross-record reference existence checks stay authority-owned.
- Generic create and patch flows still submit to the active schema key.
- Tasks, rates, and site create/edit flows keep passing.

### Editor behavior

- `editor: "markdown"` can use the shared `MarkdownEditor` in create and inline edit surfaces where there is enough space.
- Compact table markdown cells may use a textarea or open a larger editor surface.
- Markdown display can use the shared `MarkdownRenderer` when the column or view asks for read-only rendered markdown.
- `editor: "color"` uses the shared `ColorInput` and displays a swatch.
- `editor: "href"` uses URL-friendly text input behavior without changing stored value shape.
- `editor: "slug"` uses slug-friendly text input behavior without requiring authority uniqueness.
- `editor: "icon"` remains text-backed until icon catalog semantics exist.
- Date create and inline editors submit `YYYY-MM-DD` strings.
- Title-like text editors can render as autosizing editable text.
- Text editors support Escape revert and blur/Enter commit consistently.
- Numeric editors can support compact entry such as `1.2k` while storing finite numbers.
- Percent and currency editor behavior stays editor/display metadata over number fields in the first version.
- Table suffixes and read-only number formats keep working.
- Value-plus-unit editors can patch multiple flat scalar fields when the view declares the pairing.

### Shared UI behavior

- `lib/ui` owns reusable browser-safe primitives.
- `lib/ui` primitives do not import Formless schema/runtime types.
- `lib/ui` primitives do not import Estii domain types or Estii unit context.
- Autosizing input behavior is reusable outside generated field editors.
- Formatted number input exposes encode/decode hooks rather than hard-coded business rules.
- Value/unit input exposes generic value, unit, options, encode, and decode hooks.
- UI primitives have package-local tests where behavior is non-trivial.

### Schema behavior

- Current field types remain valid.
- Current text formats remain valid.
- Current field editors remain valid.
- New editor hints are optional.
- Any view-level multi-field editor config must reference known scalar fields.
- Multi-field editor config must preserve flat records.
- Multi-field editor config must fail at schema parse time when field pairings are invalid.
- Stored composite objects are not introduced in this PRD.

### Future fit

- A future `currency` field type can reuse number editor and display behavior.
- A future `duration` field type can reuse generic formatted number parsing.
- A future `unitValue` field type can reuse value/unit editor primitives.
- A future media field can follow the same editor-control path.
- A future icon catalog can replace plain icon text without changing text storage.

## Proposed direction

### Editor primitives

Add shared UI primitives before broadening schema:

- autosizing text input;
- editable text cell wrapper;
- formatted number input;
- value/unit input wrapper.

Keep these browser primitives generic.
Port only reusable Estii behavior, not Estii resource, rate, work-unit, or deal-specific logic.

### Generated field controls

Extend field behavior/editor adapter metadata so generated UI can choose:

- plain input;
- autosizing text input;
- textarea;
- markdown editor;
- color input;
- date input with ISO conversion;
- formatted number input;
- enum/reference select;
- value/unit editor wrapper.

React rendering stays in generated UI and `lib/ui`.
Shared field behavior stays runtime-safe and non-React.

### Value/unit editing

Start with view-level editor metadata over flat fields.

Example use cases:

- rate cost amount plus cost unit;
- rate price amount plus period/unit;
- quantity plus unit in future estimate-style apps.

Do not store `{ value, unit }` objects yet.
Patch scalar fields together through generic mutation paths.

## Decisions

| ID     | Decision                                                       | Reason                                                                                  | Evidence                                                               |
| ------ | -------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| FE-D1  | Improve editors before adding stored field types.              | Current schemas already declare rich hints that render too plainly.                     | `src/shared/schema-types.ts`, `schema/apps/site/`                      |
| FE-D2  | Keep stored records flat.                                      | Flat records are a core runtime bet and match rate-card join records.                   | `doc/overview.md`, `doc/current.md`                                    |
| FE-D3  | Keep text formats as string-backed editor hints.               | PRD 03 and PRD 07 already chose this boundary.                                          | `prd/03-personal-site-authoring.md`, `prd/07-field-behavior-module.md` |
| FE-D4  | Move reusable input chrome into `lib/ui`.                      | Generated UI should consume shared primitives instead of owning generic input behavior. | `lib/ui/README.md`                                                     |
| FE-D5  | Port generic Estii input patterns, not Estii domain semantics. | Work units, resources, and estimates are product concepts, not UI primitives.           | `/Users/dpeek/code/estii/packages/app/src/input/amount.tsx`            |
| FE-D6  | Keep React components out of shared field behavior.            | Field behavior must stay usable by parser, authority, and tests.                        | `src/shared/field-types.ts`                                            |
| FE-D7  | Fix ISO date editor semantics before expanding date behavior.  | Field validation expects `YYYY-MM-DD`; editor UI must preserve that contract.           | `src/shared/field-types.ts`, `lib/ui/src/date.tsx`                     |
| FE-D8  | Model value/unit as view/editor composition first.             | It proves ergonomics without committing to composite stored values.                     | `schema/apps/rates/schema.json`                                        |
| FE-D9  | Use `bun browser` for visible editor behavior changes.         | This PRD changes interactive controls, not just parser behavior.                        | `doc/current.md` checks section                                        |
| FE-D10 | Keep color validation editor-side first.                       | `color` remains a text-backed editor hint, so invalid stored strings must stay visible. | `lib/ui/src/color.tsx`, `src/app/generated/record-field-display.tsx`   |
| FE-D11 | Keep compact markdown table cells textarea-backed.             | Table cells need predictable compact editing; rich editing fits create and wide inline. | `src/app/generated/record-field-editor.tsx`, `src/app.test.tsx`        |
| FE-D12 | Put first value/unit metadata on table field columns.          | Rate rows need paired inline editing without changing item/create view contracts yet.   | `src/shared/schema-views.ts`, `schema/apps/rates/schema.json`          |

## Chunks

| ID    | Status  | Depends on | Main files                                                             | Acceptance                                                                                                 |
| ----- | ------- | ---------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| FE-01 | shipped | none       | tests, PRD                                                             | Current editor support, date value shape, markdown/color fallbacks, and number behavior are characterized. |
| FE-02 | shipped | FE-01      | `lib/ui/src/date.tsx`, generated create/editor code                    | Date create and inline editors preserve `YYYY-MM-DD` field values.                                         |
| FE-03 | shipped | FE-01      | `src/app/generated/*`, `lib/ui/src/color.tsx`, tests                   | `editor: "color"` uses `ColorInput`, commits text values, and displays swatches.                           |
| FE-04 | shipped | FE-01      | `src/app/generated/*`, `lib/ui/src/markdown.tsx`, tests                | `editor: "markdown"` uses rich markdown editing where appropriate and keeps string storage.                |
| FE-05 | shipped | FE-01      | `lib/ui/src/input.tsx`, `lib/ui/src/text-input.tsx`, generated editors | Autosizing editable text is available and used for title-like compact text fields.                         |
| FE-06 | shipped | FE-05      | `lib/ui/src/number-input.tsx`, field behavior/display tests            | Number editors can use encode/decode formatting while storing finite numbers.                              |
| FE-07 | shipped | FE-06      | schema view types/parser, generated table/editor code                  | View-declared value/unit editor patches multiple flat scalar fields.                                       |
| FE-08 | shipped | FE-07      | source schemas, app tests, `bun browser`                               | Rates and site authoring smoke pass with richer editors and no storage shape change.                       |
| FE-09 | shipped | FE-08      | `prd/11-field-editor-expansion.md`                                     | PRD status, shipped outcomes, blockers, and promote notes are current.                                     |
| FE-10 | shipped | FE-08      | `src/app/generated/table.tsx`, generated table tests, `bun browser`    | Compact value/unit table columns reserve enough width for formatted rate values.                           |
| FE-11 | shipped | FE-10      | `schema/apps/rates/schema.json`, generated app/view/schema tests       | Rate-card primary view removes the regenerate button, table currency selector, and duplicate cost suffix.  |
| FE-12 | shipped | FE-11      | `schema/apps/rates/schema.json`, generated app/view/schema tests       | Rate-card primary card tabs do not show related-rate count badges.                                         |

## Chunk details

### FE-01 editor support characterization

Status: shipped 2026-05-06.

Outcomes:

- Adapter tests cover current generated control metadata.
- Create renderer tests cover text, textarea, markdown, color, href, slug, icon, date, number, enum, and reference controls.
- Inline renderer tests cover the same editor hints through patch controls.
- Field behavior tests document date string pass-through, ISO authority validation, localized date rejection, and current compact-number rejection.
- View-model tests document site markdown/color/slug/href/icon hints as string-backed text fields.
- View-model tests document rate cost, costUnit, price, and currency as separate flat scalar fields.

Evidence:

- `./tmp/test.txt`: 22 files, 407 tests passed.
- `./tmp/check.txt`: formatting pass; no warnings, lint errors, or type errors in 151 files.
- Browser smoke not run; no app behavior changed.

Promotion:

- No global doc promotion for FE-01.

### FE-02 ISO date editor

Status: shipped 2026-05-06.

Outcomes:

- Shared `DateInput` now renders and submits `YYYY-MM-DD` values.
- `DateInput` parses ISO strings into local `Date` objects without UTC day shifting.
- Generated create forms pass date defaults into `DateInput`.
- Generated inline date editors use `DateInput`.
- Inline date typing still commits through blur/Enter.
- Inline calendar selection commits the selected ISO date immediately.
- Optional empty dates stay empty strings for editor state and omit through existing authority validation.
- Required dates keep the native required field attribute.

Evidence:

- `./tmp/test.txt`: 23 files, 409 tests passed.
- `./tmp/check.txt`: formatting pass; no warnings, lint errors, or type errors in 152 files.
- `bun browser` at `http://127.0.0.1:4951/tasks`: create form `FormData` contained `dueDate: "2026-05-11"`; created row rendered `2026-05-11`; inline calendar selection patched a row to `2026-05-10`; page errors empty.

Promotion:

- Generated date editors preserve `YYYY-MM-DD` field values in create and inline patch flows.
- Shared `DateInput` lives in `lib/ui/src/date.tsx` and stays string-backed at the generated field boundary.

### FE-03 color editor

Status: shipped 2026-05-06.

Outcomes:

- Shared `ColorInput` accepts generated form/editor props for disabled, required, name, and text input type.
- Generated create forms render `editor: "color"` through `ColorInput`.
- Create color fields keep a hidden flat text input named for the field, so generic create mutation payloads stay unchanged.
- Generated inline editors render `editor: "color"` through `ColorInput`.
- Inline color edits still patch the single text field through generic patch mutation.
- Read-only color table cells render a swatch for valid hex strings.
- Invalid existing color strings render as text without applying invalid CSS color styles.

Evidence:

- `./tmp/test.txt`: 23 files, 410 tests passed.
- `./tmp/check.txt`: formatting pass; no warnings, lint errors, or type errors in 152 files.
- `bun browser` at `http://127.0.0.1:4181/site`: Site create dialog exposed `Choose Color`; visible color input was `type="text"`; hidden submitted input was `type="hidden"` and `name="color"`; filling `#336699` mirrored hidden `color` value to `#336699`; page errors empty.

Promotion:

- Generated color editors use shared `ColorInput` in create and inline patch flows.
- Generated read-only color display shows swatches for valid hex strings.
- Color values remain flat text fields.

### FE-04 markdown editor

Status: shipped 2026-05-06.

Outcomes:

- Shared `MarkdownEditor` now accepts aria label, blur, keydown, and read-only props.
- Generated create forms render `editor: "markdown"` through `MarkdownEditor`.
- Create markdown fields keep a hidden flat text input named for the field, so generic create mutation payloads stay unchanged.
- Generated default-density inline markdown editors render through `MarkdownEditor`.
- Inline markdown edits still patch the single text field through generic patch mutation on blur.
- Escape reverts inline markdown draft state to the stored value.
- Compact table markdown cells stay textarea-backed.
- Read-only markdown table cells render through shared `MarkdownRenderer` when the field/editor asks for markdown display.

Evidence:

- `./tmp/state.txt`: dev ready, tests pass, check idle.
- `./tmp/test.txt`: watcher reruns passed for `src/app.test.tsx` with 63 tests and `lib/ui/src/markdown.test.tsx` with 22 tests.
- `./tmp/check.txt`: formatting pass; no warnings, lint errors, or type errors in 152 files.
- `bun browser` at `http://127.0.0.1:4022/site`: Site create dialog exposed one `data-web-markdown-editor="plate"` editor and one hidden `name="body"` input; compact table body editors remained textarea-backed; hidden body value updated from rich editor input; page errors empty.

Promotion:

- Generated markdown editors use shared `MarkdownEditor` in create and default-density inline patch flows.
- Compact table markdown editors stay textarea-backed.
- Generated read-only markdown display can use shared `MarkdownRenderer`.
- Markdown values remain flat text fields.

### FE-05 autosizing text editors

Status: shipped 2026-05-06.

Outcomes:

- Shared `AutosizeTextInput` lives in `lib/ui/src/text-input.tsx`.
- `AutosizeTextInput` uses an invisible sizer so editable text can size like text.
- `AutosizeTextInput` supports auto-select, blur commit, Enter commit, and Escape revert callbacks.
- `@formless/ui/text-input` and the root UI export expose the primitive.
- Generated inline plain text editors use `AutosizeTextInput` for compact cells.
- Generated inline plain text editors use `AutosizeTextInput` for title/name-like list fields without labels.
- Generated create forms keep the existing `Input` controls.
- Compact table cells keep stable column width while using the autosizing text control.
- SSR tests count input values where hidden sizer text duplicates visible values in markup.

Evidence:

- `./tmp/agent-dev.json`: dev ready, tests pass, check pass. `./tmp/state.txt` was not generated by current `bun start`; stdout reported `State ./tmp/agent-dev.json`.
- `./tmp/test.txt`: 24 files, 415 tests passed.
- `./tmp/check.txt`: formatting pass; no warnings, lint errors, or type errors in 154 files.
- `bun browser` clean session at `https://11-field-editor-expansion.formless.local/tasks`: autosize text inputs count 8; first title value `Review overdue proposal`; Escape reverted `__escape_probe__` back to stored value; page errors empty.
- `bun browser` clean session at `https://11-field-editor-expansion.formless.local/rates`: autosize text inputs count 5; first compact role value `Designer`; page errors empty.

Promotion:

- Generated text editors can render title-like autosizing editable text.
- Shared UI input primitives include `AutosizeTextInput` in `lib/ui/src/text-input.tsx`.

### FE-06 formatted number editors

Status: shipped 2026-05-06.

Outcomes:

- Shared `FormattedNumberInput` lives in `lib/ui/src/number-input.tsx`.
- `FormattedNumberInput` uses caller-supplied encode/decode hooks.
- Create number fields render a formatted text input plus hidden flat scalar form value.
- Inline number editors render through `FormattedNumberInput`.
- Compact number parsing accepts `k`, `m`, and `b` suffixes.
- Invalid formatted number input serializes predictably as `NaN` for authority validation.
- Field behavior still owns finite number, min, max, and integer validation.
- Table column `format: "currency"` and `format: "percent"` drive editor encode/decode behavior.
- Existing table display formatting and suffix rendering keep working.

Evidence:

- `./tmp/agent-dev.json`: dev ready, tests pass, check pass. `./tmp/state.txt` was not generated by current `bun start`; stdout reported `State ./tmp/agent-dev.json`.
- `./tmp/test.txt`: 25 files, 419 tests passed.
- `./tmp/check.txt`: formatting pass; no warnings, lint errors, or type errors in 154 files.
- `bun browser` at `https://11-field-editor-expansion.formless.local/tasks`: formatted number inputs count 8; visible Estimate inputs were `type="text"`; create dialog hidden `estimate` value normalized `1.2k` to `1200`; page errors empty.
- `bun browser` at `https://11-field-editor-expansion.formless.local/rates`: formatted number inputs count 13; first Cost and Price editors were `type="text"`; `/ day` suffix count 10; page errors empty.

Promotion:

- Generated number editors use formatted number input while storing flat numbers.
- Shared `FormattedNumberInput` lives in `lib/ui/src/number-input.tsx`.

### FE-07 value/unit editor metadata

Status: shipped 2026-05-06.

Outcomes:

- Table field columns can declare `valueUnit: { unitField }`.
- Schema parsing validates value/unit pairings as number value fields plus enum unit fields on the same entity.
- Client view models carry paired unit field metadata without changing record shape.
- Shared `ValueUnitInput` lives in `lib/ui/src/value-unit-input.tsx`.
- Generated inline number editors render paired value/unit controls when table metadata declares them.
- Paired controls submit generic patch mutations over flat scalar fields.
- Rate table cost pairs with `costUnit`.
- Rate table price pairs with `currency`.
- `costUnit` and `currency` columns stay hidden in the rate table.
- Existing table suffix display still renders beside paired editors.

Evidence:

- `./tmp/agent-dev.json`: dev ready, tests pass, check pass. `./tmp/state.txt` was not generated by current `bun start`; stdout reported `State ./tmp/agent-dev.json`.
- `./tmp/test.txt`: latest watcher reruns passed for `src/app.test.tsx` with 65 tests and `src/shared/field-types.ts` affected set with 353 tests.
- `./tmp/check.txt`: formatting pass; no warnings, lint errors, or type errors in 156 files.
- `bun browser` at `https://11-field-editor-expansion.formless.local/rates` after source schema reset: `data-web-value-unit-input` count 10; select count 10; page errors empty.

Promotion:

- Rate-card value/unit editing stays flat and patches scalar fields.
- Shared `ValueUnitInput` lives in `lib/ui/src/value-unit-input.tsx`.
- Table field columns can declare value/unit editor metadata with `valueUnit.unitField`.

### FE-08 source app proof and browser smoke

Status: shipped 2026-05-06.

Outcomes:

- Rate-card source schema price table column uses `format: "currency"`.
- Price amount stays `price` number.
- Price currency stays `currency` enum.
- Rate records stay flat.
- Source app tests expect currency-formatted price editor values with paired currency unit selects.
- Tasks, Rates, and Site source apps smoke clean in browser.
- Desktop and mobile-ish editor overlap checks passed.

Evidence:

- `./tmp/agent-dev.json`: dev ready, tests pass, check pass. `./tmp/state.txt` was not generated by current `bun start`; stdout reported `State ./tmp/agent-dev.json`.
- `./tmp/test.txt`: latest watcher rerun passed for `src/app.test.tsx` with 65 tests; `./tmp/agent-dev.json` reported `testStatus: "pass"`.
- `./tmp/check.txt`: formatting pass; no warnings, lint errors, or type errors in 158 files.
- `bun browser` reset source schema and seed data for Tasks, Rates, and Site through `/api/:schemaKey/reset/schema` and `/api/:schemaKey/reset/seed`.
- `bun browser` at `https://11-field-editor-expansion.formless.local/tasks`: desktop 1280x900 and mobile-ish 390x844 both showed 5 autosize text inputs, 5 formatted number inputs, no document overflow, no detected editor overlaps.
- `bun browser` at `https://11-field-editor-expansion.formless.local/rates`: desktop 1280x900 and mobile-ish 390x844 both showed 10 value/unit inputs, first price values `$825.00`, `$975.00`, `$750.00`, first price units `usd`, no document overflow, no detected editor overlaps.
- `bun browser` at `https://11-field-editor-expansion.formless.local/site`: create dialog desktop 1280x900 and mobile-ish 390x844 both showed 1 markdown editor, 1 color text input, 1 color picker button, hidden `body` and `color` inputs, no dialog overflow, no detected editor overlaps.
- `bun browser errors`: empty after smoke.
- No storage, authority, sync, or protocol files changed.

Promotion:

- Rate table price editor uses currency formatting while retaining separate flat `price` number and `currency` enum fields.
- Source app browser smoke covers Tasks, Rates, and Site rich editor surfaces.

### FE-09 PRD closeout

Status: shipped 2026-05-06.

Outcomes:

- PRD status is `complete`.
- Current chunk is `FE-09 shipped`.
- Chunk table marks FE-01 through FE-09 shipped.
- Shipped outcomes remain recorded under each chunk.
- Blockers remain closed.
- Open decisions remain future defaults, not blockers.
- Promote notes are ready for a docs/steward pass.

Evidence:

- `./tmp/agent-dev.json`: dev ready, tests pass, check pass. `./tmp/state.txt` was not generated by current `bun start`; stdout reported `State ./tmp/agent-dev.json`.
- `./tmp/test.txt`: 26 files, 420 tests passed.
- `./tmp/check.txt`: formatting pass; no warnings, lint errors, or type errors in 158 files.
- Browser smoke not run; PRD-only change with no app behavior change.

Promotion:

- No new global doc promotion beyond existing `Promote after ship` bullets.

### FE-10 rate value/unit table width follow-up

Status: shipped 2026-05-06.

Outcomes:

- Compact table columns with editable `valueUnit` fields reserve wider cells.
- Rate table cost and price editors show full seeded values instead of clipping.
- Rate records, rate schema, and value/unit stored shape are unchanged.

Evidence:

- `./tmp/agent-dev.json`: dev ready, tests pass, check pass.
- `./tmp/test.txt`: latest rerun passed `src/app.test.tsx` with 81 tests; generated table regression passed in watcher output.
- `./tmp/check.txt`: formatting pass; no warnings, lint errors, or type errors in 163 files.
- `bun browser` at `https://formless.local/rates`: first costs rendered `550`, `650`, `500`, `425`, `700`; first prices rendered `$825.00`, `$975.00`, `$750.00`, `$640.00`, `$1050.00`; input `clientWidth` equaled `scrollWidth`; document horizontal overflow was false; browser errors empty.

Promotion:

- No new global doc promotion.

### FE-11 rate-card primary view polish

Status: shipped 2026-05-07.

Outcomes:

- Rate-card primary view still exposes `Create Resource`.
- Rate-card primary view no longer exposes `Regenerate missing rates`.
- `rate.regenerateMissingRates` remains a schema action for create after-effects.
- Rate table cost still pairs with `costUnit`.
- Rate table cost no longer shows the static `/ day` suffix beside the unit selector.
- Rate table price still uses currency formatting.
- Rate table price no longer pairs with the `currency` unit selector.
- Rate table no longer includes a hidden currency column.
- Rate records stay flat and still store `currency`.

Evidence:

- `./tmp/agent-dev.json`: dev ready, tests pass, check pass.
- `./tmp/test.txt`: latest watcher rerun passed `src/client/views.test.ts` with 31 tests; full agent state reports `testStatus: "pass"`.
- `./tmp/check.txt`: formatting pass; no warnings, lint errors, or type errors in 164 files.
- `bun browser --ignore-https-errors batch --bail "open https://formless.local/rates" "wait 1000" "get text body"` showed `Create Resource`; did not show `Regenerate missing rates` or `USD`; cost rows showed the unit options; price rows still showed `/ day`.

Promotion:

- Rate-card primary view exposes Create Resource only.
- Rate-card cost editor uses a `costUnit` value/unit selector without a duplicate static `/ day` suffix.
- Rate-card price editor uses currency formatting without showing a currency selector in the table.
- Rate-card stored records stay flat and keep `currency`.

### FE-12 rate-card tab count removal

Status: shipped 2026-05-07.

Outcomes:

- Rate-card primary card tabs render card names without related-rate count badges.
- `cardRates` remains a relationship for schemas and fixtures that opt into relationship-backed counts.
- Source rate-card table footer aggregates and primary actions remain unchanged.

Evidence:

- `./tmp/agent-dev.json`: dev ready, tests pass, check pass.
- `./tmp/test.txt`: watcher reruns passed `src/app.test.tsx`, `src/client/views.test.ts`, and `src/shared/schema.test.ts`; full agent state reports `testStatus: "pass"`.
- `./tmp/check.txt`: formatting pass; no warnings, lint errors, or type errors in 164 files.
- `bun browser` at `https://formless.local/rates` after source schema and seed reset showed `Default`, `Premium`, and `Create Resource`; no `Rates count` aria badges were present.

Promotion:

- Rate-card primary card tabs do not show related-rate count badges.

## Non-goals

- Do not add nested stored field values.
- Do not add a `currency` stored field type in the first pass.
- Do not add a `unitValue` stored field type in the first pass.
- Do not add a full unit conversion engine to Formless.
- Do not import Estii domain models into Formless.
- Do not add media upload.
- Do not add a public site renderer.
- Do not add computed fields.
- Do not change query syntax.
- Do not change authority reference existence checks.
- Do not require users to edit schema JSON to get current editor hints working better.

## Open decisions

| ID    | Question                                                     | Default for implementation                                                   |
| ----- | ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| FE-O1 | Should `markdown` render rich editor in compact table cells? | Use textarea or dialog in compact cells; use rich editor in larger surfaces. |
| FE-O3 | Should `slug` normalize on edit?                             | No automatic authority normalization; editor may offer slug-friendly input.  |
| FE-O5 | Should percent/currency become field types?                  | No. Keep as number editor/display options until semantics harden.            |
| FE-O6 | Should units be schema-declared enum values or free text?    | Start with existing enum fields; do not add freeform units first.            |

## Blockers

| ID    | Status | Blocks | Notes                                                                                              |
| ----- | ------ | ------ | -------------------------------------------------------------------------------------------------- |
| FE-B1 | closed | FE-07  | FE-07 uses `valueUnit.unitField` metadata on table field columns.                                  |
| FE-B2 | closed | FE-04  | FE-04 keeps compact markdown table cells textarea-backed and uses rich editors in larger surfaces. |

## Cross-PRD dependencies

| Dependency                     | Direction      | Notes                                                                                        |
| ------------------------------ | -------------- | -------------------------------------------------------------------------------------------- |
| PRD 07 field behavior module   | satisfied      | Field behavior ownership has shipped and should be reused.                                   |
| PRD 03 personal site authoring | satisfied      | Site schema already declares markdown, color, slug, href, icon, and long-text hints.         |
| PRD 10 screen runtime          | parallel input | Can proceed if both PRDs avoid conflicting generated route/collection rewrites at once.      |
| Future public site renderer    | downstream     | Markdown rendering/editor improvements help authoring but do not ship public rendering.      |
| Future richer field types      | downstream     | Currency, duration, media, and unit-value field types should build on this PRD's primitives. |

## Parallel shipping

Can ship in parallel with:

- PRD 02 if WebSocket push sync does not edit generated field controls.
- PRD 05 if authority write code does not change field validation semantics.
- PRD 08 if action UI changes avoid generated field forms.

Can ship in limited parallel with:

- PRD 10 if ownership is split between screen route/model files and field editor files.

Avoid parallel edits with:

- any PRD changing `src/app/generated/create.tsx`;
- any PRD changing `src/app/generated/record-field-editor.tsx`;
- any PRD changing `src/app/generated/field-ui-adapters.ts`;
- any PRD changing shared `lib/ui` input primitives.

Recommended order:

1. Ship FE-01 characterization first.
2. Fix date semantics before adding more editor surfaces.
3. Wire color and markdown using existing `lib/ui` primitives.
4. Extract autosizing and formatted number primitives.
5. Add value/unit metadata after the primitive layer is stable.

## Progress rules

- Mark exactly one chunk as `doing` when implementation starts.
- When a chunk ships, mark it `shipped`.
- Replace shipped task detail with outcome plus evidence.
- Do not append terminal logs.
- Keep decisions in `Decisions`.
- Keep unresolved UX or schema choices in `Open decisions`.
- Put global-doc updates in `Promote after ship`.

## Promote after ship

When this PRD ships, update `doc/current.md`:

- Field behavior still owns scalar validation, default, conversion, display, and editor metadata.
- Generated field editors use shared UI primitives for markdown and color editor hints.
- Generated read-only markdown display can use the shared markdown renderer.
- Generated text editors can render title-like autosizing editable text.
- Generated number editors can use formatted number input while storing numbers.
- Generated date editors preserve `YYYY-MM-DD` field values.
- Rate-card cost value/unit editing stays flat and patches scalar fields.
- Rate-card price editor uses currency formatting while `price` and `currency` stay separate flat fields.
- Rate-card primary view hides the currency selector and hidden currency column from the table.
- Rate-card primary card tabs do not show related-rate count badges.
- Shared UI input primitives live under `lib/ui/src/`.

When this PRD ships, update `doc/roadmap.md` only if richer field/editor support is release scope.

## PRD status notes

- PRD drafted 2026-05-06 from field support exploration.
- FE-01 shipped 2026-05-06 as characterization tests only.
- No runtime behavior changed in FE-01.
- No new decisions from FE-01.
- FE-02 shipped 2026-05-06.
- FE-02 changed generated date create and inline editor behavior only.
- FE-02 kept date storage as `YYYY-MM-DD` strings.
- FE-03 shipped 2026-05-06.
- FE-03 changed generated color create, inline edit, and read-only display behavior only.
- FE-03 kept color storage as flat text strings.
- FE-04 shipped 2026-05-06.
- FE-04 changed generated markdown create, default inline edit, and read-only display behavior only.
- FE-04 kept markdown storage as flat text strings.
- Compact markdown table editors remain textarea-backed.
- FE-05 shipped 2026-05-06.
- FE-05 added shared autosizing text input behavior.
- FE-05 changed generated inline plain text editing for compact cells and title/name-like list fields.
- FE-05 kept create form text inputs unchanged.
- FE-06 shipped 2026-05-06.
- FE-06 added shared formatted number input behavior.
- FE-06 changed generated create and inline number editors to formatted text inputs with flat numeric values.
- FE-06 kept display formats and table suffixes working.
- FE-07 shipped 2026-05-06.
- FE-07 added table column value/unit metadata.
- FE-07 changed rate table cost and price editors to paired value/unit controls.
- FE-07 kept rate records flat and generic patch as the write path.
- FE-B1 closed by FE-07.
- FE-08 shipped 2026-05-06.
- FE-08 changed rate-card source price table format to currency.
- FE-08 kept `price` and `currency` as separate flat scalar fields.
- FE-08 browser smoke reset source schemas and seed data for Tasks, Rates, and Site.
- FE-09 shipped 2026-05-06.
- FE-09 closed PRD 11 with status complete.
- FE-09 kept blockers closed and open decisions as future defaults.
- FE-09 kept promote notes limited to shipped field editor behavior.
- Browser smoke not run; PRD-only change with no app behavior change.
- No blockers.
- FE-10 shipped 2026-05-06.
- FE-10 widened compact value/unit table columns.
- FE-10 browser smoke passed for `/rates`.
- FE-11 shipped 2026-05-07.
- FE-11 removed the source rate-card primary-view regenerate button.
- FE-11 removed the source rate-card table price/currency unit pairing and hidden currency column.
- FE-11 removed the source rate-card table cost `/ day` suffix while keeping `costUnit`.
- FE-11 kept `currency` as a stored flat field.
- FE-11 browser smoke passed for `/rates`.
- FE-12 shipped 2026-05-07.
- FE-12 removed related-rate count badges from source rate-card primary tabs.
- FE-12 kept the generic relationship-backed count badge path covered by explicit fixtures.
- PRD complete; no next ready chunk.
