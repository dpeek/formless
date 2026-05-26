# Instance Media Direction

Last updated: 2026-05-26

Purpose: product and architecture direction before media PRDs.

This is not shipped behavior. Shipped behavior lives in `doc/current.md` and
`doc/topics/*.md`.

This is not a backlog. Work starts when a GitHub PRD issue owns the chunk.

## Current Anchors

- Formless is a schema-as-data app runtime. See `CONTEXT.md`.
- A Formless instance is one runtime scope for apps, data, media, auth, and
  deploy config. See `doc/directions/formless-instance.md`.
- Current source app schema keys are `tasks`, `estii`, and `site`. See
  `doc/topics/schema-runtime.md`.
- Current Authority storage and browser replica are keyed by app storage
  identity. See `doc/topics/authority-storage-sync.md`.
- Current core image media upload, listing, restore, and delivery routes exist.
  See `doc/topics/authority-storage-sync.md`.
- Current core image media uploads store immutable R2 objects under
  `media/images/`.
- Current core image media delivery uses `/api/formless/media/<storageKey>`.
- Current Site-owned media routes are retired. See `doc/topics/site-runtime.md`.
- Current Site image records are `block` records with `block.type = image`,
  optional `block.mediaAssetId`, and manual/external/data `block.href`.

## Direction

Make media a core Formless instance concept, not a Site-only feature.

The instance should own one Media module. Apps should use media through small
flat fields and generated editors.

The first Media module should support existing Site images before adding video.
Video should be the second adapter-backed media kind, not the first reason to
reshape the runtime.

Avoid making true cross-app references a prerequisite for first media work.
Current installed app storage, sync, and browser replicas are install-scoped,
but there is no core Media app or general cross-app reference validation yet. A
media field can store a stable media asset id before the runtime has general
cross-app reference validation.

## Draft Vocabulary

- Media module: core instance module that owns media upload, metadata,
  processing status, delivery facts, and provider adapters.
- Media app: bundled app or schema surface for browsing and managing media
  assets.
- Media asset: flat runtime asset identity for one uploaded, imported, or
  external asset.
- Media kind: coarse asset type such as `image`, `video`, `audio`, or `file`.
- Media rendition: derived asset output such as thumbnail, poster, transformed
  image, MP4 download, waveform, transcript, or audio extraction.
- Media track: timed auxiliary asset such as captions, subtitles, transcript, or
  alternate audio.
- Provider adapter: concrete adapter behind the Media module for R2,
  Cloudflare Stream, Media Transformations, or external URLs.
- Playback facts: render-ready data returned by the Media module for a media
  asset, such as player kind, URL, token, poster, dimensions, duration, and
  status.
- Usage metadata: app-owned fields that describe how a media asset is used in a
  record, such as alt text, caption, crop, focal point, slot, or poster override.

## Data Shape

Prefer one main `mediaAsset` entity over one entity per supported file type.

Shared lifecycle is stronger than type differences:

- upload;
- import;
- processing status;
- preview;
- delivery;
- permissions;
- deletion;
- sync;
- publish;
- backup.

`mediaAsset` should carry common flat fields:

- `kind`;
- `label`;
- `filename`;
- `contentType`;
- `byteSize`;
- `status`;
- `provider`;
- provider asset id or storage key;
- optional `width`;
- optional `height`;
- optional `duration`;
- optional `posterMediaAssetId`;
- optional `createdBy` after users exist.

Use variants or generated views for kind-specific editing. Do not split into
`imageAsset`, `videoAsset`, `audioAsset`, and `fileAsset` until separate
lifecycles force it.

Add supporting entities lazily:

- `mediaRendition` when derived outputs need first-class records;
- `mediaTrack` when captions, subtitles, transcripts, or alternate audio need
  first-class records.

## Usage Metadata

Keep asset metadata separate from usage metadata.

Media asset metadata describes the asset itself:

- label;
- filename;
- content type;
- size;
- dimensions;
- duration;
- provider;
- processing status.

Usage metadata belongs to the consuming app record:

- Site alt text;
- Site caption;
- Site crop or focal point;
- Site placement slot;
- Site poster override;
- Estii attachment purpose;
- future app-specific display rules.

For Site, image blocks now store optional `mediaAssetId`. Video blocks should
follow the same usage-metadata split later. Manual, external, and data `href`
fallback should keep rendering.

