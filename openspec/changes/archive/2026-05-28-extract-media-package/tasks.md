## 1. Package-Slice Convention

- [x] 1.1 Add package-slice convention docs/specs covering capability-slice scope, minimal package docs, public contract files, adapter subpaths, import boundaries, and package-local tests.
      Evidence: updated `openspec/changes/extract-media-package/design.md` and `openspec/changes/extract-media-package/specs/package-slices/spec.md` with the package-slice scope, minimal `AGENTS.md` contract, `src/types.ts` public contract rule, public export/subpath boundary, import boundary, and package-local deterministic test rules.
      Checks: `devstate check` passed; `.devstate/status.md` reported checks ok. Browser smoke not run because this task changed only OpenSpec docs/spec artifacts.

## 2. Media Package Scaffold

- [x] 2.1 Create `lib/media/AGENTS.md`, `lib/media/package.json`, `lib/media/tsconfig.json`, and empty public source entrypoints for `types.ts`, `index.ts`, `client.ts`, `react.tsx`, and `worker.ts`.
      Evidence: created `lib/media/AGENTS.md`, `lib/media/package.json`, `lib/media/tsconfig.json`, `lib/media/src/types.ts`, `lib/media/src/index.ts`, `lib/media/src/client.ts`, `lib/media/src/react.tsx`, and `lib/media/src/worker.ts`. Left package export-map wiring for task 2.2.
      Checks: `devstate check` passed; `.devstate/status.md` reported checks ok. Browser smoke not run because this task changed only package scaffold files and OpenSpec task evidence.
- [x] 2.2 Configure package exports for root, client, React, and Worker subpaths without exposing unexported internals.
      Evidence: added `lib/media/package.json` export map entries for `@dpeek/formless-media`, `@dpeek/formless-media/client`, `@dpeek/formless-media/react`, and `@dpeek/formless-media/worker`, pointing only at the public scaffold entrypoints.
      Checks: `devstate check` passed; `.devstate/status.md` reported checks ok. Browser smoke not run because this task changed only package export metadata and OpenSpec task evidence.

## 3. Media Public Contract

- [x] 3.1 Move pure media asset, image upload/list/restore result, delivery fact, storage key, metadata invariant, and provider seam contracts into `lib/media/src/types.ts`.
      Evidence: added Media contract declarations to `lib/media/src/types.ts` for core route/storage constants, metadata keys, asset metadata, asset/delivery facts, image upload/list/restore response shapes, storage keys, and provider object-store seam types. Updated `src/media/core.ts` to import/re-export those contracts as the compatibility path and updated `src/client/media.ts` to use the moved upload/list response contracts.
      Checks: `devstate check` passed; `.devstate/status.md` reported checks ok. Browser smoke not run because behavior paths and visible app behavior were unchanged.
- [x] 3.2 Document the versioned public contract in `types.ts` and keep it free of runtime code imports.
      Evidence: documented `lib/media/src/types.ts` as the import-free versioned public Media contract, added `MEDIA_PUBLIC_CONTRACT_VERSION`, and added source-faithful comments for exported constants, asset/metadata shapes, transfer results, delivery facts, storage keys, and provider seam contracts.
      Import scan: `rg '^import' lib/media/src/types.ts` returned no matches.
      Checks: `devstate check` passed; `.devstate/status.md` reported checks ok. Browser smoke not run because this task changed only contract documentation and did not change visible app behavior.

## 4. Runtime-Neutral Helpers

- [x] 4.1 Move runtime-neutral pure media helpers into `lib/media/src/index.ts`.
      Evidence: moved image content type/extension helpers, storage key and asset id validation, metadata parse/serialize helpers, and core delivery href/key helpers into `lib/media/src/index.ts`. Updated `src/media/core.ts` to import and re-export those helpers as the compatibility path while leaving store-backed upload/list/restore/delivery functions in place for later adapter tasks.
      Checks: `devstate check` passed; `.devstate/status.md` reported checks ok. Browser smoke not run because visible app behavior was unchanged.
