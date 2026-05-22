import type { AppSchema } from "../shared/schema.ts";
import type { BootstrapResponse, ChangeRow, StoredRecord } from "../shared/protocol.ts";
import { nowIsoString } from "../shared/clock.ts";
import { appStorageIdentityForClientTarget, type ClientAppTarget } from "./app-target.ts";

const DB_VERSION = 1;

const META_STORE = "meta";
const RECORDS_STORE = "records";

const SCHEMA_KEY = "schema";
const SCHEMA_UPDATED_AT_KEY = "schemaUpdatedAt";
const CURSOR_KEY = "cursor";
const LAST_SYNCED_AT_KEY = "lastSyncedAt";

export type LocalSnapshot = {
  schema: AppSchema | null;
  schemaUpdatedAt: string | null;
  records: StoredRecord[];
  cursor: number;
  lastSyncedAt: string | null;
};

export async function readLocalSnapshot(target: ClientAppTarget): Promise<LocalSnapshot> {
  const db = await openClientDb(target);

  try {
    const transaction = db.transaction([META_STORE, RECORDS_STORE], "readonly");
    const meta = transaction.objectStore(META_STORE);
    const records = transaction.objectStore(RECORDS_STORE);

    const [schema, schemaUpdatedAt, cursor, lastSyncedAt, storedRecords] = await Promise.all([
      requestToPromise<AppSchema | undefined>(meta.get(SCHEMA_KEY)),
      requestToPromise<string | undefined>(meta.get(SCHEMA_UPDATED_AT_KEY)),
      requestToPromise<number | undefined>(meta.get(CURSOR_KEY)),
      requestToPromise<string | undefined>(meta.get(LAST_SYNCED_AT_KEY)),
      requestToPromise<StoredRecord[]>(records.getAll()),
      transactionDone(transaction),
    ]);

    return {
      schema: schema ?? null,
      schemaUpdatedAt: schemaUpdatedAt ?? null,
      records: sortRecords(storedRecords),
      cursor: cursor ?? 0,
      lastSyncedAt: lastSyncedAt ?? null,
    };
  } finally {
    db.close();
  }
}

export async function saveBootstrapResponse(target: ClientAppTarget, response: BootstrapResponse) {
  const db = await openClientDb(target);

  try {
    const transaction = db.transaction([META_STORE, RECORDS_STORE], "readwrite");
    const meta = transaction.objectStore(META_STORE);
    const records = transaction.objectStore(RECORDS_STORE);

    records.clear();
    for (const record of response.records) {
      records.put(record);
    }

    meta.put(response.schema, SCHEMA_KEY);
    meta.put(response.schemaUpdatedAt, SCHEMA_UPDATED_AT_KEY);
    meta.put(response.cursor, CURSOR_KEY);
    meta.put(nowIsoString(), LAST_SYNCED_AT_KEY);

    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function saveSchema(target: ClientAppTarget, schema: AppSchema, updatedAt: string) {
  const db = await openClientDb(target);

  try {
    const transaction = db.transaction(META_STORE, "readwrite");
    const meta = transaction.objectStore(META_STORE);

    meta.put(schema, SCHEMA_KEY);
    meta.put(updatedAt, SCHEMA_UPDATED_AT_KEY);
    meta.put(nowIsoString(), LAST_SYNCED_AT_KEY);

    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function mergeChanges(target: ClientAppTarget, changes: ChangeRow[], cursor: number) {
  await mergeRecords(
    target,
    changes.map((change) => change.payload),
    cursor,
  );
}

export async function mergeRecords(
  target: ClientAppTarget,
  recordsToMerge: StoredRecord[],
  cursor?: number,
) {
  const db = await openClientDb(target);

  try {
    const transaction = db.transaction([META_STORE, RECORDS_STORE], "readwrite");
    const meta = transaction.objectStore(META_STORE);
    const records = transaction.objectStore(RECORDS_STORE);

    for (const record of recordsToMerge) {
      records.put(record);
    }

    if (cursor !== undefined) {
      meta.put(cursor, CURSOR_KEY);
    }
    meta.put(nowIsoString(), LAST_SYNCED_AT_KEY);

    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function readSchemaUpdatedAt(target: ClientAppTarget) {
  const db = await openClientDb(target);

  try {
    const transaction = db.transaction(META_STORE, "readonly");
    const schemaUpdatedAt = await requestToPromise<string | undefined>(
      transaction.objectStore(META_STORE).get(SCHEMA_UPDATED_AT_KEY),
    );
    await transactionDone(transaction);

    return schemaUpdatedAt ?? null;
  } finally {
    db.close();
  }
}

export async function readCursor(target: ClientAppTarget) {
  const db = await openClientDb(target);

  try {
    const transaction = db.transaction(META_STORE, "readonly");
    const cursor = await requestToPromise<number | undefined>(
      transaction.objectStore(META_STORE).get(CURSOR_KEY),
    );
    await transactionDone(transaction);

    return cursor ?? 0;
  } finally {
    db.close();
  }
}

export function deleteClientDb(target: ClientAppTarget) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(clientDbName(target));

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not delete IndexedDB."));
    request.onblocked = () => reject(new Error("IndexedDB delete was blocked."));
  });
}

export function clientDbName(target: ClientAppTarget, projectId?: string) {
  return appStorageIdentityForClientTarget(target, { projectId }).browserDatabaseName;
}

function openClientDb(target: ClientAppTarget) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(clientDbName(target), DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }

      if (!db.objectStoreNames.contains(RECORDS_STORE)) {
        db.createObjectStore(RECORDS_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open IndexedDB."));
  });
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}

function sortRecords(records: StoredRecord[]) {
  return records.toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));
}
