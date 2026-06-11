import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_ENTITIES,
  defaultInstanceWorkspaceManifest,
  instanceWorkspaceControlPlaneRecordSourceRelativePath,
  type InstanceWorkspaceControlPlaneRecordSourceControlPlane,
  type InstanceWorkspaceStoredRecord,
} from "./index.ts";
import {
  instanceWorkspaceControlPlaneRecordSourcePath,
  readInstanceWorkspaceControlPlaneRecordSource,
  writeInstanceWorkspaceControlPlaneRecordSource,
} from "./node.ts";

const now = "2026-06-02T00:00:00.000Z";
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
});

describe("instance workspace control-plane record source", () => {
  it("writes deterministic entity files and round-trips supported control-plane records", async () => {
    const workspaceRoot = await makeTempDir();
    const manifest = defaultInstanceWorkspaceManifest({ name: "personal" });

    await writeInstanceWorkspaceControlPlaneRecordSource({
      controlPlane: controlPlaneSourceRecords(),
      manifest,
      workspaceRoot,
    });

    expect(
      INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_ENTITIES.map((entity) =>
        instanceWorkspaceControlPlaneRecordSourceRelativePath(manifest, entity),
      ),
    ).toEqual([
      "records/instance-control-plane/app-install.json",
      "records/instance-control-plane/route.json",
      "records/instance-control-plane/deployment-config.json",
    ]);

    const appInstallFile = JSON.parse(
      await readFile(
        instanceWorkspaceControlPlaneRecordSourcePath(workspaceRoot, manifest, "app-install"),
        "utf8",
      ),
    ) as {
      entity: string;
      records: InstanceWorkspaceStoredRecord[];
    };

    expect(appInstallFile.entity).toBe("instance:app-install");
    expect(appInstallFile.records.map((record) => `${record.entity}:${record.id}`)).toEqual([
      "instance:app-install:site",
    ]);

    const read = await readInstanceWorkspaceControlPlaneRecordSource({ manifest, workspaceRoot });

    expect(read?.schemaKey).toBe("instance-control-plane");
    expect(read?.schemaUpdatedAt).toBe(now);
    expect(read?.records.map((record) => `${record.entity}:${record.id}`)).toEqual([
      "app-install:site",
      "route:route:site:public-site",
      "deployment-config:instance.primary",
    ]);
  });

  it("rejects unsupported files, secret-looking values, identity drift, and route conflicts", async () => {
    const workspaceRoot = await makeTempDir();
    const manifest = defaultInstanceWorkspaceManifest({ name: "personal" });

    await mkdir(path.join(workspaceRoot, manifest.source.records), { recursive: true });
    await writeFile(path.join(workspaceRoot, manifest.source.records, "deploy-attempt.json"), "{}");

    await expect(
      readInstanceWorkspaceControlPlaneRecordSource({ manifest, workspaceRoot }),
    ).rejects.toThrow(
      'Workspace control-plane record source records/instance-control-plane has unsupported file "deploy-attempt.json".',
    );

    await rm(path.join(workspaceRoot, manifest.source.records), { force: true, recursive: true });
    await expect(
      writeInstanceWorkspaceControlPlaneRecordSource({
        controlPlane: controlPlaneSourceRecords({
          deploymentConfigValues: { credentialRef: "CF_API_TOKEN" },
        }),
        manifest,
        workspaceRoot,
      }),
    ).rejects.toThrow("cannot store control-plane secret values");

    await expect(
      writeInstanceWorkspaceControlPlaneRecordSource({
        controlPlane: controlPlaneSourceRecords({
          deploymentConfigValues: {
            credentialRef: JSON.stringify({ providerState: { rawLeaseToken: "lease-token" } }),
          },
        }),
        manifest,
        workspaceRoot,
      }),
    ).rejects.toThrow("cannot store control-plane secret values");

    await expect(
      writeInstanceWorkspaceControlPlaneRecordSource({
        controlPlane: controlPlaneSourceRecords({
          appInstallValues: { installId: "renamed" },
        }),
        manifest,
        workspaceRoot,
      }),
    ).rejects.toThrow(
      'Workspace control-plane record source record "site" field "instance:app-install.installId" must match record id.',
    );

    await expect(
      writeInstanceWorkspaceControlPlaneRecordSource({
        controlPlane: controlPlaneSourceRecords({
          extraRecords: [
            {
              ...routeRecord("route:site:admin-conflict", {
                matchPath: "/sites/site",
              }),
            },
          ],
        }),
        manifest,
        workspaceRoot,
      }),
    ).rejects.toThrow(
      'enabled route match "<hostless>/sites/site /sites/site/" conflicts with enabled route',
    );
  });

  it("omits deployment execution history and observation cache from record source files", async () => {
    const workspaceRoot = await makeTempDir();
    const manifest = defaultInstanceWorkspaceManifest({ name: "personal" });

    await writeInstanceWorkspaceControlPlaneRecordSource({
      controlPlane: controlPlaneSourceRecords({
        deploymentConfigValues: {
          observedAt: now,
          observedDesiredStateHash:
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          observedError: "none",
          observedRunnerId: "local-gateway",
          observedStatus: "deployed",
          observedSummary: "Deployed revision 2",
        },
        extraRecords: [
          executionHistoryRecord("deploy-attempt", "attempt.1"),
          executionHistoryRecord("deploy-evidence-summary", "evidence.1"),
          executionHistoryRecord("deploy-drift-report", "drift.1"),
        ],
      }),
      manifest,
      workspaceRoot,
    });

    const read = await readInstanceWorkspaceControlPlaneRecordSource({ manifest, workspaceRoot });
    const sourceContents = await Promise.all(
      INSTANCE_WORKSPACE_CONTROL_PLANE_RECORD_SOURCE_ENTITIES.map((entity) =>
        readFile(
          instanceWorkspaceControlPlaneRecordSourcePath(workspaceRoot, manifest, entity),
          "utf8",
        ),
      ),
    );

    expect(read?.records.map((record) => record.entity)).not.toContain("deploy-attempt");
    expect(sourceContents.join("\n")).not.toContain("deploy-attempt");
    expect(sourceContents.join("\n")).not.toContain("deploy-evidence-summary");
    expect(sourceContents.join("\n")).not.toContain("deploy-drift-report");
    expect(sourceContents.join("\n")).not.toContain("observedStatus");
    expect(sourceContents.join("\n")).not.toContain("observedDesiredStateHash");

    const deploymentConfigPath = instanceWorkspaceControlPlaneRecordSourcePath(
      workspaceRoot,
      manifest,
      "deployment-config",
    );
    const deploymentConfigFile = JSON.parse(await readFile(deploymentConfigPath, "utf8")) as {
      records: InstanceWorkspaceStoredRecord[];
    };
    deploymentConfigFile.records[0] = {
      ...deploymentConfigFile.records[0]!,
      values: {
        ...deploymentConfigFile.records[0]!.values,
        observedStatus: "deployed",
      },
    };
    await writeFile(deploymentConfigPath, JSON.stringify(deploymentConfigFile, null, 2));

    await expect(
      readInstanceWorkspaceControlPlaneRecordSource({ manifest, workspaceRoot }),
    ).rejects.toThrow(
      'Workspace control-plane record source records record "instance.primary" includes unknown field "instance:deployment-config.observedStatus".',
    );
  });
});

