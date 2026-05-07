# PRD 18: Workbench frame and Site authoring layout

Status: active
Current chunk: WAF-04
Last updated: 2026-05-07

## Goal

Make generated apps feel like real apps inside a separate development workbench frame.

The first slice should:

- keep PRD 17's runtime profile and screen-route direction;
- separate dev/workbench chrome from generated app chrome;
- keep Schema and reset tooling out of the generated app sidebar;
- expose exactly one user-facing Reset control for the active world;
- move sync status out of page content and into unobtrusive chrome;
- use Site screen routes for Pages and Navigation;
- give Site list/detail authoring much more room;
- improve Site labels and singleton-root behavior using existing schema/view primitives.

This PRD is about chrome placement and generated Site editor layout. It is not about new schema primitives, a visual page builder, preview panes, route params, permissions, or a full layout DSL.

## Problem

The current Site editor works, but it still looks like a centered generated demo rather than the app frame an author would use.

Current visible issues:

- The Formless app switcher sidebar and Site authoring sidebar are the same thing.
- The content has `Home` and `Schema` tabs even though Schema is dev tooling.
- Site screens also render as horizontal page tabs inside the content.
- Sync status renders inline under the title and consumes page attention.
- The editor is constrained to a narrow centered column while the viewport is mostly empty.
- The Pages list/detail layout gives the placement table too little room.
- Header and Footer are top-level screens even though they are singleton navigation roots.
- Singleton roots still show a one-item list/detail selector.
- Some labels expose storage terms, such as `Block` and `Create Block placement`.

PRD 17 will move toward screen routes and runtime profiles. Once top-level schema routes stop being normal app routes, putting Schema beside app screens in the sidebar is the wrong model.

The generated app needs its own frame:

- the app sidebar belongs to the app and lists app screens;
- the dev workbench frame belongs outside the app and holds schema/reset/status tools;
- app profile can remove the workbench frame while keeping the generated app frame intact.

## Source map

Existing anchors:

- Runtime profile and screen routes PRD: `prd/17-runtime-profiles-and-screen-routes.md`.
- Site editor list/detail PRD: `prd/13-site-editor-list-detail.md`.
- Declarative screen runtime PRD: `prd/10-declarative-screen-runtime.md`.
- Current runtime docs: `doc/current.md`.
- Release target docs: `doc/roadmap.md`.
- App shell: `src/app.tsx`.
- Home route: `src/app/routes/home.tsx`.
- Schema route: `src/app/routes/schema.tsx`.
- Dev reset control: `src/app/dev-actions.tsx`.
- Developer sync status line: `src/app/routes/status-line.tsx`.
- Sync status source: `src/client/sync-status.ts`.
- Client store status facts: `src/client/store.ts`.
- Screen model selection: `src/client/views.ts`.
- Generated screen renderer: `src/app/generated/screen.tsx`.
- Generated collection renderer: `src/app/generated/collection.tsx`.
- Generated table renderer: `src/app/generated/table.tsx`.
- Generated create/action renderers: `src/app/generated/create.tsx`, `src/app/generated/actions.tsx`.
- Shared sidebar primitive: `lib/ui/src/`.
- Site source schema: `schema/apps/site/schema.json`.
- Site seed records: `schema/apps/site/seed-records.json`.
- App tests: `src/app.test.tsx`.
- View model tests: `src/client/views.test.ts`.
- Schema parser tests: `src/shared/schema.test.ts`.

Owned files:

- `prd/18-workbench-frame-and-site-authoring-layout.md`.

Likely changed files:

- `src/app.tsx`.
- `src/app/routes/home.tsx`.
- `src/app/routes/schema.tsx`.
- `src/app/routes/status-line.tsx`.
- `src/app/dev-actions.tsx`.
- `src/client/views.ts`.
- `src/app/generated/screen.tsx`.
- `src/app/generated/collection.tsx`.
- `src/app/generated/table.tsx`.
- `src/app/generated/actions.tsx`.
- `schema/apps/site/schema.json`.
- `src/app.test.tsx`.
- `src/client/views.test.ts`.
- `src/shared/schema.test.ts`.

## Requirements

### Workbench frame behavior

