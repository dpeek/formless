# Field surface and value matrix

## 1. Purpose and scope

This document defines migration coverage for generated Formless fields in the Astryx field explorer. It records:

- behavior observed in the legacy renderer under `src/`;
- current Astryx contract, fixture, and renderer coverage;
- parity required before replacing the legacy renderer; and
- optional work that is not a migration requirement.

It does not define every theoretical cross-product. A combination belongs in required coverage only when a legacy source path or the generated UI specification supports it.

## 2. Shared matrix vocabulary

### Surfaces

- **Create**: new-record form input.
- **Record**: inline field in a record/list row or card.
- **Table Cell**: compact field or display inside a table.
- **Item Detail**: field in a selected record's detail context.
- **Operation**: public or generated operation input.

Surface describes layout context. It does not determine whether a field is editable.

### Editor and Display mode

- **Editor** accepts draft changes. Its commit policy determines when a write intent is emitted.
- **Display** renders a committed value without a field-value editor.
- Record, Table Cell, and Item Detail support Editor or Display when the field config and access permit it.
- Item Detail is not synonymous with Display. Legacy `RecordDetail` renders `RecordFieldEditor`, which retains editing for writable fields.
- Create and Operation are submit-bound Editor surfaces.

### Requiredness

Requiredness is schema or operation-input data. It affects required markers, clearing, blank options, draft validation, and submission. It does not create a separate surface or mode.

For existing records, a required field can still receive an empty or missing stored value. The renderer must preserve that value for display or correction; it must not fabricate a replacement.

### Value states

- **Known**: the value is valid for the field. For enums, it is schema-declared. For references, it resolves to a supplied option.
- **Unset**: no value, or the field's empty editor value.
- **Undeclared**: an enum's stored or current value is absent from schema-declared options.
- **Active** and **Terminal** are Known state-machine subdivisions.

Use **Undeclared**, not “Unknown,” for enum and state-machine values. A missing reference is not an Undeclared enum; it is a stored reference id without a resolved option.

### Presentation

Presentation is schema-derived and conditionally applicable:

- enum: plain label, rich trigger/list content, or icon-only display;
- boolean: default checkbox or completion treatment;
- date: default or `valueOrInteraction`;
- text: normal or heading record presentation;
- number: plain, formatted, suffixed, or value-unit composition;
- color, source icon, image, media, and Markdown: specialized editor or display primitives selected from field/editor metadata.

Enum icon, label, and icon-plus-label content comes from presentation tokens. Missing icon tokens fall back to text. Missing semantic color tokens fall back to neutral styling. Neither renderer invents a replacement icon, color, or label.

### Density and label visibility

- Record uses normal density unless its containing record layout requests compact density.
- Table Cell uses compact density.
- Record and Table Cell hide visible field labels by default. Controls retain accessible labels.
- Item Detail shows labels by default.
- Create and Operation show labels.
- A Record heading hides its field label while retaining an accessible control label.

`surface`, `density`, and `labelVisibility` are independent facts. Current Astryx `astryxDensity` and `fieldLabelIsHidden` contain fallbacks; production projections and parity fixtures should supply the facts explicitly.

### Commit semantics

- **Immediate**: change selection or toggle, then emit a record commit.
- **Field commit**: preserve a draft; commit on the field's supported boundary such as blur, Enter, picker Save, or date selection. Escape reverts where the legacy control supports it.
- **Submit**: preserve controlled draft state; resolve values at the create or operation submit boundary.

Create and Operation values remain flat and keyed by declared field or input names. The hidden input rendered by `FormlessUiFieldSubmitFormAdapter` is an adapter at the HTML form boundary, not the source of truth.

### Access and interaction

- **Editable**: the field can author a patch or submit value.
- **Disabled**: writable in principle but unavailable for the current interaction.
- **Read-only**: display only.
- **System**: display record metadata and never author it.
- **State machine**: display the current state and invoke declared transition operations; never patch the enum field directly.

Pending, disabled, and error are Astryx-native component states. They are not dedicated fixture axes unless legacy behavior is field- or surface-specific. Fixtures may include representative states needed to verify draft preservation or a specific interaction.

### Fixture composition and explorer behavior

`lib/astryx/src/components/field-scenario-model.ts` builds variants from independent axes. `composeScenarioGroup` applies axis modifiers, `projectScenarioGroup` projects from selected facet values, and `include` removes conditionally invalid combinations. `mergeScenarioGroupsByKind` adds Surface as another facet; it does not combine Surface with Mode or Value into scenario names.

`lib/astryx/src/components/fields.tsx` renders one control per available facet, normalizes selections when the field kind changes, and selects the variant whose facet values match all current selections. Local interaction simulation produces a field override keyed by scenario identity. It does not make the fixture label evidence of legacy support.

## 3. Shared legacy defaults

| Surface     | Mode    | Values                     | Requiredness         | Presentation                                      | Label                                        | Commit                    | Legacy source                                                                                                                                                 |
| ----------- | ------- | -------------------------- | -------------------- | ------------------------------------------------- | -------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create      | Editor  | draft/default              | required or optional | field/editor-derived                              | visible                                      | submit                    | `src/app/generated/create.tsx` `GeneratedCreateForm`, `GeneratedCreateDialogForm`; `src/app/generated/create-field-control.tsx` `GeneratedCreateFieldControl` |
| Record      | Editor  | committed value plus draft | required or optional | normal, compact, or heading as selected by layout | hidden by default; accessible label retained | immediate or field commit | `src/app/generated/collection.tsx` `RecordRow`, `ContextRecordEditor`; `src/app/generated/record-field-editor.tsx` `RecordFieldEditor`                        |
| Record      | Display | committed value            | required or optional | field/editor-derived                              | hidden by default                            | not applicable            | `src/app/generated/record-field-editor.tsx` `ReadOnlyRecordFieldDisplay`; `src/app/generated/record-field-display.tsx` `RecordFieldDisplay`                   |
| Table Cell  | Editor  | committed value plus draft | required or optional | compact                                           | hidden; table header supplies column label   | immediate or field commit | `src/app/generated/table.tsx` `RecordTableCell`; `src/app/generated/record-field-editor.tsx` `RecordFieldEditor`                                              |
| Table Cell  | Display | committed value            | required or optional | compact                                           | hidden; table header supplies column label   | not applicable            | `src/app/generated/table.tsx` `RecordTableCell`; `src/app/generated/record-field-display.tsx` `RecordFieldDisplay`                                            |
| Item Detail | Editor  | committed value plus draft | required or optional | normal                                            | visible                                      | immediate or field commit | `src/app/generated/collection.tsx` `RecordDetail`; `src/app/generated/record-field-editor.tsx` `RecordFieldEditor`                                            |
| Item Detail | Display | committed value            | required or optional | normal                                            | visible                                      | not applicable            | `src/app/generated/record-field-editor.tsx` `ReadOnlyRecordFieldDisplay`                                                                                      |
| Operation   | Editor  | controlled draft           | required or optional | operation-control-derived                         | visible                                      | submit                    | `src/app/generated/operation-field-authoring.ts`; `src/app/routes/auth-account.tsx` `ProfileCompletionInputField`                                             |

