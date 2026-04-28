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
        note: {
          label: "Journal entry",
          fields: {
            text: { type: "text", required: true },
            summary: { type: "text", required: false },
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
        note: {
          label: "Journal entry",
          fields: {
            text: { type: "text", required: true },
            summary: { type: "text", required: true },
          },
        },
      },
    } satisfies AppSchema;

    await postJson<SchemaUpdateResponse>("/api/schema", { schema: nextSchema });

    await expectError(
      "/api/mutations",
      {
        mutationId: "mutation-1",
        entity: "note",
        op: "create",
        values: { text: "First" },
      },
      'Field "summary" is required.',
    );
  });

  it("rejects incompatible schema changes", async () => {
    await postMutation("mutation-1", "First");

    const nextSchema = {
      version: 1,
      entities: {
        note: {
          label: "Note",
          fields: {
            summary: { type: "text", required: false },
          },
        },
      },
    } satisfies AppSchema;

    await expectError(
      "/api/schema",
      { schema: nextSchema },
      'Cannot remove or rename field "note.text"',
    );
  });

  it("returns changes after a known sync cursor", async () => {
    await postMutation("mutation-1", "First");
    const second = await postMutation("mutation-2", "Second");

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
        values: { text: "First" },
      },
      'Unknown entity "missing".',
    );
  });

  it("rejects empty required text", async () => {
    await expectError(
      "/api/mutations",
      {
        mutationId: "mutation-1",
        entity: "note",
        op: "create",
        values: { text: "   " },
      },
      'Field "text" cannot be empty.',
    );
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

async function postMutation(mutationId: string, text: string) {
  const response = await harness.fetch("/api/mutations", {
    body: JSON.stringify({
      mutationId,
      entity: "note",
      op: "create",
      values: { text },
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
