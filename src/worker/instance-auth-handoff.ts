import {
  INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
  instanceControlPlaneAppInstallsFromRecords,
  instanceControlPlaneProductionIdentityFromRecords,
} from "@dpeek/formless-instance-control-plane";

import { nowIsoString } from "../shared/clock.ts";
import {
  FORMLESS_INSTANCE_AUTH_ORIGIN_ENV_NAME,
  ownerLoginRedirectLocationForRoute,
  parseInstanceAuthCanonicalOrigin,
  parseOwnerLoginRedirectTarget,
} from "../shared/instance-auth.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import {
  consumeHandoffGrant,
  createHandoffGrant,
  type CreateHandoffGrantInput,
  readHostSessionRevocationVersion,
  type InstanceAuthHandoffTargetProfile,
  type InstanceAuthSessionTargetBinding,
  type StoredHandoffGrant,
} from "./instance-auth-state.ts";
import { readControlPlaneRecords } from "./deployment-control-plane-client.ts";
import {
  readInternalIdentityAuthorityForPrincipal,
  readInternalActiveIdentityPrincipal,
  readInternalIdentityOwnerForPrincipal,
} from "./identity-owner-internal.ts";
import {
  ownerSessionSigningSecret,
  validateOwnerSessionAuthority,
  validateOwnerSessionPrincipal,
  type OwnerSession,
  type OwnerSessionEnv,
} from "./owner-session.ts";
import {
  resolveInstanceRuntimeRouteFromRecords,
  type InstanceRuntimeMountRouteResolution,
  type InstanceRuntimeRouteResolution,
} from "./instance-runtime-routes.ts";
import {
  activeAppPackageResolver,
  type ActiveRuntimeAppPackageEnv,
} from "./runtime-app-packages.ts";
import type { OperationInvocationActor } from "../shared/operation-invocation.ts";

export const INSTANCE_AUTH_HANDOFF_START_PATH = "/_formless/auth/handoff";
export const INSTANCE_AUTH_HANDOFF_CALLBACK_PATH = "/_formless/auth/callback";
export const HOST_AUTH_NONCE_COOKIE_NAME = "formless_host_auth_nonce";
export const HOST_AUTH_SESSION_COOKIE_NAME = "formless_host_session";

const instanceAuthHostSessionValidatePath = "/_formless/auth/host-session/validate";
const handoffGrantTtlMs = 5 * 60 * 1000;
const hostNonceMaxAgeSeconds = 5 * 60;
const hostSessionMaxAgeSeconds = 12 * 60 * 60;
const hostSessionPurpose = "host-session";
const hostSessionVersion = 1;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const handoffTargetProfiles = ["instance", "app", "public-site"] as const;
const handoffTargetHeaders = {
  appInstallId: "x-formless-auth-handoff-app-install-id",
  routeId: "x-formless-auth-handoff-route-id",
  storageIdentity: "x-formless-auth-handoff-storage-identity",
  targetOrigin: "x-formless-auth-handoff-target-origin",
  targetProfile: "x-formless-auth-handoff-target-profile",
} as const;

export type InstanceAuthHandoffEnv = OwnerSessionEnv & {
  [FORMLESS_INSTANCE_AUTH_ORIGIN_ENV_NAME]?: string;
  FORMLESS_AUTHORITY: DurableObjectNamespace;
  FORMLESS_RUNTIME_PROFILE?: string;
} & ActiveRuntimeAppPackageEnv;

export type HostAuthSession = InstanceAuthSessionTargetBinding & {
  expiresAt: string;
  instanceId: string;
  issuedAt: string;
  principalId: string;
  sessionVersion: number;
};

export type HostAuthSessionValidationFailureReason =
  | "expired"
  | "malformed-cookie"
  | "malformed-payload"
  | "missing-cookie"
  | "missing-management-authority"
  | "missing-owner-authority"
  | "missing-principal"
  | "missing-secret"
  | "missing-target"
  | "revoked-session"
  | "tampered-cookie"
  | "wrong-instance"
  | "wrong-purpose"
  | "wrong-target";

export type HostAuthSessionAuthorityValidationResult =
  | {
      ok: true;
      session: HostAuthSession;
    }
  | {
      ok: false;
      reason: HostAuthSessionValidationFailureReason;
    };

type HostAuthSessionPayload = HostAuthSession & {
  purpose: typeof hostSessionPurpose;
  version: typeof hostSessionVersion;
};

type ProtectedRouteAccess = "authenticated" | "owner";
type HostSessionAuthorityRequirement = ProtectedRouteAccess | "management";

export type RouteAccessSessionValidationResult =
  | {
      ok: true;
      ownerAuthorized: boolean;
      principalId: string;
      session: HostAuthSession | OwnerSession;
      target?: InstanceAuthSessionTargetBinding;
      via: "host-session" | "owner-session";
    }
  | {
      ok: false;
      reason:
        | HostAuthSessionValidationFailureReason
        | "missing-owner-authority"
        | "missing-principal";
    };

