import { describe, expect, it } from "vite-plus/test";
import type { SiteBlockNode, SitePageTree } from "./types.ts";
import { buildPublicDocumentMetadata } from "./public-document-metadata.ts";

describe("public document metadata", () => {
  it("prefers Site settings label and description", () => {
    const metadata = buildPublicDocumentMetadata({
      kind: "success",
      requestUrl: new URL("https://example.com/projects?preview=1"),
      tree: sitePageTree("projects", {
        body: "Page body fallback.",
        label: "Projects",
        siteDescription: "  Authored   Site description.  ",
        siteLabel: "Authored Site",
      }),
    });

    expect(metadata).toMatchObject({
      canonicalUrl: "https://example.com/projects",
      description: "Authored Site description.",
      siteName: "Authored Site",
      title: "Projects | Authored Site",
    });
  });

  it("uses the Site settings label for the home title", () => {
    const metadata = buildPublicDocumentMetadata({
      kind: "success",
      requestUrl: new URL("https://example.com/"),
      tree: sitePageTree("home", {
        label: "Home",
        siteLabel: "Authored Site",
      }),
    });

    expect(metadata.title).toBe("Authored Site");
    expect(metadata.siteName).toBe("Authored Site");
  });

  it("falls back to header and page metadata when settings are missing", () => {
    const metadata = buildPublicDocumentMetadata({
      kind: "success",
      requestUrl: new URL("https://example.com/home"),
      tree: sitePageTree("home", {
        body: "Fallback **page** body.",
        headerLabel: "Header Site",
        label: "Home",
      }),
    });

    expect(metadata).toMatchObject({
      description: "Fallback page body.",
      siteName: "Header Site",
      title: "Header Site",
    });
  });
});

function sitePageTree(
  slug: string,
  options: {
    body?: string;
    headerLabel?: string;
    label: string;
    siteDescription?: string;
    siteLabel?: string;
  },
): SitePageTree {
  return {
    ...(options.siteLabel
      ? {
          site: {
            id: "rec_site_settings_primary",
            label: options.siteLabel,
            ...(options.siteDescription ? { description: options.siteDescription } : {}),
          },
        }
      : {}),
    page: {
      id: `rec_site_page_${slug}`,
      type: "page",
      label: options.label,
      ...(options.body ? { body: options.body } : {}),
      placements: [],
    },
    frame: options.headerLabel ? { header: headerBlock(options.headerLabel) } : {},
    meta: {
      slug,
      generatedAt: "2026-05-18T00:00:00.000Z",
      warnings: [],
    },
    route: {
      kind: "page",
      slug,
    },
  };
}

function headerBlock(label: string): SiteBlockNode {
  return {
    id: "rec_site_content_group_header",
    type: "header",
    label: "Header",
    placements: [
      {
        id: "rec_site_place_header_home",
        order: 1000,
        block: {
          id: "rec_site_content_link_home",
          type: "link",
          label,
          placements: [],
        },
      },
    ],
  };
}
