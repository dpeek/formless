import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { createWorkerHarness } from "./miniflare-test.ts";
import type {
  ActionResponse,
  BootstrapResponse,
  ChangeRow,
  MutationResponse,
  StoredRecord,
  StoreSnapshot,
  SyncResponse,
} from "../shared/protocol.ts";
import type { AppSchema } from "../shared/schema.ts";
import type {
  AppliedPackageAppMigration,
  ApplyPackageAppMigrationsResponse,
  PackageAppMigrationState,
  WriteOutcome,
} from "./storage.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

let harness: Harness;
let storageHarnessDir: string | undefined;
let storageHarnessName: string;

beforeAll(async () => {
  harness = await createWorkerHarness(await writeStorageHarness(), {
    STORAGE_HARNESS: { className: "StorageHarness", useSQLite: true },
  });
});

beforeEach(() => {
  storageHarnessName = randomUUID();
});

afterAll(async () => {
  await harness.dispose();

  if (storageHarnessDir) {
    await rm(storageHarnessDir, { recursive: true, force: true });
    storageHarnessDir = undefined;
  }
});

describe("storage", () => {
  it("seeds the active schema when storage is empty", async () => {
    const stored = await getJson<{ schema: AppSchema; updatedAt: string }>("/schema");

    expect(stored.schema.entities.task.label).toBe("Task");
    expect(stored.updatedAt).toEqual(expect.any(String));
  });

  it("persists schema updates", async () => {
    const nextSchema = {
      version: 1,
      entities: {
        task: {
          label: "Planner task",
          fields: {
            title: { type: "text", required: true },
            done: { type: "boolean", required: true, default: false },
            dueDate: { type: "date", required: false },
            notes: { type: "text", required: false },
          },
          mutations: defaultMutations(),
        },
      },
      queries: defaultQueries(),
      itemViews: defaultItemViews(),
      tableViews: {},
      views: defaultViews(),
      screens: defaultScreens(),
    } satisfies AppSchema;

    await postJson("/schema", nextSchema);

    const stored = await getJson<{ schema: AppSchema }>("/schema");

    expect(stored.schema).toEqual(nextSchema);
  });

  it("resets schema, records, and changes", async () => {
    const nextSchema = {
      version: 1,
      entities: {
        task: {
          label: "Planner task",
          fields: {
            title: { type: "text", required: true },
            done: { type: "boolean", required: true, default: false },
            dueDate: { type: "date", required: false },
            notes: { type: "text", required: false },
          },
          mutations: defaultMutations(),
        },
      },
      queries: defaultQueries(),
      itemViews: defaultItemViews(),
      tableViews: {},
      views: defaultViews(),
      screens: defaultScreens(),
    } satisfies AppSchema;

    await postJson("/schema", nextSchema);
    await createRecord("mutation-1", "First");

    const reset = await postJson<{ schema: AppSchema; updatedAt: string }>("/reset", {});

    expect(reset.schema.entities.task.label).toBe("Task");
    expect(reset.updatedAt).toEqual(expect.any(String));
    expect(await getJson<unknown[]>("/records")).toEqual([]);
    expect(await getJson<unknown[]>("/changes?after=0")).toEqual([]);
    expect(await getJson<number>("/cursor")).toBe(0);
  });

  it("clears record, change, and action execution tables before writing source seed rows", async () => {
    const completed = await createRecord("mutation-before-reset", "Done", true);
    const action = await postJson<ActionResponse>("/tombstone-records", {
      actionId: "action-before-reset",
      recordIds: [completed.record.id],
    });
    const sourceRecord = record("seed-reset-task", "Seed reset", {
      createdAt: "2026-05-28T00:00:03.000Z",
      values: { title: "Seed reset", done: false, priority: "normal" },
    });

    await postJson("/source-seed", {
      changeMutationPrefix: "reset-seed",
      records: [sourceRecord],
    });
    const changes = await getJson<ChangeRow[]>("/changes?after=0");

    expect(action.cursor).toBe(2);
    expect(
      await getJson<ActionResponse | null>("/action-response?actionId=action-before-reset"),
    ).toBeNull();
    expect(await getJson<StoredRecord[]>("/records")).toEqual([sourceRecord]);
    expect(changes).toEqual([
      expect.objectContaining({
        seq: 1,
        mutationId: "reset-seed:seed-reset-task",
        op: "create",
        recordId: sourceRecord.id,
        payload: sourceRecord,
        createdAt: sourceRecord.createdAt,
      }),
    ]);
    expect(await getJson<number>("/cursor")).toBe(1);
  });

  it("creates records, records changes, and advances the cursor", async () => {
    expect(await getJson<number>("/cursor")).toBe(0);

    const response = await createRecord("mutation-1", "First");

    expect(response.cursor).toBe(1);
    expect(response.record).toMatchObject({
      entity: "task",
      values: { title: "First", done: false },
    });
    expect(await getJson<number>("/cursor")).toBe(1);

    const records = await getJson<unknown[]>("/records");
    const changes = await getJson<unknown[]>("/changes?after=0");

    expect(records).toHaveLength(1);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      mutationId: "mutation-1",
      op: "create",
      recordId: response.record.id,
    });
  });

  it("commits source seed records as ordered write-log changes read by sync", async () => {
    const sourceRecords = [
      record("seed-task-1", "Seed one", { createdAt: "2026-05-28T00:00:01.000Z" }),
      record("seed-task-2", "Seed two", { createdAt: "2026-05-28T00:00:02.000Z" }),
    ];

    await postJson("/source-seed", {
      changeMutationPrefix: "seed-task",
      records: sourceRecords,
    });
    const initialSync = await getJson<SyncResponse>("/sync?after=0");

    if (!initialSync.schemaUpdatedAt) {
      throw new Error("Expected initial sync to include schema metadata.");
    }

    const catchUp = await getJson<SyncResponse>(
      `/sync?after=1&schemaUpdatedAt=${encodeURIComponent(initialSync.schemaUpdatedAt)}`,
    );

    expect(initialSync.cursor).toBe(2);
    expect(initialSync.schema).toBeTruthy();
    expect(initialSync.changes.map((change) => change.seq)).toEqual([1, 2]);
    expect(initialSync.changes.map((change) => change.mutationId)).toEqual([
      "seed-task:seed-task-1",
      "seed-task:seed-task-2",
    ]);
    expect(initialSync.changes.map((change) => change.op)).toEqual(["create", "create"]);
    expect(initialSync.changes.map((change) => change.payload)).toEqual(sourceRecords);
    expect(catchUp).toEqual({
      changes: [initialSync.changes[1]],
      cursor: 2,
    });
  });

  it("classifies committed and replayed mutation outcomes without duplicate changes", async () => {
    const body = {
      mutationId: "mutation-outcome",
      entity: "task",
      op: "create",
      values: { title: "Outcome", done: false },
    };

    const first = await postJson<WriteOutcome<MutationResponse>>("/create-outcome", body);
    const replay = await postJson<WriteOutcome<MutationResponse>>("/create-outcome", body);

    expect(first.kind).toBe("committed");
    expect(replay.kind).toBe("replay");
    expect(replay.response).toEqual(first.response);
    expect(first.response.cursor).toBe(1);
    expect(await getJson<ChangeRow[]>("/changes?after=0")).toEqual(first.response.changes);
  });

  it("preserves number values through records and change rows", async () => {
    const response = await postJson<MutationResponse>("/create", {
      mutationId: "mutation-1",
      entity: "task",
      op: "create",
      values: { title: "Estimated", done: false, estimate: 5 },
    });
    const records = await getJson<MutationResponse["record"][]>("/records");
    const changes = await getJson<unknown[]>("/changes?after=0");

    expect(response.record.values.estimate).toBe(5);
    expect(records[0]?.values.estimate).toBe(5);
    expect(changes[0]).toMatchObject({
      payload: {
        values: {
          estimate: 5,
        },
      },
    });
  });

  it("replays the same mutationId without inserting a duplicate record", async () => {
    const first = await createRecord("mutation-1", "First");
    const replay = await createRecord("mutation-1", "First");

    expect(replay.record.id).toBe(first.record.id);
    expect(replay.cursor).toBe(1);
    expect(await getJson<unknown[]>("/records")).toHaveLength(1);
    expect(await getJson<unknown[]>("/changes?after=0")).toHaveLength(1);
  });

  it("commits create side effects in the same mutation response", async () => {
    const body = {
      mutation: {
        mutationId: "mutation-1",
        entity: "task",
        op: "create",
        values: { title: "First", done: false },
      },
      caused: [
        {
          entity: "task",
          values: [{ title: "Lifecycle", done: false }],
        },
      ],
    };

    const first = await postJson<MutationResponse>("/create-with-side-effects", body);
    const replay = await postJson<MutationResponse>("/create-with-side-effects", {
      ...body,
      fail: true,
    });

    expect(first.cursor).toBe(2);
    expect(first.changes.map((change) => change.op)).toEqual(["create", "action"]);
    expect(first.changes.map((change) => change.seq)).toEqual([1, 2]);
    expect(first.changes[0]?.payload).toEqual(first.record);
    expect(first.changes[1]?.payload.values).toEqual({ title: "Lifecycle", done: false });
    expect(await getJson<unknown[]>("/records")).toHaveLength(2);
    expect(await getJson<unknown[]>("/changes?after=0")).toHaveLength(2);
    expect(replay).toEqual(first);
  });

  it("rolls back the primary create when a side effect fails", async () => {
    const response = await fetchStorage("/create-with-side-effects", {
      body: JSON.stringify({
        mutation: {
          mutationId: "mutation-1",
          entity: "task",
          op: "create",
          values: { title: "First", done: false },
        },
        fail: true,
      }),
      method: "POST",
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "side effect failed" });
    expect(await getJson<unknown[]>("/records")).toEqual([]);
    expect(await getJson<unknown[]>("/changes?after=0")).toEqual([]);
    expect(await getJson<number>("/cursor")).toBe(0);
  });

  it("returns only changes after the requested cursor", async () => {
    await createRecord("mutation-1", "First");
    const second = await createRecord("mutation-2", "Second");

    const changes = await getJson<unknown[]>("/changes?after=1");

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      mutationId: "mutation-2",
      recordId: second.record.id,
    });
  });

  it("patches records, writes a patch change, and preserves typed values", async () => {
    const created = await postJson<MutationResponse>("/create", {
      mutationId: "mutation-1",
      entity: "task",
      op: "create",
      values: { title: "First", done: false, estimate: 5, priority: "high" },
    });
    const patched = await postJson<MutationResponse>("/patch", {
      mutationId: "mutation-2",
      entity: "task",
      op: "patch",
      recordId: created.record.id,
      values: { title: "Second", done: true },
    });
    const records = await getJson<unknown[]>("/records");
    const changes = await getJson<unknown[]>("/changes?after=1");

    expect(patched.cursor).toBe(2);
    expect(patched.record).toMatchObject({
      id: created.record.id,
      values: { title: "Second", done: true, estimate: 5, priority: "high" },
    });
    expect(records).toEqual([patched.record]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      mutationId: "mutation-2",
      op: "patch",
      payload: patched.record,
    });
  });

  it("prunes retired values during source schema reset and records patch changes", async () => {
    const sourceSchema = await getJson<{ schema: AppSchema; updatedAt: string }>("/schema");
    const task = taskSchema();

    await postJson("/schema", {
      ...task,
      entities: {
        ...task.entities,
        task: {
          ...task.entities.task,
          fields: {
            ...task.entities.task.fields,
            notes: { type: "text", required: false },
          },
        },
      },
    } satisfies AppSchema);
    const created = await postJson<MutationResponse>("/create", {
      mutationId: "mutation-retired-values",
      entity: "task",
      op: "create",
      values: {
        title: "Retired values",
        done: false,
        priority: "high",
        estimate: 8,
        notes: "Prune on source schema reset",
      },
    });

    const reset = await postJson<{ schema: AppSchema; updatedAt: string }>(
      "/reset-schema-to-source",
      {},
    );
    const resetRecord = (await getJson<StoredRecord[]>("/records")).find(
      (record) => record.id === created.record.id,
    );
    const changes = await getJson<ChangeRow[]>(`/changes?after=${created.cursor}`);

    expect(reset.schema).toEqual(sourceSchema.schema);
    expect(reset.schema.entities.task.fields).not.toHaveProperty("notes");
    expect(reset.schema.entities.task.fields).not.toHaveProperty("estimate");
    expect(resetRecord?.values).toEqual({
      title: "Retired values",
      done: false,
      priority: "high",
    });
    expect(changes).toEqual([
      expect.objectContaining({
        seq: created.cursor + 1,
        mutationId: `schema-reset:${reset.updatedAt}:${created.record.id}`,
        op: "patch",
        entity: "task",
        recordId: created.record.id,
        payload: resetRecord,
        createdAt: reset.updatedAt,
      }),
    ]);
    expect(await getJson<number>("/cursor")).toBe(created.cursor + 1);
  });

  it("replays patch mutationIds without inserting duplicate changes", async () => {
    const created = await createRecord("mutation-1", "First");
    const body = {
      mutationId: "mutation-2",
      entity: "task",
      op: "patch",
      recordId: created.record.id,
      values: { done: true },
    };

    const first = await postJson<MutationResponse>("/patch", body);
    const replay = await postJson<MutationResponse>("/patch", body);

    expect(replay).toEqual(first);
    expect(await getJson<unknown[]>("/changes?after=0")).toHaveLength(2);
  });

  it("soft-deletes records through mutation writes without removing record rows", async () => {
    const created = await createRecord("mutation-1", "First");

    const deleted = await postJson<MutationResponse>("/delete", {
      mutationId: "mutation-2",
      entity: "task",
      op: "delete",
      recordId: created.record.id,
    });
    const records = await getJson<StoredRecord[]>("/records");
    const changes = await getJson<unknown[]>("/changes?after=1");

    expect(deleted.cursor).toBe(2);
    expect(deleted.record).toEqual({
      ...created.record,
      deletedAt: expect.any(String),
    });
    expect(records).toEqual([deleted.record]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      mutationId: "mutation-2",
      op: "delete",
      entity: "task",
      recordId: created.record.id,
      payload: deleted.record,
      createdAt: deleted.record.deletedAt,
    });
  });

  it("replays delete mutationIds without inserting duplicate changes", async () => {
    const created = await createRecord("mutation-1", "First");
    const body = {
      mutationId: "mutation-2",
      entity: "task",
      op: "delete",
      recordId: created.record.id,
    };

    const first = await postJson<MutationResponse>("/delete", body);
    const replay = await postJson<MutationResponse>("/delete", body);

    expect(replay).toEqual(first);
    expect(await getJson<StoredRecord[]>("/records")).toEqual([first.record]);
    expect(await getJson<unknown[]>("/changes?after=0")).toHaveLength(2);
  });

  it("classifies committed and replayed action outcomes without duplicate action rows", async () => {
    const completed = await createRecord("mutation-1", "Done", true);

    const first = await postJson<WriteOutcome<ActionResponse>>("/tombstone-records-outcome", {
      actionId: "action-outcome",
      recordIds: [completed.record.id],
    });
    const replay = await postJson<WriteOutcome<ActionResponse>>("/tombstone-records-outcome", {
      actionId: "action-outcome",
      recordIds: [],
    });

    expect(first.kind).toBe("committed");
    expect(replay.kind).toBe("replay");
    expect(replay.response).toEqual(first.response);
    expect(first.response.cursor).toBe(2);
    expect(first.response.changes.map((change) => change.seq)).toEqual([2]);
    expect(
      await getJson<ActionResponse | null>("/action-response?actionId=action-outcome"),
    ).toEqual(first.response);
    expect(await getJson<ChangeRow[]>("/changes?after=0")).toHaveLength(2);
  });

  it("tombstones requested records for action replay", async () => {
    const completed = await createRecord("mutation-1", "Done", true);
    const active = await createRecord("mutation-2", "Open");

    const action = await postJson<ActionResponse>("/tombstone-records", {
      actionId: "action-1",
      recordIds: [completed.record.id],
    });
    const records = await getJson<unknown[]>("/records");

    expect(action.changes).toHaveLength(1);
    expect(action.changes[0]).toMatchObject({
      mutationId: "action-1",
      op: "action",
      recordId: completed.record.id,
      payload: {
        id: completed.record.id,
        entity: "task",
        values: completed.record.values,
        createdAt: completed.record.createdAt,
        deletedAt: expect.any(String),
      },
    });
    expect(records).toEqual([
      expect.objectContaining({ id: completed.record.id, deletedAt: expect.any(String) }),
      active.record,
    ]);
  });

  it("replays tombstone actions by actionId", async () => {
    const completed = await createRecord("mutation-1", "Done", true);

    const first = await postJson<ActionResponse>("/tombstone-records", {
      actionId: "action-1",
      recordIds: [completed.record.id],
    });
    const replay = await postJson<ActionResponse>("/tombstone-records", {
      actionId: "action-1",
      recordIds: [],
    });

    expect(replay).toEqual(first);
    expect(await getJson<unknown[]>("/changes?after=0")).toHaveLength(2);
  });

  it("materializes action-created records before persisting action replay state", async () => {
    const first = await postJson<ActionResponse>("/create-records-for-action", {
      actionId: "action-create-followup",
      entity: "task",
      action: "createFollowupTask",
      values: [{ title: "Follow up", done: false, priority: "normal" }],
    });
    const replay = await postJson<ActionResponse>("/create-records-for-action", {
      actionId: "action-create-followup",
      entity: "task",
      action: "createFollowupTask",
      values: [{ title: "Ignored replay", done: true, priority: "high" }],
    });
    const records = await getJson<StoredRecord[]>("/records");

    expect(first).toMatchObject({
      actionId: "action-create-followup",
      cursor: 1,
      changes: [
        {
          seq: 1,
          mutationId: "action-create-followup",
          op: "action",
          entity: "task",
          recordId: first.changes[0]?.payload.id,
          payload: first.changes[0]?.payload,
          createdAt: first.changes[0]?.createdAt,
        },
      ],
    });
    expect(first.changes[0]?.payload.values).toEqual({
      title: "Follow up",
      done: false,
      priority: "normal",
    });
    expect(records).toEqual([first.changes[0]?.payload]);
    expect(
      await getJson<ActionResponse | null>("/action-response?actionId=action-create-followup"),
    ).toEqual(first);
    expect(replay).toEqual(first);
    expect(await getJson<ChangeRow[]>("/changes?after=0")).toHaveLength(1);
  });

  it("exports the active store as a schema-keyed snapshot", async () => {
    const schema = await getJson<{ schema: AppSchema; updatedAt: string }>("/schema");
    const completed = await createRecord("mutation-1", "Done", true);
    await postJson<ActionResponse>("/tombstone-records", {
      actionId: "action-1",
      recordIds: [completed.record.id],
    });

    const snapshot = await getJson<StoreSnapshot>("/snapshot");

    expect(snapshot).toMatchObject({
      kind: "formless.storeSnapshot",
      version: 1,
      schemaKey: "tasks",
      exportedAt: expect.any(String),
      schemaUpdatedAt: schema.updatedAt,
      sourceCursor: 2,
      schema: schema.schema,
    });
    expect(snapshot.records).toEqual(await getJson<StoredRecord[]>("/records"));
    expect(snapshot.records).toContainEqual(
      expect.objectContaining({ id: completed.record.id, deletedAt: expect.any(String) }),
    );
  });

  it("restores snapshot records and tombstones active records absent from the snapshot", async () => {
    await getJson<{ schema: AppSchema; updatedAt: string }>("/schema");
    const existing = await createRecord("mutation-1", "Existing");
    const beforeCursor = await getJson<number>("/cursor");
    const restoredRecord = record("snapshot-record-1", "Restored", {
      createdAt: "2026-04-28T00:00:00.000Z",
    });

    const response = await postJson<BootstrapResponse>(
      "/snapshot/restore",
      snapshot({
        sourceCursor: 0,
        records: [restoredRecord],
      }),
    );
    const syncChanges = await getJson<unknown[]>(`/changes?after=${beforeCursor}`);

    expect(response.schemaUpdatedAt).toEqual(expect.any(String));
    expect(response.schemaUpdatedAt).not.toBe("2026-04-28T00:00:00.000Z");
    expect(response.cursor).toBeGreaterThan(beforeCursor);
    expect(response.cursor).toBe(beforeCursor + 2);
    expect(response.records).toEqual([
      restoredRecord,
      expect.objectContaining({
        id: existing.record.id,
        deletedAt: response.schemaUpdatedAt,
      }),
    ]);
    expect(await getJson<number>("/cursor")).toBe(response.cursor);
    expect(syncChanges).toEqual([
      expect.objectContaining({
        seq: beforeCursor + 1,
        mutationId: `snapshot-restore:${response.schemaUpdatedAt}`,
        op: "action",
        recordId: restoredRecord.id,
        payload: restoredRecord,
        createdAt: response.schemaUpdatedAt,
      }),
      expect.objectContaining({
        seq: beforeCursor + 2,
        mutationId: `snapshot-restore:${response.schemaUpdatedAt}`,
        op: "action",
        recordId: existing.record.id,
        payload: expect.objectContaining({
          id: existing.record.id,
          deletedAt: response.schemaUpdatedAt,
        }),
        createdAt: response.schemaUpdatedAt,
      }),
    ]);
  });

  it("restores snapshots atomically on invalid storage input", async () => {
    const beforeSchema = await getJson<{ schema: AppSchema; updatedAt: string }>("/schema");
    const existing = await createRecord("mutation-1", "Existing");
    const beforeRecords = await getJson<StoredRecord[]>("/records");
    const beforeCursor = await getJson<number>("/cursor");

    const response = await fetchStorage("/snapshot/restore", {
      body: JSON.stringify(
        snapshot({
          schema: {
            ...beforeSchema.schema,
            entities: {
              ...beforeSchema.schema.entities,
              task: {
                ...beforeSchema.schema.entities.task,
                label: "Restored task",
              },
            },
          },
          records: [record(existing.record.id, "First"), record(existing.record.id, "Second")],
        }),
      ),
      method: "POST",
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: `Store snapshot includes duplicate record id "${existing.record.id}".`,
    });
    expect(await getJson<{ schema: AppSchema; updatedAt: string }>("/schema")).toEqual(
      beforeSchema,
    );
    expect(await getJson<StoredRecord[]>("/records")).toEqual(beforeRecords);
    expect(await getJson<number>("/cursor")).toBe(beforeCursor);
  });

  it("clears action replay history during restore", async () => {
    await getJson<{ schema: AppSchema; updatedAt: string }>("/schema");
    const completed = await createRecord("mutation-1", "Done", true);
    const action = await postJson<ActionResponse>("/tombstone-records", {
      actionId: "action-1",
      recordIds: [completed.record.id],
    });

    expect(await getJson<ActionResponse | null>("/action-response?actionId=action-1")).toEqual(
      action,
    );

    await postJson<BootstrapResponse>("/snapshot/restore", snapshot({ records: [] }));

    expect(await getJson<ActionResponse | null>("/action-response?actionId=action-1")).toBeNull();
  });

  it("applies package app record migrations as sync-visible Authority changes", async () => {
    await seedPackageMigrationRecords();
    const beforeCursor = await getJson<number>("/cursor");

    const first = await postJson<WriteOutcome<ApplyPackageAppMigrationsResponse>>(
      "/package-migrations/apply",
      { kind: "success" },
    );
    const records = await getJson<StoredRecord[]>("/records");
    const sync = await getJson<SyncResponse>(`/sync?after=${beforeCursor}`);
    const applied = await getJson<AppliedPackageAppMigration[]>("/applied-package-migrations");
    const state = await getJson<PackageAppMigrationState>("/package-migration-state");

    expect(first.kind).toBe("committed");
    expect(first.response.applied).toEqual([
      expect.objectContaining({
        migrationId: "2026-05-28-test-package-app-success",
        packageAppKey: "tasks",
        fromPackageRevision: 1,
        toPackageRevision: 2,
        sourceSchemaHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
      }),
    ]);
    expect(first.response.changes.map((change) => change.op)).toEqual([
      "create",
      "patch",
      "delete",
    ]);
    expect(first.response.cursor).toBe(beforeCursor + 3);
    expect(records).toContainEqual(
      expect.objectContaining({
        id: "migration-created",
        values: expect.objectContaining({ migrationTag: "created" }),
      }),
    );
    expect(records).toContainEqual(
      expect.objectContaining({
        id: "migration-open",
        values: expect.objectContaining({ title: "Migrated open", migrationTag: "patched" }),
      }),
    );
    expect(records).toContainEqual(
      expect.objectContaining({ id: "migration-done", deletedAt: expect.any(String) }),
    );
    expect(sync.changes).toEqual(first.response.changes);
    expect(sync.cursor).toBe(first.response.cursor);
    expect(sync.schema?.entities.task.fields).toHaveProperty("migrationTag");
    expect(applied).toEqual(first.response.applied);
    expect(state).toMatchObject({
      packageAppKey: "tasks",
      packageRevision: 2,
      sourceSchemaHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    });
  });

  it("replays applied package app migrations without duplicate changes", async () => {
    await seedPackageMigrationRecords();

    const first = await postJson<WriteOutcome<ApplyPackageAppMigrationsResponse>>(
      "/package-migrations/apply",
      { kind: "success" },
    );
    const replay = await postJson<WriteOutcome<ApplyPackageAppMigrationsResponse>>(
      "/package-migrations/apply",
      { kind: "success" },
    );

    expect(replay.kind).toBe("committed");
    expect(replay.response.applied).toEqual([]);
    expect(replay.response.skipped).toEqual(first.response.applied);
    expect(replay.response.changes).toEqual([]);
    expect(await getJson<ChangeRow[]>("/changes?after=0")).toHaveLength(
      packageMigrationRecords().length + first.response.changes.length,
    );
  });

  it("rolls back invalid package app migration field, reference, unique, and delete plans", async () => {
    for (const [kind, message] of [
      ["invalid-field", "unknownMigrationField"],
      ["invalid-reference", 'references unknown task record "missing-task"'],
      ["invalid-unique", 'Unique constraint "task.uniqueTitle" would be violated.'],
      ["invalid-delete", 'Cannot delete record "migration-open"'],
    ]) {
      storageHarnessName = randomUUID();
      await seedPackageMigrationRecords();

      const beforeSchema = await getJson<{ schema: AppSchema; updatedAt: string }>("/schema");
      const beforeRecords = await getJson<StoredRecord[]>("/records");
      const beforeChanges = await getJson<ChangeRow[]>("/changes?after=0");
      const beforeState = await getJson<PackageAppMigrationState | null>(
        "/package-migration-state",
      );
      const response = await fetchStorage("/package-migrations/apply", {
        body: JSON.stringify({ kind }),
        method: "POST",
      });

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: expect.stringContaining(message),
      });
      expect(await getJson<{ schema: AppSchema; updatedAt: string }>("/schema")).toEqual(
        beforeSchema,
      );
      expect(await getJson<StoredRecord[]>("/records")).toEqual(beforeRecords);
      expect(await getJson<ChangeRow[]>("/changes?after=0")).toEqual(beforeChanges);
      expect(await getJson<PackageAppMigrationState | null>("/package-migration-state")).toEqual(
        beforeState,
      );
      expect(await getJson<AppliedPackageAppMigration[]>("/applied-package-migrations")).toEqual(
        [],
      );
    }
  });
});

