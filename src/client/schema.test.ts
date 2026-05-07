import { describe, expect, it } from "vite-plus/test";
import { rateSourceSchema, taskSourceSchema } from "../test/schema-apps.ts";

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

  it("contains an explicit primary task source screen", () => {
    expect(taskSourceSchema.screens).toEqual({
      taskHome: {
        type: "workspace",
        label: "Tasks",
        path: "/",
        navigation: { primary: true },
        layout: {
          type: "stack",
          sections: [{ id: "tasks", type: "collection", view: "taskHome" }],
        },
      },
    });
  });
});

describe("rate source schema", () => {
  it("keeps primary route ownership out of rate collection views", () => {
    const collectionNavigation = ["resourceHome", "cardHome", "rateHome"].map((viewName) => {
      const view = rateSourceSchema.views[viewName];

      return view?.type === "collection" ? view.navigation : "missing";
    });

    expect(collectionNavigation).toEqual([undefined, undefined, undefined]);
  });

  it("contains explicit rates and setup source screens", () => {
    expect(rateSourceSchema.screens).toEqual({
      rateHome: {
        type: "workspace",
        label: "Rates",
        path: "/",
        navigation: { primary: true },
        layout: {
          type: "stack",
          sections: [{ id: "rates", type: "collection", view: "rateHome" }],
        },
      },
      rateSetup: {
        type: "workspace",
        label: "Setup",
        path: "/setup",
        navigation: { primary: true },
        layout: {
          type: "stack",
          sections: [
            { id: "cards", type: "collection", view: "cardHome" },
            { id: "resources", type: "collection", view: "resourceHome" },
          ],
        },
      },
    });
  });
});
