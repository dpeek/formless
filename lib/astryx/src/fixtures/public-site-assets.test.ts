import type {
  SiteBlockNode,
  SitePageTree,
  SitePublicRendererProps,
} from "@dpeek/formless-site-app";
import {
  profileAwareSiteHref,
  siteHrefMatchesRoute,
  siteLinkRel,
  siteLinkTarget,
} from "@dpeek/formless-site-app";
import { describe, expect, it } from "vite-plus/test";

import {
  publicSiteLinkIconLayoutFixtures,
  publicSiteMediaLayoutFixtures,
  type PublicSiteLinkIconLayoutFixture,
  type PublicSiteLinkIconLayoutFixtureId,
  type PublicSiteMediaLayoutFixture,
  type PublicSiteMediaLayoutFixtureId,
} from "./public-site-assets.ts";
import { collectSiteFixtureNodes } from "./public-site.ts";

describe("canonical public Site link and source-icon layout fixtures", () => {
  it("covers every public link mode, route-base form, and target state", () => {
    expect(publicSiteLinkIconLayoutFixtures.map(({ id }) => id)).toEqual([
      "preview",
      "authoring",
      "published",
      "published-mounted",
      "installed",
    ]);

    const cases = [
      ["preview", "preview", undefined, "/pages/work"],
      ["authoring", "authoring", undefined, "/work"],
      ["published", "published", undefined, "/work"],
      ["published-mounted", "published", "/campaign", "/work"],
      ["installed", "installed", "/sites/field-notes", "/sites/field-notes/work"],
    ] as const;

    for (const [id, linkMode, routeBase, expectedActiveHref] of cases) {
      const fixture = requiredLinkIconFixture(id);
      const links = blocksOfType(fixture.rendererProps.tree, "link");
      const activeInternal = requiredBlock(links, "Work");
      const inactiveInternal = requiredBlock(links, "Contact");
      const fragment = requiredBlock(links, "Approach");
      const external = requiredBlock(links, "Reference library");
      const missingTarget = requiredBlock(links, "Unscheduled event");

      expect(fixture.rendererProps.linkMode).toBe(linkMode);
      expect(fixture.rendererProps.routeBase).toBe(routeBase);
      expect(profileAwareSiteHref(activeInternal.href!, linkMode, routeBase)).toBe(
        expectedActiveHref,
      );
      expect(
        siteHrefMatchesRoute(expectedActiveHref, fixture.rendererProps.tree.route?.slug, routeBase),
      ).toBe(true);
      expect(
        siteHrefMatchesRoute(
          profileAwareSiteHref(inactiveInternal.href!, linkMode, routeBase),
          fixture.rendererProps.tree.route?.slug,
          routeBase,
        ),
      ).toBe(false);
      expect(profileAwareSiteHref(fragment.href!, linkMode, routeBase)).toBe("#approach");
      expect(profileAwareSiteHref(external.href!, linkMode, routeBase)).toBe(
        "https://example.com/reference-library",
      );
      expect(siteLinkTarget(external.href!)).toBe("_blank");
      expect(siteLinkRel(external.href!)).toBe("noreferrer");
      expect(missingTarget).not.toHaveProperty("href");
      assertCanonicalFixture(fixture);
    }
  });

  it("covers valid, missing, invalid, and unsafe public source SVG values", () => {
    for (const fixture of publicSiteLinkIconLayoutFixtures) {
      const cards = blocksOfType(fixture.rendererProps.tree, "card");
      const valid = requiredBlock(cards, "Valid source icon");
      const missing = requiredBlock(cards, "Missing source icon");
      const invalid = requiredBlock(cards, "Invalid source icon");
      const unsafe = requiredBlock(cards, "Unsafe source icon");

      expect(valid.icon).toMatch(/^<svg[\s\S]*<\/svg>$/);
      expect(valid.icon).not.toMatch(/script|foreignObject|onload/i);
      expect(missing).not.toHaveProperty("icon");
      expect(invalid.icon).toBe('<svg viewBox="0 0 24 24"><path');
      expect(unsafe.icon).toContain("<foreignObject>");
      expect(unsafe.icon).not.toMatch(/script|onload|javascript:/i);
    }
  });
});

