import {
  parseAppArchiveData,
  parsePortableArchive,
  type AppArchiveData,
} from "../shared/archive.ts";
import type {
  AppStorageIdentity,
  InstalledAppStorageIdentity,
} from "../shared/app-storage-identity.ts";
import type { BootstrapResponse } from "../shared/protocol.ts";
import type { WorkerSchemaAppDefinition } from "./schema-apps.ts";
import {
  applyPortableArchiveRestore,
  dryRunPortableArchiveRestore,
  restoreArchiveAppDataToStorage,
  restoreArchiveMediaObjectToStore,
  type ArchiveRestoreApplyTarget,
  type ArchiveRestoreMediaRead,
} from "./archive-restore.ts";
import { authorizeInstanceWrite, type AuthorityAdminGuardEnv } from "./authority-admin-guard.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import {
  readInstanceAppInstalls,
  restoreInstanceAppInstall,
} from "./instance-app-installs-state.ts";
import { mediaObjectStoreFromR2Bucket } from "../media/r2.ts";
import { committedWrite } from "./storage.ts";
import type { AuthorityWriteNotifier } from "./authority-operations.ts";

export const INSTANCE_ARCHIVE_RESTORE_API_PATH = "/api/formless/archive/restore";
export const ARCHIVE_APP_DATA_RESTORE_PATH = "/archive/restore-app-data";

type InstanceArchiveApiEnv = AuthorityAdminGuardEnv & {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
  FORMLESS_MEDIA: R2Bucket;
};

type ArchiveRestoreRequest = {
  archive: unknown;
  mediaFiles: ArchiveRestoreMediaRead[];
};

