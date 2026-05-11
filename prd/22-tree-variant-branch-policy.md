# PRD 22: Tree variant branch policy

Status: ready
Current chunk: TVB-03
Last updated: 2026-05-12

## Problem Statement

The generated Site editor tree renders every child block recursively.

That is correct for page-local composition, but it is noisy for reusable global roots. When a page contains Header or Footer, the page editor should show the Header or Footer node itself, but it should not expand the Header or Footer child placements inline. The author should jump to the Header or Footer root editor when they want to edit those children.

Current behavior:

- Site records stay flat as `block` and `blockPlacement`.
- The Site editor uses a generated tree result to render selected root placements.
- Tree child nodes can render variant-aware inline editors.
- Header and Footer child nodes can render compact context links.
- Tree recursion still descends into Header and Footer children when those blocks appear inside a page tree.
- Page editing can therefore show global navigation/footer internals in the page body tree.

The editor needs a declarative way to stop tree recursion for selected child variants while still rendering the child node itself.

## Solution

Add an optional tree branch policy to collection tree results.

The first slice should let a tree result mark selected child variants as leaves. A matching child node still renders through its configured child item view, including compact context links. The renderer then stops recursion below that child record for the current tree.

Example shape:

```json
{
  "type": "tree",
  "relationship": "blockPlacements",
  "childField": "block",
  "childItemView": "blockTreeNode",
  "branches": {
    "variants": {
      "header": "leaf",
      "footer": "leaf"
    }
  }
}
```

For Site:

- Home page tree shows Header and Footer nodes.
- Home page tree does not show Header and Footer child links.
- Selecting Header as the active root still shows Header children.
- Selecting Footer as the active root still shows Footer children.
- Public `/pages/*` tree and renderer stay unchanged.

This is a generated editor policy over view results. It is not storage behavior.

## User Stories

1. As a Site author, I want Header to appear as one compact node inside a page tree, so that page editing is not cluttered with global navigation internals.
2. As a Site author, I want Footer to appear as one compact node inside a page tree, so that page editing is not cluttered with global footer internals.
3. As a Site author, I want to open Header from its compact node, so that I can edit Header in the root editor.
4. As a Site author, I want to open Footer from its compact node, so that I can edit Footer in the root editor.
5. As a Site author, I want Header children to render when Header is the selected root, so that Header remains editable.
6. As a Site author, I want Footer children to render when Footer is the selected root, so that Footer remains editable.
7. As a Site author, I want page-local groups and content sections to keep expanding, so that page composition remains visible.
8. As a Site author, I want hidden descendants to remain stored and published, so that the editor view does not change site output.
9. As a schema author, I want branch hiding declared on the tree result, so that different tree views can choose different recursion behavior.
10. As a schema author, I want branch hiding keyed by child union variant, so that the policy follows the same type vocabulary as variant-aware tree nodes.
11. As a schema author, I want bad branch variant names rejected at parse time, so that broken tree policies do not silently do nothing.
12. As a schema author, I want branch policy independent from `contextLink`, so that a variant can link in one tree and still expand in another.
13. As a runtime developer, I want tree recursion decisions to come from view-model facts, so that generated renderers do not inspect raw schema.
14. As a runtime developer, I want the branch policy selector to be pure and small, so that recursion behavior can be tested without browser state.
15. As a runtime developer, I want cycle detection and max-depth behavior to keep working, so that branch hiding does not weaken existing tree safety.
16. As a runtime developer, I want ordering to keep working for visible siblings, so that hiding descendants does not affect sibling drag order.
17. As a future schema author, I want branch policies to leave room for non-variant predicates later, so that this does not block future tree controls.

## Source Map

Existing anchors:

