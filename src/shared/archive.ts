import { validateAppInstallId } from "./app-installs.ts";
import {
  parseStoreSnapshot,
  type RecordValues,
  type StoreSnapshot,
  type StoredRecord,
} from "./protocol.ts";
import { parseAppSchema, type AppSchema } from "./schema.ts";
import type { MediaAsset } from "@dpeek/formless-media";

export const INSTANCE_ARCHIVE_KIND = "formless.instanceArchive";
export const APP_ARCHIVE_KIND = "formless.appArchive";
export const ARCHIVE_VERSION = 1;

export const archiveCapabilities = [
  "installed-app-registry",
  "app-store-snapshots",
  "source-records",
  "core-media-assets",
] as const;

export type ArchiveCapability = (typeof archiveCapabilities)[number];

export type RestorePolicyInstallCollisions = "reject" | "replace";

export type ArchiveRestorePolicy = {
  dryRun: boolean;
  installCollisions: RestorePolicyInstallCollisions;
};

export type ArchivedAppInstall = {
  installId: string;
  packageAppKey: string;
  sourceSchemaKey: string;
  label: string;
  status: "installed";
  createdAt: string;
  updatedAt: string;
};

export type SourceArchiveRecord = {
  id: string;
  entity: string;
  values: RecordValues;
  createdAt: string;
};

export type AppArchiveStoreSnapshotData = {
  kind: "storeSnapshot";
  snapshot: StoreSnapshot;
};

export type AppArchiveSourceRecordsData = {
  kind: "sourceRecords";
  schemaKey: string;
  schemaUpdatedAt: string;
  schema: AppSchema;
  records: SourceArchiveRecord[];
};

export type AppArchiveData = AppArchiveStoreSnapshotData | AppArchiveSourceRecordsData;

export type AppArchiveMediaObject = {
  asset?: MediaAsset;
  storageKey: string;
  archivePath: string;
  contentType: string;
  byteSize: number;
  deliveryHref: string;
};

export type AppArchiveMediaManifest = {
  objects: AppArchiveMediaObject[];
};

export type AppArchive = {
  kind: typeof APP_ARCHIVE_KIND;
  version: typeof ARCHIVE_VERSION;
  exportedAt: string;
  capabilities: ArchiveCapability[];
  restorePolicy: ArchiveRestorePolicy;
  app: ArchivedAppInstall;
  data: AppArchiveData;
  media: AppArchiveMediaManifest;
};

export type InstanceArchive = {
  kind: typeof INSTANCE_ARCHIVE_KIND;
  version: typeof ARCHIVE_VERSION;
  exportedAt: string;
  capabilities: ArchiveCapability[];
  restorePolicy: ArchiveRestorePolicy;
  apps: AppArchive[];
};

export type PortableArchive = InstanceArchive | AppArchive;

const archiveCapabilitySet = new Set<string>(archiveCapabilities);

export function parsePortableArchive(value: unknown): PortableArchive {
  const object = parseObject("Archive", value);

  if (typeof object.kind !== "string" || object.kind.trim() === "") {
    throw new Error('Archive must include "kind".');
  }

  if (object.kind === INSTANCE_ARCHIVE_KIND) {
    return parseInstanceArchive(object);
  }

  if (object.kind === APP_ARCHIVE_KIND) {
    return parseAppArchive(object);
  }

  throw new Error(`Archive kind "${object.kind}" is unsupported.`);
}

export function parseInstanceArchive(value: unknown): InstanceArchive {
  const object = parseObject("Instance archive", value);

  assertExactKeys("Instance archive", object, [
    "kind",
    "version",
    "exportedAt",
    "capabilities",
    "restorePolicy",
    "apps",
  ]);

  if (object.kind !== INSTANCE_ARCHIVE_KIND) {
    throw new Error(`Instance archive kind must be "${INSTANCE_ARCHIVE_KIND}".`);
  }

  if (object.version !== ARCHIVE_VERSION) {
    throw new Error(`Instance archive version must be ${ARCHIVE_VERSION}.`);
  }

  if (!Array.isArray(object.apps)) {
    throw new Error("Instance archive apps must be an array.");
  }

  return {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: parseIsoTimestamp("Instance archive exportedAt", object.exportedAt),
    capabilities: parseCapabilities("Instance archive capabilities", object.capabilities),
    restorePolicy: parseRestorePolicy("Instance archive restorePolicy", object.restorePolicy),
    apps: object.apps.map((app, index) =>
      parseAppArchiveAt(`Instance archive apps[${index}]`, app),
    ),
  };
}

