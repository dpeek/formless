import type {
  SiteBlockNode,
  SitePageTree,
  SitePublicRendererProps,
} from "@dpeek/formless-site-app";
import { describe, expect, it } from "vite-plus/test";

import {
  publicSiteStructuralLayoutFixtures,
  type PublicSiteStructuralLayoutFixture,
  type PublicSiteStructuralLayoutFixtureId,
} from "./public-site-structural.ts";
import { collectSiteFixtureNodes } from "./public-site.ts";

describe("canonical public Site structural layout fixtures", () => {
  it("covers page flow, nested groups, hero variants, feature directions and actions, sections, cards, metrics, and markdown", () => {
    const fixtures: readonly PublicSiteStructuralLayoutFixture[] =
      publicSiteStructuralLayoutFixtures;
    const dense = requiredFixture("dense");
    const deeplyNested = requiredFixture("deeply-nested");
    const allBlocks = fixtures.flatMap(
      ({ rendererProps }) => collectSiteFixtureNodes(rendererProps.tree).blocks,
    );

    expect(dense.rendererProps.tree.page.placements.map(({ block }) => block.type)).toEqual([
      "hero",
      "feature",
      "feature",
      "section",
      "markdown",
    ]);

    const heroes = allBlocks.filter(({ type }) => type === "hero");
    expect(heroes).toHaveLength(2);
    expect(heroes.map(hasImagePlacement)).toEqual(expect.arrayContaining([false, true]));

    const features = collectSiteFixtureNodes(dense.rendererProps.tree).blocks.filter(
      ({ type }) => type === "feature",
    );
    expect(features.map(({ alignment }) => alignment)).toEqual(["left", "right"]);
    expect(features.every((feature) => hasSlottedPlacement(feature, "media", "image"))).toBe(true);
    expect(features.every((feature) => hasSlottedPlacement(feature, "actions", "link"))).toBe(true);

    const denseBlocks = collectSiteFixtureNodes(dense.rendererProps.tree).blocks;
    const sections = denseBlocks.filter(({ type }) => type === "section");
    expect(sections.some((section) => hasDescendantType(section, "section"))).toBe(true);

    const cardGrid = requiredBlock(denseBlocks, "cardGrid");
    const cards = cardGrid.placements.map(({ block }) => block);
    expect(cards.map(({ type }) => type)).toEqual(["card", "card", "card"]);
    expect(cards.map(({ icon }) => Boolean(icon))).toEqual([true, false, true]);

    const metricGrid = requiredBlock(denseBlocks, "metricGrid");
    expect(metricGrid.placements.map(({ block }) => block.type)).toEqual([
      "metric",
      "metric",
      "metric",
    ]);
    expect(denseBlocks.some(({ type }) => type === "markdown")).toBe(true);
    expect(
      collectSiteFixtureNodes(deeplyNested.rendererProps.tree).blocks.filter(
        ({ type }) => type === "group",
      ),
    ).toHaveLength(3);
  });

  it("covers empty, minimal, dense, deeply nested, and unknown-block states with canonical data only", () => {
    expect(publicSiteStructuralLayoutFixtures.map(({ id }) => id)).toEqual([
      "empty",
      "minimal",
      "dense",
      "deeply-nested",
      "unknown-block",
    ]);

    const empty = requiredFixture("empty");
    const minimal = requiredFixture("minimal");
    const dense = requiredFixture("dense");
    const deeplyNested = requiredFixture("deeply-nested");
    const unknownBlock = requiredFixture("unknown-block");

    expect(empty.rendererProps.tree.page).toMatchObject({ placements: [], type: "page" });
    expect(empty.rendererProps.tree.page).not.toHaveProperty("body");
    expect(
      collectSiteFixtureNodes(minimal.rendererProps.tree).blocks.map(({ type }) => type),
    ).toEqual(["page", "hero"]);
    expect(collectSiteFixtureNodes(dense.rendererProps.tree).blocks.length).toBeGreaterThan(15);
    expect(maxPlacementDepth(deeplyNested.rendererProps.tree.page)).toBe(7);
    expect(
      collectSiteFixtureNodes(unknownBlock.rendererProps.tree).blocks.map(({ type }) => type),
    ).toEqual(["page", "markdown", "interactiveAgenda", "group", "markdown"]);

    for (const fixture of publicSiteStructuralLayoutFixtures) {
      assertCanonicalFixture(fixture);
    }
  });
});

function requiredFixture(
  id: PublicSiteStructuralLayoutFixtureId,
): PublicSiteStructuralLayoutFixture {
  const fixture = publicSiteStructuralLayoutFixtures.find((candidate) => candidate.id === id);
  if (!fixture) {
    throw new Error(`Missing public Site structural fixture: ${id}`);
  }
  return fixture;
}

function requiredBlock(blocks: SiteBlockNode[], type: string): SiteBlockNode {
  const block = blocks.find((candidate) => candidate.type === type);
  if (!block) {
    throw new Error(`Missing public Site structural block: ${type}`);
  }
  return block;
}

function hasImagePlacement(block: SiteBlockNode): boolean {
  return block.placements.some(({ block: child }) => child.type === "image");
}

function hasSlottedPlacement(block: SiteBlockNode, slot: string, type: string): boolean {
  return block.placements.some(
    ({ block: child, slot: placementSlot }) => placementSlot === slot && child.type === type,
  );
}

function hasDescendantType(block: SiteBlockNode, type: string): boolean {
  return block.placements.some(
    ({ block: child }) => child.type === type || hasDescendantType(child, type),
  );
}

function maxPlacementDepth(block: SiteBlockNode): number {
  return 1 + Math.max(0, ...block.placements.map(({ block: child }) => maxPlacementDepth(child)));
}

function assertCanonicalFixture(fixture: PublicSiteStructuralLayoutFixture): void {
  const rendererProps: SitePublicRendererProps = fixture.rendererProps;
  const tree: SitePageTree = rendererProps.tree;
  const { blocks, placements } = collectSiteFixtureNodes(tree);
  const serialized = JSON.stringify(fixture);
  const ids = [
    ...(tree.site ? [tree.site.id] : []),
    ...blocks.map(({ id }) => id),
    ...placements.map(({ id }) => id),
  ];

  expect(Object.keys(rendererProps).sort()).toEqual(["linkMode", "routeBase", "tree"]);
  expect(rendererProps).toMatchObject({
    linkMode: "installed",
    routeBase: "/sites/common-ground",
  });
  expect(tree.route).toEqual({ kind: "page", slug: `structural-${fixture.id}` });
  expect(tree.frame).toEqual({ header: undefined, footer: undefined });
  expect(tree.meta.warnings).toEqual([]);
  expect(structuredClone(fixture)).toEqual(fixture);
  expect(JSON.parse(serialized)).toEqual(fixture);
  expect(new Set(ids).size).toBe(ids.length);
  expect(
    blocks.every((block) =>
      block.placements.every(
        (placement, index) => index === 0 || block.placements[index - 1]!.order < placement.order,
      ),
    ),
  ).toBe(true);
  expect(serialized).not.toMatch(
    /"(?:values|createdAt|deletedAt|schema|records|replica|runtimeQuery|providerCredentials|turnstileSecret|className)"\s*:/,
  );
  expect(blocks.every(({ publicOperation, query }) => !publicOperation && !query)).toBe(true);
}