async function createRecord(mutationId: string, text: string, done = false) {
  return postJson<MutationResponse>("/create", {
    mutationId,
    entity: "task",
    op: "create",
    values: { title: text, done },
  });
}

async function seedPackageMigrationRecords() {
  await postJson("/source-seed", {
    changeMutationPrefix: "migration-seed",
    records: packageMigrationRecords(),
  });
}

function packageMigrationRecords(): StoredRecord[] {
  return [
    record("migration-open", "Open", {
      createdAt: "2026-05-28T00:00:01.000Z",
      values: { title: "Open", done: false, priority: "normal" },
    }),
    record("migration-done", "Done", {
      createdAt: "2026-05-28T00:00:02.000Z",
      values: { title: "Done", done: true, priority: "normal" },
    }),
    record("migration-child", "Child", {
      createdAt: "2026-05-28T00:00:03.000Z",
      values: { title: "Child", done: false, priority: "normal" },
    }),
  ];
}

function snapshot(overrides: Partial<StoreSnapshot> = {}): StoreSnapshot {
  return {
    kind: "formless.storeSnapshot",
    version: 1,
    schemaKey: "tasks",
    exportedAt: "2026-04-28T00:00:00.000Z",
    schemaUpdatedAt: "2026-04-28T00:00:00.000Z",
    sourceCursor: 1,
    schema: taskSchema(),
    records: [],
    ...overrides,
  };
}