export function parseAppArchive(value: unknown): AppArchive {
  return parseAppArchiveAt("App archive", value);
}

export function formatInstanceArchive(archive: InstanceArchive): string {
  return `${JSON.stringify(canonicalInstanceArchive(parseInstanceArchive(archive)), null, 2)}\n`;
}

export function formatAppArchive(archive: AppArchive): string {
  return `${JSON.stringify(canonicalAppArchive(parseAppArchive(archive)), null, 2)}\n`;
}

function parseAppArchiveAt(context: string, value: unknown): AppArchive {
  const object = parseObject(context, value);

  assertExactKeys(context, object, [
    "kind",
    "version",
    "exportedAt",
    "capabilities",
    "restorePolicy",
    "app",
    "data",
    "media",
  ]);

  if (object.kind !== APP_ARCHIVE_KIND) {
    throw new Error(`${context} kind must be "${APP_ARCHIVE_KIND}".`);
  }

  if (object.version !== ARCHIVE_VERSION) {
    throw new Error(`${context} version must be ${ARCHIVE_VERSION}.`);
  }

  const app = parseArchivedAppInstall(`${context} app`, object.app);

  return {
    kind: APP_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: parseIsoTimestamp(`${context} exportedAt`, object.exportedAt),
    capabilities: parseCapabilities(`${context} capabilities`, object.capabilities),
    restorePolicy: parseRestorePolicy(`${context} restorePolicy`, object.restorePolicy),
    app,
    data: parseAppArchiveData(`${context} data`, object.data, app.sourceSchemaKey),
    media: parseMediaManifest(`${context} media`, object.media),
  };
}

function parseArchivedAppInstall(context: string, value: unknown): ArchivedAppInstall {
  const object = parseObject(context, value);

  assertExactKeys(context, object, [
    "installId",
    "packageAppKey",
    "sourceSchemaKey",
    "label",
    "status",
    "createdAt",
    "updatedAt",
  ]);

  const installId = parseTrimmedNonEmptyString(`${context} installId`, object.installId);
  const installIdResult = validateAppInstallId(installId);

  if (!installIdResult.ok) {
    throw new Error(`${context} installId is invalid: ${installIdResult.error.message}`);
  }

  if (object.status !== "installed") {
    throw new Error(`${context} status must be "installed".`);
  }

  return {
    installId: installIdResult.installId,
    packageAppKey: parseTrimmedNonEmptyString(`${context} packageAppKey`, object.packageAppKey),
    sourceSchemaKey: parseTrimmedNonEmptyString(
      `${context} sourceSchemaKey`,
      object.sourceSchemaKey,
    ),
    label: parseTrimmedNonEmptyString(`${context} label`, object.label),
    status: "installed",
    createdAt: parseIsoTimestamp(`${context} createdAt`, object.createdAt),
    updatedAt: parseIsoTimestamp(`${context} updatedAt`, object.updatedAt),
  };
}

export function parseAppArchiveData(
  context: string,
  value: unknown,
  expectedSchemaKey: string,
): AppArchiveData {
  const object = parseObject(context, value);

  if (object.kind === "storeSnapshot") {
    assertExactKeys(context, object, ["kind", "snapshot"]);

    const snapshot = parseStoreSnapshot(object.snapshot, expectedSchemaKey);

    return {
      kind: "storeSnapshot",
      snapshot,
    };
  }

  if (object.kind === "sourceRecords") {
    assertExactKeys(context, object, ["kind", "schemaKey", "schemaUpdatedAt", "schema", "records"]);

    const schemaKey = parseTrimmedNonEmptyString(`${context} schemaKey`, object.schemaKey);

    if (schemaKey !== expectedSchemaKey) {
      throw new Error(`${context} schemaKey must be "${expectedSchemaKey}".`);
    }

    return {
      kind: "sourceRecords",
      schemaKey,
      schemaUpdatedAt: parseIsoTimestamp(`${context} schemaUpdatedAt`, object.schemaUpdatedAt),
      schema: parseAppSchema(object.schema),
      records: parseSourceRecords(`${context} records`, object.records),
    };
  }

  throw new Error(`${context} kind must be "storeSnapshot" or "sourceRecords".`);
}

