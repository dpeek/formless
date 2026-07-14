# Core Media Specification

## Purpose

Core media stores first-party media assets for a Formless instance outside app
record storage. App records keep flat usage metadata and reference core media
asset ids; delivery hrefs are resolved from those asset ids.

## Requirements

### Requirement: Core Image Media Assets

The system SHALL model owned image media as core media assets with immutable
provider storage keys.

#### Scenario: Image asset metadata

- GIVEN an image upload is accepted
- WHEN the asset metadata is stored
- THEN the asset has an id, kind, label, filename, content type, byte size,
  status, provider, storage key, and optional dimensions
- AND the provider object key lives under `media/images/`

#### Scenario: Core media stays outside app records

- GIVEN an app uses an owned image
- WHEN the app stores usage data
- THEN app records store flat fields such as media asset id, alt text, caption,
  crop, focal point, slot, or poster override
- AND provider-specific storage details remain in core media metadata

### Requirement: Media API

The system SHALL expose instance media APIs under `/api/formless/media`.

#### Scenario: Upload image

- GIVEN an authorized writer posts one raster image file field named `file`
- WHEN the file is JPEG, PNG, WebP, or GIF and is at most 5 MB
- THEN `/api/formless/media/images` stores the media object and asset metadata
- AND the upload uses the `FORMLESS_MEDIA` R2 binding

#### Scenario: Read media

- GIVEN a core media object exists
- WHEN a client requests `/api/formless/media/*` with `GET` or `HEAD`
- THEN the object is returned without touching app Authority storage
- AND public media reads are allowed

### Requirement: Generated Media Authoring

The system SHALL let generated UI use core media assets through text-backed
field editors.

#### Scenario: Media editor field

- GIVEN a text field declares the `media` editor
- WHEN generated authoring renders the field
- THEN the user can browse and select existing core image media assets by
  display-safe label or upload a new image through `/api/formless/media/images`
- AND generated authoring provides thumbnail preview and optional removal
- AND the field value remains a flat media asset id stored as text
- AND media authoring has no raw image URL mode

### Requirement: Site Media Usage

The Site app SHALL render owned images through core media delivery while keeping
Site usage metadata in flat Site records.

#### Scenario: Site image block

- GIVEN an image block references a valid core media asset id
- WHEN the public Site tree and renderer process the block
- THEN public rendering uses the resolved core media delivery href
- AND image rendering does not use a manual `href` fallback

#### Scenario: Site media fields

- GIVEN Site image authoring edits an image block
- WHEN the generated create, edit, tree, or table surface renders
- THEN `mediaAssetId` is available through the `media` editor as the core media
  field
- AND the shared block `href` field is not exposed for the image variant
- AND `width` and `height` remain optional flat fields that can be populated
  from upload metadata

### Requirement: Media In Archives And Source Files

The system SHALL move owned media through explicit core media files and archive
capabilities.

#### Scenario: Archive includes media

- GIVEN a portable app or instance archive references owned core image media
- WHEN the archive is exported
- THEN the archive declares the `core-media-assets` capability
- AND referenced media files are included at manifest archive paths

#### Scenario: Restore media before records

- GIVEN archive restore or Site publish applies media-backed records
- WHEN the workflow mutates the target
- THEN core media objects are restored before app records
- AND media object keys, content types, byte sizes, asset metadata, and files are
  validated before mutation

#### Scenario: Referenced upload participates in workspace auto-save

- GIVEN a local generated media editor uploads a core image and commits an app
  record reference to that image
- WHEN local workspace auto-save persists workspace source
- THEN the referenced media payload is written with workspace media state
- AND standalone uploaded media that is not referenced by active app records is
  not written as reviewable workspace source
