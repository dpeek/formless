import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  INSTANCE_WORKSPACE_MANIFEST_FILE as FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE,
  defaultInstanceWorkspaceManifest as defaultFormlessInstanceWorkspaceManifest,
  formatInstanceWorkspaceManifest as formatFormlessInstanceWorkspaceManifest,
} from "@dpeek/formless-workspace";

import packageJson from "../../package.json";
import {
  FORMLESS_RUNTIME_PROTOCOL_VERSION,
  FORMLESS_STORAGE_MIGRATION_SET_ID,
} from "../shared/deploy-metadata.ts";
import { listInstallableAppPackages, packageAppFactsForKey } from "@dpeek/formless-installed-apps";
import { bundledAppPackageResolver } from "../shared/app-packages.ts";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import {
  INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
  INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
  instanceControlPlaneSchema,
} from "@dpeek/formless-instance-control-plane";
import {
  createWorkspaceOperationState,
  listWorkspaceOperationStates,
  readWorkspaceOperationState,
  updateWorkspaceOperationState,
  workspaceOperationStatePath,
  writeInstanceWorkspaceControlPlaneStorageSnapshot,
} from "@dpeek/formless-workspace/node";
import { siteSourceSchema } from "../test/schema-apps.ts";
import {
  type DeployFormlessInstanceInput,
  type DeployFormlessInstanceResult,
  type FormlessInstanceAccountDiscoveryAdapter,
} from "./instance-onboarding.ts";
import {
  runFormlessWorkspaceOperation,
  type RunFormlessWorkspaceOperationDependencies,
} from "./instance-workspace-operations.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
});

