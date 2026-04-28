import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { appSchema } from "../client/schema.ts";
import type { BootstrapResponse, MutationResponse, SyncResponse } from "../shared/protocol.ts";
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
      records: [],
      cursor: 0,
    });
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
