import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";
import { listInstallableAppPackages, packageAppFactsForKey } from "@dpeek/formless-installed-apps";
import {
  INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
  INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
  instanceControlPlaneSchema,
} from "@dpeek/formless-instance-control-plane";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import {
  INSTANCE_WORKSPACE_MANIFEST_FILE as FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE,
  defaultInstanceWorkspaceManifest as defaultFormlessInstanceWorkspaceManifest,
  formatInstanceWorkspaceManifest as formatFormlessInstanceWorkspaceManifest,
} from "@dpeek/formless-workspace";
import {
  writeInstanceWorkspaceAppStorageSnapshot,
  writeInstanceWorkspaceControlPlaneStorageSnapshot,
} from "@dpeek/formless-workspace/node";

import packageJson from "../../package.json";
import {
  FORMLESS_RUNTIME_PROTOCOL_VERSION,
  FORMLESS_STORAGE_MIGRATION_SET_ID,
} from "../shared/deploy-metadata.ts";
import { bundledAppPackageResolver } from "../shared/app-packages.ts";
import { siteSourceSchema } from "../test/schema-apps.ts";
import { runDeploymentRefreshWorkspaceOperation } from "./instance-workspace-deployment-operation.ts";
import {
  runWorkspaceOperationDomainHandler,
  type WorkspaceOperationDomainExecutionResult,
} from "./instance-workspace-operation-handlers.ts";
import type { RunFormlessWorkspaceOperationDependencies } from "./instance-workspace-operations.ts";
import { runPushWorkspaceSourceOperation } from "./instance-workspace-source-sync-operation.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
});

describe("workspace source sync operation domain", () => {
  it("summarizes push dry-run plans without provider mutation dependencies", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];

    await writeWorkspaceManifest(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot);
    await writeWorkspaceAppStorageSnapshot(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    const result = await runPushWorkspaceSourceOperation(
      {
        dryRun: true,
        kind: "push",
        workspacePath: workspaceRoot,
      },
      operationDepsWithAccessGuards(
        operationDeps(tempDir, {
          accountDiscovery: {
            listAccounts: async () => [{ id: "account-123", workersDevSubdomain: "dpeek" }],
          },
          fetch: deployFetch(requests),
          packageVersion: packageJson.version,
        }),
        [
          "credentialSetup",
          "deploymentAdapter",
          "healthCheck",
          "localSecretEnv",
          "packageRoot",
          "randomToken",
          "setupCapability",
        ],
      ),
    );

    expect(result).toMatchObject({
      details: {
        applyRestore: null,
        dryRunRestore: null,
        syncPlan: {
          changedRecordCount: 0,
          changedStatePathCount: 0,
          status: "up-to-date",
        },
        target: "instance.primary",
      },
      summary: {
        fields: {
          mode: "dry-run",
          noop: true,
          sourceApps: 1,
          sourceRecords: 0,
          sync: "up-to-date",
        },
        title: "Workspace push planned",
      },
    });

    const requestPaths = requests.map(
      (request) => `${request.method} ${new URL(request.url).pathname}`,
    );

    expect(requests.every((request) => request.method === "GET")).toBe(true);
    expect(requestPaths).toContain("GET /api/formless/control-plane/snapshot");
    expect(requestPaths).toContain("GET /api/app-installs/site/david/snapshot");
    expect(requestPaths).not.toContain("POST /api/formless/archive/restore");
    expect(requestPaths).not.toContain("GET /api/formless/deployments/desired-state");
  });
});

