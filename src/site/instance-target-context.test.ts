import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  formatInstanceWorkspaceManifest,
  INSTANCE_WORKSPACE_MANIFEST_FILE,
  type InstanceWorkspaceManifest,
} from "@dpeek/formless-workspace";
import {
  writeInstanceWorkspaceControlPlaneRecordSource,
  writeInstanceWorkspaceSecretState,
} from "@dpeek/formless-workspace/node";
import { describe, expect, it } from "vite-plus/test";
import { INSTANCE_CONTROL_PLANE_SCHEMA_KEY } from "../shared/instance-control-plane.ts";
import type { StoredRecord } from "../shared/protocol.ts";
import {
  resolveSiteCliTargetContext,
  siteCliTargetAcceptHeaders,
} from "./instance-target-context.ts";

describe("Site CLI target context", () => {
  it("prefers explicit admin tokens and redacts display labels", async () => {
    const workspaceRoot = await writeTargetWorkspace({ storedAdminToken: "stored-secret" });
    const context = await resolveSiteCliTargetContext(
      {
        commandName: "status",
        cwd: workspaceRoot,
        explicitAdminToken: " explicit-secret ",
      },
      { env: { FORMLESS_ADMIN_TOKEN: "env-secret" } },
    );

    expect(context.workspaceRoot).toBe(workspaceRoot);
    expect(context.selectedTarget).toEqual({
      alias: "instance.primary",
      url: "https://personal.example",
    });
    expect(context.adminToken).toBe("explicit-secret");
    expect(context.adminTokenSource).toBe("explicit");
    expect(context.adminTokenDisplayLabel).toBe("[redacted]");
    expect(siteCliTargetAcceptHeaders({ adminToken: context.adminToken }).authorization).toBe(
      "Bearer explicit-secret",
    );
    expect(JSON.stringify(context.display)).not.toContain("explicit-secret");
    expect(JSON.stringify(context.display)).not.toContain("env-secret");
    expect(JSON.stringify(context.display)).not.toContain("stored-secret");
  });

  it("uses environment admin tokens before stored secret state", async () => {
    const workspaceRoot = await writeTargetWorkspace({ storedAdminToken: "stored-secret" });
    const context = await resolveSiteCliTargetContext(
      {
        commandName: "status",
        cwd: workspaceRoot,
      },
      { env: { FORMLESS_ADMIN_TOKEN: "env-secret" } },
    );

    expect(context.adminToken).toBe("env-secret");
    expect(context.adminTokenSource).toBe("env");
    expect(context.adminTokenDisplayLabel).toBe("[redacted]");
    expect(JSON.stringify(context.display)).not.toContain("env-secret");
    expect(JSON.stringify(context.display)).not.toContain("stored-secret");
  });

  it("uses stored admin tokens when explicit and environment tokens are missing", async () => {
    const workspaceRoot = await writeTargetWorkspace({ storedAdminToken: "stored-secret" });
    const context = await resolveSiteCliTargetContext(
      {
        commandName: "status",
        cwd: workspaceRoot,
      },
      { env: {} },
    );

    expect(context.adminToken).toBe("stored-secret");
    expect(context.adminTokenSource).toBe("stored");
    expect(context.adminTokenDisplayLabel).toBe("[redacted]");
    expect(JSON.stringify(context.display)).not.toContain("stored-secret");
  });

  it("reports missing admin tokens without adding authorization headers", async () => {
    const workspaceRoot = await writeTargetWorkspace();
    const context = await resolveSiteCliTargetContext(
      {
        commandName: "status",
        cwd: workspaceRoot,
      },
      { env: {} },
    );

    expect(context.adminToken).toBeNull();
    expect(context.adminTokenSource).toBe("missing");
    expect(context.adminTokenDisplayLabel).toBe("missing");
    expect(siteCliTargetAcceptHeaders({ adminToken: context.adminToken })).toEqual({
      accept: "application/json",
    });
  });
});

async function writeTargetWorkspace(input: { storedAdminToken?: string } = {}) {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), "formless-target-context-"));
  const manifest = targetWorkspaceManifest();

  await mkdir(workspaceRoot, { recursive: true });
  await writeFile(
    path.join(workspaceRoot, INSTANCE_WORKSPACE_MANIFEST_FILE),
    formatInstanceWorkspaceManifest(manifest),
  );
  await writeInstanceWorkspaceControlPlaneRecordSource({
    controlPlane: {
      schemaKey: INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
      schemaUpdatedAt: "2026-06-11T00:00:00.000Z",
      records: [deploymentConfigRecord()],
    },
    manifest,
    workspaceRoot,
  });

  if (input.storedAdminToken) {
    await writeInstanceWorkspaceSecretState(workspaceRoot, {
      adminToken: input.storedAdminToken,
    });
  }

  return workspaceRoot;
}

function targetWorkspaceManifest(): InstanceWorkspaceManifest {
  return {
    version: 1,
    kind: "formless-instance-workspace",
    name: "personal-sites",
    source: { records: "records/instance-control-plane" },
    targets: [],
    archives: { instance: "archives/instance", apps: "archives/apps" },
    media: { root: "media" },
    local: { stateRoot: ".formless/local", secretStateRoot: ".formless" },
    defaultAppPolicy: "none",
    apps: [],
  };
}

function deploymentConfigRecord(): StoredRecord {
  const now = "2026-06-11T00:00:00.000Z";

  return {
    id: "instance.primary",
    entity: "deployment-config",
    values: {
      enabled: true,
      label: "Primary instance",
      providerFamily: "cloudflare",
      targetId: "instance.primary",
      targetKind: "instance",
      targetUrl: "https://personal.example",
      createdAt: now,
      updatedAt: now,
    },
    createdAt: now,
  };
}
