import type { AuthorityOperation } from "./authority-operations.ts";

export type AuthorityAdminGuardEnv = {
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
