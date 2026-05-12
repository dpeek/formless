import { describe, expect, it } from "vite-plus/test";

import { fetchSitePageTree, normalizeSitePageSlug } from "./site-page.tsx";
import type { SitePageTreeResponse } from "../../shared/protocol.ts";

describe("public Site page route data loading", () => {
  it("fetches the current tree through the read-only Site tree endpoint", async () => {
    const tree = sitePageTree("blog/shipping-schema-backed-authoring");
    const calls: Array<{
      body: BodyInit | null | undefined;
      input: RequestInfo | URL;
      method: string | undefined;
      accept: string | null;
      signal: AbortSignal | null | undefined;
    }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({
        body: init?.body,
        input,
        method: init?.method,
        accept: new Headers(init?.headers).get("Accept"),
        signal: init?.signal,
      });

      return Response.json(tree);
    };

    const response = await fetchSitePageTree("blog/shipping-schema-backed-authoring", {
      fetcher,
    });

    expect(response).toEqual(tree);
    expect(calls).toEqual([
      {
        body: undefined,
        input: "/api/site/tree/blog%2Fshipping-schema-backed-authoring",
        method: undefined,
        accept: "application/json",
        signal: undefined,
      },
    ]);
  });

  it("passes abort signals to tree fetches for stale route cleanup", async () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | null | undefined;
    const fetcher: typeof fetch = async (_input, init) => {
      receivedSignal = init?.signal;

      return Response.json(sitePageTree("home"));
    };

    await fetchSitePageTree("home", { fetcher, signal: controller.signal });

    expect(receivedSignal).toBe(controller.signal);
  });

  it("maps missing tree reads to the public not-found state", async () => {
    const fetcher: typeof fetch = async () =>
      Response.json({ error: "Site page not found." }, { status: 404 });

    await expect(fetchSitePageTree("missing", { fetcher })).rejects.toThrow(
      'No site page found for "missing".',
    );
  });

  it("normalizes empty and encoded public page slugs", () => {
    expect(normalizeSitePageSlug(undefined)).toBe("home");
    expect(normalizeSitePageSlug("/blog%2Fshipping-schema-backed-authoring")).toBe(
      "blog/shipping-schema-backed-authoring",
    );
  });
});

function sitePageTree(slug: string): SitePageTreeResponse {
  return {
    page: {
      id: `rec_site_page_${slug.replaceAll("/", "_")}`,
      type: "page",
      label: slug,
      placements: [],
    },
    frame: {},
    meta: {
      slug,
      generatedAt: "2026-05-12T00:00:00.000Z",
      warnings: [],
    },
    route: {
      kind: "page",
      slug,
    },
  };
}