- Current runtime docs: `doc/current.md`.
- Release target docs: `doc/roadmap.md`.
- Site tree renderer PRD: `prd/09-site-tree-renderer.md`.
- Site editor root nav and tree PRD: `prd/19-site-editor-root-nav-and-tree.md`.
- Discriminated entity unions PRD: `prd/20-discriminated-entity-unions.md`.
- View result ordering PRD: `prd/21-view-result-ordering.md`.
- Schema types: `src/shared/schema-types.ts`.
- View parser: `src/shared/schema-views.ts`.
- Schema parser tests: `src/shared/schema.test.ts`.
- View model selection: `src/client/views.ts`.
- View model tests: `src/client/views.test.ts`.
- Generated tree renderer: `src/app/generated/tree.tsx`.
- Generated union presentation selector: `src/app/generated/union-presentation.ts`.
- App tests: `src/app.test.tsx`.
- Site source schema: `schema/apps/site/schema.json`.
- Public Site tree projection: `src/site/tree.ts`.
- Public Site renderer: `src/app/site-renderer/renderer.tsx`.

Owned files:

- `prd/22-tree-variant-branch-policy.md`.

Likely changed files:

- `src/shared/schema-types.ts`.
- `src/shared/schema-views.ts`.
- `src/shared/schema.test.ts`.
- `src/client/views.ts`.
- `src/client/views.test.ts`.
- `src/app/generated/tree.tsx`.
- `src/app/generated/union-presentation.ts` or a new small tree branch selector module.
- `src/app.test.tsx`.
- `schema/apps/site/schema.json`.

## Requirements

### Schema behavior

- Tree results can declare optional branch policy.
- Branch policy is scoped to the tree result.
- First supported branch policy key is child union variant.
- First supported branch policy action is `leaf`.
- `leaf` means render the child node and do not render its descendants in this tree.
- Branch policy does not hide the child placement row.
- Branch policy does not delete, tombstone, or patch records.
- Branch policy does not affect public Site tree projection.
- Branch policy does not affect other tree results unless they declare the same policy.
- Branch policy can only reference variants from the tree child item view union.
- Branch policy requires the tree child item view to be variant-aware.
- Branch policy fails parsing if the child item view has no union.
- Branch policy fails parsing if a variant name is not part of the child item view union.
- Branch policy fails parsing if an action is not supported.
- Existing tree schemas without branch policy parse unchanged.
- `stringifySchema` preserves branch policy.

### View model behavior

- Tree result models expose render-ready branch policy facts.
- The renderer should not inspect raw schema branch policy objects.
- Branch policy facts include the child discriminator field and the leaf variant values.
- A child record whose active variant is configured as `leaf` is treated as a leaf for that tree.
- A child record with no matching variant continues to recurse normally.
- A child record with an unknown discriminator value continues to follow fallback behavior unless fallback branch policy is explicitly added in a later slice.
- Branch policy is evaluated against the child record, not the placement record.
- Branch policy does not change context selection state.

### Generated tree behavior

- Tree nodes still render placement controls for visible placements.
- Tree nodes still render child block fields or context links.
- Header child nodes still render as compact context links.
- Footer child nodes still render as compact context links.
- Header descendants do not render when Header appears as a page child.
- Footer descendants do not render when Footer appears as a page child.
- Header descendants render when Header is the selected context root.
- Footer descendants render when Footer is the selected context root.
- Hidden descendants do not produce max-depth warnings in the parent tree.
- Hidden descendants do not produce missing-child warnings in the parent tree.
- Existing cycle detection remains active for expanded branches.
- Existing max-depth behavior remains active for expanded branches.
- Existing sibling ordering remains active for visible siblings.

## Implementation Decisions

