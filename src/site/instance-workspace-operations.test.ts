import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import packageJson from "../../package.json";
import {
  FORMLESS_RUNTIME_PROTOCOL_VERSION,
  FORMLESS_STORAGE_MIGRATION_SET_ID,
} from "../shared/deploy-metadata.ts";
import { packageAppFactsForKey, listBundledAppPackages } from "../shared/app-installs.ts";
import {
  STORE_SNAPSHOT_KIND,
  STORE_SNAPSHOT_VERSION,
  type StoredRecord,
} from "../shared/protocol.ts";
import {
  FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE,
  formatFormlessInstanceWorkspaceManifest,
} from "./instance-workspace-config.ts";
import { siteSourceSchema } from "../test/schema-apps.ts";
import {
  createFormlessWorkspaceOperationState,
  formlessWorkspaceOperationStatePath,
  listFormlessWorkspaceOperationStates,
  readFormlessWorkspaceOperationState,
  runFormlessWorkspaceOperation,
  updateFormlessWorkspaceOperationState,
} from "./instance-workspace-operations.ts";

const tempDirs: string[] = [];

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
    fetch?: typeof fetch;
    operationIds?: string[];
    timestamps?: string[];
  } = {},
) {
  const operationIds = [...(options.operationIds ?? [])];

  return {
    createOperationId: () => operationIds.shift() ?? "op_test_00000000",
    cwd,
    fetch: options.fetch ?? fetch,
    now: timestampSequence(...(options.timestamps ?? ["2026-06-02T00:00:00.000Z"])),
  };
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

function snapshot(records: StoredRecord[]) {
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
