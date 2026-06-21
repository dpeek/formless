import type { AppSchema } from "@dpeek/formless-schema";

import {
  installedAppStorageIdentity,
  type AppStorageIdentity,
  type InstalledAppStorageIdentity,
} from "../shared/app-storage-identity.ts";
import { findResolvedAppPackage, type AppPackageResolver } from "../shared/app-packages.ts";
import {
  FORMLESS_RUNTIME_APP_INSTALL_ID_META_NAME,
  FORMLESS_RUNTIME_PACKAGE_APP_KEY_META_NAME,
  FORMLESS_RUNTIME_PROFILE_META_NAME,
  runtimeTopologyRoutes,
} from "../shared/runtime-topology.ts";
import {
  siteIconRouteForPathname,
  sitePublicWorkerAdapter,
  type PublicSiteDocumentClientAssets,
  type PublicSiteDocumentRuntimeHint,
  type PublicSiteDocumentTreeResult,
  type PublicSiteIndexingResource,
  type SiteIconRoute,
} from "@dpeek/formless-site-app/worker";
import { normalizeSiteRoutePath, type SitePageTree } from "@dpeek/formless-site-app";
import { BadRequestError } from "./errors.ts";
import type { Env } from "./index.ts";
import type { InstanceRuntimeRouteResolution } from "./instance-runtime-routes.ts";
import { getEquivalentRequestForHead, responseWithoutBodyForHead } from "./head-response.ts";
import type { StoredRecord } from "@dpeek/formless-storage";
import type { BootstrapResponse } from "../shared/protocol.ts";
import { schemaApps } from "../shared/schema-apps.ts";
import {
  shouldBlockMappedSiteHostBrowserRoute,
  shouldHandleMappedSiteHostDocument,
  shouldHandleMappedSiteHostIndexingResource,
  shouldHandlePublishedSiteDocument,
  shouldHandlePublishedSiteIndexingResource,
  resolveWorkerRuntimeRequestTopology,
  type WorkerRuntimeProfileInput,
  type WorkerRuntimeRequestTopology,
  workerRuntimeProfileInput,
} from "./routing.ts";

export type PublicSiteWorkerTreeInput = {
  records: StoredRecord[];
  schema: AppSchema;
  slug: string;
  target?: { apiRoutePrefix: `/${string}` };
  turnstileSiteKey?: string;
};

export type PublicSiteWorkerRequestOptions = {
  mappedSiteHost?: MappedSiteHost;
  publishedSiteTarget?: InstalledAppStorageIdentity;
  runtimeProfile?: WorkerRuntimeProfileInput;
  runtimeTopology?: WorkerRuntimeRequestTopology;
};

export type MappedSiteHost = {
  host: string;
  installId: string;
  target: InstalledAppStorageIdentity;
};

export type PublicSiteWorkerAdapter = {
  buildPublicTree(input: PublicSiteWorkerTreeInput): { tree: SitePageTree | null };
  renderDocument(input: {
    clientAssets: PublicSiteDocumentClientAssets;
    requestUrl: URL;
    runtimeHints?: readonly PublicSiteDocumentRuntimeHint[];
    slug: string;
    treeResult: PublicSiteDocumentTreeResult;
  }): Promise<Response>;
  renderIcon(input: { request: Request; route: SiteIconRoute; svg?: string }): Promise<Response>;
  renderIndexing(
    input:
      | {
          origin: string;
          resource: "robots";
        }
      | {
          clientRoutePrefixes: readonly `/${string}`[];
          origin: string;
          records?: StoredRecord[];
          resource: "sitemap";
        },
  ): Response;
};

const siteSchemaKey = "site";
const clientModulePath = "/src/main.tsx";
const viteReactRefreshPreamble = `<script type="module">
import RefreshRuntime from "/@react-refresh";
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;
</script>`;
const developmentClientAssets: PublicSiteDocumentClientAssets = {
  body: `${viteReactRefreshPreamble}
    <script type="module" src="${clientModulePath}"></script>`,
  head: "",
};
const emptyClientAssets: PublicSiteDocumentClientAssets = { body: "", head: "" };

const publicSiteWorkerAdapters = new Map<string, PublicSiteWorkerAdapter>([
  [runtimeTopologyRoutes.publicSitePackageAppKey, sitePublicWorkerAdapter],
]);

