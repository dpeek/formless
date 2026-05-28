## Why

Media is a stable cross-runtime capability and a good first extraction candidate for a repeatable package-slice convention. This change defines how package contracts live in Formless and applies that convention to Media without changing user-visible media behavior.

## What Changes

- Add a package-slice convention for capability packages under `lib/<package>/`.
- Establish `lib/<package>/src/types.ts` as the pure, documented, versioned public contract.
- Establish package subpath ownership for runtime-neutral helpers, client adapters, React adapters, and Worker/runtime adapters.
- Add a `lib/media` target shape with package-local docs, public contract types, adapters, and fast local tests.
- Move Media ownership for asset contracts, image upload/list/restore result shapes, storage key invariants, delivery facts, provider adapter seam, and media-specific UI behavior into the Media package contract.
- Keep Site-specific usage metadata, generated form layout, app schema parsing, app records, and provider-specific app record URLs outside Media.
- Rewire existing runtime imports to public Media package subpaths once the package exists.
- Preserve current upload, list, restore, delivery, archive, generated media field, and Site rendering behavior.

## Capabilities

### New Capabilities

- `package-slices`: Repeatable package-slice layout, public contract, import, documentation, and test rules for Formless capability packages.
- `media`: Media package behavior, public contract ownership, adapter boundaries, and package-local UI responsibilities.

### Modified Capabilities

- `generated-ui`: Generated field editing continues to support image and media editors while media-specific picker, upload, preview, and broken-asset behavior is owned by `lib/media/src/react.tsx`.
- `authority-storage`: Authority-owned app storage remains separate from instance media storage while media restore/upload helpers move behind the Media package Worker adapter seam.
- `site-runtime`: Site public rendering continues to resolve core media assets while Site keeps only Site usage metadata.
- `site-cli-publish`: Publish, save, import, and archive workflows continue to move core media through existing archive behavior while importing Media contracts from public package subpaths.

## Impact

- Adds `openspec/specs/package-slices/spec.md` and `openspec/specs/media/spec.md` when finalized.
- Adds a future `lib/media/` package with `AGENTS.md`, `package.json`, `tsconfig.json`, `src/types.ts`, `src/index.ts`, `src/client.ts`, `src/react.tsx`, `src/worker.ts`, and package-local tests.
- Affects imports currently rooted in `src/media`, `src/client/media.ts`, and `src/worker/media.ts`.
- Affects existing Media-related tests by relocating them to package-local fast deterministic tests or keeping integration coverage at app level.
- Does not add video support, media library management UI, archive format redesign, schema redesign, or broad package extraction beyond the convention needed for Media.
