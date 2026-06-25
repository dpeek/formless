import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

import { WORKSPACE_OPERATION_CAPABILITIES } from "@dpeek/formless-workspace";
import {
  WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER,
  WORKSPACE_GATEWAY_BOOTSTRAP_HEADER,
  WORKSPACE_GATEWAY_OPERATION_KIND_HEADER,
  handleWorkspaceGatewayProxyRequest,
  workspaceGatewayProxyConfigFromEnv,
  type WorkspaceGatewayWorkerProxyEnv,
} from "./worker.ts";
import {
  adminToken,
  bootstrapToken,
  browserMutationHeaders,
  captureSidecarOperationCalls,
  csrfToken,
  expectGatewayError,
  expectGatewayOperationResponse,
  expectNoSidecarCalls,
  gatewayOperationStartRequest,
  gatewayStatusRequest,
  proxyToken,
  sidecarEndpoint,
  validateOwnerSession,
  workspaceGatewayOperation,
  type CapturedSidecarCall,
} from "./proxy-rules.contract-fixtures.ts";

const baseEnv: WorkspaceGatewayWorkerProxyEnv = {
  FORMLESS_ADMIN_TOKEN: adminToken,
  FORMLESS_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN: bootstrapToken,
  FORMLESS_WORKSPACE_GATEWAY_CSRF_TOKEN: csrfToken,
  FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN: proxyToken,
  FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL: sidecarEndpoint,
};