export function publicSiteWorkerAdapterForPackageAppKey(
  packageAppKey: string,
  resolver?: AppPackageResolver,
): PublicSiteWorkerAdapter {
  const appPackage = findResolvedAppPackage(packageAppKey, resolver);

  if (!appPackage) {
    throw new UnsupportedPackageCapabilityError(
      `Package app "${packageAppKey}" is not resolved for public Site runtime support.`,
    );
  }

  if (!appPackage.publicRouteBase) {
    throw new UnsupportedPackageCapabilityError(
      `Package app "${packageAppKey}" does not declare public Site runtime support.`,
    );
  }

  const adapter = publicSiteWorkerAdapters.get(appPackage.packageAppKey);

  if (!adapter) {
    throw new UnsupportedPackageCapabilityError(
      `Package app "${packageAppKey}" declares public Site runtime support, but no public Site Worker adapter is registered.`,
    );
  }

  return adapter;
}

export async function handlePublicSiteIconRequest(
  request: Request,
  env: Env,
  options: PublicSiteWorkerRequestOptions & { packageResolver?: AppPackageResolver } = {},
): Promise<Response | undefined> {
  if (!publicSiteIconRequest(options.runtimeTopology)) {
    return undefined;
  }

  const requestTarget = publicSiteRequestTarget(env, options);

  if (requestTarget instanceof Response) {
    return requestTarget;
  }

  const adapter = publicSiteWorkerAdapterForRequestResponse(requestTarget, options);

  if (adapter instanceof Response) {
    return adapter;
  }

  const getRequest = getEquivalentRequestForHead(request);
  const route = siteIconRouteForPathname(
    options.runtimeTopology?.pathname ?? new URL(request.url).pathname,
  );

  if (!route) {
    return undefined;
  }

  const response = await adapter.renderIcon({
    request: getRequest,
    route,
    svg: await fetchAuthoredSiteIconSource(getRequest, env, requestTarget.target),
  });

  return responseWithoutBodyForHead(request, response);
}

export async function handlePublicSiteIndexingRequest(
  request: Request,
  env: Env,
  options: PublicSiteWorkerRequestOptions & { packageResolver?: AppPackageResolver } = {},
): Promise<Response | undefined> {
  if (!publicSiteIndexingRequest(request, env, options)) {
    return undefined;
  }

  const requestTarget = publicSiteRequestTarget(env, options);

  if (requestTarget instanceof Response) {
    return requestTarget;
  }

  const adapter = publicSiteWorkerAdapterForRequestResponse(requestTarget, options);

  if (adapter instanceof Response) {
    return adapter;
  }

  const getRequest = getEquivalentRequestForHead(request);
  const url = new URL(getRequest.url);
  const resource = publicSiteIndexingResourceForPathname(
    options.runtimeTopology?.pathname ?? url.pathname,
  );

  if (!resource) {
    return undefined;
  }

  const response = adapter.renderIndexing(
    resource === "robots"
      ? {
          origin: url.origin,
          resource,
        }
      : {
          clientRoutePrefixes: [
            runtimeTopologyRoutes.publicSitePreviewRouteBase,
            "/schema",
            ...schemaApps.map((app) => app.route),
          ],
          origin: url.origin,
          records: await fetchSiteBootstrapRecords(getRequest, env, requestTarget.target),
          resource,
        },
  );

  return responseWithoutBodyForHead(request, response);
}

export async function handlePublicSiteDocumentRequest(
  request: Request,
  env: Env,
  options: PublicSiteWorkerRequestOptions & { packageResolver?: AppPackageResolver } = {},
): Promise<Response | undefined> {
  if (options.mappedSiteHost) {
    if (shouldBlockMappedSiteHostBrowserRoute(request, options.runtimeTopology)) {
      return new Response(null, { status: 404 });
    }

    if (!shouldHandleMappedSiteHostDocument(request, options.runtimeTopology)) {
      return undefined;
    }
  } else if (
    !shouldHandlePublishedSiteDocument(
      request,
      options.runtimeTopology ??
        options.runtimeProfile ??
        workerRuntimeProfileInput(env.FORMLESS_RUNTIME_PROFILE),
    )
  ) {
    return undefined;
  }

  const requestTarget = publicSiteRequestTarget(env, options);

  if (requestTarget instanceof Response) {
    return requestTarget;
  }

  const adapter = publicSiteWorkerAdapterForRequestResponse(requestTarget, options);

  if (adapter instanceof Response) {
    return adapter;
  }

  const getRequest = getEquivalentRequestForHead(request);
  const requestUrl = new URL(getRequest.url);
  const slug = normalizeSiteRoutePath(requestUrl.pathname);
  const response = await adapter.renderDocument({
    clientAssets: await loadClientDocumentAssets(getRequest, env),
    requestUrl,
    runtimeHints: publicSiteRuntimeHints(requestTarget.target),
    slug,
    treeResult: await fetchSitePageTreeResult(getRequest, env, slug, requestTarget.target),
  });

  return responseWithoutBodyForHead(request, response);
}

