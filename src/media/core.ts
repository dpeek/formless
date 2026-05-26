export const MEDIA_IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const MEDIA_OBJECT_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const CORE_IMAGE_KEY_PREFIX = "media/images";
export const CORE_IMAGE_UPLOAD_PATH = "/api/formless/media/images";
export const CORE_MEDIA_ROUTE_PREFIX = "/api/formless/media/";

export type MediaImageFile = {
  bytes: Uint8Array;
  contentType: string;
  filename?: string;
  size: number;
};

export type MediaObjectWrite = {
  bytes: Uint8Array;
  cacheControl: string;
  contentType: string;
  customMetadata?: Record<string, string>;
  key: string;
};

export type MediaStoredObject = {
  body: BodyInit | null;
  customMetadata?: Record<string, string>;
  httpEtag: string;
  writeHttpMetadata: (headers: Headers) => void;
};

export type MediaStoredObjectListing = {
  contentType?: string;
  customMetadata?: Record<string, string>;
  key: string;
  size?: number;
};

export type MediaObjectList = {
  objects: MediaStoredObjectListing[];
};

export type MediaObjectStore = {
  getObject: (key: string) => Promise<MediaStoredObject | undefined>;
  listObjects?: (options: { limit?: number; prefix: string }) => Promise<MediaObjectList>;
  putObject: (write: MediaObjectWrite) => Promise<void>;
};

export type MediaWriteResponse = {
  asset?: MediaAsset;
  assetId?: string;
  contentType: string;
  href: string;
  key: string;
  size: number;
};

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

export type MediaDeliveryFacts = {
  body: BodyInit | null;
  headers: Headers;
};

export type MediaAssetDeliveryFacts = {
  assetId: string;
  href: string;
  kind: "image";
  storageKey: string;
};

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
  storageKey: string;
  width?: number;
};

const imageExtensionsByContentType = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

const imageContentTypesByExtension = new Map([
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
  ["gif", "image/gif"],
]);

export function imageMediaExtensionForContentType(contentType: string): string | undefined {
  return imageExtensionsByContentType.get(normalizeMediaContentType(contentType));
}

export function imageMediaContentTypeForKey(key: string): string | undefined {
  const extension = key.split(".").pop()?.toLowerCase();

  return extension ? imageContentTypesByExtension.get(extension) : undefined;
}

export function isRestorableImageMediaKey(key: string, options: { keyPrefix: string }): boolean {
  return (
    isValidMediaStorageKey(key) &&
    key.startsWith(options.keyPrefix) &&
    imageMediaContentTypeForKey(key) !== undefined
  );
}

export function isValidMediaStorageKey(key: string): boolean {
  if (key === "" || key.startsWith("/") || key.includes("\\") || key.includes("%")) {
    return false;
  }

  const segments = key.split("/");

  return segments.every(
    (segment) =>
      segment !== "" &&
      segment !== "." &&
      segment !== ".." &&
      /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment),
  );
}

export function mediaAssetFromObjectMetadata(
  metadata: Record<string, string> | undefined,
): MediaAsset | undefined {
  if (!metadata) {
    return undefined;
  }

  const {
    "formless-media-asset-id": id,
    "formless-media-byte-size": byteSizeValue,
    "formless-media-content-type": contentType,
    "formless-media-delivery-href": deliveryHref,
    "formless-media-filename": filename,
    "formless-media-height": heightValue,
    "formless-media-kind": kind,
    "formless-media-label": label,
    "formless-media-provider": provider,
    "formless-media-status": status,
    "formless-media-storage-key": storageKey,
    "formless-media-width": widthValue,
  } = metadata;
  const byteSize = parseOptionalMediaInteger(byteSizeValue);
  const width = parseOptionalMediaInteger(widthValue);
  const height = parseOptionalMediaInteger(heightValue);

  if (
    !id ||
    kind !== "image" ||
    !label ||
    !contentType ||
    byteSize === undefined ||
    !provider ||
    !storageKey ||
    status !== "ready" ||
    !deliveryHref
  ) {
    return undefined;
  }

  return {
    byteSize,
    contentType,
    deliveryHref,
    ...(filename ? { filename } : {}),
    ...(height === undefined ? {} : { height }),
    id,
    kind,
    label,
    provider,
    status,
    storageKey,
    ...(width === undefined ? {} : { width }),
  };
}

