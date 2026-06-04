import path from "node:path";

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME,
  INSTANCE_WORKSPACE_GITIGNORE_ENTRY,
  INSTANCE_WORKSPACE_LOCAL_DEV_SECRET_STATE_PATH,
  INSTANCE_WORKSPACE_OWNER_SESSION_SECRET_ENV_NAME,
  INSTANCE_WORKSPACE_SECRET_STATE_PATH,
  createWorkspaceOperationState,
  ensureInstanceWorkspaceLocalDevSecretState,
  ensureInstanceWorkspaceSecretStateIgnored,
  formatInstanceWorkspaceLocalDevSecretState,
  formatInstanceWorkspaceSecretState,
  instanceWorkspaceLocalDevSecretStatePath,
  instanceWorkspaceSecretStatePath,
  parseInstanceWorkspaceLocalDevSecretState,
  parseInstanceWorkspaceSecretState,
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

function timestampSequence(...timestamps: string[]): () => string {
  let index = 0;

  return () =>
    timestamps[index++ % timestamps.length] ?? timestamps.at(-1) ?? new Date(0).toISOString();
}
