import { describe, expect, it } from "vite-plus/test";
import { siteSourceSchema } from "../test/schema-apps.ts";
import { testSiteSeedRecords } from "../test/site-records.ts";
import type { StoredRecord } from "../shared/protocol.ts";
import {
  buildSitePageTree,
  type SiteBlockNode,
  type SitePageTree,
  type SitePageTreeProjection,
} from "./tree.ts";

const generatedAt = "2026-05-06T00:00:00.000Z";

describe("site page tree projection", () => {
  it("projects home into a framed public tree with content groups and media blocks", () => {
    const result = buildSitePageTree(siteSourceSchema, baseTreeRecords(), "home", { generatedAt });
    const tree = requireTree(result);

    expect(tree.meta).toEqual({
      slug: "home",
      generatedAt,
      warnings: [],
    });
    expect(tree.route).toEqual({
      kind: "page",
      slug: "home",
    });
    expect(tree.page).toMatchObject({
      id: "rec_site_content_home",
      type: "page",
      label: "Home",
      href: "/",
    });
    expect(tree.page).not.toHaveProperty("templateKey");

    expect(tree.page.placements.map((placement) => placement.id)).toEqual([
      "rec_site_place_home_hero",
      "rec_site_place_home_recent_posts",
      "rec_site_place_home_projects",
    ]);

    const header = requireBlock(tree.frame.header, "header");
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

    const footer = requireBlock(tree.frame.footer, "footer");
    expect(footer.label).toBe("Footer");
    expect(footer.placements.map((placement) => placement.block.label)).toEqual([
      "Explore",
      "Social",
    ]);
    expect(footer.placements.map((placement) => placement.block.type)).toEqual([
      "footerSection",
      "footerSocial",
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
    expect(social.placements.map((placement) => placement.block.icon)).toEqual([
      expect.stringContaining("<svg"),
      expect.stringContaining("<svg"),
    ]);

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
    expect(heroImage).toMatchObject({
      id: "rec_site_media_avatar",
      type: "image",
      label: "Site owner portrait",
      href: expect.stringContaining("data:image/svg+xml"),
      width: 1200,
      height: 1200,
    });

    const recentPosts = childForPlacement(tree.page, "rec_site_place_home_recent_posts");
    expect(recentPosts.type).toBe("group");
    expect(recentPosts.query).toBeUndefined();
    expect(recentPosts.placements.map((placement) => placement.block.label)).toEqual([
      "Shipping schema-backed authoring",
      "Draft notes on generated editorial tools",
    ]);

    const projectList = childForPlacement(tree.page, "rec_site_place_home_projects");
    expect(projectList.type).toBe("group");
    expect(projectList.query).toBeUndefined();
    expect(projectList.placements.map((placement) => placement.block.label)).toEqual([
      "Estii",
      "OpenSurf",
      "Formless",
    ]);
  });

  it("projects uploaded-style image hrefs through the existing block shape", () => {
    const records = baseTreeRecords().map((record) =>
      record.id === "rec_site_media_avatar"
        ? {
            ...record,
            values: {
              ...record.values,
              href: "/api/site/media/site/images/avatar.webp",
            },
          }
        : record,
    );
    const tree = requireTree(buildSitePageTree(siteSourceSchema, records, "home", { generatedAt }));
    const hero = childForPlacement(tree.page, "rec_site_place_home_hero");
    const heroImage = childForPlacement(hero, "rec_site_place_home_hero_image");

    expect(heroImage).toEqual({
      id: "rec_site_media_avatar",
      type: "image",
      label: "Site owner portrait",
      href: "/api/site/media/site/images/avatar.webp",
      width: 1200,
      height: 1200,
      placements: [],
    });
  });

  it("keeps legacy link href strings unchanged in the public tree", () => {
    const records = baseTreeRecords().map((record) => {
      if (record.id === "rec_site_content_link_blog") {
        return {
          ...record,
          values: {
            ...record.values,
            href: "/pages/blog?draft=1#intro",
          },
        };
      }

      if (record.id === "rec_site_content_link_github") {
        return {
          ...record,
          values: {
            ...record.values,
            href: "https://example.com/profile?tab=links#top",
          },
        };
      }

      return record;
    });

    const tree = requireTree(buildSitePageTree(siteSourceSchema, records, "home", { generatedAt }));
    const header = requireBlock(tree.frame.header, "header");
    const blog = childForPlacement(header, "rec_site_place_header_blog");
    const footer = requireBlock(tree.frame.footer, "footer");
    const social = childForPlacement(footer, "rec_site_place_footer_section_social");
    const github = childForPlacement(social, "rec_site_place_footer_github");

    expect(blog.href).toBe("/pages/blog?draft=1#intro");
    expect(github.href).toBe("https://example.com/profile?tab=links#top");
    expect(tree.meta.warnings).toEqual([]);
  });

  it("resolves explicit internal links through target block hrefs in the public tree", () => {
    const records = baseTreeRecords().map((record) => {
      if (record.id === "rec_site_content_blog") {
        return {
          ...record,
          values: {
            ...record.values,
            href: "/writing",
          },
        };
      }

      if (record.id === "rec_site_content_link_blog") {
        return {
          ...record,
          values: {
            ...record.values,
            linkTargetMode: "internal",
            linkTargetBlock: "rec_site_content_blog",
            href: "/stale-blog",
          },
        };
      }

      return record;
    });

    records.push(
      blockRecord("rec_site_content_link_shipping", {
        type: "link",
        label: "Shipping",
        linkTargetMode: "internal",
        linkTargetBlock: "rec_site_content_post_shipped_schema",
        href: "/stale-post",
      }),
      placementRecord(
        "rec_site_place_home_shipping_link",
        "rec_site_content_home",
        "rec_site_content_link_shipping",
        { order: 50 },
      ),
    );

    const tree = requireTree(buildSitePageTree(siteSourceSchema, records, "home", { generatedAt }));
    const header = requireBlock(tree.frame.header, "header");
    const blog = childForPlacement(header, "rec_site_place_header_blog");
    const shipping = childForPlacement(tree.page, "rec_site_place_home_shipping_link");

    expect(blog.href).toBe("/writing");
    expect(shipping.href).toBe("/blog/shipping-schema-backed-authoring");
    expect(blog).not.toHaveProperty("linkTargetMode");
    expect(blog).not.toHaveProperty("linkTargetBlock");
    expect(tree.meta.warnings).toEqual([]);
  });

  it("warns and omits hrefs for broken explicit internal link targets", () => {
    const records = baseTreeRecords().map((record) => {
      if (record.id !== "rec_site_content_link_blog") {
        return record;
      }

      return {
        ...record,
        values: {
          ...record.values,
          linkTargetMode: "internal",
          linkTargetBlock: "rec_site_missing_blog",
          href: "/legacy-blog",
        },
      };
    });

    const tree = requireTree(buildSitePageTree(siteSourceSchema, records, "home", { generatedAt }));
    const header = requireBlock(tree.frame.header, "header");
    const blog = childForPlacement(header, "rec_site_place_header_blog");

    expect(blog.href).toBeUndefined();
    expect(tree.meta.warnings).toEqual([
      expect.objectContaining({
        code: "missing-link-target",
        recordId: "rec_site_content_link_blog",
      }),
    ]);
  });

  it("validates explicit external link hrefs in the public tree", () => {
    const records = baseTreeRecords().map((record) => {
      if (record.id === "rec_site_content_link_github") {
        return {
          ...record,
          values: {
            ...record.values,
            linkTargetMode: "external",
            href: "/not-external",
          },
        };
      }

      if (record.id === "rec_site_content_link_linkedin") {
        return {
          ...record,
          values: {
            ...record.values,
            linkTargetMode: "external",
            href: "https://example.com/profile?tab=links#top",
          },
        };
      }

      return record;
    });

    const tree = requireTree(buildSitePageTree(siteSourceSchema, records, "home", { generatedAt }));
    const footer = requireBlock(tree.frame.footer, "footer");
    const social = childForPlacement(footer, "rec_site_place_footer_section_social");
    const github = childForPlacement(social, "rec_site_place_footer_github");
    const linkedIn = childForPlacement(social, "rec_site_place_footer_linkedin");

    expect(github.href).toBeUndefined();
    expect(linkedIn.href).toBe("https://example.com/profile?tab=links#top");
    expect(tree.meta.warnings).toEqual([
      expect.objectContaining({
        code: "invalid-external-link",
        recordId: "rec_site_content_link_github",
      }),
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
        recordId: "rec_site_content_group_footer_main",
      }),
      expect.objectContaining({
        code: "max-depth",
        recordId: "rec_site_content_group_footer_social",
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

  it("warns when Site frame roots are missing", () => {
    const records = baseTreeRecords().filter(
      (record) =>
        !(
          record.entity === "block" &&
          (record.values.type === "header" || record.values.type === "footer")
        ),
    );

    const tree = requireTree(buildSitePageTree(siteSourceSchema, records, "home", { generatedAt }));

    expect(tree.frame).toEqual({});
    expect(tree.meta.warnings).toEqual([
      expect.objectContaining({
        code: "missing-frame-root",
        recordId: "header",
      }),
      expect.objectContaining({
        code: "missing-frame-root",
        recordId: "footer",
      }),
    ]);
  });

  it("chooses frame roots deterministically and warns about duplicates", () => {
    const records = [
      ...baseTreeRecords(),
      blockRecord("rec_site_content_group_header_later", {
        type: "header",
        label: "Later header",
      }),
      blockRecord("rec_site_content_group_footer_later", {
        type: "footer",
        label: "Later footer",
      }),
    ];

    const tree = requireTree(buildSitePageTree(siteSourceSchema, records, "home", { generatedAt }));

    expect(tree.frame.header?.id).toBe("rec_site_content_group_header");
    expect(tree.frame.footer?.id).toBe("rec_site_content_group_footer");
    expect(tree.meta.warnings).toEqual([
      expect.objectContaining({
        code: "skipped-frame-root",
        recordId: "rec_site_content_group_header_later",
      }),
      expect.objectContaining({
        code: "skipped-frame-root",
        recordId: "rec_site_content_group_footer_later",
      }),
    ]);
  });

  it("resolves /blog as a generated post index", () => {
    const tree = requireTree(
      buildSitePageTree(siteSourceSchema, baseTreeRecords(), "blog", { generatedAt }),
    );

    expect(tree.route).toEqual({
      kind: "post-index",
      slug: "blog",
      postCount: 2,
    });
    expect(tree.page).toMatchObject({
      id: "rec_site_content_blog",
      type: "page",
      label: "Blog",
      href: "/blog",
    });
    expect(tree.page.placements.map((placement) => placement.id)).toEqual([
      "generated_site_post_index_rec_site_content_post_draft_notes",
      "generated_site_post_index_rec_site_content_post_shipped_schema",
    ]);
    expect(tree.page.placements.map((placement) => placement.block.id)).toEqual([
      "rec_site_content_post_draft_notes",
      "rec_site_content_post_shipped_schema",
    ]);
  });

  it("resolves post detail routes under /blog", () => {
    const tree = requireTree(
      buildSitePageTree(
        siteSourceSchema,
        baseTreeRecords(),
        "blog/shipping-schema-backed-authoring",
        {
          generatedAt,
        },
      ),
    );

    expect(tree.route).toEqual({
      kind: "post",
      slug: "blog/shipping-schema-backed-authoring",
    });
    expect(tree.page).toMatchObject({
      id: "rec_site_content_post_shipped_schema",
      type: "post",
      label: "Shipping schema-backed authoring",
      href: "/blog/shipping-schema-backed-authoring",
    });
    expect(tree.page.placements.map((placement) => placement.id)).toEqual([
      "rec_site_place_post_body",
      "rec_site_place_post_profile",
    ]);
  });

  it("projects manually placed project summaries on /projects", () => {
    const tree = requireTree(
      buildSitePageTree(siteSourceSchema, baseTreeRecords(), "projects", { generatedAt }),
    );

    expect(tree.route).toEqual({
      kind: "page",
      slug: "projects",
    });
    expect(tree.page).toMatchObject({
      id: "rec_site_content_projects",
      type: "page",
      label: "Projects",
      href: "/projects",
    });
    expect(tree.page.placements.map((placement) => placement.id)).toEqual([
      "rec_site_place_projects_estii",
      "rec_site_place_projects_opensurf",
      "rec_site_place_projects_formless",
    ]);
    expect(tree.page.placements.map((placement) => placement.block.type)).toEqual([
      "project",
      "project",
      "project",
    ]);
    expect(tree.page.placements.map((placement) => placement.block.href)).toEqual([
      "/projects/estii",
      "/projects/opensurf",
      "/projects/formless",
    ]);
    expect(tree.page.placements[0]?.block.body).toBe(
      "Estii helps teams turn **operational assumptions** into clear, reusable [pricing structures](https://estii.com).",
    );
  });

  it("omits tombstoned posts from the generated blog index", () => {
    const records = baseTreeRecords().map((record) =>
      record.id === "rec_site_content_post_draft_notes"
        ? { ...record, deletedAt: "2026-05-06T00:00:00.000Z" }
        : record,
    );
    const tree = requireTree(buildSitePageTree(siteSourceSchema, records, "blog", { generatedAt }));

    expect(tree.route).toEqual({
      kind: "post-index",
      slug: "blog",
      postCount: 1,
    });
    expect(tree.page.placements.map((placement) => placement.block.id)).toEqual([
      "rec_site_content_post_shipped_schema",
    ]);
  });

  it("returns null when no page href matches the route", () => {
    const unmatchedRoot = blockRecord("rec_site_content_unmatched", {
      type: "page",
      label: "Unmatched",
      href: "/elsewhere",
    });
    const result = buildSitePageTree(
      siteSourceSchema,
      [...testSiteSeedRecords, unmatchedRoot],
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
  return testSiteSeedRecords;
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

function requireBlock(block: SiteBlockNode | undefined, label: string): SiteBlockNode {
  if (!block) {
    throw new Error(`Missing ${label} block.`);
  }

  return block;
}

function flattenPlacementIds(node: SiteBlockNode): string[] {
  return node.placements.flatMap((placement) => [
    placement.id,
    ...flattenPlacementIds(placement.block),
  ]);
}
