import {
  buildPublicSitemapXml,
  buildPublicSiteRouteEntries,
  renderPublicRobotsTxt,
} from "../site/public-indexing.ts";
import type { BootstrapResponse } from "../shared/protocol.ts";
import type { InstalledAppStorageIdentity } from "../shared/app-storage-identity.ts";
import { getEquivalentRequestForHead, responseWithoutBodyForHead } from "./head-response.ts";
import type { Env } from "./index.ts";
import type { MappedSiteHost } from "./mapped-site-host.ts";
import {
  shouldHandleMappedSiteHostIndexingResource,
  shouldHandlePublishedSiteIndexingResource,
  workerRuntimeProfileInput,
} from "./routing.ts";
import {
  PUBLIC_SITE_INDEXING_CACHE_CONTROL,
  PUBLIC_SITE_INDEXING_ERROR_CACHE_CONTROL,
} from "./site-cache.ts";

const SITE_SCHEMA_KEY = "site";

export async function handlePublishedSiteIndexingRequest(
  request: Request,
  env: Env,
  options: { mappedSiteHost?: MappedSiteHost } = {},
): Promise<Response | undefined> {
  if (options.mappedSiteHost) {
    if (!shouldHandleMappedSiteHostIndexingResource(request)) {
      return undefined;
    }
  } else {
    if (
      !shouldHandlePublishedSiteIndexingResource(
        request,
        workerRuntimeProfileInput(env.FORMLESS_RUNTIME_PROFILE),
      )
    ) {
      return undefined;
    }
  }

  const getRequest = getEquivalentRequestForHead(request);
  const url = new URL(getRequest.url);
  const response = await renderPublishedSiteIndexingResponse(getRequest, env, url, {
    target: options.mappedSiteHost?.target,
  });

  return responseWithoutBodyForHead(request, response);
}

async function renderPublishedSiteIndexingResponse(
  request: Request,
  env: Env,
  url: URL,
  options: { target?: InstalledAppStorageIdentity } = {},
): Promise<Response> {
  if (url.pathname === "/robots.txt") {
    return textResponse(renderPublicRobotsTxt(url.origin), "text/plain; charset=utf-8");
  }

  try {
    const bootstrap = await fetchSiteBootstrap(request, env, options.target);

    if (!bootstrap.ok) {
      return textResponse("Sitemap unavailable.\n", "text/plain; charset=utf-8", 500, {
        "Cache-Control": PUBLIC_SITE_INDEXING_ERROR_CACHE_CONTROL,
      });
    }

    const body = (await bootstrap.json()) as BootstrapResponse;
    const routes = buildPublicSiteRouteEntries(body.records);

    return textResponse(
      buildPublicSitemapXml(routes, url.origin),
      "application/xml; charset=utf-8",
    );
  } catch {
    return textResponse("Sitemap unavailable.\n", "text/plain; charset=utf-8", 500, {
      "Cache-Control": PUBLIC_SITE_INDEXING_ERROR_CACHE_CONTROL,
    });
  }
}

async function fetchSiteBootstrap(
  request: Request,
  env: Env,
  target?: InstalledAppStorageIdentity,
): Promise<Response> {
  const authorityId = env.FORMLESS_AUTHORITY.idFromName(target?.authorityName ?? SITE_SCHEMA_KEY);
  const authority = env.FORMLESS_AUTHORITY.get(authorityId);
  const bootstrapUrl = new URL(
    `${target?.apiRoutePrefix ?? `/api/${SITE_SCHEMA_KEY}`}/bootstrap`,
    request.url,
  );

  return authority.fetch(
    new Request(bootstrapUrl, {
      headers: { Accept: "application/json" },
      method: "GET",
    }),
  );
}

function textResponse(
  body: string,
  contentType: string,
  status = 200,
  headers: HeadersInit = {},
): Response {
  const responseHeaders = new Headers(headers);

  if (!responseHeaders.has("Cache-Control")) {
    responseHeaders.set("Cache-Control", PUBLIC_SITE_INDEXING_CACHE_CONTROL);
  }

  responseHeaders.set("Content-Type", contentType);

  return new Response(body, {
    headers: responseHeaders,
    status,
  });
}
