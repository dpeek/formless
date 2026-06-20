# Media Package Specification

## Purpose

The Media package owns reusable media contracts, pure helpers, and runtime
adapters for Formless core media behavior. App schemas and runtimes keep app
records, usage metadata, and generic generated UI behavior outside the package.

## Requirements

### Requirement: Media Package Shape

The system SHALL provide a Media package under `lib/media/`.

#### Scenario: Media package files

- GIVEN the Media package is scaffolded
- WHEN package files are present
- THEN it contains `AGENTS.md`, `package.json`, `tsconfig.json`,
  `src/types.ts`, `src/index.ts`, `src/client.ts`, `src/react.tsx`, and
  `src/worker.ts`

#### Scenario: Media package tests

- GIVEN Media package behavior is covered by package-local tests
- WHEN test files are added
- THEN they live beside package source under `lib/media/src/`

### Requirement: Media Public Contract

The Media package public contract SHALL own media asset and image media transfer
shapes.

#### Scenario: Contract owns media shapes

- GIVEN code needs media asset, image upload, image list, image restore,
  delivery fact, storage key, metadata, or provider seam contracts
- WHEN it imports the documented contract
- THEN the declarations come from `lib/media/src/types.ts`

#### Scenario: Contract excludes runtime code

- GIVEN `lib/media/src/types.ts` is imported
- WHEN the import is evaluated
- THEN it does not import client, React, Worker, provider, storage, or app
  runtime code

### Requirement: Media Runtime-Neutral Helpers

The Media package root SHALL expose runtime-neutral pure media helpers and
public type re-exports.

#### Scenario: Pure media helpers

- GIVEN code validates media content types, file extensions, storage keys, asset
  ids, metadata invariants, or delivery href facts
- WHEN it needs reusable Media package behavior
- THEN it can import pure helpers from the Media package root

#### Scenario: Root stays runtime-neutral

- GIVEN code imports the Media package root
- WHEN the import is evaluated
- THEN the import does not include fetch, FormData, File, Image, React, Worker
  request handling, R2, or Cloudflare-specific dependencies

### Requirement: Media Client Adapter

The Media client adapter SHALL own browser/client HTTP behavior for image media.

#### Scenario: Client uploads and lists images

- GIVEN browser code uploads an image file or lists core image media assets
- WHEN it needs the HTTP adapter
- THEN it imports the adapter from the Media client subpath
- AND the adapter returns the public upload and asset option shapes

#### Scenario: Client adapter has no React dependency

- GIVEN the Media client adapter is imported
- WHEN the import is evaluated
- THEN it does not import React or generated UI modules

### Requirement: Media Worker Adapter

The Media Worker adapter SHALL own Worker/runtime media request handling and
provider store adapters.

#### Scenario: Worker handles core media routes

- GIVEN a Worker handles upload, list, restore, `GET`, or `HEAD` requests for
  `/api/formless/media`
- WHEN it handles core media
- THEN it uses the Media Worker adapter through the public package subpath

#### Scenario: Provider seam stays outside app records

- GIVEN a provider adapter stores or reads media objects
- WHEN it handles provider storage keys or provider-specific object facts
- THEN those facts stay in Media-owned metadata and provider adapters
- AND app records do not store provider-specific URLs

### Requirement: Media React Adapter

The Media React adapter SHALL own media-specific picker, upload, preview, and
broken-asset UI behavior.

#### Scenario: Media-specific controls

- GIVEN generated authoring needs media asset selection, image upload, preview,
  or broken-asset display
- WHEN media-specific controls render
- THEN generated UI uses Media React adapter controls or adapter models

#### Scenario: Generic layout stays outside Media

- GIVEN a generated form, table, list, tree, dialog, or field commit surface
  renders
- WHEN generic layout or commit behavior is needed
- THEN that behavior remains outside the Media package

### Requirement: Media Ownership Exclusions

The Media package SHALL NOT own app schema parsing, app records, generic
generated form layout, generic UI primitives, or Site usage metadata.

#### Scenario: Site usage metadata remains Site data

- GIVEN Site records store image usage facts such as alt text, caption, crop,
  slot, focal point, poster override, width, height, or fallback href
- WHEN the records are stored or rendered
- THEN those facts remain flat Site record values outside the Media package

#### Scenario: Schema parsing remains shared runtime behavior

- GIVEN app schema field editors or record values are parsed
- WHEN parsing runs
- THEN parsing remains outside the Media package

### Requirement: Media Behavior Preservation

The Media extraction SHALL preserve existing user-visible media behavior.

#### Scenario: Current image flows continue

- GIVEN a user uploads, lists, restores, selects, previews, or renders an
  existing core image media asset
- WHEN the media flow runs
- THEN the behavior matches the pre-extraction behavior

#### Scenario: Existing app records remain flat

- GIVEN an app references owned image media
- WHEN the app stores media usage
- THEN the app stores flat media asset ids or usage fields
- AND provider-specific storage details remain outside app records