Shared legacy rules:

- `recordFieldIsWritable` and the presence of an update operation decide whether an existing-record field edits or displays. System and state-machine fields remain non-patchable.
- `RecordFieldEditor` defaults `showLabel` to `false`. `RecordDetail` passes `showLabel={true}`. Table editors pass `density="compact"` and do not request a visible label.
- The projection equivalent is `projectGeneratedRecordFormlessUiField`: it selects Editor versus Display, projects access, and sets label visibility from the surface and `showLabel`.
- Operation support is limited to public-safe text, long text, boolean, date, number, and enum controls. Unsupported required operation inputs become configuration errors.
- Create and update draft resolvers preserve invalid draft text and omit hidden, non-writable, system, and state-machine-owned fields from operation input.

Current Astryx fixture defaults mirror the legacy layout: `lib/astryx/src/components/fields/fixture-helpers.ts` `baseField` hides Record and Table Cell labels while leaving Create, Item Detail, and Operation labels visible. Production `src/app/generated/formless-ui-projection.ts` projects the same surface behavior.

## 4. Field matrices

### State machine enum

#### Legacy support

| Surface     | Mode                                                           | Values                              | Requiredness      | Presentation                          | Label                                               | Commit                         | Legacy source                                                                                                                                                                 |
| ----------- | -------------------------------------------------------------- | ----------------------------------- | ----------------- | ------------------------------------- | --------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create      | Editor with fixed initial state                                | Known initial                       | schema-owned      | state badge                           | visible                                             | submit initial value           | `src/app/generated/create-field-control.tsx` `CreateStateMachineField`                                                                                                        |
| Record      | Display with optional transition controls elsewhere in the row | Active, Terminal, Unset, Undeclared | no direct editing | badge; terminal uses dashed treatment | hidden by default; badge has accessible state label | transition operation           | `src/app/generated/record-field-editor.tsx` `StateMachineRecordField`; `src/app/generated/state-machine-ui.tsx` `StateMachineStateBadge`, `RecordTransitionOperationControls` |
| Table Cell  | Display or transition menu                                     | Active, Terminal, Unset, Undeclared | no direct editing | compact badge; terminal distinguished | hidden; menu trigger has accessible state label     | transition operation from menu | `src/app/generated/table.tsx` `StateTransitionTableCell`; `src/app/generated/state-machine-ui.tsx` `RecordStateTransitionMenu`                                                |
| Item Detail | Display with transition controls                               | Active, Terminal, Unset, Undeclared | no direct editing | badge; terminal distinguished         | visible                                             | transition operation           | `src/app/generated/collection.tsx` `RecordDetail`; `src/app/generated/state-machine-ui.tsx` `RecordTransitionOperationControls`                                               |

Operation input support for a state-machine-owned enum was not found. Existing records never inherit direct enum editing. Invalid transitions are omitted from the table menu or disabled in explicit transition controls using schema-derived availability.

#### Current Astryx coverage

`lib/astryx/src/components/fields/state-machine-field.fixtures.ts` covers Create initial state and Record, Table Cell, and Item Detail across Active, Terminal, Undeclared, and Unset values. Existing-record fixtures independently select Transitions or Display interaction. Record and Table Cell labels are hidden; Item Detail labels are visible. `StateMachineField` routes all fields with `stateMachineFacts` to `StateInput` instead of `EnumFieldEditor`.

The contract already makes declared/unset/undeclared status, terminal state, interaction kind, transition operation, availability, and pending state explicit through `FormlessUiStateMachineFacts`.

#### Required migration parity

- Preserve the fixed initial-state Create behavior and submit the initial value without exposing enum selection.
- Preserve Active versus Terminal presentation, Unset, and Undeclared raw values on every existing-record surface.
- Preserve Record badge label hiding and accessible labeling.
- Keep state transitions operation-backed and separate from field commit semantics.
- Preserve the Table Cell transition-menu invocation source. Current Astryx `StateMachineField` emits `source: "button"` on every surface.
- Verify disabled/hidden transition behavior from projected availability. Do not add a generic disabled-state fixture axis.

#### Contract facts to make explicit

Display density, label visibility, and transition invocation source must be projected explicitly. The renderer must not reconstruct terminality, valid transitions, labels, presentation, or button-versus-menu invocation from the surface or schema-shaped machine facts.

#### Optional improvements

- Add a focused pending-transition fixture only if needed to test the existing transition pending contract.

### Enum

#### Legacy support

| Surface     | Mode    | Values                                            | Requiredness                                      | Presentation                                       | Label                                                                      | Commit         | Legacy source                                                                                                                                                            |
| ----------- | ------- | ------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create      | Editor  | Known, Unset                                      | required omits blank option; optional includes it | native label select                                | visible                                                                    | submit         | `src/app/generated/create-field-control.tsx` enum branch                                                                                                                 |
| Record      | Editor  | Known, Unset, Undeclared                          | required and optional                             | plain label select; rich trigger/list combinations | hidden visually; `Label` is screen-reader-only and select has `aria-label` | immediate      | `src/app/generated/record-field-control.tsx` `RecordEnumFieldRenderer`, `RecordEnumIconOnlyFieldRenderer`                                                                |
| Record      | Display | Known, Unset, Undeclared                          | required and optional                             | label or icon-only                                 | hidden by default                                                          | not applicable | `src/app/generated/record-field-display.tsx` `RecordFieldDisplay`, `RecordEnumIconDisplay`                                                                               |
| Table Cell  | Editor  | Known, Unset, Undeclared                          | required and optional                             | compact plain or rich select                       | hidden; accessible label retained                                          | immediate      | `src/app/generated/table.tsx` `RecordTableCell`; `src/app/generated/record-field-control.tsx` enum renderers                                                             |
| Table Cell  | Display | Known, Unset, Undeclared                          | required and optional                             | compact label or icon-only                         | hidden                                                                     | not applicable | `src/app/generated/record-field-display.tsx` `RecordEnumIconDisplay`                                                                                                     |
| Item Detail | Editor  | Known, Unset, Undeclared                          | required and optional                             | plain or rich select                               | visible                                                                    | immediate      | `src/app/generated/collection.tsx` `RecordDetail`; `src/app/generated/record-field-control.tsx` enum renderers                                                           |
| Item Detail | Display | Known, Unset, Undeclared                          | required and optional                             | label or icon-only                                 | visible                                                                    | not applicable | `src/app/generated/record-field-editor.tsx` `ReadOnlyRecordFieldDisplay`; `src/app/generated/record-field-display.tsx`                                                   |
| Operation   | Editor  | Known and Unset; Undeclared is a validation error | required and optional                             | label select                                       | visible                                                                    | submit         | `src/app/generated/operation-field-authoring.ts` `resolveGeneratedOperationEnumInputFieldValue`; `src/app/routes/auth-account.tsx` `renderProfileCompletionInputControl` |

