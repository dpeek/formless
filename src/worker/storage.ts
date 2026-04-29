import { createRecordId } from "../shared/ids.ts";
import type {
  ChangeRow,
  CreateMutation,
  PatchMutation,
  MutationResponse,
  RecordValues,
  StoredRecord,
} from "../shared/protocol.ts";
import { parseAppSchema, stringifySchema, type AppSchema } from "../shared/schema.ts";
import { nowIsoString } from "../shared/clock.ts";

type RecordRow = {
  id: string;
  entity: string;
  values_json: string;
  created_at: string;
};

type ChangeSqlRow = {
  seq: number;
  mutation_id: string;
  op: "create" | "patch";
  entity: string;
  record_id: string;
  payload_json: string;
  created_at: string;
};

type CursorRow = {
  cursor: number | null;
};

type SchemaRow = {
  schema_json: string;
  updated_at: string;
};

export type StoredSchema = {
  schema: AppSchema;
  updatedAt: string;
};

export function ensureStorageTables(storage: DurableObjectStorage) {
  storage.sql.exec(`
    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      entity TEXT NOT NULL,
      values_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS changes (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      mutation_id TEXT NOT NULL UNIQUE,
      op TEXT NOT NULL,
      entity TEXT NOT NULL,
      record_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_schema (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      schema_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

export function getActiveSchema(
  storage: DurableObjectStorage,
  seedSchema: AppSchema,
): StoredSchema {
  return storage.transactionSync(() => {
    const existing = readStoredSchema(storage);

    if (existing) {
      return existing;
    }

    return writeActiveSchema(storage, seedSchema);
  });
}

export function writeActiveSchema(storage: DurableObjectStorage, schema: AppSchema): StoredSchema {
  const updatedAt = nowIsoString();

  storage.sql.exec(
    `
      INSERT INTO app_schema (id, schema_json, updated_at)
      VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        schema_json = excluded.schema_json,
        updated_at = excluded.updated_at
    `,
    stringifySchema(schema),
    updatedAt,
  );

  return { schema, updatedAt };
}

export function getBootstrapRecords(storage: DurableObjectStorage): StoredRecord[] {
  const rows = storage.sql
    .exec<RecordRow>(
      "SELECT id, entity, values_json, created_at FROM records ORDER BY created_at ASC",
    )
    .toArray();

  return rows.map(recordFromRow);
}

export function getCurrentCursor(storage: DurableObjectStorage) {
  return storage.sql.exec<CursorRow>("SELECT MAX(seq) AS cursor FROM changes").one().cursor ?? 0;
}

export function getChangesAfter(storage: DurableObjectStorage, after: number): ChangeRow[] {
  const rows = storage.sql
    .exec<ChangeSqlRow>(
      `
        SELECT seq, mutation_id, op, entity, record_id, payload_json, created_at
        FROM changes
        WHERE seq > ?
        ORDER BY seq ASC
      `,
      after,
    )
    .toArray();

  return rows.map(changeFromRow);
}

export function createStoredRecord(
  storage: DurableObjectStorage,
  mutation: CreateMutation,
): MutationResponse {
  return storage.transactionSync(() => {
    const existingChange = findChangeByMutationId(storage, mutation.mutationId);

    if (existingChange) {
      return {
        record: existingChange.payload,
        cursor: getCurrentCursor(storage),
        mutationId: mutation.mutationId,
      };
    }

    const createdAt = nowIsoString();
    const record: StoredRecord = {
      id: createRecordId(),
      entity: mutation.entity,
      values: mutation.values,
      createdAt,
    };

    storage.sql.exec(
      `
        INSERT INTO records (id, entity, values_json, created_at)
        VALUES (?, ?, ?, ?)
      `,
      record.id,
      record.entity,
      JSON.stringify(record.values),
      record.createdAt,
    );

    storage.sql.exec(
      `
        INSERT INTO changes (mutation_id, op, entity, record_id, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      mutation.mutationId,
      mutation.op,
      mutation.entity,
      record.id,
      JSON.stringify(record),
      createdAt,
    );

    return {
      record,
      cursor: getCurrentCursor(storage),
      mutationId: mutation.mutationId,
    };
  });
}

