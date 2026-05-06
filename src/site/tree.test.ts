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
      title: "Home",
      slug: "home",
      templateKey: "home",
    });

    const header = childForPlacement(tree.page, "header", "rec_site_place_home_header");
    expect(header).toMatchObject({
      id: "rec_site_content_group_header",
      type: "group",
      title: "Header",
    });
    expect(header.placements.map((placement) => placement.block.title)).toEqual([
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
      "/pages/home",
      "/pages/blog",
      "/pages/projects",
      "/pages/resume",
    ]);

    const footer = childForPlacement(tree.page, "footer", "rec_site_place_home_footer");
    expect(footer.title).toBe("Footer");
    expect(footer.placements.map((placement) => placement.block.title)).toEqual([
      "Explore",
      "Social",
    ]);
    const explore = childForPlacement(footer, "footer", "rec_site_place_footer_section_explore");
    const social = childForPlacement(footer, "footer", "rec_site_place_footer_section_social");
    expect(explore.placements.map((placement) => placement.slot)).toEqual(["link", "link"]);
    expect(explore.placements.map((placement) => placement.block.title)).toEqual([
      "Projects",
      "Resume",
    ]);
    expect(explore.placements.map((placement) => placement.block.type)).toEqual(["link", "link"]);
    expect(social.placements.map((placement) => placement.slot)).toEqual(["link", "link"]);
    expect(social.placements.map((placement) => placement.block.title)).toEqual([
      "GitHub",
      "LinkedIn",
    ]);
    expect(social.placements.map((placement) => placement.block.type)).toEqual(["link", "link"]);

    const mainBlocks = tree.page.placements
      .filter((placement) => placement.slot === "main")
      .map((placement) => placement.block);
    expect(mainBlocks.map((block) => block.title)).toEqual([
      "Schema-backed software for content-heavy products",
      "Recent posts",
      "Featured projects",
    ]);

    const hero = childForPlacement(tree.page, "main", "rec_site_place_home_hero");
    const heroImage = childForPlacement(hero, "media", "rec_site_place_home_hero_image");
    const heroVideo = childForPlacement(hero, "media", "rec_site_place_home_hero_video");
    expect(heroImage).toMatchObject({
      id: "rec_site_media_avatar",
      type: "image",
      assetKey: "site-owner-portrait",
      alt: "Portrait of the site owner",
      width: 1200,
      height: 1200,
    });
    expect(heroVideo).toMatchObject({
      id: "rec_site_media_intro_video",
      type: "video",
      href: "https://example.com/intro.mp4",
      assetKey: "site-intro-video",
      alt: "Short introduction video for the site owner",
      width: 1920,
      height: 1080,
    });

    const recentPosts = childForPlacement(tree.page, "main", "rec_site_place_home_recent_posts");
    expect(recentPosts.query).toMatchObject({
      key: "publishedPosts",
      items: [{ title: "Shipping schema-backed authoring" }],
    });
    expect(recentPosts.query?.items.map((item) => item.title)).not.toContain(
      "Draft notes on generated editorial tools",
    );

    const featuredProjects = childForPlacement(tree.page, "main", "rec_site_place_home_projects");
    expect(featuredProjects.query?.key).toBe("featuredProjects");
    expect(featuredProjects.query?.items.map((item) => item.title)).toEqual([
      "Estii",
      "OpenSurf",
      "Formless",
    ]);
  });

  it("filters invisible placements from the projected tree", () => {
    const records = [
      ...baseTreeRecords(),
      placementRecord(
        "rec_site_place_invisible_resume",
        "rec_site_content_home",
        "rec_site_content_resume",
        {
          visible: false,
        },
      ),
    ];

    const tree = requireTree(buildSitePageTree(siteSourceSchema, records, "home", { generatedAt }));

    expect(flattenPlacementIds(tree.page)).not.toContain("rec_site_place_invisible_resume");
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
      { slot: "cycle" },
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
    const hero = childForPlacement(tree.page, "main", "rec_site_place_home_hero");

    expect(hero.placements).toEqual([]);
    expect(result.meta.warnings).toEqual([
      expect.objectContaining({
        code: "max-depth",
        recordId: "rec_site_content_group_footer",
      }),
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
    const recentPosts = childForPlacement(tree.page, "main", "rec_site_place_home_recent_posts");

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

  it("skips non-public roots and returns null when no published root matches", () => {
    const draftRoot = blockRecord("rec_site_content_draft_only", {
      type: "page",
      title: "Draft only",
      slug: "draft-only",
      status: "draft",
      featured: false,
    });
    const result = buildSitePageTree(
      siteSourceSchema,
      [...siteSeedRecords, draftRoot],
      "draft-only",
      {
        generatedAt,
      },
    );

    expect(result.tree).toBeNull();
    expect(result.meta.warnings).toEqual([
      expect.objectContaining({
        code: "skipped-root",
        recordId: "rec_site_content_draft_only",
      }),
      expect.objectContaining({
        code: "missing-root",
        recordId: "draft-only",
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
    slot?: string;
    order?: number;
    visible?: boolean;
    variant?: string;
    label?: string;
  } = {},
): StoredRecord {
  return {
    id,
    entity: "blockPlacement",
    values: {
      parent,
      block,
      slot: options.slot ?? "main",
      order: options.order ?? 99,
      visible: options.visible ?? true,
      variant: options.variant ?? "fixture",
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

function childForPlacement(
  parent: SiteBlockNode,
  slot: string,
  placementId: string,
): SiteBlockNode {
  const placement = parent.placements.find(
    (candidate) => candidate.slot === slot && candidate.id === placementId,
  );

  if (!placement) {
    throw new Error(`Missing placement "${placementId}" in slot "${slot}".`);
  }

  return placement.block;
}

function flattenPlacementIds(node: SiteBlockNode): string[] {
  return node.placements.flatMap((placement) => [
    placement.id,
    ...flattenPlacementIds(placement.block),
  ]);
}