export function mappedPublicSiteHostFromRuntimeRoute(
  route: InstanceRuntimeRouteResolution | undefined,
): MappedSiteHost | undefined {
  if (
    !route ||
    route.kind !== "mount" ||
    route.targetProfile !== "public-site" ||
    route.surface !== "public-site" ||
    !route.matchHost ||
    !route.target
  ) {
    return undefined;
  }

  return {
    host: route.matchHost,
    installId: route.target.installId,
    target: route.target,
  };
}

export class UnsupportedPackageCapabilityError extends BadRequestError {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedPackageCapabilityError";
  }
}

type PublicSiteRequestTarget =
  | {
      source: "installed";
      target: InstalledAppStorageIdentity;
    }
  | {
      packageAppKey: string;
      source: "source";
      target?: undefined;
    };

function publicSiteRequestTarget(
  env: Env,
  options: PublicSiteWorkerRequestOptions & { packageResolver?: AppPackageResolver },
): PublicSiteRequestTarget | Response {
  try {
    const target =
      options.mappedSiteHost?.target ??
      options.publishedSiteTarget ??
      publishedSiteTargetFromRuntimeEnv(env, options.packageResolver);

    if (target) {
      return { source: "installed", target };
    }

    if (publicSiteRequestRequiresInstalledTarget(env, options)) {
      throw new UnsupportedPackageCapabilityError(
        "Published Site runtime target is not configured.",
      );
    }

    return { packageAppKey: runtimeTopologyRoutes.publicSitePackageAppKey, source: "source" };
  } catch (error) {
    if (error instanceof UnsupportedPackageCapabilityError) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    throw error;
  }
}

function publicSiteWorkerAdapterForRequest(
  target: PublicSiteRequestTarget,
  options: PublicSiteWorkerRequestOptions & { packageResolver?: AppPackageResolver },
): PublicSiteWorkerAdapter {
  const packageAppKey =
    target.source === "installed" ? target.target.packageAppKey : target.packageAppKey;

  return publicSiteWorkerAdapterForPackageAppKey(packageAppKey, options.packageResolver);
}

function publicSiteWorkerAdapterForRequestResponse(
  target: PublicSiteRequestTarget,
  options: PublicSiteWorkerRequestOptions & { packageResolver?: AppPackageResolver },
): PublicSiteWorkerAdapter | Response {
  try {
    return publicSiteWorkerAdapterForRequest(target, options);
  } catch (error) {
    if (error instanceof UnsupportedPackageCapabilityError) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    throw error;
  }
}

function publishedSiteTargetFromRuntimeEnv(
  env: Env,
  resolver?: AppPackageResolver,
): InstalledAppStorageIdentity | undefined {
  const installId = stringConfigValue(env.FORMLESS_RUNTIME_APP_INSTALL_ID);
  const packageAppKey = stringConfigValue(env.FORMLESS_RUNTIME_PACKAGE_APP_KEY);

  if (!installId && !packageAppKey) {
    return undefined;
  }

  if (!installId || !packageAppKey) {
    throw new UnsupportedPackageCapabilityError(
      "Published Site runtime target requires both FORMLESS_RUNTIME_APP_INSTALL_ID and FORMLESS_RUNTIME_PACKAGE_APP_KEY.",
    );
  }

  const target = installedAppStorageIdentity({ installId, packageAppKey }, resolver);

  if (!target) {
    throw new UnsupportedPackageCapabilityError(
      `Published Site runtime target "${packageAppKey}/${installId}" is not resolved.`,
    );
  }

  return target;
}

function publicSiteRequestRequiresInstalledTarget(
  env: Env,
  options: PublicSiteWorkerRequestOptions,
): boolean {
  const topology =
    options.runtimeTopology ??
    options.runtimeProfile ??
    workerRuntimeProfileInput(env.FORMLESS_RUNTIME_PROFILE);

  return (
    resolveWorkerRuntimeRequestTopology(new Request("https://formless.local/"), topology)
      .profileKind === "publishedSite"
  );
}

function stringConfigValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function publicSiteIconRequest(runtimeTopology?: WorkerRuntimeRequestTopology): boolean {
  return Boolean(runtimeTopology?.readMethod && runtimeTopology.dynamicSiteIconPath);
}

function publicSiteIndexingRequest(
  request: Request,
  env: Env,
  options: PublicSiteWorkerRequestOptions,
): boolean {
  if (options.mappedSiteHost) {
    return shouldHandleMappedSiteHostIndexingResource(request, options.runtimeTopology);
  }

  return shouldHandlePublishedSiteIndexingResource(
    request,
    options.runtimeTopology ??
      options.runtimeProfile ??
      workerRuntimeProfileInput(env.FORMLESS_RUNTIME_PROFILE),
  );
}

