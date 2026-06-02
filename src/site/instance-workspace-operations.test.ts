import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import packageJson from "../../package.json";
import {
  APP_ARCHIVE_KIND,
  ARCHIVE_VERSION,
  formatAppArchive,
  type AppArchive,
} from "../shared/archive.ts";
import {
  FORMLESS_RUNTIME_PROTOCOL_VERSION,
  FORMLESS_STORAGE_MIGRATION_SET_ID,
} from "../shared/deploy-metadata.ts";
import { packageAppFactsForKey, listBundledAppPackages } from "../shared/app-installs.ts";
import {
  STORE_SNAPSHOT_KIND,
  STORE_SNAPSHOT_VERSION,
  type StoreSnapshot,
  type StoredRecord,
} from "../shared/protocol.ts";
import {
  FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE,
  defaultFormlessInstanceWorkspaceManifest,
  formatFormlessInstanceWorkspaceManifest,
} from "./instance-workspace-config.ts";
import { writeFormlessInstanceControlPlaneRecordSource } from "./instance-workspace-record-source.ts";
import { PORTABLE_ARCHIVE_MANIFEST_FILE } from "./archive-workflows.ts";
import { siteSourceSchema } from "../test/schema-apps.ts";
import {
  createFormlessWorkspaceOperationState,
  formlessWorkspaceOperationStatePath,
  listFormlessWorkspaceOperationStates,
  readFormlessWorkspaceOperationState,
  runFormlessWorkspaceOperation,
  type RunFormlessWorkspaceOperationDependencies,
  updateFormlessWorkspaceOperationState,
} from "./instance-workspace-operations.ts";

const tempDirs: string[] = [];
const setupToken = "abcDEF0123456789_-abcDEF0123456789_-";

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
});

