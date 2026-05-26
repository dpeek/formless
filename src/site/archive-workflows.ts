import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  APP_ARCHIVE_KIND,
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  formatAppArchive,
  formatInstanceArchive,
  parseAppArchive,
  parsePortableArchive,
  type AppArchive,
  type AppArchiveData,
  type AppArchiveMediaObject,
  type ArchiveRestorePolicy,
  type InstanceArchive,
  type PortableArchive,
  type SourceArchiveRecord,
} from "../shared/archive.ts";
import {
  findAppInstall,
  findBundledAppPackage,
  type AppInstall,
  type BundledAppPackage,
} from "../shared/app-installs.ts";
import {
  installedAppStorageIdentity,
  legacySiteMediaStorageIdentity,
  type InstalledAppStorageIdentity,
} from "../shared/app-storage-identity.ts";
import {
  CORE_IMAGE_KEY_PREFIX,
  CORE_MEDIA_ROUTE_PREFIX,
  coreImageMediaDeliveryFactsForAssetId,
  coreMediaHrefForKey,
  imageMediaContentTypeForKey,
  isRestorableImageMediaKey,
  type MediaAsset,
} from "../media/core.ts";
import type { AppInstallsResponse, StoreSnapshot, StoredRecord } from "../shared/protocol.ts";
import {
  readSiteProjectAppArchiveEntry,
  type SiteProjectAppArchiveEntry,
  type SiteProjectAppArchiveMediaFile,
} from "./project-archive.ts";
import { isLegacySiteMediaHref, legacySiteMediaMigrationMessage } from "./source-media.ts";

export const PORTABLE_ARCHIVE_MANIFEST_FILE = "archive.json";

const INSTANCE_ARCHIVE_RESTORE_API_PATH = "/api/formless/archive/restore";

export type ArchiveWorkflowDependencies = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  fetch: typeof fetch;
  now: () => string;
};

export type ArchiveDiskMediaFile = {
  archivePath: string;
  byteSize: number;
  bytes: Uint8Array;
  contentType: string;
};

export type ArchiveDiskWriteResult = {
  appCount: number;
  archivePath: string;
  mediaCount: number;
  recordCount: number;
};

export type ArchiveRestoreRemoteResult = {
  ok: boolean;
  plan?: {
    summary: ArchiveRestoreSummary;
  };
  report?: {
    applied: boolean;
    summary: ArchiveRestoreSummary;
  };
  errors?: { message: string }[];
};

export type ArchiveRestoreSummary = {
  appCount: number;
  createdInstalls: string[];
  mediaCountsByApp: Record<string, number>;
  recordCountsByApp: Record<string, { total: number }>;
  replacedInstalls: string[];
};

export type RestorePortableArchiveResult = {
  archivePath: string;
  remote: ArchiveRestoreRemoteResult;
};

export type ImportSiteProjectArchiveResult = ArchiveDiskWriteResult & {
  report: SiteProjectAppArchiveEntry["report"];
};

export async function exportInstanceArchive(
  input: {
    outDir: string;
    target: string;
  },
  dependencies: ArchiveWorkflowDependencies,
): Promise<ArchiveDiskWriteResult> {
  const target = normalizeTargetUrl(input.target);
  const exportedAt = dependencies.now();
  const registry = await fetchRemoteAppRegistry(target, dependencies.fetch);
  const entries = await Promise.all(
    registry.installs.map((install) =>
      buildRemoteAppArchiveEntry({
        exportedAt,
        fetcher: dependencies.fetch,
        install,
        packages: registry.packages,
        target,
      }),
    ),
  );
  const archive: InstanceArchive = {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt,
    capabilities: ["installed-app-registry", "app-store-snapshots", "core-media-assets"],
    restorePolicy: { dryRun: true, installCollisions: "reject" },
    apps: entries.map((entry) => entry.archive),
  };

  return writePortableArchiveDirectory(
    { archive, mediaFiles: entries.flatMap((entry) => entry.mediaFiles), outDir: input.outDir },
    dependencies,
  );
}

