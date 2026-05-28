/**
 * Public Media contract version.
 *
 * Version 1 covers first-party image media assets, upload/list/restore transfer
 * shapes, delivery facts, storage keys, object metadata, and the provider store
 * seam. App-specific usage metadata remains owned by app schemas and runtimes.
 *
 * This file is intentionally import-free so runtime-neutral, client, React, and
 * Worker entrypoints can share the same documented contract without pulling in
 * adapter code.
 */
export const MEDIA_PUBLIC_CONTRACT_VERSION = 1;

/** Maximum accepted image upload size for the core media API. */
export const MEDIA_IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

/** Cache policy applied to immutable stored media object responses. */
export const MEDIA_OBJECT_CACHE_CONTROL = "public, max-age=31536000, immutable";

/** Provider object-key prefix for owned core image media. */
export const CORE_IMAGE_KEY_PREFIX = "media/images";

/** Core image upload endpoint owned by the Media API. */
export const CORE_IMAGE_UPLOAD_PATH = "/api/formless/media/images";

/** Public route prefix for serving core media objects by storage key. */
export const CORE_MEDIA_ROUTE_PREFIX = "/api/formless/media/";

/** String metadata keys stored beside provider objects for media asset facts. */
export const MEDIA_ASSET_METADATA_KEYS = {
  assetId: "formless-media-asset-id",
  byteSize: "formless-media-byte-size",
  contentType: "formless-media-content-type",
  deliveryHref: "formless-media-delivery-href",
  filename: "formless-media-filename",
  height: "formless-media-height",
  kind: "formless-media-kind",
  label: "formless-media-label",
  provider: "formless-media-provider",
  status: "formless-media-status",
  storageKey: "formless-media-storage-key",
  width: "formless-media-width",
} as const;

/**
 * Provider storage key for a media object.
 *
 * Current core image keys are immutable and live under `media/images/`.
 */
export type MediaStorageKey = string;

/** String-only custom metadata persisted with a media object. */
export type MediaObjectMetadata = Record<string, string>;

/**
 * Metadata required to reconstruct a ready image media asset from provider
 * object metadata. Usage facts such as alt text, caption, crop, or focal point
 * are not part of this contract.
 */
export type MediaAssetMetadata = MediaObjectMetadata & {
  "formless-media-asset-id": string;
  "formless-media-byte-size": string;
  "formless-media-content-type": string;
  "formless-media-delivery-href": string;
  "formless-media-filename"?: string;
  "formless-media-height"?: string;
  "formless-media-kind": "image";
  "formless-media-label": string;
  "formless-media-provider": string;
  "formless-media-status": "ready";
  "formless-media-storage-key": MediaStorageKey;
  "formless-media-width"?: string;
};

/** Normalized image file payload accepted by media upload and restore helpers. */
export type MediaImageFile = {
  bytes: Uint8Array;
  contentType: string;
  filename?: string;
  size: number;
};

/** Object-store write request used by provider adapters. */
export type MediaObjectWrite = {
  bytes: Uint8Array;
  cacheControl: string;
  contentType: string;
  customMetadata?: MediaObjectMetadata;
  key: MediaStorageKey;
};

/** Stored object facts returned by provider adapters for delivery. */
export type MediaStoredObject = {
  body: BodyInit | null;
  customMetadata?: MediaObjectMetadata;
  httpEtag: string;
  writeHttpMetadata: (headers: Headers) => void;
};

/** Listed object facts returned by provider adapters. */
export type MediaStoredObjectListing = {
  contentType?: string;
  customMetadata?: MediaObjectMetadata;
  key: MediaStorageKey;
  size?: number;
};

/** Provider object listing result. */
export type MediaObjectList = {
  objects: MediaStoredObjectListing[];
};

/**
 * Minimal provider object-store seam used by the Worker adapter.
 *
 * `listObjects` is optional so providers without list support can still serve
 * and write objects.
 */
export type MediaObjectStore = {
  getObject: (key: MediaStorageKey) => Promise<MediaStoredObject | undefined>;
  listObjects?: (options: { limit?: number; prefix: string }) => Promise<MediaObjectList>;
  putObject: (write: MediaObjectWrite) => Promise<void>;
};

/**
 * Public first-party image media asset.
 *
 * App records should store flat asset ids or usage fields. Provider storage
 * facts stay in Media-owned metadata and adapter contracts.
 */
export type MediaAsset = {
  byteSize: number;
  contentType: string;
  deliveryHref: string;
  filename?: string;
  height?: number;
  id: string;
  kind: "image";
  label: string;
  provider: string;
  status: "ready";
  storageKey: MediaStorageKey;
  width?: number;
};

/** Response shape returned when an image upload creates or restores an asset. */
export type ImageMediaUploadResponse = {
  asset?: MediaAsset;
  assetId?: string;
  contentType: string;
  href: string;
  key: MediaStorageKey;
  size: number;
};

/** Restore response matches upload response for restored image media objects. */
export type ImageMediaRestoreResponse = ImageMediaUploadResponse;

/** Response shape for listing ready image media assets. */
export type ImageMediaListResponse = {
  assets: MediaAsset[];
};

/** Successful media write response currently used by image uploads. */
export type MediaWriteResponse = ImageMediaUploadResponse;

/** Result union returned by write helpers before Worker response mapping. */
export type MediaWriteResult =
  | {
      ok: true;
      upload: MediaWriteResponse;
    }
  | {
      error: string;
      ok: false;
      status: number;
    };

/** Delivery payload and headers for serving a stored media object. */
export type MediaDeliveryFacts = {
  body: BodyInit | null;
  headers: Headers;
};

/** Routeable delivery facts derived from an image media asset id. */
export type MediaAssetDeliveryFacts = {
  assetId: string;
  href: string;
  kind: "image";
  storageKey: MediaStorageKey;
};
