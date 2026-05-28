import type {
  ActionResponse,
  ChangeRow,
  MutationResponse,
  RecordValues,
  StoredRecord,
} from "../shared/protocol.ts";

type ChangeSqlRow = {
  seq: number;
  mutation_id: string;
  op: "create" | "patch" | "delete" | "action";
  entity: string;
  record_id: string;
  payload_json: string;
  created_at: string;
};

type CursorRow = {
  cursor: number | null;
};

type ActionExecutionRow = {
  action_id: string;
  cursor: number;
};

export type AppendWriteLogChangeInput = {
  mutationId: string;
  op: ChangeRow["op"];
  entity: string;
  record: StoredRecord;
  createdAt: string;
};

export type AppendActionWriteLogChangeInput = {
  actionId: string;
  entity: string;
  record: StoredRecord;
  createdAt: string;
};

export type PersistActionExecutionInput = {
  actionId: string;
  entity: string;
  action: string;
  cursor: number;
  createdAt: string;
};

export type CommitActionWriteLogInput = Omit<PersistActionExecutionInput, "cursor">;

export type ReadCommittedMutationResponseInput = {
  mutationId: string;
  record: StoredRecord;
};

export function readCurrentWriteLogCursor(storage: DurableObjectStorage) {
  return storage.sql.exec<CursorRow>("SELECT MAX(seq) AS cursor FROM changes").one().cursor ?? 0;
}

export function readWriteLogChangesAfter(
  storage: DurableObjectStorage,
  after: number,
): ChangeRow[] {
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

export function readMutationReplayResponse(
  storage: DurableObjectStorage,
  mutationId: string,
): MutationResponse | undefined {
  const changes = readWriteLogChangesByMutationId(storage, mutationId);
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

export function readCommittedMutationResponse(
  storage: DurableObjectStorage,
  input: ReadCommittedMutationResponseInput,
): MutationResponse {
  const changes = readWriteLogChangesByMutationId(storage, input.mutationId);

  if (changes.length === 0) {
    throw new Error(`Could not read mutation changes for "${input.mutationId}".`);
  }

  return {
    record: input.record,
    changes,
    cursor: changes.at(-1)?.seq ?? readCurrentWriteLogCursor(storage),
    mutationId: input.mutationId,
  };
}

export function readActionReplayResponse(
  storage: DurableObjectStorage,
  actionId: string,
): ActionResponse | undefined {
  const existingExecution = readActionExecution(storage, actionId);

  if (!existingExecution) {
    return undefined;
  }

  return {
    actionId,
    changes: readWriteLogChangesByMutationId(storage, actionId),
    cursor: existingExecution.cursor,
  };
}

export function commitActionWriteLog(
  storage: DurableObjectStorage,
  input: CommitActionWriteLogInput,
): ActionResponse {
  const cursor = readCurrentWriteLogCursor(storage);

  persistActionExecution(storage, {
    ...input,
    cursor,
  });

  return {
    actionId: input.actionId,
    changes: readWriteLogChangesByMutationId(storage, input.actionId),
    cursor,
  };
}

export function appendWriteLogChange(
  storage: DurableObjectStorage,
  input: AppendWriteLogChangeInput,
) {
  storage.sql.exec(
    `
      INSERT INTO changes (mutation_id, op, entity, record_id, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    input.mutationId,
    input.op,
    input.entity,
    input.record.id,
    JSON.stringify(input.record),
    input.createdAt,
  );
}

export function appendMutationWriteLogChange(
  storage: DurableObjectStorage,
  input: AppendWriteLogChangeInput,
): ChangeRow {
  appendWriteLogChange(storage, input);

  const change = readLatestWriteLogChangeForRecord(storage, input.mutationId, input.record.id);

  if (!change) {
    throw new Error(`Could not read ${input.op} change for record "${input.record.id}".`);
  }

  return change;
}

export function appendActionWriteLogChange(
  storage: DurableObjectStorage,
  input: AppendActionWriteLogChangeInput,
): ChangeRow {
  appendWriteLogChange(storage, {
    mutationId: input.actionId,
    op: "action",
    entity: input.entity,
    record: input.record,
    createdAt: input.createdAt,
  });

  const change = readLatestWriteLogChangeForRecord(storage, input.actionId, input.record.id);

  if (!change) {
    throw new Error(`Could not read action change for record "${input.record.id}".`);
  }

  return change;
}

export function persistActionExecution(
  storage: DurableObjectStorage,
  input: PersistActionExecutionInput,
) {
  storage.sql.exec(
    `
      INSERT INTO action_executions (action_id, entity, action, cursor, created_at)
      VALUES (?, ?, ?, ?, ?)
    `,
    input.actionId,
    input.entity,
    input.action,
    input.cursor,
    input.createdAt,
  );
}

export function readWriteLogChangesByMutationId(
  storage: DurableObjectStorage,
  mutationId: string,
): ChangeRow[] {
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

export function readLatestWriteLogChangeForRecord(
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

function readActionExecution(
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
