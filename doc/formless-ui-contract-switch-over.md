# Formless UI Contract Switch-Over Plan

Purpose: plan the full move from the old Astryx-only field contract to the
canonical Formless UI contract.

Status: design note. This is not shipped behavior. Shipped behavior lives in
`openspec/specs/*/spec.md`.

## Why

Formless generated UI should have one data and intent boundary between runtime
state and renderers.

The canonical boundary is `lib/astryx/src/formless-ui-contract.ts`. It is close
to current generated runtime field concepts and is intended to serve both the
current generated UI path and the Astryx renderer path.

The old `lib/astryx/src/field-contract.ts` path is renderer-shaped. It helped
prototype Astryx fields, but keeping it as an intermediate contract creates
extra projection work and hides runtime facts such as draft input kinds,
renderer kinds, value-unit commits, media authoring, state-machine facts, and
operation-control boundaries.

## Current Anchors

- `lib/astryx/src/formless-ui-contract.ts`: canonical types-only field
  contract.
- `src/app/generated/formless-ui-projection.ts`: generated runtime/session state
  to `FormlessUiField` projection.
- `src/app/generated/formless-ui-intents.ts`: `FormlessUiFieldIntent` adapter
  back to generated draft/session/commit behavior.
- `lib/astryx/src/field-contract.ts`: old Astryx-specific field contract to
  retire.
- `lib/astryx/src/components/field-renderer.tsx`: current Astryx renderer for
  the old contract.
- `lib/astryx/src/components/field-scenarios/*`: current package-local field
  fixtures and scenarios.
- `doc/backlog/icon-options-runtime-boundary.md`: deferred id-based icon option
  direction.

## Target Shape

Field rendering should be organized by field kind, with fixtures co-located
with the rendering logic they prove.

Suggested package-local layout:

```text
lib/astryx/src/components/fields/
  renderer.tsx
  field-chrome.tsx
  boolean-field.tsx
  boolean-field.fixtures.ts
  text-field.tsx
  text-field.fixtures.ts
  number-field.tsx
  number-field.fixtures.ts
  date-field.tsx
  date-field.fixtures.ts
  enum-field.tsx
  enum-field.fixtures.ts
  reference-field.tsx
  reference-field.fixtures.ts
  media-field.tsx
  media-field.fixtures.ts
  icon-field.tsx
  icon-field.fixtures.ts
  state-machine-field.tsx
  state-machine-field.fixtures.ts
```

Shared field chrome owns label, error, required, pending, disabled, density, and
read-only treatment. Per-kind modules own editor and display behavior for that
field kind.

Fixtures should use `FormlessUiField` directly. Scenario composition helpers may
remain shared, but individual scenario data should live beside the field module
that renders it.

## Migration Stages

### 1. Add Canonical Renderer Entry Point

Add `FormlessUiFieldRenderer` beside the old renderer.

Scope:

- consume `FormlessUiField`;
- route by `mode`, `control.controlKind`, and `rendererKind`;
- keep existing renderer alive;
- no runtime wiring;
- no deletion of `field-contract.ts`.

Representative coverage:

- text and textarea;
- boolean and completion checkbox;
- number, including invalid draft string;
- enum and reference options;
- media/image with media asset options;
- icon field preserving current string/SVG-source behavior;
- state-machine display facts.

Acceptance:

- package-local fixture screen can render a small representative set through the
  canonical renderer;
- old fixture screen still works.

### 2. Co-Locate Field Modules And Fixtures

Split field rendering into per-kind modules and move fixtures beside those
modules.

Scope:

- move scenario data from `lib/astryx/src/components/field-scenarios/*` into
  `*.fixtures.ts` files under `components/fields/`;
- keep scenario aggregation in one index or harness module;
- keep one shared fixture helper file only for cross-kind option data if needed;
- avoid runtime imports in fixtures.

Acceptance:

- each field kind has a module and fixture file;
- scenario harness imports fixtures from field modules;
- current package-local scenario views still render.

### 3. Port All Package Fixtures To `FormlessUiField`

Replace old `AstryxFieldData` fixture objects with canonical `FormlessUiField`
fixtures.

Scope:

- remove old contract usage from fixture/scenario model code;
- preserve existing scenario axes where useful;
- add missing canonical scenarios for value-unit, media authoring, state-machine
  terminal state, unknown enum value, and missing reference value;
- keep icon scenarios source/string-based until icon options are modeled.

Acceptance:

- no package-local fixture imports from `lib/astryx/src/field-contract.ts`;
- canonical fixtures cover the same behavior as old fixtures plus currently
  missing runtime-specific facts.

### 4. Retire Old Renderer Imports

Move package-local rendering surfaces from the old field renderer to
`FormlessUiFieldRenderer`.

Scope:

- update `lib/astryx/src/components/fields.tsx` and related harness files;
- remove old adapter-only assumptions such as generic `AstryxFieldValue` where
  canonical draft inputs are available;
- keep old `field-contract.ts` file until no imports remain.

Acceptance:

- `rg "field-contract"` in `lib/astryx/src` shows no production renderer or
  fixture dependency;
- only intentional compatibility or deletion work remains.

### 5. Delete Or Quarantine The Old Contract

Once package-local imports are gone, remove `field-contract.ts` or move any
still-useful types into canonical modules.

Scope:

- delete dead old contract and old renderer code;
- update imports;
- keep no compatibility shim unless a concrete runtime import still needs it.

Acceptance:

- no stale old-contract path;
- canonical contract is the only field-rendering contract in `lib/astryx`.

### 6. Wire Runtime Usage

After package fixtures prove the canonical renderer, wire runtime-generated UI
to render projected `FormlessUiField` data.

Scope:

- start with one narrow generated field surface;
- keep draft sessions, validation, patch resolution, operation execution, sync,
  media upload, and reference option loading in `src/app/generated` and
  `src/client`;
- pass projected data and intent handlers to Astryx;
- expand field-by-field and surface-by-surface.

Acceptance:

- runtime surface uses `formless-ui-projection` and `formless-ui-intents`;
- renderer receives no storage, schema parsing, sync, or hook responsibilities.

## Contract Evolution Rules

The canonical contract may change during this migration.

Allowed changes:

- add missing runtime facts discovered while porting fixtures;
- rename awkward fields when current generated runtime names are clearer;
- split per-kind authoring structures when one generic shape becomes lossy;
- add type-only placeholders for future platform concepts.

Not allowed:

- React imports in `formless-ui-contract.ts`;
- component props as contract facts;
- storage or sync internals in `lib/astryx`;
- compatibility shims for removed old-contract behavior;
- renderer migration that changes generated runtime semantics.

## Deferred Work

- Executable operation bindings belong in a future platform operation-control
  contract, not directly in field rendering.
- Union discriminator state and visible-field reasoning belong in a future
  field-set or form contract.
- Id-based icon options are deferred to
  `doc/backlog/icon-options-runtime-boundary.md`.
