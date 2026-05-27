import { Resvg, initResvg } from "@cf-wasm/resvg/workerd";

import { encodeIcoFromPngs } from "../site/ico.ts";
import { DEFAULT_SITE_ICON_SVG, resolveSiteIconSvgSource } from "../site/site-icon-source.ts";
import type { BootstrapResponse, StoredRecord } from "../shared/protocol.ts";
import type { InstalledAppStorageIdentity } from "../shared/app-storage-identity.ts";
import { runtimeTopologyRoutes } from "../shared/runtime-topology.ts";
import { getEquivalentRequestForHead, responseWithoutBodyForHead } from "./head-response.ts";
import type { Env } from "./index.ts";
import type { MappedSiteHost } from "./mapped-site-host.ts";
import {
  isDynamicSiteIconPath,
  resolveWorkerRuntimeRequestTopology,
  type WorkerRuntimeRequestTopology,
} from "./routing.ts";
import { PUBLIC_SITE_ICON_CACHE_CONTROL } from "./site-cache.ts";

type SiteIconRouteKind = "apple-touch-png" | "favicon-ico" | "favicon-svg";

type SiteIconRoute = {
  contentType: string;
  kind: SiteIconRouteKind;
};

const SITE_SCHEMA_KEY = "site";
const SITE_ICON_CACHE_HOST = "site-icon-cache.formless.internal";
const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const defaultSiteIconSvg = resolveSiteIconSvgSource(DEFAULT_SITE_ICON_SVG);
const siteIconRoutes = new Map<string, SiteIconRoute>([
  [
    runtimeTopologyRoutes.dynamicSiteIconPaths[0],
    {
      contentType: "image/svg+xml; charset=utf-8",
      kind: "favicon-svg",
    },
  ],
  [
    runtimeTopologyRoutes.dynamicSiteIconPaths[1],
    {
      contentType: "image/x-icon",
      kind: "favicon-ico",
    },
  ],
  [
    runtimeTopologyRoutes.dynamicSiteIconPaths[2],
    {
      contentType: "image/png",
      kind: "apple-touch-png",
    },
  ],
]);

export async function handleSiteIconRequest(
  request: Request,
  env: Env,
  options: { mappedSiteHost?: MappedSiteHost; runtimeTopology?: WorkerRuntimeRequestTopology } = {},
): Promise<Response | undefined> {
  const route = siteIconRouteForRequest(request, options.runtimeTopology);

  if (!route) {
    return undefined;
  }

  const response = await buildSiteIconResponse(getEquivalentRequestForHead(request), env, route, {
    target: options.mappedSiteHost?.target,
  });

  return responseWithoutBodyForHead(request, response);
}

export function isSiteIconPath(pathname: string): boolean {
  return isDynamicSiteIconPath(pathname);
}

function siteIconRouteForRequest(
  request: Request,
  runtimeTopology?: WorkerRuntimeRequestTopology,
): SiteIconRoute | undefined {
  const topology = runtimeTopology ?? resolveWorkerRuntimeRequestTopology(request);

  if (!topology.readMethod || !topology.dynamicSiteIconPath) {
    return undefined;
  }

  return siteIconRoutes.get(topology.pathname);
}

async function buildSiteIconResponse(
  request: Request,
  env: Env,
  route: SiteIconRoute,
  options: { target?: InstalledAppStorageIdentity } = {},
): Promise<Response> {
  const svg = resolveSiteIconSvgSource(
    await fetchAuthoredSiteIconSource(request, env, options.target),
  );

  return buildCachedSiteIconResponse(request, route, svg);
}

async function buildCachedSiteIconResponse(
  request: Request,
  route: SiteIconRoute,
  svg: string,
): Promise<Response> {
  const contentHash = await sha256Hex(`${route.kind}\n${svg}`);
  const headers = siteIconHeaders(route, contentHash);

  if (requestMatchesEtag(request, headers.get("ETag"))) {
    return new Response(null, {
      headers,
      status: 304,
    });
  }

  const cache = await siteIconCache();
  const cacheKey = cacheRequest(route.kind, contentHash);
  const cached = await cache?.match(cacheKey);

  if (cached) {
    return cached;
  }

  let body: BodyInit;

  try {
    body = await siteIconBody(route.kind, svg);
  } catch (error) {
    if (svg !== defaultSiteIconSvg && route.kind !== "favicon-svg") {
      return buildCachedSiteIconResponse(request, route, defaultSiteIconSvg);
    }

    throw error;
  }

  const response = new Response(body, { headers });

  await cache?.put(cacheKey, response.clone());

  return response;
}

