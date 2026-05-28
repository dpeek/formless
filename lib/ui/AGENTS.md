# Formless UI Agents

Package scope: `@dpeek/formless-ui`.

Read this when editing `lib/ui/*`.

## Owns

- Shared browser UI primitives.
- Shared editor chrome.
- Plate-backed Markdown render/edit parts.
- Plain source preview/edit controls.
- Browser-only utilities and styling.
- Shared theme tokens through `.light` and `.dark` root classes.
- `global.css` `color-scheme` values for native controls and scrollbars.

## Does Not Own

- App routes in `src/app`.
- Worker routes in `src/worker`.
- Runtime schema parsing in `src/shared`.
- Product-specific Site behavior in `src/site` or `src/app/site-renderer`.

## Map

- `lib/ui/src/index.ts`: public exports.
- `lib/ui/src/*`: primitives and component tests.
- `lib/ui/src/markdown*`: Markdown editor and renderer.
- `lib/ui/src/source-preview.tsx`: plain source preview editor.

## Rules

- Keep components browser-only.
- Do not import runtime schema or Worker modules.
- Keep public exports explicit.
- Match existing primitive style.
- Prefer package-local tests beside changed primitive.
- During normal agent work, use repo `devstate`; do not run package checks manually unless user asks.

## Primitive Rules

- `@dpeek/formless-ui` is canonical home for reusable browser presentation primitives.
- Own controls, layout helpers, Markdown rendering, theme CSS, and small browser utility hooks here.
- Keep IntentUI-derived modules source-faithful.
- Exception: icons map through `icons.ts` to Lucide-backed aliases.
- Do not add upstream icon packages only to keep copied modules byte-identical.
- Keep local icon drift concentrated in `icons.ts`.
- Keep copied primitive files different only where they import mapped aliases.

## Markdown Rules

- `MarkdownRenderer` owns read-only Markdown render path.
- `MarkdownEditor` owns rich Markdown edit path.
- Both use shared GFM parsing and `.graph-markdown` document skin.
- `MarkdownRenderer` applies `.graph-markdown` and Tailwind Typography `prose` classes by default.
- Consumers may pass layout classes.
- Product apps should not redefine Markdown typography locally.
- Graphle-specific Markdown CSS stays limited to design-token bridging around upstream typography rules.
- Heading IDs are deterministic and display-only.
- Callers with page-level headings may pass `minHeadingLevel`.
- `minHeadingLevel` demotes imported or pasted headings during render, edit init, and serialization.
- Fenced code blocks preserve language labels, filename metadata, copy controls, plain-code fallback, and syntax highlighting.
- Keep both `lowlight` and direct `highlight.js/lib/languages/*` imports.
- Plate consumes Lowlight for editor syntax leaves.
- Lowlight core needs explicit Highlight.js grammar registration for supported languages.

## Source Edit Rules

- Non-Markdown source editing stays plain.
- `SourcePreviewFieldEditor` owns source/preview shell.
- `SourceEditor` owns shared textarea-backed source control used by SVG editing.
- Preserve stable debug/test attrs such as `data-web-svg-source="textarea"`.
- No Monaco dependency.
- No `./monaco` subpath.

## Export Rules

- Export source-level component subpaths such as `@dpeek/formless-ui/button`, `@dpeek/formless-ui/badge`, and `@dpeek/formless-ui/markdown`.
- Root export re-exports same primitive surface for packages that prefer one import.
