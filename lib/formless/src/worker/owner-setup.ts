import {
  parseOwnerSetupCompleteRequest,
  parseOwnerSetupToken,
  type OwnerSetupCompleteResponse,
  type OwnerSetupStatusResponse,
} from "../shared/protocol.ts";
import { runtimeTopologyRoutes } from "../shared/runtime-topology.ts";
import { nowIsoString } from "../shared/clock.ts";
import { authorizeAdminWrite, type AuthorityAdminGuardEnv } from "./authority-admin-guard.ts";
import {
  completeFirstOwnerSetupInCurrentTransaction,
  hashOwnerSetupToken,
  readInstanceSetupState,
  resetInstanceSetupTables,
  validateFirstOwnerSetupCapability,
  writeOwnerSetupCapability,
  type CompleteFirstOwnerSetupResult,
  type WriteOwnerSetupCapabilityResult,
} from "./instance-setup-state.ts";
import {
  createOwnerSessionCookie,
  clearOwnerSessionCookie,
  ownerSessionSigningSecret,
  validateOwnerSessionCookie,
} from "./owner-session.ts";
import {
  CENTRAL_AUTH_SESSION_COOKIE_NAME,
  clearCentralAuthSessionCookie,
  revokeCentralAuthSessionCookie,
  validateCentralAuthSessionCookie,
} from "./central-auth-session.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { readInstanceAuthConfig, resetInstanceAuthTables } from "./instance-auth-state.ts";
import {
  clearHostAuthSessionCookie,
  configuredInstanceAuthOrigin,
  hostAuthSessionTargetFromRequestHeaders,
  validateHostAuthSessionAuthorityInStorage,
} from "./instance-auth-handoff.ts";
import { isLocalOwnerSessionRuntime } from "./local-session-bootstrap.ts";
import {
  ensureIdentityOwner,
  readIdentityOwner,
  resetIdentityOwner,
} from "./identity-control-plane.ts";
import { completeOwnerPasskeyRegistration } from "./owner-passkeys.ts";
import { ownerSetupAdminOrigin, ownerSetupSuccessContinueTo } from "./owner-setup-continuation.ts";

export const OWNER_SETUP_API_PATH = "/api/formless/setup";
export const OWNER_SESSION_API_PATH = "/api/formless/session";
export const INTERNAL_RESET_OWNER_SETUP_PATH = "/_internal/reset-owner-setup";
export const OWNER_SESSION_LOGOUT_API_PATH = `${OWNER_SESSION_API_PATH}/logout`;

const ownerSetupCapabilityPath = `${OWNER_SETUP_API_PATH}/capability`;
const ownerSetupCompletePath = `${OWNER_SETUP_API_PATH}/complete`;

type OwnerSetupApiEnv = AuthorityAdminGuardEnv & {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
};

type OwnerSetupCapabilityRequest = {
  expiresAt?: string;
  setupToken: string;
};
type OwnerSetupFailureReason = Extract<CompleteFirstOwnerSetupResult, { ok: false }>["reason"];