async function fetchSitePageTreeResult(
  request: Request,
  env: Env,
  slug: string,
  target?: AppStorageIdentity,
): Promise<PublicSiteDocumentTreeResult> {
  try {
    const response = await fetchAuthorityJson(
      request,
      env,
      target,
      `/tree/${encodeURIComponent(slug)}`,
    );

    if (response.status === 404) {
      return { kind: "not-found" };
    }

    if (!response.ok) {
      return { kind: "error" };
    }

    return { kind: "found", tree: (await response.json()) as SitePageTree };
  } catch {
    return { kind: "error" };
  }
}

async function fetchSiteBootstrapRecords(
  request: Request,
  env: Env,
  target?: AppStorageIdentity,
): Promise<StoredRecord[] | undefined> {
  try {
    const response = await fetchAuthorityJson(request, env, target, "/bootstrap");

    if (!response.ok) {
      return undefined;
    }

    return ((await response.json()) as BootstrapResponse).records;
  } catch {
    return undefined;
  }
}

async function fetchAuthorityJson(
  request: Request,
  env: Env,
  target: AppStorageIdentity | undefined,
  path: `/${string}`,
): Promise<Response> {
  const authorityId = env.FORMLESS_AUTHORITY.idFromName(target?.authorityName ?? siteSchemaKey);
  const authority = env.FORMLESS_AUTHORITY.get(authorityId);
  const url = new URL(`${target?.apiRoutePrefix ?? `/api/${siteSchemaKey}`}${path}`, request.url);

  return authority.fetch(
    new Request(url, {
      headers: { Accept: "application/json" },
      method: "GET",
    }),
  );
}

async function fetchAuthoredSiteIconSource(
  request: Request,
  env: Env,
  target?: AppStorageIdentity,
): Promise<string | undefined> {
  const records = await fetchSiteBootstrapRecords(request, env, target);
  const settings = records ? primarySiteSettingsRecord(records) : undefined;
  const icon = settings?.values.icon;

  return typeof icon === "string" ? icon : undefined;
}

function primarySiteSettingsRecord(records: StoredRecord[]): StoredRecord | undefined {
  return records
    .filter(
      (record) => record.entity === "site" && !record.deletedAt && record.values.key === "primary",
    )
    .sort(compareRecords)[0];
}

async function loadClientDocumentAssets(
  request: Request,
  env: Env,
): Promise<PublicSiteDocumentClientAssets> {
  if (!env.ASSETS) {
    return developmentClientAssets;
  }

  let shellHtml = "";

  try {
    const shellUrl = new URL(runtimeTopologyRoutes.clientShellAssetPath, request.url);
    const shellResponse = await env.ASSETS.fetch(
      new Request(shellUrl, {
        headers: { Accept: "text/html" },
        method: "GET",
      }),
    );

    if (!shellResponse.ok) {
      return emptyClientAssets;
    }

    shellHtml = await shellResponse.text();
  } catch {
    return emptyClientAssets;
  }

  const assetTags = extractClientAssetTags(shellHtml);

  if (assetTags.length > 0) {
    return { body: "", head: assetTags.join("\n    ") };
  }

  if (shellHtml.includes(clientModulePath) || shellHtml.includes("/@react-refresh")) {
    return developmentClientAssets;
  }

  return emptyClientAssets;
}

function extractClientAssetTags(html: string): string[] {
  const headContent = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "";
  const assetTagPattern =
    /<script\b[^>]*\bsrc="\/assets\/[^"]+"[^>]*><\/script>|<link\b[^>]*\bhref="\/assets\/[^"]+"[^>]*>/g;

  return [...headContent.matchAll(assetTagPattern)].map((match) => match[0].trim());
}

function publicSiteRuntimeHints(target?: AppStorageIdentity): PublicSiteDocumentRuntimeHint[] {
  return [
    {
      name: FORMLESS_RUNTIME_PROFILE_META_NAME,
      content: "publishedSite",
    },
    ...(target?.kind === "appInstall"
      ? [
          {
            name: FORMLESS_RUNTIME_APP_INSTALL_ID_META_NAME,
            content: target.installId,
          },
          {
            name: FORMLESS_RUNTIME_PACKAGE_APP_KEY_META_NAME,
            content: target.packageAppKey,
          },
        ]
      : []),
  ];
}

function publicSiteIndexingResourceForPathname(
  pathname: string,
): PublicSiteIndexingResource | undefined {
  if (pathname === runtimeTopologyRoutes.publicSiteIndexingResourcePaths[0]) {
    return "robots";
  }

  if (pathname === runtimeTopologyRoutes.publicSiteIndexingResourcePaths[1]) {
    return "sitemap";
  }

  return undefined;
}

function compareRecords(left: StoredRecord, right: StoredRecord): number {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}
