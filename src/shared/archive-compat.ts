import {
  INSTANCE_ARCHIVE_KIND,
  type AppArchive,
  type AppArchiveData,
  type AppArchiveMediaObject,
  type ArchiveCapability,
  type InstanceArchive,
  type PortableArchive,
  type SourceArchiveRecord,
} from "./archive.ts";
import {
  installedAppStorageIdentity,
  legacySiteMediaStorageIdentity,
  schemaKeyStorageIdentity,
  type SiteMediaStorageIdentity,
} from "./app-storage-identity.ts";
import type { RecordValues, StoredRecord } from "./protocol.ts";
import {
  CORE_IMAGE_KEY_PREFIX,
  coreMediaHrefForKey,
  isRestorableImageMediaKey,
  type MediaAsset,
} from "../media/core.ts";

export type ArchiveCompatibilityErrorCode = "invalid-media" | "missing-media-object";

export type ArchiveCompatibilityError = {
  appInstallId?: string;
  code: ArchiveCompatibilityErrorCode;
  entity?: string;
  field?: string;
  message: string;
  recordId?: string;
  storageKey?: string;
};

export type ArchiveCompatibilityResult =
  | {
      archive: PortableArchive;
      ok: true;
    }
  | {
      errors: ArchiveCompatibilityError[];
      ok: false;
    };

type LegacyMediaMapping = {
  assetId: string;
  coreObject: AppArchiveMediaObject;
  legacyHref: string;
};

export function normalizePortableArchiveLegacySiteMedia(
  archive: PortableArchive,
): ArchiveCompatibilityResult {
  if (archive.kind === INSTANCE_ARCHIVE_KIND) {
    const normalizedApps: AppArchive[] = [];
    const errors: ArchiveCompatibilityError[] = [];

    for (const app of archive.apps) {
      const result = normalizeAppArchiveLegacySiteMedia(app);

      if (result.ok) {
        normalizedApps.push(result.archive);
      } else {
        errors.push(...result.errors);
      }
    }

    if (errors.length > 0) {
      return { errors, ok: false };
    }

    const normalizedArchive: InstanceArchive = {
      ...archive,
      apps: normalizedApps,
      capabilities: normalizedCapabilities(archive.capabilities, normalizedApps),
    };

    return { archive: normalizedArchive, ok: true };
  }

  return normalizeAppArchiveLegacySiteMedia(archive);
}

function normalizeAppArchiveLegacySiteMedia(archive: AppArchive):
  | {
      archive: AppArchive;
      ok: true;
    }
  | {
      errors: ArchiveCompatibilityError[];
      ok: false;
    } {
  if (archive.app.packageAppKey !== "site") {
    return { archive, ok: true };
  }

  const scopes = legacySiteMediaScopes(archive);
  const mappingsByHref = new Map<string, LegacyMediaMapping>();
  const mediaObjects = archive.media.objects.map((object) => {
    const mapping = normalizeLegacyMediaObject(object, scopes);

    if (!mapping) {
      return object;
    }

    mappingsByHref.set(mapping.legacyHref, mapping);
    return mapping.coreObject;
  });
  const errors: ArchiveCompatibilityError[] = [];
  const data = normalizeAppArchiveData(archive, mappingsByHref, errors);

  if (errors.length > 0) {
    return { errors, ok: false };
  }

  const normalizedArchive: AppArchive = {
    ...archive,
    capabilities: normalizedCapabilities(archive.capabilities, [
      {
        ...archive,
        media: { objects: mediaObjects },
      },
    ]),
    data,
    media: {
      objects: mediaObjects,
    },
  };

  return { archive: normalizedArchive, ok: true };
}

function legacySiteMediaScopes(archive: AppArchive): SiteMediaStorageIdentity[] {
  const scopes: SiteMediaStorageIdentity[] = [];
  const installedIdentity = installedAppStorageIdentity({
    installId: archive.app.installId,
    packageAppKey: archive.app.packageAppKey,
  });
  const installedMedia = legacySiteMediaStorageIdentity(installedIdentity);
  const schemaMedia = legacySiteMediaStorageIdentity(schemaKeyStorageIdentity("site"));

  if (installedMedia) {
    scopes.push(installedMedia);
  }

  if (schemaMedia) {
    scopes.push(schemaMedia);
  }

  return scopes;
}

function normalizeLegacyMediaObject(
  object: AppArchiveMediaObject,
  scopes: readonly SiteMediaStorageIdentity[],
): LegacyMediaMapping | undefined {
  const scope = scopes.find((candidate) => isLegacyMediaObjectForScope(object, candidate));

  if (!scope) {
    return undefined;
  }

  const assetId = legacyCoreAssetIdForStorageKey(object.storageKey);
  const storageKey = `${mediaKeyPrefix(CORE_IMAGE_KEY_PREFIX)}${assetId}`;
  const deliveryHref = coreMediaHrefForKey(storageKey);
  const asset = coreMediaAssetForLegacyObject(object, {
    assetId,
    deliveryHref,
    storageKey,
  });

  return {
    assetId,
    coreObject: {
      archivePath: object.archivePath,
      asset,
      byteSize: object.byteSize,
      contentType: object.contentType,
      deliveryHref,
      storageKey,
    },
    legacyHref: `${scope.routePrefix}/${object.storageKey}`,
  };
}

