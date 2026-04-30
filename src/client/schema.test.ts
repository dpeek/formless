import { describe, expect, it } from "vite-plus/test";
import { appSchema } from "./schema.ts";

describe("seed app schema", () => {
  it("imports and parses the checked-in schema", () => {
    expect(appSchema.version).toBe(1);
    expect(appSchema.entities.task?.label).toBe("Task");
  });

  it("contains task queries in schema order", () => {
    expect(Object.keys(appSchema.queries)).toEqual([
      "taskAll",
      "taskActive",
      "taskCompleted",
      "taskOverdue",
    ]);
    expect(Object.values(appSchema.queries).map((query) => query.label)).toEqual([
      "All",
      "Active",
      "Completed",
      "Overdue",
    ]);
  });

  it("parses the overdue query into the normalized and query", () => {
    expect(appSchema.queries.taskOverdue?.expression).toEqual({
      kind: "and",
      expressions: [
        {
          kind: "where",
          ref: { kind: "value", name: "done" },
          op: "eq",
          value: false,
        },
        {
          kind: "where",
          ref: { kind: "value", name: "dueDate" },
          op: "before",
          value: { kind: "today" },
        },
      ],
    });
  });

  it("contains the task collection, item view, and clear-completed query target", () => {
    expect(appSchema.itemViews.taskListItem?.fields).toEqual({
      title: { editor: "text", commit: "field-commit" },
      done: { editor: "boolean", commit: "immediate" },
      dueDate: { editor: "date", commit: "field-commit" },
    });
    expect(appSchema.views.taskHome).toMatchObject({
      type: "collection",
      label: "Tasks",
      entity: "task",
      defaultQuery: "taskAll",
      result: { type: "list", itemView: "taskListItem" },
    });
    expect(
      appSchema.views.taskHome?.type === "collection" ? appSchema.views.taskHome.queries : [],
    ).toEqual([
      { query: "taskAll", count: { type: "count" } },
      { query: "taskActive", count: { type: "count" } },
      { query: "taskCompleted", count: { type: "count" } },
      { query: "taskOverdue", count: { type: "count" } },
    ]);
    expect(appSchema.entities.task?.actions?.clearCompletedTasks.target.query).toBe(
      "taskCompleted",
    );
  });
});
