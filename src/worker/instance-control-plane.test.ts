import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  instanceControlPlaneSchema,
  type InstanceControlPlaneAppInstallValues,
  type InstanceControlPlaneRouteValues,
} from "../shared/instance-control-plane.ts";
import type {
  ActionResponse,
  AppInstallsResponse,
  BootstrapResponse,
  MutationResponse,
  StoreSnapshot,
  StoredRecord,
  SyncResponse,
} from "../shared/protocol.ts";
import type { AppSchema, EntityMutationPolicy } from "@dpeek/formless-schema";
import { bundledSourceSchemaHashFixtures } from "../shared/upgrade-migrations.ts";
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
      "route:personal:admin",
      "route:personal:schema",
      "route:personal:public-site",
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
    expect(routeValues(controlPlane.body).map((route) => route["matchPath"])).toEqual([
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
      "route",
    ]);
    expect(JSON.stringify(controlPlane.body.records)).not.toContain("Installed only");
    expect(JSON.stringify(sync.body)).not.toContain(appMutation.body.record.id);
  });

  it("derives installed app API summaries from real control-plane route records", async () => {
    await postAdminJson<ActionResponse>(`${controlPlaneApi}/actions/createAppInstall`, {
      actionId: "action-create-route-validation",
      input: {
        packageAppKey: "site",
        installId: "personal",
        label: "Personal Site",
      },
    });
    const before = await getJson<AppInstallsResponse>("/api/formless/app-installs");

    const routeEdit = await postAdminJson<MutationResponse>(`${controlPlaneApi}/mutations`, {
      mutationId: "mutation-route-edit",
      entity: "route",
      op: "patch",
      recordId: "route:personal:admin",
      values: {
        matchPath: "/apps/personal-admin",
        updatedAt: "2026-05-28T00:00:00.000Z",
      },
    });
    const after = await getJson<AppInstallsResponse>("/api/formless/app-installs");

    expect(before.body.installs[0]).toMatchObject({
      adminRoute: "/apps/personal",
      installId: "personal",
      schemaRoute: "/apps/personal/schema",
    });
    expect(routeEdit.response.status).toBe(200);
    expect(after.body.installs[0]).toMatchObject({
      adminRoute: "/apps/personal-admin",
      installId: "personal",
      schemaRoute: "/apps/personal/schema",
    });
  });

  it("backfills legacy route intent records without deployment execution history records", async () => {
    const now = "2026-06-02T00:00:00.000Z";
    const restored = await postAdminJson<BootstrapResponse>(
      `${controlPlaneApi}/snapshot/restore`,
      legacyRouteIntentSnapshot(now, [
        legacyAppInstallRecord("personal", now),
        legacyProviderConfigRecord(now),
        legacyDeployTargetRecord(now),
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
          providerConfigRef: "provider-config:cloudflare:primary",
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
          providerConfigRef: "provider-config:cloudflare:primary",
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
    expect(routes).toEqual([
      expect.objectContaining({
        id: "route:host:publicSite:www.example.com",
        values: expect.objectContaining({
          appInstall: "personal",
          enabled: true,
          kind: "mount",
          matchHost: "www.example.com",
          matchPath: "/",
          matchPrefix: "/",
          providerConfig: "provider-config:cloudflare:primary",
          surface: "public-site",
          targetProfile: "public-site",
        }),
      }),
      expect.objectContaining({
        id: "route:personal:admin",
        values: expect.objectContaining({
          appInstall: "personal",
          enabled: true,
          kind: "mount",
          matchPath: "/apps/personal-legacy",
          surface: "admin",
          targetProfile: "app",
        }),
      }),
      expect.objectContaining({
        id: "route:redirect:old.example.com",
        values: expect.objectContaining({
          enabled: true,
          kind: "redirect",
          matchHost: "old.example.com",
          matchPath: "/",
          matchPrefix: "/",
          preservePath: true,
          preserveQueryString: false,
          providerConfig: "provider-config:cloudflare:primary",
          statusCode: "308",
          toHost: "www.example.com",
        }),
      }),
    ]);
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

  it("reports legacy route migration blockers before conflicting routes become active", async () => {
    const now = "2026-06-02T00:00:00.000Z";
    await postAdminJson<BootstrapResponse>(
      `${controlPlaneApi}/snapshot/restore`,
      legacyRouteIntentSnapshot(now, [
        legacyAppInstallRecord("personal", now),
        routeRecord("route:reserved", {
          enabled: true,
          matchPath: "/apps/personal",
          kind: "mount",
          targetProfile: "instance",
          surface: "admin",
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

    const blocked = await harness.fetch(`${controlPlaneApi}/bootstrap`);
    const body = (await blocked.json()) as FailureResponse;

    expect(blocked.status).toBe(400);
    expect(body.error).toBe(
      'Legacy route migration blocker: legacy app-route "legacy:personal:admin" match "<hostless>/apps/personal" conflicts with route "route:reserved".',
    );
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
        targetUrl: "https://instance.example.workers.dev",
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

function routeValues(bootstrap: BootstrapResponse): InstanceControlPlaneRouteValues[] {
  return bootstrap.records
    .filter((record) => record.entity === "route")
    .map((record) => record.values as InstanceControlPlaneRouteValues);
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

function legacyRouteIntentSnapshot(now: string, records: StoredRecord[]): StoreSnapshot {
  return {
    kind: "formless.storeSnapshot",
    version: 1,
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
            schema: "Schema",
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
          providerConfigRef: optionalReferenceField(
            "Provider config",
            "provider-config-ref",
            "label",
          ),
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
          providerConfigRef: optionalReferenceField(
            "Provider config",
            "provider-config-ref",
            "label",
          ),
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

function legacyAppInstallRecord(installId: string, now: string): StoredRecord {
  return {
    id: installId,
    entity: "app-install",
    createdAt: now,
    values: {
      installId,
      packageAppKey: "site",
      packageRevision: 1,
      sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
      label: "Personal Site",
      status: "installed",
      storageIdentity: `app:${installId}`,
      createdAt: now,
      updatedAt: now,
    },
  };
}

function legacyProviderConfigRecord(now: string): StoredRecord {
  return {
    id: "provider-config:cloudflare:primary",
    entity: "provider-config-ref",
    createdAt: now,
    values: {
      providerFamily: "cloudflare",
      configRef: "cloudflare-primary",
      label: "Cloudflare primary",
      workerName: "formless-primary",
      secretRef: "secret:cloudflare:primary",
      createdAt: now,
      updatedAt: now,
    },
  };
}

function legacyDeployTargetRecord(now: string): StoredRecord {
  return {
    id: "instance.primary",
    entity: "deploy-target",
    createdAt: now,
    values: {
      targetId: "instance.primary",
      targetKind: "instance",
      targetUrl: "https://personal.dpeek.workers.dev",
      label: "Primary",
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
  };
}

function legacyAppRouteRecord(id: string, values: StoredRecord["values"]): StoredRecord {
  return {
    id,
    entity: "app-route",
    createdAt: String(values.createdAt),
    values,
  };
}

function legacyDomainMappingRecord(id: string, values: StoredRecord["values"]): StoredRecord {
  return {
    id,
    entity: "domain-mapping",
    createdAt: String(values.createdAt),
    values,
  };
}

function legacyRedirectIntentRecord(id: string, values: StoredRecord["values"]): StoredRecord {
  return {
    id,
    entity: "redirect-intent",
    createdAt: String(values.createdAt),
    values,
  };
}

function routeRecord(id: string, values: StoredRecord["values"]): StoredRecord {
  return {
    id,
    entity: "route",
    createdAt: String(values.createdAt),
    values,
  };
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

function optionalReferenceField(label: string, to: string, displayField: string) {
  return { type: "reference", required: false, label, to, displayField };
}
