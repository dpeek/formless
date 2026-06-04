import { describe, expect, it } from "vite-plus/test";

import {
  WORKSPACE_GATEWAY_ACTOR_HEADER,
  WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER,
  WORKSPACE_GATEWAY_BOOTSTRAP_HEADER,
  WORKSPACE_GATEWAY_CSRF_COOKIE_NAME,
  WORKSPACE_GATEWAY_CSRF_HEADER,
  WORKSPACE_GATEWAY_OPERATION_KIND_HEADER,
  WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER,
  handleWorkspaceGatewayProxyRequest,
  workspaceGatewayProxyConfigFromEnv,
  type WorkspaceGatewayOperation,
  type WorkspaceGatewayOperationKind,
  type WorkspaceGatewayWorkerProxyEnv,
} from "./worker.ts";

const ownerSessionCookie = "formless_owner_session=valid";
const csrfToken = "csrf-token";
const bootstrapToken = "bootstrap-token";
const adminToken = "admin-token";
const proxyToken = "sidecar-proxy-token";
const sidecarEndpoint = "http://127.0.0.1:9876";
const baseEnv: WorkspaceGatewayWorkerProxyEnv = {
  FORMLESS_ADMIN_TOKEN: adminToken,
  FORMLESS_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN: bootstrapToken,
  FORMLESS_WORKSPACE_GATEWAY_CSRF_TOKEN: csrfToken,
  FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN: proxyToken,
  FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL: sidecarEndpoint,
};

