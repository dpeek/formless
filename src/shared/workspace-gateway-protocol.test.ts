import { describe, expect, it } from "vite-plus/test";

import {
  LOCAL_WORKSPACE_GATEWAY_BOOTSTRAP_OPERATION_KINDS,
  LOCAL_WORKSPACE_GATEWAY_OPERATION_KINDS,
  LOCAL_WORKSPACE_GATEWAY_OPERATIONS_API_PATH,
  isLocalWorkspaceGatewayBootstrapOperationKind,
  isLocalWorkspaceGatewayMutatingStartOperationKind,
  isLocalWorkspaceGatewayOperationKind,
  localWorkspaceGatewayOperationPath,
  localWorkspaceGatewayReadOperationIntent,
  localWorkspaceGatewayStartOperationIntent,
  parseLocalWorkspaceGatewayOperationId,
  parseLocalWorkspaceGatewayStartInput,
} from "./workspace-gateway-protocol.ts";

describe("workspace gateway protocol", () => {
  it("owns the semantic operation allowlist", () => {
    expect(LOCAL_WORKSPACE_GATEWAY_OPERATION_KINDS).toEqual([
      "check",
      "credentialSetup",
      "deployApply",
      "deployPlan",
      "init",
      "pull",
      "push",
      "save",
      "status",
    ]);
    expect(LOCAL_WORKSPACE_GATEWAY_BOOTSTRAP_OPERATION_KINDS).toEqual(["init", "status"]);
    expect(isLocalWorkspaceGatewayOperationKind("deployApply")).toBe(true);
    expect(isLocalWorkspaceGatewayOperationKind("cleanup")).toBe(false);
  });

  it("parses operation start input without accepting filesystem, shell, or secret fields", () => {
    expect(
      parseLocalWorkspaceGatewayStartInput({ kind: "deployPlan", migrationPolicy: "new" }),
    ).toEqual({
      input: { kind: "deployPlan", migrationPolicy: "new", targetAlias: undefined },
      ok: true,
    });
    expect(
      parseLocalWorkspaceGatewayStartInput({ kind: "credentialSetup", provider: "cloudflare" }),
    ).toEqual({
      input: {
        accountId: undefined,
        kind: "credentialSetup",
        profileLabel: undefined,
        provider: "cloudflare",
      },
      ok: true,
    });
    expect(
      parseLocalWorkspaceGatewayStartInput({ kind: "deployPlan", migrationPolicy: "old" }),
    ).toEqual({
      error: 'Workspace gateway migrationPolicy must be "new" or "existing".',
      ok: false,
    });
    expect(
      parseLocalWorkspaceGatewayStartInput({ kind: "status", workspacePath: "../outside" }),
    ).toEqual({
      error: 'Workspace gateway request includes forbidden key "workspacePath".',
      ok: false,
    });
    expect(parseLocalWorkspaceGatewayStartInput({ kind: "status", name: "TOKEN=secret" })).toEqual({
      error: "Workspace gateway request.name includes secret-looking text.",
      ok: false,
    });
    expect(parseLocalWorkspaceGatewayStartInput({ kind: "cleanup" })).toEqual({
      error: 'Workspace gateway operation "cleanup" is not supported.',
      ok: false,
    });
  });

  it("parses operation ids and operation read paths", () => {
    expect(parseLocalWorkspaceGatewayOperationId("op_status_00000001")).toEqual({
      ok: true,
      operationId: "op_status_00000001",
    });
    expect(parseLocalWorkspaceGatewayOperationId("op.a-b_123")).toEqual({
      ok: true,
      operationId: "op.a-b_123",
    });
    expect(parseLocalWorkspaceGatewayOperationId("ab")).toEqual({
      error: "Workspace operation id is invalid.",
      ok: false,
    });
    expect(parseLocalWorkspaceGatewayOperationId("..%2Fsecret")).toEqual({
      error: "Workspace operation id is invalid.",
      ok: false,
    });
    expect(
      localWorkspaceGatewayOperationPath(
        `${LOCAL_WORKSPACE_GATEWAY_OPERATIONS_API_PATH}/op_status_00000001`,
      ),
    ).toEqual({ operationId: "op_status_00000001", progress: false });
    expect(
      localWorkspaceGatewayOperationPath(
        `${LOCAL_WORKSPACE_GATEWAY_OPERATIONS_API_PATH}/op_status_00000001/progress`,
      ),
    ).toEqual({ operationId: "op_status_00000001", progress: true });
    expect(
      localWorkspaceGatewayOperationPath(
        `${LOCAL_WORKSPACE_GATEWAY_OPERATIONS_API_PATH}/op_status_00000001/events`,
      ),
    ).toBeUndefined();
  });

  it("classifies bootstrap-limited and mutating operation intent", () => {
    expect(isLocalWorkspaceGatewayBootstrapOperationKind("init")).toBe(true);
    expect(isLocalWorkspaceGatewayBootstrapOperationKind("status")).toBe(true);
    expect(isLocalWorkspaceGatewayBootstrapOperationKind("save")).toBe(false);

    expect(isLocalWorkspaceGatewayMutatingStartOperationKind("status")).toBe(false);
    for (const operation of LOCAL_WORKSPACE_GATEWAY_OPERATION_KINDS.filter(
      (kind) => kind !== "status",
    )) {
      expect(isLocalWorkspaceGatewayMutatingStartOperationKind(operation)).toBe(true);
    }

    expect(localWorkspaceGatewayStartOperationIntent({ kind: "init" })).toEqual({
      bootstrapAllowed: true,
      mutating: true,
      operation: "init",
    });
    expect(localWorkspaceGatewayStartOperationIntent({ kind: "status" })).toEqual({
      bootstrapAllowed: true,
      mutating: false,
      operation: "status",
    });
    expect(localWorkspaceGatewayStartOperationIntent({ check: true, kind: "save" })).toEqual({
      bootstrapAllowed: false,
      mutating: true,
      operation: "save",
    });
    expect(localWorkspaceGatewayReadOperationIntent("init")).toEqual({
      bootstrapAllowed: true,
      mutating: false,
      operation: "init",
    });
  });
});
