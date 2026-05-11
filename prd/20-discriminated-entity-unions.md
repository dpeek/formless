# PRD 20: Discriminated entity unions

Status: shipped
Current chunk: complete; DU-06 and DU-07 deferred
Last updated: 2026-05-12

## Goal

Add declarative discriminated unions over existing flat entities.

The first Site-driven slice should:

- keep records flat;
- keep `block` and `blockPlacement` as the Site storage model;
- use `block.type` as the discriminator for `block` variants;
- let generated views show fields by variant;
- let generated tree nodes choose compact links or inline editors by variant;
- make Header and Footer child nodes link to their root editor;
- make Link, Markdown, media, CTA, and other content nodes render inline editors;
- keep public Site tree and renderer behavior unchanged;
- create a schema shape that future TypeScript generation can map to discriminated unions.

This PRD is about polymorphic entity views over a flat model. It is not about splitting one entity into many stored entities.

## Problem

The Site app has a good flat block model, but generated authoring views still treat every `block` as the same shape.

Current behavior:

- `block.type` already drives public rendering.
- The generated editor can render nested `blockPlacement` trees.
- Tree nodes use one `childItemView` for every child block.
- The current `blockTreeNode` item view includes broad fields for all block types.
- A Link block sees fields like Body, Template key, Width, and Height.
- A Markdown block sees fields like Link, Icon, Color, Width, and Height.
- Header and Footer blocks can appear as child nodes even though they are better edited as roots.
- Creating or editing a Block can expose fields that do not apply to the selected block type.

That is storage-accurate, but it is poor authoring UI.

The author thinks in variants:

- Header;
- Footer;
- Link;
- Markdown;
- Hero;
- Content list;
- Content grid;
- Image;
- Video;
- File;
- Call to action;
- Subscribe;
- Custom.

The runtime should let the schema describe those variants without changing record shape.

## Source map

Existing anchors:

- Current runtime docs: `doc/current.md`.
- Release target docs: `doc/roadmap.md`.
- Site root nav and tree PRD: `prd/19-site-editor-root-nav-and-tree.md`.
- Site editor list/detail PRD: `prd/13-site-editor-list-detail.md`.
- Site tree renderer PRD: `prd/09-site-tree-renderer.md`.
- Field behavior PRD: `prd/07-field-behavior-module.md`.
- Source schema parser: `src/shared/schema.ts`.
- Schema types: `src/shared/schema-types.ts`.
- Field parser: `src/shared/schema-fields.ts`.
- View parser: `src/shared/schema-views.ts`.
- Table view parser: `src/shared/schema-table-views.ts`.
- Schema parser tests: `src/shared/schema.test.ts`.
- View model selection: `src/client/views.ts`.
- View model tests: `src/client/views.test.ts`.
- Generated collection renderer: `src/app/generated/collection.tsx`.
- Generated tree renderer: `src/app/generated/tree.tsx`.
- Generated table action edit dialogs: `src/app/generated/table-actions.tsx`.
- Generated create renderer: `src/app/generated/create.tsx`.
- Generated field editor: `src/app/generated/record-field-editor.tsx`.
- App tests: `src/app.test.tsx`.
- Site source schema: `schema/apps/site/schema.json`.
- Public Site tree projection: `src/site/tree.ts`.
- Public Site renderer: `src/app/site-renderer/renderer.tsx`.

Owned files:

- `prd/20-discriminated-entity-unions.md`.

Likely changed files:

- `src/shared/schema-types.ts`.
- `src/shared/schema.ts`.
- `src/shared/schema-unions.ts`.
- `src/shared/schema-views.ts`.
- `src/shared/schema-table-views.ts` only if table edit actions need variant edit view validation.
- `src/shared/schema.test.ts`.
- `src/client/views.ts`.
- `src/client/views.test.ts`.
- `src/app/generated/tree.tsx`.
- `src/app/generated/table-actions.tsx`.
- `src/app/generated/create.tsx`.
- `src/app/generated/collection.tsx` if context selection links are routed through collection selection.
- `src/app.test.tsx`.
- `schema/apps/site/schema.json`.

## User stories