describe("Worker workspace gateway proxy", () => {
  it("parses only loopback sidecar proxy config from Worker-visible env", () => {
    expect(
      workspaceGatewayProxyConfigFromEnv({
        ...baseEnv,
        FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL: "https://example.com/gateway",
      }),
    ).toBeUndefined();
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

  it("fails before forwarding for non-local, mapped-host, missing sidecar, cross-origin, unauthenticated, and invalid-id requests", async () => {
    const cases: Array<{
      env?: WorkspaceGatewayWorkerProxyEnv;
      expectedStatus: number;
      request: Request;
      routeAvailable?: boolean;
    }> = [
      {
        expectedStatus: 404,
        request: new Request("https://example.com/api/formless/workspace/status"),
        routeAvailable: false,
      },
      {
        expectedStatus: 404,
        request: new Request("https://example.com/api/formless/workspace/status"),
        routeAvailable: false,
      },
      {
        env: {
          ...baseEnv,
          FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN: undefined,
          FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL: undefined,
        },
        expectedStatus: 404,
        request: new Request("https://example.com/api/formless/workspace/status"),
      },
      {
        expectedStatus: 403,
        request: new Request("https://example.com/api/formless/workspace/status", {
          headers: { Origin: "https://evil.example.com" },
        }),
      },
      {
        expectedStatus: 401,
        request: new Request("https://example.com/api/formless/workspace/operations", {
          body: JSON.stringify({ kind: "save" }),
          headers: { "Content-Type": "application/json", Origin: "https://example.com" },
          method: "POST",
        }),
      },
      {
        expectedStatus: 400,
        request: new Request("https://example.com/api/formless/workspace/operations/x"),
      },
    ];

    for (const testCase of cases) {
      let forwarded = false;
      const response = await handleWorkspaceGatewayProxyRequest(
        testCase.request,
        testCase.env ?? baseEnv,
        {
          fetch: async () => {
            forwarded = true;
            return Response.json({ operation: operation("status") });
          },
          routeAvailable: testCase.routeAvailable,
        },
      );

      expect(response?.status).toBe(testCase.expectedStatus);
      expect(forwarded).toBe(false);
    }
  });

  it("proxies owner-session browser mutations with internal authorization and display-safe actor facts", async () => {
    const calls: ProxyCall[] = [];
    const response = await handleWorkspaceGatewayProxyRequest(
      new Request("https://example.com/api/formless/workspace/operations", {
        body: JSON.stringify({ check: true, kind: "save" }),
        headers: {
          Authorization: "Bearer browser-value",
          Cookie: `${ownerSessionCookie}; ${WORKSPACE_GATEWAY_CSRF_COOKIE_NAME}=${csrfToken}`,
          [WORKSPACE_GATEWAY_CSRF_HEADER]: csrfToken,
          [WORKSPACE_GATEWAY_OPERATION_KIND_HEADER]: "deployApply",
          [WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER]: "browser-proxy-token",
          "Content-Type": "application/json",
          Origin: "https://example.com",
        },
        method: "POST",
      }),
      baseEnv,
      {
        fetch: captureProxyCalls(calls, operation("save")),
        validateOwnerSession,
      },
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
      url: `${sidecarEndpoint}/api/formless/workspace/operations`,
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
      const response = await handleWorkspaceGatewayProxyRequest(
        new Request("https://example.com/api/formless/workspace/operations", {
          body: JSON.stringify({ kind: "deployApply" }),
          headers: {
            ...testCase.headers,
            "Content-Type": "application/json",
            Origin: "https://example.com",
          },
          method: "POST",
        }),
        baseEnv,
        {
          fetch: async () => {
            forwarded = true;
            return Response.json({ operation: operation("deployApply") });
          },
          validateOwnerSession,
        },
      );
      const body = await jsonBody(response);

      expect(response?.status, testCase.label).toBe(403);
      expect(body.error, testCase.label).toBe(
        "Workspace gateway browser mutations require CSRF proof.",
      );
      expect(forwarded, testCase.label).toBe(false);
    }
  });

  it("limits bootstrap authorization to status operation intents before forwarding", async () => {
    const statusCalls: ProxyCall[] = [];
    const status = await handleWorkspaceGatewayProxyRequest(
      new Request("https://example.com/api/formless/workspace/status", {
        headers: {
          [WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken,
          Origin: "https://example.com",
        },
      }),
      baseEnv,
      {
        fetch: captureProxyCalls(statusCalls, operation("status")),
        readOwnerSetupStatus: async () => ({ setupComplete: false }),
      },
    );
    let saveForwarded = false;
    const save = await handleWorkspaceGatewayProxyRequest(
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
      {
        fetch: async () => {
          saveForwarded = true;
          return Response.json({ operation: operation("save") });
        },
        readOwnerSetupStatus: async () => ({ setupComplete: false }),
      },
    );

    expect(status?.status).toBe(200);
    expect(statusCalls[0]?.headers.get(WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER)).toBe(
      "bootstrap",
    );
    expect(statusCalls[0]?.headers.get(WORKSPACE_GATEWAY_OPERATION_KIND_HEADER)).toBe("status");
    expect(save?.status).toBe(403);
    expect(saveForwarded).toBe(false);
  });

  it("expires bootstrap authorization through injected owner setup status", async () => {
    let forwarded = false;
    const response = await handleWorkspaceGatewayProxyRequest(
      new Request("https://example.com/api/formless/workspace/status", {
        headers: {
          [WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken,
        },
      }),
      baseEnv,
      {
        fetch: async () => {
          forwarded = true;
          return Response.json({ operation: operation("status") });
        },
        readOwnerSetupStatus: async () => ({ setupComplete: true }),
      },
    );
    const body = await jsonBody(response);

    expect(response?.status).toBe(403);
    expect(body.error).toBe("Workspace bootstrap authorization has expired.");
    expect(forwarded).toBe(false);
  });

  it("checks operation read ids and read intents before bootstrap forwarding", async () => {
    const statusReadCalls: ProxyCall[] = [];
    const statusRead = await handleWorkspaceGatewayProxyRequest(
      new Request("https://example.com/api/formless/workspace/operations/op_status_00000001", {
        headers: {
          [WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken,
          [WORKSPACE_GATEWAY_OPERATION_KIND_HEADER]: "status",
        },
      }),
      baseEnv,
      {
        fetch: captureProxyCalls(statusReadCalls, operation("status")),
        readOwnerSetupStatus: async () => ({ setupComplete: false }),
      },
    );
    let saveReadForwarded = false;
    const saveRead = await handleWorkspaceGatewayProxyRequest(
      new Request("https://example.com/api/formless/workspace/operations/op_save_00000001", {
        headers: {
          [WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken,
          [WORKSPACE_GATEWAY_OPERATION_KIND_HEADER]: "save",
        },
      }),
      baseEnv,
      {
        fetch: async () => {
          saveReadForwarded = true;
          return Response.json({ operation: operation("save") });
        },
        readOwnerSetupStatus: async () => ({ setupComplete: false }),
      },
    );

    expect(statusRead?.status).toBe(200);
    expect(statusReadCalls[0]?.headers.get(WORKSPACE_GATEWAY_OPERATION_KIND_HEADER)).toBe("status");
    expect(saveRead?.status).toBe(403);
    expect(saveReadForwarded).toBe(false);
  });

  it("proxies non-browser admin bearer automation without CSRF browser state", async () => {
    const calls: ProxyCall[] = [];
    const response = await handleWorkspaceGatewayProxyRequest(
      new Request("https://example.com/api/formless/workspace/operations", {
        body: JSON.stringify({ kind: "deployPlan" }),
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
      baseEnv,
      {
        fetch: captureProxyCalls(calls, operation("deployPlan")),
      },
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

async function jsonBody(response: Response | undefined): Promise<Record<string, unknown>> {
  expect(response).toBeDefined();

  return (await response!.json()) as Record<string, unknown>;
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
