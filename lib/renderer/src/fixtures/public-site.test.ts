import { describe, expect, it } from "vite-plus/test";
import type {
  SiteBlockNode,
  SitePageTree,
  SitePlacementNode,
  SitePublicRendererProps,
} from "@dpeek/formless-site-app";

import { publicSitePageFixture } from "./public-site-page.ts";
import {
  collectSiteFixtureNodes,
  publicSitePageTreeFixture,
  publicSiteRendererPropsFixture,
} from "./public-site.ts";

describe("canonical public Site fixtures", () => {
  it("covers canonical settings, frames, blocks, placements, queries, media, warnings, routes, and public operations", () => {
    const tree: SitePageTree = publicSitePageTreeFixture;
    const rendererProps: SitePublicRendererProps = publicSiteRendererPropsFixture;
    const { blocks, placements } = collectSiteFixtureNodes(tree);

    expect(rendererProps).toEqual({
      tree,
      linkMode: "installed",
      routeBase: "/sites/astryx",
    });
    expect(tree.site).toMatchObject({
      id: "settings-astryx-studio",
      label: "Astryx Studio",
      icon: expect.stringContaining("<svg"),
    });
    expect(tree.frame.header?.type).toBe("header");
    expect(tree.frame.footer?.type).toBe("footer");
    expect(blocks.some((block) => block.type === "page")).toBe(true);
    expect(placements.some((placement) => placement.slot === "primaryImage")).toBe(true);
    expect(blocks.find((block) => block.query)?.query).toMatchObject({
      key: "postList",
      items: [{ type: "post" }],
    });
    expect(blocks.find((block) => block.media)?.media).toMatchObject({
      assetId: expect.any(String),
      href: expect.stringMatching(/^\/media\//),
      kind: "image",
    });
    expect(tree.meta.warnings).toEqual([
      expect.objectContaining({
        code: "publicOperationUnavailable",
        recordId: "block-form-archive",
      }),
    ]);
    expect(tree.route).toEqual({ kind: "page", slug: "home" });
    expect(
      blocks
        .flatMap((block) => (block.publicOperation ? [block.publicOperation] : []))
        .map((operation) => operation.target?.kind),
    ).toEqual(expect.arrayContaining(["schemaKey", "appInstall"]));
    expect(new Set(nodeIds(tree, blocks, placements)).size).toBe(
      nodeIds(tree, blocks, placements).length,
    );
  });

  it("keeps canonical renderer props free of fixture session state", () => {
    const { rendererProps } = publicSitePageFixture;
    const serializedProps = JSON.stringify(rendererProps);

    expect(Object.keys(publicSitePageFixture)).toEqual(["rendererProps"]);
    expect(Object.keys(rendererProps).sort()).toEqual(["linkMode", "routeBase", "tree"]);
    expect(rendererProps).not.toHaveProperty("currentPath");
    expect(rendererProps).not.toHaveProperty("formStates");
    expect(rendererProps.tree).not.toHaveProperty("linkMode");
    expect(rendererProps.tree).not.toHaveProperty("routeBase");
    expect(structuredClone(rendererProps)).toEqual(rendererProps);
    expect(JSON.parse(serializedProps)).toEqual(rendererProps);
    expect(serializedProps).not.toMatch(
      /"(?:values|createdAt|deletedAt|schema|records|replica|providerCredentials|turnstileSecret)"\s*:/,
    );
  });
});

function nodeIds(
  tree: SitePageTree,
  blocks: SiteBlockNode[],
  placements: SitePlacementNode[],
): string[] {
  return [
    ...(tree.site ? [tree.site.id] : []),
    ...blocks.map((block) => block.id),
    ...placements.map((placement) => placement.id),
  ];
}
