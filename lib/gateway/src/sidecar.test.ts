import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  WORKSPACE_GATEWAY_ACTOR_HEADER,
  WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER,
  WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH,
  WORKSPACE_GATEWAY_BOOTSTRAP_HEADER,
  WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_CSRF_COOKIE_NAME,
  WORKSPACE_GATEWAY_CSRF_HEADER,
  WORKSPACE_GATEWAY_CSRF_TOKEN_ENV,
  WORKSPACE_GATEWAY_ENABLED_ENV,
  WORKSPACE_GATEWAY_OPERATION_KIND_HEADER,
  WORKSPACE_GATEWAY_OPERATIONS_API_PATH,
  WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_ROOT_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
  WORKSPACE_GATEWAY_STATUS_API_PATH,
  createWorkspaceGatewaySidecarExecutionEnv,
  handleWorkspaceGatewayLocalProxyRequest,
  handleWorkspaceGatewaySidecarRequest,
  startWorkspaceGatewaySidecar,
  type WorkspaceGatewayAutoSaveState,
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
  it("builds sidecar startup execution env from an explicit allowlist", () => {
    const broadRuntimeEnv: Record<string, string> = {
      FORMLESS_ADMIN_TOKEN: adminToken,
      FORMLESS_LOCAL_WORKSPACE_GATEWAY: "0",
      FORMLESS_RUNTIME_PROFILE: "publishedSite",
      [WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV]: bootstrapToken,
      [WORKSPACE_GATEWAY_CSRF_TOKEN_ENV]: csrfToken,
      [WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]: "stale-proxy-token",
      [WORKSPACE_GATEWAY_ROOT_ENV]: "/stale/root",
      [WORKSPACE_GATEWAY_SIDECAR_URL_ENV]: "http://127.0.0.1:1",
      VITE_FORMLESS_RUNTIME_PROFILE: "publishedSite",
      VITE_FORMLESS_WORKSPACE_GATEWAY_API: "http://127.0.0.1:1/api/formless/workspace",
      VITE_FORMLESS_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN: bootstrapToken,
      VITE_FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN: "browser-proxy-token",
      VITE_FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL: "http://127.0.0.1:1",
    };

    expect(
      createWorkspaceGatewaySidecarExecutionEnv({
        env: broadRuntimeEnv,
        proxyToken,
        workspaceRoot,
      }),
    ).toEqual({
      FORMLESS_ADMIN_TOKEN: adminToken,
      [WORKSPACE_GATEWAY_ENABLED_ENV]: "1",
      [WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]: proxyToken,
      [WORKSPACE_GATEWAY_ROOT_ENV]: workspaceRoot,
    });
  });

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

  it("rejects sidecar execution authorization failures before operation handlers run", async () => {
    const calls: string[] = [];
    const handlers = operationHandlers({
      autoSaveStatus: async () => {
        calls.push("autoSaveStatus");
        return autoSaveState();
      },
      enqueueAutoSave: async () => {
        calls.push("enqueueAutoSave");
        return autoSaveState({ displayState: "queued" });
      },
      readOperation: async () => {
        calls.push("readOperation");
        return operation("status");
      },
      startOperation: async ({ authorization, operationInput }) => {
        calls.push("startOperation");
        return operation(operationInput.kind, { actor: authorization.actor });
      },
      status: async ({ authorization }) => {
        calls.push("status");
        return operation("status", { actor: authorization.actor });
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
    const missingProxyToken = await handleWorkspaceGatewaySidecarRequest(
      operationRequest({ kind: "save" }),
      gatewayEnv(),
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
    const invalidOperationIntent = await handleWorkspaceGatewaySidecarRequest(
      operationRequest(
        { kind: "save" },
        sidecarProxyHeaders({ operation: "status", via: "owner-session" }),
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
    const bootstrapEscalation = await handleWorkspaceGatewaySidecarRequest(
      operationRequest(
        { kind: "save" },
        sidecarProxyHeaders({ operation: "save", via: "bootstrap" }),
      ),
      gatewayEnv(),
      handlers,
    );
    const directBootstrapHeader = await handleWorkspaceGatewaySidecarRequest(
      new Request(`http://127.0.0.1${WORKSPACE_GATEWAY_STATUS_API_PATH}`, {
        headers: {
          [WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken,
        },
      }),
      gatewayEnv(),
      handlers,
    );

    expect(missingRoot?.status).toBe(404);
    expect(missingProxyToken?.status).toBe(401);
    expect(wrongProxyToken?.status).toBe(401);
    expect(invalidActor?.status).toBe(400);
    expect(invalidOperationIntent?.status).toBe(400);
    expect(browserBearer?.status).toBe(401);
    expect(bootstrapEscalation?.status).toBe(403);
    expect(directBootstrapHeader?.status).toBe(401);
    await expect(missingProxyToken?.json()).resolves.toEqual({
      error: "Workspace gateway proxy authorization is required.",
    });
    await expect(wrongProxyToken?.json()).resolves.toEqual({
      error: "Workspace gateway proxy authorization is required.",
    });
    await expect(invalidActor?.json()).resolves.toEqual({
      error: "Workspace gateway proxy actor facts are invalid.",
    });
    await expect(invalidOperationIntent?.json()).resolves.toEqual({
      error: "Workspace gateway operation intent is invalid.",
    });
    await expect(browserBearer?.json()).resolves.toEqual({
      error: "Workspace gateway proxy authorization is required.",
    });
    await expect(bootstrapEscalation?.json()).resolves.toEqual({
      error: "Workspace bootstrap authorization is limited to status operations.",
    });
    await expect(directBootstrapHeader?.json()).resolves.toEqual({
      error: "Workspace gateway proxy authorization is required.",
    });
    expect(calls).toEqual([]);
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

  it("proxies auto-save status and enqueue with bootstrap, owner session, CSRF, and capability checks", async () => {
    const captured: Array<{ body?: unknown; headers: Record<string, string>; url: string }> = [];
    const status = await handleWorkspaceGatewayLocalProxyRequest(
      new Request(`http://local.test${WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH}`, {
        headers: {
          Origin: "http://local.test",
          [WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken,
        },
      }),
      {
        ...gatewayEnv(),
        [WORKSPACE_GATEWAY_SIDECAR_URL_ENV]: "http://127.0.0.1:9999",
      },
      {
        proxyFetch: async (url, init) => {
          captured.push(await capturedProxyRequest(url, init));

          return Response.json({ autoSave: autoSaveState({ displayState: "clean" }) });
        },
      },
    );
    const missingCsrf = await handleWorkspaceGatewayLocalProxyRequest(
      autoSaveRequest({ source: "app-operation" }, { Origin: "http://local.test" }),
      {
        ...gatewayEnv(),
        [WORKSPACE_GATEWAY_SIDECAR_URL_ENV]: "http://127.0.0.1:9999",
      },
      {
        proxyFetch: async () => Response.json({ autoSave: autoSaveState() }),
        validateOwnerSession: async () => ({ ok: true }),
      },
    );
    const enqueued = await handleWorkspaceGatewayLocalProxyRequest(
      autoSaveRequest(
        { source: "app-operation", storageIdentity: "app:site" },
        {
          Cookie: `${WORKSPACE_GATEWAY_CSRF_COOKIE_NAME}=${csrfToken}`,
          Origin: "http://local.test",
          [WORKSPACE_GATEWAY_CSRF_HEADER]: csrfToken,
        },
      ),
      {
        ...gatewayEnv(),
        [WORKSPACE_GATEWAY_SIDECAR_URL_ENV]: "http://127.0.0.1:9999",
      },
      {
        proxyFetch: async (url, init) => {
          captured.push(await capturedProxyRequest(url, init));

          return Response.json({ autoSave: autoSaveState({ displayState: "queued" }) });
        },
        validateOwnerSession: async () => ({ ok: true }),
      },
    );
    const gated = await handleWorkspaceGatewayLocalProxyRequest(
      autoSaveRequest(
        { source: "app-operation" },
        {
          Cookie: `${WORKSPACE_GATEWAY_CSRF_COOKIE_NAME}=${csrfToken}`,
          Origin: "http://local.test",
          [WORKSPACE_GATEWAY_CSRF_HEADER]: csrfToken,
        },
      ),
      {
        ...gatewayEnv(),
        [WORKSPACE_GATEWAY_SIDECAR_URL_ENV]: "http://127.0.0.1:9999",
      },
      {
        capabilities: ["workspace-read"],
        proxyFetch: async () => Response.json({ autoSave: autoSaveState() }),
        validateOwnerSession: async () => ({ ok: true }),
      },
    );

    expect(status?.status).toBe(200);
    expect(missingCsrf?.status).toBe(403);
    expect(enqueued?.status).toBe(200);
    expect(gated?.status).toBe(403);
    await expect(status?.json()).resolves.toMatchObject({
      autoSave: { displayState: "clean" },
    });
    await expect(enqueued?.json()).resolves.toMatchObject({
      autoSave: { displayState: "queued" },
      csrfToken,
    });
    await expect(gated?.json()).resolves.toEqual({
      error: 'Workspace operation "save" requires execution capability "workspace-source-write".',
    });
    expect(captured.map((call) => call.url)).toEqual([
      `http://127.0.0.1:9999${WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH}`,
      `http://127.0.0.1:9999${WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH}`,
    ]);
    expect(captured[0]?.headers[WORKSPACE_GATEWAY_OPERATION_KIND_HEADER]).toBe("status");
    expect(captured[1]?.headers[WORKSPACE_GATEWAY_OPERATION_KIND_HEADER]).toBe("save");
    expect(captured[1]?.body).toEqual({
      source: "app-operation",
      storageIdentity: "app:site",
    });
  });

  it("prefers owner-session authorization over an expired bootstrap header", async () => {
    const captured: Array<{ body?: unknown; headers: Record<string, string>; url: string }> = [];
    const response = await handleWorkspaceGatewayLocalProxyRequest(
      new Request(`http://local.test${WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH}`, {
        headers: {
          Cookie: "formless_owner_session=valid",
          Origin: "http://local.test",
          [WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]: bootstrapToken,
        },
      }),
      {
        ...gatewayEnv(),
        [WORKSPACE_GATEWAY_SIDECAR_URL_ENV]: "http://127.0.0.1:9999",
      },
      {
        proxyFetch: async (url, init) => {
          captured.push(await capturedProxyRequest(url, init));

          return Response.json({ autoSave: autoSaveState({ displayState: "saved" }) });
        },
        readOwnerSetupStatus: async () => ({ setupComplete: true }),
        validateOwnerSession: async () => ({ ok: true }),
      },
    );

    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      autoSave: { displayState: "saved" },
      csrfToken,
    });
    expect(captured).toHaveLength(1);
    expect(captured[0]?.headers[WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER]).toBe("owner-session");
    expect(captured[0]?.headers[WORKSPACE_GATEWAY_BOOTSTRAP_HEADER]).toBeUndefined();
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
    let readOperations = 0;
    const mismatchedSidecarIntent = await handleWorkspaceGatewaySidecarRequest(
      new Request(`http://127.0.0.1${WORKSPACE_GATEWAY_OPERATIONS_API_PATH}/op_save_00000001`, {
        headers: sidecarProxyHeaders({ operation: "status", via: "owner-session" }),
      }),
      gatewayEnv(),
      operationHandlers({
        readOperation: async () => {
          readOperations += 1;
          return operation("save");
        },
      }),
    );
    const sidecarBootstrapWithoutIntent = await handleWorkspaceGatewaySidecarRequest(
      new Request(`http://127.0.0.1${WORKSPACE_GATEWAY_OPERATIONS_API_PATH}/op_status_00000001`, {
        headers: sidecarProxyHeaders({ via: "bootstrap" }),
      }),
      gatewayEnv(),
      operationHandlers(),
    );

    expect(bootstrapWithoutIntent?.status).toBe(400);
    await expect(bootstrapWithoutIntent?.json()).resolves.toEqual({
      error: "Workspace gateway operation intent is required for bootstrap reads.",
    });
    expect(sidecarBootstrapWithoutIntent?.status).toBe(400);
    await expect(sidecarBootstrapWithoutIntent?.json()).resolves.toEqual({
      error: "Workspace gateway operation intent is required for bootstrap reads.",
    });
    expect(mismatchedSidecarIntent?.status).toBe(400);
    await expect(mismatchedSidecarIntent?.json()).resolves.toEqual({
      error: "Workspace operation intent does not match operation state.",
    });
    expect(readOperations).toBe(1);
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

function autoSaveRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://local.test${WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH}`, {
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
    autoSaveStatus: async () => autoSaveState(),
    enqueueAutoSave: async () => autoSaveState({ displayState: "queued" }),
    readOperation: async ({ authorization }) => operation("status", { actor: authorization.actor }),
    startOperation: async ({ authorization, operationInput }) =>
      operation(operationInput.kind, { actor: authorization.actor }),
    status: async ({ authorization }) => operation("status", { actor: authorization.actor }),
    ...overrides,
  };
}

function autoSaveState(
  overrides: Partial<WorkspaceGatewayAutoSaveState> = {},
): WorkspaceGatewayAutoSaveState {
  return {
    dirtyGeneration: 0,
    displayState: "clean",
    kind: "formless.workspaceAutoSaveState",
    retryCount: 0,
    savedGeneration: 0,
    storageIdentities: [],
    updatedAt: "2026-06-02T01:00:00.000Z",
    version: 1,
    writeSources: [],
    ...overrides,
  };
}

async function capturedProxyRequest(
  url: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
): Promise<{ body?: unknown; headers: Record<string, string>; url: string }> {
  const body = await requestBodyJson(init?.body);

  return {
    ...(body === undefined ? {} : { body }),
    headers: Object.fromEntries(new Headers(init?.headers).entries()),
    url: typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url,
  };
}

async function requestBodyJson(body: BodyInit | null | undefined): Promise<unknown> {
  if (body === null || body === undefined) {
    return undefined;
  }

  if (typeof body === "string") {
    return JSON.parse(body);
  }

  if (body instanceof ArrayBuffer) {
    return JSON.parse(new TextDecoder().decode(body));
  }

  if (body instanceof Uint8Array) {
    return JSON.parse(new TextDecoder().decode(body));
  }

  return undefined;
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
