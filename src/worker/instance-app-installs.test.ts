import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  AppInstallsResponse,
  BootstrapResponse,
  CreateAppInstallResponse,
  MutationResponse,
  OwnerIdentity,
} from "../shared/protocol.ts";
import type { SitePageTreeResponse } from "@dpeek/formless-site-app";
import {
  crmSeedRecords,
  crmSourceSchema,
  siteSourceSchema,
  taskSeedRecords,
  taskSourceSchema,
} from "../test/schema-apps.ts";
import { operationWriteRequest } from "../test/authority-write.ts";
import {
  bundledSourceSchemaHashFixtures,
  computeSourceSchemaHash,
  type SourceSchemaHash,
} from "../shared/upgrade-migrations.ts";
import { INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY } from "../shared/instance-control-plane.ts";
import {
  appPackageManifestKind,
  appPackageManifestVersion,
  type AppPackageManifest,
} from "../shared/app-packages.ts";
import {
  FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME,
  formatRuntimeWorkspaceAppPackages,
} from "../shared/workspace-runtime-packages.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import { createOwnerSessionCookie } from "./owner-session.ts";

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
const owner: OwnerIdentity = {
  id: "owner-1",
  name: "Ada Owner",
  email: "ada@example.com",
  createdAt: "2026-06-09T00:00:00.000Z",
};

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
  await resetWorkerState();
});

