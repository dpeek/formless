import {
  LOCAL_SESSION_BOOTSTRAP_API_PATH,
  LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
} from "@dpeek/formless-gateway";
import { nowIsoString } from "../shared/clock.ts";
import {
  ownerLoginDefaultRedirectTarget,
  parseOwnerLoginRedirectTarget,
  type OwnerLoginRedirectTarget,
} from "../shared/instance-auth.ts";
import { resolveRuntimeProfileKind, runtimeTopologyRoutes } from "../shared/runtime-topology.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { readIdentityOwner, ensureIdentityOwner } from "./identity-control-plane.ts";
import {
  createOwnerSessionCookie,
  ownerSessionSigningSecret,
  type OwnerSessionEnv,
} from "./owner-session.ts";

const originalRequestOriginHeader = "x-formless-original-request-origin";

type LocalSessionBootstrapTokenRow = {
  token_hash: string;
};

export type LocalSessionBootstrapEnv = OwnerSessionEnv & {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
  FORMLESS_RUNTIME_PROFILE?: string;
  [LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV]?: string;
  [WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]?: string;
  [WORKSPACE_GATEWAY_SIDECAR_URL_ENV]?: string;
};

type BootstrapValidation =
  | { ok: true; token: string }
  | { ok: false; error: string; status: number };

type BootstrapExchangeResult =
  | {
      ok: true;
      owner: Parameters<typeof createOwnerSessionCookie>[0]["owner"];
    }
  | { ok: false; reason: "replayed-token" };

export async function handleLocalSessionBootstrapApiRequest(
  request: Request,
  env: LocalSessionBootstrapEnv,
): Promise<Response | undefined> {
  if (!isLocalSessionBootstrapApiPath(new URL(request.url).pathname)) {
    return undefined;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);

  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export async function handleLocalSessionBootstrapDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: LocalSessionBootstrapEnv,
): Promise<Response | undefined> {
  if (!isLocalSessionBootstrapApiPath(new URL(request.url).pathname)) {
    return undefined;
  }

  if (request.method !== "GET") {
    return methodNotAllowedResponse("GET");
  }

  const validation = validateLocalSessionBootstrapRequest(request, env);

  if (!validation.ok) {
    return jsonResponse({ error: validation.error }, validation.status);
  }

  const tokenHash = await hashLocalSessionBootstrapToken(validation.token);
  const exchanged = await exchangeLocalSessionBootstrapToken(storage, env, {
    now: nowIsoString(),
    tokenHash,
  });

  if (!exchanged.ok) {
    return jsonResponse({ error: "Local session bootstrap token is invalid." }, 401);
  }

  const session = await createOwnerSessionCookie({
    env,
    owner: exchanged.owner,
    request,
  });
  const requestUrl = new URL(request.url);
  const redirectTarget =
    parseOwnerLoginRedirectTarget(requestUrl.searchParams.get("redirectTo")) ??
    ownerLoginDefaultRedirectTarget;
  const browserRedirectTarget = localSessionBrowserRedirectTarget(requestUrl, redirectTarget);
  const headers = new Headers({
    Location: new URL(browserRedirectTarget, localSessionRedirectOrigin(request)).toString(),
    "Set-Cookie": session.cookie,
  });

  headers.set("Cache-Control", "no-store");

  return new Response(null, {
    headers,
    status: 302,
  });
}

export function isLocalSessionBootstrapApiPath(pathname: string): boolean {
  return pathname === LOCAL_SESSION_BOOTSTRAP_API_PATH;
}

function validateLocalSessionBootstrapRequest(
  request: Request,
  env: LocalSessionBootstrapEnv,
): BootstrapValidation {
  if (!isLocalWorkspaceRuntime(request, env)) {
    return { ok: false, error: "Not found.", status: 404 };
  }

  if (!isSameOriginOrNoOrigin(request)) {
    return {
      ok: false,
      error: "Local session bootstrap requests must be same-origin.",
      status: 403,
    };
  }

  const expected = normalizedSecret(env[LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV]);
  const actual = normalizedSecret(new URL(request.url).searchParams.get("token") ?? undefined);

  if (!expected || !actual || actual !== expected) {
    return { ok: false, error: "Local session bootstrap token is invalid.", status: 401 };
  }

  return { ok: true, token: actual };
}

