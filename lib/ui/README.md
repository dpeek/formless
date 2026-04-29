# Graphle Web UI

`@formless/ui` owns the shared browser primitives and editor chrome
used by browser shells and product-specific web surfaces.

## Package Docs

- [`./doc/browser-primitives.md`](./doc/browser-primitives.md): primitive
  ownership, export surface, and package boundaries.

## What It Owns

- reusable browser UI primitives and layout components
- shared Plate-backed markdown rendering/editing, plus plain source-preview
  editing for SVG and other non-markdown source controls
- shared styling, theme, and small browser utility hooks
- browser-only building blocks that do not depend on graph runtime types

Markdown editing is rich and Plate-backed. SVG source editing remains plain
text through `SourceEditor` in `@formless/ui/source-preview`; this
package does not depend on Monaco.

## What It Does Not Own

- TanStack Router pages, Worker routes, or app-specific browser composition in
  `@dpeek/graphle-app`
- graph-aware field resolvers, predicate editors, or typed graph previews in
  `@dpeek/graphle-react` and `@dpeek/graphle-module-core/react-dom`
- operator TUI code in `@dpeek/graphle-cli`

## Validation

Run `turbo check --filter=@formless/ui` from the repo root, or `bun run check` in
this package, for the package-local lint/format/type/test pass. Run
`turbo check` from the repo root before landing repo-wide changes.
