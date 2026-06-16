import path from "node:path";

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { findResolvedAppPackage } from "../../../src/shared/app-packages.ts";
import { writeWorkspaceAppPackageFixture } from "../../../src/test/workspace-app-package.ts";
import {
  INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME,
  INSTANCE_WORKSPACE_GITIGNORE_ENTRY,
  INSTANCE_WORKSPACE_LOCAL_DEV_SECRET_STATE_PATH,
  INSTANCE_WORKSPACE_OWNER_SESSION_SECRET_ENV_NAME,
  INSTANCE_WORKSPACE_SECRET_STATE_PATH,
  WORKSPACE_PACKAGE_LINKS_FILE,
  createWorkspaceAppPackageResolver,
  createWorkspaceOperationState,
  defaultWorkspacePackageLinks,
  ensureInstanceWorkspaceLocalDevSecretState,
  ensureInstanceWorkspaceSecretStateIgnored,
  formatWorkspacePackageLinks,
  formatInstanceWorkspaceLocalDevSecretState,
  formatInstanceWorkspaceSecretState,
  instanceWorkspaceLocalDevSecretStatePath,
  instanceWorkspaceSecretStatePath,
  parseInstanceWorkspaceLocalDevSecretState,
  parseInstanceWorkspaceSecretState,
  readWorkspacePackageLinks,
  readWorkspaceOperationState,
  readInstanceWorkspaceLocalDevSecretState,
  readInstanceWorkspaceSecretState,
  resolveInstanceWorkspaceAdminToken,
  listWorkspaceOperationStates,
  updateWorkspaceOperationState,
  workspaceOperationStatePath,
  workspaceOperationStateRoot,
  writeInstanceWorkspaceLocalDevSecretState,
  writeInstanceWorkspaceSecretState,
} from "./node.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
});

