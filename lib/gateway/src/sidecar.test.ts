import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  WORKSPACE_GATEWAY_ACTOR_HEADER,
  WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER,
  WORKSPACE_GATEWAY_BOOTSTRAP_HEADER,
  WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_CSRF_COOKIE_NAME,
  WORKSPACE_GATEWAY_CSRF_HEADER,
  WORKSPACE_GATEWAY_CSRF_TOKEN_ENV,
  WORKSPACE_GATEWAY_OPERATION_KIND_HEADER,
  WORKSPACE_GATEWAY_OPERATIONS_API_PATH,
  WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_ROOT_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
  WORKSPACE_GATEWAY_STATUS_API_PATH,
  handleWorkspaceGatewayLocalProxyRequest,
  handleWorkspaceGatewaySidecarRequest,
  startWorkspaceGatewaySidecar,
  type WorkspaceGatewayOperation,
  type WorkspaceGatewaySidecar,
  type WorkspaceGatewaySidecarOperationHandlers,
} from "./sidecar.ts";

const proxyToken = "sidecar-proxy-token";
const bootstrapToken = "workspace-bootstrap-token";
const csrfToken = "workspace-csrf-token";
const adminToken = "workspace-admin-token";
const workspaceRoot = "/workspace";
const sidecars: WorkspaceGatewaySidecar[] = [];

afterEach(async () => {
  await Promise.all(sidecars.splice(0).map((sidecar) => sidecar.close()));
});

