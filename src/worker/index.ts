import { FormlessAuthority } from "./authority.ts";
import { handleWorkspaceGatewayProxyRequest } from "@dpeek/formless-gateway/worker";
import { parseAuthorityApiRoute } from "../shared/app-storage-identity.ts";
import { handleInstanceArchiveApiRequest } from "./archive-api.ts";
import { authorizeInstanceWrite, authorizeOwnerManagementRead } from "./authority-admin-guard.ts";
import { selectAuthorityOperation } from "./authority-operations.ts";
import { handleClientAssetRequest } from "./client-shell.ts";
import { handleDeployMetadataRequest } from "./deploy-metadata.ts";
import {
  handleMediaRequest as handleMediaPackageRequest,
  mediaObjectStoreFromR2Bucket,
} from "@dpeek/formless-media/worker";
import { handleInstanceDomainProviderApiRequest } from "./domain-provider-api.ts";
import { handleInstanceDeploymentRuntimeApiRequest } from "./deployment-runtime-api.ts";
import {
  handleInstanceEmailDeliveryQueueBatch,
  handleInstanceEmailRuntimeApiRequest,
  type EmailDeliveryQueueBinding,
  type CloudflareSendEmailBinding,
} from "./email-runtime.ts";
import { handleInstanceAppInstallsApiRequest } from "./instance-app-installs.ts";
import { handleInstanceControlPlaneApiRequest } from "./instance-control-plane.ts";
import { handleInstanceDomainMappingsApiRequest } from "./instance-domain-mappings.ts";
import { handleIdentityControlPlaneApiRequest } from "./identity-control-plane.ts";
import { resolveInstanceRuntimeRouteForRequest } from "./instance-runtime-routes.ts";
import { mappedAppHostFromRuntimeRoute } from "./mapped-app-host.ts";
import {
  handleInstanceAuthHandoffRequest,
  hostAuthSessionTargetForRuntimeRoute,
  setHostAuthSessionTargetHeaders,
  startOwnerRouteAuthHandoff,
  validateHostAuthSessionAuthority,
} from "./instance-auth-handoff.ts";
import { handleOwnerSetupApiRequest } from "./owner-setup.ts";
import { handleOwnerPasskeyApiRequest } from "./owner-passkeys.ts";
import { ownerLoginRedirectLocationForRoute } from "../shared/instance-auth.ts";
import {
  areSchemaKeyApiRoutesEnabledForRequest,
  mappedSiteHostRedirectForRequest,
  publishedSiteRedirectForRequest,
  resolveWorkerRuntimeRequestTopology,
  shouldDeferToStaticAssets,
  shouldRedirectAnonymousOwnerBrowserRoute,
  workerRuntimeProfileInput,
  type WorkerRuntimeRequestTopology,
} from "./routing.ts";
import {
  handlePublicSiteDocumentRequest,
  handlePublicSiteIconRequest,
  handlePublicSiteIndexingRequest,
  mappedPublicSiteHostFromRuntimeRoute,
} from "./public-site-worker-runtime.ts";
import { handleInstanceUpgradeStatusApiRequest } from "./upgrade-status-api.ts";
import {
  handleLocalSessionBootstrapApiRequest,
  isLocalSessionBootstrapApiPath,
} from "./local-session-bootstrap.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { validateOwnerSessionAuthority, validateOwnerSessionCookie } from "./owner-session.ts";
import type { TurnstileRuntimeEnv } from "../shared/turnstile-config.ts";
import { activeAppPackageResolver } from "./runtime-app-packages.ts";
import { WORKSPACE_OPERATION_CAPABILITIES } from "@dpeek/formless-workspace";

export { FormlessAuthority } from "./authority.ts";

