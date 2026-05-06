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
  selectScreenModels,
  type FieldTableColumnConfig,
  type HomeActionConfig,
  type HomeScreenModel,
  type HomeViewModel,
  type TableColumnConfig,
} from "./views.ts";
import type { AppSchema } from "../shared/schema.ts";
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
        relatedCollection: {
          relationshipName: "cardRates",
          entityName: "rate",
          referenceFieldName: "card",
        },
      },
      result: {
        type: "table",
        tableViewName: "rateTable",
      },
      actions: [
        { type: "create", entityName: "resource" },
        { type: "entity-action", actionName: "regenerateMissingRates" },
      ],
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
      "field:currency",
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
    ).toMatchObject({
      unitFieldName: "currency",
      unitField: rateCardSchema.entities.rate?.fields.currency,
    });
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
      "Currency",
    ]);
    expect(tableColumnEditors(columns)).toEqual(["text", "number", "enum", "number", null, "enum"]);
    expect(tableColumnCommits(columns)).toEqual([
      "field-commit",
      "field-commit",
      "immediate",
      "field-commit",
      null,
      "immediate",
    ]);
    expect(columns.map((column) => column.align ?? "start")).toEqual([
      "start",
      "end",
      "start",
      "end",
      "end",
      "start",
    ]);
    expect(columns.map((column) => column.width ?? "none")).toEqual([
      "lg",
      "sm",
      "xs",
      "sm",
      "sm",
      "xs",
    ]);
    expect(columns.map((column) => column.display)).toEqual([
      "editor",
      "editor",
      "hidden",
      "editor",
      "readOnly",
      "hidden",
    ]);
    expect(columns.map((column) => column.suffix ?? "")).toEqual([
      "",
      "/ day",
      "",
      "/ day",
      "",
      "",
    ]);
    expect(columns.map((column) => column.format)).toEqual([
      "plain",
      "number",
      "plain",
      "currency",
      "percent",
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
        suffix: "/ day",
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
      {
        type: "field",
        key: "field:currency",
        label: "Currency",
        display: "hidden",
        suffix: null,
        format: "plain",
      },
    ]);
    expect(rateModel.collection.summary).toMatchObject([
      {
        type: "aggregate",
        key: "aggregate:selectedCardCostTotal",
        aggregateName: "selectedCardCostTotal",
        label: "Cost total",
        suffix: "/ day",
        format: "currency",
      },
      {
        type: "aggregate",
        key: "aggregate:selectedCardPriceTotal",
        aggregateName: "selectedCardPriceTotal",
        label: "Price total",
        suffix: "/ day",
        format: "currency",
      },
      {
        type: "aggregate",
        key: "aggregate:selectedCardAverageMargin",
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

  it("characterizes paired rate value/unit editing over flat scalar fields", () => {
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
      suffix: "/ day",
      format: "number",
      display: "editor",
      valueUnit: {
        unitFieldName: "costUnit",
        unitField: rate.fields.costUnit,
      },
    });
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
      valueUnit: {
        unitFieldName: "currency",
        unitField: rate.fields.currency,
      },
    });
    expect(
      columns.find((column) => column.type === "field" && column.fieldName === "currency"),
    ).toMatchObject({
      editor: "enum",
      display: "hidden",
    });
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
      relatedCollection: {
        relationshipName: "cardRates",
        relationship: {
          kind: "toMany",
          from: { entity: "card" },
          to: { entity: "rate", field: "card" },
        },
        label: "Rates",
        entityName: "rate",
        referenceFieldName: "card",
      },
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
      ui: {
        showAffectedCountOnSuccess: false,
      },
    });
    expect(action?.type === "entity-action" ? action.ui.targetCount : undefined).toBeUndefined();
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
        relatedCollection: {
          relationshipName: "cardRates",
          label: "Rates",
          entityName: "rate",
          referenceFieldName: "card",
        },
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
          "field:currency",
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
        {
          type: "entity-action",
          label: "Regenerate missing rates",
          entityName: "rate",
          actionName: "regenerateMissingRates",
          actionKind: "create-missing-join-records",
          showAffectedCountOnSuccess: false,
          targetCountQueryKind: null,
          targetCountDisplay: null,
        },
      ],
    });
  });

  it("selects the site editorial workspaces as primary collection models", () => {
    const models = selectPrimaryCollectionModels(siteSourceSchema);

    expect(models.map((model) => model.viewName)).toEqual(["blockHome", "blockCompositionHome"]);
    expect(models.map((model) => model.label)).toEqual(["Blocks", "Placements"]);
    expect(models.map((model) => model.navigation.primary)).toEqual([true, true]);
    expect(
      models.map((model) => (model.result.type === "table" ? model.result.tableViewName : "")),
    ).toEqual(["blockTable", "blockPlacementTable"]);
  });

  it("characterizes the site primary home model contracts", () => {
    const models = selectPrimaryCollectionModels(siteSourceSchema);

    expect(models.map(summarizeHomeModel)).toEqual([
      {
        viewName: "blockHome",
        label: "Blocks",
        entityName: "block",
        navigationPrimary: true,
        context: null,
        queries: [
          { queryName: "blockAll", label: "All", count: "count", expressionKind: "all" },
          { queryName: "blockDraft", label: "Draft", count: "count", expressionKind: "where" },
          {
            queryName: "blockPublished",
            label: "Published",
            count: "count",
            expressionKind: "where",
          },
          { queryName: "blockPages", label: "Pages", count: "count", expressionKind: "where" },
          { queryName: "blockPosts", label: "Posts", count: "count", expressionKind: "where" },
          {
            queryName: "blockProjects",
            label: "Projects",
            count: "count",
            expressionKind: "where",
          },
          { queryName: "blockLinks", label: "Links", count: "count", expressionKind: "where" },
          {
            queryName: "blockGroups",
            label: "Groups",
            count: "count",
            expressionKind: "where",
          },
          {
            queryName: "blockImages",
            label: "Images",
            count: "count",
            expressionKind: "where",
          },
          {
            queryName: "blockVideos",
            label: "Videos",
            count: "count",
            expressionKind: "where",
          },
          {
            queryName: "blockFiles",
            label: "Files",
            count: "count",
            expressionKind: "where",
          },
          {
            queryName: "featuredBlocks",
            label: "Featured",
            count: "count",
            expressionKind: "where",
          },
          {
            queryName: "publishedPosts",
            label: "Published posts",
            count: "count",
            expressionKind: "and",
          },
          {
            queryName: "featuredProjects",
            label: "Featured projects",
            count: "count",
            expressionKind: "and",
          },
        ],
        defaultQueryName: "blockAll",
        result: {
          type: "table",
          tableViewName: "blockTable",
          columns: [
            "field:type",
            "field:title",
            "field:label",
            "field:body",
            "field:status",
            "field:featured",
            "field:slug",
            "field:href",
            "field:publishedAt",
            "field:order",
            "field:templateKey",
            "field:assetKey",
            "field:alt",
            "field:width",
            "field:height",
            "field:limit",
          ],
        },
        actions: [
          {
            type: "create",
            label: "Create Block",
            entityName: "block",
            fields: [
              "type",
              "title",
              "label",
              "subtitle",
              "body",
              "status",
              "featured",
              "publishedAt",
              "order",
              "slug",
              "href",
              "icon",
              "color",
              "templateKey",
              "assetKey",
              "alt",
              "width",
              "height",
              "limit",
            ],
            defaults: [],
            enabled: true,
          },
        ],
      },
      {
        viewName: "blockCompositionHome",
        label: "Placements",
        entityName: "blockPlacement",
        navigationPrimary: true,
        context: {
          name: "block",
          entityName: "block",
          queryName: "blockAll",
          labelField: "title",
          presentation: "tabs",
          relatedCollection: {
            relationshipName: "blockPlacements",
            label: "Placements",
            entityName: "blockPlacement",
            referenceFieldName: "parent",
          },
          createAction: null,
          itemViewName: "blockContextItem",
          recordFields: ["type", "status", "featured"],
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
          type: "table",
          tableViewName: "blockPlacementTable",
          columns: [
            "field:slot",
            "field:block",
            "field:label",
            "field:variant",
            "field:order",
            "field:visible",
          ],
        },
        actions: [
          {
            type: "create",
            label: "Create Block placement",
            entityName: "blockPlacement",
            fields: ["slot", "block", "label", "variant", "order", "visible"],
            defaults: ["parent"],
            enabled: true,
          },
        ],
      },
    ]);
  });

  it("resolves site content table columns and expanded create fields", () => {
    const contentModel = selectCollectionModels(siteSourceSchema).find(
      (model) => model.viewName === "blockHome",
    );
    const create = contentModel?.actions.find((action) => action.type === "create");

    expect(contentModel?.queryTabs.map((tab) => tab.queryName)).toEqual([
      "blockAll",
      "blockDraft",
      "blockPublished",
      "blockPages",
      "blockPosts",
      "blockProjects",
      "blockLinks",
      "blockGroups",
      "blockImages",
      "blockVideos",
      "blockFiles",
      "featuredBlocks",
      "publishedPosts",
      "featuredProjects",
    ]);
    expect(
      contentModel?.result.type === "table"
        ? contentModel.result.columns.map((column) => column.key)
        : [],
    ).toEqual([
      "field:type",
      "field:title",
      "field:label",
      "field:body",
      "field:status",
      "field:featured",
      "field:slug",
      "field:href",
      "field:publishedAt",
      "field:order",
      "field:templateKey",
      "field:assetKey",
      "field:alt",
      "field:width",
      "field:height",
      "field:limit",
    ]);
    expect(
      contentModel?.result.type === "table" ? tableColumnEditors(contentModel.result.columns) : [],
    ).toEqual([
      "enum",
      "text",
      "text",
      "markdown",
      "enum",
      "boolean",
      "slug",
      "href",
      "date",
      "number",
      "slug",
      "slug",
      "textarea",
      "number",
      "number",
      "number",
    ]);
    expect(create?.type === "create" ? create.fields.map((field) => field.fieldName) : []).toEqual([
      "type",
      "title",
      "label",
      "subtitle",
      "body",
      "status",
      "featured",
      "publishedAt",
      "order",
      "slug",
      "href",
      "icon",
      "color",
      "templateKey",
      "assetKey",
      "alt",
      "width",
      "height",
      "limit",
    ]);
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
    const tableEditors =
      contentModel?.result.type === "table"
        ? Object.fromEntries(
            contentModel.result.columns
              .filter((column) => column.type !== "computed")
              .map((column) => [column.fieldName, column.editor]),
          )
        : {};

    expect(block.fields.body).toMatchObject({ type: "text", format: "markdown" });
    expect(block.fields.color).toMatchObject({ type: "text", format: "color" });
    expect(block.fields.slug).toMatchObject({ type: "text", format: "slug" });
    expect(block.fields.href).toMatchObject({ type: "text", format: "href" });
    expect(block.fields.icon).toMatchObject({ type: "text", format: "icon" });
    expect(createEditors).toMatchObject({
      subtitle: "textarea",
      body: "markdown",
      slug: "slug",
      href: "href",
      icon: "icon",
      color: "color",
    });
    expect(tableEditors).toMatchObject({
      body: "markdown",
      slug: "slug",
      href: "href",
      alt: "textarea",
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
      labelField: "title",
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
      recordFields: [{ fieldName: "type" }, { fieldName: "status" }, { fieldName: "featured" }],
    });
    expect(compositionModel?.actions[0]).toMatchObject({
      type: "create",
      label: "Create Block placement",
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
        label: "Rate setup",
        primary: false,
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
    ]);
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

  it("builds legacy screen models from primary collection models when screens are absent", () => {
    const collectionModels = selectPrimaryCollectionModels(siteSourceSchema);
    const screenModels = selectScreenModels(siteSourceSchema);

    expect(screenModels.map((model) => model.screenName)).toEqual(
      collectionModels.map((model) => model.viewName),
    );
    expect(selectPrimaryScreenModels(siteSourceSchema).map((model) => model.screenName)).toEqual([
      "blockHome",
      "blockCompositionHome",
    ]);
    expect(screenModels.map(summarizeScreenModel)).toEqual([
      {
        screenName: "blockHome",
        label: "Blocks",
        primary: true,
        layoutType: "stack",
        sections: [
          { id: "blockHome", label: "Blocks", viewName: "blockHome", entityName: "block" },
        ],
      },
      {
        screenName: "blockCompositionHome",
        label: "Placements",
        primary: true,
        layoutType: "stack",
        sections: [
          {
            id: "blockCompositionHome",
            label: "Placements",
            viewName: "blockCompositionHome",
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
  return columns.map((column) => (column.type === "computed" ? null : column.editor));
}

function tableColumnCommits(columns: TableColumnConfig[]) {
  return columns.map((column) => (column.type === "computed" ? null : column.commit));
}

function findFieldTableColumn(columns: TableColumnConfig[], fieldName: string) {
  return columns.find(
    (column): column is FieldTableColumnConfig =>
      column.type === "field" && column.fieldName === fieldName,
  );
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
        : {
            type: "table",
            tableViewName: collection.result.tableViewName,
            columns: collection.result.columns.map((column) => column.key),
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