export async function handleInstanceArchiveApiRequest(
  request: Request,
  env: InstanceArchiveApiEnv,
): Promise<Response | undefined> {
  if (!isInstanceArchiveRestorePath(new URL(request.url).pathname)) {
    return undefined;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);

  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export async function handleInstanceArchiveDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceArchiveApiEnv,
): Promise<Response | undefined> {
  const pathname = new URL(request.url).pathname;

  if (!isInstanceArchiveRestorePath(pathname)) {
    return undefined;
  }

  try {
    if (pathname !== INSTANCE_ARCHIVE_RESTORE_API_PATH) {
      return jsonResponse({ error: "Not found." }, 404);
    }

    if (request.method !== "POST") {
      return methodNotAllowedResponse("POST");
    }

    const authorization = await authorizeInstanceWrite(request, env);

    if (!authorization.authorized) {
      return jsonResponse(
        { error: authorization.error },
        authorization.status,
        authorization.headers,
      );
    }

    const body = parseArchiveRestoreRequest(await readJson(request));
    const archive = parsePortableArchive(body.archive);
    const mediaFilesByPath = new Map(body.mediaFiles.map((file) => [file.archivePath, file]));
    const target = archiveRestoreApiTarget(request, storage, env, mediaFilesByPath);
    const result = archive.restorePolicy.dryRun
      ? await dryRunPortableArchiveRestore(archive, target)
      : await applyPortableArchiveRestore(archive, target);

    return jsonResponse(result, result.ok ? 200 : 400);
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

export async function handleArchiveAppDataRestoreDurableObjectRequest(
  request: Request,
  input: {
    app: WorkerSchemaAppDefinition;
    env: AuthorityAdminGuardEnv;
    identity: AppStorageIdentity;
    path: string;
    storage: DurableObjectStorage;
    writes: AuthorityWriteNotifier;
  },
): Promise<Response | undefined> {
  if (input.path !== ARCHIVE_APP_DATA_RESTORE_PATH) {
    return undefined;
  }

  try {
    if (request.method !== "POST") {
      return methodNotAllowedResponse("POST");
    }

    const authorization = await authorizeInstanceWrite(request, input.env);

    if (!authorization.authorized) {
      return jsonResponse(
        { error: authorization.error },
        authorization.status,
        authorization.headers,
      );
    }

    const data = parseAppArchiveData("Archive app data", await readJson(request), input.app.key);
    const response = input.writes.apply(() =>
      committedWrite(restoreArchiveAppDataToStorage(input.storage, data)),
    );

    return jsonResponse(response);
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

function archiveRestoreApiTarget(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceArchiveApiEnv,
  mediaFilesByPath: Map<string, ArchiveRestoreMediaRead>,
): ArchiveRestoreApplyTarget {
  return {
    listInstalledApps: () => readInstanceAppInstalls(storage),
    media: {
      listFiles: async () => [...mediaFilesByPath.values()].map(mediaFileMetadata),
      readFile: async (archivePath) => mediaFilesByPath.get(archivePath),
      restoreObject: async ({ bytes, identity, object }) =>
        restoreArchiveMediaObjectToStore(
          mediaObjectStoreFromR2Bucket(env.FORMLESS_MEDIA),
          identity,
          object,
          bytes,
        ),
    },
    restoreAppData: async ({ data, identity }) =>
      restoreAppDataViaAuthority(request, env, data, identity),
    restoreInstall: ({ action, install }) => {
      restoreInstanceAppInstall(storage, { action, install });
    },
  };
}

async function restoreAppDataViaAuthority(
  request: Request,
  env: InstanceArchiveApiEnv,
  data: AppArchiveData,
  identity: InstalledAppStorageIdentity,
): Promise<BootstrapResponse> {
  const id = env.FORMLESS_AUTHORITY.idFromName(identity.authorityName);
  const url = new URL(`${identity.apiRoutePrefix}${ARCHIVE_APP_DATA_RESTORE_PATH}`, request.url);
  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(url, {
      body: JSON.stringify(data),
      headers: archiveRestoreForwardHeaders(request.headers),
      method: "POST",
    }),
  );
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Failed app data restore for "${identity.installId}": HTTP ${response.status} ${text}`,
    );
  }

  try {
    return JSON.parse(text) as BootstrapResponse;
  } catch {
    throw new Error(`Failed app data restore for "${identity.installId}": response was not JSON.`);
  }
}

function archiveRestoreForwardHeaders(headers: Headers): Headers {
  const forwarded = new Headers();
  const authorization = headers.get("Authorization");
  const cookie = headers.get("Cookie");

  forwarded.set("Content-Type", "application/json");

  if (authorization) {
    forwarded.set("Authorization", authorization);
  }

  if (cookie) {
    forwarded.set("Cookie", cookie);
  }

  return forwarded;
}

function parseArchiveRestoreRequest(value: unknown): ArchiveRestoreRequest {
  const object = parseObject("Archive restore request", value);

  if (!("archive" in object)) {
    throw new Error('Archive restore request must include "archive".');
  }

  return {
    archive: object.archive,
    mediaFiles: parseArchiveRestoreMediaFiles(object.mediaFiles),
  };
}

function parseArchiveRestoreMediaFiles(value: unknown): ArchiveRestoreMediaRead[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("Archive restore request mediaFiles must be an array.");
  }

  const seen = new Set<string>();

  return value.map((file, index) => {
    const parsed = parseArchiveRestoreMediaFile(
      `Archive restore request mediaFiles[${index}]`,
      file,
    );

    if (seen.has(parsed.archivePath)) {
      throw new Error(
        `Archive restore request includes duplicate media file "${parsed.archivePath}".`,
      );
    }

    seen.add(parsed.archivePath);
    return parsed;
  });
}

function parseArchiveRestoreMediaFile(context: string, value: unknown): ArchiveRestoreMediaRead {
  const object = parseObject(context, value);
  const archivePath = parseRelativePath(`${context} archivePath`, object.archivePath);
  const contentType = parseNonEmptyString(`${context} contentType`, object.contentType);
  const byteSize = parseNonNegativeInteger(`${context} byteSize`, object.byteSize);
  const bytes = bytesFromBase64(`${context} bytesBase64`, object.bytesBase64);

  if (bytes.byteLength !== byteSize) {
    throw new Error(`${context} bytesBase64 does not match byteSize.`);
  }

  return {
    archivePath,
    byteSize,
    bytes,
    contentType,
  };
}

function mediaFileMetadata(file: ArchiveRestoreMediaRead) {
  return {
    archivePath: file.archivePath,
    byteSize: file.byteSize,
    contentType: file.contentType,
  };
}

function bytesFromBase64(context: string, value: unknown): Uint8Array {
  const encoded = parseNonEmptyString(context, value);
  let binary: string;

  try {
    binary = atob(encoded);
  } catch {
    throw new Error(`${context} must be base64.`);
  }

  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function isInstanceArchiveRestorePath(pathname: string) {
  return (
    pathname === INSTANCE_ARCHIVE_RESTORE_API_PATH ||
    pathname.startsWith(`${INSTANCE_ARCHIVE_RESTORE_API_PATH}/`)
  );
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function methodNotAllowedResponse(allow: string): Response {
  return jsonResponse({ error: "Method not allowed." }, 405, { Allow: allow });
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);

  if (!responseHeaders.has("Cache-Control")) {
    responseHeaders.set("Cache-Control", "no-store");
  }

  return Response.json(body, {
    status,
    headers: responseHeaders,
  });
}

function parseObject(context: string, value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function parseRelativePath(context: string, value: unknown): string {
  const key = parseNonEmptyString(context, value);
  const segments = key.split("/");

  if (
    key !== key.trim() ||
    key.startsWith("/") ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`${context} must be a relative path without dot segments.`);
  }

  return key;
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value;
}

function parseNonNegativeInteger(context: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${context} must be a non-negative integer.`);
  }

  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Bad request.";
}
