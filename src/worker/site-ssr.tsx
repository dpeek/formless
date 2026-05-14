import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server.edge";

import { renderInitialSitePageTreeScript } from "../app/site-renderer/initial-tree.ts";
import { SitePageRenderer } from "../app/site-renderer/renderer.tsx";
import { FORMLESS_RUNTIME_PROFILE_META_NAME } from "../app/runtime-profile.ts";
import { normalizeSitePageSlug } from "../app/routes/site-page-slug.ts";
import type { SitePageTree, SitePageTreeResponse } from "../shared/protocol.ts";
import type { Env } from "./index.ts";
import { shouldHandlePublishedSiteDocument, workerRuntimeProfileInput } from "./routing.ts";
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

type ClientDocumentAssets = {
  body: string;
  head: string;
};

export async function handlePublishedSiteDocumentRequest(
  request: Request,
  env: Env,
): Promise<Response | undefined> {
  if (
    !shouldHandlePublishedSiteDocument(
      request,
      workerRuntimeProfileInput(env.FORMLESS_RUNTIME_PROFILE),
    )
  ) {
    return undefined;
  }

  return renderPublishedSiteDocument(request, env);
}

async function renderPublishedSiteDocument(request: Request, env: Env): Promise<Response> {
  const slug = publishedSiteSlugFromUrl(new URL(request.url));
  const clientAssets = await loadClientDocumentAssets(request, env);

  try {
    const treeResponse = await fetchSitePageTree(request, env, slug);

    if (treeResponse.status === 404) {
      return htmlResponse(await renderNotFoundDocument(slug, clientAssets), {
        cacheKind: "not-found",
        status: 404,
      });
    }

    if (!treeResponse.ok) {
      return htmlResponse(await renderErrorDocument(slug, clientAssets), {
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

    return htmlResponse(renderDocument(appHtml, { clientAssets, initialTree: tree }));
  } catch {
    return htmlResponse(await renderErrorDocument(slug, clientAssets), {
      cacheKind: "error",
      status: 500,
    });
  }
}

async function fetchSitePageTree(request: Request, env: Env, slug: string): Promise<Response> {
  const authorityId = env.FORMLESS_AUTHORITY.idFromName(SITE_SCHEMA_KEY);
  const authority = env.FORMLESS_AUTHORITY.get(authorityId);
  const treeUrl = new URL(`/api/${SITE_SCHEMA_KEY}/tree/${encodeURIComponent(slug)}`, request.url);

  return authority.fetch(
    new Request(treeUrl, {
      headers: { Accept: "application/json" },
      method: "GET",
    }),
  );
}

async function renderNotFoundDocument(
  slug: string,
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
    { clientAssets },
  );
}

async function renderErrorDocument(
  slug: string,
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
    { clientAssets },
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
  options: { clientAssets: ClientDocumentAssets; initialTree?: SitePageTree },
): string {
  const initialTreeScript = options.initialTree
    ? `\n    ${renderInitialSitePageTreeScript(options.initialTree)}`
    : "";
  const clientAssetHeadTags = options.clientAssets.head ? `\n    ${options.clientAssets.head}` : "";
  const clientAssetBodyTags = options.clientAssets.body ? `\n    ${options.clientAssets.body}` : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="${FORMLESS_RUNTIME_PROFILE_META_NAME}" content="publishedSite" />
    <title>formless</title>${clientAssetHeadTags}
  </head>
  <body>
    <div id="app">${appHtml}</div>${initialTreeScript}${clientAssetBodyTags}
  </body>
</html>`;
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
