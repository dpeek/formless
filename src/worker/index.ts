import { FormlessAuthority } from "./authority.ts";
import { findSchemaAppDefinition } from "../shared/schema-apps.ts";
import { handleSiteMediaRequest } from "./media.ts";
import {
  publishedSiteRedirectForRequest,
  shouldDeferToStaticAssets,
  workerRuntimeProfileInput,
} from "./routing.ts";
import { handlePublishedSiteDocumentRequest } from "./site-ssr.tsx";

export { FormlessAuthority } from "./authority.ts";

export type Env = {
  ASSETS?: Fetcher;
  FORMLESS_ADMIN_TOKEN?: string;
  FORMLESS_AUTHORITY: DurableObjectNamespace<FormlessAuthority>;
  FORMLESS_MEDIA: R2Bucket;
  FORMLESS_RUNTIME_PROFILE?: string;
};

export default {
  async fetch(request, env) {
    const mediaResponse = await handleSiteMediaRequest(request, env);

    if (mediaResponse) {
      return mediaResponse;
    }

    const publishedSiteRedirect = publishedSiteRedirectForRequest(
      request,
      workerRuntimeProfileInput(env.FORMLESS_RUNTIME_PROFILE),
    );

    if (publishedSiteRedirect) {
      return redirectResponse(publishedSiteRedirect.location, publishedSiteRedirect.status);
    }

    const url = new URL(request.url);
    const app = parseApiSchemaApp(url.pathname);

    if (app) {
      const authorityId = env.FORMLESS_AUTHORITY.idFromName(app.key);
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

function parseApiSchemaApp(pathname: string) {
  const [apiSegment, schemaKey, routeSegment] = pathname.split("/").filter(Boolean);

  if (apiSegment !== "api" || !schemaKey || !routeSegment) {
    return undefined;
  }

  return findSchemaAppDefinition(schemaKey);
}
