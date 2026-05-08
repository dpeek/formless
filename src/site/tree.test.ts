import { describe, expect, it } from "vite-plus/test";
import { siteSeedRecords, siteSourceSchema } from "../test/schema-apps.ts";
import type { StoredRecord } from "../shared/protocol.ts";
import {
  buildSitePageTree,
  type SiteBlockNode,
  type SitePageTree,
  type SitePageTreeProjection,
} from "./tree.ts";

const generatedAt = "2026-05-06T00:00:00.000Z";

describe("site page tree projection", () => {
  it("projects home into a nested public tree with shell, content, queries, and media blocks", () => {
    const result = buildSitePageTree(siteSourceSchema, baseTreeRecords(), "home", { generatedAt });
    const tree = requireTree(result);

    expect(tree.meta).toEqual({
      slug: "home",
      generatedAt,
      warnings: [],
    });
    expect(tree.page).toMatchObject({
      id: "rec_site_content_home",
      type: "page",
      label: "Home",
      href: "/",
      templateKey: "home",
    });

    expect(tree.page.placements.map((placement) => placement.id)).toEqual([
      "rec_site_place_home_header",
      "rec_site_place_home_hero",
      "rec_site_place_home_recent_posts",
      "rec_site_place_home_projects",
      "rec_site_place_home_footer",
    ]);
    const header = childForPlacement(tree.page, "rec_site_place_home_header");
    expect(header).toMatchObject({
      id: "rec_site_content_group_header",
      type: "header",
      label: "Header",
    });
    expect(header.placements.map((placement) => placement.block.label)).toEqual([
      "Home",
      "Blog",
      "Projects",
      "Resume",
    ]);
    expect(header.placements.map((placement) => placement.block.type)).toEqual([
      "link",
      "link",
      "link",
      "link",
    ]);
    expect(header.placements.map((placement) => placement.block.href)).toEqual([
      "/",
      "/blog",
      "/projects",
      "/resume",
    ]);

    const footer = childForPlacement(tree.page, "rec_site_place_home_footer");
    expect(footer.label).toBe("Footer");
    expect(footer.placements.map((placement) => placement.block.label)).toEqual([
      "Explore",
      "Social",
    ]);
    const explore = childForPlacement(footer, "rec_site_place_footer_section_explore");
    const social = childForPlacement(footer, "rec_site_place_footer_section_social");
    expect(explore.placements.map((placement) => placement.block.label)).toEqual([
      "Projects",
      "Resume",
    ]);
    expect(explore.placements.map((placement) => placement.block.type)).toEqual(["link", "link"]);
    expect(social.placements.map((placement) => placement.block.label)).toEqual([
      "GitHub",
      "LinkedIn",
    ]);
    expect(social.placements.map((placement) => placement.block.type)).toEqual(["link", "link"]);

    const mainBlocks = [
      childForPlacement(tree.page, "rec_site_place_home_hero"),
      childForPlacement(tree.page, "rec_site_place_home_recent_posts"),
      childForPlacement(tree.page, "rec_site_place_home_projects"),
    ];
    expect(mainBlocks.map((block) => block.label)).toEqual([
      "Schema-backed software for content-heavy products",
      "Recent posts",
      "Featured projects",
    ]);

    const hero = childForPlacement(tree.page, "rec_site_place_home_hero");
    const heroImage = childForPlacement(hero, "rec_site_place_home_hero_image");
    const heroVideo = childForPlacement(hero, "rec_site_place_home_hero_video");
    expect(heroImage).toMatchObject({
      id: "rec_site_media_avatar",
      type: "image",
      label: "Site owner portrait",
      href: expect.stringContaining("data:image/svg+xml"),
      width: 1200,
      height: 1200,
    });
    expect(heroVideo).toMatchObject({
      id: "rec_site_media_intro_video",
      type: "video",
      label: "Intro video",
      href: "https://example.com/intro.mp4",
      width: 1920,
      height: 1080,
    });

    const recentPosts = childForPlacement(tree.page, "rec_site_place_home_recent_posts");
    expect(recentPosts.query).toMatchObject({
      key: "blockPosts",
      items: [
        { label: "Shipping schema-backed authoring" },
        { label: "Draft notes on generated editorial tools" },
      ],
    });

    const projectList = childForPlacement(tree.page, "rec_site_place_home_projects");
    expect(projectList.query?.key).toBe("blockProjects");
    expect(projectList.query?.items.map((item) => item.label)).toEqual([
      "Estii",
      "OpenSurf",
      "Formless",
    ]);
  });

  it("renders every live placement", () => {
    const records = [
      ...baseTreeRecords(),
      placementRecord(
        "rec_site_place_live_resume",
        "rec_site_content_home",
        "rec_site_content_resume",
      ),
    ];

    const tree = requireTree(buildSitePageTree(siteSourceSchema, records, "home", { generatedAt }));

    expect(flattenPlacementIds(tree.page)).toContain("rec_site_place_live_resume");
  });

  it("warns and skips missing child block references", () => {
    const missingPlacement = placementRecord(
      "rec_site_place_missing_child",
      "rec_site_content_home",
      "rec_site_missing_block",
    );
    const result = buildSitePageTree(
      siteSourceSchema,
      [...baseTreeRecords(), missingPlacement],
      "home",
      {
        generatedAt,
      },
    );
    const tree = requireTree(result);

    expect(result.meta.warnings).toEqual([
      expect.objectContaining({
        code: "missing-child-block",
        recordId: "rec_site_place_missing_child",
      }),
    ]);
    expect(flattenPlacementIds(tree.page)).not.toContain("rec_site_place_missing_child");
  });

  it("warns and stops cyclic placement recursion", () => {
    const cyclePlacement = placementRecord(
      "rec_site_place_hero_cycle_home",
      "rec_site_block_home_hero",
      "rec_site_content_home",
    );
    const result = buildSitePageTree(
      siteSourceSchema,
      [...baseTreeRecords(), cyclePlacement],
      "home",
      {
        generatedAt,
      },
    );
    const tree = requireTree(result);

    expect(result.meta.warnings).toEqual([
      expect.objectContaining({
        code: "cycle",
        recordId: "rec_site_place_hero_cycle_home",
      }),
    ]);
    expect(flattenPlacementIds(tree.page)).not.toContain("rec_site_place_hero_cycle_home");
  });

  it("warns and stops traversal at the max depth", () => {
    const result = buildSitePageTree(siteSourceSchema, baseTreeRecords(), "home", {
      generatedAt,
      maxDepth: 1,
    });
    const tree = requireTree(result);
    const hero = childForPlacement(tree.page, "rec_site_place_home_hero");

    expect(hero.placements).toEqual([]);
    expect(result.meta.warnings).toEqual([
      expect.objectContaining({
        code: "max-depth",
        recordId: "rec_site_content_group_header",
      }),
      expect.objectContaining({
        code: "max-depth",
        recordId: "rec_site_block_home_hero",
      }),
      expect.objectContaining({
        code: "max-depth",
        recordId: "rec_site_block_home_recent_posts",
      }),
      expect.objectContaining({
        code: "max-depth",
        recordId: "rec_site_block_home_projects",
      }),
      expect.objectContaining({
        code: "max-depth",
        recordId: "rec_site_content_group_footer",
      }),
    ]);
  });

  it("warns and returns empty query items for bad query keys", () => {
    const records = baseTreeRecords().map((record) =>
      record.id === "rec_site_block_home_recent_posts"
        ? {
            ...record,
            values: {
              ...record.values,
              templateKey: "missingQuery",
            },
          }
        : record,
    );
    const result = buildSitePageTree(siteSourceSchema, records, "home", { generatedAt });
    const tree = requireTree(result);
    const recentPosts = childForPlacement(tree.page, "rec_site_place_home_recent_posts");

    expect(result.meta.warnings).toEqual([
      expect.objectContaining({
        code: "bad-query-key",
        recordId: "rec_site_block_home_recent_posts",
      }),
    ]);
    expect(recentPosts.query).toEqual({
      key: "missingQuery",
      items: [],
    });
  });

  it("returns null when no page href matches the route", () => {
    const unmatchedRoot = blockRecord("rec_site_content_unmatched", {
      type: "page",
      label: "Unmatched",
      href: "/elsewhere",
    });
    const result = buildSitePageTree(
      siteSourceSchema,
      [...siteSeedRecords, unmatchedRoot],
      "missing-page",
      {
        generatedAt,
      },
    );

    expect(result.tree).toBeNull();
    expect(result.meta.warnings).toEqual([
      expect.objectContaining({
        code: "missing-root",
        recordId: "missing-page",
      }),
    ]);
  });
});

