import { describe, expect, it } from "vite-plus/test";

import type {
  LocalWorkspaceGatewayOperation,
  LocalWorkspaceGatewayOperationKind,
} from "../shared/workspace-gateway-protocol.ts";
import {
  LOCAL_WORKSPACE_GATEWAY_ACTOR_HEADER,
  LOCAL_WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER,
  LOCAL_WORKSPACE_GATEWAY_BOOTSTRAP_HEADER,
  LOCAL_WORKSPACE_GATEWAY_CSRF_COOKIE_NAME,
  LOCAL_WORKSPACE_GATEWAY_CSRF_HEADER,
  LOCAL_WORKSPACE_GATEWAY_OPERATION_KIND_HEADER,
  LOCAL_WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER,
} from "../shared/workspace-gateway-protocol.ts";
import type { OwnerIdentity } from "../shared/protocol.ts";
import { createOwnerSessionCookie } from "./owner-session.ts";
import {
  handleWorkerWorkspaceGatewayProxyRequest,
  workerWorkspaceGatewayProxyConfigFromEnv,
  type WorkerWorkspaceGatewayProxyEnv,
} from "./workspace-gateway-proxy.ts";

const ownerSessionSecret = "owner-session-secret";
const csrfToken = "csrf-token";
const bootstrapToken = "bootstrap-token";
const adminToken = "admin-token";
const proxyToken = "sidecar-proxy-token";
const sidecarEndpoint = "http://127.0.0.1:9876";
const baseEnv: WorkerWorkspaceGatewayProxyEnv = {
  FORMLESS_ADMIN_TOKEN: adminToken,
  FORMLESS_OWNER_SESSION_SECRET: ownerSessionSecret,
  FORMLESS_RUNTIME_PROFILE: "instance",
  FORMLESS_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN: bootstrapToken,
  FORMLESS_WORKSPACE_GATEWAY_CSRF_TOKEN: csrfToken,
  FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN: proxyToken,
  FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL: sidecarEndpoint,
};
const owner: OwnerIdentity = {
  createdAt: "2026-06-03T00:00:00.000Z",
  id: "owner-1",
  name: "Owner",
};