export type Env = TurnstileRuntimeEnv & {
  ALCHEMY_PASSWORD?: string;
  ASSETS?: Fetcher;
  CF_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  FORMLESS_ADMIN_TOKEN?: string;
  FORMLESS_AUTHORITY: DurableObjectNamespace<FormlessAuthority>;
  FORMLESS_DEPLOY_VERSION?: string;
  FORMLESS_DOMAIN_PROVIDER_CLOUDFLARE_ACCOUNT_ID?: string;
  FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID?: string;
  FORMLESS_DOMAIN_PROVIDER_WORKER_NAME?: string;
  FORMLESS_EMAIL?: CloudflareSendEmailBinding;
  FORMLESS_EMAIL_DELIVERY_QUEUE?: EmailDeliveryQueueBinding;
  FORMLESS_DOMAIN_PROVIDER_ZONE_ID?: string;
  FORMLESS_DOMAIN_PROVIDER_ZONE_NAME?: string;
  FORMLESS_DOMAIN_PROVIDER_ZONES?: string;
  FORMLESS_INSTANCE_AUTH_ORIGIN?: string;
  FORMLESS_INSTANCE_AUTH_RELYING_PARTY_ID?: string;
  FORMLESS_INSTANCE_AUTH_RELYING_PARTY_NAME?: string;
  FORMLESS_LAUNCH_FIXTURE?: string;
  FORMLESS_LOCAL_SESSION_BOOTSTRAP_TOKEN?: string;
  FORMLESS_MEDIA: R2Bucket;
  FORMLESS_OWNER_SESSION_SECRET?: string;
  FORMLESS_RUNTIME_APP_INSTALL_ID?: string;
  FORMLESS_RUNTIME_PACKAGE_APP_KEY?: string;
  FORMLESS_RUNTIME_PROFILE?: string;
  FORMLESS_TURNSTILE_SITEVERIFY?: Fetcher;
  FORMLESS_WORKSPACE_APP_PACKAGES?: string;
  FORMLESS_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN?: string;
  FORMLESS_WORKSPACE_GATEWAY_CSRF_TOKEN?: string;
  FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN?: string;
  FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL?: string;
};

