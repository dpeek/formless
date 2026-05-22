import { FormlessAuthority } from "./authority.ts";
import { parseAuthorityApiRoute } from "../shared/app-storage-identity.ts";
import { handleDeployMetadataRequest } from "./deploy-metadata.ts";
import { handleInstanceAppInstallsApiRequest } from "./instance-app-installs.ts";
import { handleSiteMediaRequest } from "./media.ts";
import { handleOwnerSetupApiRequest } from "./owner-setup.ts";
import { handlePublishedSiteIndexingRequest } from "./public-indexing.ts";
import {
  publishedSiteRedirectForRequest,
  shouldDeferToStaticAssets,
  workerRuntimeProfileInput,
} from "./routing.ts";
import { handleSiteIconRequest } from "./site-icons.ts";
import { handlePublishedSiteDocumentRequest } from "./site-ssr.tsx";

export { FormlessAuthority } from "./authority.ts";

export type Env = {
  ASSETS?: Fetcher;
  FORMLESS_ADMIN_TOKEN?: string;
  FORMLESS_AUTHORITY: DurableObjectNamespace<FormlessAuthority>;
  FORMLESS_DEPLOY_VERSION?: string;
  FORMLESS_MEDIA: R2Bucket;
  FORMLESS_OWNER_SESSION_SECRET?: string;
  FORMLESS_RUNTIME_PROFILE?: string;
};

export default {
  async fetch(request, env) {
    const mediaResponse = await handleSiteMediaRequest(request, env);

    if (mediaResponse) {
      return mediaResponse;
    }

    const siteIconResponse = await handleSiteIconRequest(request, env);

    if (siteIconResponse) {
      return siteIconResponse;
    }

    const publishedSiteRedirect = publishedSiteRedirectForRequest(
      request,
      workerRuntimeProfileInput(env.FORMLESS_RUNTIME_PROFILE),
    );

    if (publishedSiteRedirect) {
      return redirectResponse(publishedSiteRedirect.location, publishedSiteRedirect.status);
    }

    const publishedSiteIndexingResponse = await handlePublishedSiteIndexingRequest(request, env);

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

    const instanceAppInstallsResponse = await handleInstanceAppInstallsApiRequest(request, env);

    if (instanceAppInstallsResponse) {
      return instanceAppInstallsResponse;
    }

    const url = new URL(request.url);
    const authorityRoute = parseAuthorityApiRoute(url.pathname);

    if (authorityRoute) {
      const authorityId = env.FORMLESS_AUTHORITY.idFromName(authorityRoute.identity.authorityName);
      const authority = env.FORMLESS_AUTHORITY.get(authorityId);

      return authority.fetch(request);
    }

    const siteDocumentResponse = await handlePublishedSiteDocumentRequest(request, env);

    if (siteDocumentResponse) {
      return siteDocumentResponse;
    }

    if (
      env.ASSETS &&
      shouldDeferToStaticAssets(request, workerRuntimeProfileInput(env.FORMLESS_RUNTIME_PROFILE))
    ) {
      return env.ASSETS.fetch(request);
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
