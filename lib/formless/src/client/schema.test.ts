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

  it("contains the task collection, item view, and operation bindings", () => {
    const priority = taskSourceSchema.entities.task?.fields.priority;

    expect(priority?.type === "enum" ? priority.values : undefined).toMatchObject({
      low: { label: "Low", presentation: { icon: "priority-marker", color: "priority.low" } },
      normal: {
        label: "Normal",
        presentation: { icon: "priority-marker", color: "priority.normal" },
      },
      high: { label: "High", presentation: { icon: "priority-marker", color: "priority.high" } },
    });
    expect(taskSourceSchema.itemViews.taskListItem?.fields).toEqual({
      title: { editor: "text", commit: "field-commit" },
      done: { editor: "boolean", commit: "immediate", presentation: { mode: "completion" } },
      dueDate: {
        editor: "date",
        commit: "field-commit",
        presentation: { visibility: "valueOrInteraction" },
      },
      priority: {
        editor: "enum",
        commit: "immediate",
        presentation: { list: "both", mode: "iconOnly", trigger: "icon" },
      },
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
    const operations = taskSourceSchema.entities.task?.operations;

    expect(operations?.create).toMatchObject({
      kind: "create",
      scope: "collection",
      effect: { type: "createRecord" },
      output: { type: "create" },
    });
    expect(operations?.update).toMatchObject({
      kind: "update",
      scope: "record",
      effect: { type: "patchRecord" },
      output: { type: "update" },
    });
    expect(operations?.clearCompletedTasks).toMatchObject({
      kind: "command",
      scope: "collection",
      target: { query: "taskCompleted" },
      effect: {
        type: "operationHandler",
        handler: "clear-completed",
        config: { query: "taskCompleted" },
      },
      output: { type: "command" },
    });
    expect(
      taskSourceSchema.views.taskHome?.type === "collection"
        ? taskSourceSchema.views.taskHome.operations
        : [],
    ).toEqual([
      { operation: "task.create", createView: "taskCreate" },
      { operation: "task.clearCompletedTasks", count: { type: "count" } },
    ]);
    const clearCompletedEffect = operations?.clearCompletedTasks.effect;
    expect(
      clearCompletedEffect?.type === "operationHandler" &&
        clearCompletedEffect.handler === "clear-completed"
        ? clearCompletedEffect.config.query
        : undefined,
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
          width: "standard",
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
          width: "standard",
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
          width: "standard",
        },
      },
    });
  });
});