describe("Formless workspace operations", () => {
  it("persists init progress under ignored operation state before manifest creation", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");

    const state = await runFormlessWorkspaceOperation(
      {
        kind: "init",
        name: "personal-sites",
        workspacePath: workspaceRoot,
      },
      operationDeps(tempDir, {
        operationIds: ["op_init_00000001"],
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
      id: "op_init_00000001",
      operation: "init",
      status: "succeeded",
      summary: {
        fields: {
          initialized: true,
          workspace: "personal-sites",
        },
        title: "Workspace initialized",
      },
      workspace: { label: "personal-sites" },
    });
    await expect(
      stat(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE)),
    ).resolves.toMatchObject({});
    await expect(readFile(path.join(workspaceRoot, ".gitignore"), "utf8")).resolves.toBe(
      ".formless/\n",
    );

    const persisted = await readFormlessWorkspaceOperationState({
      operationId: "op_init_00000001",
      workspaceRoot,
    });
    const persistedText = await readFile(
      formlessWorkspaceOperationStatePath(workspaceRoot, "op_init_00000001"),
      "utf8",
    );

    expect(persisted.status).toBe("succeeded");
    expect(persistedText).not.toContain(workspaceRoot);
    expect(persistedText).not.toContain(tempDir);
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
      'Formless workspace source is stale: archives/apps/david, records/instance-control-plane. Run "npx formless save".',
    );
    await expect(
      readFile(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE), "utf8"),
    ).resolves.toBe(manifestBefore);
    await expect(
      stat(path.join(workspaceRoot, "records/instance-control-plane/app-install.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("plans deploy from schema-owned record source and desired-state projection", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");

    await writeWorkspaceManifest(workspaceRoot);
    await writeDeployRecordSource(workspaceRoot);

    const state = await runFormlessWorkspaceOperation(
      {
        kind: "deployPlan",
        workspacePath: workspaceRoot,
      },
      operationDeps(tempDir, {
        accountDiscovery: {
          listAccounts: async () => [
            {
              id: "account-123",
              workersDevSubdomain: "dpeek",
            },
          ],
        },
        operationIds: ["op_deploy_plan_00000001"],
        packageVersion: packageJson.version,
        timestamps: [
          "2026-06-02T00:03:00.000Z",
          "2026-06-02T00:03:01.000Z",
          "2026-06-02T00:03:02.000Z",
        ],
      }),
      { actor: "browser" },
    );

    expect(state).toMatchObject({
      actor: "browser",
      operation: "deployPlan",
      result: {
        deployment: {
          desiredState: {
            resourceCount: 1,
            resourcesByKind: {
              "cloudflare-worker-custom-domain": 1,
            },
            routeTargetCount: 2,
            targetId: "instance.primary",
          },
          expectedUrl: "https://personal.dpeek.workers.dev",
          targetAlias: "instance.primary",
          workerName: "personal",
        },
        summary: {
          fields: {
            desiredResourceCount: 1,
            expectedUrl: "https://personal.dpeek.workers.dev",
            routeTargetCount: 2,
            workerName: "personal",
          },
          title: "Deploy planned",
        },
      },
      status: "succeeded",
    });
    expect(JSON.stringify(state)).not.toContain("secret");
  });

  it("applies deploy with exact desired-state runtime writeback", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedRequest[] = [];

    await writeWorkspaceManifest(workspaceRoot);
    await writeDeployRecordSource(workspaceRoot);
    await writeWorkspaceAppArchive(workspaceRoot, "david", "David Peek");

    const state = await runFormlessWorkspaceOperation(
      {
        kind: "deployApply",
        workspacePath: workspaceRoot,
      },
      operationDeps(tempDir, {
        accountDiscovery: {
          listAccounts: async () => [
            {
              id: "account-123",
              workersDevSubdomain: "dpeek",
            },
          ],
        },
        deploymentAdapter: {
          deploy: async (input) => ({ url: input.plan.expectedUrl.url }),
        },
        fetch: deployApplyFetch(requests),
        operationIds: ["op_deploy_apply_00000001"],
        packageRoot: "/package",
        packageVersion: packageJson.version,
        randomTokens: ["generated-admin-token", setupToken],
        timestamps: [
          "2026-06-02T00:04:00.000Z",
          "2026-06-02T00:04:01.000Z",
          "2026-06-02T00:04:02.000Z",
          "2026-06-02T00:04:03.000Z",
        ],
      }),
      { actor: "browser" },
    );

    if (state.status !== "succeeded") {
      throw new Error(JSON.stringify(state.summary.fields));
    }

    const desiredState = deploymentDesiredStateRef();
    const start = capturedRequestJson<{ desiredState: typeof desiredState; mode: string }>(
      requestByPath(requests, "/api/formless/deployments/attempts/start"),
    );
    const plan = capturedRequestJson<{ attemptId: string; desiredState: typeof desiredState }>(
      requestByPath(requests, "/api/formless/deployments/attempts/plan"),
    );
    const success = capturedRequestJson<{
      attemptId: string;
      desiredState: typeof desiredState;
      leaseToken: string;
    }>(requestByPath(requests, "/api/formless/deployments/attempts/success"));

    expect(state).toMatchObject({
      actor: "browser",
      operation: "deployApply",
      result: {
        deployment: {
          writeback: {
            attemptId: "attempt.local-gateway.1",
            desiredState,
            evidenceCount: 0,
            resourceCount: 1,
            runnerId: "local-gateway",
            status: "succeeded",
            targetId: "instance.primary",
          },
        },
        summary: {
          fields: {
            attemptId: "attempt.local-gateway.1",
            desiredStateVersion: desiredState.versionId,
          },
          title: "Deploy applied",
        },
      },
      status: "succeeded",
    });
    expect(start).toMatchObject({ desiredState, mode: "apply" });
    expect(plan).toMatchObject({ attemptId: "attempt.local-gateway.1", desiredState });
    expect(success).toMatchObject({
      attemptId: "attempt.local-gateway.1",
      desiredState,
      leaseToken: "lease:local-gateway",
    });
    expect(JSON.stringify(state)).not.toContain("generated-admin-token");
    expect(JSON.stringify(state)).not.toContain("alchemy-password");
    expect(JSON.stringify(state)).not.toContain("lease:local-gateway");
  });

  it("persists display-safe deployment and cleanup summaries with secret redaction", async () => {
    const workspaceRoot = await makeTempDir();
    const state = await createFormlessWorkspaceOperationState({
      id: "op_deploy_00000001",
      input: { targetAlias: "remote" },
      kind: "deployApply",
      now: timestampSequence("2026-06-02T00:02:00.000Z"),
      workspaceRoot,
    });

    await updateFormlessWorkspaceOperationState(state.id, {
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
          attempt: {
            attemptId: "attempt.deploy.1",
            desiredState: {
              hash: `sha256:${"a".repeat(64)}`,
              revision: 4,
              targetId: "instance.primary",
              versionId: "desired.instance.primary.4",
            },
            leaseToken: "lease:raw-token",
            runnerId: "runner-local",
            status: "succeeded",
          },
          cleanup: {
            customDomains: 1,
            dnsRecords: 1,
            redirectRules: 0,
            workerSecretBindingCount: 3,
          },
          drift: {
            changedResourceCount: 0,
            status: "in-sync",
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
          writeback: {
            status: "succeeded",
          },
        },
        summary: {
          fields: {
            attemptId: "attempt.deploy.1",
            evidenceCount: 2,
          },
          title: "Deploy applied",
        },
      },
      status: "succeeded",
      summary: {
        fields: {
          attemptId: "attempt.deploy.1",
          cleanupCount: 2,
          drift: "in-sync",
          evidenceCount: 2,
        },
        title: "Deploy applied",
      },
      workspaceRoot,
    });

    const persistedText = await readFile(
      formlessWorkspaceOperationStatePath(workspaceRoot, state.id),
      "utf8",
    );
    const persisted = await readFormlessWorkspaceOperationState({
      operationId: state.id,
      workspaceRoot,
    });

    expect(persisted.result?.deployment).toMatchObject({
      attempt: {
        attemptId: "attempt.deploy.1",
        leaseToken: "[redacted]",
        status: "succeeded",
      },
      cleanup: {
        customDomains: 1,
        dnsRecords: 1,
        redirectRules: 0,
        workerSecretBindingCount: 3,
      },
      drift: {
        changedResourceCount: 0,
        status: "in-sync",
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
    expect(await listFormlessWorkspaceOperationStates(workspaceRoot)).toHaveLength(1);
  });
});