- [x] 4.2 Re-export public Media types from the package root without pulling client, React, Worker, R2, or Cloudflare dependencies.
      Evidence: updated `lib/media/src/index.ts` to re-export public Media contract constants and type-only public declarations from `./types.ts` beside the existing runtime-neutral pure helpers.
      Import scan: `rg 'from "\./(client|react|worker)|from "\.\./|R2|Cloudflare|fetch|FormData|React' lib/media/src/index.ts` returned no matches; root entrypoint imports and re-exports only from `./types.ts`.
      Checks: `devstate check` passed; `.devstate/status.md` reported checks ok. Browser smoke not run because this changed only package root exports and did not change visible app behavior.

## 5. Client Adapter

- [x] 5.1 Move browser/client HTTP upload, list, asset option, response parsing, and image dimension adapter exports into `lib/media/src/client.ts`.
      Evidence: moved generic image upload/list helpers, image dimensions, media asset option conversion, and upload/list response parsing into `lib/media/src/client.ts`. Kept `src/client/media.ts` as the compatibility layer for existing generated UI imports and Site-specific patch value helpers.
      Checks: `devstate check` passed; `.devstate/status.md` reported checks ok. Browser smoke not run because this moved client adapter ownership without changing visible app behavior.
- [x] 5.2 Keep the client adapter React-free and preserve existing upload/list response behavior.
      Evidence: added `lib/media/src/client.test.ts` package-local coverage for the client adapter import boundary, core image upload request/response behavior, upload parser errors, core image list request/option mapping behavior, and list parser errors.
      Import scan: `rg -n "react|generated|record-field|\\.tsx" lib/media/src/client.ts` returned no matches.
      Checks: `devstate check` passed; `.devstate/status.md` reported checks ok. Browser smoke not run because visible app behavior was unchanged.

## 6. Worker Adapter

- [x] 6.1 Move Worker media request handling, image route facts, restore/list/upload/delivery orchestration, and provider store adapter exports into `lib/media/src/worker.ts`.
      Evidence: moved core media Worker request routing, image route identity facts, multipart upload parsing, image list/upload/restore/delivery orchestration, and the R2 object-store adapter into `lib/media/src/worker.ts`. Kept `src/worker/media.ts`, `src/media/core.ts`, and `src/media/r2.ts` as compatibility shims for later import-rewire tasks.
      Checks: `devstate check` passed; `.devstate/status.md` reported checks ok. Browser smoke not run because visible app behavior was unchanged.
- [x] 6.2 Keep Worker adapter imports React-free and preserve current `/api/formless/media` route behavior.
      Evidence: added `lib/media/src/worker.test.ts` package-local coverage that reads `worker.ts` to keep the Worker adapter free of React/generated UI imports, exercises core `/api/formless/media` route matching, rejects legacy Site media routes, and uses a fake `MediaObjectStore` to verify list, read, HEAD, upload, restore, media miss, and write authorization response behavior without Cloudflare, live networks, or a dev server.
      Import scan: `rg -n "from .*react|from .*tsx|React|generated|record-field|\\.tsx" lib/media/src/worker.ts` returned no matches.
      Checks: `devstate check` passed; `.devstate/status.md` reported checks ok and services running. Browser smoke not run because this added package-local Worker adapter coverage and did not change visible app behavior.

## 7. React Media Adapter

- [x] 7.1 Move only media-specific picker, upload, preview, and broken-asset UI behavior currently owned by generated media fields into `lib/media/src/react.tsx`.
      Evidence: moved the generated media field control into `lib/media/src/react.tsx`, with the media asset picker, image upload trigger, preview state, URL fallback input, and missing-image rendering owned by the Media React adapter. Updated `src/app/generated/record-field-control.tsx` to keep the generated wrapper responsible for labels, field value conversion, and editability facts before delegating to the package control. Added `lib/media/src/react.test.tsx` package-local render coverage for resolved asset preview, broken asset display, and manual URL fallback.
      Import scan: `rg -n "from .*generated|record-field|client/media|shared/|\\.\\./\\.\\./src" lib/media/src/react.tsx lib/media/src/react.test.tsx` returned no matches.
      Checks: `devstate check` passed; `.devstate/status.md` reported checks ok and services running. Browser smoke not run because visible app behavior was intended to remain unchanged.
