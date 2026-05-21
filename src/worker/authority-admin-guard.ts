import type { AuthorityOperation } from "./authority-operations.ts";
import {
  validateOwnerSessionCookie,
  type OwnerSession,
  type OwnerSessionEnv,
} from "./owner-session.ts";

export type AuthorityAdminGuardEnv = OwnerSessionEnv & {
  FORMLESS_ADMIN_TOKEN?: string;
};

export type AuthorityAdminGuardResult =
  | { authorized: true }
  | {
      authorized: false;
      error: string;
      headers: HeadersInit;
      status: number;
    };

export type InstanceWriteAuthorizationResult =
  | { authorized: true; session?: OwnerSession; via: "admin-bearer" | "owner-session" | "open" }
  | {
      authorized: false;
      error: string;
      headers: HeadersInit;
      status: number;
    };

export function authorizeAuthorityOperation(
  request: Request,
  operation: AuthorityOperation,
  env: AuthorityAdminGuardEnv,
): AuthorityAdminGuardResult {
  if (operation.metadata.mode === "read") {
    return { authorized: true };
  }

  return authorizeAdminWrite(request, env);
}

export function authorizeAdminWrite(
  request: Request,
  env: AuthorityAdminGuardEnv,
): AuthorityAdminGuardResult {
  const adminToken = normalizedAdminToken(env.FORMLESS_ADMIN_TOKEN);

  if (!adminToken) {
    return { authorized: true };
  }

  if (requestAdminToken(request) === adminToken) {
    return { authorized: true };
  }

  return {
    authorized: false,
    error: "Admin authorization is required for this write endpoint.",
    headers: {
      "WWW-Authenticate": 'Bearer realm="formless-admin"',
    },
    status: 401,
  };
}

export async function authorizeInstanceWrite(
  request: Request,
  env: AuthorityAdminGuardEnv,
): Promise<InstanceWriteAuthorizationResult> {
  const adminToken = normalizedAdminToken(env.FORMLESS_ADMIN_TOKEN);
  const sessionProtectionConfigured =
    normalizedAdminToken(env.FORMLESS_OWNER_SESSION_SECRET) !== undefined;

  if (!adminToken && !sessionProtectionConfigured) {
    return { authorized: true, via: "open" };
  }

  if (adminToken && requestAdminToken(request) === adminToken) {
    return { authorized: true, via: "admin-bearer" };
  }

  const ownerSession = await validateOwnerSessionCookie(request, env);

  if (ownerSession.ok) {
    return { authorized: true, session: ownerSession.session, via: "owner-session" };
  }

  return {
    authorized: false,
    error: "Owner session or admin authorization is required for this write endpoint.",
    headers: {
      "WWW-Authenticate": 'Bearer realm="formless-admin"',
    },
    status: 401,
  };
}

function normalizedAdminToken(value: string | undefined) {
  const token = value?.trim();

  return token === "" ? undefined : token;
}

function requestAdminToken(request: Request) {
  const authorization = request.headers.get("Authorization");

  if (!authorization) {
    return undefined;
  }

  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());

  return match?.[1];
}
