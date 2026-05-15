# PRD 31: Site media upload

Status: complete
Current chunk: none
Last updated: 2026-05-15

## Goal

Add the first Site media upload slice.

The first version should:

- upload one raster image from the Site authoring UI;
- store the original image object in Cloudflare R2;
- serve the image through a same-origin Worker route;
- patch the existing flat image block fields;
- render the uploaded image in the editor and public Site;
- keep public Site tree and block composition shapes unchanged.

This PRD owns Site image upload for authoring.
It does not own a general media library, video upload, file upload, image transforms, cropping, or asset cleanup.

## Problem Statement

The Site app already models image media as `block` records with `type = image`.
Image blocks already have flat `href`, `width`, and `height` fields.
The public Site renderer already renders image blocks from `href`.

The missing authoring slice is upload.
Authors can paste a URL into an image block, but they cannot choose an image file, put it in durable object storage, and see the resulting media in the editor and public page.

The first release needs enough media support to author a personal Site without manually hosting images elsewhere.

## Solution

Keep image records flat.
Use the existing image block as the content record.
Add a Site-specific image upload path that stores the file in R2 and returns a same-origin media URL.
The generated Site image editor patches that URL into `block.href` and, when available, patches `width` and `height`.

Public rendering keeps using the Site tree projection.
The tree still projects `href`, `width`, and `height` from block records.
The public renderer still renders an image block from those fields.

## Source Map

Existing anchors:

- Current runtime docs: `doc/current.md`.
- Release target docs: `doc/roadmap.md`.
- Site source schema: `schema/apps/site/schema.json`.
- Site seed records: `schema/apps/site/seed-records.json`.
- Site tree projection: `src/site/tree.ts`.
- Public Site renderer: `src/app/site-renderer/renderer.tsx`.
- Public Site route: `src/app/routes/site-page.tsx`.
- Worker entrypoint: `src/worker/index.ts`.
- Authority admin guard: `src/worker/authority-admin-guard.ts`.
- Client sync and mutation path: `src/client/sync.ts`.
- Field behavior module: `src/shared/field-types.ts`.
- Field schema types: `src/shared/schema-types.ts`.
- Generated field UI adapter: `src/app/generated/field-ui-adapters.ts`.
- Generated inline field editor: `src/app/generated/record-field-editor.tsx`.
- Generated create renderer: `src/app/generated/create.tsx`.
- Worker config: `wrangler.jsonc`.
- Worker tests: `src/worker/authority.test.ts`, `src/worker/authority-admin-guard.test.ts`.
- Public renderer tests: `src/app.test.tsx`, `src/site/tree.test.ts`.

Owned files:

- `prd/31-site-media-upload.md`.

Likely changed files:

- `doc/roadmap.md`.
- `wrangler.jsonc`.
- `src/worker/index.ts`.
- `src/worker/media.ts`.
- `src/worker/miniflare-test.ts`.
- `src/shared/schema-types.ts`.
- `src/shared/field-types.ts`.
- `src/shared/field-types.test.ts`.
- `src/app/generated/field-ui-adapters.ts`.
- `src/app/generated/field-ui-adapters.test.ts`.
- `src/app/generated/record-field-editor.tsx`.
- `src/app/generated/create.tsx`.
- `src/client/media.ts`.
- `schema/apps/site/schema.json`.
- `src/shared/schema.test.ts`.
- `src/worker/schema-apps.test.ts`.
- `src/site/tree.test.ts`.
- `src/app.test.tsx`.

Possible changed files:

- `lib/ui/src/image-upload.tsx`.
- `lib/ui/src/index.ts`.
- `lib/ui/package.json`.

## User Stories