describe("Worker workspace gateway proxy", () => {
  it("parses only loopback sidecar proxy config from Worker-visible env", () => {
    for (const endpoint of [
      "http://127.0.0.1:9876",
      "http://localhost:9876",
      "http://[::1]:9876",
    ]) {
      expect(
        workspaceGatewayProxyConfigFromEnv({
          ...baseEnv,
          FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL: endpoint,
        }),
      ).toEqual({
        endpoint,
        proxyToken,
      });
    }

    for (const endpoint of [
      "https://localhost:9876",
      "http://0.0.0.0:9876",
      "http://example.com/gateway",
    ]) {
      expect(
        workspaceGatewayProxyConfigFromEnv({
          ...baseEnv,
          FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL: endpoint,
        }),
      ).toBeUndefined();
    }

    expect(
      workspaceGatewayProxyConfigFromEnv({
        ...baseEnv,
        FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN: "",
      }),
    ).toBeUndefined();
    expect(
      workspaceGatewayProxyConfigFromEnv({
        ...baseEnv,
        FORMLESS_WORKSPACE_GATEWAY_ROOT: "/tmp/workspace",
      } as WorkspaceGatewayWorkerProxyEnv & { FORMLESS_WORKSPACE_GATEWAY_ROOT: string }),
    ).toEqual({
      endpoint: sidecarEndpoint,
      proxyToken,
    });
  });

  it("uses route availability injection before selecting a sidecar target", async () => {
    const calls: CapturedSidecarCall[] = [];
    const response = await handleWorkspaceGatewayProxyRequest(
      gatewayStatusRequest({
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
      baseEnv,
      {
        capabilities: WORKSPACE_OPERATION_CAPABILITIES,
        fetch: captureSidecarOperationCalls(calls, workspaceGatewayOperation("status")),
        routeAvailable: false,
      },
    );

    await expectGatewayError({ error: "Not found.", response, status: 404 });
    expectNoSidecarCalls(calls);
  });

  it("passes injected owner session, setup status, fetch, and capabilities to proxy rules", async () => {
    const ownerSessionCalls: string[] = [];
    const ownerSessionProxyCalls: CapturedSidecarCall[] = [];
    const ownerSessionResponse = await handleWorkspaceGatewayProxyRequest(
      gatewayOperationStartRequest(
        { check: true, kind: "save" },
        {
          headers: browserMutationHeaders(),
        },
      ),
      baseEnv,
      {
        capabilities: WORKSPACE_OPERATION_CAPABILITIES,
        fetch: captureSidecarOperationCalls(
          ownerSessionProxyCalls,
          workspaceGatewayOperation("save"),
        ),
        validateOwnerSession: (request) => {
          ownerSessionCalls.push(request.url);

          return validateOwnerSession(request);
        },
      },
    );

    await expectGatewayOperationResponse({
      csrfToken,
      operation: { operation: "save" },
      response: ownerSessionResponse,
    });
    expect(ownerSessionCalls).toEqual(["https://example.com/api/formless/workspace/operations"]);
    expect(ownerSessionProxyCalls).toHaveLength(1);
    expect(ownerSessionProxyCalls[0]?.headers.get(WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER)).toBe(
      "owner-session",
    );
    expect(ownerSessionProxyCalls[0]?.headers.get(WORKSPACE_GATEWAY_OPERATION_KIND_HEADER)).toBe(
      "save",
    );

    const ownerSetupCalls: string[] = [];
    const bootstrapProxyCalls: CapturedSidecarCall[] = [];
    const bootstrapResponse = await handleWorkspaceGatewayProxyRequest(
      gatewayStatusRequest({
        headers: { [WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken },
      }),
      baseEnv,
      {
        capabilities: WORKSPACE_OPERATION_CAPABILITIES,
        fetch: captureSidecarOperationCalls(
          bootstrapProxyCalls,
          workspaceGatewayOperation("status"),
        ),
        readOwnerSetupStatus: async (request) => {
          ownerSetupCalls.push(request.url);

          return { setupComplete: false };
        },
      },
    );

    await expectGatewayOperationResponse({
      operation: { operation: "status" },
      response: bootstrapResponse,
    });
    expect(ownerSetupCalls).toEqual(["https://example.com/api/formless/workspace/status"]);
    expect(bootstrapProxyCalls).toHaveLength(1);
    expect(bootstrapProxyCalls[0]?.headers.get(WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER)).toBe(
      "bootstrap",
    );
    expect(bootstrapProxyCalls[0]?.headers.get(WORKSPACE_GATEWAY_OPERATION_KIND_HEADER)).toBe(
      "status",
    );
  });

  it("defaults Worker execution capabilities to none", async () => {
    const calls: CapturedSidecarCall[] = [];
    const response = await handleWorkspaceGatewayProxyRequest(
      gatewayStatusRequest({
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
      baseEnv,
      {
        fetch: captureSidecarOperationCalls(calls, workspaceGatewayOperation("status")),
      },
    );

    await expectGatewayError({
      error: 'Workspace operation "status" requires execution capability "workspace-read".',
      response,
      status: 403,
    });
    expectNoSidecarCalls(calls);
  });

  it("keeps sidecar execution and workspace filesystem implementation out of Worker adapter source", async () => {
    const failures: string[] = [];

    for (const sourceFile of workerAdapterBoundarySourceFiles) {
      const source = await readFile(fileURLToPath(new URL(sourceFile, import.meta.url)), "utf8");

      for (const specifier of importSpecifiers(source)) {
        const failure = forbiddenWorkerAdapterImport(specifier);

        if (failure) {
          failures.push(`${sourceFile}: ${failure}`);
        }
      }

      if (/\bprocess\.(?:cwd|env)\b/.test(source)) {
        failures.push(`${sourceFile}: uses process cwd or env APIs`);
      }
    }

    expect(failures).toEqual([]);
  });
});

const workerAdapterBoundarySourceFiles = [
  "./worker.ts",
  "./proxy-rules.ts",
  "./index.ts",
  "./types.ts",
] as const;

const forbiddenNodeRuntimeImports = new Set([
  "fs",
  "fs/promises",
  "node:fs",
  "node:fs/promises",
  "node:path",
  "node:process",
  "path",
  "process",
]);

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s+["']([^"']+)["']/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];

      if (specifier) {
        specifiers.push(specifier);
      }
    }
  }

  return specifiers;
}

function forbiddenWorkerAdapterImport(specifier: string): string | undefined {
  const normalized = specifier.replace(/\.ts$/, "");

  if (normalized === "./sidecar" || normalized === "./sidecar-execution") {
    return `imports Gateway sidecar module ${specifier}`;
  }

  if (normalized === "@dpeek/formless-gateway/sidecar") {
    return `imports Gateway sidecar public adapter ${specifier}`;
  }

  if (
    normalized === "@dpeek/formless-workspace/node" ||
    normalized.startsWith("@dpeek/formless-workspace/node/")
  ) {
    return `imports Workspace filesystem implementation ${specifier}`;
  }

  if (/(?:^|\/)workspace\/src\/node$/.test(normalized)) {
    return `imports Workspace filesystem source ${specifier}`;
  }

  if (forbiddenNodeRuntimeImports.has(specifier)) {
    return `imports Node runtime module ${specifier}`;
  }

  return undefined;
}
