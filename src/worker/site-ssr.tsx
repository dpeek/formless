import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server.edge";

import { renderInitialSitePageTreeScript } from "../app/site-renderer/initial-tree.ts";
import { PUBLIC_SITE_THEME_STORAGE_KEY, SitePageRenderer } from "../app/site-renderer/renderer.tsx";
import { FORMLESS_RUNTIME_PROFILE_META_NAME } from "../app/runtime-profile.ts";
import { normalizeSitePageSlug } from "../app/routes/site-page-slug.ts";
import {
  buildPublicDocumentMetadata,
  type PublicDocumentMetadata,
} from "../site/public-document-metadata.ts";
import type { SitePageTree, SitePageTreeResponse } from "../shared/protocol.ts";
import type { InstalledAppStorageIdentity } from "../shared/app-storage-identity.ts";
import { getEquivalentRequestForHead, responseWithoutBodyForHead } from "./head-response.ts";
import type { Env } from "./index.ts";
import type { MappedSiteHost } from "./mapped-site-host.ts";
import {
  shouldBlockMappedSiteHostBrowserRoute,
  shouldHandleMappedSiteHostDocument,
  shouldHandlePublishedSiteDocument,
  type WorkerRuntimeProfileInput,
  workerRuntimeProfileInput,
} from "./routing.ts";
import {
  publishedSiteDocumentCacheControl,
  type PublishedSiteDocumentCacheKind,
} from "./site-cache.ts";

const SITE_SCHEMA_KEY = "site";
const CLIENT_MODULE_PATH = "/src/main.tsx";
const CLIENT_SHELL_PATH = "/index.html";
const VITE_REACT_REFRESH_PREAMBLE = `<script type="module">
import RefreshRuntime from "/@react-refresh";
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;
</script>`;
const DEVELOPMENT_CLIENT_ASSETS: ClientDocumentAssets = {
  body: `${VITE_REACT_REFRESH_PREAMBLE}
    <script type="module" src="${CLIENT_MODULE_PATH}"></script>`,
  head: "",
};
const EMPTY_CLIENT_ASSETS: ClientDocumentAssets = { body: "", head: "" };
const PUBLIC_SITE_THEME_BOOT_SCRIPT_ID = "formless-public-site-theme";
const PUBLIC_SITE_THEME_BOOT_STYLE_ID = "formless-public-site-theme-style";
const PUBLIC_SITE_THEME_BOOT_SCRIPT = `<script id="${PUBLIC_SITE_THEME_BOOT_SCRIPT_ID}">
(() => {
  const storageKey = ${JSON.stringify(PUBLIC_SITE_THEME_STORAGE_KEY)};
  const root = document.documentElement;
  let theme = "light";

  try {
    const stored = window.localStorage.getItem(storageKey);

    if (stored === "dark" || stored === "light") {
      theme = stored;
    } else if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
      theme = "dark";
    }
  } catch {
    try {
      if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
        theme = "dark";
      }
    } catch {}
  }

  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
  root.dataset.siteTheme = theme;
  root.style.setProperty("color-scheme", theme);
})();
</script>`;
const PUBLIC_SITE_THEME_BOOT_STYLE = `<style id="${PUBLIC_SITE_THEME_BOOT_STYLE_ID}">
html.light,
html.light body {
  background: #ffffff;
  color: #09090b;
  color-scheme: light;
}

html.dark,
html.dark body,
html.dark #app,
html.dark [data-site-theme] {
  background: #09090b;
  color: #f4f4f5;
  color-scheme: dark;
}
</style>`;

type ClientDocumentAssets = {
  body: string;
  head: string;
};

export async function handlePublishedSiteDocumentRequest(
  request: Request,
  env: Env,
  options: { mappedSiteHost?: MappedSiteHost; runtimeProfile?: WorkerRuntimeProfileInput } = {},
): Promise<Response | undefined> {
  if (options.mappedSiteHost) {
    if (shouldBlockMappedSiteHostBrowserRoute(request)) {
      return responseWithoutBodyForHead(request, new Response(null, { status: 404 }));
    }

    if (!shouldHandleMappedSiteHostDocument(request)) {
      return undefined;
    }
  } else {
    if (
      !shouldHandlePublishedSiteDocument(
        request,
        options.runtimeProfile ?? workerRuntimeProfileInput(env.FORMLESS_RUNTIME_PROFILE),
      )
    ) {
      return undefined;
    }
  }

  const response = await renderPublishedSiteDocument(getEquivalentRequestForHead(request), env, {
    target: options.mappedSiteHost?.target,
  });

  return responseWithoutBodyForHead(request, response);
}

