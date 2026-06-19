import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  INSTANCE_CONTROL_PLANE_SOURCE_SCHEMA_HASH,
  INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
  instanceControlPlaneSchema,
  instanceControlPlaneSchemaProvenance,
  type InstanceControlPlaneAppInstallValues,
  type InstanceControlPlaneRouteValues,
} from "@dpeek/formless-instance-control-plane";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import { FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER } from "../shared/protocol.ts";
import type {
  ActionResponse,
  AppInstallsResponse,
  BootstrapResponse,
  OwnerIdentity,
  SchemaResponse,
  SyncResponse,
} from "../shared/protocol.ts";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import { parseAppSchema, type AppSchema, type EntityMutationPolicy } from "@dpeek/formless-schema";
import {
  bundledSourceSchemaHashFixtures,
  computeSourceSchemaHash,
  type SourceSchemaHash,
} from "../shared/upgrade-migrations.ts";
import { siteSeedRecords, siteSourceSchema } from "../test/schema-apps.ts";
import {
  appPackageManifestKind,
  appPackageManifestVersion,
  type AppPackageManifest,
} from "../shared/app-packages.ts";
import {
  FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME,
  formatRuntimeWorkspaceAppPackages,
} from "../shared/workspace-runtime-packages.ts";
import { mutationOperationRequest, operationWriteRequest } from "../test/authority-write.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import { createOwnerSessionCookie } from "./owner-session.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

type FailureResponse = {
  code?: string;
  error: string;
  field?: string;
};

const adminToken = "test-admin-token";
const controlPlaneApi = "/api/formless/control-plane";
const createAppInstallOperation = `${controlPlaneApi}/operations/app-install/createAppInstall`;
const owner: OwnerIdentity = {
  id: "owner-1",
  name: "Ada Owner",
  email: "ada@example.com",
  createdAt: "2026-06-09T00:00:00.000Z",
};

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness();
});

beforeEach(async () => {
  await resetWorkerState();
});

afterAll(async () => {
  await harness.dispose();
});

function createHarness() {
  return createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: { FORMLESS_ADMIN_TOKEN: adminToken },
    },
  );
}