- [x] 7.2 Keep generic generated form layout, labels, validation placement, and commit policy in generated UI.
      Evidence: moved generated media field label, `TextField`, `FieldError`, and URL commit-policy decisions into `src/app/generated/record-field-control.tsx`; kept `lib/media/src/react.tsx` focused on media picker, upload trigger, preview, broken-asset, select, and URL input events. Added package and generated UI coverage in `lib/media/src/react.test.tsx` and `src/app/generated/record-field-control.test.tsx`.
      Checks: `devstate check` passed; `.devstate/status.md` reported checks ok and services running. Browser smoke not run because the task preserved visible media field behavior while moving generic generated UI ownership back to generated code.

## 8. Import Rewiring

- [x] 8.1 Rewire imports from `src/media`, `src/client/media.ts`, and `src/worker/media.ts` to public Media package subpaths.
      Evidence: added the root `@dpeek/formless-media` workspace dependency and lock entry; rewired the compatibility shims in `src/media/core.ts`, `src/media/r2.ts`, `src/client/media.ts`, and `src/worker/media.ts` to package root/client/Worker public subpaths; rewired runtime and generated UI consumers in `src/shared/archive.ts`, `src/shared/archive-restore-plan.ts`, `src/site/archive-workflows.ts`, `src/site/project-archive.ts`, `src/site/project-source.ts`, `src/site/source-media.ts`, `src/site/tree.ts`, `src/worker/archive-api.ts`, `src/worker/archive-restore.ts`, `src/worker/index.ts`, `src/app/generated/record-field-authoring.ts`, `src/app/generated/record-field-control.tsx`, `src/app/generated/record-field-editor.tsx`, and related generated UI tests away from old Media paths. Moved the generated upload patch helper into generated field authoring so generated UI no longer imports the old client media shim for patch behavior.
      Import scan: `rg -n "from ['\"][^'\"]*(\\.\\./media/core|\\.\\./media/r2|\\.\\./client/media|\\.\\./worker/media|\\./media\\.ts|\\./core\\.ts|\\./r2\\.ts|lib/media/src)" src scripts lib schema --glob '!node_modules' --glob '!*.test.ts' --glob '!*.test.tsx'` returned only local Site renderer `./media.tsx` imports and no old `src/media`, `src/client/media.ts`, `src/worker/media.ts`, or `lib/media/src` import paths.
      Checks: `devstate check` passed after refreshing the service graph for the new workspace dependency; `.devstate/status.md` reported checks ok and services running. Browser smoke not run because this task changed imports only and preserved visible media behavior.
- [x] 8.2 Rewire archive, Site runtime, generated UI, client, and Worker consumers without deep-importing unexported package files.
      Evidence: verified archive, Site runtime, generated UI, client, and Worker consumers use `@dpeek/formless-media`, `@dpeek/formless-media/client`, `@dpeek/formless-media/react`, or `@dpeek/formless-media/worker` public package subpaths. No implementation file still imports old `src/media`, `src/client/media.ts`, `src/worker/media.ts`, or unexported `lib/media/src` paths.
      Import scan: `rg -n "['\"](?:@dpeek/formless-media/(?:src|types|index)|lib/media/src|(?:\.\./)*(?:src/)?(?:media/(?:core|r2)|client/media|worker/media)(?:\.ts)?|(?:\.\./)*(?:lib/media/src)[^'\"]*)['\"]" src lib scripts schema openspec --glob '!node_modules'` returned no matches.
      Checks: `devstate check` passed; `.devstate/status.md` reported checks ok and services running. Browser smoke not run because this task changed only OpenSpec task evidence and verified existing import wiring.

## 9. Compatibility Cleanup

