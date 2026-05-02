import { describe, expect, it } from "vite-plus/test";
import rawRateCardSchema from "../../schema/samples/rate-card.json";
import { appSchema } from "./schema.ts";
import { selectCollectionModels, selectHomeModel } from "./views.ts";
import { parseAppSchema, type AppSchema } from "../shared/schema.ts";

const rateCardSchema = parseAppSchema(rawRateCardSchema);

describe("home view model collections", () => {
  it("selects the task collection and resolves query tabs in schema order", () => {
    const model = selectHomeModel(appSchema);

    expect(model?.viewName).toBe("taskHome");
    expect(model?.label).toBe("Tasks");
    expect(model?.entityName).toBe("task");
    expect(model?.defaultQueryName).toBe("taskAll");
    expect(model?.queryTabs.map((tab) => tab.queryName)).toEqual([
      "taskAll",
      "taskActive",
      "taskCompleted",
      "taskOverdue",
    ]);
    expect(model?.queryTabs.map((tab) => tab.label)).toEqual([
      "All",
      "Active",
      "Completed",
      "Overdue",
    ]);
  });

  it("resolves result fields from the shared task item view", () => {
    const model = selectHomeModel(appSchema);

    expect(model?.result).toMatchObject({
      type: "list",
      itemViewName: "taskListItem",
    });
    expect(model?.result.recordFields.map((field) => field.fieldName)).toEqual([
      "title",
      "done",
      "dueDate",
      "estimate",
      "priority",
    ]);
  });

  it("resolves collection actions and clear-completed target query", () => {
    const model = selectHomeModel(appSchema);

    expect(model?.actions.map((action) => action.label)).toEqual([
      "Create Task",
      "Clear completed",
    ]);

    const create = model?.actions[0];
    const clearCompleted = model?.actions[1];

    expect(create).toMatchObject({
      type: "create",
      enabled: true,
    });
    expect(create?.type === "create" ? create.fields.map((field) => field.fieldName) : []).toEqual([
      "title",
      "dueDate",
      "estimate",
      "priority",
    ]);
    expect(create?.type === "create" ? create.defaults : []).toEqual([]);
    expect(clearCompleted).toMatchObject({
      type: "entity-action",
      actionName: "clearCompletedTasks",
      count: { type: "count" },
      targetQuery: appSchema.queries.taskCompleted?.expression,
    });
  });

  it("uses query slot labels when provided", () => {
    const schema: AppSchema = {
      ...appSchema,
      views: {
        ...appSchema.views,
        taskHome: {
          ...(appSchema.views.taskHome as Extract<
            AppSchema["views"][string],
            { type: "collection" }
          >),
          queries: [{ query: "taskAll", label: "Everything" }],
        },
      },
    };
    const model = selectHomeModel(schema);

    expect(model?.queryTabs.map((tab) => tab.label)).toEqual(["Everything"]);
  });

  it("selects every collection model in schema order", () => {
    const models = selectCollectionModels(rateCardSchema);

    expect(models.map((model) => model.viewName)).toEqual(["resourceHome", "cardHome", "rateHome"]);
    expect(models.map((model) => model.label)).toEqual(["Resources", "Rate cards", "Rates"]);
    expect(models.map((model) => model.actions[0]?.label)).toEqual([
      "Create Resource",
      "Create Rate card",
      "Create Rate",
    ]);
    expect(models[0]?.result.recordFields.map((field) => field.fieldName)).toEqual([
      "name",
      "kind",
      "unit",
    ]);
    expect(models[1]?.result.recordFields.map((field) => field.fieldName)).toEqual([
      "name",
      "isDefault",
      "marginMin",
      "marginMed",
      "marginMax",
    ]);
    expect(models[2]?.result.recordFields.map((field) => field.fieldName)).toEqual([
      "resource",
      "cost",
      "costUnit",
      "price",
      "currency",
    ]);
  });

  it("resolves scoped rate-card collection context", () => {
    const rateModel = selectCollectionModels(rateCardSchema).find(
      (model) => model.viewName === "rateHome",
    );

    expect(rateModel?.context).toMatchObject({
      name: "card",
      entityName: "card",
      queryName: "cardAll",
      query: rateCardSchema.queries.cardAll?.expression,
      labelField: "name",
      createAction: {
        type: "create",
        label: "Create Rate card",
        entityName: "card",
        fields: [{ fieldName: "name" }],
        defaults: [],
        enabled: true,
      },
    });
    expect(rateModel?.queryTabs[0]).toMatchObject({
      queryName: "ratesForSelectedCard",
      query: rateCardSchema.queries.ratesForSelectedCard?.expression,
    });
  });

  it("resolves scoped rate create defaults from the create view", () => {
    const rateModel = selectCollectionModels(rateCardSchema).find(
      (model) => model.viewName === "rateHome",
    );
    const create = rateModel?.actions.find((action) => action.type === "create");

    expect(create).toMatchObject({
      type: "create",
      entityName: "rate",
      fields: [
        { fieldName: "resource" },
        { fieldName: "cost" },
        { fieldName: "costUnit" },
        { fieldName: "price" },
      ],
      defaults: [
        {
          fieldName: "card",
          value: { kind: "context", name: "card" },
        },
      ],
    });
  });
});