function isLocalWorkspaceRuntime(request: Request, env: LocalSessionBootstrapEnv): boolean {
  const requestUrl = new URL(request.url);
  const profileKind = resolveRuntimeProfileKind({
    hostname: requestUrl.hostname,
    profile: env.FORMLESS_RUNTIME_PROFILE,
  });

  return (
    (profileKind === "instance" || profileKind === "dev") &&
    normalizedSecret(env[LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV]) !== undefined &&
    normalizedSecret(env[WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]) !== undefined &&
    normalizedSecret(env[WORKSPACE_GATEWAY_SIDECAR_URL_ENV]) !== undefined &&
    ownerSessionSigningSecret(env) !== undefined
  );
}

function isSameOriginOrNoOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");

  if (!origin) {
    return true;
  }

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function localSessionRedirectOrigin(request: Request): string {
  const originalOrigin = request.headers.get(originalRequestOriginHeader);

  if (originalOrigin) {
    try {
      return new URL(originalOrigin).origin;
    } catch {
      // Fall through to the Durable Object request URL.
    }
  }

  return new URL(request.url).origin;
}

function localSessionBrowserRedirectTarget(
  requestUrl: URL,
  redirectTarget: OwnerLoginRedirectTarget,
): OwnerLoginRedirectTarget {
  if (requestUrl.searchParams.get("reset") !== "1") {
    return redirectTarget;
  }

  const localSessionUrl = new URL(runtimeTopologyRoutes.localSessionRoute, "http://formless.local");

  localSessionUrl.searchParams.set("reset", "1");
  localSessionUrl.searchParams.set("redirectTo", redirectTarget);

  return `${localSessionUrl.pathname}${localSessionUrl.search}` as OwnerLoginRedirectTarget;
}

async function exchangeLocalSessionBootstrapToken(
  storage: DurableObjectStorage,
  env: LocalSessionBootstrapEnv,
  input: { now: string; tokenHash: string },
): Promise<BootstrapExchangeResult> {
  ensureLocalSessionBootstrapTables(storage);

  const claimed = storage.transactionSync(() => {
    if (readLocalSessionBootstrapToken(storage, input.tokenHash)) {
      return { ok: false, reason: "replayed-token" };
    }

    storage.sql.exec(
      `
        INSERT INTO local_session_bootstrap_tokens (
          token_hash,
          consumed_at
        )
        VALUES (?, ?)
      `,
      input.tokenHash,
      input.now,
    );

    return {
      ok: true,
    };
  });

  if (!claimed.ok) {
    return { ok: false, reason: "replayed-token" };
  }

  const existingOwner = await readIdentityOwner(env);
  const owner =
    existingOwner ??
    (await ensureIdentityOwner(env, {
      now: input.now,
      owner: { name: "Local Dev Owner" },
      ownerId: "local-dev-owner",
    }));

  return {
    ok: true,
    owner,
  };
}

function ensureLocalSessionBootstrapTables(storage: DurableObjectStorage) {
  storage.sql.exec(`
    CREATE TABLE IF NOT EXISTS local_session_bootstrap_tokens (
      token_hash TEXT PRIMARY KEY,
      consumed_at TEXT NOT NULL
    );
  `);
}

function readLocalSessionBootstrapToken(
  storage: DurableObjectStorage,
  tokenHash: string,
): LocalSessionBootstrapTokenRow | undefined {
  const row = storage.sql
    .exec<LocalSessionBootstrapTokenRow>(
      "SELECT token_hash FROM local_session_bootstrap_tokens WHERE token_hash = ?",
      tokenHash,
    )
    .next();

  return row.done ? undefined : row.value;
}

async function hashLocalSessionBootstrapToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));

  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function normalizedSecret(value: string | undefined): string | undefined {
  const secret = value?.trim();

  return secret === "" ? undefined : secret;
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