function operationDeps(
  cwd: string,
  options: {
    accountDiscovery?: {
      listAccounts: () => Promise<Array<{ id: string; workersDevSubdomain: string }>>;
    };
    deploymentAdapter?: {
      deploy: (input: { plan: { expectedUrl: { url: string } } }) => Promise<{ url: string }>;
    };
    env?: NodeJS.ProcessEnv;
    fetch?: typeof fetch;
    packageRoot?: string;
    operationIds?: string[];
    packageVersion?: string;
    randomTokens?: string[];
    timestamps?: string[];
  } = {},
) {
  const operationIds = [...(options.operationIds ?? [])];
  const randomTokens = [...(options.randomTokens ?? [])];

  return {
    ...(options.accountDiscovery === undefined
      ? {}
      : { accountDiscovery: options.accountDiscovery }),
    createOperationId: () => operationIds.shift() ?? "op_test_00000000",
    cwd,
    ...(options.deploymentAdapter === undefined
      ? {}
      : { deploymentAdapter: options.deploymentAdapter }),
    ...(options.env === undefined ? {} : { env: options.env }),
    fetch: options.fetch ?? fetch,
    healthCheck: {
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
    ...(options.packageRoot === undefined ? {} : { packageRoot: options.packageRoot }),
    ...(options.packageVersion === undefined ? {} : { packageVersion: options.packageVersion }),
    randomToken: () => randomTokens.shift() ?? "generated-token",
    setupCapability: {
      create: async (input: { deploymentUrl: string }) => ({
        capabilityCreated: true,
        endpointUrl: new URL(
          "/api/formless/setup/capability",
          `${input.deploymentUrl}/`,
        ).toString(),
        setupComplete: false,
      }),
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
      archives: { apps: "archives/apps" },
      local: { stateRoot: ".formless/local", secretStateRoot: ".formless" },
      source: { records: "records/instance-control-plane" },
    }),
  );
}