- [x] 9.1 Preserve old modules as compatibility shims or remove them only after all imports are migrated.
      Evidence: preserved `src/media/core.ts`, `src/media/r2.ts`, `src/client/media.ts`, and `src/worker/media.ts` as explicit compatibility shims that point new code to public `@dpeek/formless-media` package subpaths. Kept the old modules because `src/media/core.test.ts`, `src/client/media.test.ts`, and `src/worker/media.test.ts` still exercise the compatibility surface; no app/runtime consumer removal was required for this task.
      Import check: `rg -n "from ['\"]\./core|from ['\"]\./r2|from ['\"]\./media|from ['\"]\.\./media/(?:core|r2)|from ['\"]\.\./client/media|from ['\"]\.\./worker/media" src lib --glob '!node_modules'` returned only compatibility tests plus unrelated Site renderer local `./media.tsx` imports.
      Checks: `devstate check` passed; `.devstate/status.md` reported checks ok and services running. Browser smoke not run because visible app behavior was unchanged.
- [x] 9.2 Record import scan evidence showing no remaining unplanned imports from old Media paths.
      Evidence: recorded current import scan results for the preserved old Media paths. `src/media/core.ts`, `src/media/r2.ts`, `src/client/media.ts`, and `src/worker/media.ts` remain compatibility shims from task 9.1; no app/runtime consumer imports those old paths, and no consumer deep-imports unexported `lib/media/src` files.
      Import scan: `rg -n "from ['\"][^'\"]*(?:\.\.?/)*(?:media/(?:core|r2)|client/media|worker/media)(?:\.ts)?['\"]" src lib scripts schema --glob '!node_modules'` returned no matches.
      Deep import scan: `rg -n "(?:import|export) .*from ['\"](?:@dpeek/formless-media/(?:src|types|index)|[^'\"]*lib/media/src)[^'\"]*['\"]" src lib scripts schema --glob '!node_modules'` returned no matches.
      Shim-only scan: `rg -n "(?:from|import\() ['\"](?:\.\/core|\.\/r2|\.\/media|\.\.\/media\/(?:core|r2)|\.\.\/client\/media|\.\.\/worker\/media)(?:\.ts)?['\"]" src lib --glob '!node_modules'` returned only compatibility test coverage in `src/media/core.test.ts`, `src/client/media.test.ts`, and `src/worker/media.test.ts`.
      Checks: `devstate check` passed; `.devstate/status.md` reported checks ok and services running. Browser smoke not run because this task changed only OpenSpec task evidence and import-scan verification.

## 10. Package Tests

- [x] 10.1 Add fast deterministic Media package tests for contract helpers, storage key validation, metadata parsing, upload/list/restore result behavior, client response parsing, and Worker provider seam behavior.
      Evidence: added `lib/media/src/index.test.ts` for runtime-neutral content type helpers, storage key and asset id validation, restorable key checks, media metadata parse/serialize behavior, and core delivery href/key helpers. Extended `lib/media/src/worker.test.ts` for package-local upload/list/restore/delivery result contracts and deterministic write errors through the `MediaObjectStore` seam. Existing `lib/media/src/client.test.ts` covers client upload/list response parsing, and existing `lib/media/src/worker.test.ts` covers route handling with fake stores.
      Checks: `devstate check` passed; `.devstate/status.md` reported checks ok and services running. Browser smoke not run because this slice added package-local tests and a deterministic test injection seam without changing visible app behavior.
- [x] 10.2 Use fake providers/stores, fixed clocks, and fixed ids; do not call live networks, Cloudflare APIs, or a dev server.
      Evidence: added optional `randomId` injection to `lib/media/src/worker.ts` so package-local Worker route tests use fixed `asset-fixed` ids. Media package tests use fake fetchers, fake in-memory `MediaObjectStore` providers, fixed byte payloads, fixed multipart boundaries, and no clocks. Determinism scan `rg -n "randomUUID|Math\\.random|Date\\.|new Date|fetch\\(|Miniflare|createWorkerHarness|R2Bucket|dev server|localhost" lib/media/src/*.test.ts lib/media/src/*.test.tsx` returned no matches.
      Checks: `devstate check` passed; `.devstate/status.md` reported checks ok and services running. Browser smoke not run because this slice did not change visible app behavior.

## 11. Docs And Promotion Notes

- [x] 11.1 Update `lib/media/AGENTS.md` with package ownership, non-ownership, map, read path, and test rules.
      Evidence: updated `lib/media/AGENTS.md` to record Media package ownership, non-ownership, package map, compatibility shims, package read path, public subpath import rule, and package-local deterministic test rules.
      Checks: `devstate check` passed; `.devstate/status.md` reported checks ok and services running. Browser smoke not run because this slice changed package documentation and OpenSpec task evidence only.