| ID      | Decision                                            | Reason                                                                 | Evidence                                            |
| ------- | --------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------- |
| TVB-D1  | Model branch hiding as tree result policy.          | Recursion behavior belongs to the tree view, not the stored record.    | Tree result already owns relationship recursion.    |
| TVB-D2  | Use `leaf` instead of `hide`.                       | The child node is visible; only descendants are hidden.                | Header/Footer nodes should remain selectable.       |
| TVB-D3  | Key the first policy by child union variant.        | Site already has `blockByType`; Header/Footer are variants.            | PRD 20 introduced child variant presentations.      |
| TVB-D4  | Keep branch policy independent from `contextLink`.  | Link presentation and recursion policy are separate decisions.         | A variant may link and expand in different trees.   |
| TVB-D5  | Validate policy through the child item view union.  | The tree result knows which child item view controls node variants.    | Tree result already references `childItemView`.     |
| TVB-D6  | Do not change public Site projection or renderer.   | This is generated admin UI behavior only.                              | Public pages need Header/Footer children published. |
| TVB-D7  | Treat selected root as outside child branch policy. | The selected root is the tree starting point, not a child node.        | Header root editing should show Header placements.  |
| TVB-D8  | Evaluate policy before descendant placement lookup. | Hidden branches should not compute or warn about descendants.          | Renderer currently fetches descendants per child.   |
| TVB-D9  | Keep unknown variants expanding in the first slice. | Silent hiding of unknown content would be risky.                       | Fallback branch policy can be a later extension.    |
| TVB-D10 | Keep visible sibling ordering unchanged.            | Branch hiding does not alter the ordered placement list at that level. | PRD 21 owns result ordering behavior.               |
| TVB-D11 | Keep the pure selector small and testable.          | Recursion policy should be easy to validate outside rendering details. | Existing union selectors are already pure helpers.  |

## Suggested Schema Shape

Use a small result-level object:

```json
{
  "branches": {
    "variants": {
      "header": "leaf",
      "footer": "leaf"
    }
  }
}
```

Parser output can normalize this to facts like:

- discriminator field name;
- `leafVariantValues`;
- optional future extension point for fallback or field predicates.

Do not put this under the union definition. The same union can be expanded in one tree and treated as leaves in another tree.

## Chunks

| ID     | Status  | Depends on | Main files                         | Acceptance                                                                     |
| ------ | ------- | ---------- | ---------------------------------- | ------------------------------------------------------------------------------ |
| TVB-01 | shipped | PRD 20     | schema types/parser, view model    | Tree branch policy parses, validates variant keys, and exposes model facts.    |
| TVB-02 | shipped | TVB-01     | generated tree renderer, app tests | Tree renderer treats configured child variants as leaves.                      |
| TVB-03 | ready   | TVB-02     | Site source schema, browser smoke  | `/site` page trees hide Header/Footer descendants; Header/Footer roots expand. |

## Testing Decisions

- Parser tests should cover valid tree branch policy.
- Parser tests should reject branch policy without a child item view union.
- Parser tests should reject unknown variant names.
- Parser tests should reject unsupported branch actions.
- Parser tests should confirm schemas without branch policy are unchanged.
- View model tests should cover render-ready branch policy facts.
- View model tests should prove branch facts are based on the child item view union.
- Generated tree tests should use minimal records: page root, header child, link grandchild.
- Generated tree tests should assert the header node renders while its link grandchild does not.
- Generated tree tests should assert selecting Header as root renders its link child.
- Generated tree tests should cover Footer the same way or use a parameterized case.
- Existing max-depth and cycle tests should continue to pass.
- Existing ordering tests should continue to pass for visible sibling placements.
- Browser smoke should reset Site schema and seed, open `/site`, and verify Header/Footer child internals are absent from page-root editing while root editing still works.
- Public `/pages/home` smoke should verify public rendering is unchanged if the Site source schema changes.

## Acceptance Checks

- `devstate check` reports checks ok.
- Site source schema declares Header/Footer child variants as tree leaves for the main Site composition tree.
- `/site` page-root tree shows Header and Footer nodes.
- `/site` page-root tree does not show Header/Footer descendant link editors.
- Selecting Header root shows Header descendants.
- Selecting Footer root shows Footer descendants.
- Drag handles for visible placements still render.
- Move buttons remain absent if PRD 20 follow-up has shipped.
- Public `/pages/home` still renders header navigation and footer content.
- No browser page errors.

## Out of Scope

- Do not change storage shape.
- Do not change `block` or `blockPlacement` record shape.
- Do not add nested fields or embedded children.
- Do not change authority validation.
- Do not change sync protocol.
- Do not change public Site tree projection.
- Do not change public Site renderer behavior.
- Do not infer branch policy from `contextLink`.
- Do not hide the child node itself.
- Do not clear hidden descendant records.
- Do not add arbitrary field predicates in the first slice.
- Do not add UI toggles for expanding hidden branches in the first slice.
- Do not add tree reparenting.
- Do not add delete/archive flows.

## Dependencies