Undeclared existing-record values are retained as a temporary select option or raw display label. Enum presentation is derived by `enumValuePresentation`. A missing icon falls back to the label; an unrecognized color token resolves to neutral.

#### Current Astryx coverage

`lib/astryx/src/components/fields/enum-field.fixtures.ts` composes:

- Create: requiredness × Known/Unset;
- Record: requiredness × Known/Unset/Undeclared × supported presentation examples;
- Table Cell: Editor plain/rich and Display icon-only;
- Item Detail: Editor/Display × Known/Unset/Undeclared for supported plain or icon-only combinations; and
- Operation: requiredness × Known/Unset/Undeclared, with projected validation errors.

The fixtures use separate `presentation`, `trigger`, and `list` facets. `EnumFieldEditor` consumes projected `FormlessUiEnumFacts` and `FormlessUiEnumOption` data. Declared, unset, and undeclared status kinds already exist in the contract. Astryx `Selector` keeps the selected label visible, so projected editor triggers normalize source `icon` and `both` content to icon-plus-label. Icon-only display remains supported.

#### Required migration parity

- Keep enum fields directly editable on writable existing-record surfaces.
- Preserve hidden visible labels plus accessible labels on Record and Table Cell.
- Preserve Undeclared values without silently selecting a declared value.
- Preserve required/optional clearing and submit validation.
- Preserve schema-derived label or icon-plus-label editor content and neutral/text fallback when tokens are missing. Exact legacy icon-only editor triggers are not required; Astryx normalizes them to icon-plus-label.
- Add only source-supported table and detail combinations; a full trigger × list × presentation cross-product is not required.

#### Contract facts to make explicit

The contract already carries editor/display enum facts, value status, content selection, resolved icon source, token knowledge, and color intent. Label visibility and display density should be required projection facts rather than renderer fallbacks.

#### Optional improvements

- Add a Table Cell Display example for a plain label only if it helps compare compact typography; it is not a distinct interaction rule.

### Reference

#### Legacy support

| Surface     | Mode    | Values                             | Requiredness                                                                   | Presentation                         | Label                                        | Commit         | Legacy source                                                                                                                    |
| ----------- | ------- | ---------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------ | -------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Create      | Editor  | Known, Unset                       | required selects a default option when no draft exists; optional permits blank | label select                         | visible                                      | submit         | `src/app/generated/create-field-control.tsx` `ReferenceCreateFieldSelect`                                                        |
| Record      | Editor  | Known, Unset, missing reference id | required and optional                                                          | label select                         | hidden by default; accessible label retained | immediate      | `src/app/generated/record-field-control.tsx` `RecordReferenceFieldSelect`                                                        |
| Record      | Display | Known, Unset, missing reference id | required and optional                                                          | resolved label or stored id fallback | hidden by default                            | not applicable | `src/app/generated/record-field-display.tsx` `RecordReferenceDisplayValue`                                                       |
| Table Cell  | Editor  | Known, Unset, missing reference id | required and optional                                                          | compact label select                 | hidden                                       | immediate      | `src/app/generated/table.tsx` `RecordTableCell`, `ResolvedReferenceFieldTableCell`; `src/app/generated/record-field-control.tsx` |
| Table Cell  | Display | Known, Unset, missing reference id | required and optional                                                          | resolved label or stored id fallback | hidden                                       | not applicable | `src/app/generated/table.tsx`; `src/app/generated/record-field-display.tsx`                                                      |
| Item Detail | Editor  | Known, Unset, missing reference id | required and optional                                                          | label select                         | visible                                      | immediate      | `src/app/generated/collection.tsx` `RecordDetail`; `src/app/generated/record-field-control.tsx`                                  |
| Item Detail | Display | Known, Unset, missing reference id | required and optional                                                          | resolved label or stored id fallback | visible                                      | not applicable | `src/app/generated/record-field-editor.tsx` `ReadOnlyRecordFieldDisplay`                                                         |

Operation support was not found. Identity-reference targets use the stored flat id when display-safe options are unavailable; they do not read unrelated app storage.

#### Current Astryx coverage

`lib/astryx/src/components/fields/reference-field.fixtures.ts` covers Create, Record, Table Cell, and Item Detail combinations across requiredness, Editor and Display modes, Known, missing-reference, and Unset states. `FormlessUiReferenceFacts.valueStatus` carries resolved, missing, or unset status separately from real selectable options.

#### Required migration parity

- Add optional Create Unset behavior.
- Add Record, Table Cell, and Item Detail Editor coverage, including immediate selection commit.
- Add Table Cell and Item Detail Display coverage where needed to verify density and labels.
- Preserve the stored id for missing options; do not relabel or clear it.

#### Contract facts to make explicit

The missing fallback id is an explicit Reference value-status fact and is not inserted into the selectable option list. Option loading state is not currently a distinct field fact; add one only if production projection needs to distinguish “not loaded” from “loaded with no match.” Do not infer that distinction from an empty option list.

#### Optional improvements

- None identified from legacy behavior.

### Text

#### Legacy support

| Surface     | Mode    | Values       | Requiredness          | Presentation                                | Label                                               | Commit                                              | Legacy source                                                                                                                           |
| ----------- | ------- | ------------ | --------------------- | ------------------------------------------- | --------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Create      | Editor  | Known, Unset | required and optional | text input and input attributes             | visible                                             | submit                                              | `src/app/generated/create-field-control.tsx` default text branch                                                                        |
| Record      | Editor  | Known, Unset | required and optional | normal text or heading autosize editor      | hidden by default; heading also hides visible label | field commit on blur; Enter commits; Escape reverts | `src/app/generated/record-field-control.tsx` `RecordTextFieldRenderer`, `RecordAutosizeTextFieldRenderer`                               |
| Record      | Display | Known, Unset | required and optional | formatted text and suffix                   | hidden by default                                   | not applicable                                      | `src/app/generated/record-field-display.tsx` generic display branch                                                                     |
| Table Cell  | Editor  | Known, Unset | required and optional | compact text input                          | hidden                                              | field commit on blur; Enter commits; Escape reverts | `src/app/generated/table.tsx` `RecordTableCell`; `src/app/generated/record-field-control.tsx`                                           |
| Table Cell  | Display | Known, Unset | required and optional | compact formatted text                      | hidden                                              | not applicable                                      | `src/app/generated/record-field-display.tsx`                                                                                            |
| Item Detail | Editor  | Known, Unset | required and optional | normal text                                 | visible                                             | field commit on blur; Enter commits; Escape reverts | `src/app/generated/collection.tsx` `RecordDetail`; `src/app/generated/record-field-control.tsx`                                         |
| Item Detail | Display | Known, Unset | required and optional | formatted text and suffix                   | visible                                             | not applicable                                      | `src/app/generated/record-field-editor.tsx` `ReadOnlyRecordFieldDisplay`                                                                |
| Operation   | Editor  | Known, Unset | required and optional | text input with supported format attributes | visible                                             | submit                                              | `src/app/generated/operation-field-authoring.ts` text resolver; `src/app/routes/auth-account.tsx` `renderProfileCompletionInputControl` |

