import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { deleteClientDb, readLocalSnapshot } from "../../client/db.ts";
import { getClientStoreSnapshot, resetClientStore } from "../../client/store.ts";
import { submitOperation } from "../../client/sync.ts";
import type { OperationInvocationResponse } from "../../shared/operation-invocation.ts";
import type { BootstrapResponse, OwnerSetupCompleteResponse } from "../../shared/protocol.ts";
import { createWorkerHarness } from "../../worker/miniflare-test.ts";
import { OWNER_SESSION_COOKIE_NAME } from "../../worker/owner-session.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const adminToken = "test-admin-token";
const setupToken = "abcDEF0123456789_-abcDEF0123456789_-";

let harness: Harness;

beforeEach(async () => {
  harness = await createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: { FORMLESS_ADMIN_TOKEN: adminToken },
    },
  );
  await deleteClientDb("tasks");
  resetClientStore();
});

afterEach(async () => {
  await harness.dispose();
  await deleteClientDb("tasks");
  resetClientStore();
});

describe("owner setup browser writes", () => {
  it("lets generated write helpers use the setup session cookie without admin bearer exposure", async () => {
    await resetSchemaApp("tasks");
    await createSetupCapability();

    const browser = createBrowserSessionFetcher();
    const completed = await completeOwnerSetupForBrowserWrite(browser.fetch);
    const created = await submitOperation(
      "tasks",
      "task",
      "create",
      { input: { done: false, title: "Owner setup browser write" } },
      browser.fetch,
    );
    const createdRecord = expectOperationOutput(created, "create").record;
    const patched = await submitOperation(
      "tasks",
      "task",
      "update",
      { input: { done: true }, recordId: createdRecord.id },
      browser.fetch,
    );
    const patchedRecord = expectOperationOutput(patched, "update").record;
    const action = await submitOperation("tasks", "task", "clearCompletedTasks", {}, browser.fetch);
    const commandOutput = expectOperationOutput(action, "command");
    const localSnapshot = await readLocalSnapshot("tasks");
    const storeSnapshot = getClientStoreSnapshot();
    const remoteSnapshot = await getJson<BootstrapResponse>("/api/tasks/bootstrap");
    const localCreatedRecord = localSnapshot.records.find(
      (record) => record.id === createdRecord.id,
    );
    const remoteCreatedRecord = remoteSnapshot.records.find(
      (record) => record.id === createdRecord.id,
    );

    expect(completed.owner).toMatchObject({
      email: "ada@example.com",
      name: "Ada Owner",
    });
    expect(createdRecord.values).toMatchObject({
      done: false,
      title: "Owner setup browser write",
    });
    expect(patchedRecord.values.done).toBe(true);
    expect(commandOutput.changes.some((change) => change.recordId === createdRecord.id)).toBe(true);
    expect(localCreatedRecord?.deletedAt).toEqual(expect.any(String));
    expect(remoteCreatedRecord?.deletedAt).toEqual(expect.any(String));
    expect(storeSnapshot.recordIdsByEntity.task ?? []).not.toContain(createdRecord.id);
    expect(browser.cookie).toContain(`${OWNER_SESSION_COOKIE_NAME}=`);
    expect(browser.calls.map(({ authorization }) => authorization)).toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect(browser.calls).toEqual([
      expect.objectContaining({
        cookie: null,
        credentials: "same-origin",
        input: "/api/formless/setup/complete",
        method: "POST",
      }),
      expect.objectContaining({
        cookie: expect.stringContaining(`${OWNER_SESSION_COOKIE_NAME}=`),
        credentials: "same-origin",
        input: "/api/tasks/operations/task/create",
        method: "POST",
      }),
      expect.objectContaining({
        cookie: expect.stringContaining(`${OWNER_SESSION_COOKIE_NAME}=`),
        credentials: "same-origin",
        input: "/api/tasks/operations/task/update",
        method: "POST",
      }),
      expect.objectContaining({
        cookie: expect.stringContaining(`${OWNER_SESSION_COOKIE_NAME}=`),
        credentials: "same-origin",
        input: "/api/tasks/operations/task/clearCompletedTasks",
        method: "POST",
      }),
    ]);
  });
});