export async function startProtectedRouteAuthHandoff(
  request: Request,
  env: InstanceAuthHandoffEnv,
  runtimeRoute: InstanceRuntimeRouteResolution | undefined,
): Promise<Response | undefined> {
  const target = hostAuthSessionTargetForRuntimeRoute(request, runtimeRoute, {
    minimumAccess: "authenticated",
  });

  if (!target) {
    return undefined;
  }

  const authOrigin = await configuredInstanceAuthOrigin(request, env);

  if (!authOrigin) {
    return undefined;
  }

  if (authOrigin === requestOriginForAuth(request)) {
    return undefined;
  }

  const url = new URL(request.url);
  const returnTo = parseOwnerLoginRedirectTarget(`${url.pathname}${url.search}`);

  if (!returnTo) {
    return jsonResponse({ error: "Handoff return target must be path-only." }, 400);
  }

  const nonce = randomBase64Url(32);
  const nonceHash = await sha256Base64Url(nonce);
  const state = randomBase64Url(32);
  const location = new URL(INSTANCE_AUTH_HANDOFF_START_PATH, authOrigin);

  location.searchParams.set("targetOrigin", target.targetOrigin);
  location.searchParams.set("routeId", target.routeId);
  location.searchParams.set("targetProfile", target.targetProfile);
  if (target.appInstallId !== undefined) {
    location.searchParams.set("appInstallId", target.appInstallId);
  }
  if (target.storageIdentity !== undefined) {
    location.searchParams.set("storageIdentity", target.storageIdentity);
  }
  location.searchParams.set("returnTo", returnTo);
  location.searchParams.set("nonceHash", nonceHash);
  location.searchParams.set("state", state);

  return redirectResponse(location.toString(), 302, {
    "Set-Cookie": serializeHostAuthNonceCookie(target.targetOrigin, nonce),
  });
}

export async function startOwnerRouteAuthHandoff(
  request: Request,
  env: InstanceAuthHandoffEnv,
  runtimeRoute: InstanceRuntimeRouteResolution | undefined,
): Promise<Response | undefined> {
  return startProtectedRouteAuthHandoff(request, env, runtimeRoute);
}

