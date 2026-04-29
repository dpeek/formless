import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { appSchema } from "../client/schema.ts";
import type {
  BootstrapResponse,
  MutationResponse,
  SchemaResponse,
  SchemaUpdateResponse,
  SyncResponse,
} from "../shared/protocol.ts";
import type { AppSchema } from "../shared/schema.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

let harness: Harness;

beforeEach(async () => {
  harness = await createWorkerHarness("src/worker/index.ts", {
    FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
  });
});

afterEach(async () => {
  await harness.dispose();
});

describe("authority", () => {
  it("returns schema, records, and cursor from bootstrap", async () => {
    const body = await getJson<BootstrapResponse>("/api/bootstrap");

    expect(body).toEqual({
      schema: appSchema,
      schemaUpdatedAt: expect.any(String),
      records: [],
      cursor: 0,
    });
  });

  it("returns the active schema and metadata from the schema route", async () => {
    const body = await getJson<SchemaResponse>("/api/schema");

    expect(body.schema).toEqual(appSchema);
    expect(body.updatedAt).toEqual(expect.any(String));
  });

  it("persists compatible schema updates and returns them from bootstrap", async () => {
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
        },
      },
    } satisfies AppSchema;

    const update = await postJson<SchemaUpdateResponse>("/api/schema", { schema: nextSchema });
    const schemaResponse = await getJson<SchemaResponse>("/api/schema");
    const bootstrap = await getJson<BootstrapResponse>("/api/bootstrap");

    expect(update.schema).toEqual(nextSchema);
    expect(update.updatedAt).toEqual(expect.any(String));
    expect(schemaResponse.schema).toEqual(nextSchema);
    expect(schemaResponse.updatedAt).toBe(update.updatedAt);
    expect(bootstrap.schema).toEqual(nextSchema);
    expect(bootstrap.schemaUpdatedAt).toBe(update.updatedAt);
  });

  it("uses the stored schema when validating mutations", async () => {
    const nextSchema = {
      version: 1,
      entities: {
        task: {
          label: "Planner task",
          fields: {
            title: { type: "text", required: true },
            done: { type: "boolean", required: true, default: false },
            dueDate: { type: "date", required: true },
          },
        },
      },
    } satisfies AppSchema;

    await postJson<SchemaUpdateResponse>("/api/schema", { schema: nextSchema });

    await expectError(
      "/api/mutations",
      {
        mutationId: "mutation-1",
        entity: "task",
        op: "create",
        values: { title: "First" },
      },
      'Field "dueDate" is required.',
    );
  });

  it("rejects unsupported field types in schema updates", async () => {
    await expectError(
      "/api/schema",
      {
        schema: {
          version: 1,
          entities: {
            task: {
              label: "Task",
              fields: {
                title: { type: "number", required: true },
              },
            },
          },
        },
      },
      'Field "task.title" has unsupported type "number".',
    );
  });

  it("rejects incompatible schema changes", async () => {
    await postMutation("mutation-1", { title: "First", done: false });

    const nextSchema = {
      version: 1,
      entities: {
        task: {
          label: "Task",
          fields: {
            done: { type: "boolean", required: true, default: false },
          },
        },
      },
    } satisfies AppSchema;

    await expectError(
      "/api/schema",
      { schema: nextSchema },
      'Cannot remove or rename field "task.title"',
    );
  });

  it("returns changes after a known sync cursor", async () => {
    await postMutation("mutation-1", { title: "First", done: false });
    const second = await postMutation("mutation-2", { title: "Second", done: true });

    const body = await getJson<SyncResponse>("/api/sync?after=1");

    expect(body.cursor).toBe(2);
    expect(body.changes).toHaveLength(1);
    expect(body.changes[0]).toMatchObject({
      mutationId: "mutation-2",
      recordId: second.record.id,
      payload: second.record,
    });
  });

  it("omits schema from sync when the client schema timestamp is current", async () => {
    const schemaResponse = await getJson<SchemaResponse>("/api/schema");
    const body = await getJson<SyncResponse>(
      `/api/sync?after=0&schemaUpdatedAt=${encodeURIComponent(schemaResponse.updatedAt)}`,
    );

    expect(body.schema).toBeUndefined();
    expect(body.schemaUpdatedAt).toBeUndefined();
  });

  it("returns schema from sync when the client schema timestamp is missing or stale", async () => {
    const missing = await getJson<SyncResponse>("/api/sync?after=0");
    const stale = await getJson<SyncResponse>(
      "/api/sync?after=0&schemaUpdatedAt=2026-04-27T00%3A00%3A00.000Z",
    );

    expect(missing.schema).toEqual(appSchema);
    expect(missing.schemaUpdatedAt).toEqual(expect.any(String));
    expect(stale.schema).toEqual(appSchema);
    expect(stale.schemaUpdatedAt).toBe(missing.schemaUpdatedAt);
  });

  it("rejects invalid sync cursors", async () => {
    await expectError("/api/sync?after=bad", undefined, "Sync cursor must be");
  });

  it("rejects unknown entity names", async () => {
    await expectError(
      "/api/mutations",
      {
        mutationId: "mutation-1",
        entity: "missing",
        op: "create",
        values: { title: "First" },
      },
      'Unknown entity "missing".',
    );
  });

  it("rejects empty required text", async () => {
    await expectError(
      "/api/mutations",
      {
        mutationId: "mutation-1",
        entity: "task",
        op: "create",
        values: { title: "   ", done: false },
      },
      'Field "title" cannot be empty.',
    );
  });

  it("accepts task values and applies the boolean default", async () => {
    const response = await postMutation("mutation-1", {
      title: "Plan week",
      dueDate: "2026-05-01",
    });

    expect(response.record).toMatchObject({
      entity: "task",
      values: {
        title: "Plan week",
        done: false,
        dueDate: "2026-05-01",
      },
    });
  });

  it("rejects invalid boolean and date values", async () => {
    await expectError(
      "/api/mutations",
      {
        mutationId: "mutation-1",
        entity: "task",
        op: "create",
        values: { title: "First", done: "false" },
      },
      'Field "done" must be a boolean.',
    );
    await expectError(
      "/api/mutations",
      {
        mutationId: "mutation-2",
        entity: "task",
        op: "create",
        values: { title: "First", done: false, dueDate: "05/01/2026" },
      },
      'Field "dueDate" must be a YYYY-MM-DD date.',
    );
  });

  it("patches an existing record and returns patch changes from sync", async () => {
    const created = await postMutation("mutation-1", { title: "First", done: false });
    const patched = await postJson<MutationResponse>("/api/mutations", {
      mutationId: "mutation-2",
      entity: "task",
      op: "patch",
      recordId: created.record.id,
      values: { done: true, dueDate: "2026-05-01" },
    });
    const sync = await getJson<SyncResponse>("/api/sync?after=1");

    expect(patched.record.values).toEqual({
      title: "First",
      done: true,
      dueDate: "2026-05-01",
    });
    expect(sync.changes).toHaveLength(1);
    expect(sync.changes[0]).toMatchObject({
      mutationId: "mutation-2",
      op: "patch",
      recordId: created.record.id,
      payload: patched.record,
    });
  });

  it("rejects invalid patch mutations", async () => {
    const created = await postMutation("mutation-1", { title: "First", done: false });
    const schemaWithProject = {
      version: 1,
      entities: {
        task: appSchema.entities.task,
        project: {
          label: "Project",
          fields: {
            name: { type: "text", required: true },
          },
        },
      },
    } satisfies AppSchema;

    await postJson<SchemaUpdateResponse>("/api/schema", { schema: schemaWithProject });

    await expectError(
      "/api/mutations",
      {
        mutationId: "mutation-2",
        entity: "task",
        op: "patch",
        recordId: "missing",
        values: { title: "Second" },
      },
      'Unknown record "missing".',
    );
    await expectError(
      "/api/mutations",
      {
        mutationId: "mutation-3",
        entity: "task",
        op: "patch",
        recordId: created.record.id,
        values: { missing: "Second" },
      },
      'Unknown field "missing".',
    );
    await expectError(
      "/api/mutations",
      {
        mutationId: "mutation-4",
        entity: "project",
        op: "patch",
        recordId: created.record.id,
        values: { name: "Second" },
      },
      "Patch entity must match the stored record entity.",
    );
  });

  it("replays patch mutation IDs without duplicating changes", async () => {
    const created = await postMutation("mutation-1", { title: "First", done: false });
    const body = {
      mutationId: "mutation-2",
      entity: "task",
      op: "patch",
      recordId: created.record.id,
      values: { title: "Second" },
    };

    const first = await postJson<MutationResponse>("/api/mutations", body);
    const replay = await postJson<MutationResponse>("/api/mutations", body);
    const sync = await getJson<SyncResponse>("/api/sync?after=0");

    expect(replay).toEqual(first);
    expect(sync.changes).toHaveLength(2);
  });

  it("rejects bad JSON request bodies", async () => {
    const response = await harness.fetch("/api/mutations", {
      body: "{",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Request body must be valid JSON." });
  });
});

async function postMutation(mutationId: string, values: Record<string, unknown>) {
  const response = await harness.fetch("/api/mutations", {
    body: JSON.stringify({
      mutationId,
      entity: "task",
      op: "create",
      values,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  expect(response.status).toBe(200);

  return (await response.json()) as MutationResponse;
}

async function getJson<T>(path: string) {
  const response = await harness.fetch(path);

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

async function postJson<T>(path: string, body: unknown) {
  const response = await harness.fetch(path, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

async function expectError(path: string, body: unknown, message: string) {
  const response = await harness.fetch(path, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    method: body === undefined ? "GET" : "POST",
  });

  expect(response.status).toBe(400);
  expect((await response.json()) as { error: string }).toEqual({
    error: expect.stringContaining(message),
  });
}
