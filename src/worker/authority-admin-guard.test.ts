import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import type {
  BootstrapResponse,
  MutationResponse,
  SitePageTreeResponse,
} from "../shared/protocol.ts";
import type { SchemaKey } from "../shared/schema-apps.ts";
import { siteSeedRecords, taskSeedRecords } from "../test/schema-apps.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const adminToken = "test-admin-token";

let harness: Harness;

beforeAll(async () => {
  harness = await createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: { FORMLESS_ADMIN_TOKEN: adminToken },
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
      "/api/tasks/mutations",
      "/api/tasks/actions",
      "/api/tasks/reset/schema",
      "/api/tasks/reset/seed",
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
        error: "Admin authorization is required for this write endpoint.",
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

  it("keeps public Site tree reads open while guarding Site writes", async () => {
    const tree = await getJson<SitePageTreeResponse>("/api/site/tree/home");
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
    expect(bootstrap.records).toEqual(siteSeedRecords);
  });
});

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
  const response = await harness.fetch(path, {
    body: JSON.stringify(body),
    headers: adminHeaders(),
    method: "POST",
  });

  expect(response.status).toBe(200);

  return (await response.json()) as T;
}

function adminHeaders() {
  return {
    Authorization: `Bearer ${adminToken}`,
    "Content-Type": "application/json",
  };
}
