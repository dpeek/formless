import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { APP_ARCHIVE_KIND, ARCHIVE_VERSION, type AppArchive } from "../shared/archive.ts";
import type { AppInstallsResponse, BootstrapResponse, StoredRecord } from "../shared/protocol.ts";
import { siteSourceSchema } from "../test/schema-apps.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const adminToken = "test-admin-token";

let harness: Harness;

beforeEach(async () => {
  harness = await createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: { FORMLESS_ADMIN_TOKEN: adminToken },
      r2Buckets: ["FORMLESS_MEDIA"],
    },
  );
});

afterEach(async () => {
  await harness.dispose();
});

describe("instance archive restore API", () => {
  it("dry-runs and applies app archive restore through installed app storage", async () => {
    const dryRun = await postArchiveRestore(appArchive({ dryRun: true }));
    const before = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const applied = await postArchiveRestore(appArchive({ dryRun: false }));
    const after = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const bootstrap = await getJson<BootstrapResponse>("/api/app-installs/site/personal/bootstrap");

    expect(dryRun.response.status).toBe(200);
    expect(dryRun.body).toMatchObject({
      ok: true,
      report: {
        applied: false,
        summary: {
          appCount: 1,
          createdInstalls: ["personal"],
        },
      },
    });
    expect(before.body.installs).toEqual([]);
    expect(applied.response.status).toBe(200);
    expect(applied.body).toMatchObject({
      ok: true,
      report: {
        applied: true,
        summary: {
          appCount: 1,
          createdInstalls: ["personal"],
        },
      },
    });
    expect(after.body.installs.map((install) => install.installId)).toEqual(["personal"]);
    expect(bootstrap.body.records).toContainEqual(siteRecord());
  });

  it("requires write authorization", async () => {
    const response = await harness.fetch("/api/formless/archive/restore", {
      body: JSON.stringify({ archive: appArchive({ dryRun: true }) }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Owner session or admin authorization is required for this write endpoint.",
    });
  });
});

async function postArchiveRestore(archive: AppArchive) {
  const response = await harness.fetch("/api/formless/archive/restore", {
    body: JSON.stringify({ archive }),
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  return {
    body: (await response.json()) as unknown,
    response,
  };
}

async function getJson<T>(path: string) {
  const response = await harness.fetch(path);

  return {
    body: (await response.json()) as T,
    response,
  };
}

function appArchive(input: { dryRun: boolean }): AppArchive {
  return {
    kind: APP_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: "2026-05-12T00:00:00.000Z",
    capabilities: ["source-records", "app-scoped-media"],
    restorePolicy: { dryRun: input.dryRun, installCollisions: "reject" },
    app: {
      installId: "personal",
      packageAppKey: "site",
      sourceSchemaKey: "site",
      label: "Personal",
      status: "installed",
      createdAt: "2026-05-12T00:00:00.000Z",
      updatedAt: "2026-05-12T00:00:00.000Z",
    },
    data: {
      kind: "sourceRecords",
      schemaKey: "site",
      schemaUpdatedAt: "2026-05-12T00:00:00.000Z",
      schema: siteSourceSchema,
      records: [siteRecord()],
    },
    media: { objects: [] },
  };
}

function siteRecord(): StoredRecord {
  return {
    id: "site-main",
    createdAt: "2026-05-12T00:00:00.000Z",
    entity: "site",
    values: {
      key: "personal",
      label: "Personal",
    },
  };
}
