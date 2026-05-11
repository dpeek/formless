# PRD 19: Site editor root nav and tree

Status: shipped
Current chunk: complete
Last updated: 2026-05-10

## Goal

Make Site editing use one top-level authoring nav and render child blocks as a nested editor tree.

The slice should:

- keep records flat as `block` and `blockPlacement`;
- keep public tree and renderer behavior unchanged;
- use one Site editor screen;
- move page/header/footer root selection into the generated app sidebar;
- group sidebar roots as Pages and Navigation;
- render selected root placements as a recursive editor tree;
- keep raw Blocks and Placements available as non-primary/debug views.

## Decisions

| ID     | Decision                                           | Reason                                                     | Evidence                                 |
| ------ | -------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------- |
| SRT-D1 | Keep `blockPlacement` as the composition edge.     | Public rendering and current storage already depend on it. | `src/site/tree.ts`, `schema/apps/site/*` |
| SRT-D2 | Add root navigation to collection context facts.   | Root nav is selected context, not another app screen.      | `src/client/views.ts`, `src/app.tsx`     |
| SRT-D3 | Add a generated `tree` result presentation.        | Child blocks need inline nested editors, not a flat table. | `src/app/generated/tree.tsx`             |
| SRT-D4 | Keep Site root selection in state, not route args. | Avoid route params and nested routers for this slice.      | `src/app/routes/home.tsx`, `src/app.tsx` |

## Chunks

| ID     | Status  | Depends on | Main files                         | Acceptance                                            |
| ------ | ------- | ---------- | ---------------------------------- | ----------------------------------------------------- |
| SRT-01 | shipped | none       | schema, views, generated UI, tests | `/site` has root sidebar nav and nested tree editing. |

## Requirements

- `/site` sidebar shows Pages roots and Navigation roots.
- `/site` main pane edits exactly one selected root.
- Page roots include Home, Blog, Resume, and Projects.
- Navigation roots include Header and Footer.
- The in-page list/detail selector is hidden when roots are in the sidebar.
- The selected root still renders root fields.
- The selected root renders child placements recursively.
- Tree nodes render placement fields and child block fields.
- Missing child references and cycles do not crash the editor.
- Reordering remains available for sibling placements.
- `/pages/*` public rendering keeps using the existing public tree.

## Non-goals

- Do not change storage shape.
- Do not change authority, sync, or protocol.
- Do not add route params.
- Do not add preview panes.
- Do not add media upload.
- Do not add delete/archive flows.
- Do not add a Site-only route outside generated UI.

## Promote after ship

- `doc/current.md`: Site editor uses one root-selection sidebar for Pages and Navigation roots.
- `doc/current.md`: generated collection results can render relationship-backed tree editors.
- `doc/current.md`: Site selected roots render child placements recursively while records stay flat.

## Status Notes

- 2026-05-10: Started SRT-01 from user direction to proceed with sidebar top-level block nav and child block editor trees.
- 2026-05-10: SRT-01 shipped. Added collection context sidebar navigation, generated tree result presentation, one Site editor screen, Site root sidebar groups, and recursive placement tree editors.

## Evidence

- `devstate check`: checks ok, services running, test watcher pass.
- Browser smoke `/site`: reset source schema and seed; sidebar rendered Pages roots Home/Blog/Resume/Projects and Navigation roots Header/Footer; main pane rendered one `Placement tree`, no Site screen nav, no placement table, and one Add placement action.
- Browser smoke `/site`: selecting Header in the sidebar rendered Header detail and header link child editors.
- Browser smoke `/pages/home`: public page rendered header, hero, portrait media, and footer with no workbench or generated app frame.
- Browser smoke: `bun browser --session srt01 errors` returned no page errors.
