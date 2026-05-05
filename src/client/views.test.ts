import { describe, expect, it } from "vite-plus/test";
import rawRateCardSchema from "../../schema/apps/rates/schema.json";
import { appSchema } from "./schema.ts";
import { selectCollectionModels, selectPrimaryCollectionModels } from "./views.ts";
import { parseAppSchema, type AppSchema } from "../shared/schema.ts";

const rateCardSchema = parseAppSchema(rawRateCardSchema);

describe("home view model collections", () => {
  it("selects the task collection and resolves query tabs in schema order", () => {
    const model = selectPrimaryCollectionModels(appSchema)[0];

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
    const model = selectPrimaryCollectionModels(appSchema)[0];

    expect(model?.result).toMatchObject({
      type: "list",
      itemViewName: "taskListItem",
    });
    expect(
      model?.result.type === "list"
        ? model.result.recordFields.map((field) => field.fieldName)
        : [],
    ).toEqual(["title", "done", "dueDate", "estimate", "priority"]);
  });

  it("resolves collection actions and clear-completed target query", () => {
    const model = selectPrimaryCollectionModels(appSchema)[0];

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
    const model = selectPrimaryCollectionModels(schema)[0];

    expect(model?.queryTabs.map((tab) => tab.label)).toEqual(["Everything"]);
  });

  it("selects every collection model in schema order", () => {
    const models = selectCollectionModels(rateCardSchema);

    expect(models.map((model) => model.viewName)).toEqual(["resourceHome", "cardHome", "rateHome"]);
    expect(models.map((model) => model.label)).toEqual(["Resources", "Rate cards", "Rates"]);
    expect(models.map((model) => model.navigation.primary)).toEqual([false, false, true]);
    expect(models.map((model) => model.actions[0]?.label)).toEqual([
      "Create Resource",
      "Create Rate card",
      "Create Resource",
    ]);
    expect(
      models[0]?.result.type === "list"
        ? models[0].result.recordFields.map((field) => field.fieldName)
        : [],
    ).toEqual(["name", "kind", "unit"]);
    expect(
      models[1]?.result.type === "list"
        ? models[1].result.recordFields.map((field) => field.fieldName)
        : [],
    ).toEqual(["name", "isDefault", "marginMin", "marginMed", "marginMax"]);
    expect(models[2]?.result).toMatchObject({
      type: "table",
      tableViewName: "rateTable",
    });
    expect(
      models[2]?.result.type === "table"
        ? models[2].result.columns.map((column) => column.key)
        : [],
    ).toEqual([
      "referenceField:resource.name",
      "field:cost",
      "field:costUnit",
      "field:price",
      "field:currency",
    ]);
  });

  it("selects only primary collection models for home navigation", () => {
    const models = selectPrimaryCollectionModels(rateCardSchema);

    expect(models.map((model) => model.viewName)).toEqual(["rateHome"]);
    expect(selectPrimaryCollectionModels(rateCardSchema)[0]?.viewName).toBe("rateHome");
  });

  it("resolves rate-card table columns with labels, editors, and alignment", () => {
    const rateModel = selectCollectionModels(rateCardSchema).find(
      (model) => model.viewName === "rateHome",
    );
    const columns = rateModel?.result.type === "table" ? rateModel.result.columns : [];

    expect(columns.map((column) => column.label)).toEqual([
      "Role",
      "Cost",
      "Cost unit",
      "Price",
      "Currency",
    ]);
    expect(columns.map((column) => column.editor)).toEqual([
      "text",
      "number",
      "enum",
      "number",
      "enum",
    ]);
    expect(columns.map((column) => column.commit)).toEqual([
      "field-commit",
      "field-commit",
      "immediate",
      "field-commit",
      "immediate",
    ]);
    expect(columns.map((column) => column.align ?? "start")).toEqual([
      "start",
      "end",
      "start",
      "end",
      "start",
    ]);
    expect(columns.map((column) => column.width ?? "none")).toEqual(["lg", "sm", "xs", "sm", "xs"]);
    expect(columns.map((column) => column.display)).toEqual([
      "editor",
      "editor",
      "hidden",
      "editor",
      "readOnly",
    ]);
    expect(columns.map((column) => column.suffix ?? "")).toEqual(["", "/ day", "", "/ day", ""]);
    expect(columns.map((column) => column.format)).toEqual([
      "plain",
      "number",
      "plain",
      "number",
      "plain",
    ]);
    expect(columns[0]).toMatchObject({
      type: "referenceField",
      key: "referenceField:resource.name",
      sourceReferenceFieldName: "resource",
      referencedEntityName: "resource",
      fieldName: "name",
      field: rateCardSchema.entities.resource?.fields.name,
    });
  });

  it("applies field type default commit policies to table columns", () => {
    const taskHome = appSchema.views.taskHome as Extract<
      AppSchema["views"][string],
      { type: "collection" }
    >;
    const schema: AppSchema = {
      ...appSchema,
      tableViews: {
        taskTable: {
          entity: "task",
          columns: [
            { type: "field", field: "title" },
            { type: "field", field: "done" },
            { type: "field", field: "dueDate" },
            { type: "field", field: "estimate" },
            { type: "field", field: "priority" },
          ],
        },
      },
      views: {
        ...appSchema.views,
        taskHome: {
          ...taskHome,
          result: { type: "table", tableView: "taskTable" },
        },
      },
    };
    const model = selectPrimaryCollectionModels(schema)[0];
    const columns = model?.result.type === "table" ? model.result.columns : [];

    expect(columns.map((column) => column.editor)).toEqual([
      "text",
      "boolean",
      "date",
      "number",
      "enum",
    ]);
    expect(columns.map((column) => column.commit)).toEqual([
      "field-commit",
      "immediate",
      "field-commit",
      "field-commit",
      "immediate",
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
      itemViewName: "rateCardContextItem",
      recordFields: [
        { fieldName: "marginMin" },
        { fieldName: "marginMed" },
        { fieldName: "marginMax" },
      ],
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

  it("resolves the rate-home resource create action from the create view entity", () => {
    const rateModel = selectCollectionModels(rateCardSchema).find(
      (model) => model.viewName === "rateHome",
    );
    const create = rateModel?.actions.find((action) => action.type === "create");

    expect(create).toMatchObject({
      type: "create",
      label: "Create Resource",
      entityName: "resource",
      fields: [{ fieldName: "name" }],
      defaults: [],
    });
  });

  it("resolves the rate-card regenerate action without a target query", () => {
    const rateModel = selectCollectionModels(rateCardSchema).find(
      (model) => model.viewName === "rateHome",
    );
    const action = rateModel?.actions.find((candidate) => candidate.type === "entity-action");

    expect(rateModel?.actions.map((candidate) => candidate.label)).toEqual([
      "Create Resource",
      "Regenerate missing rates",
    ]);
    expect(action).toMatchObject({
      type: "entity-action",
      actionName: "regenerateMissingRates",
      action: {
        kind: "create-missing-join-records",
      },
    });
    expect(action?.type === "entity-action" ? action.targetQuery : undefined).toBeUndefined();
  });
});
