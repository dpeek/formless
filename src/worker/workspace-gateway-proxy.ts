import {
  LOCAL_WORKSPACE_GATEWAY_ACTOR_HEADER,
  LOCAL_WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER,
  LOCAL_WORKSPACE_GATEWAY_BOOTSTRAP_HEADER,
  LOCAL_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV,
  LOCAL_WORKSPACE_GATEWAY_CSRF_COOKIE_NAME,
  LOCAL_WORKSPACE_GATEWAY_CSRF_HEADER,
  LOCAL_WORKSPACE_GATEWAY_CSRF_TOKEN_ENV,
  LOCAL_WORKSPACE_GATEWAY_OPERATION_KIND_HEADER,
  LOCAL_WORKSPACE_GATEWAY_OPERATIONS_API_PATH,
  LOCAL_WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER,
  LOCAL_WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  LOCAL_WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
  LOCAL_WORKSPACE_GATEWAY_STATUS_API_PATH,
  isLocalWorkspaceGatewayOperationKind,
  isLocalWorkspaceGatewayPath,
  localWorkspaceGatewayOperationPath,
  localWorkspaceGatewayReadOperationIntent,
  localWorkspaceGatewayStartOperationIntent,
  localWorkspaceGatewayStatusIntent,
  parseLocalWorkspaceGatewayOperationId,
  parseLocalWorkspaceGatewayStartInput,
  type LocalWorkspaceGatewayActor,
  type LocalWorkspaceGatewayAuthorizationVia,
  type LocalWorkspaceGatewayOperationIntent,
  type LocalWorkspaceGatewayStartInputParseResult,
} from "../shared/workspace-gateway-protocol.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { validateOwnerSessionCookie } from "./owner-session.ts";
import {
  resolveWorkerRuntimeRequestTopology,
  type WorkerRuntimeRequestTopology,
} from "./routing.ts";

export type WorkerWorkspaceGatewayProxyEnv = {
  FORMLESS_ADMIN_TOKEN?: string;
  FORMLESS_AUTHORITY?: DurableObjectNamespace;
  FORMLESS_OWNER_SESSION_SECRET?: string;
  FORMLESS_RUNTIME_PROFILE?: string;
  FORMLESS_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN?: string;
  FORMLESS_WORKSPACE_GATEWAY_CSRF_TOKEN?: string;
  FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN?: string;
  FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL?: string;
};

export type WorkerWorkspaceGatewayProxyConfig = {
  endpoint: string;
  proxyToken: string;
};

type WorkerWorkspaceGatewayProxyDependencies = {
  fetch?: typeof fetch;
  readOwnerSetupStatus?: (
    request: Request,
    env: WorkerWorkspaceGatewayProxyEnv,
  ) => Promise<{ setupComplete: boolean }>;
};

type WorkerWorkspaceGatewayProxyOptions = WorkerWorkspaceGatewayProxyDependencies & {
  mappedHost?: boolean;
  runtimeTopology?: WorkerRuntimeRequestTopology;
};

type GatewayAuthorization =
  | { actor: LocalWorkspaceGatewayActor; via: LocalWorkspaceGatewayAuthorizationVia }
  | { error: string; status: number };