1. As a Site author, I want Link blocks to show link-specific fields, so that I can edit navigation without scanning unrelated fields.
2. As a Site author, I want Markdown blocks to show body editing prominently, so that writing content is the main task.
3. As a Site author, I want Image and Video blocks to show media fields, so that media editing does not look like page editing.
4. As a Site author, I want Header and Footer child nodes to render as compact links, so that I can jump to their root editors instead of editing them in place.
5. As a Site author, I want the editor to update when I change a block type, so that the visible fields match the selected type.
6. As a Site author, I want nested placement trees to remain editable, so that block composition still happens in the tree.
7. As a Site author, I want unknown or custom block types to fall back to a safe compact editor, so that the UI does not break.
8. As a schema author, I want to declare one union for `block.type`, so that every generated view can reuse the same variant vocabulary.
9. As a schema author, I want views to choose presentation per variant, so that the same union can render differently in a tree, a dialog, or a create form.
10. As a schema author, I want bad union definitions to fail during schema parsing, so that broken authoring surfaces do not ship.
11. As a runtime developer, I want union parsing isolated from field parsing and view rendering, so that the concept is testable as a deep module.
12. As a runtime developer, I want storage and sync to remain unchanged, so that this feature stays a view/schema layer over flat records.
13. As a future typegen user, I want unions to map to TypeScript discriminated unions, so that application code can narrow on the same discriminator as the runtime.
14. As a future plugin author, I want the union model to be generic, so that it can support polymorphic records outside the Site app.

## Requirements

### Storage and runtime behavior

- Records stay flat.
- Do not split `block` into separate stored entities.
- Do not add nested object values or array fields for variants.
- Do not change `StoredRecord`.
- Do not change sync protocol.
- Do not change authority storage tables.
- Do not change public Site tree response shape.
- Do not change public Site renderer behavior.
- Variant-aware generated UI patches the same flat scalar fields as current editors.
- Existing schemas without unions parse and render unchanged.

### Schema behavior

- App schemas can declare optional top-level `unions`.
- A union belongs to one entity.
- First supported discriminator kind is a required enum field on that entity.
- A union variant key matches one discriminator enum value.
- A union can define a fallback for enum values not explicitly listed.
- A union without a fallback must define every discriminator enum value.
- Variant field names must reference fields on the union entity.
- Variant required field names must reference fields on the union entity.
- Variant field declarations are UI and type metadata unless authority validation explicitly consumes them.
- Bad union entity names fail at schema parse time.
- Bad discriminator fields fail at schema parse time.
- Non-enum discriminator fields fail at schema parse time.
- Optional discriminator fields fail at schema parse time.
- Bad variant values fail at schema parse time.
- Bad variant fields fail at schema parse time.
- `stringifySchema` preserves unions.

### View behavior

- Item views can stay static with `fields`.
- Item views can opt into a union presentation.
- Edit views can stay static with `fields`.
- Edit views can opt into a union presentation.
- Create views can stay static with `fields`.
- Create views can opt into a union presentation.
- A variant-aware view selects the active variant from the record discriminator.
- A variant-aware create view selects the active variant from the draft discriminator.
- Variant-aware views can define a fallback presentation.
- Variant-aware views can reuse field editor config from current item/edit/create views.
- Variant-aware views can render a compact context link instead of inline fields.
- Existing field editor behavior remains owned by field types.
- Changing the discriminator updates visible fields immediately.
- Hidden fields are not cleared automatically in the first slice.

### Generated Site editor behavior

- Site `block` declares a union over `type`.
- The Site tree uses a variant-aware child item view.
- Header child blocks render compactly.
- Footer child blocks render compactly.
- Header and Footer compact nodes offer a generated link to select the matching root in the Site sidebar.
- Link child blocks render compact inline editors for label, href, icon, and color.
- Markdown child blocks render label and body editors.
- Hero child blocks render fields useful to the Hero template.
- Content list and content grid blocks render label and template/query fields.
- Image, Video, and File blocks render label, href, width, and height fields.
- CTA and Subscribe blocks render label, body, href, and visual fields.
- Custom blocks render a fallback editor.
- Missing child records and cycles keep current tree warning behavior.
- Placement ordering keeps working.

### Context-link behavior

- A generated variant presentation can declare an action to select a context record.
- Context selection links use existing Home route section selection state.
- The link target can select the current record when its entity matches the active context entity.
- If the target record is not in the active context query or navigation groups, the UI renders a disabled compact representation.
- Context links must not create new routes.
- Context links must not mutate records.

### Type generation fit

- Union metadata is stable enough for future TypeScript generation.
- Type generation can use the discriminator field as the TypeScript discriminant.
- Type generation can make base entity required fields required in every variant.
- Type generation can make variant required fields required in the matching variant.
- Type generation should keep non-displayed fields optional unless authority validation enforces exclusivity.
- Type generation can emit fallback variants when the schema defines a fallback.
- Type generation is not required to ship in the first UI slice.

