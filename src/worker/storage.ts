import { createRecordId } from "../shared/ids.ts";
import { validateAuthorityFieldValue } from "@dpeek/formless-schema";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "../shared/protocol.ts";
import type {
  ActionResponse,
  BootstrapResponse,
  ChangeRow,
  CreateMutation,
  DeleteMutation,
  PatchMutation,
  MutationResponse,
  RecordValues,
  StorageSnapshot,
  StoredRecord,
} from "../shared/protocol.ts";
import type {
  OperationInvocationEnvelope,
  OperationInvocationInput,
  OperationInvocationOutput,
  OperationInvocationStatus,
} from "../shared/operation-invocation.ts";
import type {
  AppSchema,
  EntitySchema,
  FieldSchema,
  UniqueConstraintSchema,
} from "@dpeek/formless-schema";
import { parseAppSchema, stringifySchema } from "@dpeek/formless-schema";
import { nowIsoString } from "../shared/clock.ts";
import type { PackageAppKey } from "../shared/app-installs.ts";
import type {
  PackageAppRevision,
  SourceSchemaHash,
  UpgradeMigrationChecksum,
  UpgradeMigrationId,
} from "../shared/upgrade-migrations.ts";
import type {
  AuthorityPackageAppMigration,
  PackageAppMigrationPlan,
  PackageAppMigrationRecordPatch,
  PackageAppMigrationRecordTombstone,
} from "./package-app-migrations.ts";
import {
  appendActionWriteLogChange,
  appendMutationWriteLogChange,
  appendWriteLogChange,
  commitActionWriteLog,
  readActionReplayResponse,
  readCommittedMutationResponse,
  readCurrentWriteLogCursor,
  readMutationReplayResponse,
  readWriteLogChangesAfter,
} from "./storage-write-log.ts";
import {
  createSqlStorageMigrationRegistry,
  runSqlStorageMigrations,
  storageSqlMigrationFamily,
} from "./sql-migrations.ts";

type RecordRow = {
  id: string;
  entity: string;
  values_json: string;
  created_at: string;
  deleted_at: string | null;
};

type SchemaRow = {
  schema_json: string;
  updated_at: string;
};

type AppliedPackageAppMigrationRow = {
  package_app_key: string;
  migration_id: string;
  checksum: UpgradeMigrationChecksum;
  from_package_revision: number;
  to_package_revision: number;
  source_schema_hash: SourceSchemaHash;
  applied_at: string;
};

type PackageAppStateRow = {
  package_app_key: string;
  package_revision: number;
  source_schema_hash: SourceSchemaHash;
  updated_at: string;
};

type OperationInvocationRow = {
  invocation_id: string;
  operation_key: string;
  operation_kind: string;
  entity: string;
  operation_name: string;
  actor_kind: string;
  auth_decision: OperationInvocationAuthDecision;
  source_protocol: string;
  source_json: string;
  app_storage_identity_json: string;
  input_hash: string;
  input_audit_json: string;
  affected_change_ids_json: string;
  idempotency_json: string;
  output_json: string | null;
  status: OperationInvocationStatus;
  status_history_json: string;
  error_message: string | null;
  received_at: string;
  updated_at: string;
  completed_at: string | null;
};

const authoritySqlMigrationFamily = storageSqlMigrationFamily("authority-storage");
const operationInvocationsTableName = "operation_invocations";
const authoritySqlMigrations = createSqlStorageMigrationRegistry([
  {
    id: "2026-06-11-authority-operation-invocations",
    owner: "formless",
    family: authoritySqlMigrationFamily,
    checksum: "sha256:3e5f55d719d3d8fd4d99902632e1f9f2c3e9f948a954f0d4dbbb2c0f6c8bc111",
    safety: "auto-safe",
    summary: "Create Authority operation invocation audit rows.",
    apply(storage) {
      ensureOperationInvocationTables(storage);
    },
  },
]);
const appliedPackageAppMigrationsTableName = "formless_applied_package_app_migrations";
const packageAppStateTableName = "formless_package_app_state";

export type StoredSchema = {
  schema: AppSchema;
  updatedAt: string;
};

export type WriteOutcome<T> =
  | {
      kind: "committed";
      response: T;
    }
  | {
      kind: "replay";
      response: T;
    };

export type OperationInvocationAuthDecision = "allowed" | "denied";

export type OperationInvocationAuditInput =
  | {
      kind: "none";
    }
  | {
      kind: "hash";
    }
  | {
      kind: "summary";
      summary: OperationInvocationInputSummary;
    }
  | {
      kind: "snapshot";
      snapshot: unknown;
    };

export type OperationInvocationInputSummary = {
  type: OperationInvocationInput["type"];
  fieldNames?: string[];
  inputFields?: string[];
  inputType?: string;
  recordId?: string;
  valuesType?: string;
};

export type OperationInvocationStatusHistoryEntry = {
  status: OperationInvocationStatus;
  at: string;
};