export async function exportAppArchive(
  input: {
    installId: string;
    outDir: string;
    target: string;
  },
  dependencies: ArchiveWorkflowDependencies,
): Promise<ArchiveDiskWriteResult> {
  const target = normalizeTargetUrl(input.target);
  const registry = await fetchRemoteAppRegistry(target, dependencies.fetch);
  const install = findAppInstall(registry.installs, input.installId);

  if (!install) {
    throw new Error(`Installed app "${input.installId}" was not found at ${target}.`);
  }

  const entry = await buildRemoteAppArchiveEntry({
    exportedAt: dependencies.now(),
    fetcher: dependencies.fetch,
    install,
    packages: registry.packages,
    target,
  });

  return writePortableArchiveDirectory(
    { archive: entry.archive, mediaFiles: entry.mediaFiles, outDir: input.outDir },
    dependencies,
  );
}

export async function restorePortableArchive(
  input: {
    adminToken?: string | null;
    apply: boolean;
    archiveDir: string;
    replace: boolean;
    target: string;
  },
  dependencies: ArchiveWorkflowDependencies,
): Promise<RestorePortableArchiveResult> {
  const diskArchive = await readPortableArchiveDirectory(input.archiveDir, dependencies);
  const archive = withRestorePolicy(diskArchive.archive, restorePolicy(input));
  const remote = await postRemoteArchiveRestore(
    {
      adminToken: input.adminToken,
      archive,
      mediaFiles: diskArchive.mediaFiles,
      target: input.target,
    },
    dependencies,
  );

  return {
    archivePath: diskArchive.archivePath,
    remote,
  };
}

export async function restoreAppArchive(
  input: {
    adminToken?: string | null;
    apply: boolean;
    archiveDir: string;
    installId: string;
    replace: boolean;
    target: string;
  },
  dependencies: ArchiveWorkflowDependencies,
): Promise<RestorePortableArchiveResult> {
  const diskArchive = await readPortableArchiveDirectory(input.archiveDir, dependencies);

  if (diskArchive.archive.kind !== APP_ARCHIVE_KIND) {
    throw new Error("App archive restore requires a formless.appArchive archive.");
  }

  const archive = withRestorePolicy(
    retargetAppArchive(diskArchive.archive, input.installId),
    restorePolicy(input),
  );
  const remote = await postRemoteArchiveRestore(
    {
      adminToken: input.adminToken,
      archive,
      mediaFiles: diskArchive.mediaFiles,
      target: input.target,
    },
    dependencies,
  );

  return {
    archivePath: diskArchive.archivePath,
    remote,
  };
}

export async function importSiteProjectArchive(
  input: {
    installId: string;
    label?: string | null;
    outDir: string;
    projectPath: string;
  },
  dependencies: ArchiveWorkflowDependencies,
): Promise<ImportSiteProjectArchiveResult> {
  const entry = await readSiteProjectAppArchiveEntry({
    exportedAt: dependencies.now(),
    installId: input.installId,
    label: input.label ?? undefined,
    projectRoot: path.resolve(dependencies.cwd, input.projectPath),
  });
  const write = await writePortableArchiveDirectory(
    { archive: entry.archive, mediaFiles: entry.mediaFiles, outDir: input.outDir },
    dependencies,
  );

  return {
    ...write,
    report: entry.report,
  };
}

function restorePolicy(input: { apply: boolean; replace: boolean }): ArchiveRestorePolicy {
  return {
    dryRun: !input.apply,
    installCollisions: input.replace ? "replace" : "reject",
  };
}

