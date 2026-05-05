import { describe, expect, it } from "vite-plus/test";
import { getRecordReadinessWarnings } from "./readiness.ts";
import type { StoredRecord } from "../shared/protocol.ts";

describe("record readiness warnings", () => {
  it("lets draft content stay incomplete", () => {
    const warnings = getRecordReadinessWarnings(
      record("draft-post", "contentItem", {
        kind: "post",
        title: "Draft",
        status: "draft",
        featured: false,
      }),
    );

    expect(warnings).toEqual([]);
  });

  it("warns when published posts are missing route, body, date, or author data", () => {
    const warnings = getRecordReadinessWarnings(
      record("post-1", "contentItem", {
        kind: "post",
        title: "Published without metadata",
        status: "published",
        featured: false,
      }),
    );

    expect(warnings.map((warning) => warning.code)).toEqual([
      "published-content-route",
      "published-post-body",
      "published-post-date",
      "published-post-author",
    ]);
  });

  it("warns when published projects have no summary or body", () => {
    const warnings = getRecordReadinessWarnings(
      record("project-1", "contentItem", {
        kind: "project",
        title: "Project",
        slug: "projects/project",
        status: "published",
        featured: true,
      }),
    );

    expect(warnings).toEqual([
      {
        code: "published-project-summary",
        message: "Published project should include a summary or body.",
      },
    ]);
  });

  it("warns when navigation items do not resolve to content or a link", () => {
    const warnings = getRecordReadinessWarnings(
      record("nav-1", "navItem", {
        section: "section-1",
        item: "missing-content",
        order: 0,
        visible: true,
      }),
      {},
    );

    expect(warnings.map((warning) => warning.code)).toEqual([
      "nav-item-target",
      "nav-item-missing-content",
    ]);
  });

  it("accepts navigation items with an external link", () => {
    const warnings = getRecordReadinessWarnings(
      record("nav-1", "navItem", {
        section: "section-1",
        href: "https://example.com",
        order: 0,
        visible: true,
      }),
    );

    expect(warnings).toEqual([]);
  });

  it("warns when media assets have no alt text", () => {
    const warnings = getRecordReadinessWarnings(
      record("media-1", "mediaAsset", {
        label: "Hero",
        kind: "image",
        key: "hero",
      }),
    );

    expect(warnings).toEqual([
      {
        code: "media-alt",
        message: "Media asset should include alt text.",
      },
    ]);
  });

  it("warns when query-backed placements have no query key", () => {
    const warnings = getRecordReadinessWarnings(
      record("placement-1", "contentPlacement", {
        parent: "content-1",
        slot: "main",
        kind: "contentList",
        title: "Recent posts",
        order: 0,
        visible: true,
      }),
    );

    expect(warnings).toEqual([
      {
        code: "placement-contentList-query",
        message: "Content list placement should include a query key.",
      },
    ]);
  });

  it("warns when placement source references are missing", () => {
    const warnings = getRecordReadinessWarnings(
      record("placement-1", "contentPlacement", {
        parent: "content-1",
        slot: "main",
        kind: "media",
        order: 0,
        visible: true,
      }),
    );

    expect(warnings).toEqual([
      {
        code: "placement-media-asset",
        message: "Media placement should point to a media asset.",
      },
    ]);
  });

  it("ignores records outside the site authoring entities", () => {
    const warnings = getRecordReadinessWarnings(record("task-1", "task", { title: "Task" }));

    expect(warnings).toEqual([]);
  });
});

function record(id: string, entity: string, values: StoredRecord["values"]): StoredRecord {
  return {
    id,
    entity,
    values,
    createdAt: "2026-05-05T00:00:00.000Z",
  };
}
