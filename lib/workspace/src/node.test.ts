import path from "node:path";

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  appPackageManifestKind,
  appPackageManifestVersion,
  computeSourceSchemaHash,
  createAppPackageResolver,
  findResolvedAppPackage,
  parseAppPackageManifest,
  type AppPackageCapability,
  type AppPackageManifest,
  type SourceSchemaHash,
} from "@dpeek/formless-installed-apps";
import {
  INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME,
  INSTANCE_WORKSPACE_AUTO_SAVE_STATE_PATH,
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
  initialWorkspaceAutoSaveState,
  instanceWorkspaceAutoSaveStatePath,
  instanceWorkspaceLocalDevSecretStatePath,
  instanceWorkspaceSecretStatePath,
  nextWorkspaceAutoSaveEnqueuedState,
  parseInstanceWorkspaceLocalDevSecretState,
  parseInstanceWorkspaceSecretState,
  readInstanceWorkspaceAutoSaveState,
  readWorkspacePackageLinks,
  readWorkspaceOperationState,
  readInstanceWorkspaceLocalDevSecretState,
  readInstanceWorkspaceSecretState,
  resolveInstanceWorkspaceAdminToken,
  listWorkspaceOperationStates,
  updateWorkspaceOperationState,
  workspaceOperationStatePath,
  workspaceOperationStateRoot,
  writeInstanceWorkspaceAutoSaveState,
  writeInstanceWorkspaceLocalDevSecretState,
  writeInstanceWorkspaceSecretState,
} from "./node.ts";

const tempDirs: string[] = [];
const workspaceTestBundledManifests = [
  workspaceTestPackageManifest({
    label: "Site",
    packageAppKey: "site",
    publicSite: true,
    sourceSchemaHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
  }),
  workspaceTestPackageManifest({
    label: "Tasks",
    packageAppKey: "tasks",
    sourceSchemaHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
  }),
  workspaceTestPackageManifest({
    label: "CRM",
    packageAppKey: "crm",
    sourceSchemaHash: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
  }),
];
const workspaceFixtureTaskSourceSchema = {
  version: 1,
  entities: {
    task: {
      label: "Task",
      fields: {
        title: { type: "text", required: true, label: "Title" },
        done: { type: "boolean", required: true, label: "Done" },
      },
      mutations: {
        create: { enabled: true },
        patch: { enabled: true },
        delete: { enabled: true },
      },
    },
  },
  queries: {
    taskAll: { label: "Tasks", entity: "task", expression: { kind: "all" } },
  },
  itemViews: {
    taskItem: {
      entity: "task",
      fields: {
        title: { editor: "text", commit: "field-commit" },
      },
    },
  },
  tableViews: {},
  views: {
    taskList: {
      type: "collection",
      label: "Tasks",
      entity: "task",
      queries: [{ query: "taskAll" }],
      defaultQuery: "taskAll",
      result: { type: "list", itemView: "taskItem" },
    },
  },
  screens: {
    home: {
      type: "workspace",
      label: "Home",
      layout: {
        type: "stack",
        sections: [{ id: "tasks", type: "collection", view: "taskList" }],
      },
    },
  },
};
const workspaceFixtureTaskSeedRecords = [
  workspaceFixtureTaskRecord("rec_task_overdue", "Review overdue proposal", false),
  workspaceFixtureTaskRecord("rec_task_today", "Plan today's delivery", false),
  workspaceFixtureTaskRecord("rec_task_later", "Schedule design review", false),
  workspaceFixtureTaskRecord("rec_task_completed", "Send signed kickoff notes", true),
  workspaceFixtureTaskRecord("rec_task_backlog", "Capture research notes", false),
];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
});

