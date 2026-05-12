# PRD 30: SVG icon field renderer and editor

Status: in progress
Current chunk: SIF-03 ready
Last updated: 2026-05-12

## Goal

Improve text-backed icon support.

The first version should:

- keep icon values as flat string fields;
- treat `editor: "icon"` and text `format: "icon"` as SVG source;
- render icon SVG into the React tree when source exists;
- render an empty icon outline when source is missing or invalid;
- edit icon SVG through a generated dialog with a textarea;
- use icon rendering for public Site social links in the footer.

This PRD owns generated icon display/editing and public Site link icon rendering.
It does not own an icon catalog, media upload, or arbitrary HTML rendering.

## Problem Statement

The Site schema already has an `icon` field on `block`.
The field is text-backed and marked with `format: "icon"`.

Current behavior is too thin:

- generated create forms render icon fields as plain text inputs;
- generated inline editors render icon fields as plain text inputs;
- generated table display renders icon field values as raw text;
- public Site link blocks ignore `block.icon`;
- source seed social links store icon names such as `github`, not SVG source;
- there is no shared renderer that shows the icon or an empty outline.

The first use case is social media links in the public Site footer.
The author needs GitHub, X, LinkedIn, and similar link blocks to show icons while still keeping records flat and editable through generated authoring surfaces.

## Solution

Keep the stored value as a string.
For `editor: "icon"` and text fields with `format: "icon"`, interpret that string as inline SVG source at the UI boundary.

Generated field UI should render:

- an icon preview when SVG source is valid enough to render;
- an empty icon outline when no source is defined;
- an edit button that opens a dialog;
- a textarea inside the dialog for editing raw SVG source;
- generic patch/create values that still submit one flat string field.

The shared UI package should own reusable SVG icon rendering and source editing chrome.
Generated UI should adapt those primitives to Formless field behavior.
The public Site renderer should reuse the same renderer for link block icons.

## Source Map

Existing anchors:

- Current runtime docs: `doc/current.md`.
- Release target docs: `doc/roadmap.md`.
- Field behavior module: `src/shared/field-types.ts`.
- Field schema parser: `src/shared/schema-fields.ts`.
- Generated field UI adapter: `src/app/generated/field-ui-adapters.ts`.
- Generated create renderer: `src/app/generated/create.tsx`.
- Generated inline field editor: `src/app/generated/record-field-editor.tsx`.
- Generated field display: `src/app/generated/record-field-display.tsx`.
- Shared source editor primitive: `lib/ui/src/source-preview.tsx`.
- Shared UI export surface: `lib/ui/src/index.ts`, `lib/ui/package.json`.
- Site source schema: `schema/apps/site/schema.json`.
- Site source seed records: `schema/apps/site/seed-records.json`.
- Site tree projection: `src/site/tree.ts`.
- Public Site renderer: `src/app/site-renderer/renderer.tsx`.
- Public renderer tests: `src/app.test.tsx`.
- Field behavior tests: `src/shared/field-types.test.ts`.
- Generated adapter tests: `src/app/generated/field-ui-adapters.test.ts`.
- Shared UI primitive tests: `lib/ui/src/source-preview.test.tsx`.

Owned files:

- `prd/30-svg-icon-field-renderer-editor.md`.

Likely changed files:

- `lib/ui/src/svg-icon.tsx`.
- `lib/ui/src/svg-icon.test.tsx`.
- `lib/ui/src/source-preview.tsx`.
- `lib/ui/src/index.ts`.
- `lib/ui/package.json`.
- `src/shared/field-types.ts`.
- `src/shared/field-types.test.ts`.
- `src/app/generated/field-ui-adapters.ts`.
- `src/app/generated/field-ui-adapters.test.ts`.
- `src/app/generated/create.tsx`.
- `src/app/generated/record-field-editor.tsx`.
- `src/app/generated/record-field-display.tsx`.
- `src/app/site-renderer/renderer.tsx`.
- `schema/apps/site/schema.json`.
- `schema/apps/site/seed-records.json`.
- `src/app.test.tsx`.
- `src/client/views.test.ts`.
- `src/site/tree.test.ts`.

## User Stories