export async function handleInstanceAuthHandoffRequest(
  request: Request,
  env: InstanceAuthHandoffEnv,
  runtimeRoute?: InstanceRuntimeRouteResolution,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (url.pathname === INSTANCE_AUTH_HANDOFF_CALLBACK_PATH) {
    const target = hostAuthSessionTargetForRuntimeRoute(request, runtimeRoute);

    if (!target) {
      return new Response(null, { status: 404 });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "GET, HEAD" });
    }

    const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);

    return env.FORMLESS_AUTHORITY.get(id).fetch(requestWithHandoffTargetHeaders(request, target));
  }

  if (url.pathname !== INSTANCE_AUTH_HANDOFF_START_PATH) {
    return undefined;
  }

  const authOrigin = await configuredInstanceAuthOrigin(request, env);

  if (!authOrigin) {
    return jsonResponse({ error: "Instance auth configuration is missing." }, 400);
  }

  if (authOrigin !== requestOriginForAuth(request)) {
    return new Response(null, { status: 404 });
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);

  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export async function handleInstanceAuthHandoffDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceAuthHandoffEnv,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (url.pathname === instanceAuthHostSessionValidatePath) {
    return handleHostAuthSessionValidationDurableObjectRequest(request, storage, env);
  }

  if (url.pathname === INSTANCE_AUTH_HANDOFF_CALLBACK_PATH) {
    return handleHandoffCallbackDurableObjectRequest(request, storage, env);
  }

  if (url.pathname !== INSTANCE_AUTH_HANDOFF_START_PATH) {
    return undefined;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "GET, HEAD" });
  }

  try {
    const target = await verifiedHandoffStartTargetFromSearch(request, env, url);
    const session =
      target.requiredAccess === "owner"
        ? await validateOwnerSessionAuthority(request, env)
        : await validateOwnerSessionPrincipal(request, env);

    if (!session.ok) {
      return redirectResponse(
        ownerLoginRedirectLocationForRoute(`${url.pathname}${url.search}`),
        302,
      );
    }

    return await issueHandoffGrantRedirect(storage, target, {
      instanceId: session.session.instanceId,
      principalId: session.session.principalId,
    });
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

export async function configuredInstanceAuthOrigin(
  request: Request,
  env: Pick<
    InstanceAuthHandoffEnv,
    typeof FORMLESS_INSTANCE_AUTH_ORIGIN_ENV_NAME | "FORMLESS_AUTHORITY"
  >,
): Promise<string | undefined> {
  const explicitOrigin = stringEnvValue(env[FORMLESS_INSTANCE_AUTH_ORIGIN_ENV_NAME]);

  if (explicitOrigin !== undefined) {
    return parseInstanceAuthCanonicalOrigin(explicitOrigin);
  }

  const identity = instanceControlPlaneProductionIdentityFromRecords(
    (await readControlPlaneRecords({ env, requestUrl: request.url })) ?? [],
  );

  return identity?.authOrigin;
}

export function hostAuthSessionTargetForRuntimeRoute(
  request: Request,
  runtimeRoute: InstanceRuntimeRouteResolution | undefined,
  options: { minimumAccess?: ProtectedRouteAccess } = {},
): InstanceAuthSessionTargetBinding | undefined {
  if (
    runtimeRoute?.kind !== "mount" ||
    runtimeRoute.matchHost === undefined ||
    (options.minimumAccess !== undefined &&
      !runtimeRouteAccessSatisfies(runtimeRoute.access, options.minimumAccess))
  ) {
    return undefined;
  }

  const targetOrigin = requestOriginForAuth(request);

  if (runtimeRoute.target !== undefined) {
    return {
      appInstallId: runtimeRoute.target.installId,
      routeId: runtimeRoute.id,
      storageIdentity: runtimeRoute.target.authorityName,
      targetOrigin,
      targetProfile: runtimeRoute.targetProfile,
    };
  }

  return {
    routeId: runtimeRoute.id,
    storageIdentity: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
    targetOrigin,
    targetProfile: runtimeRoute.targetProfile,
  };
}

export function hostAuthSessionTargetFromRequestHeaders(
  headers: Headers,
): InstanceAuthSessionTargetBinding | undefined {
  return hostAuthSessionTargetFromHeaders(headers);
}

export function setHostAuthSessionTargetHeaders(
  headers: Headers,
  target: InstanceAuthSessionTargetBinding | undefined,
): void {
  if (target === undefined) {
    headers.delete(handoffTargetHeaders.targetOrigin);
    headers.delete(handoffTargetHeaders.routeId);
    headers.delete(handoffTargetHeaders.targetProfile);
    headers.delete(handoffTargetHeaders.appInstallId);
    headers.delete(handoffTargetHeaders.storageIdentity);

    return;
  }

  headers.set(handoffTargetHeaders.targetOrigin, target.targetOrigin);
  headers.set(handoffTargetHeaders.routeId, target.routeId);
  headers.set(handoffTargetHeaders.targetProfile, target.targetProfile);

  if (target.appInstallId === undefined) {
    headers.delete(handoffTargetHeaders.appInstallId);
  } else {
    headers.set(handoffTargetHeaders.appInstallId, target.appInstallId);
  }

  if (target.storageIdentity === undefined) {
    headers.delete(handoffTargetHeaders.storageIdentity);
  } else {
    headers.set(handoffTargetHeaders.storageIdentity, target.storageIdentity);
  }
}

export async function validateHostAuthSessionAuthority(
  request: Request,
  env: InstanceAuthHandoffEnv,
  options: {
    now?: string;
    requiredAccess?: ProtectedRouteAccess;
    runtimeRoute?: InstanceRuntimeRouteResolution | undefined;
    target?: InstanceAuthSessionTargetBinding | undefined;
  } = {},
): Promise<HostAuthSessionAuthorityValidationResult> {
  const requiredAccess = options.requiredAccess ?? "owner";
  const target =
    options.target ??
    (options.runtimeRoute === undefined
      ? undefined
      : hostAuthSessionTargetForRuntimeRoute(request, options.runtimeRoute, {
          minimumAccess: requiredAccess,
        }));

  return validateHostAuthSessionRequirement(request, env, {
    now: options.now,
    requiredAccess,
    target,
  });
}

export async function validateHostAuthSessionManagementAuthority(
  request: Request,
  env: InstanceAuthHandoffEnv,
  options: {
    now?: string;
    runtimeRoute?: InstanceRuntimeRouteResolution | undefined;
    target?: InstanceAuthSessionTargetBinding | undefined;
  } = {},
): Promise<HostAuthSessionAuthorityValidationResult> {
  const target =
    options.target ??
    (options.runtimeRoute === undefined
      ? undefined
      : hostAuthSessionTargetForRuntimeRoute(request, options.runtimeRoute));

  return validateHostAuthSessionRequirement(request, env, {
    now: options.now,
    requiredAccess: "management",
    target,
  });
}

async function validateHostAuthSessionRequirement(
  request: Request,
  env: InstanceAuthHandoffEnv,
  options: {
    now?: string;
    requiredAccess: HostSessionAuthorityRequirement;
    target?: InstanceAuthSessionTargetBinding | undefined;
  },
): Promise<HostAuthSessionAuthorityValidationResult> {
  const { requiredAccess, target } = options;

  if (!target) {
    return { ok: false, reason: "missing-target" };
  }

  const validated = await validateHostAuthSessionCookie(request, env, {
    now: options.now,
    target,
  });

  if (!validated.ok) {
    return validated;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);
  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(new URL(instanceAuthHostSessionValidatePath, request.url), {
      body: JSON.stringify({ requiredAccess, session: validated.session }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
  const body = (await response.json()) as {
    authorized?: boolean;
    reason?: HostAuthSessionValidationFailureReason;
  };

  if (!response.ok || body.authorized !== true) {
    return {
      ok: false,
      reason: body.reason ?? missingAuthorityReason(requiredAccess),
    };
  }

  return validated;
}

export async function validateRouteAccessSession(
  request: Request,
  env: InstanceAuthHandoffEnv,
  options: {
    now?: string;
    requiredAccess: ProtectedRouteAccess;
    runtimeRoute?: InstanceRuntimeRouteResolution | undefined;
    target?: InstanceAuthSessionTargetBinding | undefined;
  },
): Promise<RouteAccessSessionValidationResult> {
  const target =
    options.target ??
    (options.runtimeRoute === undefined
      ? undefined
      : hostAuthSessionTargetForRuntimeRoute(request, options.runtimeRoute, {
          minimumAccess: options.requiredAccess,
        }));
  const ownerSession =
    options.requiredAccess === "owner"
      ? await validateOwnerSessionAuthority(request, env, { now: options.now })
      : await validateOwnerSessionPrincipal(request, env, { now: options.now });

  if (ownerSession.ok) {
    return {
      ok: true,
      ownerAuthorized: options.requiredAccess === "owner",
      principalId: ownerSession.session.principalId,
      session: ownerSession.session,
      ...(target === undefined ? {} : { target }),
      via: "owner-session",
    };
  }

  const hostSession =
    target === undefined
      ? undefined
      : await validateHostAuthSessionAuthority(request, env, {
          now: options.now,
          requiredAccess: options.requiredAccess,
          target,
        });

  if (hostSession?.ok) {
    return {
      ok: true,
      ownerAuthorized: options.requiredAccess === "owner",
      principalId: hostSession.session.principalId,
      session: hostSession.session,
      target,
      via: "host-session",
    };
  }

  return {
    ok: false,
    reason:
      hostSession?.reason ??
      (ownerSession.reason === "missing-owner-authority"
        ? "missing-owner-authority"
        : "missing-principal"),
  };
}

export function authenticatedOperationActorForSession(session: {
  principalId: string;
  session: Pick<HostAuthSession | OwnerSession, "instanceId">;
  target?: InstanceAuthSessionTargetBinding;
}): OperationInvocationActor | undefined {
  if (session.target === undefined) {
    return undefined;
  }

  return {
    kind: "authenticated",
    principalId: session.principalId,
    sessionTarget: {
      instanceId: session.session.instanceId,
      routeId: session.target.routeId,
      targetOrigin: session.target.targetOrigin,
      targetProfile: session.target.targetProfile,
      ...(session.target.appInstallId === undefined
        ? {}
        : { appInstallId: session.target.appInstallId }),
      ...(session.target.storageIdentity === undefined
        ? {}
        : { storageIdentity: session.target.storageIdentity }),
    },
  };
}

async function handleHandoffCallbackDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceAuthHandoffEnv,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "GET, HEAD" });
  }

  try {
    const url = new URL(request.url);
    const target = handoffTargetBindingFromHeaders(request.headers);
    const nonce = requestCookie(request, HOST_AUTH_NONCE_COOKIE_NAME);

    if (!nonce) {
      return jsonResponse({ error: "Handoff callback is invalid." }, 400);
    }

    const consumed = consumeHandoffGrant(storage, {
      grantId: base64UrlSearchParam(url, "grantId"),
      grantSecretHash: await sha256Base64Url(base64UrlSearchParam(url, "grantSecret")),
      nonceHash: await sha256Base64Url(nonce),
      state: base64UrlSearchParam(url, "state"),
      target,
    });

    if (!consumed.ok) {
      return jsonResponse({ error: "Handoff callback is invalid." }, 400);
    }

    const hostSession = await createHostAuthSessionCookie(storage, env, consumed.grant);
    const responseHeaders = new Headers();

    responseHeaders.set("Cache-Control", "no-store");
    responseHeaders.set("Location", consumed.grant.returnTo);
    responseHeaders.append("Set-Cookie", hostSession.cookie);
    responseHeaders.append("Set-Cookie", clearHostAuthNonceCookie(consumed.grant.targetOrigin));

    return new Response(null, {
      headers: responseHeaders,
      status: 302,
    });
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

async function handleHostAuthSessionValidationDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceAuthHandoffEnv,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
  }

  try {
    const body = (await request.json()) as { requiredAccess?: unknown; session?: unknown };
    const requiredAccess = parseHostSessionAuthorityRequirement(body.requiredAccess) ?? "owner";
    const session = parseHostAuthSession(body.session);

    if (!session) {
      return jsonResponse({ authorized: false, reason: "malformed-payload" }, 400);
    }

    if (!(await hostSessionPrincipalSatisfiesAuthority(env, session, requiredAccess))) {
      return jsonResponse(
        {
          authorized: false,
          reason: missingAuthorityReason(requiredAccess),
        },
        401,
      );
    }

    const currentVersion = readHostSessionRevocationVersion(storage, session);

    if ((currentVersion?.sessionVersion ?? 0) !== session.sessionVersion) {
      return jsonResponse({ authorized: false, reason: "revoked-session" }, 401);
    }

    return jsonResponse({ authorized: true });
  } catch {
    return jsonResponse({ authorized: false, reason: "malformed-payload" }, 400);
  }
}

