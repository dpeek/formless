import { FormlessAuthority } from "./authority.ts";
import { parseAuthorityApiRoute } from "../shared/app-storage-identity.ts";
import { handleInstanceArchiveApiRequest } from "./archive-api.ts";
import { handleDeployMetadataRequest } from "./deploy-metadata.ts";
import { handleInstanceAppInstallsApiRequest } from "./instance-app-installs.ts";
import { handleMediaRequest } from "./media.ts";
import { handleOwnerSetupApiRequest } from "./owner-setup.ts";
import { handlePublishedSiteIndexingRequest } from "./public-indexing.ts";
import {
  areSchemaKeyApiRoutesEnabledForRequest,
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
  FORMLESS_LAUNCH_FIXTURE?: string;
  FORMLESS_MEDIA: R2Bucket;
  FORMLESS_OWNER_SESSION_SECRET?: string;
  FORMLESS_RUNTIME_PROFILE?: string;
};

export default {
  async fetch(request, env) {
    const runtimeProfile = workerRuntimeProfileInput(env.FORMLESS_RUNTIME_PROFILE);
    const mediaResponse = await handleMediaRequest(request, env, runtimeProfile);

    if (mediaResponse) {
      return mediaResponse;
    }

    const siteIconResponse = await handleSiteIconRequest(request, env);

    if (siteIconResponse) {
      return siteIconResponse;
    }

    const publishedSiteRedirect = publishedSiteRedirectForRequest(request, runtimeProfile);

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

    const archiveResponse = await handleInstanceArchiveApiRequest(request, env);

    if (archiveResponse) {
      return archiveResponse;
    }

    const instanceAppInstallsResponse = await handleInstanceAppInstallsApiRequest(request, env);

    if (instanceAppInstallsResponse) {
      return instanceAppInstallsResponse;
    }

    const url = new URL(request.url);
    const authorityRoute = parseAuthorityApiRoute(url.pathname);

    if (authorityRoute) {
      if (
        authorityRoute.identity.kind === "schemaKey" &&
        !areSchemaKeyApiRoutesEnabledForRequest(request, runtimeProfile)
      ) {
        return Response.json({ error: "Not found." }, { status: 404 });
      }

      const authorityId = env.FORMLESS_AUTHORITY.idFromName(authorityRoute.identity.authorityName);
      const authority = env.FORMLESS_AUTHORITY.get(authorityId);

      return authority.fetch(request);
    }

    const siteDocumentResponse = await handlePublishedSiteDocumentRequest(request, env);

    if (siteDocumentResponse) {
      return siteDocumentResponse;
    }

    if (env.ASSETS && shouldDeferToStaticAssets(request, runtimeProfile)) {
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
