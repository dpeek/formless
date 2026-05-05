import { describe, expect, it } from "vite-plus/test";
import { taskSourceSchema } from "../test/schema-apps.ts";

describe("task source schema", () => {
  it("imports and parses the checked-in schema", () => {
    expect(taskSourceSchema.version).toBe(1);
    expect(taskSourceSchema.entities.task?.label).toBe("Task");
  });

  it("contains task queries in schema order", () => {
    expect(Object.keys(taskSourceSchema.queries)).toEqual([
      "taskAll",
      "taskActive",
      "taskCompleted",
      "taskOverdue",
    ]);
    expect(Object.values(taskSourceSchema.queries).map((query) => query.label)).toEqual([
      "All",
      "Active",
      "Completed",
      "Overdue",
    ]);
  });

  it("parses the overdue query into the normalized and query", () => {
    expect(taskSourceSchema.queries.taskOverdue?.expression).toEqual({
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
    expect(taskSourceSchema.itemViews.taskListItem?.fields).toEqual({
      title: { editor: "text", commit: "field-commit" },
      done: { editor: "boolean", commit: "immediate" },
      dueDate: { editor: "date", commit: "field-commit" },
      estimate: { editor: "number", commit: "field-commit" },
      priority: { editor: "enum", commit: "immediate" },
    });
    expect(taskSourceSchema.views.taskHome).toMatchObject({
      type: "collection",
      label: "Tasks",
      entity: "task",
      defaultQuery: "taskAll",
      result: { type: "list", itemView: "taskListItem" },
    });
    expect(
      taskSourceSchema.views.taskHome?.type === "collection"
        ? taskSourceSchema.views.taskHome.queries
        : [],
    ).toEqual([
      { query: "taskAll", count: { type: "count" } },
      { query: "taskActive", count: { type: "count" } },
      { query: "taskCompleted", count: { type: "count" } },
      { query: "taskOverdue", count: { type: "count" } },
    ]);
    const clearCompleted = taskSourceSchema.entities.task?.actions?.clearCompletedTasks;
    expect(
      clearCompleted?.kind === "clear-completed" ? clearCompleted.target.query : undefined,
    ).toBe("taskCompleted");
  });
});
