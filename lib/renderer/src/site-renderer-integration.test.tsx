import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  FormlessSitePageRenderer,
  FormlessSiteSystemStateRenderer,
} from "@dpeek/formless-renderer/site/renderer";
import type {
  SitePageTree,
  SitePublicRendererComponent,
  SitePublicSystemStateRendererComponent,
} from "@dpeek/formless-site-app";
import {
  INITIAL_SITE_PAGE_TREE_SCRIPT_ID,
  SitePageRoute,
  SitePageRouteView,
} from "@dpeek/formless-site-app/react";
import { renderPublishedSiteDocumentResponse } from "@dpeek/formless-site-app/worker";

import { publicSiteStructuralLayoutFixtures } from "./fixtures/public-site-structural.ts";

vi.mock("@stylexjs/stylex", () => ({
  create: <Styles,>(styles: Styles) => styles,
  createTheme: () => ({}),
  props: () => ({}),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("production Formless Renderer public Site integration", () => {
  it("satisfies the canonical page and system-state renderer contracts", () => {
    const pageRenderer: SitePublicRendererComponent = FormlessSitePageRenderer;
    const systemStateRenderer: SitePublicSystemStateRendererComponent =
      FormlessSiteSystemStateRenderer;
    const tree = siteTree();

    const readyHtml = renderToString(
      <SitePageRouteView
        builtInRenderer={pageRenderer}
        builtInSystemStateRenderer={systemStateRenderer}
        linkMode="installed"
        routeBase="/sites/renderer"
        state={{ status: "ready", tree }}
      />,
    );
    const loadingHtml = renderToString(
      <SitePageRouteView
        builtInRenderer={pageRenderer}
        builtInSystemStateRenderer={systemStateRenderer}
        state={{ status: "loading", slug: "home" }}
      />,
    );
    const notFoundHtml = renderToString(
      <SitePageRouteView
        builtInRenderer={pageRenderer}
        builtInSystemStateRenderer={systemStateRenderer}
        state={{ status: "not-found", slug: "missing" }}
      />,
    );
    const failureHtml = renderToString(
      <SitePageRouteView
        builtInRenderer={pageRenderer}
        builtInSystemStateRenderer={systemStateRenderer}
        state={{ status: "error", message: "Display-safe failure.", slug: "home" }}
      />,
    );

    expect(readyHtml).toContain("data-astryx-public-site-provider");
    expect(readyHtml).toContain(tree.page.label);
    expect(loadingHtml).toContain("data-astryx-public-site-provider");
    expect(loadingHtml).toContain('data-site-system-state="loading"');
    expect(notFoundHtml).toContain("data-astryx-public-site-provider");
    expect(notFoundHtml).toContain('data-site-system-state="not-found"');
    expect(failureHtml).toContain("data-astryx-public-site-provider");
    expect(failureHtml).toContain('data-site-system-state="failure"');
  });

  it("preserves workspace renderer precedence over the built-in Formless Renderer", () => {
    const WorkspaceRenderer: SitePublicRendererComponent = (props) => (
      <div data-workspace-site-renderer>{props.tree.meta.slug}</div>
    );
    const html = renderToString(
      <SitePageRouteView
        builtInRenderer={FormlessSitePageRenderer}
        builtInSystemStateRenderer={FormlessSiteSystemStateRenderer}
        linkMode="published"
        state={{ status: "ready", tree: siteTree() }}
        workspaceRenderer={WorkspaceRenderer}
      />,
    );

    expect(html).toContain("data-workspace-site-renderer");
    expect(html).not.toContain("data-astryx-public-site-provider");
  });

  it("renders page and system-state bodies through the Worker document harness", async () => {
    const tree = siteTree();
    const foundResponse = await renderPublishedDocument({ kind: "found", tree });
    const notFoundResponse = await renderPublishedDocument({ kind: "not-found" });
    const failureResponse = await renderPublishedDocument({ kind: "error" });
    const foundHtml = await foundResponse.text();
    const notFoundHtml = await notFoundResponse.text();
    const failureHtml = await failureResponse.text();

    expect(foundResponse.status).toBe(200);
    expect(foundHtml).toContain("data-astryx-public-site-provider");
    expect(foundHtml).toContain(`id="${INITIAL_SITE_PAGE_TREE_SCRIPT_ID}"`);
    expect(notFoundResponse.status).toBe(404);
    expect(notFoundHtml).toContain("data-astryx-public-site-provider");
    expect(notFoundHtml).toContain('data-site-system-state="not-found"');
    expect(failureResponse.status).toBe(500);
    expect(failureHtml).toContain("data-astryx-public-site-provider");
    expect(failureHtml).toContain('data-site-system-state="failure"');
  });

  it("matches Worker SSR from the published initial tree on the hydration-first render", async () => {
    const tree = siteTree();
    const response = await renderPublishedDocument({ kind: "found", tree });
    const documentHtml = await response.text();
    const initialTreeText = initialTreeScriptText(documentHtml);

    vi.stubGlobal("document", {
      getElementById: (id: string) =>
        id === INITIAL_SITE_PAGE_TREE_SCRIPT_ID ? { textContent: initialTreeText } : null,
    });

    const hydrationHtml = renderToString(
      <main style={{ minHeight: "100dvh" }}>
        <SitePageRoute
          builtInRenderer={FormlessSitePageRenderer}
          builtInSystemStateRenderer={FormlessSiteSystemStateRenderer}
          linkMode="published"
          slug={tree.meta.slug}
        />
      </main>,
    );

    expect(hydrationHtml).toBe(publishedAppHtml(documentHtml));
    expect(hydrationHtml).toContain('data-site-theme="light"');
  });
});

function siteTree(): SitePageTree {
  const fixture = publicSiteStructuralLayoutFixtures.find(({ id }) => id === "minimal");

  if (!fixture) {
    throw new Error("Missing minimal public Site renderer fixture.");
  }

  return fixture.rendererProps.tree;
}

function renderPublishedDocument(
  treeResult: { kind: "found"; tree: SitePageTree } | { kind: "not-found" } | { kind: "error" },
) {
  return renderPublishedSiteDocumentResponse({
    builtInRenderer: FormlessSitePageRenderer,
    builtInSystemStateRenderer: FormlessSiteSystemStateRenderer,
    clientAssets: { body: "", head: "" },
    requestUrl: new URL("https://renderer.example/structural-minimal"),
    treeResult,
  });
}

function initialTreeScriptText(documentHtml: string): string {
  const match = documentHtml.match(
    new RegExp(
      `<script id="${INITIAL_SITE_PAGE_TREE_SCRIPT_ID}" type="application/json">([\\s\\S]*?)</script>`,
    ),
  );

  if (!match?.[1]) {
    throw new Error("Missing initial public Site tree script.");
  }

  return match[1];
}

function publishedAppHtml(documentHtml: string): string {
  const startMarker = '<div id="app">';
  const scriptMarker = `<script id="${INITIAL_SITE_PAGE_TREE_SCRIPT_ID}"`;
  const start = documentHtml.indexOf(startMarker);
  const scriptStart = documentHtml.indexOf(scriptMarker, start);
  const appRegion = documentHtml.slice(start + startMarker.length, scriptStart);
  const end = appRegion.lastIndexOf("</div>");

  if (start < 0 || scriptStart < 0 || end < 0) {
    throw new Error("Missing published public Site app markup.");
  }

  return appRegion.slice(0, end);
}