async function hostSessionPrincipalSatisfiesAuthority(
  env: InstanceAuthHandoffEnv,
  session: HostAuthSession,
  requiredAccess: HostSessionAuthorityRequirement,
): Promise<boolean> {
  if (requiredAccess === "management") {
    const authority = await readInternalIdentityAuthorityForPrincipal(env, session.principalId);

    return (
      authority?.id === session.principalId && (authority.instanceAdmin || authority.instanceOwner)
    );
  }

  const principal =
    requiredAccess === "owner"
      ? await readInternalIdentityOwnerForPrincipal(env, session.principalId)
      : await readInternalActiveIdentityPrincipal(env, session.principalId);

  return principal?.id === session.principalId;
}

async function validateHostAuthSessionCookie(
  request: Request,
  env: InstanceAuthHandoffEnv,
  options: { now?: string; target: InstanceAuthSessionTargetBinding },
): Promise<HostAuthSessionAuthorityValidationResult> {
  const value = requestCookie(request, HOST_AUTH_SESSION_COOKIE_NAME);

  if (!value) {
    return { ok: false, reason: "missing-cookie" };
  }

  const secret = ownerSessionSigningSecret(env);

  if (!secret) {
    return { ok: false, reason: "missing-secret" };
  }

  const parts = value.split(".");

  if (parts.length !== 2 || parts[0] === "" || parts[1] === "") {
    return { ok: false, reason: "malformed-cookie" };
  }

  const [payloadPart, signature] = parts;
  const expectedSignature = await signString(payloadPart, secret);

  if (!constantTimeEqual(signature, expectedSignature)) {
    return { ok: false, reason: "tampered-cookie" };
  }

  const payload = parseHostAuthSessionPayload(payloadPart);

  if (!payload) {
    return { ok: false, reason: "malformed-payload" };
  }

  if (payload.purpose !== hostSessionPurpose) {
    return { ok: false, reason: "wrong-purpose" };
  }

  const instanceId = await hostAuthSessionInstanceId(request, env);

  if (!instanceId || payload.instanceId !== instanceId) {
    return { ok: false, reason: "wrong-instance" };
  }

  if (
    parseTimestampMs("Host auth session expiresAt", payload.expiresAt) <=
    parseTimestampMs("Host auth session validation time", options.now ?? nowIsoString())
  ) {
    return { ok: false, reason: "expired" };
  }

  if (
    payload.targetOrigin !== requestOriginForAuth(request) ||
    !hostAuthSessionTargetBindingsEqual(payload, options.target)
  ) {
    return { ok: false, reason: "wrong-target" };
  }

  return {
    ok: true,
    session: {
      expiresAt: payload.expiresAt,
      instanceId: payload.instanceId,
      issuedAt: payload.issuedAt,
      principalId: payload.principalId,
      routeId: payload.routeId,
      sessionVersion: payload.sessionVersion,
      targetOrigin: payload.targetOrigin,
      targetProfile: payload.targetProfile,
      ...(payload.appInstallId === undefined ? {} : { appInstallId: payload.appInstallId }),
      ...(payload.storageIdentity === undefined
        ? {}
        : { storageIdentity: payload.storageIdentity }),
    },
  };
}