async function buildRemoteAppArchiveEntry(input: {
  exportedAt: string;
  fetcher: typeof fetch;
  install: AppInstall;
  packages: readonly BundledAppPackage[];
  target: string;
}): Promise<{ archive: AppArchive; mediaFiles: ArchiveDiskMediaFile[] }> {
  const packageApp = findBundledAppPackage(input.install.packageAppKey);
  const registryPackage = input.packages.find(
    (candidate) => candidate.packageAppKey === input.install.packageAppKey,
  );
  const sourceSchemaKey = registryPackage?.sourceSchemaKey ?? packageApp?.sourceSchemaKey;
  const snapshot = await fetchJson<StoreSnapshot>(
    input.fetcher,
    apiUrl(input.target, appApiPath(input.install, "/snapshot")),
    { headers: { accept: "application/json" } },
  );

  if (!sourceSchemaKey) {
    throw new Error(`Installed app "${input.install.installId}" uses unsupported package.`);
  }

  const media = await exportRemoteAppMedia({
    fetcher: input.fetcher,
    install: input.install,
    records: snapshot.records,
    target: input.target,
  });
  const archive: AppArchive = {
    kind: APP_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: input.exportedAt,
    capabilities: ["app-store-snapshots", "core-media-assets"],
    restorePolicy: { dryRun: true, installCollisions: "reject" },
    app: {
      installId: input.install.installId,
      packageAppKey: input.install.packageAppKey,
      sourceSchemaKey,
      label: input.install.label,
      status: input.install.status,
      createdAt: input.install.createdAt,
      updatedAt: input.install.updatedAt,
    },
    data: {
      kind: "storeSnapshot",
      snapshot,
    },
    media: {
      objects: media.objects,
    },
  };

  return {
    archive,
    mediaFiles: media.files,
  };
}