describe("deployment refresh operation domain", () => {
  it("emits deployment summary and ordered step vocabulary from the domain module", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];

    await writeWorkspaceManifest(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    const result = await runDeploymentRefreshWorkspaceOperation(
      {
        kind: "deploymentRefresh",
        workspacePath: workspaceRoot,
      },
      operationDeps(tempDir, {
        fetch: deployFetch(requests),
      }),
    );
    const desiredState = deploymentDesiredStateRef();
    const observation = capturedRequestJson<{
      input: {
        observedDesiredStateHash: string;
        observedStatus: string;
      };
      recordId: string;
    }>(requestByPath(requests, "/api/formless/control-plane/operations/deployment-config/update"));

    expect(result).toMatchObject({
      deployment: {
        observation: {
          desiredState,
          observedStatus: "unknown",
          targetId: "instance.primary",
        },
        status: {
          state: "pending-changes",
        },
        targetAlias: "instance.primary",
      },
      summary: {
        fields: {
          desiredStateVersion: "desired.instance.primary.3",
          observedStatus: "unknown",
          status: "pending-changes",
          target: "instance.primary",
        },
        title: "Deployment observation refreshed",
      },
    });
    expect(
      result.steps?.map((step) => ({ id: step.id, label: step.label, status: step.status })),
    ).toEqual([
      { id: "credentials", label: "Credentials", status: "succeeded" },
      { id: "account-selection", label: "Account selection", status: "skipped" },
      { id: "desired-state-plan", label: "Desired-state plan", status: "succeeded" },
      {
        id: "provider-reconciliation",
        label: "Provider reconciliation",
        status: "skipped",
      },
      { id: "health-check", label: "Health check", status: "skipped" },
      { id: "owner-setup", label: "Owner setup", status: "skipped" },
      {
        id: "workspace-push-writeback",
        label: "Workspace push/writeback",
        status: "skipped",
      },
      { id: "observation-refresh", label: "Observation refresh", status: "succeeded" },
    ]);
    expect(observation).toMatchObject({
      input: {
        observedDesiredStateHash: desiredState.hash,
        observedStatus: "unknown",
      },
      recordId: "instance.primary",
    });
  });
});

describe("credential setup operation domain", () => {
  it("forwards display-safe authorization events and continuation results", async () => {
    const workspaceRoot = "/workspace/personal-sites";
    const setupInputs: unknown[] = [];

    const start = (await runWorkspaceOperationDomainHandler(
      {
        accountId: "account-123",
        kind: "credentialSetup",
        profileLabel: "Default",
        provider: "cloudflare",
      },
      operationDeps("/workspace", {
        credentialSetup: async (input) => {
          setupInputs.push(input);

          return {
            continue: async () => ({
              result: {
                details: {
                  accountId: "account-123",
                  credentialRef: "formless-cloudflare-oauth:default",
                },
                summary: {
                  fields: {
                    credentialRef: "formless-cloudflare-oauth:default",
                    provider: "cloudflare",
                    status: "ready",
                  },
                  title: "Cloudflare credentials ready",
                },
              },
              status: "succeeded",
            }),
            events: [
              {
                at: "2026-06-02T00:07:00.000Z",
                profileLabel: "Default",
                provider: "cloudflare",
                status: "waiting",
                type: "externalAuthorizationUrl",
                url: "https://dash.cloudflare.com/oauth2/authorize?client_id=formless",
              },
            ],
            result: {
              details: {
                credentialRef: "formless-cloudflare-oauth:default",
              },
              summary: {
                fields: {
                  provider: "cloudflare",
                  status: "waiting-for-authorization",
                },
                title: "Cloudflare authorization required",
              },
            },
            status: "running",
          };
        },
      }),
      { workspaceRoot },
    )) as WorkspaceOperationDomainExecutionResult;

    expect(setupInputs).toEqual([
      {
        accountId: "account-123",
        profileLabel: "Default",
        provider: "cloudflare",
        workspaceRoot,
      },
    ]);
    expect(start).toMatchObject({
      events: [
        {
          profileLabel: "Default",
          provider: "cloudflare",
          status: "waiting",
          type: "externalAuthorizationUrl",
          url: "https://dash.cloudflare.com/oauth2/authorize?client_id=formless",
        },
      ],
      logMessage: "credentialSetup awaiting authorization.",
      result: {
        summary: {
          fields: {
            provider: "cloudflare",
            status: "waiting-for-authorization",
          },
          title: "Cloudflare authorization required",
        },
      },
      status: "running",
    });

    const continued = (await start.continue?.()) as WorkspaceOperationDomainExecutionResult;

    expect(continued).toMatchObject({
      logMessage: "credentialSetup completed.",
      result: {
        details: {
          accountId: "account-123",
          credentialRef: "formless-cloudflare-oauth:default",
        },
        summary: {
          fields: {
            credentialRef: "formless-cloudflare-oauth:default",
            provider: "cloudflare",
            status: "ready",
          },
          title: "Cloudflare credentials ready",
        },
      },
      status: "succeeded",
    });
  });
});