afterAll(async () => {
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
        defaultInstallId: "crm",
        label: "CRM",
        packageAppKey: "crm",
        packageRevision: 1,
        sourceSchemaHash: bundledSourceSchemaHashFixtures.crm,
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

  it("lists and creates linked workspace app packages from the active resolver", async () => {
    const sourceSchemaHash = await computeSourceSchemaHash(taskSourceSchema);
    const privateHarness = await createWorkerHarness(
      "src/worker/index.ts",
      {
        FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
      },
      {
        bindings: {
          FORMLESS_ADMIN_TOKEN: adminToken,
          [FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME]: formatRuntimeWorkspaceAppPackages([
            {
              manifest: privatePackageManifest(sourceSchemaHash),
              sourceSchema: taskSourceSchema,
              seedRecords: taskSeedRecords,
            },
          ]),
        },
      },
    );

    try {
      const before = await getHarnessJson<AppInstallsResponse>(
        privateHarness,
        "/api/formless/app-installs",
      );
      const created = await postHarnessAdminJson<CreateAppInstallResponse>(
        privateHarness,
        "/api/formless/app-installs",
        {
          packageAppKey: "private-labs",
          installId: "labs",
          label: "Private Labs",
        },
      );
      const bootstrap = await getHarnessJson<BootstrapResponse>(
        privateHarness,
        "/api/app-installs/private-labs/labs/bootstrap",
      );
      const controlPlane = await getHarnessJson<BootstrapResponse>(
        privateHarness,
        "/api/formless/control-plane/bootstrap",
      );
      const appInstall = controlPlane.body.records.find(
        (record) => record.entity === "app-install" && record.id === "labs",
      );
      const routes = controlPlane.body.records.filter((record) => record.entity === "route");
      const controlPlaneJson = JSON.stringify(controlPlane.body.records);

      expect(before.body.packages.map((appPackage) => appPackage.packageAppKey)).toContain(
        "private-labs",
      );
      expect(
        before.body.packages.find((appPackage) => appPackage.packageAppKey === "private-labs"),
      ).toMatchObject({
        defaultInstallId: "labs",
        packageRevision: 7,
        publicRouteBase: "/sites",
        sourceOrigin: "workspace",
        sourceSchemaHash,
        sourceSchemaKey: "private-labs",
      });
      expect(created.response.status).toBe(201);
      expect(created.body.initialization).toEqual({
        installId: "labs",
        packageAppKey: "private-labs",
        seedRecordsKey: "private-labs",
        sourceSchemaKey: "private-labs",
      });
      expect(created.body.install).toEqual(
        expect.objectContaining({
          adminRoute: "/apps/labs",
          installId: "labs",
          label: "Private Labs",
          packageAppKey: "private-labs",
          packageRevision: 7,
          publicRoute: "/sites/labs",
          publicRoutePrefix: "/sites/labs/",
          schemaRoute: "/apps/labs/schema",
          sourceSchemaHash,
          status: "installed",
        }),
      );
      expect(bootstrap.body.schema).toEqual(taskSourceSchema);
      expect(bootstrap.body.records).toEqual(taskSeedRecords);
      expect(appInstall?.values).toMatchObject({
        installId: "labs",
        packageAppKey: "private-labs",
        sourceSchemaHash,
      });
      expect(
        routes
          .map((record) => record.values.matchPath)
          .sort((left, right) => String(left).localeCompare(String(right))),
      ).toEqual(["/apps/labs", "/apps/labs/schema", "/sites/labs"]);
      expect(
        routes
          .map((record) => [
            record.id,
            record.values.targetProfile,
            record.values.surface,
            record.values.access,
          ])
          .sort(([left], [right]) => String(left).localeCompare(String(right))),
      ).toEqual([
        ["route:labs:admin", "app", "admin", "owner"],
        ["route:labs:public-site", "public-site", "public-site", "anonymous"],
        ["route:labs:schema", "app", "schema", "owner"],
      ]);
      expect(controlPlaneJson).not.toContain("formless.app.json");
      expect(controlPlaneJson).not.toContain("../app");
    } finally {
      await privateHarness.dispose();
    }
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
    expect(after.body.installs[0]?.routes?.map((route) => [route.routeKind, route.access])).toEqual(
      [
        ["admin", "owner"],
        ["schema", "owner"],
        ["publicSite", "anonymous"],
      ],
    );
  });

  it("does not serve legacy app install registry reset or backfill endpoints", async () => {
    const reset = await harness.durableObjectFetch(
      "FORMLESS_AUTHORITY",
      FORMLESS_INSTANCE_AUTHORITY_NAME,
      "/_internal/reset-instance-app-installs",
      { method: "POST" },
    );
    const backfill = await harness.durableObjectFetch(
      "FORMLESS_AUTHORITY",
      INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
      "/api/formless/control-plane/_internal/backfill-app-installs",
      {
        body: JSON.stringify({ installs: [] }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );

    expect(reset.status).toBe(404);
    expect(await reset.json()).toEqual({ error: "Not found." });
    expect(backfill.status).toBe(404);
    expect(await backfill.json()).toEqual({ error: "Not found." });
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

  it("persists CRM installs and bootstraps from the bundled CRM source", async () => {
    const created = await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      packageAppKey: "crm",
      installId: "crm",
      label: "CRM",
    });
    const bootstrap = await getJson<BootstrapResponse>("/api/app-installs/crm/crm/bootstrap");

    expect(created.response.status).toBe(201);
    expect(created.body.initialization).toEqual({
      installId: "crm",
      packageAppKey: "crm",
      seedRecordsKey: "crm",
      sourceSchemaKey: "crm",
    });
    expect(created.body.install).toEqual(
      expect.objectContaining({
        adminRoute: "/apps/crm",
        installId: "crm",
        label: "CRM",
        packageAppKey: "crm",
        packageRevision: 1,
        schemaRoute: "/apps/crm/schema",
        sourceSchemaHash: bundledSourceSchemaHashFixtures.crm,
        status: "installed",
      }),
    );
    expect(created.body.install).not.toHaveProperty("publicRoute");
    expect(created.body.install).not.toHaveProperty("publicRoutePrefix");
    expect(bootstrap.body.schema).toEqual(crmSourceSchema);
    expect(bootstrap.body.records).toEqual(crmSeedRecords);
    expect(bootstrap.body.cursor).toBe(crmSeedRecords.length);
  });

  it("persists ClearTrace installs and bootstraps from a linked workspace package", async () => {
    const cleartracePackage = await readCleartraceWorkspacePackage();
    const privateHarness = await createWorkerHarness(
      "src/worker/index.ts",
      {
        FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
      },
      {
        bindings: {
          FORMLESS_ADMIN_TOKEN: adminToken,
          [FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME]: formatRuntimeWorkspaceAppPackages([
            cleartracePackage,
          ]),
        },
      },
    );

    try {
      const before = await getHarnessJson<AppInstallsResponse>(
        privateHarness,
        "/api/formless/app-installs",
      );
      const created = await postHarnessAdminJson<CreateAppInstallResponse>(
        privateHarness,
        "/api/formless/app-installs",
        {
          packageAppKey: "cleartrace",
          installId: "cleartrace",
          label: "ClearTrace",
        },
      );
      const controlPlane = await getHarnessJson<BootstrapResponse>(
        privateHarness,
        "/api/formless/control-plane/bootstrap",
      );
      const bootstrap = await getHarnessJson<BootstrapResponse>(
        privateHarness,
        "/api/app-installs/cleartrace/cleartrace/bootstrap",
      );

      expect(before.body.packages.map((appPackage) => appPackage.packageAppKey)).toContain(
        "cleartrace",
      );
      expect(created.response.status).toBe(201);
      expect(created.body.initialization).toEqual({
        installId: "cleartrace",
        packageAppKey: "cleartrace",
        seedRecordsKey: "cleartrace",
        sourceSchemaKey: "cleartrace",
      });
      expect(created.body.install).toEqual(
        expect.objectContaining({
          adminRoute: "/apps/cleartrace",
          installId: "cleartrace",
          label: "ClearTrace",
          packageAppKey: "cleartrace",
          packageRevision: 1,
          schemaRoute: "/apps/cleartrace/schema",
          sourceSchemaHash: cleartracePackage.manifest.sourceSchemaHash,
          status: "installed",
        }),
      );
      expect(created.body.install).not.toHaveProperty("publicRoute");
      expect(created.body.install).not.toHaveProperty("publicRoutePrefix");
      expect(
        controlPlane.body.records
          .filter((record) => record.entity === "route")
          .map((record) => [
            record.values.appInstall,
            record.values.matchPath,
            record.values.surface,
          ])
          .sort((left, right) => String(left[1]).localeCompare(String(right[1]))),
      ).toEqual([
        ["cleartrace", "/apps/cleartrace", "admin"],
        ["cleartrace", "/apps/cleartrace/schema", "schema"],
      ]);
      expect(bootstrap.body.schema).toEqual(cleartracePackage.sourceSchema);
      expect(bootstrap.body.records).toEqual(cleartracePackage.seedRecords);
      expect(bootstrap.body.cursor).toBe(cleartracePackage.seedRecords.length);
    } finally {
      await privateHarness.dispose();
    }
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
    const unsupported = await postAdminJson<AppInstallFailureResponse>(
      "/api/formless/app-installs",
      {
        packageAppKey: "missing",
        installId: "missing",
        label: "Missing",
      },
    );
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
    expect(unsupported.response.status).toBe(400);
    expect(unsupported.body).toMatchObject({
      code: "unsupported-package",
      field: "packageAppKey",
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

  it("requires owner or admin authorization for app management reads when configured", async () => {
    const anonymous = await harness.fetch("/api/formless/app-installs");
    const admin = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const ownerRead = await getOwnerJson<AppInstallsResponse>("/api/formless/app-installs");

    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("WWW-Authenticate")).toBe('Bearer realm="formless-admin"');
    expect(await anonymous.json()).toEqual({
      error: "Owner session or admin authorization is required for this read endpoint.",
    });
    expect(admin.body.installs).toEqual([]);
    expect(ownerRead.body.installs).toEqual([]);
  });

  it("guards installed app management reads while keeping public Site tree reads anonymous", async () => {
    await postAdminJson<CreateAppInstallResponse>("/api/formless/app-installs", {
      packageAppKey: "site",
      installId: "personal",
      label: "Personal Site",
    });

    const anonymousBootstrap = await harness.fetch("/api/app-installs/site/personal/bootstrap");
    const anonymousTree = await harness.fetch("/api/app-installs/site/personal/tree/home");
    const adminBootstrap = await getJson<BootstrapResponse>(
      "/api/app-installs/site/personal/bootstrap",
    );
    const ownerBootstrap = await getOwnerJson<BootstrapResponse>(
      "/api/app-installs/site/personal/bootstrap",
    );
    const tree = (await anonymousTree.json()) as SitePageTreeResponse;

    expect(anonymousBootstrap.status).toBe(401);
    expect(await anonymousBootstrap.json()).toEqual({
      error: "Owner session or admin authorization is required for this read endpoint.",
    });
    expect(anonymousTree.status).toBe(200);
    expect(tree.page.id).toBe("rec_site_starter_page_home");
    expect(adminBootstrap.body.schema).toEqual(siteSourceSchema);
    expect(ownerBootstrap.body.schema).toEqual(siteSourceSchema);
  });
});

async function getJson<T>(path: string) {
  const response = await harness.fetch(path, { headers: adminHeaders() });

  expect(response.status).toBe(200);

  return {
    body: (await response.json()) as T,
    response,
  };
}

async function getOwnerJson<T>(path: string) {
  const response = await harness.fetch(path, { headers: await ownerSessionHeaders() });

  expect(response.status).toBe(200);

  return {
    body: (await response.json()) as T,
    response,
  };
}

async function postAdminJson<T>(path: string, body: unknown) {
  const request = operationWriteRequest(path, body);
  const response = await harness.fetch(request.path, {
    body: JSON.stringify(request.body),
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });

  return {
    body: request.response(await response.json()) as T,
    response,
  };
}

async function getHarnessJson<T>(targetHarness: Harness, path: string) {
  const response = await targetHarness.fetch(path, { headers: adminHeaders() });

  expect(response.status).toBe(200);

  return {
    body: (await response.json()) as T,
    response,
  };
}

async function postHarnessAdminJson<T>(targetHarness: Harness, path: string, body: unknown) {
  const request = operationWriteRequest(path, body);
  const response = await targetHarness.fetch(request.path, {
    body: JSON.stringify(request.body),
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });

  return {
    body: request.response(await response.json()) as T,
    response,
  };
}

async function resetWorkerState() {
  await Promise.all([
    postReset("/api/formless/control-plane/reset/seed"),
    postReset("/api/app-installs/site/site/reset/seed"),
    postReset("/api/app-installs/site/personal/reset/seed"),
    postReset("/api/app-installs/tasks/tasks/reset/seed"),
    postReset("/api/app-installs/crm/crm/reset/seed"),
  ]);
}

async function postReset(path: string) {
  const response = await harness.fetch(path, {
    body: "{}",
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });

  expect(response.status).toBe(200);
}

function adminHeaders(headers: Record<string, string> = {}) {
  return {
    ...headers,
    Authorization: `Bearer ${adminToken}`,
  };
}

async function ownerSessionHeaders() {
  const created = await createOwnerSessionCookie({
    env: { FORMLESS_ADMIN_TOKEN: adminToken },
    maxAgeSeconds: 60,
    now: "2999-01-01T00:00:00.000Z",
    owner,
    request: new Request("http://example.com/apps"),
  });

  return {
    Cookie: cookiePair(created.cookie),
  };
}

function cookiePair(cookie: string) {
  return cookie.split(";")[0] ?? cookie;
}

function privatePackageManifest(sourceSchemaHash: SourceSchemaHash): AppPackageManifest {
  return {
    kind: appPackageManifestKind,
    version: appPackageManifestVersion,
    packageAppKey: "private-labs",
    label: "Private Labs",
    description: "Private lab package fixture.",
    defaultInstallId: "labs",
    supportsMultipleInstalls: false,
    packageRevision: 7,
    sourceSchema: {
      kind: "workspace",
      key: "private-labs",
      path: "source/schema.json",
    },
    seedRecords: {
      kind: "workspace",
      key: "private-labs",
      path: "source/seed-records.json",
    },
    sourceSchemaHash,
    capabilities: [
      { kind: "generatedAdmin", routeBase: "/apps" },
      { kind: "publicSite", routeBase: "/sites" },
    ],
  };
}

async function readCleartraceWorkspacePackage(): Promise<{
  manifest: AppPackageManifest;
  seedRecords: unknown[];
  sourceSchema: unknown;
}> {
  const packageRoot = "/Users/dpeek/code/cleartrace";
  const manifest = JSON.parse(
    await readFile(path.join(packageRoot, "formless.app.json"), "utf8"),
  ) as AppPackageManifest;

  return {
    manifest,
    sourceSchema: JSON.parse(await readFile(path.join(packageRoot, "schema.json"), "utf8")),
    seedRecords: JSON.parse(await readFile(path.join(packageRoot, "seed-records.json"), "utf8")),
  };
}