### Authority validation fit

- The first generated UI slice does not require new authority validation.
- A later chunk can enforce variant required fields during create and patch.
- Authority validation must happen after generic scalar field validation.
- Authority validation must reject records whose discriminator value is not valid for the union.
- Authority validation must reject missing variant-required values when enforcement is enabled.
- Authority validation must not reject hidden-but-populated fields unless a later explicit exclusivity flag exists.
- Variant validation errors should use existing mutation error response paths.

## Proposed schema shape

Top-level entity union:

```json
{
  "unions": {
    "blockByType": {
      "entity": "block",
      "discriminator": "type",
      "variants": {
        "header": {
          "label": "Header",
          "fields": ["label", "templateKey"]
        },
        "footer": {
          "label": "Footer",
          "fields": ["label", "templateKey"]
        },
        "link": {
          "label": "Link",
          "fields": ["label", "href", "icon", "color"],
          "requiredFields": ["label", "href"]
        },
        "markdown": {
          "label": "Markdown",
          "fields": ["label", "body"]
        },
        "image": {
          "label": "Image",
          "fields": ["label", "href", "width", "height"]
        }
      },
      "fallback": {
        "label": "Block",
        "fields": ["label", "type"]
      }
    }
  }
}
```

Variant-aware item view for tree nodes:

```json
{
  "itemViews": {
    "blockTreeNode": {
      "entity": "block",
      "union": "blockByType",
      "variants": {
        "header": {
          "presentation": "contextLink",
          "labelField": "label",
          "target": {
            "kind": "selectContext",
            "context": "block",
            "record": "self"
          }
        },
        "footer": {
          "presentation": "contextLink",
          "labelField": "label",
          "target": {
            "kind": "selectContext",
            "context": "block",
            "record": "self"
          }
        },
        "link": {
          "presentation": "fields",
          "fields": {
            "label": { "editor": "text", "commit": "field-commit" },
            "href": { "editor": "href", "commit": "field-commit" },
            "icon": { "editor": "icon", "commit": "field-commit" },
            "color": { "editor": "color", "commit": "field-commit" }
          }
        },
        "markdown": {
          "presentation": "fields",
          "fields": {
            "label": { "editor": "text", "commit": "field-commit" },
            "body": { "editor": "markdown", "commit": "field-commit" }
          }
        }
      },
      "fallback": {
        "presentation": "fields",
        "fields": {
          "label": { "editor": "text", "commit": "field-commit" },
          "type": { "editor": "enum", "commit": "immediate" }
        }
      }
    }
  }
}
```

Notes:

- Exact property names can change during implementation.
- The important split is: `unions` define variant facts; views define variant presentation.
- `contextLink` is a generated UI presentation, not a stored relationship.
- The union field list should not replace view field configs where editor and commit policy are needed.

## Decisions

| ID     | Decision                                                      | Reason                                                                  | Evidence                                            |
| ------ | ------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------- |
| DU-D1  | Keep entity unions as metadata over flat records.             | Flat records are a core runtime bet and Site already uses this model.   | `doc/overview.md`, `schema/apps/site/*`             |
| DU-D2  | Use required enum fields as first discriminators.             | `block.type` already has the right shape and gives finite variants.     | `schema/apps/site/schema.json`                      |
| DU-D3  | Put union definitions at top level.                           | The variant vocabulary should be reusable across views and typegen.     | `relationships`, `readModels`, `screens`            |
| DU-D4  | Keep presentation in views, not in the union definition.      | A variant can need different UI in a tree, dialog, create form, or row. | `itemViews`, `views`, `tableViews`                  |
| DU-D5  | Do not clear hidden fields in the first slice.                | Clearing data during view switching is destructive and needs policy.    | Generic patch behavior                              |
| DU-D6  | Add context links as generated selection actions.             | Header/Footer should jump to existing root selection, not mutate data.  | `src/app/routes/home.tsx`, `src/app.tsx`            |
| DU-D7  | Make authority enforcement a later optional layer.            | UI usefulness can ship before stricter invariant semantics.             | Existing scalar validation and mutation paths       |
| DU-D8  | Keep typegen conservative until authority enforcement exists. | Generated TypeScript must not imply invariants the authority lacks.     | Future type generation direction                    |
| DU-D9  | Keep static view fields as base fields beside union variants. | Existing renderers stay stable while DU-03 can consume variant facts.   | `src/shared/schema-views.ts`, `src/client/views.ts` |
| DU-D10 | Keep Site tree link editing compact.                          | Header/footer links should be quick inline edits, not full block forms. | User screenshot feedback                            |