1. As a Site author, I want to upload an image file from an image block editor, so that I do not need to host images manually.
2. As a Site author, I want uploaded images to persist outside browser storage, so that they survive browser resets and publish flows.
3. As a Site author, I want uploaded images to appear in the editor after upload, so that I can verify the selected image immediately.
4. As a Site author, I want uploaded images to appear on the public Site preview, so that public rendering matches authoring.
5. As a Site author, I want image blocks to be creatable before a file is uploaded, so that adding an image node is not blocked by a required URL.
6. As a Site author, I want replacing an image to leave the block label and placement intact, so that image changes do not restructure the page.
7. As a Site author, I want failed uploads to show a useful error and keep the current image, so that a bad upload does not corrupt content.
8. As a Site author, I want oversized files rejected before they become content, so that accidental large uploads do not make pages heavy.
9. As a Site author, I want non-image files rejected, so that an image block always serves image media.
10. As a Site visitor, I want uploaded images to load from the public Site route, so that pages do not depend on local development URLs.
11. As a Site visitor, I want image dimensions preserved when available, so that image layout stays stable during loading.
12. As a schema author, I want media to stay in `block` records, so that Site composition remains flat.
13. As a schema author, I want the upload editor to remain an editor hint over a text field, so that no new stored scalar type is required.
14. As a runtime developer, I want R2 writes isolated behind a small media module, so that upload validation and object serving are testable.
15. As a runtime developer, I want public media reads outside Durable Object storage, so that serving files does not involve the authority.
16. As a runtime developer, I want media upload writes to use the existing admin guard policy, so that deployed Workers can protect authoring endpoints.
17. As a runtime developer, I want media object keys to be immutable and unique, so that browser and edge caches can be long-lived.
18. As a runtime developer, I want the block patch to stay a normal mutation, so that browser replicas and public preview sync keep working.
19. As a runtime developer, I want orphaned uploaded objects to be acceptable in the first slice, so that upload can ship without a media registry.
20. As a runtime developer, I want tests to prove public image rendering did not need a new tree protocol, so that future media work does not fork the public path.

## Requirements

### Stored Records

- Site records stay flat as `block` and `blockPlacement`.
- Image media stays on `block` records.
- The first slice stores the served image URL in `block.href`.
- The first slice may patch `block.width` and `block.height` when the browser can determine image dimensions.
- The first slice does not add `mediaAsset`.
- The first slice does not add `assetKey`.
- The first slice does not add nested object fields.
- The first slice does not add array-valued fields.
- Image blocks can be created without `href`.
- Existing public image rendering handles missing `href` through the current placeholder path.

### Upload API