describe("instance control-plane API routes", () => {
  it("requires owner or admin authorization for dashboard control-plane reads", async () => {
    const anonymous = await harness.fetch(`${controlPlaneApi}/bootstrap`);
    const admin = await getJson<BootstrapResponse>(`${controlPlaneApi}/bootstrap`);
    const ownerRead = await getOwnerJson<BootstrapResponse>(`${controlPlaneApi}/bootstrap`);

    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("WWW-Authenticate")).toBe('Bearer realm="formless-admin"');
    expect(await anonymous.json()).toEqual({
      error: "Owner session or admin authorization is required for this read endpoint.",
    });
    expect(admin.body.records).toEqual([]);
    expect(ownerRead.body.records).toEqual([]);
  });

  it("bootstraps the runtime-owned control-plane storage identity for safe query actors", async () => {
    const runnerBootstrap = await getJson<BootstrapResponse>(
      `${controlPlaneApi}/bootstrap?actorKind=runner`,
    );
    const ownerSchema = await getJson<SchemaResponse>(`${controlPlaneApi}/schema`);
    const parsedInstanceControlPlaneSchema = parseAppSchema(instanceControlPlaneSchema);
    const sourceSchemaHash = await computeSourceSchemaHash(instanceControlPlaneSchema);

    expect(INSTANCE_CONTROL_PLANE_SOURCE_SCHEMA_HASH).toBe(sourceSchemaHash);
    expect(runnerBootstrap.body.schema).toEqual(parsedInstanceControlPlaneSchema);
    expect(runnerBootstrap.body.schemaProvenance).toEqual(instanceControlPlaneSchemaProvenance);
    expect(runnerBootstrap.body.records).toEqual([]);
    expect(runnerBootstrap.body.cursor).toBe(0);
    expect(runnerBootstrap.response.headers.get(FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER)).toBe(
      runnerBootstrap.body.schemaProvenance?.sourceSchemaHash,
    );
    expect(ownerSchema.body.schema).toEqual(parsedInstanceControlPlaneSchema);
    expect(ownerSchema.body.schemaProvenance).toEqual(runnerBootstrap.body.schemaProvenance);
    expect(ownerSchema.response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("exports control-plane storage snapshots with the control-plane identity", async () => {
    const created = await postAdminJson<OperationInvocationResponse>(createAppInstallOperation, {
      idempotencyKey: "create-snapshot-export",
      input: {
        packageAppKey: "site",
        installId: "snapshot-export",
        label: "Snapshot Export Site",
      },
    });
    const bootstrap = await getJson<BootstrapResponse>(`${controlPlaneApi}/bootstrap`);
    const snapshot = await getJson<StorageSnapshot>(`${controlPlaneApi}/snapshot`);

    expect(snapshot.body).toMatchObject({
      kind: STORAGE_SNAPSHOT_KIND,
      version: STORAGE_SNAPSHOT_VERSION,
      storageIdentity: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
      schemaKey: "instance-control-plane",
      exportedAt: expect.any(String),
      schemaUpdatedAt: bootstrap.body.schemaUpdatedAt,
      sourceCursor: operationCommandResponse(created).cursor,
      schema: parseAppSchema(instanceControlPlaneSchema),
    });
    expect(snapshot.body.records).toEqual(bootstrap.body.records);
  });

  it("creates app install and default route records as one idempotent control-plane operation", async () => {
    const created = await postAdminJson<OperationInvocationResponse>(createAppInstallOperation, {
      idempotencyKey: "create-personal",
      input: {
        packageAppKey: "site",
        installId: "personal",
        label: "Personal Site",
      },
    });
    const replay = await postAdminJson<OperationInvocationResponse>(createAppInstallOperation, {
      idempotencyKey: "create-personal",
      input: {
        packageAppKey: "site",
        installId: "personal",
        label: "Personal Site",
      },
    });
    const controlPlane = await getJson<BootstrapResponse>(`${controlPlaneApi}/bootstrap`);
    const installedSite = await getJson<BootstrapResponse>(
      "/api/app-installs/site/personal/bootstrap",
    );

    expect(created.response.status).toBe(200);
    expect(created.body.status).toBe("committed");
    expect(operationCommandResponse(created).cursor).toBe(3);
    expect(operationCommandResponse(created).changes.map((change) => change.payload.id)).toEqual([
      "personal",
      "route:personal:admin",
      "route:personal:public-site",
    ]);
    expect(replay.response.status).toBe(200);
    expect(replay.body.status).toBe("replayed");
    expect(replay.body.output).toEqual(created.body.output);
    expect(installedSite.body.schema).toEqual(siteSourceSchema);
    expect(installedSite.body.records).toEqual(siteSeedRecords);
    expect(controlPlane.body.records).toHaveLength(3);
    expect(appInstallValues(controlPlane.body, "personal")).toMatchObject({
      installId: "personal",
      packageAppKey: "site",
      label: "Personal Site",
      storageIdentity: "app:personal",
    });
    expect(routeValues(controlPlane.body).map((route) => route["matchPath"])).toEqual([
      "/apps/personal",
      "/sites/personal",
    ]);
    expect(JSON.stringify(controlPlane.body.records)).not.toContain("block-placement");
  });

  it("keeps control-plane records isolated from installed app storage writes", async () => {
    await postAdminJson<OperationInvocationResponse>(createAppInstallOperation, {
      idempotencyKey: "create-work",
      input: {
        packageAppKey: "site",
        installId: "work",
        label: "Work Site",
      },
    });
    const appMutation = await postInstalledAppMutation("site", "work", {
      mutationId: "mutation-installed-site-page",
      entity: "block",
      op: "create",
      values: {
        type: "page",
        label: "Installed only",
        href: "/installed-only",
      },
    });
    const controlPlane = await getJson<BootstrapResponse>(`${controlPlaneApi}/bootstrap`);
    const installedSite = await getJson<BootstrapResponse>("/api/app-installs/site/work/bootstrap");
    const sync = await getJson<SyncResponse>(`${controlPlaneApi}/sync?after=0`);

    expect(appMutation.body.record.entity).toBe("block");
    expect(
      installedSite.body.records.some((record) => record.id === appMutation.body.record.id),
    ).toBe(true);
    expect(controlPlane.body.records.map((record) => record.entity)).toEqual([
      "app-install",
      "route",
      "route",
    ]);
    expect(JSON.stringify(controlPlane.body.records)).not.toContain("Installed only");
    expect(JSON.stringify(sync.body)).not.toContain(appMutation.body.record.id);
  });

  it("derives installed app API summaries from real control-plane route records", async () => {
    await postAdminJson<OperationInvocationResponse>(createAppInstallOperation, {
      idempotencyKey: "create-route-validation",
      input: {
        packageAppKey: "site",
        installId: "personal",
        label: "Personal Site",
      },
    });
    const before = await getJson<AppInstallsResponse>("/api/formless/app-installs");

    const routeEdit = await postAdminJson<OperationInvocationResponse>(
      `${controlPlaneApi}/operations/route/update`,
      {
        idempotencyKey: "route-edit",
        recordId: "route:personal:admin",
        input: {
          matchPath: "/apps/personal-admin",
        },
      },
    );
    const after = await getJson<AppInstallsResponse>("/api/formless/app-installs");

    expect(before.body.installs[0]).toMatchObject({
      adminRoute: "/apps/personal",
      installId: "personal",
    });
    expect(routeEdit.response.status).toBe(200);
    expect(after.body.installs[0]).toMatchObject({
      adminRoute: "/apps/personal-admin",
      installId: "personal",
    });
  });

  it("validates app install package keys and route capabilities against resolved packages", async () => {
    const missingPackage = await postAdminJson<FailureResponse>(
      `${controlPlaneApi}/operations/app-install/create`,
      {
        idempotencyKey: "missing-package-install",
        input: {
          installId: "missing",
          packageAppKey: "missing-package",
          label: "Missing",
          status: "installed",
          storageIdentity: "app:missing",
        },
      },
    );

    await postAdminJson<OperationInvocationResponse>(createAppInstallOperation, {
      idempotencyKey: "create-tasks",
      input: {
        packageAppKey: "tasks",
        installId: "tasks",
        label: "Tasks",
      },
    });

    const unsupportedPublicRoute = await postAdminJson<FailureResponse>(
      `${controlPlaneApi}/operations/route/create`,
      {
        idempotencyKey: "tasks-public-route",
        input: {
          enabled: true,
          matchPath: "/sites/tasks",
          matchPrefix: "/sites/tasks/",
          kind: "mount",
          targetProfile: "public-site",
          appInstall: "tasks",
          surface: "public-site",
          access: "anonymous",
        },
      },
    );

    expect(missingPackage.response.status).toBe(400);
    expect(missingPackage.body.error).toBe('App install package "missing-package" is unsupported.');
    expect(unsupportedPublicRoute.response.status).toBe(400);
    expect(unsupportedPublicRoute.body.error).toBe(
      'Package app "tasks" does not support public Site routes.',
    );
  });

  it("validates public Site route capability through the active package resolver", async () => {
    const sourceSchemaHash = await computeSourceSchemaHash(siteSourceSchema);
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
              manifest: privatePublicSitePackageManifest(sourceSchemaHash),
              sourceSchema: siteSourceSchema,
              seedRecords: siteSeedRecords,
            },
          ]),
        },
      },
    );

    try {
      const install = await postHarnessAdminJson<OperationInvocationResponse>(
        privateHarness,
        createAppInstallOperation,
        {
          idempotencyKey: "private-site-install",
          input: {
            packageAppKey: "private-site",
            label: "Private Site",
            installId: "private-site",
          },
        },
      );
      const route = await postHarnessAdminJson<OperationInvocationResponse>(
        privateHarness,
        `${controlPlaneApi}/operations/route/create`,
        {
          idempotencyKey: "private-site-public-route",
          input: {
            enabled: true,
            matchPath: "/sites/private-site-alt",
            matchPrefix: "/sites/private-site-alt/",
            kind: "mount",
            targetProfile: "public-site",
            appInstall: "private-site",
            surface: "public-site",
            access: "anonymous",
          },
        },
      );

      expect(install.response.status).toBe(200);
      expect(install.body.status).toBe("committed");
      expect(route.response.status).toBe(200);
      expect(operationRecord(route).values).toMatchObject({
        appInstall: "private-site",
        surface: "public-site",
      });
    } finally {
      await privateHarness.dispose();
    }
  });

  it("commits generated route and deployment config management writes through operation routes", async () => {
    await postAdminJson<OperationInvocationResponse>(createAppInstallOperation, {
      idempotencyKey: "create-operation-managed-site",
      input: {
        packageAppKey: "site",
        installId: "operation-managed-site",
        label: "Operation Managed Site",
      },
    });

    const deploymentConfig = await postAdminJson<OperationInvocationResponse>(
      `${controlPlaneApi}/operations/deployment-config/create`,
      {
        idempotencyKey: "operation-deployment-config-create",
        input: {
          targetId: "instance.primary",
          targetKind: "instance",
          label: "Primary",
          enabled: true,
          targetUrl: "https://operation-managed.example.workers.dev",
          providerFamily: "cloudflare",
          accountId: "account-123",
          workerName: "operation-managed",
          credentialRef: "secret:cloudflare:primary",
        },
      },
    );
    const deploymentConfigRecord = operationRecord(deploymentConfig);
    const route = await postAdminJson<OperationInvocationResponse>(
      `${controlPlaneApi}/operations/route/create`,
      {
        idempotencyKey: "operation-route-create",
        input: {
          enabled: true,
          matchHost: "operation-managed.example.com",
          matchPath: "/",
          matchPrefix: "/",
          kind: "mount",
          targetProfile: "public-site",
          appInstall: "operation-managed-site",
          surface: "public-site",
          access: "anonymous",
          deploymentConfig: deploymentConfigRecord.id,
        },
      },
    );
    const routePatch = await postAdminJson<OperationInvocationResponse>(
      `${controlPlaneApi}/operations/route/update`,
      {
        idempotencyKey: "operation-route-update",
        recordId: operationRecord(route).id,
        input: {
          enabled: false,
          deploymentConfig: deploymentConfigRecord.id,
        },
      },
    );
    const deploymentPatch = await postAdminJson<OperationInvocationResponse>(
      `${controlPlaneApi}/operations/deployment-config/update`,
      {
        idempotencyKey: "operation-deployment-config-update",
        recordId: deploymentConfigRecord.id,
        input: {
          label: "Primary Cloudflare",
          enabled: false,
        },
      },
    );

    expect(deploymentConfig.response.status).toBe(200);
    expect(deploymentConfig.body.invocation.operation.canonicalKey).toBe(
      "deployment-config.create",
    );
    expect(deploymentConfigRecord.values).toMatchObject({
      targetId: "instance.primary",
      providerFamily: "cloudflare",
    });
    expect(route.response.status).toBe(200);
    expect(route.body.invocation.operation.canonicalKey).toBe("route.create");
    expect(operationRecord(route).values).toMatchObject({
      deploymentConfig: deploymentConfigRecord.id,
      appInstall: "operation-managed-site",
    });
    expect(routePatch.body.invocation.operation.canonicalKey).toBe("route.update");
    expect(operationRecord(routePatch).values).toMatchObject({
      enabled: false,
      deploymentConfig: deploymentConfigRecord.id,
    });
    expect(deploymentPatch.body.invocation.operation.canonicalKey).toBe("deployment-config.update");
    expect(operationRecord(deploymentPatch).values).toMatchObject({
      label: "Primary Cloudflare",
      enabled: false,
    });
    expect(operationRecord(deploymentPatch).values).not.toHaveProperty("observedStatus");
  });

  it("leaves legacy route intent records inert without deployment execution history records", async () => {
    const now = "2026-06-02T00:00:00.000Z";
    const restored = await postAdminJson<BootstrapResponse>(
      `${controlPlaneApi}/snapshot/restore`,
      legacyRouteIntentSnapshot(now, [
        legacyAppInstallRecord("personal", now),
        legacyAppRouteRecord("legacy:personal:admin", {
          appInstall: "personal",
          routeKind: "admin",
          path: "/apps/personal-legacy",
          enabled: true,
          createdAt: now,
          updatedAt: now,
        }),
        legacyDomainMappingRecord("legacy:domain:www.example.com", {
          host: "www.example.com",
          profile: "publicSite",
          targetInstallId: "personal",
          enabled: true,
          createdAt: now,
          updatedAt: now,
        }),
        legacyRedirectIntentRecord("legacy:redirect:old.example.com", {
          fromHost: "old.example.com",
          toHost: "www.example.com",
          statusCode: "308",
          preservePath: true,
          preserveQueryString: false,
          enabled: true,
          createdAt: now,
          updatedAt: now,
        }),
      ]),
    );
    const controlPlane = await getJson<BootstrapResponse>(`${controlPlaneApi}/bootstrap`);
    const routes = controlPlane.body.records
      .filter((record) => record.entity === "route")
      .sort((left, right) => left.id.localeCompare(right.id));

    expect(restored.response.status).toBe(200);
    expect(routes).toEqual([]);
    expect(JSON.stringify(routes)).not.toContain("worker-domain-1");
    expect(JSON.stringify(routes)).not.toContain("affectedLogicalIdsJson");
    expect(controlPlane.body.records.map((record) => record.entity)).not.toContain(
      "deploy-attempt",
    );
    expect(controlPlane.body.records.map((record) => record.entity)).not.toContain(
      "deploy-evidence-summary",
    );
    expect(controlPlane.body.records.map((record) => record.entity)).not.toContain(
      "deploy-drift-report",
    );
    expect(
      controlPlane.body.records
        .filter((record) =>
          ["app-route", "domain-mapping", "redirect-intent"].includes(record.entity),
        )
        .map((record) => record.id)
        .sort(),
    ).toEqual([
      "legacy:domain:www.example.com",
      "legacy:personal:admin",
      "legacy:redirect:old.example.com",
    ]);
  });

  it("does not convert conflicting legacy route intent records into active routes", async () => {
    const now = "2026-06-02T00:00:00.000Z";
    const restored = await postAdminJson<BootstrapResponse>(
      `${controlPlaneApi}/snapshot/restore`,
      legacyRouteIntentSnapshot(now, [
        legacyAppInstallRecord("personal", now),
        routeRecord("route:reserved", {
          enabled: true,
          matchPath: "/apps/personal",
          kind: "mount",
          targetProfile: "instance",
          surface: "admin",
          access: "owner",
          createdAt: now,
          updatedAt: now,
        }),
        legacyAppRouteRecord("legacy:personal:admin", {
          appInstall: "personal",
          routeKind: "admin",
          path: "/apps/personal",
          enabled: true,
          createdAt: now,
          updatedAt: now,
        }),
      ]),
    );

    expect(restored.response.status).toBe(200);

    const bootstrap = await harness.fetch(`${controlPlaneApi}/bootstrap`, {
      headers: adminHeaders(),
    });
    const body = (await bootstrap.json()) as BootstrapResponse;

    expect(bootstrap.status).toBe(200);
    expect(body.records.filter((record) => record.entity === "route")).toEqual([
      expect.objectContaining({ id: "route:reserved" }),
    ]);
    expect(body.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity: "app-route",
          id: "legacy:personal:admin",
        }),
      ]),
    );
  });

  it("enforces owner/admin writes and rejects runner-only access to install creation", async () => {
    const unauthenticated = await postJson<FailureResponse>(createAppInstallOperation, {
      idempotencyKey: "create-private",
      input: {
        packageAppKey: "site",
        installId: "private",
        label: "Private",
      },
    });
    const runner = await postAdminJson<FailureResponse>(
      createAppInstallOperation,
      {
        idempotencyKey: "create-runner",
        input: {
          packageAppKey: "site",
          installId: "runner",
          label: "Runner",
        },
      },
      { actorKind: "runner" },
    );
    const runnerMutation = await postAdminJson<FailureResponse>(
      `${controlPlaneApi}/operations/app-install/create`,
      {
        idempotencyKey: "runner-install",
        input: {
          installId: "runner",
          packageAppKey: "site",
          label: "Runner",
          status: "installed",
          storageIdentity: "app:runner",
        },
      },
      { actorKind: "runner" },
    );

    expect(unauthenticated.response.status).toBe(401);
    expect(unauthenticated.body.error).toBe(
      "Owner session or admin authorization is required for this write endpoint.",
    );
    expect(runner.response.status).toBe(400);
    expect(runner.body.error).toBe(
      'Operation "app-install.createAppInstall" is not exposed to actor "runner".',
    );
    expect(runnerMutation.response.status).toBe(400);
    expect(runnerMutation.body.error).toBe(
      'Control-plane entityOperation writes are not exposed to actor "runner".',
    );
  });

  it("allows secret references but rejects secret values in records and snapshot restore", async () => {
    const now = "2026-05-28T00:00:00.000Z";
    const deploymentConfig = await postAdminJson<OperationInvocationResponse>(
      `${controlPlaneApi}/operations/deployment-config/create`,
      {
        idempotencyKey: "deployment-config",
        input: {
          targetId: "instance.primary",
          targetKind: "instance",
          label: "Cloudflare",
          enabled: true,
          targetUrl: "https://instance.example.workers.dev",
          providerFamily: "cloudflare",
          credentialRef: "secret:cloudflare:primary",
        },
      },
    );
    const rejectedRecord = await postAdminJson<FailureResponse>(
      `${controlPlaneApi}/operations/deployment-config/create`,
      {
        idempotencyKey: "secret-deployment-config",
        input: {
          targetId: "instance.secret",
          targetKind: "instance",
          label: "Secret",
          enabled: true,
          targetUrl: "https://secret.example.workers.dev",
          providerFamily: "cloudflare",
          accountId: "CF_API_TOKEN",
        },
      },
    );
    const rejectedSnapshot = await postAdminJson<FailureResponse>(
      `${controlPlaneApi}/snapshot/restore`,
      secretSnapshot(now),
    );
    const browserBootstrap = await getJson<BootstrapResponse>(
      `${controlPlaneApi}/bootstrap?actorKind=owner`,
    );

    expect(deploymentConfig.response.status).toBe(200);
    expect(operationRecord(deploymentConfig).values.credentialRef).toBe(
      "secret:cloudflare:primary",
    );
    expect(JSON.stringify(browserBootstrap.body)).not.toContain("CF_API_TOKEN");
    expect(JSON.stringify(browserBootstrap.body)).not.toContain("ALCHEMY_PASSWORD");
    expect(rejectedRecord.response.status).toBe(400);
    expect(rejectedRecord.body.error).toBe(
      'Field "deployment-config.accountId" cannot store control-plane secret values.',
    );
    expect(rejectedSnapshot.response.status).toBe(400);
    expect(rejectedSnapshot.body.error).toBe(
      'Field "app-install.label" cannot store control-plane secret values.',
    );
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

async function postAdminJson<T>(path: string, body: unknown, options: { actorKind?: string } = {}) {
  return postJson<T>(path, body, {
    ...adminHeaders(),
    ...(options.actorKind === undefined
      ? {}
      : { "X-Formless-Control-Plane-Actor": options.actorKind }),
  });
}

async function postJson<T>(path: string, body: unknown, headers: Record<string, string> = {}) {
  const request = operationWriteRequest(path, body);
  const response = await harness.fetch(request.path, {
    body: JSON.stringify(request.body),
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const bodyJson = await response.json();

  return {
    body: (response.ok ? request.response(bodyJson) : bodyJson) as T,
    response,
  };
}

async function postInstalledAppMutation(
  packageAppKey: string,
  installId: string,
  body: Parameters<typeof mutationOperationRequest>[0],
) {
  const request = mutationOperationRequest(body);
  const response = await harness.fetch(
    `/api/app-installs/${packageAppKey}/${installId}${request.path.slice("/api".length)}`,
    {
      body: JSON.stringify(request.body),
      headers: {
        ...adminHeaders(),
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );
  const bodyJson = await response.json();

  return {
    body: request.response(bodyJson),
    response,
  };
}

async function postHarnessAdminJson<T>(targetHarness: Harness, path: string, body: unknown) {
  const request = operationWriteRequest(path, body);
  const response = await targetHarness.fetch(request.path, {
    body: JSON.stringify(request.body),
    headers: {
      ...adminHeaders(),
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const bodyJson = await response.json();

  return {
    body: (response.ok ? request.response(bodyJson) : bodyJson) as T,
    response,
  };
}

async function resetWorkerState() {
  try {
    await resetKnownState();
  } catch {
    await harness.dispose();
    harness = await createHarness();
    await resetKnownState();
  }
}

async function resetKnownState() {
  await Promise.all([
    postReset(`${controlPlaneApi}/reset/seed`),
    postReset("/api/app-installs/site/personal/reset/seed"),
    postReset("/api/app-installs/site/work/reset/seed"),
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
    request: new Request("http://example.com/"),
  });

  return {
    Cookie: cookiePair(created.cookie),
  };
}

function cookiePair(cookie: string) {
  return cookie.split(";")[0] ?? cookie;
}

function appInstallValues(
  bootstrap: BootstrapResponse,
  installId: string,
): InstanceControlPlaneAppInstallValues | undefined {
  return bootstrap.records.find(
    (record) => record.id === installId && record.entity === "app-install",
  )?.values as InstanceControlPlaneAppInstallValues | undefined;
}

function routeValues(bootstrap: BootstrapResponse): InstanceControlPlaneRouteValues[] {
  return bootstrap.records
    .filter((record) => record.entity === "route")
    .map((record) => record.values as InstanceControlPlaneRouteValues);
}

function operationRecord(response: { body: OperationInvocationResponse }) {
  const output = response.body.output;

  if (output === undefined) {
    throw new Error(`Expected operation response, received ${JSON.stringify(response.body)}.`);
  }

  if (output.type !== "create" && output.type !== "update") {
    throw new Error(`Expected create or update operation output, received "${output.type}".`);
  }

  return output.record;
}

function operationCommandResponse(response: { body: OperationInvocationResponse }): ActionResponse {
  const output = response.body.output;

  if (output.type !== "command") {
    throw new Error(`Expected command operation output, received "${output.type}".`);
  }

  return output.response;
}

function secretSnapshot(now: string): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
    schemaKey: "instance-control-plane",
    exportedAt: now,
    schemaUpdatedAt: now,
    sourceCursor: 0,
    schema: instanceControlPlaneSchema,
    records: [
      {
        id: "secret",
        entity: "app-install",
        createdAt: now,
        updatedAt: now,
        values: {
          installId: "secret",
          packageAppKey: "site",
          label: "CF_API_TOKEN=hidden",
          status: "installed",
          storageIdentity: "app:secret",
        },
      },
    ],
  };
}

function legacyRouteIntentSnapshot(now: string, records: StoredRecord[]): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
    schemaKey: "instance-control-plane",
    exportedAt: now,
    schemaUpdatedAt: now,
    sourceCursor: 0,
    schema: legacyRouteIntentSchema(),
    records,
  };
}

function legacyRouteIntentSchema(): AppSchema {
  return {
    ...instanceControlPlaneSchema,
    entities: {
      ...instanceControlPlaneSchema.entities,
      "app-route": {
        label: "App route",
        fields: {
          appInstall: referenceField("App install", "app-install", "label"),
          routeKind: enumField("Route kind", {
            admin: "Admin",
            publicSite: "Public Site",
          }),
          path: textField("Path"),
          prefix: optionalTextField("Prefix"),
          enabled: booleanField("Enabled", true),
          createdAt: textField("Created at"),
          updatedAt: textField("Updated at"),
        },
        mutations: legacyEditableMutations,
      },
      "domain-mapping": {
        label: "Domain mapping",
        fields: {
          host: textField("Host"),
          profile: enumField("Profile", {
            app: "App",
            instance: "Instance",
            publicSite: "Public Site",
          }),
          targetInstallId: optionalTextField("Target install id"),
          enabled: booleanField("Enabled", true),
          createdAt: textField("Created at"),
          updatedAt: textField("Updated at"),
        },
        mutations: legacyEditableMutations,
      },
      "redirect-intent": {
        label: "Redirect intent",
        fields: {
          fromHost: textField("From host"),
          toHost: optionalTextField("To host"),
          toUrl: optionalTextField("To URL"),
          statusCode: enumField("Status code", {
            "301": "301",
            "302": "302",
            "303": "303",
            "307": "307",
            "308": "308",
          }),
          preservePath: booleanField("Preserve path", true),
          preserveQueryString: booleanField("Preserve query string", true),
          enabled: booleanField("Enabled", true),
          createdAt: textField("Created at"),
          updatedAt: textField("Updated at"),
        },
        mutations: legacyEditableMutations,
      },
    },
  } as AppSchema;
}

const legacyEditableMutations = {
  create: { enabled: true },
  patch: { enabled: true },
  delete: { enabled: false },
} satisfies EntityMutationPolicy;

function privatePublicSitePackageManifest(sourceSchemaHash: SourceSchemaHash): AppPackageManifest {
  return {
    kind: appPackageManifestKind,
    version: appPackageManifestVersion,
    packageAppKey: "private-site",
    label: "Private Site",
    description: "Private workspace Site package.",
    defaultInstallId: "private-site",
    supportsMultipleInstalls: true,
    packageRevision: 7,
    sourceSchema: {
      kind: "workspace",
      key: "private-site",
      path: "packages/private-site/schema.json",
    },
    seedRecords: {
      kind: "workspace",
      key: "private-site",
      path: "packages/private-site/seed-records.json",
    },
    sourceSchemaHash,
    capabilities: [
      { kind: "generatedAdmin", routeBase: "/apps" },
      { kind: "publicSite", routeBase: "/sites" },
    ],
  };
}

function legacyAppInstallRecord(installId: string, now: string): StoredRecord {
  return {
    id: installId,
    entity: "app-install",
    createdAt: now,
    updatedAt: now,
    values: {
      installId,
      packageAppKey: "site",
      packageRevision: 1,
      sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
      label: "Personal Site",
      status: "installed",
      storageIdentity: `app:${installId}`,
    },
  };
}

function legacyAppRouteRecord(id: string, values: StoredRecord["values"]): StoredRecord {
  return {
    id,
    entity: "app-route",
    createdAt: String(values.createdAt),
    updatedAt: String(values.updatedAt ?? values.createdAt),
    values,
  };
}

function legacyDomainMappingRecord(id: string, values: StoredRecord["values"]): StoredRecord {
  return {
    id,
    entity: "domain-mapping",
    createdAt: String(values.createdAt),
    updatedAt: String(values.updatedAt ?? values.createdAt),
    values,
  };
}

function legacyRedirectIntentRecord(id: string, values: StoredRecord["values"]): StoredRecord {
  return {
    id,
    entity: "redirect-intent",
    createdAt: String(values.createdAt),
    updatedAt: String(values.updatedAt ?? values.createdAt),
    values,
  };
}

function routeRecord(id: string, values: StoredRecord["values"]): StoredRecord {
  const recordValues = withoutLifecycleValues(values);

  return {
    id,
    entity: "route",
    createdAt: String(values.createdAt),
    updatedAt: String(values.updatedAt ?? values.createdAt),
    values: recordValues,
  };
}

function withoutLifecycleValues(values: StoredRecord["values"]): StoredRecord["values"] {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([fieldName]) => fieldName !== "createdAt" && fieldName !== "updatedAt",
    ),
  ) as StoredRecord["values"];
}

function textField(label: string) {
  return { type: "text", required: true, label };
}

function optionalTextField(label: string) {
  return { type: "text", required: false, label };
}

function booleanField(label: string, defaultValue: boolean) {
  return { type: "boolean", required: true, label, default: defaultValue };
}

function enumField(label: string, values: Record<string, string>) {
  return {
    type: "enum",
    required: true,
    label,
    values: Object.fromEntries(
      Object.entries(values).map(([value, valueLabel]) => [value, { label: valueLabel }]),
    ),
  };
}

function referenceField(label: string, to: string, displayField: string) {
  return { type: "reference", required: true, label, to, displayField };
}