## Chunks

| ID    | Status   | Depends on | Main files                               | Acceptance                                                                                 |
| ----- | -------- | ---------- | ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| DU-01 | done     | none       | schema types/parser/tests, PRD           | App schemas parse top-level unions and reject malformed union definitions.                 |
| DU-02 | done     | DU-01      | view parser, view models, tests          | Item/edit/create views can reference unions and expose render-ready variant facts.         |
| DU-03 | done     | DU-02      | generated tree/edit/create UI, app tests | Generated UI renders variant field presentations and updates when the discriminator moves. |
| DU-04 | done     | DU-03      | generated tree UI, route selection tests | Header/Footer nodes render compact context links that select the matching root.            |
| DU-05 | done     | DU-04      | Site source schema, browser smoke, PRD   | `/site` tree uses block variants; public `/pages/*` behavior remains unchanged.            |
| DU-06 | deferred | DU-05      | authority validation, mutation tests     | Optional union-required-field validation is enforced during create and patch.              |
| DU-07 | deferred | DU-01      | typegen workstream                       | Future TypeScript generation can emit discriminated unions from schema metadata.           |

## Testing decisions

- Test parser behavior at the schema boundary, not helper implementation details.
- Parser tests should cover valid unions, missing entities, bad discriminators, non-enum discriminators, optional discriminators, bad variant keys, bad variant fields, fallback requirements, and stringify preservation.
- View parser tests should cover static views unchanged and variant-aware views rejecting wrong-entity unions.
- View model tests should cover render-ready variant facts for item, edit, and create views.
- Generated UI tests should cover variant field selection from record values.
- Generated create tests should cover draft discriminator changes updating visible fields.
- Tree tests should cover Header/Footer compact context links and Link/Markdown inline editors.
- App tests should cover `/site` rendering a variant-aware tree without public route regressions.
- Browser smoke should use `bun browser` only after app behavior changes.
- Authority validation tests should wait for DU-06.
- Typegen tests should wait for the typegen workstream.

## Acceptance checks

- Existing Tasks and Rates schemas parse unchanged.
- Existing static item views render unchanged.
- Existing static edit views render unchanged.
- Existing static create views render unchanged.
- Site `block` union parses from source schema.
- Site tree shows Link blocks with link fields only.
- Site tree Link blocks render `label` and `href` as compact unlabeled inline fields.
- Site tree shows Markdown blocks with body editing.
- Site tree shows Header and Footer as compact links.
- Table reference item dialogs render active union fields.
- Selecting Header/Footer compact links changes the Site root selection.
- Site tree keeps drag handles and does not render move up/down buttons.
- Reordering tree placements still patches `blockPlacement.order`.
- Missing child and cycle warnings still render.
- `/pages/home` public rendering is unchanged.
- `devstate check` reports checks ok.

## Non-goals

- Do not split `block` into `pageBlock`, `linkBlock`, `imageBlock`, or other stored entities.
- Do not add inheritance to entities.
- Do not add nested object fields.
- Do not add array-valued fields.
- Do not add a general layout DSL.
- Do not add a visual page builder.
- Do not add preview panes.
- Do not add media upload.
- Do not add delete/archive flows.
- Do not add exclusive-field clearing.
- Do not require type generation to ship in the first UI slice.
- Do not change public Site renderer components.
- Do not change public Site tree protocol.

## Future fit

- Inline child creation can offer `Add Link`, `Add Markdown`, and similar actions backed by literal discriminator defaults.
- Literal create defaults can reuse the same union metadata.
- Type generation can emit discriminated TypeScript unions after schema typegen exists.
- Authority validation can make generated types stricter once runtime invariants match.
- Variant presentations can later support richer controls such as preview summaries or specialized media pickers.
- Other apps can use the same pattern for enum-driven entity behavior, such as resource kinds, product models, or proposal section types.

## Promote after ship

