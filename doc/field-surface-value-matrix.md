# Field surface and value matrix

## Purpose

This document records the current generated-field boundary shared by runtime
projection and Formless Renderer presentation. Canonical behavior lives in
`openspec/specs/generated-ui/spec.md`; this matrix is a source index for the
implemented contract, helpers, fixtures, and renderers.

The boundary has three owners:

| Owner                     | Responsibility                                                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generated runtime         | Schema interpretation, stable field occurrence ids, drafts, validation, reference and Media reads, operation execution, flat writes, and field-intent adaptation. |
| Renderer-neutral contract | Field identity, surface, mode, access, control, value, formatting, status, specialized facts, and canonical intents.                                              |
| Formless Renderer         | Accessible controls, display primitives, picker composition, interaction affordances, and presentation styling.                                                   |

Renderer code does not read app records, execute operations, upload Media,
parse app schema, or plan writes. Runtime code does not select presentation
component props or own presentation styling.

## Surface vocabulary

- **Create** is a submit-bound editor for a new flat record.
- **Record** is an inline field in a list row or card.
- **Table Cell** is a compact record field or display value.
- **Item Detail** is a field in a selected record result.
- **Operation** is a submit-bound public operation input.

Record, Table Cell, and Item Detail use Editor or Display mode according to the
projected field access and operation availability. Create and Operation use
Editor mode with `commit: "submit"`.

Requiredness, value state, presentation, density, label visibility, access, and
commit policy are independent facts:

- Record and Table Cell hide the visible label while retaining an accessible
  name; Item Detail, Create, and Operation show it.
- Table Cell uses compact density. Other surfaces use default density.
- Immediate controls emit a record value commit. Field-commit controls preserve
  draft state until their supported commit boundary. Submit controls remain
  flat and keyed by declared field or input names.
- Read-only and system fields use Display mode. State-machine fields invoke
  declared transition operations instead of patching the enum value.
- Every field occurrence carries a projection-owned `fieldId` derived from its
  owner and placement identity. Names and record ids are not occurrence ids.

## Current surface matrix

`E` means Editor, `D` means Display, and `T/D` means transition interaction or
state display. A dash means the generated operation-input boundary does not
support that field kind.

| Field kind         | Create        | Record | Table Cell | Item Detail | Operation |
| ------------------ | ------------- | ------ | ---------- | ----------- | --------- |
| State-machine enum | Initial state | T/D    | T/D        | T/D         | —         |
| Enum               | E             | E/D    | E/D        | E/D         | E         |
| Reference          | E             | E/D    | E/D        | E/D         | —         |
| Text               | E             | E/D    | E/D        | E/D         | E         |
| Long text          | E             | E/D    | E/D        | E/D         | E         |
| Markdown           | E             | E/D    | E/D        | E/D         | —         |
| Number             | E             | E/D    | E/D        | E/D         | E         |
| Date               | E             | E/D    | E/D        | E/D         | E         |
| Boolean            | E             | E/D    | E/D        | E/D         | E         |
| Color              | E             | E/D    | E/D        | E/D         | —         |
| Source icon        | E             | E/D    | E/D        | E/D         | —         |
| Media              | E             | E/D    | E/D        | E/D         | —         |

Public operation projection accepts text, long text, enum, number, date, and
boolean inputs. Reference, Markdown, Color, Source Icon, Media, and
state-machine operation inputs are outside that declared boundary.

## Value and presentation facts

### Enum and state machine

Enum facts keep Known, Unset, and Undeclared values distinct. Presentation
tokens supply label, icon, and semantic color facts for plain, rich, or
icon-only output; missing tokens fall back to contract text and neutral styling.
Create and Operation preserve submit drafts. Existing editable enum fields use
immediate commit.

State-machine facts distinguish Active, Terminal, Unset, and Undeclared values.
They carry transition availability, operation identity, pending state, and
display-safe outcomes. `StateMachineField` routes fields with
`stateMachineFacts` through `StateInput`; it never exposes direct enum editing.

### Reference

Reference facts distinguish resolved, missing, and unset values. The selected
value status is separate from the selectable option list, so a stored id remains
visible when no option resolves. Existing reference editors use immediate
commit.

### Text, long text, and Markdown

Text controls cover ordinary text, email and phone operation formats, heading
record presentation, static suffix display, known and unset values, invalid
operation drafts, and pending record commits. Long text uses the textarea
renderer. Markdown uses package-owned Markdown editor and display primitives;
compact table editing uses the textarea control kind.

Text-family existing fields use field commit. Create and supported Operation
fields submit controlled drafts.

### Number and date

Number facts carry raw drafts separately from committed values. Formatting
supports plain number, currency, percent, static suffixes, and value-unit
composition. Unit state remains distinct from scalar requiredness, and invalid
raw drafts remain visible for correction.

Date facts carry the input value and projected temporal display. Existing
editors use field commit. The `valueOrInteraction` presentation is projected as
a presentation choice; system timestamps remain display-only.

