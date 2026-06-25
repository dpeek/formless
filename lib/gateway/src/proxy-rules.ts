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
  WORKSPACE_GATEWAY_STATUS_API_PATH,
  isWorkspaceGatewayOperationKind,
  isWorkspaceGatewayPath,
  parseWorkspaceGatewayAutoSaveEnqueueInput,
  parseWorkspaceGatewayOperationId,
  parseWorkspaceGatewayStartInput,
  workspaceGatewayAutoSaveEnqueueIntent,
  workspaceGatewayAutoSaveStatusIntent,
  workspaceGatewayOperationExecutionDecision,
  workspaceGatewayOperationPath,
  workspaceGatewayReadOperationIntent,
  workspaceGatewayStartOperationIntent,
  workspaceGatewayStatusIntent,
  type WorkspaceGatewayActor,
  type WorkspaceGatewayAuthorizationVia,
  type WorkspaceGatewayOperationIntent,
  type WorkspaceGatewayStartInput,
  type WorkspaceGatewayStartInputParseResult,
} from "./index.ts";
import type { WorkspaceOperationRequiredCapability } from "@dpeek/formless-workspace";

export type WorkspaceGatewayProxyRulesEnv = {
  adminToken?: string;
  bootstrapToken?: string;
  csrfToken?: string;
};

export type WorkspaceGatewayProxyRulesTarget = {
  endpoint: string;
  proxyToken: string;
};

export type WorkspaceGatewayProxyRulesAuthorization = {
  actor: WorkspaceGatewayActor;
  via: WorkspaceGatewayAuthorizationVia;
};

export type WorkspaceGatewayProxyRulesOwnerSessionValidationResult =
  | { ok: true }
  | { ok: false; reason?: string };

export type WorkspaceGatewayProxyRulesDependencies = {
  capabilities: readonly WorkspaceOperationRequiredCapability[];
  fetch?: typeof fetch;
  proxyTarget: () => WorkspaceGatewayProxyRulesTarget | undefined;
  readOwnerSetupStatus?: (request: Request) => Promise<{ setupComplete: boolean }>;
  validateOwnerSession?: (
    request: Request,
  ) =>
    | Promise<WorkspaceGatewayProxyRulesOwnerSessionValidationResult>
    | WorkspaceGatewayProxyRulesOwnerSessionValidationResult;
};

type GatewayAuthorization =
  | WorkspaceGatewayProxyRulesAuthorization
  | { error: string; status: number };

type GatewayOperationExecutionContext = {
  mutating?: boolean;
  operationInput?: WorkspaceGatewayStartInput;
};