export async function handleWorkerWorkspaceGatewayProxyRequest(
  request: Request,
  env: WorkerWorkspaceGatewayProxyEnv,
  options: WorkerWorkspaceGatewayProxyOptions = {},
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (!isLocalWorkspaceGatewayPath(url.pathname)) {
    return undefined;
  }

  const topology =
    options.runtimeTopology ??
    resolveWorkerRuntimeRequestTopology(request, { profile: env.FORMLESS_RUNTIME_PROFILE });

  if (options.mappedHost === true || !topology.routePolicy.workspaceGatewayApiRoutes) {
    return displaySafeJson({ error: "Not found." }, 404);
  }

  const proxyTarget = workerWorkspaceGatewayProxyConfigFromEnv(env);

  if (!proxyTarget) {
    return displaySafeJson({ error: "Not found." }, 404);
  }

  if (url.pathname === LOCAL_WORKSPACE_GATEWAY_STATUS_API_PATH) {
    if (request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    const intent = localWorkspaceGatewayStatusIntent();
    const authorization = await authorizeGatewayRequest(request, env, options, intent);

    if ("error" in authorization) {
      return displaySafeJson({ error: authorization.error }, authorization.status);
    }

    return proxyWorkspaceGatewayRequest(request, env, options, proxyTarget, authorization, {
      intent,
    });
  }

  if (url.pathname === LOCAL_WORKSPACE_GATEWAY_OPERATIONS_API_PATH) {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    const parsed = await parseGatewayStartInput(request.clone());

    if (!parsed.ok) {
      return displaySafeJson({ error: parsed.error }, 400);
    }

    const intent = localWorkspaceGatewayStartOperationIntent(parsed.input);
    const authorization = await authorizeGatewayRequest(request, env, options, intent);

    if ("error" in authorization) {
      return displaySafeJson({ error: authorization.error }, authorization.status);
    }

    return proxyWorkspaceGatewayRequest(request, env, options, proxyTarget, authorization, {
      intent,
    });
  }

  const operationMatch = localWorkspaceGatewayOperationPath(url.pathname);

  if (operationMatch) {
    if (request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    const parsedOperationId = parseLocalWorkspaceGatewayOperationId(operationMatch.operationId);

    if (!parsedOperationId.ok) {
      return displaySafeJson({ error: parsedOperationId.error }, 400);
    }

    const readIntent = readOperationIntentFromRequest(request);

    if (!readIntent.ok) {
      return displaySafeJson({ error: readIntent.error }, 400);
    }

    const authorization = await authorizeGatewayReadOperationRequest(
      request,
      env,
      options,
      readIntent.intent,
    );

    if ("error" in authorization) {
      return displaySafeJson({ error: authorization.error }, authorization.status);
    }

    return proxyWorkspaceGatewayRequest(
      request,
      env,
      options,
      proxyTarget,
      authorization,
      readIntent.intent === undefined ? {} : { intent: readIntent.intent },
    );
  }

  return displaySafeJson({ error: "Not found." }, 404);
}

export function workerWorkspaceGatewayProxyConfigFromEnv(
  env: WorkerWorkspaceGatewayProxyEnv,
): WorkerWorkspaceGatewayProxyConfig | undefined {
  const endpoint = env[LOCAL_WORKSPACE_GATEWAY_SIDECAR_URL_ENV]?.trim();
  const proxyToken = env[LOCAL_WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]?.trim();

  if (!endpoint || !proxyToken || !isLoopbackSidecarEndpoint(endpoint)) {
    return undefined;
  }

  return { endpoint, proxyToken };
}

async function authorizeGatewayRequest(
  request: Request,
  env: WorkerWorkspaceGatewayProxyEnv,
  dependencies: WorkerWorkspaceGatewayProxyDependencies,
  intent: LocalWorkspaceGatewayOperationIntent,
): Promise<GatewayAuthorization> {
  if (!isSameOriginOrNoOrigin(request)) {
    return { error: "Workspace gateway requests must be same-origin.", status: 403 };
  }

  if (matchesBootstrapCapability(request, env)) {
    if (!intent.bootstrapAllowed) {
      return {
        error: "Workspace bootstrap authorization is limited to status and init operations.",
        status: 403,
      };
    }

    if (await ownerSetupComplete(request, env, dependencies)) {
      return { error: "Workspace bootstrap authorization has expired.", status: 403 };
    }

    return { actor: "browser", via: "bootstrap" };
  }

  if (!request.headers.get("Origin") && matchesAdminBearer(request, env)) {
    return { actor: "automation", via: "admin-bearer" };
  }

  if (intent.mutating && !isSameOriginWithOrigin(request)) {
    return {
      error: "Workspace gateway browser mutations require a same-origin Origin header.",
      status: 403,
    };
  }

  const ownerSession = await validateOwnerSessionCookie(request, env);

  if (ownerSession.ok) {
    if (intent.mutating && !validCsrfProof(request, env)) {
      return { error: "Workspace gateway browser mutations require CSRF proof.", status: 403 };
    }

    return { actor: "browser", via: "owner-session" };
  }

  return {
    error: "Workspace gateway authorization is required.",
    status: 401,
  };
}

async function authorizeGatewayReadOperationRequest(
  request: Request,
  env: WorkerWorkspaceGatewayProxyEnv,
  dependencies: WorkerWorkspaceGatewayProxyDependencies,
  intent: LocalWorkspaceGatewayOperationIntent | undefined,
): Promise<GatewayAuthorization> {
  if (!isSameOriginOrNoOrigin(request)) {
    return { error: "Workspace gateway requests must be same-origin.", status: 403 };
  }

  if (matchesBootstrapCapability(request, env)) {
    if (!intent) {
      return {
        error: "Workspace gateway operation intent is required for bootstrap reads.",
        status: 400,
      };
    }

    if (!intent.bootstrapAllowed) {
      return {
        error: "Workspace bootstrap authorization is limited to status and init operations.",
        status: 403,
      };
    }

    if (await ownerSetupComplete(request, env, dependencies)) {
      return { error: "Workspace bootstrap authorization has expired.", status: 403 };
    }

    return { actor: "browser", via: "bootstrap" };
  }

  if (!request.headers.get("Origin") && matchesAdminBearer(request, env)) {
    return { actor: "automation", via: "admin-bearer" };
  }

  const ownerSession = await validateOwnerSessionCookie(request, env);

  if (ownerSession.ok) {
    return { actor: "browser", via: "owner-session" };
  }

  return {
    error: "Workspace gateway authorization is required.",
    status: 401,
  };
}

async function proxyWorkspaceGatewayRequest(
  request: Request,
  env: WorkerWorkspaceGatewayProxyEnv,
  dependencies: WorkerWorkspaceGatewayProxyDependencies,
  proxyTarget: WorkerWorkspaceGatewayProxyConfig,
  authorization: Exclude<GatewayAuthorization, { error: string }>,
  options: { intent?: LocalWorkspaceGatewayOperationIntent },
): Promise<Response> {
  let response: Response;

  try {
    response = await (dependencies.fetch ?? fetch)(sidecarRequestUrl(request, proxyTarget), {
      body: await proxyRequestBody(request),
      headers: proxyWorkspaceGatewayHeaders(request, proxyTarget, authorization, options),
      method: request.method,
    });
  } catch {
    return displaySafeJson({ error: "Workspace gateway sidecar is unavailable." }, 502);
  }

  const contentType = response.headers.get("Content-Type") ?? "";

  if (!contentType.includes("application/json")) {
    return new Response(await response.arrayBuffer(), {
      headers: displaySafeProxyHeaders(response.headers),
      status: response.status,
    });
  }

  const body = (await response.json()) as unknown;

  if (response.status === 200 && typeof body === "object" && body !== null && "operation" in body) {
    return gatewayOperationResponse(request, env, authorization, body.operation);
  }

  return displaySafeJson(body, response.status, displaySafeProxyHeaders(response.headers));
}

function gatewayOperationResponse(
  request: Request,
  env: WorkerWorkspaceGatewayProxyEnv,
  authorization: Exclude<GatewayAuthorization, { error: string }>,
  operation: unknown,
): Response {
  const headers = new Headers();
  const csrfToken = env[LOCAL_WORKSPACE_GATEWAY_CSRF_TOKEN_ENV]?.trim();
  const includeCsrfToken =
    authorization.via === "owner-session" && authorization.actor === "browser";

  if (includeCsrfToken && csrfToken) {
    headers.set(
      "Set-Cookie",
      `${LOCAL_WORKSPACE_GATEWAY_CSRF_COOKIE_NAME}=${csrfToken}; Path=/; SameSite=Lax${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
    );
  }

  return displaySafeJson(
    {
      ...(includeCsrfToken && csrfToken ? { csrfToken } : {}),
      operation,
    },
    200,
    headers,
  );
}

function readOperationIntentFromRequest(
  request: Request,
): { intent?: LocalWorkspaceGatewayOperationIntent; ok: true } | { error: string; ok: false } {
  const operationKind = request.headers.get(LOCAL_WORKSPACE_GATEWAY_OPERATION_KIND_HEADER);

  if (operationKind === null) {
    return { ok: true };
  }

  if (!isLocalWorkspaceGatewayOperationKind(operationKind)) {
    return { error: "Workspace gateway operation intent is invalid.", ok: false };
  }

  return {
    intent: localWorkspaceGatewayReadOperationIntent(operationKind),
    ok: true,
  };
}

function matchesBootstrapCapability(
  request: Request,
  env: WorkerWorkspaceGatewayProxyEnv,
): boolean {
  const expected = env[LOCAL_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN_ENV]?.trim();

  return (
    expected !== undefined &&
    expected !== "" &&
    request.headers.get(LOCAL_WORKSPACE_GATEWAY_BOOTSTRAP_HEADER) === expected
  );
}

function matchesAdminBearer(request: Request, env: WorkerWorkspaceGatewayProxyEnv): boolean {
  const adminToken = env.FORMLESS_ADMIN_TOKEN?.trim();
  const authorization = request.headers.get("Authorization")?.trim();

  if (!adminToken || !authorization) {
    return false;
  }

  return authorization.match(/^Bearer\s+(.+)$/i)?.[1] === adminToken;
}

function validCsrfProof(request: Request, env: WorkerWorkspaceGatewayProxyEnv): boolean {
  const expected = env[LOCAL_WORKSPACE_GATEWAY_CSRF_TOKEN_ENV]?.trim();

  if (!expected) {
    return false;
  }

  return (
    request.headers.get(LOCAL_WORKSPACE_GATEWAY_CSRF_HEADER) === expected &&
    requestCookie(request, LOCAL_WORKSPACE_GATEWAY_CSRF_COOKIE_NAME) === expected
  );
}

async function ownerSetupComplete(
  request: Request,
  env: WorkerWorkspaceGatewayProxyEnv,
  dependencies: WorkerWorkspaceGatewayProxyDependencies,
): Promise<boolean> {
  if (dependencies.readOwnerSetupStatus) {
    return (await dependencies.readOwnerSetupStatus(request, env)).setupComplete;
  }

  if (!env.FORMLESS_AUTHORITY) {
    return false;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);
  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(new URL("/api/formless/setup", request.url), {
      headers: { accept: "application/json" },
      method: "GET",
    }),
  );

  if (!response.ok) {
    return false;
  }

  const body = (await response.json()) as Partial<{ setupComplete: boolean }>;

  return body.setupComplete === true;
}

function sidecarRequestUrl(request: Request, proxyTarget: WorkerWorkspaceGatewayProxyConfig) {
  const requested = new URL(request.url);

  return new URL(`${requested.pathname}${requested.search}`, proxyTarget.endpoint).toString();
}

async function proxyRequestBody(request: Request): Promise<ArrayBuffer | undefined> {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  return request.arrayBuffer();
}

function proxyWorkspaceGatewayHeaders(
  request: Request,
  proxyTarget: WorkerWorkspaceGatewayProxyConfig,
  authorization: Exclude<GatewayAuthorization, { error: string }>,
  options: { intent?: LocalWorkspaceGatewayOperationIntent },
): Headers {
  const headers = new Headers(request.headers);

  headers.delete("Authorization");
  headers.delete("Cookie");
  headers.delete(LOCAL_WORKSPACE_GATEWAY_BOOTSTRAP_HEADER);
  headers.delete(LOCAL_WORKSPACE_GATEWAY_CSRF_HEADER);
  headers.delete(LOCAL_WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER);
  headers.delete(LOCAL_WORKSPACE_GATEWAY_ACTOR_HEADER);
  headers.delete(LOCAL_WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER);
  headers.delete(LOCAL_WORKSPACE_GATEWAY_OPERATION_KIND_HEADER);
  headers.set(LOCAL_WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER, proxyTarget.proxyToken);
  headers.set(LOCAL_WORKSPACE_GATEWAY_ACTOR_HEADER, authorization.actor);
  headers.set(LOCAL_WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER, authorization.via);

  if (options.intent) {
    headers.set(LOCAL_WORKSPACE_GATEWAY_OPERATION_KIND_HEADER, options.intent.operation);
  }

  return headers;
}

async function parseGatewayStartInput(request: {
  json: () => Promise<unknown>;
}): Promise<LocalWorkspaceGatewayStartInputParseResult> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return { error: "Workspace gateway operation request must be JSON.", ok: false };
  }

  return parseLocalWorkspaceGatewayStartInput(body);
}

function displaySafeProxyHeaders(headers: Headers): Headers {
  const next = new Headers();

  for (const key of ["Allow", "Content-Type"]) {
    const value = headers.get(key);

    if (value) {
      next.set(key, value);
    }
  }

  return next;
}

function isLoopbackSidecarEndpoint(value: string): boolean {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  return (
    url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" ||
      url.hostname === "localhost" ||
      url.hostname === "[::1]" ||
      url.hostname === "::1")
  );
}

function isSameOriginOrNoOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");

  return origin === null || origin === new URL(request.url).origin;
}

function isSameOriginWithOrigin(request: Request): boolean {
  return request.headers.get("Origin") === new URL(request.url).origin;
}

function requestCookie(request: Request, name: string): string | undefined {
  const cookies = request.headers.get("Cookie");

  if (!cookies) {
    return undefined;
  }

  for (const part of cookies.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");

    if (rawName === name) {
      return rawValue.join("=");
    }
  }

  return undefined;
}

function displaySafeJson(body: unknown, status: number, headers: Headers = new Headers()) {
  headers.set("Content-Type", "application/json");

  return new Response(JSON.stringify(body), { headers, status });
}

function methodNotAllowed(methods: string[]) {
  return displaySafeJson(
    { error: "Method not allowed." },
    405,
    new Headers({ Allow: methods.join(", ") }),
  );
}