async function exportRemoteAppMedia(input: {
  fetcher: typeof fetch;
  install: AppInstall;
  records: readonly StoredRecord[];
  target: string;
}): Promise<{ files: ArchiveDiskMediaFile[]; objects: AppArchiveMediaObject[] }> {
  const references = appMediaReferences(input.records);
  const files: ArchiveDiskMediaFile[] = [];
  const objects: AppArchiveMediaObject[] = [];

  for (const reference of references) {
    const response = await input.fetcher(apiUrl(input.target, reference.deliveryHref), {
      headers: { accept: reference.contentType },
    });

    if (!response.ok) {
      throw new Error(
        `Failed GET ${apiUrl(input.target, reference.deliveryHref)}: HTTP ${
          response.status
        } ${await response.text()}`,
      );
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const archivePath = `media/${input.install.installId}/${reference.storageKey}`;

    objects.push({
      archivePath,
      ...(reference.asset
        ? { asset: mediaAssetForArchiveObject(reference.asset, bytes.byteLength) }
        : {}),
      byteSize: bytes.byteLength,
      contentType: reference.contentType,
      deliveryHref: reference.deliveryHref,
      storageKey: reference.storageKey,
    });
    files.push({
      archivePath,
      byteSize: bytes.byteLength,
      bytes,
      contentType: reference.contentType,
    });
  }

  return { files, objects };
}

function appMediaReferences(records: readonly StoredRecord[]): AppArchiveMediaObject[] {
  const referencesByKey = new Map<string, AppArchiveMediaObject>();

  for (const record of records) {
    if (record.deletedAt !== undefined) {
      continue;
    }

    for (const [fieldName, value] of Object.entries(record.values)) {
      if (fieldName === "mediaAssetId" && typeof value === "string") {
        const facts = coreImageMediaDeliveryFactsForAssetId(value);

        if (facts) {
          referencesByKey.set(facts.storageKey, coreMediaReference(facts.storageKey, facts.href));
        }
      }

      if (typeof value === "string") {
        const coreStorageKey = storageKeyFromDeliveryHref(value, CORE_MEDIA_ROUTE_PREFIX);

        if (
          coreStorageKey &&
          isRestorableImageMediaKey(coreStorageKey, {
            keyPrefix: mediaKeyPrefix(CORE_IMAGE_KEY_PREFIX),
          }) &&
          !referencesByKey.has(coreStorageKey)
        ) {
          referencesByKey.set(
            coreStorageKey,
            coreMediaReference(coreStorageKey, coreMediaHrefForKey(coreStorageKey)),
          );
          continue;
        }

        if (isLegacySiteMediaHref(value)) {
          throw new Error(legacySiteMediaMigrationMessage(value, "archive export"));
        }
      }
    }
  }

  return [...referencesByKey.values()].sort((left, right) =>
    left.storageKey.localeCompare(right.storageKey),
  );
}

function coreMediaReference(storageKey: string, deliveryHref: string): AppArchiveMediaObject {
  const contentType = imageMediaContentTypeForKey(storageKey);
  const assetId = storageKey.startsWith(mediaKeyPrefix(CORE_IMAGE_KEY_PREFIX))
    ? storageKey.slice(mediaKeyPrefix(CORE_IMAGE_KEY_PREFIX).length)
    : storageKey;

  if (!contentType) {
    throw new Error(`Media key "${storageKey}" has unsupported content type.`);
  }

  return {
    archivePath: "",
    asset: {
      byteSize: 0,
      contentType,
      deliveryHref,
      id: assetId,
      kind: "image",
      label: assetId,
      provider: "r2",
      status: "ready",
      storageKey,
    },
    byteSize: 0,
    contentType,
    deliveryHref,
    storageKey,
  };
}

function mediaAssetForArchiveObject(asset: MediaAsset, byteSize: number): MediaAsset {
  return {
    ...asset,
    byteSize,
  };
}

function storageKeyFromDeliveryHref(href: string, routePrefix: string): string | undefined {
  const prefix = routePrefix.endsWith("/") ? routePrefix : `${routePrefix}/`;

  return href.startsWith(prefix) ? href.slice(prefix.length) : undefined;
}

function mediaKeyPrefix(prefix: string): string {
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}

async function fetchRemoteAppRegistry(
  target: string,
  fetcher: typeof fetch,
): Promise<AppInstallsResponse> {
  return fetchJson<AppInstallsResponse>(fetcher, apiUrl(target, "/api/formless/app-installs"), {
    headers: { accept: "application/json" },
  });
}

async function postRemoteArchiveRestore(
  input: {
    adminToken?: string | null;
    archive: PortableArchive;
    mediaFiles: readonly ArchiveDiskMediaFile[];
    target: string;
  },
  dependencies: ArchiveWorkflowDependencies,
): Promise<ArchiveRestoreRemoteResult> {
  const target = normalizeTargetUrl(input.target);

  return fetchJson<ArchiveRestoreRemoteResult>(
    dependencies.fetch,
    apiUrl(target, INSTANCE_ARCHIVE_RESTORE_API_PATH),
    {
      body: JSON.stringify({
        archive: input.archive,
        mediaFiles: input.mediaFiles.map(archiveRestoreRequestMediaFile),
      }),
      headers: archiveRestoreRequestHeaders(input.adminToken, dependencies.env),
      method: "POST",
    },
  );
}

function archiveRestoreRequestHeaders(
  adminToken: string | null | undefined,
  env: NodeJS.ProcessEnv | undefined,
): Headers {
  const headers = new Headers({ accept: "application/json", "content-type": "application/json" });
  const token = adminToken ?? env?.FORMLESS_ADMIN_TOKEN;

  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  return headers;
}

function archiveRestoreRequestMediaFile(file: ArchiveDiskMediaFile) {
  return {
    archivePath: file.archivePath,
    byteSize: file.byteSize,
    bytesBase64: Buffer.from(file.bytes).toString("base64"),
    contentType: file.contentType,
  };
}

async function writePortableArchiveDirectory(
  input: {
    archive: PortableArchive;
    mediaFiles: readonly (ArchiveDiskMediaFile | SiteProjectAppArchiveMediaFile)[];
    outDir: string;
  },
  dependencies: Pick<ArchiveWorkflowDependencies, "cwd">,
): Promise<ArchiveDiskWriteResult> {
  const archiveDir = path.resolve(dependencies.cwd, input.outDir);
  const archivePath = path.join(archiveDir, PORTABLE_ARCHIVE_MANIFEST_FILE);

  await mkdir(archiveDir, { recursive: true });
  await writeFile(archivePath, formatPortableArchive(input.archive));

  for (const file of input.mediaFiles) {
    const filePath = path.join(archiveDir, assertArchiveRelativePath(file.archivePath));

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, file.bytes);
  }

  return {
    appCount: archiveApps(input.archive).length,
    archivePath,
    mediaCount: input.mediaFiles.length,
    recordCount: archiveRecordCount(input.archive),
  };
}

