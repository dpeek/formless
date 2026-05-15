import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";

import { FORMLESS_RUNTIME_PROFILE_META_NAME } from "../app/runtime-profile.ts";
import { INITIAL_SITE_PAGE_TREE_SCRIPT_ID } from "../app/site-renderer/initial-tree.ts";
import type { SchemaKey } from "../shared/schema-apps.ts";
import type { SitePageTreeResponse } from "../shared/protocol.ts";
import type { Env } from "./index.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import { handlePublishedSiteDocumentRequest } from "./site-ssr.tsx";
import {
  PUBLISHED_SITE_ERROR_CACHE_CONTROL,
  PUBLISHED_SITE_HTML_CACHE_CONTROL,
  PUBLISHED_SITE_NOT_FOUND_CACHE_CONTROL,
} from "./site-cache.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const adminToken = "test-admin-token";

let harness: Harness;

beforeAll(async () => {
  harness = await createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: {
        FORMLESS_RUNTIME_PROFILE: "publishedSite",
        FORMLESS_ADMIN_TOKEN: adminToken,
      },
      compatibilityDate: "2026-04-28",
    },
  );
});

beforeEach(async () => {
  await resetSchemaApp("site");
});

afterAll(async () => {
  await harness.dispose();
});

describe("published Site Worker SSR", () => {
  it("does not render published Site documents outside the published runtime profile", async () => {
    const response = await handlePublishedSiteDocumentRequest(
      new Request("https://example.com/", {
        headers: { Accept: "text/html" },
      }),
      envWithTreeResponse(Response.json(testSitePageTree("home")), undefined, "dev"),
    );

    expect(response).toBeUndefined();
  });

  it("returns server-rendered HTML for the published home route", async () => {
    const response = await getDocument("/");
    const html = await response.text();
    const payload = initialTreePayload(html);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(PUBLISHED_SITE_HTML_CACHE_CONTROL);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("Vary")).toBe("Accept");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain(
      '<html lang="en" class="light" data-site-theme="light" style="color-scheme: light;">',
    );
    expect(html).toContain('<div id="app">');
    expect(html).toContain('<main class="min-h-dvh"><article');
    expect(html).toContain('data-site-theme="light"');
    expect(html).toContain('<script id="formless-public-site-theme">');
    expect(html).toContain('const storageKey = "formless:public-site:theme";');
    expect(html).toContain("(prefers-color-scheme: dark)");
    expect(html).toContain('root.classList.toggle("dark", theme === "dark");');
    expect(html).toContain('<style id="formless-public-site-theme-style">');
    expect(html).toContain("html.dark #app");
    expect(html).toContain("<title>David Peek</title>");
    expect(html).toContain(
      '<meta name="description" content="A concise personal site for current work, writing, and project notes." />',
    );
    expect(html).toContain('<meta property="og:title" content="David Peek" />');
    expect(html).toContain(
      '<meta property="og:description" content="A concise personal site for current work, writing, and project notes." />',
    );
    expect(html).toContain('<meta property="og:type" content="website" />');
    expect(html).toContain('<meta property="og:site_name" content="David Peek" />');
    expect(html).toContain('<meta name="twitter:card" content="summary" />');
    expect(html).not.toContain("og:image");
    expect(html).toContain("Home");
    expect(html).toContain("data-site-header");
    expect(html).toContain("data-site-footer");
    expect(html).toContain(
      `<meta name="${FORMLESS_RUNTIME_PROFILE_META_NAME}" content="publishedSite" />`,
    );
    expect(html).toContain(
      `<script id="${INITIAL_SITE_PAGE_TREE_SCRIPT_ID}" type="application/json">`,
    );
    expect(payload.kind).toBe("formless.sitePageTree");
    expect(payload.version).toBe(1);
    expect(payload.tree.meta.slug).toBe("home");
    expect(html).toContain('import RefreshRuntime from "/@react-refresh";');
    expect(html).toContain("window.__vite_plugin_react_preamble_installed__ = true;");
    expect(html).toContain('<script type="module" src="/src/main.tsx"></script>');
    expect(html).not.toContain("Loading site page...");
  });

  it("injects production client assets from the built client shell", async () => {
    const response = await handlePublishedSiteDocumentRequest(
      new Request("https://example.com/projects", {
        headers: { Accept: "text/html" },
      }),
      envWithTreeResponse(Response.json(testSitePageTree("projects")), builtClientShellHtml()),
    );

    if (!response) {
      throw new Error("Expected a published Site document response.");
    }

    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Projects");
    expect(html).toContain("<title>Projects | David Peek</title>");
    expect(html).toContain(
      '<link rel="modulepreload" crossorigin href="/assets/schema-apps-test.js">',
    );
    expect(html).toContain('<link rel="stylesheet" crossorigin href="/assets/index-test.css">');
    expect(html).toContain(
      '<script type="module" crossorigin src="/assets/index-test.js"></script>',
    );
    expect(html.indexOf('<script id="formless-public-site-theme">')).toBeLessThan(
      html.indexOf('<link rel="stylesheet" crossorigin href="/assets/index-test.css">'),
    );
    expect(html.indexOf('<style id="formless-public-site-theme-style">')).toBeGreaterThan(
      html.indexOf('<link rel="stylesheet" crossorigin href="/assets/index-test.css">'),
    );
    expect(html).not.toContain("/@react-refresh");
    expect(html).not.toContain("/src/main.tsx");
  });

  it("returns server-rendered HTML for starter nested published Site slugs", async () => {
    const response = await getDocument("/blog/starter-post");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Starter post");
    expect(html).toContain("<title>Starter post | Home</title>");
    expect(html).toContain('<meta property="og:type" content="article" />');
    expect(html).toContain("data-site-header");
    expect(html).toContain("data-site-footer");
    expect(html).toContain('href="/blog"');
    expect(html).not.toContain('href="/pages/blog"');
    expect(html).not.toContain("Loading site page...");
  });

  it("renders escaped clean metadata from public tree facts", async () => {
    const response = await handlePublishedSiteDocumentRequest(
      new Request("https://example.com/projects?preview=1", {
        headers: { Accept: "text/html" },
      }),
      envWithTreeResponse(
        Response.json(
          testSitePageTree("projects", {
            body: "# Launch **clean** [public routes](https://example.com)\n\nwith    spacing",
            label: "Projects & plans",
            siteName: "David & <Peek>",
          }),
        ),
      ),
    );

    if (!response) {
      throw new Error("Expected a published Site document response.");
    }

    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("<title>Projects &amp; plans | David &amp; &lt;Peek&gt;</title>");
    expect(html).toContain(
      '<meta name="description" content="Launch clean public routes with spacing" />',
    );
    expect(html).toContain('<link rel="canonical" href="https://example.com/projects" />');
    expect(html).toContain(
      '<meta property="og:title" content="Projects &amp; plans | David &amp; &lt;Peek&gt;" />',
    );
    expect(html).toContain('<meta property="og:site_name" content="David &amp; &lt;Peek&gt;" />');
    expect(html).toContain('<meta property="og:url" content="https://example.com/projects" />');
    expect(html).toContain('<meta property="og:type" content="website" />');
    expect(html).toContain('<meta name="twitter:card" content="summary" />');
    expect(html).not.toContain("og:image");
  });

  it("returns an explicitly cached not-found document for missing published Site slugs", async () => {
    const response = await getDocument("/missing-page");
    const html = await response.text();

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe(PUBLISHED_SITE_NOT_FOUND_CACHE_CONTROL);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("Vary")).toBe("Accept");
    expect(html).toContain("<title>Page not found | Site</title>");
    expect(html).toContain("Page not found");
    expect(html).toContain("No site page exists for");
    expect(html).toContain("<code>missing-page</code>");
    expect(html).not.toContain(INITIAL_SITE_PAGE_TREE_SCRIPT_ID);
  });

  it("returns a no-store error document when the public tree read fails", async () => {
    const response = await handlePublishedSiteDocumentRequest(
      new Request("https://example.com/broken-page", {
        headers: { Accept: "text/html" },
      }),
      envWithTreeResponse(Response.json({ error: "Upstream failed." }, { status: 503 })),
    );

    if (!response) {
      throw new Error("Expected a published Site document response.");
    }

    const html = await response.text();

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe(PUBLISHED_SITE_ERROR_CACHE_CONTROL);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("Vary")).toBe("Accept");
    expect(html).toContain("<title>Site page failed to load | Site</title>");
    expect(html).toContain('<link rel="canonical" href="https://example.com/broken-page" />');
    expect(html).toContain("Site page failed to load");
    expect(html).toContain("broken-page");
    expect(html).toContain("Site page failed to render.");
    expect(html).not.toContain("Upstream failed.");
    expect(html).not.toContain(INITIAL_SITE_PAGE_TREE_SCRIPT_ID);
  });

  it("uses the current public tree from the Site authority", async () => {
    await postAdminJson("/api/site/mutations", {
      mutationId: "mutation-site-ssr-extra-page",
      entity: "block",
      op: "create",
      values: {
        type: "page",
        label: "Server rendered extra page",
        href: "/extra-page",
      },
    });

    const response = await getDocument("/extra-page");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Server rendered extra page");
    expect(html).not.toContain("Loading site page...");
  });

  it("escapes embedded initial tree data for hostile Site content", async () => {
    const hostileLabel = 'Hostile </script><script type="module">alert(1)</script> & text';

    await postAdminJson("/api/site/mutations", {
      mutationId: "mutation-site-ssr-hostile-home-label",
      entity: "block",
      op: "patch",
      recordId: "rec_site_starter_page_home",
      values: {
        label: hostileLabel,
      },
    });

    const response = await getDocument("/");
    const html = await response.text();
    const scriptText = initialTreeScriptText(html);

    expect(response.status).toBe(200);
    expect(scriptText).not.toContain("</script");
    expect(scriptText).not.toContain("<script");
    expect(scriptText).toContain("\\u003C/script\\u003E\\u003Cscript");
    expect(scriptText).toContain("\\u0026 text");
    expect(initialTreePayload(html).tree.page.label).toBe(hostileLabel);
  });

  it("keeps API requests dispatched as API responses instead of Site documents", async () => {
    const response = await harness.fetch("/api/site/tree/home", {
      headers: {
        Accept: "text/html",
      },
    });
    const body = (await response.json()) as { meta: { slug: string } };

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(body.meta.slug).toBe("home");
  });

  it("leaves preview, generated admin, and asset-like routes outside the SSR document path", async () => {
    const responses = await Promise.all([
      getDocument("/pages/home"),
      getDocument("/site"),
      getDocument("/tasks"),
      getDocument("/assets/index.js"),
      getDocument("/favicon.svg"),
    ]);
    const bodies = await Promise.all(responses.map((response) => response.text()));

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404, 404]);
    expect(bodies.join("\n")).not.toContain("data-site-header");
    expect(bodies.join("\n")).not.toContain("Loading site page...");
  });
});