- [x] 11.2 Update this change with promotion notes for package-slice and Media shipped facts.
      Evidence: added promotion notes below for finalization, grounded in `openspec/changes/extract-media-package/specs/package-slices/spec.md`, `openspec/changes/extract-media-package/specs/media/spec.md`, `lib/media/AGENTS.md`, `lib/media/package.json`, `lib/media/src/types.ts`, `lib/media/src/index.ts`, `lib/media/src/client.ts`, `lib/media/src/react.tsx`, `lib/media/src/worker.ts`, and package-local tests.
      Promotion notes: - Package slices are reusable capability boundaries under `lib/<package>/`. A package slice has package-local `AGENTS.md`, `package.json`, `tsconfig.json`, and public `src/` entrypoints; `src/types.ts` is the import-free versioned public contract; root exports stay runtime-neutral; adapter subpaths split client, React, and Worker/runtime ownership; external runtime code imports only package roots or documented subpaths; package tests are local, deterministic, and use fake providers or stores. - Media is extracted as `@dpeek/formless-media` under `lib/media/` with public exports for `.`, `./client`, `./react`, and `./worker`. `src/types.ts` owns Media contract constants and shapes for image assets, upload/list/restore responses, delivery facts, storage keys, metadata invariants, and provider object-store seams. - The Media root entrypoint exposes runtime-neutral helpers for image content type/extension handling, storage key and asset id validation, metadata parse/serialize behavior, and delivery href/key facts without importing client, React, Worker, R2, or Cloudflare code. - The Media client adapter owns browser image upload/list HTTP behavior, response parsing, asset option conversion, and image dimension reading without importing React. - The Media React adapter owns media-specific asset selection, upload trigger, preview, missing-image display, and URL fallback input behavior. Generated UI keeps generic labels, layout, validation placement, field value conversion, and commit policy. - The Media Worker adapter owns `/api/formless/media` route matching, upload/list/restore/delivery orchestration, image route facts, write authorization handoff, and provider object-store adapter behavior without importing React. Media objects and provider metadata remain outside Authority app records. - Archive, Site runtime, generated UI, client, and Worker consumers import Media behavior through `@dpeek/formless-media` public package subpaths. Old `src/media/core.ts`, `src/media/r2.ts`, `src/client/media.ts`, and `src/worker/media.ts` remain compatibility shims with no app/runtime consumers required to deep-import `lib/media/src/*`. - Package-local tests under `lib/media/src/` cover contract helpers, storage key validation, metadata parsing, upload/list/restore result behavior, client response parsing, React media controls, and Worker provider seam behavior using fake fetchers/stores and fixed ids/payloads.
      Checks: `devstate check` passed; `.devstate/status.md` reported checks ok and services running. Browser smoke not run because this slice changed package documentation and OpenSpec task evidence only.

## 12. Verification

- [x] 12.1 Run `devstate check` and read `./.devstate/status.md`; fix any red status before finishing.
      Evidence: `devstate check` passed; `./.devstate/status.md` reported checks ok and services running.
- [x] 12.2 Run browser smoke only if visible app behavior changed, and record the evidence when it is required.
      Evidence: Browser smoke not run because this verification section changed only OpenSpec task evidence and did not change visible app behavior.

## Finalization

Status: finalized for review; OpenSpec change not archived.

Evidence:

- `openspec instructions apply --change "extract-media-package" --json` reported
  `state: all_done` with 23/23 tasks complete.
- `git rebase main` reported the branch was up to date.
- Promoted shipped facts into `openspec/specs/package-slices/spec.md`,
  `openspec/specs/media/spec.md`,
  `openspec/specs/authority-storage/spec.md`,
  `openspec/specs/generated-ui/spec.md`,
  `openspec/specs/site-cli-publish/spec.md`, and
  `openspec/specs/site-runtime/spec.md`.
- `devstate check` passed; `.devstate/status.md` reported checks ok and
  services running.
- Browser smoke not run because finalization changed only OpenSpec specs and
  owning change artifacts.