- `doc/current.md`: app schemas can declare top-level discriminated entity unions.
- `doc/current.md`: generated item/edit/create views can render fields by union variant.
- `doc/current.md`: generated table reference item dialogs can render fields by union variant.
- `doc/current.md`: generated tree item variants can render compact context links that select the active collection context record.
- `doc/current.md`: Site `block.type` drives generated editor variants while records stay flat.
- `doc/current.md`: Site Header and Footer child nodes can link to the selected root editor.
- `doc/current.md`: Site tree Link blocks render only compact `label` and `href` editors, with drag handles but no move buttons.
- `doc/roadmap.md`: discriminated entity unions are part of first-release generated UI if shipped before release.

## Status Notes

- 2026-05-11: Created PRD from user request for discriminated unions over existing entity types, using Site `block.type` as the motivating example.
- 2026-05-11: DU-01 shipped. Added parser-only top-level `unions` metadata over flat entities. No storage, sync, authority, public Site tree, or generated UI behavior changed.
- 2026-05-11: DU-02 shipped. Item/edit/create views can attach union presentation metadata beside static fields. Parser validates union entity match, variant coverage, fallback coverage, variant fields, and item-view context links. View models expose discriminator, variant, fallback, field, and context-link facts for list/tree/context item views, create actions, table reference item views, and table edit dialogs. No storage, sync, authority, public Site tree, or generated UI behavior changed.
- 2026-05-11: DU-03 shipped. Generated list, tree, context detail, table edit, and create UIs render base fields plus active union variant fields. Create forms choose active variant fields from draft/form discriminator values, and submit only visible create fields plus resolved defaults. No storage, sync, authority, public Site tree, Site source schema, or context-link selection behavior changed.
- 2026-05-11: DU-04 shipped. Generated tree child item views render active `contextLink` union presentations as compact selection controls. The controls select the current section context through existing route selection state when the child entity matches the active context entity and the record is selectable; otherwise they render disabled. No storage, sync, authority, public Site tree, public Site renderer, or Site source schema changed.
- 2026-05-11: DU-05 shipped. Site source schema now declares `blockByType` over flat `block.type`, uses variant-aware Site tree child nodes, and uses variant-aware block root detail/create/edit views. Header/Footer tree nodes render compact context links; Link, Markdown, media, Hero, content list/grid, CTA, Subscribe, and Custom blocks render scoped fields through generated variants. Public Site tree projection and renderer code stayed unchanged.
- 2026-05-11: DU-05 follow-up shipped from screenshot feedback. Site tree link children no longer render placement labels, icon, color editors, or move up/down buttons; link children render compact unlabeled `label` and `href` inputs. Site create/edit link variants also submit only `label` and `href` through generated union fields. Public Site tree projection and renderer code stayed unchanged.
- 2026-05-12: PRD 20 closeout shipped. Table reference item dialogs now reuse active union field selection for referenced records, so union-aware reference item views do not fall back to static fields. DU-06 authority validation and DU-07 typegen remain deferred future work.

## Blockers

- None.

## Evidence