function expectOperationOutput<K extends OperationInvocationResponse["output"]["type"]>(
  response: OperationInvocationResponse,
  type: K,
): Extract<OperationInvocationResponse["output"], { type: K }> {
  expect(response.output.type).toBe(type);

  return response.output as Extract<OperationInvocationResponse["output"], { type: K }>;
}

async function resetSchemaApp(schemaKey: string) {
  const response = await harness.fetch(`/api/${schemaKey}/reset/seed`, {
    body: "{}",
    headers: adminHeaders(),
    method: "POST",
  });

  expect(response.status).toBe(200);
}

async function createSetupCapability() {
  const response = await harness.fetch("/api/formless/setup/capability", {
    body: JSON.stringify({
      expiresAt: "2999-01-01T00:00:00.000Z",
      setupToken,
    }),
    headers: adminHeaders(),
    method: "POST",
  });

  expect(response.status).toBe(200);
}

async function completeOwnerSetupForBrowserWrite(fetcher: typeof fetch) {
  const response = await fetcher("/api/formless/setup/complete", {
    body: JSON.stringify({
      owner: { email: "ada@example.com", name: "Ada Owner" },
      setupToken,
    }),
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  expect(response.status).toBe(200);

  return (await response.json()) as OwnerSetupCompleteResponse;
}

async function getJson<T>(path: string) {
  const response = await harness.fetch(path);

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

function adminHeaders() {
  return {
    Authorization: `Bearer ${adminToken}`,
    "Content-Type": "application/json",
  };
}

type BrowserFetchCall = {
  authorization: string | null;
  cookie: string | null;
  credentials: RequestCredentials | undefined;
  input: string;
  method: string;
};

function createBrowserSessionFetcher() {
  const origin = "http://example.com";
  const calls: BrowserFetchCall[] = [];
  let cookie = "";

  const browserFetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = requestUrl(input, origin);
    const headers = requestHeaders(input, init);
    const method = init.method ?? (input instanceof Request ? input.method : "GET");

    if (cookie && shouldSendSameOriginCookie(url, origin, init.credentials)) {
      headers.set("Cookie", cookie);
    }

    calls.push({
      authorization: headers.get("Authorization"),
      cookie: headers.get("Cookie"),
      credentials: init.credentials,
      input: `${url.pathname}${url.search}`,
      method,
    });

    const response = await harness.mf.dispatchFetch(
      url.toString(),
      dispatchFetchInit(init, headers, method),
    );
    const setCookie = response.headers.get("Set-Cookie");

    if (setCookie) {
      cookie = setCookie.split(";")[0]?.trim() ?? "";
    }

    return response;
  };

  return {
    calls,
    get cookie() {
      return cookie;
    },
    fetch: browserFetch as unknown as typeof fetch,
  };
}

function requestUrl(input: RequestInfo | URL, origin: string): URL {
  if (input instanceof Request) {
    return new URL(input.url);
  }

  return new URL(String(input), origin);
}

function requestHeaders(input: RequestInfo | URL, init: RequestInit): Headers {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);

  new Headers(init.headers).forEach((value, key) => headers.set(key, value));

  return headers;
}

function headersRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};

  headers.forEach((value, key) => {
    record[key] = value;
  });

  return record;
}

function dispatchFetchInit(
  init: RequestInit,
  headers: Headers,
  method: string,
): NonNullable<Parameters<Harness["mf"]["dispatchFetch"]>[1]> {
  return {
    ...(init.body === null || init.body === undefined ? {} : { body: init.body }),
    headers: headersRecord(headers),
    method,
  } as NonNullable<Parameters<Harness["mf"]["dispatchFetch"]>[1]>;
}

function shouldSendSameOriginCookie(
  url: URL,
  origin: string,
  credentials: RequestCredentials | undefined,
) {
  return credentials !== "omit" && url.origin === origin;
}
