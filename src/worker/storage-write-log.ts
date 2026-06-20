import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";
import type { ChangeRow } from "../shared/protocol.ts";

export type RecordWriteResponse = {
  record: StoredRecord;
  changes: ChangeRow[];
  cursor: number;
  writeId: string;
};

export type OperationRecordPlanStepResponse = {
  name: string;
  kind: "create" | "patch" | "delete" | "tombstone";
  entity: string;
  recordId: string;
  changeId: string;
};

export type OperationRecordPlanResponse = {
  steps: OperationRecordPlanStepResponse[];
};

export type CommandWriteResponse = {
  writeId: string;
  changes: ChangeRow[];
  cursor: number;
  recordPlan?: OperationRecordPlanResponse;
};

type StoredWriteOperationKind = "create" | "patch" | "delete" | "action";

type ChangeSqlRow = {
  seq: number;
  mutation_id: string;
  op: StoredWriteOperationKind;
  entity: string;
  record_id: string;
  payload_json: string;
  created_at: string;
};

type CursorRow = {
  cursor: number | null;
};

type CommandExecutionRow = {
  action_id: string;
  cursor: number;
};

export type AppendWriteLogChangeInput = {
  writeId: string;
  operationKind: ChangeRow["operationKind"];
  entity: string;
  record: StoredRecord;
  createdAt: string;
};

export type AppendCommandWriteLogChangeInput = {
  writeId: string;
  entity: string;
  record: StoredRecord;
  createdAt: string;
};

export type PersistCommandExecutionInput = {
  writeId: string;
  entity: string;
  operationName: string;
  cursor: number;
  createdAt: string;
};

export type CommitCommandWriteLogInput = Omit<PersistCommandExecutionInput, "cursor">;

export type ReadCommittedRecordWriteResponseInput = {
  writeId: string;
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

export function readRecordWriteReplayResponse(
  storage: DurableObjectStorage,
  writeId: string,
): RecordWriteResponse | undefined {
  const changes = readWriteLogChangesByWriteId(storage, writeId);
  const change = changes[0];

  if (!change) {
    return undefined;
  }

  return {
    record: change.payload,
    changes,
    cursor: changes.at(-1)?.seq ?? change.seq,
    writeId,
  };
}

export function readCommittedRecordWriteResponse(
  storage: DurableObjectStorage,
  input: ReadCommittedRecordWriteResponseInput,
): RecordWriteResponse {
  const changes = readWriteLogChangesByWriteId(storage, input.writeId);

  if (changes.length === 0) {
    throw new Error(`Could not read record write changes for "${input.writeId}".`);
  }

  return {
    record: input.record,
    changes,
    cursor: changes.at(-1)?.seq ?? readCurrentWriteLogCursor(storage),
    writeId: input.writeId,
  };
}

export function readCommandWriteReplayResponse(
  storage: DurableObjectStorage,
  writeId: string,
): CommandWriteResponse | undefined {
  const existingExecution = readCommandExecution(storage, writeId);

  if (!existingExecution) {
    return undefined;
  }

  return {
    writeId,
    changes: readWriteLogChangesByWriteId(storage, writeId),
    cursor: existingExecution.cursor,
  };
}

export function commitCommandWriteLog(
  storage: DurableObjectStorage,
  input: CommitCommandWriteLogInput,
): CommandWriteResponse {
  const cursor = readCurrentWriteLogCursor(storage);

  persistCommandExecution(storage, {
    ...input,
    cursor,
  });

  return {
    writeId: input.writeId,
    changes: readWriteLogChangesByWriteId(storage, input.writeId),
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
    input.writeId,
    storedOperationKind(input.operationKind),
    input.entity,
    input.record.id,
    JSON.stringify(input.record),
    input.createdAt,
  );
}

export function appendRecordWriteLogChange(
  storage: DurableObjectStorage,
  input: AppendWriteLogChangeInput,
): ChangeRow {
  appendWriteLogChange(storage, input);

  const change = readLatestWriteLogChangeForRecord(storage, input.writeId, input.record.id);

  if (!change) {
    throw new Error(
      `Could not read ${input.operationKind} change for record "${input.record.id}".`,
    );
  }

  return change;
}

export function appendCommandWriteLogChange(
  storage: DurableObjectStorage,
  input: AppendCommandWriteLogChangeInput,
): ChangeRow {
  appendWriteLogChange(storage, {
    writeId: input.writeId,
    operationKind: "command",
    entity: input.entity,
    record: input.record,
    createdAt: input.createdAt,
  });

  const change = readLatestWriteLogChangeForRecord(storage, input.writeId, input.record.id);

  if (!change) {
    throw new Error(`Could not read command change for record "${input.record.id}".`);
  }

  return change;
}

export function persistCommandExecution(
  storage: DurableObjectStorage,
  input: PersistCommandExecutionInput,
) {
  storage.sql.exec(
    `
      INSERT INTO action_executions (action_id, entity, action, cursor, created_at)
      VALUES (?, ?, ?, ?, ?)
    `,
    input.writeId,
    input.entity,
    input.operationName,
    input.cursor,
    input.createdAt,
  );
}

export function readWriteLogChangesByWriteId(
  storage: DurableObjectStorage,
  writeId: string,
): ChangeRow[] {
  const rows = storage.sql
    .exec<ChangeSqlRow>(
      `
        SELECT seq, mutation_id, op, entity, record_id, payload_json, created_at
        FROM changes
        WHERE mutation_id = ?
        ORDER BY seq ASC
      `,
      writeId,
    )
    .toArray();

  return rows.map(changeFromRow);
}

export function readLatestWriteLogChangeForRecord(
  storage: DurableObjectStorage,
  writeId: string,
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
      writeId,
      recordId,
    )
    .next();

  return row.done ? undefined : changeFromRow(row.value);
}

function readCommandExecution(
  storage: DurableObjectStorage,
  writeId: string,
): CommandExecutionRow | undefined {
  const row = storage.sql
    .exec<CommandExecutionRow>(
      "SELECT action_id, cursor FROM action_executions WHERE action_id = ?",
      writeId,
    )
    .next();

  return row.done ? undefined : row.value;
}

function changeFromRow(row: ChangeSqlRow): ChangeRow {
  return {
    seq: row.seq,
    writeId: row.mutation_id,
    operationKind: operationKindFromStoredOperation(row.op),
    entity: row.entity,
    recordId: row.record_id,
    payload: parseStoredRecord(row.payload_json),
    createdAt: row.created_at,
  };
}

function storedOperationKind(operationKind: ChangeRow["operationKind"]): StoredWriteOperationKind {
  if (operationKind === "update") {
    return "patch";
  }

  if (operationKind === "command") {
    return "action";
  }

  return operationKind;
}

function operationKindFromStoredOperation(
  operationKind: StoredWriteOperationKind,
): ChangeRow["operationKind"] {
  if (operationKind === "patch") {
    return "update";
  }

  if (operationKind === "action") {
    return "command";
  }

  return operationKind;
}

function parseStoredRecord(value: string): StoredRecord {
  const parsed = JSON.parse(value) as StoredRecord;

  if (
    typeof parsed.id !== "string" ||
    typeof parsed.entity !== "string" ||
    !isRecordValues(parsed.values) ||
    typeof parsed.createdAt !== "string" ||
    typeof parsed.updatedAt !== "string" ||
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
