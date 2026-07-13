Completely remove the generated UI `image` field editor from Formless.

Product decision

Formless has one asset-backed `media` editor. For image assets it supports browsing existing media, uploading, thumbnail preview, labels, and removal. Users do not author raw image URLs.

Important boundary

Remove:

- `FieldEditor` value `"image"`.
- `FieldEditorControl` kind `"imageUpload"`.
- Generated control/renderer kind `"image"`.
- Image-editor runtime branches, projections, intents, fixtures, tests, documentation, and Astryx prototype scenarios.

Preserve:

- The `media` editor.
- Core media assets whose kind is `image`.
- Image upload, listing, delivery, archive, and restore behavior.
- Site block type `"image"`.
- Markdown and public-renderer image concepts.
- Astryx `Thumbnail` and image-specific media rendering used by Media.

Do not add compatibility aliases, migrations, deprecated editor handling, or an `image`-to-`media` shim. No shipped schema uses `editor: "image"`.

Work through the repository’s Git-backed change workflow. Update canonical specifications as part of the change.

Schema parsing

- Remove `"image"` from `FieldEditor` in `lib/schema/src/types.ts`.
- Remove it from text-field supported editors.
- Remove `{ kind: "imageUpload" }` and its selection logic from `lib/schema/src/field-types.ts`.
- Ensure schema parsing treats `editor: "image"` as an ordinary unsupported editor.
- Delete image-editor-specific tests. Do not add special compatibility or rejection tests solely for the removed behavior.
- Confirm all bundled Tasks, CRM, and Site schemas still parse.

Generated runtime

Remove Image-specific branches and types from:

- `src/app/generated/field-controls.ts`
- `src/app/generated/create-field-control.tsx`
- `src/app/generated/record-field-renderer-model.ts`
- `src/app/generated/record-field-control.tsx`
- `src/app/generated/record-field-authoring.ts`
- Generated field adapters, projections, intent handling, and their tests.

Keep shared image upload behavior where Media uses it. Rename misleading Image-specific runtime names to Media names when they now describe only Media uploads.

Site behavior

The bundled Site schema already uses `editor: "media"` for `mediaAssetId`.

- Keep `mediaAssetId` as the flat asset reference.
- Keep Site block type `"image"`.
- Remove `href` from image-block variant authoring so image authors never see a raw URL.
- Do not remove the shared `block.href` field where page, link, or other non-image block behavior needs it.
- Remove the public image renderer’s manual-href fallback if it exists only for the retired Image/URL behavior.
- Update Site tree and renderer tests accordingly.
- Preserve flat label, width, height, alt/caption, placement, and similar Site-owned usage metadata.

Astryx prototype

Remove Image as a field kind and scenario from:

- `lib/astryx/src/formless-ui-contract.ts`
- `lib/astryx/src/components/field-scenario-model.ts`
- `lib/astryx/src/components/fields/fixture-helpers.ts`
- `lib/astryx/src/components/fields/media-field.fixtures.ts`
- `lib/astryx/src/components/fields/renderer.tsx`
- `lib/astryx/src/components/fields/media-field.tsx`
- `lib/astryx/src/components/generated-fields.tsx`
- `lib/astryx/src/components/formless-ui-fields.tsx`

Delete pure Image fixtures and examples. Convert examples that are actually asset-backed image authoring to `editor: "media"` and an asset-ID value. Do not delete `ImageInput` or other image-named helpers if Media still uses them; rename them only when that materially clarifies ownership.

Documentation and specifications

Remove or rewrite every statement claiming that Formless supports an `image` editor, including:

- `openspec/specs/generated-ui/spec.md`
- `openspec/specs/core-media/spec.md`
- `doc/field-surface-value-matrix.md`
- Other documentation found by repository search.

Delete the Image field matrix section. Update Media documentation to state that image authoring uses the asset-backed Media editor.

Do not remove documentation about core image media, Site image blocks, image delivery, archives, Markdown images, or rendering image assets.

Completion audit

Search the full repository for:

- `editor: "image"`
- `"editor": "image"`
- `imageUpload`
- Image generated-control kinds
- Image field scenario/fixture identifiers
- Documentation referring to the Image editor

Classify remaining uses of the word “image.” They must refer only to legitimate media asset kinds, Site block types, Markdown/image content, upload formats, or rendering—not a generated field editor.

Verification

- Use `devstate check`; do not run test commands directly.
- Run strict canonical spec validation through the repository workflow.
- Confirm bundled schemas parse.
- Confirm Site Media authoring still projects asset options, upload, preview, labels, and asset-ID commits.
- Record changed files, checks, and change metadata evidence.
