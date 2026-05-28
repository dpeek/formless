import { describe, expect, it } from "vite-plus/test";
import { siteSourceSchema } from "../test/schema-apps.ts";
import { testSiteSeedRecords } from "../test/site-records.ts";
import { installedAppStorageIdentity } from "../shared/app-storage-identity.ts";
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
    expect(tree.site).toEqual({
      id: "rec_site_settings_primary",
      label: "Example Site",
      description: "A public test site.",
      icon: expect.stringContaining("<svg"),
      accentColor: "#C98A2E",
      backgroundColor: "#09090B",
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
      "Primary",
      "Secondary",
    ]);
    expect(header.placements.map((placement) => placement.block.type)).toEqual([
      "headerPrimary",
      "headerSecondary",
    ]);
    const primaryHeader = childForPlacement(header, "rec_site_place_header_primary");
    const secondaryHeader = childForPlacement(header, "rec_site_place_header_secondary");
    expect(primaryHeader.placements.map((placement) => placement.block.label)).toEqual(["Home"]);
    expect(primaryHeader.placements.map((placement) => placement.block.href)).toEqual(["/"]);
    expect(secondaryHeader.placements.map((placement) => placement.block.label)).toEqual([
      "Blog",
      "Projects",
      "Resume",
    ]);
    expect(secondaryHeader.placements.map((placement) => placement.block.href)).toEqual([
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

  it("projects manual image hrefs through the existing block shape", () => {
    const records = baseTreeRecords().map((record) =>
      record.id === "rec_site_media_avatar"
        ? {
            ...record,
            values: {
              ...record.values,
              href: "https://cdn.example.com/avatar.webp",
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
      href: "https://cdn.example.com/avatar.webp",
      width: 1200,
      height: 1200,
      placements: [],
    });
  });

  it("projects media asset ids into image delivery facts without requiring legacy hrefs", () => {
    const records = baseTreeRecords().map((record) => {
      if (record.id !== "rec_site_media_avatar") {
        return record;
      }

      const recordWithoutHref = withoutRecordValue(record, "href");

      return {
        ...recordWithoutHref,
        values: {
          ...recordWithoutHref.values,
          mediaAssetId: "avatar.webp",
        },
      };
    });
    const tree = requireTree(buildSitePageTree(siteSourceSchema, records, "home", { generatedAt }));
    const hero = childForPlacement(tree.page, "rec_site_place_home_hero");
    const heroImage = childForPlacement(hero, "rec_site_place_home_hero_image");

    expect(heroImage).toEqual({
      id: "rec_site_media_avatar",
      type: "image",
      label: "Site owner portrait",
      media: {
        assetId: "avatar.webp",
        href: "/api/formless/media/media/images/avatar.webp",
        kind: "image",
      },
      width: 1200,
      height: 1200,
      placements: [],
    });
  });

  it("keeps manual image href fallback alongside media asset ids", () => {
    const records = baseTreeRecords().map((record) =>
      record.id === "rec_site_media_avatar"
        ? {
            ...record,
            values: {
              ...record.values,
              href: "https://cdn.example.com/manual-avatar.webp",
              mediaAssetId: "avatar.webp",
            },
          }
        : record,
    );
    const tree = requireTree(buildSitePageTree(siteSourceSchema, records, "home", { generatedAt }));
    const hero = childForPlacement(tree.page, "rec_site_place_home_hero");
    const heroImage = childForPlacement(hero, "rec_site_place_home_hero_image");

    expect(heroImage.href).toBe("https://cdn.example.com/manual-avatar.webp");
    expect(heroImage.media).toEqual({
      assetId: "avatar.webp",
      href: "/api/formless/media/media/images/avatar.webp",
      kind: "image",
    });
  });

  it("projects placement slots and feature alignment without changing default placements", () => {
    const records = [
      ...baseTreeRecords(),
      blockRecord("rec_site_block_feature", {
        type: "feature",
        label: "Featured writing",
        body: "A reusable editorial block.",
        alignment: "right",
      }),
      blockRecord("rec_site_media_feature", {
        type: "image",
        label: "Feature image",
        href: "/manual/images/feature.webp",
        width: 1600,
        height: 900,
      }),
      placementRecord(
        "rec_site_place_home_feature",
        "rec_site_content_home",
        "rec_site_block_feature",
        {
          order: 900,
        },
      ),
      placementRecord(
        "rec_site_place_feature_media",
        "rec_site_block_feature",
        "rec_site_media_feature",
        {
          order: 100,
          slot: "media",
        },
      ),
      placementRecord(
        "rec_site_place_feature_action",
        "rec_site_block_feature",
        "rec_site_content_link_projects",
        {
          order: 200,
          slot: "actions",
        },
      ),
    ];

    const tree = requireTree(buildSitePageTree(siteSourceSchema, records, "home", { generatedAt }));
    const featurePlacement = tree.page.placements.find(
      (placement) => placement.id === "rec_site_place_home_feature",
    );
    const feature = childForPlacement(tree.page, "rec_site_place_home_feature");

    expect(featurePlacement).not.toHaveProperty("slot");
    expect(feature).toMatchObject({
      id: "rec_site_block_feature",
      type: "feature",
      label: "Featured writing",
      body: "A reusable editorial block.",
      alignment: "right",
    });
    expect(feature.placements.map((placement) => [placement.id, placement.slot])).toEqual([
      ["rec_site_place_feature_media", "media"],
      ["rec_site_place_feature_action", "actions"],
    ]);
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
    const secondaryHeader = childForPlacement(header, "rec_site_place_header_secondary");
    const blog = childForPlacement(secondaryHeader, "rec_site_place_header_blog");
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
    const secondaryHeader = childForPlacement(header, "rec_site_place_header_secondary");
    const blog = childForPlacement(secondaryHeader, "rec_site_place_header_blog");
    const shipping = childForPlacement(tree.page, "rec_site_place_home_shipping_link");

    expect(blog.href).toBe("/writing");
    expect(shipping.href).toBe("/blog/shipping-schema-backed-authoring");
    expect(blog).not.toHaveProperty("linkTargetMode");
    expect(blog).not.toHaveProperty("linkTargetBlock");
    expect(tree.meta.warnings).toEqual([]);
  });

  it("projects internal link icons from target blocks unless the link has its own icon", () => {
    const targetIcon = '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>';
    const linkIcon = '<svg viewBox="0 0 24 24"><path d="M12 4l8 16H4z"/></svg>';
    const records = baseTreeRecords().map((record) => {
      if (record.id === "rec_site_content_projects") {
        return {
          ...record,
          values: {
            ...record.values,
            icon: targetIcon,
          },
        };
      }

      if (record.id === "rec_site_content_link_resume") {
        return {
          ...record,
          values: {
            ...record.values,
            linkTargetMode: "internal",
            linkTargetBlock: "rec_site_content_resume",
            icon: linkIcon,
          },
        };
      }

      if (record.id === "rec_site_content_link_projects") {
        return {
          ...record,
          values: {
            ...record.values,
            linkTargetMode: "internal",
            linkTargetBlock: "rec_site_content_projects",
          },
        };
      }

      return record;
    });

    const tree = requireTree(buildSitePageTree(siteSourceSchema, records, "home", { generatedAt }));
    const footer = requireBlock(tree.frame.footer, "footer");
    const explore = childForPlacement(footer, "rec_site_place_footer_section_explore");
    const projects = childForPlacement(explore, "rec_site_place_footer_projects");
    const resume = childForPlacement(explore, "rec_site_place_footer_resume");

    expect(projects.icon).toBe(targetIcon);
    expect(resume.icon).toBe(linkIcon);
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
    const secondaryHeader = childForPlacement(header, "rec_site_place_header_secondary");
    const blog = childForPlacement(secondaryHeader, "rec_site_place_header_blog");

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
        recordId: "rec_site_content_group_header_primary",
      }),
      expect.objectContaining({
        code: "max-depth",
        recordId: "rec_site_content_group_header_secondary",
      }),
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

  it("warns and keeps rendering when the Site settings singleton is missing", () => {
    const records = baseTreeRecords().filter((record) => record.entity !== "site");
    const tree = requireTree(buildSitePageTree(siteSourceSchema, records, "home", { generatedAt }));

    expect(tree).not.toHaveProperty("site");
    expect(tree.page).toMatchObject({
      id: "rec_site_content_home",
      type: "page",
      label: "Home",
    });
    expect(tree.meta.warnings).toEqual([
      expect.objectContaining({
        code: "missing-site-settings",
        recordId: "site",
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

  it("resolves /blog as a regular page with a projected post list", () => {
    const tree = requireTree(
      buildSitePageTree(siteSourceSchema, recordsWithBlogPostList(), "blog", { generatedAt }),
    );

    expect(tree.route).toEqual({
      kind: "page",
      slug: "blog",
    });
    expect(tree.page).toMatchObject({
      id: "rec_site_content_blog",
      type: "page",
      label: "Blog",
      href: "/blog",
    });
    expect(tree.page.placements.map((placement) => placement.id)).toEqual([
      "rec_site_place_blog_posts",
    ]);
    const postList = childForPlacement(tree.page, "rec_site_place_blog_posts");
    expect(postList).toMatchObject({
      id: "rec_site_block_blog_posts",
      type: "postList",
      label: "Latest posts",
      query: {
        key: "postList",
      },
    });
    expect(postList.query?.items.map((item) => item.id)).toEqual([
      "rec_site_content_post_shipped_schema",
      "rec_site_content_post_draft_notes",
    ]);
    expect(postList.query?.items.map((item) => item.date)).toEqual(["2026-05-13", "2026-05-06"]);
  });

  it("projects ordered primary image placements on post and project list items", () => {
    const records = [
      ...baseTreeRecords().filter(
        (record) =>
          ![
            "rec_site_place_projects_estii",
            "rec_site_place_projects_opensurf",
            "rec_site_place_projects_formless",
          ].includes(record.id),
      ),
      blockRecord("rec_site_block_blog_posts", {
        type: "postList",
        label: "Latest posts",
      }),
      blockRecord("rec_site_block_project_list", {
        type: "projectList",
        label: "Project index",
      }),
      blockRecord("rec_site_media_post_first", {
        type: "image",
        label: "Post primary first",
        href: "https://cdn.example.com/post-first.webp",
        width: 1600,
        height: 900,
      }),
      blockRecord("rec_site_media_post_second", {
        type: "image",
        label: "Post primary second",
        href: "data:image/png;base64,cG9zdC1zZWNvbmQ=",
        width: 1600,
        height: 900,
      }),
      blockRecord("rec_site_media_project_first", {
        type: "image",
        label: "Project primary first",
        href: "/manual/images/project-first.webp",
        width: 1200,
        height: 900,
      }),
      placementRecord(
        "rec_site_place_blog_posts",
        "rec_site_content_blog",
        "rec_site_block_blog_posts",
        {
          order: 1000,
        },
      ),
      placementRecord(
        "rec_site_place_projects_project_list",
        "rec_site_content_projects",
        "rec_site_block_project_list",
        {
          order: 1000,
        },
      ),
      placementRecord(
        "rec_site_place_post_default_image",
        "rec_site_content_post_shipped_schema",
        "rec_site_media_avatar",
        {
          order: 50,
        },
      ),
      placementRecord(
        "rec_site_place_post_primary_second",
        "rec_site_content_post_shipped_schema",
        "rec_site_media_post_second",
        {
          order: 200,
          slot: "primaryImage",
        },
      ),
      placementRecord(
        "rec_site_place_post_primary_first",
        "rec_site_content_post_shipped_schema",
        "rec_site_media_post_first",
        {
          order: 100,
          slot: "primaryImage",
        },
      ),
      placementRecord(
        "rec_site_place_project_primary_first",
        "rec_site_content_project_opensurf",
        "rec_site_media_project_first",
        {
          order: 100,
          slot: "primaryImage",
        },
      ),
    ];
    const blogTree = requireTree(
      buildSitePageTree(siteSourceSchema, records, "blog", { generatedAt }),
    );
    const projectsTree = requireTree(
      buildSitePageTree(siteSourceSchema, records, "projects", { generatedAt }),
    );
    const postList = childForPlacement(blogTree.page, "rec_site_place_blog_posts");
    const projectList = childForPlacement(
      projectsTree.page,
      "rec_site_place_projects_project_list",
    );
    const post = postList.query?.items.find(
      (item) => item.id === "rec_site_content_post_shipped_schema",
    );
    const project = projectList.query?.items.find(
      (item) => item.id === "rec_site_content_project_opensurf",
    );

    expect(post?.placements.map((placement) => [placement.id, placement.slot])).toEqual([
      ["rec_site_place_post_primary_first", "primaryImage"],
      ["rec_site_place_post_primary_second", "primaryImage"],
    ]);
    expect(post?.placements.map((placement) => placement.block.type)).toEqual(["image", "image"]);
    expect(project?.placements.map((placement) => [placement.id, placement.slot])).toEqual([
      ["rec_site_place_project_primary_first", "primaryImage"],
    ]);
    expect(project?.placements.map((placement) => placement.block.href)).toEqual([
      "/manual/images/project-first.webp",
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
      date: "2026-05-13",
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

  it("projects dated projects from projectList blocks in descending date order", () => {
    const records = [
      ...baseTreeRecords().filter(
        (record) =>
          ![
            "rec_site_place_projects_estii",
            "rec_site_place_projects_opensurf",
            "rec_site_place_projects_formless",
          ].includes(record.id),
      ),
      blockRecord("rec_site_block_project_list", {
        type: "projectList",
        label: "Project index",
      }),
      placementRecord(
        "rec_site_place_projects_project_list",
        "rec_site_content_projects",
        "rec_site_block_project_list",
        { order: 1000 },
      ),
    ];
    const tree = requireTree(
      buildSitePageTree(siteSourceSchema, records, "projects", { generatedAt }),
    );
    const projectList = childForPlacement(tree.page, "rec_site_place_projects_project_list");

    expect(projectList).toMatchObject({
      type: "projectList",
      query: {
        key: "projectList",
      },
    });
    expect(projectList.query?.items.map((item) => item.id)).toEqual([
      "rec_site_content_project_opensurf",
      "rec_site_content_project_formless",
      "rec_site_content_project_estii",
    ]);
    expect(projectList.query?.items.map((item) => item.date)).toEqual([
      "2026-05-08",
      "2026-05-03",
      "2026-05-01",
    ]);
  });

  it("projects subscribe form action facts without subscriber data or secrets", () => {
    const target = installedAppStorageIdentity({ packageAppKey: "site", installId: "site" });

    if (!target) {
      throw new Error("Missing installed Site identity.");
    }

    const records = [
      ...baseTreeRecords(),
      blockRecord("rec_site_block_subscribe", {
        type: "subscribeForm",
        label: "Join the list",
        body: "Get product notes.",
        actionName: "subscribe",
        buttonLabel: "Join",
      }),
      placementRecord(
        "rec_site_place_home_subscribe",
        "rec_site_content_home",
        "rec_site_block_subscribe",
        {
          order: 4000,
        },
      ),
      {
        id: "rec_site_email_reader",
        entity: "emailAddress",
        values: {
          address: "reader@example.com",
          normalizedAddress: "reader@example.com",
        },
        createdAt: "2026-05-06T00:00:01.000Z",
      },
      {
        id: "rec_site_subscription_reader",
        entity: "subscription",
        values: {
          emailAddress: "rec_site_email_reader",
          audience: "audience-default",
          status: "subscribed",
        },
        createdAt: "2026-05-06T00:00:02.000Z",
      },
      {
        id: "rec_site_turnstile_secret",
        entity: "turnstileSecret",
        values: {
          secret: "server-secret-value",
        },
        createdAt: "2026-05-06T00:00:03.000Z",
      },
    ];
    const tree = requireTree(
      buildSitePageTree(siteSourceSchema, records, "home", {
        generatedAt,
        target,
        turnstileSiteKey: "public-site-key",
      }),
    );
    const subscribeForm = childForPlacement(tree.page, "rec_site_place_home_subscribe");

    expect(subscribeForm).toMatchObject({
      id: "rec_site_block_subscribe",
      type: "subscribeForm",
      label: "Join the list",
      body: "Get product notes.",
      actionName: "subscribe",
      buttonLabel: "Join",
      publicAction: {
        actionName: "subscribe",
        route: "/api/app-installs/site/site/public/actions/subscribe",
        challenge: {
          kind: "turnstile",
          siteKey: "public-site-key",
        },
      },
    });
    expect(JSON.stringify(tree)).not.toContain("server-secret-value");
    expect(JSON.stringify(tree)).not.toContain("reader@example.com");
  });

  it("warns and omits working subscribe form actions when Turnstile site key config is missing", () => {
    const records = [
      ...baseTreeRecords(),
      blockRecord("rec_site_block_subscribe", {
        type: "subscribeForm",
        label: "Join the list",
        body: "Get product notes.",
        actionName: "subscribe",
        buttonLabel: "Join",
      }),
      placementRecord(
        "rec_site_place_home_subscribe",
        "rec_site_content_home",
        "rec_site_block_subscribe",
        {
          order: 4000,
        },
      ),
    ];
    const result = buildSitePageTree(siteSourceSchema, records, "home", { generatedAt });
    const tree = requireTree(result);
    const subscribeForm = childForPlacement(tree.page, "rec_site_place_home_subscribe");

    expect(subscribeForm.publicAction).toBeUndefined();
    expect(result.meta.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing-public-action-challenge-config",
          recordId: "rec_site_block_subscribe",
        }),
      ]),
    );
  });

  it("warns and omits working subscribe form actions when action bindings are missing or not public", () => {
    const records = [
      ...baseTreeRecords(),
      blockRecord("rec_site_block_missing_subscribe", {
        type: "subscribeForm",
        label: "Missing subscribe action",
        actionName: "missingSubscribeAction",
      }),
      blockRecord("rec_site_block_private_subscribe", {
        type: "subscribeForm",
        label: "Private subscribe action",
        actionName: "addTreeChild",
      }),
      placementRecord(
        "rec_site_place_home_missing_subscribe",
        "rec_site_content_home",
        "rec_site_block_missing_subscribe",
        {
          order: 4000,
        },
      ),
      placementRecord(
        "rec_site_place_home_private_subscribe",
        "rec_site_content_home",
        "rec_site_block_private_subscribe",
        {
          order: 5000,
        },
      ),
    ];
    const result = buildSitePageTree(siteSourceSchema, records, "home", { generatedAt });
    const tree = requireTree(result);
    const missing = childForPlacement(tree.page, "rec_site_place_home_missing_subscribe");
    const privateAction = childForPlacement(tree.page, "rec_site_place_home_private_subscribe");

    expect(missing.publicAction).toBeUndefined();
    expect(privateAction.publicAction).toBeUndefined();
    expect(result.meta.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing-public-action",
          recordId: "rec_site_block_missing_subscribe",
        }),
        expect.objectContaining({
          code: "invalid-public-action",
          recordId: "rec_site_block_private_subscribe",
        }),
      ]),
    );
  });

  it("omits tombstoned and undated posts from postList projection", () => {
    const records = baseTreeRecords().map((record) =>
      record.id === "rec_site_content_post_draft_notes"
        ? { ...record, deletedAt: "2026-05-06T00:00:00.000Z" }
        : record,
    );
    records.push(
      blockRecord("rec_site_content_post_undated", {
        type: "post",
        label: "Undated post",
        body: "Hidden until a date is set.",
        href: "/blog/undated-post",
      }),
    );
    const tree = requireTree(
      buildSitePageTree(siteSourceSchema, recordsWithBlogPostList(records), "blog", {
        generatedAt,
      }),
    );
    const postList = childForPlacement(tree.page, "rec_site_place_blog_posts");

    expect(postList.query?.items.map((item) => item.id)).toEqual([
      "rec_site_content_post_shipped_schema",
    ]);
  });

  it("returns null for undated direct post detail routes", () => {
    const records = baseTreeRecords().map((record) => {
      if (record.id !== "rec_site_content_post_shipped_schema") {
        return record;
      }

      return withoutRecordValue(record, "date");
    });
    const result = buildSitePageTree(
      siteSourceSchema,
      records,
      "blog/shipping-schema-backed-authoring",
      {
        generatedAt,
      },
    );

    expect(result.tree).toBeNull();
    expect(result.meta.warnings).toEqual([
      expect.objectContaining({
        code: "missing-root",
        recordId: "blog/shipping-schema-backed-authoring",
      }),
    ]);
  });

  it("omits undated manually placed posts and projects from public placements", () => {
    const records = baseTreeRecords().map((record) => {
      if (
        record.id !== "rec_site_content_post_draft_notes" &&
        record.id !== "rec_site_content_project_formless"
      ) {
        return record;
      }

      return withoutRecordValue(record, "date");
    });
    const tree = requireTree(buildSitePageTree(siteSourceSchema, records, "home", { generatedAt }));
    const recentPosts = childForPlacement(tree.page, "rec_site_place_home_recent_posts");
    const projects = childForPlacement(tree.page, "rec_site_place_home_projects");

    expect(recentPosts.placements.map((placement) => placement.block.id)).toEqual([
      "rec_site_content_post_shipped_schema",
    ]);
    expect(projects.placements.map((placement) => placement.block.id)).toEqual([
      "rec_site_content_project_estii",
      "rec_site_content_project_opensurf",
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

function recordsWithBlogPostList(records: StoredRecord[] = baseTreeRecords()): StoredRecord[] {
  return [
    ...records,
    blockRecord("rec_site_block_blog_posts", {
      type: "postList",
      label: "Latest posts",
    }),
    placementRecord(
      "rec_site_place_blog_posts",
      "rec_site_content_blog",
      "rec_site_block_blog_posts",
      {
        order: 1000,
      },
    ),
  ];
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
    slot?: string;
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
      ...(options.slot === undefined ? {} : { slot: options.slot }),
    },
    createdAt: "2026-05-06T00:00:00.000Z",
  };
}

function withoutRecordValue(record: StoredRecord, field: string): StoredRecord {
  const values = { ...record.values };
  delete values[field];

  return {
    ...record,
    values,
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