export async function handleOwnerSetupApiRequest(
  request: Request,
  env: OwnerSetupApiEnv,
): Promise<Response | undefined> {
  if (!isOwnerApiPath(new URL(request.url).pathname)) {
    return undefined;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);

  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export async function handleOwnerSetupDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: OwnerSetupApiEnv,
): Promise<Response | undefined> {
  const pathname = new URL(request.url).pathname;

  if (pathname === INTERNAL_RESET_OWNER_SETUP_PATH) {
    if (request.method !== "POST") {
      return methodNotAllowedResponse("POST");
    }

    resetInstanceSetupTables(storage);
    resetInstanceAuthTables(storage);
    await resetIdentityOwner(env);

    return jsonResponse({ reset: true });
  }

  if (!isOwnerApiPath(pathname)) {
    return undefined;
  }

  try {
    if (pathname === OWNER_SESSION_LOGOUT_API_PATH) {
      return await handleOwnerLogoutRequest(request, storage, env);
    }

    if (pathname === OWNER_SESSION_API_PATH) {
      return await handleOwnerSessionRequest(request, storage, env);
    }

    if (pathname === OWNER_SETUP_API_PATH) {
      return await handleOwnerSetupStatusRequest(request, storage, env);
    }

    if (pathname === ownerSetupCapabilityPath) {
      return await handleOwnerSetupCapabilityRequest(request, storage, env);
    }

    if (pathname === ownerSetupCompletePath) {
      return await handleOwnerSetupCompleteRequest(request, storage, env);
    }

    return jsonResponse({ error: "Not found." }, 404);
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

function isOwnerApiPath(pathname: string) {
  return (
    isOwnerSetupApiPath(pathname) ||
    pathname === OWNER_SESSION_API_PATH ||
    pathname === OWNER_SESSION_LOGOUT_API_PATH
  );
}

function isOwnerSetupApiPath(pathname: string) {
  return pathname === OWNER_SETUP_API_PATH || pathname.startsWith(`${OWNER_SETUP_API_PATH}/`);
}

async function handleOwnerSessionRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: OwnerSetupApiEnv,
): Promise<Response> {
  switch (request.method) {
    case "GET":
      return await handleOwnerSessionStatusRequest(request, storage, env);
    case "POST":
      return await handleOwnerLoginRequest(request, storage, env);
    default:
      return methodNotAllowedResponse("GET, POST");
  }
}

async function handleOwnerSessionStatusRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: OwnerSetupApiEnv,
): Promise<Response> {
  const owner = await readIdentityOwner(env);
  const state = readInstanceSetupState(storage, owner);

  if (!state.owner) {
    return jsonResponse({ authenticated: false, setupComplete: false });
  }

  const centralSession = await validateCentralAuthSessionCookie(request, storage, env);

  if (centralSession.ok && centralSession.session.principalId === state.owner.id) {
    return jsonResponse({
      authenticated: true,
      owner: state.owner,
      session: { expiresAt: centralSession.session.expiresAt },
      setupComplete: true,
    });
  }

  if (ownerSessionFallbackAllowed(request, storage, env)) {
    const session = await validateOwnerSessionCookie(request, env);

    if (session.ok && session.session.principalId === state.owner.id) {
      return jsonResponse({
        authenticated: true,
        owner: state.owner,
        session: { expiresAt: session.session.expiresAt },
        setupComplete: true,
      });
    }
  }

  const hostSession = await hostOwnerSessionStatusResponse(request, storage, env, state.owner);

  if (hostSession) {
    return hostSession;
  }

  return jsonResponse({
    authenticated: false,
    owner: state.owner,
    setupComplete: true,
  });
}

async function handleOwnerLoginRequest(
  _request: Request,
  storage: DurableObjectStorage,
  env: OwnerSetupApiEnv,
): Promise<Response> {
  const owner = await readIdentityOwner(env);
  const state = readInstanceSetupState(storage, owner);

  if (!state.owner) {
    return jsonResponse(
      { authenticated: false, error: "Owner setup must be complete before login." },
      409,
    );
  }

  return jsonResponse(
    {
      authenticated: false,
      error: "Passkey login is required.",
    },
    401,
    { "WWW-Authenticate": 'Bearer realm="formless-passkey"' },
  );
}

async function handleOwnerLogoutRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: OwnerSetupApiEnv,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  const hostSessionTarget = hostAuthSessionTargetFromRequestHeaders(request.headers);

  if (hostSessionTarget) {
    return jsonResponse(
      { authenticated: false, continueTo: runtimeTopologyRoutes.authAccountSignInRoute },
      200,
      {
        "Set-Cookie": clearHostAuthSessionCookie(hostSessionTarget.targetOrigin),
      },
    );
  }

  const headers = new Headers();

  if (requestHasCookie(request, CENTRAL_AUTH_SESSION_COOKIE_NAME)) {
    await revokeCentralAuthSessionCookie(request, storage, env);
    headers.append("Set-Cookie", clearCentralAuthSessionCookie(request));
  }

  if (ownerSessionFallbackAllowed(request, storage, env)) {
    headers.append("Set-Cookie", clearOwnerSessionCookie(request));
  }

  return jsonResponse(
    { authenticated: false, continueTo: runtimeTopologyRoutes.authAccountSignInRoute },
    200,
    headers,
  );
}