export type StoredOperationInvocation = {
  invocationId: string;
  operationKey: string;
  operationKind: string;
  entity: string;
  operationName: string;
  actorKind: string;
  authDecision: OperationInvocationAuthDecision;
  sourceProtocol: string;
  source: OperationInvocationEnvelope["source"];
  appStorageIdentity: OperationInvocationEnvelope["appStorageIdentity"];
  inputHash: string;
  auditInput: OperationInvocationAuditInput;
  affectedChangeIds: string[];
  idempotency: OperationInvocationEnvelope["idempotency"];
  output?: OperationInvocationOutput;
  status: OperationInvocationStatus;
  statusHistory: OperationInvocationStatusHistoryEntry[];
  errorMessage?: string;
  receivedAt: string;
  updatedAt: string;
  completedAt?: string;
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

export type ActionRecordCreatePlan = {
  entity: string;
  id?: string;
  values: RecordValues | ((createdRecords: StoredRecord[]) => RecordValues);
};

export type ActionRecordWriteValues =
  | RecordValues
  | ((writtenRecords: StoredRecord[]) => RecordValues);

export type ActionRecordWriteTarget =
  | StoredRecord
  | ((writtenRecords: StoredRecord[]) => StoredRecord);

export type ActionRecordWritePlan =
  | {
      kind: "create";
      entity: string;
      id?: string;
      values: ActionRecordWriteValues;
    }
  | {
      kind: "patch";
      record: ActionRecordWriteTarget;
      values: ActionRecordWriteValues;
    }
  | {
      kind: "delete" | "tombstone";
      record: ActionRecordWriteTarget;
    };

export type AppliedPackageAppMigration = {
  packageAppKey: PackageAppKey;
  migrationId: UpgradeMigrationId;
  checksum: UpgradeMigrationChecksum;
  fromPackageRevision: PackageAppRevision;
  toPackageRevision: PackageAppRevision;
  sourceSchemaHash: SourceSchemaHash;
  appliedAt: string;
};

export type PackageAppMigrationState = {
  packageAppKey: PackageAppKey;
  packageRevision: PackageAppRevision;
  sourceSchemaHash: SourceSchemaHash;
  updatedAt: string;
};

export type ApplyPackageAppMigrationsInput = {
  currentPackageRevision: PackageAppRevision;
  currentSourceSchemaHash: SourceSchemaHash;
  migrations: readonly AuthorityPackageAppMigration[];
  packageAppKey: PackageAppKey;
  targetPackageRevision: PackageAppRevision;
  targetSourceSchemaHash: SourceSchemaHash;
  now?: string;
};

export type ApplyPackageAppMigrationsResponse = {
  applied: AppliedPackageAppMigration[];
  changes: ChangeRow[];
  cursor: number;
  packageAppKey: PackageAppKey;
  packageRevision: PackageAppRevision;
  schemaUpdatedAt: string;
  skipped: AppliedPackageAppMigration[];
  sourceSchemaHash: SourceSchemaHash;
};

type SourceDataPlan = {
  schema: AppSchema;
  records: StoredRecord[];
  changeMutationPrefix: string;
};

type SourceSchemaResetPlan = {
  schema: AppSchema;
  changedAt: string;
  prunedRecords: StoredRecord[];
};

type SnapshotRestorePlan = {
  restoredAt: string;
  restoreMutationId: string;
  recordsToRestore: StoredRecord[];
  recordsToTombstone: StoredRecord[];
  changedRecords: StoredRecord[];
};

type PackageAppMigrationRecordChange = {
  entity: string;
  op: ChangeRow["op"];
  record: StoredRecord;
};

type PackageAppMigrationMaterializationPlan = {
  changes: PackageAppMigrationRecordChange[];
  records: StoredRecord[];
  schema: AppSchema;
  tombstones: PackageAppMigrationRecordTombstone[];
};

type ApplyCreateMutationSideEffects = (context: {
  storage: DurableObjectStorage;
  mutation: CreateMutation;
  record: StoredRecord;
  createRecords: CreateMutationCausedRecordWriter;
}) => void;

export function committedWrite<T>(response: T): WriteOutcome<T> {
  return { kind: "committed", response };
}

export function replayedWrite<T>(response: T): WriteOutcome<T> {
  return { kind: "replay", response };
}

export function mapWriteOutcome<T, U>(
  outcome: WriteOutcome<T>,
  mapResponse: (response: T) => U,
): WriteOutcome<U> {
  return {
    kind: outcome.kind,
    response: mapResponse(outcome.response),
  };
}

export function ensureStorageTables(storage: DurableObjectStorage) {
  runSqlStorageMigrations(storage, {
    family: authoritySqlMigrationFamily,
    migrations: authoritySqlMigrations,
  });
  ensureOperationInvocationTables(storage);

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

  ensurePackageAppMigrationTables(storage);
}

export function ensureOperationInvocationTables(storage: DurableObjectStorage) {
  storage.sql.exec(`
    CREATE TABLE IF NOT EXISTS ${operationInvocationsTableName} (
      invocation_id TEXT PRIMARY KEY,
      operation_key TEXT NOT NULL,
      operation_kind TEXT NOT NULL,
      entity TEXT NOT NULL,
      operation_name TEXT NOT NULL,
      actor_kind TEXT NOT NULL,
      auth_decision TEXT NOT NULL CHECK (auth_decision IN ('allowed', 'denied')),
      source_protocol TEXT NOT NULL,
      source_json TEXT NOT NULL,
      app_storage_identity_json TEXT NOT NULL,
      input_hash TEXT NOT NULL,
      input_audit_json TEXT NOT NULL,
      affected_change_ids_json TEXT NOT NULL,
      idempotency_json TEXT NOT NULL,
      output_json TEXT,
      status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected', 'committed', 'replayed', 'failed', 'resumed')),
      status_history_json TEXT NOT NULL,
      error_message TEXT,
      received_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_operation_invocations_operation_key
      ON ${operationInvocationsTableName} (operation_key, updated_at);

    CREATE INDEX IF NOT EXISTS idx_operation_invocations_status
      ON ${operationInvocationsTableName} (status, updated_at);
  `);
}

export function ensurePackageAppMigrationTables(storage: DurableObjectStorage) {
  storage.sql.exec(`
    CREATE TABLE IF NOT EXISTS ${appliedPackageAppMigrationsTableName} (
      package_app_key TEXT NOT NULL,
      migration_id TEXT NOT NULL,
      checksum TEXT NOT NULL CHECK (length(checksum) = 71 AND checksum LIKE 'sha256:%'),
      from_package_revision INTEGER NOT NULL,
      to_package_revision INTEGER NOT NULL,
      source_schema_hash TEXT NOT NULL CHECK (length(source_schema_hash) = 71 AND source_schema_hash LIKE 'sha256:%'),
      applied_at TEXT NOT NULL,
      PRIMARY KEY (package_app_key, migration_id)
    );

    CREATE TABLE IF NOT EXISTS ${packageAppStateTableName} (
      package_app_key TEXT PRIMARY KEY,
      package_revision INTEGER NOT NULL,
      source_schema_hash TEXT NOT NULL CHECK (length(source_schema_hash) = 71 AND source_schema_hash LIKE 'sha256:%'),
      updated_at TEXT NOT NULL
    );
  `);
}

export function readAppliedPackageAppMigrations(
  storage: DurableObjectStorage,
  packageAppKey: PackageAppKey,
): AppliedPackageAppMigration[] {
  ensurePackageAppMigrationTables(storage);

  return storage.sql
    .exec<AppliedPackageAppMigrationRow>(
      `
        SELECT
          package_app_key,
          migration_id,
          checksum,
          from_package_revision,
          to_package_revision,
          source_schema_hash,
          applied_at
        FROM ${appliedPackageAppMigrationsTableName}
        WHERE package_app_key = ?
        ORDER BY applied_at ASC, migration_id ASC
      `,
      packageAppKey,
    )
    .toArray()
    .map(appliedPackageAppMigrationFromRow);
}

export function readPackageAppMigrationState(
  storage: DurableObjectStorage,
  packageAppKey: PackageAppKey,
): PackageAppMigrationState | undefined {
  ensurePackageAppMigrationTables(storage);

  const row = storage.sql
    .exec<PackageAppStateRow>(
      `
        SELECT package_app_key, package_revision, source_schema_hash, updated_at
        FROM ${packageAppStateTableName}
        WHERE package_app_key = ?
      `,
      packageAppKey,
    )
    .next();

  return row.done ? undefined : packageAppStateFromRow(row.value);
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

export function readCurrentStoredSchema(storage: DurableObjectStorage): StoredSchema | undefined {
  return readStoredSchema(storage);
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
  return writeOutcomeResponse(writeActiveSchemaOutcome(storage, schema));
}

export function writeActiveSchemaOutcome(
  storage: DurableObjectStorage,
  schema: AppSchema,
): WriteOutcome<StoredSchema> {
  return committedWrite(writeActiveSchemaAt(storage, schema, nowIsoString()));
}

function writeActiveSchemaAt(
  storage: DurableObjectStorage,
  schema: AppSchema,
  updatedAt: string,
): StoredSchema {
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
  return writeOutcomeResponse(resetStorageSchemaToSourceOutcome(storage, source, validate));
}

export function resetStorageSchemaToSourceOutcome(
  storage: DurableObjectStorage,
  source: StorageSource,
  validate: StorageSchemaResetValidator,
): WriteOutcome<StoredSchema> {
  return storage.transactionSync(() => {
    const current = readStoredSchema(storage);

    if (!current) {
      return committedWrite(writeSourceData(storage, source));
    }

    const records = getBootstrapRecords(storage);
    validate(current.schema, source.schema, records);
    const plan = planSourceSchemaReset(records, source.schema, nowIsoString());
    materializeSourceSchemaResetRecordPrunes(storage, plan.prunedRecords);
    appendSourceSchemaResetChanges(storage, plan);

    return committedWrite(writeActiveSchemaAt(storage, plan.schema, plan.changedAt));
  });
}

export function resetStorageToSourceSeed(
  storage: DurableObjectStorage,
  source: StorageSource,
): StoredSchema {
  return writeOutcomeResponse(resetStorageToSourceSeedOutcome(storage, source));
}

export function resetStorageToSourceSeedOutcome(
  storage: DurableObjectStorage,
  source: StorageSource,
): WriteOutcome<StoredSchema> {
  return storage.transactionSync(() => {
    const plan = planSourceDataWrite(source);
    clearStorageForSourceSeedReset(storage);

    return committedWrite(writePlannedSourceData(storage, plan));
  });
}

export function resetStorage(storage: DurableObjectStorage, seed: StorageResetSeed): StoredSchema {
  return resetStorageToSourceSeed(storage, {
    schema: seed.schema,
    records: seed.records ?? [],
    changeMutationPrefix: seed.changeMutationPrefix ?? "seed",
  });
}

export function resetStorageToEmpty(storage: DurableObjectStorage) {
  ensureStorageTables(storage);
  storage.transactionSync(() => {
    clearStorageForSourceSeedReset(storage);
    storage.sql.exec(`DELETE FROM ${appliedPackageAppMigrationsTableName}`);
    storage.sql.exec(`DELETE FROM ${packageAppStateTableName}`);
  });
}

export function exportStorageSnapshot(
  storage: DurableObjectStorage,
  storageIdentity: string,
  schemaKey: string,
): StorageSnapshot {
  return storage.transactionSync(() => {
    const storedSchema = readStoredSchema(storage);

    if (!storedSchema) {
      throw new Error("Cannot export storage snapshot before storage is initialized.");
    }

    return {
      kind: STORAGE_SNAPSHOT_KIND,
      version: STORAGE_SNAPSHOT_VERSION,
      storageIdentity,
      schemaKey,
      exportedAt: nowIsoString(),
      schemaUpdatedAt: storedSchema.updatedAt,
      sourceCursor: getCurrentCursor(storage),
      schema: storedSchema.schema,
      records: getBootstrapRecords(storage),
    };
  });
}

export function restoreStorageSnapshot(
  storage: DurableObjectStorage,
  snapshot: StorageSnapshot,
): BootstrapResponse {
  return writeOutcomeResponse(restoreStorageSnapshotOutcome(storage, snapshot));
}

export function restoreStorageSnapshotOutcome(
  storage: DurableObjectStorage,
  snapshot: StorageSnapshot,
): WriteOutcome<BootstrapResponse> {
  return storage.transactionSync(() => {
    assertSnapshotRecordIdsAreUnique(snapshot.records);

    const restoredAt = nowIsoString();
    const currentRecords = getBootstrapRecords(storage);
    const plan = planSnapshotRestore(snapshot.records, currentRecords, restoredAt);
    const storedSchema = writeActiveSchemaAt(storage, snapshot.schema, restoredAt);

    materializeSnapshotRestoreRecords(storage, plan);
    appendSnapshotRestoreChanges(storage, plan);
    storage.sql.exec("DELETE FROM action_executions");

    return committedWrite({
      schema: storedSchema.schema,
      schemaUpdatedAt: storedSchema.updatedAt,
      records: getBootstrapRecords(storage),
      cursor: getCurrentCursor(storage),
    });
  });
}

export function applyPackageAppMigrationsOutcome(
  storage: DurableObjectStorage,
  input: ApplyPackageAppMigrationsInput,
): WriteOutcome<ApplyPackageAppMigrationsResponse> {
  return storage.transactionSync(() => {
    ensurePackageAppMigrationTables(storage);

    const startedCursor = getCurrentCursor(storage);
    const appliedById = new Map(
      readAppliedPackageAppMigrations(storage, input.packageAppKey).map((migration) => [
        migration.migrationId,
        migration,
      ]),
    );
    const state =
      readPackageAppMigrationState(storage, input.packageAppKey) ??
      fallbackPackageAppMigrationState(input);
    const skipped = skippedAppliedPackageAppMigrations(input.migrations, appliedById);
    const applied: AppliedPackageAppMigration[] = [];
    let storedSchema = readStoredSchema(storage);

    if (!storedSchema) {
      throw new Error("Cannot apply package app migrations before storage is initialized.");
    }

    if (state.packageRevision > input.targetPackageRevision) {
      throw new Error(
        `Stored package app "${input.packageAppKey}" revision ${state.packageRevision} is newer than target revision ${input.targetPackageRevision}.`,
      );
    }

    validateAppliedPackageMigrationChecksums(input.migrations, appliedById);

    if (state.packageRevision < input.targetPackageRevision) {
      let currentRevision = state.packageRevision;
      let currentSourceSchemaHash = state.sourceSchemaHash;

      for (const migration of input.migrations) {
        if (migration.family.packageAppKey !== input.packageAppKey) {
          continue;
        }

        if (migration.toPackageRevision <= currentRevision) {
          continue;
        }

        if (migration.fromPackageRevision !== currentRevision) {
          throw new Error(
            `Missing package app migration for "${input.packageAppKey}" from revision ${currentRevision} to ${input.targetPackageRevision}.`,
          );
        }

        if (migration.toPackageRevision > input.targetPackageRevision) {
          throw new Error(
            `Package app migration "${migration.id}" advances past target revision ${input.targetPackageRevision}.`,
          );
        }

        const appliedAt = input.now ?? nowIsoString();
        const plan = migration.migrate({
          currentSchema: storedSchema.schema,
          fromPackageRevision: migration.fromPackageRevision,
          packageAppKey: input.packageAppKey,
          records: getBootstrapRecords(storage),
          sourceSchemaHash: currentSourceSchemaHash,
          toPackageRevision: migration.toPackageRevision,
        });
        const materialization = planPackageAppMigrationMaterialization({
          changedAt: appliedAt,
          currentRecords: getBootstrapRecords(storage),
          currentSchema: storedSchema.schema,
          migration,
          plan,
        });

        storedSchema = materializePackageAppMigration(storage, {
          changedAt: appliedAt,
          materialization,
          migration,
          storedSchema,
        });

        const appliedMigration = {
          appliedAt,
          checksum: migration.checksum,
          fromPackageRevision: migration.fromPackageRevision,
          migrationId: migration.id,
          packageAppKey: input.packageAppKey,
          sourceSchemaHash: input.targetSourceSchemaHash,
          toPackageRevision: migration.toPackageRevision,
        } satisfies AppliedPackageAppMigration;

        recordAppliedPackageAppMigration(storage, appliedMigration);
        appliedById.set(migration.id, appliedMigration);
        applied.push(appliedMigration);
        currentRevision = migration.toPackageRevision;
        currentSourceSchemaHash = input.targetSourceSchemaHash;
      }

      if (currentRevision !== input.targetPackageRevision) {
        throw new Error(
          `Missing package app migration for "${input.packageAppKey}" from revision ${currentRevision} to ${input.targetPackageRevision}.`,
        );
      }
    }

    const finishedAt = input.now ?? nowIsoString();
    upsertPackageAppMigrationState(storage, {
      packageAppKey: input.packageAppKey,
      packageRevision: input.targetPackageRevision,
      sourceSchemaHash: input.targetSourceSchemaHash,
      updatedAt: finishedAt,
    });

    const finalSchema = readStoredSchema(storage);

    if (!finalSchema) {
      throw new Error("Package app migration left storage without an active schema.");
    }

    return committedWrite({
      applied,
      changes: getChangesAfter(storage, startedCursor),
      cursor: getCurrentCursor(storage),
      packageAppKey: input.packageAppKey,
      packageRevision: input.targetPackageRevision,
      schemaUpdatedAt: finalSchema.updatedAt,
      skipped,
      sourceSchemaHash: input.targetSourceSchemaHash,
    });
  });
}

function clearStorageForSourceSeedReset(storage: DurableObjectStorage) {
  storage.sql.exec("DELETE FROM changes");
  storage.sql.exec("DELETE FROM records");
  storage.sql.exec("DELETE FROM action_executions");
  storage.sql.exec(`DELETE FROM ${operationInvocationsTableName}`);
  storage.sql.exec("DELETE FROM app_schema");
  storage.sql.exec("DELETE FROM sqlite_sequence WHERE name = 'changes'");
}

function writeSourceData(storage: DurableObjectStorage, source: StorageSource): StoredSchema {
  return writePlannedSourceData(storage, planSourceDataWrite(source));
}

function planSourceDataWrite(source: StorageSource): SourceDataPlan {
  return {
    schema: source.schema,
    records: source.records,
    changeMutationPrefix: source.changeMutationPrefix,
  };
}

function writePlannedSourceData(storage: DurableObjectStorage, plan: SourceDataPlan): StoredSchema {
  const storedSchema = writeActiveSchemaAt(storage, plan.schema, nowIsoString());

  materializeSourceRecords(storage, plan.records);
  appendSourceRecordChanges(storage, plan);

  return storedSchema;
}

function planSourceSchemaReset(
  records: StoredRecord[],
  schema: AppSchema,
  changedAt: string,
): SourceSchemaResetPlan {
  const prunedRecords: StoredRecord[] = [];

  for (const record of records) {
    const entity = schema.entities[record.entity];

    if (!entity) {
      continue;
    }

    const values = pruneRecordValuesToEntity(record.values, entity);

    if (recordValuesEqual(record.values, values)) {
      continue;
    }

    prunedRecords.push({ ...record, values });
  }

  return { schema, changedAt, prunedRecords };
}

function materializeSourceSchemaResetRecordPrunes(
  storage: DurableObjectStorage,
  records: StoredRecord[],
) {
  for (const record of records) {
    storage.sql.exec(
      `
        UPDATE records
        SET values_json = ?
        WHERE id = ?
      `,
      JSON.stringify(record.values),
      record.id,
    );
  }
}

function appendSourceSchemaResetChanges(
  storage: DurableObjectStorage,
  plan: SourceSchemaResetPlan,
) {
  for (const record of plan.prunedRecords) {
    appendWriteLogChange(storage, {
      mutationId: `schema-reset:${plan.changedAt}:${record.id}`,
      op: "patch",
      entity: record.entity,
      record,
      createdAt: plan.changedAt,
    });
  }
}

function pruneRecordValuesToEntity(values: RecordValues, entity: EntitySchema): RecordValues {
  const pruned: RecordValues = {};

  for (const [fieldName, fieldValue] of Object.entries(values)) {
    if (Object.hasOwn(entity.fields, fieldName)) {
      pruned[fieldName] = fieldValue;
    }
  }

  return pruned;
}

function materializeSourceRecords(storage: DurableObjectStorage, records: StoredRecord[]) {
  for (const record of records) {
    materializeSourceRecord(storage, record);
  }
}

function materializeSourceRecord(storage: DurableObjectStorage, record: StoredRecord) {
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
}

function appendSourceRecordChanges(storage: DurableObjectStorage, plan: SourceDataPlan) {
  for (const record of plan.records) {
    appendWriteLogChange(storage, {
      mutationId: `${plan.changeMutationPrefix}:${record.id}`,
      op: "create",
      entity: record.entity,
      record,
      createdAt: record.createdAt,
    });
  }
}

function planSnapshotRestore(
  snapshotRecords: StoredRecord[],
  currentRecords: StoredRecord[],
  restoredAt: string,
): SnapshotRestorePlan {
  const currentRecordsById = new Map(currentRecords.map((record) => [record.id, record]));
  const snapshotRecordIds = new Set(snapshotRecords.map((record) => record.id));
  const recordsToTombstone: StoredRecord[] = [];
  const changedRecords: StoredRecord[] = [];

  for (const record of snapshotRecords) {
    if (!storedRecordsEqual(currentRecordsById.get(record.id), record)) {
      changedRecords.push(record);
    }
  }

  for (const record of currentRecords) {
    if (snapshotRecordIds.has(record.id) || record.deletedAt) {
      continue;
    }

    const tombstonedRecord = { ...record, deletedAt: restoredAt };
    recordsToTombstone.push(tombstonedRecord);
    changedRecords.push(tombstonedRecord);
  }

  return {
    restoredAt,
    restoreMutationId: `snapshot-restore:${restoredAt}`,
    recordsToRestore: snapshotRecords,
    recordsToTombstone,
    changedRecords,
  };
}

function upsertSnapshotRecord(storage: DurableObjectStorage, record: StoredRecord) {
  storage.sql.exec(
    `
      INSERT INTO records (id, entity, values_json, created_at, deleted_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        entity = excluded.entity,
        values_json = excluded.values_json,
        created_at = excluded.created_at,
        deleted_at = excluded.deleted_at
    `,
    record.id,
    record.entity,
    JSON.stringify(record.values),
    record.createdAt,
    record.deletedAt ?? null,
  );
}

function materializeSnapshotRestoreRecords(
  storage: DurableObjectStorage,
  plan: SnapshotRestorePlan,
) {
  for (const record of plan.recordsToRestore) {
    upsertSnapshotRecord(storage, record);
  }

  for (const record of plan.recordsToTombstone) {
    upsertSnapshotRecord(storage, record);
  }
}

function appendSnapshotRestoreChanges(storage: DurableObjectStorage, plan: SnapshotRestorePlan) {
  for (const record of plan.changedRecords) {
    appendWriteLogChange(storage, {
      mutationId: plan.restoreMutationId,
      op: "action",
      entity: record.entity,
      record,
      createdAt: plan.restoredAt,
    });
  }
}

function planPackageAppMigrationMaterialization(input: {
  changedAt: string;
  currentRecords: StoredRecord[];
  currentSchema: AppSchema;
  migration: AuthorityPackageAppMigration;
  plan: PackageAppMigrationPlan;
}): PackageAppMigrationMaterializationPlan {
  const schema = input.plan.schema ? parseAppSchema(input.plan.schema) : input.currentSchema;
  const recordsById = new Map(input.currentRecords.map((record) => [record.id, record]));
  const changes: PackageAppMigrationRecordChange[] = [];

  for (const create of input.plan.creates ?? []) {
    const recordId = create.recordId ?? createRecordId();

    if (recordsById.has(recordId)) {
      throw new Error(
        `Package app migration "${input.migration.id}" creates duplicate record "${recordId}".`,
      );
    }

    const record = {
      id: recordId,
      entity: create.entity,
      values: create.values,
      createdAt: create.createdAt ?? input.changedAt,
    } satisfies StoredRecord;

    recordsById.set(record.id, record);
    changes.push({ entity: create.entity, op: "create", record });
  }

  for (const patch of input.plan.patches ?? []) {
    const existingRecord = activePackageAppMigrationRecord(recordsById, patch);
    const values = patchPackageAppMigrationRecordValues(existingRecord.values, patch);
    const record = {
      ...existingRecord,
      values,
    } satisfies StoredRecord;

    recordsById.set(record.id, record);
    changes.push({ entity: patch.entity, op: "patch", record });
  }

  for (const tombstone of input.plan.tombstones ?? []) {
    const existingRecord = activePackageAppMigrationRecord(recordsById, tombstone);
    const record = {
      ...existingRecord,
      deletedAt: input.changedAt,
    } satisfies StoredRecord;

    recordsById.set(record.id, record);
    changes.push({ entity: tombstone.entity, op: "delete", record });
  }

  const records = [...recordsById.values()];

  validatePackageAppMigrationRecords(schema, records, input.plan.tombstones ?? []);

  return {
    changes,
    records,
    schema,
    tombstones: input.plan.tombstones ?? [],
  };
}

function materializePackageAppMigration(
  storage: DurableObjectStorage,
  input: {
    changedAt: string;
    materialization: PackageAppMigrationMaterializationPlan;
    migration: AuthorityPackageAppMigration;
    storedSchema: StoredSchema;
  },
): StoredSchema {
  const schemaChanged = !schemasEqual(input.storedSchema.schema, input.materialization.schema);
  const storedSchema = schemaChanged
    ? writeActiveSchemaAt(storage, input.materialization.schema, input.changedAt)
    : input.storedSchema;
  const mutationId = `package-migration:${input.migration.id}`;

  for (const change of input.materialization.changes) {
    upsertPackageAppMigrationRecord(storage, change.record);
    appendWriteLogChange(storage, {
      mutationId,
      op: change.op,
      entity: change.entity,
      record: change.record,
      createdAt: input.changedAt,
    });
  }

  return storedSchema;
}

function activePackageAppMigrationRecord(
  recordsById: Map<string, StoredRecord>,
  input: PackageAppMigrationRecordPatch | PackageAppMigrationRecordTombstone,
): StoredRecord {
  const record = recordsById.get(input.recordId);

  if (!record) {
    throw new Error(`Package app migration references unknown record "${input.recordId}".`);
  }

  if (record.entity !== input.entity) {
    throw new Error(
      `Package app migration record "${input.recordId}" entity must be "${record.entity}".`,
    );
  }

  if (record.deletedAt) {
    throw new Error(`Package app migration record "${input.recordId}" is already tombstoned.`);
  }

  return record;
}

function patchPackageAppMigrationRecordValues(
  values: RecordValues,
  patch: PackageAppMigrationRecordPatch,
): RecordValues {
  const patched = { ...values };

  for (const fieldName of patch.unsetValues ?? []) {
    delete patched[fieldName];
  }

  for (const [fieldName, fieldValue] of Object.entries(patch.values ?? {})) {
    if (fieldValue !== undefined) {
      patched[fieldName] = fieldValue;
    }
  }

  return patched;
}

function upsertPackageAppMigrationRecord(storage: DurableObjectStorage, record: StoredRecord) {
  storage.sql.exec(
    `
      INSERT INTO records (id, entity, values_json, created_at, deleted_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        entity = excluded.entity,
        values_json = excluded.values_json,
        created_at = excluded.created_at,
        deleted_at = excluded.deleted_at
    `,
    record.id,
    record.entity,
    JSON.stringify(record.values),
    record.createdAt,
    record.deletedAt ?? null,
  );
}

function validatePackageAppMigrationRecords(
  schema: AppSchema,
  records: StoredRecord[],
  tombstones: readonly PackageAppMigrationRecordTombstone[],
) {
  const recordsById = new Map<string, StoredRecord>();

  for (const record of records) {
    if (recordsById.has(record.id)) {
      throw new Error(`Package app migration produced duplicate record id "${record.id}".`);
    }

    recordsById.set(record.id, record);
  }

  assertPackageAppMigrationDeletes(schema, records, tombstones);

  for (const record of records) {
    if (record.deletedAt) {
      continue;
    }

    validateActivePackageAppMigrationRecord(schema, record, recordsById);
  }

  assertPackageAppMigrationUniqueConstraints(schema, records);
}

function validateActivePackageAppMigrationRecord(
  schema: AppSchema,
  record: StoredRecord,
  recordsById: Map<string, StoredRecord>,
) {
  const entity = schema.entities[record.entity];

  if (!entity) {
    throw new Error(
      `Package app migration record "${record.id}" references unknown entity "${record.entity}".`,
    );
  }

  for (const fieldName of Object.keys(record.values)) {
    if (!Object.hasOwn(entity.fields, fieldName)) {
      throw new Error(
        `Package app migration record "${record.id}" includes unknown field "${record.entity}.${fieldName}".`,
      );
    }
  }

  for (const [fieldName, field] of Object.entries(entity.fields)) {
    const fieldValue = record.values[fieldName];
    const fieldWasProvided = fieldName in record.values;
    const result = validatePackageAppMigrationFieldValue(
      fieldName,
      field,
      fieldValue,
      fieldWasProvided,
    );

    if (result.kind === "omit") {
      continue;
    }

    if (field.type === "reference") {
      if (typeof result.value !== "string") {
        throw new Error("Reference field validation returned a non-string value.");
      }

      const targetRecord = recordsById.get(result.value);

      if (!targetRecord) {
        throw new Error(
          `Field "${fieldName}" references unknown ${field.to} record "${result.value}".`,
        );
      }

      if (targetRecord.entity !== field.to) {
        throw new Error(`Field "${fieldName}" must reference a ${field.to} record.`);
      }

      if (targetRecord.deletedAt) {
        throw new Error(
          `Field "${fieldName}" cannot reference tombstoned record "${result.value}".`,
        );
      }
    }
  }
}

function validatePackageAppMigrationFieldValue(
  fieldName: string,
  field: FieldSchema,
  value: unknown,
  provided: boolean,
) {
  try {
    return validateAuthorityFieldValue(fieldName, field, value, provided);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Field value is invalid.");
  }
}

function assertPackageAppMigrationUniqueConstraints(schema: AppSchema, records: StoredRecord[]) {
  for (const [entityName, entity] of Object.entries(schema.entities)) {
    const activeRecords = records.filter(
      (record) => record.entity === entityName && !record.deletedAt,
    );

    for (const [constraintName, constraint] of Object.entries(entity.constraints ?? {})) {
      if (constraint.kind !== "unique") {
        continue;
      }

      assertPackageAppMigrationUniqueConstraint(
        entityName,
        constraintName,
        constraint,
        activeRecords,
      );
    }
  }
}

function assertPackageAppMigrationUniqueConstraint(
  entityName: string,
  constraintName: string,
  constraint: UniqueConstraintSchema,
  records: StoredRecord[],
) {
  const seen = new Set<string>();

  for (const record of records) {
    const key = JSON.stringify(
      constraint.fields.map((fieldName) => record.values[fieldName] ?? null),
    );

    if (seen.has(key)) {
      throw new Error(`Unique constraint "${entityName}.${constraintName}" would be violated.`);
    }

    seen.add(key);
  }
}

function assertPackageAppMigrationDeletes(
  schema: AppSchema,
  records: StoredRecord[],
  tombstones: readonly PackageAppMigrationRecordTombstone[],
) {
  const tombstonedIds = new Set(tombstones.map((tombstone) => tombstone.recordId));

  if (tombstonedIds.size === 0) {
    return;
  }

  for (const targetRecordId of tombstonedIds) {
    const targetRecord = records.find((record) => record.id === targetRecordId);

    if (!targetRecord) {
      continue;
    }

    for (const record of records) {
      if (record.deletedAt) {
        continue;
      }

      const entity = schema.entities[record.entity];

      if (!entity) {
        continue;
      }

      for (const [fieldName, field] of Object.entries(entity.fields)) {
        if (
          field.type === "reference" &&
          field.to === targetRecord.entity &&
          record.values[fieldName] === targetRecord.id
        ) {
          throw new Error(
            `Cannot delete record "${targetRecord.id}" because active ${record.entity} record "${record.id}" references it through field "${record.entity}.${fieldName}".`,
          );
        }
      }
    }
  }
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
  return readCurrentWriteLogCursor(storage);
}

export function getChangesAfter(storage: DurableObjectStorage, after: number): ChangeRow[] {
  return readWriteLogChangesAfter(storage, after);
}

export function readOperationInvocations(
  storage: DurableObjectStorage,
): StoredOperationInvocation[] {
  ensureOperationInvocationTables(storage);

  return storage.sql
    .exec<OperationInvocationRow>(
      `
        SELECT
          invocation_id,
          operation_key,
          operation_kind,
          entity,
          operation_name,
          actor_kind,
          auth_decision,
          source_protocol,
          source_json,
          app_storage_identity_json,
          input_hash,
          input_audit_json,
          affected_change_ids_json,
          idempotency_json,
          output_json,
          status,
          status_history_json,
          error_message,
          received_at,
          updated_at,
          completed_at
        FROM ${operationInvocationsTableName}
        ORDER BY received_at ASC, invocation_id ASC
      `,
    )
    .toArray()
    .map(operationInvocationFromRow);
}

export function getOperationInvocationById(
  storage: DurableObjectStorage,
  invocationId: string,
): StoredOperationInvocation | undefined {
  ensureOperationInvocationTables(storage);

  const row = storage.sql
    .exec<OperationInvocationRow>(
      `
        SELECT
          invocation_id,
          operation_key,
          operation_kind,
          entity,
          operation_name,
          actor_kind,
          auth_decision,
          source_protocol,
          source_json,
          app_storage_identity_json,
          input_hash,
          input_audit_json,
          affected_change_ids_json,
          idempotency_json,
          output_json,
          status,
          status_history_json,
          error_message,
          received_at,
          updated_at,
          completed_at
        FROM ${operationInvocationsTableName}
        WHERE invocation_id = ?
      `,
      invocationId,
    )
    .next();

  return row.done ? undefined : operationInvocationFromRow(row.value);
}

export function recordOperationInvocationAccepted(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
) {
  const existing = getOperationInvocationById(storage, envelope.invocationId);

  if (!existing) {
    upsertOperationInvocation(storage, {
      authDecision: "allowed",
      envelope,
      status: "accepted",
    });
    return;
  }

  if (existing.status === "accepted") {
    return;
  }

  if (existing.status === "failed") {
    upsertOperationInvocation(storage, {
      authDecision: existing.authDecision,
      envelope,
      status: "resumed",
    });
  }
}

export function recordOperationInvocationRejected(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
  error: unknown,
) {
  upsertOperationInvocation(storage, {
    authDecision: "denied",
    envelope,
    errorMessage: errorMessage(error),
    status: "rejected",
  });
}

export function recordOperationInvocationFailed(
  storage: DurableObjectStorage,
  envelope: OperationInvocationEnvelope,
  error: unknown,
) {
  upsertOperationInvocation(storage, {
    authDecision: "allowed",
    envelope,
    errorMessage: errorMessage(error),
    status: "failed",
  });
}

export function recordOperationInvocationOutcome(
  storage: DurableObjectStorage,
  input: {
    envelope: OperationInvocationEnvelope;
    output?: OperationInvocationOutput;
    status: OperationInvocationStatus;
  },
) {
  upsertOperationInvocation(storage, {
    authDecision: "allowed",
    envelope: input.envelope,
    output: input.output,
    status: input.status,
  });
}

export function createStoredRecord(
  storage: DurableObjectStorage,
  mutation: CreateMutation,
  applySideEffects?: ApplyCreateMutationSideEffects,
  validateConstraints?: RecordConstraintValidator,
): MutationResponse {
  return writeOutcomeResponse(
    createStoredRecordOutcome(storage, mutation, applySideEffects, validateConstraints),
  );
}

export function createStoredRecordOutcome(
  storage: DurableObjectStorage,
  mutation: CreateMutation,
  applySideEffects?: ApplyCreateMutationSideEffects,
  validateConstraints?: RecordConstraintValidator,
): WriteOutcome<MutationResponse> {
  return storage.transactionSync(() => {
    const existingResponse = readMutationReplayResponse(storage, mutation.mutationId);

    if (existingResponse) {
      return replayedWrite(existingResponse);
    }

    const createdAt = nowIsoString();
    const record = materializeCreatedMutationRecord(
      storage,
      {
        entity: mutation.entity,
        values: mutation.values,
        createdAt,
      },
      validateConstraints,
    );

    appendMutationWriteLogChange(storage, {
      mutationId: mutation.mutationId,
      op: mutation.op,
      entity: mutation.entity,
      record,
      createdAt,
    });

    applySideEffects?.({
      storage,
      mutation,
      record,
      createRecords: (entity, recordValuesToCreate) => {
        const sideEffectCreatedAt = nowIsoString();
        const records = materializeCreatedMutationRecords(
          storage,
          entity,
          recordValuesToCreate,
          sideEffectCreatedAt,
          validateConstraints,
        );

        appendMutationRecordChanges(storage, {
          mutationId: mutation.mutationId,
          op: "action",
          entity,
          records,
          createdAt: sideEffectCreatedAt,
        });
      },
    });

    return committedWrite(
      readCommittedMutationResponse(storage, {
        mutationId: mutation.mutationId,
        record,
      }),
    );
  });
}

export function patchStoredRecord(
  storage: DurableObjectStorage,
  mutation: PatchMutation,
  values?: RecordValues,
  validateConstraints?: RecordConstraintValidator,
): MutationResponse {
  return writeOutcomeResponse(
    patchStoredRecordOutcome(storage, mutation, values, validateConstraints),
  );
}

export function patchStoredRecordOutcome(
  storage: DurableObjectStorage,
  mutation: PatchMutation,
  values?: RecordValues,
  validateConstraints?: RecordConstraintValidator,
): WriteOutcome<MutationResponse> {
  return storage.transactionSync(() => {
    const existingResponse = readMutationReplayResponse(storage, mutation.mutationId);

    if (existingResponse) {
      return replayedWrite(existingResponse);
    }

    const existingRecord = getStoredRecord(storage, mutation.recordId);

    if (!existingRecord) {
      throw new Error(`Record "${mutation.recordId}" does not exist.`);
    }

    const changedAt = nowIsoString();
    const record = materializePatchedMutationRecord(
      storage,
      {
        entity: mutation.entity,
        existingRecord,
        values: values ?? mergeRecordValues(existingRecord.values, mutation.values),
      },
      validateConstraints,
    );

    appendMutationWriteLogChange(storage, {
      mutationId: mutation.mutationId,
      op: mutation.op,
      entity: mutation.entity,
      record,
      createdAt: changedAt,
    });

    return committedWrite(
      readCommittedMutationResponse(storage, {
        mutationId: mutation.mutationId,
        record,
      }),
    );
  });
}

export function deleteStoredRecord(
  storage: DurableObjectStorage,
  mutation: DeleteMutation,
): MutationResponse {
  return writeOutcomeResponse(deleteStoredRecordOutcome(storage, mutation));
}

export function deleteStoredRecordOutcome(
  storage: DurableObjectStorage,
  mutation: DeleteMutation,
): WriteOutcome<MutationResponse> {
  return storage.transactionSync(() => {
    const existingResponse = readMutationReplayResponse(storage, mutation.mutationId);

    if (existingResponse) {
      return replayedWrite(existingResponse);
    }

    const existingRecord = getStoredRecord(storage, mutation.recordId);

    if (!existingRecord) {
      throw new Error(`Record "${mutation.recordId}" does not exist.`);
    }

    const deletedAt = nowIsoString();
    assertDeleteMutationCanMaterialize(mutation, existingRecord);
    const record = materializeDeletedMutationRecord(storage, existingRecord, deletedAt);

    appendMutationWriteLogChange(storage, {
      mutationId: mutation.mutationId,
      op: mutation.op,
      entity: mutation.entity,
      record,
      createdAt: deletedAt,
    });

    return committedWrite(
      readCommittedMutationResponse(storage, {
        mutationId: mutation.mutationId,
        record,
      }),
    );
  });
}

export function tombstoneRecordsForAction(
  storage: DurableObjectStorage,
  actionId: string,
  entity: string,
  action: string,
  recordsToTombstone: StoredRecord[],
): ActionResponse {
  return writeOutcomeResponse(
    tombstoneRecordsForActionOutcome(storage, actionId, entity, action, recordsToTombstone),
  );
}

export function tombstoneRecordsForActionOutcome(
  storage: DurableObjectStorage,
  actionId: string,
  entity: string,
  action: string,
  recordsToTombstone: StoredRecord[],
): WriteOutcome<ActionResponse> {
  return storage.transactionSync(() => {
    const existingResponse = getActionResponseById(storage, actionId);

    if (existingResponse) {
      return replayedWrite(existingResponse);
    }

    const deletedAt = nowIsoString();
    const records = materializeActionTombstoneRecords(storage, recordsToTombstone, deletedAt);

    appendActionRecordChanges(storage, {
      actionId,
      entity,
      records,
      createdAt: deletedAt,
    });

    return committedWrite(
      commitActionWriteLog(storage, {
        actionId,
        entity,
        action,
        createdAt: deletedAt,
      }),
    );
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
  return writeOutcomeResponse(
    createRecordsForActionOutcome(
      storage,
      actionId,
      entity,
      action,
      recordValuesToCreate,
      validateConstraints,
    ),
  );
}

export function createRecordsForActionOutcome(
  storage: DurableObjectStorage,
  actionId: string,
  entity: string,
  action: string,
  recordValuesToCreate: RecordValues[],
  validateConstraints?: RecordConstraintValidator,
): WriteOutcome<ActionResponse> {
  return storage.transactionSync(() => {
    const existingResponse = getActionResponseById(storage, actionId);

    if (existingResponse) {
      return replayedWrite(existingResponse);
    }

    const createdAt = nowIsoString();
    const records = materializeCreatedActionRecords(
      storage,
      entity,
      recordValuesToCreate,
      createdAt,
      validateConstraints,
    );

    appendActionRecordChanges(storage, {
      actionId,
      entity,
      records,
      createdAt,
    });

    return committedWrite(
      commitActionWriteLog(storage, {
        actionId,
        entity,
        action,
        createdAt,
      }),
    );
  });
}

export function createRecordSetForActionOutcome(
  storage: DurableObjectStorage,
  actionId: string,
  entity: string,
  action: string,
  plans: ActionRecordCreatePlan[],
  validateConstraints?: RecordConstraintValidator,
): WriteOutcome<ActionResponse> {
  return storage.transactionSync(() => {
    const existingResponse = getActionResponseById(storage, actionId);

    if (existingResponse) {
      return replayedWrite(existingResponse);
    }

    const createdAt = nowIsoString();
    const records = materializeCreatedActionRecordSet(
      storage,
      plans,
      createdAt,
      validateConstraints,
    );

    appendActionRecordChanges(storage, {
      actionId,
      records,
      createdAt,
    });

    return committedWrite(
      commitActionWriteLog(storage, {
        actionId,
        entity,
        action,
        createdAt,
      }),
    );
  });
}

export function writeRecordSetForActionOutcome(
  storage: DurableObjectStorage,
  actionId: string,
  entity: string,
  action: string,
  plans: ActionRecordWritePlan[],
  validateConstraints?: RecordConstraintValidator,
): WriteOutcome<ActionResponse> {
  return storage.transactionSync(() => {
    const existingResponse = getActionResponseById(storage, actionId);

    if (existingResponse) {
      return replayedWrite(existingResponse);
    }

    const changedAt = nowIsoString();
    const records = materializeActionRecordWrites(storage, plans, changedAt, validateConstraints);

    appendActionRecordChanges(storage, {
      actionId,
      records,
      createdAt: changedAt,
    });

    return committedWrite(
      commitActionWriteLog(storage, {
        actionId,
        entity,
        action,
        createdAt: changedAt,
      }),
    );
  });
}

function materializeActionTombstoneRecords(
  storage: DurableObjectStorage,
  recordsToTombstone: StoredRecord[],
  deletedAt: string,
): StoredRecord[] {
  return recordsToTombstone.map((record) =>
    materializeActionTombstoneRecord(storage, record, deletedAt),
  );
}

function materializeActionTombstoneRecord(
  storage: DurableObjectStorage,
  existingRecord: StoredRecord,
  deletedAt: string,
): StoredRecord {
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

  return record;
}

function materializeCreatedActionRecords(
  storage: DurableObjectStorage,
  entity: string,
  recordValuesToCreate: RecordValues[],
  createdAt: string,
  validateConstraints?: RecordConstraintValidator,
): StoredRecord[] {
  return recordValuesToCreate.map((values) =>
    materializeCreatedActionRecord(
      storage,
      {
        entity,
        values,
        createdAt,
      },
      validateConstraints,
    ),
  );
}

function materializeCreatedActionRecordSet(
  storage: DurableObjectStorage,
  plans: ActionRecordCreatePlan[],
  createdAt: string,
  validateConstraints?: RecordConstraintValidator,
): StoredRecord[] {
  const createdRecords: StoredRecord[] = [];

  for (const plan of plans) {
    const values =
      typeof plan.values === "function" ? plan.values([...createdRecords]) : plan.values;
    const record = materializeCreatedActionRecord(
      storage,
      {
        entity: plan.entity,
        id: plan.id,
        values,
        createdAt,
      },
      validateConstraints,
    );

    createdRecords.push(record);
  }

  return createdRecords;
}

function materializeActionRecordWrites(
  storage: DurableObjectStorage,
  plans: ActionRecordWritePlan[],
  changedAt: string,
  validateConstraints?: RecordConstraintValidator,
): StoredRecord[] {
  const writtenRecords: StoredRecord[] = [];

  for (const plan of plans) {
    if (plan.kind === "create") {
      const values =
        typeof plan.values === "function" ? plan.values([...writtenRecords]) : plan.values;
      const record = materializeCreatedActionRecord(
        storage,
        {
          entity: plan.entity,
          id: plan.id,
          values,
          createdAt: changedAt,
        },
        validateConstraints,
      );

      writtenRecords.push(record);
      continue;
    }

    const record = resolveActionRecordWriteTarget(plan.record, writtenRecords);

    if (plan.kind === "patch") {
      const values =
        typeof plan.values === "function" ? plan.values([...writtenRecords]) : plan.values;

      writtenRecords.push(
        materializePatchedActionRecord(storage, record, values, validateConstraints),
      );
      continue;
    }

    writtenRecords.push(materializeActionTombstoneRecord(storage, record, changedAt));
  }

  return writtenRecords;
}

function resolveActionRecordWriteTarget(
  target: ActionRecordWriteTarget,
  writtenRecords: StoredRecord[],
) {
  return typeof target === "function" ? target([...writtenRecords]) : target;
}

function materializePatchedActionRecord(
  storage: DurableObjectStorage,
  existingRecord: StoredRecord,
  values: RecordValues,
  validateConstraints?: RecordConstraintValidator,
): StoredRecord {
  const record: StoredRecord = {
    ...existingRecord,
    values,
  };

  validateConstraints?.(record.entity, record.values, { ignoreRecordId: record.id });

  storage.sql.exec(
    `
      UPDATE records
      SET values_json = ?
      WHERE id = ?
    `,
    JSON.stringify(record.values),
    record.id,
  );

  return record;
}

function materializeCreatedActionRecord(
  storage: DurableObjectStorage,
  input: {
    entity: string;
    id?: string;
    values: RecordValues;
    createdAt: string;
  },
  validateConstraints?: RecordConstraintValidator,
): StoredRecord {
  validateConstraints?.(input.entity, input.values);

  return insertCreatedRecord(storage, input.entity, input.values, input.createdAt, input.id);
}

function materializeCreatedMutationRecords(
  storage: DurableObjectStorage,
  entity: string,
  recordValuesToCreate: RecordValues[],
  createdAt: string,
  validateConstraints?: RecordConstraintValidator,
): StoredRecord[] {
  return recordValuesToCreate.map((values) =>
    materializeCreatedMutationRecord(
      storage,
      {
        entity,
        values,
        createdAt,
      },
      validateConstraints,
    ),
  );
}

function materializeCreatedMutationRecord(
  storage: DurableObjectStorage,
  input: {
    entity: string;
    values: RecordValues;
    createdAt: string;
  },
  validateConstraints?: RecordConstraintValidator,
): StoredRecord {
  validateConstraints?.(input.entity, input.values);

  return insertCreatedRecord(storage, input.entity, input.values, input.createdAt);
}

function materializePatchedMutationRecord(
  storage: DurableObjectStorage,
  input: {
    entity: string;
    existingRecord: StoredRecord;
    values: RecordValues;
  },
  validateConstraints?: RecordConstraintValidator,
): StoredRecord {
  const record: StoredRecord = {
    ...input.existingRecord,
    values: input.values,
  };

  validateConstraints?.(input.entity, record.values, { ignoreRecordId: record.id });

  storage.sql.exec(
    `
      UPDATE records
      SET values_json = ?
      WHERE id = ?
    `,
    JSON.stringify(record.values),
    record.id,
  );

  return record;
}

function assertDeleteMutationCanMaterialize(
  mutation: DeleteMutation,
  existingRecord: StoredRecord,
) {
  if (existingRecord.entity !== mutation.entity) {
    throw new Error("Delete entity must match the stored record entity.");
  }

  if (existingRecord.deletedAt) {
    throw new Error(`Record "${mutation.recordId}" is already tombstoned.`);
  }
}

function materializeDeletedMutationRecord(
  storage: DurableObjectStorage,
  existingRecord: StoredRecord,
  deletedAt: string,
): StoredRecord {
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

  return record;
}

function appendMutationRecordChanges(
  storage: DurableObjectStorage,
  input: {
    mutationId: string;
    op: ChangeRow["op"];
    entity: string;
    records: StoredRecord[];
    createdAt: string;
  },
) {
  for (const record of input.records) {
    appendMutationWriteLogChange(storage, {
      mutationId: input.mutationId,
      op: input.op,
      entity: input.entity,
      record,
      createdAt: input.createdAt,
    });
  }
}

function appendActionRecordChanges(
  storage: DurableObjectStorage,
  input: {
    actionId: string;
    entity?: string;
    records: StoredRecord[];
    createdAt: string;
  },
) {
  for (const record of input.records) {
    appendActionWriteLogChange(storage, {
      actionId: input.actionId,
      entity: input.entity ?? record.entity,
      record,
      createdAt: input.createdAt,
    });
  }
}

function insertCreatedRecord(
  storage: DurableObjectStorage,
  entity: string,
  values: RecordValues,
  createdAt: string,
  id = createRecordId(),
): StoredRecord {
  const record: StoredRecord = {
    id,
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

  return record;
}

export function getActionResponseById(
  storage: DurableObjectStorage,
  actionId: string,
): ActionResponse | undefined {
  return readActionReplayResponse(storage, actionId);
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

function assertSnapshotRecordIdsAreUnique(records: StoredRecord[]) {
  const seen = new Set<string>();

  for (const record of records) {
    if (seen.has(record.id)) {
      throw new Error(`Storage snapshot includes duplicate record id "${record.id}".`);
    }

    seen.add(record.id);
  }
}

function storedRecordsEqual(left: StoredRecord | undefined, right: StoredRecord) {
  return (
    left !== undefined &&
    left.id === right.id &&
    left.entity === right.entity &&
    left.createdAt === right.createdAt &&
    left.deletedAt === right.deletedAt &&
    recordValuesEqual(left.values, right.values)
  );
}

function recordValuesEqual(left: RecordValues, right: RecordValues) {
  const leftEntries = Object.entries(left);
  const rightKeys = new Set(Object.keys(right));

  if (leftEntries.length !== rightKeys.size) {
    return false;
  }

  return leftEntries.every(
    ([fieldName, fieldValue]) => rightKeys.has(fieldName) && right[fieldName] === fieldValue,
  );
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
  return readMutationReplayResponse(storage, mutationId);
}

function fallbackPackageAppMigrationState(
  input: ApplyPackageAppMigrationsInput,
): PackageAppMigrationState {
  return {
    packageAppKey: input.packageAppKey,
    packageRevision: input.currentPackageRevision,
    sourceSchemaHash: input.currentSourceSchemaHash,
    updatedAt: input.now ?? nowIsoString(),
  };
}

function skippedAppliedPackageAppMigrations(
  migrations: readonly AuthorityPackageAppMigration[],
  appliedById: Map<UpgradeMigrationId, AppliedPackageAppMigration>,
): AppliedPackageAppMigration[] {
  return migrations
    .map((migration) => appliedById.get(migration.id))
    .filter((migration): migration is AppliedPackageAppMigration => migration !== undefined);
}

function validateAppliedPackageMigrationChecksums(
  migrations: readonly AuthorityPackageAppMigration[],
  appliedById: Map<UpgradeMigrationId, AppliedPackageAppMigration>,
) {
  for (const migration of migrations) {
    const applied = appliedById.get(migration.id);

    if (applied && applied.checksum !== migration.checksum) {
      throw new Error(
        `Applied package app migration "${migration.id}" for package "${migration.family.packageAppKey}" has checksum "${applied.checksum}", expected "${migration.checksum}".`,
      );
    }
  }
}

function recordAppliedPackageAppMigration(
  storage: DurableObjectStorage,
  migration: AppliedPackageAppMigration,
) {
  storage.sql.exec(
    `
      INSERT INTO ${appliedPackageAppMigrationsTableName} (
        package_app_key,
        migration_id,
        checksum,
        from_package_revision,
        to_package_revision,
        source_schema_hash,
        applied_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    migration.packageAppKey,
    migration.migrationId,
    migration.checksum,
    migration.fromPackageRevision,
    migration.toPackageRevision,
    migration.sourceSchemaHash,
    migration.appliedAt,
  );
}

function upsertPackageAppMigrationState(
  storage: DurableObjectStorage,
  state: PackageAppMigrationState,
) {
  storage.sql.exec(
    `
      INSERT INTO ${packageAppStateTableName} (
        package_app_key,
        package_revision,
        source_schema_hash,
        updated_at
      )
      VALUES (?, ?, ?, ?)
      ON CONFLICT(package_app_key) DO UPDATE SET
        package_revision = excluded.package_revision,
        source_schema_hash = excluded.source_schema_hash,
        updated_at = excluded.updated_at
    `,
    state.packageAppKey,
    state.packageRevision,
    state.sourceSchemaHash,
    state.updatedAt,
  );
}

function appliedPackageAppMigrationFromRow(
  row: AppliedPackageAppMigrationRow,
): AppliedPackageAppMigration {
  return {
    appliedAt: row.applied_at,
    checksum: row.checksum,
    fromPackageRevision: row.from_package_revision,
    migrationId: row.migration_id,
    packageAppKey: row.package_app_key as PackageAppKey,
    sourceSchemaHash: row.source_schema_hash,
    toPackageRevision: row.to_package_revision,
  };
}

function packageAppStateFromRow(row: PackageAppStateRow): PackageAppMigrationState {
  return {
    packageAppKey: row.package_app_key as PackageAppKey,
    packageRevision: row.package_revision,
    sourceSchemaHash: row.source_schema_hash,
    updatedAt: row.updated_at,
  };
}

function upsertOperationInvocation(
  storage: DurableObjectStorage,
  input: {
    authDecision: OperationInvocationAuthDecision;
    envelope: OperationInvocationEnvelope;
    errorMessage?: string;
    output?: OperationInvocationOutput;
    status: OperationInvocationStatus;
  },
) {
  ensureOperationInvocationTables(storage);

  const existing = getOperationInvocationById(storage, input.envelope.invocationId);
  const updatedAt = nowIsoString();
  const completedAt = operationInvocationStatusIsTerminal(input.status) ? updatedAt : undefined;
  const affectedChangeIds = input.output ? operationInvocationAffectedChangeIds(input.output) : [];
  const statusHistory = appendOperationInvocationStatusHistory(
    existing?.statusHistory ?? [],
    input.status,
    updatedAt,
  );
  const auditInput = operationInvocationAuditInput(input.envelope);

  storage.sql.exec(
    `
      INSERT INTO ${operationInvocationsTableName} (
        invocation_id,
        operation_key,
        operation_kind,
        entity,
        operation_name,
        actor_kind,
        auth_decision,
        source_protocol,
        source_json,
        app_storage_identity_json,
        input_hash,
        input_audit_json,
        affected_change_ids_json,
        idempotency_json,
        output_json,
        status,
        status_history_json,
        error_message,
        received_at,
        updated_at,
        completed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(invocation_id) DO UPDATE SET
        operation_key = excluded.operation_key,
        operation_kind = excluded.operation_kind,
        entity = excluded.entity,
        operation_name = excluded.operation_name,
        actor_kind = excluded.actor_kind,
        auth_decision = excluded.auth_decision,
        source_protocol = excluded.source_protocol,
        source_json = excluded.source_json,
        app_storage_identity_json = excluded.app_storage_identity_json,
        input_hash = excluded.input_hash,
        input_audit_json = excluded.input_audit_json,
        affected_change_ids_json = excluded.affected_change_ids_json,
        idempotency_json = excluded.idempotency_json,
        output_json = COALESCE(excluded.output_json, ${operationInvocationsTableName}.output_json),
        status = excluded.status,
        status_history_json = excluded.status_history_json,
        error_message = excluded.error_message,
        updated_at = excluded.updated_at,
        completed_at = COALESCE(excluded.completed_at, ${operationInvocationsTableName}.completed_at)
    `,
    input.envelope.invocationId,
    input.envelope.operation.canonicalKey,
    input.envelope.operation.kind,
    input.envelope.operation.entityName,
    input.envelope.operation.operationName,
    input.envelope.actor.kind,
    input.authDecision,
    input.envelope.source.protocol,
    JSON.stringify(input.envelope.source),
    JSON.stringify(input.envelope.appStorageIdentity),
    hashOperationInvocationInput(input.envelope.input),
    JSON.stringify(auditInput),
    JSON.stringify(affectedChangeIds),
    JSON.stringify(input.envelope.idempotency),
    input.output === undefined ? null : JSON.stringify(input.output),
    input.status,
    JSON.stringify(statusHistory),
    input.errorMessage ?? null,
    input.envelope.receivedAt,
    updatedAt,
    completedAt ?? null,
  );
}

function operationInvocationFromRow(row: OperationInvocationRow): StoredOperationInvocation {
  return {
    invocationId: row.invocation_id,
    operationKey: row.operation_key,
    operationKind: row.operation_kind,
    entity: row.entity,
    operationName: row.operation_name,
    actorKind: row.actor_kind,
    authDecision: row.auth_decision,
    sourceProtocol: row.source_protocol,
    source: JSON.parse(row.source_json) as OperationInvocationEnvelope["source"],
    appStorageIdentity: JSON.parse(
      row.app_storage_identity_json,
    ) as OperationInvocationEnvelope["appStorageIdentity"],
    inputHash: row.input_hash,
    auditInput: JSON.parse(row.input_audit_json) as OperationInvocationAuditInput,
    affectedChangeIds: JSON.parse(row.affected_change_ids_json) as string[],
    idempotency: JSON.parse(row.idempotency_json) as OperationInvocationEnvelope["idempotency"],
    ...(row.output_json === null
      ? {}
      : { output: JSON.parse(row.output_json) as OperationInvocationOutput }),
    status: row.status,
    statusHistory: JSON.parse(row.status_history_json) as OperationInvocationStatusHistoryEntry[],
    ...(row.error_message === null ? {} : { errorMessage: row.error_message }),
    receivedAt: row.received_at,
    updatedAt: row.updated_at,
    ...(row.completed_at === null ? {} : { completedAt: row.completed_at }),
  };
}

function appendOperationInvocationStatusHistory(
  history: OperationInvocationStatusHistoryEntry[],
  status: OperationInvocationStatus,
  at: string,
): OperationInvocationStatusHistoryEntry[] {
  if (history.at(-1)?.status === status) {
    return history;
  }

  return [...history, { status, at }];
}

function operationInvocationStatusIsTerminal(status: OperationInvocationStatus) {
  return (
    status === "rejected" || status === "committed" || status === "replayed" || status === "failed"
  );
}

function operationInvocationAffectedChangeIds(output: OperationInvocationOutput): string[] {
  if (output.type === "list" || output.type === "get") {
    return [];
  }

  return output.affectedChangeIds;
}

function operationInvocationAuditInput(
  envelope: OperationInvocationEnvelope,
): OperationInvocationAuditInput {
  const policy = envelope.schemaOperation.audit.input;

  if (policy === "none") {
    return { kind: "none" };
  }

  if (policy === "hash") {
    return { kind: "hash" };
  }

  if (policy === "snapshot") {
    return {
      kind: "snapshot",
      snapshot: redactUnsafeAuditValue(envelope.input),
    };
  }

  return {
    kind: "summary",
    summary: summarizeOperationInvocationInput(envelope.input),
  };
}

function summarizeOperationInvocationInput(
  input: OperationInvocationInput,
): OperationInvocationInputSummary {
  if (input.type === "list") {
    return { type: "list" };
  }

  if (input.type === "get" || input.type === "delete") {
    return { type: input.type, recordId: input.recordId };
  }

  if (input.type === "create") {
    return {
      type: "create",
      fieldNames: recordFieldNames(input.values),
      valuesType: auditValueType(input.values),
    };
  }

  if (input.type === "update") {
    return {
      type: "update",
      fieldNames: recordFieldNames(input.values),
      recordId: input.recordId,
      valuesType: auditValueType(input.values),
    };
  }

  return {
    type: "command",
    inputFields: recordFieldNames(input.input),
    inputType: auditValueType(input.input),
    ...(input.recordId === undefined ? {} : { recordId: input.recordId }),
  };
}

function recordFieldNames(value: unknown): string[] | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }

  return Object.keys(value)
    .filter((key) => !isUnsafeAuditInputKey(key))
    .sort();
}

function auditValueType(value: unknown): string {
  if (Array.isArray(value)) {
    return "array";
  }

  if (value === null) {
    return "null";
  }

  return typeof value;
}

function redactUnsafeAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactUnsafeAuditValue);
  }

  if (!isJsonObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      isUnsafeAuditInputKey(key) ? "[redacted]" : redactUnsafeAuditValue(nestedValue),
    ]),
  );
}

function isUnsafeAuditInputKey(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");

  return (
    normalized.includes("secret") ||
    normalized.includes("token") ||
    normalized.includes("password") ||
    normalized.includes("proof") ||
    normalized.includes("challenge") ||
    normalized.includes("credential") ||
    normalized.includes("apikey")
  );
}

function hashOperationInvocationInput(input: OperationInvocationInput) {
  return `fnv1a64:${fnv1a64(stableJsonStringify(input))}`;
}

function fnv1a64(value: string) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * prime) & mask;
  }

  return hash.toString(16).padStart(16, "0");
}

function stableJsonStringify(value: unknown) {
  return JSON.stringify(stableJsonValue(value));
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableJsonValue);
  }

  if (!isJsonObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => [key, stableJsonValue(nestedValue)]),
  );
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown operation invocation error.";

  return message.replace(/"([^"]+)"/g, (match, key: string) =>
    isUnsafeAuditInputKey(key) ? '"[redacted]"' : match,
  );
}

function schemasEqual(left: AppSchema, right: AppSchema) {
  return stringifySchema(left) === stringifySchema(right);
}

function writeOutcomeResponse<T>(outcome: WriteOutcome<T>): T {
  return outcome.response;
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

function parseJsonRecord(value: string): RecordValues {
  const parsed = JSON.parse(value) as unknown;

  if (!isRecordValues(parsed)) {
    throw new Error("Stored record values are invalid.");
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
