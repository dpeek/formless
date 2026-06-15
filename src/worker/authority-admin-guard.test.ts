import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import type {
  BootstrapResponse,
  MutationResponse,
  OwnerIdentity,
  StoreSnapshot,
  StoredRecord,
} from "../shared/protocol.ts";
import type { SitePageTreeResponse } from "@dpeek/formless-site-app";
import type { SchemaKey } from "../shared/schema-apps.ts";
import { operationWriteRequest } from "../test/authority-write.ts";
import { siteSourceSchema, taskSeedRecords } from "../test/schema-apps.ts";
import { testSiteSeedRecords } from "../test/site-records.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import { createOwnerSessionCookie } from "./owner-session.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const adminToken = "test-admin-token";
const sessionSecret = "test-session-secret";
const owner: OwnerIdentity = {
  id: "owner-1",
  name: "Ada Owner",
  email: "ada@example.com",
  createdAt: "2026-05-21T00:00:00.000Z",
};

let harness: Harness;

beforeAll(async () => {
  harness = await createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        FORMLESS_OWNER_SESSION_SECRET: sessionSecret,
      },
    },
  );
});

beforeEach(async () => {
  await resetSchemaApp("tasks");
  await resetSchemaApp("site");
});

afterAll(async () => {
  await harness.dispose();
});

describe("authority admin guard", () => {
  it("rejects protected write endpoints before parsing request JSON", async () => {
    const protectedRoutes = [
      "/api/tasks/schema",
      "/api/tasks/snapshot/restore",
      "/api/tasks/operations/task/create",
      "/api/tasks/mutations",
      "/api/tasks/actions",
      "/api/tasks/reset/schema",
      "/api/tasks/reset/seed",
      "/api/tasks/package-migrations/apply",
    ];

    for (const route of protectedRoutes) {
      const response = await harness.fetch(route, {
        body: "not-json",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      expect(response.status).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toBe('Bearer realm="formless-admin"');
      expect((await response.json()) as { error: string }).toEqual({
        error: "Owner session or admin authorization is required for this write endpoint.",
      });
    }
  });

  it("rejects invalid admin tokens without mutating storage", async () => {
    const created = await postAdminJson<MutationResponse>("/api/tasks/mutations", {
      mutationId: "mutation-admin-guard-keep",
      entity: "task",
      op: "create",
      values: { title: "Keep after unauthorized reset", done: false },
    });

    const reset = await harness.fetch("/api/tasks/reset/seed", {
      body: "{}",
      headers: {
        Authorization: "Bearer wrong-token",
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const bootstrap = await getJson<BootstrapResponse>("/api/tasks/bootstrap");

    expect(reset.status).toBe(401);
    expect(bootstrap.records).toEqual([...taskSeedRecords, created.record]);
  });

  it("accepts the configured admin bearer token for write endpoints", async () => {
    const created = await postAdminJson<MutationResponse>("/api/tasks/mutations", {
      mutationId: "mutation-admin-guard-allowed",
      entity: "task",
      op: "create",
      values: { title: "Authorized write", done: false },
    });
    const bootstrap = await getJson<BootstrapResponse>("/api/tasks/bootstrap");

    expect(created.record.values.title).toBe("Authorized write");
    expect(bootstrap.records).toEqual([...taskSeedRecords, created.record]);
  });

  it("accepts signed owner session cookies for write endpoints", async () => {
    const created = await postOwnerJson<MutationResponse>("/api/tasks/mutations", {
      mutationId: "mutation-owner-session-allowed",
      entity: "task",
      op: "create",
      values: { title: "Owner session write", done: false },
    });
    const bootstrap = await getJson<BootstrapResponse>("/api/tasks/bootstrap");

    expect(created.record.values.title).toBe("Owner session write");
    expect(bootstrap.records).toEqual([...taskSeedRecords, created.record]);
  });

  it("keeps public Site tree reads open while guarding Site writes", async () => {
    await postAdminJson<BootstrapResponse>("/api/site/snapshot/restore", siteStoreSnapshot());

    const tree = await getJson<SitePageTreeResponse>("/api/site/tree/home");
    const before = await getJson<BootstrapResponse>("/api/site/bootstrap");
    const write = await harness.fetch("/api/site/mutations", {
      body: JSON.stringify({
        mutationId: "mutation-site-public-only",
        entity: "block",
        op: "create",
        values: {
          type: "page",
          label: "Unauthorized page",
          href: "/unauthorized-page",
        },
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const bootstrap = await getJson<BootstrapResponse>("/api/site/bootstrap");

    expect(tree.page.id).toBe("rec_site_content_home");
    expect(write.status).toBe(401);
    expectRecordsIgnoringOrder(bootstrap.records, before.records);
  });
});

function siteStoreSnapshot(): StoreSnapshot {
  return {
    kind: "formless.storeSnapshot",
    version: 1,
    schemaKey: "site",
    exportedAt: "2026-05-07T00:00:00.000Z",
    schemaUpdatedAt: "2026-05-07T00:00:00.000Z",
    sourceCursor: testSiteSeedRecords.length,
    schema: siteSourceSchema,
    records: testSiteSeedRecords,
  };
}

async function resetSchemaApp(schemaKey: SchemaKey) {
  const response = await harness.fetch(`/api/${schemaKey}/reset/seed`, {
    body: "{}",
    headers: adminHeaders(),
    method: "POST",
  });

  expect(response.status).toBe(200);
}

async function getJson<T>(path: string) {
  const response = await harness.fetch(path);

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

async function postAdminJson<T>(path: string, body: unknown) {
  const request = operationWriteRequest(path, body);
  const response = await harness.fetch(request.path, {
    body: JSON.stringify(request.body),
    headers: adminHeaders(),
    method: "POST",
  });

  expect(response.status).toBe(200);

  return request.response(await response.json()) as T;
}

async function postOwnerJson<T>(path: string, body: unknown) {
  const request = operationWriteRequest(path, body);
  const response = await harness.fetch(request.path, {
    body: JSON.stringify(request.body),
    headers: {
      ...(await ownerSessionHeaders()),
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  expect(response.status).toBe(200);

  return request.response(await response.json()) as T;
}

function adminHeaders() {
  return {
    Authorization: `Bearer ${adminToken}`,
    "Content-Type": "application/json",
  };
}

async function ownerSessionHeaders() {
  const created = await createOwnerSessionCookie({
    env: { FORMLESS_OWNER_SESSION_SECRET: sessionSecret },
    maxAgeSeconds: 60,
    now: "2999-01-01T00:00:00.000Z",
    owner,
    request: new Request("http://example.com/admin"),
  });

  return {
    Cookie: cookiePair(created.cookie),
  };
}

function cookiePair(cookie: string) {
  return cookie.split(";")[0] ?? cookie;
}

function expectRecordsIgnoringOrder(actual: StoredRecord[], expected: StoredRecord[]) {
  expect(Object.fromEntries(actual.map((record) => [record.id, record]))).toEqual(
    Object.fromEntries(expected.map((record) => [record.id, record])),
  );
}
