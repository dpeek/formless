import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { createWorkerHarness } from "./miniflare-test.ts";
import type { MutationResponse } from "../shared/protocol.ts";
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

    expect(stored.schema.entities.note.label).toBe("Note");
    expect(stored.updatedAt).toEqual(expect.any(String));
  });

  it("persists schema updates", async () => {
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

    await postJson("/schema", nextSchema);

    const stored = await getJson<{ schema: AppSchema }>("/schema");

    expect(stored.schema).toEqual(nextSchema);
  });

  it("creates records, records changes, and advances the cursor", async () => {
    expect(await getJson<number>("/cursor")).toBe(0);

    const response = await createRecord("mutation-1", "First");

    expect(response.cursor).toBe(1);
    expect(response.record).toMatchObject({
      entity: "note",
      values: { text: "First" },
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
});

async function createRecord(mutationId: string, text: string) {
  return postJson<MutationResponse>("/create", {
    mutationId,
    entity: "note",
    op: "create",
    values: { text },
  });
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

          if (request.method === "POST" && url.pathname === "/schema") {
            return Response.json(writeActiveSchema(this.ctx.storage, await request.json()));
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
