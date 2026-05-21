export const MEDIA_IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const MEDIA_OBJECT_CACHE_CONTROL = "public, max-age=31536000, immutable";

export type MediaImageFile = {
  bytes: Uint8Array;
  contentType: string;
  size: number;
};

export type MediaObjectWrite = {
  bytes: Uint8Array;
  cacheControl: string;
  contentType: string;
  key: string;
};

export type MediaStoredObject = {
  body: BodyInit | null;
  httpEtag: string;
  writeHttpMetadata: (headers: Headers) => void;
};

export type MediaObjectStore = {
  getObject: (key: string) => Promise<MediaStoredObject | undefined>;
  putObject: (write: MediaObjectWrite) => Promise<void>;
};

export type MediaWriteResponse = {
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

export async function uploadImageMedia({
  file,
  hrefForKey,
  keyPrefix,
  maxBytes = MEDIA_IMAGE_UPLOAD_MAX_BYTES,
  randomId = () => crypto.randomUUID(),
  store,
}: {
  file: MediaImageFile;
  hrefForKey: (key: string) => string;
  keyPrefix: string;
  maxBytes?: number;
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

  const key = `${keyPrefix}${randomId()}.${extension}`;

  await writeMediaObject(store, key, file.bytes, contentType);

  return {
    ok: true,
    upload: {
      contentType,
      href: hrefForKey(key),
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
) {
  return store.putObject({
    bytes,
    cacheControl: MEDIA_OBJECT_CACHE_CONTROL,
    contentType,
    key,
  });
}

function normalizeMediaContentType(value: string): string {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}