- Dev profile renders a workbench frame outside the generated app frame.
- The workbench frame can show the current world/app, profile, sync status, and tools.
- The generated app frame stays visually intact inside dev profile.
- App profile can render the generated app frame without workbench chrome.
- Published Site profile can render public pages without workbench chrome or generated admin chrome.
- Workbench chrome must not be styled as an app screen.
- Workbench chrome must not change stored records, schema, authority, sync protocol, or local DB shape.

### Generated app frame behavior

- The generated app sidebar belongs to the generated app.
- The generated app sidebar lists declared app screens only.
- Schema is not an app screen.
- Reset is not an app screen.
- Sync diagnostics are not app screens.
- The generated app sidebar should be the same frame a user sees in app profile.
- Screen routes from PRD 17 choose the active screen.
- Browser back/forward should move between screen routes, not tab state.
- If an app has one screen, the app sidebar can still exist if the app shell needs it, but no redundant in-content tabs should appear.

### Schema and tools behavior

- Schema editing lives in workbench tools, not the generated app sidebar.
- Reset lives in workbench tools, not the generated app sidebar.
- The workbench exposes exactly one visible Reset button for the active world.
- The Reset button restores source schema and source seed data for the active world.
- The Reset button has destructive confirmation.
- The UI must not expose separate "reset schema" and "reset seed" controls.
- Backend reset endpoints may remain separate internally.
- Existing route-scoped reset safety stays: Reset affects only the active schema key.
- Schema editor can keep an internal dev/workbench URL if useful, but the URL is not an app screen route.

### Sync status behavior

- Remove the inline `DeveloperStatusLine` from generated page content.
- Show sync status in workbench/header chrome as a small control.
- Idle/synced state should be quiet.
- Syncing state should be visible but not dominant.
- Error state should be noticeable.
- The sync status control opens a dialog or popover with details.
- Details should include schema version when loaded.
- Details should include cursor.
- Details should include push sync state/message.
- Details should include last sync time when present.
- Details should include active world/app key.
- Loading and error states should still be accessible to screen readers.

### Site screen behavior

- Site authoring top-level screens are Pages and Navigation.
- Pages is the default Site authoring screen.
- Navigation groups Header and Footer editing into one screen.
- Header and Footer are not top-level screens in this PRD.
- Header and Footer can become top-level screens later if they become large editors.
- Pages route comes from PRD 17 screen routing.
- Navigation route comes from PRD 17 screen routing.
- Site Schema remains workbench tooling.
- Raw Blocks and Placements stay non-primary/debug views.
- Existing flat records remain: `block` and `blockPlacement`.
- Existing public Site tree and renderer behavior stays unchanged.

### Site layout behavior

- Generated workspace content should use the available viewport width.
- Remove the narrow centered `max-w-3xl` constraint from generated workspace screens.
- Keep a sensible maximum width for readability where needed, but Site authoring should not waste most of a desktop viewport.
- List/detail should allocate more width to detail content.
- The context list should be a stable sidebar-sized column on desktop.
- The detail pane should use `minmax(0, 1fr)` and give tables the remaining width.
- On narrow viewports, list/detail can stack.
- Placement tables should be allowed to use horizontal space.
- Page metadata should be compact and should not dominate the placement table.
- Header/Footer singleton roots should not render a noisy one-item list selector.
- Singleton root context should auto-select and render the detail directly.
- Multi-root contexts, such as Pages, keep the list/detail selector.

### Label and action behavior

- Site authoring labels should use author terms, not storage terms, where existing schema labels allow it.
- The Pages context list should be labeled `Pages`, not `Block`.
- The Navigation screen should show Header and Footer section labels.
- Create placement actions should use `Add placement` or another author-facing label through existing collection action labels.
- Do not add a new label DSL in this PRD.
- Do not rename `block` or `blockPlacement` entities in storage.
- Do not hide needed debugging raw views from schema/debug access.

### No-new-primitives constraint

- Use existing workspace screens.
- Use existing stack sections.
- Use existing collection views.
- Use existing list/detail context presentation.
- Use existing table views.
- Use existing collection action labels.
- Use existing shared UI primitives.
- Do not add new schema layout primitives.
- Do not add a visual page builder.
- Do not add a preview pane.
- Do not add route params.
- Do not add nested routers.

## Proposed shape

Dev profile:

```text
Workbench chrome
  Site                         Synced *                         Tools

Generated app frame
  Sidebar
    Pages
    Navigation

  Main
    Pages list/detail editor
```

App profile:

```text
Generated app frame
  Sidebar
    Pages
    Navigation

  Main
    Pages list/detail editor
```

Workbench Tools:

```text
Tools
  Schema
  Reset
```

Notes:

- `Reset` is the only reset control.
- `Schema` opens workbench tooling, not an app screen.
- Sync details are opened from the status control, not rendered in page content.

Site screens:

```json
{
  "screens": {
    "sitePages": {
      "type": "workspace",
      "label": "Pages",
      "path": "/",
      "navigation": { "primary": true },
      "layout": {
        "type": "stack",
        "sections": [{ "id": "pages", "type": "collection", "view": "pageCompositionHome" }]
      }
    },
    "siteNavigation": {
      "type": "workspace",
      "label": "Navigation",
      "path": "/navigation",
      "navigation": { "primary": true },
      "layout": {
        "type": "stack",
        "sections": [
          { "id": "header", "type": "collection", "view": "headerCompositionHome" },
          { "id": "footer", "type": "collection", "view": "footerCompositionHome" }
        ]
      }
    }
  }
}
```

## Decisions

| ID      | Decision                                                            | Reason                                                                            | Evidence                                                            |
| ------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| WAF-D1  | Separate workbench chrome from generated app chrome.                | Dev tools should not pollute the app frame users will see.                        | `prd/17-runtime-profiles-and-screen-routes.md`, `src/app.tsx`       |
| WAF-D2  | Keep Schema out of the generated app sidebar.                       | Schema is workbench tooling, not an app screen.                                   | user decision, PRD 17 profile direction                             |
| WAF-D3  | Expose one Reset button only.                                       | Separate reset controls add noise and invite the wrong mental model.              | user decision, `src/app/dev-actions.tsx`                            |
| WAF-D4  | Move sync status to chrome with a details dialog/popover.           | Sync status is useful diagnostics but should not dominate authoring content.      | `src/app/routes/status-line.tsx`, screenshot feedback               |
| WAF-D5  | Use Pages and Navigation as Site top-level screens.                 | Header and Footer are singleton navigation roots, not independent app areas yet.  | `prd/13-site-editor-list-detail.md`, `schema/apps/site/schema.json` |
| WAF-D6  | Use existing stack sections for Navigation.                         | Header and Footer can compose into one screen without new layout primitives.      | `src/app/generated/screen.tsx`                                      |
| WAF-D7  | Widen generated workspace layout before adding new editor concepts. | The current UI wastes desktop width; the existing table/list-detail can improve.  | `src/app/routes/home.tsx`, `src/app/generated/collection.tsx`       |
| WAF-D8  | Auto-render singleton list/detail contexts without a one-item list. | Header/Footer roots should not feel like a tab/list selector.                     | `schema/apps/site/schema.json`, `src/app/generated/collection.tsx`  |
| WAF-D9  | Improve labels through existing schema labels and action labels.    | Better author language is possible without storage renames or new schema surface. | `src/shared/schema-types.ts`, `src/client/views.ts`                 |
| WAF-D10 | Keep public Site behavior unchanged.                                | This PRD improves the admin/editor frame, not the public tree or renderer.        | `src/site/tree.ts`, `src/app/routes/site-page.tsx`                  |

## Chunks

| ID     | Status  | Depends on            | Main files                       | Acceptance                                                                                                |
| ------ | ------- | --------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| WAF-01 | shipped | none                  | PRD                              | PRD captures workbench/app frame split, Site screen shape, one Reset, sync status, layout, and non-goals. |
| WAF-02 | shipped | PRD 17 route profiles | app shell, route frame tests     | Dev workbench chrome wraps the generated app frame; app sidebar lists app screens only.                   |
| WAF-03 | shipped | WAF-02                | dev tools, schema route/reset UI | Schema and one Reset button move into workbench tools; reset remains active-world scoped.                 |
| WAF-04 | planned | WAF-02                | sync status UI, tests            | Inline page sync status is replaced by a quiet chrome status control with details dialog/popover.         |
| WAF-05 | planned | PRD 17 screen paths   | Site source schema, app tests    | Site source schema uses Pages and Navigation top-level screens; Header/Footer are Navigation sections.    |
| WAF-06 | planned | WAF-05                | generated screen/collection UI   | Site authoring uses a wide workspace layout; list/detail gives detail/table content more room.            |
| WAF-07 | planned | WAF-06                | generated collection UI, schema  | Singleton Header/Footer contexts auto-render detail; Site action/section labels are author-facing.        |
| WAF-08 | planned | WAF-07                | browser smoke, PRD               | Checks pass; browser smoke covers Site Pages, Navigation, tools, reset dialog, and sync status details.   |