describe("Formless instance workspace secret state", () => {
  it("defines the ignored workspace secret path", () => {
    expect(INSTANCE_WORKSPACE_SECRET_STATE_PATH).toBe(".formless/instance.env");
    expect(INSTANCE_WORKSPACE_LOCAL_DEV_SECRET_STATE_PATH).toBe(".formless/local/dev.env");
    expect(INSTANCE_WORKSPACE_GITIGNORE_ENTRY).toBe(".formless/");
    expect(instanceWorkspaceSecretStatePath("/workspace")).toBe(
      path.join("/workspace", ".formless/instance.env"),
    );
    expect(instanceWorkspaceLocalDevSecretStatePath("/workspace/.formless/local")).toBe(
      path.join("/workspace/.formless/local", "dev.env"),
    );
  });

  it("parses and formats automation admin token env state", () => {
    const parsed = parseInstanceWorkspaceSecretState(
      '# local instance secrets\nFORMLESS_ADMIN_TOKEN="admin secret"\n',
    );

    expect(parsed).toEqual({ adminToken: "admin secret" });
    expect(formatInstanceWorkspaceSecretState(parsed)).toBe(
      'FORMLESS_ADMIN_TOKEN="admin secret"\n',
    );
    expect(formatInstanceWorkspaceSecretState({})).toBe("");
    expect(INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME).toBe("FORMLESS_ADMIN_TOKEN");
    expect(INSTANCE_WORKSPACE_OWNER_SESSION_SECRET_ENV_NAME).toBe("FORMLESS_OWNER_SESSION_SECRET");
  });

  it("reads, writes, and completes ignored local dev secret state", async () => {
    const workspaceRoot = await makeTempDir();
    const localStateRoot = path.join(workspaceRoot, ".formless/local");

    expect(
      parseInstanceWorkspaceLocalDevSecretState(
        "FORMLESS_ADMIN_TOKEN=admin\nFORMLESS_OWNER_SESSION_SECRET=session\n",
      ),
    ).toEqual({ adminToken: "admin", ownerSessionSecret: "session" });
    expect(
      formatInstanceWorkspaceLocalDevSecretState({
        adminToken: "admin",
        ownerSessionSecret: "session",
      }),
    ).toBe("FORMLESS_ADMIN_TOKEN=admin\nFORMLESS_OWNER_SESSION_SECRET=session\n");
    await expect(readInstanceWorkspaceLocalDevSecretState(localStateRoot)).resolves.toEqual({});

    const write = await writeInstanceWorkspaceLocalDevSecretState(localStateRoot, {
      adminToken: "persisted-admin",
      ownerSessionSecret: "persisted-session",
    });

    expect(write).toEqual({
      path: path.join(workspaceRoot, ".formless/local/dev.env"),
      state: {
        adminToken: "persisted-admin",
        ownerSessionSecret: "persisted-session",
      },
    });
    await expect(readFile(write.path, "utf8")).resolves.toBe(
      "FORMLESS_ADMIN_TOKEN=persisted-admin\nFORMLESS_OWNER_SESSION_SECRET=persisted-session\n",
    );

    await writeFile(write.path, "FORMLESS_ADMIN_TOKEN=persisted-admin\n");
    await expect(
      ensureInstanceWorkspaceLocalDevSecretState(
        workspaceRoot,
        localStateRoot,
        () => "generated-session",
      ),
    ).resolves.toMatchObject({
      state: {
        adminToken: "persisted-admin",
        ownerSessionSecret: "generated-session",
      },
    });
    await expect(readFile(path.join(workspaceRoot, ".gitignore"), "utf8")).resolves.toBe(
      ".formless/\n",
    );
  });

  it("resolves explicit and environment token overrides before ignored state", () => {
    expect(
      resolveInstanceWorkspaceAdminToken({
        env: { FORMLESS_ADMIN_TOKEN: "env-token" },
        explicitAdminToken: "explicit-token",
        secretState: { adminToken: "state-token" },
      }),
    ).toBe("explicit-token");
    expect(
      resolveInstanceWorkspaceAdminToken({
        env: { FORMLESS_ADMIN_TOKEN: "env-token" },
        secretState: { adminToken: "state-token" },
      }),
    ).toBe("env-token");
    expect(
      resolveInstanceWorkspaceAdminToken({
        env: {},
        secretState: { adminToken: "state-token" },
      }),
    ).toBe("state-token");
    expect(
      resolveInstanceWorkspaceAdminToken({
        env: {},
        secretState: {},
      }),
    ).toBeNull();
  });

  it("reads and writes ignored workspace secret state", async () => {
    const workspaceRoot = await makeTempDir();

    await expect(readInstanceWorkspaceSecretState(workspaceRoot)).resolves.toEqual({});

    const write = await writeInstanceWorkspaceSecretState(workspaceRoot, {
      adminToken: "secret",
    });

    expect(write).toEqual({
      path: path.join(workspaceRoot, ".formless/instance.env"),
      state: { adminToken: "secret" },
    });
    await expect(readFile(write.path, "utf8")).resolves.toBe("FORMLESS_ADMIN_TOKEN=secret\n");
    await expect(readInstanceWorkspaceSecretState(workspaceRoot)).resolves.toEqual({
      adminToken: "secret",
    });
  });

  it("ensures workspace secret state is ignored without duplicates", async () => {
    const workspaceRoot = await makeTempDir();

    await writeFile(path.join(workspaceRoot, ".gitignore"), "dist\n");
    await ensureInstanceWorkspaceSecretStateIgnored(workspaceRoot);
    await ensureInstanceWorkspaceSecretStateIgnored(workspaceRoot);

    await expect(readFile(path.join(workspaceRoot, ".gitignore"), "utf8")).resolves.toBe(
      "dist\n.formless/\n",
    );

    const existingRoot = await makeTempDir();

    await writeFile(path.join(existingRoot, ".gitignore"), ".formless\nnode_modules\n");
    await ensureInstanceWorkspaceSecretStateIgnored(existingRoot);
    await expect(readFile(path.join(existingRoot, ".gitignore"), "utf8")).resolves.toBe(
      ".formless\nnode_modules\n",
    );
  });
});