1. As a Site author, I want social link records to store SVG source, so that footer icons are controlled by content data.
2. As a Site author, I want icon fields to render a visible preview, so that I can see the icon without reading SVG.
3. As a Site author, I want empty icon fields to render an outline placeholder, so that missing icons are obvious but not noisy.
4. As a Site author, I want to open an icon editor from the preview, so that compact authoring views do not show a giant SVG textarea by default.
5. As a Site author, I want the icon editor to use a textarea, so that I can paste SVG from GitHub, X, LinkedIn, or other sources.
6. As a Site author, I want the icon editor to keep the raw SVG source visible, so that I can correct copied SVG manually.
7. As a Site author, I want saving an icon to patch only the icon field, so that link label and href edits are independent.
8. As a Site author, I want invalid SVG to stay editable, so that a bad paste does not destroy my source text.
9. As a Site author, I want invalid SVG to render the empty outline, so that broken icons do not break the editor or public page.
10. As a Site author, I want link block edit views to expose icon editing, so that footer social links can be managed from the normal Site authoring tree.
11. As a Site visitor, I want footer social links to show recognizable icons, so that links are easier to scan.
12. As a Site visitor, I want icon links to keep their text labels, so that accessibility and clarity do not depend on graphics alone.
13. As a Site visitor, I want external social links to keep existing external-link behavior, so that icons do not change navigation semantics.
14. As a schema author, I want `format: "icon"` to remain string-backed, so that the storage model stays flat.
15. As a schema author, I want `editor: "icon"` to be a generated editor hint, so that no new stored field type is required.
16. As a runtime developer, I want SVG rendering behind one shared primitive, so that generated UI and public Site rendering do not duplicate parsing rules.
17. As a runtime developer, I want unsafe SVG features stripped or rejected, so that icon rendering does not become arbitrary HTML execution.
18. As a runtime developer, I want SVG safety behavior covered by tests, so that future edits do not silently allow scripts or event handlers.
19. As a runtime developer, I want generated field behavior tests to cover icon control metadata, so that icon support remains local to the field behavior path.
20. As a runtime developer, I want public renderer tests to cover seeded social icons, so that the first use case stays visible.
21. As a runtime developer, I want create and patch tests to prove icons remain flat strings, so that no storage or authority changes are hidden in UI work.
22. As a runtime developer, I want browser smoke on `/site` and `/pages/home`, so that the editor dialog and public footer are verified in the app.

## Requirements

### Stored Values

- Icon values stay `FieldValue` strings.
- Empty optional icon values still omit or store like other optional text fields.
- Authority validation still treats icon fields as text fields.
- No nested icon object is introduced.
- No media record is required for icons.
- No external icon registry is required.

### SVG Rendering

- A valid icon source renders into the React tree as an SVG element.
- Missing source renders an empty outline.
- Invalid or unsupported source renders an empty outline.
- The rendered icon inherits text color by default.
- The renderer must not render script elements.
- The renderer must not preserve event handler attributes.
- The renderer must not preserve `javascript:` URLs.
- The renderer must not preserve `foreignObject`.
- The renderer must not fetch external assets.
- The renderer should preserve common SVG shape elements and attributes needed by social icons.
- The renderer should be usable by generated UI and by the public Site renderer.
- Server-rendered tests should produce deterministic markup.

### Generated Field Display

- Generated table/read-only display renders icon fields through the icon renderer.
- Empty icon fields render the empty outline in generated display.
- Icon field display should remain compact in tables.
- Raw SVG source should not be displayed in compact table cells by default.
- Non-icon text fields keep existing display behavior.

### Generated Field Editing

- `editor: "icon"` uses a generated icon editor, not a plain text input.
- The compact editor shows the renderer plus an edit control.
- The edit control opens a dialog.
- The dialog contains a textarea-backed SVG source editor.
- The dialog can preview the current SVG source.
- Saving commits the flat string value through the existing generic patch mutation.
- Escape or cancel should not commit draft changes.
- Failed patch should restore the current stored value and show the existing error path.
- The editor should work in table cells, root detail fields, and tree item fields.
- Markdown, color, date, number, enum, and reference editors keep existing behavior.

### Generated Create

- Create forms can submit icon source as a flat field.
- Create forms may use a textarea-backed icon source editor.
- Hidden input mirroring may follow the existing markdown/color create pattern.
- Required icon fields, if any schema defines them, should preserve native required semantics where practical.

### Site Authoring

- Link block variants should expose `icon` where social/footer link editing needs it.
- Site tree/root edit views should not expose unrelated implementation fields.
- Existing link `href` editing stays unchanged.
- Existing link labels stay editable where they are currently editable.
- Site source seed social links should store SVG source instead of icon names.
- Seeded GitHub and LinkedIn links should keep working.
- X can be added as a seeded social link if the Site seed wants it in first release.

### Public Site

- Public `link` blocks render icon source before the label when `block.icon` exists.
- Public link rendering preserves preview and published link modes.
- Public link rendering preserves external target and rel behavior.
- Footer social links should render icon and label without layout overlap.
- Header links may render icons too if content data supplies them, but the first target is footer social links.
- Missing or invalid public icon source should not break page rendering.

