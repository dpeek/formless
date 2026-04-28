import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { publishClientEvent } from "./broadcast.ts";
import { mergeRecords, readLocalSnapshot, saveBootstrapResponse } from "./db.ts";
import { appSchema } from "./schema.ts";
import { connectBroadcastToState, subscribeToClientState, type ClientState } from "./state.ts";
import { bootstrapClient, submitCreateMutation, syncClient } from "./sync.ts";
import type {
  BootstrapResponse,
  ChangeRow,
  MutationResponse,
  StoredRecord,
  SyncResponse,
} from "../shared/protocol.ts";

beforeEach(async () => {
  await deleteClientDb();
});

describe("client sync", () => {
  it("bootstraps local state from the authority", async () => {
    await bootstrapClient(
      jsonFetcher("/api/bootstrap", {
        schema: appSchema,
        records: [record("record-1", "First")],
        cursor: 1,
      } satisfies BootstrapResponse),
    );

    const snapshot = await readLocalSnapshot();

    expect(snapshot.schema).toEqual(appSchema);
    expect(snapshot.records).toEqual([record("record-1", "First")]);
    expect(snapshot.cursor).toBe(1);
  });

  it("merges incremental sync records and advances the cursor", async () => {
    await saveBootstrapResponse({
      schema: appSchema,
      records: [record("record-1", "First")],
      cursor: 1,
    });

    await syncClient(
      jsonFetcher("/api/sync?after=1", {
        changes: [change(2, "record-2", "Second")],
        cursor: 2,
      } satisfies SyncResponse),
    );

    const snapshot = await readLocalSnapshot();

    expect(snapshot.records.map((storedRecord) => storedRecord.id)).toEqual([
      "record-1",
      "record-2",
    ]);
    expect(snapshot.cursor).toBe(2);
  });

  it("merges accepted create mutations into local state", async () => {
    const acceptedRecord = record("record-1", "First");

    const response = await submitCreateMutation("note", { text: "First" }, async (input, init) => {
      const mutation = parseRequestBody(init?.body);

      expect(input).toBe("/api/mutations");
      expect(init?.method).toBe("POST");
      expect(mutation).toMatchObject({
        entity: "note",
        op: "create",
        values: { text: "First" },
      });

      return Response.json({
        record: acceptedRecord,
        cursor: 1,
        mutationId: mutation.mutationId,
      } satisfies MutationResponse);
    });

    const snapshot = await readLocalSnapshot();

    expect(response.record).toEqual(acceptedRecord);
    expect(snapshot.records).toEqual([acceptedRecord]);
    expect(snapshot.cursor).toBe(1);
  });

  it("refreshes state from broadcast events without remounting routes", async () => {
    const states: ClientState[] = [];
    const unsubscribe = subscribeToClientState((state) => states.push(state));
    const stopBroadcast = connectBroadcastToState();

    try {
      await mergeRecords([record("record-1", "First")], 1);
      publishClientEvent("records-updated");

      await waitFor(() => states.some((state) => state.records.length === 1));
      expect(states.at(-1)?.records).toEqual([record("record-1", "First")]);
    } finally {
      stopBroadcast();
      unsubscribe();
    }
  });
});

function jsonFetcher(expectedPath: string, body: unknown): typeof fetch {
  return async (input) => {
    expect(input).toBe(expectedPath);

    return Response.json(body);
  };
}

function parseRequestBody(body: BodyInit | null | undefined) {
  if (typeof body !== "string") {
    throw new Error("Expected a string request body.");
  }

  const parsed = JSON.parse(body) as unknown;

  expect(parsed).toEqual(
    expect.objectContaining({
      mutationId: expect.any(String),
    }),
  );

  return parsed as { mutationId: string };
}

function record(id: string, text: string): StoredRecord {
  return {
    id,
    entity: "note",
    values: { text },
    createdAt: `2026-04-28T00:00:0${id.at(-1)}.000Z`,
  };
}

function change(seq: number, recordId: string, text: string): ChangeRow {
  return {
    seq,
    mutationId: `mutation-${seq}`,
    op: "create",
    entity: "note",
    recordId,
    payload: record(recordId, text),
    createdAt: `2026-04-28T00:00:0${seq}.000Z`,
  };
}

async function waitFor(predicate: () => boolean) {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt > 1000) {
      throw new Error("Timed out waiting for condition.");
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function deleteClientDb() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("formless");

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not delete IndexedDB."));
    request.onblocked = () => reject(new Error("IndexedDB delete was blocked."));
  });
}
