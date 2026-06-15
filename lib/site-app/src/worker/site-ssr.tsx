import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server.edge";

import { renderInitialSitePageTreeScript } from "../react/initial-tree.ts";
import { PUBLIC_SITE_THEME_STORAGE_KEY, SitePageRenderer } from "../react/renderer.tsx";
import { normalizeSitePageSlug } from "../react/slug.ts";
import {
  buildPublicDocumentMetadata,
  type PublicDocumentMetadata,
} from "../public-document-metadata.ts";
import type { SitePageTree, SitePageTreeResponse } from "../types.ts";
import {
  publishedSiteDocumentCacheControl,
  type PublishedSiteDocumentCacheKind,
} from "./site-cache.ts";

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

export type PublicSiteDocumentClientAssets = {
  body: string;
  head: string;
};

export type PublicSiteDocumentRuntimeHint = {
  content: string;
  name: string;
};

export type PublicSiteDocumentTreeResult =
  | {
      kind: "found";
      tree: SitePageTreeResponse;
    }
  | {
      kind: "not-found";
    }
  | {
      kind: "error";
    };

export type PublicSiteDocumentRenderInput = {
  clientAssets: PublicSiteDocumentClientAssets;
  requestUrl: URL;
  runtimeHints?: readonly PublicSiteDocumentRuntimeHint[];
  slug?: string;
  treeResult: PublicSiteDocumentTreeResult;
};

export type PublicSiteDocumentRenderResponse = Response;

export async function renderPublishedSiteDocumentResponse(
  input: PublicSiteDocumentRenderInput,
): Promise<PublicSiteDocumentRenderResponse> {
  const slug = input.slug ?? publishedSiteSlugFromUrl(input.requestUrl);
  const requestUrl = input.requestUrl;

  try {
    if (input.treeResult.kind === "not-found") {
      return htmlResponse(await renderNotFoundDocument(slug, requestUrl, input), {
        cacheKind: "not-found",
        status: 404,
      });
    }

    if (input.treeResult.kind === "error") {
      return htmlResponse(await renderErrorDocument(slug, requestUrl, input), {
        cacheKind: "error",
        status: 500,
      });
    }

    const tree = input.treeResult.tree;
    const appHtml = await renderReactToString(
      <PublishedSiteDocumentShell>
        <SitePageRenderer linkMode="published" tree={tree} />
      </PublishedSiteDocumentShell>,
    );

    return htmlResponse(
      renderDocument(appHtml, {
        clientAssets: input.clientAssets,
        initialTree: tree,
        metadata: buildPublicDocumentMetadata({
          kind: "success",
          requestUrl,
          slug,
          tree,
        }),
        runtimeHints: input.runtimeHints,
      }),
    );
  } catch {
    return htmlResponse(await renderErrorDocument(slug, requestUrl, input), {
      cacheKind: "error",
      status: 500,
    });
  }
}

async function renderNotFoundDocument(
  slug: string,
  requestUrl: URL,
  input: PublicSiteDocumentRenderInput,
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
      clientAssets: input.clientAssets,
      metadata: buildPublicDocumentMetadata({
        kind: "not-found",
        requestUrl,
        slug,
      }),
      runtimeHints: input.runtimeHints,
    },
  );
}

async function renderErrorDocument(
  slug: string,
  requestUrl: URL,
  input: PublicSiteDocumentRenderInput,
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
      clientAssets: input.clientAssets,
      metadata: buildPublicDocumentMetadata({
        kind: "error",
        requestUrl,
        slug,
      }),
      runtimeHints: input.runtimeHints,
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

function renderDocument(
  appHtml: string,
  options: {
    clientAssets: PublicSiteDocumentClientAssets;
    initialTree?: SitePageTree;
    metadata: PublicDocumentMetadata;
    runtimeHints?: readonly PublicSiteDocumentRuntimeHint[];
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
	    ${renderRuntimeHints(options.runtimeHints)}
	    ${metadataTags}
	    ${PUBLIC_SITE_THEME_BOOT_SCRIPT}${clientAssetHeadTags}
    ${PUBLIC_SITE_THEME_BOOT_STYLE}
  </head>
  <body>
    <div id="app">${appHtml}</div>${initialTreeScript}${clientAssetBodyTags}
  </body>
</html>`;
}

function renderRuntimeHints(hints: readonly PublicSiteDocumentRuntimeHint[] | undefined): string {
  if (!hints?.length) {
    return "";
  }

  return hints
    .map(
      (hint) =>
        `<meta name="${escapeHtmlAttribute(hint.name)}" content="${escapeHtmlAttribute(hint.content)}" />`,
    )
    .join("\n    ");
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
