import { describe, expect, it } from "vite-plus/test";
import type { StoredRecord } from "./types.ts";
import {
  LINK_TARGET_BLOCK_FIELD,
  LINK_TARGET_MODE_FIELD,
  resolveSiteLinkHref,
} from "./link-targets.ts";

describe("site link target resolver", () => {
  it("keeps legacy link href strings unchanged", () => {
    const relative = linkRecord("rec_site_link_relative", {
      href: "/blog?draft=1#intro",
    });
    const external = linkRecord("rec_site_link_external", {
      href: "https://example.com/profile?tab=links#top",
    });

    expect(resolveSiteLinkHref(relative, new Map())).toEqual({
      href: "/blog?draft=1#intro",
      warnings: [],
    });
    expect(resolveSiteLinkHref(external, new Map())).toEqual({
      href: "https://example.com/profile?tab=links#top",
      warnings: [],
    });
  });

  it("resolves internal link targets through page, post, and project hrefs", () => {
    const targets = [
      blockRecord("rec_site_page_home", { type: "page", label: "Home", href: "/" }),
      blockRecord("rec_site_post_shipping", {
        type: "post",
        label: "Shipping",
        href: "/blog/shipping",
      }),
      blockRecord("rec_site_project_formless", {
        type: "project",
        label: "Formless",
        href: "/projects/formless",
      }),
    ];
    const blocks = indexBlocks(targets);

    expect(resolveSiteLinkHref(internalLink("rec_site_home_link", targets[0]!.id), blocks)).toEqual(
      {
        href: "/",
        warnings: [],
      },
    );
    expect(resolveSiteLinkHref(internalLink("rec_site_post_link", targets[1]!.id), blocks)).toEqual(
      {
        href: "/blog/shipping",
        warnings: [],
      },
    );
    expect(
      resolveSiteLinkHref(internalLink("rec_site_project_link", targets[2]!.id), blocks),
    ).toEqual({
      href: "/projects/formless",
      warnings: [],
    });
  });

  it("makes internal links follow the target block href", () => {
    const target = blockRecord("rec_site_page_blog", {
      type: "page",
      label: "Blog",
      href: "/writing",
    });
    const link = internalLink("rec_site_blog_link", target.id);

    expect(resolveSiteLinkHref(link, indexBlocks([target]))).toEqual({
      href: "/writing",
      warnings: [],
    });
  });

  it("inherits internal target icons unless the link has its own icon", () => {
    const targetIcon = '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>';
    const linkIcon = '<svg viewBox="0 0 24 24"><path d="M12 4l8 16H4z"/></svg>';
    const target = blockRecord("rec_site_page_projects", {
      type: "page",
      label: "Projects",
      href: "/projects",
      icon: targetIcon,
    });

    expect(
      resolveSiteLinkHref(internalLink("rec_site_projects_link", target.id), indexBlocks([target])),
    ).toEqual({
      href: "/projects",
      icon: targetIcon,
      warnings: [],
    });
    expect(
      resolveSiteLinkHref(
        linkRecord("rec_site_projects_link_with_icon", {
          [LINK_TARGET_MODE_FIELD]: "internal",
          [LINK_TARGET_BLOCK_FIELD]: target.id,
          icon: linkIcon,
        }),
        indexBlocks([target]),
      ),
    ).toEqual({
      href: "/projects",
      icon: linkIcon,
      warnings: [],
    });
  });

  it("warns and projects no href for missing internal targets", () => {
    const link = internalLink("rec_site_missing_link", "rec_site_missing_page");

    expect(resolveSiteLinkHref(link, new Map())).toEqual({
      href: undefined,
      warnings: [
        expect.objectContaining({
          code: "missing-link-target",
          recordId: "rec_site_missing_link",
        }),
      ],
    });
  });

  it("warns and projects no href for non-routable internal targets", () => {
    const target = blockRecord("rec_site_group", {
      type: "group",
      label: "Group",
      href: "/not-a-route",
    });
    const link = internalLink("rec_site_group_link", target.id);

    expect(resolveSiteLinkHref(link, indexBlocks([target]))).toEqual({
      href: undefined,
      warnings: [
        expect.objectContaining({
          code: "non-routable-link-target",
          recordId: "rec_site_group_link",
        }),
      ],
    });
  });

  it("validates explicit external link hrefs", () => {
    const valid = externalLink("rec_site_valid_external", "https://example.com/page?tab=1#top");
    const invalid = externalLink("rec_site_invalid_external", "/relative-path");

    expect(resolveSiteLinkHref(valid, new Map())).toEqual({
      href: "https://example.com/page?tab=1#top",
      warnings: [],
    });
    expect(resolveSiteLinkHref(invalid, new Map())).toEqual({
      href: undefined,
      warnings: [
        expect.objectContaining({
          code: "invalid-external-link",
          recordId: "rec_site_invalid_external",
        }),
      ],
    });
  });
});

function internalLink(id: string, targetId: string): StoredRecord {
  return linkRecord(id, {
    [LINK_TARGET_MODE_FIELD]: "internal",
    [LINK_TARGET_BLOCK_FIELD]: targetId,
  });
}

function externalLink(id: string, href: string): StoredRecord {
  return linkRecord(id, {
    [LINK_TARGET_MODE_FIELD]: "external",
    href,
  });
}

function linkRecord(id: string, values: StoredRecord["values"]): StoredRecord {
  return blockRecord(id, {
    type: "link",
    label: id,
    ...values,
  });
}

function blockRecord(id: string, values: StoredRecord["values"]): StoredRecord {
  return {
    id,
    entity: "block",
    values,
    createdAt: "2026-05-13T00:00:00.000Z",
  };
}

function indexBlocks(records: StoredRecord[]): Map<string, StoredRecord> {
  return new Map(records.map((record) => [record.id, record]));
}