function handoffStartTargetFromSearch(
  url: URL,
): Omit<CreateHandoffGrantInput, "expiresAt" | "grantSecretHash" | "instanceId" | "principalId"> {
  const returnTo = parseOwnerLoginRedirectTarget(requiredSearchParam(url, "returnTo"));

  if (!returnTo) {
    throw new Error("Handoff return target must be path-only.");
  }

  const appInstallId = optionalSearchParam(url, "appInstallId");
  const storageIdentity = optionalSearchParam(url, "storageIdentity");

  if (appInstallId === undefined && storageIdentity === undefined) {
    throw new Error("Handoff target requires app install id or storage identity.");
  }

  return {
    ...(appInstallId === undefined ? {} : { appInstallId }),
    nonceHash: base64UrlSearchParam(url, "nonceHash"),
    returnTo,
    routeId: requiredSearchParam(url, "routeId"),
    state: base64UrlSearchParam(url, "state"),
    ...(storageIdentity === undefined ? {} : { storageIdentity }),
    targetOrigin: parseInstanceAuthCanonicalOrigin(requiredSearchParam(url, "targetOrigin")),
    targetProfile: handoffTargetProfileSearchParam(url),
  };
}

async function verifiedHandoffStartTargetFromSearch(
  request: Request,
  env: InstanceAuthHandoffEnv,
  url: URL,
): Promise<
  Omit<CreateHandoffGrantInput, "expiresAt" | "grantSecretHash" | "instanceId" | "principalId"> & {
    requiredAccess: ProtectedRouteAccess;
  }
> {
  const target = handoffStartTargetFromSearch(url);
  const route = await runtimeRouteForHandoffTarget(request, env, target);

  if (!route || route.access === "anonymous") {
    throw new Error("Handoff target route is not protected.");
  }

  const targetUrl = new URL(target.returnTo, target.targetOrigin);
  const routeTarget = hostAuthSessionTargetForRuntimeRoute(
    new Request(targetUrl.toString()),
    route,
    { minimumAccess: "authenticated" },
  );

  if (!routeTarget || !hostAuthSessionTargetBindingsEqual(routeTarget, target)) {
    throw new Error("Handoff target route does not match.");
  }

  return {
    ...target,
    requiredAccess: route.access,
  };
}