#### Current Astryx coverage

`lib/astryx/src/components/fields/text-field.fixtures.ts` covers required Create, Record field-commit with a representative pending state, and system Item Detail Display. It does not cover Table Cell, writable Item Detail, normal Display, optional/Unset, Operation, or heading presentation.

#### Required migration parity

- Add Record heading presentation and explicit hidden label behavior.
- Add compact Table Cell Editor and Display.
- Add writable and read-only Item Detail examples.
- Add Operation and optional/Unset submission examples.
- Preserve raw drafts until commit and retain accessible labels when visible labels are hidden.
- Add Escape revert. `TextFieldEditor` now preserves legacy blur and Enter commit boundaries.

#### Contract facts to make explicit

`presentationMode`, commit policy, input attributes, suffix, access, and label visibility exist. Display density is inferred by Astryx and should be explicit.

#### Optional improvements

- Do not make pending a general text axis; retain one representative state only while it verifies draft preservation.

### Long text

#### Legacy support

| Surface     | Mode    | Values       | Requiredness          | Presentation                                  | Label             | Commit                               | Legacy source                                                                                                                               |
| ----------- | ------- | ------------ | --------------------- | --------------------------------------------- | ----------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Create      | Editor  | Known, Unset | required and optional | textarea                                      | visible           | submit                               | `src/app/generated/create-field-control.tsx` textarea branch                                                                                |
| Record      | Editor  | Known, Unset | required and optional | textarea                                      | hidden by default | field commit on blur; Escape reverts | `src/app/generated/record-field-control.tsx` `RecordTextareaFieldRenderer`                                                                  |
| Record      | Display | Known, Unset | required and optional | plain formatted text                          | hidden by default | not applicable                       | `src/app/generated/record-field-display.tsx` generic branch                                                                                 |
| Table Cell  | Editor  | Known, Unset | required and optional | compact textarea                              | hidden            | field commit on blur; Escape reverts | `src/app/generated/table.tsx`; `src/app/generated/record-field-control.tsx`                                                                 |
| Table Cell  | Display | Known, Unset | required and optional | compact plain text                            | hidden            | not applicable                       | `src/app/generated/record-field-display.tsx`                                                                                                |
| Item Detail | Editor  | Known, Unset | required and optional | textarea                                      | visible           | field commit on blur; Escape reverts | `src/app/generated/collection.tsx` `RecordDetail`                                                                                           |
| Item Detail | Display | Known, Unset | required and optional | plain formatted text                          | visible           | not applicable                       | `src/app/generated/record-field-editor.tsx` `ReadOnlyRecordFieldDisplay`                                                                    |
| Operation   | Editor  | Known, Unset | required and optional | four-row textarea in the observed public form | visible           | submit                               | `src/app/generated/operation-field-authoring.ts` long-text mapping; `src/app/routes/auth-account.tsx` `renderProfileCompletionInputControl` |

#### Current Astryx coverage

`lib/astryx/src/components/fields/text-field.fixtures.ts` has only Item Detail Display. `TextareaFieldEditor` exists and emits draft change plus blur commit.

#### Required migration parity

- Add Create, Record, Table Cell, writable Item Detail, and Operation Editor coverage.
- Add Record and Table Cell Display only where needed to verify label and density behavior.
- Preserve field-commit and submit boundaries.

#### Contract facts to make explicit

Rows and density are currently renderer choices. Density must be projected; row count may remain renderer-owned unless a schema or presentation fact requires it.

#### Optional improvements

- None identified from legacy behavior.

### Markdown

#### Legacy support

| Surface     | Mode    | Values       | Requiredness          | Presentation                                        | Label             | Commit                               | Legacy source                                                                                                                                                           |
| ----------- | ------- | ------------ | --------------------- | --------------------------------------------------- | ----------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create      | Editor  | Known, Unset | required and optional | controlled Markdown source textarea                 | visible           | submit                               | `src/app/generated/create-field-control.tsx` `CreateMarkdownField`                                                                                                      |
| Record      | Editor  | Known, Unset | required and optional | Markdown source editor                              | hidden by default | field commit on blur; Escape reverts | `src/app/generated/record-field-control.tsx` `RecordMarkdownFieldRenderer`                                                                                              |
| Record      | Display | Known, Unset | required and optional | rendered Markdown when read-only                    | hidden by default | not applicable                       | `src/app/generated/record-field-display.tsx` `RecordMarkdownDisplay`                                                                                                    |
| Table Cell  | Editor  | Known, Unset | required and optional | compact textarea fallback, not rich Markdown layout | hidden            | field commit on blur; Escape reverts | `src/app/generated/record-field-renderer-model.ts` `selectGeneratedRecordFieldRendererKind`; `src/app/generated/record-field-control.tsx` `RecordTextareaFieldRenderer` |
| Table Cell  | Display | Known, Unset | required and optional | compact rendered Markdown when read-only            | hidden            | not applicable                       | `src/app/generated/record-field-display.tsx` `RecordMarkdownDisplay`                                                                                                    |
| Item Detail | Editor  | Known, Unset | required and optional | Markdown source editor                              | visible           | field commit on blur; Escape reverts | `src/app/generated/collection.tsx` `RecordDetail`; `src/app/generated/record-field-control.tsx`                                                                         |
| Item Detail | Display | Known, Unset | required and optional | rendered Markdown                                   | visible           | not applicable                       | `src/app/generated/record-field-display.tsx` `RecordMarkdownDisplay`                                                                                                    |

Operation Markdown support was not found. Public-safe text inputs map to the text editor, not the Markdown editor.

#### Current Astryx coverage

`lib/astryx/src/components/fields/text-field.fixtures.ts` covers Create Editor and Item Detail Display. `MarkdownFieldEditor` and `MarkdownFieldDisplayValue` exist.

#### Required migration parity

