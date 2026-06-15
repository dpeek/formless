import path from "node:path";

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vite-plus/test";

import rawTaskSeedRecords from "../../../schema/apps/tasks/seed-records.json";
import rawTaskSourceSchema from "../../../schema/apps/tasks/schema.json";
import {
  appPackageManifestKind,
  appPackageManifestVersion,
  findResolvedAppPackage,
} from "../../../src/shared/app-packages.ts";
import { computeSourceSchemaHash } from "../../../src/shared/upgrade-migrations.ts";
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
    const sourceSchemaHash = await computeSourceSchemaHash(rawTaskSourceSchema);

    await writeWorkspacePackageLinks(workspaceRoot, "../app/formless.app.json");
    await writePrivatePackageFixture(packageRoot);

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
      sourceSchemaHash,
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
      sourceSchemaHash,
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

  it("links the sibling ClearTrace package through workspace package links", async () => {
    const workspaceRoot = await makeTempDir();
    const manifestPath = "/Users/dpeek/code/cleartrace/formless.app.json";
    const manifestLink = path.relative(workspaceRoot, manifestPath);

    await writeWorkspacePackageLinks(workspaceRoot, manifestLink);

    const result = await createWorkspaceAppPackageResolver({ workspaceRoot });
    const linkedPackage = result.linkedPackages[0];

    expect(findResolvedAppPackage("cleartrace")).toBeUndefined();
    expect(result.resolver.findPackage("cleartrace")).toMatchObject({
      defaultInstallId: "cleartrace",
      label: "ClearTrace",
      packageAppKey: "cleartrace",
      packageRevision: 1,
      seedRecordsKey: "cleartrace",
      sourceOrigin: "workspace",
      sourceSchemaHash: "sha256:534fa538ac1bc45409c12dfdb0f798520c1824d1f81dc37c7695b8eba4adaade",
      sourceSchemaKey: "cleartrace",
    });
    expect(result.resolver.listPackages().map((appPackage) => appPackage.packageAppKey)).toEqual([
      "site",
      "tasks",
      "crm",
      "cleartrace",
    ]);
    expect(linkedPackage).toMatchObject({
      appPackage: expect.objectContaining({ packageAppKey: "cleartrace" }),
      manifest: expect.objectContaining({ packageAppKey: "cleartrace" }),
      manifestPath,
      packageRoot: "/Users/dpeek/code/cleartrace",
      seedRecordsPath: "/Users/dpeek/code/cleartrace/seed-records.json",
      sourceSchemaHash: "sha256:534fa538ac1bc45409c12dfdb0f798520c1824d1f81dc37c7695b8eba4adaade",
      sourceSchemaPath: "/Users/dpeek/code/cleartrace/schema.json",
    });
    expect(linkedPackage?.sourceSchema.entities.order?.label).toBe("Order");
    expect(
      linkedPackage?.seedRecords.some((record) => record.id === "rec_cleartrace_customer_ada"),
    ).toBe(true);
  });

  it("rejects linked source schemas that do not parse as app schemas", async () => {
    const root = await makeTempDir();
    const workspaceRoot = path.join(root, "instance");
    const packageRoot = path.join(root, "app");
    const invalidSchema = { version: 1 };

    await writeWorkspacePackageLinks(workspaceRoot, "../app/formless.app.json");
    await writePrivatePackageFixture(packageRoot, { sourceSchema: invalidSchema });

    await expect(createWorkspaceAppPackageResolver({ workspaceRoot })).rejects.toThrow(
      'Schema must include "entities".',
    );
  });

  it("rejects linked seed records that do not match the source schema", async () => {
    const root = await makeTempDir();
    const workspaceRoot = path.join(root, "instance");
    const packageRoot = path.join(root, "app");

    await writeWorkspacePackageLinks(workspaceRoot, "../app/formless.app.json");
    await writePrivatePackageFixture(packageRoot, {
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
    await writePrivatePackageFixture(packageRoot, {
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

async function writePrivatePackageFixture(
  packageRoot: string,
  options: {
    manifestOverrides?: Record<string, unknown>;
    seedRecords?: unknown;
    sourceSchema?: unknown;
    sourceSchemaHash?: string;
  } = {},
): Promise<void> {
  const sourceRoot = path.join(packageRoot, "source");
  const sourceSchema = options.sourceSchema ?? rawTaskSourceSchema;
  const seedRecords = options.seedRecords ?? rawTaskSeedRecords;
  const sourceSchemaHash =
    options.sourceSchemaHash ?? (await computeSourceSchemaHash(sourceSchema));

  await mkdir(sourceRoot, { recursive: true });
  await writeJsonFile(path.join(sourceRoot, "schema.json"), sourceSchema);
  await writeJsonFile(path.join(sourceRoot, "seed-records.json"), seedRecords);
  await writeJsonFile(
    path.join(packageRoot, "formless.app.json"),
    privatePackageManifest({
      sourceSchemaHash,
      ...options.manifestOverrides,
    }),
  );
}

function privatePackageManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: appPackageManifestKind,
    version: appPackageManifestVersion,
    packageAppKey: "private-labs",
    label: "Private Labs",
    description: "Private lab package fixture.",
    defaultInstallId: "labs",
    supportsMultipleInstalls: false,
    packageRevision: 7,
    sourceSchema: {
      kind: "workspace",
      key: "private-labs",
      path: "source/schema.json",
    },
    seedRecords: {
      kind: "workspace",
      key: "private-labs",
      path: "source/seed-records.json",
    },
    sourceSchemaHash: `sha256:${"0".repeat(64)}`,
    capabilities: [
      {
        kind: "generatedAdmin",
        routeBase: "/apps",
      },
    ],
    ...overrides,
  };
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function timestampSequence(...timestamps: string[]): () => string {
  let index = 0;

  return () =>
    timestamps[index++ % timestamps.length] ?? timestamps.at(-1) ?? new Date(0).toISOString();
}