async function runtimeRouteForHandoffTarget(
  request: Request,
  env: InstanceAuthHandoffEnv,
  target: InstanceAuthSessionTargetBinding & { returnTo: string },
): Promise<InstanceRuntimeMountRouteResolution | undefined> {
  const records = (await readControlPlaneRecords({ env, requestUrl: request.url })) ?? [];
  const packageResolver = activeAppPackageResolver(env);
  const targetUrl = new URL(target.returnTo, target.targetOrigin);
  const route = resolveInstanceRuntimeRouteFromRecords({
    appInstalls: instanceControlPlaneAppInstallsFromRecords(records, packageResolver),
    records,
    request: {
      host: targetUrl.hostname,
      pathname: targetUrl.pathname,
      search: targetUrl.search,
    },
    options: { includeHostless: false },
    packageResolver,
  });

  return route?.kind === "mount" && route.id === target.routeId ? route : undefined;
}

async function issueHandoffGrantRedirect(
  storage: DurableObjectStorage,
  target: Omit<
    CreateHandoffGrantInput,
    "expiresAt" | "grantSecretHash" | "instanceId" | "principalId"
  >,
  owner: { instanceId: string; principalId: string },
): Promise<Response> {
  const createdAt = nowIsoString();
  const expiresAt = new Date(Date.parse(createdAt) + handoffGrantTtlMs).toISOString();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const grantSecret = randomBase64Url(32);
    const grant = createHandoffGrant(storage, {
      ...target,
      createdAt,
      expiresAt,
      grantId: randomBase64Url(24),
      grantSecretHash: await sha256Base64Url(grantSecret),
      instanceId: owner.instanceId,
      principalId: owner.principalId,
    });

    if (grant.ok) {
      const location = new URL(INSTANCE_AUTH_HANDOFF_CALLBACK_PATH, grant.grant.targetOrigin);

      location.searchParams.set("grantId", grant.grant.grantId);
      location.searchParams.set("grantSecret", grantSecret);
      location.searchParams.set("state", grant.grant.state);

      return redirectResponse(location.toString(), 302);
    }
  }

  return jsonResponse({ error: "Handoff grant could not be issued." }, 409);
}

async function createHostAuthSessionCookie(
  storage: DurableObjectStorage,
  env: InstanceAuthHandoffEnv,
  grant: StoredHandoffGrant,
): Promise<{ cookie: string; session: HostAuthSession }> {
  const secret = ownerSessionSigningSecret(env);

  if (!secret) {
    throw new Error("Host auth session signing secret is not configured.");
  }

  const issuedAt = nowIsoString();
  const expiresAt = new Date(Date.parse(issuedAt) + hostSessionMaxAgeSeconds * 1000).toISOString();
  const revocationVersion = readHostSessionRevocationVersion(storage, {
    instanceId: grant.instanceId,
    principalId: grant.principalId,
    routeId: grant.routeId,
    targetOrigin: grant.targetOrigin,
    targetProfile: grant.targetProfile,
    ...(grant.appInstallId === undefined ? {} : { appInstallId: grant.appInstallId }),
    ...(grant.storageIdentity === undefined ? {} : { storageIdentity: grant.storageIdentity }),
  });
  const session: HostAuthSession = {
    expiresAt,
    instanceId: grant.instanceId,
    issuedAt,
    principalId: grant.principalId,
    routeId: grant.routeId,
    sessionVersion: revocationVersion?.sessionVersion ?? 0,
    targetOrigin: grant.targetOrigin,
    targetProfile: grant.targetProfile,
    ...(grant.appInstallId === undefined ? {} : { appInstallId: grant.appInstallId }),
    ...(grant.storageIdentity === undefined ? {} : { storageIdentity: grant.storageIdentity }),
  };
  const payload: HostAuthSessionPayload = {
    ...session,
    purpose: hostSessionPurpose,
    version: hostSessionVersion,
  };
  const value = await signHostAuthSessionPayload(payload, secret);

  return {
    cookie: serializeHostAuthSessionCookie(grant.targetOrigin, value, expiresAt),
    session,
  };
}