## Implementation Decisions

| ID      | Decision                                                        | Reason                                                                                | Evidence                                                  |
| ------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| SIF-D1  | Keep icons as string-backed text fields.                        | Flat records are a core runtime bet and existing schemas already define icon as text. | `doc/overview.md`, `schema/apps/site/schema.json`         |
| SIF-D2  | Treat `format: "icon"` and `editor: "icon"` as SVG source.      | The user wants the field to contain SVG, not an icon catalog key.                     | User direction 2026-05-12                                 |
| SIF-D3  | Add a shared SVG icon renderer in `lib/ui`.                     | Generated UI and public Site rendering need the same rendering and fallback rules.    | `lib/ui/src/source-preview.tsx`                           |
| SIF-D4  | Render an empty outline for missing, invalid, or unsafe SVG.    | Editors and public pages should stay stable without hiding that no icon is available. | User direction 2026-05-12                                 |
| SIF-D5  | Sanitize or reject SVG at render time, not authority time.      | Stored strings should remain editable; public rendering must still be safe.           | Existing text field authority behavior                    |
| SIF-D6  | Keep React components out of shared field behavior.             | Field behavior must remain runtime-safe and non-React.                                | PRD 07 field behavior decision                            |
| SIF-D7  | Add a dedicated generated icon control kind.                    | Generated renderers need a stable branch without treating icon like generic text.     | `src/shared/field-types.ts`                               |
| SIF-D8  | Use a dialog for icon source editing.                           | SVG source is too large for compact table/tree fields but still needs direct editing. | User direction 2026-05-12                                 |
| SIF-D9  | Reuse the source-preview textarea primitive.                    | The UI package already owns non-markdown textarea-backed source editing.              | `lib/ui/doc/browser-primitives.md`                        |
| SIF-D10 | Public Site link icons are content data, not hard-coded chrome. | Footer social links already live as link blocks in the Site tree.                     | `src/app/site-renderer/renderer.tsx`, Site seed data      |
| SIF-D11 | Do not add an icon catalog in this PRD.                         | The first use case needs pasted SVG; catalog semantics can come later.                | User direction 2026-05-12                                 |
| SIF-D12 | Use a strict SVG tag and attribute allowlist in the renderer.   | Unsafe or unsupported SVG should fall back without broad HTML/SVG execution surface.  | `lib/ui/src/svg-icon.tsx`, `lib/ui/src/svg-icon.test.tsx` |

### Deep Modules

- **SVG icon primitive:** takes an SVG source string and returns either sanitized SVG React output or an empty outline. It owns allowed tags, allowed attributes, fallback behavior, stable data attributes, and tests.
- **Generated icon field editor:** adapts one flat field to the SVG icon primitive, dialog source editing, patch commit, revert, and error behavior.
- **Generated icon field display:** adapts table/read-only field values to compact icon output without leaking raw SVG source.
- **Public Site link icon adapter:** keeps link semantics in the public renderer while adding icon rendering before labels.

## Testing Decisions

- Test the SVG primitive through rendered markup, not parser internals.
- SVG primitive tests should cover valid paths, missing source, malformed source, script stripping/rejection, event-handler stripping/rejection, `foreignObject` rejection, and external reference rejection.
- Field behavior tests should assert icon editor metadata selects the generated icon control.
- Generated adapter tests should assert `editor: "icon"` exposes icon-specific control facts.
- Generated create tests should assert icon source submits as one flat string field.
- Generated inline editor tests should assert icon fields render preview/edit dialog affordances instead of a plain text input.
- Generated display tests should assert icon fields do not render raw SVG text in table display.
- Site view-model tests should assert link variants expose icon editing where needed for social links.
- Site tree tests should assert `block.icon` still projects through the public tree.
- Public renderer tests should assert footer social links render icon markup plus labels and keep external-link attributes.
- Browser smoke should cover `/site` icon editing and `/pages/home` footer icon rendering when app behavior changes.
- Use `devstate check` as final check evidence.
- Do not run raw `bun test`, `bun check`, `vp test`, or `vp check` manually during normal agent work.

## Chunks