export default {
  async fetch(request, env) {
    const earlyInstanceAppInstallsResponse = await handleInstanceAppInstallsApiRequest(
      request,
      env,
    );

    if (earlyInstanceAppInstallsResponse) {
      return earlyInstanceAppInstallsResponse;
    }

    const runtimeRoute = await resolveInstanceRuntimeRouteForRequest(request, env, {
      includeHostless: false,
    });

    if (runtimeRoute?.kind === "redirect") {
      return redirectResponse(runtimeRoute.location, runtimeRoute.status);
    }

    if (runtimeRoute?.kind === "not-found") {
      return new Response(null, { status: 404 });
    }

    const packageResolver = activeAppPackageResolver(env);
    const mappedAppHost = mappedAppHostFromRuntimeRoute(runtimeRoute);
    const mappedSiteHost = mappedPublicSiteHostFromRuntimeRoute(runtimeRoute);
    const mappedRouteTargetProfile =
      runtimeRoute?.kind === "mount" ? runtimeRoute.targetProfile : undefined;
    const isMappedAppProfileHost = mappedRouteTargetProfile === "app";
    const isMappedAuthBlockedProfileHost =
      mappedRouteTargetProfile === "app" || mappedRouteTargetProfile === "public-site";
    const effectiveRuntimeProfile = workerRuntimeProfileInput(
      mappedRouteTargetProfile === "instance"
        ? "instance"
        : isMappedAppProfileHost
          ? "app"
          : env.FORMLESS_RUNTIME_PROFILE,
    );
    const requestTopology = resolveWorkerRuntimeRequestTopology(request, effectiveRuntimeProfile);
    const workspaceGatewayRouteAvailable = workerWorkspaceGatewayRouteAvailable(
      requestTopology,
      runtimeRoute,
    );
    const workspaceGatewayResponse = await handleWorkspaceGatewayProxyRequest(request, env, {
      capabilities: WORKSPACE_OPERATION_CAPABILITIES,
      readOwnerSetupStatus: (setupRequest) => readOwnerSetupStatus(setupRequest, env),
      routeAvailable: workspaceGatewayRouteAvailable,
      validateOwnerSession: (sessionRequest) => validateOwnerSessionCookie(sessionRequest, env),
    });

    if (workspaceGatewayResponse) {
      return workspaceGatewayResponse;
    }

    const mediaResponse = await handleMediaPackageRequest(request, {
      authorizeWrite: (writeRequest) => authorizeInstanceWrite(writeRequest, env),
      pathname: requestTopology.pathname,
      provider: "r2",
      store: mediaObjectStoreFromR2Bucket(env.FORMLESS_MEDIA),
    });

    if (mediaResponse) {
      return mediaResponse;
    }

    const siteIconResponse = await handlePublicSiteIconRequest(request, env, {
      mappedSiteHost,
      packageResolver,
      runtimeTopology: requestTopology,
    });

    if (siteIconResponse) {
      return siteIconResponse;
    }

    const publishedSiteRedirect = mappedSiteHost
      ? mappedSiteHostRedirectForRequest(request, requestTopology)
      : publishedSiteRedirectForRequest(request, requestTopology);

    if (publishedSiteRedirect) {
      return redirectResponse(publishedSiteRedirect.location, publishedSiteRedirect.status);
    }

    const publishedSiteIndexingResponse = await handlePublicSiteIndexingRequest(request, env, {
      mappedSiteHost,
      packageResolver,
      runtimeTopology: requestTopology,
    });

    if (publishedSiteIndexingResponse) {
      return publishedSiteIndexingResponse;
    }

    const deployMetadataResponse = handleDeployMetadataRequest(request, env, {
      packageResolver,
    });

    if (deployMetadataResponse) {
      return deployMetadataResponse;
    }

    const instanceAuthHandoffResponse = await handleInstanceAuthHandoffRequest(
      request,
      env,
      runtimeRoute,
    );

    if (instanceAuthHandoffResponse) {
      return instanceAuthHandoffResponse;
    }

    if (isMappedAuthBlockedProfileHost && isOwnerAuthRoute(requestTopology.pathname)) {
      return notFoundResponse(requestTopology.apiPath);
    }

    const localSessionBootstrapResponse = isLocalSessionBootstrapApiPath(requestTopology.pathname)
      ? await handleLocalSessionBootstrapApiRequest(
          authorityRequestWithOriginalUrlFacts(request),
          env,
        )
      : undefined;

    if (localSessionBootstrapResponse) {
      return localSessionBootstrapResponse;
    }

    const ownerSetupResponse = await handleOwnerSetupApiRequest(request, env);

    if (ownerSetupResponse) {
      return ownerSetupResponse;
    }

    const ownerPasskeyResponse = await handleOwnerPasskeyApiRequest(request, env);

    if (ownerPasskeyResponse) {
      return ownerPasskeyResponse;
    }

    const archiveResponse = await handleInstanceArchiveApiRequest(request, env);

    if (archiveResponse) {
      return archiveResponse;
    }

    const instanceUpgradeStatusResponse = await handleInstanceUpgradeStatusApiRequest(request, env);

    if (instanceUpgradeStatusResponse) {
      return instanceUpgradeStatusResponse;
    }

    const instanceControlPlaneResponse = await handleInstanceControlPlaneApiRequest(request, env);

    if (instanceControlPlaneResponse) {
      return instanceControlPlaneResponse;
    }

    const identityControlPlaneResponse = await handleIdentityControlPlaneApiRequest(request, env);

    if (identityControlPlaneResponse) {
      return identityControlPlaneResponse;
    }

    const instanceDomainProviderResponse = await handleInstanceDomainProviderApiRequest(
      request,
      env,
    );

    if (instanceDomainProviderResponse) {
      return instanceDomainProviderResponse;
    }

    const instanceDeploymentRuntimeResponse = await handleInstanceDeploymentRuntimeApiRequest(
      request,
      env,
    );

    if (instanceDeploymentRuntimeResponse) {
      return instanceDeploymentRuntimeResponse;
    }

    const instanceEmailRuntimeResponse = await handleInstanceEmailRuntimeApiRequest(request, env);

    if (instanceEmailRuntimeResponse) {
      return instanceEmailRuntimeResponse;
    }

    const instanceDomainMappingsResponse = await handleInstanceDomainMappingsApiRequest(
      request,
      env,
    );

    if (instanceDomainMappingsResponse) {
      return instanceDomainMappingsResponse;
    }

    const url = new URL(request.url);
    const authorityRoute = parseAuthorityApiRoute(url.pathname, activeAppPackageResolver(env));

    if (authorityRoute) {
      const hostSessionTarget = hostAuthSessionTargetForInstalledAppAuthorityRoute(
        request,
        runtimeRoute,
        authorityRoute.identity.authorityName,
      );

      if (
        authorityRoute.identity.kind === "schemaKey" &&
        (isMappedAuthBlockedProfileHost ||
          !areSchemaKeyApiRoutesEnabledForRequest(request, requestTopology))
      ) {
        return Response.json({ error: "Not found." }, { status: 404 });
      }

      if (
        authorityRoute.identity.kind === "appInstall" &&
        isInstalledAppManagementApiRead(request, authorityRoute.path)
      ) {
        const authorization = await authorizeOwnerManagementRead(request, env, {
          hostSessionTarget,
        });

        if (!authorization.authorized) {
          return Response.json(
            { error: authorization.error },
            {
              headers: authorization.headers,
              status: authorization.status,
            },
          );
        }
      }

      const authorityId = env.FORMLESS_AUTHORITY.idFromName(authorityRoute.identity.authorityName);
      const authority = env.FORMLESS_AUTHORITY.get(authorityId);

      return authority.fetch(authorityRequestWithOriginalUrlFacts(request, { hostSessionTarget }));
    }

    const ownerBrowserRedirect = await redirectAnonymousOwnerBrowserRoute(
      request,
      env,
      requestTopology,
      runtimeRoute,
    );

    if (ownerBrowserRedirect) {
      return ownerBrowserRedirect;
    }

    const siteDocumentResponse = await handlePublicSiteDocumentRequest(request, env, {
      mappedSiteHost,
      packageResolver,
      runtimeTopology: requestTopology,
    });

    if (siteDocumentResponse) {
      return siteDocumentResponse;
    }

    if (env.ASSETS && shouldDeferToStaticAssets(request, requestTopology)) {
      const clientAssetResponse = await handleClientAssetRequest(request, env, {
        mappedAppHost,
        runtimeTopology: requestTopology,
      });

      if (clientAssetResponse) {
        return clientAssetResponse;
      }
    }

    return new Response(null, { status: 404 });
  },
  async queue(batch, env) {
    await handleInstanceEmailDeliveryQueueBatch(batch, env);
  },
} satisfies ExportedHandler<Env>;