function isLegacyMediaObjectForScope(
  object: AppArchiveMediaObject,
  scope: SiteMediaStorageIdentity,
): boolean {
  return (
    isRestorableImageMediaKey(object.storageKey, {
      keyPrefix: mediaKeyPrefix(scope.imageKeyPrefix),
    }) && object.deliveryHref === `${scope.routePrefix}/${object.storageKey}`
  );
}

function normalizeAppArchiveData(
  archive: AppArchive,
  mappingsByHref: ReadonlyMap<string, LegacyMediaMapping>,
  errors: ArchiveCompatibilityError[],
): AppArchiveData {
  if (archive.data.kind === "storeSnapshot") {
    return {
      kind: "storeSnapshot",
      snapshot: {
        ...archive.data.snapshot,
        records: archive.data.snapshot.records.map((record) =>
          normalizeStoredRecord(archive, record, mappingsByHref, errors),
        ),
      },
    };
  }

  return {
    kind: "sourceRecords",
    records: archive.data.records.map((record) =>
      normalizeSourceRecord(archive, record, mappingsByHref, errors),
    ),
    schema: archive.data.schema,
    schemaKey: archive.data.schemaKey,
    schemaUpdatedAt: archive.data.schemaUpdatedAt,
  };
}

function normalizeStoredRecord(
  archive: AppArchive,
  record: StoredRecord,
  mappingsByHref: ReadonlyMap<string, LegacyMediaMapping>,
  errors: ArchiveCompatibilityError[],
): StoredRecord {
  return {
    ...record,
    values: normalizeRecordValues(archive, record, mappingsByHref, errors),
  };
}

function normalizeSourceRecord(
  archive: AppArchive,
  record: SourceArchiveRecord,
  mappingsByHref: ReadonlyMap<string, LegacyMediaMapping>,
  errors: ArchiveCompatibilityError[],
): SourceArchiveRecord {
  return {
    ...record,
    values: normalizeRecordValues(archive, record, mappingsByHref, errors),
  };
}

function normalizeRecordValues(
  archive: AppArchive,
  record: Pick<StoredRecord, "entity" | "id" | "values">,
  mappingsByHref: ReadonlyMap<string, LegacyMediaMapping>,
  errors: ArchiveCompatibilityError[],
): RecordValues {
  const values: RecordValues = { ...record.values };
  const href = typeof values.href === "string" ? values.href : undefined;
  const mapping = href ? mappingsByHref.get(href) : undefined;

  if (mapping && record.entity === "block" && values.type === "image") {
    values.mediaAssetId = mapping.assetId;
    delete values.href;
  }

  for (const [fieldName, value] of Object.entries(values)) {
    if (typeof value !== "string" || !isLegacySiteMediaHref(value)) {
      continue;
    }

    errors.push({
      appInstallId: archive.app.installId,
      code: "missing-media-object",
      entity: record.entity,
      field: `${record.entity}.${fieldName}`,
      message: `Archive app "${archive.app.installId}" record "${record.id}" field "${record.entity}.${fieldName}" references legacy Site media that cannot be normalized to core media.`,
      recordId: record.id,
    });
  }

  return values;
}

function normalizedCapabilities(
  capabilities: readonly ArchiveCapability[],
  apps: readonly AppArchive[],
): ArchiveCapability[] {
  const set = new Set<ArchiveCapability>(
    capabilities.filter((capability) => capability !== "app-scoped-media"),
  );

  if (apps.some((app) => app.media.objects.length > 0)) {
    set.add("core-media-assets");
  }

  return archiveCapabilityOrder.filter((capability) => set.has(capability));
}

function coreMediaAssetForLegacyObject(
  object: AppArchiveMediaObject,
  input: {
    assetId: string;
    deliveryHref: string;
    storageKey: string;
  },
): MediaAsset {
  return {
    byteSize: object.byteSize,
    contentType: object.contentType,
    deliveryHref: input.deliveryHref,
    ...(object.asset?.filename ? { filename: object.asset.filename } : {}),
    ...(object.asset?.height === undefined ? {} : { height: object.asset.height }),
    id: input.assetId,
    kind: "image",
    label: object.asset?.label ?? mediaLabelForStorageKey(object.storageKey),
    provider: "r2",
    status: "ready",
    storageKey: input.storageKey,
    ...(object.asset?.width === undefined ? {} : { width: object.asset.width }),
  };
}

function legacyCoreAssetIdForStorageKey(storageKey: string): string {
  return `legacy-site-${storageKey.replace(/[^A-Za-z0-9._-]+/g, "__")}`;
}

function mediaLabelForStorageKey(storageKey: string): string {
  return storageKey.split("/").pop() ?? storageKey;
}

function isLegacySiteMediaHref(value: string): boolean {
  return (
    value.startsWith("/api/site/media/") || /^\/api\/app-installs\/site\/[^/]+\/media\//.test(value)
  );
}

function mediaKeyPrefix(prefix: string): string {
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}

const archiveCapabilityOrder: ArchiveCapability[] = [
  "installed-app-registry",
  "app-store-snapshots",
  "source-records",
  "app-scoped-media",
  "core-media-assets",
];