## Schema Shape

Do not start with schema composition as the primary mechanism.

The first shipped image slice uses R2 object metadata as media asset metadata.
A future media app can still make assets normal schema records when browsing,
deletion, ownership, or richer lifecycle needs force it.

Near term:

- keep generated `editor: "media"` support for scalar text fields;
- let app records store `mediaAssetId` as a flat text value;
- let the Media module resolve `mediaAssetId` to playback or delivery facts;
- add browser media management only after the asset lifecycle is clearer.

Later:

- add schema-declared media field metadata such as accepted media kinds;
- add true cross-app references if multiple non-media features need them;
- add schema composition only when app installation needs shared entities inside
  one app schema.

Avoid duplicating media asset entities into every app schema just to get same-app
references. That would make one shared media library hard.

## Provider Adapters

Use provider adapters behind the Media module.

R2 adapter:

- image originals;
- generic files;
- audio files until streaming needs say otherwise;
- public immutable assets;
- private objects when auth exists;
- restore and publish compatibility with core media archives.

Cloudflare Stream adapter:

- video upload;
- video storage;
- transcoding;
- adaptive playback;
- processing status;
- signed playback;
- captions and tracks when needed;
- analytics when needed.

Media Transformations adapter:

- thumbnails;
- posters;
- short preview clips;
- transformed images;
- audio extraction;
- derived assets stored back to R2.

External URL adapter:

- imported or embedded media that Formless does not own;
- useful for migration and manual fallback;
- lower trust than owned media.

## Frontend Playback

Use a Formless `MediaPlayer` wrapper as the app-facing playback interface.

First video playback should use Cloudflare Stream Player in an iframe behind
that wrapper. Cloudflare Stream Player supports on-demand and live video with
low implementation cost.

The Media module should provide playback facts. Site and other apps should not
construct Cloudflare iframe URLs directly.

Custom HLS or DASH playback should wait until Formless needs product-level
control over controls, watch progress, chapters, analytics events, playlist
behavior, or branded playback UI.

If custom playback is needed later, prefer a proven player over hand-rolled HLS
or DASH logic.

## Shipped Image Media Spine

- Core image upload and serving use shared media helpers.
- Core image uploads create asset metadata and R2 objects under `media/images/`.
- Core image writes use existing owner-session or admin-token authorization when
  configured.
- Core image reads stay public through `/api/formless/media/<storageKey>`.
- Generated media editors can upload, select, and preview scalar image media
  asset ids.
- Site image blocks can use `mediaAssetId` while manual, external, and data
  `href` fallback still renders.
- Public Site tree resolves valid media asset ids through core media delivery
  facts.
- Portable archives declare `core-media-assets` and include referenced core
  image media objects plus asset metadata.
- Archive restore validates core media files before mutation and restores media
  before records.
- Standalone Site save, dev restore, and publish keep core media files explicit
  under project/source media roots.
- Generated Site image authoring uploads owned images through core media.
- Site-owned media routes under `/api/site/media/*` and
  `/api/app-installs/site/<installId>/media/*` are retired.
- Standalone Site save, dev restore, publish, and import-site reject legacy
  same-origin Site media hrefs with a migration error.
- Old app-scoped Site media archives restore only through a compatibility
  normalizer that converts matching objects into core media.

## PRD

Core media app for images shipped in GitHub issue #28.

Legacy Site-owned media path retired in GitHub issue #32.

Second PRD candidate: video assets with Cloudflare Stream playback.

## Deferred Scope

Defer:

- video upload;
- captions and transcripts;
- audio playback polish;
- generic file manager polish;
- custom HLS or DASH player;
- live streaming;
- media analytics;
- access control beyond existing admin token guard;
- true cross-app reference validation;
- schema composition;
- local/offline media sync;
- instance-to-instance media exchange;
- destructive media cleanup automation.

## Open Questions

- What browser media asset management UI is enough before a full media library?
- Is future `media` a normal schema key, an instance-private core store, or both?
- Does a local instance own R2-like media files, or does local media stay a
  project folder until instance sync exists?
- When should deletion remove provider objects versus only tombstone media
  records?
- What video asset fields are required before Cloudflare Stream support?
- When should true cross-app references replace scalar `mediaAssetId` fields?