async function readPortableArchiveDirectory(
  archiveDirInput: string,
  dependencies: Pick<ArchiveWorkflowDependencies, "cwd">,
): Promise<{
  archive: PortableArchive;
  archivePath: string;
  mediaFiles: ArchiveDiskMediaFile[];
}> {
  const archiveDir = path.resolve(dependencies.cwd, archiveDirInput);
  const archivePath = path.join(archiveDir, PORTABLE_ARCHIVE_MANIFEST_FILE);
  const archive = parsePortableArchive(JSON.parse(await readFile(archivePath, "utf8")) as unknown);
  const mediaFiles = await Promise.all(
    archiveApps(archive).flatMap((app) =>
      app.media.objects.map(async (object) => {
        const bytes = new Uint8Array(
          await readFile(path.join(archiveDir, assertArchiveRelativePath(object.archivePath))),
        );

        return {
          archivePath: object.archivePath,
          byteSize: bytes.byteLength,
          bytes,
          contentType: object.contentType,
        };
      }),
    ),
  );

  return { archive, archivePath, mediaFiles };
}

function retargetAppArchive(archive: AppArchive, installId: string): AppArchive {
  const nextArchive = parseAppArchive(jsonClone(archive));

  if (nextArchive.app.installId === installId) {
    return nextArchive;
  }

  const previousIdentity = installedAppStorageIdentity({
    installId: nextArchive.app.installId,
    packageAppKey: nextArchive.app.packageAppKey,
  });
  const nextIdentity = installedAppStorageIdentity({
    installId,
    packageAppKey: nextArchive.app.packageAppKey,
  });

  if (!previousIdentity || !nextIdentity) {
    throw new Error(`App archive cannot restore into install "${installId}".`);
  }

  nextArchive.app.installId = nextIdentity.installId;
  nextArchive.media.objects = nextArchive.media.objects.map((object) =>
    retargetMediaObject(object, previousIdentity, nextIdentity),
  );
  nextArchive.data = retargetArchiveData(nextArchive.data, previousIdentity, nextIdentity);

  return nextArchive;
}

function retargetMediaObject(
  object: AppArchiveMediaObject,
  previousIdentity: InstalledAppStorageIdentity,
  nextIdentity: InstalledAppStorageIdentity,
): AppArchiveMediaObject {
  const previousMedia = legacySiteMediaStorageIdentity(previousIdentity);
  const nextMedia = legacySiteMediaStorageIdentity(nextIdentity);

  if (!previousMedia || !nextMedia) {
    return { ...object };
  }

  if (!object.storageKey.startsWith(mediaKeyPrefix(previousMedia.imageKeyPrefix))) {
    return { ...object };
  }

  const storageKey = retargetMediaStorageKey(
    object.storageKey,
    previousMedia.imageKeyPrefix,
    nextMedia.imageKeyPrefix,
  );

  return {
    ...object,
    deliveryHref: `${nextMedia.routePrefix}/${storageKey}`,
    storageKey,
  };
}

function retargetArchiveData(
  data: AppArchiveData,
  previousIdentity: InstalledAppStorageIdentity,
  nextIdentity: InstalledAppStorageIdentity,
): AppArchiveData {
  if (data.kind === "storeSnapshot") {
    return {
      kind: "storeSnapshot",
      snapshot: {
        ...data.snapshot,
        records: data.snapshot.records.map((record) =>
          retargetStoredRecord(record, previousIdentity, nextIdentity),
        ),
      },
    };
  }

  return {
    ...data,
    records: data.records.map((record) =>
      retargetSourceRecord(record, previousIdentity, nextIdentity),
    ),
  };
}

function retargetStoredRecord(
  record: StoredRecord,
  previousIdentity: InstalledAppStorageIdentity,
  nextIdentity: InstalledAppStorageIdentity,
): StoredRecord {
  return {
    ...record,
    values: retargetRecordValues(record.values, previousIdentity, nextIdentity),
  };
}

