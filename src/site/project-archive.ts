import {
  APP_ARCHIVE_KIND,
  ARCHIVE_VERSION,
  type AppArchive,
  type AppArchiveMediaObject,
  type ArchiveRestoreMediaFile,
  type ArchiveRestorePolicy,
  type SourceArchiveRecord,
} from "@dpeek/formless-archive";
import { packageAppFactsForKey, validateAppInstallId } from "../shared/app-installs.ts";
import type { StoredRecord } from "../shared/protocol.ts";
import type { AppSchema } from "@dpeek/formless-schema";
import { CORE_IMAGE_KEY_PREFIX, coreMediaHrefForKey } from "@dpeek/formless-media";
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
  const sourceSchema = input.sourceSchema ?? packageSiteSourceSchema;
  const records = parseSiteProjectRecords(input.records, { sourceSchema });
  const mediaAssets = siteProjectMediaAssetsFromRecords(records);
  const mediaFilesByKey = new Map(input.mediaFiles.map((file) => [file.key, file]));
  const mediaObjects: AppArchiveMediaObject[] = [];
  const archiveMediaFiles: SiteProjectAppArchiveMediaFile[] = [];

  for (const asset of mediaAssets) {
    const mediaFile = mediaFilesByKey.get(asset.key);

    if (!mediaFile) {
      throw new Error(
        `Site project import is missing media file "${asset.sourcePath}" for "${asset.href}".`,
      );
    }

    const storageKey = asset.key;
    const archivePath = archiveMediaPath(installId, asset.key);
    const contentType = asset.contentType;
    const byteSize = mediaFile.bytes.byteLength;
    const deliveryHref = coreMediaHrefForKey(storageKey);

    mediaObjects.push({
      archivePath,
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

  const label = siteProjectArchiveLabel(input.label, records, installId);
  const timestamp = input.exportedAt;
  const packageFacts = packageAppFactsForKey("site");

  if (!packageFacts) {
    throw new Error("Site package facts are unavailable for archive export.");
  }

  const archive: AppArchive = {
    kind: APP_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: input.exportedAt,
    capabilities:
      mediaObjects.length > 0 ? ["source-records", "core-media-assets"] : ["source-records"],
    restorePolicy: input.restorePolicy ?? { dryRun: true, installCollisions: "reject" },
    app: {
      installId,
      packageAppKey: "site",
      packageRevision: packageFacts.packageRevision,
      sourceSchemaKey: "site",
      sourceSchemaHash: packageFacts.sourceSchemaHash,
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
      records: records.map(sourceArchiveRecord),
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
      recordCount: records.length,
      recordCountsByEntity: recordCountsByEntity(records),
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

function archiveMediaPath(installId: string, sourceKey: string): string {
  return `media/${installId}/${sourceKey}`;
}

function mediaKeyPrefix(prefix: string): string {
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
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