export function patchStoredRecord(
  storage: DurableObjectStorage,
  mutation: PatchMutation,
  values?: RecordValues,
): MutationResponse {
  return storage.transactionSync(() => {
    const existingChange = findChangeByMutationId(storage, mutation.mutationId);

    if (existingChange) {
      return {
        record: existingChange.payload,
        cursor: getCurrentCursor(storage),
        mutationId: mutation.mutationId,
      };
    }

    const existingRecord = getStoredRecord(storage, mutation.recordId);

    if (!existingRecord) {
      throw new Error(`Record "${mutation.recordId}" does not exist.`);
    }

    const changedAt = nowIsoString();
    const record: StoredRecord = {
      ...existingRecord,
      values: values ?? mergeRecordValues(existingRecord.values, mutation.values),
    };

    storage.sql.exec(
      `
        UPDATE records
        SET values_json = ?
        WHERE id = ?
      `,
      JSON.stringify(record.values),
      record.id,
    );

    storage.sql.exec(
      `
        INSERT INTO changes (mutation_id, op, entity, record_id, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      mutation.mutationId,
      mutation.op,
      mutation.entity,
      record.id,
      JSON.stringify(record),
      changedAt,
    );

    return {
      record,
      cursor: getCurrentCursor(storage),
      mutationId: mutation.mutationId,
    };
  });
}

function mergeRecordValues(values: RecordValues, patch: Partial<RecordValues>): RecordValues {
  const merged: RecordValues = { ...values };

  for (const [fieldName, fieldValue] of Object.entries(patch)) {
    if (fieldValue !== undefined) {
      merged[fieldName] = fieldValue;
    }
  }

  return merged;
}

export function getStoredRecord(
  storage: DurableObjectStorage,
  recordId: string,
): StoredRecord | undefined {
  const row = storage.sql
    .exec<RecordRow>(
      "SELECT id, entity, values_json, created_at FROM records WHERE id = ?",
      recordId,
    )
    .next();

  return row.done ? undefined : recordFromRow(row.value);
}

export function getMutationResponseById(
  storage: DurableObjectStorage,
  mutationId: string,
): MutationResponse | undefined {
  const change = findChangeByMutationId(storage, mutationId);

  if (!change) {
    return undefined;
  }

  return {
    record: change.payload,
    cursor: getCurrentCursor(storage),
    mutationId,
  };
}

function findChangeByMutationId(
  storage: DurableObjectStorage,
  mutationId: string,
): ChangeRow | undefined {
  const row = storage.sql
    .exec<ChangeSqlRow>(
      `
        SELECT seq, mutation_id, op, entity, record_id, payload_json, created_at
        FROM changes
        WHERE mutation_id = ?
      `,
      mutationId,
    )
    .next();

  return row.done ? undefined : changeFromRow(row.value);
}

function readStoredSchema(storage: DurableObjectStorage): StoredSchema | undefined {
  const row = storage.sql
    .exec<SchemaRow>("SELECT schema_json, updated_at FROM app_schema WHERE id = 1")
    .next();

  if (row.done) {
    return undefined;
  }

  return {
    schema: parseStoredSchema(row.value.schema_json),
    updatedAt: row.value.updated_at,
  };
}

function recordFromRow(row: RecordRow): StoredRecord {
  return {
    id: row.id,
    entity: row.entity,
    values: parseJsonRecord(row.values_json),
    createdAt: row.created_at,
  };
}

function changeFromRow(row: ChangeSqlRow): ChangeRow {
  return {
    seq: row.seq,
    mutationId: row.mutation_id,
    op: row.op,
    entity: row.entity,
    recordId: row.record_id,
    payload: parseStoredRecord(row.payload_json),
    createdAt: row.created_at,
  };
}

function parseJsonRecord(value: string): RecordValues {
  const parsed = JSON.parse(value) as unknown;

  if (!isRecordValues(parsed)) {
    throw new Error("Stored record values are invalid.");
  }

  return parsed;
}

function parseStoredRecord(value: string): StoredRecord {
  const parsed = JSON.parse(value) as StoredRecord;

  if (
    typeof parsed.id !== "string" ||
    typeof parsed.entity !== "string" ||
    !isRecordValues(parsed.values) ||
    typeof parsed.createdAt !== "string"
  ) {
    throw new Error("Stored change payload is invalid.");
  }

  return parsed;
}

function parseStoredSchema(value: string): AppSchema {
  return parseAppSchema(JSON.parse(value) as unknown);
}

function isRecordValues(value: unknown): value is RecordValues {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (fieldValue) => typeof fieldValue === "string" || typeof fieldValue === "boolean",
    )
  );
}