export function imageMediaDeliveryFactsForAssetId(
  assetId: string,
  options: { hrefForKey: (key: string) => string; keyPrefix: string },
): MediaAssetDeliveryFacts | undefined {
  if (!isValidImageMediaAssetId(assetId)) {
    return undefined;
  }

  const storageKey = `${options.keyPrefix}${assetId}`;

  if (!isRestorableImageMediaKey(storageKey, { keyPrefix: options.keyPrefix })) {
    return undefined;
  }

  return {
    assetId,
    href: options.hrefForKey(storageKey),
    kind: "image",
    storageKey,
  };
}

export function coreImageMediaDeliveryFactsForAssetId(
  assetId: string,
): MediaAssetDeliveryFacts | undefined {
  return imageMediaDeliveryFactsForAssetId(assetId, {
    hrefForKey: coreMediaHrefForKey,
    keyPrefix: `${CORE_IMAGE_KEY_PREFIX}/`,
  });
}

export function coreMediaHrefForKey(key: string): string {
  return `${CORE_MEDIA_ROUTE_PREFIX}${key}`;
}

export async function listImageMediaAssets({
  hrefForKey,
  keyPrefix,
  limit = 50,
  provider,
  store,
}: {
  hrefForKey?: (key: string) => string;
  keyPrefix: string;
  limit?: number;
  provider?: string;
  store: MediaObjectStore;
}): Promise<MediaAsset[]> {
  if (!store.listObjects) {
    return [];
  }

  const listing = await store.listObjects({ limit, prefix: keyPrefix });

  return listing.objects
    .map((object) => ({
      asset:
        mediaAssetFromObjectMetadata(object.customMetadata) ??
        mediaAssetFromListingObject(object, { hrefForKey, keyPrefix, provider }),
      key: object.key,
    }))
    .filter(
      (entry): entry is { asset: MediaAsset; key: string } =>
        entry.asset !== undefined &&
        entry.asset.kind === "image" &&
        entry.asset.storageKey === entry.key &&
        entry.asset.storageKey.startsWith(keyPrefix),
    )
    .map((entry) => entry.asset)
    .sort(
      (left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id),
    );
}

function mediaAssetFromListingObject(
  object: MediaStoredObjectListing,
  options: {
    hrefForKey?: (key: string) => string;
    keyPrefix: string;
    provider?: string;
  },
): MediaAsset | undefined {
  if (!options.hrefForKey || !options.provider) {
    return undefined;
  }

  if (!isRestorableImageMediaKey(object.key, { keyPrefix: options.keyPrefix })) {
    return undefined;
  }

  const assetId = object.key.slice(options.keyPrefix.length);
  const contentType =
    normalizeMediaContentType(object.contentType ?? "") || imageMediaContentTypeForKey(object.key);

  if (
    !isValidImageMediaAssetId(assetId) ||
    !contentType ||
    imageMediaExtensionForContentType(contentType) === undefined ||
    object.size === undefined ||
    object.size < 0
  ) {
    return undefined;
  }

  return {
    byteSize: object.size,
    contentType,
    deliveryHref: options.hrefForKey(object.key),
    id: assetId,
    kind: "image",
    label: assetId,
    provider: options.provider,
    status: "ready",
    storageKey: object.key,
  };
}

export async function uploadImageMedia({
  file,
  hrefForKey,
  keyPrefix,
  maxBytes = MEDIA_IMAGE_UPLOAD_MAX_BYTES,
  provider,
  randomId = () => crypto.randomUUID(),
  store,
}: {
  file: MediaImageFile;
  hrefForKey: (key: string) => string;
  keyPrefix: string;
  maxBytes?: number;
  provider: string;
  randomId?: () => string;
  store: MediaObjectStore;
}): Promise<MediaWriteResult> {
  const contentType = normalizeMediaContentType(file.contentType);
  const extension = imageMediaExtensionForContentType(contentType);

  if (!extension) {
    return { error: "Unsupported image type.", ok: false, status: 415 };
  }

  if (file.size > maxBytes) {
    return { error: "Image file is larger than the 5 MB limit.", ok: false, status: 413 };
  }

  const assetId = `${randomId()}.${extension}`;
  const key = `${keyPrefix}${assetId}`;
  const href = hrefForKey(key);
  const asset: MediaAsset = {
    byteSize: file.size,
    contentType,
    deliveryHref: href,
    ...mediaAssetFilenameFields(file.filename),
    id: assetId,
    kind: "image",
    provider,
    status: "ready",
    storageKey: key,
  };

  await writeMediaObject(store, key, file.bytes, contentType, {
    customMetadata: mediaObjectMetadataForAsset(asset),
  });

  return {
    ok: true,
    upload: {
      asset,
      assetId: asset.id,
      contentType,
      href,
      key,
      size: file.size,
    },
  };
}