export async function handleWorkspaceGatewayProxyRulesRequest(
  request: Request,
  env: WorkspaceGatewayProxyRulesEnv,
  dependencies: WorkspaceGatewayProxyRulesDependencies,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (!isWorkspaceGatewayPath(url.pathname)) {
    return undefined;
  }

  const proxyTarget = dependencies.proxyTarget();

  if (!proxyTarget) {
    return displaySafeJson({ error: "Not found." }, 404);
  }

  if (url.pathname === WORKSPACE_GATEWAY_STATUS_API_PATH) {
    if (request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    const intent = workspaceGatewayStatusIntent();
    const authorization = await authorizeGatewayRequest(request, env, dependencies, intent, {
      mutating: false,
    });

    if ("error" in authorization) {
      return displaySafeJson({ error: authorization.error }, authorization.status);
    }

    return proxyWorkspaceGatewayRequest(request, env, dependencies, proxyTarget, authorization, {
      intent,
    });
  }

  if (url.pathname === WORKSPACE_GATEWAY_AUTO_SAVE_API_PATH) {
    if (request.method === "GET") {
      const intent = workspaceGatewayAutoSaveStatusIntent();
      const authorization = await authorizeGatewayRequest(request, env, dependencies, intent, {
        mutating: false,
      });

      if ("error" in authorization) {
        return displaySafeJson({ error: authorization.error }, authorization.status);
      }

      return proxyWorkspaceGatewayRequest(request, env, dependencies, proxyTarget, authorization, {
        intent,
      });
    }

    if (request.method === "POST") {
      const parsed = await parseGatewayAutoSaveEnqueueInput(request.clone());

      if (!parsed.ok) {
        return displaySafeJson({ error: parsed.error }, 400);
      }

      const intent = workspaceGatewayAutoSaveEnqueueIntent();
      const authorization = await authorizeGatewayRequest(request, env, dependencies, intent, {
        mutating: true,
      });

      if ("error" in authorization) {
        return displaySafeJson({ error: authorization.error }, authorization.status);
      }

      return proxyWorkspaceGatewayRequest(request, env, dependencies, proxyTarget, authorization, {
        intent,
      });
    }

    return methodNotAllowed(["GET", "POST"]);
  }

  if (url.pathname === WORKSPACE_GATEWAY_OPERATIONS_API_PATH) {
    if (request.method !== "POST") {
      return methodNotAllowed(["POST"]);
    }

    const parsed = await parseGatewayStartInput(request.clone());

    if (!parsed.ok) {
      return displaySafeJson({ error: parsed.error }, 400);
    }

    const intent = workspaceGatewayStartOperationIntent(parsed.input);
    const authorization = await authorizeGatewayRequest(request, env, dependencies, intent, {
      operationInput: parsed.input,
    });

    if ("error" in authorization) {
      return displaySafeJson({ error: authorization.error }, authorization.status);
    }

    return proxyWorkspaceGatewayRequest(request, env, dependencies, proxyTarget, authorization, {
      intent,
    });
  }

  const operationMatch = workspaceGatewayOperationPath(url.pathname);

  if (operationMatch) {
    if (request.method !== "GET") {
      return methodNotAllowed(["GET"]);
    }

    const parsedOperationId = parseWorkspaceGatewayOperationId(operationMatch.operationId);

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
      dependencies,
      readIntent.intent,
    );

    if ("error" in authorization) {
      return displaySafeJson({ error: authorization.error }, authorization.status);
    }

    return proxyWorkspaceGatewayRequest(
      request,
      env,
      dependencies,
      proxyTarget,
      authorization,
      readIntent.intent === undefined ? {} : { intent: readIntent.intent },
    );
  }

  return displaySafeJson({ error: "Not found." }, 404);
}

export function isLoopbackSidecarEndpoint(value: string): boolean {
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

async function authorizeGatewayRequest(
  request: Request,
  env: WorkspaceGatewayProxyRulesEnv,
  dependencies: WorkspaceGatewayProxyRulesDependencies,
  intent: WorkspaceGatewayOperationIntent,
  context: GatewayOperationExecutionContext = {},
): Promise<GatewayAuthorization> {
  if (!isSameOriginOrNoOrigin(request)) {
    return { error: "Workspace gateway requests must be same-origin.", status: 403 };
  }

  if (!request.headers.get("Origin") && matchesAdminBearer(request, env)) {
    return authorizeGatewayOperationExecution(
      { actor: "automation", via: "admin-bearer" },
      dependencies,
      intent,
      context,
    );
  }

  const ownerSession = await validateOwnerSession(request, dependencies);

  if (ownerSession.ok) {
    if (intent.mutating && !isSameOriginWithOrigin(request)) {
      return {
        error: "Workspace gateway browser mutations require a same-origin Origin header.",
        status: 403,
      };
    }

    if (intent.mutating && !validCsrfProof(request, env)) {
      return { error: "Workspace gateway browser mutations require CSRF proof.", status: 403 };
    }

    return authorizeGatewayOperationExecution(
      { actor: "browser", via: "owner-session" },
      dependencies,
      intent,
      context,
    );
  }

  if (matchesBootstrapCapability(request, env)) {
    if (!intent.bootstrapAllowed) {
      return {
        error: "Workspace bootstrap authorization is limited to status operations.",
        status: 403,
      };
    }

    if (await ownerSetupComplete(request, dependencies)) {
      return { error: "Workspace bootstrap authorization has expired.", status: 403 };
    }

    return authorizeGatewayOperationExecution(
      { actor: "browser", via: "bootstrap" },
      dependencies,
      intent,
      context,
    );
  }

  if (intent.mutating && !isSameOriginWithOrigin(request)) {
    return {
      error: "Workspace gateway browser mutations require a same-origin Origin header.",
      status: 403,
    };
  }

  return {
    error: "Workspace gateway authorization is required.",
    status: 401,
  };
}

async function authorizeGatewayReadOperationRequest(
  request: Request,
  env: WorkspaceGatewayProxyRulesEnv,
  dependencies: WorkspaceGatewayProxyRulesDependencies,
  intent: WorkspaceGatewayOperationIntent | undefined,
): Promise<GatewayAuthorization> {
  if (!isSameOriginOrNoOrigin(request)) {
    return { error: "Workspace gateway requests must be same-origin.", status: 403 };
  }

  if (!request.headers.get("Origin") && matchesAdminBearer(request, env)) {
    return intent === undefined
      ? { actor: "automation", via: "admin-bearer" }
      : authorizeGatewayOperationExecution(
          { actor: "automation", via: "admin-bearer" },
          dependencies,
          intent,
          { mutating: false },
        );
  }

  const ownerSession = await validateOwnerSession(request, dependencies);

  if (ownerSession.ok) {
    return intent === undefined
      ? { actor: "browser", via: "owner-session" }
      : authorizeGatewayOperationExecution(
          { actor: "browser", via: "owner-session" },
          dependencies,
          intent,
          { mutating: false },
        );
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
        error: "Workspace bootstrap authorization is limited to status operations.",
        status: 403,
      };
    }

    if (await ownerSetupComplete(request, dependencies)) {
      return { error: "Workspace bootstrap authorization has expired.", status: 403 };
    }

    return authorizeGatewayOperationExecution(
      { actor: "browser", via: "bootstrap" },
      dependencies,
      intent,
      { mutating: false },
    );
  }

  return {
    error: "Workspace gateway authorization is required.",
    status: 401,
  };
}

