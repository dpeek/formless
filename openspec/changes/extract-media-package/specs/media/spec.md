## ADDED Requirements

### Requirement: Media package shape

The system SHALL provide a Media package under `lib/media/` as the first package-slice extraction candidate.

#### Scenario: Media package files

- **WHEN** the Media package is scaffolded
- **THEN** it contains `CONTEXT.md`, `package.json`, `tsconfig.json`, `src/types.ts`, `src/index.ts`, `src/client.ts`, `src/react.tsx`, and `src/worker.ts`

#### Scenario: Media package tests

- **WHEN** Media package behavior is covered by package-local tests
- **THEN** test files live beside package source under `lib/media/src/`

### Requirement: Media public contract

The Media package public contract SHALL own media asset and image media transfer shapes.

#### Scenario: Contract owns media shapes

- **WHEN** code needs media asset, image upload, image list, image restore, delivery fact, storage key, metadata, or provider seam contracts
- **THEN** the documented declarations come from `lib/media/src/types.ts`

#### Scenario: Contract excludes runtime code

- **WHEN** `lib/media/src/types.ts` is imported
- **THEN** it does not import client, React, Worker, provider, storage, or app runtime code

### Requirement: Media runtime-neutral helpers

The Media package root SHALL expose runtime-neutral pure media helpers and public type re-exports.

#### Scenario: Pure media helpers

- **WHEN** code validates media content types, file extensions, storage keys, asset ids, metadata invariants, or delivery href facts
- **THEN** it can import pure helpers from the Media package root

#### Scenario: Root stays runtime-neutral

- **WHEN** code imports the Media package root
- **THEN** the import does not include fetch, FormData, File, Image, React, Worker request handling, R2, or Cloudflare-specific dependencies

### Requirement: Media client adapter

The Media client adapter SHALL own browser/client HTTP behavior for image media.

#### Scenario: Client uploads and lists images

- **WHEN** browser code uploads an image file or lists core image media assets
- **THEN** it imports the HTTP adapter from the Media client subpath
- **AND** the adapter returns the public upload and asset option shapes

#### Scenario: Client adapter has no React dependency

- **WHEN** the Media client adapter is imported
- **THEN** it does not import React or generated UI modules

### Requirement: Media Worker adapter

The Media Worker adapter SHALL own Worker/runtime media request handling and provider store adapters.

#### Scenario: Worker handles core media routes

- **WHEN** a Worker handles upload, list, restore, `GET`, or `HEAD` requests for `/api/formless/media`
- **THEN** it uses the Media Worker adapter through the public package subpath

#### Scenario: Provider seam stays outside app records

- **WHEN** a provider adapter stores or reads media objects
- **THEN** provider storage keys and provider-specific object facts stay in Media-owned metadata and provider adapters
- **AND** app records do not store provider-specific URLs

### Requirement: Media React adapter

The Media React adapter SHALL own media-specific picker, upload, preview, and broken-asset UI behavior.

#### Scenario: Media-specific controls

- **WHEN** generated authoring needs media asset selection, image upload, preview, or broken-asset display
- **THEN** it uses Media React adapter controls or adapter models

#### Scenario: Generic layout stays outside Media

- **WHEN** a generated form, table, list, tree, dialog, or field commit surface renders
- **THEN** generic layout and commit behavior remain outside the Media package

### Requirement: Media ownership exclusions

The Media package SHALL NOT own app schema parsing, app records, generic generated form layout, generic UI primitives, or Site usage metadata.

#### Scenario: Site usage metadata remains Site data

- **WHEN** Site records store image usage facts such as alt text, caption, crop, slot, focal point, poster override, width, height, or fallback href
- **THEN** those facts remain flat Site record values outside the Media package

#### Scenario: Schema parsing remains shared runtime behavior

- **WHEN** app schema field editors or record values are parsed
- **THEN** parsing remains outside the Media package

### Requirement: Media behavior compatibility

The Media extraction SHALL preserve existing user-visible media behavior.

#### Scenario: Current image flows continue

- **WHEN** a user uploads, lists, restores, selects, previews, or renders an existing core image media asset
- **THEN** the behavior matches the pre-extraction behavior

#### Scenario: Existing app records remain flat

- **WHEN** an app references owned image media
- **THEN** the app stores flat media asset ids or usage fields
- **AND** provider-specific storage details remain outside app records