async function writeDeployRecordSource(workspaceRoot: string) {
  const manifest = defaultFormlessInstanceWorkspaceManifest({ name: "personal-sites" });
  const now = "2026-05-26T00:00:00.000Z";

  await writeFormlessInstanceControlPlaneRecordSource({
    controlPlane: {
      schemaKey: "instance-control-plane",
      schemaUpdatedAt: now,
      records: [
        ...controlPlaneRecords(),
        {
          createdAt: now,
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
            providerConfig: "cloudflare-personal",
            surface: "public-site",
            targetProfile: "public-site",
            updatedAt: now,
          },
        },
        {
          createdAt: now,
          entity: "deploy-target",
          id: "instance.primary",
          values: {
            createdAt: now,
            enabled: true,
            label: "Primary instance",
            targetId: "instance.primary",
            targetKind: "instance",
            updatedAt: now,
          },
        },
        {
          createdAt: now,
          entity: "provider-config-ref",
          id: "cloudflare-personal",
          values: {
            accountId: "account-123",
            configRef: "cloudflare-personal",
            createdAt: now,
            label: "Cloudflare personal",
            providerFamily: "cloudflare",
            updatedAt: now,
            workerName: "personal",
          },
        },
      ],
    },
    manifest,
    workspaceRoot,
  });
}

