import { describe, expect, it } from "vite-plus/test";
import { getRecordReadinessWarnings } from "./readiness.ts";
import type { StoredRecord } from "../shared/protocol.ts";

describe("record readiness warnings", () => {
  it("lets draft content stay incomplete", () => {
    const warnings = getRecordReadinessWarnings(
      record("draft-post", "block", {
        type: "post",
        title: "Draft",
        status: "draft",
      }),
    );

    expect(warnings).toEqual([]);
  });

  it("warns when published posts are missing route, body, or date data", () => {
    const warnings = getRecordReadinessWarnings(
      record("post-1", "block", {
        type: "post",
        title: "Published without metadata",
        status: "published",
      }),
    );

    expect(warnings.map((warning) => warning.code)).toEqual([
      "published-block-route",
      "published-post-body",
      "published-post-date",
    ]);
  });

  it("warns when published projects have no summary or body", () => {
    const warnings = getRecordReadinessWarnings(
      record("project-1", "block", {
        type: "project",
        title: "Project",
        slug: "projects/project",
        status: "published",
      }),
    );

    expect(warnings).toEqual([
      {
        code: "published-project-summary",
        message: "Published project should include a summary or body.",
      },
    ]);
  });

  it("warns when visible placements do not resolve to a child block", () => {
    const warnings = getRecordReadinessWarnings(
      record("placement-1", "blockPlacement", {
        parent: "group-1",
        slot: "header",
        block: "missing-block",
        order: 0,
        visible: true,
      }),
      {},
    );

    expect(warnings.map((warning) => warning.code)).toEqual(["placement-block-child"]);
  });

  it("accepts visible placements with a live child block", () => {
    const warnings = getRecordReadinessWarnings(
      record("placement-1", "blockPlacement", {
        parent: "group-1",
        slot: "header",
        block: "link-1",
        order: 0,
        visible: true,
      }),
      {
        "link-1": record("link-1", "block", {
          type: "link",
          title: "Example",
          href: "https://example.com",
          status: "published",
        }),
      },
    );

    expect(warnings).toEqual([]);
  });

  it("warns when media blocks have no alt text", () => {
    const warnings = getRecordReadinessWarnings(
      record("media-1", "block", {
        type: "image",
        title: "Hero",
        assetKey: "hero",
        status: "published",
      }),
    );

    expect(warnings).toEqual([
      {
        code: "block-media-alt",
        message: "Media block should include alt text.",
      },
    ]);
  });

  it("warns when query-backed blocks have no query key", () => {
    const warnings = getRecordReadinessWarnings(
      record("block-1", "block", {
        type: "contentList",
        title: "Recent posts",
        status: "published",
      }),
    );

    expect(warnings).toEqual([
      {
        code: "block-contentList-query",
        message: "Content list block should include a query key.",
      },
    ]);
  });

  it("ignores hidden placements with missing child blocks", () => {
    const warnings = getRecordReadinessWarnings(
      record("placement-1", "blockPlacement", {
        parent: "block-1",
        slot: "main",
        block: "missing-block",
        order: 0,
        visible: false,
      }),
    );

    expect(warnings).toEqual([]);
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