function operationDeps(
  cwd: string,
  options: {
    accountDiscovery?: RunFormlessWorkspaceOperationDependencies["accountDiscovery"];
    credentialSetup?: RunFormlessWorkspaceOperationDependencies["credentialSetup"];
    env?: NodeJS.ProcessEnv;
    fetch?: typeof fetch;
    packageVersion?: string;
  } = {},
): RunFormlessWorkspaceOperationDependencies {
  return {
    ...(options.accountDiscovery === undefined
      ? {}
      : { accountDiscovery: options.accountDiscovery }),
    ...(options.credentialSetup === undefined ? {} : { credentialSetup: options.credentialSetup }),
    cwd,
    ...(options.env === undefined ? {} : { env: options.env }),
    fetch: options.fetch ?? fetch,
    now: timestampSequence("2026-06-02T00:07:00.000Z", "2026-06-02T00:07:01.000Z"),
    ...(options.packageVersion === undefined ? {} : { packageVersion: options.packageVersion }),
  };
}

function operationDepsWithAccessGuards(
  dependencies: RunFormlessWorkspaceOperationDependencies,
  guardedKeys: readonly string[],
): RunFormlessWorkspaceOperationDependencies {
  for (const key of guardedKeys) {
    Object.defineProperty(dependencies, key, {
      configurable: true,
      get() {
        throw new Error(`Unexpected dependency access: ${key}`);
      },
    });
  }

  return dependencies;
}

function timestampSequence(...timestamps: string[]): () => string {
  let index = 0;

  return () =>
    timestamps[index++ % timestamps.length] ?? timestamps.at(-1) ?? new Date(0).toISOString();
}

async function writeWorkspaceManifest(workspaceRoot: string) {
  await mkdir(workspaceRoot, { recursive: true });
  await writeFile(
    path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE),
    formatFormlessInstanceWorkspaceManifest({
      version: 1,
      kind: "formless-instance-workspace",
      name: "personal-sites",
      local: { stateRoot: ".formless/local", secretStateRoot: ".formless" },
    }),
  );
}

async function writeDeployStorageSnapshot(
  workspaceRoot: string,
  options: {
    credentialRef?: string;
    targetUrl?: string;
    workerName?: string | null;
  } = {},
) {
  await writeInstanceWorkspaceControlPlaneStorageSnapshot({
    manifest: defaultFormlessInstanceWorkspaceManifest({ name: "personal-sites" }),
    packageResolver: bundledAppPackageResolver,
    snapshot: controlPlaneSnapshot(deployControlPlaneRecords(options)),
    workspaceRoot,
  });
}

async function writeWorkspaceAppStorageSnapshot(
  workspaceRoot: string,
  installId: string = "david",
  records: StoredRecord[] = [],
) {
  const facts = packageAppFactsForKey("site", bundledAppPackageResolver);

  if (!facts) {
    throw new Error("Missing bundled package facts for site.");
  }

  await writeInstanceWorkspaceAppStorageSnapshot({
    installId,
    manifest: defaultFormlessInstanceWorkspaceManifest({ name: "personal-sites" }),
    schemaProvenance: {
      kind: "package-app",
      packageAppKey: "site",
      packageRevision: facts.packageRevision,
      sourceSchemaHash: facts.sourceSchemaHash,
    },
    snapshot: snapshot(records, `app:${installId}`),
    workspaceRoot,
  });
}

type CapturedRequest = {
  body?: string;
  headers: Record<string, string>;
  method: string;
  url: string;
};