describe("sidecar workspace gateway adapter", () => {
  it("starts a loopback Node sidecar and routes proxied requests to operation handlers", async () => {
    const sidecar = await startWorkspaceGatewaySidecar(
      { env: gatewayEnv(), workspaceRoot },
      {
        createProxyToken: () => proxyToken,
        operations: operationHandlers(),
      },
    );

    sidecars.push(sidecar);

    const endpoint = new URL(sidecar.endpoint);
    expect(endpoint.hostname).toBe("127.0.0.1");
    expect(endpoint.protocol).toBe("http:");
    expect(sidecar.proxyToken).toBe(proxyToken);

    const response = await fetch(new URL(WORKSPACE_GATEWAY_STATUS_API_PATH, sidecar.endpoint), {
      headers: sidecarProxyHeaders({ operation: "status", via: "bootstrap" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      operation: {
        actor: "browser",
        id: "op_status_00000001",
        operation: "status",
      },
    });
  });

  it("rejects unavailable roots, invalid proxy tokens, invalid actor facts, and direct browser bearer", async () => {
    let starts = 0;
    const handlers = operationHandlers({
      startOperation: async ({ authorization, operationInput }) => {
        starts += 1;
        return operation(operationInput.kind, { actor: authorization.actor });
      },
    });
    const missingRoot = await handleWorkspaceGatewaySidecarRequest(
      new Request(`http://127.0.0.1${WORKSPACE_GATEWAY_STATUS_API_PATH}`, {
        headers: sidecarProxyHeaders({ operation: "status", via: "bootstrap" }),
      }),
      {
        FORMLESS_LOCAL_WORKSPACE_GATEWAY: "1",
        [WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]: proxyToken,
      },
      handlers,
    );
    const wrongProxyToken = await handleWorkspaceGatewaySidecarRequest(
      operationRequest(
        { kind: "save" },
        sidecarProxyHeaders({ token: "wrong", via: "owner-session" }),
      ),
      gatewayEnv(),
      handlers,
    );
    const invalidActor = await handleWorkspaceGatewaySidecarRequest(
      operationRequest(
        { kind: "save" },
        {
          ...sidecarProxyHeaders({ via: "owner-session" }),
          [WORKSPACE_GATEWAY_ACTOR_HEADER]: "automation",
        },
      ),
      gatewayEnv(),
      handlers,
    );
    const browserBearer = await handleWorkspaceGatewaySidecarRequest(
      operationRequest(
        { kind: "save" },
        {
          Authorization: `Bearer ${adminToken}`,
          Origin: "http://local.test",
        },
      ),
      gatewayEnv(),
      handlers,
    );

    expect(missingRoot?.status).toBe(404);
    expect(wrongProxyToken?.status).toBe(401);
    expect(invalidActor?.status).toBe(400);
    expect(browserBearer?.status).toBe(401);
    expect(starts).toBe(0);
  });

  it("allows direct non-browser admin bearer automation at the sidecar", async () => {
    const response = await handleWorkspaceGatewaySidecarRequest(
      operationRequest(
        { kind: "save" },
        {
          Authorization: `Bearer ${adminToken}`,
        },
      ),
      gatewayEnv(),
      operationHandlers(),
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      operation: {
        actor: "automation",
        operation: "save",
      },
    });
  });

  it("proxies local runtime requests with sanitized internal sidecar headers and CSRF response wrapping", async () => {
    const captured: Array<{ body?: string; headers: Record<string, string>; url: string }> = [];
    const response = await handleWorkspaceGatewayLocalProxyRequest(
      operationRequest(
        { kind: "save" },
        {
          Authorization: `Bearer ${adminToken}`,
          Cookie: `${WORKSPACE_GATEWAY_CSRF_COOKIE_NAME}=${csrfToken}; session=secret`,
          Origin: "http://local.test",
          [WORKSPACE_GATEWAY_CSRF_HEADER]: csrfToken,
          [WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER]: "browser-proxy-token",
        },
      ),
      {
        ...gatewayEnv(),
        [WORKSPACE_GATEWAY_SIDECAR_URL_ENV]: "http://127.0.0.1:9999",
      },
      {
        proxyFetch: async (url, init) => {
          const requestUrl =
            typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

          captured.push({
            body: typeof init?.body === "string" ? init.body : undefined,
            headers: Object.fromEntries(new Headers(init?.headers).entries()),
            url: requestUrl,
          });

          return Response.json({ operation: operation("save", { actor: "browser" }) });
        },
        validateOwnerSession: async () => ({ ok: true }),
      },
    );
    const body = (await response?.json()) as Record<string, unknown>;
    const headers = captured[0]?.headers ?? {};

    expect(response?.status).toBe(200);
    expect(body).toMatchObject({
      csrfToken,
      operation: {
        actor: "browser",
        operation: "save",
      },
    });
    expect(response?.headers.get("Set-Cookie")).toContain(
      `${WORKSPACE_GATEWAY_CSRF_COOKIE_NAME}=${csrfToken}`,
    );
    expect(captured[0]?.url).toBe(`http://127.0.0.1:9999${WORKSPACE_GATEWAY_OPERATIONS_API_PATH}`);
    expect(headers.authorization).toBeUndefined();
    expect(headers.cookie).toBeUndefined();
    expect(headers[WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]).toBeUndefined();
    expect(headers[WORKSPACE_GATEWAY_CSRF_HEADER]).toBeUndefined();
    expect(headers[WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER]).toBe(proxyToken);
    expect(headers[WORKSPACE_GATEWAY_ACTOR_HEADER]).toBe("browser");
    expect(headers[WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER]).toBe("owner-session");
    expect(headers[WORKSPACE_GATEWAY_OPERATION_KIND_HEADER]).toBe("save");
  });

  it("requires operation intent for bootstrap reads and validates sidecar read intent", async () => {
    const bootstrapWithoutIntent = await handleWorkspaceGatewayLocalProxyRequest(
      new Request(`http://local.test${WORKSPACE_GATEWAY_OPERATIONS_API_PATH}/op_save_00000001`, {
        headers: {
          Origin: "http://local.test",
          [WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken,
        },
      }),
      {
        ...gatewayEnv(),
        [WORKSPACE_GATEWAY_SIDECAR_URL_ENV]: "http://127.0.0.1:9999",
      },
      { proxyFetch: async () => Response.json({ operation: operation("save") }) },
    );
    const mismatchedSidecarIntent = await handleWorkspaceGatewaySidecarRequest(
      new Request(`http://127.0.0.1${WORKSPACE_GATEWAY_OPERATIONS_API_PATH}/op_save_00000001`, {
        headers: sidecarProxyHeaders({ operation: "status", via: "owner-session" }),
      }),
      gatewayEnv(),
      operationHandlers({
        readOperation: async () => operation("save"),
      }),
    );

    expect(bootstrapWithoutIntent?.status).toBe(400);
    await expect(bootstrapWithoutIntent?.json()).resolves.toEqual({
      error: "Workspace gateway operation intent is required for bootstrap reads.",
    });
    expect(mismatchedSidecarIntent?.status).toBe(400);
    await expect(mismatchedSidecarIntent?.json()).resolves.toEqual({
      error: "Workspace operation intent does not match operation state.",
    });
  });
});

function gatewayEnv(): Record<string, string> {
  return {
    FORMLESS_ADMIN_TOKEN: adminToken,
    FORMLESS_LOCAL_WORKSPACE_GATEWAY: "1",
    [WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV]: bootstrapToken,
    [WORKSPACE_GATEWAY_CSRF_TOKEN_ENV]: csrfToken,
    [WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]: proxyToken,
    [WORKSPACE_GATEWAY_ROOT_ENV]: workspaceRoot,
  };
}

function sidecarProxyHeaders(input: {
  operation?: string;
  token?: string;
  via: "admin-bearer" | "bootstrap" | "owner-session";
}): Record<string, string> {
  return {
    [WORKSPACE_GATEWAY_ACTOR_HEADER]: input.via === "admin-bearer" ? "automation" : "browser",
    [WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER]: input.via,
    ...(input.operation === undefined
      ? {}
      : { [WORKSPACE_GATEWAY_OPERATION_KIND_HEADER]: input.operation }),
    [WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER]: input.token ?? proxyToken,
  };
}

function operationRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://local.test${WORKSPACE_GATEWAY_OPERATIONS_API_PATH}`, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    method: "POST",
  });
}

function operationHandlers(
  overrides: Partial<WorkspaceGatewaySidecarOperationHandlers> = {},
): WorkspaceGatewaySidecarOperationHandlers {
  return {
    readOperation: async ({ authorization }) => operation("status", { actor: authorization.actor }),
    startOperation: async ({ authorization, operationInput }) =>
      operation(operationInput.kind, { actor: authorization.actor }),
    status: async ({ authorization }) => operation("status", { actor: authorization.actor }),
    ...overrides,
  };
}

function operation(
  operationKind: WorkspaceGatewayOperation["operation"],
  overrides: Partial<WorkspaceGatewayOperation> = {},
): WorkspaceGatewayOperation {
  return {
    actor: overrides.actor ?? "browser",
    createdAt: "2026-06-02T01:00:00.000Z",
    errors: [],
    events: [],
    id: `op_${operationKind}_00000001`,
    input: {},
    kind: "formless.workspaceOperation",
    logs: [],
    operation: operationKind,
    status: "succeeded",
    summary: {
      fields: { operation: operationKind },
      title: `${operationKind} complete`,
    },
    updatedAt: "2026-06-02T01:00:00.000Z",
    version: 1,
    workspace: { label: "Workspace" },
    ...overrides,
  };
}
