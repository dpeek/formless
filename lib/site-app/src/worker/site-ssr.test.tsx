import { describe, expect, it } from "vite-plus/test";

import { INITIAL_SITE_PAGE_TREE_SCRIPT_ID } from "../react/initial-tree.ts";
import type { SitePublicRendererProps } from "../public-renderer.ts";
import type { SiteBlockNode, SitePageTree } from "../types.ts";
import {
  PUBLISHED_SITE_HTML_CACHE_CONTROL,
  PUBLISHED_SITE_NOT_FOUND_CACHE_CONTROL,
} from "./site-cache.ts";
import { renderPublishedSiteDocumentResponse } from "./site-ssr.tsx";

describe("published Site document rendering", () => {
  it("renders successful public documents with a configured page renderer", async () => {
    const CustomRenderer = ({ linkMode, routeBase, tree }: SitePublicRendererProps) => (
      <article
        data-custom-public-site-renderer={tree.meta.slug}
        data-link-mode={linkMode}
        data-route-base={routeBase}
      >
        Custom document {tree.page.label}
      </article>
    );
    const response = await renderPublishedSiteDocumentResponse({
      clientAssets: {
        body: '<script type="module" src="/assets/custom-client.js"></script>',
        head: '<link rel="stylesheet" href="/assets/custom-client.css">',
      },
      renderer: CustomRenderer,
      requestUrl: new URL("https://example.com/projects"),
      routeBase: "/campaign",
      runtimeHints: [{ name: "formless-runtime-profile", content: "publishedSite" }],
      treeResult: { kind: "found", tree: sitePageTree("projects") },
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(PUBLISHED_SITE_HTML_CACHE_CONTROL);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain('<div id="app"><main class="min-h-dvh"><article');
    expect(html).toContain('data-custom-public-site-renderer="projects"');
    expect(html).toContain('data-link-mode="published"');
    expect(html).toContain('data-route-base="/campaign"');
    expect(html).toContain("Custom document");
    expect(html).toContain("Projects");
    expect(html).toContain("<title>Projects | Example Site</title>");
    expect(html).toContain('<link rel="canonical" href="https://example.com/projects" />');
    expect(html).toContain('<meta name="formless-runtime-profile" content="publishedSite" />');
    expect(html).toContain(`<script id="${INITIAL_SITE_PAGE_TREE_SCRIPT_ID}"`);
    expect(html).toContain('<link rel="stylesheet" href="/assets/custom-client.css">');
    expect(html).toContain('<script type="module" src="/assets/custom-client.js"></script>');
    expect(html).not.toContain("data-site-theme-toggle");
  });

  it("falls back to the bundled page renderer when no renderer is configured", async () => {
    const response = await renderPublishedSiteDocumentResponse({
      clientAssets: { body: "", head: "" },
      requestUrl: new URL("https://example.com/"),
      treeResult: { kind: "found", tree: sitePageTree("home") },
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('<main class="min-h-dvh"><article');
    expect(html).toContain('data-site-theme="light"');
    expect(html).toContain("<title>Example Site</title>");
    expect(html).not.toContain("data-custom-public-site-renderer");
  });

  it("keeps not-found documents owned by Formless when a renderer is configured", async () => {
    const CustomRenderer = () => <article data-custom-public-site-renderer="should-not-render" />;
    const response = await renderPublishedSiteDocumentResponse({
      clientAssets: { body: "", head: "" },
      renderer: CustomRenderer,
      requestUrl: new URL("https://example.com/missing"),
      treeResult: { kind: "not-found" },
    });
    const html = await response.text();

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe(PUBLISHED_SITE_NOT_FOUND_CACHE_CONTROL);
    expect(html).toContain("Page not found");
    expect(html).toContain("<title>Page not found | Site</title>");
    expect(html).not.toContain("data-custom-public-site-renderer");
    expect(html).not.toContain(INITIAL_SITE_PAGE_TREE_SCRIPT_ID);
  });
});

function sitePageTree(slug: string): SitePageTree {
  return {
    site: {
      id: "site",
      label: "Example Site",
      description: "Example public site.",
    },
    page: pageNode(slug),
    frame: {},
    meta: {
      slug,
      generatedAt: "2026-06-22T00:00:00.000Z",
      warnings: [],
    },
    route: {
      kind: "page",
      slug,
    },
  };
}

function pageNode(slug: string): SiteBlockNode {
  return {
    id: `page-${slug}`,
    type: "page",
    label: slug === "home" ? "Home" : "Projects",
    placements: [],
  };
}
