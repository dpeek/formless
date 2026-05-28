import {
  imageMediaContentTypeForKey,
  imageMediaExtensionForContentType,
  isRestorableImageMediaKey,
  isValidImageMediaAssetId,
  isValidMediaStorageKey,
  mediaAssetFromObjectMetadata,
  mediaObjectMetadataForAsset,
  normalizeMediaContentType,
} from "./index.ts";
import {
  CORE_IMAGE_KEY_PREFIX,
  CORE_IMAGE_UPLOAD_PATH,
  CORE_MEDIA_ROUTE_PREFIX,
  MEDIA_IMAGE_UPLOAD_MAX_BYTES,
  MEDIA_OBJECT_CACHE_CONTROL,
} from "./types.ts";
import type {
  MediaAsset,
  MediaDeliveryFacts,
  MediaImageFile,
  MediaObjectMetadata,
  MediaObjectStore,
  MediaStoredObjectListing,
  MediaWriteResult,
} from "./types.ts";

export {
  CORE_IMAGE_KEY_PREFIX,
  CORE_IMAGE_UPLOAD_PATH,
  CORE_MEDIA_ROUTE_PREFIX,
  MEDIA_IMAGE_UPLOAD_MAX_BYTES,
  MEDIA_OBJECT_CACHE_CONTROL,
} from "./types.ts";
export type {
  MediaAsset,
  MediaDeliveryFacts,
  MediaImageFile,
  MediaObjectStore,
  MediaWriteResponse,
  MediaWriteResult,
} from "./types.ts";

export type MediaWriteAuthorizationResult =
  | { authorized: true }
  | {
      authorized: false;
      error: string;
      headers: HeadersInit;
      status: number;
    };

export type ImageMediaStorageIdentity = {
  imageKeyPrefix: string;
  imageUploadPath: `/api/${string}/media/images`;
  routePrefix: `/api/${string}/media`;
};

export type ImageMediaRoute = {
  media: ImageMediaStorageIdentity;
  path: string;
};

export type HandleMediaRequestOptions = {
  authorizeWrite: (
    request: Request,
  ) => MediaWriteAuthorizationResult | Promise<MediaWriteAuthorizationResult>;
  pathname?: string;
  provider?: string;
  randomId?: () => string;
  store: MediaObjectStore;
};

export const CORE_IMAGE_MEDIA_STORAGE_IDENTITY = {
  imageKeyPrefix: CORE_IMAGE_KEY_PREFIX,
  imageUploadPath: CORE_IMAGE_UPLOAD_PATH,
  routePrefix: "/api/formless/media",
} satisfies ImageMediaStorageIdentity;

type MultipartPart = {
  body: Uint8Array;
  contentType: string;
  filename: string | undefined;
  name: string | undefined;
};

export async function handleMediaRequest(
  request: Request,
  options: HandleMediaRequestOptions,
): Promise<Response | undefined> {
  const route = imageMediaRouteFromPathname(options.pathname ?? new URL(request.url).pathname);

  if (!route) {
    return undefined;
  }

  if (request.method === "POST" && route.path === "/media/images") {
    return uploadImage(request, route.media, options);
  }

  if (request.method === "GET" && route.path === "/media/images") {
    return listImages(route.media, options);
  }

  if (request.method === "PUT") {
    return restoreImage(request, route, options);
  }

  if (request.method === "GET" || request.method === "HEAD") {
    const response = await serveImage(route, options, {
      includeBody: request.method === "GET",
    });

    return responseWithoutBodyForHead(request, response);
  }

  return jsonResponse({ error: "Not found." }, 404);
}

