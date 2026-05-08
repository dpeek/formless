import { describe, expect, it } from "vite-plus/test";
import { getRecordReadinessWarnings } from "./readiness.ts";
import type { StoredRecord } from "../shared/protocol.ts";

describe("record readiness warnings", () => {
  it("warns when post blocks are missing a route or body", () => {
    const warnings = getRecordReadinessWarnings(
      record("post-1", "block", {
        type: "post",
        label: "Post without metadata",
      }),
    );

    expect(warnings.map((warning) => warning.code)).toEqual(["block-route", "post-body"]);
  });

  it("warns when project blocks have no body", () => {
    const warnings = getRecordReadinessWarnings(
      record("project-1", "block", {
        type: "project",
        label: "Project",
        href: "/projects/project",
      }),
    );

    expect(warnings).toEqual([
      {
        code: "project-summary",
        message: "Project block should include body content.",
      },
    ]);
  });

  it("warns when placements do not resolve to a child block", () => {
    const warnings = getRecordReadinessWarnings(
      record("placement-1", "blockPlacement", {
        parent: "group-1",
        block: "missing-block",
        order: 0,
      }),
      {},
    );

    expect(warnings.map((warning) => warning.code)).toEqual(["placement-block-child"]);
  });

  it("accepts placements with a live child block", () => {
    const warnings = getRecordReadinessWarnings(
      record("placement-1", "blockPlacement", {
        parent: "group-1",
        block: "link-1",
        order: 0,
      }),
      {
        "link-1": record("link-1", "block", {
          type: "link",
          label: "Example",
          href: "https://example.com",
        }),
      },
    );

    expect(warnings).toEqual([]);
  });

  it("accepts media labels as accessible text", () => {
    const warnings = getRecordReadinessWarnings(
      record("media-1", "block", {
        type: "image",
        label: "Hero",
      }),
    );

    expect(warnings).toEqual([]);
  });

  it("warns when query-backed blocks have no query key", () => {
    const warnings = getRecordReadinessWarnings(
      record("block-1", "block", {
        type: "contentList",
        label: "Recent posts",
      }),
    );

    expect(warnings).toEqual([
      {
        code: "block-contentList-query",
        message: "Content list block should include a query key.",
      },
    ]);
  });

  it("warns for every placement with a missing child block", () => {
    const warnings = getRecordReadinessWarnings(
      record("placement-1", "blockPlacement", {
        parent: "block-1",
        block: "missing-block",
        order: 0,
      }),
    );

    expect(warnings.map((warning) => warning.code)).toEqual(["placement-block-child"]);
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