function serializeHostAuthNonceCookie(targetOrigin: string, nonce: string): string {
  const parts = [
    `${HOST_AUTH_NONCE_COOKIE_NAME}=${nonce}`,
    "Path=/",
    `Max-Age=${hostNonceMaxAgeSeconds}`,
    `Expires=${new Date(Date.now() + hostNonceMaxAgeSeconds * 1000).toUTCString()}`,
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (new URL(targetOrigin).protocol === "https:") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function clearHostAuthNonceCookie(targetOrigin: string): string {
  const parts = [
    `${HOST_AUTH_NONCE_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (new URL(targetOrigin).protocol === "https:") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function serializeHostAuthSessionCookie(
  targetOrigin: string,
  value: string,
  expiresAt: string,
): string {
  const parts = [
    `${HOST_AUTH_SESSION_COOKIE_NAME}=${value}`,
    "Path=/",
    `Max-Age=${hostSessionMaxAgeSeconds}`,
    `Expires=${new Date(expiresAt).toUTCString()}`,
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (new URL(targetOrigin).protocol === "https:") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function requestWithHandoffTargetHeaders(
  request: Request,
  target: InstanceAuthSessionTargetBinding,
): Request {
  const headers = new Headers(request.headers);

  setHostAuthSessionTargetHeaders(headers, target);

  return new Request(request, { headers });
}

function handoffTargetBindingFromHeaders(headers: Headers): InstanceAuthSessionTargetBinding {
  const appInstallId = optionalHeader(headers, handoffTargetHeaders.appInstallId);
  const storageIdentity = optionalHeader(headers, handoffTargetHeaders.storageIdentity);

  if (appInstallId === undefined && storageIdentity === undefined) {
    throw new Error("Handoff callback target requires app install id or storage identity.");
  }

  return {
    ...(appInstallId === undefined ? {} : { appInstallId }),
    routeId: requiredHeader(headers, handoffTargetHeaders.routeId),
    ...(storageIdentity === undefined ? {} : { storageIdentity }),
    targetOrigin: parseInstanceAuthCanonicalOrigin(
      requiredHeader(headers, handoffTargetHeaders.targetOrigin),
    ),
    targetProfile: handoffTargetProfileValue(
      requiredHeader(headers, handoffTargetHeaders.targetProfile),
    ),
  };
}

function hostAuthSessionTargetFromHeaders(
  headers: Headers,
): InstanceAuthSessionTargetBinding | undefined {
  try {
    return handoffTargetBindingFromHeaders(headers);
  } catch {
    return undefined;
  }
}

function parseHostAuthSessionPayload(payloadPart: string): HostAuthSessionPayload | undefined {
  try {
    const parsed = JSON.parse(base64UrlDecodeUtf8(payloadPart)) as unknown;
    const session = parseHostAuthSession(parsed);

    if (!session || !isRecord(parsed) || parsed.purpose !== hostSessionPurpose) {
      return undefined;
    }

    if (parsed.version !== hostSessionVersion) {
      return undefined;
    }

    return {
      ...session,
      purpose: hostSessionPurpose,
      version: hostSessionVersion,
    };
  } catch {
    return undefined;
  }
}

function parseHostAuthSession(value: unknown): HostAuthSession | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const sessionVersion = parseNonNegativeIntegerValue(value.sessionVersion);
  const targetProfile =
    typeof value.targetProfile === "string" ? handoffTargetProfileValue(value.targetProfile) : null;
  const appInstallId = optionalRecordString(value.appInstallId);
  const storageIdentity = optionalRecordString(value.storageIdentity);

  if (
    typeof value.instanceId !== "string" ||
    value.instanceId.trim() === "" ||
    typeof value.principalId !== "string" ||
    value.principalId.trim() === "" ||
    typeof value.issuedAt !== "string" ||
    value.issuedAt.trim() === "" ||
    typeof value.expiresAt !== "string" ||
    value.expiresAt.trim() === "" ||
    typeof value.routeId !== "string" ||
    value.routeId.trim() === "" ||
    typeof value.targetOrigin !== "string" ||
    value.targetOrigin.trim() === "" ||
    !isTimestamp(value.issuedAt) ||
    !isTimestamp(value.expiresAt) ||
    sessionVersion === undefined ||
    targetProfile === null ||
    (appInstallId === undefined && storageIdentity === undefined)
  ) {
    return undefined;
  }

  return {
    expiresAt: value.expiresAt,
    instanceId: value.instanceId.trim(),
    issuedAt: value.issuedAt,
    principalId: value.principalId.trim(),
    routeId: value.routeId.trim(),
    sessionVersion,
    targetOrigin: parseInstanceAuthCanonicalOrigin(value.targetOrigin),
    targetProfile,
    ...(appInstallId === undefined ? {} : { appInstallId }),
    ...(storageIdentity === undefined ? {} : { storageIdentity }),
  };
}

function hostAuthSessionTargetBindingsEqual(
  left: InstanceAuthSessionTargetBinding,
  right: InstanceAuthSessionTargetBinding,
): boolean {
  return (
    left.targetOrigin === right.targetOrigin &&
    left.routeId === right.routeId &&
    left.targetProfile === right.targetProfile &&
    left.appInstallId === right.appInstallId &&
    left.storageIdentity === right.storageIdentity
  );
}

function runtimeRouteAccessSatisfies(
  actual: ProtectedRouteAccess | "anonymous",
  required: ProtectedRouteAccess,
): boolean {
  return runtimeRouteAccessRank(actual) >= runtimeRouteAccessRank(required);
}

function runtimeRouteAccessRank(access: ProtectedRouteAccess | "anonymous"): number {
  switch (access) {
    case "anonymous":
      return 0;
    case "authenticated":
      return 1;
    case "owner":
      return 2;
  }
}

function parseProtectedRouteAccess(value: unknown): ProtectedRouteAccess | undefined {
  return value === "authenticated" || value === "owner" ? value : undefined;
}

function parseHostSessionAuthorityRequirement(
  value: unknown,
): HostSessionAuthorityRequirement | undefined {
  return value === "management" ? value : parseProtectedRouteAccess(value);
}

function missingAuthorityReason(
  requiredAccess: HostSessionAuthorityRequirement,
): HostAuthSessionValidationFailureReason {
  switch (requiredAccess) {
    case "authenticated":
      return "missing-principal";
    case "management":
      return "missing-management-authority";
    case "owner":
      return "missing-owner-authority";
  }
}

function requestOriginForAuth(request: Request): string {
  const requestUrl = new URL(request.url);
  const forwardedHost =
    firstHeaderValue(request.headers.get("x-forwarded-host")) ??
    forwardedHeaderValue(request.headers.get("forwarded"), "host");
  const forwardedProto =
    firstHeaderValue(request.headers.get("x-forwarded-proto")) ??
    forwardedHeaderValue(request.headers.get("forwarded"), "proto");
  const originUrl = new URL(
    `${forwardedProto ?? requestUrl.protocol.replace(/:$/, "")}://${forwardedHost ?? requestUrl.host}`,
  );

  if (originUrl.protocol === "http:" && !isLocalhost(originUrl.hostname)) {
    originUrl.protocol = "https:";
  }

  return parseInstanceAuthCanonicalOrigin(originUrl.origin);
}

function handoffTargetProfileSearchParam(url: URL): InstanceAuthHandoffTargetProfile {
  const value = requiredSearchParam(url, "targetProfile");

  return handoffTargetProfileValue(value);
}

function handoffTargetProfileValue(value: string): InstanceAuthHandoffTargetProfile {
  if (!handoffTargetProfiles.includes(value as InstanceAuthHandoffTargetProfile)) {
    throw new Error("Handoff target profile is invalid.");
  }

  return value as InstanceAuthHandoffTargetProfile;
}

function requiredSearchParam(url: URL, name: string): string {
  const value = optionalSearchParam(url, name);

  if (value === undefined) {
    throw new Error(`Handoff ${name} is required.`);
  }

  return value;
}

function optionalSearchParam(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name);

  return value === null || value.trim() === "" ? undefined : value.trim();
}

function requiredHeader(headers: Headers, name: string): string {
  const value = optionalHeader(headers, name);

  if (value === undefined) {
    throw new Error(`Handoff ${name} header is required.`);
  }

  return value;
}

function optionalHeader(headers: Headers, name: string): string | undefined {
  const value = headers.get(name);

  return value === null || value.trim() === "" ? undefined : value.trim();
}

function base64UrlSearchParam(url: URL, name: string): string {
  const value = requiredSearchParam(url, name);

  if (!base64UrlPattern.test(value)) {
    throw new Error(`Handoff ${name} must be base64url.`);
  }

  return value;
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));

  return base64UrlEncode(new Uint8Array(digest));
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);

  crypto.getRandomValues(bytes);

  return base64UrlEncode(bytes);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signHostAuthSessionPayload(payload: HostAuthSessionPayload, secret: string) {
  const payloadPart = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await signString(payloadPart, secret);

  return `${payloadPart}.${signature}`;
}