function baseTreeRecords(): StoredRecord[] {
  return siteSeedRecords;
}

function blockRecord(id: string, values: StoredRecord["values"]): StoredRecord {
  return {
    id,
    entity: "block",
    values,
    createdAt: "2026-05-06T00:00:00.000Z",
  };
}

function placementRecord(
  id: string,
  parent: string,
  block: string,
  options: {
    order?: number;
    label?: string;
  } = {},
): StoredRecord {
  return {
    id,
    entity: "blockPlacement",
    values: {
      parent,
      block,
      order: options.order ?? 99,
      label: options.label ?? id,
    },
    createdAt: "2026-05-06T00:00:00.000Z",
  };
}

function requireTree(result: SitePageTreeProjection): SitePageTree {
  if (!result.tree) {
    throw new Error("Expected a site page tree.");
  }

  return result.tree;
}

function childForPlacement(parent: SiteBlockNode, placementId: string): SiteBlockNode {
  const placement = parent.placements.find((candidate) => candidate.id === placementId);

  if (!placement) {
    throw new Error(`Missing placement "${placementId}".`);
  }

  return placement.block;
}

function flattenPlacementIds(node: SiteBlockNode): string[] {
  return node.placements.flatMap((placement) => [
    placement.id,
    ...flattenPlacementIds(placement.block),
  ]);
}