function redirectResponse(location: string, status: number): Response {
  return new Response(null, {
    headers: {
      Location: location,
    },
    status,
  });
}

function isOwnerAuthRoute(pathname: string): boolean {
  return (
    pathname === "/setup" ||
    pathname === "/login" ||
    isLocalSessionBootstrapApiPath(pathname) ||
    pathname === "/api/formless/setup" ||
    pathname.startsWith("/api/formless/setup/") ||
    pathname === "/api/formless/session" ||
    pathname.startsWith("/api/formless/session/") ||
    pathname === "/api/formless/passkeys" ||
    pathname.startsWith("/api/formless/passkeys/")
  );
}

function isInstalledAppManagementApiRead(request: Request, path: `/${string}`): boolean {
  const operation = selectAuthorityOperation({
    method: request.method,
    path,
    searchParams: new URL(request.url).searchParams,
  });

  if (operation?.metadata.mode === "read") {
    return operation.kind !== "siteTree";
  }

  return request.method === "GET" && path === "/sync/ws";
}

function hostAuthSessionTargetForInstalledAppAuthorityRoute(
  request: Request,
  runtimeRoute: Awaited<ReturnType<typeof resolveInstanceRuntimeRouteForRequest>>,
  storageIdentity: string,
) {
  const target = hostAuthSessionTargetForRuntimeRoute(request, runtimeRoute, {
    requireOwnerAccess: true,
  });

  if (!target || target.storageIdentity !== storageIdentity) {
    return undefined;
  }

  return target;
}

