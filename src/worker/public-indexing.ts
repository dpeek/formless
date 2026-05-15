import {
  buildPublicSitemapXml,
  buildPublicSiteRouteEntries,
  renderPublicRobotsTxt,
} from "../site/public-indexing.ts";
import type { BootstrapResponse } from "../shared/protocol.ts";
import { getEquivalentRequestForHead, responseWithoutBodyForHead } from "./head-response.ts";
import type { Env } from "./index.ts";
import { shouldHandlePublishedSiteIndexingResource, workerRuntimeProfileInput } from "./routing.ts";
import {
  PUBLIC_SITE_INDEXING_CACHE_CONTROL,
  PUBLIC_SITE_INDEXING_ERROR_CACHE_CONTROL,
} from "./site-cache.ts";

const SITE_SCHEMA_KEY = "site";

export async function handlePublishedSiteIndexingRequest(
  request: Request,
  env: Env,
): Promise<Response | undefined> {
  if (
    !shouldHandlePublishedSiteIndexingResource(
      request,
      workerRuntimeProfileInput(env.FORMLESS_RUNTIME_PROFILE),
    )
  ) {
    return undefined;
  }

  const getRequest = getEquivalentRequestForHead(request);
  const url = new URL(getRequest.url);
  const response = await renderPublishedSiteIndexingResponse(getRequest, env, url);

  return responseWithoutBodyForHead(request, response);
}

async function renderPublishedSiteIndexingResponse(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  if (url.pathname === "/robots.txt") {
    return textResponse(renderPublicRobotsTxt(url.origin), "text/plain; charset=utf-8");
  }

  try {
    const bootstrap = await fetchSiteBootstrap(request, env);

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

async function fetchSiteBootstrap(request: Request, env: Env): Promise<Response> {
  const authorityId = env.FORMLESS_AUTHORITY.idFromName(SITE_SCHEMA_KEY);
  const authority = env.FORMLESS_AUTHORITY.get(authorityId);
  const bootstrapUrl = new URL(`/api/${SITE_SCHEMA_KEY}/bootstrap`, request.url);

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
