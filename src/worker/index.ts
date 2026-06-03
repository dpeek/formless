import { FormlessAuthority } from "./authority.ts";
import { parseAuthorityApiRoute } from "../shared/app-storage-identity.ts";
import { handleInstanceArchiveApiRequest } from "./archive-api.ts";
import { authorizeInstanceWrite } from "./authority-admin-guard.ts";
import { handleClientAssetRequest } from "./client-shell.ts";
import { handleDeployMetadataRequest } from "./deploy-metadata.ts";
import {
  handleMediaRequest as handleMediaPackageRequest,
  mediaObjectStoreFromR2Bucket,
} from "@dpeek/formless-media/worker";
import { handleInstanceDomainProviderApiRequest } from "./domain-provider-api.ts";
import { handleInstanceDeploymentRuntimeApiRequest } from "./deployment-runtime-api.ts";
import { handleInstanceAppInstallsApiRequest } from "./instance-app-installs.ts";
import { handleInstanceControlPlaneApiRequest } from "./instance-control-plane.ts";
import { handleInstanceDomainMappingsApiRequest } from "./instance-domain-mappings.ts";
import { resolveInstanceRuntimeRouteForRequest } from "./instance-runtime-routes.ts";
import { mappedAppHostFromRuntimeRoute } from "./mapped-app-host.ts";
import { mappedSiteHostFromRuntimeRoute } from "./mapped-site-host.ts";
import { handleOwnerSetupApiRequest } from "./owner-setup.ts";
import { handleOwnerPasskeyApiRequest } from "./owner-passkeys.ts";
import { handlePublishedSiteIndexingRequest } from "./public-indexing.ts";
import {
  areSchemaKeyApiRoutesEnabledForRequest,
  mappedSiteHostRedirectForRequest,
  publishedSiteRedirectForRequest,
  resolveWorkerRuntimeRequestTopology,
  shouldDeferToStaticAssets,
  workerRuntimeProfileInput,
} from "./routing.ts";
import { handleSiteIconRequest } from "./site-icons.ts";
import { handlePublishedSiteDocumentRequest } from "./site-ssr.tsx";
import { handleInstanceUpgradeStatusApiRequest } from "./upgrade-status-api.ts";
import { handleWorkerWorkspaceGatewayProxyRequest } from "./workspace-gateway-proxy.ts";
import type { TurnstileRuntimeEnv } from "../shared/turnstile-config.ts";

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
  FORMLESS_DOMAIN_PROVIDER_ZONE_ID?: string;
  FORMLESS_DOMAIN_PROVIDER_ZONE_NAME?: string;
  FORMLESS_DOMAIN_PROVIDER_ZONES?: string;
  FORMLESS_INSTANCE_AUTH_ORIGIN?: string;
  FORMLESS_INSTANCE_AUTH_RELYING_PARTY_ID?: string;
  FORMLESS_INSTANCE_AUTH_RELYING_PARTY_NAME?: string;
  FORMLESS_LAUNCH_FIXTURE?: string;
  FORMLESS_MEDIA: R2Bucket;
  FORMLESS_OWNER_SESSION_SECRET?: string;
  FORMLESS_RUNTIME_PROFILE?: string;
  FORMLESS_TURNSTILE_SITEVERIFY?: Fetcher;
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

    const mappedAppHost = mappedAppHostFromRuntimeRoute(runtimeRoute);
    const mappedSiteHost = mappedSiteHostFromRuntimeRoute(runtimeRoute);
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
    const workspaceGatewayResponse = await handleWorkerWorkspaceGatewayProxyRequest(request, env, {
      mappedHost: runtimeRoute?.kind === "mount" && runtimeRoute.matchHost !== undefined,
      runtimeTopology: requestTopology,
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

    const siteIconResponse = await handleSiteIconRequest(request, env, {
      mappedSiteHost,
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

    const publishedSiteIndexingResponse = await handlePublishedSiteIndexingRequest(request, env, {
      mappedSiteHost,
      runtimeTopology: requestTopology,
    });

    if (publishedSiteIndexingResponse) {
      return publishedSiteIndexingResponse;
    }

    const deployMetadataResponse = handleDeployMetadataRequest(request, env);

    if (deployMetadataResponse) {
      return deployMetadataResponse;
    }

    if (isMappedAuthBlockedProfileHost && isOwnerAuthRoute(requestTopology.pathname)) {
      return notFoundResponse(requestTopology.apiPath);
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

    const instanceDomainMappingsResponse = await handleInstanceDomainMappingsApiRequest(
      request,
      env,
    );

    if (instanceDomainMappingsResponse) {
      return instanceDomainMappingsResponse;
    }

    const url = new URL(request.url);
    const authorityRoute = parseAuthorityApiRoute(url.pathname);

    if (authorityRoute) {
      if (
        authorityRoute.identity.kind === "schemaKey" &&
        (isMappedAuthBlockedProfileHost ||
          !areSchemaKeyApiRoutesEnabledForRequest(request, requestTopology))
      ) {
        return Response.json({ error: "Not found." }, { status: 404 });
      }

      const authorityId = env.FORMLESS_AUTHORITY.idFromName(authorityRoute.identity.authorityName);
      const authority = env.FORMLESS_AUTHORITY.get(authorityId);

      return authority.fetch(request);
    }

    const siteDocumentResponse = await handlePublishedSiteDocumentRequest(request, env, {
      mappedSiteHost,
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
    pathname === "/api/formless/setup" ||
    pathname.startsWith("/api/formless/setup/") ||
    pathname === "/api/formless/session" ||
    pathname.startsWith("/api/formless/session/") ||
    pathname === "/api/formless/passkeys" ||
    pathname.startsWith("/api/formless/passkeys/")
  );
}

function notFoundResponse(json: boolean): Response {
  return json
    ? Response.json({ error: "Not found." }, { status: 404 })
    : new Response(null, { status: 404 });
}
