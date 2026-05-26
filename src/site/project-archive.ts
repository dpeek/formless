import {
  APP_ARCHIVE_KIND,
  ARCHIVE_VERSION,
  type AppArchive,
  type AppArchiveMediaObject,
  type ArchiveRestorePolicy,
  type SourceArchiveRecord,
} from "../shared/archive.ts";
import { validateAppInstallId } from "../shared/app-installs.ts";
import {
  installedAppStorageIdentity,
  legacySiteMediaStorageIdentity,
} from "../shared/app-storage-identity.ts";
import type { StoredRecord } from "../shared/protocol.ts";
import type { AppSchema } from "../shared/schema.ts";
import type { ArchiveRestoreMediaFile } from "../shared/archive-restore-plan.ts";
import {
  CORE_IMAGE_KEY_PREFIX,
  coreMediaHrefForKey,
  isRestorableImageMediaKey,
} from "../media/core.ts";
import {
  packageSiteSourceSchema,
  parseSiteProjectRecords,
  siteProjectMediaAssetsFromRecords,
} from "./project-source.ts";
import {
  readSiteProjectMediaFiles,
  readSiteProjectSource,
  type SiteProjectMediaFile,
} from "./project-files.ts";
import { siteMediaKeyFromHref } from "./source-media.ts";

export type SiteProjectAppArchiveMediaFile = ArchiveRestoreMediaFile & {
  bytes: Uint8Array;
  sourceKey: string;
  sourcePath: string;
  storageKey: string;
};

export type SiteProjectAppArchiveReport = {
  installId: string;
  label: string;
  mediaCount: number;
  recordCount: number;
  recordCountsByEntity: Record<string, number>;
  rewrittenMediaHrefs: SiteProjectMediaHrefRewrite[];
};

export type SiteProjectMediaHrefRewrite = {
  nextHref: string;
  previousHref: string;
  recordId: string;
  storageKey: string;
};

export type SiteProjectAppArchiveEntry = {
  archive: AppArchive;
  mediaFiles: SiteProjectAppArchiveMediaFile[];
  report: SiteProjectAppArchiveReport;
};

export type BuildSiteProjectAppArchiveEntryInput = {
  createdAt?: string;
  exportedAt: string;
  installId: string;
  label?: string;
  mediaFiles: readonly SiteProjectMediaFile[];
  records: readonly StoredRecord[];
  restorePolicy?: ArchiveRestorePolicy;
  schemaUpdatedAt?: string;
  sourceSchema?: AppSchema;
  updatedAt?: string;
};

export async function readSiteProjectAppArchiveEntry(input: {
  createdAt?: string;
  exportedAt: string;
  installId: string;
  label?: string;
  projectRoot: string;
  restorePolicy?: ArchiveRestorePolicy;
  schemaUpdatedAt?: string;
  sourceSchema?: AppSchema;
  updatedAt?: string;
}): Promise<SiteProjectAppArchiveEntry> {
  const project = await readSiteProjectSource(input.projectRoot);
  const mediaFiles = await readSiteProjectMediaFiles(project);

  return buildSiteProjectAppArchiveEntry({
    createdAt: input.createdAt,
    exportedAt: input.exportedAt,
    installId: input.installId,
    label: input.label,
    mediaFiles,
    records: project.records,
    restorePolicy: input.restorePolicy,
    schemaUpdatedAt: input.schemaUpdatedAt,
    sourceSchema: input.sourceSchema,
    updatedAt: input.updatedAt,
  });
}

