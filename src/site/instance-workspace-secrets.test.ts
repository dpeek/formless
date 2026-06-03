import path from "node:path";

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME,
  FORMLESS_INSTANCE_WORKSPACE_GITIGNORE_ENTRY,
  FORMLESS_INSTANCE_WORKSPACE_LOCAL_DEV_SECRET_STATE_PATH,
  FORMLESS_INSTANCE_WORKSPACE_OWNER_SESSION_SECRET_ENV_NAME,
  FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_PATH,
  ensureFormlessInstanceWorkspaceLocalDevSecretState,
  formlessInstanceWorkspaceLocalDevSecretStatePath,
  formlessInstanceWorkspaceSecretStatePath,
  formatFormlessInstanceWorkspaceLocalDevSecretState,
  formatFormlessInstanceWorkspaceSecretState,
  readFormlessInstanceWorkspaceLocalDevSecretState,
  readFormlessInstanceWorkspaceSecretState,
  parseFormlessInstanceWorkspaceLocalDevSecretState,
  parseFormlessInstanceWorkspaceSecretState,
  resolveFormlessInstanceWorkspaceAdminToken,
  ensureFormlessInstanceWorkspaceSecretStateIgnored,
  writeFormlessInstanceWorkspaceLocalDevSecretState,
  writeFormlessInstanceWorkspaceSecretState,
} from "./instance-workspace-secrets.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
});

describe("Formless instance workspace secret state", () => {
  it("defines the ignored workspace secret path", () => {
    expect(FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_PATH).toBe(".formless/instance.env");
    expect(FORMLESS_INSTANCE_WORKSPACE_LOCAL_DEV_SECRET_STATE_PATH).toBe(".formless/local/dev.env");
    expect(FORMLESS_INSTANCE_WORKSPACE_GITIGNORE_ENTRY).toBe(".formless/");
    expect(formlessInstanceWorkspaceSecretStatePath("/workspace")).toBe(
      path.join("/workspace", ".formless/instance.env"),
    );
    expect(formlessInstanceWorkspaceLocalDevSecretStatePath("/workspace/.formless/local")).toBe(
      path.join("/workspace/.formless/local", "dev.env"),
    );
  });

  it("parses and formats automation admin token env state", () => {
    const parsed = parseFormlessInstanceWorkspaceSecretState(
      '# local instance secrets\nFORMLESS_ADMIN_TOKEN="admin secret"\n',
    );

    expect(parsed).toEqual({ adminToken: "admin secret" });
    expect(formatFormlessInstanceWorkspaceSecretState(parsed)).toBe(
      'FORMLESS_ADMIN_TOKEN="admin secret"\n',
    );
    expect(formatFormlessInstanceWorkspaceSecretState({})).toBe("");
    expect(FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME).toBe("FORMLESS_ADMIN_TOKEN");
    expect(FORMLESS_INSTANCE_WORKSPACE_OWNER_SESSION_SECRET_ENV_NAME).toBe(
      "FORMLESS_OWNER_SESSION_SECRET",
    );
  });

  it("reads, writes, and completes ignored local dev secret state", async () => {
    const workspaceRoot = await makeTempDir();
    const localStateRoot = path.join(workspaceRoot, ".formless/local");

    expect(
      parseFormlessInstanceWorkspaceLocalDevSecretState(
        "FORMLESS_ADMIN_TOKEN=admin\nFORMLESS_OWNER_SESSION_SECRET=session\n",
      ),
    ).toEqual({ adminToken: "admin", ownerSessionSecret: "session" });
    expect(
      formatFormlessInstanceWorkspaceLocalDevSecretState({
        adminToken: "admin",
        ownerSessionSecret: "session",
      }),
    ).toBe("FORMLESS_ADMIN_TOKEN=admin\nFORMLESS_OWNER_SESSION_SECRET=session\n");
    await expect(readFormlessInstanceWorkspaceLocalDevSecretState(localStateRoot)).resolves.toEqual(
      {},
    );

    const write = await writeFormlessInstanceWorkspaceLocalDevSecretState(localStateRoot, {
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
      ensureFormlessInstanceWorkspaceLocalDevSecretState(
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
      resolveFormlessInstanceWorkspaceAdminToken({
        env: { FORMLESS_ADMIN_TOKEN: "env-token" },
        explicitAdminToken: "explicit-token",
        secretState: { adminToken: "state-token" },
      }),
    ).toBe("explicit-token");
    expect(
      resolveFormlessInstanceWorkspaceAdminToken({
        env: { FORMLESS_ADMIN_TOKEN: "env-token" },
        secretState: { adminToken: "state-token" },
      }),
    ).toBe("env-token");
    expect(
      resolveFormlessInstanceWorkspaceAdminToken({
        env: {},
        secretState: { adminToken: "state-token" },
      }),
    ).toBe("state-token");
    expect(
      resolveFormlessInstanceWorkspaceAdminToken({
        env: {},
        secretState: {},
      }),
    ).toBeNull();
  });

  it("reads and writes ignored workspace secret state", async () => {
    const workspaceRoot = await makeTempDir();

    await expect(readFormlessInstanceWorkspaceSecretState(workspaceRoot)).resolves.toEqual({});

    const write = await writeFormlessInstanceWorkspaceSecretState(workspaceRoot, {
      adminToken: "secret",
    });

    expect(write).toEqual({
      path: path.join(workspaceRoot, ".formless/instance.env"),
      state: { adminToken: "secret" },
    });
    await expect(readFile(write.path, "utf8")).resolves.toBe("FORMLESS_ADMIN_TOKEN=secret\n");
    await expect(readFormlessInstanceWorkspaceSecretState(workspaceRoot)).resolves.toEqual({
      adminToken: "secret",
    });
  });

  it("ensures workspace secret state is ignored without duplicates", async () => {
    const workspaceRoot = await makeTempDir();

    await writeFile(path.join(workspaceRoot, ".gitignore"), "dist\n");
    await ensureFormlessInstanceWorkspaceSecretStateIgnored(workspaceRoot);
    await ensureFormlessInstanceWorkspaceSecretStateIgnored(workspaceRoot);

    await expect(readFile(path.join(workspaceRoot, ".gitignore"), "utf8")).resolves.toBe(
      "dist\n.formless/\n",
    );

    const existingRoot = await makeTempDir();

    await writeFile(path.join(existingRoot, ".gitignore"), ".formless\nnode_modules\n");
    await ensureFormlessInstanceWorkspaceSecretStateIgnored(existingRoot);
    await expect(readFile(path.join(existingRoot, ".gitignore"), "utf8")).resolves.toBe(
      ".formless\nnode_modules\n",
    );
  });
});

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "formless-instance-workspace-secrets-test-"));

  tempDirs.push(tempDir);
  await mkdir(tempDir, { recursive: true });

  return tempDir;
}