async function renderPublishedSiteDocument(
  request: Request,
  env: Env,
  options: { target?: InstalledAppStorageIdentity } = {},
): Promise<Response> {
  const slug = publishedSiteSlugFromUrl(new URL(request.url));
  const requestUrl = new URL(request.url);
  const clientAssets = await loadClientDocumentAssets(request, env);

  try {
    const treeResponse = await fetchSitePageTree(request, env, slug, options.target);

    if (treeResponse.status === 404) {
      return htmlResponse(await renderNotFoundDocument(slug, requestUrl, clientAssets), {
        cacheKind: "not-found",
        status: 404,
      });
    }

    if (!treeResponse.ok) {
      return htmlResponse(await renderErrorDocument(slug, requestUrl, clientAssets), {
        cacheKind: "error",
        status: 500,
      });
    }

    const tree = (await treeResponse.json()) as SitePageTreeResponse;
    const appHtml = await renderReactToString(
      <PublishedSiteDocumentShell>
        <SitePageRenderer linkMode="published" tree={tree} />
      </PublishedSiteDocumentShell>,
    );

    return htmlResponse(
      renderDocument(appHtml, {
        clientAssets,
        initialTree: tree,
        metadata: buildPublicDocumentMetadata({
          kind: "success",
          requestUrl,
          slug,
          tree,
        }),
      }),
    );
  } catch {
    return htmlResponse(await renderErrorDocument(slug, requestUrl, clientAssets), {
      cacheKind: "error",
      status: 500,
    });
  }
}

async function fetchSitePageTree(
  request: Request,
  env: Env,
  slug: string,
  target?: InstalledAppStorageIdentity,
): Promise<Response> {
  const authorityId = env.FORMLESS_AUTHORITY.idFromName(target?.authorityName ?? SITE_SCHEMA_KEY);
  const authority = env.FORMLESS_AUTHORITY.get(authorityId);
  const treeUrl = new URL(
    `${target?.apiRoutePrefix ?? `/api/${SITE_SCHEMA_KEY}`}/tree/${encodeURIComponent(slug)}`,
    request.url,
  );

  return authority.fetch(
    new Request(treeUrl, {
      headers: { Accept: "application/json" },
      method: "GET",
    }),
  );
}

async function renderNotFoundDocument(
  slug: string,
  requestUrl: URL,
  clientAssets: ClientDocumentAssets,
): Promise<string> {
  return renderDocument(
    await renderReactToString(
      <PublishedSiteDocumentShell>
        <section className="mx-auto max-w-3xl px-6 py-10">
          <h1 className="text-2xl font-semibold">Page not found</h1>
          <p className="mt-2 text-sm text-slate-600">
            No site page exists for <code>{slug}</code>.
          </p>
          <a className="mt-4 inline-flex text-sm font-medium underline" href="/">
            Home
          </a>
        </section>
      </PublishedSiteDocumentShell>,
    ),
    {
      clientAssets,
      metadata: buildPublicDocumentMetadata({
        kind: "not-found",
        requestUrl,
        slug,
      }),
    },
  );
}

async function renderErrorDocument(
  slug: string,
  requestUrl: URL,
  clientAssets: ClientDocumentAssets,
): Promise<string> {
  return renderDocument(
    await renderReactToString(
      <PublishedSiteDocumentShell>
        <section className="mx-auto max-w-3xl px-6 py-10">
          <h1 className="text-2xl font-semibold">Site page failed to load</h1>
          <p className="mt-2 text-sm text-slate-600">{slug}: Site page failed to render.</p>
        </section>
      </PublishedSiteDocumentShell>,
    ),
    {
      clientAssets,
      metadata: buildPublicDocumentMetadata({
        kind: "error",
        requestUrl,
        slug,
      }),
    },
  );
}

function PublishedSiteDocumentShell({ children }: { children: ReactNode }) {
  return <main className="min-h-dvh">{children}</main>;
}