- Add Record and Item Detail source Editor coverage with field commit.
- Add compact Table Cell Editor using the legacy textarea fallback.
- Add Record and Table Cell read-only Markdown display.
- Preserve flat Markdown source and do not introduce rich-text document state.

#### Contract facts to make explicit

The contract explicitly selects `markdown` versus `textarea` renderer kinds. Density and label visibility must also be explicit so the renderer does not infer the compact fallback from surface alone.

#### Optional improvements

- A richer compact Markdown editor would be post-migration behavior, not parity.

### Number

#### Legacy support

| Surface     | Mode    | Values                                                    | Requiredness          | Presentation                                                          | Label             | Commit                                        | Legacy source                                                                                                   |
| ----------- | ------- | --------------------------------------------------------- | --------------------- | --------------------------------------------------------------------- | ----------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Create      | Editor  | Known, Unset, invalid draft retained by authoring session | required and optional | numeric input with min/max/step/integer facts                         | visible           | submit                                        | `src/app/generated/create-field-control.tsx` `CreateNumberField`; `src/app/generated/create-field-authoring.ts` |
| Record      | Editor  | Known, Unset, invalid draft                               | required and optional | plain/currency/percent; optional suffix; optional value-unit selector | hidden by default | field commit on blur or Enter; Escape reverts | `src/app/generated/record-field-control.tsx` `RecordNumberFieldRenderer`, `RecordValueUnitFieldRenderer`        |
| Record      | Display | Known, Unset                                              | required and optional | formatted value and suffix                                            | hidden by default | not applicable                                | `src/app/generated/record-field-display.tsx`; `src/app/generated/format.ts`                                     |
| Table Cell  | Editor  | Known, Unset, invalid draft                               | required and optional | compact number or value-unit control                                  | hidden            | field commit                                  | `src/app/generated/table.tsx`; `src/app/generated/record-field-control.tsx`                                     |
| Table Cell  | Display | Known, Unset                                              | required and optional | compact formatted value and suffix                                    | hidden            | not applicable                                | `src/app/generated/record-field-display.tsx`                                                                    |
| Item Detail | Editor  | Known, Unset, invalid draft                               | required and optional | number or value-unit control                                          | visible           | field commit                                  | `src/app/generated/collection.tsx` `RecordDetail`                                                               |
| Item Detail | Display | Known, Unset                                              | required and optional | formatted value and suffix                                            | visible           | not applicable                                | `src/app/generated/record-field-editor.tsx` `ReadOnlyRecordFieldDisplay`                                        |
| Operation   | Editor  | Known, Unset, invalid draft                               | required and optional | number input                                                          | visible           | submit                                        | `src/app/generated/operation-field-authoring.ts` number resolver; `src/app/routes/auth-account.tsx`             |

#### Current Astryx coverage

`lib/astryx/src/components/fields/number-field.fixtures.ts` covers Create and Operation submit fields plus Record, Table Cell, and Item Detail editor/display fields. Its existing-surface axes include plain, number, currency, and percent formats; static suffixes; scalar and value-unit composition; declared, unset, and undeclared units; and invalid raw drafts.

#### Implemented migration parity

- Create and Operation submit coverage includes invalid raw draft preservation.
- Compact Table Cell and Item Detail Editor/Display coverage is explicit.
- Formatted display and suffix coverage follows source field configuration.
- Value and unit drafts remain separately controlled and resolve to flat patch fields.

#### Contract facts to make explicit

Format, suffix, value-unit field metadata, both drafts, and commit policy are explicit. Display density must be explicit. The renderer must not choose a unit or repair an invalid numeric draft.

#### Optional improvements

- None identified from legacy behavior.

### Date

#### Legacy support

| Surface     | Mode    | Values                                         | Requiredness          | Presentation                                   | Label             | Commit                                                  | Legacy source                                                                                     |
| ----------- | ------- | ---------------------------------------------- | --------------------- | ---------------------------------------------- | ----------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Create      | Editor  | Known, Unset                                   | required and optional | date picker                                    | visible           | submit                                                  | `src/app/generated/create-field-control.tsx` `CreateDateField`                                    |
| Record      | Editor  | Known, Unset                                   | required and optional | default or optional empty `valueOrInteraction` | hidden by default | field commit on selection/blur or Enter; Escape reverts | `src/app/generated/record-field-control.tsx` `RecordDateFieldRenderer`                            |
| Record      | Display | Known, Unset                                   | required and optional | formatted date                                 | hidden by default | not applicable                                          | `src/app/generated/record-field-display.tsx`; `src/app/generated/format.ts`                       |
| Table Cell  | Editor  | Known, Unset                                   | required and optional | compact date picker                            | hidden            | field commit                                            | `src/app/generated/table.tsx`; `src/app/generated/record-field-control.tsx`                       |
| Table Cell  | Display | Known, Unset                                   | required and optional | compact formatted date                         | hidden            | not applicable                                          | `src/app/generated/record-field-display.tsx`                                                      |
| Item Detail | Editor  | Known, Unset                                   | required and optional | normal date picker                             | visible           | field commit                                            | `src/app/generated/collection.tsx` `RecordDetail`                                                 |
| Item Detail | Display | Known, Unset; system timestamps also supported | required and optional | formatted date/time                            | visible           | not applicable                                          | `src/app/generated/record-field-editor.tsx` `ReadOnlyRecordFieldDisplay`                          |
| Operation   | Editor  | Known, Unset                                   | required and optional | date input                                     | visible           | submit                                                  | `src/app/generated/operation-field-authoring.ts` date resolver; `src/app/routes/auth-account.tsx` |

`valueOrInteraction` applies only to an empty optional control in observed presentation logic. It stays visually quiet until hover, row hover, or focus.

#### Current Astryx coverage

`lib/astryx/src/components/fields/date-field.fixtures.ts` covers Create and Operation submit fields plus Record, Table Cell, and Item Detail editor/display fields. Existing-record coverage includes requiredness × known/unset values, the valid quiet-date condition, read-only display, compact density, and system timestamp display.

#### Implemented migration behavior

- Astryx `DateInput` owns text parsing, calendar selection, clear, blur, Enter, and Escape behavior. Existing-record changes invoke the field commit intent through `changeAction`; no wrapper recreates the legacy segmented picker lifecycle.
- Optional inputs expose the native clear affordance. Create and Operation inputs remain submit-bound.
- Empty optional `valueOrInteraction` fields stay quiet until hover or focus. Containing row hover remains layout-owned.
- Date and system timestamp displays use Astryx `Timestamp` with projected date or date-time intent. Unset values stay blank.

#### Contract facts to make explicit

Presentation visibility, renderer kind, display density, and temporal display intent are explicit. Row-hover interaction context remains containing-layout behavior.