export async function restoreImageMedia({
  bytes,
  contentType,
  hrefForKey,
  key,
  keyPrefix,
  maxBytes = MEDIA_IMAGE_UPLOAD_MAX_BYTES,
  store,
}: {
  bytes: Uint8Array;
  contentType: string;
  hrefForKey: (key: string) => string;
  key: string;
  keyPrefix: string;
  maxBytes?: number;
  store: MediaObjectStore;
}): Promise<MediaWriteResult> {
  if (!isRestorableImageMediaKey(key, { keyPrefix })) {
    return { error: "Unsupported media restore key.", ok: false, status: 400 };
  }

  const expectedContentType = imageMediaContentTypeForKey(key);

  if (!expectedContentType) {
    return { error: "Unsupported media restore key.", ok: false, status: 400 };
  }

  const normalizedContentType = normalizeMediaContentType(contentType);

  if (normalizedContentType && normalizedContentType !== expectedContentType) {
    return {
      error: "Media restore content type must match the media key.",
      ok: false,
      status: 415,
    };
  }

  if (bytes.byteLength === 0) {
    return { error: "Media restore body must not be empty.", ok: false, status: 400 };
  }

  if (bytes.byteLength > maxBytes) {
    return { error: "Image file is larger than the 5 MB limit.", ok: false, status: 413 };
  }

  await writeMediaObject(store, key, bytes, expectedContentType);

  return {
    ok: true,
    upload: {
      contentType: expectedContentType,
      href: hrefForKey(key),
      key,
      size: bytes.byteLength,
    },
  };
}

export async function deliveryFactsForMediaObject({
  includeBody = true,
  key,
  store,
}: {
  includeBody?: boolean;
  key: string;
  store: MediaObjectStore;
}): Promise<MediaDeliveryFacts | undefined> {
  const object = await store.getObject(key);

  if (!object) {
    return undefined;
  }

  const headers = new Headers({
    "Cache-Control": MEDIA_OBJECT_CACHE_CONTROL,
  });

  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", MEDIA_OBJECT_CACHE_CONTROL);
  headers.set("ETag", object.httpEtag);

  return {
    body: includeBody ? object.body : null,
    headers,
  };
}

function writeMediaObject(
  store: MediaObjectStore,
  key: string,
  bytes: Uint8Array,
  contentType: string,
  options: { customMetadata?: Record<string, string> } = {},
) {
  return store.putObject({
    bytes,
    cacheControl: MEDIA_OBJECT_CACHE_CONTROL,
    contentType,
    ...(options.customMetadata ? { customMetadata: options.customMetadata } : {}),
    key,
  });
}

function mediaObjectMetadataForAsset(asset: MediaAsset): Record<string, string> {
  return {
    "formless-media-asset-id": asset.id,
    "formless-media-byte-size": String(asset.byteSize),
    "formless-media-content-type": asset.contentType,
    "formless-media-delivery-href": asset.deliveryHref,
    ...(asset.filename ? { "formless-media-filename": asset.filename } : {}),
    ...(asset.height === undefined ? {} : { "formless-media-height": String(asset.height) }),
    "formless-media-kind": asset.kind,
    "formless-media-label": asset.label,
    "formless-media-provider": asset.provider,
    "formless-media-status": asset.status,
    "formless-media-storage-key": asset.storageKey,
    ...(asset.width === undefined ? {} : { "formless-media-width": String(asset.width) }),
  };
}

function mediaAssetFilenameFields(filename: string | undefined): {
  filename?: string;
  label: string;
} {
  const normalized = normalizeMediaFilename(filename);

  return normalized ? { filename: normalized, label: normalized } : { label: "Uploaded image" };
}

function normalizeMediaFilename(filename: string | undefined): string | undefined {
  const cleaned = filename
    ?.split(/[\\/]/)
    .pop()
    ?.split("")
    .filter(isMediaFilenameCharacter)
    .join("")
    .trim();

  return cleaned === undefined || cleaned === "" ? undefined : cleaned.slice(0, 200);
}

function isMediaFilenameCharacter(value: string): boolean {
  const code = value.charCodeAt(0);

  return (code >= 0x20 && code !== 0x7f) || code > 0x7f;
}

function isValidImageMediaAssetId(assetId: string): boolean {
  return !assetId.includes("/") && isValidMediaStorageKey(assetId);
}

function parseOptionalMediaInteger(value: string | undefined): number | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function normalizeMediaContentType(value: string): string {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}
