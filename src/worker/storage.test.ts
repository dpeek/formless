import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { createWorkerHarness } from "./miniflare-test.ts";
import type { ActionResponse, MutationResponse } from "../shared/protocol.ts";
import type { AppSchema } from "../shared/schema.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

let harness: Harness;
let storageHarnessDir: string | undefined;

beforeEach(async () => {
  harness = await createWorkerHarness(await writeStorageHarness(), {
    STORAGE_HARNESS: { className: "StorageHarness", useSQLite: true },
  });
});

afterEach(async () => {
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
      views: defaultViews(),
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
      views: defaultViews(),
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

  it("replays the same mutationId without inserting a duplicate record", async () => {
    const first = await createRecord("mutation-1", "First");
    const replay = await createRecord("mutation-1", "First");

    expect(replay.record.id).toBe(first.record.id);
    expect(replay.cursor).toBe(1);
    expect(await getJson<unknown[]>("/records")).toHaveLength(1);
    expect(await getJson<unknown[]>("/changes?after=0")).toHaveLength(1);
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
});

async function createRecord(mutationId: string, text: string, done = false) {
  return postJson<MutationResponse>("/create", {
    mutationId,
    entity: "task",
    op: "create",
    values: { title: text, done },
  });
}

function defaultMutations(): AppSchema["entities"][string]["mutations"] {
  return {
    create: { enabled: true },
    patch: { enabled: true },
    delete: { enabled: false },
  };
}

function defaultViews(): AppSchema["views"] {
  return {
    taskListItem: {
      type: "list",
      entity: "task",
      query: { kind: "all" },
      fields: {
        title: { editor: "text", commit: "field-commit" },
        done: { editor: "boolean", commit: "immediate" },
        dueDate: { editor: "date", commit: "field-commit" },
      },
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

async function getJson<T>(path: string) {
  const response = await harness.fetch(path);

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

async function postJson<T>(path: string, body: unknown) {
  const response = await harness.fetch(path, {
    body: JSON.stringify(body),
    method: "POST",
  });

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

async function writeStorageHarness() {
  storageHarnessDir = await mkdtemp(resolve(".storage-harness-"));
  const tempDir = storageHarnessDir;
  const harnessPath = join(tempDir, "storage-harness.ts");

  await writeFile(
    harnessPath,
    `
      import { DurableObject } from "cloudflare:workers";
      import rawSeedSchema from "${process.cwd()}/schema/app-schema.json";
      import { parseAppSchema } from "${process.cwd()}/src/shared/schema.ts";
      import {
        createStoredRecord,
        ensureStorageTables,
        getActiveSchema,
        getBootstrapRecords,
        getChangesAfter,
        getCurrentCursor,
        getStoredRecord,
        patchStoredRecord,
        resetStorage,
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

          if (request.method === "POST" && url.pathname === "/create") {
            return Response.json(createStoredRecord(this.ctx.storage, await request.json()));
          }

          if (request.method === "POST" && url.pathname === "/patch") {
            return Response.json(patchStoredRecord(this.ctx.storage, await request.json()));
          }

          if (request.method === "POST" && url.pathname === "/tombstone-records") {
            const body = await request.json();
            const records = body.recordIds.map((recordId) => getStoredRecord(this.ctx.storage, recordId)).filter(Boolean);
            return Response.json(tombstoneRecordsForAction(this.ctx.storage, body.actionId, "task", "clearCompletedTasks", records));
          }

          if (request.method === "POST" && url.pathname === "/schema") {
            return Response.json(writeActiveSchema(this.ctx.storage, await request.json()));
          }

          if (request.method === "POST" && url.pathname === "/reset") {
            return Response.json(resetStorage(this.ctx.storage, seedSchema));
          }

          return Response.json({ error: "Not found." }, { status: 404 });
        }
      }

      export default {
        fetch(request, env) {
          const id = env.STORAGE_HARNESS.idFromName("default");
          return env.STORAGE_HARNESS.get(id).fetch(request);
        },
      };
    `,
  );

  return harnessPath;
}