- `devstate start`: checks ok, services running.
- `devstate check`: checks ok, services running.
- 2026-05-11 DU-01: `.devstate/status.md` reports checks ok and services running.
- 2026-05-11 DU-01: `.devstate/logs/service-test.txt` reports 14 test files passing with 407 tests.
- 2026-05-11 DU-01: `.devstate/logs/check-vite.txt` reports formatting, lint, and type checks passed across 185 files.
- 2026-05-11 DU-01: requested `./tmp/devstate.json`, `./tmp/test.txt`, and `./tmp/check.txt` were absent after `devstate start`; available devstate evidence is under `.devstate/`.
- 2026-05-11 DU-02: `.devstate/status.md` reports checks ok and services running.
- 2026-05-11 DU-02: `.devstate/logs/service-test.txt` reports 14 test files passing with 410 tests.
- 2026-05-11 DU-02: `.devstate/logs/check-vite.txt` reports formatting, lint, and type checks passed across 186 files.
- 2026-05-11 DU-02: requested `./tmp/devstate.json`, `./tmp/test.txt`, and `./tmp/check.txt` were absent; available devstate evidence is under `.devstate/`.
- 2026-05-11 DU-02: browser smoke skipped because app behavior did not change.
- 2026-05-11 DU-03: `.devstate/status.md` reports checks ok and services running after `devstate check`.
- 2026-05-11 DU-03: `.devstate/logs/service-test.txt` reports 2 test files passing with 106 tests after generated union UI coverage was added.
- 2026-05-11 DU-03: `.devstate/logs/check-vite.txt` reports formatting, lint, and type checks passed across 187 files.
- 2026-05-11 DU-03: requested `./tmp/devstate.json`, `./tmp/test.txt`, and `./tmp/check.txt` were absent; available devstate evidence is under `.devstate/`.
- 2026-05-11 DU-03: `bun browser --session du03 --ignore-https-errors batch --bail "open https://20-discriminated-entity-unions.formless.local/tasks" "wait 1000" "get text body" "open https://20-discriminated-entity-unions.formless.local/site" "wait 1000" "get text body"` rendered Tasks and Site generated UIs.
- 2026-05-11 DU-03: `bun browser --session du03 errors` returned no page errors.
- 2026-05-11 DU-04: `.devstate/status.md` reports checks ok and services running after `devstate check`.
- 2026-05-11 DU-04: `.devstate/logs/service-test.txt` reports 1 test file passing with 106 tests after generated tree context-link coverage was added.
- 2026-05-11 DU-04: `.devstate/logs/check-vite.txt` reports formatting, lint, and type checks passed across 187 files.
- 2026-05-11 DU-04: requested `./tmp/devstate.json`, `./tmp/test.txt`, and `./tmp/check.txt` were absent; available devstate evidence is under `.devstate/`.
- 2026-05-11 DU-04: `bun browser --session du04 --ignore-https-errors batch --bail "open https://20-discriminated-entity-unions.formless.local/tasks" "wait 1000" "get text body" "open https://20-discriminated-entity-unions.formless.local/site" "wait 1000" "get text body"` rendered Tasks and Site generated UIs.
- 2026-05-11 DU-04: `bun browser --session du04 errors` returned no page errors.
- 2026-05-11 DU-05: `.devstate/status.md` reports checks ok and services running after `devstate check`.
- 2026-05-11 DU-05: `.devstate/logs/service-test.txt` reports pass after Site schema/view test reruns.
- 2026-05-11 DU-05: `.devstate/logs/check-vite.txt` reports formatting, lint, and type checks passed across 187 files.
- 2026-05-11 DU-05: requested `./tmp/devstate.json`, `./tmp/test.txt`, and `./tmp/check.txt` were absent; available devstate evidence is under `.devstate/`.
- 2026-05-11 DU-05: `bun browser --session du05 --ignore-https-errors eval 'fetch("https://20-discriminated-entity-unions.formless.local/api/site/reset/schema",{method:"POST",headers:{"content-type":"application/json"},body:"{}"}).then(r=>r.status)'` returned `200`.
- 2026-05-11 DU-05 follow-up: `.devstate/status.md` reports checks ok and services running after `devstate check`.
- 2026-05-11 DU-05 follow-up: `bun browser --session link-fields` reset Site schema and seed on `https://formless.local`, opened `/site`, and returned `linkLabel: true`, `linkHref: true`, `iconEditors: 0`, `colorPickers: 0`, `placementLabel: false`, `dragHandles: 17`, `moveUp: false`, `moveDown: false`.
- 2026-05-11 DU-05 follow-up: `bun browser --session link-fields errors` returned no page errors.
- 2026-05-12 closeout: `.devstate/status.md` reports checks ok and services running after `devstate check`.
- 2026-05-12 closeout: `.devstate/logs/service-test.txt` reports `src/app.test.tsx` passing with 110 tests after adding referenced-record dialog union coverage.
- 2026-05-12 closeout: `.devstate/logs/check-vite.txt` reports formatting, lint, and type checks passed across 190 files.
- 2026-05-12 closeout: `bun browser --session prd20-finalize --ignore-https-errors batch --bail "open https://formless.local/site" "wait 1000" "get text body" "open https://formless.local/pages/home" "wait 1000" "get text body"` rendered the variant-aware Site editor and public home page.
- 2026-05-12 closeout: `bun browser --session prd20-finalize errors` returned no page errors.
- 2026-05-11 DU-05: `bun browser --session du05 --ignore-https-errors eval 'fetch("https://20-discriminated-entity-unions.formless.local/api/site/reset/seed",{method:"POST",headers:{"content-type":"application/json"},body:"{}"}).then(r=>r.status)'` returned `200`.
- 2026-05-11 DU-05: `bun browser --session du05 --ignore-https-errors batch --bail "open https://20-discriminated-entity-unions.formless.local/site" "wait 1000" "get text body" "open https://20-discriminated-entity-unions.formless.local/pages/home" "wait 1000" "get text body"` rendered the variant-aware Site tree and public home page.
- 2026-05-11 DU-05: `bun browser --session du05 errors` returned no page errors.