function authorizeGatewayOperationExecution(
  authorization: WorkspaceGatewayProxyRulesAuthorization,
  dependencies: Pick<WorkspaceGatewayProxyRulesDependencies, "capabilities">,
  intent: WorkspaceGatewayOperationIntent,
  context: GatewayOperationExecutionContext = {},
): GatewayAuthorization {
  const decision = workspaceGatewayOperationExecutionDecision({
    actor: authorization.actor,
    capabilities: dependencies.capabilities,
    intent,
    ...context,
  });

  if (!decision.ok) {
    return { error: decision.error, status: 403 };
  }

  return authorization;
}

async function proxyWorkspaceGatewayRequest(
  request: Request,
  env: WorkspaceGatewayProxyRulesEnv,
  dependencies: WorkspaceGatewayProxyRulesDependencies,
  proxyTarget: WorkspaceGatewayProxyRulesTarget,
  authorization: WorkspaceGatewayProxyRulesAuthorization,
  options: { intent?: WorkspaceGatewayOperationIntent },
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

  if (response.status === 200 && typeof body === "object" && body !== null && "autoSave" in body) {
    return gatewayAutoSaveResponse(request, env, authorization, body.autoSave);
  }

  return displaySafeJson(body, response.status, displaySafeProxyHeaders(response.headers));
}

function gatewayOperationResponse(
  request: Request,
  env: WorkspaceGatewayProxyRulesEnv,
  authorization: WorkspaceGatewayProxyRulesAuthorization,
  operation: unknown,
): Response {
  const browserResponse = gatewayBrowserResponseHeaders(request, env, authorization);

  return displaySafeJson(
    {
      ...(browserResponse.csrfToken === undefined ? {} : { csrfToken: browserResponse.csrfToken }),
      operation,
    },
    200,
    browserResponse.headers,
  );
}

function gatewayAutoSaveResponse(
  request: Request,
  env: WorkspaceGatewayProxyRulesEnv,
  authorization: WorkspaceGatewayProxyRulesAuthorization,
  autoSave: unknown,
): Response {
  const browserResponse = gatewayBrowserResponseHeaders(request, env, authorization);

  return displaySafeJson(
    {
      ...(browserResponse.csrfToken === undefined ? {} : { csrfToken: browserResponse.csrfToken }),
      autoSave,
    },
    200,
    browserResponse.headers,
  );
}