function parseSourceRecords(context: string, value: unknown): SourceArchiveRecord[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  return value.map((record, index) => parseSourceRecord(`${context}[${index}]`, record));
}

function parseSourceRecord(context: string, value: unknown): SourceArchiveRecord {
  const object = parseObject(context, value);

  assertExactKeys(context, object, ["id", "entity", "values", "createdAt"]);

  return {
    id: parseNonEmptyString(`${context} id`, object.id),
    entity: parseNonEmptyString(`${context} entity`, object.entity),
    values: parseRecordValues(`${context} values`, object.values),
    createdAt: parseIsoTimestamp(`${context} createdAt`, object.createdAt),
  };
}

function parseMediaManifest(context: string, value: unknown): AppArchiveMediaManifest {
  const object = parseObject(context, value);

  assertExactKeys(context, object, ["objects"]);

  if (!Array.isArray(object.objects)) {
    throw new Error(`${context} objects must be an array.`);
  }

  return {
    objects: object.objects.map((media, index) =>
      parseMediaObject(`${context} objects[${index}]`, media),
    ),
  };
}

function parseMediaObject(context: string, value: unknown): AppArchiveMediaObject {
  const object = parseObject(context, value);
  const requiredKeys = ["storageKey", "archivePath", "contentType", "byteSize", "deliveryHref"];

  assertExactKeys(context, object, "asset" in object ? [...requiredKeys, "asset"] : requiredKeys);

  return {
    storageKey: parseRelativeKey(`${context} storageKey`, object.storageKey),
    archivePath: parseRelativeKey(`${context} archivePath`, object.archivePath),
    contentType: parseContentType(`${context} contentType`, object.contentType),
    byteSize: parseNonNegativeInteger(`${context} byteSize`, object.byteSize),
    deliveryHref: parseDeliveryHref(`${context} deliveryHref`, object.deliveryHref),
    ...("asset" in object ? { asset: parseMediaAsset(`${context} asset`, object.asset) } : {}),
  };
}

function parseMediaAsset(context: string, value: unknown): MediaAsset {
  const object = parseObject(context, value);
  const requiredKeys = [
    "byteSize",
    "contentType",
    "deliveryHref",
    "id",
    "kind",
    "label",
    "provider",
    "status",
    "storageKey",
  ];
  const optionalKeys = ["filename", "height", "width"];

  assertExactKeys(context, object, [
    ...requiredKeys,
    ...optionalKeys.filter((key) => key in object),
  ]);

  if (object.kind !== "image") {
    throw new Error(`${context} kind must be "image".`);
  }

  if (object.status !== "ready") {
    throw new Error(`${context} status must be "ready".`);
  }

  return {
    byteSize: parseNonNegativeInteger(`${context} byteSize`, object.byteSize),
    contentType: parseContentType(`${context} contentType`, object.contentType),
    deliveryHref: parseDeliveryHref(`${context} deliveryHref`, object.deliveryHref),
    ...("filename" in object
      ? { filename: parseTrimmedNonEmptyString(`${context} filename`, object.filename) }
      : {}),
    ...("height" in object
      ? { height: parseNonNegativeInteger(`${context} height`, object.height) }
      : {}),
    id: parseTrimmedNonEmptyString(`${context} id`, object.id),
    kind: "image",
    label: parseTrimmedNonEmptyString(`${context} label`, object.label),
    provider: parseTrimmedNonEmptyString(`${context} provider`, object.provider),
    status: "ready",
    storageKey: parseRelativeKey(`${context} storageKey`, object.storageKey),
    ...("width" in object
      ? { width: parseNonNegativeInteger(`${context} width`, object.width) }
      : {}),
  };
}

function parseRestorePolicy(context: string, value: unknown): ArchiveRestorePolicy {
  const object = parseObject(context, value);

  assertExactKeys(context, object, ["dryRun", "installCollisions"]);

  if (typeof object.dryRun !== "boolean") {
    throw new Error(`${context} dryRun must be a boolean.`);
  }

  if (object.installCollisions !== "reject" && object.installCollisions !== "replace") {
    throw new Error(`${context} installCollisions must be "reject" or "replace".`);
  }

  return {
    dryRun: object.dryRun,
    installCollisions: object.installCollisions,
  };
}

