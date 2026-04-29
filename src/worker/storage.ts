import { createRecordId } from "../shared/ids.ts";
import type {
  ActionResponse,
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
  deleted_at: string | null;
};

type ChangeSqlRow = {
  seq: number;
  mutation_id: string;
  op: "create" | "patch" | "action";
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

type ActionExecutionRow = {
  action_id: string;
  cursor: number;
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
      created_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS changes (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      mutation_id TEXT NOT NULL,
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

    CREATE TABLE IF NOT EXISTS action_executions (
      action_id TEXT PRIMARY KEY,
      entity TEXT NOT NULL,
      action TEXT NOT NULL,
      cursor INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  migrateRecordsDeletedAt(storage);
  migrateChangesAllowActionRows(storage);
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

export function resetStorage(storage: DurableObjectStorage, seedSchema: AppSchema): StoredSchema {
  return storage.transactionSync(() => {
    storage.sql.exec("DELETE FROM changes");
    storage.sql.exec("DELETE FROM records");
    storage.sql.exec("DELETE FROM action_executions");
    storage.sql.exec("DELETE FROM app_schema");

    return writeActiveSchema(storage, seedSchema);
  });
}

export function getBootstrapRecords(storage: DurableObjectStorage): StoredRecord[] {
  const rows = storage.sql
    .exec<RecordRow>(
      "SELECT id, entity, values_json, created_at, deleted_at FROM records ORDER BY created_at ASC",
    )
    .toArray();

  return rows.map(recordFromRow);
}

export function getActiveRecordsByEntity(
  storage: DurableObjectStorage,
  entity: string,
): StoredRecord[] {
  const rows = storage.sql
    .exec<RecordRow>(
      `
        SELECT id, entity, values_json, created_at, deleted_at
        FROM records
        WHERE entity = ? AND deleted_at IS NULL
        ORDER BY created_at ASC
      `,
      entity,
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
        cursor: existingChange.seq,
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
        cursor: existingChange.seq,
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

export function tombstoneRecordsForAction(
  storage: DurableObjectStorage,
  actionId: string,
  entity: string,
  action: string,
  recordsToTombstone: StoredRecord[],
): ActionResponse {
  return storage.transactionSync(() => {
    const existingExecution = findActionExecution(storage, actionId);

    if (existingExecution) {
      return {
        actionId,
        changes: findChangesByMutationId(storage, actionId),
        cursor: existingExecution.cursor,
      };
    }

    const deletedAt = nowIsoString();
    const changes: ChangeRow[] = [];

    for (const existingRecord of recordsToTombstone) {
      const record: StoredRecord = {
        ...existingRecord,
        deletedAt,
      };

      storage.sql.exec(
        `
          UPDATE records
          SET deleted_at = ?
          WHERE id = ?
        `,
        deletedAt,
        record.id,
      );

      storage.sql.exec(
        `
          INSERT INTO changes (mutation_id, op, entity, record_id, payload_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        actionId,
        "action",
        entity,
        record.id,
        JSON.stringify(record),
        deletedAt,
      );

      const change = findLatestChangeForRecord(storage, actionId, record.id);
      if (change) {
        changes.push(change);
      }
    }

    const cursor = getCurrentCursor(storage);

    storage.sql.exec(
      `
        INSERT INTO action_executions (action_id, entity, action, cursor, created_at)
        VALUES (?, ?, ?, ?, ?)
      `,
      actionId,
      entity,
      action,
      cursor,
      deletedAt,
    );

    return {
      actionId,
      changes,
      cursor,
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
      "SELECT id, entity, values_json, created_at, deleted_at FROM records WHERE id = ?",
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
    cursor: change.seq,
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

function findChangesByMutationId(storage: DurableObjectStorage, mutationId: string): ChangeRow[] {
  const rows = storage.sql
    .exec<ChangeSqlRow>(
      `
        SELECT seq, mutation_id, op, entity, record_id, payload_json, created_at
        FROM changes
        WHERE mutation_id = ?
        ORDER BY seq ASC
      `,
      mutationId,
    )
    .toArray();

  return rows.map(changeFromRow);
}

function findLatestChangeForRecord(
  storage: DurableObjectStorage,
  mutationId: string,
  recordId: string,
): ChangeRow | undefined {
  const row = storage.sql
    .exec<ChangeSqlRow>(
      `
        SELECT seq, mutation_id, op, entity, record_id, payload_json, created_at
        FROM changes
        WHERE mutation_id = ? AND record_id = ?
        ORDER BY seq DESC
        LIMIT 1
      `,
      mutationId,
      recordId,
    )
    .next();

  return row.done ? undefined : changeFromRow(row.value);
}

function findActionExecution(
  storage: DurableObjectStorage,
  actionId: string,
): ActionExecutionRow | undefined {
  const row = storage.sql
    .exec<ActionExecutionRow>(
      "SELECT action_id, cursor FROM action_executions WHERE action_id = ?",
      actionId,
    )
    .next();

  return row.done ? undefined : row.value;
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
  const record: StoredRecord = {
    id: row.id,
    entity: row.entity,
    values: parseJsonRecord(row.values_json),
    createdAt: row.created_at,
  };

  if (row.deleted_at !== null) {
    record.deletedAt = row.deleted_at;
  }

  return record;
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
    typeof parsed.createdAt !== "string" ||
    ("deletedAt" in parsed && typeof parsed.deletedAt !== "string")
  ) {
    throw new Error("Stored change payload is invalid.");
  }

  return parsed;
}

function migrateRecordsDeletedAt(storage: DurableObjectStorage) {
  const columns = storage.sql
    .exec<{ name: string }>("PRAGMA table_info(records)")
    .toArray()
    .map((column) => column.name);

  if (!columns.includes("deleted_at")) {
    storage.sql.exec("ALTER TABLE records ADD COLUMN deleted_at TEXT");
  }
}

function migrateChangesAllowActionRows(storage: DurableObjectStorage) {
  const row = storage.sql
    .exec<{ sql: string | null }>(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'changes'",
    )
    .one();

  if (!row.sql?.includes("mutation_id TEXT NOT NULL UNIQUE")) {
    return;
  }

  storage.sql.exec(`
    CREATE TABLE changes_next (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      mutation_id TEXT NOT NULL,
      op TEXT NOT NULL,
      entity TEXT NOT NULL,
      record_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    INSERT INTO changes_next (seq, mutation_id, op, entity, record_id, payload_json, created_at)
    SELECT seq, mutation_id, op, entity, record_id, payload_json, created_at FROM changes;

    DROP TABLE changes;
    ALTER TABLE changes_next RENAME TO changes;
  `);
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