## Chunk details

### WAF-01 PRD draft

Status: shipped 2026-05-07.

Goal: capture the agreed frame and Site layout direction.

Outcome:

- Recorded the workbench chrome vs generated app chrome split.
- Recorded that Schema is workbench tooling, not an app sidebar item.
- Recorded that there is one visible Reset button only.
- Recorded sync status as a chrome control with details.
- Recorded Site top-level screens as Pages and Navigation.
- Recorded wide list/detail layout needs.
- Recorded the no-new-primitives constraint.

Evidence:

- `./tmp/agent-dev.json`: `devStatus` ready, `testStatus` pass, `checkStatus` pass.
- `./tmp/test.txt`: `29 passed (29)`, `506 passed (506)`.
- `./tmp/check.txt`: formatting pass; lint/type check pass for 166 files.

### WAF-02 workbench and generated app frame

Status: shipped 2026-05-07.

Goal: create the chrome separation.

Tasks:

- Add a dev workbench frame around generated app routes.
- Move app selection/profile/tooling concerns into workbench chrome.
- Keep generated app sidebar as app-owned screen navigation.
- Remove Schema from app screen navigation.
- Ensure app profile can render generated app frame without workbench chrome.
- Preserve public Site route shell behavior.

Acceptance:

- Dev profile shows workbench chrome outside the app frame.
- Generated app sidebar shows app screens only.
- Schema does not appear in the app sidebar.
- Public Site routes show no workbench or generated admin chrome.
- Existing app route behavior remains correct after PRD 17 route changes.

Outcome:

- Added dev workbench chrome around generated app routes in `src/app.tsx`.
- Moved dev app switching into the workbench chrome.
- Kept the generated app frame reusable for app profile without workbench chrome.
- Removed Schema from generated app screen navigation.
- Preserved direct schema editor routes for later WAF-03 tool placement.
- Preserved public Site route shell behavior.

Evidence:

- `./tmp/agent-dev.json`: `devStatus` ready, `testStatus` pass, `checkStatus` pass.
- `./tmp/test.txt`: `32 passed (32)`, `543 passed (543)`.
- `./tmp/check.txt`: formatting pass; lint/type check pass for 183 files.
- Browser smoke: `bun browser --session waf02 --ignore-https-errors open https://18-workbench-frame-and-site-authoring-layout.formless.local/site`; DOM eval showed `workbench:1`, `generated:1`, `siteSchema:0`, `siteScreens:1`.
- Browser smoke: `/pages/home` DOM eval showed `workbench:0`, `generated:0`, `tasks:0`, `siteSchema:0`.

Promotion notes:

- `doc/current.md`: dev profile now renders a workbench frame outside the generated app frame.
- `doc/current.md`: generated app sidebar now lists app screens only; Schema is no longer an app screen navigation item.
- `doc/current.md`: app profile reuses the generated app frame without workbench chrome.

### WAF-03 workbench tools and one Reset

Status: shipped 2026-05-07.

Goal: move schema/reset tooling out of app navigation.

Tasks:

- Shipped: added a workbench Tools disclosure in `src/app.tsx`.
- Shipped: added Schema as a workbench tool link for the active world.
- Shipped: moved source Reset into workbench Tools.
- Shipped: kept one visible Reset button inside open workbench Tools.
- Shipped: kept destructive confirmation.
- Shipped: kept reset scoped to the active schema key.
- Shipped: removed reset controls from schema-route page content.
- Shipped: kept store snapshot controls on schema routes.

Acceptance:

- Workbench tools expose Schema.
- Workbench tools expose one Reset button.
- Reset confirmation says it restores source schema and source seed data.
- No UI exposes separate reset schema and reset seed controls.
- Reset affects only the active world.

