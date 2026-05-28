import rawSiteSourceSchema from "../../schema/apps/site/schema.json";
import type { RecordValues, StoreSnapshot, StoredRecord } from "../shared/protocol.ts";
import { parseAppSchema, type AppSchema } from "../shared/schema.ts";
import {
  CORE_IMAGE_KEY_PREFIX,
  coreMediaHrefForKey,
  coreMediaKeyFromAssetId,
  coreMediaKeyFromHref,
  isRestorableImageMediaKey,
} from "@dpeek/formless-media";
import { buildSiteSeedRecordsFromSnapshot, validateSiteSeedRecords } from "./seed-promotion.ts";
import { buildSiteSourceSnapshot, type SiteSourceSnapshotOptions } from "./source-snapshot.ts";
import {
  isLegacySiteMediaHref,
  siteMediaContentTypeForKey,
  unsupportedLegacySiteMediaMessage,
} from "./source-media.ts";
import { SITE_PROJECT_MEDIA_ROOT, SITE_PROJECT_RECORDS_FILE } from "./project-config.ts";

export const packageSiteSourceSchema = parseAppSchema(rawSiteSourceSchema);

export type SiteProjectSourceOptions = {
  sourceSchema?: AppSchema;
};

export type SiteProjectMediaOptions = {
  mediaRoot?: string;
};

export type SiteProjectMediaAsset = {
  contentType: string;
  href: string;
  key: string;
  sourcePath: string;
};

const storedRecordKeys = new Set(["id", "entity", "values", "createdAt"]);

