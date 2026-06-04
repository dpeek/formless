import { describe, expect, it } from "vite-plus/test";

import {
  WORKSPACE_GATEWAY_BOOTSTRAP_OPERATION_KINDS,
  WORKSPACE_GATEWAY_OPERATION_KINDS,
  WORKSPACE_GATEWAY_OPERATIONS_API_PATH,
  isWorkspaceGatewayBootstrapOperationKind,
  isWorkspaceGatewayMutatingStartOperationKind,
  isWorkspaceGatewayOperationKind,
  parseWorkspaceGatewayOperationId,
  parseWorkspaceGatewayStartInput,
  workspaceGatewayOperationPath,
  workspaceGatewayReadOperationIntent,
  workspaceGatewayStartOperationIntent,
} from "./index.ts";

describe("Gateway runtime-neutral contracts", () => {
  it("owns the semantic operation allowlist", () => {
    expect(WORKSPACE_GATEWAY_OPERATION_KINDS).toEqual([
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
    expect(WORKSPACE_GATEWAY_BOOTSTRAP_OPERATION_KINDS).toEqual(["init", "status"]);
    expect(isWorkspaceGatewayOperationKind("deployApply")).toBe(true);
    expect(isWorkspaceGatewayOperationKind("cleanup")).toBe(false);
  });

  it("parses operation start input without accepting filesystem, shell, or secret fields", () => {
    expect(parseWorkspaceGatewayStartInput({ kind: "deployPlan", migrationPolicy: "new" })).toEqual(
      {
        input: { kind: "deployPlan", migrationPolicy: "new", targetAlias: undefined },
        ok: true,
      },
    );
    expect(
      parseWorkspaceGatewayStartInput({ kind: "credentialSetup", provider: "cloudflare" }),
    ).toEqual({
      input: {
        accountId: undefined,
        kind: "credentialSetup",
        profileLabel: undefined,
        provider: "cloudflare",
      },
      ok: true,
    });
    expect(parseWorkspaceGatewayStartInput({ kind: "deployPlan", migrationPolicy: "old" })).toEqual(
      {
        error: 'Workspace gateway migrationPolicy must be "new" or "existing".',
        ok: false,
      },
    );
    expect(
      parseWorkspaceGatewayStartInput({ kind: "status", workspacePath: "../outside" }),
    ).toEqual({
      error: 'Workspace gateway request includes forbidden key "workspacePath".',
      ok: false,
    });
    expect(parseWorkspaceGatewayStartInput({ kind: "status", name: "TOKEN=secret" })).toEqual({
      error: "Workspace gateway request.name includes secret-looking text.",
      ok: false,
    });
    expect(parseWorkspaceGatewayStartInput({ kind: "cleanup" })).toEqual({
      error: 'Workspace gateway operation "cleanup" is not supported.',
      ok: false,
    });
  });

  it("parses operation ids and operation read paths", () => {
    expect(parseWorkspaceGatewayOperationId("op_status_00000001")).toEqual({
      ok: true,
      operationId: "op_status_00000001",
    });
    expect(parseWorkspaceGatewayOperationId("op.a-b_123")).toEqual({
      ok: true,
      operationId: "op.a-b_123",
    });
    expect(parseWorkspaceGatewayOperationId("ab")).toEqual({
      error: "Workspace operation id is invalid.",
      ok: false,
    });
    expect(parseWorkspaceGatewayOperationId("..%2Fsecret")).toEqual({
      error: "Workspace operation id is invalid.",
      ok: false,
    });
    expect(
      workspaceGatewayOperationPath(`${WORKSPACE_GATEWAY_OPERATIONS_API_PATH}/op_status_00000001`),
    ).toEqual({
      operationId: "op_status_00000001",
      progress: false,
    });
    expect(
      workspaceGatewayOperationPath(
        `${WORKSPACE_GATEWAY_OPERATIONS_API_PATH}/op_status_00000001/progress`,
      ),
    ).toEqual({ operationId: "op_status_00000001", progress: true });
    expect(
      workspaceGatewayOperationPath(
        `${WORKSPACE_GATEWAY_OPERATIONS_API_PATH}/op_status_00000001/events`,
      ),
    ).toBeUndefined();
  });

  it("classifies bootstrap-limited and mutating operation intent", () => {
    expect(isWorkspaceGatewayBootstrapOperationKind("init")).toBe(true);
    expect(isWorkspaceGatewayBootstrapOperationKind("status")).toBe(true);
    expect(isWorkspaceGatewayBootstrapOperationKind("save")).toBe(false);

    expect(isWorkspaceGatewayMutatingStartOperationKind("status")).toBe(false);
    for (const operation of WORKSPACE_GATEWAY_OPERATION_KINDS.filter((kind) => kind !== "status")) {
      expect(isWorkspaceGatewayMutatingStartOperationKind(operation)).toBe(true);
    }

    expect(workspaceGatewayStartOperationIntent({ kind: "init" })).toEqual({
      bootstrapAllowed: true,
      mutating: true,
      operation: "init",
    });
    expect(workspaceGatewayStartOperationIntent({ kind: "status" })).toEqual({
      bootstrapAllowed: true,
      mutating: false,
      operation: "status",
    });
    expect(workspaceGatewayStartOperationIntent({ check: true, kind: "save" })).toEqual({
      bootstrapAllowed: false,
      mutating: true,
      operation: "save",
    });
    expect(workspaceGatewayReadOperationIntent("init")).toEqual({
      bootstrapAllowed: true,
      mutating: false,
      operation: "init",
    });
  });
});
