## Context

Core media currently spans `src/media/core.ts`, `src/media/r2.ts`, `src/client/media.ts`, `src/worker/media.ts`, generated field controls, Site rendering, and archive/publish flows. The behavior is already stable: image assets are instance-owned, app records remain flat, and Site stores only usage metadata such as alt text, caption, dimensions, crop, slot, focal point, or fallback hrefs.

Formless has one package under `lib/ui`, but no repeatable convention for extracting capability slices. Media is the first candidate because its contract crosses app, client, Worker, archive, and future provider work without requiring a schema or record redesign.

## Goals / Non-Goals

**Goals:**

- Define a repeatable package-slice convention for future extractions.
- Create `lib/media` as the pilot package shape.
- Put Media's versioned public contract in `lib/media/src/types.ts`.
- Expose only public package subpaths for runtime-neutral, client, React, and Worker usage.
- Preserve existing user-visible image upload, list, restore, delivery, generated media field, Site rendering, and archive behavior.
- Keep package tests fast, deterministic, and local.

**Non-Goals:**

- No media library management UI.
- No video support.
- No archive format redesign.
- No app schema model redesign.
- No provider-specific URL exposure in Site or other app records.
- No broad extraction beyond Media and the convention needed to make Media repeatable.

## Decisions

### Package slices are capability boundaries

Use `lib/<package>` for reusable capability slices, not only full vertical app slices. Media crosses app records, client HTTP, Worker storage, archive, and React field controls, so it is a capability slice.

Alternative: wait for a full vertical app extraction. That would delay useful package contracts because Media is not an app and does not own app records.

### Package slices have a small public surface

A package slice keeps its source under `lib/<package>/`, with one package-local `CONTEXT.md`, one `package.json`, one `tsconfig.json`, and `src/` public entrypoints. `CONTEXT.md` names ownership, non-ownership, source map, read path, and test rules. Versioned contract details live beside exported declarations in `src/types.ts`.

Package exports expose only documented public entrypoints. The root export is runtime-neutral. Optional adapter subpaths split browser/client HTTP, React-specific controls, and Worker/runtime adapters. External runtime code imports only those public exports and does not deep-import unexported package internals.

Package tests stay inside the package, use fake providers or stores with fixed ids and clocks, and avoid live networks, Cloudflare APIs, dev servers, and browser smoke unless app-visible behavior changes.

### `types.ts` is the public versioned contract

`lib/media/src/types.ts` owns documented exported types and constants for media assets, upload/list/restore shapes, storage keys, metadata invariants, delivery facts, and provider seams. It avoids imports unless impractical and must not import runtime code.

Alternative: keep contract docs in `CONTEXT.md`. That makes the contract less discoverable to TypeScript consumers and easier to drift from exported types.

### Public subpaths define runtime boundaries

The Media package exposes:

- `@dpeek/formless-media`: runtime-neutral pure helpers plus public type re-exports.
- `@dpeek/formless-media/client`: browser/client HTTP adapters with no React.
- `@dpeek/formless-media/react`: package-specific React picker, upload, preview, and broken-asset controls.
- `@dpeek/formless-media/worker`: Worker/runtime adapters and provider store adapters with no React.

External consumers do not deep-import unexported package internals.

Alternative: export one broad root entrypoint. That makes client, React, and Worker dependencies easier to mix accidentally.

### Media owns media behavior, not usage semantics

Media owns asset identity, image file validation, upload/list/restore response shapes, storage key and metadata rules, delivery facts, provider adapter seams, and media-specific UI behavior. Site and generated UI continue to own app records, field layout, commit policies, and Site usage metadata.

Alternative: move Site image semantics into Media. That would couple Media to Site record shape and block later use by other apps.

### Migrate through public imports

Implementation rewires imports from `src/media`, `src/client/media.ts`, and `src/worker/media.ts` to Media package public subpaths. Old modules can remain as compatibility shims during migration and are removed only after all imports are moved.

Alternative: move files and remove old modules immediately. That is simpler but makes partial migration riskier.

### Package tests are local contract tests

Media package tests use fake providers/stores, fixed ids, and fixed clocks. They do not call Cloudflare, live networks, a dev server, or browser smoke. Browser smoke remains app-level and runs only when visible app behavior changes.

Alternative: rely on existing app-level tests. That would keep package contract drift harder to catch and make the slice less reusable.

## Risks / Trade-offs

- Package extraction can create duplicate contracts between `core-media` and `media` specs -> keep `core-media` as behavior history and add `media` as the package ownership contract.
- Deep imports can creep back in -> package exports and import rewiring tasks require public subpaths only.
- React adapter can grow generic form layout -> generated UI retains layout and commit ownership; Media React owns only media-specific controls.
- Archive behavior can regress during import rewiring -> preserve existing archive shapes and add package tests around manifest/result contracts.
- Compatibility shims can linger -> task list requires either removal after full migration or explicit temporary compatibility with import evidence.

## Migration Plan

1. Add package-slice docs and specs.
2. Scaffold `lib/media` with package exports and local docs.
3. Move contract types/constants first, then pure helpers, then client, Worker, and React adapters.
4. Rewire imports from old `src/*` paths to public package subpaths.
5. Keep or remove old modules based on import scan evidence.
6. Add deterministic package tests and run `devstate check`.
7. Run browser smoke only if visible app behavior changes.

## Implementation Resolution

- The final import scan kept `src/media/core.ts`, `src/media/r2.ts`,
  `src/client/media.ts`, and `src/worker/media.ts` as compatibility shims.
- App, archive, Site runtime, generated UI, client, and Worker consumers import
  Media through public `@dpeek/formless-media` package subpaths.