async function signString(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));

  return base64UrlEncode(new Uint8Array(signature));
}

function base64UrlDecodeUtf8(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(normalized + padding);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder().decode(bytes);
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  let diff = 0;

  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= leftBytes[index] ^ rightBytes[index];
  }

  return diff === 0;
}

function redirectResponse(location: string, status: number, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);

  responseHeaders.set("Location", location);

  return new Response(null, {
    headers: responseHeaders,
    status,
  });
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);

  if (!responseHeaders.has("Cache-Control")) {
    responseHeaders.set("Cache-Control", "no-store");
  }

  return Response.json(body, {
    headers: responseHeaders,
    status,
  });
}

function stringEnvValue(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function firstHeaderValue(value: string | null): string | undefined {
  const first = value?.split(",")[0]?.trim();

  return first ? first : undefined;
}

function forwardedHeaderValue(value: string | null, key: "host" | "proto"): string | undefined {
  const first = firstHeaderValue(value);

  if (!first) {
    return undefined;
  }

  for (const part of first.split(";")) {
    const [partKey, partValue] = part.split("=", 2);

    if (partKey?.trim().toLowerCase() !== key) {
      continue;
    }

    const normalized = partValue?.trim().replace(/^"|"$/g, "");

    return normalized ? normalized : undefined;
  }

  return undefined;
}

function requestCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("Cookie");

  if (!header) {
    return undefined;
  }

  for (const part of header.split(";")) {
    const [cookieName, ...valueParts] = part.split("=");

    if (cookieName?.trim() === name) {
      return valueParts.join("=").trim();
    }
  }

  return undefined;
}

async function hostAuthSessionInstanceId(
  request: Request,
  env: InstanceAuthHandoffEnv,
): Promise<string | undefined> {
  const authOrigin = await configuredInstanceAuthOrigin(request, env);

  return authOrigin ? new URL(authOrigin).hostname.toLowerCase() : undefined;
}

function parseTimestampMs(context: string, value: string): number {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    throw new Error(`${context} must be a valid timestamp.`);
  }

  return timestamp;
}

function isTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalRecordString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function parseNonNegativeIntegerValue(value: unknown): number | undefined {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 ? value : undefined;
}

function isLocalhost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Bad request.";
}