describe("Formless instance workspace secret state", () => {
  it("defines the ignored workspace secret path", () => {
    expect(INSTANCE_WORKSPACE_SECRET_STATE_PATH).toBe(".formless/instance.env");
    expect(INSTANCE_WORKSPACE_LOCAL_DEV_SECRET_STATE_PATH).toBe(".formless/local/dev.env");
    expect(INSTANCE_WORKSPACE_AUTO_SAVE_STATE_PATH).toBe(".formless/local/auto-save.json");
    expect(INSTANCE_WORKSPACE_GITIGNORE_ENTRY).toBe(".formless/");
    expect(instanceWorkspaceSecretStatePath("/workspace")).toBe(
      path.join("/workspace", ".formless/instance.env"),
    );
    expect(instanceWorkspaceLocalDevSecretStatePath("/workspace/.formless/local")).toBe(
      path.join("/workspace/.formless/local", "dev.env"),
    );
    expect(instanceWorkspaceAutoSaveStatePath("/workspace/.formless/local")).toBe(
      path.join("/workspace/.formless/local", "auto-save.json"),
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
    const result = await createWorkspaceAppPackageResolver({
      bundledManifests: workspaceTestBundledManifests,
      workspaceRoot,
    });

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

    const result = await createWorkspaceAppPackageResolver({
      bundledManifests: workspaceTestBundledManifests,
      workspaceRoot,
    });
    const linkedPackage = result.linkedPackages[0];

    expect(
      findResolvedAppPackage(
        "private-labs",
        createAppPackageResolver(workspaceTestBundledManifests),
      ),
    ).toBeUndefined();
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

    const result = await createWorkspaceAppPackageResolver({
      bundledManifests: workspaceTestBundledManifests,
      workspaceRoot,
    });
    const linkedPackage = result.linkedPackages[0];

    expect(
      findResolvedAppPackage(
        "client-orders",
        createAppPackageResolver(workspaceTestBundledManifests),
      ),
    ).toBeUndefined();
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

    await expect(
      createWorkspaceAppPackageResolver({
        bundledManifests: workspaceTestBundledManifests,
        workspaceRoot,
      }),
    ).rejects.toThrow('Schema must include "entities".');
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

    await expect(
      createWorkspaceAppPackageResolver({
        bundledManifests: workspaceTestBundledManifests,
        workspaceRoot,
      }),
    ).rejects.toThrow('values include unknown field "task.missing"');
  });

  it("rejects linked source schema hash mismatches", async () => {
    const root = await makeTempDir();
    const workspaceRoot = path.join(root, "instance");
    const packageRoot = path.join(root, "app");

    await writeWorkspacePackageLinks(workspaceRoot, "../app/formless.app.json");
    await writeWorkspaceAppPackageFixture(packageRoot, {
      sourceSchemaHash: `sha256:${"2".repeat(64)}`,
    });

    await expect(
      createWorkspaceAppPackageResolver({
        bundledManifests: workspaceTestBundledManifests,
        workspaceRoot,
      }),
    ).rejects.toThrow(/does not match manifest sourceSchemaHash/);
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

describe("workspace auto-save node state", () => {
  it("reads and writes ignored local auto-save state files", async () => {
    const workspaceRoot = await makeTempDir();
    const localStateRoot = path.join(workspaceRoot, ".formless/local");
    const state = nextWorkspaceAutoSaveEnqueuedState(
      initialWorkspaceAutoSaveState({
        now: () => "2026-06-02T00:00:00.000Z",
      }),
      {
        now: () => "2026-06-02T00:00:01.000Z",
        source: "control-plane-write",
        storageIdentity: "instance:control-plane",
      },
    );

    await expect(readInstanceWorkspaceAutoSaveState(localStateRoot)).resolves.toBeUndefined();

    const write = await writeInstanceWorkspaceAutoSaveState({
      localStateRoot,
      state,
      workspaceRoot,
    });
    const persistedText = await readFile(
      instanceWorkspaceAutoSaveStatePath(localStateRoot),
      "utf8",
    );

    expect(write).toEqual({
      path: path.join(localStateRoot, "auto-save.json"),
      state,
    });
    await expect(readFile(path.join(workspaceRoot, ".gitignore"), "utf8")).resolves.toBe(
      ".formless/\n",
    );
    await expect(readInstanceWorkspaceAutoSaveState(localStateRoot)).resolves.toEqual(state);
    expect(persistedText).toBe(`${JSON.stringify(JSON.parse(persistedText), null, 2)}\n`);
    expect(persistedText).not.toContain(workspaceRoot);
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

type WorkspaceAppPackageFixture = {
  manifest: AppPackageManifest;
  manifestPath: string;
  packageRoot: string;
  seedRecords: unknown[];
  seedRecordsPath: string;
  sourceSchema: unknown;
  sourceSchemaHash: SourceSchemaHash;
  sourceSchemaPath: string;
};

type WorkspaceAppPackageFixtureOptions = {
  capabilities?: AppPackageCapability[];
  defaultInstallId?: string;
  description?: string;
  label?: string;
  packageAppKey?: string;
  packageRevision?: number;
  seedRecords?: unknown[];
  seedRecordsPath?: string;
  sourceSchema?: unknown;
  sourceSchemaHash?: SourceSchemaHash;
  sourceSchemaPath?: string;
  supportsMultipleInstalls?: boolean;
};

async function writeWorkspaceAppPackageFixture(
  packageRoot: string,
  options: WorkspaceAppPackageFixtureOptions = {},
): Promise<WorkspaceAppPackageFixture> {
  const sourceSchema = options.sourceSchema ?? workspaceFixtureTaskSourceSchema;
  const seedRecords = options.seedRecords ?? workspaceFixtureTaskSeedRecords;
  const sourceSchemaHash =
    options.sourceSchemaHash ?? (await computeSourceSchemaHash(sourceSchema));
  const sourceSchemaPath = options.sourceSchemaPath ?? "source/schema.json";
  const seedRecordsPath = options.seedRecordsPath ?? "source/seed-records.json";
  const manifest = workspaceAppPackageManifestFixture({
    ...options,
    seedRecordsPath,
    sourceSchemaHash,
    sourceSchemaPath,
  });
  const manifestPath = path.join(packageRoot, "formless.app.json");
  const resolvedSourceSchemaPath = path.join(packageRoot, sourceSchemaPath);
  const resolvedSeedRecordsPath = path.join(packageRoot, seedRecordsPath);

  await writeJsonFile(resolvedSourceSchemaPath, sourceSchema);
  await writeJsonFile(resolvedSeedRecordsPath, seedRecords);
  await writeJsonFile(manifestPath, manifest);

  return {
    manifest,
    manifestPath,
    packageRoot,
    seedRecords,
    seedRecordsPath: resolvedSeedRecordsPath,
    sourceSchema,
    sourceSchemaHash,
    sourceSchemaPath: resolvedSourceSchemaPath,
  };
}

function workspaceAppPackageManifestFixture(
  options: WorkspaceAppPackageFixtureOptions & { sourceSchemaHash: SourceSchemaHash },
): AppPackageManifest {
  const packageAppKey = options.packageAppKey ?? "private-labs";
  const label = options.label ?? "Private Labs";
  const defaultInstallId = options.defaultInstallId ?? "labs";
  const sourceSchemaPath = options.sourceSchemaPath ?? "source/schema.json";
  const seedRecordsPath = options.seedRecordsPath ?? "source/seed-records.json";

  return parseAppPackageManifest({
    kind: appPackageManifestKind,
    version: appPackageManifestVersion,
    packageAppKey,
    label,
    description: options.description ?? "Private lab package fixture.",
    defaultInstallId,
    supportsMultipleInstalls: options.supportsMultipleInstalls ?? false,
    packageRevision: options.packageRevision ?? 7,
    sourceSchema: {
      kind: "workspace",
      key: packageAppKey,
      path: sourceSchemaPath,
    },
    seedRecords: {
      kind: "workspace",
      key: packageAppKey,
      path: seedRecordsPath,
    },
    sourceSchemaHash: options.sourceSchemaHash,
    capabilities: options.capabilities ?? [{ kind: "generatedAdmin", routeBase: "/apps" }],
  });
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function workspaceFixtureTaskRecord(id: string, title: string, done: boolean) {
  return {
    id,
    entity: "task",
    values: { done, title },
    createdAt: "2026-06-01T00:00:00.000Z",
  };
}

function timestampSequence(...timestamps: string[]): () => string {
  let index = 0;

  return () =>
    timestamps[index++ % timestamps.length] ?? timestamps.at(-1) ?? new Date(0).toISOString();
}

function workspaceTestPackageManifest(input: {
  label: string;
  packageAppKey: string;
  publicSite?: boolean;
  sourceSchemaHash: string;
}): Record<string, unknown> {
  return {
    kind: appPackageManifestKind,
    version: appPackageManifestVersion,
    packageAppKey: input.packageAppKey,
    label: input.label,
    description: `${input.label} package fixture.`,
    defaultInstallId: input.packageAppKey,
    supportsMultipleInstalls: true,
    packageRevision: 1,
    sourceSchema: {
      kind: "bundled",
      key: input.packageAppKey,
      path: "schema.json",
    },
    seedRecords: {
      kind: "bundled",
      key: input.packageAppKey,
      path: "seed-records.json",
    },
    sourceSchemaHash: input.sourceSchemaHash,
    capabilities: [
      {
        kind: "generatedAdmin",
        routeBase: "/apps",
      },
      ...(input.publicSite
        ? [
            {
              kind: "publicSite",
              routeBase: "/sites",
            },
          ]
        : []),
    ],
  };
}
