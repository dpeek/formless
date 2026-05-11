import { describe, expect, it } from "vite-plus/test";
import {
  rateSeedRecords,
  rateSourceSchema as rateCardSchema,
  siteSourceSchema,
  taskSourceSchema as appSchema,
} from "../test/schema-apps.ts";
import {
  selectCollectionModels,
  selectPrimaryCollectionModels,
  selectPrimaryScreenModels,
  selectRelatedCollectionModels,
  selectScreenModelByPath,
  selectScreenModels,
  type FieldTableColumnConfig,
  type HomeActionConfig,
  type HomeScreenModel,
  type HomeViewModel,
  type TableColumnConfig,
} from "./views.ts";
import { parseAppSchema, type AppSchema } from "../shared/schema.ts";
import type { NumericExpression } from "../shared/read-model.ts";

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

  it("exposes render-ready union variant facts for item, create, and edit views", () => {
    const schema = discriminatedTaskSchema();
    const listModel = requiredCollectionModel(schema, "taskHome");
    const editModel = requiredCollectionModel(schema, "taskEditHome");
    const createAction = listModel.actions.find((action) => action.type === "create");
    const editColumn =
      editModel.result.type === "table"
        ? editModel.result.columns.find((column) => column.type === "invokeAction")
        : undefined;
    const editAction =
      editColumn?.type === "invokeAction"
        ? editColumn.actions.find((action) => action.type === "editRecord")
        : undefined;

    expect(
      listModel.result.type === "list" ? listModel.result.recordUnion : undefined,
    ).toMatchObject({
      unionName: "taskByKind",
      discriminatorFieldName: "kind",
      variants: [
        {
          variantValue: "role",
          label: "Role",
          presentation: {
            type: "fields",
            fields: [{ fieldName: "title", editor: "text", commit: "field-commit" }],
          },
        },
        {
          variantValue: "stream",
          label: "Stream",
          presentation: {
            type: "contextLink",
            labelFieldName: "title",
            target: { kind: "selectContext", contextName: "task", record: "self" },
          },
        },
      ],
      fallback: {
        label: "Task",
        presentation: {
          type: "fields",
          fields: [{ fieldName: "kind", editor: "enum", commit: "immediate" }],
        },
      },
    });
    expect(createAction?.type === "create" ? createAction.union : undefined).toMatchObject({
      unionName: "taskByKind",
      discriminatorFieldName: "kind",
      variants: [
        {
          variantValue: "role",
          presentation: {
            type: "fields",
            fields: [{ fieldName: "title", editor: "text" }],
          },
        },
        {
          variantValue: "stream",
          presentation: {
            type: "fields",
            fields: [{ fieldName: "done", editor: "boolean" }],
          },
        },
      ],
    });
    expect(editAction?.type === "editRecord" ? editAction.editView.union : undefined).toMatchObject(
      {
        unionName: "taskByKind",
        variants: [
          {
            variantValue: "role",
            presentation: {
              type: "fields",
              fields: [{ fieldName: "title", editor: "text", commit: "field-commit" }],
            },
          },
          {
            variantValue: "stream",
            presentation: {
              type: "fields",
              fields: [{ fieldName: "done", editor: "boolean", commit: "immediate" }],
            },
          },
        ],
      },
    );
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
      ui: {
        showAffectedCountOnSuccess: true,
        targetCount: {
          display: { type: "count" },
          query: appSchema.queries.taskCompleted?.expression,
          ariaLabel: "Clear completed target count",
        },
      },
    });
  });

  it("characterizes the task primary home model contract", () => {
    const model = selectPrimaryCollectionModels(appSchema)[0];

    if (!model) {
      throw new Error("Missing task home model.");
    }

    expect(summarizeHomeModel(model)).toEqual({
      viewName: "taskHome",
      label: "Tasks",
      entityName: "task",
      navigationPrimary: true,
      context: null,
      queries: [
        { queryName: "taskAll", label: "All", count: "count", expressionKind: "all" },
        { queryName: "taskActive", label: "Active", count: "count", expressionKind: "where" },
        {
          queryName: "taskCompleted",
          label: "Completed",
          count: "count",
          expressionKind: "where",
        },
        { queryName: "taskOverdue", label: "Overdue", count: "count", expressionKind: "and" },
      ],
      defaultQueryName: "taskAll",
      result: {
        type: "list",
        itemViewName: "taskListItem",
        fields: ["title", "done", "dueDate", "estimate", "priority"],
      },
      actions: [
        {
          type: "create",
          label: "Create Task",
          entityName: "task",
          fields: ["title", "dueDate", "estimate", "priority"],
          defaults: [],
          enabled: true,
        },
        {
          type: "entity-action",
          label: "Clear completed",
          entityName: "task",
          actionName: "clearCompletedTasks",
          actionKind: "clear-completed",
          showAffectedCountOnSuccess: true,
          targetCountQueryKind: "where",
          targetCountDisplay: "count",
        },
      ],
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

  it("exposes render-ready collection facts behind the home collection model", () => {
    const model = requiredCollectionModel(rateCardSchema, "rateHome");

    expect(model?.collection).toMatchObject({
      entityName: "rate",
      queries: {
        defaultQueryName: "ratesForSelectedCard",
        defaultTab: {
          queryName: "ratesForSelectedCard",
          query: rateCardSchema.queries.ratesForSelectedCard?.expression,
          count: { type: "count" },
        },
      },
      context: {
        name: "card",
        entityName: "card",
        presentation: "tabs",
      },
      result: {
        type: "table",
        tableViewName: "rateTable",
        footer: [
          {
            columnKey: "field:cost",
            aggregateName: "selectedCardAverageCost",
          },
          {
            columnKey: "field:price",
            aggregateName: "selectedCardAveragePrice",
          },
          {
            columnKey: "computed:rateMargin",
            aggregateName: "selectedCardAverageMargin",
          },
        ],
      },
      actions: [{ type: "create", entityName: "resource" }],
    });
    expect(model?.collection.context).toBe(model?.context);
    expect(model?.collection.queries.tabs).toBe(model?.queryTabs);
    expect(model?.collection.result).toBe(model?.result);
    expect(model?.collection.actions).toBe(model?.actions);
  });

  it("exposes selected collection context presentation", () => {
    const rateHome = rateCardSchema.views.rateHome;

    if (rateHome?.type !== "collection" || !rateHome.context) {
      throw new Error("Missing rate home context.");
    }

    const schema: AppSchema = {
      ...rateCardSchema,
      views: {
        ...rateCardSchema.views,
        rateHome: {
          ...rateHome,
          context: {
            ...rateHome.context,
            presentation: "listDetail",
          },
        },
      },
    };
    const model = requiredCollectionModel(schema, "rateHome");

    expect(requiredCollectionModel(rateCardSchema, "rateHome").context?.presentation).toBe("tabs");
    expect(model.context?.presentation).toBe("listDetail");
    expect(model.collection.context).toBe(model.context);
  });

  it("selects every collection model in schema order", () => {
    const models = selectCollectionModels(rateCardSchema);

    expect(models.map((model) => model.viewName)).toEqual(["resourceHome", "cardHome", "rateHome"]);
    expect(models.map((model) => model.label)).toEqual(["Resources", "Rate cards", "Rates"]);
    expect(models.map((model) => model.navigation.primary)).toEqual([true, true, true]);
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
      "computed:rateMargin",
    ]);
    expect(
      models[2]?.result.type === "table"
        ? findFieldTableColumn(models[2].result.columns, "cost")?.valueUnit
        : undefined,
    ).toMatchObject({
      unitFieldName: "costUnit",
      unitField: rateCardSchema.entities.rate?.fields.costUnit,
    });
    expect(
      models[2]?.result.type === "table"
        ? findFieldTableColumn(models[2].result.columns, "price")?.valueUnit
        : undefined,
    ).toBeUndefined();
  });

  it("selects primary rate screens without collection navigation hints", () => {
    const collectionNavigation = ["resourceHome", "cardHome", "rateHome"].map((viewName) => {
      const view = rateCardSchema.views[viewName];

      return view?.type === "collection" ? view.navigation : "missing";
    });

    expect(collectionNavigation).toEqual([undefined, undefined, undefined]);
    expect(selectPrimaryCollectionModels(rateCardSchema).map((model) => model.viewName)).toEqual([
      "resourceHome",
      "cardHome",
      "rateHome",
    ]);
    expect(selectPrimaryScreenModels(rateCardSchema).map((model) => model.screenName)).toEqual([
      "rateHome",
      "rateSetup",
    ]);
  });

  it("characterizes the rate-card setup collection model contracts", () => {
    const models = [
      requiredCollectionModel(rateCardSchema, "resourceHome"),
      requiredCollectionModel(rateCardSchema, "cardHome"),
    ];

    expect(models.map(summarizeHomeModel)).toEqual([
      {
        viewName: "resourceHome",
        label: "Resources",
        entityName: "resource",
        navigationPrimary: true,
        context: null,
        queries: [
          { queryName: "resourceAll", label: "All", count: "count", expressionKind: "all" },
        ],
        defaultQueryName: "resourceAll",
        result: {
          type: "list",
          itemViewName: "resourceListItem",
          fields: ["name", "kind", "unit"],
        },
        actions: [
          {
            type: "create",
            label: "Create Resource",
            entityName: "resource",
            fields: ["name"],
            defaults: [],
            enabled: true,
          },
        ],
      },
      {
        viewName: "cardHome",
        label: "Rate cards",
        entityName: "card",
        navigationPrimary: true,
        context: null,
        queries: [{ queryName: "cardAll", label: "All", count: "count", expressionKind: "all" }],
        defaultQueryName: "cardAll",
        result: {
          type: "list",
          itemViewName: "cardListItem",
          fields: ["name", "isDefault", "marginMin", "marginMed", "marginMax"],
        },
        actions: [
          {
            type: "create",
            label: "Create Rate card",
            entityName: "card",
            fields: ["name"],
            defaults: [],
            enabled: true,
          },
        ],
      },
    ]);
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
      "Margin",
    ]);
    expect(tableColumnEditors(columns)).toEqual(["text", "number", "enum", "number", null]);
    expect(tableColumnCommits(columns)).toEqual([
      "field-commit",
      "field-commit",
      "immediate",
      "field-commit",
      null,
    ]);
    expect(columns.map((column) => column.align ?? "start")).toEqual([
      "start",
      "end",
      "start",
      "end",
      "end",
    ]);
    expect(columns.map((column) => column.width ?? "none")).toEqual(["lg", "sm", "xs", "sm", "sm"]);
    expect(columns.map((column) => column.display)).toEqual([
      "editor",
      "editor",
      "hidden",
      "editor",
      "readOnly",
    ]);
    expect(columns.map((column) => column.suffix ?? "")).toEqual(["", "", "", "/ day", ""]);
    expect(columns.map((column) => column.format)).toEqual([
      "plain",
      "number",
      "plain",
      "currency",
      "percent",
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

  it("resolves table invokeAction columns to render-ready action facts", () => {
    const schema = parseAppSchema({
      ...rateCardSchema,
      tableViews: {
        ...rateCardSchema.tableViews,
        rateTable: {
          ...rateCardSchema.tableViews.rateTable,
          actions: {
            inspectRate: { label: "Inspect rate" },
            blockedRate: {
              label: "Blocked rate",
              availability: { state: "disabled", reason: "No selected card" },
            },
            hiddenRate: {
              label: "Hidden rate",
              availability: { state: "hidden" },
            },
          },
          columns: [
            ...rateCardSchema.tableViews.rateTable.columns,
            { type: "invokeAction", action: "inspectRate" },
            {
              type: "invokeAction",
              actions: ["inspectRate", "blockedRate", "hiddenRate"],
              label: "Rate actions",
            },
          ],
        },
      },
    });
    const rateModel = selectCollectionModels(schema).find((model) => model.viewName === "rateHome");
    const columns = rateModel?.result.type === "table" ? rateModel.result.columns : [];
    const singleActionColumn = columns.at(-2);
    const multipleActionColumn = columns.at(-1);

    expect(singleActionColumn).toMatchObject({
      type: "invokeAction",
      key: "invokeAction:inspectRate",
      label: "",
      headerLabel: "Inspect rate",
      align: "end",
      width: "xs",
      display: "readOnly",
      presentation: "button",
      actions: [
        {
          actionName: "inspectRate",
          label: "Inspect rate",
          variant: "default",
          disabled: false,
        },
      ],
    });
    expect(multipleActionColumn).toMatchObject({
      type: "invokeAction",
      key: "invokeAction:inspectRate,blockedRate,hiddenRate",
      label: "Rate actions",
      headerLabel: "Rate actions",
      presentation: "dropdown",
      actions: [
        {
          actionName: "inspectRate",
          label: "Inspect rate",
          variant: "default",
          disabled: false,
        },
        {
          actionName: "blockedRate",
          label: "Blocked rate",
          variant: "default",
          disabled: true,
          disabledReason: "No selected card",
        },
      ],
    });
  });

  it("resolves editRecord table actions to edit dialog facts", () => {
    const schema = parseAppSchema({
      ...rateCardSchema,
      tableViews: {
        ...rateCardSchema.tableViews,
        rateTable: {
          ...rateCardSchema.tableViews.rateTable,
          actions: {
            editResource: {
              type: "editRecord",
              label: "Edit resource",
              target: { kind: "reference", field: "resource" },
              editView: "resourceEdit",
            },
          },
          columns: [
            ...rateCardSchema.tableViews.rateTable.columns,
            { type: "invokeAction", action: "editResource" },
          ],
        },
      },
      views: {
        ...rateCardSchema.views,
        resourceEdit: {
          type: "edit",
          entity: "resource",
          fields: {
            name: { editor: "text", commit: "field-commit" },
            unit: { editor: "enum", commit: "immediate" },
          },
        },
      },
    });
    const rateModel = selectCollectionModels(schema).find((model) => model.viewName === "rateHome");
    const columns = rateModel?.result.type === "table" ? rateModel.result.columns : [];
    const actionColumn = columns.at(-1);

    expect(actionColumn).toMatchObject({
      type: "invokeAction",
      actions: [
        {
          type: "editRecord",
          actionName: "editResource",
          label: "Edit resource",
          target: {
            kind: "reference",
            fieldName: "resource",
            entityName: "resource",
          },
          editView: {
            viewName: "resourceEdit",
            entityName: "resource",
            fields: [
              { fieldName: "name", editor: "text", commit: "field-commit" },
              { fieldName: "unit", editor: "enum", commit: "immediate" },
            ],
          },
        },
      ],
    });
  });

  it("resolves table ordering facts and auto-inserted move menus", () => {
    const schema = rateCardSchemaWithOrdering();
    const rateModel = requiredCollectionModel(schema, "rateHome");
    const result = rateModel.result;

    if (result.type !== "table") {
      throw new Error("Missing rate table model.");
    }

    expect(result.ordering).toMatchObject({
      fieldName: "sortOrder",
      field: schema.entities.rate?.fields.sortOrder,
      scope: [{ kind: "field", fieldName: "card" }],
      presentations: ["moveMenu"],
    });
    expect(result.columns.at(-1)).toMatchObject({
      type: "invokeAction",
      key: "invokeAction:ordering",
      label: "",
      headerLabel: "Actions",
      actions: [],
      presentation: "dropdown",
      includeOrdering: true,
      ordering: {
        fieldName: "sortOrder",
        scope: [{ fieldName: "card" }],
      },
      align: "end",
      width: "xs",
      display: "readOnly",
    });
  });

  it("auto-inserts ordering handles when drag handles are requested", () => {
    const schema = rateCardSchemaWithDragOrdering();
    const rateModel = requiredCollectionModel(schema, "rateHome");
    const result = rateModel.result;

    if (result.type !== "table") {
      throw new Error("Missing rate table model.");
    }

    expect(result.ordering?.presentations).toEqual(["dragHandle"]);
    expect(result.columns[0]).toMatchObject({
      type: "orderingHandle",
      key: "orderingHandle",
      label: "",
      headerLabel: "Reorder",
      align: "center",
      width: "xs",
      display: "readOnly",
    });
    expect(result.columns.some((column) => column.key === "invokeAction:ordering")).toBe(false);
  });

  it("resolves result-level ordering models for list, table, and tree results", () => {
    const ordering = {
      field: "sortOrder",
      scope: [{ kind: "field" as const, field: "card" }],
      presentations: ["moveMenu" as const],
    };
    const listSchema = rateCardSchemaWithRateHomeResult({
      type: "list",
      itemView: "rateListItem",
      ordering,
    });
    const tableSchema = rateCardSchemaWithRateHomeResult({
      type: "table",
      tableView: "rateTable",
      ordering,
    });
    const siteHome = siteSourceSchema.views.siteCompositionHome;

    if (siteHome?.type !== "collection" || siteHome.result.type !== "tree") {
      throw new Error("Missing site tree fixture.");
    }

    const treeSchema = parseAppSchema({
      ...siteSourceSchema,
      views: {
        ...siteSourceSchema.views,
        siteCompositionHome: {
          ...siteHome,
          result: {
            ...siteHome.result,
            ordering: {
              field: "order",
              scope: [{ kind: "field", field: "parent" }],
              presentations: ["dragHandle"],
            },
          },
        },
      },
    });
    const listResult = requiredCollectionModel(listSchema, "rateHome").result;
    const tableResult = requiredCollectionModel(tableSchema, "rateHome").result;
    const treeResult = requiredCollectionModel(treeSchema, "siteCompositionHome").result;

    expect(listResult.type === "list" ? listResult.ordering : undefined).toMatchObject({
      fieldName: "sortOrder",
      scope: [{ fieldName: "card" }],
      presentations: ["moveMenu"],
    });
    expect(tableResult.type === "table" ? tableResult.ordering : undefined).toMatchObject({
      fieldName: "sortOrder",
      scope: [{ fieldName: "card" }],
      presentations: ["moveMenu"],
    });
    expect(tableResult.type === "table" ? tableResult.columns.at(-1) : undefined).toMatchObject({
      type: "invokeAction",
      key: "invokeAction:ordering",
    });
    expect(treeResult.type === "tree" ? treeResult.ordering : undefined).toMatchObject({
      fieldName: "order",
      scope: [{ fieldName: "parent" }],
      presentations: ["dragHandle"],
    });
  });

  it("resolves the source rate-card read-model slots", () => {
    const rateModel = selectCollectionModels(rateCardSchema).find(
      (model) => model.viewName === "rateHome",
    );

    if (!rateModel || rateModel.result.type !== "table") {
      throw new Error("Missing rate table model.");
    }

    expect(rateModel.queryTabs).toMatchObject([
      {
        queryName: "ratesForSelectedCard",
        label: "Selected card",
        count: { type: "count" },
        query: {
          kind: "where",
          ref: { kind: "value", name: "card" },
          op: "eq",
          value: { kind: "context", name: "card" },
        },
      },
    ]);
    expect(
      rateModel.result.columns.map((column) => ({
        type: column.type,
        key: column.key,
        label: column.label,
        display: column.display,
        suffix: column.suffix ?? null,
        format: column.format,
      })),
    ).toEqual([
      {
        type: "referenceField",
        key: "referenceField:resource.name",
        label: "Role",
        display: "editor",
        suffix: null,
        format: "plain",
      },
      {
        type: "field",
        key: "field:cost",
        label: "Cost",
        display: "editor",
        suffix: null,
        format: "number",
      },
      {
        type: "field",
        key: "field:costUnit",
        label: "Cost unit",
        display: "hidden",
        suffix: null,
        format: "plain",
      },
      {
        type: "field",
        key: "field:price",
        label: "Price",
        display: "editor",
        suffix: "/ day",
        format: "currency",
      },
      {
        type: "computed",
        key: "computed:rateMargin",
        label: "Margin",
        display: "readOnly",
        suffix: null,
        format: "percent",
      },
    ]);
    expect(rateModel.result.type === "table" ? rateModel.result.footer : []).toMatchObject([
      {
        type: "aggregate",
        key: "aggregate:selectedCardAverageCost",
        columnKey: "field:cost",
        aggregateName: "selectedCardAverageCost",
        label: "Average cost",
        suffix: "/ day",
        format: "currency",
      },
      {
        type: "aggregate",
        key: "aggregate:selectedCardAveragePrice",
        columnKey: "field:price",
        aggregateName: "selectedCardAveragePrice",
        label: "Average price",
        suffix: "/ day",
        format: "currency",
      },
      {
        type: "aggregate",
        key: "aggregate:selectedCardAverageMargin",
        columnKey: "computed:rateMargin",
        aggregateName: "selectedCardAverageMargin",
        label: "Average margin",
        format: "percent",
      },
    ]);
  });

  it("resolves read-only computed table columns", () => {
    const schema = rateCardSchemaWithComputedMarginColumn();
    const rateModel = selectCollectionModels(schema).find((model) => model.viewName === "rateHome");

    if (!rateModel || rateModel.result.type !== "table") {
      throw new Error("Missing rate table model.");
    }

    const computedColumn = rateModel.result.columns.at(-1);

    expect(computedColumn).toMatchObject({
      type: "computed",
      key: "computed:rateMargin",
      computedValueName: "rateMargin",
      computedValue: schema.readModels?.computedValues?.rateMargin,
      label: "Margin",
      align: "end",
      width: "sm",
      display: "readOnly",
      suffix: "margin",
      format: "percent",
    });
    expect(computedColumn && "editor" in computedColumn).toBe(false);
    expect(computedColumn && "commit" in computedColumn).toBe(false);
  });

  it("resolves aggregate summary slots for collections", () => {
    const schema = rateCardSchemaWithAggregateSummarySlots();
    const rateModel = selectCollectionModels(schema).find((model) => model.viewName === "rateHome");

    expect(rateModel?.collection.summary).toMatchObject([
      {
        type: "aggregate",
        key: "aggregate:selectedCardCostTotal",
        aggregateName: "selectedCardCostTotal",
        aggregate: {
          query: "ratesForSelectedCard",
          function: "sum",
          value: { kind: "field", field: "cost" },
        },
        label: "Cost total",
        suffix: "/ day",
        format: "currency",
      },
      {
        type: "aggregate",
        key: "aggregate:selectedCardAverageMargin",
        aggregateName: "selectedCardAverageMargin",
        aggregate: {
          query: "ratesForSelectedCard",
          function: "average",
          value: { kind: "computed", computedValue: "rateMargin" },
        },
        label: "Average margin",
        format: "percent",
      },
    ]);
    expect(rateModel?.collection.summary?.[1]?.computedValues.rateMargin).toEqual(
      schema.readModels?.computedValues?.rateMargin,
    );
  });

  it("keeps summary absent when a collection has no summary slots", () => {
    const rateModel = selectCollectionModels(rateCardSchema).find(
      (model) => model.viewName === "resourceHome",
    );

    expect("summary" in (rateModel?.collection ?? {})).toBe(false);
  });

  it("characterizes rate value/unit editing over flat scalar fields", () => {
    const rate = rateCardSchema.entities.rate;
    const rateModel = selectCollectionModels(rateCardSchema).find(
      (model) => model.viewName === "rateHome",
    );
    const columns = rateModel?.result.type === "table" ? rateModel.result.columns : [];
    const seedRate = rateSeedRecords.find((record) => record.entity === "rate");

    if (!seedRate) {
      throw new Error("Missing seed rate.");
    }

    expect(rate.fields.cost).toMatchObject({ type: "number", required: true });
    expect(rate.fields.costUnit).toMatchObject({ type: "enum", required: true });
    expect(rate.fields.price).toMatchObject({ type: "number", required: true });
    expect(rate.fields.currency).toMatchObject({ type: "enum", required: true });
    expect(
      columns.find((column) => column.type === "field" && column.fieldName === "cost"),
    ).toMatchObject({
      editor: "number",
      format: "number",
      display: "editor",
      valueUnit: {
        unitFieldName: "costUnit",
        unitField: rate.fields.costUnit,
      },
    });
    expect(
      columns.find((column) => column.type === "field" && column.fieldName === "cost")?.suffix,
    ).toBeUndefined();
    expect(
      columns.find((column) => column.type === "field" && column.fieldName === "costUnit"),
    ).toMatchObject({
      editor: "enum",
      display: "hidden",
    });
    expect(
      columns.find((column) => column.type === "field" && column.fieldName === "price"),
    ).toMatchObject({
      editor: "number",
      suffix: "/ day",
      format: "currency",
      display: "editor",
    });
    expect(findFieldTableColumn(columns, "price")?.valueUnit).toBeUndefined();
    expect(
      columns.find((column) => column.type === "field" && column.fieldName === "currency"),
    ).toBeUndefined();
    expect(typeof seedRate.values.cost).toBe("number");
    expect(typeof seedRate.values.costUnit).toBe("string");
    expect(typeof seedRate.values.price).toBe("number");
    expect(typeof seedRate.values.currency).toBe("string");
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

    expect(tableColumnEditors(columns)).toEqual(["text", "boolean", "date", "number", "enum"]);
    expect(tableColumnCommits(columns)).toEqual([
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
      presentation: "tabs",
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
    expect(rateModel?.context?.relatedCollection).toBeUndefined();
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

  it("omits the source rate-card regenerate action from the primary view", () => {
    const rateModel = selectCollectionModels(rateCardSchema).find(
      (model) => model.viewName === "rateHome",
    );

    expect(rateModel?.actions.map((candidate) => candidate.label)).toEqual(["Create Resource"]);
    expect(rateModel?.actions.some((candidate) => candidate.type === "entity-action")).toBe(false);
  });

  it("characterizes the rate-card primary home model contract", () => {
    const model = requiredCollectionModel(rateCardSchema, "rateHome");

    if (!model) {
      throw new Error("Missing rate-card home model.");
    }

    expect(summarizeHomeModel(model)).toEqual({
      viewName: "rateHome",
      label: "Rates",
      entityName: "rate",
      navigationPrimary: true,
      context: {
        name: "card",
        entityName: "card",
        queryName: "cardAll",
        labelField: "name",
        presentation: "tabs",
        relatedCollection: null,
        createAction: {
          type: "create",
          label: "Create Rate card",
          entityName: "card",
          fields: ["name"],
          defaults: [],
          enabled: true,
        },
        itemViewName: "rateCardContextItem",
        recordFields: ["marginMin", "marginMed", "marginMax"],
      },
      queries: [
        {
          queryName: "ratesForSelectedCard",
          label: "Selected card",
          count: "count",
          expressionKind: "where",
        },
      ],
      defaultQueryName: "ratesForSelectedCard",
      result: {
        type: "table",
        tableViewName: "rateTable",
        columns: [
          "referenceField:resource.name",
          "field:cost",
          "field:costUnit",
          "field:price",
          "computed:rateMargin",
        ],
        footer: [
          {
            columnKey: "field:cost",
            aggregateName: "selectedCardAverageCost",
            label: "Average cost",
          },
          {
            columnKey: "field:price",
            aggregateName: "selectedCardAveragePrice",
            label: "Average price",
          },
          {
            columnKey: "computed:rateMargin",
            aggregateName: "selectedCardAverageMargin",
            label: "Average margin",
          },
        ],
      },
      actions: [
        {
          type: "create",
          label: "Create Resource",
          entityName: "resource",
          fields: ["name"],
          defaults: [],
          enabled: true,
        },
      ],
    });
  });

  it("selects the site root authoring collections as primary collection models", () => {
    const models = selectPrimaryCollectionModels(siteSourceSchema);

    expect(models.map((model) => model.viewName)).toEqual(["siteCompositionHome"]);
    expect(models.map((model) => model.label)).toEqual(["Site"]);
    expect(models.map((model) => model.navigation.primary)).toEqual([true]);
    expect(models.map((model) => model.context?.queryName)).toEqual(["blockSiteRoots"]);
    expect(models.map((model) => model.context?.label)).toEqual(["Site roots"]);
    expect(models.map((model) => model.context?.presentation)).toEqual(["listDetail"]);
    expect(
      models.map((model) => model.context?.navigation?.groups.map((group) => group.label)),
    ).toEqual([["Pages", "Navigation"]]);
    expect(models.map((model) => model.result.type)).toEqual(["tree"]);
    expect(requiredCollectionModel(siteSourceSchema, "blockHome").navigation.primary).toBe(false);
    expect(
      requiredCollectionModel(siteSourceSchema, "pageCompositionHome").navigation.primary,
    ).toBe(false);
    expect(
      requiredCollectionModel(siteSourceSchema, "navigationCompositionHome").navigation.primary,
    ).toBe(false);
    expect(
      requiredCollectionModel(siteSourceSchema, "blockCompositionHome").navigation.primary,
    ).toBe(false);
  });

  it("characterizes the site root authoring model contracts", () => {
    const models = selectPrimaryCollectionModels(siteSourceSchema);

    expect(models.map(summarizeHomeModel)).toEqual([
      {
        viewName: "siteCompositionHome",
        label: "Site",
        entityName: "blockPlacement",
        navigationPrimary: true,
        context: {
          name: "block",
          entityName: "block",
          queryName: "blockSiteRoots",
          labelField: "label",
          presentation: "listDetail",
          relatedCollection: {
            relationshipName: "blockPlacements",
            label: "Placements",
            entityName: "blockPlacement",
            referenceFieldName: "parent",
          },
          createAction: null,
          itemViewName: "blockRootDetail",
          recordFields: ["type", "label"],
        },
        queries: [
          {
            queryName: "placementsForSelectedBlock",
            label: "Selected block",
            count: "count",
            expressionKind: "where",
          },
        ],
        defaultQueryName: "placementsForSelectedBlock",
        result: {
          type: "tree",
          relationshipName: "blockPlacements",
          childFieldName: "block",
          childItemViewName: "blockTreeNode",
          childFields: ["label"],
          placementItemViewName: "blockPlacementTreeItem",
          placementFields: ["label"],
          orderingField: "order",
          orderingPresentations: ["dragHandle", "moveMenu"],
          maxDepth: 8,
        },
        actions: [
          {
            type: "create",
            label: "Add placement",
            entityName: "blockPlacement",
            fields: ["block", "label"],
            defaults: ["parent"],
            enabled: true,
          },
        ],
      },
    ]);
  });

  it("resolves Site placement ordering controls", () => {
    const placementModel = requiredCollectionModel(siteSourceSchema, "pageCompositionHome");
    const columns = placementModel.result.type === "table" ? placementModel.result.columns : [];

    expect(siteSourceSchema.entities.blockPlacement.fields.order).toMatchObject({
      type: "number",
      required: true,
      default: 1000,
      min: 0,
    });
    expect(
      placementModel.result.type === "table" ? placementModel.result.ordering : undefined,
    ).toMatchObject({
      fieldName: "order",
      scope: [{ fieldName: "parent" }],
      presentations: ["dragHandle", "moveMenu"],
    });
    expect(
      columns.map((column) => ({
        type: column.type,
        key: column.key,
        label: column.label,
        editor: tableColumnEditor(column),
        commit: tableColumnCommit(column),
        display: column.display,
        align: column.align ?? null,
        width: column.width ?? null,
        format: column.format,
      })),
    ).toEqual([
      {
        type: "orderingHandle",
        key: "orderingHandle",
        label: "",
        editor: null,
        commit: null,
        display: "readOnly",
        align: "center",
        width: "xs",
        format: "plain",
      },
      {
        type: "field",
        key: "field:block",
        label: "Child block",
        editor: "reference",
        commit: "immediate",
        display: "editor",
        align: null,
        width: "lg",
        format: "plain",
      },
      {
        type: "field",
        key: "field:label",
        label: "Label",
        editor: "text",
        commit: "field-commit",
        display: "editor",
        align: null,
        width: "md",
        format: "plain",
      },
      {
        type: "invokeAction",
        key: "invokeAction:editChildBlock,ordering",
        label: "",
        editor: null,
        commit: null,
        display: "readOnly",
        align: "end",
        width: "xs",
        format: "plain",
      },
    ]);
  });

  it("resolves site content table columns and variant-aware create fields", () => {
    const contentModel = selectCollectionModels(siteSourceSchema).find(
      (model) => model.viewName === "blockHome",
    );
    const create = contentModel?.actions.find((action) => action.type === "create");
    const createVariantFields = Object.fromEntries(
      create?.type === "create"
        ? (create.union?.variants.map((variant) => [
            variant.variantValue,
            variant.presentation.fields.map((field) => field.fieldName),
          ]) ?? [])
        : [],
    );

    expect(contentModel?.queryTabs.map((tab) => tab.queryName)).toEqual([
      "blockAll",
      "blockPages",
      "blockPosts",
      "blockProjects",
      "blockLinks",
      "blockGroups",
      "blockImages",
      "blockVideos",
      "blockFiles",
    ]);
    expect(
      contentModel?.result.type === "table"
        ? contentModel.result.columns.map((column) => column.key)
        : [],
    ).toEqual([
      "field:type",
      "field:label",
      "field:body",
      "field:href",
      "field:templateKey",
      "field:icon",
      "field:color",
      "field:width",
      "field:height",
    ]);
    expect(
      contentModel?.result.type === "table" ? tableColumnEditors(contentModel.result.columns) : [],
    ).toEqual(["enum", "text", "markdown", "href", "slug", "icon", "color", "number", "number"]);
    expect(create?.type === "create" ? create.fields.map((field) => field.fieldName) : []).toEqual([
      "type",
      "label",
    ]);
    expect(create?.type === "create" ? create.union?.unionName : undefined).toBe("blockByType");
    expect(createVariantFields).toMatchObject({
      link: ["href", "icon", "color"],
      markdown: ["body", "templateKey"],
      image: ["href", "width", "height"],
    });
  });

  it("characterizes site authoring rich text fields as string-backed editor hints", () => {
    const block = siteSourceSchema.entities.block;
    const contentModel = selectCollectionModels(siteSourceSchema).find(
      (model) => model.viewName === "blockHome",
    );
    const create = contentModel?.actions.find((action) => action.type === "create");
    const createEditors =
      create?.type === "create"
        ? Object.fromEntries(create.fields.map((field) => [field.fieldName, field.editor]))
        : {};
    const createVariantEditors = Object.fromEntries(
      create?.type === "create"
        ? (create.union?.variants.map((variant) => [
            variant.variantValue,
            Object.fromEntries(
              variant.presentation.fields.map((field) => [field.fieldName, field.editor]),
            ),
          ]) ?? [])
        : [],
    );
    const tableEditors =
      contentModel?.result.type === "table"
        ? Object.fromEntries(
            contentModel.result.columns
              .filter((column) => column.type === "field" || column.type === "referenceField")
              .map((column) => [column.fieldName, column.editor]),
          )
        : {};

    expect(block.fields.body).toMatchObject({ type: "text", format: "markdown" });
    expect(block.fields.color).toMatchObject({ type: "text", format: "color" });
    expect(block.fields.href).toMatchObject({ type: "text", format: "href" });
    expect(block.fields.icon).toMatchObject({ type: "text", format: "icon" });
    expect(createEditors).toMatchObject({
      label: "text",
      type: "enum",
    });
    expect(createVariantEditors).toMatchObject({
      link: {
        href: "href",
        icon: "icon",
        color: "color",
      },
      markdown: {
        body: "markdown",
      },
    });
    expect(tableEditors).toMatchObject({
      label: "text",
      body: "markdown",
      href: "href",
      icon: "icon",
      color: "color",
    });
  });

  it("resolves the site scoped block composition context", () => {
    const compositionModel = selectCollectionModels(siteSourceSchema).find(
      (model) => model.viewName === "blockCompositionHome",
    );

    expect(compositionModel?.context).toMatchObject({
      name: "block",
      entityName: "block",
      queryName: "blockAll",
      query: siteSourceSchema.queries.blockAll?.expression,
      labelField: "label",
      presentation: "tabs",
      relatedCollection: {
        relationshipName: "blockPlacements",
        relationship: {
          kind: "toMany",
          from: { entity: "block" },
          to: { entity: "blockPlacement", field: "parent" },
        },
      },
      itemViewName: "blockContextItem",
      recordFields: [{ fieldName: "label" }, { fieldName: "type" }],
    });
    expect(compositionModel?.actions[0]).toMatchObject({
      type: "create",
      label: "Add placement",
      entityName: "blockPlacement",
      defaults: [{ fieldName: "parent", value: { kind: "context", name: "block" } }],
    });
  });

  it("selects screen models in schema order and filters primary screens", () => {
    const models = selectScreenModels(rateCardSchema);

    expect(models.map(summarizeScreenModel)).toEqual([
      {
        screenName: "rateHome",
        label: "Rates",
        primary: true,
        layoutType: "stack",
        sections: [{ id: "rates", label: "Rates", viewName: "rateHome", entityName: "rate" }],
      },
      {
        screenName: "rateSetup",
        label: "Setup",
        primary: true,
        layoutType: "stack",
        sections: [
          { id: "cards", label: "Rate cards", viewName: "cardHome", entityName: "card" },
          {
            id: "resources",
            label: "Resources",
            viewName: "resourceHome",
            entityName: "resource",
          },
        ],
      },
    ]);
    expect(selectPrimaryScreenModels(rateCardSchema).map((model) => model.screenName)).toEqual([
      "rateHome",
      "rateSetup",
    ]);
  });

  it("exposes route-ready screen paths and selects models by path", () => {
    expect(
      selectPrimaryScreenModels(rateCardSchema).map((model) => ({
        screenName: model.screenName,
        path: model.path,
      })),
    ).toEqual([
      { screenName: "rateHome", path: "/" },
      { screenName: "rateSetup", path: "/setup" },
    ]);
    expect(selectScreenModelByPath(rateCardSchema, "/setup")?.screenName).toBe("rateSetup");
    expect(selectScreenModelByPath(rateCardSchema, "/missing")).toBeUndefined();
  });

  it("uses the app root path for the first primary screen when paths are omitted", () => {
    const { path: _homePath, ...rateHomeWithoutPath } = rateCardSchema.screens!.rateHome;
    const { path: _setupPath, ...rateSetupWithoutPath } = rateCardSchema.screens!.rateSetup;
    const pathlessRateSchema: AppSchema = {
      ...rateCardSchema,
      screens: {
        rateHome: rateHomeWithoutPath,
        rateSetup: rateSetupWithoutPath,
      },
    };

    expect(
      selectScreenModels(pathlessRateSchema).map((model) => ({
        screenName: model.screenName,
        path: model.path,
      })),
    ).toEqual([
      { screenName: "rateHome", path: "/" },
      { screenName: "rateSetup", path: undefined },
    ]);
    expect(selectScreenModelByPath(pathlessRateSchema, "/")?.screenName).toBe("rateHome");
  });

  it("exposes render-ready collection facts on screen sections", () => {
    const setupScreen = selectScreenModels(rateCardSchema).find(
      (model) => model.screenName === "rateSetup",
    );
    const cardsSection = setupScreen?.layout.sections[0];
    const resourcesSection = setupScreen?.layout.sections[1];

    expect(cardsSection).toMatchObject({
      id: "cards",
      type: "collection",
      label: "Rate cards",
      viewName: "cardHome",
      collection: {
        entityName: "card",
        queries: { defaultQueryName: "cardAll" },
        result: { type: "list", itemViewName: "cardListItem" },
      },
    });
    expect(resourcesSection).toMatchObject({
      id: "resources",
      type: "collection",
      label: "Resources",
      viewName: "resourceHome",
      collection: {
        entityName: "resource",
        queries: { defaultQueryName: "resourceAll" },
        actions: [{ type: "create", entityName: "resource" }],
      },
    });
  });

  it("selects site editor as the primary screen model", () => {
    const models = selectPrimaryScreenModels(siteSourceSchema);

    expect(models.map((model) => ({ screenName: model.screenName, path: model.path }))).toEqual([
      { screenName: "siteEditor", path: "/" },
    ]);
    expect(models.map(summarizeScreenModel)).toEqual([
      {
        screenName: "siteEditor",
        label: "Site",
        primary: true,
        layoutType: "stack",
        sections: [
          {
            id: "site",
            label: "Site",
            viewName: "siteCompositionHome",
            entityName: "blockPlacement",
          },
        ],
      },
    ]);
  });

  it("builds legacy screen models from primary collection models when screens are absent", () => {
    const schemaWithoutScreens: AppSchema = { ...siteSourceSchema, screens: undefined };
    const collectionModels = selectPrimaryCollectionModels(schemaWithoutScreens);
    const screenModels = selectScreenModels(schemaWithoutScreens);

    expect(screenModels.map((model) => model.screenName)).toEqual(
      collectionModels.map((model) => model.viewName),
    );
    expect(
      selectPrimaryScreenModels(schemaWithoutScreens).map((model) => model.screenName),
    ).toEqual(["siteCompositionHome"]);
    expect(screenModels.map(summarizeScreenModel)).toEqual([
      {
        screenName: "siteCompositionHome",
        label: "Site",
        primary: true,
        layoutType: "stack",
        sections: [
          {
            id: "siteCompositionHome",
            label: "Site",
            viewName: "siteCompositionHome",
            entityName: "blockPlacement",
          },
        ],
      },
    ]);
  });

  it("selects relationship-backed related collections for an entity", () => {
    expect(selectRelatedCollectionModels(rateCardSchema, "card")).toMatchObject([
      {
        relationshipName: "cardRates",
        label: "Rates",
        entityName: "rate",
        referenceFieldName: "card",
      },
    ]);
    expect(selectRelatedCollectionModels(siteSourceSchema, "block")).toMatchObject([
      {
        relationshipName: "blockPlacements",
        label: "Placements",
        entityName: "blockPlacement",
        referenceFieldName: "parent",
      },
      {
        relationshipName: "blockUsedInPlacements",
        label: "Used in placements",
        entityName: "blockPlacement",
        referenceFieldName: "block",
      },
    ]);
  });
});

function rateCardSchemaWithComputedMarginColumn(): AppSchema {
  const rateTable = rateCardSchema.tableViews.rateTable;

  return {
    ...rateCardSchema,
    readModels: {
      computedValues: {
        rateMargin: {
          entity: "rate",
          type: "number",
          expression: rateMarginExpression(),
        },
      },
      aggregates: rateCardSchema.readModels?.aggregates ?? {},
    },
    tableViews: {
      ...rateCardSchema.tableViews,
      rateTable: {
        ...rateTable,
        columns: [
          ...rateTable.columns,
          {
            type: "computed",
            computedValue: "rateMargin",
            label: "Margin",
            align: "end",
            width: "sm",
            suffix: "margin",
            format: "percent",
          },
        ],
      },
    },
  };
}

function rateCardSchemaWithOrdering(): AppSchema {
  const rateTable = rateCardSchema.tableViews.rateTable;
  const rateEntity = rateCardSchema.entities.rate;

  return parseAppSchema({
    ...rateCardSchema,
    entities: {
      ...rateCardSchema.entities,
      rate: {
        ...rateEntity,
        fields: {
          ...rateEntity.fields,
          sortOrder: {
            type: "number",
            required: true,
            label: "Sort order",
            default: 1000,
            min: 0,
          },
        },
      },
    },
    tableViews: {
      ...rateCardSchema.tableViews,
      rateTable: {
        ...rateTable,
        ordering: {
          field: "sortOrder",
          scope: [{ kind: "field", field: "card" }],
          presentations: ["moveMenu"],
        },
      },
    },
  });
}

function rateCardSchemaWithDragOrdering(): AppSchema {
  const schema = rateCardSchemaWithOrdering();

  return parseAppSchema({
    ...schema,
    tableViews: {
      ...schema.tableViews,
      rateTable: {
        ...schema.tableViews.rateTable,
        ordering: {
          field: "sortOrder",
          scope: [{ kind: "field", field: "card" }],
          presentations: ["dragHandle"],
        },
      },
    },
  });
}

function rateCardSchemaWithRateHomeResult(
  result: Extract<AppSchema["views"][string], { type: "collection" }>["result"],
): AppSchema {
  const rateHome = rateCardSchema.views.rateHome;
  const rateEntity = rateCardSchema.entities.rate;

  if (rateHome?.type !== "collection") {
    throw new Error("Missing rate home fixture.");
  }

  return parseAppSchema({
    ...rateCardSchema,
    entities: {
      ...rateCardSchema.entities,
      rate: {
        ...rateEntity,
        fields: {
          ...rateEntity.fields,
          sortOrder: {
            type: "number",
            required: true,
            label: "Sort order",
            default: 1000,
            min: 0,
          },
        },
      },
    },
    views: {
      ...rateCardSchema.views,
      rateHome: {
        ...rateHome,
        result,
      },
    },
  });
}

function rateCardSchemaWithAggregateSummarySlots(): AppSchema {
  const rateHome = rateCardSchema.views.rateHome as Extract<
    AppSchema["views"][string],
    { type: "collection" }
  >;

  return {
    ...rateCardSchema,
    readModels: {
      computedValues: {
        rateMargin: {
          entity: "rate",
          type: "number",
          expression: rateMarginExpression(),
        },
      },
      aggregates: {
        selectedCardCostTotal: {
          query: "ratesForSelectedCard",
          function: "sum",
          value: { kind: "field", field: "cost" },
        },
        selectedCardAverageMargin: {
          query: "ratesForSelectedCard",
          function: "average",
          value: { kind: "computed", computedValue: "rateMargin" },
        },
      },
    },
    views: {
      ...rateCardSchema.views,
      rateHome: {
        ...rateHome,
        result:
          rateHome.result.type === "table"
            ? { type: "table", tableView: rateHome.result.tableView }
            : rateHome.result,
        summary: [
          {
            type: "aggregate",
            aggregate: "selectedCardCostTotal",
            label: "Cost total",
            suffix: "/ day",
            format: "currency",
          },
          {
            type: "aggregate",
            aggregate: "selectedCardAverageMargin",
            label: "Average margin",
            format: "percent",
          },
        ],
      },
    },
  };
}

function rateMarginExpression(): NumericExpression {
  return {
    kind: "binary",
    op: "divide",
    left: {
      kind: "binary",
      op: "subtract",
      left: { kind: "field", field: "price" },
      right: { kind: "field", field: "cost" },
    },
    right: { kind: "field", field: "price" },
  };
}

function tableColumnEditors(columns: TableColumnConfig[]) {
  return columns.map(tableColumnEditor);
}

function tableColumnCommits(columns: TableColumnConfig[]) {
  return columns.map(tableColumnCommit);
}

function tableColumnEditor(column: TableColumnConfig) {
  if (column.type !== "field" && column.type !== "referenceField") {
    return null;
  }

  return column.editor;
}

function tableColumnCommit(column: TableColumnConfig) {
  if (column.type !== "field" && column.type !== "referenceField") {
    return null;
  }

  return column.commit;
}

function findFieldTableColumn(columns: TableColumnConfig[], fieldName: string) {
  return columns.find(
    (column): column is FieldTableColumnConfig =>
      column.type === "field" && column.fieldName === fieldName,
  );
}

function discriminatedTaskSchema(): AppSchema {
  return parseAppSchema({
    version: 1,
    entities: {
      task: {
        label: "Task",
        fields: {
          title: { type: "text", required: true },
          done: { type: "boolean", required: true, default: false },
          kind: {
            type: "enum",
            required: true,
            default: "role",
            values: {
              role: { label: "Role" },
              stream: { label: "Stream" },
              custom: { label: "Custom" },
            },
          },
        },
        mutations: {
          create: { enabled: true },
          patch: { enabled: true },
          delete: { enabled: false },
        },
      },
    },
    unions: {
      taskByKind: {
        entity: "task",
        discriminator: "kind",
        variants: {
          role: {
            label: "Role",
            fields: ["title"],
          },
          stream: {
            label: "Stream",
            fields: ["title", "done"],
          },
        },
        fallback: {
          label: "Task",
          fields: ["title", "kind"],
        },
      },
    },
    queries: {
      taskAll: {
        label: "All",
        entity: "task",
        expression: { kind: "all" },
      },
    },
    itemViews: {
      taskVariantItem: {
        entity: "task",
        fields: {
          kind: { editor: "enum", commit: "immediate" },
        },
        union: "taskByKind",
        variants: {
          role: {
            presentation: "fields",
            fields: {
              title: { editor: "text", commit: "field-commit" },
            },
          },
          stream: {
            presentation: "contextLink",
            labelField: "title",
            target: { kind: "selectContext", context: "task", record: "self" },
          },
        },
        fallback: {
          presentation: "fields",
          fields: {
            kind: { editor: "enum", commit: "immediate" },
          },
        },
      },
    },
    tableViews: {
      taskEditTable: {
        entity: "task",
        actions: {
          editTask: {
            type: "editRecord",
            label: "Edit task",
            target: { kind: "row" },
            editView: "taskEdit",
          },
        },
        columns: [
          { type: "field", field: "title" },
          { type: "invokeAction", action: "editTask" },
        ],
      },
    },
    views: {
      taskHome: {
        type: "collection",
        label: "Tasks",
        entity: "task",
        queries: [{ query: "taskAll" }],
        defaultQuery: "taskAll",
        result: { type: "list", itemView: "taskVariantItem" },
        actions: [{ type: "create", createView: "taskCreate" }],
      },
      taskEditHome: {
        type: "collection",
        label: "Task edits",
        entity: "task",
        navigation: { primary: false },
        queries: [{ query: "taskAll" }],
        defaultQuery: "taskAll",
        result: { type: "table", tableView: "taskEditTable" },
      },
      taskCreate: {
        type: "create",
        entity: "task",
        fields: {
          title: { editor: "text" },
          kind: { editor: "enum" },
        },
        union: "taskByKind",
        variants: {
          role: {
            presentation: "fields",
            fields: {
              title: { editor: "text" },
            },
          },
          stream: {
            presentation: "fields",
            fields: {
              done: { editor: "boolean" },
            },
          },
        },
        fallback: {
          presentation: "fields",
          fields: {
            kind: { editor: "enum" },
          },
        },
      },
      taskEdit: {
        type: "edit",
        entity: "task",
        fields: {
          kind: { editor: "enum", commit: "immediate" },
        },
        union: "taskByKind",
        variants: {
          role: {
            presentation: "fields",
            fields: {
              title: { editor: "text", commit: "field-commit" },
            },
          },
          stream: {
            presentation: "fields",
            fields: {
              done: { editor: "boolean", commit: "immediate" },
            },
          },
        },
        fallback: {
          presentation: "fields",
          fields: {
            kind: { editor: "enum", commit: "immediate" },
          },
        },
      },
    },
  });
}

function summarizeHomeModel(model: HomeViewModel) {
  const collection = model.collection;

  return {
    viewName: model.viewName,
    label: model.label,
    entityName: collection.entityName,
    navigationPrimary: model.navigation.primary,
    context: collection.context
      ? {
          name: collection.context.name,
          entityName: collection.context.entityName,
          queryName: collection.context.queryName,
          labelField: collection.context.labelField,
          presentation: collection.context.presentation,
          relatedCollection: collection.context.relatedCollection
            ? {
                relationshipName: collection.context.relatedCollection.relationshipName,
                label: collection.context.relatedCollection.label,
                entityName: collection.context.relatedCollection.entityName,
                referenceFieldName: collection.context.relatedCollection.referenceFieldName,
              }
            : null,
          createAction: collection.context.createAction
            ? summarizeHomeAction(collection.context.createAction)
            : null,
          itemViewName: collection.context.itemViewName ?? null,
          recordFields: collection.context.recordFields?.map((field) => field.fieldName) ?? [],
        }
      : null,
    queries: collection.queries.tabs.map((tab) => ({
      queryName: tab.queryName,
      label: tab.label,
      count: tab.count?.type ?? null,
      expressionKind: tab.query.kind,
    })),
    defaultQueryName: collection.queries.defaultQueryName,
    result:
      collection.result.type === "list"
        ? {
            type: "list",
            itemViewName: collection.result.itemViewName,
            fields: collection.result.recordFields.map((field) => field.fieldName),
          }
        : collection.result.type === "tree"
          ? {
              type: "tree",
              relationshipName: collection.result.relationshipName,
              childFieldName: collection.result.childFieldName,
              childItemViewName: collection.result.childItemViewName,
              childFields: collection.result.childRecordFields.map((field) => field.fieldName),
              placementItemViewName: collection.result.placementItemViewName,
              placementFields:
                collection.result.placementRecordFields?.map((field) => field.fieldName) ?? [],
              orderingField: collection.result.ordering?.fieldName ?? null,
              orderingPresentations: collection.result.ordering?.presentations ?? [],
              maxDepth: collection.result.maxDepth,
            }
          : {
              type: "table",
              tableViewName: collection.result.tableViewName,
              columns: collection.result.columns.map((column) => column.key),
              footer: collection.result.footer?.map((slot) => ({
                columnKey: slot.columnKey,
                aggregateName: slot.aggregateName,
                label: slot.label,
              })),
            },
    actions: collection.actions.map(summarizeHomeAction),
  };
}

function requiredCollectionModel(schema: AppSchema, viewName: string) {
  const model = selectCollectionModels(schema).find((candidate) => candidate.viewName === viewName);

  if (!model) {
    throw new Error(`Missing collection model ${viewName}.`);
  }

  return model;
}

function summarizeScreenModel(model: HomeScreenModel) {
  return {
    screenName: model.screenName,
    label: model.label,
    primary: model.navigation.primary,
    layoutType: model.layout.type,
    sections: model.layout.sections.map((section) => ({
      id: section.id,
      label: section.label,
      viewName: section.viewName,
      entityName: section.collection.entityName,
    })),
  };
}

function summarizeHomeAction(action: HomeActionConfig) {
  if (action.type === "create") {
    return {
      type: action.type,
      label: action.label,
      entityName: action.entityName,
      fields: action.fields.map((field) => field.fieldName),
      defaults: action.defaults.map((defaultValue) => defaultValue.fieldName),
      enabled: action.enabled,
    };
  }

  return {
    type: action.type,
    label: action.label,
    entityName: action.entityName,
    actionName: action.actionName,
    actionKind: action.action.kind,
    showAffectedCountOnSuccess: action.ui.showAffectedCountOnSuccess,
    targetCountQueryKind: action.ui.targetCount?.query.kind ?? null,
    targetCountDisplay: action.ui.targetCount?.display.type ?? null,
  };
}