async function hostOwnerSessionStatusResponse(
  request: Request,
  storage: DurableObjectStorage,
  env: OwnerSetupApiEnv,
  owner: Awaited<ReturnType<typeof readIdentityOwner>>,
): Promise<Response | undefined> {
  const hostSessionTarget = hostAuthSessionTargetFromRequestHeaders(request.headers);

  if (!hostSessionTarget) {
    return undefined;
  }

  if (!owner) {
    return jsonResponse({ authenticated: false, setupComplete: false }, 401);
  }

  const hostSession = await validateHostAuthSessionAuthorityInStorage(request, storage, env, {
    target: hostSessionTarget,
  });

  if (!hostSession.ok || hostSession.session.principalId !== owner.id) {
    return jsonResponse(
      {
        authenticated: false,
        owner,
        setupComplete: true,
      },
      401,
    );
  }

  return jsonResponse({
    authenticated: true,
    owner,
    session: { expiresAt: hostSession.session.expiresAt },
    setupComplete: true,
  });
}

function ownerSessionFallbackAllowed(
  request: Request,
  storage: DurableObjectStorage,
  env: OwnerSetupApiEnv,
): boolean {
  return readInstanceAuthConfig(storage) === undefined || isLocalOwnerSessionRuntime(request, env);
}

async function handleOwnerSetupStatusRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: OwnerSetupApiEnv,
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowedResponse("GET");
  }

  return jsonResponse(await ownerSetupStatusResponse(request, storage, env));
}

async function handleOwnerSetupCapabilityRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: OwnerSetupApiEnv,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  const authorization = authorizeAdminWrite(request, env);

  if (!authorization.authorized) {
    return jsonResponse(
      { error: authorization.error },
      authorization.status,
      authorization.headers,
    );
  }

  const body = parseOwnerSetupCapabilityRequest(await readJson(request));
  const owner = await readIdentityOwner(env);
  const result = writeOwnerSetupCapability(
    storage,
    {
      tokenHash: await hashOwnerSetupToken(body.setupToken),
      instanceId: requestInstanceId(request),
      createdAt: nowIsoString(),
      ...(body.expiresAt === undefined ? {} : { expiresAt: body.expiresAt }),
    },
    { owner },
  );

  return ownerSetupCapabilityResponse(result);
}

async function handleOwnerSetupCompleteRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: OwnerSetupApiEnv,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  const bodyValue = await readJson(request);

  if (isRecord(bodyValue) && "response" in bodyValue) {
    return completeOwnerPasskeyRegistration(request, storage, env, bodyValue);
  }

  if (readInstanceAuthConfig(storage)) {
    return jsonResponse({ error: "Owner setup requires a passkey registration response." }, 400);
  }

  const body = parseOwnerSetupCompleteRequest(bodyValue);
  const completedAt = nowIsoString();
  const tokenHash = await hashOwnerSetupToken(body.setupToken);
  const existingOwner = await readIdentityOwner(env);
  const setup = validateFirstOwnerSetupCapability(storage, {
    tokenHash,
    instanceId: requestInstanceId(request),
    now: completedAt,
    owner: existingOwner,
  });

  if (!setup.ok) {
    return await ownerSetupCompleteResponse(request, env, setup);
  }

  const owner = await ensureIdentityOwner(env, {
    now: completedAt,
    owner: body.owner,
  });
  const result = completeFirstOwnerSetupInCurrentTransaction(storage, {
    tokenHash,
    instanceId: requestInstanceId(request),
    now: completedAt,
    owner,
  });

  return await ownerSetupCompleteResponse(request, env, result);
}

async function ownerSetupStatusResponse(
  request: Request,
  storage: DurableObjectStorage,
  env: OwnerSetupApiEnv,
): Promise<OwnerSetupStatusResponse> {
  const owner = await readIdentityOwner(env);
  const state = readInstanceSetupState(storage, owner);
  const authOrigin = await configuredInstanceAuthOrigin(request, env);
  const adminOrigin = await ownerSetupAdminOrigin(request, env);

  if (!state.owner) {
    return {
      ...(adminOrigin === undefined ? {} : { adminOrigin }),
      ...(authOrigin === undefined ? {} : { authOrigin }),
      setupComplete: false,
    };
  }

  return {
    ...(adminOrigin === undefined ? {} : { adminOrigin }),
    ...(authOrigin === undefined ? {} : { authOrigin }),
    setupComplete: true,
    owner: state.owner,
  };
}

