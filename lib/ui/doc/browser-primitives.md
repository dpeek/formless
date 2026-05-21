---
name: Formless UI Primitives
description: "Browser primitive ownership, exports, and package boundary for @dpeek/formless-ui."
last_updated: 2026-05-21
---

# Formless UI Primitives

## Read This When

- you are changing shared browser controls or layout primitives
- you need a browser-safe component that doesn't know about graph runtime state
- you are deciding whether code belongs in the UI kit, shell, or a product app

## Current Contract

`@dpeek/formless-ui` is the canonical package for reusable browser
presentation primitives. It owns controls, layout helpers, markdown rendering,
theme CSS, and small browser utility hooks.

The shared theme tokens use `.light` and `.dark` root classes. `global.css`
also declares matching `color-scheme` values so native controls and scrollbars
align with the resolved theme before product-specific React code runs.

`MarkdownRenderer` applies the shared `.graph-markdown` class and Tailwind
Typography `prose` classes by default. Consumers may pass extra classes for
layout constraints, but product apps should not redefine markdown typography
locally. Graphle-specific markdown CSS should be limited to design-token
bridging around the upstream typography rules.

Markdown rendering and editing use shared GFM parsing and the same
`.graph-markdown` document skin. `MarkdownRenderer` owns the read-only render
path. `MarkdownEditor` uses Plate's markdown deserialization as an uncontrolled
rich editor that serializes changes back to markdown strings. `MarkdownRenderer`
decorates headings with deterministic IDs for display only. Callers that already
own the page-level heading can pass `minHeadingLevel` so imported or pasted
markdown headings below that level are demoted during render, edit
initialization, and serialization.

Fenced code blocks preserve language labels, filename metadata, copy controls in
read-only mode, plain-code fallbacks, and syntax highlighting. The markdown
highlighting stack intentionally keeps both `lowlight` and direct
`highlight.js/lib/languages/*` imports: Plate consumes a Lowlight instance for
editor syntax leaves, while Lowlight core needs explicit Highlight.js grammar
registration for the supported language set.

Non-markdown source editing is intentionally plain. `SourcePreviewFieldEditor`
owns the source/preview shell, and `SourceEditor` provides the shared
textarea-backed source control used by SVG editing. The source editor preserves
stable attributes such as `data-web-svg-source="textarea"` for tests and
debugging. The package has no Monaco dependency or `./monaco` subpath.

The package exports source-level component subpaths such as
`@dpeek/formless-ui/button`, `@dpeek/formless-ui/badge`, and
`@dpeek/formless-ui/markdown`. The root export re-exports the same primitive
surface for packages that prefer a single import.