async function siteIconBody(kind: SiteIconRouteKind, svg: string): Promise<BodyInit> {
  switch (kind) {
    case "favicon-svg":
      return svg;
    case "apple-touch-png":
      return byteBody(await renderSvgToPng(svg, 180));
    case "favicon-ico": {
      const entries = await Promise.all([
        renderSvgToPng(svg, 16).then((png) => ({ height: 16, png, width: 16 })),
        renderSvgToPng(svg, 32).then((png) => ({ height: 32, png, width: 32 })),
      ]);

      return byteBody(encodeIcoFromPngs(entries));
    }
  }
}

async function renderSvgToPng(svg: string, size: number): Promise<Uint8Array> {
  await initResvg.ensure();

  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng();

  if (!hasPngSignature(png)) {
    throw new Error("Site icon renderer did not return PNG bytes.");
  }

  return png;
}

async function fetchAuthoredSiteIconSource(
  request: Request,
  env: Env,
  target?: InstalledAppStorageIdentity,
): Promise<string | undefined> {
  const authorityId = env.FORMLESS_AUTHORITY.idFromName(target?.authorityName ?? SITE_SCHEMA_KEY);
  const authority = env.FORMLESS_AUTHORITY.get(authorityId);
  const bootstrapUrl = new URL(
    `${target?.apiRoutePrefix ?? `/api/${SITE_SCHEMA_KEY}`}/bootstrap`,
    request.url,
  );

  try {
    const response = await authority.fetch(
      new Request(bootstrapUrl, {
        headers: { Accept: "application/json" },
        method: "GET",
      }),
    );

    if (!response.ok) {
      return undefined;
    }

    const bootstrap = (await response.json()) as BootstrapResponse;
    const settings = primarySiteSettingsRecord(bootstrap.records);
    const icon = settings?.values.icon;

    return typeof icon === "string" ? icon : undefined;
  } catch {
    return undefined;
  }
}

function primarySiteSettingsRecord(records: StoredRecord[]): StoredRecord | undefined {
  return records
    .filter(
      (record) => record.entity === "site" && !record.deletedAt && record.values.key === "primary",
    )
    .sort(compareRecords)[0];
}

function siteIconHeaders(route: SiteIconRoute, contentHash: string): Headers {
  return new Headers({
    "Cache-Control": PUBLIC_SITE_ICON_CACHE_CONTROL,
    "Content-Type": route.contentType,
    ETag: `"site-icon:${route.kind}:${contentHash}"`,
  });
}

function requestMatchesEtag(request: Request, etag: string | null): boolean {
  const ifNoneMatch = request.headers.get("If-None-Match");

  return Boolean(
    etag &&
    ifNoneMatch
      ?.split(",")
      .map((value) => value.trim())
      .includes(etag),
  );
}

async function siteIconCache(): Promise<Cache | undefined> {
  if (typeof caches === "undefined") {
    return undefined;
  }

  return (caches as CacheStorage & { default?: Cache }).default ?? caches.open("site-icons");
}

function cacheRequest(kind: SiteIconRouteKind, contentHash: string): Request {
  return new Request(`https://${SITE_ICON_CACHE_HOST}/${kind}/${contentHash}`);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hasPngSignature(bytes: Uint8Array): boolean {
  return pngSignature.every((byte, index) => bytes[index] === byte);
}

function byteBody(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function compareRecords(a: StoredRecord, b: StoredRecord): number {
  return compareStrings(a.createdAt, b.createdAt) || compareStrings(a.id, b.id);
}

function compareStrings(a: string, b: string): number {
  if (a < b) {
    return -1;
  }

  if (a > b) {
    return 1;
  }

  return 0;
}
