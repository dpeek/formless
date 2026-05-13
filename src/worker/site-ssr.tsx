import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server.edge";

import { renderInitialSitePageTreeScript } from "../app/site-renderer/initial-tree.ts";
import { SitePageRenderer } from "../app/site-renderer/renderer.tsx";
import { normalizeSitePageSlug } from "../app/routes/site-page-slug.ts";
import type { SitePageTree, SitePageTreeResponse } from "../shared/protocol.ts";
import type { Env } from "./index.ts";
import { shouldHandlePublishedSiteDocument } from "./routing.ts";
import {
  publishedSiteDocumentCacheControl,
  type PublishedSiteDocumentCacheKind,
} from "./site-cache.ts";

const SITE_SCHEMA_KEY = "site";
const CLIENT_MODULE_PATH = "/src/main.tsx";
const VITE_REACT_REFRESH_PREAMBLE = `<script type="module">
import RefreshRuntime from "/@react-refresh";
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;
</script>`;

export async function handlePublishedSiteDocumentRequest(
  request: Request,
  env: Env,
): Promise<Response | undefined> {
  if (!shouldHandlePublishedSiteDocument(request)) {
    return undefined;
  }

  return renderPublishedSiteDocument(request, env);
}

async function renderPublishedSiteDocument(request: Request, env: Env): Promise<Response> {
  const slug = publishedSiteSlugFromUrl(new URL(request.url));

  try {
    const treeResponse = await fetchSitePageTree(request, env, slug);

    if (treeResponse.status === 404) {
      return htmlResponse(await renderNotFoundDocument(slug), {
        cacheKind: "not-found",
        status: 404,
      });
    }

    if (!treeResponse.ok) {
      return htmlResponse(await renderErrorDocument(slug), {
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

    return htmlResponse(renderDocument(appHtml, { initialTree: tree }));
  } catch {
    return htmlResponse(await renderErrorDocument(slug), {
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

async function renderNotFoundDocument(slug: string): Promise<string> {
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
  );
}

async function renderErrorDocument(slug: string): Promise<string> {
  return renderDocument(
    await renderReactToString(
      <PublishedSiteDocumentShell>
        <section className="mx-auto max-w-3xl px-6 py-10">
          <h1 className="text-2xl font-semibold">Site page failed to load</h1>
          <p className="mt-2 text-sm text-slate-600">{slug}: Site page failed to render.</p>
        </section>
      </PublishedSiteDocumentShell>,
    ),
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

function renderDocument(appHtml: string, options: { initialTree?: SitePageTree } = {}): string {
  const initialTreeScript = options.initialTree
    ? `\n    ${renderInitialSitePageTreeScript(options.initialTree)}`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>formless</title>
  </head>
  <body>
    <div id="app">${appHtml}</div>${initialTreeScript}
    ${VITE_REACT_REFRESH_PREAMBLE}
    <script type="module" src="${CLIENT_MODULE_PATH}"></script>
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
