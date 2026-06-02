import { nowIsoString } from "../shared/clock.ts";
import {
  STORE_SNAPSHOT_KIND,
  STORE_SNAPSHOT_VERSION,
  parseStoreSnapshot,
  type StoreSnapshot,
  type StoredRecord,
} from "../shared/protocol.ts";
import type { AppSchema } from "../shared/schema.ts";
import { validateSiteSeedRecords } from "./seed-promotion.ts";

export type SiteSourceSnapshotOptions = {
  exportedAt?: string;
  schemaUpdatedAt?: string;
};

export function buildSiteSourceSnapshot(
  sourceSchema: AppSchema,
  sourceSeedRecords: StoredRecord[],
  options: SiteSourceSnapshotOptions = {},
): StoreSnapshot {
  assertSiteSourceSchema(sourceSchema);

  const exportedAt = options.exportedAt ?? nowIsoString();
  const schemaUpdatedAt = options.schemaUpdatedAt ?? exportedAt;

  assertIsoTimestamp("Site source snapshot exportedAt", exportedAt);
  assertIsoTimestamp("Site source snapshot schemaUpdatedAt", schemaUpdatedAt);

  const snapshot = parseStoreSnapshot(
    {
      kind: STORE_SNAPSHOT_KIND,
      version: STORE_SNAPSHOT_VERSION,
      schemaKey: "site",
      exportedAt,
      schemaUpdatedAt,
      sourceCursor: 0,
      schema: sourceSchema,
      records: sourceSeedRecords.map(cloneStoredRecord),
    },
    "site",
  );

  validateSiteSeedRecords(snapshot.records, snapshot.schema);

  return snapshot;
}

function cloneStoredRecord(record: StoredRecord): StoredRecord {
  return {
    id: record.id,
    entity: record.entity,
    values: { ...record.values },
    createdAt: record.createdAt,
    ...(record.deletedAt === undefined ? {} : { deletedAt: record.deletedAt }),
  };
}

function assertSiteSourceSchema(schema: AppSchema) {
  const block = schema.entities.block;
  const placement = schema.entities["block-placement"];
  const parentField = placement?.fields.parent;
  const blockField = placement?.fields.block;

  if (
    !block ||
    !placement ||
    parentField?.type !== "reference" ||
    parentField.to !== "block" ||
    blockField?.type !== "reference" ||
    blockField.to !== "block"
  ) {
    throw new Error(
      'Site source snapshot schema must define "block" and "block-placement" composition fields.',
    );
  }
}

function assertIsoTimestamp(context: string, value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.valueOf()) || date.toISOString() !== value) {
    throw new Error(`${context} must be an ISO timestamp.`);
  }
}