export function imageMediaRouteFromPathname(pathname: string): ImageMediaRoute | undefined {
  if (pathname.startsWith(CORE_MEDIA_ROUTE_PREFIX)) {
    const key = mediaKeyFromPathname(pathname, CORE_MEDIA_ROUTE_PREFIX);

    return {
      media: CORE_IMAGE_MEDIA_STORAGE_IDENTITY,
      path: key ? `/media/${key}` : "/media",
    };
  }

  return undefined;
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
  asset,
  bytes,
  contentType,
  hrefForKey,
  key,
  keyPrefix,
  maxBytes = MEDIA_IMAGE_UPLOAD_MAX_BYTES,
  store,
}: {
  asset?: MediaAsset;
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

  const href = hrefForKey(key);
  const metadataAsset =
    asset &&
    asset.kind === "image" &&
    asset.storageKey === key &&
    normalizeMediaContentType(asset.contentType) === expectedContentType &&
    asset.byteSize === bytes.byteLength &&
    asset.deliveryHref === href &&
    asset.status === "ready"
      ? asset
      : undefined;

  await writeMediaObject(
    store,
    key,
    bytes,
    expectedContentType,
    metadataAsset ? { customMetadata: mediaObjectMetadataForAsset(metadataAsset) } : {},
  );

  return {
    ok: true,
    upload: {
      contentType: expectedContentType,
      href,
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

export function mediaObjectStoreFromR2Bucket(bucket: R2Bucket): MediaObjectStore {
  return {
    async getObject(key) {
      const object = await bucket.get(key);

      if (!object) {
        return undefined;
      }

      return {
        body: object.body,
        customMetadata: object.customMetadata,
        httpEtag: object.httpEtag,
        writeHttpMetadata(headers) {
          object.writeHttpMetadata(headers);
        },
      };
    },
    async listObjects(options) {
      const listing = await bucket.list({
        limit: options.limit,
        prefix: options.prefix,
      });
      const objects = await Promise.all(
        listing.objects.map(async (object) => {
          const metadataObject =
            object.customMetadata === undefined || object.httpMetadata === undefined
              ? await bucket.head(object.key)
              : object;

          return {
            contentType: metadataObject?.httpMetadata?.contentType,
            customMetadata: metadataObject?.customMetadata,
            key: object.key,
            size: object.size,
          };
        }),
      );

      return {
        objects,
      };
    },
    async putObject(write) {
      await bucket.put(write.key, write.bytes, {
        httpMetadata: {
          cacheControl: write.cacheControl,
          contentType: write.contentType,
        },
        ...(write.customMetadata ? { customMetadata: write.customMetadata } : {}),
      });
    },
  };
}

async function uploadImage(
  request: Request,
  media: ImageMediaStorageIdentity,
  options: HandleMediaRequestOptions,
) {
  const authorization = await options.authorizeWrite(request);

  if (!authorization.authorized) {
    return jsonResponse(
      { error: authorization.error },
      authorization.status,
      authorization.headers,
    );
  }

  const fileResult = await readMultipartFile(request);

  if (!fileResult.ok) {
    return jsonResponse({ error: fileResult.error }, 400);
  }

  const upload = await uploadImageMedia({
    file: fileResult.file,
    hrefForKey: (key) => mediaHrefForStorageKey(key, media),
    keyPrefix: mediaImageKeyPrefix(media),
    provider: options.provider ?? "r2",
    ...(options.randomId ? { randomId: options.randomId } : {}),
    store: options.store,
  });

  if (!upload.ok) {
    return jsonResponse({ error: upload.error }, upload.status);
  }

  return jsonResponse(upload.upload);
}

async function listImages(media: ImageMediaStorageIdentity, options: HandleMediaRequestOptions) {
  const assets = await listImageMediaAssets({
    hrefForKey: (key) => mediaHrefForStorageKey(key, media),
    keyPrefix: mediaImageKeyPrefix(media),
    provider: options.provider ?? "r2",
    store: options.store,
  });

  return jsonResponse({ assets }, 200, {
    "Cache-Control": "no-store",
  });
}

async function restoreImage(
  request: Request,
  route: ImageMediaRoute,
  options: HandleMediaRequestOptions,
) {
  const authorization = await options.authorizeWrite(request);

  if (!authorization.authorized) {
    return jsonResponse(
      { error: authorization.error },
      authorization.status,
      authorization.headers,
    );
  }

  const key = mediaKeyFromRoutePath(route);

  if (!key) {
    return jsonResponse({ error: "Unsupported media restore key." }, 400);
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  const restore = await restoreImageMedia({
    bytes,
    contentType: request.headers.get("Content-Type") ?? "",
    hrefForKey: (storageKey) => mediaHrefForStorageKey(storageKey, route.media),
    key,
    keyPrefix: mediaImageKeyPrefix(route.media),
    store: options.store,
  });

  if (!restore.ok) {
    return jsonResponse({ error: restore.error }, restore.status);
  }

  return jsonResponse(restore.upload);
}

async function serveImage(
  route: ImageMediaRoute,
  options: HandleMediaRequestOptions,
  deliveryOptions: { includeBody?: boolean } = {},
) {
  const key = mediaKeyFromRoutePath(route);

  if (!key) {
    return jsonResponse({ error: "Not found." }, 404);
  }

  const delivery = await deliveryFactsForMediaObject({
    includeBody: deliveryOptions.includeBody ?? true,
    key,
    store: options.store,
  });

  if (!delivery) {
    return jsonResponse({ error: "Media object not found." }, 404);
  }

  return new Response(delivery.body, { headers: delivery.headers });
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

function writeMediaObject(
  store: MediaObjectStore,
  key: string,
  bytes: Uint8Array,
  contentType: string,
  options: { customMetadata?: MediaObjectMetadata } = {},
) {
  return store.putObject({
    bytes,
    cacheControl: MEDIA_OBJECT_CACHE_CONTROL,
    contentType,
    ...(options.customMetadata ? { customMetadata: options.customMetadata } : {}),
    key,
  });
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

function mediaKeyFromRoutePath(route: ImageMediaRoute): string | undefined {
  if (!route.path.startsWith("/media/")) {
    return undefined;
  }

  const key = route.path.slice("/media/".length);

  if (!isValidMediaStorageKey(key) || !key.startsWith(mediaImageKeyPrefix(route.media))) {
    return undefined;
  }

  return key;
}

function mediaKeyFromPathname(pathname: string, routePrefix: string): string | undefined {
  const key = pathname.startsWith(routePrefix) ? pathname.slice(routePrefix.length) : "";

  return isValidMediaStorageKey(key) ? key : undefined;
}

function mediaImageKeyPrefix(media: ImageMediaStorageIdentity): string {
  return media.imageKeyPrefix.endsWith("/") ? media.imageKeyPrefix : `${media.imageKeyPrefix}/`;
}

function mediaHrefForStorageKey(key: string, media: ImageMediaStorageIdentity): string {
  return `${media.routePrefix}/${key}`;
}

async function readMultipartFile(
  request: Request,
): Promise<{ file: MediaImageFile; ok: true } | { error: string; ok: false }> {
  const boundary = multipartBoundary(request.headers.get("Content-Type"));

  if (!boundary) {
    return { error: "Expected multipart form data.", ok: false };
  }

  const parts = parseMultipartParts(new Uint8Array(await request.arrayBuffer()), boundary);
  const fileParts = parts.filter((part) => part.name === "file" && part.filename !== undefined);

  if (fileParts.length === 0) {
    return { error: 'Expected multipart file field "file".', ok: false };
  }

  if (fileParts.length > 1) {
    return { error: "Only one image file can be uploaded at a time.", ok: false };
  }

  const file = fileParts[0];

  return {
    file: {
      bytes: file.body,
      contentType: file.contentType,
      filename: file.filename,
      size: file.body.byteLength,
    },
    ok: true,
  };
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, {
    headers,
    status,
  });
}

function responseWithoutBodyForHead(request: Request, response: Response): Response {
  if (request.method !== "HEAD") {
    return response;
  }

  return new Response(null, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function multipartBoundary(contentType: string | null) {
  const match = /(?:^|;)\s*boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType ?? "");

  return match?.[1] ?? match?.[2]?.trim();
}

function parseMultipartParts(body: Uint8Array, boundary: string): MultipartPart[] {
  const delimiter = encodeAscii(`--${boundary}`);
  const lineBreak = encodeAscii("\r\n");
  const headerSeparator = encodeAscii("\r\n\r\n");
  const closeDelimiter = encodeAscii("--");
  const parts: MultipartPart[] = [];
  let delimiterIndex = indexOfBytes(body, delimiter, 0);

  while (delimiterIndex >= 0) {
    let partStart = delimiterIndex + delimiter.byteLength;

    if (startsWithBytes(body, closeDelimiter, partStart)) {
      break;
    }

    if (!startsWithBytes(body, lineBreak, partStart)) {
      break;
    }

    partStart += lineBreak.byteLength;

    const nextDelimiterIndex = indexOfBytes(body, delimiter, partStart);

    if (nextDelimiterIndex < 0) {
      break;
    }

    const partEnd = endsWithBytes(body, lineBreak, nextDelimiterIndex)
      ? nextDelimiterIndex - lineBreak.byteLength
      : nextDelimiterIndex;
    const partBytes = body.slice(partStart, partEnd);
    const headerEnd = indexOfBytes(partBytes, headerSeparator, 0);

    if (headerEnd >= 0) {
      const headers = parsePartHeaders(partBytes.slice(0, headerEnd));
      const disposition = parseContentDisposition(headers.get("content-disposition"));

      parts.push({
        body: partBytes.slice(headerEnd + headerSeparator.byteLength),
        contentType: headers.get("content-type") ?? "",
        filename: disposition.filename,
        name: disposition.name,
      });
    }

    delimiterIndex = nextDelimiterIndex;
  }

  return parts;
}

function parsePartHeaders(value: Uint8Array) {
  const headers = new Map<string, string>();
  const text = new TextDecoder().decode(value);

  for (const line of text.split("\r\n")) {
    const separator = line.indexOf(":");

    if (separator > 0) {
      headers.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
    }
  }

  return headers;
}

function parseContentDisposition(value: string | undefined) {
  const params = new Map<string, string>();

  for (const part of value?.split(";").slice(1) ?? []) {
    const separator = part.indexOf("=");

    if (separator > 0) {
      params.set(part.slice(0, separator).trim().toLowerCase(), unquote(part.slice(separator + 1)));
    }
  }

  return {
    filename: params.get("filename"),
    name: params.get("name"),
  };
}

function unquote(value: string) {
  const trimmed = value.trim();

  return trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed;
}

function encodeAscii(value: string) {
  return new TextEncoder().encode(value);
}

function indexOfBytes(source: Uint8Array, target: Uint8Array, fromIndex: number) {
  for (let index = fromIndex; index <= source.byteLength - target.byteLength; index += 1) {
    if (startsWithBytes(source, target, index)) {
      return index;
    }
  }

  return -1;
}

function startsWithBytes(source: Uint8Array, target: Uint8Array, offset: number) {
  if (offset < 0 || offset + target.byteLength > source.byteLength) {
    return false;
  }

  for (let index = 0; index < target.byteLength; index += 1) {
    if (source[offset + index] !== target[index]) {
      return false;
    }
  }

  return true;
}

function endsWithBytes(source: Uint8Array, target: Uint8Array, endIndex: number) {
  return startsWithBytes(source, target, endIndex - target.byteLength);
}
