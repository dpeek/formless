# Instance Media Direction

Last updated: 2026-05-25

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
- Current Site media is Site-specific image upload and serving. See
  `doc/topics/site-runtime.md`.
- Current Site image upload stores immutable R2 objects under `site/images/`.
- Current installed Site image upload stores immutable R2 objects under
  `app-installs/<installId>/site/images/`.
- Current Site image records are `block` records with `block.type = image` and
  `block.href`.

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
- Media asset: flat record for one uploaded, imported, or external asset.
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

For Site, image and video blocks should eventually store `mediaAssetId` and
usage fields. Legacy `href` should keep rendering while migration exists.

## Schema Shape

Do not start with schema composition as the primary mechanism.

Near term:

- add a core media app or media schema key;
- add generated `editor: "media"` support for scalar text fields;
- let app records store `mediaAssetId` as a flat text value;
- let the Media module resolve `mediaAssetId` to playback or delivery facts.

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
- restore and publish compatibility with current Site media.

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

## Shipped Site Image Spine

- Site image upload and serving use shared media helpers.
- Site schema-key media remains available at `/api/site/media/*`.
- Installed Site media is scoped under `/api/app-installs/site/<installId>/media/*`.
- Standalone Site save and publish preserve referenced same-origin media files.
- Portable Site project import rewrites legacy same-origin media hrefs into
  install-scoped media hrefs.

## Next PRD Candidate

Core media app for images should:

- introduce media asset records or metadata enough to prove the model;
- add a common media editor path;
- let Site image blocks use media assets while legacy `href` still renders;
- keep publish and save behavior explicit;
- avoid video, captions, transformations, and true cross-app references.

Second PRD candidate: video assets with Cloudflare Stream playback.

## Deferred Scope

Defer:

- video upload in the next image/media-asset PRD;
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

- Is `media` a normal schema key, an instance-private core store, or both?
- Does first media asset identity use record id, provider id, or both?
- How should Site project save and publish represent media assets after the
  media spine exists?
- Does a local instance own R2-like media files, or does local media stay a
  project folder until instance sync exists?
- When should deletion remove provider objects versus only tombstone media
  records?
- What minimum media picker is enough before a full media library UI exists?
- Should media upload create records immediately, or only after the provider
  upload succeeds?
- How much legacy `block.href` compatibility is required before migration?
