import type { AuthorityOperation } from "./authority-operations.ts";
import {
  validateHostAuthSessionAuthority,
  validateHostAuthSessionManagementAuthority,
  type HostAuthSession,
} from "./instance-auth-handoff.ts";
import type { InstanceAuthSessionTargetBinding } from "./instance-auth-state.ts";
import {
  readInternalIdentityAuthorityForPrincipal,
  type ActiveIdentityAuthority,
} from "./identity-owner-internal.ts";
import {
  validateOwnerSessionCookie,
  validateOwnerSessionAuthority,
  type OwnerSession,
  type OwnerSessionAuthorityResolver,
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
  | {
      authorized: true;
      session?: HostAuthSession | OwnerSession;
      via: "admin-bearer" | "host-session" | "owner-session" | "open";
    }
  | {
      authorized: false;
      error: string;
      headers: HeadersInit;
      status: number;
    };

export type OwnerManagementReadAuthorizationResult = InstanceWriteAuthorizationResult;
export type OperationalManagementAuthorizationResult = InstanceWriteAuthorizationResult;
export type OperationalManagementAuthorityResolver = (
  session: OwnerSession,
) => Promise<ActiveIdentityAuthority | null>;

export function authorizeAuthorityOperation(
  request: Request,
  operation: AuthorityOperation,
  env: AuthorityAdminGuardEnv,
  options: {
    hostSessionTarget?: InstanceAuthSessionTargetBinding | undefined;
    resolveOwnerSession?: OwnerSessionAuthorityResolver;
  } = {},
): Promise<AuthorityAdminGuardResult> {
  if (operation.metadata.mode === "read") {
    return Promise.resolve({ authorized: true });
  }

  return authorizeInstanceWrite(request, env, options);
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
  options: {
    hostSessionTarget?: InstanceAuthSessionTargetBinding | undefined;
    resolveOwnerSession?: OwnerSessionAuthorityResolver;
  } = {},
): Promise<InstanceWriteAuthorizationResult> {
  return authorizeOwnerSessionOrAdmin(request, env, {
    error: "Owner session or admin authorization is required for this write endpoint.",
    ...options,
  });
}

export async function authorizeOwnerManagementRead(
  request: Request,
  env: AuthorityAdminGuardEnv,
  options: {
    hostSessionTarget?: InstanceAuthSessionTargetBinding | undefined;
    resolveOwnerSession?: OwnerSessionAuthorityResolver;
  } = {},
): Promise<OwnerManagementReadAuthorizationResult> {
  return authorizeOwnerSessionOrAdmin(request, env, {
    error: "Owner session or admin authorization is required for this read endpoint.",
    ...options,
  });
}

export async function authorizeOperationalManagement(
  request: Request,
  env: AuthorityAdminGuardEnv,
  options: {
    error?: string;
    hostSessionTarget?: InstanceAuthSessionTargetBinding | undefined;
    resolveManagementAuthority?: OperationalManagementAuthorityResolver;
  } = {},
): Promise<OperationalManagementAuthorizationResult> {
  return authorizeManagementSessionOrAdmin(request, env, {
    ...options,
    error:
      options.error ??
      "Owner session, instance-admin session, or admin authorization is required for this endpoint.",
  });
}

async function authorizeOwnerSessionOrAdmin(
  request: Request,
  env: AuthorityAdminGuardEnv,
  options: {
    error: string;
    hostSessionTarget?: InstanceAuthSessionTargetBinding | undefined;
    resolveOwnerSession?: OwnerSessionAuthorityResolver;
  },
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

  const ownerSession = await validateOwnerSessionAuthority(request, env, {
    resolveOwnerSession: options.resolveOwnerSession,
  });

  if (ownerSession.ok) {
    return { authorized: true, session: ownerSession.session, via: "owner-session" };
  }

  const hostSessionEnv =
    env.FORMLESS_AUTHORITY === undefined
      ? undefined
      : { ...env, FORMLESS_AUTHORITY: env.FORMLESS_AUTHORITY };
  const hostSession =
    options.hostSessionTarget === undefined || hostSessionEnv === undefined
      ? undefined
      : await validateHostAuthSessionAuthority(request, hostSessionEnv, {
          target: options.hostSessionTarget,
        });

  if (hostSession?.ok) {
    return { authorized: true, session: hostSession.session, via: "host-session" };
  }

  return {
    authorized: false,
    error: options.error,
    headers: {
      "WWW-Authenticate": 'Bearer realm="formless-admin"',
    },
    status: 401,
  };
}

async function authorizeManagementSessionOrAdmin(
  request: Request,
  env: AuthorityAdminGuardEnv,
  options: {
    error: string;
    hostSessionTarget?: InstanceAuthSessionTargetBinding | undefined;
    resolveManagementAuthority?: OperationalManagementAuthorityResolver;
  },
): Promise<OperationalManagementAuthorizationResult> {
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
    const authority = options.resolveManagementAuthority
      ? await options.resolveManagementAuthority(ownerSession.session)
      : await readInternalIdentityAuthorityForPrincipal(env, ownerSession.session.principalId);

    if (hasOperationalManagementAuthority(authority, ownerSession.session.principalId)) {
      return { authorized: true, session: ownerSession.session, via: "owner-session" };
    }
  }

  const hostSessionEnv =
    env.FORMLESS_AUTHORITY === undefined
      ? undefined
      : { ...env, FORMLESS_AUTHORITY: env.FORMLESS_AUTHORITY };
  const hostSession =
    options.hostSessionTarget === undefined || hostSessionEnv === undefined
      ? undefined
      : await validateHostAuthSessionManagementAuthority(request, hostSessionEnv, {
          target: options.hostSessionTarget,
        });

  if (hostSession?.ok) {
    return { authorized: true, session: hostSession.session, via: "host-session" };
  }

  return {
    authorized: false,
    error: options.error,
    headers: {
      "WWW-Authenticate": 'Bearer realm="formless-admin"',
    },
    status: 401,
  };
}

function hasOperationalManagementAuthority(
  authority: ActiveIdentityAuthority | null,
  principalId: string,
): boolean {
  return (
    authority?.id === principalId &&
    (authority.instanceAdmin === true || authority.instanceOwner === true)
  );
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
