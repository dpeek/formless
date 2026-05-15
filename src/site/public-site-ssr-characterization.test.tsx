import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { describe, expect, it } from "vite-plus/test";

import { App } from "../app.tsx";
import { createPublishedSiteRuntimeProfile } from "../app/runtime-profile.ts";
import {
  SitePageRoute,
  startSitePageRouteSession,
  type SitePageRouteState,
} from "../app/routes/site-page.tsx";
import { HomeRoute } from "../app/routes/home.tsx";
import { SchemaRoute } from "../app/routes/schema.tsx";
import type { SitePageTreeResponse } from "../shared/protocol.ts";

describe("public Site SSR characterization", () => {
  it("characterizes the current HTML shell as an empty SPA root", () => {
    const html = readRepoFile("../../index.html");

    expect(html).toContain('<div id="app"></div>');
    expect(html).toContain('<script type="module" src="/src/main.tsx"></script>');
    expect(html).toMatch(/<div id="app"><\/div>\s*<script type="module" src="\/src\/main\.tsx">/);
    expect(html).not.toContain("__FORMLESS_SITE_TREE__");
    expect(html).not.toContain("data-site-header");
  });

  it("characterizes the browser entry as hydrating SSR markup when present", () => {
    const entry = readRepoFile("../main.tsx");

    expect(entry).toContain('import { createRoot, hydrateRoot } from "react-dom/client";');
    expect(entry).toContain("if (app.hasChildNodes())");
    expect(entry).toContain("hydrateRoot(app, appTree);");
    expect(entry).toContain("createRoot(app).render(");
  });

  it("characterizes Cloudflare routing as Worker-first for API and published documents", () => {
    const wrangler = readRepoFile("../../wrangler.jsonc");

    expect(wrangler).toContain('"not_found_handling": "single-page-application"');
    expect(wrangler).toContain('"binding": "ASSETS"');
    expect(wrangler).toContain('"run_worker_first": [');
    expect(wrangler).toContain('"/*"');
    expect(wrangler).not.toContain('"/api/*"');
    expect(wrangler).toContain('"!/pages"');
    expect(wrangler).toContain('"!/pages/*"');
    expect(wrangler).toContain('"!/site"');
    expect(wrangler).toContain('"!/site/*"');
    expect(wrangler).toContain('"!/assets/*"');
    expect(wrangler).toContain('"!/src/*"');
    expect(wrangler).toContain('"!/favicon.svg"');
    expect(wrangler).toContain('"!/favicon.ico"');
    expect(wrangler).toContain('"!/apple-touch-icon.png"');
  });

  it("packages launch icon assets in the package-owned public directory", () => {
    const packageJson = JSON.parse(readRepoFile("../../package.json")) as { files?: string[] };

    expect(packageJson.files).toContain("public");
    expect(readRepoBinary("../../public/favicon.svg").byteLength).toBeGreaterThan(0);
    expect(readRepoBinary("../../public/favicon.ico").subarray(0, 4)).toEqual(
      Buffer.from([0, 0, 1, 0]),
    );
    expect(readRepoBinary("../../public/apple-touch-icon.png").subarray(0, 4)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
  });

  it("renders published Site document routes as loading shells before tree data arrives", () => {
    const homeHtml = renderPublishedRoute("/");
    const nestedHtml = renderPublishedRoute("/projects/estii");

    expect(homeHtml).toContain("Loading site page...");
    expect(homeHtml).toContain("Loading home.");
    expect(nestedHtml).toContain("Loading site page...");
    expect(nestedHtml).toContain("Loading projects/estii.");
    expect(homeHtml).not.toContain('data-frame="workbench"');
    expect(homeHtml).not.toContain('data-frame="generated-app"');
    expect(homeHtml).not.toContain("data-site-header");
    expect(nestedHtml).not.toContain('href="/site/schema"');
  });

  it("starts published Site page sessions with loading state and one public tree read", async () => {
    const fetchPaths: string[] = [];
    const states: SitePageRouteState[] = [];
    let resolveTree: ((response: Response) => void) | undefined;
    let startedPreviewSync = false;
    let listenedForPreviewChanges = false;

    const fetcher: typeof fetch = (input) => {
      fetchPaths.push(requestUrl(input));

      return new Promise<Response>((resolve) => {
        resolveTree = resolve;
      });
    };

    const stop = startSitePageRouteSession({
      fetcher,
      linkMode: "published",
      listenForPreviewChanges: () => {
        listenedForPreviewChanges = true;

        return () => {};
      },
      onState: (state) => states.push(state),
      slug: "/projects%2Festii",
      startPreviewSync: () => {
        startedPreviewSync = true;

        return () => {};
      },
    });

    try {
      expect(states).toEqual([{ status: "loading", slug: "projects/estii" }]);
      expect(fetchPaths).toEqual(["/api/site/tree/projects%2Festii"]);
      expect(startedPreviewSync).toBe(false);
      expect(listenedForPreviewChanges).toBe(false);

      resolveTree?.(Response.json(sitePageTree("projects/estii")));

      await waitFor(() => states.some((state) => state.status === "ready"));
      expect(states).toEqual([
        { status: "loading", slug: "projects/estii" },
        siteReadyState("projects/estii"),
      ]);
      expect(fetchPaths).toEqual(["/api/site/tree/projects%2Festii"]);
    } finally {
      stop();
    }
  });
});

function renderPublishedRoute(path: string): string {
  return renderToStaticMarkup(
    <Router ssrPath={path}>
      <App
        routeComponents={{ HomeRoute, SchemaRoute, SitePageRoute }}
        runtimeProfile={createPublishedSiteRuntimeProfile()}
      />
    </Router>,
  );
}

function readRepoFile(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function readRepoBinary(relativePath: string): Buffer {
  return readFileSync(new URL(relativePath, import.meta.url));
}

function requestUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.href : input.url;
}

function siteReadyState(slug: string): SitePageRouteState {
  return { status: "ready", tree: sitePageTree(slug) };
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
      generatedAt: "2026-05-13T00:00:00.000Z",
      warnings: [],
    },
    route: {
      kind: "page",
      slug,
    },
  };
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (condition()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error("Timed out waiting for expected public Site state.");
}
