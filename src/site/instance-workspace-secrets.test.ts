import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

import {
  FORMLESS_INSTANCE_WORKSPACE_ADMIN_TOKEN_ENV_NAME,
  FORMLESS_INSTANCE_WORKSPACE_GITIGNORE_ENTRY,
  FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_PATH,
  formlessInstanceWorkspaceSecretStatePath,
  formatFormlessInstanceWorkspaceSecretState,
  parseFormlessInstanceWorkspaceSecretState,
  resolveFormlessInstanceWorkspaceAdminToken,
} from "./instance-workspace-secrets.ts";

describe("Formless instance workspace secret state", () => {
  it("defines the ignored workspace secret path", () => {
    expect(FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_PATH).toBe(".formless/instance.env");
    expect(FORMLESS_INSTANCE_WORKSPACE_GITIGNORE_ENTRY).toBe(".formless/");
    expect(formlessInstanceWorkspaceSecretStatePath("/workspace")).toBe(
      path.join("/workspace", ".formless/instance.env"),
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
});