describe("canonical public Site media layout fixtures", () => {
  it("covers delivered, missing, sized, and default-ratio images", () => {
    expect(publicSiteMediaLayoutFixtures.map(({ id }) => id)).toEqual([
      "delivered",
      "missing",
      "sized",
      "default-ratio",
      "feature",
      "summary",
      "post-detail",
    ]);

    const delivered = onlyBlockOfType(requiredMediaFixture("delivered"), "image");
    const missing = onlyBlockOfType(requiredMediaFixture("missing"), "image");
    const sized = onlyBlockOfType(requiredMediaFixture("sized"), "image");
    const defaultRatio = onlyBlockOfType(requiredMediaFixture("default-ratio"), "image");

    expect(delivered.media).toEqual({
      assetId: "asset-fixture-delivered",
      href: "/media/fixtures/delivered/public/workshop.webp",
      kind: "image",
    });
    expect(missing).not.toHaveProperty("media");
    expect(sized).toMatchObject({ width: 1600, height: 900 });
    expect(defaultRatio.media).toMatchObject({ assetId: "asset-fixture-default-ratio" });
    expect(defaultRatio).not.toHaveProperty("width");
    expect(defaultRatio).not.toHaveProperty("height");
  });

  it("keeps feature, summary, and post-detail media in canonical semantic slots", () => {
    const feature = onlyBlockOfType(requiredMediaFixture("feature"), "feature");
    const summaryList = onlyBlockOfType(requiredMediaFixture("summary"), "postList");
    const summary = summaryList.query?.items[0];
    const postDetail = requiredMediaFixture("post-detail");

    expect(feature.placements).toEqual([
      expect.objectContaining({ slot: "media", block: expect.objectContaining({ type: "image" }) }),
    ]);
    expect(summary).toMatchObject({
      type: "post",
      placements: [
        expect.objectContaining({
          slot: "primaryImage",
          block: expect.objectContaining({
            media: expect.objectContaining({ assetId: "asset-fixture-summary" }),
          }),
        }),
      ],
    });
    expect(postDetail.rendererProps.tree.route).toEqual({
      kind: "post",
      slug: "notes/learning-from-the-hand-off",
    });
    expect(postDetail.rendererProps.tree.page.type).toBe("post");
    expect(postDetail.rendererProps.tree.page.placements.map(({ slot }) => slot)).toEqual([
      "primaryImage",
      undefined,
    ]);

    for (const fixture of publicSiteMediaLayoutFixtures) {
      assertCanonicalFixture(fixture);
      for (const block of collectSiteFixtureNodes(fixture.rendererProps.tree).blocks) {
        if (block.media) {
          expect(block.media.href).toMatch(/^\/media\/fixtures\//);
          expect(block.media.href).not.toMatch(/^https?:\/\//);
          expect(Object.keys(block.media).sort()).toEqual(["assetId", "href", "kind"]);
        }
      }
    }
  });
});

function requiredLinkIconFixture(
  id: PublicSiteLinkIconLayoutFixtureId,
): PublicSiteLinkIconLayoutFixture {
  const fixture = publicSiteLinkIconLayoutFixtures.find((candidate) => candidate.id === id);
  if (!fixture) {
    throw new Error(`Missing public Site link and icon fixture: ${id}`);
  }
  return fixture;
}

function requiredMediaFixture(id: PublicSiteMediaLayoutFixtureId): PublicSiteMediaLayoutFixture {
  const fixture = publicSiteMediaLayoutFixtures.find((candidate) => candidate.id === id);
  if (!fixture) {
    throw new Error(`Missing public Site media fixture: ${id}`);
  }
  return fixture;
}

function requiredBlock(blocks: SiteBlockNode[], label: string): SiteBlockNode {
  const block = blocks.find((candidate) => candidate.label === label);
  if (!block) {
    throw new Error(`Missing public Site fixture block: ${label}`);
  }
  return block;
}

function onlyBlockOfType(fixture: PublicSiteMediaLayoutFixture, type: string): SiteBlockNode {
  const blocks = blocksOfType(fixture.rendererProps.tree, type);
  expect(blocks).toHaveLength(1);
  return blocks[0]!;
}

function blocksOfType(tree: SitePageTree, type: string): SiteBlockNode[] {
  return collectSiteFixtureNodes(tree).blocks.filter((block) => block.type === type);
}

function assertCanonicalFixture(
  fixture: PublicSiteLinkIconLayoutFixture | PublicSiteMediaLayoutFixture,
): void {
  const rendererProps: SitePublicRendererProps = fixture.rendererProps;
  const tree: SitePageTree = rendererProps.tree;
  const { blocks, placements } = collectSiteFixtureNodes(tree);
  const serialized = JSON.stringify(fixture);
  const ids = [
    ...(tree.site ? [tree.site.id] : []),
    ...blocks.map(({ id }) => id),
    ...placements.map(({ id }) => id),
  ];

  expect(
    Object.keys(rendererProps).every((key) => ["linkMode", "routeBase", "tree"].includes(key)),
  ).toBe(true);
  expect(rendererProps).not.toHaveProperty("currentPath");
  expect(rendererProps.tree).not.toHaveProperty("linkMode");
  expect(rendererProps.tree).not.toHaveProperty("routeBase");
  expect(tree.meta.warnings).toEqual([]);
  expect(structuredClone(fixture)).toEqual(fixture);
  expect(JSON.parse(serialized)).toEqual(fixture);
  expect(new Set(ids).size).toBe(ids.length);
  expect(serialized).not.toMatch(
    /"(?:assetRecord|createdAt|deletedAt|mediaClient|providerCredentials|providerUrl|records|replica|runtimeQuery|schema|sourceRecord|storageRecord|uploadState|values)"\s*:/,
  );
}
