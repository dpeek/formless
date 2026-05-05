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

export type StorageResetSeed = {
  schema: AppSchema;
  records?: StoredRecord[];
  changeMutationPrefix?: string;
};

export type StorageSource = {
  schema: AppSchema;
  records: StoredRecord[];
  changeMutationPrefix: string;
};

export type StorageSchemaResetValidator = (
  currentSchema: AppSchema,
  sourceSchema: AppSchema,
  records: StoredRecord[],
) => void;

export type CreateMutationCausedRecordWriter = (
  entity: string,
  recordValuesToCreate: RecordValues[],
) => void;

export type RecordConstraintValidator = (
  entity: string,
  values: RecordValues,
  options?: { ignoreRecordId?: string },
) => void;

type ApplyCreateMutationSideEffects = (context: {
  storage: DurableObjectStorage;
  mutation: CreateMutation;
  record: StoredRecord;
  createRecords: CreateMutationCausedRecordWriter;
}) => void;

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

export function initializeStorageFromSource(
  storage: DurableObjectStorage,
  source: StorageSource,
): StoredSchema {
  return storage.transactionSync(() => {
    const existing = readStoredSchema(storage);

    if (existing) {
      return existing;
    }

    return writeSourceData(storage, source);
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

export function resetStorageSchemaToSource(
  storage: DurableObjectStorage,
  source: StorageSource,
  validate: StorageSchemaResetValidator,
): StoredSchema {
  return storage.transactionSync(() => {
    const current = readStoredSchema(storage);

    if (!current) {
      return writeSourceData(storage, source);
    }

    const records = getBootstrapRecords(storage);
    validate(current.schema, source.schema, records);

    return writeActiveSchema(storage, source.schema);
  });
}

export function resetStorageToSourceSeed(
  storage: DurableObjectStorage,
  source: StorageSource,
): StoredSchema {
  return storage.transactionSync(() => {
    clearStorage(storage);

    return writeSourceData(storage, source);
  });
}

export function resetStorage(storage: DurableObjectStorage, seed: StorageResetSeed): StoredSchema {
  return resetStorageToSourceSeed(storage, {
    schema: seed.schema,
    records: seed.records ?? [],
    changeMutationPrefix: seed.changeMutationPrefix ?? "seed",
  });
}

function clearStorage(storage: DurableObjectStorage) {
  storage.sql.exec("DELETE FROM changes");
  storage.sql.exec("DELETE FROM records");
  storage.sql.exec("DELETE FROM action_executions");
  storage.sql.exec("DELETE FROM app_schema");
  storage.sql.exec("DELETE FROM sqlite_sequence WHERE name = 'changes'");
}

function writeSourceData(storage: DurableObjectStorage, source: StorageSource): StoredSchema {
  const storedSchema = writeActiveSchema(storage, source.schema);

  for (const record of source.records) {
    insertSeedRecord(storage, record, source.changeMutationPrefix);
  }

  return storedSchema;
}

function insertSeedRecord(
  storage: DurableObjectStorage,
  record: StoredRecord,
  changeMutationPrefix: string,
) {
  storage.sql.exec(
    `
      INSERT INTO records (id, entity, values_json, created_at, deleted_at)
      VALUES (?, ?, ?, ?, ?)
    `,
    record.id,
    record.entity,
    JSON.stringify(record.values),
    record.createdAt,
    record.deletedAt ?? null,
  );

  storage.sql.exec(
    `
      INSERT INTO changes (mutation_id, op, entity, record_id, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    `${changeMutationPrefix}:${record.id}`,
    "create",
    record.entity,
    record.id,
    JSON.stringify(record),
    record.createdAt,
  );
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
  applySideEffects?: ApplyCreateMutationSideEffects,
  validateConstraints?: RecordConstraintValidator,
): MutationResponse {
  return storage.transactionSync(() => {
    const existingResponse = getMutationResponseById(storage, mutation.mutationId);

    if (existingResponse) {
      return existingResponse;
    }

    const createdAt = nowIsoString();
    const record = insertCreatedRecordChange(
      storage,
      mutation.mutationId,
      mutation.op,
      mutation.entity,
      mutation.values,
      createdAt,
      validateConstraints,
    );

    applySideEffects?.({
      storage,
      mutation,
      record,
      createRecords: (entity, recordValuesToCreate) => {
        insertCreatedRecordChanges(
          storage,
          mutation.mutationId,
          "action",
          entity,
          recordValuesToCreate,
          nowIsoString(),
          validateConstraints,
        );
      },
    });

    const changes = findChangesByMutationId(storage, mutation.mutationId);
    const cursor = changes.at(-1)?.seq ?? getCurrentCursor(storage);

    return {
      record,
      changes,
      cursor,
      mutationId: mutation.mutationId,
    };
  });
}

export function patchStoredRecord(
  storage: DurableObjectStorage,
  mutation: PatchMutation,
  values?: RecordValues,
  validateConstraints?: RecordConstraintValidator,
): MutationResponse {
  return storage.transactionSync(() => {
    const existingResponse = getMutationResponseById(storage, mutation.mutationId);

    if (existingResponse) {
      return existingResponse;
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

    validateConstraints?.(mutation.entity, record.values, { ignoreRecordId: record.id });

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

    const change = findLatestChangeForRecord(storage, mutation.mutationId, record.id);

    if (!change) {
      throw new Error(`Could not read patch change for record "${record.id}".`);
    }

    return {
      record,
      changes: [change],
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

export function createRecordsForAction(
  storage: DurableObjectStorage,
  actionId: string,
  entity: string,
  action: string,
  recordValuesToCreate: RecordValues[],
  validateConstraints?: RecordConstraintValidator,
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

    const createdAt = nowIsoString();
    const changes: ChangeRow[] = [];

    for (const values of recordValuesToCreate) {
      validateConstraints?.(entity, values);

      const record: StoredRecord = {
        id: createRecordId(),
        entity,
        values,
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
        actionId,
        "action",
        entity,
        record.id,
        JSON.stringify(record),
        createdAt,
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
      createdAt,
    );

    return {
      actionId,
      changes,
      cursor,
    };
  });
}

function insertCreatedRecordChanges(
  storage: DurableObjectStorage,
  mutationId: string,
  op: "create" | "action",
  entity: string,
  recordValuesToCreate: RecordValues[],
  createdAt: string,
  validateConstraints?: RecordConstraintValidator,
): StoredRecord[] {
  return recordValuesToCreate.map((values) =>
    insertCreatedRecordChange(
      storage,
      mutationId,
      op,
      entity,
      values,
      createdAt,
      validateConstraints,
    ),
  );
}

function insertCreatedRecordChange(
  storage: DurableObjectStorage,
  mutationId: string,
  op: "create" | "action",
  entity: string,
  values: RecordValues,
  createdAt: string,
  validateConstraints?: RecordConstraintValidator,
): StoredRecord {
  validateConstraints?.(entity, values);

  const record: StoredRecord = {
    id: createRecordId(),
    entity,
    values,
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
    mutationId,
    op,
    entity,
    record.id,
    JSON.stringify(record),
    createdAt,
  );

  return record;
}

export function getActionResponseById(
  storage: DurableObjectStorage,
  actionId: string,
): ActionResponse | undefined {
  const existingExecution = findActionExecution(storage, actionId);

  if (!existingExecution) {
    return undefined;
  }

  return {
    actionId,
    changes: findChangesByMutationId(storage, actionId),
    cursor: existingExecution.cursor,
  };
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
  const changes = findChangesByMutationId(storage, mutationId);
  const change = changes[0];

  if (!change) {
    return undefined;
  }

  return {
    record: change.payload,
    changes,
    cursor: changes.at(-1)?.seq ?? change.seq,
    mutationId,
  };
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

function parseStoredSchema(value: string): AppSchema {
  return parseAppSchema(JSON.parse(value) as unknown);
}

function isRecordValues(value: unknown): value is RecordValues {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (fieldValue) =>
        typeof fieldValue === "string" ||
        typeof fieldValue === "boolean" ||
        (typeof fieldValue === "number" && Number.isFinite(fieldValue)),
    )
  );
}
