import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { createWorkerHarness } from "./miniflare-test.ts";
import type {
  ActionResponse,
  BootstrapResponse,
  MutationResponse,
  StoredRecord,
  StoreSnapshot,
} from "../shared/protocol.ts";
import type { AppSchema } from "../shared/schema.ts";

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
    const created = await createRecord("mutation-1", "First");
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
      values: { title: "Second", done: true },
    });
    expect(records).toEqual([patched.record]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      mutationId: "mutation-2",
      op: "patch",
      payload: patched.record,
    });
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
        sourceCursor: 99,
        records: [restoredRecord],
      }),
    );
    const syncChanges = await getJson<unknown[]>(`/changes?after=${beforeCursor}`);

    expect(response.schemaUpdatedAt).toEqual(expect.any(String));
    expect(response.schemaUpdatedAt).not.toBe("2026-04-28T00:00:00.000Z");
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
});

async function createRecord(mutationId: string, text: string, done = false) {
  return postJson<MutationResponse>("/create", {
    mutationId,
    entity: "task",
    op: "create",
    values: { title: text, done },
  });
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
  const tempRoot = resolve("tmp", "test");
  await mkdir(tempRoot, { recursive: true });
  storageHarnessDir = await mkdtemp(join(tempRoot, ".storage-harness-"));
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
        resetStorage,
        restoreStorageSnapshot,
        tombstoneRecordsForAction,
        writeActiveSchema,
      } from "${process.cwd()}/src/worker/storage.ts";

      const seedSchema = parseAppSchema(rawSeedSchema);

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

          if (request.method === "GET" && url.pathname === "/snapshot") {
            return Response.json(exportStorageSnapshot(this.ctx.storage, "tasks"));
          }

          if (request.method === "GET" && url.pathname === "/action-response") {
            return Response.json(getActionResponseById(this.ctx.storage, url.searchParams.get("actionId") ?? "") ?? null);
          }

          if (request.method === "POST" && url.pathname === "/create") {
            return Response.json(createStoredRecord(this.ctx.storage, await request.json()));
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

          if (request.method === "POST" && url.pathname === "/schema") {
            return Response.json(writeActiveSchema(this.ctx.storage, await request.json()));
          }

          if (request.method === "POST" && url.pathname === "/reset") {
            return Response.json(resetStorage(this.ctx.storage, { schema: seedSchema }));
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