function parseCapabilities(context: string, value: unknown): ArchiveCapability[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  const seen = new Set<string>();

  return value.map((capability, index) => {
    if (typeof capability !== "string") {
      throw new Error(`${context}[${index}] must be a supported capability.`);
    }

    if (!archiveCapabilitySet.has(capability)) {
      throw new Error(`${context}[${index}] "${capability}" is unsupported.`);
    }

    if (seen.has(capability)) {
      throw new Error(`${context} includes duplicate "${capability}".`);
    }

    seen.add(capability);

    return capability as ArchiveCapability;
  });
}

function parseRecordValues(context: string, value: unknown): RecordValues {
  const object = parseObject(context, value);
  const values: RecordValues = {};

  for (const [fieldName, fieldValue] of Object.entries(object)) {
    if (!isFieldValue(fieldValue)) {
      throw new Error(`${context}.${fieldName} must be a string, boolean, or finite number.`);
    }

    values[fieldName] = fieldValue;
  }

  return values;
}

function parseObject(context: string, value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function assertExactKeys(context: string, value: Record<string, unknown>, requiredKeys: string[]) {
  const allowedKeys = new Set(requiredKeys);

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${context} has unsupported key "${key}".`);
    }
  }

  for (const key of requiredKeys) {
    if (!(key in value)) {
      throw new Error(`${context} must include "${key}".`);
    }
  }
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value;
}

function parseTrimmedNonEmptyString(context: string, value: unknown): string {
  return parseNonEmptyString(context, value).trim();
}

function parseIsoTimestamp(context: string, value: unknown): string {
  const timestamp = parseNonEmptyString(context, value);
  const date = new Date(timestamp);

  if (Number.isNaN(date.valueOf()) || date.toISOString() !== timestamp) {
    throw new Error(`${context} must be an ISO timestamp.`);
  }

  return timestamp;
}

function parseNonNegativeInteger(context: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${context} must be a non-negative integer.`);
  }

  return value;
}

function parseContentType(context: string, value: unknown): string {
  const contentType = parseTrimmedNonEmptyString(context, value);

  if (!/^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/.test(contentType)) {
    throw new Error(`${context} must be a media content type.`);
  }

  return contentType;
}

function parseDeliveryHref(context: string, value: unknown): string {
  const href = parseNonEmptyString(context, value);

  if (!href.startsWith("/") || href.includes(" ")) {
    throw new Error(`${context} must be an absolute API path.`);
  }

  return href;
}

