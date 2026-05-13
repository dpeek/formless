import { describe, expect, it } from "vite-plus/test";

import {
  isClientShellRoute,
  shouldDeferToStaticAssets,
  shouldHandlePublishedSiteDocument,
} from "./routing.ts";

describe("Worker document routing", () => {
  it("routes published Site documents to the Worker SSR path", () => {
    expect(shouldHandlePublishedSiteDocument(documentRequest("http://example.com/"))).toBe(true);
    expect(shouldHandlePublishedSiteDocument(documentRequest("http://example.com/blog/post"))).toBe(
      true,
    );
  });

  it("keeps API, preview, generated app, app-profile, asset, and non-HTML routes out of SSR", () => {
    const nonSsrRequests = [
      documentRequest("http://example.com/api/site/tree/home"),
      documentRequest("http://example.com/pages/home"),
      documentRequest("http://example.com/tasks"),
      documentRequest("http://example.com/estii/setup"),
      documentRequest("http://example.com/site/schema"),
      documentRequest("http://example.com/schema"),
      documentRequest("http://app.example.com/"),
      documentRequest("http://example.com/assets/index.js"),
      documentRequest("http://example.com/favicon.svg"),
      new Request("http://example.com/blog/post", { headers: { Accept: "application/json" } }),
    ];

    expect(nonSsrRequests.map(shouldHandlePublishedSiteDocument)).toEqual(
      nonSsrRequests.map(() => false),
    );
  });

  it("marks client-shell and static asset requests for asset serving fallback", () => {
    expect(shouldDeferToStaticAssets(documentRequest("http://example.com/pages/home"))).toBe(true);
    expect(shouldDeferToStaticAssets(documentRequest("http://example.com/site"))).toBe(true);
    expect(shouldDeferToStaticAssets(documentRequest("http://app.example.com/setup"))).toBe(true);
    expect(shouldDeferToStaticAssets(documentRequest("http://example.com/assets/index.js"))).toBe(
      true,
    );
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
