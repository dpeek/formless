import type {
  SiteBlockNode,
  SitePageTree,
  SitePlacementNode,
  SitePublicRendererProps,
} from "@dpeek/formless-site-app";
import { profileAwareSiteHref } from "@dpeek/formless-site-app";
import { describe, expect, it } from "vite-plus/test";

import {
  publicSiteContentLayoutFixtures,
  type PublicSiteContentLayoutFixture,
  type PublicSiteContentLayoutFixtureId,
} from "./public-site-content.ts";
import { collectSiteFixtureNodes } from "./public-site.ts";

describe("canonical public Site route, list, and detail layout fixtures", () => {
  it("covers home, normal page, post index, post detail, and project index layouts", () => {
    expect(publicSiteContentLayoutFixtures.map(({ id }) => id)).toEqual([
      "home",
      "normal-page",
      "post-index-populated",
      "post-index-empty",
      "post-detail",
      "project-index-populated",
      "project-index-empty",
    ]);

    expect(routeOf("home")).toEqual({ kind: "page", slug: "home" });
    expect(routeOf("normal-page")).toEqual({ kind: "page", slug: "practice" });
    expect(routeOf("post-index-populated")).toEqual({
      kind: "post-index",
      slug: "blog",
      postCount: 2,
    });
    expect(routeOf("post-index-empty")).toEqual({
      kind: "post-index",
      slug: "blog",
      postCount: 0,
    });
    expect(routeOf("post-detail")).toEqual({
      kind: "post",
      slug: "blog/smallest-useful-test",
    });
    expect(routeOf("project-index-populated")).toEqual({ kind: "page", slug: "projects" });
    expect(routeOf("project-index-empty")).toEqual({ kind: "page", slug: "projects" });

    expect(
      new Set(
        publicSiteContentLayoutFixtures.map(({ rendererProps }) => rendererProps.tree.route?.kind),
      ),
    ).toEqual(new Set(["page", "post-index", "post"]));
    expect(requiredFixture("post-detail").rendererProps.tree.page.type).toBe("post");
    expect(requiredFixture("project-index-populated").rendererProps.tree.page.type).toBe("page");
  });

  it("uses only current post-list and project-list query shapes", () => {
    const queries = publicSiteContentLayoutFixtures.flatMap((fixture) =>
      collectSiteFixtureNodes(fixture.rendererProps.tree).blocks.flatMap((block) =>
        block.query
          ? [
              {
                layoutId: fixture.id,
                blockType: block.type,
                key: block.query.key,
                itemTypes: block.query.items.map(({ type }) => type),
                queryKeys: Object.keys(block.query).sort(),
              },
            ]
          : [],
      ),
    );

    expect(queries).toEqual([
      {
        layoutId: "post-index-populated",
        blockType: "postList",
        key: "postList",
        itemTypes: ["post", "post"],
        queryKeys: ["items", "key"],
      },
      {
        layoutId: "post-index-empty",
        blockType: "postList",
        key: "postList",
        itemTypes: [],
        queryKeys: ["items", "key"],
      },
      {
        layoutId: "project-index-populated",
        blockType: "projectList",
        key: "projectList",
        itemTypes: ["project", "project"],
        queryKeys: ["items", "key"],
      },
      {
        layoutId: "project-index-empty",
        blockType: "projectList",
        key: "projectList",
        itemTypes: [],
        queryKeys: ["items", "key"],
      },
    ]);
  });

  it("covers populated and empty lists plus summaries with and without media", () => {
    for (const [populatedId, emptyId, listType] of [
      ["post-index-populated", "post-index-empty", "postList"],
      ["project-index-populated", "project-index-empty", "projectList"],
    ] as const) {
      const populated = onlyBlockOfType(requiredFixture(populatedId), listType);
      const empty = onlyBlockOfType(requiredFixture(emptyId), listType);
      const summaries = populated.query?.items ?? [];

      expect(summaries).toHaveLength(2);
      expect(empty.query?.items).toEqual([]);
      expect(summaries.map((summary) => primaryImagePlacement(summary) !== undefined)).toEqual([
        true,
        false,
      ]);
      expect(
        summaries.every((summary) =>
          summary.placements.every(
            (placement) => placement.slot === "primaryImage" && placement.block.type === "image",
          ),
        ),
      ).toBe(true);
    }

    const interactiveProject = onlyBlockOfType(
      requiredFixture("project-index-populated"),
      "projectList",
    ).query?.items[0];
    expect(interactiveProject?.href).toBe("https://example.com/case-studies/service-library");
    expect(interactiveProject?.body).toContain(
      "[public reference](https://example.com/reference/service-map)",
    );
  });

  it("keeps post summary copy separate from ordered post-detail body placements", () => {
    const post = requiredFixture("post-detail").rendererProps.tree.page;

    expect(post).toMatchObject({
      type: "post",
      body: "A summary shown in lists but omitted from the article body.",
    });
    expect(post.placements.map(({ slot, block }) => [slot, block.type])).toEqual([
      ["primaryImage", "image"],
      [undefined, "markdown"],
    ]);
    expect(post.placements[1]?.block.body).toContain("[practice notes](/pages/practice)");
  });

  it("covers installed route-base hrefs without adding route state to the tree", () => {
    const normalPage = requiredFixture("normal-page");
    const postIndex = requiredFixture("post-index-populated");
    const postDetail = requiredFixture("post-detail");
    const projectIndex = requiredFixture("project-index-populated");
    const journalLink = onlyBlockOfType(normalPage, "link");
    const firstPost = onlyBlockOfType(postIndex, "postList").query?.items[0];

    for (const fixture of [normalPage, postIndex, postDetail, projectIndex]) {
      expect(fixture.rendererProps).toMatchObject({
        linkMode: "installed",
        routeBase: "/sites/field-notes",
      });
      expect(fixture.rendererProps.tree).not.toHaveProperty("routeBase");
      expect(fixture.rendererProps.tree).not.toHaveProperty("currentPath");
    }

    expect(
      profileAwareSiteHref(
        journalLink.href!,
        normalPage.rendererProps.linkMode,
        normalPage.rendererProps.routeBase,
      ),
    ).toBe("/sites/field-notes/blog");
    expect(
      profileAwareSiteHref(
        firstPost!.href!,
        postIndex.rendererProps.linkMode,
        postIndex.rendererProps.routeBase,
      ),
    ).toBe("/sites/field-notes/blog/smallest-useful-test");
  });

  it("keeps every layout canonical, serializable, unique, and runtime-independent", () => {
    for (const fixture of publicSiteContentLayoutFixtures) {
      assertCanonicalFixture(fixture);
    }
  });
});