function ownerSetupCapabilityResponse(result: WriteOwnerSetupCapabilityResult): Response {
  if (!result.ok) {
    return jsonResponse(
      {
        error: "Owner setup is already complete.",
        owner: result.owner,
        reason: result.reason,
        setupComplete: true,
      },
      409,
    );
  }

  return jsonResponse({
    capabilityCreated: true,
    ...(result.capability.expiresAt === undefined
      ? {}
      : { expiresAt: result.capability.expiresAt }),
    setupComplete: false,
  });
}

async function ownerSetupCompleteResponse(
  request: Request,
  env: OwnerSetupApiEnv,
  result: CompleteFirstOwnerSetupResult,
): Promise<Response> {
  if (result.ok) {
    const continueTo = await ownerSetupSuccessContinueTo(request, env);
    const response: OwnerSetupCompleteResponse = {
      setupComplete: true,
      owner: result.owner,
      ...(continueTo === undefined ? {} : { continueTo }),
    };
    const headers = new Headers();

    if (ownerSessionSigningSecret(env)) {
      const session = await createOwnerSessionCookie({
        env,
        owner: result.owner,
        request,
      });

      headers.set("Set-Cookie", session.cookie);
    }

    return jsonResponse(response, 200, headers);
  }

  const failure = setupFailureResponse(result.reason);

  return jsonResponse(
    {
      error: failure.error,
      ...(result.owner === undefined ? {} : { owner: result.owner }),
      reason: result.reason,
      setupComplete: result.reason === "already-complete",
    },
    failure.status,
  );
}

function setupFailureResponse(reason: OwnerSetupFailureReason): {
  error: string;
  status: number;
} {
  switch (reason) {
    case "already-complete":
      return { error: "Owner setup is already complete.", status: 409 };
    case "expired-token":
      return { error: "Owner setup link has expired.", status: 410 };
    case "invalid-token":
      return { error: "Owner setup link is invalid.", status: 401 };
    case "missing-capability":
      return { error: "Owner setup link is missing or has already been used.", status: 404 };
    case "wrong-instance":
      return { error: "Owner setup link is not valid for this instance.", status: 401 };
  }
}

function parseOwnerSetupCapabilityRequest(value: unknown): OwnerSetupCapabilityRequest {
  if (!isRecord(value)) {
    throw new Error("Owner setup capability request must be an object.");
  }

  const allowedKeys = new Set(["expiresAt", "setupToken"]);

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Owner setup capability request has unsupported key "${key}".`);
    }
  }

  if (!("setupToken" in value)) {
    throw new Error('Owner setup capability request must include "setupToken".');
  }

  const expiresAt =
    value.expiresAt === undefined
      ? undefined
      : parseTrimmedNonEmptyString("Owner setup capability expiresAt", value.expiresAt);

  return {
    setupToken: parseOwnerSetupToken(value.setupToken),
    ...(expiresAt === undefined ? {} : { expiresAt }),
  };
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function requestInstanceId(request: Request): string {
  return new URL(request.url).hostname.toLowerCase();
}

function requestHasCookie(request: Request, name: string): boolean {
  const header = request.headers.get("Cookie");

  if (!header) {
    return false;
  }

  return header.split(";").some((part) => part.split("=", 1)[0]?.trim() === name);
}

function methodNotAllowedResponse(allow: string): Response {
  return jsonResponse({ error: "Method not allowed." }, 405, { Allow: allow });
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);

  if (!responseHeaders.has("Cache-Control")) {
    responseHeaders.set("Cache-Control", "no-store");
  }

  return Response.json(body, {
    status,
    headers: responseHeaders,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Bad request.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTrimmedNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${context} must be a non-empty string.`);
  }

  return value.trim();
}