function taskSchema(): AppSchema {
  return {
    version: 1,
    entities: {
      task: {
        label: "Task",
        fields: {
          title: { type: "text", required: true },
          done: { type: "boolean", required: true, default: false },
          dueDate: { type: "date", required: false },
          estimate: { type: "number", required: false, integer: true, min: 0 },
          priority: {
            type: "enum",
            required: false,
            values: {
              low: { label: "Low" },
              normal: { label: "Normal" },
              high: { label: "High" },
            },
            default: "normal",
          },
        },
        mutations: defaultMutations(),
      },
    },
    queries: defaultQueries(),
    itemViews: defaultItemViews(),
    tableViews: {},
    views: defaultViews(),
    screens: defaultScreens(),
  };
}

function record(id: string, title: string, overrides: Partial<StoredRecord> = {}): StoredRecord {
  return {
    id,
    entity: "task",
    values: { title, done: false },
    createdAt: "2026-04-28T00:00:00.000Z",
    ...overrides,
  };
}

function defaultMutations(): AppSchema["entities"][string]["mutations"] {
  return {
    create: { enabled: true },
    patch: { enabled: true },
    delete: { enabled: false },
  };
}

function defaultQueries(): AppSchema["queries"] {
  return {
    taskAll: {
      label: "All",
      entity: "task",
      expression: { kind: "all" },
    },
    taskCompleted: {
      label: "Completed",
      entity: "task",
      expression: {
        kind: "where",
        ref: { kind: "value", name: "done" },
        op: "eq",
        value: true,
      },
    },
  };
}