async function resetSchemaApp(schemaKey: SchemaKey) {
  const response = await harness.fetch(`/api/${schemaKey}/reset/seed`, {
    body: "{}",
    headers: adminHeaders(),
    method: "POST",
  });

  expect(response.status).toBe(200);
}

async function getDocument(path: string) {
  return harness.fetch(path, {
    headers: {
      Accept: "text/html",
    },
  });
}

async function postAdminJson(path: string, body: unknown) {
  const response = await harness.fetch(path, {
    body: JSON.stringify(body),
    headers: adminHeaders(),
    method: "POST",
  });

  expect(response.status).toBe(200);

  return response;
}

function adminHeaders() {
  return {
    Authorization: `Bearer ${adminToken}`,
    "Content-Type": "application/json",
  };
}

function initialTreePayload(html: string) {
  return JSON.parse(initialTreeScriptText(html)) as {
    kind: string;
    version: number;
    tree: {
      meta: { slug: string };
      page: { label: string };
    };
  };
}

function initialTreeScriptText(html: string): string {
  const startMarker = `<script id="${INITIAL_SITE_PAGE_TREE_SCRIPT_ID}" type="application/json">`;
  const start = html.indexOf(startMarker);

  expect(start).toBeGreaterThan(-1);

  const contentStart = start + startMarker.length;
  const end = html.indexOf("</script>", contentStart);

  expect(end).toBeGreaterThan(contentStart);

  return html.slice(contentStart, end);
}