| ID     | Status  | Depends on | Main files                                       | Acceptance                                                                                 |
| ------ | ------- | ---------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| SIF-01 | done    | none       | tests, PRD                                       | Current plain-text icon behavior and target contracts are characterized.                   |
| SIF-02 | done    | SIF-01     | `lib/ui`, tests                                  | Shared SVG icon renderer renders safe SVG and empty-outline fallback with sanitizer tests. |
| SIF-03 | ready   | SIF-02     | field behavior, generated adapters, generated UI | Generated display, create, and inline patch surfaces use icon renderer/editor.             |
| SIF-04 | planned | SIF-03     | Site schema, seed, public renderer, tests        | Site social links store SVG source and public footer renders icons plus labels.            |
| SIF-05 | planned | SIF-04     | browser smoke, PRD                               | `/site` and `/pages/home` smoke pass; PRD evidence, blockers, and promotion notes updated. |

## Out of Scope

- Do not add an icon catalog.
- Do not add icon search.
- Do not fetch icons from remote providers.
- Do not add media upload for SVG files.
- Do not add a new stored `icon` field type.
- Do not change the authority field value model.
- Do not sanitize and rewrite stored SVG on write.
- Do not support arbitrary HTML.
- Do not support `foreignObject`.
- Do not support animated or scripted SVG.
- Do not add global design-system icon mapping.
- Do not redesign the public footer beyond rendering seeded icon data.
- Do not update `doc/current.md` or `doc/roadmap.md` until this PRD ships.

## Blockers

- Current `devstate` service-test watcher is failing before this PRD starts because Site seed expectations and live seed data differ. This PRD should not take ownership of that failure unless the same tests are still failing after the assigned implementation changes touch Site seed records.
- 2026-05-12 SIF-01: `devstate start` and post-change watcher still report the pre-existing `src/app.test.tsx` generated route failures. SIF-01 did not touch route behavior.
- 2026-05-12 SIF-02: no new chunk blocker. Current devstate layout did not create `tmp/devstate.json`, `tmp/test.txt`, or `tmp/check.txt`; evidence came from `.devstate/status.md`, `.devstate/status.json`, and `.devstate/logs/`.

## Promote after ship

- `doc/current.md`: generated icon fields render SVG previews, empty outlines for missing/invalid values, and dialog textarea editing while preserving flat string storage.
- `doc/current.md`: public Site link blocks can render text-backed SVG icons, used by footer social links.
- `doc/current.md`: shared SVG icon renderer lives in `lib/ui` and is reused by generated UI and public Site rendering.
- `doc/roadmap.md`: no change unless icon support becomes explicit first-release scope wording.
- SIF-01: no global-doc promotion yet; behavior is characterized but unchanged.
- SIF-02: promote shared `lib/ui/src/svg-icon.tsx` renderer after generated UI and public Site consumers land.

## Evidence

- 2026-05-12: PRD created from user direction after reviewing existing icon field state.
- Current behavior: `icon` is a text field format on Site `block` records.
- Current behavior: `editor: "icon"` is accepted as a text editor hint.
- Current behavior: generated create and patch controls render icon fields as plain text inputs.
- Current behavior: generated field display does not special-case icon values.
- Current behavior: public Site `LinkBlock` ignores `block.icon`.
- Current behavior: public tree projection already carries `block.icon`.
- Current behavior: `lib/ui` already has textarea-backed source editing primitives suitable for SVG source.
- `devstate start` on 2026-05-12 reported checks ok and web ready, but service-test failed on pre-existing Site seed expectation differences.
- SIF-01: added tests that characterize `format: "icon"` as text-backed at `src/shared/field-types.test.ts`.
- SIF-01: added generated adapter and format tests showing `editor: "icon"` currently selects a text input and preserves flat string values.
- SIF-01: added generated create, inline patch, and read-only display tests showing icon source currently renders/edits as raw text.
- SIF-01: added Site tree and public renderer assertions showing `block.icon` projects through the tree while public link rendering currently ignores it.
- SIF-02: added `SvgIcon`, `EmptySvgIcon`, and `parseSvgIconSource` in `lib/ui/src/svg-icon.tsx`.
- SIF-02: SVG renderer preserves safe basic icon tags and attributes, strips event/style attributes, and falls back for malformed source, unsupported tags, `javascript:` URLs, and external asset references.
- SIF-02: added sanitizer coverage in `lib/ui/src/svg-icon.test.tsx` for valid SVG, missing and malformed source, event handler stripping, script rejection, `foreignObject` rejection, `javascript:` URL rejection, and external reference rejection.
- SIF-02: exported the renderer through `@formless/ui` and `@formless/ui/svg-icon`.
- SIF-02: `devstate check` before the final rebase on 2026-05-12 reported checks ok, web ready/running, and test service pass in `.devstate/status.md`.
- SIF-02: final post-rebase `devstate check` on 2026-05-12 reported checks ok, web ready/running, and test service pass in `.devstate/status.md`.
