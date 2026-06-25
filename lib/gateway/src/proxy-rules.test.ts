import { describe, expect, it } from "vite-plus/test";

import {
  WORKSPACE_OPERATION_CAPABILITIES,
  workspaceOperationDefinitionForKind,
} from "@dpeek/formless-workspace";
import {
  WORKSPACE_GATEWAY_ACTOR_HEADER,
  WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER,
  WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH,
  WORKSPACE_GATEWAY_BOOTSTRAP_HEADER,
  WORKSPACE_GATEWAY_CSRF_COOKIE_NAME,
  WORKSPACE_GATEWAY_CSRF_HEADER,
  WORKSPACE_GATEWAY_OPERATION_KIND_HEADER,
  WORKSPACE_GATEWAY_OPERATIONS_API_PATH,
  WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER,
  type WorkspaceGatewayAutoSaveState,
  type WorkspaceGatewayOperation,
  type WorkspaceGatewayOperationKind,
} from "./index.ts";
import {
  handleWorkspaceGatewayProxyRulesRequest,
  type WorkspaceGatewayProxyRulesDependencies,
  type WorkspaceGatewayProxyRulesEnv,
  type WorkspaceGatewayProxyRulesTarget,
} from "./proxy-rules.ts";

const ownerSessionCookie = "formless_owner_session=valid";
const csrfToken = "csrf-token";
const bootstrapToken = "bootstrap-token";
const adminToken = "admin-token";
const proxyToken = "sidecar-proxy-token";
const sidecarEndpoint = "http://127.0.0.1:9876";
const baseEnv: WorkspaceGatewayProxyRulesEnv = {
  adminToken,
  bootstrapToken,
  csrfToken,
};
const proxyTarget: WorkspaceGatewayProxyRulesTarget = {
  endpoint: sidecarEndpoint,
  proxyToken,
};