function parseRelativeKey(context: string, value: unknown): string {
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

function isFieldValue(value: unknown): value is RecordValues[string] {
  return typeof value === "string" || typeof value === "boolean" || isFiniteNumber(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function canonicalInstanceArchive(archive: InstanceArchive): InstanceArchive {
  return {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: archive.exportedAt,
    capabilities: canonicalCapabilities(archive.capabilities),
    restorePolicy: canonicalRestorePolicy(archive.restorePolicy),
    apps: archive.apps
      .map(canonicalAppArchive)
      .sort((left, right) => left.app.installId.localeCompare(right.app.installId)),
  };
}

function canonicalAppArchive(archive: AppArchive): AppArchive {
  return {
    kind: APP_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: archive.exportedAt,
    capabilities: canonicalCapabilities(archive.capabilities),
    restorePolicy: canonicalRestorePolicy(archive.restorePolicy),
    app: canonicalArchivedAppInstall(archive.app),
    data: canonicalAppArchiveData(archive.data),
    media: canonicalMediaManifest(archive.media),
  };
}

function canonicalCapabilities(capabilities: ArchiveCapability[]): ArchiveCapability[] {
  return [...capabilities].sort(
    (left, right) => archiveCapabilities.indexOf(left) - archiveCapabilities.indexOf(right),
  );
}

function canonicalRestorePolicy(policy: ArchiveRestorePolicy): ArchiveRestorePolicy {
  return {
    dryRun: policy.dryRun,
    installCollisions: policy.installCollisions,
  };
}

function canonicalArchivedAppInstall(app: ArchivedAppInstall): ArchivedAppInstall {
  return {
    installId: app.installId,
    packageAppKey: app.packageAppKey,
    sourceSchemaKey: app.sourceSchemaKey,
    label: app.label,
    status: "installed",
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  };
}

function canonicalAppArchiveData(data: AppArchiveData): AppArchiveData {
  if (data.kind === "storeSnapshot") {
    return {
      kind: "storeSnapshot",
      snapshot: canonicalStoreSnapshot(data.snapshot),
    };
  }

  return {
    kind: "sourceRecords",
    schemaKey: data.schemaKey,
    schemaUpdatedAt: data.schemaUpdatedAt,
    schema: stableValue(data.schema) as AppSchema,
    records: canonicalSourceRecords(data.records),
  };
}

function canonicalStoreSnapshot(snapshot: StoreSnapshot): StoreSnapshot {
  return {
    kind: snapshot.kind,
    version: snapshot.version,
    schemaKey: snapshot.schemaKey,
    exportedAt: snapshot.exportedAt,
    schemaUpdatedAt: snapshot.schemaUpdatedAt,
    sourceCursor: snapshot.sourceCursor,
    schema: stableValue(snapshot.schema) as AppSchema,
    records: canonicalStoredRecords(snapshot.records),
  };
}

function canonicalStoredRecords(records: StoredRecord[]): StoredRecord[] {
  return [...records].map(canonicalStoredRecord).sort(compareRecords);
}

function canonicalSourceRecords(records: SourceArchiveRecord[]): SourceArchiveRecord[] {
  return [...records].map(canonicalSourceRecord).sort(compareRecords);
}

function canonicalStoredRecord(record: StoredRecord): StoredRecord {
  return {
    id: record.id,
    entity: record.entity,
    values: canonicalRecordValues(record.values),
    createdAt: record.createdAt,
    ...(record.deletedAt === undefined ? {} : { deletedAt: record.deletedAt }),
  };
}

function canonicalSourceRecord(record: SourceArchiveRecord): SourceArchiveRecord {
  return {
    id: record.id,
    entity: record.entity,
    values: canonicalRecordValues(record.values),
    createdAt: record.createdAt,
  };
}

function canonicalRecordValues(values: RecordValues): RecordValues {
  return Object.fromEntries(
    Object.entries(values).sort(([left], [right]) => left.localeCompare(right)),
  ) as RecordValues;
}

function compareRecords(
  left: Pick<StoredRecord, "entity" | "createdAt" | "id">,
  right: Pick<StoredRecord, "entity" | "createdAt" | "id">,
) {
  const entityOrder = left.entity.localeCompare(right.entity);
  if (entityOrder !== 0) {
    return entityOrder;
  }

  const createdAtOrder = left.createdAt.localeCompare(right.createdAt);
  if (createdAtOrder !== 0) {
    return createdAtOrder;
  }

  return left.id.localeCompare(right.id);
}

function canonicalMediaManifest(manifest: AppArchiveMediaManifest): AppArchiveMediaManifest {
  return {
    objects: [...manifest.objects].map(canonicalMediaObject).sort((left, right) => {
      const storageKeyOrder = left.storageKey.localeCompare(right.storageKey);

      return storageKeyOrder === 0
        ? left.archivePath.localeCompare(right.archivePath)
        : storageKeyOrder;
    }),
  };
}

function canonicalMediaObject(media: AppArchiveMediaObject): AppArchiveMediaObject {
  return {
    storageKey: media.storageKey,
    archivePath: media.archivePath,
    contentType: media.contentType,
    byteSize: media.byteSize,
    deliveryHref: media.deliveryHref,
    ...(media.asset === undefined ? {} : { asset: canonicalMediaAsset(media.asset) }),
  };
}

function canonicalMediaAsset(asset: MediaAsset): MediaAsset {
  return {
    byteSize: asset.byteSize,
    contentType: asset.contentType,
    deliveryHref: asset.deliveryHref,
    ...(asset.filename === undefined ? {} : { filename: asset.filename }),
    ...(asset.height === undefined ? {} : { height: asset.height }),
    id: asset.id,
    kind: asset.kind,
    label: asset.label,
    provider: asset.provider,
    status: asset.status,
    storageKey: asset.storageKey,
    ...(asset.width === undefined ? {} : { width: asset.width }),
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]),
  );
}