async function renderReactToString(node: ReactNode): Promise<string> {
  const stream = await renderToReadableStream(node);

  await stream.allReady;

  return new Response(stream).text();
}

async function loadClientDocumentAssets(request: Request, env: Env): Promise<ClientDocumentAssets> {
  if (!env.ASSETS) {
    return DEVELOPMENT_CLIENT_ASSETS;
  }

  let shellHtml = "";

  try {
    const shellUrl = new URL(CLIENT_SHELL_PATH, request.url);
    const shellResponse = await env.ASSETS.fetch(
      new Request(shellUrl, {
        headers: { Accept: "text/html" },
        method: "GET",
      }),
    );

    if (!shellResponse.ok) {
      return EMPTY_CLIENT_ASSETS;
    }

    shellHtml = await shellResponse.text();
  } catch {
    return EMPTY_CLIENT_ASSETS;
  }

  const assetTags = extractClientAssetTags(shellHtml);

  if (assetTags.length > 0) {
    return { body: "", head: assetTags.join("\n    ") };
  }

  if (shellHtml.includes(CLIENT_MODULE_PATH) || shellHtml.includes("/@react-refresh")) {
    return DEVELOPMENT_CLIENT_ASSETS;
  }

  return EMPTY_CLIENT_ASSETS;
}

function extractClientAssetTags(html: string): string[] {
  const headContent = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "";
  const assetTagPattern =
    /<script\b[^>]*\bsrc="\/assets\/[^"]+"[^>]*><\/script>|<link\b[^>]*\bhref="\/assets\/[^"]+"[^>]*>/g;

  return [...headContent.matchAll(assetTagPattern)].map((match) => match[0].trim());
}

function renderDocument(
  appHtml: string,
  options: {
    clientAssets: ClientDocumentAssets;
    initialTree?: SitePageTree;
    metadata: PublicDocumentMetadata;
  },
): string {
  const initialTreeScript = options.initialTree
    ? `\n    ${renderInitialSitePageTreeScript(options.initialTree)}`
    : "";
  const clientAssetHeadTags = options.clientAssets.head ? `\n    ${options.clientAssets.head}` : "";
  const clientAssetBodyTags = options.clientAssets.body ? `\n    ${options.clientAssets.body}` : "";
  const metadataTags = renderMetadataTags(options.metadata);

  return `<!doctype html>
<html lang="en" class="light" data-site-theme="light" style="color-scheme: light;">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" sizes="any" href="/favicon.ico" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <meta name="${FORMLESS_RUNTIME_PROFILE_META_NAME}" content="publishedSite" />
    ${metadataTags}
    ${PUBLIC_SITE_THEME_BOOT_SCRIPT}${clientAssetHeadTags}
    ${PUBLIC_SITE_THEME_BOOT_STYLE}
  </head>
  <body>
    <div id="app">${appHtml}</div>${initialTreeScript}${clientAssetBodyTags}
  </body>
</html>`;
}

function renderMetadataTags(metadata: PublicDocumentMetadata): string {
  const title = escapeHtmlText(metadata.title);
  const description = escapeHtmlAttribute(metadata.description);
  const canonicalUrl = escapeHtmlAttribute(metadata.canonicalUrl);
  const siteName = escapeHtmlAttribute(metadata.siteName);

  return `<title>${title}</title>
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${canonicalUrl}" />
    <meta property="og:title" content="${escapeHtmlAttribute(metadata.title)}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:type" content="${escapeHtmlAttribute(metadata.ogType)}" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:site_name" content="${siteName}" />
    <meta name="twitter:card" content="${escapeHtmlAttribute(metadata.twitterCard)}" />`;
}

function escapeHtmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value).replaceAll('"', "&quot;");
}

function htmlResponse(
  html: string,
  options: { cacheKind?: PublishedSiteDocumentCacheKind; status?: number } = {},
): Response {
  return new Response(html, {
    headers: {
      "Cache-Control": publishedSiteDocumentCacheControl(options.cacheKind ?? "success"),
      "Content-Type": "text/html; charset=utf-8",
      Vary: "Accept",
    },
    status: options.status ?? 200,
  });
}

function publishedSiteSlugFromUrl(url: URL): string {
  return normalizeSitePageSlug(url.pathname);
}