#### Optional improvements

- None identified from legacy behavior.

### Boolean

#### Legacy support

| Surface     | Mode    | Values                                         | Requiredness          | Presentation                                         | Label                                    | Commit                     | Legacy source                                                                                                                      |
| ----------- | ------- | ---------------------------------------------- | --------------------- | ---------------------------------------------------- | ---------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Create      | Editor  | true, false/default                            | required and optional | checkbox or completion                               | checkbox label visible                   | submit                     | `src/app/generated/create-field-control.tsx` checkbox branch                                                                       |
| Record      | Editor  | true, false                                    | required and optional | checkbox or completion                               | hidden by default; `aria-label` retained | immediate                  | `src/app/generated/record-field-control.tsx` `RecordCheckboxFieldRenderer`                                                         |
| Record      | Display | true, false, Unset formatted by shared display | required and optional | text display; completion metadata may remain present | hidden by default                        | not applicable             | `src/app/generated/record-field-display.tsx` generic branch                                                                        |
| Table Cell  | Editor  | true, false                                    | required and optional | compact checkbox or completion                       | hidden                                   | immediate                  | `src/app/generated/table.tsx`; `src/app/generated/record-field-control.tsx`                                                        |
| Table Cell  | Display | true, false, Unset                             | required and optional | compact formatted display                            | hidden                                   | not applicable             | `src/app/generated/record-field-display.tsx`                                                                                       |
| Item Detail | Editor  | true, false                                    | required and optional | checkbox or completion                               | visible                                  | immediate                  | `src/app/generated/collection.tsx` `RecordDetail`                                                                                  |
| Item Detail | Display | true, false, Unset                             | required and optional | formatted display                                    | visible                                  | not applicable             | `src/app/generated/record-field-editor.tsx` `ReadOnlyRecordFieldDisplay`                                                           |
| Operation   | Editor  | true, false                                    | required and optional | checkbox                                             | visible                                  | submit; false is preserved | `src/app/generated/operation-field-authoring.ts` boolean resolver; `src/app/routes/auth-account.tsx` `ProfileCompletionInputField` |

#### Current Astryx coverage

`lib/astryx/src/components/fields/boolean-field.fixtures.ts` covers Record default/completion Editor and one Operation Editor. Create, Table Cell, Item Detail, Display, and value-state axes are absent.

#### Required migration parity

- Add Create, Table Cell, and Item Detail Editor coverage.
- Add representative Display coverage without treating Astryx badge wording as a legacy requirement.
- Verify true and false immediate commits and false preservation at submit.
- Preserve hidden visible labels and accessible control labels on Record and Table Cell.

#### Contract facts to make explicit

Completion presentation, value, access, commit, and label visibility are explicit. Astryx display labels such as “Complete” and “Open” are renderer choices and must not be treated as legacy-derived product copy unless the contract supplies them.

#### Optional improvements

- Astryx badge display for booleans is post-migration presentation unless separately specified.

### Color

#### Legacy support

| Surface     | Mode    | Values                                                       | Requiredness          | Presentation                                                                 | Label             | Commit               | Legacy source                                                                           |
| ----------- | ------- | ------------------------------------------------------------ | --------------------- | ---------------------------------------------------------------------------- | ----------------- | -------------------- | --------------------------------------------------------------------------------------- |
| Create      | Editor  | valid hex, Unset; invalid text remains validation input      | required and optional | color input plus text value                                                  | visible           | submit               | `src/app/generated/create-field-control.tsx` `CreateColorField`                         |
| Record      | Editor  | valid hex, Unset, invalid/alpha/token text retained as draft | required and optional | color input                                                                  | hidden by default | field commit on blur | `src/app/generated/record-field-control.tsx` `RecordColorFieldRenderer`                 |
| Record      | Display | any stored text                                              | required and optional | valid hex gets swatch plus text; other text remains visible without a swatch | hidden by default | not applicable       | `src/app/generated/record-field-display.tsx` `RecordColorDisplay`, `ColorDisplaySwatch` |
| Table Cell  | Editor  | same as Record                                               | required and optional | compact color input                                                          | hidden            | field commit         | `src/app/generated/table.tsx`; `src/app/generated/record-field-control.tsx`             |
| Table Cell  | Display | any stored text                                              | required and optional | compact swatch plus text when valid                                          | hidden            | not applicable       | `src/app/generated/record-field-display.tsx`                                            |
| Item Detail | Editor  | same as Record                                               | required and optional | normal color input                                                           | visible           | field commit         | `src/app/generated/collection.tsx` `RecordDetail`                                       |
| Item Detail | Display | any stored text                                              | required and optional | swatch plus text when valid                                                  | visible           | not applicable       | `src/app/generated/record-field-display.tsx`                                            |

Operation Color support was not found.

#### Current Astryx coverage

`lib/astryx/src/components/fields/color-field.fixtures.ts` covers Record field-commit Editor, compact Table Cell Editor, and Item Detail Display for a hex value and a CSS-token-like value.

#### Required migration parity

- Add Create submit coverage.
- Add Record/Table Cell Display and writable Item Detail coverage.
- Add a retained invalid or alpha value to verify that the renderer does not coerce it.
- Preserve visible raw text when no swatch can be rendered.
- Preserve blur-based field commit. Record and Table Cell color fixtures now use the legacy field-commit policy.

#### Contract facts to make explicit

Projected draft and display text are explicit. The contract does not separately state whether a color is representable by the picker; add a projected validity/representability fact only if the renderer otherwise must parse it.

#### Optional improvements

- Token-aware previews are not legacy parity. Keep them separate from retaining token text.

### Source icon

#### Legacy support

| Surface     | Mode    | Values                                                          | Requiredness          | Presentation                                 | Label             | Commit                                             | Legacy source                                                                                                                                      |
| ----------- | ------- | --------------------------------------------------------------- | --------------------- | -------------------------------------------- | ----------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create      | Editor  | catalog SVG source, custom SVG source, Unset                    | required and optional | catalog-first picker with custom source mode | visible           | picker Save updates draft; form submit commits     | `src/app/generated/create-field-control.tsx` `CreateIconField`; `src/app/generated/field-control-primitives.tsx` `GeneratedIconPickerFieldControl` |
| Record      | Editor  | catalog SVG source, custom SVG source, Unset, parse error draft | required and optional | picker and source preview                    | hidden by default | picker Save is field commit; Cancel restores draft | `src/app/generated/record-field-control.tsx` `RecordIconFieldRenderer`; `src/app/generated/record-field-editor.tsx` icon handlers                  |
| Record      | Display | source or Unset                                                 | required and optional | SVG icon                                     | hidden by default | not applicable                                     | `src/app/generated/record-field-display.tsx` `RecordIconDisplay`                                                                                   |
| Table Cell  | Editor  | same as Record                                                  | required and optional | compact picker                               | hidden            | picker Save                                        | `src/app/generated/table.tsx`; `src/app/generated/record-field-control.tsx`                                                                        |
| Table Cell  | Display | source or Unset                                                 | required and optional | compact SVG icon                             | hidden            | not applicable                                     | `src/app/generated/record-field-display.tsx`                                                                                                       |
| Item Detail | Editor  | same as Record                                                  | required and optional | normal picker                                | visible           | picker Save                                        | `src/app/generated/collection.tsx` `RecordDetail`                                                                                                  |
| Item Detail | Display | source or Unset                                                 | required and optional | SVG icon                                     | visible           | not applicable                                     | `src/app/generated/record-field-display.tsx`                                                                                                       |

