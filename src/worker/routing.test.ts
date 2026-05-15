import { describe, expect, it } from "vite-plus/test";

import {
  isClientShellRoute,
  publishedSiteRedirectForRequest,
  shouldDeferToStaticAssets,
  shouldHandlePublishedSiteDocument,
  shouldHandlePublishedSiteIndexingResource,
} from "./routing.ts";

describe("Worker document routing", () => {
  it("routes published Site documents to the Worker SSR path only in the published profile", () => {
    expect(
      shouldHandlePublishedSiteDocument(documentRequest("http://example.com/"), {
        profile: "publishedSite",
      }),
    ).toBe(true);
    expect(
      shouldHandlePublishedSiteDocument(documentRequest("http://published-site.example.com/")),
    ).toBe(true);
    expect(
      shouldHandlePublishedSiteDocument(
        documentRequest("https://formless.twitchy.workers.dev/blog"),
      ),
    ).toBe(true);
    expect(
      shouldHandlePublishedSiteDocument(documentRequest("http://example.com/blog/post"), {
        profile: "publishedSite",
      }),
    ).toBe(true);
    expect(shouldHandlePublishedSiteDocument(documentRequest("http://example.com/"))).toBe(false);
    expect(
      shouldHandlePublishedSiteDocument(documentRequest("http://published-site.example.com/"), {
        profile: "dev",
      }),
    ).toBe(false);
    expect(
      shouldHandlePublishedSiteDocument(documentRequest("http://example.com/"), {
        profile: "siteAuthoring",
      }),
    ).toBe(false);
  });

  it("marks non-published document routes for asset serving fallback", () => {
    expect(shouldDeferToStaticAssets(documentRequest("http://example.com/"))).toBe(true);
    expect(shouldDeferToStaticAssets(documentRequest("http://example.com/blog/post"))).toBe(true);
    expect(
      shouldDeferToStaticAssets(documentRequest("http://example.com/"), {
        profile: "publishedSite",
      }),
    ).toBe(false);
    expect(shouldDeferToStaticAssets(documentRequest("http://published-site.example.com/"))).toBe(
      false,
    );
    expect(
      shouldDeferToStaticAssets(documentRequest("https://formless.twitchy.workers.dev/blog")),
    ).toBe(false);
    expect(
      shouldDeferToStaticAssets(documentRequest("http://published-site.example.com/"), {
        profile: "dev",
      }),
    ).toBe(true);
    expect(
      shouldDeferToStaticAssets(documentRequest("http://example.com/admin"), {
        profile: "siteAuthoring",
      }),
    ).toBe(true);
  });

  it("lets explicit profile config override host-derived profile config", () => {
    expect(
      shouldHandlePublishedSiteDocument(documentRequest("http://published-site.example.com/"), {
        profile: "app",
      }),
    ).toBe(false);
    expect(
      shouldHandlePublishedSiteDocument(documentRequest("http://app.example.com/"), {
        profile: "publishedSite",
      }),
    ).toBe(true);
    expect(
      shouldHandlePublishedSiteDocument(
        documentRequest("https://formless.twitchy.workers.dev/blog"),
        {
          profile: "dev",
        },
      ),
    ).toBe(false);
  });

  it("keeps API, preview redirect, generated app, app-profile, asset, and non-HTML routes out of SSR", () => {
    const nonSsrRequests = [
      documentRequest("http://example.com/api/site/tree/home"),
      documentRequest("http://example.com/pages/home"),
      documentRequest("http://example.com/work"),
      documentRequest("http://example.com/tasks"),
      documentRequest("http://example.com/estii/setup"),
      documentRequest("http://example.com/site/schema"),
      documentRequest("http://example.com/schema"),
      documentRequest("http://example.com/assets/index.js"),
      new Request("http://example.com/@vite/client", { headers: { Accept: "*/*" } }),
      new Request("http://example.com/@react-refresh", { headers: { Accept: "*/*" } }),
      documentRequest("http://example.com/favicon.svg"),
      documentRequest("http://example.com/favicon.ico"),
      documentRequest("http://example.com/apple-touch-icon.png"),
      new Request("http://example.com/blog/post", { headers: { Accept: "application/json" } }),
    ];

    expect(
      nonSsrRequests.map((request) =>
        shouldHandlePublishedSiteDocument(request, { profile: "publishedSite" }),
      ),
    ).toEqual(nonSsrRequests.map(() => false));

    expect(shouldHandlePublishedSiteDocument(documentRequest("http://app.example.com/"))).toBe(
      false,
    );
  });

  it("routes published Site indexing resources before static asset fallback", () => {
    expect(
      shouldHandlePublishedSiteIndexingResource(new Request("http://example.com/robots.txt"), {
        profile: "publishedSite",
      }),
    ).toBe(true);
    expect(
      shouldHandlePublishedSiteIndexingResource(new Request("http://example.com/sitemap.xml"), {
        profile: "publishedSite",
      }),
    ).toBe(true);
    expect(
      shouldHandlePublishedSiteIndexingResource(new Request("http://example.com/sitemap.xml")),
    ).toBe(false);
    expect(
      shouldHandlePublishedSiteIndexingResource(
        new Request("http://example.com/sitemap.xml", { method: "HEAD" }),
        { profile: "publishedSite" },
      ),
    ).toBe(false);
    expect(
      shouldDeferToStaticAssets(new Request("http://example.com/sitemap.xml"), {
        profile: "publishedSite",
      }),
    ).toBe(true);
  });

  it("blocks generated app paths from published document and static shell handling", () => {
    const generatedAppRequests = [
      documentRequest("http://example.com/tasks"),
      documentRequest("http://example.com/estii/setup"),
      documentRequest("http://example.com/rates"),
      documentRequest("http://example.com/site/schema"),
      documentRequest("http://example.com/schema"),
    ];

    expect(
      generatedAppRequests.map((request) =>
        shouldHandlePublishedSiteDocument(request, { profile: "publishedSite" }),
      ),
    ).toEqual(generatedAppRequests.map(() => false));

    expect(
      generatedAppRequests.map((request) =>
        shouldDeferToStaticAssets(request, { profile: "publishedSite" }),
      ),
    ).toEqual(generatedAppRequests.map(() => false));
  });

  it("marks client-shell and static asset requests for asset serving fallback", () => {
    expect(shouldDeferToStaticAssets(documentRequest("http://example.com/pages/home"))).toBe(true);
    expect(shouldDeferToStaticAssets(documentRequest("http://example.com/site"))).toBe(true);
    expect(shouldDeferToStaticAssets(documentRequest("http://app.example.com/setup"))).toBe(true);
    expect(shouldDeferToStaticAssets(documentRequest("http://example.com/assets/index.js"))).toBe(
      true,
    );
    expect(
      shouldDeferToStaticAssets(
        new Request("http://example.com/@vite/client", { headers: { Accept: "*/*" } }),
      ),
    ).toBe(true);
    expect(
      shouldDeferToStaticAssets(
        new Request("http://example.com/@react-refresh", { headers: { Accept: "*/*" } }),
      ),
    ).toBe(true);
    expect(shouldDeferToStaticAssets(documentRequest("http://example.com/api/site/schema"))).toBe(
      false,
    );
    expect(
      shouldDeferToStaticAssets(
        new Request("http://example.com/pages/home", {
          headers: { Accept: "text/html" },
          method: "POST",
        }),
      ),
    ).toBe(false);
  });

  it("limits published profile static fallback to asset-like paths", () => {
    expect(
      shouldDeferToStaticAssets(documentRequest("http://example.com/assets/index.js"), {
        profile: "publishedSite",
      }),
    ).toBe(true);
    expect(
      shouldDeferToStaticAssets(documentRequest("http://example.com/favicon.svg"), {
        profile: "publishedSite",
      }),
    ).toBe(true);
    expect(
      shouldDeferToStaticAssets(documentRequest("http://example.com/favicon.ico"), {
        profile: "publishedSite",
      }),
    ).toBe(true);
    expect(
      shouldDeferToStaticAssets(documentRequest("http://example.com/apple-touch-icon.png"), {
        profile: "publishedSite",
      }),
    ).toBe(true);
    expect(
      shouldDeferToStaticAssets(documentRequest("http://example.com/pages/home"), {
        profile: "publishedSite",
      }),
    ).toBe(false);
    expect(
      shouldDeferToStaticAssets(documentRequest("http://example.com/site"), {
        profile: "publishedSite",
      }),
    ).toBe(false);
  });

  it("builds published Site redirects for old preview and work routes", () => {
    expect(
      publishedSiteRedirectForRequest(documentRequest("http://example.com/pages"), {
        profile: "publishedSite",
      }),
    ).toEqual({ location: "/", status: 308 });
    expect(
      publishedSiteRedirectForRequest(documentRequest("http://example.com/pages/"), {
        profile: "publishedSite",
      }),
    ).toEqual({ location: "/", status: 308 });
    expect(
      publishedSiteRedirectForRequest(documentRequest("http://example.com/pages/home"), {
        profile: "publishedSite",
      }),
    ).toEqual({ location: "/", status: 308 });
    expect(
      publishedSiteRedirectForRequest(documentRequest("http://example.com/pages/projects"), {
        profile: "publishedSite",
      }),
    ).toEqual({ location: "/projects", status: 308 });
    expect(
      publishedSiteRedirectForRequest(
        documentRequest("http://example.com/pages/blog/agents?ref=old"),
        {
          profile: "publishedSite",
        },
      ),
    ).toEqual({ location: "/blog/agents?ref=old", status: 308 });
    expect(
      publishedSiteRedirectForRequest(documentRequest("http://example.com/pages//projects"), {
        profile: "publishedSite",
      }),
    ).toEqual({ location: "/projects", status: 308 });
    expect(
      publishedSiteRedirectForRequest(documentRequest("http://example.com/work/"), {
        profile: "publishedSite",
      }),
    ).toEqual({ location: "/projects", status: 308 });
  });

  it("does not redirect outside the published profile or for API, asset, or non-GET requests", () => {
    expect(publishedSiteRedirectForRequest(documentRequest("http://example.com/pages/home"))).toBe(
      undefined,
    );
    expect(
      publishedSiteRedirectForRequest(documentRequest("http://example.com/pages/home"), {
        profile: "siteAuthoring",
      }),
    ).toBe(undefined);
    expect(
      publishedSiteRedirectForRequest(documentRequest("http://example.com/api/site/pages/home"), {
        profile: "publishedSite",
      }),
    ).toBe(undefined);
    expect(
      publishedSiteRedirectForRequest(documentRequest("http://example.com/pages/logo.svg"), {
        profile: "publishedSite",
      }),
    ).toBe(undefined);
    expect(
      publishedSiteRedirectForRequest(
        new Request("http://example.com/pages/home", {
          headers: { Accept: "text/html" },
          method: "POST",
        }),
        { profile: "publishedSite" },
      ),
    ).toBe(undefined);
  });

  it("recognizes generated app and preview route prefixes as client shell routes", () => {
    expect(isClientShellRoute("/pages/home")).toBe(true);
    expect(isClientShellRoute("/tasks")).toBe(true);
    expect(isClientShellRoute("/estii/setup")).toBe(true);
    expect(isClientShellRoute("/site/schema")).toBe(true);
    expect(isClientShellRoute("/blog")).toBe(false);
  });
});

function documentRequest(url: string): Request {
  return new Request(url, { headers: { Accept: "text/html" } });
}
