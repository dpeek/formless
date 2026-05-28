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
  taskSeedRecords,
  taskSourceSchema,
} from "../test/schema-apps.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

type AppInstallFailureResponse = {
  code: string;
  error: string;
  field?: string;
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
      }),
      expect.objectContaining({
        defaultInstallId: "tasks",
        label: "Tasks",
        packageAppKey: "tasks",
      }),
      expect.objectContaining({
        defaultInstallId: "estii",
        label: "Estii",
        packageAppKey: "estii",
      }),
    ]);
    expect(before.body.installs).toEqual([]);
    expect(created.response.status).toBe(201);
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
      publicRoute: "/sites/site",
      schemaRoute: "/apps/site/schema",
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
        entity: "appRoute",
        op: "patch",
        recordId: "app-route:personal:admin",
        values: {
          path: "/apps/personal-admin",
          updatedAt: "2026-05-28T00:00:00.000Z",
        },
      },
    );
    const after = await getJson<AppInstallsResponse>("/api/formless/app-installs");

    expect(controlPlane.body.records.map((record) => `${record.entity}:${record.id}`)).toEqual([
      "appInstall:personal",
      "appRoute:app-route:personal:admin",
      "appRoute:app-route:personal:schema",
      "appRoute:app-route:personal:publicSite",
    ]);
    expect(patchedRoute.response.status).toBe(200);
    expect(after.body.installs[0]).toEqual(
      expect.objectContaining({
        adminRoute: "/apps/personal-admin",
        installId: "personal",
        publicRoute: "/sites/personal",
        schemaRoute: "/apps/personal/schema",
      }),
    );
    expect(after.body.installs[0]?.routes?.map((route) => [route.routeKind, route.path])).toEqual([
      ["admin", "/apps/personal-admin"],
      ["schema", "/apps/personal/schema"],
      ["publicSite", "/sites/personal"],
    ]);
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
        schemaRoute: "/apps/tasks/schema",
        status: "installed",
      }),
    );
    expect(created.body.install).not.toHaveProperty("publicRoute");
    expect(created.body.install).not.toHaveProperty("publicRoutePrefix");
    expect(bootstrap.body.schema).toEqual(taskSourceSchema);
    expect(bootstrap.body.records).toEqual(taskSeedRecords);
    expect(bootstrap.body.cursor).toBe(taskSeedRecords.length);
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
        schemaRoute: "/apps/rates/schema",
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