Operation Source Icon support was not found.

#### Current Astryx coverage

`lib/astryx/src/components/fields/icon-field.fixtures.ts` covers only Item Detail Display with source and empty values. `FormlessUiIconPickerFacts` carries catalog options, dialog state, custom parse error, Save/Cancel availability, and source-backed selection, but `IconFieldEditor` currently renders a text input plus preview rather than the picker flow.

#### Required migration parity

- Add Create, Record, Table Cell, and writable Item Detail picker fixtures.
- Exercise catalog selection, custom source, Unset, parse error, Cancel, and Save only where they map to the existing picker contract.
- Add compact and normal Display coverage as needed for sizing and labels.
- Keep stored values as SVG source, not icon ids.

#### Contract facts to make explicit

Picker facts are already explicit. The Astryx renderer must consume them instead of inferring picker state from the source string or replacing the picker with generic text editing.

#### Optional improvements

- Changes to the picker catalog or custom-source UX are post-migration work.

### Image

#### Legacy support

| Surface     | Mode    | Values                   | Requiredness          | Presentation                                                                       | Label             | Commit                                        | Legacy source                                                                                                                                          |
| ----------- | ------- | ------------------------ | --------------------- | ---------------------------------------------------------------------------------- | ----------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create      | Editor  | URL/text draft and Unset | required and optional | generic text input in the observed create renderer; no create upload control found | visible           | submit                                        | `src/app/generated/create-field-control.tsx` image branch                                                                                              |
| Record      | Editor  | URL/text draft, Unset    | required and optional | URL input with preview                                                             | hidden by default | field commit on blur or Enter; Escape reverts | `src/app/generated/record-field-control.tsx` `RecordMediaFieldRenderer`; `src/app/generated/record-field-authoring.ts` `mediaEditorModeForRecordField` |
| Record      | Display | stored text              | required and optional | generic text display; specialized legacy image display not found                   | hidden by default | not applicable                                | `src/app/generated/record-field-display.tsx` generic branch                                                                                            |
| Table Cell  | Editor  | same as Record           | required and optional | compact URL input with preview                                                     | hidden            | field commit                                  | `src/app/generated/table.tsx`; `src/app/generated/record-field-control.tsx`                                                                            |
| Table Cell  | Display | stored text              | required and optional | generic compact text; specialized legacy image display not found                   | hidden            | not applicable                                | `src/app/generated/record-field-display.tsx`                                                                                                           |
| Item Detail | Editor  | same as Record           | required and optional | normal URL input with preview                                                      | visible           | field commit                                  | `src/app/generated/collection.tsx` `RecordDetail`                                                                                                      |
| Item Detail | Display | stored text              | required and optional | generic text; specialized legacy image display not found                           | visible           | not applicable                                | `src/app/generated/record-field-display.tsx`                                                                                                           |

Operation Image support was not found.

#### Current Astryx coverage

`lib/astryx/src/components/fields/media-field.fixtures.ts` covers Image Create with an asset selection and a representative upload-pending state. `MediaFieldEditor` uses `ImageInput`; `MediaFieldDisplay` uses `ImageValueDisplay`.

#### Required migration parity

- Reconcile the current asset-id Create fixture with the observed legacy URL/text Create path. Do not claim asset selection as Create parity without a source projection that supplies it.
- Add Record, Table Cell, and writable Item Detail URL preview coverage.
- Preserve manual URL draft, blur/Enter commit, and Escape revert.
- Resolve the specification/implementation gap before claiming image upload parity: `generated-ui/spec.md` requires image upload, but `mediaEditorModeForRecordField` selects URL mode for `image` and `selectGeneratedRecordFieldMediaAuthoring` disables upload outside asset mode. `handleImageUpload` rejects non-asset mode.
- Keep legacy generic Display behavior until a specialized image display is separately specified; Astryx preview display is not evidence of legacy parity.

#### Contract facts to make explicit

`FormlessUiRecordField.media` explicitly carries editor mode, preview, selected asset/URL, upload enablement, and patch fields. Create and Display fields do not carry the same media authoring object. Add projected image preview and authoring facts for those modes only when the source surface supports them; do not infer them from options or value shape.

#### Optional improvements

- Specialized image previews on Display surfaces are a post-migration improvement unless promoted to the generated UI specification and projection.

### Media

#### Legacy support

| Surface     | Mode    | Values                                                   | Requiredness          | Presentation                                                                           | Label             | Commit                                                                | Legacy source                                                                                                                                    |
| ----------- | ------- | -------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create      | Editor  | text draft and Unset                                     | required and optional | generic text-input fallback; specialized asset picker not found in the create renderer | visible           | submit                                                                | `src/app/generated/create-field-control.tsx` final text fallback after control selection                                                         |
| Record      | Editor  | selected asset id, missing asset id, Unset, upload state | required and optional | core image-media asset picker, upload, and preview                                     | hidden by default | picker/upload patch; URL field commit only when projected in URL mode | `src/app/generated/record-field-control.tsx` `RecordMediaFieldRenderer`; `src/app/generated/record-field-authoring.ts` media authoring selectors |
| Record      | Display | stored asset id                                          | required and optional | generic text display; specialized legacy media display not found                       | hidden by default | not applicable                                                        | `src/app/generated/record-field-display.tsx` generic branch                                                                                      |
| Table Cell  | Editor  | same as Record                                           | required and optional | compact media control                                                                  | hidden            | picker/upload patch                                                   | `src/app/generated/table.tsx`; `src/app/generated/record-field-control.tsx`                                                                      |
| Table Cell  | Display | stored asset id                                          | required and optional | generic compact text                                                                   | hidden            | not applicable                                                        | `src/app/generated/record-field-display.tsx`                                                                                                     |
| Item Detail | Editor  | same as Record                                           | required and optional | normal media control                                                                   | visible           | picker/upload patch                                                   | `src/app/generated/collection.tsx` `RecordDetail`                                                                                                |
| Item Detail | Display | stored asset id                                          | required and optional | generic text                                                                           | visible           | not applicable                                                        | `src/app/generated/record-field-display.tsx`                                                                                                     |