function requiredFixture(id: PublicSiteContentLayoutFixtureId): PublicSiteContentLayoutFixture {
  const fixture = publicSiteContentLayoutFixtures.find((candidate) => candidate.id === id);
  if (!fixture) {
    throw new Error(`Missing public Site content fixture: ${id}`);
  }
  return fixture;
}

function routeOf(id: PublicSiteContentLayoutFixtureId) {
  return requiredFixture(id).rendererProps.tree.route;
}

function onlyBlockOfType(fixture: PublicSiteContentLayoutFixture, type: string): SiteBlockNode {
  const blocks = collectSiteFixtureNodes(fixture.rendererProps.tree).blocks.filter(
    (block) => block.type === type,
  );
  expect(blocks).toHaveLength(1);
  return blocks[0]!;
}

function primaryImagePlacement(block: SiteBlockNode): SitePlacementNode | undefined {
  return block.placements.find(
    (placement) => placement.slot === "primaryImage" && placement.block.type === "image",
  );
}

function assertCanonicalFixture(fixture: PublicSiteContentLayoutFixture): void {
  const rendererProps: SitePublicRendererProps = fixture.rendererProps;
  const tree: SitePageTree = rendererProps.tree;
  const { blocks, placements } = collectSiteFixtureNodes(tree);
  const serialized = JSON.stringify(fixture);
  const ids = [
    ...(tree.site ? [tree.site.id] : []),
    ...blocks.map(({ id }) => id),
    ...placements.map(({ id }) => id),
  ];

  expect(Object.keys(rendererProps).sort()).toEqual(
    rendererProps.routeBase === undefined
      ? ["linkMode", "tree"]
      : ["linkMode", "routeBase", "tree"],
  );
  expect(tree.meta.warnings).toEqual([]);
  expect(structuredClone(fixture)).toEqual(fixture);
  expect(JSON.parse(serialized)).toEqual(fixture);
  expect(new Set(ids).size).toBe(ids.length);
  expect(serialized).not.toMatch(
    /"(?:appTarget|browserLocation|createdAt|deletedAt|executeQuery|history|location|pathname|projection|queryClient|records|replica|router|runtimeQuery|schema|searchParams|storageRecord|values|window)"\s*:/,
  );
}
