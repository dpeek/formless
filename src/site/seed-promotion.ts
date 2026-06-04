import { parseStoreSnapshot, type StoredRecord } from "../shared/protocol.ts";
import {
  validateAuthorityFieldValue,
  type AppSchema,
  type EntitySchema,
} from "@dpeek/formless-schema";

export function buildSiteSeedRecordsFromSnapshot(
  snapshotInput: unknown,
  sourceSchema: AppSchema,
): StoredRecord[] {
  const snapshot = parseStoreSnapshot(snapshotInput, "site");

  if (stableStringify(snapshot.schema) !== stableStringify(sourceSchema)) {
    throw new Error("Site snapshot schema must match the source Site schema.");
  }

  const activeRecords = snapshot.records.filter((record) => record.deletedAt === undefined);

  validateSiteSeedRecords(activeRecords, sourceSchema);

  return sortSiteSeedRecords(
    activeRecords.map((record) => normalizeSeedRecord(record, sourceSchema)),
    sourceSchema,
  );
}

export function formatSiteSeedRecords(records: StoredRecord[]): string {
  return `${JSON.stringify(records, null, 2)}\n`;
}

function normalizeSeedRecord(record: StoredRecord, schema: AppSchema): StoredRecord {
  const entity = schema.entities[record.entity];

  if (!entity) {
    return {
      id: record.id,
      entity: record.entity,
      values: { ...record.values },
      createdAt: record.createdAt,
    };
  }

  const values: StoredRecord["values"] = {};

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

export function validateSiteSeedRecords(records: StoredRecord[], schema: AppSchema) {
  const recordsById = new Map<string, StoredRecord>();

  for (const [index, record] of records.entries()) {
    const context = `Site seed record "${record.id || index}"`;

    if (record.id.trim() === "") {
      throw new Error(`${context} must include a non-empty id.`);
    }

    if (recordsById.has(record.id)) {
      throw new Error(`Site seed records include duplicate id "${record.id}".`);
    }

    if (record.deletedAt !== undefined) {
      throw new Error(`${context} must not include deletedAt.`);
    }

    assertIsoTimestamp(`${context} createdAt`, record.createdAt);
    recordsById.set(record.id, record);
  }

  for (const [index, record] of records.entries()) {
    const context = `Site seed record "${record.id || index}"`;
    const entity = schema.entities[record.entity];

    if (!entity) {
      throw new Error(`${context} references unknown entity "${record.entity}".`);
    }

    validateRecordFields(context, record, entity, recordsById);
  }

  validateUniqueConstraints(records, schema);
}

function validateRecordFields(
  context: string,
  record: StoredRecord,
  entity: EntitySchema,
  recordsById: Map<string, StoredRecord>,
) {
  for (const fieldName of Object.keys(record.values)) {
    if (!entity.fields[fieldName]) {
      throw new Error(`${context} includes unknown field "${record.entity}.${fieldName}".`);
    }
  }

  for (const [fieldName, field] of Object.entries(entity.fields)) {
    const value = record.values[fieldName];

    try {
      validateAuthorityFieldValue(fieldName, field, value, value !== undefined);
    } catch {
      throw new Error(`${context} has invalid field "${record.entity}.${fieldName}".`);
    }

    if (field.type !== "reference" || value === undefined) {
      continue;
    }

    if (typeof value !== "string") {
      throw new Error(`${context} field "${record.entity}.${fieldName}" must be a reference ID.`);
    }

    const target = recordsById.get(value);

    if (!target || target.entity !== field.to) {
      throw new Error(
        `${context} field "${record.entity}.${fieldName}" references missing ${field.to} record "${value}".`,
      );
    }
  }
}

function validateUniqueConstraints(records: StoredRecord[], schema: AppSchema) {
  for (const [entityName, entity] of Object.entries(schema.entities)) {
    const entityRecords = records.filter((record) => record.entity === entityName);

    for (const [constraintName, constraint] of Object.entries(entity.constraints ?? {})) {
      if (constraint.kind !== "unique") {
        continue;
      }

      const seen = new Set<string>();

      for (const record of entityRecords) {
        const key = JSON.stringify(
          constraint.fields.map((fieldName) => record.values[fieldName] ?? null),
        );

        if (seen.has(key)) {
          throw new Error(
            `Site seed records violate unique constraint "${entityName}.${constraintName}".`,
          );
        }

        seen.add(key);
      }
    }
  }
}

function sortSiteSeedRecords(records: StoredRecord[], schema: AppSchema): StoredRecord[] {
  const entityOrder = new Map(
    Object.keys(schema.entities).map((entityName, index) => [entityName, index]),
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

function assertIsoTimestamp(context: string, value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.valueOf()) || date.toISOString() !== value) {
    throw new Error(`${context} must be an ISO timestamp.`);
  }
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
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
