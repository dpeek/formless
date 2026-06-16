# Core Media Specification

## Purpose

Core media stores first-party media assets for a Formless instance outside app
record storage. App records keep flat usage metadata and reference core media
asset ids or delivery hrefs.

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

### Requirement: Legacy App-Scoped Media Retirement

The system MUST reject legacy Site-owned media storage paths as active media
input.

#### Scenario: Legacy routes are inactive

- GIVEN a client targets `/api/site/media/*` or
  `/api/app-installs/site/:installId/media/*`
- WHEN the request is handled by current media routing
- THEN those paths are not active media routes
- AND normal app storage identities do not expose Site-owned media route or key
  facts

#### Scenario: Legacy archive input is rejected

- GIVEN an archive, publish, save, or import workflow sees legacy same-origin
  Site media hrefs or legacy Site media storage keys
- WHEN validation runs
- THEN the workflow fails with a migration error before mutation
- AND no app-scoped Site media archive objects are emitted

### Requirement: Generated Media Authoring

The system SHALL let generated UI use core media assets through text-backed
field editors.

#### Scenario: Media editor field

- GIVEN a text field declares the `media` editor
- WHEN generated authoring renders the field
- THEN the user can select existing core image media assets or upload a new
  image through `/api/formless/media/images`
- AND the field value remains a flat text value

#### Scenario: Image editor fallback

- GIVEN a text field declares the `image` editor
- WHEN generated authoring renders the field
- THEN upload with preview is available
- AND manual URL editing remains available as fallback input

### Requirement: Site Media Usage

The Site app SHALL render owned images through core media delivery while keeping
Site usage metadata in flat Site records.

#### Scenario: Site image block

- GIVEN an image block references a valid core media asset id
- WHEN the public Site tree and renderer process the block
- THEN public rendering uses the resolved core media delivery href
- AND the manual `href` field is only fallback input

#### Scenario: Site media fields

- GIVEN Site image authoring edits an image block
- WHEN the generated edit, tree, or table surface renders
- THEN `mediaAssetId` is available as the core media field
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
