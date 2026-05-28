## 1. Package-Slice Convention

- [ ] 1.1 Add package-slice convention docs/specs covering capability-slice scope, minimal package docs, public contract files, adapter subpaths, import boundaries, and package-local tests.

## 2. Media Package Scaffold

- [ ] 2.1 Create `lib/media/CONTEXT.md`, `lib/media/package.json`, `lib/media/tsconfig.json`, and empty public source entrypoints for `types.ts`, `index.ts`, `client.ts`, `react.tsx`, and `worker.ts`.
- [ ] 2.2 Configure package exports for root, client, React, and Worker subpaths without exposing unexported internals.

## 3. Media Public Contract

- [ ] 3.1 Move pure media asset, image upload/list/restore result, delivery fact, storage key, metadata invariant, and provider seam contracts into `lib/media/src/types.ts`.
- [ ] 3.2 Document the versioned public contract in `types.ts` and keep it free of runtime code imports.

## 4. Runtime-Neutral Helpers

- [ ] 4.1 Move runtime-neutral pure media helpers into `lib/media/src/index.ts`.
- [ ] 4.2 Re-export public Media types from the package root without pulling client, React, Worker, R2, or Cloudflare dependencies.

## 5. Client Adapter

- [ ] 5.1 Move browser/client HTTP upload, list, asset option, response parsing, and image dimension adapter exports into `lib/media/src/client.ts`.
- [ ] 5.2 Keep the client adapter React-free and preserve existing upload/list response behavior.

## 6. Worker Adapter

- [ ] 6.1 Move Worker media request handling, image route facts, restore/list/upload/delivery orchestration, and provider store adapter exports into `lib/media/src/worker.ts`.
- [ ] 6.2 Keep Worker adapter imports React-free and preserve current `/api/formless/media` route behavior.

## 7. React Media Adapter

- [ ] 7.1 Move only media-specific picker, upload, preview, and broken-asset UI behavior currently owned by generated media fields into `lib/media/src/react.tsx`.
- [ ] 7.2 Keep generic generated form layout, labels, validation placement, and commit policy in generated UI.

## 8. Import Rewiring

- [ ] 8.1 Rewire imports from `src/media`, `src/client/media.ts`, and `src/worker/media.ts` to public Media package subpaths.
- [ ] 8.2 Rewire archive, Site runtime, generated UI, client, and Worker consumers without deep-importing unexported package files.

## 9. Compatibility Cleanup

- [ ] 9.1 Preserve old modules as compatibility shims or remove them only after all imports are migrated.
- [ ] 9.2 Record import scan evidence showing no remaining unplanned imports from old Media paths.

## 10. Package Tests

- [ ] 10.1 Add fast deterministic Media package tests for contract helpers, storage key validation, metadata parsing, upload/list/restore result behavior, client response parsing, and Worker provider seam behavior.
- [ ] 10.2 Use fake providers/stores, fixed clocks, and fixed ids; do not call live networks, Cloudflare APIs, or a dev server.

## 11. Docs And Promotion Notes

- [ ] 11.1 Update `lib/media/CONTEXT.md` with package ownership, non-ownership, map, read path, and test rules.
- [ ] 11.2 Update this change with promotion notes for package-slice and Media shipped facts.

## 12. Verification

- [ ] 12.1 Run `devstate check` and read `./.devstate/status.md`; fix any red status before finishing.
- [ ] 12.2 Run browser smoke only if visible app behavior changed, and record the evidence when it is required.