function deployFetch(
  requests: CapturedRequest[],
  options: { controlPlaneRecords?: StoredRecord[] } = {},
): typeof fetch {
  return async (url, init) => {
    const requestUrl =
      typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    const parsedUrl = new URL(requestUrl);
    const method = init?.method ?? "GET";

    requests.push({
      body: typeof init?.body === "string" ? init.body : undefined,
      headers: normalizeHeaders(init?.headers),
      method,
      url: requestUrl,
    });

    if (parsedUrl.pathname === "/api/formless/deploy") {
      return Response.json({
        packageApps: listInstallableAppPackages(bundledAppPackageResolver).map((appPackage) => ({
          packageAppKey: appPackage.packageAppKey,
          packageRevision: appPackage.packageRevision,
          sourceSchemaHash: appPackage.sourceSchemaHash,
        })),
        packageVersion: packageJson.version,
        runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
        storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
        version: packageJson.version,
      });
    }

    if (parsedUrl.pathname === "/api/formless/app-installs") {
      return Response.json({
        installs: [installedSite("david", "David Peek")],
        packages: listInstallableAppPackages(bundledAppPackageResolver),
      });
    }

    if (parsedUrl.pathname === "/api/formless/control-plane/bootstrap") {
      return Response.json({
        cursor: 1,
        records: options.controlPlaneRecords ?? deployControlPlaneRecords(),
        schema: {},
      });
    }

    if (parsedUrl.pathname === "/api/formless/control-plane/snapshot") {
      return Response.json(
        controlPlaneSnapshot(options.controlPlaneRecords ?? deployControlPlaneRecords()),
      );
    }

    if (parsedUrl.pathname === "/api/app-installs/site/david/snapshot") {
      return Response.json(snapshot([]));
    }

    if (parsedUrl.pathname === "/api/formless/domain-mappings") {
      return Response.json(
        { error: "legacy domain mapping API should not be called" },
        { status: 500 },
      );
    }

    if (parsedUrl.pathname === "/api/formless/archive/restore") {
      const body = parseCapturedBody<{ archive?: { restorePolicy?: { dryRun?: boolean } } }>(init);
      const dryRun = body.archive?.restorePolicy?.dryRun !== false;

      return Response.json(
        dryRun
          ? { ok: true, plan: { summary: restoreSummary() } }
          : { ok: true, report: { applied: true, summary: restoreSummary() } },
      );
    }

    if (parsedUrl.pathname === "/api/formless/deployments/desired-state") {
      const desiredState = deploymentDesiredStateRef();

      return Response.json({
        desiredState: {
          ...desiredState,
          createdAt: "2026-06-02T00:04:02.000Z",
          display: {
            resourceCount: 2,
            resourcesByKind: {
              "cloudflare-worker-custom-domain": 2,
            },
            title: "Primary instance target",
          },
          resourceGraph: { resources: [], targetId: desiredState.targetId },
          schemaVersion: 1,
          source: { fingerprint: "source-1", intentRevision: 1 },
        },
        target: { kind: "instance", targetId: desiredState.targetId },
      });
    }

    if (parsedUrl.pathname === "/api/formless/deployments/status") {
      const desiredState = deploymentDesiredStateRef();

      return Response.json({
        status: {
          checkedAt: "2026-06-02T00:04:02.000Z",
          latestDesiredState: desiredState,
          state: "pending-changes",
          targetId: desiredState.targetId,
        },
        target: { kind: "instance", targetId: desiredState.targetId },
      });
    }

    if (parsedUrl.pathname === "/api/formless/control-plane/operations/deployment-config/update") {
      const body = parseCapturedBody<{
        idempotencyKey: string;
        input: Record<string, unknown>;
        recordId: string;
      }>(init);
      const record = {
        createdAt: "2026-05-26T00:00:00.000Z",
        entity: "deployment-config",
        id: body.recordId,
        values: {
          accountId: "account-123",
          createdAt: "2026-05-26T00:00:00.000Z",
          enabled: true,
          label: "Primary instance",
          providerFamily: "cloudflare",
          targetId: "instance.primary",
          targetKind: "instance",
          targetUrl: "https://personal.dpeek.workers.dev",
          updatedAt: "2026-05-26T00:00:00.000Z",
          workerName: "personal",
          ...body.input,
        },
      };

      return Response.json({
        invocation: {},
        output: {
          affectedChangeIds: [],
          changes: [],
          cursor: 2,
          record,
          type: "update",
        },
        status: "committed",
      });
    }

    return Response.json({ error: "not found" }, { status: 404 });
  };
}

function installedSite(installId: string, label: string) {
  const facts = packageAppFactsForKey("site", bundledAppPackageResolver);

  if (!facts) {
    throw new Error("Missing bundled package facts for site.");
  }

  return {
    adminRoute: `/apps/${installId}` as `/apps/${string}`,
    createdAt: "2026-05-01T00:00:00.000Z",
    installId,
    label,
    packageAppKey: "site" as const,
    packageRevision: facts.packageRevision,
    publicRoute: `/sites/${installId}` as `/sites/${string}`,
    publicRoutePrefix: `/sites/${installId}/` as `/sites/${string}/`,
    sourceSchemaHash: facts.sourceSchemaHash,
    status: "installed" as const,
    updatedAt: "2026-05-01T00:00:00.000Z",
  };
}

function snapshot(
  records: StoredRecord[],
  storageIdentity: `app:${string}` = "app:david",
): StorageSnapshot {
  return {
    exportedAt: "2026-05-12T02:00:00.000Z",
    kind: STORAGE_SNAPSHOT_KIND,
    records,
    schema: siteSourceSchema,
    schemaKey: "site",
    schemaUpdatedAt: "2026-05-01T00:00:00.000Z",
    sourceCursor: 1,
    storageIdentity,
    version: STORAGE_SNAPSHOT_VERSION,
  };
}