| Dependency                        | Status   | Notes                                                                       |
| --------------------------------- | -------- | --------------------------------------------------------------------------- |
| PRD 19 Site editor root nav/tree  | shipped  | Provides recursive generated tree rendering.                                |
| PRD 20 Discriminated entity union | upstream | Provides child item view variants and Header/Footer context-link rendering. |
| PRD 21 View result ordering       | upstream | Provides explicit tree ordering and drag handles.                           |

## Promote after ship

- TVB-01 promote note: generated tree result schemas can declare `branches.variants` policies, and tree result models expose child discriminator plus leaf variant values.
- TVB-01 promote note: no generated renderer or Site source schema behavior changed yet; Header/Footer editor hiding waits for TVB-02 and TVB-03.
- TVB-02 promote note: generated tree rendering now treats configured child union variants as leaf nodes and skips descendant lookup/warnings for those hidden branches.
- TVB-02 promote note: selected roots remain outside child branch policy, so a configured leaf variant still expands when selected as the tree root.
- TVB-02 promote note: Site source schema still has no Header/Footer leaf policy; Site editor hiding waits for TVB-03.
- `doc/current.md`: generated tree results can treat configured child union variants as leaf nodes.
- `doc/current.md`: Site page-root trees show Header/Footer nodes without expanding Header/Footer children.
- `doc/current.md`: Header/Footer roots still expand when selected directly.
- `doc/roadmap.md`: Site editor tree branch policy is first-release generated UI if shipped before release.

## Further Notes

- The policy name should make the behavior clear: the node is visible, descendants are hidden.
- The branch policy should be part of the generated editor schema, not the public Site rendering contract.
- Future extensions can add fallback handling or non-variant predicates after the first slice proves the model.

## Status Notes

- 2026-05-11: Created PRD from discussion about hiding Header/Footer descendants when those variants appear inside a page tree.
- 2026-05-12: TVB-01 shipped. Added tree result `branches.variants` schema support with `leaf` action validation, child item view union validation, stringify preservation, and view-model branch facts from the child union discriminator. No generated tree renderer, Site source schema, storage, sync, authority, public tree, or public renderer behavior changed.
- 2026-05-12: TVB-02 shipped. Generated tree renderer now uses view-model branch facts to stop recursion for configured child variants, while selected roots still expand. Added app tests for leaf child rendering and selected-root expansion. No Site source schema, storage, sync, authority, public tree, or public renderer behavior changed.

## Blockers

- None.

## Evidence

- `devstate start`: checks ok, services running.
- `devstate check`: checks ok, services running.
- `.devstate/status.md`: checks ok, services running.
- 2026-05-12 TVB-01: `.devstate/status.md` reports checks ok and services running after `devstate check`.
- 2026-05-12 TVB-01: `.devstate/logs/service-test.txt` reports 15 test files passing with 429 tests.
- 2026-05-12 TVB-01: `.devstate/logs/check-vite.txt` reports formatting, lint, and type checks passing across 190 files.
- 2026-05-12 TVB-01: requested `./tmp/devstate.json`, `./tmp/test.txt`, and `./tmp/check.txt` were absent; available devstate evidence is under `.devstate/`.
- 2026-05-12 TVB-01: browser smoke skipped because app behavior did not change.
- 2026-05-12 TVB-02: `devstate check` reports checks ok and services running.
- 2026-05-12 TVB-02: requested `./tmp/devstate.json`, `./tmp/test.txt`, and `./tmp/check.txt` were absent; available devstate evidence is under `.devstate/`.
- 2026-05-12 TVB-02: `.devstate/status.md` reports checks ok and services running.
- 2026-05-12 TVB-02: `.devstate/logs/service-test.txt` reports `src/app.test.tsx` passing with 112 tests after renderer test changes.
- 2026-05-12 TVB-02: `.devstate/logs/check-vite.txt` reports formatting, lint, and type checks passing across 190 files.
- 2026-05-12 TVB-02: `bun browser --session tvb-02 open https://22-tree-variant-branch-policy.formless.local/site` loaded `/site`; snapshot showed Site roots and Placement tree; `bun browser --session tvb-02 errors` reported no page errors.