function gatewayBrowserResponseHeaders(
  request: Request,
  env: WorkspaceGatewayProxyRulesEnv,
  authorization: WorkspaceGatewayProxyRulesAuthorization,
): { csrfToken?: string; headers: Headers } {
  const headers = new Headers();
  const csrfToken = env.csrfToken?.trim();
  const includeCsrfToken =
    authorization.via === "owner-session" && authorization.actor === "browser";

  if (includeCsrfToken && csrfToken) {
    headers.set(
      "Set-Cookie",
      `${WORKSPACE_GATEWAY_CSRF_COOKIE_NAME}=${csrfToken}; Path=/; SameSite=Lax${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
    );
  }

  return {
    ...(includeCsrfToken && csrfToken ? { csrfToken } : {}),
    headers,
  };
}

function readOperationIntentFromRequest(
  request: Request,
): { intent?: WorkspaceGatewayOperationIntent; ok: true } | { error: string; ok: false } {
  const operationKind = request.headers.get(WORKSPACE_GATEWAY_OPERATION_KIND_HEADER);

  if (operationKind === null) {
    return { ok: true };
  }

  if (!isWorkspaceGatewayOperationKind(operationKind)) {
    return { error: "Workspace gateway operation intent is invalid.", ok: false };
  }

  return {
    intent: workspaceGatewayReadOperationIntent(operationKind),
    ok: true,
  };
}

function matchesBootstrapCapability(request: Request, env: WorkspaceGatewayProxyRulesEnv): boolean {
  const expected = env.bootstrapToken?.trim();

  return (
    expected !== undefined &&
    expected !== "" &&
    request.headers.get(WORKSPACE_GATEWAY_BOOTSTRAP_HEADER) === expected
  );
}

function matchesAdminBearer(request: Request, env: WorkspaceGatewayProxyRulesEnv): boolean {
  const adminToken = env.adminToken?.trim();
  const authorization = request.headers.get("Authorization")?.trim();

  if (!adminToken || !authorization) {
    return false;
  }

  return authorization.match(/^Bearer\s+(.+)$/i)?.[1] === adminToken;
}

function validCsrfProof(request: Request, env: WorkspaceGatewayProxyRulesEnv): boolean {
  const expected = env.csrfToken?.trim();

  if (!expected) {
    return false;
  }

  return (
    request.headers.get(WORKSPACE_GATEWAY_CSRF_HEADER) === expected &&
    requestCookie(request, WORKSPACE_GATEWAY_CSRF_COOKIE_NAME) === expected
  );
}

async function ownerSetupComplete(
  request: Request,
  dependencies: WorkspaceGatewayProxyRulesDependencies,
): Promise<boolean> {
  if (!dependencies.readOwnerSetupStatus) {
    return false;
  }

  return (await dependencies.readOwnerSetupStatus(request)).setupComplete;
}

async function validateOwnerSession(
  request: Request,
  dependencies: WorkspaceGatewayProxyRulesDependencies,
): Promise<WorkspaceGatewayProxyRulesOwnerSessionValidationResult> {
  if (!dependencies.validateOwnerSession) {
    return { ok: false, reason: "missing-validator" };
  }

  return dependencies.validateOwnerSession(request);
}

function sidecarRequestUrl(
  request: Request,
  proxyTarget: WorkspaceGatewayProxyRulesTarget,
): string {
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
  proxyTarget: WorkspaceGatewayProxyRulesTarget,
  authorization: WorkspaceGatewayProxyRulesAuthorization,
  options: { intent?: WorkspaceGatewayOperationIntent },
): Headers {
  const headers = new Headers(request.headers);

  headers.delete("Authorization");
  headers.delete("Cookie");
  headers.delete(WORKSPACE_GATEWAY_BOOTSTRAP_HEADER);
  headers.delete(WORKSPACE_GATEWAY_CSRF_HEADER);
  headers.delete(WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER);
  headers.delete(WORKSPACE_GATEWAY_ACTOR_HEADER);
  headers.delete(WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER);
  headers.delete(WORKSPACE_GATEWAY_OPERATION_KIND_HEADER);
  headers.set(WORKSPACE_GATEWAY_PROXY_AUTHORIZATION_HEADER, proxyTarget.proxyToken);
  headers.set(WORKSPACE_GATEWAY_ACTOR_HEADER, authorization.actor);
  headers.set(WORKSPACE_GATEWAY_AUTHORIZATION_VIA_HEADER, authorization.via);

  if (options.intent) {
    headers.set(WORKSPACE_GATEWAY_OPERATION_KIND_HEADER, options.intent.operation);
  }

  return headers;
}

async function parseGatewayStartInput(request: {
  json: () => Promise<unknown>;
}): Promise<WorkspaceGatewayStartInputParseResult> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return { error: "Workspace gateway operation request must be JSON.", ok: false };
  }

  return parseWorkspaceGatewayStartInput(body);
}

async function parseGatewayAutoSaveEnqueueInput(request: { json: () => Promise<unknown> }) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return { error: "Workspace auto-save enqueue request must be JSON.", ok: false } as const;
  }

  return parseWorkspaceGatewayAutoSaveEnqueueInput(body);
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