Operation Media support was not found.

#### Current Astryx coverage

`lib/astryx/src/components/fields/media-field.fixtures.ts` covers one Record Editor with selected asset, preview, upload enabled, asset options, and field-commit metadata. No Create, Table Cell, Item Detail, missing asset, Unset, or Display fixture exists.

#### Required migration parity

- Add Record missing-asset and Unset behavior.
- Add compact Table Cell and writable Item Detail Editor coverage.
- Preserve selected asset, preview href, upload capability, and flat asset-id patch output.
- Keep generic legacy Display behavior until specialized media display is separately specified.
- Treat a specialized Create asset picker as unsupported by the observed legacy renderer unless another source path supplies it.

#### Contract facts to make explicit

Record media authoring facts are explicit. Create and Display preview behavior is currently inferred from options/value by Astryx helpers; production behavior must be projected explicitly before it becomes required.

#### Optional improvements

- Specialized Create and Display asset previews are post-migration improvements unless specified and projected.

## 5. Required migration coverage

Required coverage is the union of the supported combinations above, reduced to representative composable cases:

1. Every field kind must have each source-supported surface and mode represented.
2. Record and Table Cell fixtures must explicitly hide visible labels; Item Detail, Create, and Operation fixtures must explicitly show them.
3. Table Cell Editor and Display fixtures must explicitly carry compact density. Display density needs a contract representation rather than a renderer inference.
4. Requiredness and value state remain independent where source behavior differs. Do not pair “required selected” or similar combined scenario names when separate axes can express the same facts.
5. Enum fixtures must retain Known, Unset, and Undeclared. State-machine fixtures must retain Active, Terminal, Unset, and Undeclared without enabling enum editing.
6. Writable Record and Item Detail fields must preserve immediate or field-commit behavior. Read-only and system variants must render Display.
7. Create and supported Operation fields must use submit semantics and flat field/input names.
8. Presentation coverage must be schema-derived: enum content tokens, completion, quiet date, heading text, number formats/value-unit, color, Markdown, source icon, image, and media.
9. Missing icon/color tokens, missing references, invalid number drafts, invalid/alpha color text, missing media assets, and source-icon parse errors must remain visible through projected facts. No renderer may invent a correction.
10. Pending, disabled, and generic error states remain representative component states, not universal matrix axes.

The following coverage is not supported and must not be added as parity:

- direct editing of an existing state-machine enum;
- state-machine Operation input;
- Reference, Markdown, Color, Source Icon, Image, or Media public operation inputs;
- a full presentation cross-product when only representative combinations have source paths;
- specialized legacy Image or Media Display previews; and
- specialized legacy Create media asset selection.

## 6. Optional post-migration improvements

These are separate from required parity:

- promote specialized Image and Media Display previews into the canonical specification and foundation projection;
- define specialized asset selection for Create Image or Media fields;
- add explicit option-loading state for references if production UX must distinguish loading from a missing option;
- refine boolean Display presentation and copy through contract data;
- add richer compact Markdown authoring; and
- expand visual-only fixture examples after the required matrix is complete.

Each improvement requires a source-of-truth contract or specification change before fixture labels, icons, colors, copy, or interaction rules are added.

## 7. Source index

### Canonical behavior

- `openspec/specs/generated-ui/spec.md`
  - `Requirement: Field Editing And Presentation`
  - `Scenario: Formless UI field contract boundary`
  - `Scenario: Formless UI field contract coverage`
  - `Scenario: Formless UI generated-field contract vertical slice`
  - `Requirement: Create Edit And Delete Flows`
  - `Scenario: Public operation form runtime authoring`
  - `Requirement: State Machine Controls`

### Legacy surfaces and controls

- `src/app/generated/create.tsx`: create form sessions and `GeneratedCreateFieldControl` composition.
- `src/app/generated/create-field-control.tsx`: `GeneratedCreateFieldControl` and field-specific Create controls.
- `src/app/generated/collection.tsx`: `RecordRow`, `ContextRecordEditor`, and `RecordDetail` Record/Item Detail layout.
- `src/app/generated/table.tsx`: `RecordTableCell`, `StateTransitionTableCell`, and compact table editing/display selection.
- `src/app/generated/record-field-editor.tsx`: `RecordFieldEditor`, `ReadOnlyRecordFieldDisplay`, and `StateMachineRecordField` access routing.
- `src/app/generated/record-field-control.tsx`: field-specific existing-record editors and commit boundaries.
- `src/app/generated/record-field-display.tsx`: read-only display, enum/icon/color/Markdown/reference specializations, and generic fallback.
- `src/app/generated/record-field-renderer-model.ts`: renderer-kind selection, including compact Markdown fallback and heading text.
- `src/app/generated/field-control-primitives.tsx`: number, color, Markdown, and source-icon primitives.
- `src/app/generated/field-presentation.tsx`: enum token resolution and presentation fallbacks.
- `src/app/generated/state-machine-ui.tsx`: badges and transition buttons/menus.
- `src/app/generated/reference-field-options.ts`: missing-reference and identity-reference fallbacks.
- `src/app/generated/create-field-authoring.ts`: Create draft and submit resolution.
- `src/app/generated/record-field-authoring.ts`: update drafts, media authoring, and flat patch resolution.
- `src/app/generated/operation-field-authoring.ts`: supported public operation fields, validation, and flat input resolution.
- `src/app/routes/auth-account.tsx`: `ProfileCompletionInputField` and the observed public operation controls.
- `src/app/generated/formless-ui-projection.ts`: current foundation projection into `FormlessUiField`.

### Current Astryx contract, explorer, fixtures, and renderers

- `lib/astryx/src/formless-ui-contract.ts`: `FormlessUiField` and field, enum, state-machine, icon, media, action, and submit-boundary facts.
- `lib/astryx/src/components/field-scenario-model.ts`: composable axes, inclusion predicates, projection, and per-kind group merging.
- `lib/astryx/src/components/fields.tsx`: explorer facet selection and intent simulation.
- `lib/astryx/src/components/fields/fixtures.ts`: field kinds and surface labels.
- `lib/astryx/src/components/fields/fixture-helpers.ts`: fixture constructors, projected status helpers, and local intent application.
- `lib/astryx/src/components/fields/*.fixtures.ts`: current per-field matrix coverage.
- `lib/astryx/src/components/fields/renderer.tsx`: mode and renderer-kind dispatch.
- `lib/astryx/src/components/fields/field-chrome.tsx`: label, density, access, status, draft, and commit adapters.
- `lib/astryx/src/components/fields/*.tsx`: Astryx field-specific renderers.