function defaultItemViews(): AppSchema["itemViews"] {
  return {
    taskListItem: {
      entity: "task",
      fields: {
        title: { editor: "text", commit: "field-commit" },
        done: { editor: "boolean", commit: "immediate" },
        dueDate: { editor: "date", commit: "field-commit" },
      },
    },
  };
}

function defaultViews(): AppSchema["views"] {
  return {
    taskHome: {
      type: "collection",
      label: "All",
      entity: "task",
      queries: [{ query: "taskAll" }],
      defaultQuery: "taskAll",
      result: { type: "list", itemView: "taskListItem" },
    },
    taskCreate: {
      type: "create",
      entity: "task",
      fields: {
        title: { editor: "text" },
        dueDate: { editor: "date" },
      },
    },
  };
}

function defaultScreens(): NonNullable<AppSchema["screens"]> {
  return {
    taskHome: {
      type: "workspace",
      label: "Tasks",
      path: "/",
      navigation: { primary: true },
      layout: {
        type: "stack",
        sections: [{ id: "tasks", type: "collection", view: "taskHome" }],
      },
    },
  };
}

async function getJson<T>(path: string) {
  const response = await fetchStorage(path);

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

async function postJson<T>(path: string, body: unknown) {
  const response = await fetchStorage(path, {
    body: JSON.stringify(body),
    method: "POST",
  });

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

function fetchStorage(path: string, init: Parameters<Harness["fetch"]>[1] = {}) {
  return harness.fetch(path, {
    ...init,
    headers: { "x-storage-harness-name": storageHarnessName },
  });
}

async function writeStorageHarness() {
  storageHarnessDir = await mkdtemp(join(tmpdir(), "formless-storage-harness-"));
  const tempDir = storageHarnessDir;
  const harnessPath = join(tempDir, "storage-harness.ts");

  await writeFile(
    harnessPath,
    `
      import { DurableObject } from "cloudflare:workers";
      import rawSeedSchema from "${process.cwd()}/schema/apps/tasks/schema.json";
      import { parseAppSchema } from "${process.cwd()}/src/shared/schema.ts";
      import {
        createStoredRecord,
        createStoredRecordOutcome,
        deleteStoredRecord,
        ensureStorageTables,
        exportStorageSnapshot,
        getActiveSchema,
        getActionResponseById,
        getBootstrapRecords,
        getChangesAfter,
        getCurrentCursor,
        getStoredRecord,
        patchStoredRecord,
        applyPackageAppMigrationsOutcome,
        readAppliedPackageAppMigrations,
        readPackageAppMigrationState,
        resetStorage,
        resetStorageSchemaToSource,
        restoreStorageSnapshot,
        createRecordsForAction,
        tombstoneRecordsForAction,
        tombstoneRecordsForActionOutcome,
        writeActiveSchema,
      } from "${process.cwd()}/src/worker/storage.ts";
      import { packageAppMigrationFamily } from "${process.cwd()}/src/worker/package-app-migrations.ts";

      const seedSchema = parseAppSchema(rawSeedSchema);
      const sourceSchemaHash = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
      const targetSchemaHash = "sha256:2222222222222222222222222222222222222222222222222222222222222222";
      const packageFamily = packageAppMigrationFamily("tasks");

      function packageMigration(kind) {
        return {
          id: \`2026-05-28-test-package-app-\${kind}\`,
          owner: "formless-test",
          family: packageFamily,
          checksum: checksumForPackageMigration(kind),
          safety: "auto-with-backup",
          summary: \`Test package app migration \${kind}.\`,
          fromPackageRevision: 1,
          toPackageRevision: 2,
          migrate: () => packageMigrationPlan(kind),
        };
      }

      function checksumForPackageMigration(kind) {
        if (kind === "invalid-field") {
          return "sha256:4444444444444444444444444444444444444444444444444444444444444444";
        }

        if (kind === "invalid-reference") {
          return "sha256:5555555555555555555555555555555555555555555555555555555555555555";
        }

        if (kind === "invalid-unique") {
          return "sha256:6666666666666666666666666666666666666666666666666666666666666666";
        }

        if (kind === "invalid-delete") {
          return "sha256:7777777777777777777777777777777777777777777777777777777777777777";
        }

        return "sha256:3333333333333333333333333333333333333333333333333333333333333333";
      }

      function packageMigrationPlan(kind) {
        if (kind === "invalid-field") {
          return {
            schema: schemaWithMigrationTag(),
            patches: [
              {
                entity: "task",
                recordId: "migration-open",
                values: { unknownMigrationField: "bad" },
              },
            ],
          };
        }

        if (kind === "invalid-reference") {
          return {
            schema: schemaWithParentReference(),
            patches: [
              {
                entity: "task",
                recordId: "migration-open",
                values: { parent: "missing-task" },
              },
            ],
          };
        }

        if (kind === "invalid-unique") {
          return {
            schema: schemaWithUniqueTitle(),
            creates: [
              {
                entity: "task",
                recordId: "migration-duplicate-title",
                values: { title: "Open", done: false, priority: "normal" },
              },
            ],
          };
        }

        if (kind === "invalid-delete") {
          return {
            schema: schemaWithParentReference(),
            patches: [
              {
                entity: "task",
                recordId: "migration-child",
                values: { parent: "migration-open" },
              },
            ],
            tombstones: [{ entity: "task", recordId: "migration-open" }],
          };
        }

        return {
          schema: schemaWithMigrationTag(),
          creates: [
            {
              entity: "task",
              recordId: "migration-created",
              values: {
                title: "Created by migration",
                done: false,
                priority: "normal",
                migrationTag: "created",
              },
            },
          ],
          patches: [
            {
              entity: "task",
              recordId: "migration-open",
              values: { title: "Migrated open", migrationTag: "patched" },
            },
          ],
          tombstones: [{ entity: "task", recordId: "migration-done" }],
        };
      }

      function schemaWithMigrationTag() {
        const schema = structuredClone(seedSchema);
        schema.entities.task.fields.migrationTag = {
          type: "text",
          required: false,
          label: "Migration tag",
        };
        return schema;
      }

      function schemaWithParentReference() {
        const schema = schemaWithMigrationTag();
        schema.entities.task.fields.parent = {
          type: "reference",
          required: false,
          label: "Parent",
          to: "task",
        };
        return schema;
      }

      function schemaWithUniqueTitle() {
        const schema = schemaWithMigrationTag();
        schema.entities.task.constraints = {
          uniqueTitle: {
            kind: "unique",
            fields: ["title"],
          },
        };
        return schema;
      }

      export class StorageHarness extends DurableObject {
        constructor(ctx, env) {
          super(ctx, env);
          ensureStorageTables(ctx.storage);
        }

        async fetch(request) {
          const url = new URL(request.url);

          if (request.method === "GET" && url.pathname === "/cursor") {
            return Response.json(getCurrentCursor(this.ctx.storage));
          }

          if (request.method === "GET" && url.pathname === "/records") {
            return Response.json(getBootstrapRecords(this.ctx.storage));
          }

          if (request.method === "GET" && url.pathname === "/schema") {
            return Response.json(getActiveSchema(this.ctx.storage, seedSchema));
          }

          if (request.method === "GET" && url.pathname === "/changes") {
            return Response.json(getChangesAfter(this.ctx.storage, Number(url.searchParams.get("after") ?? 0)));
          }

          if (request.method === "GET" && url.pathname === "/sync") {
            const { schema, updatedAt } = getActiveSchema(this.ctx.storage, seedSchema);
            const schemaFields = url.searchParams.get("schemaUpdatedAt") === updatedAt ? {} : { schema, schemaUpdatedAt: updatedAt };

            return Response.json({
              changes: getChangesAfter(this.ctx.storage, Number(url.searchParams.get("after") ?? 0)),
              cursor: getCurrentCursor(this.ctx.storage),
              ...schemaFields,
            });
          }

          if (request.method === "GET" && url.pathname === "/snapshot") {
            return Response.json(exportStorageSnapshot(this.ctx.storage, "tasks"));
          }

          if (request.method === "GET" && url.pathname === "/action-response") {
            return Response.json(getActionResponseById(this.ctx.storage, url.searchParams.get("actionId") ?? "") ?? null);
          }

          if (request.method === "GET" && url.pathname === "/applied-package-migrations") {
            return Response.json(readAppliedPackageAppMigrations(this.ctx.storage, "tasks"));
          }

          if (request.method === "GET" && url.pathname === "/package-migration-state") {
            return Response.json(readPackageAppMigrationState(this.ctx.storage, "tasks") ?? null);
          }

          if (request.method === "POST" && url.pathname === "/create") {
            return Response.json(createStoredRecord(this.ctx.storage, await request.json()));
          }

          if (request.method === "POST" && url.pathname === "/create-outcome") {
            return Response.json(createStoredRecordOutcome(this.ctx.storage, await request.json()));
          }

          if (request.method === "POST" && url.pathname === "/create-with-side-effects") {
            const body = await request.json();

            try {
              return Response.json(
                createStoredRecord(this.ctx.storage, body.mutation, ({ createRecords }) => {
                  if (body.fail) {
                    throw new Error("side effect failed");
                  }

                  for (const caused of body.caused ?? []) {
                    createRecords(caused.entity, caused.values);
                  }
                }),
              );
            } catch (error) {
              return Response.json(
                { error: error instanceof Error ? error.message : "Unknown error." },
                { status: 500 },
              );
            }
          }

          if (request.method === "POST" && url.pathname === "/patch") {
            return Response.json(patchStoredRecord(this.ctx.storage, await request.json()));
          }

          if (request.method === "POST" && url.pathname === "/delete") {
            return Response.json(deleteStoredRecord(this.ctx.storage, await request.json()));
          }

          if (request.method === "POST" && url.pathname === "/tombstone-records") {
            const body = await request.json();
            const records = body.recordIds.map((recordId) => getStoredRecord(this.ctx.storage, recordId)).filter(Boolean);
            return Response.json(tombstoneRecordsForAction(this.ctx.storage, body.actionId, "task", "clearCompletedTasks", records));
          }

          if (request.method === "POST" && url.pathname === "/tombstone-records-outcome") {
            const body = await request.json();
            const records = body.recordIds.map((recordId) => getStoredRecord(this.ctx.storage, recordId)).filter(Boolean);
            return Response.json(tombstoneRecordsForActionOutcome(this.ctx.storage, body.actionId, "task", "clearCompletedTasks", records));
          }

          if (request.method === "POST" && url.pathname === "/create-records-for-action") {
            const body = await request.json();
            return Response.json(createRecordsForAction(this.ctx.storage, body.actionId, body.entity, body.action, body.values));
          }

          if (request.method === "POST" && url.pathname === "/snapshot/restore") {
            try {
              return Response.json(restoreStorageSnapshot(this.ctx.storage, await request.json()));
            } catch (error) {
              return Response.json(
                { error: error instanceof Error ? error.message : "Unknown error." },
                { status: 500 },
              );
            }
          }

          if (request.method === "POST" && url.pathname === "/package-migrations/apply") {
            const body = await request.json();

            try {
              const result = applyPackageAppMigrationsOutcome(this.ctx.storage, {
                currentPackageRevision: 1,
                currentSourceSchemaHash: sourceSchemaHash,
                migrations: [packageMigration(body.kind ?? "success")],
                now: "2026-05-28T00:00:00.000Z",
                packageAppKey: "tasks",
                targetPackageRevision: 2,
                targetSourceSchemaHash: targetSchemaHash,
              });

              return Response.json(result);
            } catch (error) {
              return Response.json(
                { error: error instanceof Error ? error.message : "Unknown error." },
                { status: 500 },
              );
            }
          }

          if (request.method === "POST" && url.pathname === "/schema") {
            return Response.json(writeActiveSchema(this.ctx.storage, await request.json()));
          }

          if (request.method === "POST" && url.pathname === "/reset") {
            return Response.json(resetStorage(this.ctx.storage, { schema: seedSchema }));
          }

          if (request.method === "POST" && url.pathname === "/reset-schema-to-source") {
            return Response.json(resetStorageSchemaToSource(
              this.ctx.storage,
              { schema: seedSchema, records: [], changeMutationPrefix: "seed-task" },
              () => undefined,
            ));
          }

          if (request.method === "POST" && url.pathname === "/source-seed") {
            const body = await request.json();

            return Response.json(resetStorage(this.ctx.storage, {
              schema: seedSchema,
              records: body.records,
              changeMutationPrefix: body.changeMutationPrefix,
            }));
          }

          return Response.json({ error: "Not found." }, { status: 404 });
        }
      }

      export default {
        fetch(request, env) {
          const id = env.STORAGE_HARNESS.idFromName(
            request.headers.get("x-storage-harness-name") ?? "default",
          );

          return env.STORAGE_HARNESS.get(id).fetch(request);
        },
      };
    `,
  );

  return harnessPath;
}
