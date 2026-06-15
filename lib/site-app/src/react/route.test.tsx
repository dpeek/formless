import { describe, expect, it } from "vite-plus/test";

import {
  fetchSitePageTree,
  normalizeSitePageSlug,
  startSitePageRouteSession,
  type SitePageRouteState,
} from "./route.tsx";
import {
  INITIAL_SITE_PAGE_TREE_SCRIPT_ID,
  readInitialSitePageTree,
  renderInitialSitePageTreeScript,
} from "./initial-tree.ts";
import type { SitePageTreeResponse } from "../types.ts";

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

  it("fetches installed Site trees through the selected install endpoint", async () => {
    const tree = sitePageTree("home");
    const fetcher: typeof fetch = async (input) => {
      expect(input).toBe("/api/app-installs/site/personal/tree/home");

      return Response.json(tree);
    };

    await expect(
      fetchSitePageTree("home", {
        apiRoutePrefix: "/api/app-installs/site/personal",
        fetcher,
      }),
    ).resolves.toEqual(tree);
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

  it("reads matching embedded initial tree data", () => {
    const tree = sitePageTree("blog/shipping-schema-backed-authoring");
    const scriptText = initialTreeScriptText(tree);

    expect(
      readInitialSitePageTree("blog/shipping-schema-backed-authoring", fakeDocument(scriptText)),
    ).toEqual(tree);
    expect(readInitialSitePageTree("blog/other", fakeDocument(scriptText))).toBeUndefined();
  });

  it("escapes embedded initial tree data so content cannot close the script", () => {
    const homeTree = sitePageTree("home");
    const tree = {
      ...homeTree,
      page: {
        ...homeTree.page,
        label: 'Hostile </script><script type="module">alert(1)</script> & text',
      },
    };
    const scriptText = initialTreeScriptText(tree);

    expect(scriptText).not.toContain("</script");
    expect(scriptText).not.toContain("<script");
    expect(scriptText).toContain("\\u003C/script\\u003E\\u003Cscript");
    expect(scriptText).toContain("\\u0026 text");
    expect(readInitialSitePageTree("home", fakeDocument(scriptText))).toEqual(tree);
  });

  it("starts published Site sessions from embedded tree data without a duplicate fetch", () => {
    const tree = sitePageTree("home");
    const states: SitePageRouteState[] = [];
    let fetched = false;
    let startedPreviewSync = false;
    let listenedForPreviewChanges = false;

    const stop = startSitePageRouteSession({
      fetcher: async () => {
        fetched = true;
        return Response.json(tree);
      },
      initialTree: tree,
      linkMode: "published",
      listenForPreviewChanges: () => {
        listenedForPreviewChanges = true;
        return () => {};
      },
      onState: (state) => states.push(state),
      slug: "home",
      startPreviewSync: () => {
        startedPreviewSync = true;
        return () => {};
      },
    });

    stop();

    expect(states).toEqual([{ status: "ready", tree }]);
    expect(fetched).toBe(false);
    expect(startedPreviewSync).toBe(false);
    expect(listenedForPreviewChanges).toBe(false);
  });
});

function initialTreeScriptText(tree: SitePageTreeResponse): string {
  const script = renderInitialSitePageTreeScript(tree);
  const start = script.indexOf(">") + 1;
  const end = script.lastIndexOf("</script>");

  return script.slice(start, end);
}

function fakeDocument(textContent: string) {
  return {
    getElementById: (id: string) =>
      id === INITIAL_SITE_PAGE_TREE_SCRIPT_ID ? { textContent } : null,
  };
}

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