export function parseSiteProjectRecordsJson(
  contents: string,
  options: SiteProjectSourceOptions = {},
): StoredRecord[] {
  try {
    return parseSiteProjectRecords(JSON.parse(contents) as unknown, options);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${SITE_PROJECT_RECORDS_FILE} must be valid JSON.`);
    }

    throw error;
  }
}

export function parseSiteProjectRecords(
  value: unknown,
  options: SiteProjectSourceOptions = {},
): StoredRecord[] {
  if (!Array.isArray(value)) {
    throw new Error(`${SITE_PROJECT_RECORDS_FILE} must be an array.`);
  }

  return normalizeSiteProjectRecords(
    value.map((record, index) => parseStoredRecord(record, `Site project record ${index}`)),
    sourceSchemaFor(options),
  );
}

export function formatSiteProjectRecords(
  records: StoredRecord[],
  options: SiteProjectSourceOptions = {},
): string {
  return `${JSON.stringify(normalizeSiteProjectRecords(records, sourceSchemaFor(options)), null, 2)}\n`;
}

export function buildSiteProjectRecordsFromSnapshot(
  snapshotInput: unknown,
  options: SiteProjectSourceOptions = {},
): StoredRecord[] {
  return buildSiteSeedRecordsFromSnapshot(snapshotInput, sourceSchemaFor(options));
}

export function buildSiteProjectSourceSnapshot(
  records: StoredRecord[],
  options: SiteProjectSourceOptions & SiteSourceSnapshotOptions = {},
): StoreSnapshot {
  const sourceSchema = sourceSchemaFor(options);

  return buildSiteSourceSnapshot(sourceSchema, normalizeSiteProjectRecords(records, sourceSchema), {
    exportedAt: options.exportedAt,
    schemaUpdatedAt: options.schemaUpdatedAt,
  });
}

export function siteProjectMediaAssetsFromRecords(
  records: StoredRecord[],
  options: SiteProjectMediaOptions = {},
): SiteProjectMediaAsset[] {
  const assetsByKey = new Map<string, SiteProjectMediaAsset>();

  for (const record of records) {
    if (record.deletedAt !== undefined) {
      continue;
    }

    const href = record.values.href;

    if (typeof href === "string") {
      if (isLegacySiteMediaHref(href)) {
        throw new Error(unsupportedLegacySiteMediaMessage(href, "Site project media collection"));
      }

      const key = coreMediaKeyFromHref(href);

      if (key) {
        if (!isRestorableCoreMediaKey(key)) {
          throw new Error(`Core media href "${href}" uses unsupported media key "${key}".`);
        }

        setSiteProjectMediaAsset(assetsByKey, key, options);
      }
    }

    const mediaAssetId = record.values.mediaAssetId;
    const mediaAssetKey =
      typeof mediaAssetId === "string" ? coreMediaKeyFromAssetId(mediaAssetId) : undefined;

    if (mediaAssetKey) {
      setSiteProjectMediaAsset(assetsByKey, mediaAssetKey, options);
    }
  }

  return [...assetsByKey.values()].sort((left, right) => left.key.localeCompare(right.key));
}

export function siteProjectMediaPathForKey(
  key: string,
  options: SiteProjectMediaOptions = {},
): string {
  if (!isRestorableCoreMediaKey(key)) {
    throw new Error(`Site project media key is not core image media: ${key}`);
  }

  const mediaRoot = options.mediaRoot ?? SITE_PROJECT_MEDIA_ROOT;
  assertSafeProjectRelativePath("Site project media root", mediaRoot);

  return `${mediaRoot}/${key}`;
}

function setSiteProjectMediaAsset(
  assetsByKey: Map<string, SiteProjectMediaAsset>,
  key: string,
  options: SiteProjectMediaOptions,
) {
  if (assetsByKey.has(key)) {
    return;
  }

  assetsByKey.set(key, {
    contentType: siteMediaContentTypeForKey(key) ?? "application/octet-stream",
    href: coreMediaHrefForKey(key),
    key,
    sourcePath: siteProjectMediaPathForKey(key, options),
  });
}

function isRestorableCoreMediaKey(key: string): boolean {
  return isRestorableImageMediaKey(key, { keyPrefix: `${CORE_IMAGE_KEY_PREFIX}/` });
}

function normalizeSiteProjectRecords(records: StoredRecord[], sourceSchema: AppSchema) {
  validateSiteSeedRecords(records, sourceSchema);

  return sortSiteProjectRecords(
    records.map((record) => normalizeProjectRecord(record, sourceSchema)),
    sourceSchema,
  );
}

function normalizeProjectRecord(record: StoredRecord, sourceSchema: AppSchema): StoredRecord {
  const entity = sourceSchema.entities[record.entity];

  if (!entity) {
    return {
      id: record.id,
      entity: record.entity,
      values: { ...record.values },
      createdAt: record.createdAt,
    };
  }

  const values: RecordValues = {};

  for (const fieldName of Object.keys(entity.fields)) {
    const value = record.values[fieldName];

    if (value !== undefined) {
      values[fieldName] = value;
    }
  }

  return {
    id: record.id,
    entity: record.entity,
    values,
    createdAt: record.createdAt,
  };
}

function sortSiteProjectRecords(records: StoredRecord[], sourceSchema: AppSchema): StoredRecord[] {
  const entityOrder = new Map(
    Object.keys(sourceSchema.entities).map((entityName, index) => [entityName, index]),
  );

  return [...records].sort((left, right) => {
    const entityComparison =
      (entityOrder.get(left.entity) ?? Number.MAX_SAFE_INTEGER) -
      (entityOrder.get(right.entity) ?? Number.MAX_SAFE_INTEGER);

    if (entityComparison !== 0) {
      return entityComparison;
    }

    const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
    if (createdAtComparison !== 0) {
      return createdAtComparison;
    }

    return left.id.localeCompare(right.id);
  });
}

function parseStoredRecord(value: unknown, context: string): StoredRecord {
  if (!isRecord(value)) {
    throw new Error(`${context} must be an object.`);
  }

  for (const key of Object.keys(value)) {
    if (key === "deletedAt") {
      throw new Error(`${context} must not include deletedAt.`);
    }

    if (!storedRecordKeys.has(key)) {
      throw new Error(`${context} has unsupported key "${key}".`);
    }
  }

  if (typeof value.id !== "string" || value.id.trim() === "") {
    throw new Error(`${context} must include a non-empty id.`);
  }

  if (typeof value.entity !== "string" || value.entity.trim() === "") {
    throw new Error(`${context} must include a non-empty entity.`);
  }

  if (!isRecordValues(value.values)) {
    throw new Error(`${context} values must be a stored field value object.`);
  }

  if (typeof value.createdAt !== "string" || value.createdAt.trim() === "") {
    throw new Error(`${context} must include a non-empty createdAt.`);
  }

  return {
    id: value.id,
    entity: value.entity,
    values: { ...value.values },
    createdAt: value.createdAt,
  };
}

function assertSafeProjectRelativePath(context: string, value: string) {
  if (value.trim() === "" || value.startsWith("/") || value.includes("\\") || value.includes("%")) {
    throw new Error(`${context} must be a safe project-relative path.`);
  }

  const segments = value.split("/");

  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`${context} must be a safe project-relative path.`);
  }
}

function sourceSchemaFor(options: SiteProjectSourceOptions): AppSchema {
  return options.sourceSchema ?? packageSiteSourceSchema;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecordValues(value: unknown): value is RecordValues {
  return isRecord(value) && Object.values(value).every(isFieldValue);
}

function isFieldValue(value: unknown): value is RecordValues[string] {
  return typeof value === "string" || typeof value === "boolean" || isFiniteNumber(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