function authorityExportFetch(
  installs: ReturnType<typeof installedSite>[],
  dataByInstall: Record<string, { records: StoredRecord[] }>,
): typeof fetch {
  return async (url) => {
    const requestUrl =
      typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    const parsedUrl = new URL(requestUrl);

    if (parsedUrl.pathname === "/api/formless/deploy") {
      return Response.json(
        {
          packageApps: listBundledAppPackages().map((appPackage) => ({
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
        packages: listBundledAppPackages(),
      });
    }

    if (parsedUrl.pathname === "/api/formless/control-plane/bootstrap") {
      return Response.json({
        cursor: 1,
        records: controlPlaneRecords(),
        schema: {},
      });
    }

    const snapshotMatch = parsedUrl.pathname.match(
      /^\/api\/app-installs\/([^/]+)\/([^/]+)\/snapshot$/,
    );

    if (snapshotMatch) {
      const installId = snapshotMatch[2] ?? "";

      return Response.json(snapshot(dataByInstall[installId]?.records ?? []));
    }

    return Response.json({ error: "not found" }, { status: 404 });
  };
}

function installedSite(installId: string, label: string) {
  const facts = packageAppFactsForKey("site");

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

function snapshot(records: StoredRecord[]): StoreSnapshot {
  return {
    exportedAt: "2026-05-12T02:00:00.000Z",
    kind: STORE_SNAPSHOT_KIND,
    records,
    schema: siteSourceSchema,
    schemaKey: "site",
    schemaUpdatedAt: "2026-05-01T00:00:00.000Z",
    sourceCursor: 1,
    version: STORE_SNAPSHOT_VERSION,
  };
}

type CapturedRequest = {
  body?: string;
  headers: Record<string, string>;
  method: string;
  url: string;
};

function deployApplyFetch(requests: CapturedRequest[]): typeof fetch {
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
        packageApps: listBundledAppPackages().map((appPackage) => ({
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
        packages: listBundledAppPackages(),
      });
    }

    if (parsedUrl.pathname === "/api/formless/control-plane/bootstrap") {
      return Response.json({ cursor: 1, records: controlPlaneRecords(), schema: {} });
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
            resourceCount: 1,
            resourcesByKind: { "cloudflare-worker-custom-domain": 1 },
            title: "Primary instance target",
          },
          resourceGraph: { resources: [], targetId: desiredState.targetId },
          schemaVersion: 1,
          source: { fingerprint: "source-1", intentRevision: 1 },
        },
        target: { kind: "instance", targetId: desiredState.targetId },
      });
    }

    if (parsedUrl.pathname === "/api/formless/deployments/attempts/start") {
      const desiredState = deploymentDesiredStateRef();

      return Response.json(
        {
          attempt: deploymentAttempt({ desiredState, status: "started" }),
          lease: {
            actor: {
              actorId: "local-gateway.deploy",
              displayName: "Local workspace gateway",
              kind: "cli",
              runnerId: "local-gateway",
            },
            acquiredAt: "2026-06-02T00:04:02.000Z",
            attemptId: "attempt.local-gateway.1",
            expiresAt: "2026-06-02T00:14:02.000Z",
            leaseId: "lease.local-gateway.1",
            mode: "apply",
            status: "active",
            targetId: desiredState.targetId,
            token: "lease:local-gateway",
          },
          replayed: false,
        },
        { status: 201 },
      );
    }

    if (parsedUrl.pathname === "/api/formless/deployments/attempts/plan") {
      const desiredState = deploymentDesiredStateRef();

      return Response.json({
        attempt: deploymentAttempt({ desiredState, status: "started" }),
        plan: {
          ...desiredState,
          attemptId: "attempt.local-gateway.1",
          kind: "plan",
          recordedAt: "2026-06-02T00:04:02.000Z",
          summary: {
            blockers: [],
            changes: { create: 1, delete: 0, noChange: 0, update: 0 },
            warnings: [],
          },
        },
      });
    }

    if (parsedUrl.pathname === "/api/formless/deployments/attempts/success") {
      const desiredState = deploymentDesiredStateRef();

      return Response.json({
        attempt: deploymentAttempt({
          completedAt: "2026-06-02T00:04:03.000Z",
          desiredState,
          status: "succeeded",
        }),
        lease: {
          attemptId: "attempt.local-gateway.1",
          leaseId: "lease.local-gateway.1",
          releasedAt: "2026-06-02T00:04:03.000Z",
          status: "released",
          targetId: desiredState.targetId,
          token: "lease:local-gateway",
        },
        result: {
          ...desiredState,
          alchemy: { app: "formless-instance", scope: "instance.primary", stage: "personal" },
          attemptId: "attempt.local-gateway.1",
          completedAt: "2026-06-02T00:04:03.000Z",
          evidence: [],
          kind: "success",
          runnerId: "local-gateway",
        },
      });
    }

    if (parsedUrl.pathname === "/api/formless/deployments/attempts/failure") {
      const desiredState = deploymentDesiredStateRef();

      return Response.json({
        attempt: deploymentAttempt({ desiredState, status: "failed" }),
        result: {
          ...desiredState,
          actor: {
            actorId: "local-gateway.deploy",
            kind: "cli",
            runnerId: "local-gateway",
          },
          attemptId: "attempt.local-gateway.1",
          failedAt: "2026-06-02T00:04:03.000Z",
          kind: "failure",
          summary: { code: "local-gateway-deploy-apply-failed", displayMessage: "failed" },
        },
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

function deploymentAttempt(input: {
  completedAt?: string;
  desiredState: ReturnType<typeof deploymentDesiredStateRef>;
  status: "failed" | "started" | "succeeded";
}) {
  return {
    ...input.desiredState,
    ...(input.completedAt === undefined ? {} : { completedAt: input.completedAt }),
    actor: {
      actorId: "local-gateway.deploy",
      displayName: "Local workspace gateway",
      kind: "cli",
      runnerId: "local-gateway",
    },
    attemptId: "attempt.local-gateway.1",
    idempotencyKey: "local-gateway-deploy:instance.primary:desired.instance.primary.3",
    mode: "apply",
    startedAt: "2026-06-02T00:04:02.000Z",
    status: input.status,
    updatedAt: "2026-06-02T00:04:03.000Z",
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

async function writeWorkspaceAppArchive(workspaceRoot: string, installId: string, label: string) {
  const archiveRoot = path.join(workspaceRoot, "archives/apps", installId);

  await mkdir(archiveRoot, { recursive: true });
  await writeFile(
    path.join(archiveRoot, PORTABLE_ARCHIVE_MANIFEST_FILE),
    formatAppArchive(appArchive(installId, label)),
  );
}

function appArchive(installId: string, label: string): AppArchive {
  const facts = packageAppFactsForKey("site");

  if (!facts) {
    throw new Error("Missing bundled package facts for site.");
  }

  return {
    kind: APP_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: "2026-05-12T00:00:00.000Z",
    capabilities: ["app-store-snapshots", "core-media-assets"],
    restorePolicy: { dryRun: true, installCollisions: "reject" },
    app: {
      installId,
      packageAppKey: "site",
      packageRevision: facts.packageRevision,
      sourceSchemaKey: "site",
      sourceSchemaHash: facts.sourceSchemaHash,
      label,
      status: "installed",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    },
    data: {
      kind: "storeSnapshot",
      snapshot: snapshot([]),
    },
    media: { objects: [] },
  };
}

function controlPlaneRecords(): StoredRecord[] {
  const installId = "david";
  const now = "2026-05-26T00:00:00.000Z";

  return [
    {
      createdAt: now,
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

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "formless-workspace-operations-test-"));

  tempDirs.push(tempDir);
  return tempDir;
}