function controlPlaneSourceRecords(
  options: {
    appInstallValues?: Partial<InstanceWorkspaceStoredRecord["values"]>;
    deploymentConfigValues?: Partial<InstanceWorkspaceStoredRecord["values"]>;
    extraRecords?: InstanceWorkspaceStoredRecord[];
  } = {},
): InstanceWorkspaceControlPlaneRecordSourceControlPlane {
  const records: InstanceWorkspaceStoredRecord[] = [
    {
      id: "site",
      entity: "app-install",
      values: {
        installId: "site",
        packageAppKey: "site",
        packageRevision: 1,
        sourceSchemaHash: "sha256:site",
        label: "Site",
        status: "installed",
        storageIdentity: "app:site",
        createdAt: now,
        updatedAt: now,
        ...options.appInstallValues,
      },
      createdAt: now,
    },
    routeRecord("route:site:public-site", {
      matchPath: "/sites/site",
      matchPrefix: "/sites/site/",
      targetProfile: "public-site",
      appInstall: "site",
      surface: "public-site",
    }),
    {
      id: "instance.primary",
      entity: "deployment-config",
      values: {
        targetId: "instance.primary",
        targetKind: "instance",
        label: "Primary",
        enabled: true,
        targetUrl: "https://personal.dpeek.workers.dev",
        providerFamily: "cloudflare",
        accountId: "account-123",
        workerName: "personal",
        createdAt: now,
        updatedAt: now,
        ...options.deploymentConfigValues,
      },
      createdAt: now,
    },
    ...(options.extraRecords ?? []),
  ];

  return {
    schemaKey: "instance-control-plane",
    schemaUpdatedAt: now,
    records,
  };
}

function routeRecord(
  id: string,
  values: Partial<InstanceWorkspaceStoredRecord["values"]>,
): InstanceWorkspaceStoredRecord {
  return {
    id,
    entity: "route",
    values: {
      enabled: true,
      matchPath: "/apps/site",
      kind: "mount",
      targetProfile: "app",
      appInstall: "site",
      surface: "admin",
      createdAt: now,
      updatedAt: now,
      ...values,
    },
    createdAt: now,
  };
}

function executionHistoryRecord(entity: string, id: string): InstanceWorkspaceStoredRecord {
  return {
    id,
    entity,
    values: {
      createdAt: now,
      updatedAt: now,
    },
    createdAt: now,
  };
}

async function makeTempDir() {
  const tempDir = await mkdtemp(path.join(tmpdir(), "formless-record-source-test-"));

  tempDirs.push(tempDir);

  return tempDir;
}