### Boolean and color

Boolean editors use immediate commit for existing records and submit semantics
for Create and Operation. Completion treatment is a presentation fact, not a
different stored value.

Color facts preserve the authored string and separately classify whether it is
representable by the renderer control. Valid opaque hex values can show a
swatch; other stored or draft strings remain visible without coercion.

### Source icon

Source Icon values are SVG source, never catalog ids. Contract facts carry
catalog options, dialog state, source-backed selection, preview source, parse
outcomes, and Save or Cancel availability. Shared validation and parsing come
from `@dpeek/formless-source-svg`; the Formless Renderer owns icon presentation.

### Media

Media fields store one flat asset id. Contract facts carry selected or missing
asset state, display-safe options, preview hrefs, upload policy, upload patch
field names, pending state, and asset-select or file-select intent availability.
Generated runtime and `@dpeek/formless-media/client` own reads, uploads, preview
resolution, and patch planning. The Formless Renderer owns the picker and display
UI without a Media React package entrypoint.

## Runtime and renderer paths

### Contract and projection

- `lib/presentation/src/contract.ts`: field contracts and intents.
- `src/app/generated/field-projection.ts`: Create, Record, Display, and
  Operation field projection plus stable occurrence ids.
- `src/app/generated/field-intents.ts`: canonical intent adaptation.
- `src/app/generated/operation-projection.ts`: operation control, status,
  progress, and feedback projection.
- `src/app/generated/formless-ui-*-projection.ts`: list, table, result,
  workspace, and shell composition.

### Runtime helpers

- `src/app/generated/create-field-authoring.ts`: Create draft sessions and flat
  submit values.
- `src/app/generated/record-field-authoring.ts`: record drafts, patch values,
  source-icon dialog state, and Media authoring facts.
- `src/app/generated/operation-field-authoring.ts`: supported operation input
  drafts and flat input resolution.
- `src/app/generated/state-machine-operation-runtime.ts`: transition execution.
- `src/app/generated/reference-field-options.ts`: resolved and missing
  reference labels.
- `src/app/generated/generated-*-foundation.*`: list, table, result, tree, and
  create occurrence indexing and intent routing.
- `src/app/generated/generated-workspace-runtime.tsx`: subscribed runtime
  publication and effects.

### Formless Renderer fixtures and implementation

- `lib/renderer/src/components/field-scenario-model.ts`: independent axes,
  inclusion predicates, projection, and per-kind surface merging.
- `lib/renderer/src/components/fields/fixtures.ts`: field-kind and surface catalog.
- `lib/renderer/src/components/fields/fixture-helpers.ts`: contract fixture
  constructors and local intent simulation.
- `lib/renderer/src/components/fields/*-field.fixtures.ts`: current per-kind
  surface matrices.
- `lib/renderer/src/components/fields/field-renderer.tsx`: mode, state-machine, and
  renderer-kind dispatch.
- `lib/renderer/src/components/fields/field-chrome.tsx`: labels, density, access,
  status, draft, and commit adapters.
- `lib/renderer/src/components/fields/*-field.tsx`: field-specific presentation.

## Styling and package boundaries

`@dpeek/formless-presentation` exposes renderer-neutral Formless UI contracts,
references, intents, contract hosts, and the React host adapter. The Formless
Renderer is implemented by `@dpeek/formless-renderer`, which exposes the
application renderer, application and Site providers, public Site renderers,
and separate application and Site CSS entries. Field components use Astryx
components and StyleX. Root Vite integration compiles the Renderer package
through `src/runtime/vite-config.ts`.

`@dpeek/formless-media` exposes only root, client, and Worker entrypoints.
`@dpeek/formless-site-app` owns renderer-neutral Site contracts, public form
sessions, theme behavior, and browser and Worker adapters. Site does not depend
on Astryx or the Formless Renderer package; production roots supply the renderer
exported by `@dpeek/formless-renderer` explicitly.

## Executable evidence

- `src/app/generated/field-projection.test.ts` and
  `field-intents.test.ts` cover field projection and intent adaptation.
- `src/app/generated/create-field-authoring.test.ts`,
  `record-field-authoring.test.ts`, and `operation-field-authoring.test.ts`
  cover draft and flat-write helpers.
- `src/app/generated/formless-ui-list-projection.test.ts`,
  `formless-ui-table-projection.test.ts`, and
  `formless-ui-record-result-projection.test.ts` cover composed surfaces.
- `src/app/generated/media-presentation-conformance.test.ts` covers live schema
  Media occurrences through the generated contract.
- `lib/renderer/src/components/fields/media-field-conformance.test.tsx` covers
  Formless Renderer Media behavior and intents across supported surfaces.
- Per-field fixture and renderer tests under
  `lib/renderer/src/components/fields/` cover accessible labels, values,
  presentation, drafts, and intents.
