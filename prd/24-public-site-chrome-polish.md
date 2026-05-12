# PRD 24: Public site chrome polish

Status: planned
Current chunk: PSC-01 ready
Last updated: 2026-05-12

## Goal

Make the public Site header and footer match the intended personal-site chrome.

This PRD owns:

- public Site header layout;
- public Site footer layout;
- public Site dark-mode toggle behavior;
- responsive public Site navigation behavior;
- renderer tests and browser smoke for public pages.

This PRD does not own the Site editor workflow, seed promotion, live deploy flow, or general layout DSL.

## Style Reference

Use `https://kentcdodds.com/` as a directional reference, not a template to copy.

Relevant traits:

- personal identity appears immediately;
- header nav is content-first and compact;
- dark-mode control is visible in the chrome;
- page uses real/profile/illustrative media rather than abstract decoration;
- sections are content-led, with clear calls to read, learn, or contact;
- footer is useful site chrome with navigation and contact paths;
- visual tone is warm, editorial, and personal without hiding navigation.

Apply this to Formless by making the public Site chrome quiet and data-driven, while leaving broader home-page content composition to later Site authoring PRDs.

## Problem

The public Site renderer currently treats the header and footer like early scaffolding.

Current behavior:

- Header renders a bottom border.
- Header renders a white background.
- Header injects a hard-coded `Formless` home link.
- Header navigation also renders seeded link blocks, including the seeded Home link.
- Header content is split between the injected brand link and the seeded nav.
- Header has no dark-mode toggle.
- Mobile header wraps all nav links instead of collapsing.
- Footer renders with a dark background and white text.
- Footer looks heavier than the page content.

The author wants the public Site chrome to be data-driven and quieter:

- header nav items start-aligned;
- no extra home item beyond seed data;
- dark-mode toggle end-aligned;
- mobile header shows the first nav item plus a menu;
- footer has only a subtle top border and no background.

## Source Map

Existing anchors:

- Current runtime docs: `doc/current.md`.
- Release target docs: `doc/roadmap.md`.
- Public route source: `src/app/routes/site-page.tsx`.
- Public renderer: `src/app/site-renderer/renderer.tsx`.
- Public link mode helpers: `src/app/site-renderer/links.ts`.
- Site source seed records: `schema/apps/site/seed-records.json`.
- Site tree projection: `src/site/tree.ts`.
- Site page renderer tests: `src/app.test.tsx`.
- Site tree tests: `src/site/tree.test.ts`.

Owned files:

- `prd/24-public-site-chrome-polish.md`.

Likely changed files:

- `src/app/site-renderer/renderer.tsx`.
- `src/app.test.tsx`.

Possible changed files:

- `src/app/site-renderer/theme.ts`.
- `src/app/site-renderer/nav.ts`.
- `src/app/routes/site-page.tsx` only if route-level theme bootstrap is needed.
- `schema/apps/site/seed-records.json` only if seeded nav order needs cleanup.

## Requirements

### Header Behavior

- Header must not render a bottom border.
- Header must not render a dedicated background color.
- Header must not inject a hard-coded home or brand link.
- Header navigation items come from `block.placements`.
- Header may render zero, one, or many seeded nav items.
- Header must preserve preview and published link modes.
- Header must preserve external link behavior.
- Desktop header nav starts at the content start edge.
- Desktop dark-mode toggle aligns to the content end edge.
- Header layout must not depend on the Home link existing.
- Header layout must not duplicate Home when the seed includes Home.
- Header should feel like personal-site navigation, not generated app chrome.

### Mobile Navigation

- Mobile header renders the first seeded nav item directly when one exists.
- Mobile header renders a menu button when more seeded nav items exist.
- Mobile menu contains the remaining seeded nav items.
- Mobile menu must not contain the first nav item again.
- Mobile menu must not render when there are no remaining nav items.
- Mobile menu must be keyboard reachable.
- Mobile menu must expose an accessible label.
- Mobile header text must not wrap into overlapping controls.
- Mobile header must fit at narrow viewport widths.
- Desktop header can render all nav items inline.

### Dark Mode

- Public Site pages expose a dark-mode toggle.
- Toggle is end-aligned in the header.
- Toggle affects public Site page chrome and content.
- Toggle state persists in the browser for public Site pages.
- Toggle can initialize from stored preference.
- Toggle can initialize from system preference when no explicit preference exists.
- Server-rendered tests can render a deterministic default without browser APIs.
- Dark mode must not change stored Site records.
- Dark mode must not affect generated admin routes.
- Dark mode must not require schema changes.

### Footer Behavior

- Footer renders a subtle top border.
- Footer does not render a dedicated background color.
- Footer inherits page background.
- Footer uses readable text colors in light and dark mode.
- Footer keeps nested footer section behavior.
- Footer keeps external footer link behavior.
- Footer keeps footer section labels.
- Footer must not become a card or panel.

### Renderer Behavior

- Public Site routes do not show generated admin navigation.
- Public Site preview routes keep `/pages/*` links.
- Published Site profile keeps top-level links.
- Missing page and error states stay readable.
- Existing supported block renderers keep working.
- Unknown block types stay hidden.
- Public renderer remains site-specific for first release.

### SSR Compatibility