describe("workspace app package source resolver", () => {
  it("defaults to bundled packages when package links are omitted", async () => {
    const workspaceRoot = await makeTempDir();
    const result = await createWorkspaceAppPackageResolver({ workspaceRoot });

    await expect(readWorkspacePackageLinks(workspaceRoot)).resolves.toEqual(
      defaultWorkspacePackageLinks(),
    );
    expect(result.packageLinks).toEqual(defaultWorkspacePackageLinks());
    expect(result.linkedPackages).toEqual([]);
    expect(result.resolver.findPackage("site")).toMatchObject({
      packageAppKey: "site",
      sourceOrigin: "bundled",
    });
    expect(result.resolver.findPackage("private-labs")).toBeUndefined();
  });

  it("reads sibling linked package manifests, source schemas, and seed records", async () => {
    const root = await makeTempDir();
    const workspaceRoot = path.join(root, "instance");
    const packageRoot = path.join(root, "app");

    await writeWorkspacePackageLinks(workspaceRoot, "../app/formless.app.json");
    const fixture = await writeWorkspaceAppPackageFixture(packageRoot);

    const result = await createWorkspaceAppPackageResolver({ workspaceRoot });
    const linkedPackage = result.linkedPackages[0];

    expect(findResolvedAppPackage("private-labs")).toBeUndefined();
    expect(result.resolver.findPackage("private-labs")).toMatchObject({
      defaultInstallId: "labs",
      label: "Private Labs",
      packageAppKey: "private-labs",
      packageRevision: 7,
      seedRecordsKey: "private-labs",
      sourceOrigin: "workspace",
      sourceSchemaHash: fixture.sourceSchemaHash,
      sourceSchemaKey: "private-labs",
    });
    expect(result.resolver.listPackages().map((appPackage) => appPackage.packageAppKey)).toEqual([
      "site",
      "tasks",
      "crm",
      "private-labs",
    ]);
    expect(linkedPackage).toMatchObject({
      appPackage: expect.objectContaining({ packageAppKey: "private-labs" }),
      manifest: expect.objectContaining({ packageAppKey: "private-labs" }),
      manifestPath: path.join(packageRoot, "formless.app.json"),
      packageRoot,
      seedRecordsPath: path.join(packageRoot, "source/seed-records.json"),
      sourceSchemaHash: fixture.sourceSchemaHash,
      sourceSchemaPath: path.join(packageRoot, "source/schema.json"),
    });
    expect(linkedPackage?.sourceSchema.entities.task).toBeDefined();
    expect(linkedPackage?.seedRecords.map((record) => record.entity)).toEqual([
      "task",
      "task",
      "task",
      "task",
      "task",
    ]);
  });

  it("links a package outside the workspace root through workspace package links", async () => {
    const root = await makeTempDir();
    const workspaceRoot = path.join(root, "instance");
    const packageRoot = path.join(root, "packages/client-orders");
    const fixture = await writeWorkspaceAppPackageFixture(packageRoot, {
      defaultInstallId: "orders",
      label: "Client Orders",
      packageAppKey: "client-orders",
      packageRevision: 3,
    });
    const manifestLink = path.relative(workspaceRoot, fixture.manifestPath);

    await writeWorkspacePackageLinks(workspaceRoot, manifestLink);

    const result = await createWorkspaceAppPackageResolver({ workspaceRoot });
    const linkedPackage = result.linkedPackages[0];

    expect(findResolvedAppPackage("client-orders")).toBeUndefined();
    expect(result.resolver.findPackage("client-orders")).toMatchObject({
      defaultInstallId: "orders",
      label: "Client Orders",
      packageAppKey: "client-orders",
      packageRevision: 3,
      seedRecordsKey: "client-orders",
      sourceOrigin: "workspace",
      sourceSchemaHash: fixture.sourceSchemaHash,
      sourceSchemaKey: "client-orders",
    });
    expect(result.resolver.listPackages().map((appPackage) => appPackage.packageAppKey)).toEqual([
      "site",
      "tasks",
      "crm",
      "client-orders",
    ]);
    expect(linkedPackage).toMatchObject({
      appPackage: expect.objectContaining({ packageAppKey: "client-orders" }),
      manifest: expect.objectContaining({ packageAppKey: "client-orders" }),
      manifestPath: fixture.manifestPath,
      packageRoot,
      seedRecordsPath: fixture.seedRecordsPath,
      sourceSchemaHash: fixture.sourceSchemaHash,
      sourceSchemaPath: fixture.sourceSchemaPath,
    });
    expect(linkedPackage?.sourceSchema.entities.task).toBeDefined();
    expect(linkedPackage?.seedRecords).toEqual(fixture.seedRecords);
  });

  it("rejects linked source schemas that do not parse as app schemas", async () => {
    const root = await makeTempDir();
    const workspaceRoot = path.join(root, "instance");
    const packageRoot = path.join(root, "app");
    const invalidSchema = { version: 1 };

    await writeWorkspacePackageLinks(workspaceRoot, "../app/formless.app.json");
    await writeWorkspaceAppPackageFixture(packageRoot, { sourceSchema: invalidSchema });

    await expect(createWorkspaceAppPackageResolver({ workspaceRoot })).rejects.toThrow(
      'Schema must include "entities".',
    );
  });

  it("rejects linked seed records that do not match the source schema", async () => {
    const root = await makeTempDir();
    const workspaceRoot = path.join(root, "instance");
    const packageRoot = path.join(root, "app");

    await writeWorkspacePackageLinks(workspaceRoot, "../app/formless.app.json");
    await writeWorkspaceAppPackageFixture(packageRoot, {
      seedRecords: [
        {
          id: "rec_private_invalid",
          entity: "task",
          values: { missing: "field", title: "Invalid task", done: false },
          createdAt: "2026-06-01T00:00:00.000Z",
        },
      ],
    });

    await expect(createWorkspaceAppPackageResolver({ workspaceRoot })).rejects.toThrow(
      'values include unknown field "task.missing"',
    );
  });

  it("rejects linked source schema hash mismatches", async () => {
    const root = await makeTempDir();
    const workspaceRoot = path.join(root, "instance");
    const packageRoot = path.join(root, "app");

    await writeWorkspacePackageLinks(workspaceRoot, "../app/formless.app.json");
    await writeWorkspaceAppPackageFixture(packageRoot, {
      sourceSchemaHash: `sha256:${"2".repeat(64)}`,
    });

    await expect(createWorkspaceAppPackageResolver({ workspaceRoot })).rejects.toThrow(
      /does not match manifest sourceSchemaHash/,
    );
  });
});