function retargetSourceRecord(
  record: SourceArchiveRecord,
  previousIdentity: InstalledAppStorageIdentity,
  nextIdentity: InstalledAppStorageIdentity,
): SourceArchiveRecord {
  return {
    ...record,
    values: retargetRecordValues(record.values, previousIdentity, nextIdentity),
  };
}

function retargetRecordValues(
  values: StoredRecord["values"],
  previousIdentity: InstalledAppStorageIdentity,
  nextIdentity: InstalledAppStorageIdentity,
): StoredRecord["values"] {
  const previousMedia = legacySiteMediaStorageIdentity(previousIdentity);
  const nextMedia = legacySiteMediaStorageIdentity(nextIdentity);

  if (!previousMedia || !nextMedia) {
    return { ...values };
  }

  const previousRoutePrefix = `${previousMedia.routePrefix}/`;
  const nextRoutePrefix = `${nextMedia.routePrefix}/`;

  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      typeof value === "string" && value.startsWith(previousRoutePrefix)
        ? `${nextRoutePrefix}${retargetMediaStorageKey(
            value.slice(previousRoutePrefix.length),
            previousMedia.imageKeyPrefix,
            nextMedia.imageKeyPrefix,
          )}`
        : value,
    ]),
  );
}

function retargetMediaStorageKey(
  storageKey: string,
  previousPrefixInput: string,
  nextPrefixInput: string,
): string {
  const previousPrefix = previousPrefixInput.endsWith("/")
    ? previousPrefixInput
    : `${previousPrefixInput}/`;
  const nextPrefix = nextPrefixInput.endsWith("/") ? nextPrefixInput : `${nextPrefixInput}/`;

  if (!storageKey.startsWith(previousPrefix)) {
    throw new Error(`App archive media key "${storageKey}" does not match the source install id.`);
  }

  return `${nextPrefix}${storageKey.slice(previousPrefix.length)}`;
}

function withRestorePolicy(
  archive: PortableArchive,
  policy: ArchiveRestorePolicy,
): PortableArchive {
  const nextArchive = parsePortableArchive(jsonClone(archive));

  nextArchive.restorePolicy = policy;

  if (nextArchive.kind === INSTANCE_ARCHIVE_KIND) {
    nextArchive.apps = nextArchive.apps.map((app) => ({
      ...app,
      restorePolicy: policy,
    }));
  }

  return nextArchive;
}

function formatPortableArchive(archive: PortableArchive): string {
  return archive.kind === INSTANCE_ARCHIVE_KIND
    ? formatInstanceArchive(archive)
    : formatAppArchive(archive);
}

function archiveApps(archive: PortableArchive): AppArchive[] {
  return archive.kind === INSTANCE_ARCHIVE_KIND ? archive.apps : [archive];
}

function archiveRecordCount(archive: PortableArchive): number {
  return archiveApps(archive).reduce((count, app) => count + appRecordCount(app), 0);
}

function appRecordCount(app: AppArchive): number {
  return app.data.kind === "storeSnapshot"
    ? app.data.snapshot.records.length
    : app.data.records.length;
}

function appApiPath(install: AppInstall, suffix: `/${string}`): string {
  return `/api/app-installs/${install.packageAppKey}/${install.installId}${suffix}`;
}

function apiUrl(target: string, pathInput: string): string {
  const pathname = pathInput.startsWith("/") ? pathInput.slice(1) : pathInput;

  return new URL(pathname, `${target}/`).toString();
}

function normalizeTargetUrl(value: string): string {
  try {
    const url = new URL(value);

    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`Target URL is invalid: ${value}`);
  }
}

async function fetchJson<T>(fetcher: typeof fetch, url: string, init?: RequestInit): Promise<T> {
  const response = await fetcher(url, init);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Failed ${init?.method ?? "GET"} ${url}: HTTP ${response.status} ${text}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Failed ${init?.method ?? "GET"} ${url}: response was not JSON.`);
  }
}

function assertArchiveRelativePath(value: string): string {
  const segments = value.split("/");

  if (
    value.trim() === "" ||
    value !== value.trim() ||
    value.startsWith("/") ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`Archive path is not safe: ${value}`);
  }

  return value;
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
