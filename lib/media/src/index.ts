import {
  CORE_IMAGE_KEY_PREFIX,
  CORE_MEDIA_ROUTE_PREFIX,
  MEDIA_ASSET_METADATA_KEYS,
} from "./types.ts";
import type {
  MediaAsset,
  MediaAssetDeliveryFacts,
  MediaAssetMetadata,
  MediaObjectMetadata,
} from "./types.ts";

export {
  CORE_IMAGE_KEY_PREFIX,
  CORE_IMAGE_UPLOAD_PATH,
  CORE_MEDIA_ROUTE_PREFIX,
  MEDIA_ASSET_METADATA_KEYS,
  MEDIA_IMAGE_UPLOAD_MAX_BYTES,
  MEDIA_OBJECT_CACHE_CONTROL,
  MEDIA_PUBLIC_CONTRACT_VERSION,
} from "./types.ts";
export type {
  ImageMediaListResponse,
  ImageMediaRestoreResponse,
  ImageMediaUploadResponse,
  MediaAsset,
  MediaAssetDeliveryFacts,
  MediaAssetMetadata,
  MediaDeliveryFacts,
  MediaImageFile,
  MediaObjectList,
  MediaObjectMetadata,
  MediaObjectStore,
  MediaObjectWrite,
  MediaStorageKey,
  MediaStoredObject,
  MediaStoredObjectListing,
  MediaWriteResponse,
  MediaWriteResult,
} from "./types.ts";

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

export function normalizeMediaContentType(value: string): string {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function imageMediaExtensionForContentType(contentType: string): string | undefined {
  return imageExtensionsByContentType.get(normalizeMediaContentType(contentType));
}

export function imageMediaContentTypeForKey(key: string): string | undefined {
  const extension = key.split(".").pop()?.toLowerCase();

  return extension ? imageContentTypesByExtension.get(extension) : undefined;
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

export function isValidImageMediaAssetId(assetId: string): boolean {
  return !assetId.includes("/") && isValidMediaStorageKey(assetId);
}

export function isRestorableImageMediaKey(key: string, options: { keyPrefix: string }): boolean {
  return (
    isValidMediaStorageKey(key) &&
    key.startsWith(options.keyPrefix) &&
    imageMediaContentTypeForKey(key) !== undefined
  );
}

export function mediaAssetFromObjectMetadata(
  metadata: MediaObjectMetadata | undefined,
): MediaAsset | undefined {
  if (!metadata) {
    return undefined;
  }

  const {
    [MEDIA_ASSET_METADATA_KEYS.assetId]: id,
    [MEDIA_ASSET_METADATA_KEYS.byteSize]: byteSizeValue,
    [MEDIA_ASSET_METADATA_KEYS.contentType]: contentType,
    [MEDIA_ASSET_METADATA_KEYS.deliveryHref]: deliveryHref,
    [MEDIA_ASSET_METADATA_KEYS.filename]: filename,
    [MEDIA_ASSET_METADATA_KEYS.height]: heightValue,
    [MEDIA_ASSET_METADATA_KEYS.kind]: kind,
    [MEDIA_ASSET_METADATA_KEYS.label]: label,
    [MEDIA_ASSET_METADATA_KEYS.provider]: provider,
    [MEDIA_ASSET_METADATA_KEYS.status]: status,
    [MEDIA_ASSET_METADATA_KEYS.storageKey]: storageKey,
    [MEDIA_ASSET_METADATA_KEYS.width]: widthValue,
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

export function mediaObjectMetadataForAsset(asset: MediaAsset): MediaAssetMetadata {
  return {
    [MEDIA_ASSET_METADATA_KEYS.assetId]: asset.id,
    [MEDIA_ASSET_METADATA_KEYS.byteSize]: String(asset.byteSize),
    [MEDIA_ASSET_METADATA_KEYS.contentType]: asset.contentType,
    [MEDIA_ASSET_METADATA_KEYS.deliveryHref]: asset.deliveryHref,
    ...(asset.filename ? { [MEDIA_ASSET_METADATA_KEYS.filename]: asset.filename } : {}),
    ...(asset.height === undefined
      ? {}
      : { [MEDIA_ASSET_METADATA_KEYS.height]: String(asset.height) }),
    [MEDIA_ASSET_METADATA_KEYS.kind]: asset.kind,
    [MEDIA_ASSET_METADATA_KEYS.label]: asset.label,
    [MEDIA_ASSET_METADATA_KEYS.provider]: asset.provider,
    [MEDIA_ASSET_METADATA_KEYS.status]: asset.status,
    [MEDIA_ASSET_METADATA_KEYS.storageKey]: asset.storageKey,
    ...(asset.width === undefined
      ? {}
      : { [MEDIA_ASSET_METADATA_KEYS.width]: String(asset.width) }),
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

export function coreMediaKeyFromHref(href: string): string | undefined {
  if (!href.startsWith(CORE_MEDIA_ROUTE_PREFIX)) {
    return undefined;
  }

  const url = new URL(href, "https://formless.local");
  const key = url.pathname.startsWith(CORE_MEDIA_ROUTE_PREFIX)
    ? url.pathname.slice(CORE_MEDIA_ROUTE_PREFIX.length)
    : "";

  return isValidMediaStorageKey(key) ? key : undefined;
}

export function coreMediaKeyFromAssetId(assetId: string): string | undefined {
  return coreImageMediaDeliveryFactsForAssetId(assetId)?.storageKey;
}

function parseOptionalMediaInteger(value: string | undefined): number | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}