export function buildSiteProjectAppArchiveEntry(
  input: BuildSiteProjectAppArchiveEntryInput,
): SiteProjectAppArchiveEntry {
  const installId = parseTargetInstallId(input.installId);
  const identity = installedAppStorageIdentity({ installId, packageAppKey: "site" });
  const legacySiteMedia = legacySiteMediaStorageIdentity(identity);

  if (!identity || !legacySiteMedia) {
    throw new Error(`Site project import target "${installId}" does not support Site media.`);
  }

  const sourceSchema = input.sourceSchema ?? packageSiteSourceSchema;
  const records = parseSiteProjectRecords(input.records, { sourceSchema });
  const mediaAssets = siteProjectMediaAssetsFromRecords(records);
  const mediaFilesByKey = new Map(input.mediaFiles.map((file) => [file.key, file]));
  const mediaObjects: AppArchiveMediaObject[] = [];
  const archiveMediaFiles: SiteProjectAppArchiveMediaFile[] = [];
  const storageKeyBySourceKey = new Map<string, string>();

  for (const asset of mediaAssets) {
    const mediaFile = mediaFilesByKey.get(asset.key);

    if (!mediaFile) {
      throw new Error(
        `Site project import is missing media file "${asset.sourcePath}" for "${asset.href}".`,
      );
    }

    const storageKey = archiveStorageKeyForProjectMedia(legacySiteMedia.imageKeyPrefix, asset.key);
    const archivePath = archiveMediaPath(installId, asset.key);
    const contentType = asset.contentType;
    const byteSize = mediaFile.bytes.byteLength;
    const deliveryHref = isCoreMediaKey(asset.key)
      ? coreMediaHrefForKey(storageKey)
      : installScopedDeliveryHref(legacySiteMedia.routePrefix, storageKey);

    if (!isCoreMediaKey(asset.key)) {
      storageKeyBySourceKey.set(asset.key, storageKey);
    }
    mediaObjects.push({
      archivePath,
      ...(isCoreMediaKey(asset.key)
        ? {
            asset: {
              byteSize,
              contentType,
              deliveryHref,
              id: asset.key.slice(mediaKeyPrefix(CORE_IMAGE_KEY_PREFIX).length),
              kind: "image" as const,
              label: asset.key.slice(mediaKeyPrefix(CORE_IMAGE_KEY_PREFIX).length),
              provider: "r2",
              status: "ready" as const,
              storageKey,
            },
          }
        : {}),
      byteSize,
      contentType,
      deliveryHref,
      storageKey,
    });
    archiveMediaFiles.push({
      archivePath,
      byteSize,
      bytes: copyBytes(mediaFile.bytes),
      contentType,
      sourceKey: asset.key,
      sourcePath: mediaFile.sourcePath,
      storageKey,
    });
  }

  const rewriteResult = rewriteSiteProjectMediaHrefs(records, {
    routePrefix: legacySiteMedia.routePrefix,
    storageKeyBySourceKey,
  });
  const label = siteProjectArchiveLabel(input.label, rewriteResult.records, installId);
  const timestamp = input.exportedAt;
  const archive: AppArchive = {
    kind: APP_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: input.exportedAt,
    capabilities: ["source-records", "app-scoped-media", "core-media-assets"],
    restorePolicy: input.restorePolicy ?? { dryRun: true, installCollisions: "reject" },
    app: {
      installId,
      packageAppKey: "site",
      sourceSchemaKey: "site",
      label,
      status: "installed",
      createdAt: input.createdAt ?? timestamp,
      updatedAt: input.updatedAt ?? timestamp,
    },
    data: {
      kind: "sourceRecords",
      schemaKey: "site",
      schemaUpdatedAt: input.schemaUpdatedAt ?? timestamp,
      schema: sourceSchema,
      records: rewriteResult.records.map(sourceArchiveRecord),
    },
    media: {
      objects: mediaObjects,
    },
  };

  return {
    archive,
    mediaFiles: archiveMediaFiles.sort((left, right) =>
      left.archivePath.localeCompare(right.archivePath),
    ),
    report: {
      installId,
      label,
      mediaCount: mediaObjects.length,
      recordCount: rewriteResult.records.length,
      recordCountsByEntity: recordCountsByEntity(rewriteResult.records),
      rewrittenMediaHrefs: rewriteResult.rewrites,
    },
  };
}

