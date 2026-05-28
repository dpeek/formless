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
import {
  handleInstanceAppInstallsApiRequest,
  lookupInstanceAppInstallForRequest,
} from "./instance-app-installs.ts";
import {
  handleInstanceDomainMappingsApiRequest,
  lookupEnabledInstanceRoutableDomainMappingForRequestHost,
} from "./instance-domain-mappings.ts";
import { mappedAppHostFromDomainMapping } from "./mapped-app-host.ts";
import { mappedSiteHostFromDomainMapping } from "./mapped-site-host.ts";
import { handleOwnerSetupApiRequest } from "./owner-setup.ts";
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

export { FormlessAuthority } from "./authority.ts";

export type Env = {
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
  FORMLESS_LAUNCH_FIXTURE?: string;
  FORMLESS_MEDIA: R2Bucket;
  FORMLESS_OWNER_SESSION_SECRET?: string;
  FORMLESS_RUNTIME_PROFILE?: string;
};

export default {
  async fetch(request, env) {
    const domainMapping = await lookupEnabledInstanceRoutableDomainMappingForRequestHost(
      request,
      env,
    );
    const mappedAppInstall =
      domainMapping?.profile === "app" && domainMapping.targetInstallId
        ? await lookupInstanceAppInstallForRequest(request, env, domainMapping.targetInstallId)
        : undefined;
    const mappedAppHost = mappedAppHostFromDomainMapping(
      domainMapping,
      mappedAppInstall ? [mappedAppInstall] : [],
    );
    const isMappedAppProfileHost = domainMapping?.profile === "app";
    const effectiveRuntimeProfile = workerRuntimeProfileInput(
      domainMapping?.profile === "instance"
        ? "instance"
        : isMappedAppProfileHost
          ? "app"
          : env.FORMLESS_RUNTIME_PROFILE,
    );
    const requestTopology = resolveWorkerRuntimeRequestTopology(request, effectiveRuntimeProfile);
    const mediaResponse = await handleMediaPackageRequest(request, {
      authorizeWrite: (writeRequest) => authorizeInstanceWrite(writeRequest, env),
      pathname: requestTopology.pathname,
      provider: "r2",
      store: mediaObjectStoreFromR2Bucket(env.FORMLESS_MEDIA),
    });

    if (mediaResponse) {
      return mediaResponse;
    }

    const mappedSiteHost = mappedSiteHostFromDomainMapping(domainMapping);

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

    const ownerSetupResponse = await handleOwnerSetupApiRequest(request, env);

    if (ownerSetupResponse) {
      return ownerSetupResponse;
    }

    const archiveResponse = await handleInstanceArchiveApiRequest(request, env);

    if (archiveResponse) {
      return archiveResponse;
    }

    const instanceAppInstallsResponse = await handleInstanceAppInstallsApiRequest(request, env);

    if (instanceAppInstallsResponse) {
      return instanceAppInstallsResponse;
    }

    const instanceDomainProviderResponse = await handleInstanceDomainProviderApiRequest(
      request,
      env,
    );

    if (instanceDomainProviderResponse) {
      return instanceDomainProviderResponse;
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
        (isMappedAppProfileHost ||
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
