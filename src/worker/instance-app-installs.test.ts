import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import type {
  AppInstallsResponse,
  BootstrapResponse,
  CreateAppInstallResponse,
  MutationResponse,
} from "../shared/protocol.ts";
import {
  rateSeedRecords,
  rateSourceSchema,
  siteSourceSchema,
  taskSeedRecords,
  taskSourceSchema,
} from "../test/schema-apps.ts";
import { bundledSourceSchemaHashFixtures } from "../shared/upgrade-migrations.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

type AppInstallFailureResponse = {
  code: string;
  error: string;
  field?: string;
};

type PackageMigrationApplyResponse = {
  applied: unknown[];
  changes: unknown[];
  cursor: number;
  install: CreateAppInstallResponse["install"];
  installs: CreateAppInstallResponse["installs"];
  packageAppKey: string;
  packageRevision: number;
  skipped: unknown[];
  sourceSchemaHash: string;
};

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
    },
  );
});

afterEach(async () => {
  await harness.dispose();
});

describe("instance app install API routes", () => {
  it("lists bundled packages and persists Site installs", async () => {
    const before = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const created = await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      packageAppKey: "site",
      installId: "site",
      label: "Site",
    });
    const after = await getJson<AppInstallsResponse>("/api/formless/app-installs");

    expect(before.body.packages).toEqual([
      expect.objectContaining({
        defaultInstallId: "site",
        label: "Site",
        packageAppKey: "site",
        packageRevision: 1,
        sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
      }),
      expect.objectContaining({
        defaultInstallId: "tasks",
        label: "Tasks",
        packageAppKey: "tasks",
        packageRevision: 1,
        sourceSchemaHash: bundledSourceSchemaHashFixtures.tasks,
      }),
      expect.objectContaining({
        defaultInstallId: "estii",
        label: "Estii",
        packageAppKey: "estii",
        packageRevision: 1,
        sourceSchemaHash: bundledSourceSchemaHashFixtures.estii,
      }),
    ]);
    expect(before.body.installs).toEqual([]);
    expect(before.response.headers.get("Cache-Control")).toBe("no-store");
    expect(created.response.status).toBe(201);
    expect(created.response.headers.get("Cache-Control")).toBe("no-store");
    expect(created.body.initialization).toEqual({
      installId: "site",
      packageAppKey: "site",
      seedRecordsKey: "site",
      sourceSchemaKey: "site",
    });
    expect(created.body.install).toMatchObject({
      adminRoute: "/apps/site",
      installId: "site",
      label: "Site",
      packageAppKey: "site",
      packageRevision: 1,
      publicRoute: "/sites/site",
      schemaRoute: "/apps/site/schema",
      sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
      status: "installed",
    });
    expect(after.body.installs).toEqual(created.body.installs);
  });

  it("derives app install API responses from control-plane install and route records", async () => {
    await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      packageAppKey: "site",
      installId: "personal",
      label: "Personal Site",
    });
    const controlPlane = await getJson<BootstrapResponse>("/api/formless/control-plane/bootstrap");
    const patchedRoute = await postAdminJson<MutationResponse>(
      "/api/formless/control-plane/mutations",
      {
        mutationId: "mutation-personal-admin-route",
        entity: "route",
        op: "patch",
        recordId: "route:personal:admin",
        values: {
          matchPath: "/apps/personal-admin",
          updatedAt: "2026-05-28T00:00:00.000Z",
        },
      },
    );
    const after = await getJson<AppInstallsResponse>("/api/formless/app-installs");

    expect(controlPlane.body.records.map((record) => `${record.entity}:${record.id}`)).toEqual([
      "app-install:personal",
      "route:route:personal:admin",
      "route:route:personal:schema",
      "route:route:personal:public-site",
    ]);
    expect(patchedRoute.response.status).toBe(200);
    expect(after.body.installs[0]).toEqual(
      expect.objectContaining({
        adminRoute: "/apps/personal-admin",
        installId: "personal",
        publicRoute: "/sites/personal",
        publicRoutePrefix: "/sites/personal/",
        schemaRoute: "/apps/personal/schema",
      }),
    );
    expect(after.body.installs[0]?.routes?.map((route) => [route.routeKind, route.path])).toEqual([
      ["admin", "/apps/personal-admin"],
      ["schema", "/apps/personal/schema"],
      ["publicSite", "/sites/personal"],
    ]);
  });

  it("rejects app installs whose generated route records conflict before recording the install", async () => {
    const now = "2026-06-02T00:00:00.000Z";
    const conflictingRoute = await postAdminJson<MutationResponse>(
      "/api/formless/control-plane/mutations",
      {
        mutationId: "mutation-reserve-personal-admin-route",
        entity: "route",
        op: "create",
        values: {
          enabled: true,
          matchPath: "/apps/personal",
          kind: "mount",
          targetProfile: "instance",
          surface: "admin",
          createdAt: now,
          updatedAt: now,
        },
      },
    );
    const rejected = await postAdminJson<AppInstallFailureResponse>("/api/formless/app-installs", {
      packageAppKey: "site",
      installId: "personal",
      label: "Personal Site",
    });
    const after = await getJson<AppInstallsResponse>("/api/formless/app-installs");

    expect(conflictingRoute.response.status).toBe(200);
    expect(rejected.response.status).toBe(400);
    expect(rejected.body.error).toContain(
      'Enabled route match "<hostless>/apps/personal" conflicts with enabled route',
    );
    expect(after.body.installs).toEqual([]);
  });

  it("keeps installed app storage identity based on install id after route path edits", async () => {
    await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      packageAppKey: "site",
      installId: "personal",
      label: "Personal Site",
    });
    const routeEdit = await postAdminJson<MutationResponse>(
      "/api/formless/control-plane/mutations",
      {
        mutationId: "mutation-personal-admin-storage-identity-route",
        entity: "route",
        op: "patch",
        recordId: "route:personal:admin",
        values: {
          matchPath: "/apps/personal-admin",
          updatedAt: "2026-06-02T00:00:00.000Z",
        },
      },
    );
    const controlPlane = await getJson<BootstrapResponse>("/api/formless/control-plane/bootstrap");
    const installs = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const bootstrap = await getJson<BootstrapResponse>("/api/app-installs/site/personal/bootstrap");

    expect(routeEdit.response.status).toBe(200);
    expect(
      controlPlane.body.records.find(
        (record) => record.entity === "app-install" && record.id === "personal",
      )?.values.storageIdentity,
    ).toBe("app:personal");
    expect(installs.body.installs[0]).toMatchObject({
      adminRoute: "/apps/personal-admin",
      installId: "personal",
      schemaRoute: "/apps/personal/schema",
    });
    expect(bootstrap.body.schema).toEqual(siteSourceSchema);
  });

  it("persists Tasks installs and bootstraps from the bundled Tasks source", async () => {
    const created = await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      packageAppKey: "tasks",
      installId: "tasks",
      label: "Tasks",
    });
    const bootstrap = await getJson<BootstrapResponse>("/api/app-installs/tasks/tasks/bootstrap");

    expect(created.response.status).toBe(201);
    expect(created.body.initialization).toEqual({
      installId: "tasks",
      packageAppKey: "tasks",
      seedRecordsKey: "tasks",
      sourceSchemaKey: "tasks",
    });
    expect(created.body.install).toEqual(
      expect.objectContaining({
        adminRoute: "/apps/tasks",
        installId: "tasks",
        label: "Tasks",
        packageAppKey: "tasks",
        packageRevision: 1,
        schemaRoute: "/apps/tasks/schema",
        sourceSchemaHash: bundledSourceSchemaHashFixtures.tasks,
        status: "installed",
      }),
    );
    expect(created.body.install).not.toHaveProperty("publicRoute");
    expect(created.body.install).not.toHaveProperty("publicRoutePrefix");
    expect(bootstrap.body.schema).toEqual(taskSourceSchema);
    expect(bootstrap.body.records).toEqual(taskSeedRecords);
    expect(bootstrap.body.cursor).toBe(taskSeedRecords.length);
  });

  it("applies installed app package migrations through Authority and updates install facts", async () => {
    await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      packageAppKey: "tasks",
      installId: "tasks",
      label: "Tasks",
    });

    const applied = await postAdminJson<PackageMigrationApplyResponse>(
      "/api/formless/app-installs/tasks/tasks/package-migrations/apply",
      {},
    );
    const after = await getJson<AppInstallsResponse>("/api/formless/app-installs");

    expect(applied.response.status).toBe(200);
    expect(applied.body).toMatchObject({
      applied: [],
      changes: [],
      packageAppKey: "tasks",
      packageRevision: 1,
      skipped: [],
      sourceSchemaHash: bundledSourceSchemaHashFixtures.tasks,
    });
    expect(applied.body.cursor).toBe(taskSeedRecords.length);
    expect(applied.body.install).toEqual(
      expect.objectContaining({
        installId: "tasks",
        packageAppKey: "tasks",
        packageRevision: 1,
        sourceSchemaHash: bundledSourceSchemaHashFixtures.tasks,
      }),
    );
    expect(after.body.installs).toEqual(applied.body.installs);
  });

  it("persists Estii installs and bootstraps from the bundled Estii source", async () => {
    const created = await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      packageAppKey: "estii",
      installId: "rates",
      label: "Rates",
    });
    const bootstrap = await getJson<BootstrapResponse>("/api/app-installs/estii/rates/bootstrap");

    expect(created.response.status).toBe(201);
    expect(created.body.initialization).toEqual({
      installId: "rates",
      packageAppKey: "estii",
      seedRecordsKey: "estii",
      sourceSchemaKey: "estii",
    });
    expect(created.body.install).toEqual(
      expect.objectContaining({
        adminRoute: "/apps/rates",
        installId: "rates",
        label: "Rates",
        packageAppKey: "estii",
        packageRevision: 1,
        schemaRoute: "/apps/rates/schema",
        sourceSchemaHash: bundledSourceSchemaHashFixtures.estii,
        status: "installed",
      }),
    );
    expect(created.body.install).not.toHaveProperty("publicRoute");
    expect(created.body.install).not.toHaveProperty("publicRoutePrefix");
    expect(bootstrap.body.schema).toEqual(rateSourceSchema);
    expect(bootstrap.body.records).toEqual(rateSeedRecords);
    expect(bootstrap.body.cursor).toBe(rateSeedRecords.length);
  });

  it("rejects duplicate and invalid installs without mutating existing installs", async () => {
    await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      packageAppKey: "site",
      installId: "personal",
      label: "Personal Site",
    });

    const duplicate = await postAdminJson<AppInstallFailureResponse>("/api/formless/app-installs", {
      packageAppKey: "tasks",
      installId: "personal",
      label: "Personal Tasks",
    });
    const invalid = await postAdminJson<AppInstallFailureResponse>("/api/formless/app-installs", {
      packageAppKey: "site",
      installId: "Site",
      label: "Bad Site",
    });
    const after = await getJson<AppInstallsResponse>("/api/formless/app-installs");

    expect(duplicate.response.status).toBe(409);
    expect(duplicate.body).toMatchObject({
      code: "duplicate-install-id",
      field: "installId",
    });
    expect(invalid.response.status).toBe(400);
    expect(invalid.body).toMatchObject({
      code: "invalid-install-id",
      field: "installId",
    });
    expect(after.body.installs.map((install) => install.installId)).toEqual(["personal"]);
  });

  it("requires instance write authorization for install creation when configured", async () => {
    const rejected = await harness.fetch("/api/formless/app-installs", {
      body: JSON.stringify({
        packageAppKey: "site",
        installId: "personal",
        label: "Personal Site",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const accepted = await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      packageAppKey: "site",
      installId: "personal",
      label: "Personal Site",
    });

    expect(rejected.status).toBe(401);
    expect(rejected.headers.get("WWW-Authenticate")).toBe('Bearer realm="formless-admin"');
    expect(await rejected.json()).toEqual({
      error: "Owner session or admin authorization is required for this write endpoint.",
    });
    expect(accepted.response.status).toBe(201);
  });
});

async function getJson<T>(path: string) {
  const response = await harness.fetch(path);

  expect(response.status).toBe(200);

  return {
    body: (await response.json()) as T,
    response,
  };
}

async function postAdminJson<T>(path: string, body: unknown) {
  const response = await harness.fetch(path, {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  return {
    body: (await response.json()) as T,
    response,
  };
}