describe("Formless workspace operations", () => {
  it("persists status progress for a CLI-bootstrapped layout workspace without source writes", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");

    await writeWorkspaceManifest(workspaceRoot);

    const state = await runFormlessWorkspaceOperation(
      {
        kind: "status",
        workspacePath: workspaceRoot,
      },
      operationDeps(tempDir, {
        operationIds: ["op_status_00000001"],
        timestamps: [
          "2026-06-02T00:00:00.000Z",
          "2026-06-02T00:00:01.000Z",
          "2026-06-02T00:00:02.000Z",
        ],
      }),
      { actor: "browser" },
    );

    expect(state).toMatchObject({
      actor: "browser",
      id: "op_status_00000001",
      operation: "status",
      status: "succeeded",
      summary: {
        fields: {
          automationToken: "[redacted]",
          initialized: true,
          remoteStatus: "skipped",
        },
        title: "Workspace status",
      },
      workspace: { label: "personal-sites" },
    });
    await expect(
      stat(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE)),
    ).resolves.toMatchObject({});
    await expect(readFile(path.join(workspaceRoot, ".gitignore"), "utf8")).resolves.toBe(
      ".formless/\n",
    );
    await expect(stat(path.join(workspaceRoot, "archives"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(stat(path.join(workspaceRoot, "records"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(stat(path.join(workspaceRoot, "media"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    const persisted = await readWorkspaceOperationState({
      operationId: "op_status_00000001",
      workspaceRoot,
    });
    const persistedText = await readFile(
      workspaceOperationStatePath(workspaceRoot, "op_status_00000001"),
      "utf8",
    );

    expect(persisted.status).toBe("succeeded");
    expect(persistedText).not.toContain(workspaceRoot);
    expect(persistedText).not.toContain(tempDir);
  });

  it("rejects removed deploy operation keys before workspace access", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "missing-workspace");

    await expect(
      runFormlessWorkspaceOperation(
        {
          kind: "deployApply",
          workspacePath: workspaceRoot,
        } as never,
        operationDeps(tempDir),
        { actor: "browser" },
      ),
    ).rejects.toThrow('Workspace operation "deployApply" is not defined.');
    await expect(stat(workspaceRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("records stale save check failure without rewriting reviewable source", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");

    await writeWorkspaceManifest(workspaceRoot);
    const manifestBefore = await readFile(
      path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE),
      "utf8",
    );

    const state = await runFormlessWorkspaceOperation(
      {
        check: true,
        kind: "save",
        workspacePath: workspaceRoot,
      },
      operationDeps(tempDir, {
        fetch: authorityExportFetch([installedSite("david", "David Peek")], {
          david: { records: [] },
        }),
        operationIds: ["op_save_00000001"],
        timestamps: [
          "2026-06-02T00:01:00.000Z",
          "2026-06-02T00:01:01.000Z",
          "2026-06-02T00:01:02.000Z",
        ],
      }),
    );

    expect(state.status).toBe("failed");
    expect(state.summary.fields.error).toBe(
      'Formless workspace source is stale: state/apps/david.json, state/instance.json. Run "npx formless save".',
    );
    await expect(
      readFile(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE), "utf8"),
    ).resolves.toBe(manifestBefore);
    await expect(stat(path.join(workspaceRoot, "state/instance.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("refreshes deployment observation through an explicit write operation", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];

    await writeWorkspaceManifest(workspaceRoot);
    await writeDeployStorageSnapshot(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=secret\n",
    );

    const state = await runFormlessWorkspaceOperation(
      {
        kind: "deploymentRefresh",
        workspacePath: workspaceRoot,
      },
      operationDeps(tempDir, {
        fetch: deployApplyFetch(requests),
        operationIds: ["op_deployment_refresh_00000001"],
        timestamps: ["2026-06-02T00:05:00.000Z", "2026-06-02T00:05:01.000Z"],
      }),
      { actor: "browser" },
    );
    const desiredState = deploymentDesiredStateRef();
    const observation = capturedRequestJson<{
      idempotencyKey: string;
      input: {
        observedDesiredStateHash: string;
        observedStatus: string;
      };
      recordId: string;
    }>(requestByPath(requests, "/api/formless/control-plane/operations/deployment-config/update"));

    expect(state).toMatchObject({
      actor: "browser",
      operation: "deploymentRefresh",
      result: {
        deployment: {
          observation: {
            desiredState,
            observedStatus: "unknown",
            targetId: "instance.primary",
          },
          status: {
            state: "pending-changes",
          },
        },
        summary: {
          fields: {
            observedStatus: "unknown",
            status: "pending-changes",
            target: "instance.primary",
          },
          title: "Deployment observation refreshed",
        },
      },
      status: "succeeded",
    });
    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(
      [
        "GET /api/formless/deployments/desired-state",
        "GET /api/formless/deployments/status",
        "POST /api/formless/control-plane/operations/deployment-config/update",
      ],
    );
    expect(observation).toMatchObject({
      idempotencyKey: expect.any(String),
      recordId: "instance.primary",
      input: {
        observedDesiredStateHash: desiredState.hash,
        observedStatus: "unknown",
      },
    });
  });

  it("persists display-safe deployment observation and cleanup summaries with secret redaction", async () => {
    const workspaceRoot = await makeTempDir();
    const state = await createWorkspaceOperationState({
      id: "op_deploy_00000001",
      input: { targetAlias: "remote" },
      now: timestampSequence("2026-06-02T00:02:00.000Z"),
      operation: "push",
      workspaceRoot,
    });

    await updateWorkspaceOperationState(state.id, {
      logs: [
        {
          at: "2026-06-02T00:02:01.000Z",
          level: "info",
          message: `raw adapter output CF_API_TOKEN=secret-token lease:raw-token ${path.join(
            workspaceRoot,
            "outside.log",
          )}`,
        },
      ],
      result: {
        deployment: {
          observation: {
            desiredState: {
              hash: `sha256:${"a".repeat(64)}`,
              revision: 4,
              targetId: "instance.primary",
              versionId: "desired.instance.primary.4",
            },
            observedSummary: "lease:raw-token",
            runnerId: "runner-local",
            observedStatus: "deployed",
          },
          cleanup: {
            customDomains: 1,
            dnsRecords: 1,
            workerSecretBindingCount: 3,
          },
          evidence: {
            count: 2,
            logicalIds: ["custom-domain:www.example.com", "dns-records:example.com"],
          },
          plan: {
            resourceCount: 2,
            resourcesByKind: {
              "cloudflare-dns-records": 1,
              "cloudflare-worker-custom-domain": 1,
            },
          },
          rawAdapterOutput: "CF_API_TOKEN=secret-token",
        },
        summary: {
          fields: {
            evidenceCount: 2,
            observedStatus: "deployed",
          },
          title: "Workspace push applied",
        },
      },
      status: "succeeded",
      summary: {
        fields: {
          cleanupCount: 2,
          evidenceCount: 2,
          observedStatus: "deployed",
        },
        title: "Workspace push applied",
      },
      workspaceRoot,
    });

    const persistedText = await readFile(
      workspaceOperationStatePath(workspaceRoot, state.id),
      "utf8",
    );
    const persisted = await readWorkspaceOperationState({
      operationId: state.id,
      workspaceRoot,
    });

    expect(persisted.result?.deployment).toMatchObject({
      observation: {
        observedStatus: "deployed",
        observedSummary: "[redacted]",
      },
      cleanup: {
        customDomains: 1,
        dnsRecords: 1,
        workerSecretBindingCount: 3,
      },
      evidence: {
        count: 2,
      },
      rawAdapterOutput: "[redacted]",
    });
    expect(persisted.logs[0]?.message).toContain("[redacted]");
    expect(persistedText).not.toContain("secret-token");
    expect(persistedText).not.toContain("lease:raw-token");
    expect(persistedText).not.toContain(workspaceRoot);
    expect(await listWorkspaceOperationStates(workspaceRoot)).toHaveLength(1);
  });
});

function operationDeps(
  cwd: string,
  options: {
    accountDiscovery?: FormlessInstanceAccountDiscoveryAdapter;
    deploymentAdapter?: {
      deploy: (input: DeployFormlessInstanceInput) => Promise<DeployFormlessInstanceResult>;
    };
    env?: NodeJS.ProcessEnv;
    fetch?: typeof fetch;
    healthCheck?: RunFormlessWorkspaceOperationDependencies["healthCheck"];
    packageRoot?: string;
    operationIds?: string[];
    packageVersion?: string;
    randomTokens?: string[];
    setupInputs?: Array<{ adminToken: string; deploymentUrl: string; setupToken: string }>;
    timestamps?: string[];
  } = {},
) {
  const operationIds = [...(options.operationIds ?? [])];
  const randomTokens = [...(options.randomTokens ?? [])];

  return {
    accountDiscovery: options.accountDiscovery ?? {
      listAccounts: async () => [{ id: "account-123", workersDevSubdomain: "dpeek" }],
    },
    createOperationId: () => operationIds.shift() ?? "op_test_00000000",
    cwd,
    deploymentAdapter: options.deploymentAdapter ?? {
      deploy: async (input: DeployFormlessInstanceInput) => ({
        resourceEvidence: [],
        url: input.plan.expectedUrl.url,
      }),
    },
    ...(options.env === undefined ? {} : { env: options.env }),
    fetch: options.fetch ?? fetch,
    healthCheck: options.healthCheck ?? {
      check: async (input: { expectedVersion: string; url: string }) => ({
        cacheControl: "no-store",
        metadataUrl: new URL("/api/formless/deploy", `${input.url}/`).toString(),
        packageVersion: input.expectedVersion,
        runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
        storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
        url: input.url,
        version: input.expectedVersion,
      }),
    },
    localSecretEnv: {
      ensure: async (input: { root: string }) => ({
        created: false,
        path: path.join(input.root, "deploy.env"),
        secrets: { ALCHEMY_PASSWORD: "alchemy-password" },
      }),
    },
    now: timestampSequence(...(options.timestamps ?? ["2026-06-02T00:00:00.000Z"])),
    packageRoot: options.packageRoot ?? process.cwd(),
    packageVersion: options.packageVersion ?? packageJson.version,
    randomToken: () => randomTokens.shift() ?? "generated-token",
    setupCapability: {
      create: async (input: { adminToken: string; deploymentUrl: string; setupToken: string }) => {
        options.setupInputs?.push(input);

        return {
          capabilityCreated: true,
          endpointUrl: new URL(
            "/api/formless/setup/capability",
            `${input.deploymentUrl}/`,
          ).toString(),
          setupComplete: false,
        };
      },
    },
  } as RunFormlessWorkspaceOperationDependencies;
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
    includeDeployTarget?: boolean;
    targetUrl?: string;
    workerName?: string | null;
  } = {},
) {
  const manifest = defaultFormlessInstanceWorkspaceManifest({ name: "personal-sites" });

  await writeInstanceWorkspaceControlPlaneStorageSnapshot({
    manifest,
    snapshot: controlPlaneSnapshot(deployControlPlaneRecords(options)),
    workspaceRoot,
  });
}

function authorityExportFetch(
  installs: ReturnType<typeof installedSite>[],
  dataByInstall: Record<string, { records: StoredRecord[] }>,
  options: { controlPlaneRecords?: StoredRecord[] } = {},
): typeof fetch {
  return async (url) => {
    const requestUrl =
      typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    const parsedUrl = new URL(requestUrl);

    if (parsedUrl.pathname === "/api/formless/deploy") {
      return Response.json(
        {
          packageApps: listInstallableAppPackages(bundledAppPackageResolver).map((appPackage) => ({
            packageAppKey: appPackage.packageAppKey,
            packageRevision: appPackage.packageRevision,
            sourceSchemaHash: appPackage.sourceSchemaHash,
          })),
          packageVersion: packageJson.version,
          runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
          storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
          version: packageJson.version,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (parsedUrl.pathname === "/api/formless/app-installs") {
      return Response.json({
        installs,
        packages: listInstallableAppPackages(bundledAppPackageResolver),
      });
    }

    if (parsedUrl.pathname === "/api/formless/control-plane/bootstrap") {
      return Response.json({
        cursor: 1,
        records: options.controlPlaneRecords ?? controlPlaneRecords(),
        schema: {},
      });
    }

    if (parsedUrl.pathname === "/api/formless/control-plane/snapshot") {
      return Response.json(
        controlPlaneSnapshot(options.controlPlaneRecords ?? controlPlaneRecords()),
      );
    }

    if (parsedUrl.pathname === "/api/formless/domain-mappings") {
      return Response.json({ mappings: [] });
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

    const snapshotMatch = parsedUrl.pathname.match(
      /^\/api\/app-installs\/([^/]+)\/([^/]+)\/snapshot$/,
    );

    if (snapshotMatch) {
      const installId = snapshotMatch[2] ?? "";

      return Response.json(snapshot(dataByInstall[installId]?.records ?? [], `app:${installId}`));
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
    schemaRoute: `/apps/${installId}/schema` as `/apps/${string}/schema`,
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

type CapturedRequest = {
  body?: string;
  headers: Record<string, string>;
  method: string;
  url: string;
};

function deployApplyFetch(
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
      return Response.json({ mappings: [] });
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
    includeDeployTarget?: boolean;
    targetUrl?: string;
    workerName?: string | null;
  } = {},
): StoredRecord[] {
  const now = "2026-05-26T00:00:00.000Z";
  const workerName = options.workerName === undefined ? "personal" : options.workerName;

  const records = [
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
      entity: "route",
      id: "route:redirect:old.example.com",
      values: {
        createdAt: now,
        enabled: true,
        kind: "redirect",
        matchHost: "old.example.com",
        matchPath: "/",
        matchPrefix: "/",
        preservePath: true,
        preserveQueryString: true,
        statusCode: "308",
        toHost: "www.example.com",
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

  if (options.includeDeployTarget !== false) {
    return records;
  }

  return records
    .filter((record) => record.entity !== "deployment-config")
    .map((record) => {
      if (record.id !== "route:host:public-site:www.example.com") {
        return record;
      }

      const values = { ...record.values };
      delete values.deploymentConfig;

      return {
        ...record,
        values,
      };
    });
}

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "formless-workspace-operations-test-"));

  tempDirs.push(tempDir);
  return tempDir;
}