function workerWorkspaceGatewayRouteAvailable(
  requestTopology: WorkerRuntimeRequestTopology,
  runtimeRoute: Awaited<ReturnType<typeof resolveInstanceRuntimeRouteForRequest>>,
): boolean {
  return (
    requestTopology.routePolicy.workspaceGatewayApiRoutes &&
    !(runtimeRoute?.kind === "mount" && runtimeRoute.matchHost !== undefined)
  );
}

async function redirectAnonymousOwnerBrowserRoute(
  request: Request,
  env: Env,
  requestTopology: WorkerRuntimeRequestTopology,
  exactHostRuntimeRoute: Awaited<ReturnType<typeof resolveInstanceRuntimeRouteForRequest>>,
): Promise<Response | undefined> {
  if (!shouldRedirectAnonymousOwnerBrowserRoute(request, requestTopology, exactHostRuntimeRoute)) {
    return undefined;
  }

  const runtimeRoute =
    exactHostRuntimeRoute?.kind === "mount"
      ? exactHostRuntimeRoute
      : await resolveInstanceRuntimeRouteForRequest(request, env);

  if (!shouldRedirectAnonymousOwnerBrowserRoute(request, requestTopology, runtimeRoute)) {
    return undefined;
  }

  const ownerSession = await validateOwnerSessionAuthority(request, env);

  if (ownerSession.ok) {
    return undefined;
  }

  const hostSession = await validateHostAuthSessionAuthority(request, env, {
    runtimeRoute,
  });

  if (hostSession.ok) {
    return undefined;
  }

  const handoffRedirect = await startOwnerRouteAuthHandoff(request, env, runtimeRoute);

  if (handoffRedirect) {
    return handoffRedirect;
  }

  return redirectResponse(
    ownerLoginRedirectLocationForRoute(ownerBrowserRedirectTarget(request)),
    302,
  );
}

function ownerBrowserRedirectTarget(request: Request) {
  const url = new URL(request.url);

  return `${url.pathname}${url.search}`;
}

function notFoundResponse(json: boolean): Response {
  return json
    ? Response.json({ error: "Not found." }, { status: 404 })
    : new Response(null, { status: 404 });
}

const FORMLESS_ORIGINAL_REQUEST_HOST_HEADER = "x-formless-original-request-host";
const FORMLESS_ORIGINAL_REQUEST_ORIGIN_HEADER = "x-formless-original-request-origin";

function authorityRequestWithOriginalUrlFacts(
  request: Request,
  options: {
    hostSessionTarget?: ReturnType<typeof hostAuthSessionTargetForInstalledAppAuthorityRoute>;
  } = {},
): Request {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  const forwardedHost = originalRequestHost(request);

  headers.set(FORMLESS_ORIGINAL_REQUEST_HOST_HEADER, forwardedHost ?? url.host);
  headers.set(FORMLESS_ORIGINAL_REQUEST_ORIGIN_HEADER, originalRequestOrigin(request));
  setHostAuthSessionTargetHeaders(headers, options.hostSessionTarget);

  return new Request(request, { headers });
}

function originalRequestOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedHost = originalRequestHost(request);

  if (!forwardedHost) {
    return url.origin;
  }

  const forwardedProto =
    firstHeaderValue(request.headers.get("x-forwarded-proto")) ??
    forwardedHeaderValue(request.headers.get("forwarded"), "proto") ??
    url.protocol.replace(/:$/, "");

  return `${forwardedProto}://${forwardedHost}`;
}

function originalRequestHost(request: Request): string | undefined {
  return (
    firstHeaderValue(request.headers.get("x-forwarded-host")) ??
    forwardedHeaderValue(request.headers.get("forwarded"), "host")
  );
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

async function readOwnerSetupStatus(
  request: Request,
  env: Env,
): Promise<{ setupComplete: boolean }> {
  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);
  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(new URL("/api/formless/setup", request.url), {
      headers: { accept: "application/json" },
      method: "GET",
    }),
  );

  if (!response.ok) {
    return { setupComplete: false };
  }

  const body = (await response.json()) as Partial<{ setupComplete: boolean }>;

  return { setupComplete: body.setupComplete === true };
}
