import { authorizeAdminWrite, type AuthorityAdminGuardEnv } from "./authority-admin-guard.ts";

export const SITE_IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const SITE_MEDIA_CACHE_CONTROL = "public, max-age=31536000, immutable";

const siteMediaRoutePrefix = "/api/site/media/";
const siteImageUploadPath = "/api/site/media/images";
const siteImageKeyPrefix = "site/images/";
const acceptedRasterImageTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

type SiteMediaEnv = AuthorityAdminGuardEnv & {
  FORMLESS_MEDIA: R2Bucket;
};

type UploadResponse = {
  contentType: string;
  href: string;
  key: string;
  size: number;
};

type UploadedImageFile = {
  bytes: Uint8Array;
  size: number;
  type: string;
};

type MultipartPart = {
  body: Uint8Array;
  contentType: string;
  filename: string | undefined;
  name: string | undefined;
};

export async function handleSiteMediaRequest(request: Request, env: SiteMediaEnv) {
  const url = new URL(request.url);

  if (!url.pathname.startsWith(siteMediaRoutePrefix)) {
    return undefined;
  }

  if (request.method === "POST" && url.pathname === siteImageUploadPath) {
    return uploadSiteImage(request, env);
  }

  if (request.method === "GET") {
    return serveSiteMedia(url.pathname, env);
  }

  return jsonResponse({ error: "Not found." }, 404);
}

async function uploadSiteImage(request: Request, env: SiteMediaEnv) {
  const authorization = authorizeAdminWrite(request, env);

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

  const file = fileResult.file;
  const contentType = normalizeContentType(file.type);
  const extension = acceptedRasterImageTypes.get(contentType);

  if (!extension) {
    return jsonResponse({ error: "Unsupported image type." }, 415);
  }

  if (file.size > SITE_IMAGE_UPLOAD_MAX_BYTES) {
    return jsonResponse({ error: "Image file is larger than the 5 MB limit." }, 413);
  }

  const key = `${siteImageKeyPrefix}${crypto.randomUUID()}.${extension}`;

  await env.FORMLESS_MEDIA.put(key, file.bytes, {
    httpMetadata: {
      cacheControl: SITE_MEDIA_CACHE_CONTROL,
      contentType,
    },
  });

  return jsonResponse({
    contentType,
    href: mediaHref(key),
    key,
    size: file.size,
  } satisfies UploadResponse);
}

async function serveSiteMedia(pathname: string, env: SiteMediaEnv) {
  const key = mediaKeyFromPathname(pathname);

  if (!key) {
    return jsonResponse({ error: "Not found." }, 404);
  }

  const object = await env.FORMLESS_MEDIA.get(key);

  if (!object) {
    return jsonResponse({ error: "Media object not found." }, 404);
  }

  const headers = new Headers({
    "Cache-Control": SITE_MEDIA_CACHE_CONTROL,
  });

  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", SITE_MEDIA_CACHE_CONTROL);
  headers.set("ETag", object.httpEtag);

  return new Response(object.body, { headers });
}

async function readMultipartFile(
  request: Request,
): Promise<{ file: UploadedImageFile; ok: true } | { error: string; ok: false }> {
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
      size: file.body.byteLength,
      type: file.contentType,
    },
    ok: true,
  };
}

function normalizeContentType(value: string) {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

function mediaHref(key: string) {
  return `${siteMediaRoutePrefix}${key}`;
}

function mediaKeyFromPathname(pathname: string) {
  const key = pathname.slice(siteMediaRoutePrefix.length);

  return key === "" ? undefined : key;
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, {
    headers,
    status,
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
