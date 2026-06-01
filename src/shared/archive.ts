import { validateAppInstallId } from "./app-installs.ts";
import { isValidStoredFieldValue } from "./field-types.ts";
import {
  INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
  type InstanceControlPlaneEntityName,
  instanceControlPlaneEntityNames,
  instanceControlPlaneSchema,
} from "./instance-control-plane.ts";
import {
  parseStoreSnapshot,
  type RecordValues,
  type StoreSnapshot,
  type StoredRecord,
} from "./protocol.ts";
import { parseAppSchema, type AppSchema, type FieldSchema } from "./schema.ts";
import { isRuntimeControlPlaneSecretReferenceField } from "./schema-runtime.ts";
import {
  isSourceSchemaHash,
  type PackageAppRevision,
  type SourceSchemaHash,
} from "./upgrade-migrations.ts";
import type { MediaAsset } from "@dpeek/formless-media";

export const INSTANCE_ARCHIVE_KIND = "formless.instanceArchive";
export const APP_ARCHIVE_KIND = "formless.appArchive";
export const ARCHIVE_VERSION = 2;

export const archiveCapabilities = [
  "installed-app-registry",
  "schema-owned-control-plane",
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
  packageRevision: PackageAppRevision;
  sourceSchemaKey: string;
  sourceSchemaHash: SourceSchemaHash;
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

export type InstanceArchiveControlPlane = {
  schemaKey: typeof INSTANCE_CONTROL_PLANE_SCHEMA_KEY;
  schemaUpdatedAt: string;
  records: StoredRecord[];
};

export type InstanceArchive = {
  kind: typeof INSTANCE_ARCHIVE_KIND;
  version: typeof ARCHIVE_VERSION;
  exportedAt: string;
  capabilities: ArchiveCapability[];
  restorePolicy: ArchiveRestorePolicy;
  controlPlane?: InstanceArchiveControlPlane;
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
    ...("controlPlane" in object ? ["controlPlane"] : []),
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
    ...(object.controlPlane === undefined
      ? {}
      : {
          controlPlane: parseInstanceArchiveControlPlane(
            "Instance archive controlPlane",
            object.controlPlane,
          ),
        }),
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
    "packageRevision",
    "sourceSchemaKey",
    "sourceSchemaHash",
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
    packageRevision: parsePositiveInteger(`${context} packageRevision`, object.packageRevision),
    sourceSchemaKey: parseTrimmedNonEmptyString(
      `${context} sourceSchemaKey`,
      object.sourceSchemaKey,
    ),
    sourceSchemaHash: parseSourceSchemaHash(`${context} sourceSchemaHash`, object.sourceSchemaHash),
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

function parseInstanceArchiveControlPlane(
  context: string,
  value: unknown,
): InstanceArchiveControlPlane {
  const object = parseObject(context, value);

  assertExactKeys(context, object, ["schemaKey", "schemaUpdatedAt", "records"]);

  if (object.schemaKey !== INSTANCE_CONTROL_PLANE_SCHEMA_KEY) {
    throw new Error(`${context} schemaKey must be "${INSTANCE_CONTROL_PLANE_SCHEMA_KEY}".`);
  }

  return {
    schemaKey: INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
    schemaUpdatedAt: parseIsoTimestamp(`${context} schemaUpdatedAt`, object.schemaUpdatedAt),
    records: parseInstanceArchiveControlPlaneRecords(`${context} records`, object.records),
  };
}

function parseInstanceArchiveControlPlaneRecords(context: string, value: unknown): StoredRecord[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array.`);
  }

  const records = value.map((record, index) =>
    parseInstanceArchiveControlPlaneRecord(`${context}[${index}]`, record),
  );

  validateInstanceArchiveControlPlaneRecords(context, records);

  return records;
}

function parseInstanceArchiveControlPlaneRecord(context: string, value: unknown): StoredRecord {
  const object = parseObject(context, value);

  assertExactKeys(context, object, [
    "id",
    "entity",
    "values",
    "createdAt",
    ...("deletedAt" in object ? ["deletedAt"] : []),
  ]);

  const entity = parseNonEmptyString(`${context} entity`, object.entity);

  if (
    !instanceControlPlaneEntityNames.includes(
      entity as (typeof instanceControlPlaneEntityNames)[number],
    )
  ) {
    throw new Error(`${context} entity "${entity}" is not an instance control-plane entity.`);
  }

  const record = {
    id: parseNonEmptyString(`${context} id`, object.id),
    entity,
    values: parseRecordValues(`${context} values`, object.values),
    createdAt: parseIsoTimestamp(`${context} createdAt`, object.createdAt),
    ...(object.deletedAt === undefined
      ? {}
      : { deletedAt: parseIsoTimestamp(`${context} deletedAt`, object.deletedAt) }),
  };

  return record;
}

function validateInstanceArchiveControlPlaneRecords(context: string, records: StoredRecord[]) {
  const recordsById = new Map<string, StoredRecord>();

  for (const record of records) {
    if (recordsById.has(record.id)) {
      throw new Error(`${context} includes duplicate control-plane record id "${record.id}".`);
    }

    recordsById.set(record.id, record);
  }

  for (const record of records) {
    validateInstanceArchiveControlPlaneRecord(context, record, recordsById);
  }

  validateInstanceArchiveControlPlaneUniqueConstraints(context, records);
}

function validateInstanceArchiveControlPlaneRecord(
  context: string,
  record: StoredRecord,
  recordsById: Map<string, StoredRecord>,
) {
  const entity = instanceControlPlaneEntitySchema(record.entity);

  if (!entity) {
    throw new Error(
      `${context} record "${record.id}" references unknown entity "${record.entity}".`,
    );
  }

  const fields = entity.fields as Record<string, FieldSchema>;

  for (const fieldName of Object.keys(record.values)) {
    if (!fields[fieldName]) {
      throw new Error(
        `${context} record "${record.id}" includes unknown field "${record.entity}.${fieldName}".`,
      );
    }
  }

  assertControlPlaneRecordValuesAreReviewable(context, record);

  for (const [fieldName, field] of Object.entries(fields)) {
    const value = record.values[fieldName];

    if (!isValidStoredFieldValue(value, field)) {
      throw new Error(
        `${context} record "${record.id}" has invalid field "${record.entity}.${fieldName}".`,
      );
    }

    if (field.type === "reference" && value !== undefined) {
      validateInstanceArchiveControlPlaneReference(
        context,
        record,
        fieldName,
        field.to,
        value,
        recordsById,
      );
    }
  }
}

function validateInstanceArchiveControlPlaneReference(
  context: string,
  record: StoredRecord,
  fieldName: string,
  entityName: string,
  value: RecordValues[string],
  recordsById: Map<string, StoredRecord>,
) {
  if (typeof value !== "string") {
    return;
  }

  const target = recordsById.get(value);

  if (!target) {
    throw new Error(
      `${context} record "${record.id}" field "${record.entity}.${fieldName}" references unknown ${entityName} record "${value}".`,
    );
  }

  if (target.entity !== entityName) {
    throw new Error(
      `${context} record "${record.id}" field "${record.entity}.${fieldName}" must reference a ${entityName} record.`,
    );
  }

  if (target.deletedAt) {
    throw new Error(
      `${context} record "${record.id}" field "${record.entity}.${fieldName}" cannot reference tombstoned record "${value}".`,
    );
  }
}

function validateInstanceArchiveControlPlaneUniqueConstraints(
  context: string,
  records: StoredRecord[],
) {
  for (const [entityName, entity] of Object.entries(instanceControlPlaneSchema.entities)) {
    const activeRecords = records.filter(
      (record) => record.entity === entityName && !record.deletedAt,
    );
    const constraints = ("constraints" in entity ? entity.constraints : {}) as Record<
      string,
      { fields: readonly string[]; kind: string }
    >;

    for (const [constraintName, constraint] of Object.entries(constraints)) {
      if (constraint.kind !== "unique") {
        continue;
      }

      const seen = new Set<string>();

      for (const record of activeRecords) {
        const key = JSON.stringify(
          constraint.fields.map((fieldName) => record.values[fieldName] ?? null),
        );

        if (seen.has(key)) {
          throw new Error(
            `${context} violates unique constraint "${entityName}.${constraintName}".`,
          );
        }

        seen.add(key);
      }
    }
  }
}

function assertControlPlaneRecordValuesAreReviewable(context: string, record: StoredRecord) {
  for (const [fieldName, value] of Object.entries(record.values)) {
    const isSecretReference = isRuntimeControlPlaneSecretReferenceField(
      instanceControlPlaneSchema,
      record.entity,
      fieldName,
    );

    if (!isSecretReference && isForbiddenControlPlaneFieldName(fieldName)) {
      throw new Error(
        `${context} record "${record.id}" field "${record.entity}.${fieldName}" cannot store control-plane secrets or provider truth.`,
      );
    }

    if (typeof value === "string") {
      assertControlPlaneStringValueIsReviewable(context, record, fieldName, value);
    }
  }
}

function assertControlPlaneStringValueIsReviewable(
  context: string,
  record: StoredRecord,
  fieldName: string,
  value: string,
) {
  if (containsForbiddenControlPlaneSecretValue(value)) {
    throw new Error(
      `${context} record "${record.id}" field "${record.entity}.${fieldName}" cannot store control-plane secret values.`,
    );
  }

  const parsed = parseMaybeJson(value);

  if (parsed !== undefined) {
    assertControlPlaneJsonValueIsReviewable(context, record, fieldName, parsed);
  }
}

function assertControlPlaneJsonValueIsReviewable(
  context: string,
  record: StoredRecord,
  fieldName: string,
  value: unknown,
) {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertControlPlaneJsonValueIsReviewable(context, record, fieldName, item);
    }

    return;
  }

  if (typeof value === "string") {
    assertControlPlaneStringValueIsReviewable(context, record, fieldName, value);
    return;
  }

  if (!isPlainRecord(value)) {
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    if (isForbiddenControlPlaneFieldName(key)) {
      throw new Error(
        `${context} record "${record.id}" field "${record.entity}.${fieldName}" cannot store control-plane secrets or provider truth.`,
      );
    }

    assertControlPlaneJsonValueIsReviewable(context, record, fieldName, item);
  }
}

function parseMaybeJson(value: string): Record<string, unknown> | unknown[] | undefined {
  const trimmed = value.trim();

  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;

    if (Array.isArray(parsed)) {
      return parsed;
    }

    return isPlainRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function instanceControlPlaneEntitySchema(entityName: string) {
  if (!instanceControlPlaneEntityNames.includes(entityName as InstanceControlPlaneEntityName)) {
    return undefined;
  }

  return instanceControlPlaneSchema.entities[entityName as InstanceControlPlaneEntityName];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isForbiddenControlPlaneFieldName(fieldName: string) {
  const normalized = normalizeControlPlaneSecretText(fieldName);

  return (
    normalized.includes("api_token") ||
    normalized.includes("access_token") ||
    normalized.includes("auth_token") ||
    normalized.includes("password") ||
    normalized.includes("secret_value") ||
    normalized.includes("raw_lease_token") ||
    normalized.includes("lease_token") ||
    normalized.includes("alchemy_state_token") ||
    normalized.includes("provider_truth") ||
    normalized.includes("provider_state") ||
    normalized.includes("provider_resource_json") ||
    normalized.includes("provider_resources_json")
  );
}

function containsForbiddenControlPlaneSecretValue(value: string) {
  const normalized = normalizeControlPlaneSecretText(value);

  return (
    normalized.includes("cf_api_token") ||
    normalized.includes("cloudflare_api_token") ||
    normalized.includes("alchemy_password") ||
    normalized.includes("alchemy_state_token") ||
    normalized.includes("raw_lease_token") ||
    normalized.includes("lease_token") ||
    value.includes("-----BEGIN PRIVATE KEY-----")
  );
}

function normalizeControlPlaneSecretText(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
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

function parsePositiveInteger(context: string, value: unknown): PackageAppRevision {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${context} must be a positive integer.`);
  }

  return value;
}

function parseSourceSchemaHash(context: string, value: unknown): SourceSchemaHash {
  if (!isSourceSchemaHash(value)) {
    throw new Error(`${context} must be a sha256 source schema hash.`);
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
    ...(archive.controlPlane === undefined
      ? {}
      : { controlPlane: canonicalInstanceArchiveControlPlane(archive.controlPlane) }),
    apps: archive.apps
      .map(canonicalAppArchive)
      .sort((left, right) => left.app.installId.localeCompare(right.app.installId)),
  };
}

function canonicalInstanceArchiveControlPlane(
  controlPlane: InstanceArchiveControlPlane,
): InstanceArchiveControlPlane {
  return {
    schemaKey: controlPlane.schemaKey,
    schemaUpdatedAt: controlPlane.schemaUpdatedAt,
    records: canonicalStoredRecords(controlPlane.records),
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
    packageRevision: app.packageRevision,
    sourceSchemaKey: app.sourceSchemaKey,
    sourceSchemaHash: app.sourceSchemaHash,
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