Outcome:

- `src/app.tsx` renders dev schema routes as `data-frame="workbench-tool"` outside the generated app frame.
- `src/app.tsx` renders active-world Tools with Schema and Reset.
- `src/app/dev-actions.tsx` exports reusable `SourceResetControl`.
- `src/app/routes/schema.tsx` keeps snapshot controls but no reset controls.
- `src/app.test.tsx` covers workbench Tools, workbench schema routes, and absence of schema-route reset controls.

Evidence:

- `./tmp/agent-dev.json`: `devStatus` ready, `testStatus` pass, `checkStatus` pass.
- `./tmp/test.txt`: latest affected reruns passed; `src/app.test.tsx` showed `95 passed (95)`.
- `./tmp/check.txt`: formatting pass; lint/type check pass for 183 files.
- Browser smoke: `/site` eval returned workbench and generated frames present, one workbench Schema link, Tools closed by default.
- Browser smoke: after opening Tools on `/site`, eval returned `toolsOpen=true`, one visible Reset button, and one visible `/site/schema` link.
- Browser smoke: Reset confirmation copy included `This restores the source schema and source seed data for site`; confirmation was canceled.
- Browser smoke: `/site/schema` eval returned workbench `1`, workbench-tool `1`, generated app frame `0`, Site Schema present, old `Reset schema and seed data` text absent.
- Browser smoke: `bun browser --session waf03 errors` returned no page errors.

Promotion notes:

- `doc/current.md`: Schema and Reset are workbench tools, not generated app screens.
- `doc/current.md`: one Reset UI restores source schema and source seed data for the active world.

### WAF-04 chrome sync status

Status: planned.

Goal: make sync diagnostics useful but unobtrusive.

Tasks:

- Replace inline route `DeveloperStatusLine` usage with chrome status control.
- Keep status facts sourced from existing sync status and client store hooks.
- Add details dialog/popover.
- Make idle/synced status quiet.
- Make error status noticeable.
- Preserve accessible status semantics.

Acceptance:

- Generated page content does not show inline sync status.
- Header/workbench chrome shows a small sync status control.
- Opening the control shows schema version, cursor, status message, last sync, and app key.
- Loading and error states remain visible and accessible.

Evidence to record:

- `./tmp/agent-dev.json`.
- `./tmp/test.txt`.
- `./tmp/check.txt`.

### WAF-05 Site Pages and Navigation screens

Status: planned.

Goal: make Site top-level screens match authoring mental model.

Tasks:

- Replace primary Site Header/Footer screens with one Navigation screen.
- Keep Pages as default Site authoring screen.
- Put Header and Footer as stack sections inside Navigation.
- Keep raw Blocks and Placements views non-primary/debug.
- Keep public Site behavior unchanged.

Acceptance:

- Site app sidebar shows Pages and Navigation.
- Header and Footer do not appear as top-level app screens.
- Navigation screen renders Header and Footer sections.
- Pages screen still edits page roots and placements.
- Public `/pages/*` preview still works.

Evidence to record:

- `./tmp/agent-dev.json`.
- `./tmp/test.txt`.
- `./tmp/check.txt`.

### WAF-06 wide Site workspace layout

Status: planned.

Goal: give authoring content enough room.

Tasks:

- Remove narrow centered workspace constraint for generated app screens.
- Add a wider generated workspace layout.
- Widen list/detail grid tracks.
- Let placement tables use remaining horizontal space.
- Keep mobile stacking behavior.
- Keep compact page root metadata above related placements.

Acceptance:

- Site Pages uses substantially more desktop width.
- Page list remains readable.
- Detail pane and placement table receive most of the width.
- Placement table no longer feels cramped on desktop.
- Narrow viewport layout still stacks coherently.

Evidence to record:

- `./tmp/agent-dev.json`.
- `./tmp/test.txt`.
- `./tmp/check.txt`.
- Browser smoke screenshot for Site Pages.

### WAF-07 singleton context and label cleanup

Status: planned.

Goal: remove storage-shaped noise without new concepts.

Tasks:

- Auto-render singleton `listDetail` contexts without showing a one-item selector.
- Use author-facing labels in Site source schema where existing schema supports them.
- Set placement create action labels to `Add placement` or equivalent.
- Keep storage entity names unchanged.
- Keep raw debug views available outside primary app navigation.

Acceptance:

- Navigation/Header singleton section does not show a one-item Block selector.
- Footer singleton section does not show a one-item Block selector.
- Pages context list label is author-facing.
- Placement create button is author-facing.
- No storage entity rename occurs.

Evidence to record:

- `./tmp/agent-dev.json`.
- `./tmp/test.txt`.
- `./tmp/check.txt`.
- Browser smoke screenshot for Site Navigation.

### WAF-08 closeout

Status: planned.

Goal: verify changed UI behavior and update this PRD.

Tasks:

- Read `./tmp/agent-dev.json`, `./tmp/test.txt`, and `./tmp/check.txt`.
- Fix issues from dev/test/check output.
- Run browser smoke because app behavior changes.
- Update chunk statuses, decisions, blockers, and promote notes.

Acceptance:

- `./tmp/test.txt` shows passing tests.
- `./tmp/check.txt` shows passing checks.
- Browser smoke covers Site Pages, Site Navigation, workbench tools, Reset confirmation, and sync details.
- PRD status and promote notes are current.

Evidence to record:

- `./tmp/agent-dev.json`.
- `./tmp/test.txt`.
- `./tmp/check.txt`.
- Browser smoke command and result.

## Dependencies

| Workstream              | Type         | Need                                                                                       |
| ----------------------- | ------------ | ------------------------------------------------------------------------------------------ |
| PRD 17 runtime profiles | upstream     | Runtime profile seam and screen route selection.                                           |
| PRD 13 Site editor      | upstream     | Existing Pages/Header/Footer list-detail views and Site authoring schema.                  |
| PRD 10 screen runtime   | upstream     | Workspace screens and stack sections.                                                      |
| PRD 14 table work       | coordination | Wide placement table layout should preserve table actions and ordering if TAO has shipped. |

## Blockers

- WAF-05 depends on PRD 17 screen paths if routes are part of acceptance.
- No known blocker for WAF-04 if implemented as a chrome refactor over existing status facts.

## Non-goals

- Do not add new schema layout primitives.
- Do not add a visual page builder.
- Do not add preview panes.
- Do not add route params.
- Do not add nested routers.
- Do not add users, permissions, or account routing.
- Do not add draft edit sessions.
- Do not add media upload.
- Do not rename `block` or `blockPlacement` storage entities.
- Do not change public Site tree projection.
- Do not change public Site renderer behavior.
- Do not change authority, storage, sync protocol, or API shape.
- Do not add separate reset schema and reset seed UI.

## Promote after ship

- `doc/current.md`: add workbench frame vs generated app frame facts after WAF-02 ships.
- `doc/current.md`: note Schema and Reset are workbench tools, not app screens, after WAF-03 ships.
- `doc/current.md`: note one Reset UI restores source schema and seed data after WAF-03 ships.
- `doc/current.md`: update sync status location after WAF-04 ships.
- `doc/current.md`: update Site screens to Pages and Navigation after WAF-05 ships.
- `doc/current.md`: note Site list/detail wide workspace and singleton context behavior after WAF-06/WAF-07 ship.
- `doc/roadmap.md`: update release target if this PRD is pulled into first-release scope.

## Status notes

- 2026-05-07: PRD created from screenshot review and discussion. User direction: keep Schema out of generated app sidebar, use a workbench frame for dev tools, expose one Reset button, move sync status out of page content, use Pages and Navigation for Site, and make list/detail wider without inventing new primitives.
- 2026-05-07: WAF-02 shipped. Decision WAF-D1/WAF-D2 implemented in `src/app.tsx`: dev app switching lives in workbench chrome, generated app frame owns screen navigation only, and Schema remains a direct route but not an app sidebar item. Next ready chunk is WAF-03.
- 2026-05-07: WAF-03 shipped. Decision WAF-D2/WAF-D3 implemented in `src/app.tsx`, `src/app/dev-actions.tsx`, and `src/app/routes/schema.tsx`: workbench Tools owns Schema and one active-world Reset, dev schema routes render outside the generated app frame, and schema page content keeps snapshot tooling without reset controls. Next ready chunk is WAF-04.
