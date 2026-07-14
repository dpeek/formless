Completely remove the generated UI `image` field editor from Formless.

Product decision

Formless has one asset-backed `media` editor. For image assets it supports browsing existing media, uploading, thumbnail preview, labels, and removal. Users do not author raw image URLs.

The generated Media contract is asset-only. Remove the retired Image editor's URL mode instead of preserving an `"asset" | "url"` mode split inside Media types, projections, intents, or renderer adapters.

Important boundary

Remove:

- `FieldEditor` value `"image"`.
- `FieldEditorControl` kind `"imageUpload"`.
- Generated control/renderer kind `"image"`.
- Image-editor runtime branches, URL-mode Media branches, projections, intents, fixtures, tests, documentation, and Astryx prototype scenarios.
- Legacy Media React adapter props and branches that exist only to distinguish Image URL fields from asset-backed Media fields.

Preserve:

- The `media` editor.
- Core media assets whose kind is `image`.
- Image upload, listing, delivery, archive, and restore behavior.
- Site block type `"image"`.
- Markdown and public-renderer image concepts.
- Astryx `MediaInput`, `MediaValueDisplay`, `Thumbnail`, and image-specific media rendering used by Media.

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
- `src/app/generated/record-field-editor.tsx`
- `src/app/generated/record-field-authoring.ts`
- `src/app/generated/formless-ui-projection.ts`
- `src/app/generated/formless-ui-intents.ts`
- Generated field adapters and their tests.
- `lib/media/src/react.tsx` and its Image/URL compatibility tests.

Collapse Media authoring to its asset-backed contract. Remove redundant Image/URL compatibility facts such as `GeneratedRecordFieldMediaEditorMode`, `FormlessUiMediaEditorMode`, `MediaFieldEditorMode`, `MediaFieldKind`, `selectedUrl`, `hrefFieldName`, URL-mode intent guards, and Image-versus-Media renderer routing. Do not narrow these types to a constant `"asset"` value; delete the mode distinction.

Keep shared image upload behavior where Media uses it. Rename misleading generated-runtime Image names to Media names when they now describe only Media authoring. Preserve precise Media-package names such as `ImageMediaAssetOption` and `UploadedImageMedia` when they identify the supported asset kind rather than the retired field editor.

Site behavior

The bundled Site schema defines `mediaAssetId` and uses `editor: "media"` in existing edit and item variants, but its image create variant still exposes only `href`.

- Keep `mediaAssetId` as the flat asset reference.
- Keep Site block type `"image"`.
- In `blockCreate.variants.image`, replace the current `href` field with `mediaAssetId` using `editor: "media"` so new image blocks can select or upload an asset.
- Remove `href` from the `blockByType` image variant and from the image variants in `blockRootDetail`, `blockTreeNode`, and `blockEdit` so image authors never see a raw URL.
- Do not remove the shared `block.href` field where page, link, or other non-image block behavior needs it.
- Stop projecting `href` onto public tree nodes for blocks whose type is `"image"`.
- Remove the public image renderer's manual-href fallback. Image rendering uses projected core media delivery facts only.
- Update Site tree and renderer tests accordingly.
- Preserve flat label, width, height, alt/caption, placement, and similar Site-owned usage metadata.
- Refresh `lib/site-app/formless.app.json` `sourceSchemaHash` after changing `lib/site-app/schema.json`. Keep package revision `1`; this schema-only current-state change does not require a migration.

Astryx prototype

Remove Image as a field kind and scenario from:

- `lib/astryx/src/formless-ui-contract.ts`
- `lib/astryx/src/components/field-scenario-model.ts`
- `lib/astryx/src/components/fields/fixture-helpers.ts`
- `lib/astryx/src/components/fields/field-options.tsx`
- `lib/astryx/src/components/fields/media-field.fixtures.ts`
- `lib/astryx/src/components/fields/renderer.tsx`
- `lib/astryx/src/components/fields/media-field.tsx`
- `lib/astryx/src/components/generated-fields.tsx`
- `lib/astryx/src/components/formless-ui-fields.tsx`

Delete pure Image fixtures and examples. Convert examples that are actually asset-backed image authoring to `editor: "media"` and an asset-ID value. Preserve the current `MediaInput`, `MediaValueDisplay`, and `Thumbnail` helpers. Preserve image-named media asset types and rendering helpers when their names describe image media rather than the retired field editor.

Documentation and specifications

Remove or rewrite every statement claiming that Formless supports an `image` editor, including:

- `openspec/specs/generated-ui/spec.md`
- `openspec/specs/core-media/spec.md`
- `openspec/specs/site-runtime/spec.md`
- `openspec/specs/media/spec.md`
- `doc/field-surface-value-matrix.md`
- Other documentation found by repository search.

Delete the Image field matrix section and its cross-references, migration-parity notes, and optional improvements. Update Media documentation to state that image authoring uses the asset-backed Media editor. Remove Site and Media specification statements that preserve manual image `href` fallback while retaining documentation for shared non-image `href` fields.

Do not remove documentation about core image media, Site image blocks, image delivery, archives, Markdown images, or rendering image assets.

Completion audit

Search the full repository for:

- `editor: "image"`
- `"editor": "image"`
- `imageUpload`
- Image generated-control kinds
- Image field scenario/fixture identifiers
- Documentation referring to the Image editor
- `MediaFieldKind`
- `MediaFieldEditorMode` and `FormlessUiMediaEditorMode`
- `mediaEditorMode`
- `selectedUrl`
- `hrefFieldName`
- URL-mode Media intent and renderer branches

Classify remaining uses of the word “image.” They must refer only to legitimate media asset kinds, Site block types, Markdown/image content, upload formats, or rendering—not a generated field editor. Classify remaining `href` authoring and projection uses; none may provide an Image or Media URL fallback.

Verification

- Use `devstate check`; do not run test commands directly.
- Run strict canonical spec validation through the repository workflow.
- Confirm bundled schemas parse.
- Confirm Site image create and edit authoring project asset options, upload, preview, labels, removal, and asset-ID commits through the Media editor.
- Confirm public Site image nodes omit manual `href` projection and render only resolved core media delivery facts or the existing missing-image placeholder.
- Confirm the Site package manifest hash matches the changed source schema without a package revision or migration.
- Record changed files, checks, and change metadata evidence.