function envWithTreeResponse(
  response: Response,
  clientShellHtml?: string,
  runtimeProfile = "publishedSite",
): Env {
  return {
    ASSETS: clientShellHtml
      ? {
          fetch: async () =>
            new Response(clientShellHtml, {
              headers: { "Content-Type": "text/html; charset=utf-8" },
            }),
        }
      : undefined,
    FORMLESS_AUTHORITY: {
      get: () => ({
        fetch: async () => response,
      }),
      idFromName: () => "site-id",
    },
    FORMLESS_RUNTIME_PROFILE: runtimeProfile,
  } as unknown as Env;
}

function builtClientShellHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>formless</title>
    <script type="module" crossorigin src="/assets/index-test.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/schema-apps-test.js">
    <link rel="stylesheet" crossorigin href="/assets/index-test.css">
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>`;
}

function testSitePageTree(
  slug: string,
  options: {
    body?: string;
    label?: string;
    routeKind?: "page" | "post";
    siteName?: string;
  } = {},
): SitePageTreeResponse {
  return {
    page: {
      id: `rec_site_page_${slug}`,
      type: "page",
      label: options.label ?? "Projects",
      ...(options.body ? { body: options.body } : {}),
      placements: [],
    },
    frame: siteFrame(options.siteName ?? "David Peek"),
    meta: {
      slug,
      generatedAt: "2026-05-13T00:00:00.000Z",
      warnings: [],
    },
    route: {
      kind: options.routeKind ?? "page",
      slug,
    },
  };
}

function siteFrame(siteName: string): SitePageTreeResponse["frame"] {
  return {
    header: {
      id: "rec_site_content_group_header",
      type: "header",
      label: "Header",
      placements: [
        {
          id: "rec_site_place_header_primary",
          order: 1000,
          block: {
            id: "rec_site_content_group_header_primary",
            type: "headerPrimary",
            label: "Primary",
            placements: [
              {
                id: "rec_site_place_header_home",
                order: 1000,
                block: {
                  id: "rec_site_content_link_home",
                  type: "link",
                  label: siteName,
                  href: "/",
                  placements: [],
                },
              },
            ],
          },
        },
      ],
    },
  };
}