function controlPlaneSnapshot(records: StoredRecord[]): StorageSnapshot {
  return {
    exportedAt: "2026-05-12T02:00:00.000Z",
    kind: STORAGE_SNAPSHOT_KIND,
    records,
    schema: instanceControlPlaneSchema,
    schemaKey: INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
    schemaUpdatedAt: "2026-05-01T00:00:00.000Z",
    sourceCursor: records.length,
    storageIdentity: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
    version: STORAGE_SNAPSHOT_VERSION,
  };
}

function controlPlaneRecords(): StoredRecord[] {
  const installId = "david";
  const now = "2026-05-26T00:00:00.000Z";

  return [
    {
      createdAt: now,
      updatedAt: now,
      entity: "app-install",
      id: installId,
      values: {
        createdAt: now,
        installId,
        label: "David Peek",
        packageAppKey: "site",
        status: "installed",
        storageIdentity: `app:${installId}`,
        updatedAt: now,
      },
    },
    {
      createdAt: now,
      updatedAt: now,
      entity: "route",
      id: `route:${installId}:admin`,
      values: {
        appInstall: installId,
        createdAt: now,
        enabled: true,
        kind: "mount",
        matchPath: `/apps/${installId}`,
        surface: "admin",
        targetProfile: "app",
        updatedAt: now,
      },
    },
  ];
}

function deployControlPlaneRecords(
  options: {
    credentialRef?: string;
    targetUrl?: string;
    workerName?: string | null;
  } = {},
): StoredRecord[] {
  const now = "2026-05-26T00:00:00.000Z";
  const workerName = options.workerName === undefined ? "personal" : options.workerName;

  return [
    ...controlPlaneRecords(),
    {
      createdAt: now,
      updatedAt: now,
      entity: "route",
      id: "route:site:public-site",
      values: {
        appInstall: "david",
        createdAt: now,
        enabled: true,
        kind: "mount",
        matchPath: "/sites/david",
        matchPrefix: "/sites/david/",
        surface: "public-site",
        targetProfile: "public-site",
        updatedAt: now,
      },
    },
    {
      createdAt: now,
      updatedAt: now,
      entity: "route",
      id: "route:host:public-site:www.example.com",
      values: {
        appInstall: "david",
        createdAt: now,
        enabled: true,
        kind: "mount",
        matchHost: "www.example.com",
        matchPath: "/",
        matchPrefix: "/",
        deploymentConfig: "instance.primary",
        surface: "public-site",
        targetProfile: "public-site",
        updatedAt: now,
      },
    },
    {
      createdAt: now,
      updatedAt: now,
      entity: "deployment-config",
      id: "instance.primary",
      values: {
        accountId: "account-123",
        createdAt: now,
        enabled: true,
        label: "Primary instance",
        providerFamily: "cloudflare",
        targetId: "instance.primary",
        targetKind: "instance",
        targetUrl: options.targetUrl ?? "https://personal.dpeek.workers.dev",
        updatedAt: now,
        ...(options.credentialRef === undefined ? {} : { credentialRef: options.credentialRef }),
        ...(workerName === null ? {} : { workerName }),
      },
    },
  ];
}

function deploymentDesiredStateRef() {
  return {
    hash: `sha256:${"b".repeat(64)}`,
    revision: 3,
    targetId: "instance.primary",
    versionId: "desired.instance.primary.3",
  };
}

function restoreSummary() {
  return {
    appCount: 1,
    createdInstalls: [],
    mediaCountsByApp: { david: 0 },
    recordCountsByApp: { david: { total: 0 } },
    replacedInstalls: ["david"],
  };
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  return Object.fromEntries(new Headers(headers).entries());
}

function requestByPath(requests: readonly CapturedRequest[], pathname: string): CapturedRequest {
  const request = requests.find((candidate) => new URL(candidate.url).pathname === pathname);

  if (!request) {
    throw new Error(`Expected request to ${pathname}.`);
  }

  return request;
}

function capturedRequestJson<T>(request: CapturedRequest): T {
  return JSON.parse(request.body ?? "{}") as T;
}

function parseCapturedBody<T>(init: RequestInit | undefined): T {
  return JSON.parse(typeof init?.body === "string" ? init.body : "{}") as T;
}

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "formless-workspace-domain-test-"));

  tempDirs.push(tempDir);
  return tempDir;
}