describe("shared workspace gateway proxy rules", () => {
  it("classifies routes and rejects missing targets, disallowed methods, cross-origin callers, and invalid read ids before forwarding", async () => {
    const cases: Array<{ expectedStatus?: number; request: Request; target?: boolean }> = [
      {
        request: new Request("https://example.com/api/not-workspace/status"),
      },
      {
        expectedStatus: 404,
        request: new Request("https://example.com/api/formless/workspace/status"),
        target: false,
      },
      {
        expectedStatus: 405,
        request: new Request("https://example.com/api/formless/workspace/status", {
          method: "POST",
        }),
      },
      {
        expectedStatus: 403,
        request: new Request("https://example.com/api/formless/workspace/status", {
          headers: { Origin: "https://evil.example.com" },
        }),
      },
      {
        expectedStatus: 400,
        request: new Request("https://example.com/api/formless/workspace/operations/x"),
      },
    ];

    for (const testCase of cases) {
      let forwarded = false;
      const response = await handleWorkspaceGatewayProxyRulesRequest(
        testCase.request,
        baseEnv,
        dependencies({
          fetch: async () => {
            forwarded = true;
            return Response.json({ operation: operation("status") });
          },
          proxyTarget: () => (testCase.target === false ? undefined : proxyTarget),
        }),
      );

      if (testCase.expectedStatus === undefined) {
        expect(response).toBeUndefined();
      } else {
        expect(response?.status).toBe(testCase.expectedStatus);
      }
      expect(forwarded).toBe(false);
    }
  });

  it("rejects unsupported gateway operation kinds before forwarding", async () => {
    expect("gateway" in workspaceOperationDefinitionForKind("init").bindings).toBe(false);
    expect("gateway" in workspaceOperationDefinitionForKind("deploymentRefresh").bindings).toBe(
      false,
    );

    for (const bodyInput of [
      { kind: "init", name: "workspace" },
      { kind: "deploymentRefresh" },
      { kind: "deployPlan" },
      { kind: "deployApply" },
    ]) {
      let forwarded = false;
      const response = await handleWorkspaceGatewayProxyRulesRequest(
        new Request("https://example.com/api/formless/workspace/operations", {
          body: JSON.stringify(bodyInput),
          headers: browserMutationHeaders(),
          method: "POST",
        }),
        baseEnv,
        dependencies({
          fetch: async () => {
            forwarded = true;
            return Response.json({ operation: operation("status") });
          },
          validateOwnerSession,
        }),
      );
      const body = await jsonBody(response);

      expect(response?.status).toBe(400);
      expect(body.error).toBe(`Workspace gateway operation "${bodyInput.kind}" is not supported.`);
      expect(forwarded).toBe(false);
    }
  });

  it("proxies owner-session browser mutations with internal authorization and display-safe actor facts", async () => {
    const calls: ProxyCall[] = [];
    const response = await handleWorkspaceGatewayProxyRulesRequest(
      new Request("https://example.com/api/formless/workspace/operations", {
        body: JSON.stringify({ check: true, kind: "save" }),
        headers: {
          ...browserMutationHeaders(),
          Authorization: "Bearer browser-value",
          [WORKSPACE_GATEWAY_OPERATION_KIND_HEADER]: "push",
          [WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER]: "browser-proxy-token",
        },
        method: "POST",
      }),
      baseEnv,
      dependencies({
        fetch: captureProxyCalls(calls, operation("save")),
        validateOwnerSession,
      }),
    );
    const body = await jsonBody(response);

    expect(response?.status).toBe(200);
    expect(response?.headers.get("Set-Cookie")).toContain(
      `${WORKSPACE_GATEWAY_CSRF_COOKIE_NAME}=${csrfToken}`,
    );
    expect(body.csrfToken).toBe(csrfToken);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      body: JSON.stringify({ check: true, kind: "save" }),
      method: "POST",
      url: `${sidecarEndpoint}${WORKSPACE_GATEWAY_OPERATIONS_API_PATH}`,
    });
    expect(calls[0]?.headers.get(WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER)).toBe(proxyToken);
    expect(calls[0]?.headers.get(WORKSPACE_GATEWAY_ACTOR_HEADER)).toBe("browser");
    expect(calls[0]?.headers.get(WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER)).toBe("owner-session");
    expect(calls[0]?.headers.get(WORKSPACE_GATEWAY_OPERATION_KIND_HEADER)).toBe("save");
    expect(calls[0]?.headers.get("Authorization")).toBeNull();
    expect(calls[0]?.headers.get("Cookie")).toBeNull();
    expect(calls[0]?.headers.get(WORKSPACE_GATEWAY_BOOTSTRAP_HEADER)).toBeNull();
    expect(calls[0]?.headers.get(WORKSPACE_GATEWAY_CSRF_HEADER)).toBeNull();
  });

  it("proxies auto-save status and enqueue with bootstrap, owner-session, CSRF, and capability checks", async () => {
    const calls: ProxyCall[] = [];
    const status = await handleWorkspaceGatewayProxyRulesRequest(
      new Request(`https://example.com${WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH}`, {
        headers: {
          [WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken,
          Origin: "https://example.com",
        },
      }),
      baseEnv,
      dependencies({
        fetch: captureAutoSaveProxyCalls(calls, autoSaveState("clean")),
        readOwnerSetupStatus: async () => ({ setupComplete: false }),
      }),
    );
    const enqueued = await handleWorkspaceGatewayProxyRulesRequest(
      new Request(`https://example.com${WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH}`, {
        body: JSON.stringify({ source: "app-operation", storageIdentity: "app:site" }),
        headers: browserMutationHeaders(),
        method: "POST",
      }),
      baseEnv,
      dependencies({
        fetch: captureAutoSaveProxyCalls(calls, autoSaveState("queued")),
        validateOwnerSession,
      }),
    );
    const gated = await handleWorkspaceGatewayProxyRulesRequest(
      new Request(`https://example.com${WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH}`, {
        body: JSON.stringify({ source: "app-operation" }),
        headers: browserMutationHeaders(),
        method: "POST",
      }),
      baseEnv,
      dependencies({
        capabilities: ["workspace-read"],
        fetch: captureAutoSaveProxyCalls(calls, autoSaveState("queued")),
        validateOwnerSession,
      }),
    );

    expect(status?.status).toBe(200);
    await expect(status?.json()).resolves.toMatchObject({ autoSave: { displayState: "clean" } });
    expect(enqueued?.status).toBe(200);
    await expect(enqueued?.json()).resolves.toMatchObject({
      autoSave: { displayState: "queued" },
      csrfToken,
    });
    expect(gated?.status).toBe(403);
    await expect(gated?.json()).resolves.toEqual({
      error: 'Workspace operation "save" requires execution capability "workspace-source-write".',
    });
    expect(calls.map((call) => call.url)).toEqual([
      `${sidecarEndpoint}${WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH}`,
      `${sidecarEndpoint}${WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH}`,
    ]);
    expect(calls[0]?.headers.get(WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER)).toBe("bootstrap");
    expect(calls[0]?.headers.get(WORKSPACE_GATEWAY_OPERATION_KIND_HEADER)).toBe("status");
    expect(calls[1]?.headers.get(WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER)).toBe("owner-session");
    expect(calls[1]?.headers.get(WORKSPACE_GATEWAY_OPERATION_KIND_HEADER)).toBe("save");
    expect(calls[1]?.body).toBe(
      JSON.stringify({ source: "app-operation", storageIdentity: "app:site" }),
    );
  });

  it("prefers owner-session authorization over an expired bootstrap header", async () => {
    const calls: ProxyCall[] = [];
    const response = await handleWorkspaceGatewayProxyRulesRequest(
      new Request(`https://example.com${WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH}`, {
        headers: {
          Cookie: ownerSessionCookie,
          [WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken,
          Origin: "https://example.com",
        },
      }),
      baseEnv,
      dependencies({
        fetch: captureAutoSaveProxyCalls(calls, autoSaveState("clean")),
        readOwnerSetupStatus: async () => ({ setupComplete: true }),
        validateOwnerSession,
      }),
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      autoSave: { displayState: "clean" },
      csrfToken,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.get(WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER)).toBe("owner-session");
    expect(calls[0]?.headers.get(WORKSPACE_GATEWAY_BOOTSTRAP_HEADER)).toBeNull();
  });

  it("requires matching CSRF cookie and header before forwarding browser mutations", async () => {
    const cases: Array<{ headers: Record<string, string>; label: string }> = [
      {
        headers: {
          Cookie: ownerSessionCookie,
          [WORKSPACE_GATEWAY_CSRF_HEADER]: csrfToken,
        },
        label: "header without cookie",
      },
      {
        headers: {
          Cookie: `${ownerSessionCookie}; ${WORKSPACE_GATEWAY_CSRF_COOKIE_NAME}=${csrfToken}`,
        },
        label: "cookie without header",
      },
      {
        headers: {
          Cookie: `${ownerSessionCookie}; ${WORKSPACE_GATEWAY_CSRF_COOKIE_NAME}=wrong-token`,
          [WORKSPACE_GATEWAY_CSRF_HEADER]: csrfToken,
        },
        label: "mismatched cookie",
      },
    ];

    for (const testCase of cases) {
      let forwarded = false;
      const response = await handleWorkspaceGatewayProxyRulesRequest(
        new Request("https://example.com/api/formless/workspace/operations", {
          body: JSON.stringify({ kind: "push" }),
          headers: {
            ...testCase.headers,
            "Content-Type": "application/json",
            Origin: "https://example.com",
          },
          method: "POST",
        }),
        baseEnv,
        dependencies({
          fetch: async () => {
            forwarded = true;
            return Response.json({ operation: operation("push") });
          },
          validateOwnerSession,
        }),
      );
      const body = await jsonBody(response);

      expect(response?.status, testCase.label).toBe(403);
      expect(body.error, testCase.label).toBe(
        "Workspace gateway browser mutations require CSRF proof.",
      );
      expect(forwarded, testCase.label).toBe(false);
    }
  });

  it("limits bootstrap authorization and validates read operation intent before forwarding", async () => {
    const calls: ProxyCall[] = [];
    const status = await handleWorkspaceGatewayProxyRulesRequest(
      new Request("https://example.com/api/formless/workspace/status", {
        headers: {
          [WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken,
          Origin: "https://example.com",
        },
      }),
      baseEnv,
      dependencies({
        fetch: captureProxyCalls(calls, operation("status")),
        readOwnerSetupStatus: async () => ({ setupComplete: false }),
      }),
    );
    const save = await handleWorkspaceGatewayProxyRulesRequest(
      new Request("https://example.com/api/formless/workspace/operations", {
        body: JSON.stringify({ kind: "save" }),
        headers: {
          [WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken,
          "Content-Type": "application/json",
          Origin: "https://example.com",
        },
        method: "POST",
      }),
      baseEnv,
      dependencies({ readOwnerSetupStatus: async () => ({ setupComplete: false }) }),
    );
    const readWithoutIntent = await handleWorkspaceGatewayProxyRulesRequest(
      new Request("https://example.com/api/formless/workspace/operations/op_status_00000001", {
        headers: { [WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken },
      }),
      baseEnv,
      dependencies({ readOwnerSetupStatus: async () => ({ setupComplete: false }) }),
    );
    const readSaveIntent = await handleWorkspaceGatewayProxyRulesRequest(
      new Request("https://example.com/api/formless/workspace/operations/op_save_00000001", {
        headers: {
          [WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken,
          [WORKSPACE_GATEWAY_OPERATION_KIND_HEADER]: "save",
        },
      }),
      baseEnv,
      dependencies({ readOwnerSetupStatus: async () => ({ setupComplete: false }) }),
    );
    const expired = await handleWorkspaceGatewayProxyRulesRequest(
      new Request("https://example.com/api/formless/workspace/status", {
        headers: { [WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken },
      }),
      baseEnv,
      dependencies({ readOwnerSetupStatus: async () => ({ setupComplete: true }) }),
    );

    expect(status?.status).toBe(200);
    expect(save?.status).toBe(403);
    expect(readWithoutIntent?.status).toBe(400);
    expect(readSaveIntent?.status).toBe(403);
    expect(expired?.status).toBe(403);
    expect(calls[0]?.headers.get(WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER)).toBe("bootstrap");
    expect(calls[0]?.headers.get(WORKSPACE_GATEWAY_OPERATION_KIND_HEADER)).toBe("status");
    await expect(expired?.json()).resolves.toEqual({
      error: "Workspace bootstrap authorization has expired.",
    });
  });

  it("proxies non-browser admin bearer automation without CSRF browser state", async () => {
    const calls: ProxyCall[] = [];
    const response = await handleWorkspaceGatewayProxyRulesRequest(
      new Request("https://example.com/api/formless/workspace/operations", {
        body: JSON.stringify({ dryRun: true, kind: "push" }),
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
      baseEnv,
      dependencies({ fetch: captureProxyCalls(calls, operation("push")) }),
    );
    const body = await jsonBody(response);

    expect(response?.status).toBe(200);
    expect(response?.headers.get("Set-Cookie")).toBeNull();
    expect(body.csrfToken).toBeUndefined();
    expect(calls[0]?.headers.get(WORKSPACE_GATEWAY_ACTOR_HEADER)).toBe("automation");
    expect(calls[0]?.headers.get(WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER)).toBe("admin-bearer");
    expect(calls[0]?.headers.get("Authorization")).toBeNull();
  });
});

type ProxyCall = {
  body?: string;
  headers: Headers;
  method?: string;
  url: string;
};

function dependencies(
  overrides: Partial<WorkspaceGatewayProxyRulesDependencies> = {},
): WorkspaceGatewayProxyRulesDependencies {
  return {
    capabilities: WORKSPACE_OPERATION_CAPABILITIES,
    fetch: async () => Response.json({ operation: operation("status") }),
    proxyTarget: () => proxyTarget,
    ...overrides,
  };
}

function captureProxyCalls(
  calls: ProxyCall[],
  operationResponse: WorkspaceGatewayOperation,
): typeof fetch {
  return async (input, init) => {
    calls.push({
      ...(init?.body == null ? {} : { body: await requestBodyText(init.body) }),
      headers: new Headers(init?.headers),
      method: init?.method,
      url: requestUrl(input),
    });

    return Response.json({ operation: operationResponse });
  };
}

function captureAutoSaveProxyCalls(
  calls: ProxyCall[],
  autoSave: WorkspaceGatewayAutoSaveState,
): typeof fetch {
  return async (input, init) => {
    calls.push({
      ...(init?.body == null ? {} : { body: await requestBodyText(init.body) }),
      headers: new Headers(init?.headers),
      method: init?.method,
      url: requestUrl(input),
    });

    return Response.json({ autoSave });
  };
}

async function jsonBody(response: Response | undefined): Promise<Record<string, unknown>> {
  expect(response).toBeDefined();

  return (await response!.json()) as Record<string, unknown>;
}

function browserMutationHeaders(): Record<string, string> {
  return {
    Cookie: `${ownerSessionCookie}; ${WORKSPACE_GATEWAY_CSRF_COOKIE_NAME}=${csrfToken}`,
    [WORKSPACE_GATEWAY_CSRF_HEADER]: csrfToken,
    "Content-Type": "application/json",
    Origin: "https://example.com",
  };
}

function validateOwnerSession(request: Request) {
  return request.headers.get("Cookie")?.includes(ownerSessionCookie)
    ? { ok: true as const }
    : { ok: false as const, reason: "missing-cookie" };
}

async function requestBodyText(body: BodyInit): Promise<string> {
  if (typeof body === "string") {
    return body;
  }

  if (body instanceof ArrayBuffer) {
    return new TextDecoder().decode(body);
  }

  if (body instanceof Uint8Array) {
    return new TextDecoder().decode(body);
  }

  return "";
}

function requestUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.href : input.url;
}

function operation(operationKind: WorkspaceGatewayOperationKind): WorkspaceGatewayOperation {
  return {
    actor: "browser",
    createdAt: "2026-06-03T00:00:00.000Z",
    errors: [],
    events: [],
    id: `op_${operationKind}_00000001`,
    input: { kind: operationKind },
    kind: "formless.workspaceOperation",
    logs: [],
    operation: operationKind,
    status: "succeeded",
    summary: {
      fields: {},
      title: "Workspace operation",
    },
    updatedAt: "2026-06-03T00:00:01.000Z",
    version: 1,
    workspace: { label: "workspace" },
  };
}

function autoSaveState(displayState: "clean" | "queued"): WorkspaceGatewayAutoSaveState {
  return {
    dirtyGeneration: displayState === "queued" ? 1 : 0,
    displayState,
    kind: "formless.workspaceAutoSaveState",
    retryCount: 0,
    savedGeneration: 0,
    storageIdentities: displayState === "queued" ? ["app:site"] : [],
    updatedAt: "2026-06-03T00:00:01.000Z",
    version: 1,
    writeSources: displayState === "queued" ? ["app-operation"] : [],
  };
}