- The deployed Site can remain client-side rendered for this PRD.
- Do not implement SSR in this PRD.
- Public Site chrome should not depend on browser-only APIs during initial render.
- Browser-only dark-mode persistence should have a deterministic initial render fallback.
- Header and footer markup should remain semantic enough to reuse in a future server-rendered route.
- Mobile menu markup should degrade to accessible links if JavaScript fails where practical.
- Keep tree fetching and rendering boundaries clear so a future SSR pass can render the same `SitePageTree` shape.
- Do not introduce client-only data dependencies that would block a future server render.
- A future SSR PRD should own route-level rendering, cache behavior, and Worker response shape.

## Implementation Decisions

| ID     | Decision                                                 | Reason                                                                               | Evidence                                      |
| ------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------- |
| PSC-D1 | Keep this as public renderer work.                       | The request changes public chrome, not stored records or generated admin surfaces.   | `src/app/site-renderer/renderer.tsx`          |
| PSC-D2 | Use seeded header placements as the only nav source.     | Header links are content data; injected Home duplicates seed data.                   | `schema/apps/site/seed-records.json`          |
| PSC-D3 | Keep Header and Footer as block renderers.               | Current public tree already projects them as nested blocks.                          | `src/site/tree.ts`, `src/app.test.tsx`        |
| PSC-D4 | Add a small public Site theme controller if needed.      | Dark mode should stay scoped to public pages and avoid schema/state writes.          | `lib/ui/src/global.css` supports `.dark`.     |
| PSC-D5 | Make responsive nav a renderer concern for now.          | The first-release Site renderer is site-specific; no layout DSL is needed.           | `doc/roadmap.md`                              |
| PSC-D6 | Prefer semantic test hooks over brittle class snapshots. | Chrome behavior is the contract; exact utility classes can change.                   | Existing public renderer tests in `app.test`. |
| PSC-D7 | Keep footer content data-driven.                         | Footer groups and links already live in seed records.                                | `schema/apps/site/seed-records.json`          |
| PSC-D8 | Defer SSR but keep chrome SSR-compatible.                | Client rendering is acceptable now, but public Site markup should not close off SSR. | User direction 2026-05-12                     |
| PSC-D9 | Treat Kent C. Dodds' site as a style reference only.     | It clarifies tone and information architecture without copying a brand.              | `https://kentcdodds.com/`                     |

### Deep Modules

- **Public Site theme controller:** owns theme preference resolution, persistence, and toggle state behind a small hook or component interface.
- **Public Site nav partitioner:** given ordered header placements, returns the first visible item and overflow items for responsive rendering.

These modules should stay small and renderer-local unless another public Site renderer needs them.

## Testing Decisions

- Test public chrome through rendered markup, not internal helper call order.
- Renderer tests should assert no hard-coded brand/home link is injected.
- Renderer tests should assert seeded Home still renders when it exists in seed data.
- Renderer tests should assert preview links still use `/pages/*`.
- Renderer tests should assert published links still use top-level paths.
- Renderer tests should assert mobile overflow excludes the first nav item if semantic hooks make this practical.
- Renderer tests should assert the dark toggle renders in public Site header.
- Renderer tests should assert footer keeps sections and external links while dropping the heavy background.
- Renderer tests should keep server-rendered markup deterministic when browser APIs are unavailable.
- Existing unknown-block and media-rendering tests should keep passing.
- Browser smoke should open `/pages/home` after implementation.
- Browser smoke should check desktop and mobile viewport behavior.
- Browser smoke should toggle dark mode and confirm the page remains readable.

## Chunks

| ID     | Status  | Depends on | Main files          | Acceptance                                                                                                               |
| ------ | ------- | ---------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| PSC-01 | ready   | none       | renderer, app tests | Header renders seeded nav only, removes injected home/brand link, adds end-aligned dark toggle, and handles mobile menu. |
| PSC-02 | planned | PSC-01     | renderer, app tests | Footer uses subtle top border, no dedicated background, and readable light/dark text while keeping nested sections.      |
| PSC-03 | planned | PSC-02     | browser smoke, PRD  | `/pages/home` desktop/mobile smoke passes; dark toggle smoke passes; PRD status and evidence are updated.                |

## Out of Scope

- Do not change Site storage shape.
- Do not change Site source schema.
- Do not change snapshot export or restore.
- Do not add a global app theme system.
- Do not add a general layout DSL.
- Do not add a visual page builder.
- Do not change generated admin navigation.
- Do not change Header/Footer from data blocks into hard-coded app shell chrome.
- Do not implement seed promotion or deploy workflow in this PRD.
- Do not implement SSR.
- Do not add public route caching.
- Do not add a blog index redesign.
- Do not copy Kent C. Dodds' branding, illustrations, mascot, copy, or layout wholesale.

## Promote after ship

- `doc/current.md`: note public Site header uses seeded nav only, has a scoped dark-mode toggle, and mobile collapses to first nav item plus menu.
- `doc/current.md`: note public Site footer uses inherited background with subtle top border.
- `doc/roadmap.md`: update only if the first-release target needs explicit public chrome polish language.

## Evidence

- 2026-05-12: PRD created from user direction to polish public Site header/footer before editing workflow work.
- 2026-05-12: Added Kent C. Dodds style reference and SSR compatibility guidance; SSR remains deferred.