function parseTargetInstallId(value: string): string {
  const result = validateAppInstallId(value);

  if (!result.ok) {
    throw new Error(`Site project import install id is invalid: ${result.error.message}`);
  }

  return result.installId;
}

function rewriteSiteProjectMediaHrefs(
  records: readonly StoredRecord[],
  options: {
    routePrefix: string;
    storageKeyBySourceKey: Map<string, string>;
  },
): {
  records: StoredRecord[];
  rewrites: SiteProjectMediaHrefRewrite[];
} {
  const rewrites: SiteProjectMediaHrefRewrite[] = [];
  const rewrittenRecords = records.map((record) => {
    const href = record.values.href;
    const sourceKey = typeof href === "string" ? siteMediaKeyFromHref(href) : undefined;
    const storageKey = sourceKey ? options.storageKeyBySourceKey.get(sourceKey) : undefined;

    if (!sourceKey || !storageKey || typeof href !== "string") {
      return {
        id: record.id,
        entity: record.entity,
        values: { ...record.values },
        createdAt: record.createdAt,
      };
    }

    const nextHref = installScopedDeliveryHref(options.routePrefix, storageKey);

    rewrites.push({
      nextHref,
      previousHref: href,
      recordId: record.id,
      storageKey,
    });

    return {
      id: record.id,
      entity: record.entity,
      values: {
        ...record.values,
        href: nextHref,
      },
      createdAt: record.createdAt,
    };
  });

  return {
    records: rewrittenRecords,
    rewrites: rewrites.sort((left, right) => {
      const recordOrder = left.recordId.localeCompare(right.recordId);

      return recordOrder === 0 ? left.previousHref.localeCompare(right.previousHref) : recordOrder;
    }),
  };
}

function sourceArchiveRecord(record: StoredRecord): SourceArchiveRecord {
  return {
    id: record.id,
    entity: record.entity,
    values: { ...record.values },
    createdAt: record.createdAt,
  };
}

function siteProjectArchiveLabel(
  inputLabel: string | undefined,
  records: readonly StoredRecord[],
  installId: string,
): string {
  const label =
    inputLabel ??
    records.find((record) => record.entity === "site" && typeof record.values.label === "string")
      ?.values.label;

  return typeof label === "string" && label.trim() !== "" ? label.trim() : installId;
}

function archiveStorageKeyForProjectMedia(imageKeyPrefix: string, sourceKey: string): string {
  if (isCoreMediaKey(sourceKey)) {
    return sourceKey;
  }

  return installScopedStorageKey(imageKeyPrefix, sourceKey);
}

function installScopedStorageKey(imageKeyPrefix: string, sourceKey: string): string {
  const sourceImageSegment = "site/images/";

  if (!sourceKey.startsWith(sourceImageSegment)) {
    throw new Error(`Site project media key is not importable: ${sourceKey}`);
  }

  return `${mediaKeyPrefix(imageKeyPrefix)}${sourceKey.slice(sourceImageSegment.length)}`;
}

function installScopedDeliveryHref(routePrefix: string, storageKey: string): string {
  const prefix = routePrefix.endsWith("/") ? routePrefix.slice(0, -1) : routePrefix;

  return `${prefix}/${storageKey}`;
}

function archiveMediaPath(installId: string, sourceKey: string): string {
  return `media/${installId}/${sourceKey}`;
}

function mediaKeyPrefix(prefix: string): string {
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}

function isCoreMediaKey(key: string): boolean {
  return isRestorableImageMediaKey(key, { keyPrefix: mediaKeyPrefix(CORE_IMAGE_KEY_PREFIX) });
}

function recordCountsByEntity(records: readonly StoredRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const record of records) {
    counts[record.entity] = (counts[record.entity] ?? 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength);

  copy.set(bytes);
  return copy;
}
