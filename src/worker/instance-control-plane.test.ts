import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  instanceControlPlaneSchema,
  type InstanceControlPlaneAppInstallValues,
  type InstanceControlPlaneAppRouteValues,
} from "../shared/instance-control-plane.ts";
import type {
  ActionResponse,
  AppInstallsResponse,
  BootstrapResponse,
  MutationResponse,
  StoreSnapshot,
  SyncResponse,
} from "../shared/protocol.ts";
import { siteSeedRecords, siteSourceSchema } from "../test/schema-apps.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

type FailureResponse = {
  code?: string;
  error: string;
  field?: string;
};

const adminToken = "test-admin-token";
const controlPlaneApi = "/api/formless/control-plane";

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

describe("instance control-plane API routes", () => {
  it("bootstraps the runtime-owned control-plane storage identity for safe query actors", async () => {
    const runnerBootstrap = await getJson<BootstrapResponse>(
      `${controlPlaneApi}/bootstrap?actorKind=runner`,
    );
    const ownerSchema = await getJson<{
      schema: typeof instanceControlPlaneSchema;
      updatedAt: string;
    }>(`${controlPlaneApi}/schema`);

    expect(runnerBootstrap.body.schema).toEqual(instanceControlPlaneSchema);
    expect(runnerBootstrap.body.records).toEqual([]);
    expect(runnerBootstrap.body.cursor).toBe(0);
    expect(ownerSchema.body.schema).toEqual(instanceControlPlaneSchema);
    expect(ownerSchema.response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("creates app install and default route records as one idempotent control-plane action", async () => {
    const created = await postAdminJson<ActionResponse>(
      `${controlPlaneApi}/actions/createAppInstall`,
      {
        actionId: "action-create-personal",
        input: {
          packageAppKey: "site",
          installId: "personal",
          label: "Personal Site",
        },
      },
    );
    const replay = await postAdminJson<ActionResponse>(
      `${controlPlaneApi}/actions/createAppInstall`,
      {
        actionId: "action-create-personal",
        input: {
          packageAppKey: "site",
          installId: "personal",
          label: "Personal Site",
        },
      },
    );
    const controlPlane = await getJson<BootstrapResponse>(`${controlPlaneApi}/bootstrap`);
    const installedSite = await getJson<BootstrapResponse>(
      "/api/app-installs/site/personal/bootstrap",
    );

    expect(created.response.status).toBe(201);
    expect(created.body.cursor).toBe(4);
    expect(created.body.changes.map((change) => change.payload.id)).toEqual([
      "personal",
      "app-route:personal:admin",
      "app-route:personal:schema",
      "app-route:personal:publicSite",
    ]);
    expect(replay.response.status).toBe(200);
    expect(replay.body).toEqual(created.body);
    expect(installedSite.body.schema).toEqual(siteSourceSchema);
    expect(installedSite.body.records).toEqual(siteSeedRecords);
    expect(controlPlane.body.records).toHaveLength(4);
    expect(appInstallValues(controlPlane.body, "personal")).toMatchObject({
      installId: "personal",
      packageAppKey: "site",
      label: "Personal Site",
      storageIdentity: "app:personal",
    });
    expect(routeValues(controlPlane.body).map((route) => route.path)).toEqual([
      "/apps/personal",
      "/apps/personal/schema",
      "/sites/personal",
    ]);
    expect(JSON.stringify(controlPlane.body.records)).not.toContain("block-placement");
  });

  it("keeps control-plane records isolated from installed app storage writes", async () => {
    await postAdminJson<ActionResponse>(`${controlPlaneApi}/actions/createAppInstall`, {
      actionId: "action-create-work",
      input: {
        packageAppKey: "site",
        installId: "work",
        label: "Work Site",
      },
    });
    const appMutation = await postAdminJson<MutationResponse>(
      "/api/app-installs/site/work/mutations",
      {
        mutationId: "mutation-installed-site-page",
        entity: "block",
        op: "create",
        values: {
          type: "page",
          label: "Installed only",
          href: "/installed-only",
        },
      },
    );
    const controlPlane = await getJson<BootstrapResponse>(`${controlPlaneApi}/bootstrap`);
    const sync = await getJson<SyncResponse>(`${controlPlaneApi}/sync?after=0`);

    expect(appMutation.body.record.entity).toBe("block");
    expect(controlPlane.body.records.map((record) => record.entity)).toEqual([
      "app-install",
      "app-route",
      "app-route",
      "app-route",
    ]);
    expect(JSON.stringify(sync.body)).not.toContain(appMutation.body.record.id);
  });

  it("rejects invalid route edits through real control-plane records", async () => {
    await postAdminJson<ActionResponse>(`${controlPlaneApi}/actions/createAppInstall`, {
      actionId: "action-create-route-validation",
      input: {
        packageAppKey: "site",
        installId: "personal",
        label: "Personal Site",
      },
    });
    const before = await getJson<AppInstallsResponse>("/api/formless/app-installs");

    const reservedPath = await postAdminJson<FailureResponse>(`${controlPlaneApi}/mutations`, {
      mutationId: "mutation-route-reserved-path",
      entity: "app-route",
      op: "patch",
      recordId: "app-route:personal:admin",
      values: {
        path: "/api/jobs",
        updatedAt: "2026-05-28T00:00:00.000Z",
      },
    });
    const duplicateEnabledPath = await postAdminJson<FailureResponse>(
      `${controlPlaneApi}/mutations`,
      {
        mutationId: "mutation-route-duplicate-path",
        entity: "app-route",
        op: "patch",
        recordId: "app-route:personal:schema",
        values: {
          path: "/apps/personal",
          updatedAt: "2026-05-28T00:00:01.000Z",
        },
      },
    );
    const after = await getJson<AppInstallsResponse>("/api/formless/app-installs");

    expect(before.body.installs[0]).toMatchObject({
      adminRoute: "/apps/personal",
      installId: "personal",
      schemaRoute: "/apps/personal/schema",
    });
    expect(reservedPath.response.status).toBe(400);
    expect(reservedPath.body.error).toBe('Field "path" must be a route-safe path.');
    expect(duplicateEnabledPath.response.status).toBe(400);
    expect(duplicateEnabledPath.body.error).toBe(
      'Enabled route path "/apps/personal" is already in use.',
    );
    expect(after.body.installs).toEqual(before.body.installs);
  });

  it("enforces owner/admin writes and rejects runner-only access to install creation", async () => {
    const unauthenticated = await postJson<FailureResponse>(
      `${controlPlaneApi}/actions/createAppInstall`,
      {
        actionId: "action-create-private",
        input: {
          packageAppKey: "site",
          installId: "private",
          label: "Private",
        },
      },
    );
    const runner = await postAdminJson<FailureResponse>(
      `${controlPlaneApi}/actions/createAppInstall`,
      {
        actionId: "action-create-runner",
        input: {
          packageAppKey: "site",
          installId: "runner",
          label: "Runner",
        },
      },
      { actorKind: "runner" },
    );
    const runnerMutation = await postAdminJson<FailureResponse>(
      `${controlPlaneApi}/mutations`,
      {
        mutationId: "mutation-runner-install",
        entity: "app-install",
        op: "create",
        values: {
          installId: "runner",
          packageAppKey: "site",
          label: "Runner",
          status: "installed",
          storageIdentity: "app:runner",
          createdAt: "2026-05-28T00:00:00.000Z",
          updatedAt: "2026-05-28T00:00:00.000Z",
        },
      },
      { actorKind: "runner" },
    );

    expect(unauthenticated.response.status).toBe(401);
    expect(unauthenticated.body.error).toBe(
      "Owner session or admin authorization is required for this write endpoint.",
    );
    expect(runner.response.status).toBe(400);
    expect(runner.body.error).toBe('Action "createAppInstall" is not exposed to actor "runner".');
    expect(runnerMutation.response.status).toBe(400);
    expect(runnerMutation.body.error).toBe(
      'Control-plane mutation writes are not exposed to actor "runner".',
    );
  });

  it("allows secret references but rejects secret values in records and snapshot restore", async () => {
    const now = "2026-05-28T00:00:00.000Z";
    const providerConfig = await postAdminJson<MutationResponse>(`${controlPlaneApi}/mutations`, {
      mutationId: "mutation-provider-ref",
      entity: "provider-config-ref",
      op: "create",
      values: {
        providerFamily: "cloudflare",
        configRef: "cloudflare-primary",
        label: "Cloudflare",
        secretRef: "secret:cloudflare:primary",
        createdAt: now,
        updatedAt: now,
      },
    });
    const target = await postAdminJson<MutationResponse>(`${controlPlaneApi}/mutations`, {
      mutationId: "mutation-target",
      entity: "deploy-target",
      op: "create",
      values: {
        targetId: "instance",
        targetKind: "instance",
        label: "Instance",
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
    });
    const rejectedRecord = await postAdminJson<FailureResponse>(`${controlPlaneApi}/mutations`, {
      mutationId: "mutation-secret-resource",
      entity: "deploy-desired-resource",
      op: "create",
      values: {
        deployTarget: target.body.record.id,
        logicalId: "secret-resource",
        kind: "cloudflare-dns-records",
        providerFamily: "cloudflare",
        inputsJson: JSON.stringify({ apiToken: "CF_API_TOKEN" }),
        enabled: true,
        sourceFingerprint: "source:secret",
        createdAt: now,
        updatedAt: now,
      },
    });
    const rejectedSnapshot = await postAdminJson<FailureResponse>(
      `${controlPlaneApi}/snapshot/restore`,
      secretSnapshot(now),
    );
    const browserBootstrap = await getJson<BootstrapResponse>(
      `${controlPlaneApi}/bootstrap?actorKind=owner`,
    );

    expect(providerConfig.response.status).toBe(200);
    expect(providerConfig.body.record.values.secretRef).toBe("secret:cloudflare:primary");
    expect(JSON.stringify(browserBootstrap.body)).not.toContain("CF_API_TOKEN");
    expect(JSON.stringify(browserBootstrap.body)).not.toContain("ALCHEMY_PASSWORD");
    expect(rejectedRecord.response.status).toBe(400);
    expect(rejectedRecord.body.error).toBe(
      'Field "deploy-desired-resource.inputsJson" cannot store control-plane secret values.',
    );
    expect(rejectedSnapshot.response.status).toBe(400);
    expect(rejectedSnapshot.body.error).toBe(
      'Field "app-install.label" cannot store control-plane secret values.',
    );
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

async function postAdminJson<T>(path: string, body: unknown, options: { actorKind?: string } = {}) {
  return postJson<T>(path, body, {
    Authorization: `Bearer ${adminToken}`,
    ...(options.actorKind === undefined
      ? {}
      : { "X-Formless-Control-Plane-Actor": options.actorKind }),
  });
}

async function postJson<T>(path: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await harness.fetch(path, {
    body: JSON.stringify(body),
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  return {
    body: (await response.json()) as T,
    response,
  };
}

function appInstallValues(
  bootstrap: BootstrapResponse,
  installId: string,
): InstanceControlPlaneAppInstallValues | undefined {
  return bootstrap.records.find(
    (record) => record.id === installId && record.entity === "app-install",
  )?.values as InstanceControlPlaneAppInstallValues | undefined;
}

function routeValues(bootstrap: BootstrapResponse): InstanceControlPlaneAppRouteValues[] {
  return bootstrap.records
    .filter((record) => record.entity === "app-route")
    .map((record) => record.values as InstanceControlPlaneAppRouteValues);
}

function secretSnapshot(now: string): StoreSnapshot {
  return {
    kind: "formless.storeSnapshot",
    version: 1,
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
        values: {
          installId: "secret",
          packageAppKey: "site",
          label: "CF_API_TOKEN=hidden",
          status: "installed",
          storageIdentity: "app:secret",
          createdAt: now,
          updatedAt: now,
        },
      },
    ],
  };
}