- Add `POST /api/site/media/images`.
- The request body is `multipart/form-data`.
- The file field name is `file`.
- The route accepts one file per request.
- The route accepts raster images only.
- Accepted MIME types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`.
- SVG upload is out of scope for this slice.
- The route rejects missing files.
- The route rejects unsupported media types.
- The route rejects files above the first-slice size limit.
- The first-slice size limit is 5 MB.
- Upload writes the original file bytes to R2.
- Upload writes immutable object keys.
- Upload object keys use a Site image prefix.
- Upload sets R2 HTTP metadata for content type and cache control.
- Upload returns JSON with at least `href`, `key`, `contentType`, and `size`.
- Upload does not create or patch a Site record by itself.
- Upload uses the same optional bearer-token policy as other authoring writes when `FORMLESS_ADMIN_TOKEN` is configured.
- Local development remains no-token when `FORMLESS_ADMIN_TOKEN` is absent.
- Source media restore uses guarded `PUT /api/site/media/site/images/*`.
- Source media restore writes bytes to the exact R2 key encoded in the route.
- Source media restore accepts the same first-slice raster image types and size limit.

### Media Serving API

- Add `GET /api/site/media/*`.
- The route reads from R2 by key.
- Missing objects return `404`.
- Successful reads stream the R2 object body.
- Successful reads set `Content-Type` from R2 metadata when available.
- Successful reads set `ETag` when available.
- Successful reads set long-lived cache headers for immutable object keys.
- Public media reads do not require admin authorization.
- Public media reads do not touch the Authority Durable Object.
- Public media reads are same-origin with public Site pages.

### Source Seed Media

- `site:pull-seed` writes source Site records and referenced same-origin media files.
- Source media files live under `schema/apps/site/media/`.
- Source media paths mirror the R2 key after `/api/site/media/`.
- `block.href = "/api/site/media/site/images/example.png"` maps to `schema/apps/site/media/site/images/example.png`.
- `site:pull-seed --check` fails when source media files are missing or stale.
- `site:publish --apply` reads referenced source media files before deploy or target mutation.
- `site:publish --apply` restores source media files to the target before snapshot restore.
- Data URLs and external media URLs stay record-only.

### Generated Authoring UI

- Add a generated image upload editor for text-backed image URL fields.
- The editor is selected by `editor: "image"` or equivalent image-editor metadata.
- The editor renders the current image preview when `href` exists.
- The editor renders an empty image state when `href` is missing.
- The editor exposes a file input or button that accepts image files.
- The editor uploads the selected file before patching the record.
- After upload, the editor patches `href` through the existing generic patch mutation.
- When dimensions are known, the editor patches `href`, `width`, and `height` together.
- A failed upload does not patch the record.
- A failed patch leaves the uploaded object orphaned in this first slice.
- The editor reuses existing generated field error and sync status patterns.
- The editor works in Site tree/detail edit surfaces.
- Existing href text editing can remain available as a fallback if the implementation keeps it compact.

### Generated Create

- Image block create does not require `href`.
- Create-time file upload is not required in the first slice.
- Authors can create an image block and upload into it after the record exists.
- Create forms still submit flat scalar values.
- Required `label` behavior remains unchanged.

### Public Site

- Public Site tree response shape does not change.
- Public image rendering keeps using `block.href`.
- Public pages load uploaded images through same-origin media URLs.
- Existing manually-authored external image URLs still render.
- Missing image URLs still render the existing placeholder state.
- Preview sync continues to work through normal record mutations.
- Published Site profile can serve uploaded media through the same Worker media route.

### Configuration

- Add an R2 bucket binding for Site media.
- Name the Worker binding `FORMLESS_MEDIA`.
- Keep bucket naming deployment-specific in Wrangler config.
- Tests can use Miniflare R2 buckets.
- The Worker Env type includes the R2 binding.

## Implementation Decisions

| ID      | Decision                                                     | Reason                                                                                       | Evidence                                                 |
| ------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| SMU-D1  | Keep image content in `block` records.                       | Site media is already represented as block variants and flat records are a core bet.         | `doc/current.md`, `schema/apps/site/schema.json`         |
| SMU-D2  | Store the served media URL in `block.href`.                  | The public tree and renderer already project and render `href` for image blocks.             | `src/site/tree.ts`, `src/app/site-renderer/renderer.tsx` |
| SMU-D3  | Do not add a media asset entity in the first slice.          | Upload can ship without changing storage shape or public tree protocol.                      | User direction 2026-05-13                                |
| SMU-D4  | Serve private R2 objects through a same-origin Worker route. | Public pages can use stable URLs without exposing a public bucket domain or CORS policy.     | `wrangler.jsonc`, Worker routes                          |
| SMU-D5  | Keep media reads outside the Authority Durable Object.       | File serving does not need record invariants, sync cursor, or Durable Object storage.        | `src/worker/index.ts`, `src/worker/authority.ts`         |
| SMU-D6  | Protect uploads with the existing admin guard policy.        | Upload creates durable content and belongs with authoring writes.                            | `src/worker/authority-admin-guard.ts`                    |
| SMU-D7  | Keep record patching separate from upload.                   | Normal mutations already drive sync, local replica merge, and public preview invalidation.   | `src/client/sync.ts`, `src/app/routes/site-page.tsx`     |
| SMU-D8  | Relax image variant `href` requiredness.                     | Authors need to create an image block before there is an uploaded URL.                       | Current Site image placeholder behavior                  |
| SMU-D9  | Accept raster images only.                                   | SVG upload has a different safety profile and icon SVGs are already covered separately.      | `prd/30-svg-icon-field-renderer-editor.md`               |
| SMU-D10 | Use immutable object keys and tolerate first-slice orphans.  | Cleanup needs a registry or reference scan; neither is needed to prove authoring upload.     | First-slice scope                                        |
| SMU-D11 | Detect dimensions in the browser, not the Worker.            | The Worker can stay a byte validator/store; browser image APIs can populate layout hints.    | Existing `width` and `height` fields                     |
| SMU-D12 | Keep manual URL support.                                     | Existing authored external image URLs and seeds should keep rendering.                       | Public renderer accepts any `href` string                |
| SMU-D13 | Parse the single upload multipart field in `media.ts`.       | The Worker route owns file validation and byte preservation before R2 writes.                | `src/worker/media.ts`, `src/worker/media.test.ts`        |
| SMU-D14 | Store seed media as sidecar files beside Site source data.   | Seed records can restore R2-backed media only if the referenced bytes are source artifacts.  | User direction 2026-05-14                                |
| SMU-D15 | Restore sidecar media by exact same-origin media key.        | Seed `block.href` values should stay stable across publish and source restore.               | `src/site/source-media.ts`, `src/worker/media.ts`        |
| SMU-D16 | Make the image well the upload trigger.                      | Image authoring should not show separate preview and native choose-file controls.            | User direction 2026-05-15                                |
| SMU-D17 | Hide image width and height from image variant authoring.    | The fields can stay flat storage and upload outputs while the editor stays focused on media. | User direction 2026-05-15                                |

### Deep Modules

- **Worker media module:** owns route matching, upload parsing, MIME and size validation, R2 key generation, R2 writes, object reads, and response headers.
- **Client media upload helper:** owns multipart upload, response parsing, file-type error messages, and optional image dimension extraction.
- **Generated image field editor:** adapts one flat text field to preview, upload, mutation patch, pending state, and error state.
- **Site image schema adapter:** keeps Site image block creation and variant field rules aligned with the flat block model.

## Testing Decisions

- Test media Worker behavior at the HTTP boundary.
- Worker tests should cover successful upload, unsupported MIME rejection, oversized file rejection, missing file rejection, public object read, and missing object `404`.
- Worker tests should verify upload authorization when `FORMLESS_ADMIN_TOKEN` is configured.
- Worker tests should verify public media reads stay unauthenticated.
- Client upload helper tests should cover response parsing and dimension extraction behavior where practical.
- Field behavior tests should assert the image editor is valid for text fields and invalid for non-text fields.
- Generated adapter tests should assert image editor metadata selects the image upload control.
- Generated UI tests should assert image upload patches `href` and optional dimensions through the generic mutation path.
- Schema parser tests should assert Site image variants no longer require `href`.
- Site tree tests should assert uploaded-style media URLs project through unchanged.
- Public renderer tests should assert uploaded-style media URLs render in `<img src>`.
- Browser smoke should cover `/site` image upload UI and `/pages/home` public image rendering when behavior changes.
- Use `devstate check` as final check evidence.
- Do not run raw `bun test`, `bun check`, `vp test`, or `vp check` manually during normal agent work.

## Chunks

| ID     | Status | Depends on | Main files                         | Acceptance                                                                                      |
| ------ | ------ | ---------- | ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| SMU-01 | done   | none       | docs, PRD                          | Release roadmap includes Site image upload; PRD defines scope, contracts, chunks, and tests.    |
| SMU-02 | done   | SMU-01     | Worker media routes, config, tests | R2 upload and serving routes work in Miniflare and respect upload auth/public read rules.       |
| SMU-03 | done   | SMU-02     | client upload, generated editor    | Site image field can upload, preview, and patch flat block fields through existing mutations.   |
| SMU-04 | done   | SMU-03     | Site schema, renderer tests        | Image blocks can be created before upload; public Site renders uploaded media URLs unchanged.   |
| SMU-05 | done   | SMU-04     | browser smoke, PRD                 | `/site` authoring and `/pages/home` public preview pass; PRD evidence and promotion notes land. |

### SMU-01: Roadmap and PRD

Tasks:

- Move Site image upload into first-release roadmap scope.
- Remove generic media upload from the out-of-scope list.
- Add this PRD with first-slice contracts and chunk boundaries.

Acceptance:

- `doc/roadmap.md` names Site image upload as first-release scope.
- `doc/roadmap.md` keeps general media library, video upload, file upload, transforms, and cleanup out of first release.
- This PRD is ready for implementation.

### SMU-02: Worker R2 upload and serve routes

Tasks:

- Add the R2 binding to Worker Env and Wrangler config.
- Add a focused media route module.
- Route Site media requests before normal Authority dispatch.
- Implement `POST /api/site/media/images`.
- Implement `GET /api/site/media/*`.
- Add Miniflare R2 bucket support to the worker harness.
- Add worker tests for upload, serve, validation, and auth.

Acceptance:

- A valid raster image upload returns a same-origin `href`.
- The returned `href` serves the uploaded bytes.
- Invalid uploads fail before R2 write.
- Uploads are guarded when `FORMLESS_ADMIN_TOKEN` is configured.
- Public media reads stay open.

### SMU-03: Generated image upload editor

Tasks:

- Add image editor metadata to field schema and field behavior.
- Add a client upload helper for image files.
- Add preview, file input, pending, and error UI for generated image fields.
- Patch `href`, `width`, and `height` after upload when dimensions are available.
- Keep manual URL behavior available or provide a clear fallback path.
- Add generated UI and field behavior tests.

Acceptance:

- Image block editors show the current image preview.
- Uploading a valid file patches the image block through the existing mutation endpoint.
- Failed uploads do not patch the record.
- Other text editors keep existing behavior.

### SMU-04: Site schema and public rendering integration

Tasks:

- Update Site image variant authoring metadata to use the image upload editor.
- Relax image variant required fields so `href` is not required at create time.
- Keep image label required.
- Add tests proving Site tree and renderer behavior use the existing `href` path.
- Preserve existing seeded image behavior.

Acceptance:

- Authors can create an image block before upload.
- Public tree protocol shape is unchanged.
- Uploaded-style media URLs render as public Site images.
- Existing external image URLs still render.

### SMU-05: Smoke, evidence, and promotion notes

Tasks:

- Run `devstate check`.
- Smoke `/site` image authoring with `bun browser ...`.
- Smoke `/pages/home` public image rendering with `bun browser ...`.
- Update this PRD with status notes, evidence, blockers, and promotion notes.

Acceptance:

- `devstate check` is green.
- Browser smoke confirms editor upload UI and public image rendering.
- Promotion notes point to code, schema, and tests.

## Out of Scope

- General media library.
- Media picker.
- Media list/grid management.
- Media search.
- Video upload.
- File upload.
- SVG upload.
- Image resizing.
- Image cropping.
- Responsive image variants.
- Alt-text-specific field semantics beyond existing `label`.
- R2 object deletion.
- R2 garbage collection.
- Direct browser-to-R2 multipart upload.
- Upload progress beyond basic pending state.
- Production editor login or token management UI.
- Changing public Site tree protocol.

## Blockers

- No local implementation blockers found in SMU-05.
- R2 bucket name and deployment binding need to be chosen before live deploy.
- Deployed authoring with `FORMLESS_ADMIN_TOKEN` still needs an operator-controlled way to provide the bearer token; no product auth UI exists.

## Status Notes

- 2026-05-13: PRD created from user direction to include an initial media slice in first release, focused on Site image authoring.
- 2026-05-13: First-slice direction: upload raster image to R2, serve through same-origin Worker media route, patch existing image block fields, and keep public tree protocol unchanged.
- 2026-05-13: SMU-01 shipped. Roadmap already names Site image upload as first-release scope and keeps general media library, video upload, file upload, transforms, and cleanup out of first release. Next ready chunk is SMU-02.
- 2026-05-13: SMU-02 shipped. Worker now routes Site media before Authority dispatch, uploads one raster image to `FORMLESS_MEDIA`, serves same-origin media URLs from R2, guards uploads with the admin bearer token policy, and leaves public reads open. Next ready chunk is SMU-03.
- 2026-05-13: SMU-03 shipped. Text-backed fields now support `editor: "image"` metadata, the client can upload one Site image through `/api/site/media/images`, generated inline editors preview current image URLs, expose upload and manual URL fallback, and patch `href` plus numeric `width`/`height` when the active schema exposes those sibling fields. Next ready chunk is SMU-04.
- 2026-05-13: SMU-04 shipped. Site image variants now require only `label`, use `editor: "image"` in Site image authoring views, and tests prove uploaded-style media URLs continue through the unchanged `href` tree and public renderer path. Next ready chunk is SMU-05.
- 2026-05-13: SMU-05 shipped. Devstate is green, `/site` authoring can create an image block before upload, generated image upload patches `href`/`width`/`height`, `/pages/home` renders the uploaded same-origin media URL, and this PRD is complete.
- 2026-05-14: Follow-up scope added from user direction: pulling Site seed records must also write referenced same-origin media files to disk so publish can restore R2 objects from source artifacts.
- 2026-05-15: Image editor follow-up shipped from screenshot feedback. Generated image upload uses the image preview or empty well as the file input trigger, and Site image variant authoring hides width and height fields.

## Evidence

- `devstate start`: checks ok; watch tests pass; services running at `https://31-site-media-upload.formless.local`.
- SMU-01 acceptance: `doc/roadmap.md` includes Site image upload under Site App and Generated UI, and keeps general media library, video upload, file upload, image transforms, and media garbage collection out of first release.
- Loop status files requested at `./tmp/devstate.json`, `./tmp/test.txt`, and `./tmp/check.txt` were not present; current generated evidence is in `.devstate/status.md` and `.devstate/status.json`.
- `devstate check`: checks ok; watch tests pass; services running at `https://31-site-media-upload.formless.local`.
- SMU-02 acceptance: `src/worker/media.test.ts` covers successful upload and serve, unsupported MIME rejection, oversized rejection, missing/repeated file rejection, upload auth, unauthenticated public reads, and missing-object `404`.
- SMU-02 implementation: `src/worker/media.ts` owns `/api/site/media/images`, `/api/site/media/*`, MIME/size validation, immutable Site image keys, R2 writes, and R2 response headers.
- SMU-02 config: `wrangler.jsonc` binds `FORMLESS_MEDIA`; `src/worker/miniflare-test.ts` supports Miniflare R2 buckets.
- 2026-05-13 `devstate check`: checks ok; watch tests pass; services running at `https://31-site-media-upload.formless.local`.
- Loop status files requested at `./tmp/devstate.json`, `./tmp/test.txt`, and `./tmp/check.txt` were still not present after SMU-03; current generated evidence is in `.devstate/status.md`.
- SMU-03 field metadata: `src/shared/field-types.ts`, `src/shared/schema-types.ts`, `src/app/generated/field-ui-adapters.ts`, `src/shared/field-types.test.ts`, `src/shared/schema.test.ts`, and `src/app/generated/field-ui-adapters.test.ts`.
- SMU-03 upload helper: `src/client/media.ts` and `src/client/media.test.ts` cover multipart upload response parsing, failed upload rejection before patch, and flat `href`/dimension patch value construction.
- SMU-03 generated editor: `src/app/generated/record-field-editor.tsx` renders image preview, empty state, upload input, manual URL fallback, and uses existing `submitPatchMutation`; `src/app.test.tsx` covers generated Site image editor markup.
- 2026-05-13 final `devstate check`: checks ok; watch tests pass with 31 test files and 583 tests; services running at `https://31-site-media-upload.formless.local`.
- 2026-05-13 `bun browser`: loaded the running app at `http://127.0.0.1:4521/`; public Site rendered and browser errors were empty. The current dev server profile exposed the published Site route, so generated `/site` authoring smoke remains for SMU-05 after schema integration.
- SMU-04 schema: `schema/apps/site/schema.json` changes image variant required fields to `["label"]` and selects `editor: "image"` for image `href` fields in Site create, edit, root-detail, and tree-node authoring metadata.
- SMU-04 parser coverage: `src/shared/schema.test.ts` asserts the image variant requiredness and Site image authoring metadata.
- SMU-04 create coverage: `src/app.test.tsx` asserts generated Site image create values can resolve without an uploaded `href`.
- SMU-04 public coverage: `src/site/tree.test.ts` asserts uploaded-style media URLs project through the existing block node shape, and `src/app.test.tsx` asserts uploaded-style and external image `href` values render as `<img src>`.
- SMU-04 browser smoke: `bun browser --session smu-04` reset Site schema and seed with `200` responses. Current dev server profile renders published-site routes, so `/site` returned `No site page exists for site` and `/pages/home` returned `No site page exists for pages/home`; `/` rendered the published home page and `bun browser --session smu-04 errors` returned no page errors.
- 2026-05-13 SMU-04 final `devstate check`: checks ok; `vp check --fix` found no warnings, lint errors, or type errors in 221 files; watcher tests pass; services running at `https://31-site-media-upload.formless.local`.
- 2026-05-13 SMU-05 `devstate check`: checks ok; `vp check --fix` found no warnings, lint errors, or type errors in 221 files; watcher tests pass with 47 test files and 682 tests; services running at `https://31-site-media-upload.formless.local`.
- 2026-05-13 SMU-05 loop status files requested at `./tmp/devstate.json`, `./tmp/test.txt`, and `./tmp/check.txt` were absent; current generated evidence is in `.devstate/status.md`, `.devstate/logs/check-vite.txt`, and `.devstate/logs/service-test.txt`.
- 2026-05-13 SMU-05 browser setup: the shell still had `VITE_FORMLESS_RUNTIME_PROFILE=publishedSite`, so `/site` initially rendered `No site page exists for site`; restarting devstate with `VITE_FORMLESS_RUNTIME_PROFILE` unset restored the generated dev app at `http://127.0.0.1:4281/site`.
- 2026-05-13 SMU-05 `/site` browser smoke: `bun browser --session smu-05` opened the generated Site editor, created image children with empty `href`, uploaded `/tmp/formless-smoke/smu-05.png`, and verified the editor patched a same-origin `/api/site/media/site/images/*.png` URL plus `width = 1` and `height = 1`; the editor preview image loaded with natural size `1x1`.
- 2026-05-13 SMU-05 `/pages/home` browser smoke: `bun browser --session smu-05` rendered public Home with the uploaded media URL in `<img src>`, `alt = "Home smoke image"`, natural size `1x1`, and `bun browser --session smu-05 errors` returned no page errors.
- 2026-05-14 source media follow-up: `src/site/source-media.ts` maps same-origin media hrefs to `schema/apps/site/media/` sidecar paths; `scripts/site-pull-seed.ts` pulls those files; `src/worker/media.ts` accepts guarded key-preserving media restore; `src/site/publish.ts` restores referenced source media files before Site snapshot restore.
- 2026-05-14 `bun run site:pull-seed`: wrote 83 Site seed records and 6 media files from `https://formless.local`.
- 2026-05-14 `bun run site:pull-seed --check`: Site source seed current with 83 records and 6 media files.
- 2026-05-14 `bun run site:publish`: dry run validated 83 Site seed records and 6 referenced source media files.
- 2026-05-14 `devstate check`: checks ok; web service ready at `https://formless.local`; watcher tests pass.
- 2026-05-15 follow-up: `src/app/generated/record-field-editor.tsx` now renders the image preview or empty plus well as `data-web-image-field-upload="trigger"` with the file input visually hidden.
- 2026-05-15 follow-up: `schema/apps/site/schema.json` keeps `block.width` and `block.height` fields, but image variant authoring presentations now expose only `href`.
- 2026-05-15 follow-up: `src/app.test.tsx`, `src/client/views.test.ts`, and `src/shared/schema.test.ts` cover image upload well markup and hidden image width/height presentation.
- 2026-05-15 follow-up: `devstate check` reported checks ok and services running; watcher tests pass.
- 2026-05-15 follow-up: `bun browser --session image-editor-smoke` reset Site schema, opened `/site`, and found one image upload well, zero visible file inputs, no `Choose file` or `No file chosen` text, and zero Width/Height labels; browser errors were empty.

## Promote after ship

- `doc/current.md`: add `FORMLESS_MEDIA` R2 binding, `src/worker/media.ts`, `/api/site/media/images`, `/api/site/media/*`, upload auth, public read, and Miniflare R2 test facts after SMU-02 ships.
- `doc/current.md`: add `editor: "image"` text-backed field metadata, `src/client/media.ts`, generated image preview/upload/manual URL fallback, and existing mutation patch of `href`/`width`/`height` after SMU-03 ships.
- `doc/current.md`: add Site image `href` optional create behavior, `editor: "image"` Site authoring metadata, and public rendering through unchanged `href` tree facts after SMU-04 ships.
- `doc/current.md`: add generated image editor fact that preview or empty plus well opens file selection, and Site image variant authoring hides width/height while keeping flat stored dimension fields.
- `doc/current.md`: add source media sidecar facts for `schema/apps/site/media/`, `site:pull-seed` media writes/checks, guarded key-preserving media restore, and `site:publish` source media restore before Site snapshot restore.
- `doc/current.md`: add SMU-05 smoke facts only as evidence notes if the doc steward wants browser-verified examples; durable current facts are the SMU-02 through SMU-04 code, schema, and test anchors above.
- `doc/roadmap.md`: keep Site image upload in first-release scope and keep general media library/video/file/transforms/cleanup out of scope.