describe("workspace operation node state", () => {
  it("creates, updates, reads, and lists ignored operation state files", async () => {
    const workspaceRoot = await makeTempDir();
    const now = timestampSequence("2026-06-02T00:00:00.000Z", "2026-06-02T00:00:01.000Z");
    const state = await createWorkspaceOperationState({
      actor: "browser",
      id: "op_status_00000001",
      input: { targetAlias: "remote" },
      now,
      operation: "status",
      workspaceRoot,
    });

    expect(workspaceOperationStateRoot(workspaceRoot)).toBe(
      path.join(workspaceRoot, ".formless/operations"),
    );
    expect(workspaceOperationStatePath(workspaceRoot, state.id)).toBe(
      path.join(workspaceRoot, ".formless/operations/op_status_00000001.json"),
    );
    await expect(readFile(path.join(workspaceRoot, ".gitignore"), "utf8")).resolves.toBe(
      ".formless/\n",
    );

    const updated = await updateWorkspaceOperationState(state.id, {
      logs: [{ at: now(), level: "info", message: `${workspaceRoot}/status.log` }],
      status: "running",
      workspaceRoot,
    });
    const persistedText = await readFile(
      workspaceOperationStatePath(workspaceRoot, state.id),
      "utf8",
    );

    expect(updated).toMatchObject({
      actor: "browser",
      id: "op_status_00000001",
      logs: [
        {
          id: "op_status_00000001-log-1",
          message: "<workspace>/status.log",
        },
      ],
      operation: "status",
      startedAt: "2026-06-02T00:00:01.000Z",
      status: "running",
      workspace: { label: path.basename(workspaceRoot) },
    });
    await expect(
      readWorkspaceOperationState({ operationId: state.id, workspaceRoot }),
    ).resolves.toEqual(updated);
    expect(await listWorkspaceOperationStates(workspaceRoot)).toEqual([updated]);
    expect(persistedText).not.toContain(workspaceRoot);
  });

  it("returns no operation states when the ignored state directory is absent", async () => {
    await expect(listWorkspaceOperationStates(await makeTempDir())).resolves.toEqual([]);
    expect(() => workspaceOperationStatePath("/workspace", "../secret")).toThrow(
      "Workspace operation id is invalid.",
    );
  });
});

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "instance-workspace-node-test-"));

  tempDirs.push(tempDir);
  await mkdir(tempDir, { recursive: true });

  return tempDir;
}

async function writeWorkspacePackageLinks(workspaceRoot: string, manifest: string): Promise<void> {
  await mkdir(workspaceRoot, { recursive: true });
  await writeFile(
    path.join(workspaceRoot, WORKSPACE_PACKAGE_LINKS_FILE),
    formatWorkspacePackageLinks({
      ...defaultWorkspacePackageLinks(),
      links: [{ manifest }],
    }),
  );
}

function timestampSequence(...timestamps: string[]): () => string {
  let index = 0;

  return () =>
    timestamps[index++ % timestamps.length] ?? timestamps.at(-1) ?? new Date(0).toISOString();
}