describe("Worker workspace gateway proxy", () => {
  it("parses only loopback sidecar proxy config from Worker-visible env", () => {
    expect(
      workerWorkspaceGatewayProxyConfigFromEnv({
        ...baseEnv,
        FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL: "https://example.com/gateway",
      }),
    ).toBeUndefined();
    expect(
      workerWorkspaceGatewayProxyConfigFromEnv({
        ...baseEnv,
        FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN: "",
      }),
    ).toBeUndefined();
    expect(
      workerWorkspaceGatewayProxyConfigFromEnv({
        ...baseEnv,
        FORMLESS_WORKSPACE_GATEWAY_ROOT: "/tmp/workspace",
      } as WorkerWorkspaceGatewayProxyEnv & { FORMLESS_WORKSPACE_GATEWAY_ROOT: string }),
    ).toEqual({
      endpoint: sidecarEndpoint,
      proxyToken,
    });
  });

  it("fails before forwarding for non-local, mapped-host, missing sidecar, cross-origin, unauthenticated, and invalid-id requests", async () => {
    const cases: Array<{
      env?: WorkerWorkspaceGatewayProxyEnv;
      expectedStatus: number;
      mappedHost?: boolean;
      request: Request;
    }> = [
      {
        env: { ...baseEnv, FORMLESS_RUNTIME_PROFILE: "publishedSite" },
        expectedStatus: 404,
        request: new Request("https://example.com/api/formless/workspace/status"),
      },
      {
        expectedStatus: 404,
        mappedHost: true,
        request: new Request("https://example.com/api/formless/workspace/status"),
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
      const response = await handleWorkerWorkspaceGatewayProxyRequest(
        testCase.request,
        testCase.env ?? baseEnv,
        {
          fetch: async () => {
            forwarded = true;
            return Response.json({ operation: operation("status") });
          },
          mappedHost: testCase.mappedHost,
        },
      );

      expect(response?.status).toBe(testCase.expectedStatus);
      expect(forwarded).toBe(false);
    }
  });

  it("proxies owner-session browser mutations with internal authorization and display-safe actor facts", async () => {
    const calls: ProxyCall[] = [];
    const response = await handleWorkerWorkspaceGatewayProxyRequest(
      new Request("https://example.com/api/formless/workspace/operations", {
        body: JSON.stringify({ check: true, kind: "save" }),
        headers: {
          Authorization: "Bearer browser-value",
          Cookie: `${await ownerSessionCookie()}; ${LOCAL_WORKSPACE_GATEWAY_CSRF_COOKIE_NAME}=${csrfToken}`,
          [LOCAL_WORKSPACE_GATEWAY_CSRF_HEADER]: csrfToken,
          [LOCAL_WORKSPACE_GATEWAY_OPERATION_KIND_HEADER]: "deployApply",
          [LOCAL_WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER]: "browser-proxy-token",
          "Content-Type": "application/json",
          Origin: "https://example.com",
        },
        method: "POST",
      }),
      baseEnv,
      {
        fetch: captureProxyCalls(calls, operation("save")),
      },
    );

    const body = await jsonBody(response);

    expect(response?.status).toBe(200);
    expect(response?.headers.get("Set-Cookie")).toContain(
      `${LOCAL_WORKSPACE_GATEWAY_CSRF_COOKIE_NAME}=${csrfToken}`,
    );
    expect(body.csrfToken).toBe(csrfToken);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      body: JSON.stringify({ check: true, kind: "save" }),
      method: "POST",
      url: `${sidecarEndpoint}/api/formless/workspace/operations`,
    });
    expect(calls[0]?.headers.get(LOCAL_WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER)).toBe(
      proxyToken,
    );
    expect(calls[0]?.headers.get(LOCAL_WORKSPACE_GATEWAY_ACTOR_HEADER)).toBe("browser");
    expect(calls[0]?.headers.get(LOCAL_WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER)).toBe(
      "owner-session",
    );
    expect(calls[0]?.headers.get(LOCAL_WORKSPACE_GATEWAY_OPERATION_KIND_HEADER)).toBe("save");
    expect(calls[0]?.headers.get("Authorization")).toBeNull();
    expect(calls[0]?.headers.get("Cookie")).toBeNull();
    expect(calls[0]?.headers.get(LOCAL_WORKSPACE_GATEWAY_BOOTSTRAP_HEADER)).toBeNull();
    expect(calls[0]?.headers.get(LOCAL_WORKSPACE_GATEWAY_CSRF_HEADER)).toBeNull();
  });

  it("limits bootstrap authorization to bootstrap-safe operation intents before forwarding", async () => {
    const initCalls: ProxyCall[] = [];
    const init = await handleWorkerWorkspaceGatewayProxyRequest(
      new Request("https://example.com/api/formless/workspace/operations", {
        body: JSON.stringify({ kind: "init", name: "Local" }),
        headers: {
          [LOCAL_WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken,
          "Content-Type": "application/json",
          Origin: "https://example.com",
        },
        method: "POST",
      }),
      baseEnv,
      {
        fetch: captureProxyCalls(initCalls, operation("init")),
        readOwnerSetupStatus: async () => ({ setupComplete: false }),
      },
    );
    let saveForwarded = false;
    const save = await handleWorkerWorkspaceGatewayProxyRequest(
      new Request("https://example.com/api/formless/workspace/operations", {
        body: JSON.stringify({ kind: "save" }),
        headers: {
          [LOCAL_WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken,
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

    expect(init?.status).toBe(200);
    expect(initCalls[0]?.headers.get(LOCAL_WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER)).toBe(
      "bootstrap",
    );
    expect(initCalls[0]?.headers.get(LOCAL_WORKSPACE_GATEWAY_OPERATION_KIND_HEADER)).toBe("init");
    expect(save?.status).toBe(403);
    expect(saveForwarded).toBe(false);
  });

  it("checks operation read ids and read intents before bootstrap forwarding", async () => {
    const initReadCalls: ProxyCall[] = [];
    const initRead = await handleWorkerWorkspaceGatewayProxyRequest(
      new Request("https://example.com/api/formless/workspace/operations/op_init_00000001", {
        headers: {
          [LOCAL_WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken,
          [LOCAL_WORKSPACE_GATEWAY_OPERATION_KIND_HEADER]: "init",
        },
      }),
      baseEnv,
      {
        fetch: captureProxyCalls(initReadCalls, operation("init")),
        readOwnerSetupStatus: async () => ({ setupComplete: false }),
      },
    );
    let saveReadForwarded = false;
    const saveRead = await handleWorkerWorkspaceGatewayProxyRequest(
      new Request("https://example.com/api/formless/workspace/operations/op_save_00000001", {
        headers: {
          [LOCAL_WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken,
          [LOCAL_WORKSPACE_GATEWAY_OPERATION_KIND_HEADER]: "save",
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

    expect(initRead?.status).toBe(200);
    expect(initReadCalls[0]?.headers.get(LOCAL_WORKSPACE_GATEWAY_OPERATION_KIND_HEADER)).toBe(
      "init",
    );
    expect(saveRead?.status).toBe(403);
    expect(saveReadForwarded).toBe(false);
  });

  it("proxies non-browser admin bearer automation without CSRF browser state", async () => {
    const calls: ProxyCall[] = [];
    const response = await handleWorkerWorkspaceGatewayProxyRequest(
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
    expect(calls[0]?.headers.get(LOCAL_WORKSPACE_GATEWAY_ACTOR_HEADER)).toBe("automation");
    expect(calls[0]?.headers.get(LOCAL_WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER)).toBe(
      "admin-bearer",
    );
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
  operationResponse: LocalWorkspaceGatewayOperation,
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

async function ownerSessionCookie() {
  const created = await createOwnerSessionCookie({
    env: { FORMLESS_OWNER_SESSION_SECRET: ownerSessionSecret },
    maxAgeSeconds: 60,
    now: "2999-01-01T00:00:00.000Z",
    owner,
    request: new Request("https://example.com/"),
  });

  return created.cookie.split(";")[0] ?? created.cookie;
}

async function jsonBody(response: Response | undefined): Promise<Record<string, unknown>> {
  expect(response).toBeDefined();

  return (await response!.json()) as Record<string, unknown>;
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

function operation(
  operationKind: LocalWorkspaceGatewayOperationKind,
): LocalWorkspaceGatewayOperation {
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
